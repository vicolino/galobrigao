// 🔑 Aluguel de galos na Feira: regras e tipos usados no navegador e no servidor.
import { FEIRA } from './feira'
import type { Currency, Rooster } from './types'

export const ALUGUEL = {
  days: [1, 3, 7] as const,
  /** Parte do milho ganho na Arena que vai para o dono (máx.). */
  maxSharePct: 50,
  /** Galos alugados ao mesmo tempo (como quem aluga). */
  maxBorrowed: 3,
  /** Galos fora ao mesmo tempo (anunciados + alugados) como dono. */
  maxLent: 3,
  /** Anúncio de aluguel sem interessado volta depois disso. */
  ttlHours: FEIRA.ttlHours,
}

export const DAY = 24 * 3600_000

export const rentDaysOk = (d: number) => (ALUGUEL.days as readonly number[]).includes(d)
export const sharePctOk = (p: number) => Number.isInteger(p) && p >= 0 && p <= ALUGUEL.maxSharePct

/** Parte do dono no milho ganho (arredonda para baixo). */
export const rentalCut = (cornWon: number, pct: number) => (cornWon > 0 && pct > 0 ? Math.floor((cornWon * pct) / 100) : 0)

/** Galo alugado (de outro jogador) e ainda no prazo? */
export const isRented = (ro?: Pick<Rooster, 'rental'> | null) => !!ro?.rental

export interface AluguelListing {
  id: string
  rooster: Rooster
  owner: string
  ownerAvatar: string
  mine: boolean
  days: number
  price: number
  currency: Currency
  sharePct: number
  status: 'ativo' | 'alugado' | 'devolvido' | 'cancelado' | 'vencido' | 'excluido'
  createdAt: number
  expiresAt: number
  borrower?: string
  borrowedByMe?: boolean
  rentedAt?: number
  until?: number
  closedAt?: number
  fee?: number
  /** Milho da parte da Arena acumulado (cai para o dono quando o galo volta). */
  shareEarned: number
}

export interface AluguelData {
  listings: AluguelListing[]
  /** Como dono. */
  mine: AluguelListing[]
  /** Como quem alugou. */
  borrowed: AluguelListing[]
}

export interface AluguelAdmin {
  active: number
  rented: number
  total: number
  feesMilho: number
  feesOvos: number
  volumeMilho: number
  volumeOvos: number
  shareMilho: number
}
