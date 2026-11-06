// Lógica pura do jogo (sem React). Usada pelo navegador e pelo servidor.
import { ACCESSORIES, ACHIEVEMENTS, BREED_BY_ID, ELECTION_ROOSTERS, SKINS, SKIN_BY_ID, npcOwners } from './data'
import { estimate, toOdds } from './battle'
import { makeRooster, pick, rarityRank, rng, today, uid } from './rooster'
import { missionOvos } from './rewards'
import { live } from './config'
import { lang, t } from '../i18n'
import type { GameState, HouseFight, LeagueRow, Mission, MissionKind, Rarity, Rooster, Slot } from './types'
import { freshPass, seasonId as passSeason } from './pass'

export const VERSION = 1

// ---------- Helpers de geração ----------

export function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function seasonId(d = new Date()) {
  // Temporada semanal: número da semana desde 2024-01-01
  return Math.floor((d.getTime() - Date.UTC(2024, 0, 1)) / (7 * 864e5))
}

// Textos das missões ficam SEMPRE em português no save; a tela traduz com tx() (chaves em i18n/en).
const MISSION_POOL: { kind: MissionKind; text: (n: number) => string; goals: number[]; reward: (n: number) => { milho: number; ovo: number } }[] = [
  { kind: 'vencer', text: (n) => `Vença ${n} luta${n > 1 ? 's' : ''} na Arena`, goals: [1, 2, 3], reward: (n) => ({ milho: 400 * n, ovo: 2 * n }) }, // i18n-ok (salvo em pt, traduzido com tx)
  { kind: 'lutar', text: (n) => `Dispute ${n} lutas`, goals: [2, 3, 5], reward: (n) => ({ milho: 200 * n, ovo: 3 }) }, // i18n-ok (salvo em pt, traduzido com tx)
  { kind: 'apostar', text: (n) => `Faça ${n} apostas`, goals: [2, 3, 4], reward: (n) => ({ milho: 180 * n, ovo: 3 }) }, // i18n-ok (salvo em pt, traduzido com tx)
  { kind: 'ganhar_aposta', text: (n) => `Ganhe ${n} aposta${n > 1 ? 's' : ''}`, goals: [1, 2], reward: (n) => ({ milho: 500 * n, ovo: 2 * n + 1 }) }, // i18n-ok (salvo em pt, traduzido com tx)
  { kind: 'treinar', text: (n) => `Treine seus galos ${n} vezes`, goals: [2, 3], reward: (n) => ({ milho: 250 * n, ovo: 3 }) }, // i18n-ok (salvo em pt, traduzido com tx)
  { kind: 'comprar', text: () => 'Compre qualquer item na Loja', goals: [1], reward: () => ({ milho: 300, ovo: 3 }) }, // i18n-ok (salvo em pt, traduzido com tx)
  { kind: 'equipar', text: () => 'Equipe um acessório em um galo', goals: [1], reward: () => ({ milho: 300, ovo: 3 }) }, // i18n-ok (salvo em pt, traduzido com tx)
  { kind: 'assistir', text: (n) => `Assista ${n} lutas da casa`, goals: [1, 2], reward: (n) => ({ milho: 220 * n, ovo: 2 * n }) }, // i18n-ok (salvo em pt, traduzido com tx)
  { kind: 'ko', text: () => 'Vença uma luta por K.O.', goals: [1], reward: () => ({ milho: 700, ovo: 5 }) }, // i18n-ok (salvo em pt, traduzido com tx)
]

export function genMissions(day: string): Mission[] {
  const r = rng(hashStr(day))
  // Embaralhamento determinístico (Fisher-Yates). NÃO usar sort(() => r() - 0.5):
  // o resultado de um comparador aleatório varia entre versões do V8, então navegador (Chrome)
  // e servidor (Node) geravam missões DIFERENTES no mesmo dia — recusando o save ('missão') e
  // prendendo o jogador num loop de "recarregando". Fisher-Yates dá o mesmo resultado em qualquer V8.
  const pool = [...MISSION_POOL]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 5).map((m, i) => {
    const goal = pick(m.goals, r)
    const rw = m.reward(goal)
    // id determinístico: navegador e servidor geram as mesmas missões no mesmo dia
    return { id: `${day}-${i}`, kind: m.kind, text: m.text(goal), goal, progress: 0, reward: { milho: rw.milho, ovo: missionOvos(rw.ovo) }, claimed: false }
  })
}

export function genLeagueRows(season: number): LeagueRow[] {
  const r = rng(season * 7777)
  const names = [...npcOwners()].sort(() => r() - 0.5).slice(0, 9)
  return names.map((n) => ({ id: uid(), name: n, points: Math.floor(r() * 120) }))
}

export function growLeague(rows: LeagueRow[], fromDay: string, toDay: string): LeagueRow[] {
  const days = Math.max(0, Math.round((Date.parse(toDay) - Date.parse(fromDay)) / 864e5))
  if (!days) return rows
  return rows.map((row) => {
    if (row.isPlayer) return row
    let p = row.points
    for (let d = 0; d < days; d++) p += 40 + Math.floor(Math.random() * 160)
    return { ...row, points: p }
  })
}

export function genMarket(): Rooster[] {
  const list: Rooster[] = []
  for (let i = 0; i < 6; i++) {
    const roll = Math.random()
    const rarityMax: Rarity = roll < 0.06 ? 'lendario' : roll < 0.22 ? 'epico' : roll < 0.55 ? 'raro' : 'comum'
    let ro = makeRooster({ rarityMax, owner: t('Mercado'), level: 1 + Math.floor(Math.random() * 4) })
    // força pelo menos algumas raridades altas aparecerem
    if (rarityRank(BREED_BY_ID[ro.breedId].rarity) < rarityRank(rarityMax) && Math.random() < 0.5) {
      ro = makeRooster({ rarityMax, owner: t('Mercado'), level: ro.level })
    }
    list.push(ro)
  }
  return list
}

/** Barbudo Vermelho x Capitão Verde-Amarelo com atributos idênticos: odds praticamente 50/50. */
export function electionFight(): HouseFight {
  const lvl = 8
  const [a, b] = ELECTION_ROOSTERS.map((e) => {
    const r = makeRooster({ breedId: e.breedId, name: e.name, level: lvl, stars: 3, owner: t('Edição Eleições') })
    return { ...r, base: { ...BREED_BY_ID[e.breedId].base }, style: 'equilibrado' as const }
  })
  const est = estimate(a, b, 200)
  // Lados sorteados e odds iguais: nenhum dos dois é favorecido.
  const [left, right] = Math.random() < 0.5 ? [a, b] : [b, a]
  return {
    id: uid(),
    a: left,
    b: right,
    oddsA: toOdds(0.5),
    oddsB: toOdds(0.5),
    oddsKo: toOdds(est.pKo),
    seed: Math.floor(Math.random() * 1e9),
    status: 'aberta',
    featured: true,
  }
}

/** Uma luta da casa com odds equilibradas. `principal` = luta de destaque, galos mais fortes. */
export function houseFight(principal = false): HouseFight {
  const lvl = principal ? 10 + Math.floor(Math.random() * 16) : 2 + Math.floor(Math.random() * 14)
  const a = makeRooster({ level: lvl, stars: principal ? 3 + Math.floor(Math.random() * 3) : undefined })
  if (principal || Math.random() < 0.5) a.equipped = randomGear()
  if (Math.random() < (principal ? 0.4 : 0.18)) a.skin = pick(SKINS).id
  // Procura o adversário mais equilibrado (chances entre 25% e 75%) para as odds ficarem interessantes
  let b = a
  let est = { pA: 1, pKo: 1 }
  for (let tries = 0; tries < 12; tries++) {
    let c: Rooster
    if (tries % 2 === 1 && b !== a) {
      // Ajusta o nível do melhor candidato: se A está ganhando demais, o adversário sobe de nível
      const gap = est.pA - 0.5
      c = { ...b, id: uid(), level: Math.max(1, b.level + Math.sign(gap) * Math.max(1, Math.round(Math.abs(gap) * 10))) }
    } else {
      c = makeRooster({ level: Math.max(1, lvl + Math.floor(Math.random() * 3) - 1), stars: principal ? 3 + Math.floor(Math.random() * 3) : undefined })
      if (c.name === a.name) continue
      if (principal || Math.random() < 0.5) c.equipped = randomGear()
      c.skin = Math.random() < (principal ? 0.4 : 0.18) ? pick(SKINS).id : undefined
    }
    const e = estimate(a, c, 160)
    if (Math.abs(e.pA - 0.5) < Math.abs(est.pA - 0.5)) {
      b = c
      est = e
    }
    if (est.pA > 0.25 && est.pA < 0.75) break
  }
  return {
    id: uid(),
    a,
    b,
    oddsA: toOdds(est.pA),
    oddsB: toOdds(1 - est.pA),
    oddsKo: toOdds(est.pKo),
    seed: Math.floor(Math.random() * 1e9),
    status: 'aberta',
    featured: principal,
  }
}

export function genCard(): HouseFight[] {
  const fights: HouseFight[] = []
  if (Math.random() < 0.6) fights.push(electionFight())
  for (let i = fights.length; i < 6; i++) fights.push(houseFight(i === 0))
  return fights
}

export function randomGear(): Partial<Record<Slot, string>> {
  const g: Partial<Record<Slot, string>> = {}
  for (const slot of ['cabeca', 'rosto', 'corpo', 'pes'] as Slot[]) {
    if (Math.random() < 0.45) g[slot] = pick(ACCESSORIES.filter((a) => a.slot === slot)).id
  }
  return g
}

export type Difficulty = 0 | 1 | 2 | 3
/** Chance de vitória que cada dificuldade tenta oferecer (Fácil, Médio, Difícil, Chefão). */
export const ARENA_TARGETS = [0.72, 0.5, 0.3, 0.13]

/** Faixa de nível do adversário em relação ao seu galo (Fácil, Médio, Difícil, Chefão): sempre em ordem. */
export const ARENA_LEVEL_BAND: [number, number][] = [
  [-4, -2],
  [-1, 1],
  [2, 3],
  [4, 6],
]

/**
 * Adversário calibrado pela força do SEU galo. O nível fica numa faixa perto do seu
 * (Fácil abaixo, Chefão acima, sempre em ordem) e a força fina é ajustada nos atributos,
 * simulando lutas até a chance de vitória chegar perto do alvo da dificuldade.
 */
export function makeOpponent(mine: Rooster, difficulty: Difficulty): Rooster {
  const target = ARENA_TARGETS[difficulty]
  const chance = (o: Rooster) => estimate(mine, o, 120).pA
  const [a, b] = ARENA_LEVEL_BAND[difficulty]
  const level = Math.max(1, Math.min(70, mine.level + a + Math.floor(Math.random() * (b - a + 1))))
  const o0 = makeRooster({
    level,
    stars: Math.min(5, [1 + Math.floor(Math.random() * 2), 2 + Math.floor(Math.random() * 2), 3 + Math.floor(Math.random() * 3), 4 + Math.floor(Math.random() * 2)][difficulty]),
    rarityMax: difficulty >= 2 ? 'lendario' : undefined,
  })
  if (difficulty > 0) o0.equipped = randomGear()
  if (Math.random() < 0.12 + difficulty * 0.1) o0.skin = pick(SKINS).id
  const scaled = (k: number): Rooster => ({
    ...o0,
    base: { hp: Math.round(o0.base.hp * k), atk: Math.max(1, Math.round(o0.base.atk * k)), def: Math.max(1, Math.round(o0.base.def * k)), spd: Math.max(1, Math.round(o0.base.spd * k)) },
  })
  // Busca binária no multiplicador dos atributos (mais fraco ↔ mais forte) até acertar a chance
  let lo = 0.25
  let hi = 3
  let best = { o: o0, err: Math.abs(chance(o0) - target) }
  if (best.err >= 0.04) {
    for (let i = 0; i < 9; i++) {
      const k = (lo + hi) / 2
      const o = scaled(k)
      const p = chance(o)
      const err = Math.abs(p - target)
      if (err <= best.err) best = { o, err }
      if (err < 0.04) break
      if (p > target) lo = k // fácil demais: fortalece
      else hi = k
    }
  }
  return { ...best.o, id: uid() }
}

/** Ferramentas que o adversário leva (mais e melhores nas dificuldades altas). */
export function opponentTools(difficulty: Difficulty): string[] {
  const pool = difficulty === 3 ? ['banda', 'amuleto', 'curativo', 'espelho', 'escudo', 'energetico'] : ['energetico', 'escudo', 'apito', 'curativo', 'espelho', 'amuleto']
  const n = difficulty === 3 ? 2 : difficulty === 2 ? 1 + (Math.random() < 0.4 ? 1 : 0) : difficulty === 1 && Math.random() < 0.5 ? 1 : 0
  return [...pool].sort(() => Math.random() - 0.5).slice(0, n)
}

/** Skin da semana com desconto. */
export const WEEKLY_DISCOUNT = 0.3
export function weeklySkin() {
  // Skin de edição limitada não entra na promoção da semana
  const premium = SKINS.filter((k) => k.currency === 'ovo' && k.id !== 'diamante')
  return premium[seasonId() % premium.length]
}
export function skinPrice(id: string) {
  const sk = SKIN_BY_ID[id]
  return weeklySkin().id === id ? Math.round(sk.price * (1 - WEEKLY_DISCOUNT)) : sk.price
}

export function newGame(name: string, avatar: string, starterBreed: string, opts: { stars?: number; roosterName?: string } = {}): GameState {
  const starter = makeRooster({ breedId: starterBreed, owner: name, stars: opts.stars ?? 3, name: opts.roosterName ?? (lang() === 'en' ? 'Daybreak' : 'Madrugada') /* i18n-ok */ })
  if (BREED_BY_ID[starterBreed]?.special) starter.base = { ...BREED_BY_ID[starterBreed].base }
  const season = seasonId()
  const rows = genLeagueRows(season)
  rows.push({ id: 'player', name, points: 0, isPlayer: true })
  return {
    version: VERSION,
    player: { name, avatar, createdAt: Date.now() },
    milho: 5000,
    ovos: 50,
    fichas: live.bets.chipsStart,
    roosters: [starter],
    accessories: { bone: 1 },
    items: { racao: 3, vitamina: 1 },
    skins: [],
    tools: { energetico: 2, escudo: 2, apito: 1 },
    market: { at: Date.now(), roosters: genMarket() },
    card: { at: Date.now(), fights: [] },
    bets: [],
    missions: { day: today(), list: genMissions(today()) },
    daily: { last: '', streak: 0 },
    league: { season, points: 0, rows, day: today(), claimed: [] },
    stats: { fights: 0, wins: 0, kos: 0, betsPlaced: 0, betsWon: 0, biggestWin: 0, milhoEarned: 0, boxesOpened: 0, purchases: 0, toolsUsed: 0, toolWins: 0 },
    vip: { until: 0 },
    achievements: [],
    history: [],
    settings: { volume: 0.4, muted: false },
  }
}

/** Ajusta tudo que depende do tempo: missões do dia, temporada, liga, mercado. */
export function tick(s: GameState): GameState {
  let n = s
  const d = today()
  if (n.missions.day !== d) n = { ...n, missions: { day: d, list: genMissions(d) } }
  const season = seasonId()
  if (n.league.season !== season) {
    const rows = genLeagueRows(season)
    rows.push({ id: 'player', name: n.player.name, points: 0, isPlayer: true })
    n = { ...n, league: { season, points: 0, rows, day: d, claimed: [] } }
  } else if (n.league.day !== d) {
    n = { ...n, league: { ...n.league, rows: growLeague(n.league.rows, n.league.day, d), day: d } }
  }
  return n
}

/** Corrige saves antigos para o formato atual. */
export function migrate(s: GameState): GameState {
  s.skins ??= []
  s.tools ??= {}
  s.stats.toolsUsed ??= 0
  s.stats.toolWins ??= 0
  // Fichas de aposta (novas): todo mundo começa com o valor inicial da configuração
  if (typeof s.fichas !== 'number' || !Number.isFinite(s.fichas)) s.fichas = live.bets.chipsStart
  // Passe da Temporada: zera quando o mês (UTC) muda
  if (!s.pass || s.pass.season !== passSeason()) s.pass = freshPass()
  // Missões em formato antigo (id aleatório) → id determinístico do dia, guardando o progresso por tipo
  s.missions = normalizeMissions(s.missions)
  return s
}

/** Converte missões antigas (id aleatório) para o formato determinístico `${dia}-${i}`, sem perder progresso. */
export function normalizeMissions(m: GameState['missions']): GameState['missions'] {
  if (!m || !Array.isArray(m.list) || !m.day) return { day: today(), list: genMissions(today()) }
  const ok = m.list.length === 5 && m.list.every((x) => x.id === `${m.day}-${m.list.indexOf(x)}`)
  if (ok) return m
  const byKind = new Map(m.list.map((x) => [x.kind, x]))
  const list = genMissions(m.day).map((g) => {
    const old = byKind.get(g.kind)
    return old ? { ...g, progress: Math.max(0, Math.min(g.goal, old.progress ?? 0)), claimed: !!old.claimed } : g
  })
  return { day: m.day, list }
}

export function checkAchievements(s: GameState): string[] {
  const has = (id: string) => s.achievements.includes(id)
  const out: string[] = []
  const add = (id: string, cond: boolean) => cond && !has(id) && out.push(id)
  add('primeira-vitoria', s.stats.wins >= 1)
  add('10-vitorias', s.stats.wins >= 10)
  add('50-vitorias', s.stats.wins >= 50)
  add('primeiro-ko', s.stats.kos >= 1)
  add('apostador', s.stats.betsPlaced >= 10)
  add('colecionador', s.roosters.length >= 5)
  add('fashion', s.roosters.some((r) => Object.values(r.equipped).filter(Boolean).length >= 4))
  add('nivel-10', s.roosters.some((r) => r.level >= 10))
  add('lendario', s.roosters.some((r) => BREED_BY_ID[r.breedId].rarity === 'lendario'))
  add('caixas', s.stats.boxesOpened >= 10)
  add('rico', s.milho >= 50000)
  add('estiloso', s.skins.length >= 3)
  add('estrategista', s.stats.toolWins >= 1)
  return out
}

void ACHIEVEMENTS
