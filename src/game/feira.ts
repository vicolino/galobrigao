// 🏪 Feira entre jogadores: regras e tipos usados no navegador e no servidor.
import { ACC_BY_ID, SKIN_BY_ID } from './data'
import { skinPrice } from './engine'
import { OVO_EM_MILHO, roosterValue } from './worth'
import type { Currency, Rooster } from './types'

export type FeiraKind = 'galo' | 'acessorio' | 'skin'

export const FEIRA = {
  feePct: 0.1,
  min: { milho: 10, ovo: 2 } as Record<Currency, number>,
  max: { milho: 10_000_000, ovo: 50_000 } as Record<Currency, number>,
  maxListings: 10,
  ttlHours: 72,
  giftFee: 2,
  giftsPerDay: 5,
  maxRoosters: 12,
  /** Item recebido na Feira só volta a ser vendido por ovos depois disso. */
  eggResaleHours: 24,
}

/** Taxa da casa: 10% (arredonda para baixo), mínimo 1. */
export const feiraFee = (price: number) => Math.max(1, Math.floor(price * FEIRA.feePct))

export const feiraPriceOk = (price: number, c: Currency) => Number.isInteger(price) && price >= FEIRA.min[c] && price <= FEIRA.max[c]

/** Preço sugerido (em milho) do item, pela tabela da loja / valor do galo. */
export function suggestedMilho(kind: FeiraKind, id: string, ro?: Rooster): number {
  if (kind === 'galo') return ro ? roosterValue({ ...ro, equipped: {} }) : 0
  const it = kind === 'acessorio' ? ACC_BY_ID[id] : SKIN_BY_ID[id]
  if (!it) return 0
  const price = kind === 'skin' ? skinPrice(id) : it.price
  return it.currency === 'ovo' ? price * OVO_EM_MILHO : price
}

/** Converte o sugerido para a moeda escolhida. */
export const suggested = (milho: number, c: Currency) => (c === 'milho' ? Math.max(FEIRA.min.milho, milho) : Math.max(FEIRA.min.ovo, Math.ceil(milho / OVO_EM_MILHO)))

export interface FeiraListing {
  id: string
  kind: FeiraKind
  itemId: string
  rooster?: Rooster
  price: number
  currency: Currency
  status: 'ativo' | 'vendido' | 'cancelado' | 'devolvido'
  seller: string
  sellerAvatar: string
  mine: boolean
  createdAt: number
  expiresAt: number
  closedAt?: number
  buyer?: string
}

export interface FeiraNotice {
  id: number
  text: string
  at: number
}

export interface FeiraPlayer {
  id: string
  name: string
  avatar: string
  roosters: number
}

export interface FeiraTrade {
  id: number
  kind: 'venda' | 'presente'
  listingId?: string
  seller: string
  buyer: string
  sellerName: string
  buyerName: string
  assetKind: FeiraKind
  assetId: string
  assetName: string
  price: number
  currency: Currency
  fee: number
  at: number
}

export interface FeiraData {
  listings: FeiraListing[]
  mine: FeiraListing[]
  notices: FeiraNotice[]
  giftsToday: number
}

export interface FeiraAdmin {
  active: number
  sales: number
  gifts: number
  feesMilho: number
  feesOvos: number
  volumeMilho: number
  volumeOvos: number
  trades: FeiraTrade[]
}
