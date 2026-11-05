import { ACC_BY_ID, BREEDS, BREED_BY_ID, STYLES, npcOwners, roosterNames } from './data'
import { locale } from '../i18n'
import type { Rarity, Rooster, Stats, Style } from './types'

// RNG determinístico (mulberry32) para lutas reproduzíveis.
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
export const pick = <T,>(arr: T[], r: () => number = Math.random) => arr[Math.floor(r() * arr.length)]
export const today = () => new Date().toISOString().slice(0, 10)
export const fmt = (n: number) => Math.floor(n).toLocaleString(locale())

export const ENERGY_MAX = 100
export const ENERGY_COST = 25
export const ENERGY_REGEN_MS = 60_000 // 1 de energia por minuto

export const xpToNext = (level: number) => Math.round(80 + level * level * 18)

const STYLE_LIST: Style[] = ['agressivo', 'defensivo', 'equilibrado', 'veloz']

export function randomStyle(r: () => number = Math.random): Style {
  return pick(STYLE_LIST, r)
}

export function makeRooster(opts: {
  breedId?: string
  level?: number
  owner?: string
  name?: string
  stars?: number
  rarityMax?: Rarity
  r?: () => number
}): Rooster {
  const r = opts.r ?? Math.random
  const regular = BREEDS.filter((b) => !b.special)
  const pool = opts.rarityMax ? regular.filter((b) => rarityRank(b.rarity) <= rarityRank(opts.rarityMax!)) : regular
  const breed = opts.breedId ? BREED_BY_ID[opts.breedId] : pick(pool, r)
  const stars = opts.stars ?? (1 + Math.floor(r() * r() * 5))
  const jitter = () => 0.9 + r() * 0.2 + stars * 0.02
  const base: Stats = {
    hp: Math.round(breed.base.hp * jitter()),
    atk: Math.round(breed.base.atk * jitter()),
    def: Math.round(breed.base.def * jitter()),
    spd: Math.round(breed.base.spd * jitter()),
  }
  return {
    id: uid(),
    name: opts.name ?? pick(roosterNames(), r),
    breedId: breed.id,
    level: opts.level ?? 1,
    xp: 0,
    base,
    style: randomStyle(r),
    stars,
    wins: 0,
    losses: 0,
    kos: 0,
    energy: 100,
    energyAt: Date.now(),
    equipped: {},
    owner: opts.owner ?? pick(npcOwners(), r),
  }
}

export function rarityRank(r: Rarity) {
  return { comum: 0, raro: 1, epico: 2, lendario: 3 }[r]
}

/** Atributos finais: base + crescimento por nível + estilo + acessórios. */
export function finalStats(ro: Rooster): Stats {
  const growth = 1 + (ro.level - 1) * (0.07 + ro.stars * 0.006)
  const mod = STYLES[ro.style].mod
  const s: Stats = {
    hp: ro.base.hp * growth,
    atk: ro.base.atk * growth * mod.atk,
    def: ro.base.def * growth * mod.def,
    spd: ro.base.spd * growth * mod.spd,
  }
  for (const accId of Object.values(ro.equipped)) {
    const acc = accId ? ACC_BY_ID[accId] : undefined
    if (!acc) continue
    for (const [k, v] of Object.entries(acc.bonus)) s[k as keyof Stats] += v ?? 0
  }
  return { hp: Math.round(s.hp), atk: Math.round(s.atk), def: Math.round(s.def), spd: Math.round(s.spd) }
}

export function power(ro: Rooster) {
  const s = finalStats(ro)
  return Math.round(s.hp * 0.6 + s.atk * 4 + s.def * 3 + s.spd * 3)
}

export function currentEnergy(ro: Rooster, now = Date.now()) {
  const gained = Math.floor((now - ro.energyAt) / ENERGY_REGEN_MS)
  return Math.min(ENERGY_MAX, ro.energy + gained)
}

export function withEnergy(ro: Rooster, energy: number, now = Date.now()): Rooster {
  return { ...ro, energy: Math.max(0, Math.min(ENERGY_MAX, energy)), energyAt: now }
}

/** Custos que crescem com o nível (cada vez mais rápido): galo forte custa caro para manter. */
const round10 = (v: number) => Math.round(v / 10) * 10
/** Treinar (🌽): nv1 120 · nv10 450 · nv20 1.100 · nv30 2.050 · nv50 4.850 */
export const trainCost = (level: number) => round10(100 + level * 20 + level * level * 1.5)
/** Dar comida (🌽): nv1 30 · nv10 120 · nv20 310 · nv30 600 · nv50 1.480 */
export const feedCost = (level: number) => Math.max(30, round10(30 + level * 4 + level * level * 0.5))
/** Comer na hora sem esperar (🥚): 3 até o nv9, +1 a cada 10 níveis */
export const feedInstantCost = (level: number) => 3 + Math.floor(level / 10)

/** Aplica XP e sobe de nível quantas vezes for preciso. */
export function addXp(ro: Rooster, xp: number): { rooster: Rooster; levels: number } {
  let { level, xp: cur } = ro
  cur += xp
  let levels = 0
  while (cur >= xpToNext(level) && level < 50) {
    cur -= xpToNext(level)
    level++
    levels++
  }
  return { rooster: { ...ro, level, xp: cur }, levels }
}

export function sellPrice(ro: Rooster) {
  const breed = BREED_BY_ID[ro.breedId]
  return Math.round(breed.price * 0.45 + ro.level * 120 + ro.stars * 150 + ro.wins * 20)
}

export function marketPrice(ro: Rooster) {
  const breed = BREED_BY_ID[ro.breedId]
  return Math.round(breed.price * (0.8 + ro.stars * 0.12) + (ro.level - 1) * 260)
}
