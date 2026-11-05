import { randomUUID } from 'node:crypto'
import { simulate } from '../src/game/battle'
import { challengeTtl, maxLevelDiff, ONLINE_WINDOW, pvpDailyRewards, PVP_ENERGY, levelsMatch, pvpRewards, type ChallengeView, type LobbyEntry, type PvpRewards } from '../src/game/pvp'
import { addXp, currentEnergy, today, uid, withEnergy } from '../src/game/rooster'
import type { GameState, MissionKind, Rooster } from '../src/game/types'
import { getDb, type UserRow } from './db'
import { loadSave, writeSave } from './saves'
import { addPassXp, PASS_XP } from '../src/game/pass'
import { betsNotice } from './bets'
import { feiraNotices } from './feira'
import { t } from '../src/i18n'

export class PvpError extends Error {}
const fail = (m: string): never => {
  throw new PvpError(m)
}

interface ChallengeRow {
  id: string
  from_user: string
  to_user: string
  from_rooster: string
  to_rooster: string
  status: ChallengeView['status']
  created_at: number
  expires_at: number
  resolved_at: number | null
  seed: number | null
  result: string | null
  seen_from: number
  seen_to: number
}

const db = () => getDb()
const now = () => Date.now()

function touch(userId: string) {
  db().prepare('INSERT INTO presence (user_id, last_seen) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET last_seen = excluded.last_seen').run(userId, now())
}

function expireOld() {
  db().prepare("UPDATE challenges SET status = 'expirado', resolved_at = ? WHERE status = 'pendente' AND expires_at < ?").run(now(), now())
}

function isOnline(userId: string) {
  const r = db().prepare('SELECT last_seen FROM presence WHERE user_id = ?').get(userId) as { last_seen: number } | undefined
  return !!r && now() - r.last_seen < ONLINE_WINDOW
}

const userName = (id: string) => (db().prepare('SELECT name FROM users WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? t('Criador')

function busyRoosters(): Set<string> {
  const rows = db().prepare("SELECT from_rooster, to_rooster FROM challenges WHERE status = 'pendente'").all() as { from_rooster: string; to_rooster: string }[]
  return new Set(rows.flatMap((r) => [r.from_rooster, r.to_rooster]))
}

function findRooster(userId: string, roosterId: string): Rooster | null {
  return loadSave(userId)?.state.roosters.find((r) => r.id === roosterId) ?? null
}

/** Cópia "pública" do galo: sem dados que não interessam ao adversário. */
const snap = (r: Rooster): Rooster => ({ ...r, lucky: 0 })

function view(c: ChallengeRow, me: string): ChallengeView {
  const mine = c.from_user === me ? 'from' : 'to'
  const res = c.result ? JSON.parse(c.result) : null
  const a = res?.a ?? findRooster(c.from_user, c.from_rooster)
  const b = res?.b ?? findRooster(c.to_user, c.to_rooster)
  return {
    id: c.id,
    status: c.status,
    mine,
    fromName: userName(c.from_user),
    toName: userName(c.to_user),
    a: a ? snap(a) : a,
    b: b ? snap(b) : b,
    createdAt: c.created_at,
    expiresAt: c.expires_at,
    seed: c.seed ?? undefined,
    result: res ? { winner: res.winner, method: res.method, rewards: mine === 'from' ? res.rewardsFrom : res.rewardsTo } : undefined,
    reason: res?.reason,
  }
}

function rewardedToday(userId: string) {
  const start = new Date(today()).getTime()
  const r = db()
    .prepare("SELECT COUNT(*) AS n FROM challenges WHERE status = 'aceito' AND resolved_at >= ? AND (from_user = ? OR to_user = ?)")
    .get(start, userId, userId) as { n: number }
  return r.n
}

const bump = (s: GameState, kind: MissionKind): GameState => ({
  ...s,
  missions: { ...s.missions, list: s.missions.list.map((m) => (m.kind === kind && !m.claimed ? { ...m, progress: Math.min(m.goal, m.progress + 1) } : m)) },
})

/** Aplica o resultado do desafio no save de um jogador. */
function applyResult(s: GameState, roosterId: string, won: boolean, ko: boolean, oppName: string, limited: boolean): { state: GameState; rewards: PvpRewards } {
  const ro = s.roosters.find((r) => r.id === roosterId)!
  const base = pvpRewards(ro.level, won, ko)
  const rw = limited ? { milho: 0, xp: 0, points: 0 } : base
  const { levels } = addXp(ro, rw.xp)
  let n: GameState = {
    ...s,
    milho: s.milho + rw.milho,
    roosters: s.roosters.map((r) =>
      r.id === roosterId
        ? {
            ...withEnergy(addXp(r, rw.xp).rooster, currentEnergy(r) - PVP_ENERGY),
            wins: r.wins + (won ? 1 : 0),
            losses: r.losses + (won ? 0 : 1),
            kos: r.kos + (won && ko ? 1 : 0),
          }
        : r,
    ),
    league: { ...s.league, points: Math.max(0, s.league.points + rw.points) },
    stats: { ...s.stats, fights: s.stats.fights + 1, wins: s.stats.wins + (won ? 1 : 0), kos: s.stats.kos + (won && ko ? 1 : 0), milhoEarned: s.stats.milhoEarned + rw.milho },
  }
  n = bump(n, 'lutar')
  if (won) n = bump(n, 'vencer')
  if (won && ko) n = bump(n, 'ko')
  n = addPassXp(n, PASS_XP.desafio)
  n = { ...n, history: [{ id: uid(), at: now(), text: won ? t('Desafio vencido contra {nome}', { nome: oppName }) : t('Desafio perdido contra {nome}', { nome: oppName }), milho: rw.milho, ovo: 0 }, ...n.history].slice(0, 80) }
  return { state: n, rewards: { ...rw, levels, limited } }
}

function getChallenge(id: string) {
  return (db().prepare('SELECT * FROM challenges WHERE id = ?').get(id) as unknown as ChallengeRow | undefined) ?? fail(t('Desafio não encontrado'))
}

export function handlePvp(path: string, method: string, url: URL, body: Record<string, unknown>, u: UserRow): { status?: number; body: unknown } | null {
  touch(u.id)
  expireOld()

  // Sinal de vida + novidades (chamado a cada poucos segundos)
  if (path === '/api/pvp/poll' && method === 'GET') {
    const incoming = db().prepare("SELECT * FROM challenges WHERE to_user = ? AND status = 'pendente' ORDER BY created_at").all(u.id) as unknown as ChallengeRow[]
    const outgoing = db().prepare("SELECT * FROM challenges WHERE from_user = ? AND status = 'pendente' LIMIT 1").get(u.id) as unknown as ChallengeRow | undefined
    const updates = db()
      .prepare("SELECT * FROM challenges WHERE from_user = ? AND seen_from = 0 AND status != 'pendente' ORDER BY resolved_at DESC LIMIT 5")
      .all(u.id) as unknown as ChallengeRow[]
    const online = (db().prepare('SELECT COUNT(*) AS n FROM presence WHERE last_seen > ? AND user_id != ?').get(now() - ONLINE_WINDOW, u.id) as { n: number }).n
    return {
      body: {
        incoming: incoming.map((c) => view(c, u.id)).filter((v) => v.a && v.b),
        outgoing: outgoing ? view(outgoing, u.id) : null,
        updates: updates.map((c) => view(c, u.id)),
        online,
        bets: betsNotice(u.id),
        feira: feiraNotices(u.id),
      },
    }
  }

  // Galos de jogadores online com nível compatível
  if (path === '/api/pvp/lobby' && method === 'GET') {
    const mine = findRooster(u.id, url.searchParams.get('roosterId') ?? '') ?? fail(t('Escolha um dos seus galos'))
    const busy = busyRoosters()
    const users = db().prepare('SELECT user_id FROM presence WHERE last_seen > ? AND user_id != ?').all(now() - ONLINE_WINDOW, u.id) as { user_id: string }[]
    const out: LobbyEntry[] = []
    for (const { user_id } of users) {
      const save = loadSave(user_id)
      if (!save) continue
      for (const r of save.state.roosters) {
        if (!levelsMatch(r.level, mine.level) || busy.has(r.id) || currentEnergy(r) < PVP_ENERGY) continue
        out.push({ userId: user_id, name: userName(user_id), avatar: save.state.player.avatar, rooster: snap(r) })
      }
    }
    out.sort((x, y) => Math.abs(x.rooster.level - mine.level) - Math.abs(y.rooster.level - mine.level))
    return { body: { players: out.slice(0, 40), myLevel: mine.level } }
  }

  // Enviar desafio
  if (path === '/api/pvp/challenge' && method === 'POST') {
    const mine = findRooster(u.id, String(body.roosterId)) ?? fail(t('Galo não encontrado'))
    const toUser = String(body.toUserId)
    if (toUser === u.id) fail(t('Você não pode desafiar a si mesmo'))
    const theirs = findRooster(toUser, String(body.toRoosterId)) ?? fail(t('Esse galo não está mais disponível'))
    if (!levelsMatch(mine.level, theirs.level)) fail(t('Só é possível desafiar galos de nível parecido (diferença máxima de {max}). {galo} é nível {nivel}.', { max: maxLevelDiff(), galo: mine.name, nivel: mine.level }))
    if (!isOnline(toUser)) fail(t('Esse jogador saiu. Escolha outro adversário.'))
    if (currentEnergy(mine) < PVP_ENERGY) fail(t('{galo} precisa de {n} de energia.', { galo: mine.name, n: PVP_ENERGY }))
    if (currentEnergy(theirs) < PVP_ENERGY) fail(t('O galo adversário está sem energia.'))
    if (db().prepare("SELECT 1 FROM challenges WHERE from_user = ? AND status = 'pendente'").get(u.id)) fail(t('Você já tem um desafio esperando resposta.'))
    const busy = busyRoosters()
    if (busy.has(mine.id) || busy.has(theirs.id)) fail(t('Um dos galos já está em outro desafio.'))
    const id = randomUUID()
    db()
      .prepare('INSERT INTO challenges (id, from_user, to_user, from_rooster, to_rooster, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, u.id, toUser, mine.id, theirs.id, 'pendente', now(), now() + challengeTtl())
    return { status: 201, body: { challenge: view(getChallenge(id), u.id) } }
  }

  // Aceitar ou recusar
  if (path === '/api/pvp/respond' && method === 'POST') {
    const c = getChallenge(String(body.id))
    if (c.to_user !== u.id) fail(t('Esse desafio não é para você'))
    if (c.status !== 'pendente') fail(t('Esse desafio não está mais valendo'))
    if (body.accept !== true) {
      db().prepare("UPDATE challenges SET status = 'recusado', resolved_at = ?, seen_to = 1 WHERE id = ?").run(now(), c.id)
      return { body: { challenge: view(getChallenge(c.id), u.id) } }
    }
    const fromSave = loadSave(c.from_user)
    const toSave = loadSave(c.to_user)
    const a = fromSave?.state.roosters.find((r) => r.id === c.from_rooster)
    const b = toSave?.state.roosters.find((r) => r.id === c.to_rooster)
    const cancel = (reason: string) => {
      db().prepare("UPDATE challenges SET status = 'cancelado', resolved_at = ?, seen_to = 1, result = ? WHERE id = ?").run(now(), JSON.stringify({ reason }), c.id)
      return fail(reason)
    }
    if (!fromSave || !toSave || !a || !b) return cancel(t('Um dos galos não existe mais.'))
    if (!levelsMatch(a.level, b.level)) return cancel(t('Os galos não têm mais nível parecido.'))
    if (currentEnergy(a) < PVP_ENERGY || currentEnergy(b) < PVP_ENERGY) return cancel(t('Um dos galos ficou sem energia.'))

    const seed = Math.floor(Math.random() * 1e9)
    const res = simulate(a, b, seed)
    const ko = res.method === 'ko'
    const fromName = userName(c.from_user)
    const toName = userName(c.to_user)
    const ra = applyResult(fromSave.state, a.id, res.winner === 0, ko, toName, rewardedToday(c.from_user) >= pvpDailyRewards())
    const rb = applyResult(toSave.state, b.id, res.winner === 1, ko, fromName, rewardedToday(c.to_user) >= pvpDailyRewards())
    const d = db()
    d.exec('BEGIN')
    try {
      writeSave(c.from_user, ra.state, fromSave.rev + 1)
      writeSave(c.to_user, rb.state, toSave.rev + 1)
      const result = { winner: res.winner, method: res.method, a: snap(a), b: snap(b), rewardsFrom: ra.rewards, rewardsTo: rb.rewards }
      d.prepare("UPDATE challenges SET status = 'aceito', resolved_at = ?, seed = ?, result = ?, seen_to = 1 WHERE id = ?").run(now(), seed, JSON.stringify(result), c.id)
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    return { body: { challenge: view(getChallenge(c.id), u.id) } }
  }

  // Cancelar desafio enviado
  if (path === '/api/pvp/cancel' && method === 'POST') {
    const c = getChallenge(String(body.id))
    if (c.from_user !== u.id || c.status !== 'pendente') fail(t('Não dá para cancelar esse desafio'))
    db().prepare("UPDATE challenges SET status = 'cancelado', resolved_at = ?, seen_from = 1 WHERE id = ?").run(now(), c.id)
    return { body: { ok: true } }
  }

  // Marcar novidade como vista
  if (path === '/api/pvp/seen' && method === 'POST') {
    db().prepare('UPDATE challenges SET seen_from = 1 WHERE id = ? AND from_user = ?').run(String(body.id), u.id)
    return { body: { ok: true } }
  }

  // Últimos desafios disputados
  if (path === '/api/pvp/history' && method === 'GET') {
    const rows = db()
      .prepare("SELECT * FROM challenges WHERE status = 'aceito' AND (from_user = ? OR to_user = ?) ORDER BY resolved_at DESC LIMIT 20")
      .all(u.id, u.id) as unknown as ChallengeRow[]
    return { body: { history: rows.map((c) => view(c, u.id)) } }
  }

  return null
}
