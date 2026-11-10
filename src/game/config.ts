// Configuração do jogo editável pelo backoffice (sem precisar publicar de novo).
// Os valores padrão abaixo valem até alguém salvar algo diferente no backoffice.
import { t } from '../i18n'
import { CATALOG, DEFAULT_SPEND_LIMIT, FREE_OVOS_PER_DAY, type Sku } from './catalog'

export interface SkuOverride {
  priceCents: number
  ovos?: number
  bonus?: number
  active: boolean
}

export interface AppConfig {
  /** 💵 Moeda dos preços do catálogo. Configs salvas antes da virada para USDC (sem este campo) tinham preços em centavos de real e são ignoradas. */
  priceUnit: 'usdc'
  catalog: Record<string, SkuOverride>
  rewards: { dailyOvos: number; day7Ovos: number; arenaHardWinOvos: number; missionOvosMultiplier: number }
  pvp: { maxLevelDiff: number; dailyRewards: number; challengeTtlSec: number; feePct: number; minStakeOvo: number; maxStakeOvo: number }
  economy: { freeOvosPerDay: number; freeMilhoPerDay: number; defaultSpendLimitCents: number; /** 🌽 Milho/XP/prêmios só pelo servidor (desligar = volta ao modo antigo). */ serverAuthoritative: boolean; /** 🏟️ Teto de milho que a Arena dá a cada jogador por dia (0 = sem limite). Acima do teto a luta rende só 15% de milho (ovos/XP/drop seguem normais). */ arenaMilhoCapPerDay: number; /** 💹 Multiplicador do preço em MILHO da loja (caixas, mercado de galos). 1 = sem mudança; >1 = milho vale mais (contém inflação). */ milhoSinkMult: number; /** 💹 Multiplicador do milho recebido na troca ovo→milho. 1 = sem mudança; <1 = torneira menor. */ ovoToMilhoMult: number }
  announcement: { text: string; kind: 'info' | 'promo' | 'alerta' }
  maintenance: { on: boolean; message: string }
  /** ⛓️ Rede on-chain (chave do back-office): '' = usa o env; 'off' | 'testnet' | 'mainnet'. */
  onchain: { network: string }
  mvp: { on: boolean; creditCents: number }
  /** 💵 Depósito de USDC → 🥚 ovos (só ida). Mínimo e limite diário em USDC por jogador. */
  deposit: { eggsPerUsdc: number; minUsdc: number; dailyCapUsdc: number }
  // 💵 Venda de USDC por PIX — DESATIVADA (tudo é cripto; o servidor recusa a rota). (a casa é a contraparte). Preço = base * (1 + marginPct/100),
  // onde base = cotação viva (autoRate) ou brlPerUsdc (manual, também é o fallback).
  usdcSale: { on: boolean; autoRate: boolean; marginPct: number; brlPerUsdc: number; minUsdc: number; maxUsdc: number; dailyCapUsdc: number }
  /** 🎁 Drops da Arena (prêmio grátis por vitória). Chances em %; tiers somam 100. */
  drops: DropsConfig
  bets: {
    intervalMin: number
    closeSec: number
    horizonMin: number
    liveSec: number
    /** Em 🎟️ fichas. */
    minBet: number
    maxBet: number
    /** Fichas iniciais, bônus diário, por vitória na Arena e piso garantido pelo bônus diário. */
    chipsStart: number
    chipsDaily: number
    chipsArenaWin: number
    chipsFloor: number
  }
}

export interface DropsConfig {
  on: boolean
  chanceFacil: number
  chanceMedio: number
  chanceDificil: number
  chanceChefao: number
  tierComum: number
  tierRaro: number
  tierEpico: number
  tierLendario: number
  /** Vitórias sem drop até o próximo ser garantido. */
  pity: number
  /** Máximo de drops por jogador por dia (UTC). */
  dailyCap: number
  /** Tiragem máxima de cada item épico/lendário (0 = sem limite). */
  supplyCap: number
}

export const DEFAULT_CONFIG: AppConfig = {
  priceUnit: 'usdc',
  catalog: Object.fromEntries(CATALOG.map((s) => [s.id, { priceCents: s.priceCents, ovos: s.ovos, bonus: s.bonus, active: true }])),
  rewards: { dailyOvos: 6, day7Ovos: 35, arenaHardWinOvos: 2, missionOvosMultiplier: 1 },
  pvp: { maxLevelDiff: 1, dailyRewards: 20, challengeTtlSec: 60, feePct: 10, minStakeOvo: 1, maxStakeOvo: 100 },
  economy: { freeOvosPerDay: FREE_OVOS_PER_DAY, freeMilhoPerDay: 3_000_000, defaultSpendLimitCents: DEFAULT_SPEND_LIMIT, serverAuthoritative: true, arenaMilhoCapPerDay: 100_000, milhoSinkMult: 1, ovoToMilhoMult: 1 },
  announcement: { text: '', kind: 'info' },
  maintenance: { on: false, message: t('Estamos ajeitando o terreiro. Voltamos já!') },
  // ⛓️ Rede on-chain: '' = usa o WEB3_NETWORK do env (padrão). A chave no admin troca para off/testnet/mainnet.
  onchain: { network: '' },
  // Modo MVP: cada conta ganha crédito de teste (sem valor real) para comprar na loja
  mvp: { on: true, creditCents: 10000 },
  // (não chama `web3`: /api/config já usa `web3: boolean` para dizer se a carteira está ligada)
  deposit: { eggsPerUsdc: 50, minUsdc: 1, dailyCapUsdc: 500 },
  usdcSale: { on: false, autoRate: true, marginPct: 9, brlPerUsdc: 5.5, minUsdc: 1, maxUsdc: 200, dailyCapUsdc: 500 },
  drops: { on: true, chanceFacil: 6, chanceMedio: 10, chanceDificil: 15, chanceChefao: 22, tierComum: 70, tierRaro: 22, tierEpico: 6.5, tierLendario: 1.5, pity: 15, dailyCap: 3, supplyCap: 500 },
  // Agenda de lutas da casa: uma luta a cada `intervalMin`, apostas fecham `closeSec` antes.
  // Apostas usam 🎟️ fichas (nunca milho/ovos): ganha jogando, não compra, não troca.
  bets: { intervalMin: 10, closeSec: 30, horizonMin: 120, liveSec: 75, minBet: 10, maxBet: 5000, chipsStart: 1000, chipsDaily: 300, chipsArenaWin: 30, chipsFloor: 200 },
}

/** Junta o que foi salvo com os padrões (campos novos sempre têm valor). */
export function mergeConfig(saved: Partial<AppConfig> | null | undefined): AppConfig {
  const s = saved ?? {}
  // Preços salvos em real (antes da virada para USDC) não valem mais: mantém só ovos/bônus/ativo.
  const legacyPrices = s.priceUnit !== 'usdc'
  const catalog: Record<string, SkuOverride> = {}
  for (const sku of CATALOG) {
    const o = { ...(s.catalog?.[sku.id] ?? {}) } as Partial<SkuOverride>
    if (legacyPrices) delete o.priceCents
    catalog[sku.id] = { ...DEFAULT_CONFIG.catalog[sku.id], ...o }
  }
  return {
    priceUnit: 'usdc',
    catalog,
    rewards: { ...DEFAULT_CONFIG.rewards, ...s.rewards },
    pvp: { ...DEFAULT_CONFIG.pvp, ...s.pvp },
    economy: { ...DEFAULT_CONFIG.economy, ...s.economy },
    announcement: { ...DEFAULT_CONFIG.announcement, ...s.announcement },
    maintenance: { ...DEFAULT_CONFIG.maintenance, ...s.maintenance },
    onchain: { ...DEFAULT_CONFIG.onchain, ...s.onchain },
    mvp: { ...DEFAULT_CONFIG.mvp, ...s.mvp },
    deposit: { ...DEFAULT_CONFIG.deposit, ...s.deposit },
    usdcSale: { ...DEFAULT_CONFIG.usdcSale, ...s.usdcSale, on: false },
    drops: { ...DEFAULT_CONFIG.drops, ...s.drops },
    bets: { ...DEFAULT_CONFIG.bets, ...s.bets },
  }
}

/** Configuração em uso agora (no navegador vem de /api/config; no servidor, do banco). */
export const live: AppConfig = mergeConfig(null)

export function setLiveConfig(c: AppConfig) {
  Object.assign(live, c)
}

// 💹 Dial de inflação do milho (ajustável no backoffice, vale para cobrança E exibição):
/** Aplica o multiplicador de custo de milho da loja a um preço base. */
export const milhoSink = (base: number) => Math.round(base * Math.max(0, live.economy?.milhoSinkMult ?? 1))
/** Aplica o multiplicador da troca ovo→milho ao milho recebido. */
export const ovoToMilho = (base: number) => Math.round(base * Math.max(0, live.economy?.ovoToMilhoMult ?? 1))

/** Produto com preço/quantidade atuais. */
export function effectiveSku(id: string): (Sku & { active: boolean }) | undefined {
  const base = CATALOG.find((s) => s.id === id)
  if (!base) return undefined
  const o = live.catalog[id] ?? DEFAULT_CONFIG.catalog[id]
  return { ...base, priceCents: o.priceCents, ovos: o.ovos ?? base.ovos, bonus: o.bonus ?? base.bonus, active: o.active }
}

export const effectiveCatalog = () => CATALOG.map((s) => effectiveSku(s.id)!)

/** Parte da configuração que o navegador precisa conhecer. */
export const publicConfig = (c: AppConfig) => ({ economy: c.economy, rewards: c.rewards, pvp: c.pvp, announcement: c.announcement, maintenance: c.maintenance, mvp: c.mvp, bets: c.bets, drops: c.drops })
export type PublicConfig = ReturnType<typeof publicConfig> & { build?: string | null; web3?: boolean }
