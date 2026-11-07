import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { promisify } from 'node:util'
import { getDb, type UserRow } from './db'

const SESSION_DAYS = 30

// Custo do scrypt: N=2^16, r=8, p=1 — 4x o padrão do Node (2^14), ~67 MB por cálculo (maxmem com folga).
// Escolhido 2^16 (e não 2^17) para caber com segurança na VM de produção de processo único; dá para subir depois.
// Assíncrono (promisify) para rodar na threadpool do libuv e NÃO travar o event loop durante o cálculo.
// Hashes novos levam o prefixo 's2:'. Hash sem prefixo = formato legado (scrypt com parâmetros padrão do Node),
// que continua sendo verificado do jeito antigo e é re-hasheado para o formato novo no próximo login (needsRehash).
const TAG = 's2:'
const COST = { N: 65536, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }
const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number, options?: typeof COST) => Promise<Buffer>

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = TAG + (await scrypt(password, salt, 64, COST)).toString('hex')
  return { hash, salt }
}

/** true quando a senha confere. Aceita tanto hashes legados quanto os do formato novo. */
export async function checkPassword(password: string, user: UserRow) {
  const stored = user.pass_hash
  const computed = stored.startsWith(TAG)
    ? TAG + (await scrypt(password, user.salt, 64, COST)).toString('hex')
    : (await scrypt(password, user.salt, 64)).toString('hex')
  if (computed.length !== stored.length) return false
  return timingSafeEqual(Buffer.from(computed), Buffer.from(stored))
}

/** Hash em formato legado (custo antigo): deve ser re-hasheado após um login bem-sucedido. */
export function needsRehash(user: Pick<UserRow, 'pass_hash'>) {
  return !user.pass_hash.startsWith(TAG)
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
const DUMMY_SALT = randomBytes(16).toString('hex')
export async function dummyPasswordCheck() {
  await scrypt('x', DUMMY_SALT, 64, COST)
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
