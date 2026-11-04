import { mergeConfig, setLiveConfig, type AppConfig } from '../src/game/config'
import { getDb } from './db'

/** Lê a configuração do banco e aplica no processo (barato: uma linha). */
export function loadConfig(): AppConfig {
  const row = getDb().prepare("SELECT value FROM config WHERE key = 'app'").get() as { value: string } | undefined
  const cfg = mergeConfig(row ? JSON.parse(row.value) : null)
  setLiveConfig(cfg)
  return cfg
}

export function saveConfig(cfg: AppConfig, by: string) {
  getDb()
    .prepare("INSERT INTO config (key, value, updated_at, updated_by) VALUES ('app', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .run(JSON.stringify(cfg), Date.now(), by)
  setLiveConfig(cfg)
}

const num = (v: unknown, min: number, max: number, name: string) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name}: valor entre ${min} e ${max}`)
  return n
}

/** Valida o que veio do backoffice antes de salvar. */
export function validateConfig(input: AppConfig): AppConfig {
  const c = mergeConfig(input)
  for (const [id, o] of Object.entries(c.catalog)) {
    o.priceCents = Math.round(num(o.priceCents, 100, 100000, `Preço de ${id} (centavos)`))
    if (o.ovos !== undefined) o.ovos = Math.round(num(o.ovos, 0, 100000, `Ovos de ${id}`))
    if (o.bonus !== undefined) o.bonus = Math.round(num(o.bonus, 0, 100000, `Bônus de ${id}`))
    o.active = !!o.active
  }
  c.rewards.dailyOvos = Math.round(num(c.rewards.dailyOvos, 0, 100, 'Ovos do bônus diário'))
  c.rewards.day7Ovos = Math.round(num(c.rewards.day7Ovos, 0, 500, 'Ovos do 7º dia'))
  c.rewards.arenaHardWinOvos = Math.round(num(c.rewards.arenaHardWinOvos, 0, 50, 'Ovos por vitória difícil'))
  c.rewards.missionOvosMultiplier = num(c.rewards.missionOvosMultiplier, 0, 5, 'Multiplicador das missões')
  c.pvp.maxLevelDiff = Math.round(num(c.pvp.maxLevelDiff, 0, 10, 'Diferença máxima de nível'))
  c.pvp.dailyRewards = Math.round(num(c.pvp.dailyRewards, 0, 200, 'Desafios com prêmio por dia'))
  c.pvp.challengeTtlSec = Math.round(num(c.pvp.challengeTtlSec, 15, 600, 'Tempo para aceitar (s)'))
  c.economy.freeOvosPerDay = Math.round(num(c.economy.freeOvosPerDay, 0, 5000, 'Ovos grátis por dia (limite)'))
  c.economy.freeMilhoPerDay = Math.round(num(c.economy.freeMilhoPerDay, 0, 100_000_000, 'Milho ganho por dia (limite)'))
  c.economy.defaultSpendLimitCents = Math.round(num(c.economy.defaultSpendLimitCents, 1000, 1000000, 'Limite de gasto padrão'))
  c.announcement.text = String(c.announcement.text ?? '').slice(0, 200)
  if (!['info', 'promo', 'alerta'].includes(c.announcement.kind)) c.announcement.kind = 'info'
  c.mvp.on = !!c.mvp.on
  c.mvp.creditCents = Math.round(num(c.mvp.creditCents, 0, 1_000_000, 'Crédito MVP (centavos)'))
  c.maintenance.on = !!c.maintenance.on
  c.maintenance.message = String(c.maintenance.message ?? '').slice(0, 200)
  return c
}
