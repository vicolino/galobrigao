// 📝 Lista de espera da whitelist: quem chega sem convite deixa nome e e-mail na página inicial.
// A equipe aprova no backoffice (Convites → Lista de espera): cada aprovado ganha um convite nominal
// (1 uso, preso ao e-mail) que o jogo manda por e-mail. Recusar só marca o pedido.
//
// Anti-abuso: limite por IP, teto global por hora e resposta sempre igual (não revela se o e-mail já tem conta).
import { t, type Lang } from '../src/i18n'
import { appName } from '../src/brand'
import { getDb, type UserRow } from './db'
import { isAdmin } from './admin'
import { limited } from './security'
import { ConviteError, newCode, sendInviteEmail } from './convites'

const db = () => getDb()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface WaitRow {
  id: number
  email: string
  name: string
  reason: string | null
  discord: string | null
  lang: string
  status: 'pendente' | 'aprovado' | 'recusado'
  invite_code: string | null
  created_at: number
  decided_at: number | null
  decided_by: string | null
}

/** Posição na fila (pendentes criados antes, contando o próprio). */
const position = (id: number) => (db().prepare("SELECT COUNT(*) AS n FROM waitlist WHERE status = 'pendente' AND id <= ?").get(id) as { n: number }).n

/** POST /api/espera — rota pública (sem login). */
export function handleEspera(body: Record<string, unknown>, ip: string, lang: Lang) {
  if (limited(`espera:${ip}`, 5, 3600_000) || limited('espera:global', 300, 3600_000)) throw new ConviteError(429, t('Muitos pedidos agora. Tente de novo mais tarde.'))
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 120)
  const name = String(body.name ?? '').trim().slice(0, 40)
  const reason = String(body.reason ?? '').trim().slice(0, 300) || null
  const discord = String(body.discord ?? '').trim().replace(/^@/, '').slice(0, 40) || null
  if (!EMAIL.test(email)) throw new ConviteError(400, t('E-mail inválido'))
  if (name.length < 2) throw new ConviteError(400, t('Diga como podemos te chamar'))
  if (body.adult !== true) throw new ConviteError(400, t('É preciso ter 18 anos ou mais'))
  // Já tem conta: responde como se tivesse entrado na fila (não revela quem tem conta)
  if (db().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return { ok: true, position: null }
  const old = db().prepare('SELECT * FROM waitlist WHERE email = ?').get(email) as WaitRow | undefined
  if (old) return { ok: true, position: old.status === 'pendente' ? position(old.id) : null }
  const r = db()
    .prepare('INSERT INTO waitlist (email, name, reason, discord, lang, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(email, name, reason, discord, lang, 'pendente', Date.now())
  return { ok: true, position: position(Number(r.lastInsertRowid)) }
}

type Out = { status?: number; body: unknown } | null

/** Backoffice: /api/admin/convites/espera (GET lista) · /aprovar · /recusar (POST { ids }). */
export async function handleEsperaAdmin(path: string, method: string, url: URL, body: Record<string, unknown>, admin: UserRow): Promise<Out> {
  if (!path.startsWith('/api/admin/convites/espera')) return null
  if (!isAdmin(admin)) throw new ConviteError(403, t('Acesso só para administradores'))
  const audit = (action: string, detail: unknown) =>
    db().prepare('INSERT INTO admin_log (at, admin_email, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(Date.now(), admin.email, action, null, JSON.stringify(detail))

  if (path === '/api/admin/convites/espera' && method === 'GET') {
    const status = String(url.searchParams.get('status') ?? 'pendente')
    const q = String(url.searchParams.get('q') ?? '').trim().toLowerCase()
    const rows = db()
      .prepare(
        `SELECT w.*, (u.id IS NOT NULL) AS has_account FROM waitlist w LEFT JOIN users u ON u.email = w.email
         WHERE (? = 'todos' OR w.status = ?) AND (? = '' OR w.email LIKE ? OR LOWER(w.name) LIKE ? OR LOWER(COALESCE(w.discord,'')) LIKE ?)
         ORDER BY w.id ${status === 'pendente' ? 'ASC' : 'DESC'} LIMIT 500`,
      )
      .all(status, status, q, `%${q}%`, `%${q}%`, `%${q}%`) as unknown as (WaitRow & { has_account: number })[]
    const counts = Object.fromEntries((db().prepare('SELECT status, COUNT(*) AS n FROM waitlist GROUP BY status').all() as { status: string; n: number }[]).map((c) => [c.status, c.n]))
    return {
      body: {
        counts: { pendente: counts.pendente ?? 0, aprovado: counts.aprovado ?? 0, recusado: counts.recusado ?? 0 },
        list: rows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          reason: r.reason,
          discord: r.discord,
          status: r.status,
          inviteCode: r.invite_code,
          createdAt: r.created_at,
          decidedAt: r.decided_at,
          decidedBy: r.decided_by,
          hasAccount: !!r.has_account,
        })),
      },
    }
  }

  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200)
  if ((path === '/api/admin/convites/espera/aprovar' || path === '/api/admin/convites/espera/recusar') && method === 'POST' && !ids.length) throw new ConviteError(400, t('Escolha pelo menos um pedido'))

  if (path === '/api/admin/convites/espera/aprovar' && method === 'POST') {
    const sendEmail = body.sendEmail !== false
    const days = Number(body.expiresDays ?? 14)
    const expires = Number.isFinite(days) && days > 0 ? Date.now() + Math.min(days, 3650) * 864e5 : null
    const pick = db().prepare("SELECT * FROM waitlist WHERE id = ? AND status = 'pendente'")
    const ins = db().prepare('INSERT INTO invites (code, owner_id, created_by, email, note, max_uses, created_at, expires_at) VALUES (?, NULL, ?, ?, ?, 1, ?, ?)')
    const mark = db().prepare("UPDATE waitlist SET status = 'aprovado', invite_code = ?, decided_at = ?, decided_by = ? WHERE id = ?")
    const done: { email: string; code: string; lang: string; name: string }[] = []
    db().exec('BEGIN')
    try {
      for (const id of ids) {
        const w = pick.get(id) as WaitRow | undefined
        if (!w) continue
        const code = newCode()
        ins.run(code, admin.email, w.email, t('Lista de espera'), Date.now(), expires)
        mark.run(code, Date.now(), admin.email, id)
        done.push({ email: w.email, code, lang: w.lang, name: w.name })
      }
      db().exec('COMMIT')
    } catch (e) {
      db().exec('ROLLBACK')
      throw e
    }
    let mailed = 0
    if (sendEmail) {
      for (const d of done) {
        const l: Lang = d.lang === 'pt' ? 'pt' : 'en'
        await sendInviteEmail(d.email, d.code, t('A equipe do {brand}', { brand: appName(l) }, l), l)
          .then(() => mailed++)
          .catch((e) => console.error('[mail] espera', e))
      }
    }
    audit('espera_aprovada', { n: done.length, mailed })
    return { body: { approved: done.length, mailed, codes: done.map((d) => ({ email: d.email, code: d.code })) } }
  }

  if (path === '/api/admin/convites/espera/recusar' && method === 'POST') {
    const st = db().prepare("UPDATE waitlist SET status = 'recusado', decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pendente'")
    let n = 0
    for (const id of ids) n += Number(st.run(Date.now(), admin.email, id).changes)
    audit('espera_recusada', { n })
    return { body: { refused: n } }
  }
  return null
}
