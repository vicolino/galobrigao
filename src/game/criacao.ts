// Cruzamento: dois galos do jogador geram um pintinho. Roda SOMENTE no servidor (via runShop).
import { BREED_BY_ID } from './data'
import { makeRooster, pick, rarityRank, uid } from './rooster'
import { t } from '../i18n'
import type { Currency, GameState, Nest, Rarity, Rooster, Stats } from './types'

export const BREED_MIN_LEVEL = 5
export const BREED_COOLDOWN = 24 * 3600_000
export const INCUBATION = 2 * 3600_000
export const SKIP_PER_HOUR = 5
export const MAX_COOP = 12
export const MUTATION_CHANCE = 0.05
export const TINT_CHANCE = 0.03
/** Chance de 4★ quando os dois pais têm 4★ ou mais. */
export const STAR4_CHANCE = 0.1
/** Estrelas do pintinho (1 a 3). */
export const STAR_ODDS: [number, number][] = [
  [1, 0.5],
  [2, 0.35],
  [3, 0.15],
]
export const BREED_OVOS: Record<Rarity, number> = { comum: 10, raro: 20, epico: 40, lendario: 80 }
export const BREED_MILHO: Record<Rarity, number> = { comum: 500, raro: 1000, epico: 2000, lendario: 4000 }

type Parent = Pick<Rooster, 'id' | 'name' | 'breedId' | 'base' | 'stars'>

const rarityOf = (ro: Pick<Rooster, 'breedId'>): Rarity => BREED_BY_ID[ro.breedId]?.rarity ?? 'comum'
const topRarity = (a: Pick<Rooster, 'breedId'>, b: Pick<Rooster, 'breedId'>): Rarity => (rarityRank(rarityOf(a)) >= rarityRank(rarityOf(b)) ? rarityOf(a) : rarityOf(b))

/** Custo do cruzamento: pela raridade do pai mais raro. */
export function breedCost(a: Pick<Rooster, 'breedId'>, b: Pick<Rooster, 'breedId'>) {
  const r = topRarity(a, b)
  return { ovos: BREED_OVOS[r], milho: BREED_MILHO[r], rarity: r }
}

/** Ovos para chocar já: 5 por hora (ou fração) que falta. */
export function skipCost(readyAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((readyAt - now) / 3600_000)) * SKIP_PER_HOUR
}

/** Raças que um pintinho pode herdar (edições especiais ficam exclusivas). */
export function chickBreeds(a: Pick<Rooster, 'breedId'>, b: Pick<Rooster, 'breedId'>): string[] {
  const ok = [a.breedId, b.breedId].filter((id) => BREED_BY_ID[id] && !BREED_BY_ID[id].special)
  return ok.length ? [...new Set(ok)] : ['caipira']
}

export function cooldownLeft(s: GameState, id: string, now = Date.now()) {
  return Math.max(0, (s.nest?.cooldowns?.[id] ?? 0) - now)
}

/** Motivo para não cruzar (ou null). */
export function breedBlock(s: GameState, a?: Rooster, b?: Rooster, now = Date.now()): string | null {
  if (!a || !b) return t('Galo não encontrado')
  if (a.id === b.id) return t('Escolha dois galos diferentes.')
  if (s.nest?.egg) return t('Já tem um ovo chocando no ninho.')
  if (s.roosters.length >= MAX_COOP) return t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: MAX_COOP })
  if (a.level < BREED_MIN_LEVEL || b.level < BREED_MIN_LEVEL) return t('Os dois galos precisam ter nível {n} ou mais.', { n: BREED_MIN_LEVEL })
  for (const r of [a, b]) if (cooldownLeft(s, r.id, now) > 0) return t('{nome} está descansando do último cruzamento.', { nome: r.name })
  return null
}

const hex = (h: number, sat: number, l: number) => {
  // HSL → #rrggbb
  const s = sat / 100
  const L = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const f = (n: number) => L - s * Math.min(L, 1 - L) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
}

/** Pelagem rara: paleta única gerada a partir de um tom. */
export function makeTint(r = Math.random): NonNullable<Rooster['tint']> {
  const h = Math.floor(r() * 360)
  return { body: hex(h, 70, 52), wing: hex(h, 62, 36), neck: hex((h + 35) % 360, 82, 64), tail: hex((h + 180) % 360, 60, 28), tail2: hex((h + 205) % 360, 72, 46) }
}

export interface ChickRoll {
  chick: Rooster
  mutation: keyof Stats | null
  rareColor: boolean
}

/** Sorteia o pintinho a partir dos pais. */
export function rollChick(a: Parent, b: Parent, owner: string, r = Math.random): ChickRoll {
  const breedId = pick(chickBreeds(a, b), r)
  let stars = 1
  if (a.stars >= 4 && b.stars >= 4 && r() < STAR4_CHANCE) stars = 4
  else {
    let x = r()
    for (const [n, p] of STAR_ODDS) {
      stars = n
      if ((x -= p) < 0) break
    }
  }
  const keys: (keyof Stats)[] = ['hp', 'atk', 'def', 'spd']
  const base = {} as Stats
  for (const k of keys) base[k] = Math.max(1, Math.round(((a.base[k] + b.base[k]) / 2) * (0.9 + r() * 0.2)))
  let mutation: keyof Stats | null = null
  if (r() < MUTATION_CHANCE) {
    mutation = pick(keys, r)
    base[mutation] = Math.round(base[mutation] * 1.15)
  }
  const rareColor = r() < TINT_CHANCE
  const chick: Rooster = {
    ...makeRooster({ breedId, stars, owner, r }),
    base,
    parents: [a.name, b.name],
    ...(rareColor ? { tint: makeTint(r) } : {}),
  }
  return { chick, mutation, rareColor }
}

const snap = (ro: Rooster): Parent => ({ id: ro.id, name: ro.name, breedId: ro.breedId, base: { ...ro.base }, stars: ro.stars })

type Helpers = {
  fail: (msg: string) => never
  pay: (s: GameState, price: number, c: Currency) => GameState
  log: (s: GameState, text: string, milho: number, ovo: number) => GameState
}
export type BreedOp = { op: 'breedStart'; a: string; b: string } | { op: 'breedHatch' } | { op: 'breedSkip' }

function hatch(s: GameState, h: Helpers, now: number): { state: GameState; value: ChickRoll } {
  const egg = s.nest?.egg ?? h.fail(t('Nenhum ovo no ninho.'))
  if (s.roosters.length >= MAX_COOP) h.fail(t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: MAX_COOP }))
  const roll = rollChick(egg.parents[0], egg.parents[1], s.player.name)
  roll.chick.id = egg.id
  roll.chick.energyAt = now
  const nest: Nest = { cooldowns: s.nest?.cooldowns ?? {} }
  const n = { ...s, nest, roosters: [...s.roosters, roll.chick] }
  return { state: h.log(n, t('🐣 Nasceu {nome}, filho de {a} com {b}', { nome: roll.chick.name, a: egg.parents[0].name, b: egg.parents[1].name }), 0, 0), value: roll }
}

export function runBreed(s: GameState, o: BreedOp, h: Helpers): { state: GameState; value?: unknown } {
  const now = Date.now()
  switch (o.op) {
    case 'breedStart': {
      const a = s.roosters.find((r) => r.id === o.a)
      const b = s.roosters.find((r) => r.id === o.b)
      const why = breedBlock(s, a, b, now)
      if (why) h.fail(why)
      const cost = breedCost(a!, b!)
      let n = h.pay(s, cost.ovos, 'ovo')
      n = h.pay(n, cost.milho, 'milho')
      // Limpa descansos vencidos e marca os pais
      const cooldowns = Object.fromEntries(Object.entries(s.nest?.cooldowns ?? {}).filter(([, until]) => until > now))
      cooldowns[a!.id] = cooldowns[b!.id] = now + BREED_COOLDOWN
      n = { ...n, nest: { cooldowns, egg: { id: uid(), parents: [snap(a!), snap(b!)], startedAt: now, readyAt: now + INCUBATION } } }
      return { state: h.log(n, t('🥚 Cruzamento: {a} × {b}', { a: a!.name, b: b!.name }), -cost.milho, -cost.ovos) }
    }
    case 'breedHatch': {
      const egg = s.nest?.egg ?? h.fail(t('Nenhum ovo no ninho.'))
      if (egg.readyAt > now) h.fail(t('O ovo ainda está chocando.'))
      return hatch(s, h, now)
    }
    case 'breedSkip': {
      const egg = s.nest?.egg ?? h.fail(t('Nenhum ovo no ninho.'))
      if (s.roosters.length >= MAX_COOP) h.fail(t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: MAX_COOP }))
      const cost = skipCost(egg.readyAt, now)
      const n = cost ? h.log(h.pay(s, cost, 'ovo'), t('🥚 Chocou na hora'), 0, -cost) : s
      return hatch(n, h, now)
    }
  }
}

