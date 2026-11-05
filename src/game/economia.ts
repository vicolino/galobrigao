// 🌽 Economia no servidor (fonte da verdade): Arena, bônus diário, missões, liga, treino, comida,
// venda para a casa, compra no mercado e uso de itens. Funções puras: o servidor roda de verdade;
// com `economy.serverAuthoritative` desligado o navegador roda as mesmas funções localmente (modo antigo).
import { ITEM_BY_ID, LEAGUE_TIERS, MAX_TOOLS, TOOL_BY_ID, VIP, BREED_BY_ID, ACCESSORIES } from './data'
import { simulate } from './battle'
import { ENERGY_COST, addXp, currentEnergy, feedCost, marketPrice, sellPrice, today, trainCost, uid, withEnergy } from './rooster'
import { DAILY_OVOS, arenaChips, arenaOvos, dailyChips } from './rewards'
import { addPassXp, passGain, PASS_XP } from './pass'
import { checkAchievements, genMissions, type Difficulty } from './engine'
import { isRented } from './aluguel'
import { live } from './config'
import { t, tp, tx } from '../i18n'
import type { Currency, GameState, MissionKind, Rooster } from './types'

export type EconOp =
  | { op: 'claimDaily' }
  | { op: 'claimMission'; id: string }
  | { op: 'claimLeague'; tier: string }
  | { op: 'sellRooster'; roosterId: string }
  | { op: 'train'; roosterId: string }
  | { op: 'feed'; roosterId: string }
  | { op: 'buyRooster'; id: string }
  | { op: 'useItem'; itemId: string; roosterId: string }

export const ECON_OPS = new Set<string>(['claimDaily', 'claimMission', 'claimLeague', 'sellRooster', 'train', 'feed', 'buyRooster', 'useItem'])

/** Economia no servidor ligada? (backoffice → Configurações; padrão: ligada) */
export const serverEconomy = () => live.economy?.serverAuthoritative !== false

export const FEED_COOLDOWN_MS = 4 * 3600_000

interface Helpers {
  pay: (s: GameState, price: number, c: Currency) => GameState
  log: (s: GameState, text: string, milho: number, ovo: number) => GameState
  purchase: (s: GameState) => GameState
  fail: (msg: string) => never
}

const isVip = (s: GameState) => s.vip.until > Date.now()

const bump = (s: GameState, kind: MissionKind, n = 1): GameState => ({
  ...s,
  missions: { ...s.missions, list: s.missions.list.map((m) => (m.kind === kind && !m.claimed ? { ...m, progress: Math.min(m.goal, m.progress + n) } : m)) },
})

const upd = (s: GameState, id: string, fn: (r: Rooster) => Rooster): GameState => ({ ...s, roosters: s.roosters.map((r) => (r.id === id ? fn(r) : r)) })

const logF = (s: GameState, text: string, milho: number, ovo: number, fichas = 0): GameState => ({
  ...s,
  history: [{ id: uid(), at: Date.now(), text, milho, ovo, ...(fichas ? { fichas } : {}) }, ...s.history].slice(0, 80),
})

export function runEcon(s: GameState, o: EconOp, h: Helpers): { state: GameState; value?: unknown } {
  const find = (id: string) => s.roosters.find((r) => r.id === id) ?? h.fail(t('Galo não encontrado'))
  switch (o.op) {
    case 'claimDaily': {
      const d = today()
      if (s.daily.last === d) h.fail(t('Você já pegou o bônus de hoje. Volte amanhã!'))
      const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
      const streak = s.daily.last === yesterday ? (s.daily.streak % 7) + 1 : 1
      const milho = Math.round(300 * streak * (isVip(s) ? 1 + VIP.milhoBonus : 1))
      const ovo = DAILY_OVOS(streak) + (isVip(s) ? VIP.dailyOvos : 0)
      const fichas = dailyChips(s.fichas ?? 0)
      let n: GameState = { ...s, milho: s.milho + milho, ovos: s.ovos + ovo, fichas: (s.fichas ?? 0) + fichas, daily: { last: d, streak } }
      n = logF(n, t('Bônus diário (dia {n})', { n: streak }), milho, ovo, fichas)
      return { state: n, value: { milho, ovo, fichas, streak } }
    }
    case 'claimMission': {
      const m = s.missions.list.find((x) => x.id === o.id)
      if (!m || m.claimed || m.progress < m.goal) h.fail(t('Missão ainda não concluída.'))
      let n: GameState = {
        ...s,
        milho: s.milho + m!.reward.milho,
        ovos: s.ovos + m!.reward.ovo,
        missions: { ...s.missions, list: s.missions.list.map((x) => (x.id === o.id ? { ...x, claimed: true } : x)) },
      }
      n = logF(n, t('Missão: {texto}', { texto: tx(m!.text) }), m!.reward.milho, m!.reward.ovo)
      return { state: addPassXp(n, PASS_XP.missao) }
    }
    case 'claimLeague': {
      const tier = LEAGUE_TIERS.find((x) => x.name === o.tier)
      if (!tier || s.league.points < tier.min || s.league.claimed.includes(tier.name)) h.fail(t('Recompensa indisponível.'))
      let n: GameState = { ...s, milho: s.milho + tier!.reward.milho, ovos: s.ovos + tier!.reward.ovo, league: { ...s.league, claimed: [...s.league.claimed, tier!.name] } }
      n = logF(n, t('Liga: recompensa {tier}', { tier: tx(tier!.name) }), tier!.reward.milho, tier!.reward.ovo)
      return { state: n }
    }
    case 'sellRooster': {
      if (s.roosters.length <= 1) h.fail(t('Você precisa ter pelo menos um galo.'))
      const ro = find(o.roosterId)
      if (isRented(ro)) h.fail(t('Galo alugado não pode ser vendido nem dado.'))
      if (ro.nft) h.fail(t('{nome} é um Galo NFT: negocie no Mercado USDC ou traga de volta para o jogo antes.', { nome: ro.name }))
      const price = sellPrice(ro)
      const accs = { ...s.accessories }
      Object.values(ro.equipped).forEach((a) => a && (accs[a] = (accs[a] ?? 0) + 1))
      const n: GameState = { ...s, milho: s.milho + price, accessories: accs, roosters: s.roosters.filter((r) => r.id !== ro.id) }
      return { state: logF(n, t('Vendeu {nome}', { nome: ro.name }), price, 0), value: price }
    }
    case 'train': {
      const ro = find(o.roosterId)
      const e = currentEnergy(ro)
      if (e < 15) h.fail(t('{nome} está cansado demais para treinar.', { nome: ro.name }))
      let n = h.pay(s, trainCost(ro.level), 'milho')
      const xp = 40 + ro.level * 8
      const { levels } = addXp(ro, xp)
      n = upd(n, ro.id, (r) => withEnergy(addXp(r, xp).rooster, e - 15))
      n = addPassXp(bump(n, 'treinar'), PASS_XP.treinar)
      return { state: n, value: levels ? t('🎉 {nome} subiu para o nível {n}!', { nome: ro.name, n: ro.level + levels }) : t('{nome} treinou e ganhou {xp} XP 💪', { nome: ro.name, xp }) }
    }
    case 'feed': {
      const ro = find(o.roosterId)
      if (ro.fedAt && Date.now() - ro.fedAt < FEED_COOLDOWN_MS) h.fail(t('{nome} ainda está de papo cheio.', { nome: ro.name }))
      let n = h.pay(s, feedCost(ro.level), 'milho')
      const xp = 30 + ro.level * 6
      const { levels } = addXp(ro, xp)
      n = upd(n, ro.id, (r) => ({ ...withEnergy(addXp(r, xp).rooster, currentEnergy(r) + 15), fedAt: Date.now() }))
      n = addPassXp(n, PASS_XP.alimentar)
      return { state: n, value: levels ? t('🎉 {nome} comeu e subiu para o nível {n}!', { nome: ro.name, n: ro.level + levels }) : t('{nome} comeu! +{xp} XP e +15 de energia 🌽', { nome: ro.name, xp }) }
    }
    case 'buyRooster': {
      const ro = s.market.roosters.find((r) => r.id === o.id) ?? h.fail(t('Esse galo já foi vendido.'))
      if (s.roosters.length >= 12) h.fail(t('Galinheiro lotado (máx. 12). Venda algum galo.'))
      const price = marketPrice(ro)
      let n = h.pay(s, price, 'milho')
      const mine: Rooster = { ...ro, owner: s.player.name, energy: 100, energyAt: Date.now() }
      n = { ...n, roosters: [...n.roosters, mine], market: { ...n.market, roosters: n.market.roosters.filter((r) => r.id !== o.id) } }
      n = h.purchase(n)
      return { state: logF(n, t('Comprou {nome} ({raca})', { nome: mine.name, raca: BREED_BY_ID[mine.breedId].name }), -price, 0) }
    }
    case 'useItem': {
      if (!s.items[o.itemId]) h.fail(t('Você não tem esse item.'))
      const it = ITEM_BY_ID[o.itemId] ?? h.fail(t('Item não existe'))
      const ro = find(o.roosterId)
      let msg = ''
      let n = s
      if (it.effect === 'energia' || it.effect === 'energia_total') {
        const cur = currentEnergy(ro)
        if (cur >= 100) h.fail(t('{nome} já está com energia cheia.', { nome: ro.name }))
        n = upd(n, ro.id, (r) => withEnergy(r, it.effect === 'energia_total' ? 100 : cur + it.value))
        msg = t('{nome} comeu e recuperou energia! 🍽️', { nome: ro.name })
      } else if (it.effect === 'xp') {
        const { levels } = addXp(ro, it.value)
        n = upd(n, ro.id, (r) => addXp(r, it.value).rooster)
        msg = levels ? t('{nome} subiu para o nível {n}! ⭐', { nome: ro.name, n: ro.level + levels }) : t('{nome} ganhou {xp} XP.', { nome: ro.name, xp: it.value })
      } else if (it.effect === 'sorte') {
        n = upd(n, ro.id, (r) => ({ ...r, lucky: (r.lucky ?? 0) + it.value }))
        msg = tp('{nome} está com sorte na próxima luta! 🍀', '{nome} está com sorte nas próximas {n} lutas! 🍀', it.value, { nome: ro.name })
      }
      n = { ...n, items: { ...n.items, [o.itemId]: n.items[o.itemId] - 1 } }
      return { state: n, value: msg }
    }
  }
  return h.fail(t('Operação desconhecida'))
}

// ---------------- Arena ----------------

export interface ArenaRewards {
  milho: number
  ovo: number
  xp: number
  points: number
  levels: number
  fichas: number
}
export interface ArenaOpp {
  d: Difficulty
  o: Rooster
  tools: string[]
}
export interface ArenaResult {
  state: GameState
  match: { a: Rooster; b: Rooster; seed: number; difficulty: Difficulty; tools: [string[], string[]]; rewards: ArenaRewards; won: boolean }
}

/** Uma luta da Arena: valida, simula com a semente dada e aplica os prêmios (mesmas fórmulas de sempre). */
export function arenaFight(s: GameState, roosterId: string, opp: Rooster, difficulty: Difficulty, myTools0: string[], oppTools: string[], seed: number, fail: (m: string) => never): ArenaResult {
  const ro = s.roosters.find((r) => r.id === roosterId) ?? fail(t('Galo não encontrado'))
  const e = currentEnergy(ro)
  if (e < ENERGY_COST) fail(t('{nome} precisa de {n} de energia. Dê uma ração!', { nome: ro.name, n: ENERGY_COST }))
  const myTools = [...new Set((Array.isArray(myTools0) ? myTools0 : []).map(String))].slice(0, MAX_TOOLS)
  for (const tl of myTools) if (!s.tools[tl]) fail(TOOL_BY_ID[tl] ? t('Você não tem {item}.', { item: TOOL_BY_ID[tl].name }) : t('Você não tem essa ferramenta.'))
  const toolsLeft = { ...s.tools }
  myTools.forEach((tl) => (toolsLeft[tl] -= 1))
  const tools: [string[], string[]] = [myTools, oppTools]
  const res = simulate(ro, opp, seed, tools)
  const won = res.winner === 0
  const ko = won && res.method === 'ko'
  const diffMult = [0.8, 1.1, 1.6, 2.2][difficulty]
  const vip = isVip(s) ? 1 + VIP.milhoBonus : 1
  const milho = Math.round((won ? 180 + opp.level * 45 : 40 + opp.level * 10) * diffMult * vip * (ko ? 1.25 : 1))
  const ovo = arenaOvos(won, difficulty)
  const fichas = arenaChips(won)
  const xp = Math.round((won ? 60 + opp.level * 12 : 25 + opp.level * 5) * diffMult)
  const points = won ? [15, 25, 40, 60][difficulty] : -8
  const { levels } = addXp(ro, xp)
  let n: GameState = { ...s, milho: s.milho + milho, ovos: s.ovos + ovo, fichas: (s.fichas ?? 0) + fichas, tools: toolsLeft }
  n = upd(n, roosterId, (r) => ({
    ...withEnergy(addXp(r, xp).rooster, e - ENERGY_COST),
    wins: r.wins + (won ? 1 : 0),
    losses: r.losses + (won ? 0 : 1),
    kos: r.kos + (ko ? 1 : 0),
    lucky: r.lucky ? r.lucky - 1 : 0,
  }))
  n = {
    ...n,
    league: { ...n.league, points: Math.max(0, n.league.points + points) },
    stats: {
      ...n.stats,
      fights: n.stats.fights + 1,
      wins: n.stats.wins + (won ? 1 : 0),
      kos: n.stats.kos + (ko ? 1 : 0),
      milhoEarned: n.stats.milhoEarned + milho,
      toolsUsed: n.stats.toolsUsed + myTools.length,
      toolWins: n.stats.toolWins + (won && myTools.length >= 2 ? 1 : 0),
    },
  }
  n = bump(n, 'lutar')
  if (won) n = bump(n, 'vencer')
  if (ko) n = bump(n, 'ko')
  n = addPassXp(n, PASS_XP.lutar + (won ? PASS_XP.vencer : 0))
  n = logF(n, t(won ? 'Vitória: {a} x {b}' : 'Derrota: {a} x {b}', { a: ro.name, b: opp.name }), milho, ovo, fichas)
  return { state: n, match: { a: ro, b: opp, seed, difficulty, tools, rewards: { milho, ovo, xp, points, levels, fichas }, won } }
}

// ---------------- Trava do save do navegador ----------------

/** Missões cujo progresso o navegador ainda conta (ações sem valor: equipar, assistir). O resto conta no servidor. */
export const CLIENT_MISSIONS = new Set<MissionKind>(['equipar', 'assistir'])
const STAT_KEYS = ['fights', 'wins', 'kos', 'betsPlaced', 'betsWon', 'biggestWin', 'milhoEarned', 'boxesOpened', 'purchases', 'toolsUsed', 'toolWins'] as const
const ACC_IDS = ACCESSORIES.map((a) => a.id)
const accCount = (s: GameState, id: string) => (s.accessories[id] ?? 0) + s.roosters.filter((r) => Object.values(r.equipped).includes(id)).length

/**
 * Economia no servidor: o save do navegador NÃO pode aumentar milho, ovos (só +5 por conquista válida),
 * fichas, XP/nível, vitórias/derrotas/K.O., energia, sorte, comida, itens/ferramentas/acessórios,
 * estatísticas, pontos/resgates da liga, bônus diário, XP do passe, progresso das missões contadas no
 * servidor nem resgate de missões. Galo novo também não. Devolve o motivo (log do servidor) ou null.
 */
export function economyViolation(cur: GameState, next: GameState): string | null {
  if (!Number.isFinite(next.milho) || next.milho > cur.milho) return 'milho' // i18n-ok (só log do servidor)
  const curAch = new Set(cur.achievements)
  const newAch = (next.achievements ?? []).filter((a) => !curAch.has(a))
  if (newAch.length) {
    const ok = checkAchievements({ ...next, achievements: cur.achievements })
    if (newAch.some((a) => !ok.includes(a))) return 'conquista' // i18n-ok (só log do servidor)
  }
  if (!Number.isFinite(next.ovos) || next.ovos > cur.ovos + newAch.length * 5) return 'ovos' // i18n-ok (só log do servidor)
  if ((next.fichas ?? 0) > (cur.fichas ?? 0)) return 'fichas' // i18n-ok (só log do servidor)
  const before = new Map(cur.roosters.map((r) => [r.id, r]))
  for (const r of next.roosters) {
    const old = before.get(r.id)
    if (!old) return 'galo novo' // i18n-ok (só log do servidor)
    if (r.level > old.level || (r.level === old.level && r.xp > old.xp)) return 'xp' // i18n-ok (só log do servidor)
    if (r.wins > old.wins || r.losses > old.losses || r.kos > old.kos) return 'vitórias' // i18n-ok (só log do servidor)
    if (currentEnergy(r) > currentEnergy(old)) return 'energia' // i18n-ok (só log do servidor)
    if ((r.lucky ?? 0) > (old.lucky ?? 0)) return 'sorte' // i18n-ok (só log do servidor)
    if ((r.fedAt ?? 0) !== (old.fedAt ?? 0)) return 'comida' // i18n-ok (só log do servidor)
  }
  for (const id of new Set([...Object.keys(next.items), ...Object.keys(cur.items)])) if ((next.items[id] ?? 0) > (cur.items[id] ?? 0)) return `item ${id}` // i18n-ok (só log do servidor)
  for (const id of new Set([...Object.keys(next.tools), ...Object.keys(cur.tools)])) if ((next.tools[id] ?? 0) > (cur.tools[id] ?? 0)) return `ferramenta ${id}` // i18n-ok (só log do servidor)
  for (const id of ACC_IDS) if (accCount(next, id) > accCount(cur, id)) return `acessório ${id}` // i18n-ok (só log do servidor)
  for (const k of STAT_KEYS) if ((next.stats?.[k] ?? 0) > (cur.stats[k] ?? 0)) return `estatística ${k}` // i18n-ok (só log do servidor)
  if (next.daily?.last !== cur.daily.last || next.daily?.streak !== cur.daily.streak) return 'bônus diário' // i18n-ok (só log do servidor)
  if (next.league.season === cur.league.season) {
    if (next.league.points > cur.league.points) return 'pontos de liga' // i18n-ok (só log do servidor)
    if (next.league.claimed.some((c) => !cur.league.claimed.includes(c))) return 'resgate da liga' // i18n-ok (só log do servidor)
  } else if (next.league.season < cur.league.season || next.league.points > 0 || next.league.claimed.length) return 'liga' // i18n-ok (só log do servidor)
  if (passGain(cur, next) > 0) return 'xp do passe' // i18n-ok (só log do servidor)
  return missionViolation(cur, next)
}

function missionViolation(cur: GameState, next: GameState): string | null {
  const nm = next.missions
  if (!nm || !Array.isArray(nm.list)) return 'missões' // i18n-ok (só log do servidor)
  const sameDay = nm.day === cur.missions.day
  // Tolera 1 dia de relógio adiantado no navegador (virada da meia-noite UTC)
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
  if (!sameDay && (nm.day < cur.missions.day || nm.day > tomorrow)) return 'dia das missões' // i18n-ok (só log do servidor)
  // Dia novo: as missões são determinísticas (mesmas no navegador e no servidor)
  const ref = new Map((sameDay ? cur.missions.list : genMissions(nm.day)).map((m) => [m.id, m]))
  if (nm.list.length !== ref.size) return 'missões' // i18n-ok (só log do servidor)
  for (const m of nm.list) {
    const old = ref.get(m.id)
    if (!old || m.kind !== old.kind || m.goal !== old.goal || m.reward.milho !== old.reward.milho || m.reward.ovo !== old.reward.ovo) return 'missão' // i18n-ok (só log do servidor)
    if (m.claimed && !old.claimed) return 'missão resgatada' // i18n-ok (só log do servidor)
    if (!Number.isFinite(m.progress) || m.progress > m.goal) return 'progresso de missão' // i18n-ok (só log do servidor)
    if (!CLIENT_MISSIONS.has(m.kind) && m.progress > old.progress) return 'progresso de missão' // i18n-ok (só log do servidor)
  }
  return null
}
