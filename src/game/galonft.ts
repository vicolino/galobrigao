// Galo NFT + limite de cruzamentos (escassez estilo Axie).
// breedCount e nft vivem no galo, mas só o servidor mexe (PUT /api/save copia do save guardado).
import { BREED_BY_ID } from './data'
import { t } from '../i18n'
import type { GameState, Rooster } from './types'

/** Cada galo cruza no máximo 7 vezes na vida. */
export const MAX_BREEDS = 7
/** Multiplicador do custo pelo nº de cruzamentos que o pai já fez (0..6). */
export const BREED_MULT = [1, 1.5, 2, 3, 4, 6, 8]
/** Bônus de valor pelo nº de cruzamentos (0..7): virgem vale mais; esgotado vale um pouco menos. */
export const VIRGIN_BONUS = [0.15, 0.1, 0.06, 0.03, 0, 0, 0, -0.05]
/** Nível mínimo para um galo comum (comprado com milho) virar NFT. */
export const NFT_MIN_LEVEL = 10

type Breedy = Pick<Rooster, 'breedCount'>

export const breedsOf = (ro: Breedy) => Math.max(0, Math.min(MAX_BREEDS, Math.floor(ro.breedCount ?? 0)))
export const breedsLeft = (ro: Breedy) => MAX_BREEDS - breedsOf(ro)
export const breedMult = (ro: Breedy) => BREED_MULT[Math.min(breedsOf(ro), BREED_MULT.length - 1)]
/** Multiplicador do cruzamento: média dos dois pais. */
export const pairMult = (a: Breedy, b: Breedy) => (breedMult(a) + breedMult(b)) / 2
export const virginBonus = (ro: Breedy) => VIRGIN_BONUS[breedsOf(ro)]

/** Galo alugado (feature de aluguel): flag só do servidor. */
export const isRented = (ro: Pick<Rooster, 'rental'>) => !!ro.rental

/**
 * Regra para virar NFT (anti-farm). O Galo Livre do cadastro nunca vira. Pode virar se:
 *  1) nasceu de cruzamento (tem pais) — cruzar custa ovos; ou
 *  2) é edição especial (só sai por ovos ou dinheiro); ou
 *  3) veio de kit pago com dinheiro (crédito `galo:<id>` em state.mintable, dado pelo servidor); ou
 *  4) chegou ao nível 10 (muito treino).
 */
export function nftIneligible(s: Pick<GameState, 'mintable'>, ro: Rooster): string | null {
  if (ro.breedId === 'livre') return t('O Galo Livre do cadastro não vira NFT.')
  if (ro.parents) return null
  if (BREED_BY_ID[ro.breedId]?.special) return null
  if ((s.mintable?.[`galo:${ro.id}`] ?? 0) > 0) return null // i18n-ok (chave interna)
  if (ro.level >= NFT_MIN_LEVEL) return null
  return t('Só galos de cruzamento, edições especiais, kits pagos ou de nível {n}+ viram NFT.', { n: NFT_MIN_LEVEL })
}

/** O galo está preso em algo (ninho, NFT, aluguel)? Devolve o motivo ou null. */
export function roosterLock(s: Pick<GameState, 'nest'>, ro: Rooster, opts: { allowNft?: boolean } = {}): string | null {
  if (s.nest?.egg?.parents.some((p) => p.id === ro.id)) return t('{nome} é pai do ovo que está chocando. Espere chocar.', { nome: ro.name })
  if (isRented(ro)) return t('{nome} está alugado.', { nome: ro.name })
  if (ro.nft && !opts.allowNft) return t('{nome} é um Galo NFT: negocie no Mercado USDC ou traga de volta para o jogo antes.', { nome: ro.name })
  return null
}

/** PUT /api/save: o navegador não mexe em breedCount/nft (copia do save guardado; galo novo começa zerado). */
export function keepRoosterServerFields(cur: GameState, next: GameState): GameState {
  const before = new Map(cur.roosters.map((r) => [r.id, r]))
  next.roosters = next.roosters.map((r) => {
    const old = before.get(r.id)
    const out: Rooster = { ...r }
    delete out.breedCount
    delete out.nft
    if (old?.breedCount) out.breedCount = old.breedCount
    if (old?.nft) out.nft = old.nft
    return out
  })
  return next
}

/** Galo NFT não pode sumir do galinheiro pelo navegador (só pelo Mercado USDC). */
export function galoNftViolation(cur: GameState, next: GameState): string | null {
  const ids = new Set(next.roosters.map((r) => r.id))
  return cur.roosters.some((r) => r.nft && !ids.has(r.id)) ? 'galo nft' : null // i18n-ok (só log do servidor)
}
