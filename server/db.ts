import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const FILE = process.env.DB_FILE ?? 'data/rinha.sqlite'

let db: DatabaseSync | null = null

export function getDb() {
  if (db) return db
  mkdirSync(dirname(FILE), { recursive: true })
  db = new DatabaseSync(FILE)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      adult_confirmed_at INTEGER NOT NULL,
      terms_accepted_at INTEGER NOT NULL,
      monthly_limit_cents INTEGER NOT NULL,
      pending_limit_cents INTEGER,
      pending_limit_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saves (
      user_id TEXT PRIMARY KEY,
      rev INTEGER NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      method TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_ref TEXT,
      status TEXT NOT NULL,
      pix_code TEXT,
      pix_qr TEXT,
      checkout_url TEXT,
      created_at INTEGER NOT NULL,
      paid_at INTEGER,
      fulfilled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at);
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS presence (
      user_id TEXT PRIMARY KEY,
      last_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      from_user TEXT NOT NULL,
      to_user TEXT NOT NULL,
      from_rooster TEXT NOT NULL,
      to_rooster TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      resolved_at INTEGER,
      seed INTEGER,
      result TEXT,
      seen_from INTEGER NOT NULL DEFAULT 0,
      seen_to INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS challenges_to ON challenges(to_user, status);
    CREATE INDEX IF NOT EXISTS challenges_from ON challenges(from_user, status);
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT
    );
    CREATE TABLE IF NOT EXISTS activity (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS ovos_guard (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      gained INTEGER NOT NULL,
      PRIMARY KEY (user_id, day)
    );
  `)
  // Colunas adicionadas depois da primeira versão
  const cols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name)
  if (!cols.includes('banned_at')) db.exec('ALTER TABLE users ADD COLUMN banned_at INTEGER')
  if (!cols.includes('ban_reason')) db.exec('ALTER TABLE users ADD COLUMN ban_reason TEXT')
  if (!cols.includes('mvp_credit_cents')) db.exec('ALTER TABLE users ADD COLUMN mvp_credit_cents INTEGER NOT NULL DEFAULT 0')
  if (!cols.includes('mvp_granted_at')) db.exec('ALTER TABLE users ADD COLUMN mvp_granted_at INTEGER')
  if (!cols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'")
  return db
}

export interface UserRow {
  id: string
  email: string
  name: string
  pass_hash: string
  salt: string
  created_at: number
  monthly_limit_cents: number
  pending_limit_cents: number | null
  pending_limit_at: number | null
  banned_at?: number | null
  role?: string
  mvp_credit_cents?: number
  mvp_granted_at?: number | null
  ban_reason?: string | null
}

export interface OrderRow {
  id: string
  user_id: string
  sku: string
  amount_cents: number
  method: 'pix' | 'cartao' | 'credito'
  provider: string
  provider_ref: string | null
  status: 'pendente' | 'pago' | 'expirado' | 'recusado'
  pix_code: string | null
  pix_qr: string | null
  checkout_url: string | null
  created_at: number
  paid_at: number | null
  fulfilled_at: number | null
}
