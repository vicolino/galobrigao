import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ACC_BY_ID, ACHIEVEMENTS, LEAGUE_TIERS, TITLES } from './data'
import { uid, power } from './rooster'
import { setAudio, sfx } from './sound'
import type { Accessory, Bet, BetPick, GameState, MissionKind, Rooster, Slot } from './types'
import { api, ApiError, type ApiUser } from '../api'
import { FEED_COOLDOWN, STAR_COST, runShop, type ShopOp } from './premium'
import { arenaFight, serverEconomy, type EconOp } from './economia'
import { challengeTtl, type ChallengeView, type PvpPoll } from './pvp'
import { live, setLiveConfig, type PublicConfig } from './config'
import type { Difficulty } from './engine'
import { applyBetCredit, type BetCredit, type BetView, type ScheduledFight } from './bets'
import { locale, t, tx } from '../i18n'

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
  kind: 'rinha' | 'casa' | 'pvp' | 'torneio'
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
        // Feira: vendeu, ganhou presente ou anúncio voltou → avisa e puxa o save do servidor
        if (p.feira?.length) {
          for (const f of p.feira.slice(0, 3)) toast(tx(f.text), 'ok')
          sfx.coin()
          await reloadFromServer()
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

  // ----- 🌽 Economia: com a trava ligada roda no servidor; desligada, roda a mesma função aqui (modo antigo) -----
  const econFail = (msg: string): never => {
    throw new Error(msg)
  }
  async function econ<T = unknown>(op: EconOp, sound?: () => void): Promise<Result<T>> {
    if (serverEconomy()) return shop<T>(op, sound)
    try {
      const r = runShop(tick(S()), op)
      commit(r.state)
      sound?.()
      return { ok: true, value: r.value as T }
    } catch (e) {
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

    /** Operação da Feira no servidor: salva antes, depois adota o save que o servidor devolveu. */
    async feiraOp(fn: () => Promise<{ rev: number; state: GameState }>): Promise<Result> {
      try {
        await flush()
        adopt(await fn())
        return { ok: true }
      } catch (e) {
        if (e instanceof ApiError && 'rev' in e.body) adopt(e.body as { rev: number; state: GameState | null })
        return { ok: false, error: (e as Error).message }
      }
    },

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

    /** Bônus diário (servidor). */
    claimDaily: () => econ<{ milho: number; ovo: number; fichas: number; streak: number }>({ op: 'claimDaily' }, sfx.coin),

    /** Compra um galo do mercado (servidor). */
    buyRooster: (id: string) => econ({ op: 'buyRooster', id }, sfx.coin),

    /** Usa um item da mochila no galo (servidor). */
    useItem: (itemId: string, roosterId: string) => econ<string>({ op: 'useItem', itemId, roosterId }, sfx.special),

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

    /** Vende o galo para a casa (servidor). */
    sell(roosterId: string): Promise<Result<number>> {
      const ro = S().roosters.find((r) => r.id === roosterId)
      if (ro?.rental) return Promise.resolve({ ok: false, error: t('Galo alugado não pode ser vendido nem dado.') })
      if (ro?.nft) return Promise.resolve({ ok: false, error: t('{nome} é um Galo NFT: negocie no Mercado USDC ou traga de volta para o jogo antes.', { nome: ro.name }) })
      return econ<number>({ op: 'sellRooster', roosterId }, sfx.coin)
    },

    /** Treino (servidor). */
    train: (roosterId: string) => econ<string>({ op: 'train', roosterId }, sfx.hit),

    /**
     * Inicia uma luta na Arena. Com a economia no servidor, o servidor escolhe a semente, simula e aplica
     * os prêmios; aqui só adotamos o save e assistimos ao replay. `opp`/`oppTools` só valem no modo antigo.
     */
    async startRinha(roosterId: string, opp: Rooster, difficulty: Difficulty, myTools: string[] = [], oppTools: string[] = []): Promise<Result<Match>> {
      const before = S()
      const wallet = { milho: before.milho, ovos: before.ovos, fichas: before.fichas ?? 0 }
      if (!serverEconomy()) {
        try {
          const r = arenaFight(before, roosterId, opp, difficulty, myTools, oppTools, Math.floor(Math.random() * 1e9), econFail)
          setHeld(wallet)
          commit(r.state)
          const m: Match = { kind: 'rinha', ...r.match }
          setMatch(m)
          return { ok: true, value: m }
        } catch (e) {
          return { ok: false, error: (e as Error).message }
        }
      }
      try {
        await flush()
        const r = await api.arenaFight(roosterId, difficulty, myTools)
        setHeld(wallet)
        adopt({ rev: r.rev, state: r.state })
        if (checkAchievements(r.state).length) commit(ref.current!)
        const m: Match = { kind: 'rinha', a: r.match.a, b: r.match.b, seed: r.match.seed, difficulty: r.match.difficulty, tools: r.match.tools, rewards: r.match.rewards }
        setMatch(m)
        return { ok: true, value: m }
      } catch (e) {
        if (e instanceof ApiError && 'rev' in e.body) adopt(e.body as { rev: number; state: GameState | null })
        return { ok: false, error: (e as Error).message }
      }
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

    /** 🏟️ Replay de uma luta de torneio (semente e galos guardados no servidor). */
    watchTorneio(a: Rooster, b: Rooster, seed: number, mySide?: 0 | 1, fightId?: string) {
      setMatch({ kind: 'torneio', a, b, seed, mySide, fightId })
    },

    /** Resgata a recompensa de uma missão (servidor). */
    claimMission: (id: string) => econ({ op: 'claimMission', id }, sfx.coin),

    /** Resgata a recompensa de uma faixa da liga (servidor). */
    claimLeague: (tierName: string) => econ({ op: 'claimLeague', tier: tierName }, sfx.win),

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
    // Passe da Temporada (servidor)
    passClaim: (track: 'free' | 'premium', tier: number) => shop<string>({ op: 'passClaim', track, tier }, sfx.win),
    passClaimAll: () => shop<{ count: number; skipped: number }>({ op: 'passClaimAll' }, sfx.win),
    passBuy: () => shop({ op: 'passBuy' }, sfx.win),
    passSkip: () => shop<number>({ op: 'passSkip' }, sfx.coin),

    /** Alimentar: a cada 4h pagando milho, ou na hora pagando ovos (os dois no servidor). Os dois sobem com o nível. */
    async feed(roosterId: string, instant = false): Promise<Result<string>> {
      const s = S()
      const ro = s.roosters.find((r) => r.id === roosterId)!
      const ready = !ro.fedAt || Date.now() - ro.fedAt >= FEED_COOLDOWN
      if (!ready) {
        if (!instant) return { ok: false, error: t('{nome} ainda está de papo cheio.', { nome: ro.name }) }
        return shop<string>({ op: 'feedInstant', roosterId }, sfx.coin)
      }
      return econ<string>({ op: 'feed', roosterId }, sfx.coin)
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
