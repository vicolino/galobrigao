import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ACC_BY_ID,
  ACHIEVEMENTS,
  BREED_BY_ID,
  ITEM_BY_ID,
  LEAGUE_TIERS,
  TITLES,
  VIP,
  TOOL_BY_ID,
  MAX_TOOLS,
} from './data'
import { simulate } from './battle'
import {
  ENERGY_COST,
  addXp,
  currentEnergy,
  marketPrice,
  sellPrice,
  today,
  uid,
  withEnergy,
  power,
} from './rooster'
import { setAudio, sfx } from './sound'
import type { Accessory, Bet, BetPick, GameState, MissionKind, Rooster, Slot } from './types'
import { api, ApiError, type ApiUser } from '../api'
import { FEED_COOLDOWN, STAR_COST, type ShopOp } from './premium'
import type { ChallengeView, PvpPoll } from './pvp'
import { DAILY_OVOS, arenaOvos } from './rewards'
import { live, setLiveConfig, type PublicConfig } from './config'

import {
  checkAchievements,
  genCard,
  genMarket,
  makeOpponent,
  migrate,
  opponentTools,
  skinPrice,
  tick,
  weeklySkin,
  WEEKLY_DISCOUNT,
} from './engine'

export { genCard, genMarket, makeOpponent, opponentTools, skinPrice, weeklySkin, WEEKLY_DISCOUNT }

// ---------- Contexto ----------

export interface Toast {
  id: string
  text: string
  kind: 'ok' | 'erro' | 'info' | 'conquista'
}

export interface Match {
  kind: 'rinha' | 'casa' | 'pvp'
  mySide?: 0 | 1
  limited?: boolean
  a: Rooster
  b: Rooster
  seed: number
  fightId?: string
  difficulty?: 0 | 1 | 2
  tools?: [string[], string[]]
  rewards?: { milho: number; ovo: number; xp: number; points: number; levels: number }
  myBets?: Bet[]
}

type Result<T = undefined> = { ok: true; value?: T } | { ok: false; error: string }

export type Phase = 'carregando' | 'login' | 'inicio' | 'jogo'

export { FEED_COOLDOWN, STAR_COST }

function useGameEngine() {
  const [state, setState] = useState<GameState | null>(null)
  const ref = useRef(state)
  const [phase, setPhase] = useState<Phase>('carregando')
  const [user, setUser] = useState<ApiUser | null>(null)
  const [provider, setProvider] = useState('sandbox')
  const [paymentsLive, setPaymentsLive] = useState(true)
  const rev = useRef(0)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncing = useRef<Promise<void> | null>(null)
  const dirty = useRef(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [match, setMatch] = useState<Match | null>(null)
  const [pvp, setPvp] = useState<PvpPoll | null>(null)
  const [pubConfig, setPubConfig] = useState<PublicConfig | null>(null)
  const [pvpDone, setPvpDone] = useState<ChallengeView[]>([])
  // Saldo mostrado durante a luta (para não entregar o resultado antes da hora)
  const [held, setHeld] = useState<{ milho: number; ovos: number } | null>(null)

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = uid()
    setToasts((t) => [...t.slice(-3), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const commit = useCallback(
    (next: GameState) => {
      // Conquistas
      const unlocked = checkAchievements(next)
      if (unlocked.length) {
        next = { ...next, achievements: [...next.achievements, ...unlocked], ovos: next.ovos + unlocked.length * 5 }
        unlocked.forEach((id) => {
          const a = ACHIEVEMENTS.find((x) => x.id === id)!
          setTimeout(() => toast(`${a.emoji} Conquista: ${a.name} (+5 🥚)`, 'conquista'), 400)
        })
      }
      // Pontos do jogador na tabela da liga
      next = {
        ...next,
        league: { ...next.league, rows: next.league.rows.map((r) => (r.isPlayer ? { ...r, points: next.league.points, name: next.player.name } : r)) },
      }
      ref.current = next
      setState(next)
      dirty.current = true
      if (syncTimer.current) clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(() => void flush(), 700)
    },
    [toast], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /** Carrega o estado do servidor (fonte da verdade). */
  const adopt = useCallback((r: { rev: number; state: GameState | null }) => {
    rev.current = r.rev
    dirty.current = false
    if (r.state) {
      const st = tick(migrate(r.state))
      ref.current = st
      setState(st)
      setPhase('jogo')
    } else {
      ref.current = null
      setState(null)
      setPhase('inicio')
    }
  }, [])

  /** Envia o save ao servidor. Em conflito, o servidor vence. */
  const flush = useCallback(async () => {
    if (syncing.current) await syncing.current
    if (!dirty.current || !ref.current) return
    dirty.current = false
    const snapshot = ref.current
    syncing.current = (async () => {
      try {
        const r = await api.putSave(snapshot, rev.current)
        rev.current = r.rev
      } catch (e) {
        if (e instanceof ApiError && (e.status === 409 || e.status === 422) && 'rev' in e.body) {
          adopt(e.body as { rev: number; state: GameState | null })
          if (e.status === 422) toast(e.message, 'erro')
        } else {
          dirty.current = true // tenta de novo no próximo commit
        }
      }
    })()
    await syncing.current
    syncing.current = null
  }, [adopt, toast])

  const reloadFromServer = useCallback(async () => {
    await flush()
    adopt(await api.getSave())
  }, [adopt, flush])

  // Desafios: sinal de "online" + novidades a cada 4s
  useEffect(() => {
    if (phase !== 'jogo') return
    let alive = true
    const tickPvp = async () => {
      try {
        const p = await api.pvpPoll()
        if (!alive) return
        setPvp(p)
        if (p.updates.length) {
          if (p.updates.some((u) => u.status === 'aceito')) await reloadFromServer()
          for (const u of p.updates) {
            if (u.status === 'aceito') {
              const won = u.result?.winner === 0
              toast(`🤝 ${u.toName} aceitou! ${u.a.name} ${won ? 'VENCEU' : 'perdeu'} o desafio. Veja em Desafios.`, won ? 'ok' : 'info')
              setPvpDone((d) => [u, ...d].slice(0, 10))
              sfx.bell()
            } else if (u.status === 'recusado') toast(`${u.toName} recusou o desafio.`, 'info')
            else if (u.status === 'expirado') toast(`${u.toName} não respondeu a tempo.`, 'info')
            else if (u.status === 'cancelado' && u.reason) toast(`Desafio cancelado: ${u.reason}`, 'info')
            void api.pvpSeen(u.id)
          }
        }
      } catch {
        /* sem conexão: tenta de novo */
      }
    }
    void tickPvp()
    const t = setInterval(tickPvp, 4000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Configuração pública (aviso, manutenção, recompensas) — atualiza a cada minuto
  useEffect(() => {
    const load = () =>
      api
        .config()
        .then((c) => {
          setLiveConfig({ ...live, ...c })
          setPubConfig(c)
        })
        .catch(() => null)
    void load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])

  // Sessão inicial
  useEffect(() => {
    ;(async () => {
      try {
        const me = await api.me()
        setProvider(me.provider)
        setPaymentsLive(me.paymentsLive !== false)
        if (!me.user) return setPhase('login')
        setUser(me.user)
        adopt(await api.getSave())
      } catch {
        setPhase('login')
      }
    })()
    // Salva na hora quando a aba é escondida/fechada
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [adopt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state) setAudio(state.settings.volume, state.settings.muted)
  }, [state?.settings.volume, state?.settings.muted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza energia/missões a cada 30s
  const [, setNow] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now())
      if (ref.current) {
        const ticked = tick(ref.current)
        if (ticked !== ref.current) commit(ticked)
      }
    }, 30_000)
    return () => clearInterval(t)
  }, [commit])

  const S = () => ref.current!

  const log = (s: GameState, text: string, milho: number, ovo: number): GameState => ({
    ...s,
    history: [{ id: uid(), at: Date.now(), text, milho, ovo }, ...s.history].slice(0, 80),
  })

  const bump = (s: GameState, kind: MissionKind, n = 1): GameState => ({
    ...s,
    missions: {
      ...s.missions,
      list: s.missions.list.map((m) => (m.kind === kind && !m.claimed ? { ...m, progress: Math.min(m.goal, m.progress + n) } : m)),
    },
  })

  const updRooster = (s: GameState, id: string, fn: (r: Rooster) => Rooster): GameState => ({
    ...s,
    roosters: s.roosters.map((r) => (r.id === id ? fn(r) : r)),
  })

  const isVip = (s: GameState) => s.vip.until > Date.now()

  const pay = (s: GameState, price: number, currency: 'milho' | 'ovo'): GameState | null => {
    if (currency === 'milho') return s.milho >= price ? { ...s, milho: s.milho - price } : null
    return s.ovos >= price ? { ...s, ovos: s.ovos - price } : null
  }

  const noMoney = (c: 'milho' | 'ovo'): Result<never> => ({ ok: false, error: c === 'milho' ? 'Milho insuficiente 🌽' : 'Ovos de ouro insuficientes 🥚' })

// ----- Loja: tudo que gasta ovos ou cria item premium roda no servidor -----
async function shop<T = unknown>(op: ShopOp, sound?: () => void): Promise<Result<T>> {
    try {
      await flush()
      const r = await api.shop(op)
      adopt({ rev: r.rev, state: r.state })
      if (checkAchievements(r.state).length) commit(ref.current!)
      sound?.()
      return { ok: true, value: r.value as T }
    } catch (e) {
      if (e instanceof ApiError && 'rev' in e.body) adopt(e.body as { rev: number; state: GameState | null })
      return { ok: false, error: (e as Error).message }
    }
}

  const actions = {
    async signup(b: { email: string; password: string; name: string; adult: boolean; terms: boolean }): Promise<Result> {
      try {
        const r = await api.signup(b)
        setUser(r.user)
        adopt(await api.getSave())
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },

    async login(email: string, password: string): Promise<Result> {
      try {
        const r = await api.login(email, password)
        setUser(r.user)
        adopt(await api.getSave())
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },

    async logout() {
      await flush()
      await api.logout().catch(() => null)
      ref.current = null
      setState(null)
      setUser(null)
      setPhase('login')
    },

    async refreshUser() {
      const me = await api.me()
      setUser(me.user)
    },

    setUser,

    async startFree(avatar: string): Promise<Result> {
      try {
        adopt(await api.startFree(avatar))
        sfx.crow()
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },

    reloadFromServer,

    async reset() {
      await api.deleteSave()
      adopt({ rev: 0, state: null })
    },

    setSettings(p: Partial<GameState['settings']>) {
      const s = S()
      commit({ ...s, settings: { ...s.settings, ...p } })
    },

    setProfile(name: string, avatar: string) {
      const s = S()
      commit({ ...s, player: { ...s.player, name: name.trim() || s.player.name, avatar } })
    },

    claimDaily(): Result<{ milho: number; ovo: number; streak: number }> {
      const s = S()
      const d = today()
      if (s.daily.last === d) return { ok: false, error: 'Você já pegou o bônus de hoje. Volte amanhã!' }
      const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
      const streak = s.daily.last === yesterday ? (s.daily.streak % 7) + 1 : 1
      const milho = Math.round(300 * streak * (isVip(s) ? 1 + VIP.milhoBonus : 1))
      const ovo = DAILY_OVOS(streak) + (isVip(s) ? VIP.dailyOvos : 0)
      let n = { ...s, milho: s.milho + milho, ovos: s.ovos + ovo, daily: { last: d, streak } }
      n = log(n, `Bônus diário (dia ${streak})`, milho, ovo)
      commit(n)
      sfx.coin()
      return { ok: true, value: { milho, ovo, streak } }
    },

    buyRooster(id: string): Result {
      const s = S()
      const ro = s.market.roosters.find((r) => r.id === id)
      if (!ro) return { ok: false, error: 'Esse galo já foi vendido.' }
      if (s.roosters.length >= 12) return { ok: false, error: 'Galinheiro lotado (máx. 12). Venda algum galo.' }
      const price = marketPrice(ro)
      let n = pay(s, price, 'milho')
      if (!n) return noMoney('milho')
      const mine: Rooster = { ...ro, owner: s.player.name, energy: 100, energyAt: Date.now() }
      n = { ...n, roosters: [...n.roosters, mine], market: { ...n.market, roosters: n.market.roosters.filter((r) => r.id !== id) } }
      n = bump(n, 'comprar')
      n = log(n, `Comprou ${mine.name} (${BREED_BY_ID[mine.breedId].name})`, -price, 0)
      n = { ...n, stats: { ...n.stats, purchases: n.stats.purchases + 1 } }
      commit(n)
      sfx.coin()
      return { ok: true }
    },

    useItem(itemId: string, roosterId: string): Result<string> {
      const s = S()
      if (!s.items[itemId]) return { ok: false, error: 'Você não tem esse item.' }
      const it = ITEM_BY_ID[itemId]
      const ro = s.roosters.find((r) => r.id === roosterId)!
      let msg = ''
      let n = s
      if (it.effect === 'energia' || it.effect === 'energia_total') {
        const cur = currentEnergy(ro)
        if (cur >= 100) return { ok: false, error: `${ro.name} já está com energia cheia.` }
        n = updRooster(n, roosterId, (r) => withEnergy(r, it.effect === 'energia_total' ? 100 : cur + it.value))
        msg = `${ro.name} comeu e recuperou energia! 🍽️`
      } else if (it.effect === 'xp') {
        const { levels } = addXp(ro, it.value)
        n = updRooster(n, roosterId, (r) => addXp(r, it.value).rooster)
        msg = levels ? `${ro.name} subiu para o nível ${ro.level + levels}! ⭐` : `${ro.name} ganhou ${it.value} XP.`
      } else if (it.effect === 'sorte') {
        n = updRooster(n, roosterId, (r) => ({ ...r, lucky: (r.lucky ?? 0) + it.value }))
        msg = `${ro.name} está com sorte nas próximas ${it.value} lutas! 🍀`
      }
      n = { ...n, items: { ...n.items, [itemId]: n.items[itemId] - 1 } }
      commit(n)
      sfx.special()
      return { ok: true, value: msg }
    },

    equip(roosterId: string, accId: string): Result {
      const s = S()
      if (!s.accessories[accId]) return { ok: false, error: 'Você não tem esse acessório livre.' }
      const acc = ACC_BY_ID[accId]
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const prev = ro.equipped[acc.slot]
      const accs = { ...s.accessories, [accId]: s.accessories[accId] - 1 }
      if (prev) accs[prev] = (accs[prev] ?? 0) + 1
      let n: GameState = { ...s, accessories: accs }
      n = updRooster(n, roosterId, (r) => ({ ...r, equipped: { ...r.equipped, [acc.slot]: accId } }))
      n = bump(n, 'equipar')
      commit(n)
      sfx.click()
      return { ok: true }
    },

    unequip(roosterId: string, slot: Slot) {
      const s = S()
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const prev = ro.equipped[slot]
      if (!prev) return
      let n: GameState = { ...s, accessories: { ...s.accessories, [prev]: (s.accessories[prev] ?? 0) + 1 } }
      n = updRooster(n, roosterId, (r) => {
        const e = { ...r.equipped }
        delete e[slot]
        return { ...r, equipped: e }
      })
      commit(n)
      sfx.click()
    },

    rename(roosterId: string, name: string) {
      const s = S()
      commit(updRooster(s, roosterId, (r) => ({ ...r, name: name.trim().slice(0, 18) || r.name })))
    },

    setStyle(roosterId: string, style: Rooster['style']): Result {
      const s = S()
      const n = pay(s, 800, 'milho')
      if (!n) return noMoney('milho')
      commit(updRooster(n, roosterId, (r) => ({ ...r, style })))
      return { ok: true }
    },

    sell(roosterId: string): Result<number> {
      const s = S()
      if (s.roosters.length <= 1) return { ok: false, error: 'Você precisa ter pelo menos um galo.' }
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const price = sellPrice(ro)
      const accs = { ...s.accessories }
      Object.values(ro.equipped).forEach((a) => a && (accs[a] = (accs[a] ?? 0) + 1))
      let n: GameState = { ...s, milho: s.milho + price, accessories: accs, roosters: s.roosters.filter((r) => r.id !== roosterId) }
      n = log(n, `Vendeu ${ro.name}`, price, 0)
      commit(n)
      sfx.coin()
      return { ok: true, value: price }
    },

    train(roosterId: string): Result<string> {
      const s = S()
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const e = currentEnergy(ro)
      if (e < 15) return { ok: false, error: `${ro.name} está cansado demais para treinar.` }
      const cost = 100 + ro.level * 25
      let n = pay(s, cost, 'milho')
      if (!n) return noMoney('milho')
      const xp = 40 + ro.level * 8
      const { levels } = addXp(ro, xp)
      n = updRooster(n, roosterId, (r) => withEnergy(addXp(r, xp).rooster, e - 15))
      n = bump(n, 'treinar')
      commit(n)
      sfx.hit()
      return { ok: true, value: levels ? `🎉 ${ro.name} subiu para o nível ${ro.level + levels}!` : `${ro.name} treinou e ganhou ${xp} XP 💪` }
    },

    /** Inicia uma luta na Rinha. O resultado é aplicado na hora (sem trapaça com F5). */
    startRinha(roosterId: string, opp: Rooster, difficulty: 0 | 1 | 2, myTools: string[] = [], oppTools: string[] = []): Result<Match> {
      const s = S()
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const e = currentEnergy(ro)
      if (e < ENERGY_COST) return { ok: false, error: `${ro.name} precisa de ${ENERGY_COST} de energia. Dê uma ração!` }
      myTools = myTools.slice(0, MAX_TOOLS)
      for (const t of myTools) if (!s.tools[t]) return { ok: false, error: `Você não tem ${TOOL_BY_ID[t]?.name ?? 'essa ferramenta'}.` }
      const toolsLeft = { ...s.tools }
      myTools.forEach((t) => (toolsLeft[t] -= 1))
      const tools: [string[], string[]] = [myTools, oppTools]
      const seed = Math.floor(Math.random() * 1e9)
      const res = simulate(ro, opp, seed, tools)
      const won = res.winner === 0
      const diffMult = [0.8, 1.1, 1.6][difficulty]
      const vip = isVip(s) ? 1 + VIP.milhoBonus : 1
      const milho = Math.round((won ? 180 + opp.level * 45 : 40 + opp.level * 10) * diffMult * vip * (won && res.method === 'ko' ? 1.25 : 1))
      const ovo = arenaOvos(won, difficulty)
      const xp = Math.round((won ? 60 + opp.level * 12 : 25 + opp.level * 5) * diffMult)
      const points = won ? [15, 25, 40][difficulty] : -8
      const { levels } = addXp(ro, xp)
      let n: GameState = { ...s, milho: s.milho + milho, ovos: s.ovos + ovo, tools: toolsLeft }
      n = updRooster(n, roosterId, (r) => {
        const leveled = addXp(r, xp).rooster
        return {
          ...withEnergy(leveled, e - ENERGY_COST),
          wins: r.wins + (won ? 1 : 0),
          losses: r.losses + (won ? 0 : 1),
          kos: r.kos + (won && res.method === 'ko' ? 1 : 0),
          lucky: r.lucky ? r.lucky - 1 : 0,
        }
      })
      n = {
        ...n,
        league: { ...n.league, points: Math.max(0, n.league.points + points) },
        stats: {
          ...n.stats,
          fights: n.stats.fights + 1,
          wins: n.stats.wins + (won ? 1 : 0),
          kos: n.stats.kos + (won && res.method === 'ko' ? 1 : 0),
          milhoEarned: n.stats.milhoEarned + milho,
          toolsUsed: n.stats.toolsUsed + myTools.length,
          toolWins: n.stats.toolWins + (won && myTools.length >= 2 ? 1 : 0),
        },
      }
      n = bump(n, 'lutar')
      if (won) n = bump(n, 'vencer')
      if (won && res.method === 'ko') n = bump(n, 'ko')
      n = log(n, `${won ? 'Vitória' : 'Derrota'}: ${ro.name} x ${opp.name}`, milho, ovo)
      setHeld({ milho: s.milho, ovos: s.ovos })
      commit(n)
      const m: Match = { kind: 'rinha', a: ro, b: opp, seed, difficulty, tools, rewards: { milho, ovo, xp, points, levels } }
      setMatch(m)
      return { ok: true, value: m }
    },

    placeBet(fightId: string, pickSide: BetPick, amount: number): Result {
      const s = S()
      const f = s.card.fights.find((x) => x.id === fightId)
      if (!f || f.status !== 'aberta') return { ok: false, error: 'Essa luta não está mais aberta.' }
      amount = Math.floor(amount)
      if (amount < 10) return { ok: false, error: 'Aposta mínima: 10 de milho.' }
      if (amount > 50000) return { ok: false, error: 'Aposta máxima: 50.000 de milho.' }
      if (s.milho < amount) return noMoney('milho')
      const odds = pickSide === 'a' ? f.oddsA : pickSide === 'b' ? f.oddsB : f.oddsKo
      const label = pickSide === 'a' ? `${f.a.name} vence` : pickSide === 'b' ? `${f.b.name} vence` : 'Termina em K.O.'
      const bet: Bet = { id: uid(), fightId, pick: pickSide, amount, odds, label, status: 'pendente', payout: 0, at: Date.now() }
      let n: GameState = { ...s, milho: s.milho - amount, bets: [bet, ...s.bets].slice(0, 100) }
      n = { ...n, stats: { ...n.stats, betsPlaced: n.stats.betsPlaced + 1 } }
      n = bump(n, 'apostar')
      n = log(n, `Aposta: ${label} @ ${odds.toFixed(2)}`, -amount, 0)
      commit(n)
      sfx.coin()
      return { ok: true }
    },

    /** Encerra uma luta da casa e paga as apostas. */
    resolveFight(fightId: string, watch: boolean): Match | null {
      const s = S()
      const f = s.card.fights.find((x) => x.id === fightId)
      if (!f || f.status !== 'aberta') return null
      const res = simulate(f.a, f.b, f.seed)
      let n: GameState = {
        ...s,
        card: { ...s.card, fights: s.card.fights.map((x) => (x.id === fightId ? { ...x, status: 'encerrada', winner: res.winner, method: res.method } : x)) },
      }
      const myBets: Bet[] = []
      let won = 0
      n = {
        ...n,
        bets: n.bets.map((b) => {
          if (b.fightId !== fightId || b.status !== 'pendente') return b
          const hit = (b.pick === 'a' && res.winner === 0) || (b.pick === 'b' && res.winner === 1) || (b.pick === 'ko' && res.method === 'ko')
          const payout = hit ? Math.floor(b.amount * b.odds) : 0
          const nb: Bet = { ...b, status: hit ? 'ganhou' : 'perdeu', payout }
          myBets.push(nb)
          if (hit) won++
          return nb
        }),
      }
      const total = myBets.reduce((a, b) => a + b.payout, 0)
      if (total) {
        n = { ...n, milho: n.milho + total }
        n = log(n, `Prêmio de aposta: ${f.a.name} x ${f.b.name}`, total, 0)
      }
      const zebra = myBets.some((b) => b.status === 'ganhou' && b.odds >= 3)
      n = {
        ...n,
        stats: {
          ...n.stats,
          betsWon: n.stats.betsWon + won,
          biggestWin: Math.max(n.stats.biggestWin, ...myBets.map((b) => b.payout)),
          milhoEarned: n.stats.milhoEarned + total,
        },
        achievements: zebra && !n.achievements.includes('zebra') ? [...n.achievements, 'zebra'] : n.achievements,
      }
      if (won) n = bump(n, 'ganhar_aposta', won)
      if (watch) {
        n = bump(n, 'assistir')
        setHeld({ milho: s.milho, ovos: s.ovos })
      }
      commit(n)
      const m: Match = { kind: 'casa', a: f.a, b: f.b, seed: f.seed, fightId, myBets }
      if (watch) setMatch(m)
      return m
    },

    resolveAll(): number {
      const s = S()
      const open = s.card.fights.filter((f) => f.status === 'aberta')
      let total = 0
      for (const f of open) {
        const m = actions.resolveFight(f.id, false)
        total += m?.myBets?.reduce((a, b) => a + b.payout, 0) ?? 0
      }
      return total
    },

    newCard(): Result {
      const s = S()
      const pending = s.card.fights.some((f) => f.status === 'aberta' && s.bets.some((b) => b.fightId === f.id && b.status === 'pendente'))
      if (pending) return { ok: false, error: 'Você tem apostas pendentes nesse card. Assista ou encerre as lutas primeiro.' }
      commit({ ...s, card: { at: Date.now(), fights: genCard() } })
      return { ok: true }
    },

    claimMission(id: string): Result {
      const s = S()
      const m = s.missions.list.find((x) => x.id === id)
      if (!m || m.claimed || m.progress < m.goal) return { ok: false, error: 'Missão ainda não concluída.' }
      let n: GameState = {
        ...s,
        milho: s.milho + m.reward.milho,
        ovos: s.ovos + m.reward.ovo,
        missions: { ...s.missions, list: s.missions.list.map((x) => (x.id === id ? { ...x, claimed: true } : x)) },
      }
      n = log(n, `Missão: ${m.text}`, m.reward.milho, m.reward.ovo)
      commit(n)
      sfx.coin()
      return { ok: true }
    },

    claimLeague(tierName: string): Result {
      const s = S()
      const tier = LEAGUE_TIERS.find((t) => t.name === tierName)!
      if (s.league.points < tier.min || s.league.claimed.includes(tierName)) return { ok: false, error: 'Recompensa indisponível.' }
      let n: GameState = { ...s, milho: s.milho + tier.reward.milho, ovos: s.ovos + tier.reward.ovo, league: { ...s.league, claimed: [...s.league.claimed, tierName] } }
      n = log(n, `Liga: recompensa ${tierName}`, tier.reward.milho, tier.reward.ovo)
      commit(n)
      sfx.win()
      return { ok: true }
    },

    applySkin(roosterId: string, skinId: string | null): Result {
      const s = S()
      if (skinId && !s.skins.includes(skinId)) return { ok: false, error: 'Compre essa skin primeiro.' }
      commit(updRooster(s, roosterId, (r) => ({ ...r, skin: skinId ?? undefined })))
      sfx.special()
      return { ok: true }
    },

    shop,
    buyAccessory: (id: string) => shop({ op: 'buyAccessory', id }, sfx.coin),
    buyItem: (id: string, qty = 1) => shop({ op: 'buyItem', id, qty }, sfx.coin),
    buyTool: (id: string, qty = 1) => shop({ op: 'buyTool', id, qty }, sfx.coin),
    buyKit: (id: string) => shop({ op: 'buyKit', id }, sfx.win),
    openBox: (id: string) => shop<Accessory>({ op: 'openBox', id }),
    buySkin: (id: string) => shop({ op: 'buySkin', id }, sfx.win),
    buySkinBundle: (id: string) => shop({ op: 'buySkinBundle', id }, sfx.win),
    buyElection: (breedId: string) => shop({ op: 'buyElection', breedId }, sfx.crow),
    refreshMarket: () => shop({ op: 'refreshMarket' }),
    exchange: (id: string) => shop({ op: 'exchange', id }, sfx.coin),
    upgradeStars: (roosterId: string) => shop({ op: 'upgradeStars', roosterId }, sfx.win),

    /** Alimentar: grátis a cada 4h (local), ou na hora pagando ovos (servidor). */
    async feed(roosterId: string, instant = false): Promise<Result<string>> {
      const s = S()
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const ready = !ro.fedAt || Date.now() - ro.fedAt >= FEED_COOLDOWN
      if (!ready) {
        if (!instant) return { ok: false, error: `${ro.name} ainda está de papo cheio.` }
        return shop<string>({ op: 'feedInstant', roosterId }, sfx.coin)
      }
      const xp = 30 + ro.level * 6
      const { levels } = addXp(ro, xp)
      commit(updRooster(s, roosterId, (r) => ({ ...withEnergy(addXp(r, xp).rooster, currentEnergy(r) + 15), fedAt: Date.now() })))
      sfx.coin()
      return { ok: true, value: levels ? `🎉 ${ro.name} comeu e subiu para o nível ${ro.level + levels}!` : `${ro.name} comeu! +${xp} XP e +15 de energia 🌽` }
    },

    // ----- Desafios entre jogadores -----
    async pvpChallenge(roosterId: string, toUserId: string, toRoosterId: string): Promise<Result> {
      try {
        await flush()
        await api.pvpChallenge(roosterId, toUserId, toRoosterId)
        setPvp(await api.pvpPoll())
        sfx.bell()
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },

    async pvpRespond(id: string, accept: boolean): Promise<Result<ChallengeView>> {
      try {
        await flush()
        const r = await api.pvpRespond(id, accept)
        setPvp(await api.pvpPoll())
        if (accept && r.challenge.status === 'aceito') {
          const before = ref.current
          if (before) setHeld({ milho: before.milho, ovos: before.ovos })
          await reloadFromServer()
          setMatch(pvpMatch(r.challenge))
        }
        return { ok: true, value: r.challenge }
      } catch (e) {
        setPvp(await api.pvpPoll().catch(() => null))
        return { ok: false, error: (e as Error).message }
      }
    },

    async pvpCancel(id: string) {
      await api.pvpCancel(id).catch(() => null)
      setPvp(await api.pvpPoll())
    },

    watchPvp(v: ChallengeView) {
      setMatch(pvpMatch(v))
    },

    releaseWallet() {
      setHeld(null)
    },

    clearMatch() {
      setHeld(null)
      setMatch(null)
    },
  }

  return { state, actions, toasts, toast, match, phase, user, provider, paymentsLive, pvp, pvpDone, pubConfig, wallet: held ?? (state ? { milho: state.milho, ovos: state.ovos } : null), isVip: state ? isVip(state) : false }
}

/** Monta a luta para assistir a partir de um desafio resolvido. */
export function pvpMatch(v: ChallengeView): Match {
  const r = v.result!.rewards
  return {
    kind: 'pvp',
    a: v.a,
    b: v.b,
    seed: v.seed!,
    mySide: v.mine === 'from' ? 0 : 1,
    limited: r.limited,
    rewards: { milho: r.milho, ovo: 0, xp: r.xp, points: r.points, levels: r.levels },
  }
}

export function titleFor(s: GameState) {
  const w = s.stats.wins
  return [...TITLES].reverse().find((t) => w >= t.min)!.name
}

export function tierFor(points: number) {
  return [...LEAGUE_TIERS].reverse().find((t) => points >= t.min)!
}

export { power }

type Engine = ReturnType<typeof useGameEngine>
const Ctx = createContext<Engine | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const engine = useGameEngine()
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>
}

export function useGame() {
  const c = useContext(Ctx)
  if (!c) throw new Error('GameProvider ausente')
  return c
}
