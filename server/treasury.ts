// Carteira do sistema (tesouraria in-game). As taxas/gastos que o jogo cobra em ovos/milho entram
// aqui em vez de sumir da economia — os ovos viram lastro para a moeda NFT depois. Ledger append-only:
// o saldo é a soma das entradas (entradas positivas; retiradas/saques entram como amount negativo).
import { getDb } from './db'

export type TreasurySource = 'desafio' | 'feira' | 'aluguel' | 'loja' | 'saque' | 'ajuste'

/**
 * Credita (ou debita, com amount negativo) a carteira do sistema. Chamar DENTRO da transação que
 * move os ovos, para ser atômico. `detail` é um texto legível do que gerou a entrada (aparece no admin).
 */
export function creditTreasury(source: TreasurySource, currency: 'ovo' | 'milho', amount: number, ref?: string | null, detail?: string | null, userId?: string | null) {
  const a = Math.round(amount)
  if (!Number.isFinite(a) || a === 0) return
  getDb().prepare('INSERT INTO treasury (at, source, currency, amount, ref, detail, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(Date.now(), source, currency, a, ref ?? null, detail ?? null, userId ?? null)
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

/**
 * Tela completa de back-office: saldo, totais por fonte (desde sempre) e o extrato paginado.
 * O extrato aceita filtro por fonte e por período (`from`/`to` em ms); o "por fonte" é sempre total geral.
 */
export function treasuryLedger({ source, from, to, page = 1, pageSize = 25 }: { source?: string; from?: number; to?: number; page?: number; pageSize?: number } = {}) {
  const db = getDb()
  const { ovos, milho } = treasuryBalance()
  // Arrecadação por fonte respeita o mesmo período do extrato (para bater com a emissão no "Entra vs Sai").
  const srcWhere: string[] = []
  const srcParams: number[] = []
  if (Number.isFinite(from)) {
    srcWhere.push('at >= ?')
    srcParams.push(from as number)
  }
  if (Number.isFinite(to)) {
    srcWhere.push('at <= ?')
    srcParams.push(to as number)
  }
  const srcClause = srcWhere.length ? ' WHERE ' + srcWhere.join(' AND ') : ''
  const bySource = db.prepare(`SELECT source, currency, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM treasury${srcClause} GROUP BY source, currency ORDER BY total DESC`).all(...srcParams) as {
    source: string
    currency: string
    total: number
    n: number
  }[]
  // Filtros do extrato (fonte + período)
  const where: string[] = []
  const params: (string | number)[] = []
  if (source) {
    where.push('treasury.source = ?')
    params.push(source)
  }
  if (Number.isFinite(from)) {
    where.push('treasury.at >= ?')
    params.push(from as number)
  }
  if (Number.isFinite(to)) {
    where.push('treasury.at <= ?')
    params.push(to as number)
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM treasury${whereSql}`).get(...params) as { n: number }).n
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100)
  const pages = Math.max(1, Math.ceil(total / size))
  const pg = Math.min(Math.max(Number(page) || 1, 1), pages)
  const offset = (pg - 1) * size
  const entries = db
    .prepare(`SELECT treasury.id, treasury.at, treasury.source, treasury.currency, treasury.amount, treasury.ref, treasury.detail, u.email AS userEmail FROM treasury LEFT JOIN users u ON u.id = treasury.user_id${whereSql} ORDER BY treasury.at DESC, treasury.id DESC LIMIT ? OFFSET ?`)
    .all(...params, size, offset) as (Row & { id: number; userEmail: string | null })[]
  return { ovos, milho, bySource, entries, total, page: pg, pageSize: size }
}
