import { mergeConfig, setLiveConfig, type AppConfig } from '../src/game/config'
import { getDb } from './db'
import { t } from '../src/i18n'

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
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(t('{campo}: valor entre {min} e {max}', { campo: name, min, max }))
  return n
}

/** Valida o que veio do backoffice antes de salvar. */
export function validateConfig(input: AppConfig): AppConfig {
  const c = mergeConfig(input)
  for (const [id, o] of Object.entries(c.catalog)) {
    o.priceCents = Math.round(num(o.priceCents, 100, 100000, t('Preço de {id} (centavos)', { id })))
    if (o.ovos !== undefined) o.ovos = Math.round(num(o.ovos, 0, 100000, t('Ovos de {id}', { id })))
    if (o.bonus !== undefined) o.bonus = Math.round(num(o.bonus, 0, 100000, t('Bônus de {id}', { id })))
    o.active = !!o.active
  }
  c.rewards.dailyOvos = Math.round(num(c.rewards.dailyOvos, 0, 100, t('Ovos do bônus diário')))
  c.rewards.day7Ovos = Math.round(num(c.rewards.day7Ovos, 0, 500, t('Ovos do 7º dia')))
  c.rewards.arenaHardWinOvos = Math.round(num(c.rewards.arenaHardWinOvos, 0, 50, t('Ovos por vitória difícil')))
  c.rewards.missionOvosMultiplier = num(c.rewards.missionOvosMultiplier, 0, 5, t('Multiplicador das missões'))
  c.pvp.maxLevelDiff = Math.round(num(c.pvp.maxLevelDiff, 0, 10, t('Diferença máxima de nível')))
  c.pvp.dailyRewards = Math.round(num(c.pvp.dailyRewards, 0, 200, t('Desafios com prêmio por dia')))
  c.pvp.challengeTtlSec = Math.round(num(c.pvp.challengeTtlSec, 15, 600, t('Tempo para aceitar (s)')))
  c.pvp.feePct = num(c.pvp.feePct, 0, 50, t('Taxa do desafio (%)'))
  c.pvp.minStakeOvo = Math.round(num(c.pvp.minStakeOvo, 1, 1_000_000, t('Aposta mínima do desafio (ovos)')))
  c.pvp.maxStakeOvo = Math.round(num(c.pvp.maxStakeOvo, c.pvp.minStakeOvo, 10_000_000, t('Aposta máxima do desafio (ovos)')))
  c.economy.freeOvosPerDay = Math.round(num(c.economy.freeOvosPerDay, 0, 5000, t('Ovos grátis por dia (limite)')))
  c.economy.freeMilhoPerDay = Math.round(num(c.economy.freeMilhoPerDay, 0, 100_000_000, t('Milho ganho por dia (limite)')))
  c.economy.defaultSpendLimitCents = Math.round(num(c.economy.defaultSpendLimitCents, 1000, 1000000, t('Limite de gasto padrão')))
  c.economy.serverAuthoritative = c.economy.serverAuthoritative !== false
  c.announcement.text = String(c.announcement.text ?? '').slice(0, 200)
  if (!['info', 'promo', 'alerta'].includes(c.announcement.kind)) c.announcement.kind = 'info'
  c.mvp.on = !!c.mvp.on
  c.mvp.creditCents = Math.round(num(c.mvp.creditCents, 0, 1_000_000, t('Crédito MVP (centavos)')))
  c.bets.intervalMin = Math.round(num(c.bets.intervalMin, 2, 120, t('Intervalo entre lutas (min)')))
  c.bets.closeSec = Math.round(num(c.bets.closeSec, 0, 600, t('Apostas fecham antes (s)')))
  c.bets.horizonMin = Math.round(num(c.bets.horizonMin, 30, 24 * 60, t('Agenda à frente (min)')))
  c.bets.liveSec = Math.round(num(c.bets.liveSec, 20, 600, t('Duração do ao vivo (s)')))
  c.bets.minBet = Math.round(num(c.bets.minBet, 1, 100000, t('Aposta mínima (fichas)')))
  c.bets.maxBet = Math.round(num(c.bets.maxBet, c.bets.minBet, 10_000_000, t('Aposta máxima (fichas)')))
  c.bets.chipsStart = Math.round(num(c.bets.chipsStart, 0, 1_000_000, t('Fichas iniciais')))
  c.bets.chipsDaily = Math.round(num(c.bets.chipsDaily, 0, 100_000, t('Fichas do bônus diário')))
  c.bets.chipsArenaWin = Math.round(num(c.bets.chipsArenaWin, 0, 10_000, t('Fichas por vitória na Arena')))
  c.bets.chipsFloor = Math.round(num(c.bets.chipsFloor, 0, 100_000, t('Piso de fichas no bônus diário')))
  c.deposit.eggsPerUsdc = num(c.deposit.eggsPerUsdc, 1, 10_000, t('Ovos por 1 USDC (depósito)'))
  c.deposit.minUsdc = num(c.deposit.minUsdc, 1, 1000, t('Depósito mínimo (USDC)'))
  c.deposit.dailyCapUsdc = num(c.deposit.dailyCapUsdc, c.deposit.minUsdc, 100_000, t('Limite diário de depósito (USDC)'))
  // 🎁 Drops da Arena
  const dr = c.drops
  dr.on = dr.on !== false
  dr.chanceFacil = num(dr.chanceFacil, 0, 100, t('Chance de drop: Fácil (%)'))
  dr.chanceMedio = num(dr.chanceMedio, 0, 100, t('Chance de drop: Médio (%)'))
  dr.chanceDificil = num(dr.chanceDificil, 0, 100, t('Chance de drop: Difícil (%)'))
  dr.chanceChefao = num(dr.chanceChefao, 0, 100, t('Chance de drop: Chefão (%)'))
  dr.tierComum = num(dr.tierComum, 0, 100, t('Drop comum (%)'))
  dr.tierRaro = num(dr.tierRaro, 0, 100, t('Drop raro (%)'))
  dr.tierEpico = num(dr.tierEpico, 0, 100, t('Drop épico (%)'))
  dr.tierLendario = num(dr.tierLendario, 0, 100, t('Drop lendário (%)'))
  if (Math.abs(dr.tierComum + dr.tierRaro + dr.tierEpico + dr.tierLendario - 100) > 0.01) throw new Error(t('As chances dos tiers de drop precisam somar 100%.'))
  dr.pity = Math.round(num(dr.pity, 1, 1000, t('Drop garantido após (vitórias)')))
  dr.dailyCap = Math.round(num(dr.dailyCap, 0, 100, t('Máximo de drops por dia')))
  dr.supplyCap = Math.round(num(dr.supplyCap, 0, 1_000_000, t('Tiragem máxima por item (0 = sem limite)')))
  c.maintenance.on = !!c.maintenance.on
  c.maintenance.message = String(c.maintenance.message ?? '').slice(0, 200)
  // ⛓️ Chave da rede on-chain: só valores conhecidos (vazio = usa o env).
  {
    const net = String(c.onchain?.network ?? '').trim().toLowerCase()
    c.onchain = { network: ['', 'off', 'testnet', 'mainnet'].includes(net) ? net : '' }
  }
  return c
}
