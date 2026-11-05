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
import { challengeTtl, type ChallengeView, type PvpPoll } from './pvp'
import { DAILY_OVOS, arenaChips, arenaOvos, dailyChips } from './rewards'
import { live, setLiveConfig, type PublicConfig } from './config'
import type { Difficulty } from './engine'
import { applyBetCredit, type BetCredit, type BetView, type ScheduledFight } from './bets'
import { locale, t, tp, tx } from '../i18n'

import {
  checkAchievements,
  genMarket,
  makeOpponent,
  migrate,
  opponentTools,
  skinPrice,
  tick,
  weeklySkin,
  WEEKLY_DISCOUNT,
} from './engine'

export { genMarket, makeOpponent, opponentTools, skinPrice, weeklySkin, WEEKLY_DISCOUNT }

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
  difficulty?: Difficulty
  tools?: [string[], string[]]
  rewards?: { milho: number; ovo: number; xp: number; points: number; levels: number; fichas?: number }
  myBets?: (Bet & { currency?: 'fichas' | 'milho' })[]
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
  const matchRef = useRef(match)
  matchRef.current = match
  const [pvp, setPvp] = useState<PvpPoll | null>(null)
  const [pubConfig, setPubConfig] = useState<PublicConfig | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [pvpDone, setPvpDone] = useState<ChallengeView[]>([])
  // Saldo mostrado durante a luta (para não entregar o resultado antes da hora)
  const [held, setHeld] = useState<{ milho: number; ovos: number; fichas: number } | null>(null)
  const [betsInfo, setBetsInfo] = useState<{ open: number; ready: number; liveFightId: string | null } | null>(null)

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
          setTimeout(() => toast(t('{emoji} Conquista: {nome} (+5 🥚)', { emoji: a.emoji, nome: a.name }), 'conquista'), 400)
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

  /** Aviso de uma aposta resolvida (as novas pagam em 🎟️ fichas; as antigas, em milho). */
  const betToast = useCallback(
    (e: BetCredit['entries'][number]) =>
      toast(
        !e.won
          ? `🎲 ${tx(e.text)}`
          : e.fichas
            ? t('🎲 {texto}: +🎟️ {n}', { texto: tx(e.text), n: e.fichas.toLocaleString(locale()) })
            : t('🎲 {texto}: +🌽 {n}', { texto: tx(e.text), n: e.milho.toLocaleString(locale()) }),
        e.won ? 'ok' : 'info',
      ),
    [toast],
  )

  /** O servidor pagou apostas resolvidas: aplica o mesmo crédito aqui e avisa o jogador. */
  const receiveCredit = useCallback(
    (c: BetCredit) => {
      if (!ref.current) return
      const next = applyBetCredit(ref.current, c)
      ref.current = next
      setState(next)
      for (const e of c.entries.slice(0, 4)) betToast(e)
      if (c.won) sfx.coin()
    },
    [betToast],
  )

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
        if (r.credit) receiveCredit(r.credit)
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

  // Desafios: sinal de "online" + novidades a cada 4s (1,5s enquanto espera resposta)
  useEffect(() => {
    if (phase !== 'jogo') return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tickPvp = async () => {
      let waiting = false
      try {
        const p = await api.pvpPoll()
        if (!alive) return
        setPvp(p)
        waiting = !!p.outgoing
        if (p.bets) {
          setBetsInfo(p.bets)
          // Tem aposta resolvida esperando: manda o save para o servidor creditar
          if (p.bets.ready > 0 && !syncing.current) {
            dirty.current = true
            void flush()
          }
        }
        if (p.updates.length) {
          // Só abre a luta sozinho se o desafio é recente (não um de ontem visto agora)
          const accepted = p.updates.find((u) => u.status === 'aceito' && Date.now() - u.createdAt < challengeTtl() + 60_000)
          // Já está assistindo outra luta? Não interrompe: só avisa.
          const watching = !!matchRef.current && location.hash.startsWith('#/luta')
          if (accepted && !watching) {
            const before = ref.current
            if (before) setHeld({ milho: before.milho, ovos: before.ovos, fichas: before.fichas ?? 0 })
          }
          if (p.updates.some((u) => u.status === 'aceito')) await reloadFromServer()
          for (const u of p.updates) {
            if (u.status === 'aceito') {
              if (u === accepted && !watching) {
                toast(t('🤝 {nome} aceitou o desafio! Que comece a briga!', { nome: u.toName }), 'ok')
                setMatch(pvpMatch(u))
                location.hash = '#/luta'
              } else {
                const won = u.result?.winner === 0
                toast(t(won ? '🤝 {nome} aceitou! {galo} VENCEU o desafio. Reveja em Desafios.' : '🤝 {nome} aceitou! {galo} perdeu o desafio. Reveja em Desafios.', { nome: u.toName, galo: u.a.name }), won ? 'ok' : 'info')
                sfx.bell()
              }
              setPvpDone((d) => [u, ...d].slice(0, 10))
            } else if (u.status === 'recusado') toast(t('{nome} recusou o desafio.', { nome: u.toName }), 'info')
            else if (u.status === 'expirado') toast(t('{nome} não respondeu a tempo.', { nome: u.toName }), 'info')
            else if (u.status === 'cancelado' && u.reason) toast(t('Desafio cancelado: {motivo}', { motivo: tx(u.reason) }), 'info')
            void api.pvpSeen(u.id)
          }
        }
      } catch {
        /* sem conexão: tenta de novo */
      }
      if (alive) timer = setTimeout(tickPvp, waiting ? 1500 : 4000)
    }
    void tickPvp()
    return () => {
      alive = false
      clearTimeout(timer)
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
          // Saiu versão nova: recarrega sozinho, menos no meio de uma luta (aí mostra um aviso)
          if (c.build && c.build !== __BUILD_ID__) {
            if (window.location.hash.startsWith('#/luta')) setUpdateReady(true)
            else window.location.reload()
          }
        })
        .catch(() => null)
    void load()
    const t = setInterval(load, 60_000)
    const onShow = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onShow)
    }
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

  const log = (s: GameState, text: string, milho: number, ovo: number, fichas = 0): GameState => ({
    ...s,
    history: [{ id: uid(), at: Date.now(), text, milho, ovo, ...(fichas ? { fichas } : {}) }, ...s.history].slice(0, 80),
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

  const noMoney = (c: 'milho' | 'ovo'): Result<never> => ({ ok: false, error: c === 'milho' ? t('Milho insuficiente 🌽') : t('Ovos de ouro insuficientes 🥚') })

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

    claimDaily(): Result<{ milho: number; ovo: number; fichas: number; streak: number }> {
      const s = S()
      const d = today()
      if (s.daily.last === d) return { ok: false, error: t('Você já pegou o bônus de hoje. Volte amanhã!') }
      const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
      const streak = s.daily.last === yesterday ? (s.daily.streak % 7) + 1 : 1
      const milho = Math.round(300 * streak * (isVip(s) ? 1 + VIP.milhoBonus : 1))
      const ovo = DAILY_OVOS(streak) + (isVip(s) ? VIP.dailyOvos : 0)
      // 🎟️ Fichas do dia (só para apostar); garante um mínimo para ninguém ficar sem apostar
      const fichas = dailyChips(s.fichas ?? 0)
      let n = { ...s, milho: s.milho + milho, ovos: s.ovos + ovo, fichas: (s.fichas ?? 0) + fichas, daily: { last: d, streak } }
      n = log(n, t('Bônus diário (dia {n})', { n: streak }), milho, ovo, fichas)
      commit(n)
      sfx.coin()
      return { ok: true, value: { milho, ovo, fichas, streak } }
    },

    buyRooster(id: string): Result {
      const s = S()
      const ro = s.market.roosters.find((r) => r.id === id)
      if (!ro) return { ok: false, error: t('Esse galo já foi vendido.') }
      if (s.roosters.length >= 12) return { ok: false, error: t('Galinheiro lotado (máx. 12). Venda algum galo.') }
      const price = marketPrice(ro)
      let n = pay(s, price, 'milho')
      if (!n) return noMoney('milho')
      const mine: Rooster = { ...ro, owner: s.player.name, energy: 100, energyAt: Date.now() }
      n = { ...n, roosters: [...n.roosters, mine], market: { ...n.market, roosters: n.market.roosters.filter((r) => r.id !== id) } }
      n = bump(n, 'comprar')
      n = log(n, t('Comprou {nome} ({raca})', { nome: mine.name, raca: BREED_BY_ID[mine.breedId].name }), -price, 0)
      n = { ...n, stats: { ...n.stats, purchases: n.stats.purchases + 1 } }
      commit(n)
      sfx.coin()
      return { ok: true }
    },

    useItem(itemId: string, roosterId: string): Result<string> {
      const s = S()
      if (!s.items[itemId]) return { ok: false, error: t('Você não tem esse item.') }
      const it = ITEM_BY_ID[itemId]
      const ro = s.roosters.find((r) => r.id === roosterId)!
      let msg = ''
      let n = s
      if (it.effect === 'energia' || it.effect === 'energia_total') {
        const cur = currentEnergy(ro)
        if (cur >= 100) return { ok: false, error: t('{nome} já está com energia cheia.', { nome: ro.name }) }
        n = updRooster(n, roosterId, (r) => withEnergy(r, it.effect === 'energia_total' ? 100 : cur + it.value))
        msg = t('{nome} comeu e recuperou energia! 🍽️', { nome: ro.name })
      } else if (it.effect === 'xp') {
        const { levels } = addXp(ro, it.value)
        n = updRooster(n, roosterId, (r) => addXp(r, it.value).rooster)
        msg = levels ? t('{nome} subiu para o nível {n}! ⭐', { nome: ro.name, n: ro.level + levels }) : t('{nome} ganhou {xp} XP.', { nome: ro.name, xp: it.value })
      } else if (it.effect === 'sorte') {
        n = updRooster(n, roosterId, (r) => ({ ...r, lucky: (r.lucky ?? 0) + it.value }))
        msg = tp('{nome} está com sorte na próxima luta! 🍀', '{nome} está com sorte nas próximas {n} lutas! 🍀', it.value, { nome: ro.name })
      }
      n = { ...n, items: { ...n.items, [itemId]: n.items[itemId] - 1 } }
      commit(n)
      sfx.special()
      return { ok: true, value: msg }
    },

    equip(roosterId: string, accId: string): Result {
      const s = S()
      if (!s.accessories[accId]) return { ok: false, error: t('Você não tem esse acessório livre.') }
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
      if (s.roosters.length <= 1) return { ok: false, error: t('Você precisa ter pelo menos um galo.') }
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const price = sellPrice(ro)
      const accs = { ...s.accessories }
      Object.values(ro.equipped).forEach((a) => a && (accs[a] = (accs[a] ?? 0) + 1))
      let n: GameState = { ...s, milho: s.milho + price, accessories: accs, roosters: s.roosters.filter((r) => r.id !== roosterId) }
      n = log(n, t('Vendeu {nome}', { nome: ro.name }), price, 0)
      commit(n)
      sfx.coin()
      return { ok: true, value: price }
    },

    train(roosterId: string): Result<string> {
      const s = S()
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const e = currentEnergy(ro)
      if (e < 15) return { ok: false, error: t('{nome} está cansado demais para treinar.', { nome: ro.name }) }
      const cost = 100 + ro.level * 25
      let n = pay(s, cost, 'milho')
      if (!n) return noMoney('milho')
      const xp = 40 + ro.level * 8
      const { levels } = addXp(ro, xp)
      n = updRooster(n, roosterId, (r) => withEnergy(addXp(r, xp).rooster, e - 15))
      n = bump(n, 'treinar')
      commit(n)
      sfx.hit()
      return { ok: true, value: levels ? t('🎉 {nome} subiu para o nível {n}!', { nome: ro.name, n: ro.level + levels }) : t('{nome} treinou e ganhou {xp} XP 💪', { nome: ro.name, xp }) }
    },

    /** Inicia uma luta na Rinha. O resultado é aplicado na hora (sem trapaça com F5). */
    startRinha(roosterId: string, opp: Rooster, difficulty: Difficulty, myTools: string[] = [], oppTools: string[] = []): Result<Match> {
      const s = S()
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const e = currentEnergy(ro)
      if (e < ENERGY_COST) return { ok: false, error: t('{nome} precisa de {n} de energia. Dê uma ração!', { nome: ro.name, n: ENERGY_COST }) }
      myTools = myTools.slice(0, MAX_TOOLS)
      for (const tl of myTools) if (!s.tools[tl]) return { ok: false, error: TOOL_BY_ID[tl] ? t('Você não tem {item}.', { item: TOOL_BY_ID[tl].name }) : t('Você não tem essa ferramenta.') }
      const toolsLeft = { ...s.tools }
      myTools.forEach((tl) => (toolsLeft[tl] -= 1))
      const tools: [string[], string[]] = [myTools, oppTools]
      const seed = Math.floor(Math.random() * 1e9)
      const res = simulate(ro, opp, seed, tools)
      const won = res.winner === 0
      const diffMult = [0.8, 1.1, 1.6, 2.2][difficulty]
      const vip = isVip(s) ? 1 + VIP.milhoBonus : 1
      const milho = Math.round((won ? 180 + opp.level * 45 : 40 + opp.level * 10) * diffMult * vip * (won && res.method === 'ko' ? 1.25 : 1))
      const ovo = arenaOvos(won, difficulty)
      const fichas = arenaChips(won)
      const xp = Math.round((won ? 60 + opp.level * 12 : 25 + opp.level * 5) * diffMult)
      const points = won ? [15, 25, 40, 60][difficulty] : -8
      const { levels } = addXp(ro, xp)
      let n: GameState = { ...s, milho: s.milho + milho, ovos: s.ovos + ovo, fichas: (s.fichas ?? 0) + fichas, tools: toolsLeft }
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
      n = log(n, t(won ? 'Vitória: {a} x {b}' : 'Derrota: {a} x {b}', { a: ro.name, b: opp.name }), milho, ovo, fichas)
      setHeld({ milho: s.milho, ovos: s.ovos, fichas: s.fichas ?? 0 })
      commit(n)
      const m: Match = { kind: 'rinha', a: ro, b: opp, seed, difficulty, tools, rewards: { milho, ovo, xp, points, levels, fichas } }
      setMatch(m)
      return { ok: true, value: m }
    },

    /** Aposta numa luta da agenda (o servidor desconta as 🎟️ fichas e guarda a aposta). */
    async placeBet(fightId: string, pick: BetPick, amount: number): Promise<Result> {
      try {
        await flush()
        const r = await api.placeBet(fightId, pick, amount)
        adopt({ rev: r.rev, state: r.state })
        if (r.credit) for (const e of r.credit.entries.slice(0, 4)) betToast(e)
        sfx.coin()
        setBetsInfo((b) => (b ? { ...b, open: b.open + 1 } : b))
        return { ok: true }
      } catch (e) {
        if (e instanceof ApiError && 'rev' in e.body) adopt(e.body as { rev: number; state: GameState | null })
        return { ok: false, error: (e as Error).message }
      }
    },

    /** Assiste a uma luta da agenda que já começou. */
    watchHouse(f: ScheduledFight, myBets: BetView[]) {
      if (f.seed === undefined) return
      const s = S()
      commit(bump(s, 'assistir'))
      setMatch({ kind: 'casa', a: f.a, b: f.b, seed: f.seed, fightId: f.id, myBets })
    },

    claimMission(id: string): Result {
      const s = S()
      const m = s.missions.list.find((x) => x.id === id)
      if (!m || m.claimed || m.progress < m.goal) return { ok: false, error: t('Missão ainda não concluída.') }
      let n: GameState = {
        ...s,
        milho: s.milho + m.reward.milho,
        ovos: s.ovos + m.reward.ovo,
        missions: { ...s.missions, list: s.missions.list.map((x) => (x.id === id ? { ...x, claimed: true } : x)) },
      }
      n = log(n, t('Missão: {texto}', { texto: tx(m.text) }), m.reward.milho, m.reward.ovo)
      commit(n)
      sfx.coin()
      return { ok: true }
    },

    claimLeague(tierName: string): Result {
      const s = S()
      const tier = LEAGUE_TIERS.find((t) => t.name === tierName)!
      if (s.league.points < tier.min || s.league.claimed.includes(tierName)) return { ok: false, error: t('Recompensa indisponível.') }
      let n: GameState = { ...s, milho: s.milho + tier.reward.milho, ovos: s.ovos + tier.reward.ovo, league: { ...s.league, claimed: [...s.league.claimed, tierName] } }
      n = log(n, t('Liga: recompensa {tier}', { tier: tx(tierName) }), tier.reward.milho, tier.reward.ovo)
      commit(n)
      sfx.win()
      return { ok: true }
    },

    applySkin(roosterId: string, skinId: string | null): Result {
      const s = S()
      if (skinId && !s.skins.includes(skinId)) return { ok: false, error: t('Compre essa skin primeiro.') }
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
        if (!instant) return { ok: false, error: t('{nome} ainda está de papo cheio.', { nome: ro.name }) }
        return shop<string>({ op: 'feedInstant', roosterId }, sfx.coin)
      }
      const xp = 30 + ro.level * 6
      const { levels } = addXp(ro, xp)
      commit(updRooster(s, roosterId, (r) => ({ ...withEnergy(addXp(r, xp).rooster, currentEnergy(r) + 15), fedAt: Date.now() })))
      sfx.coin()
      return { ok: true, value: levels ? t('🎉 {nome} comeu e subiu para o nível {n}!', { nome: ro.name, n: ro.level + levels }) : t('{nome} comeu! +{xp} XP e +15 de energia 🌽', { nome: ro.name, xp }) }
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
          if (before) setHeld({ milho: before.milho, ovos: before.ovos, fichas: before.fichas ?? 0 })
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

  return { state, actions, toasts, toast, match, phase, betsInfo, user, provider, paymentsLive, updateReady, pvp, pvpDone, pubConfig, wallet: held ?? (state ? { milho: state.milho, ovos: state.ovos, fichas: state.fichas ?? 0 } : null), isVip: state ? isVip(state) : false }
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
