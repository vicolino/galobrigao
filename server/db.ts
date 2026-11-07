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
    PRAGMA busy_timeout = 5000;
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
    CREATE TABLE IF NOT EXISTS email_verifications (
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
    CREATE TABLE IF NOT EXISTS house_fights (
      id TEXT PRIMARY KEY,
      starts_at INTEGER NOT NULL UNIQUE,
      event TEXT NOT NULL,
      num INTEGER NOT NULL,
      featured INTEGER NOT NULL DEFAULT 0,
      a TEXT NOT NULL,
      b TEXT NOT NULL,
      odds_a REAL NOT NULL,
      odds_b REAL NOT NULL,
      odds_ko REAL NOT NULL,
      seed INTEGER NOT NULL,
      status TEXT NOT NULL,
      winner INTEGER,
      method TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS house_fights_status ON house_fights(status, starts_at);
    CREATE TABLE IF NOT EXISTS house_bets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      fight_id TEXT NOT NULL,
      pick TEXT NOT NULL,
      amount INTEGER NOT NULL,
      odds REAL NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      payout INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      settled_at INTEGER,
      credited INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS house_bets_user ON house_bets(user_id, created_at);
    CREATE INDEX IF NOT EXISTS house_bets_fight ON house_bets(fight_id, status);
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
  if (!cols.includes('lang')) db.exec("ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'pt'")
  if (!cols.includes('kyc_status')) db.exec("ALTER TABLE users ADD COLUMN kyc_status TEXT NOT NULL DEFAULT 'none'")
  if (!cols.includes('test_usdc_claimed_at')) db.exec('ALTER TABLE users ADD COLUMN test_usdc_claimed_at INTEGER')
  // Verificação de e-mail: contas que já existiam quando a coluna foi criada entram como verificadas (backfill
  // roda só uma vez, aqui dentro do if). A partir daqui, todo cadastro novo nasce com NULL e precisa confirmar.
  if (!cols.includes('email_verified_at')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER')
    db.exec('UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL')
  }
  // Origem do cadastro (UTM do primeiro acesso)
  for (const c of ['utm_source', 'utm_medium', 'utm_campaign', 'ref']) if (!cols.includes(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} TEXT`)
  // Web3: carteiras custodiais, NFTs de itens e registro de todas as operações na chain
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id TEXT PRIMARY KEY,
      address TEXT UNIQUE NOT NULL,
      enc_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nfts (
      token_id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      price_units INTEGER,
      minted_at INTEGER NOT NULL,
      tx TEXT
    );
    CREATE INDEX IF NOT EXISTS nfts_owner ON nfts(owner_user_id);
    CREATE INDEX IF NOT EXISTS nfts_status ON nfts(status);
    CREATE TABLE IF NOT EXISTS web3_tx (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      asset TEXT NOT NULL,
      amount TEXT NOT NULL,
      to_addr TEXT,
      tx_hash TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS web3_tx_user ON web3_tx(user_id, created_at);
    -- 💵 Depósito USDC → ovos (server/deposito.ts). Fica após excluir a conta (auditoria; só o id).
    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_units INTEGER NOT NULL,
      eggs INTEGER NOT NULL,
      from_addr TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      tx_hash TEXT UNIQUE,
      raw_tx TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      done_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS deposits_user ON deposits(user_id, created_at);
    CREATE INDEX IF NOT EXISTS deposits_status ON deposits(status);
  `)
  // Moeda de cada aposta: as antigas foram feitas em milho (pagam em milho); as novas usam 🎟️ fichas
  const betCols = (db.prepare('PRAGMA table_info(house_bets)').all() as { name: string }[]).map((c) => c.name)
  if (!betCols.includes('currency')) db.exec("ALTER TABLE house_bets ADD COLUMN currency TEXT NOT NULL DEFAULT 'milho'")
  // Desafio valendo ovos: cada um bota `stake`; quem vence leva o total menos a taxa
  const chCols = (db.prepare('PRAGMA table_info(challenges)').all() as { name: string }[]).map((c) => c.name)
  if (!chCols.includes('stake')) db.exec('ALTER TABLE challenges ADD COLUMN stake INTEGER NOT NULL DEFAULT 0')
  // Cada jogador pode levar UMA ferramenta (só vale se os dois levarem).
  if (!chCols.includes('from_tool')) db.exec('ALTER TABLE challenges ADD COLUMN from_tool TEXT')
  if (!chCols.includes('to_tool')) db.exec('ALTER TABLE challenges ADD COLUMN to_tool TEXT')
  // 🌽 Arena no servidor: adversários gerados para cada galo (vida curta; server/economia.ts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS arena_opps (
      user_id TEXT NOT NULL,
      rooster_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, rooster_id)
    );
  `)
  // 🎁 Drops da Arena (server/drops.ts): cada drop sorteado; épico/lendário com nº de série global por item
  db.exec(`
    CREATE TABLE IF NOT EXISTS drops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      item_kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      serial INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS drops_user ON drops(user_id, created_at);
    CREATE INDEX IF NOT EXISTS drops_item ON drops(item_kind, item_id);
    CREATE TABLE IF NOT EXISTS daily_counters (
      day TEXT NOT NULL,
      key TEXT NOT NULL,
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, key)
    );
  `)
  return db
}

/** Soma 1 (ou n) num contador diário (ex.: lutas da Arena por dia). Nunca derruba o fluxo do jogo. */
export function bumpDaily(key: string, n = 1) {
  try {
    const day = new Date().toISOString().slice(0, 10)
    getDb().prepare('INSERT INTO daily_counters (day, key, n) VALUES (?, ?, ?) ON CONFLICT(day, key) DO UPDATE SET n = n + excluded.n').run(day, key, n)
  } catch {
    /* métrica é best-effort */
  }
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
  /** Idioma em que o jogador se cadastrou (nomes gerados no jogo novo). */
  lang?: string
  mvp_credit_cents?: number
  mvp_granted_at?: number | null
  /** Quando o e-mail foi confirmado (null = ainda não confirmado; contas antigas entraram com o created_at). */
  email_verified_at?: number | null
  ban_reason?: string | null
  /** Verificação de identidade para envios externos: 'none' | 'pending' | 'verified' | 'rejected'. */
  kyc_status?: string
  /** Quando o jogador resgatou o brinde de 20 USDC de teste (null = ainda não pegou). Uma vez por conta. */
  test_usdc_claimed_at?: number | null
  /** Origem do cadastro (UTM do primeiro acesso), já higienizada. */
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  ref?: string | null
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
