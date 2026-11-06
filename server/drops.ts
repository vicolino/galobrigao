// 🎁 Drops da Arena no servidor: sorteio (crypto), garantia, limite diário, nº de série e feed público.
import { randomInt } from 'node:crypto'
import { DROP_TIERS, applyDrop, dropOdds, hasSerial, rollContents, rollTier, shouldDrop, type DropResult, type RecentDrop, type Rng } from '../src/game/drops'
import type { GameState } from '../src/game/types'
import { getDb, type UserRow } from './db'
import { isProd, limited } from './security'
import { t } from '../src/i18n'

const rng: Rng = (n) => (n <= 1 ? 0 : randomInt(0, n))

let ready = false
function db() {
  const d = getDb()
  if (!ready) {
    // Mesma tabela de server/db.ts (garante em servidor que já estava aberto)
    d.exec(`CREATE TABLE IF NOT EXISTS drops (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', item_kind TEXT NOT NULL, item_id TEXT NOT NULL, tier TEXT NOT NULL, serial INTEGER, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS drops_user ON drops(user_id, created_at);
      CREATE INDEX IF NOT EXISTS drops_item ON drops(item_kind, item_id);`)
    ready = true
  }
  return d
}

const dayStart = () => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
const todayCount = (userId: string) => (db().prepare('SELECT COUNT(*) AS n FROM drops WHERE user_id = ? AND created_at >= ?').get(userId, dayStart()) as { n: number }).n
const issued = (kind: string, id: string) => (db().prepare('SELECT COUNT(*) AS n FROM drops WHERE item_kind = ? AND item_id = ? AND serial IS NOT NULL').get(kind, id) as { n: number }).n
const nextSerial = (kind: string, id: string) => ((db().prepare('SELECT MAX(serial) AS m FROM drops WHERE item_kind = ? AND item_id = ?').get(kind, id) as { m: number | null }).m ?? 0) + 1

/**
 * Depois de uma vitória da Arena (chamar DENTRO da transação da luta).
 * Devolve o save com a garantia atualizada e, se saiu, o prêmio aplicado.
 */
export function arenaDrop(user: UserRow, s: GameState, difficulty: number): { state: GameState; drop?: DropResult } {
  const o = dropOdds()
  if (!o.on) return { state: s }
  // QA (só fora de produção): `devDropTier` no save (sqlite json_set) força um drop desse tier
  const dev = isProd() ? undefined : (s as GameState & { devDropTier?: string }).devDropTier
  const forced = DROP_TIERS.find((x) => x === dev)
  if (dev !== undefined) {
    s = { ...s }
    delete (s as GameState & { devDropTier?: string }).devDropTier
  }
  // Limite diário: não sorteia nem conta para a garantia
  if (!forced && todayCount(user.id) >= o.dailyCap) return { state: s }
  const pity = Math.max(0, Math.floor(s.dropPity ?? 0))
  if (!forced && !shouldDrop(pity, difficulty, rng, o)) return { state: { ...s, dropPity: pity + 1 } }
  const tier = forced ?? rollTier(rng, o)
  const soldOut = (kind: 'skin' | 'galo', id: string) => o.supplyCap > 0 && issued(kind, id) >= o.supplyCap
  const c = rollContents(tier, s, rng, soldOut)
  const kind = c.kind === 'tools' ? 'tools' : c.kind
  const itemId = c.kind === 'galo' ? c.breedId! : c.kind === 'skin' ? c.skinId! : Object.keys(c.tools ?? {}).join(',')
  const serial = hasSerial(c) ? nextSerial(kind, itemId) : undefined
  const out = applyDrop(s, c, rng, serial)
  db()
    .prepare('INSERT INTO drops (user_id, name, item_kind, item_id, tier, serial, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, String(s.player?.name || user.name || '').slice(0, 40), kind, itemId.slice(0, 200), c.tier, serial ?? null, Date.now())
  return out
}

/** Conta excluída: o drop fica (nº de série não se repete), mas sem o nome. */
export function dropsDeleteUser(userId: string) {
  db().prepare("UPDATE drops SET user_id = 'excluido', name = '' WHERE user_id = ?").run(userId)
}

let cache: { at: number; list: RecentDrop[] } | null = null

/** GET /api/drops/recent: últimos drops épicos/lendários (feed público da Arena). */
export function handleDrops(path: string, method: string, u: UserRow): { status?: number; body: unknown } | null {
  if (path === '/api/drops/recent' && method === 'GET') {
    if (limited(`drops-feed:${u.id}`, 30, 60_000)) return { status: 429, body: { error: t('Muitas operações seguidas. Espere um pouco.') } }
    // Cache curto: todo mundo na Arena lê o mesmo feed
    if (!cache || Date.now() - cache.at > 10_000) {
      const rows = db()
        .prepare("SELECT name, item_kind, item_id, tier, serial, created_at FROM drops WHERE serial IS NOT NULL AND user_id != 'excluido' AND tier IN ('epico', 'lendario') ORDER BY id DESC LIMIT 20")
        .all() as { name: string; item_kind: 'skin' | 'galo'; item_id: string; tier: RecentDrop['tier']; serial: number; created_at: number }[]
      cache = { at: Date.now(), list: rows.map((r) => ({ name: r.name, kind: r.item_kind, itemId: r.item_id, tier: r.tier, serial: r.serial, at: r.created_at })) }
    }
    return { body: { drops: cache!.list } }
  }
  return null
}
