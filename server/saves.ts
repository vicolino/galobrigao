import { migrate } from '../src/game/engine'
import type { GameState } from '../src/game/types'
import { getDb } from './db'

/** Escrita concorrente de save: o rev no banco não era o esperado. Em processo único nunca acontece
 * (todo load→write é síncrono); é a proteção para o dia em que o servidor rodar em múltiplos processos
 * sobre o mesmo banco — evita lost-update / double-spend, falhando em vez de sobrescrever às cegas. */
export class SaveConflict extends Error {
  constructor() {
    super('save-conflict')
  }
}

export function loadSave(userId: string): { rev: number; state: GameState } | null {
  const row = getDb().prepare('SELECT rev, data FROM saves WHERE user_id = ?').get(userId) as { rev: number; data: string } | undefined
  return row ? { rev: row.rev, state: migrate(JSON.parse(row.data)) } : null
}

/** Grava o save com compare-and-swap: só atualiza se o rev gravado ainda for `rev - 1`.
 * Se a linha ainda não existe, é a primeira gravação (INSERT). Se existe com outro rev, houve
 * escrita concorrente → SaveConflict (o chamador aborta a transação e o cliente recarrega). */
export function writeSave(userId: string, state: GameState, rev: number) {
  const db = getDb()
  const data = JSON.stringify(state)
  const now = Date.now()
  const upd = db.prepare('UPDATE saves SET rev = ?, data = ?, updated_at = ? WHERE user_id = ? AND rev = ?').run(rev, data, now, userId, rev - 1)
  if (upd.changes === 1) return
  const exists = db.prepare('SELECT 1 FROM saves WHERE user_id = ?').get(userId)
  if (!exists) {
    db.prepare('INSERT INTO saves (user_id, rev, data, updated_at) VALUES (?, ?, ?, ?)').run(userId, rev, data, now)
    return
  }
  throw new SaveConflict()
}
