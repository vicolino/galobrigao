// Rotas do backoffice (/api/admin/*). Só para e-mails listados em ADMIN_EMAILS.
import { DEFAULT_CONFIG, type AppConfig } from '../src/game/config'
import { SKU_BY_ID } from '../src/game/catalog'
import { BREED_BY_ID } from '../src/game/data'
import { uid } from '../src/game/rooster'
import { loadConfig, saveConfig, validateConfig } from './config'
import { getDb, type OrderRow, type UserRow } from './db'
import { loadSave, writeSave } from './saves'

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
  const paid = db().prepare("SELECT user_id, sku, method, amount_cents, paid_at FROM orders WHERE status = 'pago'").all() as {
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
      orders: paidWin.length,
      pendingOrders: pending,
      payingUsersWin: payersWin.size,
      payingUsersAll: payersAll.size,
      arppuCents: payersWin.size ? Math.round(sum(paidWin) / payersWin.size) : 0,
      conversion: users.length ? payersAll.size / users.length : 0,
      pvp: series.reduce((s, d) => s + d.pvp, 0),
      banned,
    },
    funnel: [
      { step: 'Criaram conta', n: users.length },
      { step: 'Escolheram o primeiro galo', n: withSave },
      { step: 'Compraram algo', n: payersAll.size },
      { step: 'Compraram 2+ vezes', n: [...payersAll].filter((id) => paid.filter((o) => o.user_id === id).length >= 2).length },
    ],
    series,
    bySku: Object.entries(bySku)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.cents - a.cents),
    byMethod,
  }
}

// ---------- Rotas ----------

export async function handleAdmin(path: string, method: string, url: URL, body: Record<string, unknown>, admin: UserRow, deps: Deps): Promise<unknown | null> {
  if (!isAdmin(admin)) throw new AdminError(403, 'Acesso só para administradores')
  loadConfig()

  if (path === '/api/admin/overview' && method === 'GET') {
    const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30
    return overview(days)
  }

  // Jogadores
  if (path === '/api/admin/users' && method === 'GET') {
    const q = `%${(url.searchParams.get('q') ?? '').trim().toLowerCase()}%`
    const filter = url.searchParams.get('filter') ?? 'todos'
    const where = filter === 'pagantes' ? 'AND COALESCE(o.spent, 0) > 0' : filter === 'bloqueados' ? 'AND u.banned_at IS NOT NULL' : ''
    const rows = db()
      .prepare(
        `SELECT u.id, u.email, u.name, u.created_at, u.banned_at, p.last_seen, COALESCE(o.spent, 0) AS spent, COALESCE(o.n, 0) AS orders
         FROM users u
         LEFT JOIN presence p ON p.user_id = u.id
         LEFT JOIN (SELECT user_id, SUM(amount_cents) AS spent, COUNT(*) AS n FROM orders WHERE status = 'pago' GROUP BY user_id) o ON o.user_id = u.id
         WHERE (lower(u.email) LIKE ? OR lower(u.name) LIKE ?) ${where}
         ORDER BY u.created_at DESC LIMIT 100`,
      )
      .all(q, q) as Record<string, unknown>[]
    return {
      users: rows.map((r) => {
        const save = loadSave(String(r.id))
        return { ...r, roosters: save?.state.roosters.length ?? 0, maxLevel: save ? Math.max(...save.state.roosters.map((x) => x.level)) : 0, ovos: save?.state.ovos ?? 0, milho: save?.state.milho ?? 0 }
      }),
    }
  }

  const userMatch = path.match(/^\/api\/admin\/users\/([\w-]+)(\/grant|\/ban)?$/)
  if (userMatch) {
    const id = userMatch[1]
    const u = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined
    if (!u) throw new AdminError(404, 'Jogador não encontrado')

    if (!userMatch[2] && method === 'GET') {
      const save = loadSave(id)
      const orders = db().prepare('SELECT id, sku, amount_cents, method, status, created_at, paid_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(id)
      const pvp = db().prepare("SELECT COUNT(*) AS n FROM challenges WHERE status = 'aceito' AND (from_user = ? OR to_user = ?)").get(id, id) as { n: number }
      const days = db().prepare('SELECT COUNT(*) AS n FROM activity WHERE user_id = ?').get(id) as { n: number }
      const lastSeen = db().prepare('SELECT last_seen FROM presence WHERE user_id = ?').get(id) as { last_seen: number } | undefined
      const log = db().prepare('SELECT at, admin_email, action, detail FROM admin_log WHERE target = ? ORDER BY at DESC LIMIT 20').all(id)
      const s = save?.state
      return {
        user: { id: u.id, email: u.email, name: u.name, createdAt: u.created_at, bannedAt: u.banned_at, banReason: u.ban_reason, monthlyLimitCents: u.monthly_limit_cents, lastSeen: lastSeen?.last_seen ?? null },
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
      if (!reason) throw new AdminError(400, 'Informe o motivo')
      if (!Number.isFinite(ovos) || !Number.isFinite(milho) || Math.abs(ovos) > 10000 || Math.abs(milho) > 1_000_000) throw new AdminError(400, 'Valores inválidos')
      const save = loadSave(id)
      if (!save) throw new AdminError(409, 'Jogador ainda não tem galinheiro')
      const s = save.state
      const next = {
        ...s,
        ovos: Math.max(0, s.ovos + ovos),
        milho: Math.max(0, s.milho + milho),
        history: [{ id: uid(), at: Date.now(), text: `Ajuste do suporte: ${reason}`, milho, ovo: ovos }, ...s.history].slice(0, 80),
      }
      writeSave(id, next, save.rev + 1)
      audit(admin, 'ajuste_saldo', id, { ovos, milho, reason })
      return { ok: true, ovos: next.ovos, milho: next.milho }
    }

    if (userMatch[2] === '/ban' && method === 'POST') {
      const ban = body.banned === true
      const reason = String(body.reason ?? '').trim().slice(0, 200)
      if (ban && !reason) throw new AdminError(400, 'Informe o motivo do bloqueio')
      if (ban && isAdmin(u)) throw new AdminError(400, 'Não é possível bloquear um administrador')
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
        `SELECT o.id, o.sku, o.amount_cents, o.method, o.provider, o.status, o.created_at, o.paid_at, o.user_id, COALESCE(u.email, '(conta excluída)') AS email
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
    if (!o) throw new AdminError(404, 'Pedido não encontrado')
    const after = await deps.recheck(o)
    audit(admin, 'reconsultar_pedido', o.user_id, { order: o.id, antes: o.status, depois: after.status })
    return { status: after.status }
  }

  // Configuração
  if (path === '/api/admin/config' && method === 'GET') {
    const row = db().prepare("SELECT updated_at, updated_by FROM config WHERE key = 'app'").get() as { updated_at: number; updated_by: string } | undefined
    return { config: loadConfig(), defaults: DEFAULT_CONFIG, updatedAt: row?.updated_at ?? null, updatedBy: row?.updated_by ?? null }
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

  // Auditoria
  if (path === '/api/admin/audit' && method === 'GET') {
    const rows = db().prepare('SELECT l.*, u.email AS target_email FROM admin_log l LEFT JOIN users u ON u.id = l.target ORDER BY l.at DESC LIMIT 200').all()
    return { log: rows }
  }

  return null
}
