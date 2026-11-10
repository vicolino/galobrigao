// 💵 Depósito de USDC → 🥚 ovos de ouro (só ida: ovos nunca voltam a ser USDC).
// O USDC sai da carteira custodial do jogador para a tesouraria NA CHAIN; os ovos só entram no save
// depois da tx confirmada. Cada depósito é uma linha em `deposits` (tx_hash único) e o crédito é
// transacional e idempotente: pending → done uma única vez. Se o servidor cair no meio, o
// reconciliador (próxima requisição / boot) confere o recibo e termina o crédito.
import { randomUUID } from 'node:crypto'
import { getAddress, isAddress, type Address, type Hash } from 'viem'
import { live } from '../src/game/config'
import { uid } from '../src/game/rooster'
import type { GameState } from '../src/game/types'
import { t } from '../src/i18n'
import { chainy, depositTxState, isMainnet, mintTestUsdc, payUsdc, tokenBalance, treasury, userAccount } from './chain'
import { getDb, type UserRow } from './db'
import { loadSave, writeSave } from './saves'
import { limited } from './security'
import { Web3Error } from './web3'

const db = () => getDb()
const USDC = 1_000_000
const DAY = 864e5

const fail = (status: number, m: string, extra?: Record<string, unknown>): never => {
  throw new Web3Error(status, m, extra)
}

interface DepositRow {
  id: string
  user_id: string
  amount_units: number
  eggs: number
  from_addr: string
  to_addr: string
  tx_hash: string | null
  raw_tx: string | null
  status: string
  created_at: number
  done_at: number | null
}

/** Depósitos sendo processados agora neste processo (o reconciliador não mexe neles). */
const inFlight = new Set<string>()
const userBusy = new Set<string>()

const usd = (units: number) => units / USDC
const usdTxt = (units: number) => String(usd(units))
const eggsFor = (units: number) => Math.floor((units * live.deposit.eggsPerUsdc) / USDC)

function usedTodayUnits(userId: string) {
  const start = Date.now() - (Date.now() % DAY)
  const r = db().prepare("SELECT COALESCE(SUM(amount_units), 0) AS s FROM deposits WHERE user_id = ? AND status != 'failed' AND created_at >= ?").get(userId, start) as { s: number }
  return r.s
}

/** Tesouraria que recebe os depósitos: WEB3_DEPOSIT_TREASURY ou a tesouraria do contrato do Mercado. */
let treasuryCache: { addr: Address; at: number } | null = null
export async function depositTreasury(): Promise<Address> {
  const env = (process.env.WEB3_DEPOSIT_TREASURY ?? '').trim()
  if (env) return isAddress(env, { strict: false }) ? getAddress(env) : fail(503, t('Depósitos indisponíveis no momento.'))
  if (treasuryCache && Date.now() - treasuryCache.at < 10 * 60_000) return treasuryCache.addr
  const addr = getAddress(await treasury())
  treasuryCache = { addr, at: Date.now() }
  return addr
}

const history = (s: GameState, text: string, ovo: number): GameState => ({ ...s, history: [{ id: uid(), at: Date.now(), text, milho: 0, ovo }, ...s.history].slice(0, 80) })

/**
 * Credita os ovos de um depósito confirmado na chain. Idempotente: só passa de 'pending' para 'done'
 * uma vez, na mesma transação do banco que grava o save. Devolve o save novo (ou null se não creditou agora).
 */
function credit(id: string): { rev: number; state: GameState } | null {
  const d = db()
  d.exec('BEGIN IMMEDIATE')
  try {
    const row = d.prepare('SELECT * FROM deposits WHERE id = ?').get(id) as unknown as DepositRow | undefined
    if (!row || row.status !== 'pending') {
      d.exec('ROLLBACK')
      return null
    }
    const cur = loadSave(row.user_id)
    if (!cur) {
      // Conta excluída (ou sem save) com USDC já na tesouraria: fica para o suporte
      d.prepare("UPDATE deposits SET status = 'uncredited', done_at = ? WHERE id = ? AND status = 'pending'").run(Date.now(), id)
      d.exec('COMMIT')
      return null
    }
    const state = history({ ...cur.state, ovos: cur.state.ovos + row.eggs }, t('Depósito: {usdc} USDC → {n} ovos', { usdc: usdTxt(row.amount_units), n: row.eggs }), row.eggs)
    writeSave(row.user_id, state, cur.rev + 1)
    d.prepare("UPDATE deposits SET status = 'done', done_at = ? WHERE id = ? AND status = 'pending'").run(Date.now(), id)
    // Aparece nas "Últimas transações" da Carteira
    d.prepare("INSERT INTO web3_tx (id, user_id, kind, asset, amount, to_addr, tx_hash, status, created_at) VALUES (?, ?, 'deposit', 'usdc', ?, ?, ?, 'ok', ?)").run(randomUUID(), row.user_id, usdTxt(row.amount_units), row.to_addr, row.tx_hash, Date.now())
    d.exec('COMMIT')
    return { rev: cur.rev + 1, state }
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

const setStatus = (id: string, status: string) => db().prepare("UPDATE deposits SET status = ?, done_at = ? WHERE id = ? AND status = 'pending'").run(status, Date.now(), id)

/** Confere um depósito pendente na chain e termina (credita ou marca falha). */
async function settle(row: DepositRow) {
  if (inFlight.has(row.id) || row.status !== 'pending') return
  if (!row.tx_hash) {
    // Nunca foi assinada (o hash é gravado antes de transmitir): nada saiu da carteira
    if (Date.now() - row.created_at > 5 * 60_000) setStatus(row.id, 'failed')
    return
  }
  const st = await depositTxState(row.tx_hash as Hash, (row.raw_tx as `0x${string}` | null) ?? null, row.from_addr as Address)
  if (st === 'success') credit(row.id)
  else if (st === 'reverted' || st === 'dropped') setStatus(row.id, 'failed')
}

/** Termina os depósitos pendentes (de um jogador ou de todos). Erros de rede ficam para a próxima. */
export async function reconcileDeposits(userId?: string) {
  if (!chainy()) return
  const rows = (userId ? db().prepare("SELECT * FROM deposits WHERE status = 'pending' AND user_id = ?").all(userId) : db().prepare("SELECT * FROM deposits WHERE status = 'pending' LIMIT 200").all()) as unknown as DepositRow[]
  for (const r of rows) {
    try {
      await settle(r)
    } catch (e) {
      console.error('[deposito] reconciliar', r.id, e instanceof Error ? e.message.split('\n')[0] : e)
    }
  }
}

let booted = false
/** Na primeira requisição depois de subir o servidor, termina tudo que ficou pendente. */
export function bootReconcile() {
  if (booted) return
  booted = true
  reconcileDeposits().catch(() => undefined)
}

/** USDC com até 6 casas → unidades (inteiro). */
function parseUnits(v: unknown, min: number, max: number) {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim().replace(',', '.') : ''
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(s)) fail(400, t('Valor em USDC inválido'))
  const [i, d = ''] = s.split('.')
  const u = Number(i) * USDC + Number(d.padEnd(6, '0'))
  if (u < Math.round(min * USDC) || u > Math.round(max * USDC)) fail(400, t('Valor em USDC fora do permitido (entre {min} e {max}).', { min, max }))
  return u
}

const walletRow = (userId: string) => db().prepare('SELECT address, enc_key FROM wallets WHERE user_id = ?').get(userId) as { address: Address; enc_key: string } | undefined

const publicDeposit = (r: DepositRow) => {
  const ex = chainy()?.explorer
  return { id: r.id, usdc: usd(r.amount_units), eggs: r.eggs, status: r.status, hash: r.tx_hash, at: r.created_at, url: ex && r.tx_hash ? `${ex}/tx/${r.tx_hash}` : null }
}

// ---------- Rotas ----------

export async function handleDeposito(path: string, method: string, body: Record<string, unknown>, user: UserRow): Promise<{ status?: number; body: unknown } | null> {
  if (path !== '/api/web3/deposit' && path !== '/api/web3/deposit-eggs' && path !== '/api/web3/test-usdc') return null
  const c = chainy()
  if (!c) fail(503, t('Carteira cripto indisponível no momento.'))
  bootReconcile()
  const cfg = live.deposit
  const kycNeeded = isMainnet() && user.kyc_status !== 'verified'

  // ----- Painel do depósito -----
  if (path === '/api/web3/deposit' && method === 'GET') {
    await reconcileDeposits(user.id).catch(() => undefined)
    const w = walletRow(user.id)
    const bal = w ? await tokenBalance('usdc', w.address).catch(() => null) : null
    const recent = db().prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(user.id) as unknown as DepositRow[]
    return {
      body: {
        network: { id: c!.chain.id, name: c!.chain.name, testnet: !isMainnet() },
        usdc: c!.env.usdc,
        address: w?.address ?? null,
        balance: bal == null ? null : usd(Number(bal)),
        rate: cfg.eggsPerUsdc,
        min: cfg.minUsdc,
        cap: cfg.dailyCapUsdc,
        usedToday: usd(usedTodayUnits(user.id)),
        kycRequired: kycNeeded,
        testUsdcClaimed: !!user.test_usdc_claimed_at,
        recent: recent.map(publicDeposit),
      },
    }
  }

  // ----- Rede de teste: 20 USDC de teste, UMA VEZ por conta (o USDC da Circle é outro contrato e não serve aqui) -----
  if (path === '/api/web3/test-usdc' && method === 'POST') {
    if (isMainnet()) fail(404, t('Indisponível'))
    const w = walletRow(user.id) ?? fail(409, t('Abra a Carteira antes de depositar.'))
    // Reserva atômica: marca o resgate antes de minerar, então cliques concorrentes não mineram duas vezes.
    const reserved = db().prepare('UPDATE users SET test_usdc_claimed_at = ? WHERE id = ? AND test_usdc_claimed_at IS NULL').run(Date.now(), user.id)
    if (reserved.changes !== 1) fail(429, t('Você já pegou seu USDC de teste. É uma vez por conta.'))
    try {
      const hash = await mintTestUsdc(w.address as Address, BigInt(20 * USDC))
      return { body: { ok: true, usdc: 20, hash } }
    } catch (e) {
      // A mintagem falhou: libera o brinde de novo para ele tentar mais tarde.
      db().prepare('UPDATE users SET test_usdc_claimed_at = NULL WHERE id = ?').run(user.id)
      throw e
    }
  }

  if (path !== '/api/web3/deposit-eggs' || method !== 'POST') return null
  if (limited(`deposit:${user.id}`, Number(process.env.WEB3_DEPOSIT_RATE_PER_MIN) || 6, 60_000)) fail(429, t('Muitas operações seguidas. Espere um pouco.'))
  // Mainnet: depósito também exige identidade verificada (AML)
  if (kycNeeded) fail(403, t('Depósitos exigem verificação de identidade (KYC).'))
  if (!loadSave(user.id)) fail(409, t('Crie seu galinheiro antes de usar a carteira.'))
  const w = walletRow(user.id) ?? fail(409, t('Abra a Carteira antes de depositar.'))
  if (userBusy.has(user.id)) fail(409, t('Já tem um depósito seu em andamento. Espere confirmar.'))
  userBusy.add(user.id)
  try {
    await reconcileDeposits(user.id)
    if (db().prepare("SELECT 1 FROM deposits WHERE user_id = ? AND status = 'pending'").get(user.id)) fail(409, t('Já tem um depósito seu em andamento. Espere confirmar.'))
    const units = parseUnits(body.amount, cfg.minUsdc, cfg.dailyCapUsdc)
    const used = usedTodayUnits(user.id)
    if (used + units > Math.round(cfg.dailyCapUsdc * USDC)) fail(429, t('Limite diário de depósito atingido ({n} USDC por dia).', { n: cfg.dailyCapUsdc }), { usedToday: usd(used) })
    const eggs = eggsFor(units)
    if (eggs < 1) fail(400, t('Valor em USDC inválido'))
    const to = await depositTreasury().catch((e) => (e instanceof Web3Error ? Promise.reject(e) : chainFail(e)))
    if (getAddress(to) === getAddress(w.address) || db().prepare('SELECT 1 FROM wallets WHERE lower(address) = lower(?)').get(to)) fail(503, t('Depósitos indisponíveis no momento.'))
    const bal = await tokenBalance('usdc', w.address).catch(chainFail)
    if (bal < BigInt(units)) fail(400, t('USDC insuficiente na carteira. Deposite USDC no seu endereço.'))

    const id = randomUUID()
    db().prepare("INSERT INTO deposits (id, user_id, amount_units, eggs, from_addr, to_addr, tx_hash, raw_tx, status, created_at, done_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', ?, NULL)").run(id, user.id, units, eggs, getAddress(w.address), to, Date.now())
    inFlight.add(id)
    let signed = false
    try {
      const r = await payUsdc(userAccount(w.enc_key, user.id), to, BigInt(units), (hash, raw) => {
        // Grava o hash antes de transmitir; se a linha não está mais pendente, aborta sem transmitir
        const ch = db().prepare("UPDATE deposits SET tx_hash = ?, raw_tx = ? WHERE id = ? AND status = 'pending' AND tx_hash IS NULL").run(hash, raw, id)
        if (!ch.changes) throw new Error('depósito não está mais pendente') // i18n-ok (erro interno)
        signed = true
      })
      if (!r.ok) {
        setStatus(id, 'failed')
        return fail(502, t('A rede recusou a transferência. Nenhum USDC saiu e nada foi creditado.'))
      }
      const out = credit(id)
      const row = db().prepare('SELECT * FROM deposits WHERE id = ?').get(id) as unknown as DepositRow
      const cur = out ?? loadSave(user.id)
      return { body: { ...(cur ?? {}), deposit: publicDeposit(row) } }
    } catch (e) {
      if (e instanceof Web3Error) throw e
      console.error('[deposito]', e instanceof Error ? e.message.split('\n')[0] : e)
      if (!signed) {
        setStatus(id, 'failed')
        return fail(502, t('A rede não confirmou a operação. Tente de novo em instantes.'))
      }
    } finally {
      inFlight.delete(id)
    }
    // Assinada mas sem confirmação: confere agora; se ainda não deu, o reconciliador termina (credita uma vez só)
    await settle(db().prepare('SELECT * FROM deposits WHERE id = ?').get(id) as unknown as DepositRow).catch(() => undefined)
    const row = db().prepare('SELECT * FROM deposits WHERE id = ?').get(id) as unknown as DepositRow
    if (row.status === 'done') return { body: { ...(loadSave(user.id) ?? {}), deposit: publicDeposit(row) } }
    if (row.status === 'failed') fail(502, t('A rede recusou a transferência. Nenhum USDC saiu e nada foi creditado.'))
    return { status: 202, body: { pending: true, deposit: publicDeposit(row), message: t('Depósito enviado! Os ovos entram assim que a rede confirmar.') } }
  } finally {
    userBusy.delete(user.id)
  }
}

const chainFail = (e: unknown): never => {
  console.error('[deposito]', e instanceof Error ? e.message.split('\n')[0] : e)
  return fail(502, t('A rede não confirmou a operação. Tente de novo em instantes.'))
}

// ---------- Backoffice ----------

export function depositStats() {
  const r = db().prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount_units), 0) AS units, COALESCE(SUM(eggs), 0) AS eggs FROM deposits WHERE status = 'done'").get() as { n: number; units: number; eggs: number }
  const pending = (db().prepare("SELECT COUNT(*) AS n FROM deposits WHERE status = 'pending'").get() as { n: number }).n
  const uncredited = (db().prepare("SELECT COUNT(*) AS n FROM deposits WHERE status = 'uncredited'").get() as { n: number }).n
  return { count: r.n, usdc: usd(r.units), eggs: r.eggs, pending, uncredited }
}
