import { migrate } from '../src/game/engine'
import type { GameState } from '../src/game/types'
import { getDb } from './db'

export function loadSave(userId: string): { rev: number; state: GameState } | null {
  const row = getDb().prepare('SELECT rev, data FROM saves WHERE user_id = ?').get(userId) as { rev: number; data: string } | undefined
  return row ? { rev: row.rev, state: migrate(JSON.parse(row.data)) } : null
}

export function writeSave(userId: string, state: GameState, rev: number) {
  getDb()
    .prepare('INSERT INTO saves (user_id, rev, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated_at = excluded.updated_at')
    .run(userId, rev, JSON.stringify(state), Date.now())
}
