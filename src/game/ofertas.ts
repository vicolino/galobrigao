// Ofertas relâmpago, recarga de energia com ovos e edições limitadas.
// Lógica pura: as operações rodam SOMENTE no servidor (via runShop).
import { ITEM_BY_ID, TOOL_BY_ID } from './data'
import { currentEnergy, today, uid, withEnergy } from './rooster'
import { t } from '../i18n'
import type { Currency, GameState, Offer } from './types'

export type OfferReason = 'nivel' | 'chefao' | 'energia'
export type OfertaOp = { op: 'triggerOffer'; reason: OfferReason } | { op: 'buyOffer'; id: string } | { op: 'refillEnergy'; roosterId: string }

export const OFFER_TTL = 60 * 60_000
export const OFFER_GAP = 6 * 3600_000
export const OFFERS_PER_DAY = 3
export const OFFER_OFF = 0.4

const REASON_KIND: Record<OfferReason, Offer['kind']> = { nivel: 'treino', chefao: 'revanche', energia: 'banquete' }

export const OFFER_BUNDLES: Record<Offer['kind'], { name: string; emoji: string; desc: string; items: Record<string, number>; tools: Record<string, number> }> = {
  treino: { name: t('Pacote de Treino'), emoji: '📕', desc: t('Seu galo subiu de nível! Acelere a próxima evolução.'), items: { livro: 2, vitamina: 5 }, tools: {} },
  revanche: { name: t('Kit Revanche'), emoji: '🔥', desc: t('O Chefão te pegou. Volta lá e cobra com juros!'), items: {}, tools: { fenix: 2, banda: 2, amuleto: 3, curativo: 3 } },
  banquete: { name: t('Banquete'), emoji: '🍗', desc: t('Galo cansado não briga. Energia para o dia todo.'), items: { 'racao-premium': 3, racao: 5 }, tools: {} },
}

/** Valor cheio do pacote em ovos (milho convertido a 200 por ovo). */
export function bundleValue(items: Record<string, number>, tools: Record<string, number>) {
  const v = (price: number, c: Currency, q: number) => (c === 'ovo' ? price : price / 200) * q
  let sum = 0
  for (const [id, q] of Object.entries(items)) if (ITEM_BY_ID[id]) sum += v(ITEM_BY_ID[id].price, ITEM_BY_ID[id].currency, q)
  for (const [id, q] of Object.entries(tools)) if (TOOL_BY_ID[id]) sum += v(TOOL_BY_ID[id].price, TOOL_BY_ID[id].currency, q)
  return Math.round(sum)
}

export const activeOffer = (s: GameState, now = Date.now()) => (s.offers ?? []).find((o) => !o.boughtAt && o.until > now) ?? null

/** Motivo para NÃO criar oferta agora (ou null se pode). */
export function offerBlocked(s: GameState, now = Date.now()): string | null {
  const list = s.offers ?? []
  if (activeOffer(s, now)) return t('Você já tem uma oferta ativa.')
  if (list.some((o) => now - o.at < OFFER_GAP)) return t('Nova oferta só daqui a algumas horas.')
  if (list.filter((o) => new Date(o.at).toISOString().slice(0, 10) === today()).length >= OFFERS_PER_DAY) return t('Limite de ofertas do dia atingido.')
  return null
}

/** Preço da recarga de energia: sobe a cada uma no dia. */
export const REFILL_PRICES = [3, 5, 8, 12, 20]
export const refillCount = (s: GameState) => (s.refills?.day === today() ? s.refills.n : 0)
export const refillPrice = (s: GameState) => REFILL_PRICES[Math.min(refillCount(s), REFILL_PRICES.length - 1)]

/** Itens de edição limitada (estoque global no servidor). */
export const LIMITED_ITEMS: Record<string, { total: number; days: number | null }> = {
  rei: { total: 100, days: null },
  'skin:diamante': { total: 50, days: 14 },
}
export const LIMITED_SKINS = ['diamante']
export interface LimitedStock {
  id: string
  total: number
  sold: number
  endsAt: number | null
}

/** Chave do estoque limitado que essa operação consome (ou null). */
export function limitedKey(o: { op: string; breedId?: string; id?: string }): string | null {
  if (o.op === 'buyElection' && o.breedId && LIMITED_ITEMS[o.breedId]) return o.breedId
  if (o.op === 'buySkin' && o.id && LIMITED_ITEMS[`skin:${o.id}`]) return `skin:${o.id}`
  return null
}

interface Helpers {
  pay: (s: GameState, price: number, c: Currency) => GameState
  log: (s: GameState, text: string, milho: number, ovo: number) => GameState
  purchase: (s: GameState) => GameState
  fail: (msg: string) => never
}

export function runOferta(s: GameState, o: OfertaOp, h: Helpers): { state: GameState; value?: unknown } {
  const now = Date.now()
  switch (o.op) {
    case 'triggerOffer': {
      if (!REASON_KIND[o.reason]) h.fail(t('Oferta inválida'))
      const blocked = offerBlocked(s, now)
      if (blocked) h.fail(blocked)
      const kind = REASON_KIND[o.reason]
      const b = OFFER_BUNDLES[kind]
      const full = bundleValue(b.items, b.tools)
      const offer: Offer = { id: uid(), kind, items: b.items, tools: b.tools, full, price: Math.max(1, Math.round(full * (1 - OFFER_OFF))), at: now, until: now + OFFER_TTL }
      return { state: { ...s, offers: [offer, ...(s.offers ?? [])].slice(0, 10) }, value: offer }
    }
    case 'buyOffer': {
      const of = (s.offers ?? []).find((x) => x.id === o.id) ?? h.fail(t('Oferta não encontrada'))
      if (of.boughtAt) h.fail(t('Você já comprou essa oferta.'))
      if (of.until <= now) h.fail(t('Essa oferta já acabou.'))
      let n = h.pay(s, of.price, 'ovo')
      const items = { ...n.items }
      for (const [id, q] of Object.entries(of.items)) items[id] = (items[id] ?? 0) + q
      const tools = { ...n.tools }
      for (const [id, q] of Object.entries(of.tools)) tools[id] = (tools[id] ?? 0) + q
      n = { ...n, items, tools, offers: (n.offers ?? []).map((x) => (x.id === of.id ? { ...x, boughtAt: now } : x)) }
      return { state: h.log(h.purchase(n), t('⚡ Oferta relâmpago: {nome}', { nome: OFFER_BUNDLES[of.kind].name }), 0, -of.price), value: of }
    }
    case 'refillEnergy': {
      const ro = s.roosters.find((r) => r.id === o.roosterId) ?? h.fail(t('Galo não encontrado'))
      if (currentEnergy(ro, now) >= 100) h.fail(t('{nome} já está com energia cheia.', { nome: ro.name }))
      const price = refillPrice(s)
      let n = h.pay(s, price, 'ovo')
      n = { ...n, roosters: n.roosters.map((r) => (r.id === ro.id ? withEnergy(r, 100, now) : r)), refills: { day: today(), n: refillCount(s) + 1 } }
      return { state: h.log(n, t('⚡ Energia recarregada: {nome}', { nome: ro.name }), 0, -price), value: price }
    }
  }
  return h.fail(t('Operação desconhecida'))
}
