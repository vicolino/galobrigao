// Carteira do sistema (tesouraria in-game). As taxas que o jogo cobra em ovos/milho entram aqui
// em vez de sumir da economia — os ovos viram lastro para a moeda NFT depois. Ledger append-only:
// o saldo é a soma das entradas (sempre positivas; saídas futuras entram como amount negativo).
import { getDb } from './db'

export type TreasurySource = 'desafio' | 'feira' | 'aluguel' | 'ajuste'

/** Credita a carteira do sistema. Chamar DENTRO da transação que move os ovos, para ser atômico. */
export function creditTreasury(source: TreasurySource, currency: 'ovo' | 'milho', amount: number, ref?: string | null) {
  const a = Math.round(amount)
  if (!Number.isFinite(a) || a === 0) return
  getDb().prepare('INSERT INTO treasury (at, source, currency, amount, ref) VALUES (?, ?, ?, ?, ?)').run(Date.now(), source, currency, a, ref ?? null)
}

interface Row {
  at: number
  source: string
  currency: string
  amount: number
  ref: string | null
}

/** Saldo total da carteira + arrecadação por fonte nos últimos `days` dias + últimas entradas. */
export function treasuryStats(days = 30) {
  const db = getDb()
  const since = Date.now() - days * 864e5
  const totals = db.prepare('SELECT currency, COALESCE(SUM(amount), 0) AS total FROM treasury GROUP BY currency').all() as { currency: string; total: number }[]
  const bal = (cur: string) => totals.find((t) => t.currency === cur)?.total ?? 0
  const bySource = db.prepare('SELECT source, currency, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM treasury WHERE at >= ? GROUP BY source, currency ORDER BY total DESC').all(since) as {
    source: string
    currency: string
    total: number
    n: number
  }[]
  const recent = db.prepare('SELECT at, source, currency, amount, ref FROM treasury ORDER BY at DESC LIMIT 20').all() as Row[]
  return { days, ovos: bal('ovo'), milho: bal('milho'), bySource, recent }
}
