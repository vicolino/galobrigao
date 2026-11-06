// Regras dos desafios entre jogadores (compartilhadas por navegador e servidor).
import { live } from './config'
import type { Rooster } from './types'

// Tempo para aceitar e prêmios diários vêm da configuração (backoffice).
// Qualquer nível pode desafiar qualquer nível: quem é desafiado vê os níveis e decide se aceita.
export const challengeTtl = () => live.pvp.challengeTtlSec * 1000
export const ONLINE_WINDOW = 45_000 // online = sinal nos últimos 45s
export const pvpDailyRewards = () => live.pvp.dailyRewards
export const PVP_ENERGY = 25

/** Desafio valendo milho: taxa e limites vêm do backoffice. */
export const pvpFeePct = () => live.pvp.feePct
export const stakeLimits = () => ({ min: live.pvp.minStake, max: live.pvp.maxStake })
/** Taxa do sistema sobre o total apostado (os dois lados). */
export const stakeFee = (stake: number, pct = live.pvp.feePct) => Math.round((stake * 2 * pct) / 100)
/** Quanto o vencedor leva no total (as duas apostas menos a taxa). */
export const stakePrize = (stake: number, pct = live.pvp.feePct) => stake * 2 - stakeFee(stake, pct)

/**
 * Prêmio do desafio. Quem vence ganha pelo nível de quem derrotou (até +10 acima do seu):
 * bater galo fraco rende pouco, zebra rende mais. Perder para galo bem mais forte custa menos pontos.
 */
export function pvpRewards(level: number, won: boolean, ko: boolean, oppLevel = level) {
  const up = oppLevel - level
  // O milho do desafio vem só da aposta entre os jogadores (ver stakeFee/stakePrize)
  void ko
  if (won) {
    const lv = Math.max(1, Math.min(oppLevel, level + 10))
    return {
      milho: 0,
      xp: 80 + lv * 14,
      points: 35 + Math.max(0, Math.min(15, up)) * 2 - (up < -5 ? Math.min(25, -up - 5) : 0),
    }
  }
  return { milho: 0, xp: 35 + level * 6, points: up >= 5 ? -5 : -10 }
}

/** Texto da diferença de nível, do ponto de vista de quem olha (meu galo x galo dele). */
export const levelGap = (mine: number, theirs: number) => theirs - mine

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
  /** Milho que cada um bota (0 = amistoso, desafios antigos) */
  stake: number
  /** Taxa cobrada (desafio aceito) */
  fee?: number
  seed?: number
  result?: { winner: 0 | 1; method: 'ko' | 'decisao'; rewards: PvpRewards }
  reason?: string
}

/** Galo de um jogador online, com o motivo se não puder lutar agora. */
export interface LobbyRooster extends Rooster {
  busy?: 'energia' | 'desafio'
}

/** Jogador online no lobby (estilo Gamers Club). */
export interface LobbyPlayer {
  userId: string
  name: string
  avatar: string
  leaguePoints: number
  roosters: LobbyRooster[]
  /** Já tem desafio pendente (enviado ou recebido) */
  inChallenge: boolean
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
