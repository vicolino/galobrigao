// 🎁 Drops da Arena: prêmio raro e GRÁTIS depois de vencer (nunca vendido; sem caixas pagas).
// Regras compartilhadas: o servidor sorteia (server/drops.ts) e a tela mostra as mesmas chances.
// As chances vêm da configuração ao vivo (backoffice → Config → Drops).
import { t } from '../i18n'
import { live, type DropsConfig } from './config'
import { BREEDS, BREED_BY_ID, DROP_SKINS, SKIN_BY_ID, TOOLS, TOOL_BY_ID, RARITY } from './data'
import { addMintable } from './premium'
import { makeRooster, uid } from './rooster'
import type { GameState, Rarity, Rooster } from './types'

export type DropTier = Rarity
export const DROP_TIERS: DropTier[] = ['comum', 'raro', 'epico', 'lendario']
/** Limite do save (PUT /api/save recusa mais de 16 galos). */
const MAX_COOP = 16

export interface DropOdds {
  on: boolean
  /** Chance (0–1) por dificuldade: Fácil, Médio, Difícil, Chefão. */
  chance: [number, number, number, number]
  /** Chance (0–1) de cada tier quando sai drop (normalizada para somar 1). */
  tiers: Record<DropTier, number>
  pity: number
  dailyCap: number
  supplyCap: number
}

/** Chances em uso agora (config ao vivo; no navegador vem de /api/config). */
export function dropOdds(c: DropsConfig = live.drops): DropOdds {
  const raw = { comum: c.tierComum, raro: c.tierRaro, epico: c.tierEpico, lendario: c.tierLendario }
  const sum = Object.values(raw).reduce((a, b) => a + Math.max(0, b), 0) || 1
  const pct = (n: number) => Math.max(0, Math.min(100, n)) / 100
  return {
    on: c.on !== false,
    chance: [pct(c.chanceFacil), pct(c.chanceMedio), pct(c.chanceDificil), pct(c.chanceChefao)],
    tiers: { comum: Math.max(0, raw.comum) / sum, raro: Math.max(0, raw.raro) / sum, epico: Math.max(0, raw.epico) / sum, lendario: Math.max(0, raw.lendario) / sum },
    pity: Math.max(1, Math.round(c.pity)),
    dailyCap: Math.max(0, Math.round(c.dailyCap)),
    supplyCap: Math.max(0, Math.round(c.supplyCap)),
  }
}

/** Sorteio inteiro em [0, n). No servidor: crypto.randomInt. */
export type Rng = (n: number) => number
export const mathRng: Rng = (n) => Math.floor(Math.random() * n)
const PPM = 1_000_000
const hit = (rng: Rng, p: number) => rng(PPM) < Math.round(p * PPM)
const pickOf = <T,>(arr: T[], rng: Rng) => arr[rng(arr.length)]

// ---------- Conteúdo de cada tier ----------
export const DROP_TOOLS_COMUM = TOOLS.filter((x) => x.rarity === 'comum' || x.rarity === 'raro').map((x) => x.id)
export const DROP_TOOLS_RARO = TOOLS.filter((x) => x.rarity === 'raro' || x.rarity === 'epico').map((x) => x.id)
/** Prêmio de consolação (épico/lendário sem item disponível). */
export const DROP_TOOLS_TOP = TOOLS.filter((x) => x.rarity === 'epico' || x.rarity === 'lendario').map((x) => x.id)
export const DROP_SKINS_BY_TIER = (tier: DropTier) => DROP_SKINS.filter((x) => x.rarity === tier)
export const DROP_BREEDS = BREEDS.filter((b) => b.drop)

export type DropKind = 'tools' | 'skin' | 'galo'
export interface DropContent {
  tier: DropTier
  kind: DropKind
  /** tools: id → quantidade */
  tools?: Record<string, number>
  skinId?: string
  breedId?: string
}
/** O que o servidor devolve na luta (e a tela anima). */
export interface DropResult extends DropContent {
  /** Nº de série global do item (épico/lendário). */
  serial?: number
  /** Galo criado (lendário). */
  rooster?: Rooster
  /** Pode virar NFT (Carteira). */
  nft?: boolean
}

/** Sai drop nesta vitória? Garantido quando `pity` chega ao limite. */
export function shouldDrop(pity: number, difficulty: number, rng: Rng, o: DropOdds = dropOdds()): boolean {
  if (pity >= o.pity) return true
  return hit(rng, o.chance[Math.max(0, Math.min(3, difficulty))] ?? 0)
}

export function rollTier(rng: Rng, o: DropOdds = dropOdds()): DropTier {
  let r = rng(PPM)
  for (const tier of DROP_TIERS) {
    const w = Math.round(o.tiers[tier] * PPM)
    if (r < w) return tier
    r -= w
  }
  return 'comum'
}

function toolPack(pool: string[], n: number, rng: Rng): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const id = pickOf(pool, rng)
    out[id] = (out[id] ?? 0) + 1
  }
  return out
}

/**
 * Escolhe o item do tier. `soldOut(kind, id)` diz se a tiragem acabou.
 * Skin repetida não vale (skins são 0/1 no save): sorteia outra; sem opção, vira pacote de ferramentas.
 */
export function rollContents(tier: DropTier, s: Pick<GameState, 'skins' | 'roosters'>, rng: Rng, soldOut: (kind: 'skin' | 'galo', id: string) => boolean = () => false): DropContent {
  const freeSkins = (tr: DropTier) => DROP_SKINS_BY_TIER(tr).filter((k) => !s.skins.includes(k.id) && !soldOut('skin', k.id))
  if (tier === 'lendario') {
    const breeds = DROP_BREEDS.filter((b) => !soldOut('galo', b.id))
    if (breeds.length && s.roosters.length < MAX_COOP) return { tier, kind: 'galo', breedId: pickOf(breeds, rng).id }
    // Sem galo disponível: cai um épico (o reveal mostra o tier real)
    const sk = freeSkins('epico')
    if (sk.length) return { tier: 'epico', kind: 'skin', skinId: pickOf(sk, rng).id }
    return { tier: 'epico', kind: 'tools', tools: toolPack(DROP_TOOLS_TOP, 4, rng) }
  }
  if (tier === 'epico') {
    const sk = freeSkins('epico')
    if (sk.length) return { tier, kind: 'skin', skinId: pickOf(sk, rng).id }
    return { tier, kind: 'tools', tools: toolPack(DROP_TOOLS_TOP, 3, rng) }
  }
  if (tier === 'raro') {
    const sk = freeSkins('raro')
    if (sk.length && rng(2) === 0) return { tier, kind: 'skin', skinId: pickOf(sk, rng).id }
    return { tier, kind: 'tools', tools: toolPack(DROP_TOOLS_RARO, 2, rng) }
  }
  return { tier: 'comum', kind: 'tools', tools: toolPack(DROP_TOOLS_COMUM, 2 + rng(2), rng) }
}

/** Precisa de nº de série? (itens únicos épicos/lendários) */
export const hasSerial = (c: DropContent) => c.kind === 'galo' || (c.kind === 'skin' && (c.tier === 'epico' || c.tier === 'lendario'))

/** Nome curto do prêmio (para histórico, feed e tela). */
export function dropName(c: Pick<DropContent, 'kind' | 'tools' | 'skinId' | 'breedId'>): string {
  if (c.kind === 'galo') return BREED_BY_ID[c.breedId!]?.name ?? String(c.breedId)
  if (c.kind === 'skin') return SKIN_BY_ID[c.skinId!]?.name ?? String(c.skinId)
  return Object.entries(c.tools ?? {})
    .map(([id, n]) => `${TOOL_BY_ID[id]?.emoji ?? ''} ${TOOL_BY_ID[id]?.name ?? id} ×${n}`)
    .join(', ')
}

/** Aplica o prêmio no save (servidor). Zera a garantia. */
export function applyDrop(s: GameState, c: DropContent, rng: Rng, serial?: number): { state: GameState; drop: DropResult } {
  let n: GameState = { ...s, dropPity: 0 }
  const drop: DropResult = { ...c, ...(serial ? { serial } : {}) }
  if (c.kind === 'tools') {
    const tools = { ...n.tools }
    for (const [id, q] of Object.entries(c.tools ?? {})) tools[id] = (tools[id] ?? 0) + q
    n = { ...n, tools }
  } else if (c.kind === 'skin') {
    n = { ...n, skins: n.skins.includes(c.skinId!) ? n.skins : [...n.skins, c.skinId!] }
    // Épico/lendário da Coleção Drop pode virar NFT (crédito como os lendários da loja)
    if (c.tier === 'epico' || c.tier === 'lendario') {
      n = addMintable(n, `skin:${c.skinId}`)
      drop.nft = true
    }
  } else {
    const b = BREED_BY_ID[c.breedId!]
    const ro = makeRooster({ breedId: b.id, name: b.name, level: 1, stars: 3 + rng(3), owner: s.player.name })
    n = { ...n, roosters: [...n.roosters, ro] }
    drop.rooster = ro
    drop.nft = true // edição especial: vira NFT (src/game/galonft.ts)
  }
  const label = t('🎁 Drop {tier}: {item}', { tier: RARITY[c.tier].label, item: dropName(c) }) + (serial ? ` #${serial}` : '')
  n = { ...n, history: [{ id: uid(), at: Date.now(), text: label, milho: 0, ovo: 0 }, ...n.history].slice(0, 80) }
  return { state: n, drop }
}

/** Vitórias que faltam para o drop garantido (1 = a próxima). */
export const winsToPity = (pity: number | undefined, o: DropOdds = dropOdds()) => Math.max(1, o.pity + 1 - (pity ?? 0))

/** Feed público (GET /api/drops/recent). */
export interface RecentDrop {
  name: string
  kind: 'skin' | 'galo'
  itemId: string
  tier: DropTier
  serial: number
  at: number
}
