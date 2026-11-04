// Configuração do jogo editável pelo backoffice (sem precisar publicar de novo).
// Os valores padrão abaixo valem até alguém salvar algo diferente no backoffice.
import { CATALOG, DEFAULT_SPEND_LIMIT, FREE_OVOS_PER_DAY, type Sku } from './catalog'

export interface SkuOverride {
  priceCents: number
  ovos?: number
  bonus?: number
  active: boolean
}

export interface AppConfig {
  catalog: Record<string, SkuOverride>
  rewards: { dailyOvos: number; day7Ovos: number; arenaHardWinOvos: number; missionOvosMultiplier: number }
  pvp: { maxLevelDiff: number; dailyRewards: number; challengeTtlSec: number }
  economy: { freeOvosPerDay: number; defaultSpendLimitCents: number }
  announcement: { text: string; kind: 'info' | 'promo' | 'alerta' }
  maintenance: { on: boolean; message: string }
}

export const DEFAULT_CONFIG: AppConfig = {
  catalog: Object.fromEntries(CATALOG.map((s) => [s.id, { priceCents: s.priceCents, ovos: s.ovos, bonus: s.bonus, active: true }])),
  rewards: { dailyOvos: 6, day7Ovos: 35, arenaHardWinOvos: 2, missionOvosMultiplier: 1 },
  pvp: { maxLevelDiff: 1, dailyRewards: 20, challengeTtlSec: 60 },
  economy: { freeOvosPerDay: FREE_OVOS_PER_DAY, defaultSpendLimitCents: DEFAULT_SPEND_LIMIT },
  announcement: { text: '', kind: 'info' },
  maintenance: { on: false, message: 'Estamos ajeitando o terreiro. Voltamos já!' },
}

/** Junta o que foi salvo com os padrões (campos novos sempre têm valor). */
export function mergeConfig(saved: Partial<AppConfig> | null | undefined): AppConfig {
  const s = saved ?? {}
  const catalog: Record<string, SkuOverride> = {}
  for (const sku of CATALOG) catalog[sku.id] = { ...DEFAULT_CONFIG.catalog[sku.id], ...(s.catalog?.[sku.id] ?? {}) }
  return {
    catalog,
    rewards: { ...DEFAULT_CONFIG.rewards, ...s.rewards },
    pvp: { ...DEFAULT_CONFIG.pvp, ...s.pvp },
    economy: { ...DEFAULT_CONFIG.economy, ...s.economy },
    announcement: { ...DEFAULT_CONFIG.announcement, ...s.announcement },
    maintenance: { ...DEFAULT_CONFIG.maintenance, ...s.maintenance },
  }
}

/** Configuração em uso agora (no navegador vem de /api/config; no servidor, do banco). */
export const live: AppConfig = mergeConfig(null)

export function setLiveConfig(c: AppConfig) {
  Object.assign(live, c)
}

/** Produto com preço/quantidade atuais. */
export function effectiveSku(id: string): (Sku & { active: boolean }) | undefined {
  const base = CATALOG.find((s) => s.id === id)
  if (!base) return undefined
  const o = live.catalog[id] ?? DEFAULT_CONFIG.catalog[id]
  return { ...base, priceCents: o.priceCents, ovos: o.ovos ?? base.ovos, bonus: o.bonus ?? base.bonus, active: o.active }
}

export const effectiveCatalog = () => CATALOG.map((s) => effectiveSku(s.id)!)

/** Parte da configuração que o navegador precisa conhecer. */
export const publicConfig = (c: AppConfig) => ({ rewards: c.rewards, pvp: c.pvp, announcement: c.announcement, maintenance: c.maintenance })
export type PublicConfig = ReturnType<typeof publicConfig>
