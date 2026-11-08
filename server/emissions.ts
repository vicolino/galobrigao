// Registro de EMISSÃO: o lado espelho da tesouraria (server/treasury.ts). Enquanto a tesouraria
// anota o ovo/milho que o sistema RECOLHE, aqui anotamos o que as "torneiras" CRIAM e dão ao jogador
// (arena, bônus diário, missões, liga, venda de galo, troca ovo→milho…). Append-only: o total é a
// soma das linhas. Serve para o admin ver "entra vs sai" e saber se a economia está inflando.
import { getDb } from './db'

/**
 * Registra uma emissão de moeda (ovo/milho criado e entregue ao jogador). Ignora amount <= 0.
 * `source` é um rótulo legível da torneira (ex.: 'arena', 'diario', 'missao', 'troca').
 */
export function emit(source: string, currency: 'ovo' | 'milho', amount: number, userId?: string | null, detail?: string | null) {
  const a = Math.round(amount)
  if (!Number.isFinite(a) || a <= 0) return
  getDb().prepare('INSERT INTO emissions (at, source, currency, amount, user_id, detail) VALUES (?, ?, ?, ?, ?, ?)').run(Date.now(), source, currency, a, userId ?? null, detail ?? null)
}

/**
 * Total emitido + emissão por fonte, com filtro opcional de período (`from`/`to` em ms, campo `at`).
 * Mesmo shape do `treasuryLedger` do lado da arrecadação.
 */
export function emissionLedger({ from, to }: { from?: number; to?: number } = {}) {
  const db = getDb()
  const where: string[] = []
  const params: number[] = []
  if (Number.isFinite(from)) {
    where.push('at >= ?')
    params.push(from as number)
  }
  if (Number.isFinite(to)) {
    where.push('at <= ?')
    params.push(to as number)
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const totals = db.prepare(`SELECT currency, COALESCE(SUM(amount), 0) AS total FROM emissions${whereSql} GROUP BY currency`).all(...params) as { currency: string; total: number }[]
  const by = (c: string) => totals.find((t) => t.currency === c)?.total ?? 0
  const bySource = db.prepare(`SELECT source, currency, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM emissions${whereSql} GROUP BY source, currency ORDER BY total DESC`).all(...params) as {
    source: string
    currency: string
    total: number
    n: number
  }[]
  return { total: { ovos: by('ovo'), milho: by('milho') }, bySource }
}
