// Apostas na agenda de lutas da casa (regras compartilhadas entre navegador e servidor).
import { t } from '../i18n'
import { live } from './config'
import type { BetPick, GameState, MissionKind, Rooster } from './types'
import { uid } from './rooster'

export const betInterval = () => Math.max(2, live.bets.intervalMin) * 60_000
export const betCloseMs = () => live.bets.closeSec * 1000
export const liveMs = () => live.bets.liveSec * 1000

export type FightPhase = 'aberta' | 'fechada' | 'aovivo' | 'encerrada'

/** Luta da agenda como o navegador vê (a semente só aparece depois que a luta começa). */
export interface ScheduledFight {
  id: string
  startsAt: number
  event: string
  num: number
  featured: boolean
  a: Rooster
  b: Rooster
  oddsA: number
  oddsB: number
  oddsKo: number
  phase: FightPhase
  seed?: number
  winner?: 0 | 1
  method?: 'ko' | 'decisao'
  /** Quantas apostas e quanto milho os jogadores já colocaram. */
  pool: { bets: number; a: number; b: number; ko: number }
}

export interface BetView {
  id: string
  fightId: string
  pick: BetPick
  amount: number
  odds: number
  label: string
  status: 'pendente' | 'ganhou' | 'perdeu'
  payout: number
  at: number
  startsAt: number
  fight: string
}

/** O que o servidor creditou no save por apostas resolvidas. */
export interface BetCredit {
  milho: number
  ovos: number
  won: number
  biggest: number
  zebra: boolean
  entries: { text: string; milho: number; won: boolean }[]
}

export const phaseOf = (startsAt: number, resolved: boolean, now = Date.now()): FightPhase =>
  now < startsAt - betCloseMs() ? 'aberta' : !resolved || now < startsAt ? 'fechada' : now < startsAt + liveMs() ? 'aovivo' : 'encerrada'

// Gerado no servidor e salvo: o navegador traduz com tx() (chaves '{nome} vence' e 'Termina em K.O.').
export const pickLabel = (pick: BetPick, a: string, b: string) => (pick === 'a' ? t('{nome} vence', { nome: a }) : pick === 'b' ? t('{nome} vence', { nome: b }) : t('Termina em K.O.'))

/** Nome do evento conforme o horário (padrão: Brasília; na tela, o fuso de quem vê). */
export function eventName(startsAt: number, timeZone = 'America/Sao_Paulo') {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date(startsAt))) % 24
  if (h < 6) return { name: t('🌙 Madrugada Brava'), startHour: 0 }
  if (h < 12) return { name: t('🌅 Copa da Manhã'), startHour: 6 }
  if (h < 18) return { name: t('☀️ Torneio da Tarde'), startHour: 12 }
  return { name: t('🔥 Noite de Rinha'), startHour: 18 }
}

const bump = (s: GameState, kind: MissionKind, n: number): GameState => ({
  ...s,
  missions: { ...s.missions, list: s.missions.list.map((m) => (m.kind === kind && !m.claimed ? { ...m, progress: Math.min(m.goal, m.progress + n) } : m)) },
})

/** Aplica no save o crédito das apostas resolvidas (mesma conta no servidor e no navegador). */
export function applyBetCredit(s: GameState, c: BetCredit): GameState {
  let n: GameState = {
    ...s,
    milho: s.milho + c.milho,
    ovos: s.ovos + c.ovos,
    stats: {
      ...s.stats,
      betsWon: s.stats.betsWon + c.won,
      biggestWin: Math.max(s.stats.biggestWin, c.biggest),
      milhoEarned: s.stats.milhoEarned + c.milho,
    },
    achievements: c.zebra && !s.achievements.includes('zebra') ? [...s.achievements, 'zebra'] : s.achievements,
    history: [
      ...c.entries.filter((e) => e.won).map((e) => ({ id: uid(), at: Date.now(), text: e.text, milho: e.milho, ovo: 0 })),
      ...s.history,
    ].slice(0, 80),
  }
  if (c.won) n = bump(n, 'ganhar_aposta', c.won)
  return n
}

/** Desconta a aposta do save (usado pelo servidor ao registrar a aposta). */
export function applyBetPlaced(s: GameState, amount: number, label: string, odds: number): GameState {
  let n: GameState = {
    ...s,
    milho: s.milho - amount,
    stats: { ...s.stats, betsPlaced: s.stats.betsPlaced + 1 },
    history: [{ id: uid(), at: Date.now(), text: t('Aposta: {palpite} @ {odd}', { palpite: label, odd: odds.toFixed(2) }), milho: -amount, ovo: 0 }, ...s.history].slice(0, 80),
  }
  n = bump(n, 'apostar', 1)
  return n
}
