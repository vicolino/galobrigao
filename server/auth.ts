import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { getDb, type UserRow } from './db'

const SESSION_DAYS = 30

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

export function checkPassword(password: string, user: UserRow) {
  const { hash } = hashPassword(password, user.salt)
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.pass_hash, 'hex'))
}

export function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  getDb()
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, Date.now() + SESSION_DAYS * 864e5)
  return token
}

export function sessionCookie(token: string, secure: boolean) {
  return `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`
}

export const clearCookie = 'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'

export function readToken(req: IncomingMessage) {
  const raw = req.headers.cookie ?? ''
  const m = raw.match(/(?:^|;\s*)sid=([a-f0-9]{64})/)
  return m ? m[1] : null
}

export function userFromRequest(req: IncomingMessage): UserRow | null {
  const token = readToken(req)
  if (!token) return null
  const db = getDb()
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as { user_id: string; expires_at: number } | undefined
  if (!row || row.expires_at < Date.now()) return null
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as unknown as UserRow) ?? null
}

export function destroySession(req: IncomingMessage) {
  const token = readToken(req)
  if (token) getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

/** Gasta o mesmo tempo de uma senha real quando o e-mail não existe (não revela quem tem conta). */
const DUMMY = hashPassword('senha-que-nao-existe-1234')
export function dummyPasswordCheck() {
  hashPassword('x', DUMMY.salt)
  return false
}

/** Remove sessões vencidas de tempos em tempos. */
setInterval(() => {
  try {
    getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  } catch {
    /* banco indisponível */
  }
}, 3600_000).unref()
