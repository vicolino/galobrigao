// Recursos cripto (rede de teste): carteira custodial, ponte de ovos/milho ⇄ tokens,
// NFTs de itens lendários e mercado entre jogadores em USDC.
// Regra de ouro: o save é debitado ANTES de emitir na chain (e devolvido se falhar);
// na entrada, queima primeiro e só depois credita.
import { randomUUID } from 'node:crypto'
import { isAddress, getAddress, zeroAddress, type Address } from 'viem'
import { ACC_BY_ID, SKIN_BY_ID } from '../src/game/data'
import { marketPrice, uid } from '../src/game/rooster'
import type { GameState, Rooster } from '../src/game/types'
import { t } from '../src/i18n'
import { balances, burnNft, burnToken, buyNft, cancelListing, chainy, feeBps, isMainnet, listingOf, listNft, mintNft, mintToken, newWallet, ownerOf, tokenBalance, transferToken, userAccount, type TokenKey } from './chain'
import { getDb, type UserRow } from './db'
import { loadSave, writeSave } from './saves'
import { limited } from './security'
import { galoLook, galoMetadata, galoReceiveBlock, galoSvg, giveGalo, liveGalo, markGaloBurned, saveGaloSnapshot, takeGalo } from './galonft'
import { nftIneligible, roosterLock } from '../src/game/galonft'
import { addMintable } from '../src/game/premium'
import { creditTreasury } from './treasury'
import { activeEditions, claimStock, getEdition, releaseStock } from './editions'
import { live } from '../src/game/config'
import { notify } from './feira'
import { usdcSalePrice } from './usdcRate'

export class Web3Error extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}
const fail = (status: number, m: string, extra?: Record<string, unknown>): never => {
  throw new Web3Error(status, m, extra)
}

const db = () => getDb()
const USDC = 1_000_000n
const DAY = 864e5

export const web3Enabled = () => chainy() !== null

// ---------- Limites diários ----------

function parseCaps(raw: string | undefined, def: Record<string, number>) {
  const out = { ...def }
  if (!raw) return out
  for (const part of raw.split(',')) {
    const [k, v] = part.split(/[:=]/).map((x) => x.trim().toLowerCase())
    if (k in out && Number(v) > 0) out[k] = Number(v)
  }
  return out
}
/** WEB3_DAILY_SEND_CAP="egg:5000,corn:200000,usdc:500"; WEB3_DAILY_BRIDGE_CAP="egg:5000,corn:200000". */
const caps = () => ({
  send: parseCaps(process.env.WEB3_DAILY_SEND_CAP, { egg: 5000, corn: 200000, usdc: 500 }),
  bridgeOut: parseCaps(process.env.WEB3_DAILY_BRIDGE_CAP, { egg: 5000, corn: 200000 }),
})

function usedToday(userId: string, kind: string, asset: string) {
  const start = Date.now() - (Date.now() % DAY)
  const r = db().prepare("SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS s FROM web3_tx WHERE user_id = ? AND kind = ? AND asset = ? AND status != 'failed' AND created_at >= ?").get(userId, kind, asset, start) as { s: number }
  return r.s
}

// ---------- Registro (web3_tx) ----------

interface TxRow {
  id: string
  user_id: string
  kind: string
  asset: string
  amount: string
  to_addr: string | null
  tx_hash: string | null
  status: string
  created_at: number
}

function logTx(userId: string, kind: string, asset: string, amount: string | number, to: string | null, status = 'pending', hash: string | null = null) {
  const id = randomUUID()
  db().prepare('INSERT INTO web3_tx (id, user_id, kind, asset, amount, to_addr, tx_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, userId, kind, asset, String(amount), to, hash, status, Date.now())
  return id
}
const setTx = (id: string, status: string, hash: string | null = null) => db().prepare('UPDATE web3_tx SET status = ?, tx_hash = COALESCE(?, tx_hash) WHERE id = ?').run(status, hash, id)

function publicTx(id: string) {
  const r = db().prepare('SELECT * FROM web3_tx WHERE id = ?').get(id) as unknown as TxRow
  const ex = chainy()?.explorer
  return { id: r.id, kind: r.kind, asset: r.asset, amount: r.amount, to: r.to_addr, hash: r.tx_hash, status: r.status, at: r.created_at, url: ex && r.tx_hash ? `${ex}/tx/${r.tx_hash}` : null }
}

// ---------- Carteira ----------

interface WalletRow {
  user_id: string
  address: Address
  enc_key: string
}

function walletOf(userId: string): WalletRow {
  const w = db().prepare('SELECT user_id, address, enc_key FROM wallets WHERE user_id = ?').get(userId) as unknown as WalletRow | undefined
  if (w) return w
  const nw = newWallet(userId)
  db().prepare('INSERT OR IGNORE INTO wallets (user_id, address, enc_key, created_at) VALUES (?, ?, ?, ?)').run(userId, nw.address, nw.enc, Date.now())
  return db().prepare('SELECT user_id, address, enc_key FROM wallets WHERE user_id = ?').get(userId) as unknown as WalletRow
}
const accountOf = (w: WalletRow) => userAccount(w.enc_key, w.user_id)

// ---------- Save ----------

const history = (s: GameState, text: string, milho = 0, ovo = 0): GameState => ({ ...s, history: [{ id: uid(), at: Date.now(), text, milho, ovo }, ...s.history].slice(0, 80) })

function needSave(userId: string) {
  return loadSave(userId) ?? fail(409, t('Crie seu galinheiro antes de usar a carteira.'))
}

/** Altera o save do jogador atomicamente (rev + 1). */
function mutate(userId: string, fn: (s: GameState) => GameState) {
  const cur = needSave(userId)
  const state = fn(cur.state)
  writeSave(userId, state, cur.rev + 1)
  return { rev: cur.rev + 1, state }
}

// ---------- Itens / NFTs ----------

interface NftRow {
  token_id: number
  kind: 'acc' | 'skin' | 'galo'
  item_id: string
  owner_user_id: string
  status: string
  price_units: number | null
  minted_at: number
  tx: string | null
}

const itemOf = (kind: string, id: string) => (kind === 'acc' ? ACC_BY_ID[id] : kind === 'skin' ? SKIN_BY_ID[id] : undefined)

// 💵 Preço de referência de um NFT em USDC: valor do item em ovos ÷ ovos por USDC (câmbio do depósito).
// Serve de sugestão ao listar e de piso (metade da sugestão) para proteger a economia.
const MILHO_PER_OVO = 200
const LIST_FLOOR_PCT = 0.5
function suggestedUsdc(kind: string, itemId: string, ro?: Rooster | null): number {
  let ovos = 0
  if (kind === 'galo') ovos = ro ? marketPrice(ro) / MILHO_PER_OVO : 0
  else {
    const item = itemOf(kind, itemId)
    if (item) ovos = item.currency === 'milho' ? item.price / MILHO_PER_OVO : item.price
  }
  const perUsdc = live.deposit?.eggsPerUsdc || 50
  return Math.max(0, Math.round((ovos / perUsdc) * 100) / 100)
}
const listFloor = (sg: number) => Math.round(sg * LIST_FLOOR_PCT * 100) / 100

// ---------- 💵 Venda de USDC por PIX (entrega on-chain, assíncrona) ----------
interface UsdcSaleRow {
  order_id: string
  user_id: string
  usdc_units: number
  to_addr: string
  status: string
  tx_hash: string | null
  attempts: number
  created_at: number
  delivered_at: number | null
}

/** Registra a venda no checkout (aguardando o pagamento). */
export function createUsdcSale(orderId: string, userId: string, usdcUnits: number, toAddr: string) {
  db().prepare("INSERT INTO usdc_sales (order_id, user_id, usdc_units, to_addr, status, attempts, created_at) VALUES (?, ?, ?, ?, 'awaiting', 0, ?)").run(orderId, userId, usdcUnits, toAddr, Date.now())
}
/** Marca como paga (chamado no fulfill do pedido). A entrega é feita por deliverUsdcSales. */
export function markUsdcSalePaid(orderId: string) {
  db().prepare("UPDATE usdc_sales SET status = 'paid' WHERE order_id = ? AND status IN ('awaiting', 'failed')").run(orderId)
}
/** USDC comprados hoje por um jogador (para o limite diário). */
export function usdcBoughtToday(userId: string) {
  const start = Date.now() - (Date.now() % DAY)
  const r = db().prepare("SELECT COALESCE(SUM(usdc_units), 0) AS s FROM usdc_sales WHERE user_id = ? AND status != 'failed' AND created_at >= ?").get(userId, start) as { s: number }
  return r.s / 1e6
}
/** Entrega as vendas pagas: manda USDC da operadora para a carteira do jogador, com trava de float e retry. */
export async function deliverUsdcSales(onlyUser?: string) {
  const c = chainy()
  if (!c) return
  const rows = (onlyUser
    ? db().prepare("SELECT * FROM usdc_sales WHERE status = 'paid' AND user_id = ? ORDER BY created_at LIMIT 10").all(onlyUser)
    : db().prepare("SELECT * FROM usdc_sales WHERE status = 'paid' ORDER BY created_at LIMIT 10").all()) as unknown as UsdcSaleRow[]
  for (const row of rows) {
    // Trava: só um processo pega a linha (evita envio duplicado).
    if (!db().prepare("UPDATE usdc_sales SET status = 'sending', attempts = attempts + 1 WHERE order_id = ? AND status = 'paid'").run(row.order_id).changes) continue
    const units = BigInt(row.usdc_units)
    try {
      const bal = await tokenBalance('usdc', c.operator.address)
      if (bal < units) {
        db().prepare("UPDATE usdc_sales SET status = 'paid' WHERE order_id = ?").run(row.order_id)
        console.error('[usdc] float da operadora insuficiente; entrega será retentada')
        continue
      }
      const hash = await transferToken(c.operator, 'usdc', row.to_addr as Address, units)
      db().prepare("UPDATE usdc_sales SET status = 'done', tx_hash = ?, delivered_at = ? WHERE order_id = ?").run(hash, Date.now(), row.order_id)
      logTx(row.user_id, 'usdc-sale', 'usdc', Number(units) / 1e6, row.to_addr, 'ok', hash)
      notify(row.user_id, t('🎁 Chegou! {n} USDC na sua carteira cripto.', { n: (Number(units) / 1e6).toFixed(2) }))
    } catch (e) {
      db().prepare('UPDATE usdc_sales SET status = ? WHERE order_id = ?').run(row.attempts + 1 >= 5 ? 'failed' : 'paid', row.order_id)
      console.error('[usdc] entrega falhou', e instanceof Error ? e.message.split('\n')[0] : e)
    }
  }
}

/** Unidades do item no save (acessório: estoque + equipados; skin: 0 ou 1). */
function units(s: GameState, kind: string, id: string) {
  if (kind === 'skin') return s.skins.includes(id) ? 1 : 0
  return (s.accessories[id] ?? 0) + s.roosters.filter((r) => Object.values(r.equipped).includes(id)).length
}
const heldTokens = (userId: string, kind: string, id: string) => (db().prepare('SELECT COUNT(*) AS n FROM nfts WHERE owner_user_id = ? AND kind = ? AND item_id = ?').get(userId, kind, id) as { n: number }).n

function removeItem(s: GameState, kind: string, id: string): GameState {
  if (kind === 'skin') return { ...s, skins: s.skins.filter((k) => k !== id), roosters: s.roosters.map((r) => (r.skin === id ? { ...r, skin: undefined } : r)) }
  if ((s.accessories[id] ?? 0) > 0) return { ...s, accessories: { ...s.accessories, [id]: s.accessories[id] - 1 } }
  // Sem estoque: tira do primeiro galo que estiver usando
  let done = false
  return {
    ...s,
    roosters: s.roosters.map((r) => {
      if (done) return r
      const slot = (Object.keys(r.equipped) as (keyof typeof r.equipped)[]).find((k) => r.equipped[k] === id)
      if (!slot) return r
      done = true
      const equipped = { ...r.equipped }
      delete equipped[slot]
      return { ...r, equipped }
    }),
  }
}
const addItem = (s: GameState, kind: string, id: string): GameState =>
  kind === 'skin' ? { ...s, skins: s.skins.includes(id) ? s.skins : [...s.skins, id] } : { ...s, accessories: { ...s.accessories, [id]: (s.accessories[id] ?? 0) + 1 } }

/** Status internos de trava viram o status público. */
const pubStatus = (st: string) => (st === 'listing' ? 'held' : st === 'buying' || st === 'cancelling' ? 'listed' : st)
const usd = (u: number | bigint | null) => (u == null ? null : Number(u) / 1e6)

/** Troca o status do NFT só se ele ainda estiver no status esperado (evita duas operações ao mesmo tempo). */
function lock(tokenId: number, from: string, to: string, owner?: string) {
  const r = owner
    ? db().prepare('UPDATE nfts SET status = ? WHERE token_id = ? AND status = ? AND owner_user_id = ?').run(to, tokenId, from, owner)
    : db().prepare('UPDATE nfts SET status = ? WHERE token_id = ? AND status = ?').run(to, tokenId, from)
  if (!r.changes) fail(409, t('Esse item está ocupado em outra operação. Atualize e tente de novo.'))
}

// ---------- Validação ----------

const intIn = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max ? (v as number) : fail(400, t('Quantidade inválida')))

/** USDC com até 6 casas → unidades (bigint). */
function usdcUnits(v: unknown, min: number, max: number) {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(s)) fail(400, t('Valor em USDC inválido'))
  const [i, d = ''] = s.split('.')
  const u = BigInt(i) * USDC + BigInt(d.padEnd(6, '0'))
  if (u < BigInt(Math.round(min * 1e6)) || u > BigInt(Math.round(max * 1e6))) fail(400, t('Valor em USDC fora do permitido (entre {min} e {max}).', { min, max }))
  return u
}

const tokenIdOf = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) < 2 ** 40 ? (v as number) : fail(400, t('NFT inválido')))

const chainFail = (e: unknown): never => {
  console.error('[web3]', e instanceof Error ? e.message.split('\n')[0] : e)
  return fail(502, t('A rede não confirmou a operação. Tente de novo em instantes.'))
}

// ---------- Rotas ----------

export type Web3Out = { status?: number; body: unknown } | { svg: string }

export async function handleWeb3(path: string, method: string, body: Record<string, unknown>, u: UserRow | null): Promise<Web3Out | null> {
  const c = chainy()
  if (path === '/api/web3' && method === 'GET' && !c) return { body: { enabled: false } }
  if (!c) fail(503, t('Carteira cripto indisponível no momento.'))

  // ----- Metadados públicos dos NFTs -----
  const nftMatch = path.match(/^\/api\/nft\/(\d{1,12})(\/image\.svg)?$/)
  if (nftMatch && method === 'GET') {
    const row = db().prepare('SELECT * FROM nfts WHERE token_id = ?').get(Number(nftMatch[1])) as unknown as NftRow | undefined
    const base = (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')
    // Galo NFT: ficha do galo + desenho dele
    if (row?.kind === 'galo') {
      const ro = liveGalo(row.token_id, row.owner_user_id, row.item_id) ?? fail(404, t('NFT não encontrado'))
      return nftMatch[2] ? { svg: galoSvg(row.token_id, ro) } : { body: galoMetadata(row.token_id, ro, base) }
    }
    const item = row && itemOf(row.kind, row.item_id)
    if (!row || !item) fail(404, t('NFT não encontrado'))
    const name = t(item!.name, undefined, 'en')
    const type = row!.kind === 'acc' ? 'Accessory' : 'Skin'
    if (nftMatch[2]) return { svg: nftSvg(item!.emoji, name, type) }
    return {
      body: {
        name: `${name} #${row!.token_id}`,
        description: `${t(item!.desc, undefined, 'en')} Legendary ${type.toLowerCase()} from Chicken Fighter.`,
        image: `${base}/api/nft/${row!.token_id}/image.svg`,
        external_url: base,
        attributes: [
          { trait_type: 'Type', value: type },
          { trait_type: 'Rarity', value: 'Legendary' },
          { trait_type: 'Item', value: row!.item_id },
        ],
      },
    }
  }

  if (!u) fail(401, t('Faça login para continuar'))
  const user = u!
  if (method === 'POST' && limited(`web3:${user.id}`, Number(process.env.WEB3_RATE_PER_MIN) || 20, 60_000)) fail(429, t('Muitas operações seguidas. Espere um pouco.'))

  // ----- Painel da carteira -----
  if (path === '/api/web3' && method === 'GET') {
    void deliverUsdcSales(user.id).catch(() => {}) // retenta entregas de USDC pendentes ao abrir a carteira
    const w = walletOf(user.id)
    const bal = await balances(w.address).catch(() => null)
    const save = loadSave(user.id)
    const nfts = db().prepare('SELECT * FROM nfts WHERE owner_user_id = ? ORDER BY token_id DESC').all(user.id) as unknown as NftRow[]
    const mintable = save
      ? Object.entries(save.state.mintable ?? {}).flatMap(([key, n]) => {
          const [kind, itemId] = key.split(':')
          const item = itemOf(kind, itemId)
          const count = Math.min(n, units(save.state, kind, itemId) - nfts.filter((x) => x.kind === kind && x.item_id === itemId).length)
          return item && count > 0 ? [{ key, kind, itemId, count, name: item.name, emoji: item.emoji }] : []
        })
      : []
    const cp = caps()
    return {
      body: {
        enabled: true,
        chain: { id: c!.chain.id, name: c!.chain.name, explorer: c!.explorer },
        wallet: { address: w.address, eth: bal?.eth ?? null, egg: bal?.egg ?? null, corn: bal?.corn ?? null, usdc: bal ? usd(bal.usdcUnits) : null },
        kyc: user.kyc_status ?? 'none',
        mintable,
        nfts: nfts.map((n) => {
          const ro = n.kind === 'galo' ? liveGalo(n.token_id, user.id, n.item_id) : null
          const sg = suggestedUsdc(n.kind, n.item_id, ro)
          return { tokenId: n.token_id, kind: n.kind, itemId: n.item_id, status: pubStatus(n.status), price: usd(n.price_units), suggested: sg, floor: listFloor(sg), ...(ro ? { rooster: galoLook(ro) } : {}) }
        }),
        feeBps: await feeBps().catch(() => null),
        caps: {
          send: cp.send,
          bridgeOut: cp.bridgeOut,
          usedToday: {
            send: { egg: usedToday(user.id, 'send', 'egg'), corn: usedToday(user.id, 'send', 'corn'), usdc: usedToday(user.id, 'send', 'usdc') },
            bridgeOut: { egg: usedToday(user.id, 'bridge-out', 'egg'), corn: usedToday(user.id, 'bridge-out', 'corn') },
          },
        },
        recent: (db().prepare('SELECT id FROM web3_tx WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id) as { id: string }[]).map((r) => publicTx(r.id)),
        usdcSale: live.usdcSale.on ? { on: true, pricePerUsdc: usdcSalePrice(), minUsdc: live.usdcSale.minUsdc, maxUsdc: live.usdcSale.maxUsdc } : { on: false },
      },
    }
  }

  // ----- Ponte ovos/milho ⇄ tokens -----
  if (path === '/api/web3/bridge' && method === 'POST') {
    const token = body.token === 'egg' || body.token === 'corn' ? body.token : fail(400, t('Moeda inválida'))
    const dir = body.dir === 'out' || body.dir === 'in' ? body.dir : fail(400, t('Direção inválida'))
    const cap = caps().bridgeOut[token]
    const amount = intIn(body.amount, cap)
    const field = token === 'egg' ? 'ovos' : 'milho'
    const w = walletOf(user.id)
    needSave(user.id)

    if (dir === 'out') {
      // Mainnet: tokens com valor real só saem para conta verificada (KYC/AML) — server/chain.ts
      if (isMainnet() && user.kyc_status !== 'verified') fail(403, t('Envios para fora exigem verificação de identidade (KYC).'))
      if (usedToday(user.id, 'bridge-out', token) + amount > cap) fail(429, t('Limite diário da ponte atingido ({n} por dia).', { n: cap }))
      // 1) debita o save
      const debited = mutate(user.id, (s) => {
        if (s[field] < amount) fail(400, token === 'egg' ? t('Ovos de ouro insuficientes 🥚') : t('Milho insuficiente 🌽'))
        const n = { ...s, [field]: s[field] - amount }
        return token === 'egg' ? history(n, t('Ponte: {n} ovos de ouro para a carteira', { n: amount }), 0, -amount) : history(n, t('Ponte: {n} milho para a carteira', { n: amount }), -amount, 0)
      })
      const id = logTx(user.id, 'bridge-out', token, amount, w.address)
      // 2) emite os tokens; se falhar, devolve
      try {
        const hash = await mintToken(token, w.address, amount)
        setTx(id, 'ok', hash)
        return { body: { ...debited, tx: publicTx(id) } }
      } catch (e) {
        setTx(id, 'failed')
        const back = mutate(user.id, (s) => history({ ...s, [field]: s[field] + amount }, t('Ponte cancelada: valor devolvido'), token === 'corn' ? amount : 0, token === 'egg' ? amount : 0))
        console.error('[web3] ponte de saída falhou, devolvido', e instanceof Error ? e.message.split('\n')[0] : e)
        return fail(502, t('A rede não confirmou a operação. O valor voltou para o seu saldo.'), back)
      }
    }

    // Entrada: confere o saldo, queima e só então credita
    const bal = await tokenBalance(token, w.address).catch(chainFail)
    if (bal < BigInt(amount)) fail(400, t('Saldo de tokens insuficiente na carteira.'))
    const id = logTx(user.id, 'bridge-in', token, amount, w.address)
    let hash: string
    try {
      hash = await burnToken(token, w.address, amount)
    } catch (e) {
      setTx(id, 'failed')
      return chainFail(e)
    }
    try {
      const out = mutate(user.id, (s) =>
        token === 'egg' ? history({ ...s, ovos: s.ovos + amount }, t('Ponte: {n} ovos de ouro da carteira', { n: amount }), 0, amount) : history({ ...s, milho: s.milho + amount }, t('Ponte: {n} milho da carteira', { n: amount }), amount, 0),
      )
      setTx(id, 'ok', hash)
      return { body: { ...out, tx: publicTx(id) } }
    } catch (e) {
      // Queimou mas não creditou: fica registrado para o suporte resolver
      setTx(id, 'burned-uncredited', hash)
      throw e
    }
  }

  // ----- Edições Limitadas de Raros (compra em ovos → NFT na carteira) -----
  if (path === '/api/web3/editions' && method === 'GET') {
    return { body: { editions: activeEditions(), owned: db().prepare('SELECT item_id FROM nfts WHERE owner_user_id = ? AND kind = ?').all(user.id, 'skin').map((r) => (r as { item_id: string }).item_id) } }
  }
  if (path === '/api/web3/editions/buy' && method === 'POST') {
    const id = typeof body.id === 'string' ? body.id : fail(400, t('Edição inválida'))
    const ed = getEdition(id)
    if (!ed || !ed.active || ed.supply_left <= 0) fail(409, t('Essa edição esgotou ou saiu do ar.'))
    const item = SKIN_BY_ID[ed!.item_id]
    if (!item) fail(400, t('Item da edição não existe.'))
    const price = ed!.price_ovos
    const w = walletOf(user.id)
    const cur = needSave(user.id)
    if (cur.state.skins.includes(ed!.item_id)) fail(409, t('Você já tem esse raro.'))
    if (cur.state.ovos < price) fail(400, t('Ovos de ouro insuficientes 🥚'))
    // 1) reserva o estoque (atômico: só uma compra leva a última unidade)
    if (!claimStock(id)) fail(409, t('Essa edição esgotou ou saiu do ar.'))
    // 2) debita ovos + concede a skin + marca como mintável; credita a tesouraria
    let debited: ReturnType<typeof mutate>
    try {
      debited = mutate(user.id, (s) => {
        if (s.ovos < price) fail(400, t('Ovos de ouro insuficientes 🥚'))
        if (s.skins.includes(ed!.item_id)) fail(409, t('Você já tem esse raro.'))
        const n = addMintable({ ...s, ovos: s.ovos - price, skins: [...s.skins, ed!.item_id] }, `skin:${ed!.item_id}`)
        return history(n, t('Comprou {nome} (edição limitada)', { nome: item!.name }), 0, -price)
      })
      creditTreasury('loja', 'ovo', price, id, `Edição: ${item!.name}`)
    } catch (e) {
      releaseStock(id)
      throw e
    }
    // 3) minta o NFT na carteira do jogador; se a rede falhar, devolve ovos e estoque
    const txId = logTx(user.id, 'mint-edition', `skin:${ed!.item_id}`, 1, w.address)
    try {
      const { tokenId, hash } = await mintNft(w.address, 'skin', ed!.item_id)
      db().prepare('INSERT INTO nfts (token_id, kind, item_id, owner_user_id, status, price_units, minted_at, tx) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(tokenId, 'skin', ed!.item_id, user.id, 'held', null, Date.now(), hash)
      setTx(txId, 'ok', hash)
      return { body: { ...debited, nft: { tokenId }, tx: publicTx(txId) } }
    } catch (e) {
      setTx(txId, 'failed')
      const back = mutate(user.id, (s) => {
        const m = { ...(s.mintable ?? {}) }
        const key = `skin:${ed!.item_id}`
        if (m[key]) m[key] = Math.max(0, m[key] - 1)
        const n = { ...s, ovos: s.ovos + price, skins: s.skins.filter((k) => k !== ed!.item_id), mintable: m }
        return history(n, t('Compra cancelada: ovos devolvidos'), 0, price)
      })
      creditTreasury('loja', 'ovo', -price, id, `Estorno edição: ${item!.name}`)
      releaseStock(id)
      console.error('[web3] mint de edição falhou, devolvido', e instanceof Error ? e.message.split('\n')[0] : e)
      return fail(502, t('A rede não confirmou a operação. Os ovos voltaram para o seu saldo.'), back)
    }
  }

  // ----- Envio para endereço externo (exige KYC) -----
  if (path === '/api/web3/send' && method === 'POST') {
    if (user.kyc_status !== 'verified') fail(403, t('Envios para fora exigem verificação de identidade (KYC).'))
    const asset = body.asset === 'egg' || body.asset === 'corn' || body.asset === 'usdc' ? (body.asset as TokenKey) : fail(400, t('Moeda inválida'))
    const to = typeof body.to === 'string' && isAddress(body.to.trim(), { strict: false }) ? getAddress(body.to.trim()) : fail(400, t('Endereço de carteira inválido'))
    const w = walletOf(user.id)
    if (to === zeroAddress || to === getAddress(w.address) || to === getAddress(c!.env.market)) fail(400, t('Esse endereço não pode receber envios.'))
    // O destino é um jogador do Galo Brigão? (para avisá-lo que recebeu)
    const recipient = db().prepare('SELECT user_id FROM wallets WHERE lower(address) = lower(?)').get(to) as { user_id: string } | undefined
    const cap = caps().send[asset]
    const unitsAmt = asset === 'usdc' ? usdcUnits(body.amount, 0.01, cap) : BigInt(intIn(body.amount, cap))
    const human = asset === 'usdc' ? Number(unitsAmt) / 1e6 : Number(unitsAmt)
    if (usedToday(user.id, 'send', asset) + human > cap) fail(429, t('Limite diário de envio atingido ({n} por dia).', { n: cap }))
    const bal = await tokenBalance(asset, w.address).catch(chainFail)
    if (bal < unitsAmt) fail(400, t('Saldo insuficiente na carteira.'))
    const id = logTx(user.id, 'send', asset, human, to)
    try {
      setTx(id, 'ok', await transferToken(accountOf(w), asset, to, unitsAmt))
    } catch (e) {
      setTx(id, 'failed')
      return chainFail(e)
    }
    // Avisa o jogador que recebeu (entregue no poll, como os avisos da Feira).
    if (recipient && recipient.user_id !== user.id) {
      const moeda = asset === 'egg' ? t('🥚 ovos de ouro') : asset === 'corn' ? t('🌽 milho') : t('💵 USDC')
      const qtd = asset === 'usdc' ? human.toFixed(2) : String(human)
      notify(recipient.user_id, t('🎁 Você recebeu {n} {moeda} na sua carteira cripto! Veja na aba Carteira.', { n: qtd, moeda }))
    }
    return { body: { tx: publicTx(id) } }
  }

  // ----- Transformar item lendário em NFT -----
  if (path === '/api/web3/mint' && method === 'POST') {
    const key = typeof body.key === 'string' && /^(acc|skin):[\w-]{1,40}$/.test(body.key) ? body.key : fail(400, t('Item inválido'))
    const [kind, itemId] = key.split(':') as ['acc' | 'skin', string]
    const item = itemOf(kind, itemId)
    if (!item || (item.rarity !== 'lendario' && !('drop' in item && item.drop))) fail(400, t('Só itens lendários viram NFT.'))
    const w = walletOf(user.id)
    // 1) consome o crédito de NFT no save
    const debited = mutate(user.id, (s) => {
      if ((s.mintable?.[key] ?? 0) < 1) fail(400, t('Esse item não pode virar NFT (só lendários comprados com ovos de ouro ou dinheiro).'))
      if (units(s, kind, itemId) <= heldTokens(user.id, kind, itemId)) fail(400, t('Todas as suas unidades desse item já são NFT.'))
      return history({ ...s, mintable: { ...s.mintable, [key]: s.mintable![key] - 1 } }, t('NFT criado: {item}', { item: item!.name }))
    })
    const id = logTx(user.id, 'mint', key, 1, w.address)
    try {
      const r = await mintNft(w.address, kind, itemId)
      db().prepare("INSERT INTO nfts (token_id, kind, item_id, owner_user_id, status, price_units, minted_at, tx) VALUES (?, ?, ?, ?, 'held', NULL, ?, ?)").run(r.tokenId, kind, itemId, user.id, Date.now(), r.hash)
      setTx(id, 'ok', r.hash)
      return { body: { tokenId: r.tokenId, tx: publicTx(id), ...debited } }
    } catch (e) {
      setTx(id, 'failed')
      const back = mutate(user.id, (s) => ({ ...s, mintable: { ...s.mintable, [key]: (s.mintable?.[key] ?? 0) + 1 }, history: s.history.slice(1) }))
      console.error('[web3] mint falhou, crédito devolvido', e instanceof Error ? e.message.split('\n')[0] : e)
      return fail(502, t('A rede não confirmou a operação. Tente de novo em instantes.'), back)
    }
  }

  // ----- 🐓 Galo NFT: transformar um galo em NFT -----
  if (path === '/api/web3/mint-galo' && method === 'POST') {
    const roosterId = typeof body.roosterId === 'string' && /^[\w-]{1,64}$/.test(body.roosterId) ? body.roosterId : fail(400, t('Galo não encontrado'))
    const w = walletOf(user.id)
    // 1) marca o galo como NFT pendente no save (trava Feira/presente/aluguel)
    const marked = mutate(user.id, (s) => {
      const ro = s.roosters.find((r) => r.id === roosterId) ?? fail(404, t('Galo não encontrado'))
      if (ro.nft) fail(409, t('{nome} já é um Galo NFT.', { nome: ro.name }))
      const why = roosterLock(s, ro) ?? nftIneligible(s, ro)
      if (why) fail(400, why)
      return { ...s, roosters: s.roosters.map((r) => (r.id === roosterId ? { ...r, nft: { tokenId: 'pendente' } } : r)) }
    })
    const ro = marked.state.roosters.find((r) => r.id === roosterId)!
    const id = logTx(user.id, 'mint', `galo:${roosterId}`, 1, w.address) // i18n-ok (chave interna)
    try {
      const r = await mintNft(w.address, 'galo', roosterId)
      db().prepare("INSERT INTO nfts (token_id, kind, item_id, owner_user_id, status, price_units, minted_at, tx) VALUES (?, 'galo', ?, ?, 'held', NULL, ?, ?)").run(r.tokenId, roosterId, user.id, Date.now(), r.hash) // i18n-ok (chave interna)
      setTx(id, 'ok', r.hash)
      const out = mutate(user.id, (s) => history({ ...s, roosters: s.roosters.map((x) => (x.id === roosterId ? { ...x, nft: { tokenId: String(r.tokenId) } } : x)) }, t('🐓 Galo NFT criado: {nome}', { nome: ro.name })))
      saveGaloSnapshot(r.tokenId, { ...ro, nft: { tokenId: String(r.tokenId) } }, user.id)
      return { body: { tokenId: r.tokenId, tx: publicTx(id), ...out } }
    } catch (e) {
      setTx(id, 'failed')
      const back = mutate(user.id, (s) => ({ ...s, roosters: s.roosters.map((x) => (x.id === roosterId && x.nft?.tokenId === 'pendente' ? { ...x, nft: undefined } : x)) }))
      console.error('[web3] mint de galo falhou, desfeito', e instanceof Error ? e.message.split('\n')[0] : e)
      return fail(502, t('A rede não confirmou a operação. Tente de novo em instantes.'), back)
    }
  }

  // ----- 🐓 Galo NFT: trazer de volta para o jogo (queima o token) -----
  if (path === '/api/web3/unmint-galo' && method === 'POST') {
    const tokenId = tokenIdOf(body.tokenId)
    const nft = db().prepare("SELECT * FROM nfts WHERE token_id = ? AND owner_user_id = ? AND kind = 'galo'").get(tokenId, user.id) as unknown as NftRow | undefined // i18n-ok (chave interna)
    if (!nft) fail(404, t('NFT não encontrado'))
    if (nft!.status !== 'held') fail(409, t('Tire o galo do Mercado antes.'))
    const w = walletOf(user.id)
    const owner = await ownerOf(tokenId).catch(chainFail)
    if (getAddress(owner) !== getAddress(w.address)) fail(409, t('Esse NFT não está na sua carteira.'))
    lock(tokenId, 'held', 'burning', user.id)
    const id = logTx(user.id, 'unmint', `galo:${nft!.item_id}`, 1, w.address) // i18n-ok (chave interna)
    let hash: string
    try {
      hash = await burnNft(tokenId)
    } catch (e) {
      db().prepare("UPDATE nfts SET status = 'held' WHERE token_id = ?").run(tokenId)
      setTx(id, 'failed')
      return chainFail(e)
    }
    db().prepare('DELETE FROM nfts WHERE token_id = ?').run(tokenId)
    markGaloBurned(tokenId)
    setTx(id, 'ok', hash)
    const out = mutate(user.id, (s) => {
      const ro = s.roosters.find((x) => x.id === nft!.item_id)
      const n = { ...s, roosters: s.roosters.map((x) => (x.id === nft!.item_id ? { ...x, nft: undefined } : x)) }
      return ro ? history(n, t('🐓 {nome} voltou a ser um galo comum do jogo', { nome: ro.name })) : n
    })
    return { body: { ok: true, tx: publicTx(id), ...out } }
  }

  // ----- Pedido de verificação de identidade -----
  if (path === '/api/web3/kyc' && method === 'POST') {
    const st = user.kyc_status ?? 'none'
    if (st === 'none' || st === 'rejected') db().prepare("UPDATE users SET kyc_status = 'pending' WHERE id = ?").run(user.id)
    return { body: { kyc: st === 'none' || st === 'rejected' ? 'pending' : st } }
  }

  // ----- Mercado -----
  if (path === '/api/market' && method === 'GET') {
    const rows = db()
      .prepare("SELECT n.token_id, n.kind, n.item_id, n.price_units, n.owner_user_id, u.name FROM nfts n JOIN users u ON u.id = n.owner_user_id WHERE n.status = 'listed' ORDER BY n.price_units ASC LIMIT 200")
      .all() as { token_id: number; kind: string; item_id: string; price_units: number; owner_user_id: string; name: string }[]
    return {
      body: {
        listings: rows.map((r) => {
          const ro = r.kind === 'galo' ? liveGalo(r.token_id, r.owner_user_id, r.item_id) : null
          return { tokenId: r.token_id, kind: r.kind, itemId: r.item_id, price: usd(r.price_units), seller: r.name, mine: r.owner_user_id === user.id, ...(ro ? { rooster: galoLook(ro) } : {}) }
        }),
        feeBps: await feeBps().catch(() => null),
      },
    }
  }

  if (path === '/api/market/list' && method === 'POST') {
    const tokenId = tokenIdOf(body.tokenId)
    const price = usdcUnits(body.price, 0.1, 100_000)
    const nft = db().prepare('SELECT * FROM nfts WHERE token_id = ? AND owner_user_id = ?').get(tokenId, user.id) as unknown as NftRow | undefined
    if (!nft) fail(404, t('NFT não encontrado'))
    if (nft!.status !== 'held') fail(409, t('Esse NFT já está à venda.'))
    const save = needSave(user.id)
    if (nft!.kind === 'galo') {
      const ro = save.state.roosters.find((r) => r.id === nft!.item_id && r.nft?.tokenId === String(tokenId)) ?? fail(409, t('Você não tem mais esse item no jogo.'))
      const why = roosterLock(save.state, ro, { allowNft: true })
      if (why) fail(409, why)
      saveGaloSnapshot(tokenId, ro)
    } else if (units(save.state, nft!.kind, nft!.item_id) < heldTokens(user.id, nft!.kind, nft!.item_id)) fail(409, t('Você não tem mais esse item no jogo.'))
    // Piso de preço: protege a economia (ninguém lista muito abaixo do valor do item).
    const floorRo = nft!.kind === 'galo' ? save.state.roosters.find((r) => r.id === nft!.item_id) ?? null : null
    const minUsdc = listFloor(suggestedUsdc(nft!.kind, nft!.item_id, floorRo))
    if (minUsdc > 0 && Number(price) / 1e6 < minUsdc) fail(400, t('Preço abaixo do mínimo ({n} USDC) para proteger a economia.', { n: minUsdc }))
    const w = walletOf(user.id)
    const owner = await ownerOf(tokenId).catch(chainFail)
    if (getAddress(owner) !== getAddress(w.address)) fail(409, t('Esse NFT não está na sua carteira.'))
    lock(tokenId, 'held', 'listing', user.id)
    const id = logTx(user.id, 'list', `nft:${tokenId}`, (Number(price) / 1e6).toString(), c!.env.market)
    try {
      const hash = await listNft(accountOf(w), tokenId, price)
      db().prepare("UPDATE nfts SET status = 'listed', price_units = ? WHERE token_id = ?").run(Number(price), tokenId)
      setTx(id, 'ok', hash)
    } catch (e) {
      db().prepare("UPDATE nfts SET status = 'held' WHERE token_id = ?").run(tokenId)
      setTx(id, 'failed')
      return chainFail(e)
    }
    return { body: { ok: true, tx: publicTx(id) } }
  }

  if (path === '/api/market/cancel' && method === 'POST') {
    const tokenId = tokenIdOf(body.tokenId)
    const w = walletOf(user.id)
    lock(tokenId, 'listed', 'cancelling', user.id)
    const id = logTx(user.id, 'cancel', `nft:${tokenId}`, 0, w.address)
    try {
      const hash = await cancelListing(accountOf(w), tokenId)
      db().prepare("UPDATE nfts SET status = 'held', price_units = NULL WHERE token_id = ?").run(tokenId)
      setTx(id, 'ok', hash)
    } catch (e) {
      db().prepare("UPDATE nfts SET status = 'listed' WHERE token_id = ?").run(tokenId)
      setTx(id, 'failed')
      return chainFail(e)
    }
    return { body: { ok: true, tx: publicTx(id) } }
  }

  if (path === '/api/market/buy' && method === 'POST') {
    const tokenId = tokenIdOf(body.tokenId)
    const nft = db().prepare("SELECT * FROM nfts WHERE token_id = ? AND status = 'listed'").get(tokenId) as unknown as NftRow | undefined
    if (!nft || nft.price_units == null) fail(404, t('Esse item não está mais à venda.'))
    if (nft!.owner_user_id === user.id) fail(400, t('Você não pode comprar o seu próprio item.'))
    const buyerSave = needSave(user.id)
    if (nft!.kind === 'skin' && buyerSave.state.skins.includes(nft!.item_id)) fail(409, t('Você já tem essa skin.'))
    if (nft!.kind === 'galo') {
      const ro = liveGalo(tokenId, nft!.owner_user_id, nft!.item_id) ?? fail(409, t('O anúncio mudou. Atualize o mercado.'))
      const why = galoReceiveBlock(buyerSave.state, ro)
      if (why) fail(409, why)
    }
    const price = BigInt(nft!.price_units!)
    const w = walletOf(user.id)
    const seller = walletOf(nft!.owner_user_id)
    // Confere na chain: anúncio igual ao do banco e saldo suficiente
    const [onChain, bal] = await Promise.all([listingOf(tokenId), tokenBalance('usdc', w.address)]).catch(chainFail)
    if (getAddress(onChain.seller) !== getAddress(seller.address) || onChain.price !== price) fail(409, t('O anúncio mudou. Atualize o mercado.'))
    if (bal < price) fail(402, t('USDC insuficiente na carteira. Deposite USDC no seu endereço.'))
    lock(tokenId, 'listed', 'buying')
    const id = logTx(user.id, 'buy', `nft:${tokenId}`, (Number(price) / 1e6).toString(), seller.address)
    let r: Awaited<ReturnType<typeof buyNft>>
    try {
      r = await buyNft(accountOf(w), tokenId, price)
    } catch (e) {
      db().prepare("UPDATE nfts SET status = 'listed' WHERE token_id = ?").run(tokenId)
      setTx(id, 'failed')
      return chainFail(e)
    }
    // Pago na chain: move o item entre os saves
    const priceTxt = (Number(price) / 1e6).toString()
    if (nft!.kind === 'galo') return moveGalo(nft!, user, tokenId, priceTxt, id, r, w.address)
    const item = itemOf(nft!.kind, nft!.item_id)!
    const d = db()
    d.exec('BEGIN')
    try {
      const sellerSave = loadSave(nft!.owner_user_id)
      if (sellerSave) writeSave(nft!.owner_user_id, history(removeItem(sellerSave.state, nft!.kind, nft!.item_id), t('Venda no mercado: {item} por {preco} USDC', { item: item.name, preco: priceTxt })), sellerSave.rev + 1)
      const bs = loadSave(user.id)!
      const next = history(addItem(bs.state, nft!.kind, nft!.item_id), t('Compra no mercado: {item} por {preco} USDC', { item: item.name, preco: priceTxt }))
      writeSave(user.id, next, bs.rev + 1)
      d.prepare("UPDATE nfts SET owner_user_id = ?, status = 'held', price_units = NULL WHERE token_id = ?").run(user.id, tokenId)
      logTx(nft!.owner_user_id, 'sell', `nft:${tokenId}`, ((Number(r.price) - Number(r.fee)) / 1e6).toString(), w.address, 'ok', r.hash)
      setTx(id, 'ok', r.hash)
      d.exec('COMMIT')
      return { body: { rev: bs.rev + 1, state: next, tx: publicTx(id), fee: usd(r.fee) } }
    } catch (e) {
      d.exec('ROLLBACK')
      setTx(id, 'paid-unmoved', r.hash)
      throw e
    }
  }

  return null
}

// ---------- Galo NFT vendido: move o galo entre os saves ----------

function moveGalo(nft: NftRow, user: UserRow, tokenId: number, priceTxt: string, id: string, r: { hash: string; price: bigint; fee: bigint }, buyerAddr: string): Web3Out {
  const d = db()
  d.exec('BEGIN')
  try {
    const sellerSave = loadSave(nft.owner_user_id)
    const taken = sellerSave ? takeGalo(sellerSave.state, nft.item_id) : { state: null, rooster: null }
    // Galo some do save do vendedor? Usa a ficha guardada do token
    const ro = taken.rooster ?? liveGalo(tokenId, null, nft.item_id)!
    if (sellerSave && taken.state) writeSave(nft.owner_user_id, history(taken.state, t('Venda no mercado: {item} por {preco} USDC', { item: ro.name, preco: priceTxt })), sellerSave.rev + 1)
    const bs = loadSave(user.id)!
    const moved: Rooster = { ...ro, nft: { tokenId: String(tokenId) } }
    const next = history(giveGalo(bs.state, moved, bs.state.player.name), t('Compra no mercado: {item} por {preco} USDC', { item: ro.name, preco: priceTxt }))
    writeSave(user.id, next, bs.rev + 1)
    d.prepare("UPDATE nfts SET owner_user_id = ?, status = 'held', price_units = NULL WHERE token_id = ?").run(user.id, tokenId)
    saveGaloSnapshot(tokenId, moved)
    logTx(nft.owner_user_id, 'sell', `nft:${tokenId}`, ((Number(r.price) - Number(r.fee)) / 1e6).toString(), buyerAddr, 'ok', r.hash)
    setTx(id, 'ok', r.hash)
    d.exec('COMMIT')
    return { body: { rev: bs.rev + 1, state: next, tx: publicTx(id), fee: usd(r.fee) } }
  } catch (e) {
    d.exec('ROLLBACK')
    setTx(id, 'paid-unmoved', r.hash)
    throw e
  }
}

// ---------- Imagem do NFT ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
function nftSvg(emoji: string, name: string, type: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2410"/><stop offset="1" stop-color="#140c06"/></linearGradient></defs>
<rect width="400" height="400" rx="28" fill="url(#g)"/>
<rect x="10" y="10" width="380" height="380" rx="22" fill="none" stroke="#ffb020" stroke-width="4"/>
<text x="200" y="200" font-size="150" text-anchor="middle" dominant-baseline="central">${esc(emoji)}</text>
<text x="200" y="320" font-size="26" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${esc(name)}</text>
<text x="200" y="356" font-size="18" font-family="sans-serif" fill="#ffb020" text-anchor="middle">Legendary ${esc(type)} · Chicken Fighter</text>
</svg>`
}

// ---------- Backoffice ----------

const KYC = ['none', 'pending', 'verified', 'rejected']
export function setKyc(userId: string, status: unknown) {
  const st = typeof status === 'string' && KYC.includes(status) ? status : fail(400, t('Status de KYC inválido'))
  // KYC manual: o admin aprova no backoffice (inclusive na mainnet, por decisão do operador).
  db().prepare('UPDATE users SET kyc_status = ? WHERE id = ?').run(st, userId)
  return st
}

export function walletAddress(userId: string) {
  return (db().prepare('SELECT address FROM wallets WHERE user_id = ?').get(userId) as { address: string } | undefined)?.address ?? null
}
/** Endereço da carteira do jogador, criando a carteira se ainda não existir. */
export const ensureWalletAddress = (userId: string) => walletOf(userId).address

export function web3Overview() {
  const n = (sql: string) => (db().prepare(sql).get() as { n: number }).n
  return {
    enabled: web3Enabled(),
    wallets: n('SELECT COUNT(*) AS n FROM wallets'),
    nfts: n('SELECT COUNT(*) AS n FROM nfts'),
    listed: n("SELECT COUNT(*) AS n FROM nfts WHERE status = 'listed'"),
    kycPending: n("SELECT COUNT(*) AS n FROM users WHERE kyc_status = 'pending'"),
    // Casos para o suporte: queimou sem creditar ou pagou sem mover o item
    anomalies: n("SELECT COUNT(*) AS n FROM web3_tx WHERE status IN ('burned-uncredited', 'paid-unmoved')"),
    kycQueue: db().prepare("SELECT id, email, name, created_at FROM users WHERE kyc_status = 'pending' ORDER BY created_at LIMIT 50").all(),
    recent: db()
      .prepare("SELECT x.id, x.user_id, COALESCE(u.email, '(conta excluída)') AS email, x.kind, x.asset, x.amount, x.to_addr, x.tx_hash, x.status, x.created_at FROM web3_tx x LEFT JOIN users u ON u.id = x.user_id ORDER BY x.created_at DESC LIMIT 100") // i18n-ok
      .all(),
  }
}
