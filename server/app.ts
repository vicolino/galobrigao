import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SKU_BY_ID, SPEND_LIMITS, type Sku } from '../src/game/catalog'
import { effectiveCatalog, effectiveSku, live, publicConfig } from '../src/game/config'
import { AdminError, handleAdmin, isAdmin } from './admin'
import { loadConfig } from './config'
import { newGame } from '../src/game/engine'
import { addMintable, premiumViolation, runShop, ShopError, softViolation, type ShopOp } from '../src/game/premium'
import { makeRooster, today } from '../src/game/rooster'
import type { GameState } from '../src/game/types'
import { checkPassword, clearCookie, createSession, destroySession, dummyPasswordCheck, hashPassword, needsRehash, sessionCookie, userFromRequest } from './auth'
import { badOrigin, baseHeaders, clientIp, isProd, limited, tooMany } from './security'
import { getDb, type OrderRow, type UserRow } from './db'
import { emailShell, sendMail } from './mail'
import { SaveConflict, loadSave, writeSave } from './saves'
import { handlePvp, PvpError } from './pvp'
import { FeiraError, feiraDeleteUser, handleFeira } from './feira'
import { AluguelError, aluguelDeleteUser, guardRentals, handleAluguel } from './aluguel'
import { BetError, creditSave, handleBets, migrateOldBets, plausibleChips, takeCredits, tickBets } from './bets'
import { applyBetCredit } from '../src/game/bets'
import { fetchRemoteStatus, parseMpWebhook, providerName, startPayment } from './payments'
import { t, tx, withLang, type Lang } from '../src/i18n'
import { appName } from '../src/brand'
import { SKIN_BY_ID } from '../src/game/data'
import { grantPassPremium, hasPassPremium, mergeClientPass, PASS_DAILY_XP } from '../src/game/pass'
import { handleWeb3, Web3Error, web3Enabled } from './web3'
import { handleDeposito } from './deposito'
import { afterShop, deleteOfferData, firstPurchaseSku, handleOfertas, isFirstPurchase, OfertasError, withStock } from './ofertas'
import { CriacaoError, handleCriacao } from './criacao'
import { arenaDeleteUser, EconomiaError, handleEconomia } from './economia'
import { dropsDeleteUser, handleDrops } from './drops'
import { economyViolation, serverEconomy } from '../src/game/economia'
import { currentPass } from '../src/game/pass'
import { handleTorneios, torneioDeleteUser, TorneioError } from './torneios'
import { galoNftViolation, keepRoosterServerFields } from '../src/game/galonft'

try {
  process.loadEnvFile?.('.env')
} catch {
  /* sem .env */
}

type Req = IncomingMessage
type Res = ServerResponse
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

/** Idioma de quem fez a requisição (cabeçalho X-Lang do cliente). Só 'pt' quando pedido; senão inglês. */
const reqLang = (req: Req): Lang => (String(req.headers['x-lang'] ?? '').toLowerCase() === 'pt' ? 'pt' : 'en')

const json = (res: Res, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...baseHeaders(), ...headers })
  res.end(JSON.stringify(body))
}

async function readBody(req: Req): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 2_000_000) throw new HttpError(413, t('Requisição muito grande'))
    chunks.push(c as Buffer)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, t('JSON inválido'))
  }
}

const needUser = (req: Req) => {
  const u = userFromRequest(req)
  if (!u) throw new HttpError(401, t('Faça login para continuar'))
  if (u.banned_at) throw new HttpError(403, u.ban_reason ? t('Conta bloqueada: {motivo}. Fale com o suporte.', { motivo: u.ban_reason }) : t('Conta bloqueada. Fale com o suporte.'))
  // Dia de atividade (para os gráficos de jogadores ativos)
  getDb().prepare('INSERT OR IGNORE INTO activity (user_id, day) VALUES (?, ?)').run(u.id, new Date().toISOString().slice(0, 10))
  return applyPendingLimit(grantMvp(u))
}

/** Modo MVP: cada conta recebe o crédito de teste uma única vez. */
function grantMvp(u: UserRow): UserRow {
  // Só concede o crédito de boas-vindas depois que o e-mail foi confirmado (senão daria pra farmar com e-mails falsos).
  if (!live.mvp.on || u.mvp_granted_at || !u.email_verified_at || live.mvp.creditCents <= 0) return u
  const r = getDb()
    .prepare('UPDATE users SET mvp_credit_cents = mvp_credit_cents + ?, mvp_granted_at = ? WHERE id = ? AND mvp_granted_at IS NULL')
    .run(live.mvp.creditCents, Date.now(), u.id)
  return r.changes ? { ...u, mvp_credit_cents: (u.mvp_credit_cents ?? 0) + live.mvp.creditCents, mvp_granted_at: Date.now() } : u
}

const paymentsLive = () => providerName() !== 'sandbox' || sandboxAllowed()

/** Versão publicada (dist/build.json), relida no máximo a cada 30 s. */
let buildCache = { id: null as string | null, at: 0 }
function currentBuild() {
  if (Date.now() - buildCache.at > 30_000) {
    try {
      buildCache = { id: JSON.parse(readFileSync(join(process.cwd(), 'dist', 'build.json'), 'utf8')).id, at: Date.now() }
    } catch {
      buildCache = { id: null, at: Date.now() }
    }
  }
  return buildCache.id
}

/** Em manutenção, só administradores jogam e compram. */
function blockIfMaintenance(u: UserRow) {
  if (live.maintenance.on && !isAdmin(u)) throw new HttpError(503, live.maintenance.message || t('Em manutenção'))
}

/** Consulta o provedor de pagamento e entrega se já foi pago. */
async function recheckOrder(order: OrderRow): Promise<OrderRow> {
  if (order.status !== 'pendente') return order
  if (Date.now() - order.created_at > 30 * 60_000 && order.method === 'pix') {
    getDb().prepare("UPDATE orders SET status = 'expirado' WHERE id = ?").run(order.id)
    return { ...order, status: 'expirado' }
  }
  if (order.provider === 'sandbox') return order
  const remote = await fetchRemoteStatus(order).catch(() => null)
  if (remote?.status === 'pago') return fulfill(order.id, remote.amountCents)!
  if (remote?.status === 'recusado') {
    getDb().prepare("UPDATE orders SET status = 'recusado' WHERE id = ?").run(order.id)
    return { ...order, status: 'recusado' }
  }
  return order
}

// ---------- Limite de gastos ----------

function applyPendingLimit(u: UserRow): UserRow {
  if (u.pending_limit_cents && u.pending_limit_at && u.pending_limit_at <= Date.now()) {
    getDb().prepare('UPDATE users SET monthly_limit_cents = ?, pending_limit_cents = NULL, pending_limit_at = NULL WHERE id = ?').run(u.pending_limit_cents, u.id)
    return { ...u, monthly_limit_cents: u.pending_limit_cents, pending_limit_cents: null, pending_limit_at: null }
  }
  return u
}

function spentThisMonth(userId: string) {
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const row = getDb().prepare("SELECT COALESCE(SUM(amount_cents),0) AS s FROM orders WHERE user_id = ? AND status = 'pago' AND provider != 'credito' AND paid_at >= ?").get(userId, start) as { s: number }
  return row.s
}

const publicUser = (u: UserRow) => ({
  id: u.id,
  mvpCreditCents: u.mvp_credit_cents ?? 0,
  isAdmin: isAdmin(u),
  email: u.email,
  emailVerified: !!u.email_verified_at,
  name: u.name,
  limits: {
    monthlyCents: u.monthly_limit_cents,
    spentCents: spentThisMonth(u.id),
    pendingCents: u.pending_limit_cents,
    pendingAt: u.pending_limit_at,
    options: SPEND_LIMITS,
  },
})

/** Bloqueia ações de dinheiro (compra, depósito, saque) enquanto o e-mail não for confirmado. */
const assertVerified = (u: UserRow) => {
  if (!u.email_verified_at) throw new HttpError(403, t('Confirme seu e-mail para comprar, depositar ou sacar. Veja o aviso no topo do jogo.'), { needsEmailVerify: true })
}

/** Cria um token de confirmação de e-mail e manda o link (vale 24h). Fire-and-forget pelo chamador. */
async function sendVerifyEmail(user: UserRow, lang: Lang) {
  const token = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(token).digest('hex')
  getDb().prepare('INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hash, user.id, Date.now() + 24 * 3600_000)
  const link = `${(process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/#/confirmar?token=${token}`
  await sendMail(
    user.email,
    t('Confirme seu e-mail', undefined, lang),
    emailShell({
      brand: appName(lang),
      heading: t('Olá, {nome}!', { nome: user.name }, lang),
      intro: t('Confirme seu e-mail para liberar as compras e o seu crédito de boas-vindas.', undefined, lang),
      button: { text: t('Confirmar e-mail', undefined, lang), href: link },
      linkFallback: { label: t('Se o botão não abrir, copie e cole este link no navegador:', undefined, lang), href: link },
      note: t('O link vale por 24 horas. Se não foi você, ignore este e-mail.', undefined, lang),
      footer: t('Este é um e-mail automático do {brand}. Por favor, não responda.', { brand: appName(lang) }, lang),
    }),
    appName(lang),
  )
}

// ---------- Save ----------

/** Limite diário genérico (usa a mesma tabela, com prefixo no dia). */
function guardDaily(userId: string, prefix: string, gained: number, max: number) {
  if (gained <= 0) return true
  const db = getDb()
  const day = `${prefix}:${today()}`
  const row = db.prepare('SELECT gained FROM ovos_guard WHERE user_id = ? AND day = ?').get(userId, day) as { gained: number } | undefined
  const total = (row?.gained ?? 0) + gained
  if (total > max) return false
  db.prepare('INSERT INTO ovos_guard (user_id, day, gained) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET gained = excluded.gained').run(userId, day, total)
  return true
}

/** Ovos que o jogador ganha jogando são limitados por dia (evita editar o save para ganhar ovos). */
function guardFreeOvos(userId: string, gained: number) {
  if (gained <= 0) return true
  const db = getDb()
  const day = today()
  const row = db.prepare('SELECT gained FROM ovos_guard WHERE user_id = ? AND day = ?').get(userId, day) as { gained: number } | undefined
  const total = (row?.gained ?? 0) + gained
  if (total > live.economy.freeOvosPerDay) return false
  db.prepare('INSERT INTO ovos_guard (user_id, day, gained) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET gained = excluded.gained').run(userId, day, total)
  return true
}

// ---------- Entrega de compras ----------

function grant(state: GameState | null, sku: Sku, user: UserRow): GameState {
  let s = state
  if (sku.kind === 'starter') {
    if (!s) {
      const l: Lang = user.lang === 'en' ? 'en' : 'pt'
      s = withLang(l, () => newGame(user.name, '🧑‍🌾', sku.breedId!, { stars: sku.stars, roosterName: sku.roosterName && tx(sku.roosterName, l) }))
    } else {
      const ro = makeRooster({ breedId: sku.breedId!, stars: sku.stars, name: sku.roosterName && tx(sku.roosterName, user.lang === 'en' ? 'en' : 'pt'), owner: user.name })
      s = { ...s, roosters: [...s.roosters, ro] }
    }
    // Galo de kit pago com dinheiro pode virar NFT
    s = addMintable(s, `galo:${s.roosters[s.roosters.length - 1].id}`) // i18n-ok (chave interna)
    if (sku.skin) {
      // Skin lendária paga com dinheiro pode virar NFT
      if (!s.skins.includes(sku.skin)) s = SKIN_BY_ID[sku.skin]?.rarity === 'lendario' ? addMintable({ ...s, skins: [...s.skins, sku.skin] }, `skin:${sku.skin}`) : { ...s, skins: [...s.skins, sku.skin] }
      const idx = s.roosters.length - 1
      s = { ...s, roosters: s.roosters.map((r, i) => (i === idx ? { ...r, skin: sku.skin } : r)) }
    }
    if (sku.tools) {
      const tools = { ...s.tools }
      for (const [k, q] of Object.entries(sku.tools)) tools[k] = (tools[k] ?? 0) + q
      s = { ...s, tools }
    }
  }
  if (!s) throw new HttpError(409, t('Crie seu galinheiro antes de comprar'))
  const ovos = (sku.ovos ?? 0) + (sku.bonus ?? 0)
  if (ovos) s = { ...s, ovos: s.ovos + ovos }
  if (sku.kind === 'vip') s = { ...s, vip: { until: Math.max(Date.now(), s.vip.until) + 30 * 864e5 } }
  // Passe da Temporada: premium do mês atual (se já tinha, vira ovos)
  if (sku.kind === 'pass') s = grantPassPremium(s)
  const entry = { id: randomUUID().slice(0, 8), at: Date.now(), text: t('Compra: {item}', { item: sku.name }), milho: 0, ovo: ovos }
  return { ...s, history: [entry, ...s.history].slice(0, 80), stats: { ...s.stats, purchases: s.stats.purchases + 1 } }
}

/** Marca o pedido como pago e entrega os itens. Idempotente. */
function fulfill(orderId: string, paidAmountCents?: number) {
  const db = getDb()
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as unknown as OrderRow | undefined
  if (!order || order.fulfilled_at) return order
  if (paidAmountCents !== undefined && paidAmountCents < order.amount_cents) throw new Error(`valor pago menor que o pedido ${orderId}`)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id) as unknown as UserRow
  const sku0 = effectiveSku(order.sku)!
  db.exec('BEGIN')
  try {
    // Primeira compra: ovos em dobro (server/ofertas.ts)
    const sku = firstPurchaseSku(user.id, orderId, sku0)
    const cur = loadSave(user.id)
    const next = grant(cur?.state ?? null, sku, user)
    writeSave(user.id, next, (cur?.rev ?? 0) + 1)
    const now = Date.now()
    db.prepare("UPDATE orders SET status = 'pago', paid_at = COALESCE(paid_at, ?), fulfilled_at = ? WHERE id = ?").run(now, now, orderId)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as unknown as OrderRow
}

const publicOrder = (o: OrderRow) => ({
  id: o.id,
  sku: o.sku,
  name: SKU_BY_ID[o.sku]?.name ?? o.sku,
  amountCents: o.amount_cents,
  method: o.method,
  status: o.status,
  provider: o.provider,
  pixCode: o.pix_code,
  pixQr: o.pix_qr,
  checkoutUrl: o.checkout_url,
  createdAt: o.created_at,
  paidAt: o.paid_at,
})

// ---------- Rotas ----------

// Senhas erradas por conta (memória, janela de 15 min)
const fails = new Map<string, number[]>()
const failCount = (email: string) => (fails.get(email) ?? []).filter((t) => Date.now() - t < 15 * 60_000).length
const addFail = (email: string) => fails.set(email, [...(fails.get(email) ?? []).filter((t) => Date.now() - t < 15 * 60_000), Date.now()])

/** Em produção, o modo de teste de pagamento fica desligado (senão qualquer um "simula" e ganha itens). */
export const sandboxAllowed = () => !isProd() || process.env.ALLOW_SANDBOX === '1'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Relógio das apostas: resolve lutas no horário e mantém a agenda cheia, mesmo sem ninguém online.
const timers = globalThis as unknown as { __betsTimer?: ReturnType<typeof setInterval>; __betsMigrated?: boolean }
if (timers.__betsTimer) clearInterval(timers.__betsTimer)
timers.__betsTimer = setInterval(() => {
  try {
    loadConfig()
    if (!timers.__betsMigrated) {
      timers.__betsMigrated = true
      migrateOldBets()
    }
    tickBets()
  } catch (e) {
    console.error('[apostas]', e)
  }
}, 5_000)
timers.__betsTimer.unref?.()

export async function handle(req: Req, res: Res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = req.method ?? 'GET'
  const secure = isProd() || (process.env.PUBLIC_URL ?? '').startsWith('https')
  const db = getDb()
  const ip = clientIp(req)
  // Limite geral por IP (protege contra abuso e sobrecarga)
  if (path !== '/api/webhooks/mercadopago' && limited(`api:${ip}`, 300, 60_000)) return tooMany(res)
  if (badOrigin(req)) return json(res, 403, { error: t('Origem não permitida') })
  loadConfig()
  try {
    // ----- Configuração pública (aviso, manutenção, recompensas) -----
    if (path === '/api/config' && method === 'GET') return json(res, 200, { ...publicConfig(live), build: isProd() ? currentBuild() : null, web3: web3Enabled() })

    // ----- Backoffice -----
    if (path.startsWith('/api/admin/')) {
      const u = needUser(req)
      const body = method === 'GET' ? {} : await readBody(req)
      const out = await handleAdmin(path, method, url, body, u, { fulfill, recheck: recheckOrder })
      if (out) return json(res, 200, out)
      throw new HttpError(404, t('Rota não encontrada'))
    }

    // ----- Auth -----
    if (path === '/api/auth/signup' && method === 'POST') {
      if (limited(`signup:${ip}`, 5, 3600_000)) throw new HttpError(429, t('Muitos cadastros deste endereço. Tente mais tarde.'))
      const b = await readBody(req)
      const email = String(b.email ?? '').trim().toLowerCase()
      const password = String(b.password ?? '')
      const name = String(b.name ?? '').trim().slice(0, 16)
      if (!EMAIL.test(email)) throw new HttpError(400, t('E-mail inválido'))
      if (password.length < 8) throw new HttpError(400, t('A senha precisa ter pelo menos 8 caracteres'))
      if (name.length < 2) throw new HttpError(400, t('Escolha um nome de criador'))
      if (b.adult !== true) throw new HttpError(400, t('É preciso ter 18 anos ou mais'))
      if (b.terms !== true) throw new HttpError(400, t('Aceite os termos de uso'))
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, t('Esse e-mail já tem conta. Faça login.'))
      const { hash, salt } = await hashPassword(password)
      const id = randomUUID()
      const now = Date.now()
      db.prepare('INSERT INTO users (id, email, name, pass_hash, salt, created_at, adult_confirmed_at, terms_accepted_at, monthly_limit_cents, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, email, name, hash, salt, now, now, now, live.economy.defaultSpendLimitCents, reqLang(req))
      // Origem do cadastro (UTM): minúsculas, [a-z0-9_-], até 40 caracteres
      const utm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || null
      const o = (b.utm ?? {}) as Record<string, unknown>
      db.prepare('UPDATE users SET utm_source = ?, utm_medium = ?, utm_campaign = ?, ref = ? WHERE id = ?').run(utm(o.source), utm(o.medium), utm(o.campaign), utm(o.ref), id)
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow
      // Conta nasce não confirmada: manda o e-mail de confirmação (sem travar a resposta) e só libera o crédito ao confirmar.
      void sendVerifyEmail(user, reqLang(req)).catch((e) => console.error('[mail] verify', e))
      return json(res, 201, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(createSession(id), secure) })
    }
    if (path === '/api/auth/login' && method === 'POST') {
      if (limited(`login:${ip}`, 20, 60_000)) throw new HttpError(429, t('Muitas tentativas. Espere um minuto.'))
      const b = await readBody(req)
      const email = String(b.email ?? '').trim().toLowerCase()
      // Bloqueio por (conta + IP): 8 senhas erradas em 15 min. A chave inclui o IP para que um atacante
      // não consiga trancar a conta de uma vítima só errando a senha dela (o legítimo, de outro IP, ainda entra).
      const failKey = `${email}|${ip}`
      const fails = failCount(failKey)
      if (fails >= 8) throw new HttpError(429, t('Muitas senhas erradas nesta conta. Espere 15 minutos ou use "Esqueci minha senha".'))
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as unknown as UserRow | undefined
      const ok = user ? await checkPassword(String(b.password ?? ''), user) : await dummyPasswordCheck()
      if (!user || !ok) {
        addFail(failKey)
        throw new HttpError(401, t('E-mail ou senha incorretos'))
      }
      if (user.banned_at) throw new HttpError(403, user.ban_reason ? t('Conta bloqueada: {motivo}. Fale com o suporte.', { motivo: user.ban_reason }) : t('Conta bloqueada. Fale com o suporte.'))
      // Migra senhas em formato legado para o custo novo do scrypt, aproveitando que temos a senha em claro aqui.
      if (needsRehash(user)) db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run((await hashPassword(String(b.password ?? ''), user.salt)).hash, user.id)
      return json(res, 200, { user: publicUser(applyPendingLimit(user)) }, { 'Set-Cookie': sessionCookie(createSession(user.id), secure) })
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      destroySession(req)
      return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie })
    }
    // ----- Trocar senha (logado) -----
    if (path === '/api/auth/password' && method === 'POST') {
      const u = needUser(req)
      if (limited(`pwd:${u.id}`, 10, 3600_000)) throw new HttpError(429, t('Muitas tentativas. Tente mais tarde.'))
      const b = await readBody(req)
      if (!(await checkPassword(String(b.current ?? ''), u))) throw new HttpError(401, t('Senha atual incorreta'))
      const next = String(b.next ?? '')
      if (next.length < 8) throw new HttpError(400, t('A senha nova precisa ter pelo menos 8 caracteres'))
      const np = await hashPassword(next)
      db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(np.hash, np.salt, u.id)
      // Derruba as outras sessões e cria uma nova para este aparelho
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id)
      return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(createSession(u.id), secure) })
    }

    // ----- Recuperar senha -----
    if (path === '/api/auth/forgot' && method === 'POST') {
      if (limited(`forgot:${ip}`, 5, 3600_000)) throw new HttpError(429, t('Muitas tentativas. Tente mais tarde.'))
      const b = await readBody(req)
      if (limited(`forgot-mail:${String(b.email ?? '').trim().toLowerCase()}`, 3, 3600_000)) return json(res, 200, { ok: true })
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(b.email ?? '').trim().toLowerCase()) as unknown as UserRow | undefined
      if (user) {
        const token = randomBytes(32).toString('hex')
        const hash = createHash('sha256').update(token).digest('hex')
        db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hash, user.id, Date.now() + 3600_000)
        const link = `${(process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/#/redefinir?token=${token}`
        const l = reqLang(req)
        // Dispara o e-mail sem await: a resposta sai no mesmo tempo exista ou não a conta, para não vazar
        // por tempo de resposta quais e-mails têm cadastro. Erro de envio só é logado.
        void sendMail(
          user.email,
          t('Redefinir sua senha', undefined, l),
          emailShell({
            brand: appName(l),
            heading: t('Olá, {nome}!', { nome: user.name }, l),
            intro: t('Recebemos um pedido para criar uma senha nova na sua conta. É só clicar no botão abaixo.', undefined, l),
            button: { text: t('Criar senha nova', undefined, l), href: link },
            linkFallback: { label: t('Se o botão não abrir, copie e cole este link no navegador:', undefined, l), href: link },
            note: t('O link vale por 1 hora. Se não foi você, ignore este e-mail.', undefined, l),
            footer: t('Este é um e-mail automático do {brand}. Por favor, não responda.', { brand: appName(l) }, l),
          }),
          appName(l),
        ).catch((e) => console.error('[mail] forgot', e))
      }
      // Mesma resposta sempre, para não revelar quais e-mails têm conta
      return json(res, 200, { ok: true })
    }
    if (path === '/api/auth/reset' && method === 'POST') {
      const b = await readBody(req)
      const password = String(b.password ?? '')
      if (password.length < 8) throw new HttpError(400, t('A senha precisa ter pelo menos 8 caracteres'))
      const hash = createHash('sha256').update(String(b.token ?? '')).digest('hex')
      const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hash) as { user_id: string; expires_at: number; used_at: number | null } | undefined
      if (!row || row.used_at || row.expires_at < Date.now()) throw new HttpError(400, t('Link inválido ou vencido. Peça um novo.'))
      const np = await hashPassword(password)
      db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(np.hash, np.salt, row.user_id)
      db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(Date.now(), hash)
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id)
      return json(res, 200, { ok: true })
    }

    // ----- Confirmar e-mail -----
    if (path === '/api/auth/verify-email' && method === 'POST') {
      const b = await readBody(req)
      const hash = createHash('sha256').update(String(b.token ?? '')).digest('hex')
      const row = db.prepare('SELECT * FROM email_verifications WHERE token_hash = ?').get(hash) as { user_id: string; expires_at: number; used_at: number | null } | undefined
      if (!row || row.used_at || row.expires_at < Date.now()) throw new HttpError(400, t('Link inválido ou vencido. Reenvie a confirmação.'))
      db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(Date.now(), row.user_id)
      db.prepare('UPDATE email_verifications SET used_at = ? WHERE token_hash = ?').run(Date.now(), hash)
      // Agora que o e-mail está confirmado, o crédito de boas-vindas é liberado.
      const fresh = grantMvp(db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as unknown as UserRow)
      return json(res, 200, { user: publicUser(applyPendingLimit(fresh)) })
    }

    // ----- Reenviar confirmação de e-mail (logado) -----
    if (path === '/api/auth/resend-verification' && method === 'POST') {
      const u = needUser(req)
      if (u.email_verified_at) return json(res, 200, { ok: true })
      if (limited(`verify-resend:${u.id}`, 3, 3600_000)) throw new HttpError(429, t('Muitas tentativas. Tente mais tarde.'))
      void sendVerifyEmail(u, reqLang(req)).catch((e) => console.error('[mail] verify-resend', e))
      return json(res, 200, { ok: true })
    }

    // ----- Excluir conta (LGPD) -----
    if (path === '/api/account' && method === 'DELETE') {
      const u = needUser(req)
      const b = await readBody(req)
      if (!(await checkPassword(String(b.password ?? ''), u))) throw new HttpError(401, t('Senha incorreta'))
      db.exec('BEGIN')
      db.prepare('DELETE FROM saves WHERE user_id = ?').run(u.id)
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id)
      db.prepare('DELETE FROM ovos_guard WHERE user_id = ?').run(u.id)
      db.prepare('DELETE FROM house_bets WHERE user_id = ?').run(u.id)
      feiraDeleteUser(u.id)
      torneioDeleteUser(u.id)
      aluguelDeleteUser(u.id)
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id)
      deleteOfferData(u.id)
      arenaDeleteUser(u.id)
      dropsDeleteUser(u.id)
      // Pedidos pagos são mantidos anonimizados por obrigação fiscal; os dados pessoais saem.
      // Web3: carteira, NFTs, web3_tx e deposits ficam (ativos na chain + auditoria; só têm o id, sem dados pessoais).
      // Anúncios do jogador somem do mercado porque a listagem exige a conta existir.
      db.prepare("UPDATE orders SET user_id = 'excluido', pix_code = NULL, pix_qr = NULL WHERE user_id = ?").run(u.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id)
      db.exec('COMMIT')
      return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie })
    }

    if (path === '/api/me' && method === 'GET') {
      const u = userFromRequest(req)
      return json(res, 200, { user: u && !u.banned_at ? publicUser(applyPendingLimit(grantMvp(u))) : null, provider: providerName(), paymentsLive: paymentsLive() })
    }

    // ----- Catálogo -----
    if (path === '/api/catalog' && method === 'GET') {
      const u = userFromRequest(req)
      const bought = u ? (db.prepare("SELECT sku FROM orders WHERE user_id = ? AND status = 'pago'").all(u.id) as { sku: string }[]).map((r) => r.sku) : []
      return json(res, 200, { items: effectiveCatalog().filter((s) => s.active).map((s) => ({ ...s, owned: s.oncePerUser && bought.includes(s.id) })), provider: providerName(), paymentsLive: paymentsLive(), firstBonus: u ? isFirstPurchase(u.id) : true })
    }

    // ----- Save -----
    if (path === '/api/save' && method === 'GET') {
      const u = needUser(req)
      return json(res, 200, creditSave(u.id) ?? { rev: 0, state: null })
    }
    if (path === '/api/save' && method === 'PUT') {
      const u = needUser(req)
      blockIfMaintenance(u)
      const b = await readBody(req)
      const incoming = b.state as GameState
      const baseRev = Number(b.rev)
      const cur = loadSave(u.id)
      if (!cur) throw new HttpError(409, t('Sem galinheiro'), { rev: 0, state: null })
      if (baseRev !== cur.rev) throw new HttpError(409, t('Save desatualizado'), cur)
      if (!incoming || !Array.isArray(incoming.roosters) || incoming.roosters.length < 1 || incoming.roosters.length > 16) throw new HttpError(422, t('Save inválido'), cur)
      const gained = incoming.ovos - cur.state.ovos
      if (incoming.ovos < 0 || !guardFreeOvos(u.id, gained)) throw new HttpError(422, t('Ovos de ouro fora do esperado. Recarregando do servidor.'), cur)
      const milhoGain = incoming.milho - cur.state.milho
      // 🌽 Economia no servidor: o navegador não pode aumentar milho, ovos, XP, prêmios… (src/game/economia.ts)
      const locked = serverEconomy()
      if (!locked && !guardDaily(u.id, 'm', milhoGain, live.economy.freeMilhoPerDay)) throw new HttpError(422, t('Milho fora do esperado. Recarregando do servidor.'), cur)
      const violation = premiumViolation(cur.state, incoming) ?? softViolation(cur.state, incoming) ?? galoNftViolation(cur.state, incoming) ?? guardRentals(cur.state, incoming) ?? (locked ? economyViolation(cur.state, incoming) : null)
      if (violation) {
        console.warn(`[save] recusado (${violation}) para ${u.email}`)
        throw new HttpError(422, t('Algo no seu progresso não bate com o servidor. Recarregando.'), cur)
      }
      // VIP só é dado pelo servidor
      incoming.vip = cur.state.vip
      // Apostas são do servidor: o navegador não mexe nelas
      incoming.bets = cur.state.bets
      incoming.card = cur.state.card
      // Créditos de NFT são do servidor
      incoming.mintable = cur.state.mintable
      // 🎁 Garantia de drop é do servidor
      incoming.dropPity = cur.state.dropPity
      // Passe da Temporada: premium e resgates são do servidor; XP limitado por dia
      incoming.pass = locked ? currentPass(cur.state) : mergeClientPass(cur.state, incoming, (gain) => guardDaily(u.id, 'px', gain, PASS_DAILY_XP))
      // Ofertas relâmpago e recargas de energia são do servidor
      incoming.offers = cur.state.offers
      incoming.refills = cur.state.refills
      // Ninho do cruzamento é do servidor
      incoming.nest = cur.state.nest
      // 🏟️ Troféus de torneio são do servidor
      incoming.trophies = cur.state.trophies
      // Galo NFT e nº de cruzamentos de cada galo são do servidor
      keepRoosterServerFields(cur.state, incoming)
      // 🎟️ Fichas: só sobem o que dá para ganhar jogando (bônus diário e vitórias na Arena)
      incoming.fichas = locked ? (cur.state.fichas ?? 0) : plausibleChips(u.id, cur.state, incoming)
      // Prêmios de apostas resolvidas entram aqui; o navegador aplica o mesmo crédito no estado dele
      const credit = takeCredits(u.id)
      writeSave(u.id, credit ? applyBetCredit(incoming, credit) : incoming, cur.rev + 1)
      return json(res, 200, { rev: cur.rev + 1, credit })
    }
    if (path === '/api/save' && method === 'DELETE') {
      const u = needUser(req)
      db.prepare('DELETE FROM saves WHERE user_id = ?').run(u.id)
      return json(res, 200, { ok: true })
    }

    // ----- Desafios entre jogadores -----
    if (path.startsWith('/api/pvp/')) {
      const u = needUser(req)
      if (path !== '/api/pvp/poll') blockIfMaintenance(u)
      const body = method === 'POST' ? await readBody(req) : {}
      const out = handlePvp(path, method, url, body, u)
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- 🔑 Aluguel de galos na Feira (server/aluguel.ts) -----
    if (path === '/api/aluguel' || path.startsWith('/api/aluguel/')) {
      const u = needUser(req)
      if (method === 'POST') {
        blockIfMaintenance(u)
        if (limited(`aluguel:${u.id}`, 20, 60_000)) throw new HttpError(429, t('Muitas operações seguidas. Espere um pouco.'))
      } else if (limited(`aluguel-get:${u.id}`, 60, 60_000)) throw new HttpError(429, t('Muitas operações seguidas. Espere um pouco.'))
      const body = method === 'POST' ? await readBody(req) : {}
      const out = handleAluguel(path, method, body, u)
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- 🏪 Feira entre jogadores (server/feira.ts) -----
    if (path === '/api/feira' || path.startsWith('/api/feira/')) {
      const u = needUser(req)
      if (method === 'POST') {
        blockIfMaintenance(u)
        if (limited(`feira:${u.id}`, 20, 60_000)) throw new HttpError(429, t('Muitas operações seguidas. Espere um pouco.'))
      } else if (limited(`feira-get:${u.id}`, 60, 60_000)) throw new HttpError(429, t('Muitas operações seguidas. Espere um pouco.'))
      const body = method === 'POST' ? await readBody(req) : {}
      const out = handleFeira(path, method, url, body, u)
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- Apostas na agenda de lutas -----
    if (path.startsWith('/api/bets')) {
      const u = needUser(req)
      if (method === 'POST') {
        blockIfMaintenance(u)
        if (limited(`bets:${u.id}`, 30, 60_000)) throw new HttpError(429, t('Muitas apostas seguidas. Espere um pouco.'))
      }
      const body = method === 'POST' ? await readBody(req) : {}
      const out = handleBets(path, method, body, u.id)
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- 💵 Depósito USDC → ovos (server/deposito.ts) -----
    if (path === '/api/web3/deposit' || path === '/api/web3/deposit-eggs' || path === '/api/web3/test-usdc') {
      const u = needUser(req)
      if (method === 'POST') {
        blockIfMaintenance(u)
        assertVerified(u)
      }
      const body = method === 'POST' ? await readBody(req) : {}
      const out = await handleDeposito(path, method, body, u)
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- Carteira cripto, NFTs e mercado (server/web3.ts) -----
    if (path.startsWith('/api/web3') || path.startsWith('/api/market') || path.startsWith('/api/nft/')) {
      const u = path.startsWith('/api/nft/') ? null : needUser(req)
      if (u && method === 'POST') {
        blockIfMaintenance(u)
        assertVerified(u)
      }
      const body = method === 'POST' ? await readBody(req) : {}
      const out = await handleWeb3(path, method, body, u)
      if (out && 'svg' in out) {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", ...baseHeaders() })
        return res.end(out.svg)
      }
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- 🏟️ Torneios (server/torneios.ts) -----
    if (path === '/api/torneios' || path.startsWith('/api/torneios/')) {
      const u = needUser(req)
      if (method === 'POST') {
        blockIfMaintenance(u)
        if (limited(`torneio:${u.id}`, 20, 60_000)) throw new HttpError(429, t('Muitas operações seguidas. Espere um pouco.'))
      }
      const body = method === 'POST' ? await readBody(req) : {}
      const out = handleTorneios(path, method, body, u)
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- Ranking de galinheiros e vitrine (server/criacao.ts) -----
    if (path === '/api/ranking' || path.startsWith('/api/players/')) {
      const out = handleCriacao(path, method, needUser(req))
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- 🎁 Drops da Arena (server/drops.ts) -----
    if (path.startsWith('/api/drops/')) {
      const out = handleDrops(path, method, needUser(req))
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- 🌽 Arena no servidor (server/economia.ts) -----
    if (path.startsWith('/api/arena/')) {
      const u = needUser(req)
      if (method === 'POST') blockIfMaintenance(u)
      const body = method === 'POST' ? await readBody(req) : {}
      const out = handleEconomia(path, method, url, body, u, reqLang(req))
      if (out) return json(res, out.status ?? 200, out.body)
    }

    // ----- Loja (gastos de ovos e itens premium) -----
    if (path === '/api/shop' && method === 'POST') {
      const u = needUser(req)
      blockIfMaintenance(u)
      const b = await readBody(req)
      const cur = loadSave(u.id)
      if (!cur) throw new HttpError(409, t('Sem galinheiro'), { rev: 0, state: null })
      try {
        const op = b as unknown as ShopOp
        // Edição limitada: consome o estoque global junto com a compra (server/ofertas.ts)
        const r = withStock(op, () => {
          const r = runShop(cur.state, op)
          writeSave(u.id, r.state, cur.rev + 1)
          return r
        })
        afterShop(u.id, op, r.value)
        return json(res, 200, { rev: cur.rev + 1, state: r.state, value: r.value ?? null })
      } catch (e) {
        if (e instanceof ShopError) throw new HttpError(400, e.message)
        throw e
      }
    }

    // ----- Ofertas: estoque limitado, primeira compra, métricas (server/ofertas.ts) -----
    if (path === '/api/limited' || path.startsWith('/api/offers')) {
      const u = path === '/api/limited' ? null : needUser(req)
      const body = method === 'PUT' ? await readBody(req) : {}
      const out = handleOfertas(path, method, url, body, u)
      if (out) return json(res, 200, out)
    }

    // ----- Onboarding grátis -----
    if (path === '/api/onboarding/free' && method === 'POST') {
      const u = needUser(req)
      const b = await readBody(req)
      if (loadSave(u.id)) throw new HttpError(409, t('Você já tem um galinheiro'))
      const state = withLang(reqLang(req), () => newGame(u.name, String(b.avatar ?? '🧑‍🌾').slice(0, 8), 'livre', { stars: 1, roosterName: t('Galo Livre') }))
      state.ovos = 10
      state.milho = 1500
      state.tools = {}
      writeSave(u.id, state, 1)
      return json(res, 201, { rev: 1, state })
    }

    // ----- Checkout -----
    if (path === '/api/checkout' && method === 'POST') {
      const u = needUser(req)
      const b = await readBody(req)
      blockIfMaintenance(u)
      assertVerified(u)
      if (limited(`checkout:${u.id}`, 10, 600_000)) throw new HttpError(429, t('Muitos pedidos seguidos. Espere alguns minutos.'))
      const sku = effectiveSku(String(b.sku))
      if (!sku || !sku.active) throw new HttpError(404, t('Produto indisponível no momento'))
      if (sku.kind !== 'starter' && !loadSave(u.id)) throw new HttpError(409, t('Crie seu galinheiro antes de comprar'))
      if (sku.oncePerUser && db.prepare("SELECT 1 FROM orders WHERE user_id = ? AND sku = ? AND status = 'pago'").get(u.id, sku.id)) throw new HttpError(409, t('Esse pacote só pode ser comprado uma vez'))
      if (sku.kind === 'pass' && hasPassPremium(loadSave(u.id)?.state)) throw new HttpError(409, t('Você já tem o Passe Premium desta temporada.'))

      // Modo MVP: paga com o crédito de teste, entrega na hora
      if (b.method === 'credito') {
        if (!live.mvp.on) throw new HttpError(400, t('O crédito de teste não está ativo.'))
        const id = randomUUID()
        const now = Date.now()
        db.exec('BEGIN')
        try {
          const debit = db.prepare('UPDATE users SET mvp_credit_cents = mvp_credit_cents - ? WHERE id = ? AND mvp_credit_cents >= ?').run(sku.priceCents, u.id, sku.priceCents)
          if (!debit.changes) throw new HttpError(402, t('Crédito de teste insuficiente.'))
          db.prepare("INSERT INTO orders (id, user_id, sku, amount_cents, method, provider, status, created_at, paid_at) VALUES (?, ?, ?, ?, 'credito', 'credito', 'pendente', ?, ?)").run(id, u.id, sku.id, sku.priceCents, now, now)
          db.exec('COMMIT')
        } catch (e) {
          db.exec('ROLLBACK')
          throw e
        }
        try {
          const order = fulfill(id)!
          return json(res, 201, { order: publicOrder(order) })
        } catch (e) {
          // Entrega falhou: devolve o crédito
          db.prepare('UPDATE users SET mvp_credit_cents = mvp_credit_cents + ? WHERE id = ?').run(sku.priceCents, u.id)
          db.prepare("UPDATE orders SET status = 'recusado' WHERE id = ?").run(id)
          throw e
        }
      }

      if (!paymentsLive()) throw new HttpError(503, t('Pix e cartão ainda não estão disponíveis. Use seu crédito de teste!'))
      const payMethod = b.method === 'cartao' ? 'cartao' : 'pix'
      const spent = spentThisMonth(u.id)
      if (spent + sku.priceCents > u.monthly_limit_cents)
        throw new HttpError(402, t('Essa compra passa do seu limite mensal de R$ {valor}. Você pode ajustar o limite no Perfil.', { valor: (u.monthly_limit_cents / 100).toFixed(2) }))
      const order: OrderRow = {
        id: randomUUID(),
        user_id: u.id,
        sku: sku.id,
        amount_cents: sku.priceCents,
        method: payMethod,
        provider: providerName(),
        provider_ref: null,
        status: 'pendente',
        pix_code: null,
        pix_qr: null,
        checkout_url: null,
        created_at: Date.now(),
        paid_at: null,
        fulfilled_at: null,
      }
      // Nome do item na tela do Mercado Pago no idioma do comprador
      const pay = await startPayment(order, { ...sku, name: tx(sku.name, reqLang(req)) }, u)
      order.provider_ref = pay.providerRef
      order.pix_code = pay.pixCode ?? null
      order.pix_qr = pay.pixQr ?? null
      order.checkout_url = pay.checkoutUrl ?? null
      db.prepare('INSERT INTO orders (id, user_id, sku, amount_cents, method, provider, provider_ref, status, pix_code, pix_qr, checkout_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        order.id, order.user_id, order.sku, order.amount_cents, order.method, order.provider, order.provider_ref, order.status, order.pix_code, order.pix_qr, order.checkout_url, order.created_at,
      )
      return json(res, 201, { order: publicOrder(order) })
    }

    if (path === '/api/orders' && method === 'GET') {
      const u = needUser(req)
      const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(u.id) as unknown as OrderRow[]
      return json(res, 200, { orders: rows.map(publicOrder) })
    }

    const orderMatch = path.match(/^\/api\/orders\/([\w-]+)(\/simulate)?$/)
    if (orderMatch) {
      const u = needUser(req)
      let order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderMatch[1], u.id) as unknown as OrderRow | undefined
      if (!order) throw new HttpError(404, t('Pedido não encontrado'))
      if (orderMatch[2] && method === 'POST') {
        if (order.provider !== 'sandbox' || !sandboxAllowed()) throw new HttpError(403, t('Simulação só existe no modo de teste'))
        order = fulfill(order.id)!
      } else if (method === 'GET' && order.status === 'pendente') {
        order = await recheckOrder(order)
      }
      return json(res, 200, { order: publicOrder(order) })
    }

    // ----- Webhook Mercado Pago -----
    if (path === '/api/webhooks/mercadopago' && method === 'POST') {
      if (limited(`webhook:${ip}`, 600, 60_000)) return tooMany(res)
      if (isProd() && !process.env.MP_WEBHOOK_SECRET) {
        console.error('[webhook] MP_WEBHOOK_SECRET não configurado: notificação ignorada (o polling continua confirmando pagamentos)')
        return json(res, 200, { ok: true })
      }
      const b = await readBody(req)
      const info = await parseMpWebhook(req.headers, url, b).catch((e) => {
        console.warn('[webhook]', e.message)
        return null
      })
      if (info?.orderId && info.status === 'pago') fulfill(info.orderId, info.amountCents)
      return json(res, 200, { ok: true })
    }

    // ----- Limite mensal -----
    if (path === '/api/limits' && method === 'PUT') {
      const u = needUser(req)
      const b = await readBody(req)
      const cents = Number(b.monthlyCents)
      if (!SPEND_LIMITS.includes(cents)) throw new HttpError(400, t('Limite inválido'))
      if (cents <= u.monthly_limit_cents) {
        db.prepare('UPDATE users SET monthly_limit_cents = ?, pending_limit_cents = NULL, pending_limit_at = NULL WHERE id = ?').run(cents, u.id)
      } else {
        // Aumentos só valem depois de 24h (proteção contra impulso)
        db.prepare('UPDATE users SET pending_limit_cents = ?, pending_limit_at = ? WHERE id = ?').run(cents, Date.now() + 864e5, u.id)
      }
      const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id) as unknown as UserRow
      return json(res, 200, { user: publicUser(fresh) })
    }

    throw new HttpError(404, t('Rota não encontrada'))
  } catch (e) {
    if (e instanceof SaveConflict) return json(res, 409, { error: t('Seu jogo mudou em outra aba. Recarregue e tente de novo.') })
    if (e instanceof HttpError) return json(res, e.status, { error: e.message, ...e.extra })
    if (e instanceof PvpError) return json(res, 400, { error: e.message })
    if (e instanceof FeiraError) return json(res, e.status, { error: e.message })
    if (e instanceof AluguelError) return json(res, e.status, { error: e.message })
    if (e instanceof BetError) return json(res, 400, { error: e.message })
    if (e instanceof AdminError) return json(res, e.status, { error: e.message })
    if (e instanceof CriacaoError) return json(res, e.status, { error: e.message })
    if (e instanceof Web3Error) return json(res, e.status, { error: e.message, ...e.extra })
    if (e instanceof OfertasError) return json(res, e.status, { error: e.message })
    if (e instanceof EconomiaError) return json(res, e.status, { error: e.message, ...e.extra })
    if (e instanceof TorneioError) return json(res, e.status, { error: e.message })
    console.error('[api]', e)
    return json(res, 500, { error: t('Erro interno. Tente de novo.') })
  }
}
