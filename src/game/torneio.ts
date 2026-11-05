// 🏟️ Torneios: regras compartilhadas (agenda, prêmios, chave). O servidor resolve tudo;
// o navegador usa os mesmos tipos e tabelas para mostrar.
import { simulate } from './battle'
import { NPC_OWNERS_PT, ROOSTER_NAMES_PT } from './names'
import { makeRooster, pick, power, rng } from './rooster'
import { hashStr } from './engine'
import { t } from '../i18n'
import type { GameState, Rooster } from './types'

export type TorneioKind = 'diario' | 'semanal'
export type TorneioStatus = 'em_breve' | 'inscricoes' | 'fechado' | 'aovivo' | 'encerrado' | 'cancelado'

/** Fuso de São Paulo (UTC-3, sem horário de verão). */
const SP_OFFSET_H = 3
const H = 3_600_000
const DAY = 24 * H

export const TORNEIO = {
  /** Diário às 21:00; Copa do Terreiro no domingo às 20:00 (horário de Brasília). */
  dailyHour: 21,
  weeklyHour: 20,
  /** Inscrições abrem 24h antes (diário) / 6 dias antes (Copa) e fecham 10 min antes. */
  dailyOpenMs: DAY,
  weeklyOpenMs: 6 * DAY,
  closeMs: 10 * 60_000,
  /** Cada rodada é revelada a cada 2 min depois do início (o "ao vivo"). */
  roundMs: 2 * 60_000,
  maxSlots: 32,
  /** Inscrição da Copa: 🌽 milho (sai da economia). O diário é grátis. Nunca ovos/dinheiro. */
  // Inscrição grátis: pagar (mesmo em milho, que dá para comprar) para concorrer a prêmio pode virar jogo de azar
  weeklyFee: 0,
}

export interface PrizeRow {
  /** Faixa de colocação (1 = campeão; 3 = 3º–4º; 5 = 5º–8º). */
  from: number
  to: number
  ovos: number
  milho: number
  /** EGG de prêmio (conta presa, só quando a cripto está ligada). */
  token: number
  skin?: string
}

/** Skin exclusiva do campeão da Copa do Terreiro. */
export const COPA_SKIN = 'copa-terreiro'

/** Prêmios pagos pela casa (não saem das inscrições). */
export const PRIZES: Record<TorneioKind, PrizeRow[]> = {
  diario: [
    { from: 1, to: 1, ovos: 20, milho: 5000, token: 10 },
    { from: 2, to: 2, ovos: 10, milho: 2500, token: 5 },
    { from: 3, to: 4, ovos: 5, milho: 1200, token: 2 },
    { from: 5, to: 8, ovos: 2, milho: 500, token: 1 },
  ],
  semanal: [
    { from: 1, to: 1, ovos: 80, milho: 20000, token: 50, skin: COPA_SKIN },
    { from: 2, to: 2, ovos: 40, milho: 10000, token: 25 },
    { from: 3, to: 4, ovos: 20, milho: 5000, token: 10 },
    { from: 5, to: 8, ovos: 8, milho: 2000, token: 4 },
  ],
}

export const prizeFor = (kind: TorneioKind, place: number | null | undefined): PrizeRow | null =>
  place ? (PRIZES[kind].find((p) => place >= p.from && place <= p.to) ?? null) : null

export const torneioName = (kind: TorneioKind) => (kind === 'semanal' ? t('🏆 Copa do Terreiro') : t('🏟️ Torneio Diário'))
export const placeLabel = (place: number) =>
  place === 1 ? t('🥇 Campeão') : place === 2 ? t('🥈 Vice') : place <= 4 ? t('🥉 Semifinal') : place <= 8 ? t('Quartas de final') : place <= 16 ? t('Oitavas de final') : t('1ª rodada')
export const placeRange = (p: PrizeRow) => (p.from === p.to ? `#${p.from}` : `#${p.from}–${p.to}`)
export const statusLabel = (s: TorneioStatus) =>
  ({
    em_breve: t('🔜 Em breve'),
    inscricoes: t('📝 Inscrições abertas'),
    fechado: t('🔒 Inscrições fechadas'),
    aovivo: t('🔴 Ao vivo'),
    encerrado: t('🏁 Encerrado'),
    cancelado: t('❌ Cancelado'),
  })[s]

// ---------- Agenda ----------

/** Horário (UTC ms) de um dia/hora de São Paulo. */
const spTime = (y: number, m: number, d: number, h: number) => Date.UTC(y, m, d, h + SP_OFFSET_H)
const spDate = (ms: number) => new Date(ms - SP_OFFSET_H * H)

/** Próximos `n` diários a partir de `now` (inclui o que ainda não começou). */
export function nextDailies(now: number, n = 2): number[] {
  const d = spDate(now)
  let s = spTime(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), TORNEIO.dailyHour)
  if (s <= now) s += DAY
  return Array.from({ length: n }, (_, i) => s + i * DAY)
}

/** Próxima Copa do Terreiro (domingo, 20:00 de Brasília). */
export function nextWeekly(now: number): number {
  const d = spDate(now)
  const back = d.getUTCDay() // 0 = domingo
  let s = spTime(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, TORNEIO.weeklyHour)
  while (s <= now) s += 7 * DAY
  return s
}

export const opensAt = (kind: TorneioKind, startsAt: number) => startsAt - (kind === 'semanal' ? TORNEIO.weeklyOpenMs : TORNEIO.dailyOpenMs)
export const closesAt = (startsAt: number) => startsAt - TORNEIO.closeMs

/** Id legível e único por torneio (data de Brasília). */
export function torneioId(kind: TorneioKind, startsAt: number) {
  return `${kind === 'semanal' ? 'copa' : 'diario'}-${spDate(startsAt).toISOString().slice(0, 10)}`
}

export const roundsOf = (size: number) => Math.round(Math.log2(size))
/** Fim do "ao vivo": todas as rodadas reveladas, prêmios entram. */
export const doneAt = (startsAt: number, size: number) => startsAt + roundsOf(size) * TORNEIO.roundMs
/** Quantas rodadas já podem ser vistas. */
export function revealedRounds(startsAt: number, size: number, now: number) {
  if (now < startsAt) return 0
  return Math.min(roundsOf(size), Math.floor((now - startsAt) / TORNEIO.roundMs) + 1)
}

export function statusOf(x: { kind: TorneioKind; startsAt: number; size: number; resolved: boolean; cancelled: boolean }, now: number): TorneioStatus {
  if (x.cancelled) return 'cancelado'
  if (now < opensAt(x.kind, x.startsAt)) return 'em_breve'
  if (now < closesAt(x.startsAt)) return 'inscricoes'
  if (now < x.startsAt || !x.resolved) return 'fechado'
  if (now < doneAt(x.startsAt, x.size)) return 'aovivo'
  return 'encerrado'
}

// ---------- Chave ----------

export interface BracketSlot {
  userId: string | null
  /** Nome do criador (ou do dono NPC, para os galos da casa). */
  name: string
  rooster: Rooster
  bot: boolean
  power: number
}

export interface BracketMatch {
  /** Índices em `slots`. */
  a: number
  b: number
  seed: number
  winner: 0 | 1
  method: 'ko' | 'decisao'
}

export interface Bracket {
  size: number
  slots: BracketSlot[]
  rounds: BracketMatch[][]
  /** Colocação de cada slot (1 = campeão, 2 = vice, 3 = semis, 5 = quartas…). */
  places: number[]
}

/** Ordem clássica de cabeças de chave (1x16, 8x9, …): os melhores só se cruzam no fim. */
export function seedOrder(size: number): number[] {
  let o = [1, 2]
  while (o.length < size) {
    const n = o.length * 2
    o = o.flatMap((x) => [x, n + 1 - x])
  }
  return o
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Galo da casa com força perto de `target` (determinístico pelo `r`). */
export function makeBot(r: () => number, level: number, target: number, i: number): Rooster {
  const o = makeRooster({ level: Math.max(1, level), r, name: pick(ROOSTER_NAMES_PT, r), owner: pick(NPC_OWNERS_PT, r) })
  const scaled = (k: number): Rooster => ({
    ...o,
    base: { hp: Math.max(10, Math.round(o.base.hp * k)), atk: Math.max(1, Math.round(o.base.atk * k)), def: Math.max(1, Math.round(o.base.def * k)), spd: Math.max(1, Math.round(o.base.spd * k)) },
  })
  // Busca binária no multiplicador dos atributos até a força bater com o alvo
  let lo = 0.2
  let hi = 4
  let best = o
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2
    const c = scaled(mid)
    best = c
    const p = power(c)
    if (Math.abs(p - target) <= Math.max(2, target * 0.01)) break
    if (p < target) lo = mid
    else hi = mid
  }
  return { ...best, id: `bot-${i}`, energy: 100, energyAt: 0 }
}

/** Tamanho da chave conforme os inscritos humanos. */
export const bracketSize = (humans: number) => (humans <= 16 ? 16 : 32)

/**
 * Monta e resolve a chave inteira. Mesma lista de inscritos + mesma semente = mesmo resultado.
 * Vagas que sobram viram galos da casa calibrados pela força mediana dos inscritos.
 */
export function runBracket(humans: Omit<BracketSlot, 'power' | 'bot'>[], seed: number): Bracket {
  const r = rng(seed)
  const size = bracketSize(humans.length)
  const list: BracketSlot[] = humans.slice(0, size).map((h) => ({ ...h, bot: false, power: power(h.rooster) }))
  const med = list.length ? median(list.map((h) => h.power)) : 300
  const lvl = list.length ? Math.round(median(list.map((h) => h.rooster.level))) : 5
  for (let i = 0; list.length < size; i++) {
    const ro = makeBot(r, lvl, Math.round(med * (0.85 + r() * 0.25)), i)
    list.push({ userId: null, name: ro.owner, rooster: ro, bot: true, power: power(ro) })
  }
  // Cabeças de chave por força (empate: sorteio pela semente)
  const tie = list.map(() => r())
  const ranked = list.map((_, i) => i).sort((a, b) => list[b].power - list[a].power || tie[a] - tie[b])
  const slots = seedOrder(size).map((s) => list[ranked[s - 1]])
  const places = slots.map(() => 1)
  const rounds: BracketMatch[][] = []
  let alive = slots.map((_, i) => i)
  for (let rd = 0; alive.length > 1; rd++) {
    const ms: BracketMatch[] = []
    const next: number[] = []
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i]
      const b = alive[i + 1]
      const ms0 = hashStr(`${seed}:${rd}:${i / 2}`)
      const res = simulate(slots[a].rooster, slots[b].rooster, ms0)
      ms.push({ a, b, seed: ms0, winner: res.winner, method: res.method })
      const w = res.winner === 0 ? a : b
      const l = res.winner === 0 ? b : a
      // Perdeu nesta rodada: fica atrás de quem passou (ex.: perdeu na semi = 3º)
      places[l] = alive.length / 2 + 1
      next.push(w)
    }
    rounds.push(ms)
    alive = next
  }
  places[alive[0]] = 1
  return { size, slots, rounds, places }
}

// ---------- O que o navegador recebe ----------

export interface TorneioEntryView {
  name: string
  avatar?: string
  rooster: Rooster
  mine?: boolean
}

export interface TorneioView {
  id: string
  kind: TorneioKind
  startsAt: number
  opensAt: number
  closesAt: number
  doneAt: number
  status: TorneioStatus
  entrants: number
  fee: number
  size: number
  mine: { roosterId: string; rooster: Rooster; place: number | null } | null
  champion: { name: string; rooster: Rooster; bot: boolean } | null
}

export interface TorneioMatchView {
  a: number
  b: number
  /** Só aparecem quando a rodada já foi revelada. */
  seed?: number
  winner?: 0 | 1
  method?: 'ko' | 'decisao'
}

export interface TorneioDetail extends TorneioView {
  /** Inscritos (antes da chave sair). */
  list: TorneioEntryView[]
  bracket: { slots: (Omit<BracketSlot, 'userId'> & { mine?: boolean })[]; rounds: TorneioMatchView[][]; revealed: number } | null
}

export interface TorneioResult {
  id: string
  kind: TorneioKind
  startsAt: number
  status: TorneioStatus
  roosterName: string
  place: number | null
  ovos: number
  milho: number
  fee: number
  refunded: boolean
}

export interface TorneioNotice {
  id: string
  kind: TorneioKind
  place: number | null
  ovos: number
  milho: number
  skin?: string
  cancelled?: boolean
}

/** Troféu guardado no save (só o servidor dá). */
export type Trophy = NonNullable<GameState['trophies']>[number]

export const champTitle = (n: number) => (n > 0 ? t('🏆 Campeão do Terreiro') : '')
