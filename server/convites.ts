// 🎟️ Whitelist por convite: com `live.invites.on`, só cria conta quem tem um código válido.
// Códigos nascem de dois jeitos:
//  - Administrador (backoffice): lote de códigos, com limite de usos, validade, nota e, opcionalmente, presos a um e-mail
//    (whitelist nominal: só aquele e-mail consegue usar). Pode mandar o convite por e-mail.
//  - Jogador com e-mail confirmado: até `live.invites.perPlayer` códigos de 1 uso cada (convite de amigo).
// O consumo do código acontece na mesma transação do INSERT do usuário (ver /api/auth/signup em app.ts).
import { randomInt } from 'node:crypto'
import { live } from '../src/game/config'
import { t, type Lang } from '../src/i18n'
import { appName } from '../src/brand'
import { getDb, type UserRow } from './db'
import { isAdmin } from './admin'
import { emailShell, sendMail } from './mail'
import { limited } from './security'

export class ConviteError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface InviteRow {
  code: string
  owner_id: string | null
  created_by: string
  email: string | null
  note: string | null
  max_uses: number
  uses: number
  created_at: number
  expires_at: number | null
  revoked_at: number | null
}

const db = () => getDb()
const DAY = 864e5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Sem 0/O, 1/I/L: fácil de ditar e de digitar
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Deixa o código no formato guardado: maiúsculas, sem espaços; "galoabcd2345" vira "GALO-ABCD-2345". */
export function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32)
  const flat = s.replace(/-/g, '')
  if (/^GALO[A-Z0-9]{8}$/.test(flat)) return `GALO-${flat.slice(4, 8)}-${flat.slice(8)}`
  return s
}

export function newCode(): string {
  const pick = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  for (;;) {
    const c = `GALO-${pick(4)}-${pick(4)}`
    if (!db().prepare('SELECT 1 FROM invites WHERE code = ?').get(c)) return c
  }
}

const publicUrl = () => (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')
/** Link que já abre o cadastro com o código preenchido. */
export const inviteLink = (code: string) => `${publicUrl()}/?convite=${encodeURIComponent(code)}#/criar`

/** Motivo de o código não servir para este e-mail (ou null se serve). Não consome. */
function whyInvalid(row: InviteRow | undefined, email: string): string | null {
  if (!row) return t('Código de convite inválido')
  if (row.revoked_at) return t('Este convite foi cancelado')
  if (row.expires_at && row.expires_at <= Date.now()) return t('Este convite expirou')
  if (row.uses >= row.max_uses) return t('Este convite já foi usado')
  if (row.email && row.email !== email) return t('Este convite é para outro e-mail')
  return null
}

/**
 * Valida e consome um uso do convite. Chame DENTRO da transação que cria o usuário
 * (o UPDATE condicional garante que dois cadastros simultâneos não usam a última vaga).
 * Lança ConviteError se não der. Com a whitelist desligada não faz nada e devolve null.
 */
export function consumeInvite(rawCode: unknown, email: string): string | null {
  const code = normalizeCode(rawCode)
  if (!live.invites.on) {
    // Whitelist desligada: código é opcional, mas se veio um válido, conta o uso (atribuição de quem convidou)
    if (!code) return null
    const r = db()
      .prepare('UPDATE invites SET uses = uses + 1 WHERE code = ? AND revoked_at IS NULL AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?) AND (email IS NULL OR email = ?)')
      .run(code, Date.now(), email)
    return r.changes ? code : null
  }
  if (!code) throw new ConviteError(403, t('O cadastro está só por convite. Informe seu código de convite.'))
  const row = db().prepare('SELECT * FROM invites WHERE code = ?').get(code) as InviteRow | undefined
  const why = whyInvalid(row, email)
  if (why) throw new ConviteError(403, why)
  const r = db()
    .prepare('UPDATE invites SET uses = uses + 1 WHERE code = ? AND revoked_at IS NULL AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?) AND (email IS NULL OR email = ?)')
    .run(code, Date.now(), email)
  if (!r.changes) throw new ConviteError(403, t('Este convite já foi usado'))
  return code
}

/** Grava no usuário qual convite ele usou (rastreio de quem convidou quem). */
export function markInvitedUser(userId: string, code: string | null) {
  if (!code) return
  db().prepare('UPDATE users SET invite_code = ? WHERE id = ?').run(code, userId)
}

/** Apaga os convites de um jogador que excluiu a conta (os já usados continuam valendo para quem entrou). */
export function convitesDeleteUser(userId: string) {
  db().prepare('DELETE FROM invites WHERE owner_id = ? AND uses = 0').run(userId)
}

const view = (r: InviteRow) => ({
  code: r.code,
  link: inviteLink(r.code),
  uses: r.uses,
  maxUses: r.max_uses,
  email: r.email,
  note: r.note,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  status: r.revoked_at ? 'cancelado' : r.expires_at && r.expires_at <= Date.now() ? 'expirado' : r.uses >= r.max_uses ? 'usado' : 'ativo',
})

const usedBy = (code: string) => db().prepare('SELECT name, email, created_at FROM users WHERE invite_code = ? ORDER BY created_at').all(code) as { name: string; email: string; created_at: number }[]

export async function sendInviteEmail(to: string, code: string, fromName: string, lang: Lang) {
  const link = inviteLink(code)
  await sendMail(
    to,
    t('Você foi convidado para o {brand}', { brand: appName(lang) }, lang),
    emailShell({
      brand: appName(lang),
      heading: t('Seu convite chegou! 🐓', undefined, lang),
      intro: t('{nome} te convidou para o {brand}. O acesso é só por convite: use o código {codigo} ao criar sua conta.', { nome: fromName, brand: appName(lang), codigo: code }, lang),
      button: { text: t('Criar minha conta', undefined, lang), href: link },
      linkFallback: { label: t('Se o botão não abrir, copie e cole este link no navegador:', undefined, lang), href: link },
      note: t('O convite é pessoal. Se não esperava este e-mail, pode ignorar.', undefined, lang),
      footer: t('Este é um e-mail automático do {brand}. Por favor, não responda.', { brand: appName(lang) }, lang),
    }),
    appName(lang),
  )
}

type Out = { status?: number; body: unknown } | null

/** Rotas do jogador: GET/POST /api/convites */
export function handleConvites(path: string, method: string, u: UserRow): Out {
  if (path !== '/api/convites') return null
  const mine = () => (db().prepare('SELECT * FROM invites WHERE owner_id = ? ORDER BY created_at DESC').all(u.id) as unknown as InviteRow[])
  const summary = () => {
    const rows = mine()
    const left = Math.max(0, live.invites.perPlayer - rows.length)
    return {
      on: live.invites.on,
      perPlayer: live.invites.perPlayer,
      left,
      verified: !!u.email_verified_at,
      codes: rows.map((r) => ({ ...view(r), usedBy: usedBy(r.code).map((x) => x.name) })),
    }
  }
  if (method === 'GET') return { body: summary() }
  if (method === 'POST') {
    if (!u.email_verified_at) throw new ConviteError(403, t('Confirme seu e-mail para poder convidar amigos.'))
    if (limited(`convite:${u.id}`, 10, 3600_000)) throw new ConviteError(429, t('Muitas operações seguidas. Espere um pouco.'))
    if (mine().length >= live.invites.perPlayer) throw new ConviteError(400, t('Você já usou todos os seus convites.'))
    const code = newCode()
    db().prepare('INSERT INTO invites (code, owner_id, created_by, max_uses, created_at) VALUES (?, ?, ?, 1, ?)').run(code, u.id, u.id, Date.now())
    return { status: 201, body: summary() }
  }
  return null
}

/** Rotas do backoffice: /api/admin/convites (GET lista, POST cria) e /api/admin/convites/revoke. */
export async function handleConvitesAdmin(path: string, method: string, url: URL, body: Record<string, unknown>, admin: UserRow): Promise<Out> {
  if (!path.startsWith('/api/admin/convites')) return null
  if (!isAdmin(admin)) throw new ConviteError(403, t('Acesso só para administradores'))
  const audit = (action: string, target: string | null, detail: unknown) =>
    db().prepare('INSERT INTO admin_log (at, admin_email, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(Date.now(), admin.email, action, target, JSON.stringify(detail))

  if (path === '/api/admin/convites' && method === 'GET') {
    const q = String(url.searchParams.get('q') ?? '').trim().toUpperCase()
    const filter = String(url.searchParams.get('filter') ?? 'todos')
    const rows = db()
      .prepare(
        `SELECT i.*, o.email AS owner_email, o.name AS owner_name FROM invites i LEFT JOIN users o ON o.id = i.owner_id
         WHERE (? = '' OR i.code LIKE ? OR UPPER(COALESCE(i.email,'')) LIKE ? OR UPPER(COALESCE(i.note,'')) LIKE ? OR UPPER(COALESCE(o.email,'')) LIKE ?)
           AND (? = 'todos' OR (? = 'admin' AND i.owner_id IS NULL) OR (? = 'jogadores' AND i.owner_id IS NOT NULL))
         ORDER BY i.created_at DESC LIMIT 300`,
      )
      .all(q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, filter, filter, filter) as unknown as (InviteRow & { owner_email: string | null; owner_name: string | null })[]
    const s = db()
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(uses),0) AS used,
                COALESCE(SUM(CASE WHEN revoked_at IS NULL AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END),0) AS active,
                COALESCE(SUM(CASE WHEN owner_id IS NOT NULL THEN 1 ELSE 0 END),0) AS fromPlayers
         FROM invites`,
      )
      .get(Date.now()) as { total: number; used: number; active: number; fromPlayers: number }
    const invited = (db().prepare('SELECT COUNT(*) AS n FROM users WHERE invite_code IS NOT NULL').get() as { n: number }).n
    return {
      body: {
        on: live.invites.on,
        perPlayer: live.invites.perPlayer,
        stats: { ...s, invitedUsers: invited },
        invites: rows.map((r) => ({ ...view(r), owner: r.owner_id ? { name: r.owner_name, email: r.owner_email } : null, createdBy: r.owner_id ? null : r.created_by, usedBy: usedBy(r.code) })),
      },
    }
  }

  if (path === '/api/admin/convites' && method === 'POST') {
    const count = Math.round(Number(body.count ?? 1))
    const maxUses = Math.round(Number(body.maxUses ?? 1))
    const days = Number(body.expiresDays ?? 0)
    const note = String(body.note ?? '').trim().slice(0, 80) || null
    const custom = normalizeCode(body.code)
    const emails = String(body.emails ?? '')
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    const sendEmail = body.sendEmail === true
    if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 100_000) throw new ConviteError(400, t('Usos por código: entre 1 e 100000'))
    if (!Number.isFinite(days) || days < 0 || days > 3650) throw new ConviteError(400, t('Validade: entre 0 e 3650 dias (0 = sem validade)'))
    const bad = emails.find((e) => !EMAIL.test(e))
    if (bad) throw new ConviteError(400, t('E-mail inválido: {email}', { email: bad }))
    if (emails.length > 500) throw new ConviteError(400, t('No máximo 500 e-mails por vez'))
    if (custom && !/^[A-Z0-9-]{4,24}$/.test(custom)) throw new ConviteError(400, t('Código personalizado: 4 a 24 letras, números ou hífen'))
    if (custom && (emails.length > 1 || count > 1)) throw new ConviteError(400, t('Código personalizado cria um código só'))
    if (custom && db().prepare('SELECT 1 FROM invites WHERE code = ?').get(custom)) throw new ConviteError(409, t('Esse código já existe'))
    if (!emails.length && (!Number.isFinite(count) || count < 1 || count > 500)) throw new ConviteError(400, t('Quantidade: entre 1 e 500'))
    const now = Date.now()
    const expires = days > 0 ? now + days * DAY : null
    const ins = db().prepare('INSERT INTO invites (code, owner_id, created_by, email, note, max_uses, created_at, expires_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)')
    const created: { code: string; email: string | null }[] = []
    db().exec('BEGIN')
    try {
      // Com e-mails: um código de 1 uso preso a cada e-mail (whitelist nominal). Sem e-mails: `count` códigos livres.
      if (emails.length) for (const e of new Set(emails)) {
        const code = custom || newCode()
        ins.run(code, admin.email, e, note, 1, now, expires)
        created.push({ code, email: e })
      }
      else for (let i = 0; i < (custom ? 1 : count); i++) {
        const code = custom || newCode()
        ins.run(code, admin.email, null, note, maxUses, now, expires)
        created.push({ code, email: null })
      }
      db().exec('COMMIT')
    } catch (e) {
      db().exec('ROLLBACK')
      throw e
    }
    audit('convites_criados', null, { n: created.length, maxUses, note, expiresDays: days || null, emails: emails.length })
    let mailed = 0
    if (sendEmail) {
      for (const c of created) if (c.email) {
        await sendInviteEmail(c.email, c.code, appName('pt'), 'pt').then(() => mailed++).catch((e) => console.error('[mail] convite', e))
      }
    }
    return { status: 201, body: { created: created.map((c) => ({ ...c, link: inviteLink(c.code) })), mailed } }
  }

  if (path === '/api/admin/convites/revoke' && method === 'POST') {
    const code = normalizeCode(body.code)
    const r = db().prepare('UPDATE invites SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL').run(Date.now(), code)
    if (!r.changes) throw new ConviteError(404, t('Convite não encontrado ou já cancelado'))
    audit('convite_cancelado', null, { code })
    return { body: { ok: true } }
  }
  return null
}
