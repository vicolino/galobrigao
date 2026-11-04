// Ovos que o jogador ganha de graça. Valores vêm da configuração (backoffice → Configurações).
import { live } from './config'

/** Bônus diário (sequência de 1 a 7 dias). */
export const DAILY_OVOS = (streak: number) => (streak === 7 ? live.rewards.day7Ovos : live.rewards.dailyOvos)
/** Ovos por luta na Arena. difficulty: 0 fácil, 1 médio, 2 difícil. */
export const arenaOvos = (won: boolean, difficulty: 0 | 1 | 2) => (won && difficulty === 2 ? live.rewards.arenaHardWinOvos : won && Math.random() < 0.15 ? 1 : 0)
/** Multiplicador dos ovos das missões. */
export const missionOvos = (base: number) => Math.round(base * live.rewards.missionOvosMultiplier)
