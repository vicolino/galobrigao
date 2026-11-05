import type { Sku } from './game/catalog'
import type { ShopOp } from './game/premium'
import type { AppConfig, PublicConfig } from './game/config'
import type { ChallengeView, LobbyEntry, PvpPoll } from './game/pvp'
import type { BetCredit, BetView, ScheduledFight } from './game/bets'
import type { BetPick, GameState, Rooster } from './game/types'
import { lang, t, tx } from './i18n'
import type { Currency } from './game/types'
import type { FeiraAdmin, FeiraData, FeiraKind, FeiraListing, FeiraPlayer } from './game/feira'
import type { LimitedStock } from './game/ofertas'
import type { PrizeRow, TorneioDetail, TorneioKind, TorneioNotice, TorneioResult, TorneioStatus, TorneioView } from './game/torneio'

export interface TorneioAdminRow {
  id: string
  kind: TorneioKind
  startsAt: number
  status: TorneioStatus
  entrants: number
  size: number
  champion: string | null
  reason: string | null
  ovos: number
  milho: number
  fees: number
  tokens: number
}

export interface ApiUser {
  id: string
  mvpCreditCents?: number
  isAdmin?: boolean
  email: string
  name: string
  limits: { monthlyCents: number; spentCents: number; pendingCents: number | null; pendingAt: number | null; options: number[] }
}

export interface ApiOrder {
  id: string
  sku: string
  name: string
  amountCents: number
  method: 'pix' | 'cartao' | 'credito'
  status: 'pendente' | 'pago' | 'expirado' | 'recusado'
  provider: 'sandbox' | 'mercadopago'
  pixCode: string | null
  pixQr: string | null
  checkoutUrl: string | null
  createdAt: number
  paidAt: number | null
}

export type CatalogItem = Sku & { owned?: boolean }

export interface OffersAdmin {
  shown: number
  bought: number
  conversion: number
  offerOvos: number
  firstBonus: number
  limitedSold: number
  refills: number
  refillOvos: number
  stock: LimitedStock[]
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown>,
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Lang': lang() }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, t('Erro de conexão'), {})
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, tx(body.error) || t('Erro de conexão'), body)
  return body as T
}

// Galos das lutas da casa são gerados no servidor com nomes em português: mostra no idioma do jogador
const localRooster = <R extends { name: string; owner?: string }>(r: R): R => ({ ...r, name: tx(r.name), ...(r.owner ? { owner: tx(r.owner) } : {}) })

export const api = {
  me: () => call<{ user: ApiUser | null; provider: string; paymentsLive?: boolean }>('/me'),
  signup: (b: { email: string; password: string; name: string; adult: boolean; terms: boolean }) => call<{ user: ApiUser }>('/auth/signup', { method: 'POST', body: b }),
  login: (email: string, password: string) => call<{ user: ApiUser }>('/auth/login', { method: 'POST', body: { email, password } }),
  changePassword: (current: string, next: string) => call('/auth/password', { method: 'POST', body: { current, next } }),
  forgot: (email: string) => call('/auth/forgot', { method: 'POST', body: { email } }),
  reset: (token: string, password: string) => call('/auth/reset', { method: 'POST', body: { token, password } }),
  deleteAccount: (password: string) => call('/account', { method: 'DELETE', body: { password } }),
  logout: () => call('/auth/logout', { method: 'POST' }),
  getSave: () => call<{ rev: number; state: GameState | null }>('/save'),
  putSave: (state: GameState, rev: number) => call<{ rev: number; credit: BetCredit | null }>('/save', { method: 'PUT', body: { state, rev } }),
  deleteSave: () => call('/save', { method: 'DELETE' }),
  startFree: (avatar: string) => call<{ rev: number; state: GameState }>('/onboarding/free', { method: 'POST', body: { avatar } }),
  catalog: () => call<{ items: CatalogItem[]; provider: string; firstBonus?: boolean }>('/catalog'),
  checkout: (sku: string, method: 'pix' | 'cartao' | 'credito') => call<{ order: ApiOrder }>('/checkout', { method: 'POST', body: { sku, method } }),
  order: (id: string) => call<{ order: ApiOrder }>(`/orders/${id}`),
  simulate: (id: string) => call<{ order: ApiOrder }>(`/orders/${id}/simulate`, { method: 'POST' }),
  orders: () => call<{ orders: ApiOrder[] }>('/orders'),
  // Ofertas (server/ofertas.ts)
  limited: () => call<{ items: LimitedStock[]; now: number }>('/limited'),
  offersInfo: () => call<{ firstBonus: boolean }>('/offers'),
  offersAdmin: (days: number) => call<OffersAdmin>(`/offers/admin?days=${days}`),
  offersStock: (id: string, total: number, endsAt: number | null) => call<{ stock: LimitedStock[] }>('/offers/admin/stock', { method: 'PUT', body: { id, total, endsAt } }),
  shop: (op: ShopOp) => call<{ rev: number; state: GameState; value: unknown }>('/shop', { method: 'POST', body: op }),
  // 🌽 Arena no servidor (server/economia.ts)
  arenaOpponents: (roosterId: string, fresh = false) =>
    call<{ opponents: { d: 0 | 1 | 2 | 3; o: Rooster; tools: string[] }[] }>(`/arena/opponents?roosterId=${encodeURIComponent(roosterId)}${fresh ? '&fresh=1' : ''}`),
  arenaFight: (roosterId: string, difficulty: number, tools: string[]) =>
    call<{ rev: number; state: GameState; match: { a: Rooster; b: Rooster; seed: number; difficulty: 0 | 1 | 2 | 3; tools: [string[], string[]]; rewards: { milho: number; ovo: number; xp: number; points: number; levels: number; fichas: number } } }>('/arena/fight', {
      method: 'POST',
      body: { roosterId, difficulty, tools },
    }),
  betsSchedule: () =>
    call<{ now: number; closeMs: number; liveMs: number; fights: ScheduledFight[]; mine: BetView[] }>('/bets/schedule').then((r) => ({
      ...r,
      fights: r.fights.map((f) => ({ ...f, a: localRooster(f.a), b: localRooster(f.b) })),
    })),
  betsMine: () => call<{ bets: BetView[] }>('/bets/mine'),
  placeBet: (fightId: string, pick: BetPick, amount: number) => call<{ rev: number; state: GameState; credit: BetCredit | null }>('/bets', { method: 'POST', body: { fightId, pick, amount } }),
  pvpPoll: () => call<PvpPoll>('/pvp/poll'),
  pvpLobby: (roosterId: string) => call<{ players: LobbyEntry[]; myLevel: number }>(`/pvp/lobby?roosterId=${encodeURIComponent(roosterId)}`),
  pvpChallenge: (roosterId: string, toUserId: string, toRoosterId: string) => call<{ challenge: ChallengeView }>('/pvp/challenge', { method: 'POST', body: { roosterId, toUserId, toRoosterId } }),
  pvpRespond: (id: string, accept: boolean) => call<{ challenge: ChallengeView }>('/pvp/respond', { method: 'POST', body: { id, accept } }),
  pvpCancel: (id: string) => call('/pvp/cancel', { method: 'POST', body: { id } }),
  pvpSeen: (id: string) => call('/pvp/seen', { method: 'POST', body: { id } }),
  pvpHistory: () => call<{ history: ChallengeView[] }>('/pvp/history'),
  // 🔑 Aluguel de galos (Feira)
  aluguel: {
    get: () => call<import('./game/aluguel').AluguelData>('/aluguel'),
    list: (roosterId: string, days: number, price: number, currency: Currency, sharePct: number) =>
      call<{ rev: number; state: GameState }>('/aluguel/list', { method: 'POST', body: { roosterId, days, price, currency, sharePct } }),
    cancel: (id: string) => call<{ rev: number; state: GameState }>('/aluguel/cancel', { method: 'POST', body: { id } }),
    rent: (id: string, price: number, currency: Currency) => call<{ rev: number; state: GameState }>('/aluguel/rent', { method: 'POST', body: { id, price, currency } }),
    giveBack: (id: string) => call<{ rev: number; state: GameState }>('/aluguel/return', { method: 'POST', body: { id } }),
  },
  // 🏪 Feira entre jogadores
  feira: {
    get: () => call<FeiraData>('/feira'),
    players: (q: string) => call<{ players: FeiraPlayer[] }>(`/feira/players?q=${encodeURIComponent(q)}`),
    list: (kind: FeiraKind, id: string, price: number, currency: Currency) => call<{ rev: number; state: GameState; listing: FeiraListing }>('/feira/list', { method: 'POST', body: { kind, id, price, currency } }),
    cancel: (id: string) => call<{ rev: number; state: GameState }>('/feira/cancel', { method: 'POST', body: { id } }),
    buy: (id: string, price: number, currency: Currency) => call<{ rev: number; state: GameState }>('/feira/buy', { method: 'POST', body: { id, price, currency } }),
    gift: (to: string, kind: FeiraKind, id: string) => call<{ rev: number; state: GameState }>('/feira/gift', { method: 'POST', body: { to, kind, id } }),
  },
  // 🏟️ Torneios (server/torneios.ts)
  torneios: {
    list: () => call<{ now: number; prizes: Record<TorneioKind, PrizeRow[]>; fee: number; list: TorneioView[]; recent: TorneioView[] }>('/torneios'),
    get: (id: string) => call<{ now: number; torneio: TorneioDetail }>(`/torneios/${encodeURIComponent(id)}`),
    mine: () => call<{ results: TorneioResult[] }>('/torneios/mine'),
    notices: () => call<{ notices: TorneioNotice[] }>('/torneios/notices'),
    tokens: () => call<{ enabled: boolean; total: number; list: { torneio_id: string; asset: string; amount: number; status: string; created_at: number }[] }>('/torneios/tokens'),
    register: (id: string, roosterId: string) => call<{ ok: true; rev?: number | null; changed?: boolean }>('/torneios/register', { method: 'POST', body: { id, roosterId } }),
    withdraw: (id: string) => call<{ ok: true }>('/torneios/withdraw', { method: 'POST', body: { id } }),
    admin: () => call<{ list: TorneioAdminRow[]; totals: { ovos: number; milho: number; fees: number; tokens: number } }>('/torneios/admin'),
    adminCancel: (id: string) => call<{ ok: true }>('/torneios/admin/cancel', { method: 'POST', body: { id } }),
    adminStart: (id: string, skipLive: boolean) => call<{ ok: true }>('/torneios/admin/start', { method: 'POST', body: { id, skipLive } }),
  },
  config: () => call<PublicConfig>('/config'),
  admin: {
    overview: (days: number) => call<AdminOverview>(`/admin/overview?days=${days}`),
    users: (q: string, filter: string, page = 1) =>
      call<{ users: AdminUserRow[]; total: number; page: number; pages: number; pageSize: number }>(`/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&page=${page}`),
    user: (id: string) => call<AdminUserDetail>(`/admin/users/${id}`),
    grant: (id: string, ovos: number, milho: number, reason: string, creditCents = 0) => call<{ ok: true; ovos: number; milho: number }>(`/admin/users/${id}/grant`, { method: 'POST', body: { ovos, milho, reason, creditCents } }),
    ban: (id: string, banned: boolean, reason: string) => call(`/admin/users/${id}/ban`, { method: 'POST', body: { banned, reason } }),
    orders: (status: string, q: string) => call<{ orders: AdminOrderRow[] }>(`/admin/orders?status=${status}&q=${encodeURIComponent(q)}`),
    recheck: (id: string) => call<{ status: string }>(`/admin/orders/${id}/recheck`, { method: 'POST' }),
    getConfig: () => call<{ config: AppConfig; defaults: AppConfig; updatedAt: number | null; updatedBy: string | null }>('/admin/config'),
    putConfig: (config: AppConfig) => call<{ config: AppConfig; changes: string[] }>('/admin/config', { method: 'PUT', body: { config } }),
    audit: () => call<{ log: AdminLogRow[] }>('/admin/audit'),
    kyc: (id: string, status: KycStatus) => call<{ ok: true }>(`/admin/users/${id}/kyc`, { method: 'POST', body: { status } }),
    web3: () => call<AdminWeb3>('/admin/web3'),
    feira: () => call<FeiraAdmin>('/admin/feira'),
  },
  // ---------- Carteira cripto (testnet) ----------
  web3: () => call<Web3Info>('/web3'),
  bridge: (token: 'egg' | 'corn', dir: 'out' | 'in', amount: number) => call<{ rev: number; state: GameState; tx: Web3Tx }>('/web3/bridge', { method: 'POST', body: { token, dir, amount } }),
  send: (asset: Web3Asset, to: string, amount: number) => call<{ tx: Web3Tx }>('/web3/send', { method: 'POST', body: { asset, to, amount } }),
  mint: (key: string) => call<{ tokenId: number; tx: Web3Tx; rev: number; state: GameState }>('/web3/mint', { method: 'POST', body: { key } }),
  kyc: () => call<{ kyc: KycStatus }>('/web3/kyc', { method: 'POST' }),
  mintGalo: (roosterId: string) => call<{ tokenId: number; tx: Web3Tx; rev: number; state: GameState }>('/web3/mint-galo', { method: 'POST', body: { roosterId } }),
  unmintGalo: (tokenId: number) => call<{ tx: Web3Tx; rev: number; state: GameState }>('/web3/unmint-galo', { method: 'POST', body: { tokenId } }),
  // 💵 Depósito USDC → ovos (só ida)
  deposit: () => call<DepositInfo>('/web3/deposit'),
  testUsdc: () => call<{ ok: boolean; usdc: number; hash: string }>('/web3/test-usdc', { method: 'POST' }),
  depositEggs: (amount: string) => call<{ rev?: number; state?: GameState; pending?: boolean; message?: string; deposit: DepositView }>('/web3/deposit-eggs', { method: 'POST', body: { amount } }),
  market: () => call<{ listings: MarketListing[]; feeBps: number }>('/market'),
  marketList: (tokenId: number, price: number) => call<{ tx?: Web3Tx }>('/market/list', { method: 'POST', body: { tokenId, price } }),
  marketCancel: (tokenId: number) => call<{ tx?: Web3Tx }>('/market/cancel', { method: 'POST', body: { tokenId } }),
  marketBuy: (tokenId: number) => call<{ rev: number; state: GameState; tx: Web3Tx }>('/market/buy', { method: 'POST', body: { tokenId } }),
  // ---------- Ranking e vitrine ----------
  ranking: () => call<{ top: RankRow[]; total: number; me: (RankRow & { pos: number }) | null; at: number }>('/ranking'),
  showcase: (id: string) => call<Showcase>(`/players/${encodeURIComponent(id)}/showcase`),
  setLimit: (monthlyCents: number) => call<{ user: ApiUser }>('/limits', { method: 'PUT', body: { monthlyCents } }),
}

// ---------- Tipos do ranking e vitrine ----------
export interface PublicRooster { id: string; name: string; breedId: string; level: number; stars: number; skin: string | null; equipped: Rooster['equipped']; tint: Rooster['tint'] | null; wins: number; value: number }
export interface RankRow { id: string; name: string; avatar: string; total: number; roosters: number; best: PublicRooster | null; champ?: number }
export interface Showcase { id: string; name: string; avatar: string; since: number | null; worth: number; pos: number | null; achievements: number; champ?: number; podiums?: number; tier: { name: string; emoji: string }; wins: number; fights: number; count: number; roosters: PublicRooster[] }

// ---------- Tipos da carteira cripto ----------
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected'
export type Web3Asset = 'egg' | 'corn' | 'usdc'
/** Transação registrada (web3_tx) como o servidor devolve. */
export interface Web3TxView { id: string; kind: string; asset: string; amount: string; to: string | null; hash: string | null; status: string; at: number; url: string | null }
export type Web3Tx = Web3TxView | string | null
/** Saldos null = não deu para ler a rede agora. */
export interface Web3Wallet { address: string; eth: number | string | null; egg: number | string | null; corn: number | string | null; usdc: number | string | null }
export interface Web3Mintable { key: string; kind: 'acc' | 'skin'; itemId: string; count: number }
export interface Web3Nft { tokenId: number; kind: 'acc' | 'skin' | 'galo'; itemId: string; status: 'held' | 'listed'; price: number | null; rooster?: GaloLook }
/** 🐓 Galo NFT: visual público do galo do token. */
export interface GaloLook { id: string; name: string; breedId: string; level: number; stars: number; tint: Rooster['tint'] | null; parents: [string, string] | null; breedCount: number; base: Rooster['base'] }
export interface Web3Info {
  enabled: boolean
  chain?: { id: number; name: string; explorer: string }
  wallet?: Web3Wallet | null
  kyc?: KycStatus
  mintable?: Web3Mintable[]
  nfts?: Web3Nft[]
  feeBps?: number | null
  caps?: { send?: Partial<Record<Web3Asset, number>>; bridgeOut?: Partial<Record<Web3Asset, number>>; usedToday?: { send?: Partial<Record<Web3Asset, number>>; bridgeOut?: Partial<Record<Web3Asset, number>> } }
  recent?: Web3TxView[]
}
/** 💵 Depósito USDC → ovos. */
export interface DepositView { id: string; usdc: number; eggs: number; status: 'pending' | 'done' | 'failed' | 'uncredited'; hash: string | null; at: number; url: string | null }
export interface DepositInfo { network: { id: number; name: string; testnet: boolean }; usdc: string; address: string | null; balance: number | null; rate: number; min: number; cap: number; usedToday: number; kycRequired: boolean; recent: DepositView[] }
export interface MarketListing { tokenId: number; kind: 'acc' | 'skin' | 'galo'; itemId: string; price: number; seller: string; mine: boolean; rooster?: GaloLook }
export interface AdminWeb3TxRow {
  id: number | string
  user_id: string
  email?: string
  kind: string
  asset: string | null
  amount: number | string | null
  to_addr: string | null
  tx_hash: string | null
  status: string
  created_at: number
}
export interface AdminWeb3 {
  enabled: boolean
  wallets: number
  nfts: number
  listed: number
  kycPending: number
  anomalies: number
  kycQueue: { id: string; email: string; name: string; created_at: number }[]
  recent: AdminWeb3TxRow[]
  deposits?: { count: number; usdc: number; eggs: number; pending: number; uncredited: number }
}

// ---------- Tipos do backoffice ----------
export interface AdminSeriesDay {
  day: string
  signups: number
  active: number
  revenueCents: number
  orders: number
  pvp: number
}
export interface AdminOverview {
  days: number
  kpis: {
    totalUsers: number
    newUsers: number
    newUsersPrev: number
    dauToday: number
    avgDau: number
    avgDauPrev: number
    mau: number
    online: number
    revenueCents: number
    revenuePrevCents: number
    revenueTodayCents: number
    revenueAllCents: number
    creditSpentCents: number
    orders: number
    pendingOrders: number
    payingUsersWin: number
    payingUsersAll: number
    arppuCents: number
    conversion: number
    pvp: number
    banned: number
  }
  funnel: { step: string; n: number }[]
  series: AdminSeriesDay[]
  bySku: { id: string; name: string; count: number; cents: number }[]
  byMethod: Record<string, { count: number; cents: number }>
}
export interface AdminUserRow {
  id: string
  email: string
  name: string
  created_at: number
  banned_at: number | null
  last_seen: number | null
  spent: number
  orders: number
  roosters: number
  maxLevel: number
  ovos: number
  milho: number
}
export interface AdminUserDetail {
  user: { id: string; email: string; name: string; mvpCreditCents: number; createdAt: number; bannedAt: number | null; banReason: string | null; monthlyLimitCents: number; lastSeen: number | null }
  game: null | {
    milho: number
    ovos: number
    vipUntil: number
    skins: string[]
    leaguePoints: number
    stats: Record<string, number>
    roosters: { id: string; name: string; breed: string; level: number; stars: number; wins: number; losses: number; skin?: string }[]
    history: { id: string; at: number; text: string; milho: number; ovo: number }[]
  }
  orders: { id: string; sku: string; amount_cents: number; method: string; status: string; created_at: number; paid_at: number | null }[]
  pvpFights: number
  activeDays: number
  log: { at: number; admin_email: string; action: string; detail: string | null }[]
  kyc?: KycStatus
  wallet?: string | { address: string } | null
}
export interface AdminOrderRow {
  id: string
  sku: string
  name: string
  amount_cents: number
  method: string
  provider: string
  status: string
  created_at: number
  paid_at: number | null
  user_id: string
  email: string
}
export interface AdminLogRow {
  id: number
  at: number
  admin_email: string
  action: string
  target: string | null
  target_email: string | null
  detail: string | null
}
