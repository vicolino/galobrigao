// Regras dos desafios entre jogadores (compartilhadas por navegador e servidor).
import { live } from './config'
import type { Rooster } from './types'

// Diferença de nível, tempo para aceitar e prêmios diários vêm da configuração (backoffice).
export const maxLevelDiff = () => live.pvp.maxLevelDiff
export const challengeTtl = () => live.pvp.challengeTtlSec * 1000
export const ONLINE_WINDOW = 45_000 // online = sinal nos últimos 45s
export const pvpDailyRewards = () => live.pvp.dailyRewards
export const PVP_ENERGY = 25

export const levelsMatch = (a: number, b: number) => Math.abs(a - b) <= live.pvp.maxLevelDiff

export function pvpRewards(level: number, won: boolean, ko: boolean) {
  return {
    milho: won ? Math.round((220 + level * 55) * (ko ? 1.25 : 1)) : 60 + level * 10,
    xp: won ? 80 + level * 14 : 35 + level * 6,
    points: won ? 35 : -10,
  }
}

export interface PvpRewards {
  milho: number
  xp: number
  points: number
  levels: number
  limited: boolean
}

export interface ChallengeView {
  id: string
  status: 'pendente' | 'aceito' | 'recusado' | 'expirado' | 'cancelado'
  mine: 'from' | 'to'
  fromName: string
  toName: string
  a: Rooster // galo de quem desafiou (lado esquerdo)
  b: Rooster // galo desafiado (lado direito)
  createdAt: number
  expiresAt: number
  seed?: number
  result?: { winner: 0 | 1; method: 'ko' | 'decisao'; rewards: PvpRewards }
  reason?: string
}

export interface LobbyEntry {
  userId: string
  name: string
  avatar: string
  rooster: Rooster
}

export interface PvpPoll {
  incoming: ChallengeView[]
  outgoing: ChallengeView | null
  updates: ChallengeView[]
  online: number
  bets?: { open: number; ready: number; liveFightId: string | null }
  /** Avisos da Feira (venda feita, presente recebido, anúncio vencido). */
  feira?: { id: number; text: string; at: number }[]
}
