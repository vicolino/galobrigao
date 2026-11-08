// Rotas do backoffice (/api/admin/*). Só para e-mails listados em ADMIN_EMAILS.
import { DEFAULT_CONFIG, type AppConfig } from '../src/game/config'
import { SKU_BY_ID } from '../src/game/catalog'
import { BREED_BY_ID, RAROS_SKINS } from '../src/game/data'
import { uid } from '../src/game/rooster'
import { loadConfig, saveConfig, validateConfig } from './config'
import { getDb, type OrderRow, type UserRow } from './db'
import { loadSave, writeSave } from './saves'
import { t } from '../src/i18n'
import { setKyc, walletAddress, web3Overview } from './web3'
import { depositStats } from './deposito'
import { feiraAdmin } from './feira'
import { creditTreasury, treasuryBalance, treasuryLedger, treasuryStats } from './treasury'
import { createEdition, deleteEdition, listEditions, setEditionActive } from './editions'
import { liveUsdcBrl, maybeRefreshUsdcBrl } from './usdcRate'

export class AdminError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Administrador = papel gravado no banco (dado só pelo comando `npm run admin -- add email`). */
export function isAdmin(u: Pick<UserRow, 'role'> | null | undefined) {
  return u?.role === 'admin'
}

const db = () => getDb()
const DAY = 864e5
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function audit(admin: UserRow, action: string, target: string | null, detail: unknown) {
  db().prepare('INSERT INTO admin_log (at, admin_email, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(Date.now(), admin.email, action, target, detail == null ? null : JSON.stringify(detail))
}

interface Deps {
  fulfill: (orderId: string, paidAmountCents?: number) => OrderRow | undefined
  recheck: (order: OrderRow) => Promise<OrderRow>
}

// ---------- Métricas ----------

function overview(days: number) {
  const now = Date.now()
  const todayStart = new Date(dayKey(now)).getTime()
  const start = todayStart - (days - 1) * DAY
  const prevStart = start - days * DAY
  const keys = Array.from({ length: days }, (_, i) => dayKey(start + i * DAY))

  const users = db().prepare('SELECT id, created_at FROM users').all() as { id: string; created_at: number }[]
  const creditSpent = (db().prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM orders WHERE status = 'pago' AND provider = 'credito' AND paid_at >= ?").get(start) as { s: number }).s
  // Receita = só dinheiro de verdade (compras com crédito MVP ficam de fora)
  const paid = db().prepare("SELECT user_id, sku, method, amount_cents, paid_at FROM orders WHERE status = 'pago' AND provider != 'credito'").all() as {
    user_id: string
    sku: string
    method: string
    amount_cents: number
    paid_at: number
  }[]
  const act = db().prepare('SELECT day, COUNT(*) AS n FROM activity WHERE day >= ? GROUP BY day').all(dayKey(prevStart)) as { day: string; n: number }[]
  const pvp = db().prepare("SELECT resolved_at FROM challenges WHERE status = 'aceito' AND resolved_at >= ?").all(prevStart) as { resolved_at: number }[]
  const withSave = (db().prepare('SELECT COUNT(*) AS n FROM saves').get() as { n: number }).n
  const pending = (db().prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pendente'").get() as { n: number }).n
  const banned = (db().prepare('SELECT COUNT(*) AS n FROM users WHERE banned_at IS NOT NULL').get() as { n: number }).n
  const online = (db().prepare('SELECT COUNT(*) AS n FROM presence WHERE last_seen > ?').get(now - 45_000) as { n: number }).n
  const mau = (db().prepare('SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE day >= ?').get(dayKey(todayStart - 29 * DAY)) as { n: number }).n

  const actBy = new Map(act.map((a) => [a.day, a.n]))
  const series = keys.map((k) => ({ day: k, signups: 0, active: actBy.get(k) ?? 0, revenueCents: 0, orders: 0, pvp: 0 }))
  const idx = new Map(keys.map((k, i) => [k, i]))
  for (const u of users) {
    const i = idx.get(dayKey(u.created_at))
    if (i !== undefined) series[i].signups++
  }
  for (const o of paid) {
    const i = idx.get(dayKey(o.paid_at))
    if (i !== undefined) {
      series[i].revenueCents += o.amount_cents
      series[i].orders++
    }
  }
  for (const c of pvp) {
    const i = idx.get(dayKey(c.resolved_at))
    if (i !== undefined) series[i].pvp++
  }

  const inWin = (t: number) => t >= start
  const inPrev = (t: number) => t >= prevStart && t < start
  const sum = (arr: typeof paid) => arr.reduce((a, o) => a + o.amount_cents, 0)
  const paidWin = paid.filter((o) => inWin(o.paid_at))
  const paidPrev = paid.filter((o) => inPrev(o.paid_at))
  const payersWin = new Set(paidWin.map((o) => o.user_id))
  const payersAll = new Set(paid.map((o) => o.user_id))
  const prevActive = act.filter((a) => a.day < keys[0]).reduce((s, a) => s + a.n, 0) / days
  const curActive = series.reduce((s, d) => s + d.active, 0) / days

  const bySku: Record<string, { name: string; count: number; cents: number }> = {}
  const byMethod: Record<string, { count: number; cents: number }> = {}
  for (const o of paidWin) {
    bySku[o.sku] ??= { name: SKU_BY_ID[o.sku]?.name ?? o.sku, count: 0, cents: 0 }
    bySku[o.sku].count++
    bySku[o.sku].cents += o.amount_cents
    byMethod[o.method] ??= { count: 0, cents: 0 }
    byMethod[o.method].count++
    byMethod[o.method].cents += o.amount_cents
  }

  return {
    days,
    kpis: {
      totalUsers: users.length,
      newUsers: users.filter((u) => inWin(u.created_at)).length,
      newUsersPrev: users.filter((u) => inPrev(u.created_at)).length,
      dauToday: actBy.get(dayKey(now)) ?? 0,
      avgDau: Math.round(curActive * 10) / 10,
      avgDauPrev: Math.round(prevActive * 10) / 10,
      mau,
      online,
      revenueCents: sum(paidWin),
      revenuePrevCents: sum(paidPrev),
      revenueTodayCents: sum(paid.filter((o) => o.paid_at >= todayStart)),
      revenueAllCents: sum(paid),
      creditSpentCents: creditSpent,
      orders: paidWin.length,
      pendingOrders: pending,
      payingUsersWin: payersWin.size,
      payingUsersAll: payersAll.size,
      arppuCents: payersWin.size ? Math.round(sum(paidWin) / payersWin.size) : 0,
      conversion: users.length ? payersAll.size / users.length : 0,
      pvp: series.reduce((s, d) => s + d.pvp, 0),
      banned,
    },
    treasury: treasuryStats(),
    funnel: [
      { step: t('Criaram conta'), n: users.length },
      { step: t('Escolheram o primeiro galo'), n: withSave },
      { step: t('Compraram algo'), n: payersAll.size },
      { step: t('Compraram 2+ vezes'), n: [...payersAll].filter((id) => paid.filter((o) => o.user_id === id).length >= 2).length },
    ],
    series,
    bySku: Object.entries(bySku)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.cents - a.cents),
    byMethod,
    origins: origins(now),
  }
}

/** Origem dos cadastros (UTM): contas por fonte e campanha nos últimos 7 / 30 dias e no total. */
function origins(now: number) {
  return db()
    .prepare(
      `SELECT utm_source AS source, utm_campaign AS campaign,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS d7,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS d30,
         COUNT(*) AS total
       FROM users GROUP BY utm_source, utm_campaign ORDER BY total DESC LIMIT 100`,
    )
    .all(now - 7 * DAY, now - 30 * DAY) as { source: string | null; campaign: string | null; d7: number; d30: number; total: number }[]
}

/** Atividade do jogo: engajamento diário (jogadores, lutas, apostas, drops, cadastros). */
function activity(days: number) {
  const now = Date.now()
  const todayStart = new Date(dayKey(now)).getTime()
  const start = todayStart - (days - 1) * DAY
  const keys = Array.from({ length: days }, (_, i) => dayKey(start + i * DAY))
  const idx = new Map(keys.map((k, i) => [k, i]))
  const series = keys.map((k) => ({ day: k, active: 0, signups: 0, arena: 0, pvp: 0, bets: 0, drops: 0 }))

  const put = (k: string, field: 'active' | 'signups' | 'arena' | 'pvp' | 'bets' | 'drops', n = 1) => {
    const i = idx.get(k)
    if (i !== undefined) series[i][field] += n
  }

  // Jogadores ativos por dia (tabela activity: 1 linha por usuário/dia)
  for (const a of db().prepare('SELECT day, COUNT(*) AS n FROM activity WHERE day >= ? GROUP BY day').all(keys[0]) as { day: string; n: number }[]) put(a.day, 'active', a.n)
  // Novos cadastros
  for (const u of db().prepare('SELECT created_at FROM users WHERE created_at >= ?').all(start) as { created_at: number }[]) put(dayKey(u.created_at), 'signups')
  // Lutas da Arena (contador diário)
  for (const c of db().prepare("SELECT day, n FROM daily_counters WHERE key = 'arena' AND day >= ?").all(keys[0]) as { day: string; n: number }[]) put(c.day, 'arena', c.n)
  // Lutas PvP (desafios aceitos e resolvidos)
  for (const c of db().prepare("SELECT resolved_at FROM challenges WHERE status = 'aceito' AND resolved_at >= ?").all(start) as { resolved_at: number }[]) put(dayKey(c.resolved_at), 'pvp')
  // Apostas na casa
  for (const b of db().prepare('SELECT created_at FROM house_bets WHERE created_at >= ?').all(start) as { created_at: number }[]) put(dayKey(b.created_at), 'bets')
  // Drops raros
  for (const d of db().prepare('SELECT created_at FROM drops WHERE created_at >= ?').all(start) as { created_at: number }[]) put(dayKey(d.created_at), 'drops')

  // Total de lutas desde o começo: Arena (acumulado em stats.fights de cada conta) + PvP (desafios aceitos).
  const arenaAllTime = (db().prepare("SELECT COALESCE(SUM(json_extract(data, '$.stats.fights')), 0) AS n FROM saves").get() as { n: number }).n
  const pvpAllTime = (db().prepare("SELECT COUNT(*) AS n FROM challenges WHERE status = 'aceito'").get() as { n: number }).n
  const online = (db().prepare('SELECT COUNT(*) AS n FROM presence WHERE last_seen > ?').get(now - 45_000) as { n: number }).n
  const totalUsers = (db().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
  const mau = (db().prepare('SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE day >= ?').get(dayKey(todayStart - 29 * DAY)) as { n: number }).n
  const wau = (db().prepare('SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE day >= ?').get(dayKey(todayStart - 6 * DAY)) as { n: number }).n

  const today = series[series.length - 1]
  const last7 = series.slice(-7)
  const sum = (f: 'arena' | 'pvp' | 'bets' | 'drops' | 'signups') => series.reduce((s, d) => s + d[f], 0)
  const sum7 = (f: 'arena' | 'pvp' | 'bets' | 'drops' | 'signups') => last7.reduce((s, d) => s + d[f], 0)

  return {
    days,
    series,
    kpis: {
      online,
      totalUsers,
      dauToday: today.active,
      wau,
      mau,
      signupsToday: today.signups,
      signups7: sum7('signups'),
      fightsToday: today.arena + today.pvp,
      fights7: sum7('arena') + sum7('pvp'),
      fightsAll: sum('arena') + sum('pvp'),
      arenaAll: sum('arena'),
      pvpAll: sum('pvp'),
      fightsAllTime: arenaAllTime + pvpAllTime,
      arenaAllTime,
      pvpAllTime,
      betsToday: today.bets,
      bets7: sum7('bets'),
      dropsToday: today.drops,
      drops7: sum7('drops'),
      dropsAll: sum('drops'),
      signupsAll: sum('signups'),
    },
  }
}

// ---------- Rotas ----------

export async function handleAdmin(path: string, method: string, url: URL, body: Record<string, unknown>, admin: UserRow, deps: Deps): Promise<unknown | null> {
  if (!isAdmin(admin)) throw new AdminError(403, t('Acesso só para administradores'))
  loadConfig()

  if (path === '/api/admin/overview' && method === 'GET') {
    const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30
    return overview(days)
  }

  if (path === '/api/admin/activity' && method === 'GET') {
    const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30
    return activity(days)
  }

  // Web3 (carteiras, NFTs, fila de KYC)
  if (path === '/api/admin/web3' && method === 'GET') return { ...web3Overview(), deposits: depositStats() }

  // Feira entre jogadores (só leitura: últimas trocas e taxas) + carteira do sistema
  if (path === '/api/admin/feira' && method === 'GET') return { ...feiraAdmin(), system: treasuryStats() }

  // Carteira do sistema: extrato completo (filtrável por fonte) + saldo e totais por fonte
  if (path === '/api/admin/treasury' && method === 'GET') {
    const source = url.searchParams.get('source') || undefined
    const limit = Number(url.searchParams.get('limit')) || 200
    return treasuryLedger({ source, limit })
  }

  // Retirada da carteira (ovo → USDC): registro contábil. NÃO move USDC on-chain — só debita o
  // saldo em ovos do sistema e guarda o valor em USDC + motivo. O USDC real sai da carteira on-chain.
  if (path === '/api/admin/treasury/withdraw' && method === 'POST') {
    const ovos = Math.round(Number(body.ovos))
    const usd = Number(body.usd)
    const reason = String(body.reason ?? '').trim().slice(0, 200)
    if (!reason) throw new AdminError(400, t('Informe o motivo da retirada'))
    if (!Number.isFinite(ovos) || ovos <= 0) throw new AdminError(400, t('Informe quantos ovos retirar.'))
    if (!Number.isFinite(usd) || usd < 0) throw new AdminError(400, t('Valor em USDC inválido'))
    const saldo = treasuryBalance().ovos
    if (ovos > saldo) throw new AdminError(400, t('A carteira só tem 🥚 {n}.', { n: saldo }))
    const detail = t('USDC {usd} — {motivo}', { usd: usd.toFixed(2), motivo: reason })
    creditTreasury('saque', 'ovo', -ovos, null, detail)
    audit(admin, 'carteira_retirada', null, { ovos, usd, reason })
    return { ok: true, ovos: treasuryBalance().ovos }
  }

  // Jogadores
  if (path === '/api/admin/users' && method === 'GET') {
    const q = `%${(url.searchParams.get('q') ?? '').trim().toLowerCase()}%`
    const filter = url.searchParams.get('filter') ?? 'todos'
    const where = filter === 'pagantes' ? 'AND COALESCE(o.spent, 0) > 0' : filter === 'bloqueados' ? 'AND u.banned_at IS NOT NULL' : ''
    const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get('size')) || 25))
    const from = `FROM users u
         LEFT JOIN presence p ON p.user_id = u.id
         LEFT JOIN (SELECT user_id, SUM(amount_cents) AS spent, COUNT(*) AS n FROM orders WHERE status = 'pago' GROUP BY user_id) o ON o.user_id = u.id
         WHERE (lower(u.email) LIKE ? OR lower(u.name) LIKE ?) ${where}`
    const total = (db().prepare(`SELECT COUNT(*) AS n ${from}`).get(q, q) as { n: number }).n
    const pages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(pages, Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1)))
    // Ordenação por coluna. Colunas em SQL vão direto no ORDER BY; as derivadas do save (galos/nível/ovos)
    // são calculadas para todo o conjunto filtrado e ordenadas em memória (base de jogadores pequena, uso só do admin).
    const dir = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC'
    const sort = url.searchParams.get('sort') ?? 'cadastro'
    const SQL_SORT: Record<string, string> = {
      jogador: 'lower(u.name)',
      cadastro: 'u.created_at',
      origem: 'lower(u.utm_source) IS NULL, lower(u.utm_source)',
      acesso: 'COALESCE(p.last_seen, 0)',
      gastou: 'COALESCE(o.spent, 0)',
    }
    const SAVE_SORT: Record<string, (r: { roosters: number; maxLevel: number; ovos: number }) => number> = {
      galos: (r) => r.roosters,
      nivel: (r) => r.maxLevel,
      ovos: (r) => r.ovos,
    }
    const cols = `u.id, u.email, u.name, u.created_at, u.banned_at, u.utm_source, u.utm_campaign, p.last_seen, COALESCE(o.spent, 0) AS spent, COALESCE(o.n, 0) AS orders`
    const enrich = (r: Record<string, unknown>) => {
      const save = loadSave(String(r.id))
      const levels = save?.state.roosters.map((x) => x.level) ?? []
      return { ...r, roosters: save?.state.roosters.length ?? 0, maxLevel: levels.length ? Math.max(...levels) : 0, ovos: save?.state.ovos ?? 0, milho: save?.state.milho ?? 0 }
    }
    const saveSort = SAVE_SORT[sort]
    if (saveSort) {
      const all = db().prepare(`SELECT ${cols} ${from} ORDER BY u.created_at DESC`).all(q, q) as Record<string, unknown>[]
      const enriched = all.map(enrich)
      enriched.sort((a, b) => (dir === 'ASC' ? saveSort(a) - saveSort(b) : saveSort(b) - saveSort(a)))
      return { total, page, pages, pageSize, users: enriched.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize) }
    }
    const orderBy = SQL_SORT[sort] ?? SQL_SORT.cadastro
    const rows = db()
      .prepare(`SELECT ${cols} ${from} ORDER BY ${orderBy} ${dir} LIMIT ? OFFSET ?`)
      .all(q, q, pageSize, (page - 1) * pageSize) as Record<string, unknown>[]
    return { total, page, pages, pageSize, users: rows.map(enrich) }
  }

  const userMatch = path.match(/^\/api\/admin\/users\/([\w-]+)(\/grant|\/ban|\/kyc)?$/)
  if (userMatch) {
    const id = userMatch[1]
    const u = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined
    if (!u) throw new AdminError(404, t('Jogador não encontrado'))

    if (!userMatch[2] && method === 'GET') {
      const save = loadSave(id)
      const orders = db().prepare('SELECT id, sku, amount_cents, method, status, created_at, paid_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(id)
      const pvp = db().prepare("SELECT COUNT(*) AS n FROM challenges WHERE status = 'aceito' AND (from_user = ? OR to_user = ?)").get(id, id) as { n: number }
      const days = db().prepare('SELECT COUNT(*) AS n FROM activity WHERE user_id = ?').get(id) as { n: number }
      const lastSeen = db().prepare('SELECT last_seen FROM presence WHERE user_id = ?').get(id) as { last_seen: number } | undefined
      const log = db().prepare('SELECT at, admin_email, action, detail FROM admin_log WHERE target = ? ORDER BY at DESC LIMIT 20').all(id)
      const s = save?.state
      return {
        user: { id: u.id, email: u.email, name: u.name, mvpCreditCents: u.mvp_credit_cents ?? 0, createdAt: u.created_at, bannedAt: u.banned_at, banReason: u.ban_reason, monthlyLimitCents: u.monthly_limit_cents, lastSeen: lastSeen?.last_seen ?? null, kyc: u.kyc_status ?? 'none', wallet: walletAddress(id) },
        game: s
          ? {
              milho: s.milho,
              ovos: s.ovos,
              vipUntil: s.vip.until,
              skins: s.skins,
              leaguePoints: s.league.points,
              stats: s.stats,
              roosters: s.roosters.map((r) => ({ id: r.id, name: r.name, breed: BREED_BY_ID[r.breedId]?.name ?? r.breedId, level: r.level, stars: r.stars, wins: r.wins, losses: r.losses, skin: r.skin })),
              history: s.history.slice(0, 15),
            }
          : null,
        orders,
        pvpFights: pvp.n,
        activeDays: days.n,
        log,
      }
    }

    if (userMatch[2] === '/grant' && method === 'POST') {
      const ovos = Math.round(Number(body.ovos ?? 0))
      const milho = Math.round(Number(body.milho ?? 0))
      const reason = String(body.reason ?? '').trim()
      const creditCents = Math.round(Number(body.creditCents ?? 0))
      if (!reason) throw new AdminError(400, t('Informe o motivo'))
      if (!Number.isFinite(creditCents) || Math.abs(creditCents) > 1_000_000) throw new AdminError(400, t('Crédito inválido'))
      if (creditCents) db().prepare('UPDATE users SET mvp_credit_cents = MAX(0, mvp_credit_cents + ?) WHERE id = ?').run(creditCents, id)
      if (!Number.isFinite(ovos) || !Number.isFinite(milho) || Math.abs(ovos) > 10000 || Math.abs(milho) > 1_000_000) throw new AdminError(400, t('Valores inválidos'))
      const save = loadSave(id)
      if (!save) {
        if (creditCents && !ovos && !milho) {
          audit(admin, 'ajuste_saldo', id, { creditCents, reason })
          return { ok: true, ovos: 0, milho: 0 }
        }
        throw new AdminError(409, t('Jogador ainda não tem galinheiro'))
      }
      const s = save.state
      const next = {
        ...s,
        ovos: Math.max(0, s.ovos + ovos),
        milho: Math.max(0, s.milho + milho),
        history: [{ id: uid(), at: Date.now(), text: t('Ajuste do suporte: {motivo}', { motivo: reason }), milho, ovo: ovos }, ...s.history].slice(0, 80),
      }
      writeSave(id, next, save.rev + 1)
      audit(admin, 'ajuste_saldo', id, { ovos, milho, creditCents, reason })
      return { ok: true, ovos: next.ovos, milho: next.milho }
    }

    if (userMatch[2] === '/kyc' && method === 'POST') {
      const status = setKyc(id, body.status)
      audit(admin, 'kyc', id, { status })
      return { ok: true, kyc: status }
    }

    if (userMatch[2] === '/ban' && method === 'POST') {
      const ban = body.banned === true
      const reason = String(body.reason ?? '').trim().slice(0, 200)
      if (ban && !reason) throw new AdminError(400, t('Informe o motivo do bloqueio'))
      if (ban && isAdmin(u)) throw new AdminError(400, t('Não é possível bloquear um administrador'))
      db().prepare('UPDATE users SET banned_at = ?, ban_reason = ? WHERE id = ?').run(ban ? Date.now() : null, ban ? reason : null, id)
      if (ban) db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
      audit(admin, ban ? 'bloqueio' : 'desbloqueio', id, { reason })
      return { ok: true }
    }
  }

  // Pedidos
  if (path === '/api/admin/orders' && method === 'GET') {
    const status = url.searchParams.get('status') ?? ''
    const q = `%${(url.searchParams.get('q') ?? '').trim().toLowerCase()}%`
    const rows = db()
      .prepare(
        `SELECT o.id, o.sku, o.amount_cents, o.method, o.provider, o.status, o.created_at, o.paid_at, o.user_id, COALESCE(u.email, '(conta excluída)') AS email -- i18n-ok
         FROM orders o LEFT JOIN users u ON u.id = o.user_id
         WHERE (? = '' OR o.status = ?) AND (lower(COALESCE(u.email, '')) LIKE ? OR o.id LIKE ?)
         ORDER BY o.created_at DESC LIMIT 200`,
      )
      .all(status, status, q, q) as Record<string, unknown>[]
    return { orders: rows.map((r) => ({ ...r, name: SKU_BY_ID[String(r.sku)]?.name ?? r.sku })) }
  }

  const orderMatch = path.match(/^\/api\/admin\/orders\/([\w-]+)\/recheck$/)
  if (orderMatch && method === 'POST') {
    const o = db().prepare('SELECT * FROM orders WHERE id = ?').get(orderMatch[1]) as unknown as OrderRow | undefined
    if (!o) throw new AdminError(404, t('Pedido não encontrado'))
    const after = await deps.recheck(o)
    audit(admin, 'reconsultar_pedido', o.user_id, { order: o.id, antes: o.status, depois: after.status })
    return { status: after.status }
  }

  // Configuração
  if (path === '/api/admin/config' && method === 'GET') {
    const row = db().prepare("SELECT updated_at, updated_by FROM config WHERE key = 'app'").get() as { updated_at: number; updated_by: string } | undefined
    maybeRefreshUsdcBrl()
    return { config: loadConfig(), defaults: DEFAULT_CONFIG, updatedAt: row?.updated_at ?? null, updatedBy: row?.updated_by ?? null, usdcRate: liveUsdcBrl() }
  }
  if (path === '/api/admin/config' && method === 'PUT') {
    let cfg: AppConfig
    try {
      cfg = validateConfig(body.config as AppConfig)
    } catch (e) {
      throw new AdminError(400, (e as Error).message)
    }
    const before = loadConfig()
    saveConfig(cfg, admin.email)
    const changes: string[] = []
    const walk = (a: unknown, b: unknown, p: string) => {
      if (typeof a === 'object' && a && typeof b === 'object' && b) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], p ? `${p}.${k}` : k)
      } else if (a !== b) changes.push(`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
    }
    walk(before, cfg, '')
    if (changes.length) audit(admin, 'configuracao', null, changes)
    return { config: cfg, changes }
  }

  // 💎 Edições Limitadas de Raros
  if (path === '/api/admin/editions' && method === 'GET') {
    return { editions: listEditions(), collection: RAROS_SKINS.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, rarity: s.rarity })) }
  }
  if (path === '/api/admin/editions' && method === 'POST') {
    try {
      return createEdition(String(body.itemId ?? ''), Number(body.price), Number(body.supply), !!body.active)
    } catch (e) {
      throw new AdminError(400, e instanceof Error ? e.message : t('Dados inválidos'))
    }
  }
  const edMatch = path.match(/^\/api\/admin\/editions\/([\w-]+)$/)
  if (edMatch) {
    if (method === 'PUT') return setEditionActive(edMatch[1], !!body.active) ?? ((): never => { throw new AdminError(404, t('Edição não encontrada')) })()
    if (method === 'DELETE') {
      if (!deleteEdition(edMatch[1])) throw new AdminError(404, t('Edição não encontrada'))
      return { ok: true }
    }
  }

  // Auditoria
  if (path === '/api/admin/audit' && method === 'GET') {
    const rows = db().prepare('SELECT l.*, u.email AS target_email FROM admin_log l LEFT JOIN users u ON u.id = l.target ORDER BY l.at DESC LIMIT 200').all()
    return { log: rows }
  }

  return null
}
