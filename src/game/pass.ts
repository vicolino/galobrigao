// Passe da Temporada: uma temporada por mês (UTC), 30 níveis, trilha grátis e premium.
// O XP sobe no navegador (limitado por dia e por save); resgates e compra rodam só no servidor.
import { ACC_BY_ID, BREED_BY_ID, ITEM_BY_ID, SKIN_BY_ID, TOOL_BY_ID } from './data'
import { makeRooster, today, uid } from './rooster'
import { locale, t } from '../i18n'
import type { GameState } from './types'

export const PASS_TIERS = 30
export const PASS_TIER_XP = 100
export const PASS_MAX_XP = PASS_TIERS * PASS_TIER_XP
/** XP do passe que dá para ganhar jogando por dia (30 dias ≈ nível 30 para quem joga todo dia). */
export const PASS_DAILY_XP = 120
/** Máximo de XP do passe que um save do navegador pode subir de uma vez. */
export const PASS_SAVE_MAX = 300
export const PASS_PRICE_OVOS = 400
export const PASS_SKIP_OVOS = 15
export const PASS_SKU = 'passe-temporada'
/** Galos no galinheiro (mesmo limite da loja). */
const MAX_ROOSTERS = 12

/** Pontos do passe por ação. */
export const PASS_XP = { lutar: 10, vencer: 20, missao: 40, treinar: 5, alimentar: 5, apostar: 5, desafio: 15 }

export interface PassReward {
  milho?: number
  ovos?: number
  tools?: Record<string, number>
  items?: Record<string, number>
  acc?: string
  skin?: string
  breedId?: string
}
export interface PassTier {
  tier: number
  free: PassReward
  premium: PassReward
}

// Tabela de prêmios (índice 0 = nível 1)
const FREE: PassReward[] = [
  { milho: 500 },
  { tools: { energetico: 1 } },
  { milho: 800 },
  { items: { racao: 2 } },
  { ovos: 3 },
  { tools: { escudo: 2 } },
  { milho: 1000 },
  { items: { vitamina: 1 } },
  { tools: { apito: 2 } },
  { ovos: 5 },
  { milho: 1200 },
  { tools: { curativo: 1 } },
  { items: { racao: 3 } },
  { tools: { espelho: 1 } },
  { ovos: 8, acc: 'bandana' },
  { milho: 1500 },
  { tools: { energetico: 2 } },
  { items: { vitamina: 2 } },
  { milho: 1800 },
  { ovos: 10 },
  { tools: { escudo: 3 } },
  { items: { racao: 3 } },
  { milho: 2000 },
  { tools: { curativo: 2 } },
  { ovos: 10, items: { trevo: 1 } },
  { tools: { espelho: 2 } },
  { milho: 2500 },
  { items: { vitamina: 3 } },
  { tools: { apito: 3 } },
  { ovos: 15, tools: { amuleto: 1 } },
]
const PREMIUM: PassReward[] = [
  { ovos: 10 },
  { tools: { amuleto: 2 } },
  { milho: 3000 },
  { items: { livro: 1 } },
  { acc: 'viking' },
  { ovos: 15 },
  { tools: { banda: 2 } },
  { items: { 'racao-premium': 3 } },
  { items: { trevo: 2 } },
  { ovos: 20, acc: 'capa' },
  { tools: { pimenta: 3 } },
  { milho: 6000 },
  { tools: { fenix: 1 } },
  { items: { livro: 2 } },
  { ovos: 25, skin: 'tp-aurora' },
  { acc: 'visor' },
  { tools: { amuleto: 3 } },
  { ovos: 30 },
  { tools: { banda: 3 } },
  { ovos: 30, acc: 'patins' },
  { items: { livro: 2 } },
  { tools: { fenix: 2 } },
  { milho: 10000 },
  { items: { 'racao-premium': 4 } },
  { ovos: 40, acc: 'chinelo' },
  { tools: { banda: 2, fenix: 1, amuleto: 2 } },
  { ovos: 50 },
  { acc: 'cinturao' },
  { items: { livro: 3 } },
  { ovos: 60, skin: 'tp-campeao', breedId: 'temporada' },
]
export const PASS_REWARDS: PassTier[] = FREE.map((free, i) => ({ tier: i + 1, free, premium: PREMIUM[i] }))

// ---------------- Temporada ----------------

export const seasonId = (at = Date.now()) => new Date(at).toISOString().slice(0, 7)
/** Início do mês seguinte (UTC), em ms. */
export function seasonEnd(season = seasonId()) {
  const [y, m] = season.split('-').map(Number)
  return Date.UTC(y, m, 1)
}
export function seasonName(season = seasonId()) {
  const [y, m] = season.split('-').map(Number)
  const mes = new Date(Date.UTC(y, m - 1, 15)).toLocaleString(locale(), { month: 'long', timeZone: 'UTC' })
  return t('Temporada de {mes}', { mes: mes.charAt(0).toUpperCase() + mes.slice(1) })
}

type Pass = NonNullable<GameState['pass']>
export const freshPass = (season = seasonId()): Pass => ({ season, xp: 0, premium: false, claimed: { free: [], premium: [] } })

/** Passe da temporada atual (zera quando o mês muda). */
export function currentPass(s: GameState): Pass {
  const p = s.pass
  return p && p.season === seasonId() ? p : freshPass()
}
export const ensurePass = (s: GameState): GameState => (s.pass && s.pass.season === seasonId() ? s : { ...s, pass: freshPass() })

export const passTier = (xp: number) => Math.min(PASS_TIERS, Math.floor(Math.max(0, xp) / PASS_TIER_XP))

/** Soma XP do passe jogando (respeita o limite diário). Roda no navegador e no servidor. */
export function addPassXp(s: GameState, n: number): GameState {
  const p = currentPass(s)
  const d = today()
  const dayXp = p.day === d ? (p.dayXp ?? 0) : 0
  const gain = Math.max(0, Math.min(n, PASS_DAILY_XP - dayXp, PASS_MAX_XP - p.xp))
  if (!gain) return s.pass === p ? s : { ...s, pass: p }
  return { ...s, pass: { ...p, xp: p.xp + gain, day: d, dayXp: dayXp + gain } }
}

/** Quanto o XP do passe subiu entre o save do servidor e o do navegador. */
export function passGain(cur: GameState, next: GameState): number {
  const n = next.pass
  if (!n) return 0
  const c = cur.pass && cur.pass.season === n.season ? cur.pass.xp : 0
  return n.xp - c
}

/** Validação do save: XP do passe precisa ser plausível. */
export function passViolation(cur: GameState, next: GameState): string | null {
  const n = next.pass
  if (!n) return null
  if (typeof n.season !== 'string' || !Number.isInteger(n.xp) || n.xp < 0 || n.xp > PASS_MAX_XP) return 'passe' // i18n-ok (só log do servidor)
  if (passGain(cur, next) > PASS_SAVE_MAX) return 'xp do passe' // i18n-ok (só log do servidor)
  return null
}

/**
 * Passe que fica gravado depois de um save do navegador: premium e resgates vêm do servidor;
 * o XP do navegador só entra se `allow(ganho)` aceitar (limite diário no servidor).
 */
export function mergeClientPass(cur: GameState, incoming: GameState, allow: (gain: number) => boolean): Pass {
  const c = currentPass(cur)
  const i = incoming.pass
  if (!i || i.season !== c.season) return c
  const gain = i.xp - c.xp
  const xp = gain > 0 && !allow(gain) ? c.xp : Math.max(0, Math.min(PASS_MAX_XP, Math.floor(i.xp)))
  return { ...c, xp, day: typeof i.day === 'string' ? i.day.slice(0, 10) : c.day, dayXp: Number.isFinite(i.dayXp) ? Math.max(0, Number(i.dayXp)) : c.dayXp }
}

// ---------------- Prêmios ----------------

/** Texto curto do prêmio (para a tela e o histórico). */
export function rewardLabel(r: PassReward): string {
  const out: string[] = []
  if (r.breedId) out.push(`🐓 ${BREED_BY_ID[r.breedId]?.name ?? r.breedId}`)
  if (r.skin) out.push(`${SKIN_BY_ID[r.skin]?.emoji ?? '🎨'} ${t('Skin {nome}', { nome: SKIN_BY_ID[r.skin]?.name ?? r.skin })}`) // i18n-ok
  if (r.acc) out.push(`${ACC_BY_ID[r.acc]?.emoji ?? '🎁'} ${ACC_BY_ID[r.acc]?.name ?? r.acc}`)
  if (r.ovos) out.push(`🥚 ${r.ovos}`) // i18n-ok
  if (r.milho) out.push(`🌽 ${r.milho.toLocaleString(locale())}`) // i18n-ok
  for (const [id, q] of Object.entries(r.tools ?? {})) out.push(`${TOOL_BY_ID[id]?.emoji ?? '🧰'} ${q}x ${TOOL_BY_ID[id]?.name ?? id}`)
  for (const [id, q] of Object.entries(r.items ?? {})) out.push(`${ITEM_BY_ID[id]?.emoji ?? '🎁'} ${q}x ${ITEM_BY_ID[id]?.name ?? id}`)
  return out.join(' + ')
}

/** Emoji principal do prêmio (para o quadradinho da trilha). */
export function rewardEmoji(r: PassReward): string {
  if (r.breedId) return '🐓'
  if (r.skin) return SKIN_BY_ID[r.skin]?.emoji ?? '🎨'
  if (r.acc) return ACC_BY_ID[r.acc]?.emoji ?? '🎁'
  const tool = Object.keys(r.tools ?? {})[0]
  if (tool) return TOOL_BY_ID[tool]?.emoji ?? '🧰'
  const item = Object.keys(r.items ?? {})[0]
  if (item) return ITEM_BY_ID[item]?.emoji ?? '🎁'
  if (r.ovos) return '🥚'
  return '🌽'
}

class PassError extends Error {}
const no = (msg: string): never => {
  throw new PassError(msg)
}

/** Entrega um prêmio (só no servidor). Skin/galo repetidos viram ovos. */
function giveReward(s: GameState, r: PassReward): { state: GameState; ovos: number; milho: number } {
  let n = { ...s }
  let ovos = r.ovos ?? 0
  const milho = r.milho ?? 0
  if (r.breedId) {
    if (n.roosters.some((x) => x.breedId === r.breedId)) ovos += 100
    else {
      if (n.roosters.length >= MAX_ROOSTERS) no(t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: MAX_ROOSTERS }))
      const breed = BREED_BY_ID[r.breedId]
      const ro = { ...makeRooster({ breedId: r.breedId, name: breed.name, stars: 4, owner: n.player.name }), base: { ...breed.base }, style: 'equilibrado' as const }
      n.roosters = [...n.roosters, ro]
    }
  }
  if (r.skin) {
    if (n.skins.includes(r.skin)) ovos += Math.round((SKIN_BY_ID[r.skin]?.price ?? 100) / 2)
    else n.skins = [...n.skins, r.skin]
  }
  if (r.acc) n.accessories = { ...n.accessories, [r.acc]: (n.accessories[r.acc] ?? 0) + 1 }
  if (r.tools) {
    const tools = { ...n.tools }
    for (const [id, q] of Object.entries(r.tools)) tools[id] = (tools[id] ?? 0) + q
    n.tools = tools
  }
  if (r.items) {
    const items = { ...n.items }
    for (const [id, q] of Object.entries(r.items)) items[id] = (items[id] ?? 0) + q
    n.items = items
  }
  n = { ...n, ovos: n.ovos + ovos, milho: n.milho + milho }
  return { state: n, ovos, milho }
}

const logPass = (s: GameState, text: string, milho: number, ovo: number): GameState => ({
  ...s,
  history: [{ id: uid(), at: Date.now(), text, milho, ovo }, ...s.history].slice(0, 80),
})

function claimOne(s: GameState, track: 'free' | 'premium', tier: number): GameState {
  const p = currentPass(s)
  if (!Number.isInteger(tier) || tier < 1 || tier > PASS_TIERS) no(t('Nível inválido'))
  if (track !== 'free' && track !== 'premium') no(t('Trilha inválida'))
  if (passTier(p.xp) < tier) no(t('Você ainda não chegou nesse nível do passe.'))
  if (track === 'premium' && !p.premium) no(t('Esse prêmio é do Passe Premium.'))
  if (p.claimed[track].includes(tier)) no(t('Prêmio já resgatado.'))
  const r = PASS_REWARDS[tier - 1][track]
  const g = giveReward(s, r)
  const pass: Pass = { ...p, claimed: { ...p.claimed, [track]: [...p.claimed[track], tier] } }
  return logPass({ ...g.state, pass }, t('Passe nível {n}: {premio}', { n: tier, premio: rewardLabel(r) }), g.milho, g.ovos)
}

/** Concede o premium da temporada atual (compra com dinheiro). Se já tinha, devolve em ovos. */
export function grantPassPremium(s: GameState): GameState {
  const p = currentPass(s)
  if (p.premium) return { ...s, pass: p, ovos: s.ovos + PASS_PRICE_OVOS }
  return { ...s, pass: { ...p, premium: true } }
}
export const hasPassPremium = (s: GameState | null | undefined) => !!s && currentPass(s).premium

export type PassOp =
  | { op: 'passClaim'; track: 'free' | 'premium'; tier: number }
  | { op: 'passClaimAll' }
  | { op: 'passBuy' }
  | { op: 'passSkip' }

/** Operações do passe (rodam no servidor via /api/shop). Lança Error com a mensagem para o jogador. */
export function runPass(s0: GameState, o: PassOp): { state: GameState; value?: unknown } {
  const s = ensurePass(s0)
  const p = s.pass!
  switch (o.op) {
    case 'passClaim':
      return { state: claimOne(s, o.track, Number(o.tier)), value: rewardLabel(PASS_REWARDS[Number(o.tier) - 1][o.track]) }
    case 'passClaimAll': {
      let n = s
      let count = 0
      let skipped = 0
      const reached = passTier(p.xp)
      for (let tier = 1; tier <= reached; tier++) {
        for (const track of p.premium ? (['free', 'premium'] as const) : (['free'] as const)) {
          if (n.pass!.claimed[track].includes(tier)) continue
          try {
            n = claimOne(n, track, tier)
            count++
          } catch (e) {
            if (!(e instanceof PassError)) throw e
            skipped++
          }
        }
      }
      if (!count) no(skipped ? t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: MAX_ROOSTERS }) : t('Nada para resgatar agora.'))
      return { state: n, value: { count, skipped } }
    }
    case 'passBuy': {
      if (p.premium) no(t('Você já tem o Passe Premium desta temporada.'))
      if (s.ovos < PASS_PRICE_OVOS) no(t('Ovos de ouro insuficientes 🥚'))
      const n = { ...s, ovos: s.ovos - PASS_PRICE_OVOS, pass: { ...p, premium: true }, stats: { ...s.stats, purchases: s.stats.purchases + 1 } }
      return { state: logPass(n, t('Passe Premium: {temporada}', { temporada: seasonName(p.season) }), 0, -PASS_PRICE_OVOS) }
    }
    case 'passSkip': {
      if (p.xp >= PASS_MAX_XP) no(t('Você já está no nível máximo do passe.'))
      if (s.ovos < PASS_SKIP_OVOS) no(t('Ovos de ouro insuficientes 🥚'))
      const xp = Math.min(PASS_MAX_XP, (passTier(p.xp) + 1) * PASS_TIER_XP)
      const n = { ...s, ovos: s.ovos - PASS_SKIP_OVOS, pass: { ...p, xp } }
      return { state: logPass(n, t('Passe: +1 nível'), 0, -PASS_SKIP_OVOS), value: passTier(xp) }
    }
  }
  return no(t('Operação desconhecida'))
}
