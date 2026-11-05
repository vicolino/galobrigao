// Ranking de galinheiros por valor e vitrine pública do jogador.
import { LEAGUE_TIERS } from '../src/game/data'
import { migrate } from '../src/game/engine'
import type { GameState, Rooster } from '../src/game/types'
import { coopWorth, roosterValue } from '../src/game/worth'
import { t } from '../src/i18n'
import { getDb, type UserRow } from './db'

const CACHE_MS = 5 * 60_000
const TOP = 50

/** Visual público de um galo (para desenhar). */
const look = (r: Rooster) => ({
  id: r.id,
  name: r.name,
  breedId: r.breedId,
  level: r.level,
  stars: r.stars,
  skin: r.skin ?? null,
  equipped: r.equipped ?? {},
  tint: r.tint ?? null,
  wins: r.wins,
  value: roosterValue(r),
})
export type PublicRooster = ReturnType<typeof look>

export interface RankRow {
  id: string
  name: string
  avatar: string
  total: number
  roosters: number
  best: PublicRooster | null
}

let cache: { at: number; rows: RankRow[] } | null = null

const safe = (data: string): GameState | null => {
  try {
    return migrate(JSON.parse(data))
  } catch {
    return null
  }
}
const best = (s: GameState) => {
  const top = [...s.roosters].sort((a, b) => roosterValue(b) - roosterValue(a))[0]
  return top ? look(top) : null
}

function ranking(): RankRow[] {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows
  const rows = getDb().prepare('SELECT s.user_id AS id, s.data AS data, u.name AS uname FROM saves s JOIN users u ON u.id = s.user_id WHERE u.banned_at IS NULL').all() as { id: string; data: string; uname: string }[]
  const out: RankRow[] = []
  for (const r of rows) {
    const s = safe(r.data)
    if (!s || !Array.isArray(s.roosters)) continue
    out.push({ id: r.id, name: s.player?.name || r.uname, avatar: s.player?.avatar ?? '🧑‍🌾', total: coopWorth(s).total, roosters: s.roosters.length, best: best(s) })
  }
  out.sort((a, b) => b.total - a.total)
  cache = { at: Date.now(), rows: out }
  return out
}

export class CriacaoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function handleCriacao(path: string, method: string, user: UserRow): { status?: number; body: unknown } | null {
  if (path === '/api/ranking' && method === 'GET') {
    // Banidos saem na hora (mesmo com o cache)
    const banned = new Set((getDb().prepare('SELECT id FROM users WHERE banned_at IS NOT NULL').all() as { id: string }[]).map((r) => r.id))
    const all = banned.size ? ranking().filter((r) => !banned.has(r.id)) : ranking()
    const i = all.findIndex((r) => r.id === user.id)
    return { body: { top: all.slice(0, TOP), total: all.length, me: i >= 0 ? { pos: i + 1, ...all[i] } : null, at: cache?.at ?? Date.now() } }
  }
  const m = path.match(/^\/api\/players\/([\w-]{1,64})\/showcase$/)
  if (m && method === 'GET') {
    const row = getDb().prepare('SELECT s.data AS data, u.name AS uname FROM saves s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? AND u.banned_at IS NULL').get(m[1]) as { data: string; uname: string } | undefined
    const s = row && safe(row.data)
    if (!s) throw new CriacaoError(404, t('Jogador não encontrado'))
    const tier = [...LEAGUE_TIERS].reverse().find((x) => (s.league?.points ?? 0) >= x.min) ?? LEAGUE_TIERS[0]
    const pos = ranking().findIndex((r) => r.id === m[1])
    return {
      body: {
        id: m[1],
        name: s.player?.name || row!.uname,
        avatar: s.player?.avatar ?? '🧑‍🌾',
        since: s.player?.createdAt ?? null,
        worth: coopWorth(s).total,
        pos: pos >= 0 ? pos + 1 : null,
        achievements: s.achievements?.length ?? 0,
        tier: { name: tier.name, emoji: tier.emoji },
        wins: s.stats?.wins ?? 0,
        fights: s.stats?.fights ?? 0,
        count: s.roosters.length,
        roosters: [...s.roosters].sort((a, b) => roosterValue(b) - roosterValue(a)).slice(0, 6).map(look),
      },
    }
  }
  return null
}
