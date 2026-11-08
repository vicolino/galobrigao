// 🌽 Arena no servidor: adversários gerados e guardados aqui, luta simulada com semente do servidor,
// prêmios aplicados no save guardado. O navegador só assiste ao replay.
import { randomInt } from 'node:crypto'
import { makeOpponent, opponentTools, tick, type Difficulty } from '../src/game/engine'
import { arenaFight, type ArenaOpp } from '../src/game/economia'
import { npcOwners } from '../src/game/data'
import { pick } from '../src/game/rooster'
import type { GameState } from '../src/game/types'
import { t, withLang, type Lang } from '../src/i18n'
import { bumpDaily, getDb, type UserRow } from './db'
import { loadSave, writeSave } from './saves'
import { limited } from './security'
import { rentalShare } from './aluguel'
import { emit } from './emissions'
import { arenaDrop } from './drops'
import type { DropResult } from '../src/game/drops'

export class EconomiaError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

/** Adversários valem 15 min; depois disso, gera de novo. */
const OPP_TTL = 15 * 60_000

let ready = false
function db() {
  const d = getDb()
  if (!ready) {
    d.exec('CREATE TABLE IF NOT EXISTS arena_opps (user_id TEXT NOT NULL, rooster_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, rooster_id))')
    ready = true
  }
  return d
}

const fail = (msg: string, status = 400): never => {
  throw new EconomiaError(status, msg)
}

function storedOpps(userId: string, roosterId: string): ArenaOpp[] | null {
  const row = db().prepare('SELECT data, created_at FROM arena_opps WHERE user_id = ? AND rooster_id = ?').get(userId, roosterId) as { data: string; created_at: number } | undefined
  if (!row || Date.now() - row.created_at > OPP_TTL) return null
  return JSON.parse(row.data) as ArenaOpp[]
}

function genOpps(userId: string, s: GameState, roosterId: string, lang: Lang): ArenaOpp[] {
  const mine = s.roosters.find((r) => r.id === roosterId) ?? fail(t('Galo não encontrado'), 404)
  const opps = withLang(lang, () =>
    ([0, 1, 2, 3] as const).map((d) => {
      const o = makeOpponent(mine, d)
      o.owner = pick(npcOwners())
      return { d, o, tools: opponentTools(d) }
    }),
  )
  const d = db()
  d.prepare('DELETE FROM arena_opps WHERE created_at < ?').run(Date.now() - OPP_TTL)
  d.prepare('INSERT INTO arena_opps (user_id, rooster_id, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, rooster_id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at').run(
    userId,
    roosterId,
    JSON.stringify(opps),
    Date.now(),
  )
  return opps
}

export function arenaDeleteUser(userId: string) {
  db().prepare('DELETE FROM arena_opps WHERE user_id = ?').run(userId)
}

export function handleEconomia(path: string, method: string, url: URL, body: Record<string, unknown>, u: UserRow, lang: Lang): { status?: number; body: unknown } | null {
  // ----- Adversários da Arena -----
  if (path === '/api/arena/opponents' && method === 'GET') {
    const roosterId = String(url.searchParams.get('roosterId') ?? '')
    const fresh = url.searchParams.get('fresh') === '1'
    const cur = loadSave(u.id) ?? fail(t('Sem galinheiro'), 409)
    if (!cur.state.roosters.some((r) => r.id === roosterId)) fail(t('Galo não encontrado'), 404)
    const kept = fresh ? null : storedOpps(u.id, roosterId)
    if (kept) return { body: { opponents: kept } }
    // "Outros adversários" tem limite próprio; gerar em geral também (cada geração simula centenas de lutas)
    if (fresh && limited(`arena-fresh:${u.id}`, 12, 60_000)) fail(t('Calma! Espere um pouco antes de trocar de adversários.'), 429)
    if (limited(`arena-gen:${u.id}`, 40, 60_000)) fail(t('Muitas operações seguidas. Espere um pouco.'), 429)
    return { body: { opponents: genOpps(u.id, cur.state, roosterId, lang) } }
  }

  // ----- Luta da Arena -----
  if (path === '/api/arena/fight' && method === 'POST') {
    if (limited(`arena-fight:${u.id}`, 30, 60_000)) fail(t('Muitas lutas seguidas. Espere um pouco.'), 429)
    const roosterId = String(body.roosterId ?? '')
    const difficulty = Number(body.difficulty) as Difficulty
    if (![0, 1, 2, 3].includes(difficulty)) fail(t('Dificuldade inválida'))
    const tools = Array.isArray(body.tools) ? body.tools.map(String) : []
    const d = getDb()
    let out: { rev: number; state: GameState; match: ReturnType<typeof arenaFight>['match'] & { drop?: DropResult } }
    d.exec('BEGIN')
    try {
      const cur = loadSave(u.id) ?? fail(t('Sem galinheiro'), 409)
      const opps = storedOpps(u.id, roosterId) ?? fail(t('Os adversários mudaram. Escolha de novo.'), 409)
      const opp = opps.find((x) => x.d === difficulty) ?? fail(t('Os adversários mudaram. Escolha de novo.'), 409)
      const seed = randomInt(1, 1_000_000_000)
      const r = arenaFight(tick(cur.state), roosterId, opp.o, difficulty, tools, opp.tools, seed, (m) => fail(m))
      out = { rev: cur.rev + 1, state: r.state, match: r.match }
      // 🎁 Drop raro (só vitória; sorteio no servidor, mesma transação)
      if (r.match.won) {
        const dr = arenaDrop(u, out.state, difficulty)
        out = { ...out, state: dr.state, match: { ...out.match, ...(dr.drop ? { drop: dr.drop } : {}) } }
      }
      writeSave(u.id, out.state, out.rev)
      // Adversários usados: a próxima visita à Arena gera outros, calibrados pelo nível novo
      db().prepare('DELETE FROM arena_opps WHERE user_id = ? AND rooster_id = ?').run(u.id, roosterId)
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    bumpDaily('arena') // 📊 conta a luta da Arena do dia (métrica do backoffice)
    // 🚰 Emissão: o milho/ovo que a Arena cria e dá ao jogador (torneira). Fora da transação do save,
    // mas o prêmio já foi commitado acima; registramos só o que foi realmente emitido (> 0).
    emit('arena', 'milho', out.match.rewards.milho, u.id)
    emit('arena', 'ovo', out.match.rewards.ovo, u.id)
    // 🔑 Galo alugado: parte do milho vai para o dono (server/aluguel.ts). Mexe no save → relê.
    if (out.state.roosters.find((x) => x.id === roosterId)?.rental && out.match.rewards.milho > 0) {
      try {
        if (rentalShare(u.id, roosterId, out.match.rewards.milho) > 0) {
          const after = loadSave(u.id)
          if (after) out = { ...out, rev: after.rev, state: after.state }
        }
      } catch (e) {
        console.error('[arena] parte do aluguel', e)
      }
    }
    return { body: out }
  }
  return null
}
