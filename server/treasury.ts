// Carteira do sistema (tesouraria in-game). As taxas/gastos que o jogo cobra em ovos/milho entram
// aqui em vez de sumir da economia — os ovos viram lastro para a moeda NFT depois. Ledger append-only:
// o saldo é a soma das entradas (entradas positivas; retiradas/saques entram como amount negativo).
import { getDb } from './db'

export type TreasurySource = 'desafio' | 'feira' | 'aluguel' | 'loja' | 'saque' | 'ajuste'

/**
 * Credita (ou debita, com amount negativo) a carteira do sistema. Chamar DENTRO da transação que
 * move os ovos, para ser atômico. `detail` é um texto legível do que gerou a entrada (aparece no admin).
 */
export function creditTreasury(source: TreasurySource, currency: 'ovo' | 'milho', amount: number, ref?: string | null, detail?: string | null) {
  const a = Math.round(amount)
  if (!Number.isFinite(a) || a === 0) return
  getDb().prepare('INSERT INTO treasury (at, source, currency, amount, ref, detail) VALUES (?, ?, ?, ?, ?, ?)').run(Date.now(), source, currency, a, ref ?? null, detail ?? null)
}

/** Saldo atual da carteira, por moeda. */
export function treasuryBalance() {
  const totals = getDb().prepare('SELECT currency, COALESCE(SUM(amount), 0) AS total FROM treasury GROUP BY currency').all() as { currency: string; total: number }[]
  const bal = (c: string) => totals.find((t) => t.currency === c)?.total ?? 0
  return { ovos: bal('ovo'), milho: bal('milho') }
}

interface Row {
  at: number
  source: string
  currency: string
  amount: number
  ref: string | null
  detail?: string | null
}

/** Saldo + arrecadação por fonte nos últimos `days` dias + últimas entradas (resumo para cards). */
export function treasuryStats(days = 30) {
  const db = getDb()
  const since = Date.now() - days * 864e5
  const { ovos, milho } = treasuryBalance()
  const bySource = db.prepare('SELECT source, currency, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM treasury WHERE at >= ? GROUP BY source, currency ORDER BY total DESC').all(since) as {
    source: string
    currency: string
    total: number
    n: number
  }[]
  const recent = db.prepare('SELECT at, source, currency, amount, ref, detail FROM treasury ORDER BY at DESC LIMIT 20').all() as Row[]
  return { days, ovos, milho, bySource, recent }
}

/** Tela completa de back-office: saldo, totais por fonte (desde sempre) e o extrato (filtrável por fonte). */
export function treasuryLedger({ source, limit = 200 }: { source?: string; limit?: number } = {}) {
  const db = getDb()
  const { ovos, milho } = treasuryBalance()
  const bySource = db.prepare('SELECT source, currency, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM treasury GROUP BY source, currency ORDER BY total DESC').all() as {
    source: string
    currency: string
    total: number
    n: number
  }[]
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 1000)
  const entries = source
    ? (db.prepare('SELECT id, at, source, currency, amount, ref, detail FROM treasury WHERE source = ? ORDER BY at DESC, id DESC LIMIT ?').all(source, lim) as (Row & { id: number })[])
    : (db.prepare('SELECT id, at, source, currency, amount, ref, detail FROM treasury ORDER BY at DESC, id DESC LIMIT ?').all(lim) as (Row & { id: number })[])
  return { ovos, milho, bySource, entries }
}
