import type { Sku } from './game/catalog'
import type { ShopOp } from './game/premium'
import type { AppConfig, PublicConfig } from './game/config'
import type { ChallengeView, LobbyEntry, PvpPoll } from './game/pvp'
import type { GameState } from './game/types'

export interface ApiUser {
  id: string
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
  method: 'pix' | 'cartao'
  status: 'pendente' | 'pago' | 'expirado' | 'recusado'
  provider: 'sandbox' | 'mercadopago'
  pixCode: string | null
  pixQr: string | null
  checkoutUrl: string | null
  createdAt: number
  paidAt: number | null
}

export type CatalogItem = Sku & { owned?: boolean }

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
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'Erro de conexão', body)
  return body as T
}

export const api = {
  me: () => call<{ user: ApiUser | null; provider: string }>('/me'),
  signup: (b: { email: string; password: string; name: string; adult: boolean; terms: boolean }) => call<{ user: ApiUser }>('/auth/signup', { method: 'POST', body: b }),
  login: (email: string, password: string) => call<{ user: ApiUser }>('/auth/login', { method: 'POST', body: { email, password } }),
  changePassword: (current: string, next: string) => call('/auth/password', { method: 'POST', body: { current, next } }),
  forgot: (email: string) => call('/auth/forgot', { method: 'POST', body: { email } }),
  reset: (token: string, password: string) => call('/auth/reset', { method: 'POST', body: { token, password } }),
  deleteAccount: (password: string) => call('/account', { method: 'DELETE', body: { password } }),
  logout: () => call('/auth/logout', { method: 'POST' }),
  getSave: () => call<{ rev: number; state: GameState | null }>('/save'),
  putSave: (state: GameState, rev: number) => call<{ rev: number }>('/save', { method: 'PUT', body: { state, rev } }),
  deleteSave: () => call('/save', { method: 'DELETE' }),
  startFree: (avatar: string) => call<{ rev: number; state: GameState }>('/onboarding/free', { method: 'POST', body: { avatar } }),
  catalog: () => call<{ items: CatalogItem[]; provider: string }>('/catalog'),
  checkout: (sku: string, method: 'pix' | 'cartao') => call<{ order: ApiOrder }>('/checkout', { method: 'POST', body: { sku, method } }),
  order: (id: string) => call<{ order: ApiOrder }>(`/orders/${id}`),
  simulate: (id: string) => call<{ order: ApiOrder }>(`/orders/${id}/simulate`, { method: 'POST' }),
  orders: () => call<{ orders: ApiOrder[] }>('/orders'),
  shop: (op: ShopOp) => call<{ rev: number; state: GameState; value: unknown }>('/shop', { method: 'POST', body: op }),
  pvpPoll: () => call<PvpPoll>('/pvp/poll'),
  pvpLobby: (roosterId: string) => call<{ players: LobbyEntry[]; myLevel: number }>(`/pvp/lobby?roosterId=${encodeURIComponent(roosterId)}`),
  pvpChallenge: (roosterId: string, toUserId: string, toRoosterId: string) => call<{ challenge: ChallengeView }>('/pvp/challenge', { method: 'POST', body: { roosterId, toUserId, toRoosterId } }),
  pvpRespond: (id: string, accept: boolean) => call<{ challenge: ChallengeView }>('/pvp/respond', { method: 'POST', body: { id, accept } }),
  pvpCancel: (id: string) => call('/pvp/cancel', { method: 'POST', body: { id } }),
  pvpSeen: (id: string) => call('/pvp/seen', { method: 'POST', body: { id } }),
  pvpHistory: () => call<{ history: ChallengeView[] }>('/pvp/history'),
  config: () => call<PublicConfig>('/config'),
  admin: {
    overview: (days: number) => call<AdminOverview>(`/admin/overview?days=${days}`),
    users: (q: string, filter: string) => call<{ users: AdminUserRow[] }>(`/admin/users?q=${encodeURIComponent(q)}&filter=${filter}`),
    user: (id: string) => call<AdminUserDetail>(`/admin/users/${id}`),
    grant: (id: string, ovos: number, milho: number, reason: string) => call<{ ok: true; ovos: number; milho: number }>(`/admin/users/${id}/grant`, { method: 'POST', body: { ovos, milho, reason } }),
    ban: (id: string, banned: boolean, reason: string) => call(`/admin/users/${id}/ban`, { method: 'POST', body: { banned, reason } }),
    orders: (status: string, q: string) => call<{ orders: AdminOrderRow[] }>(`/admin/orders?status=${status}&q=${encodeURIComponent(q)}`),
    recheck: (id: string) => call<{ status: string }>(`/admin/orders/${id}/recheck`, { method: 'POST' }),
    getConfig: () => call<{ config: AppConfig; defaults: AppConfig; updatedAt: number | null; updatedBy: string | null }>('/admin/config'),
    putConfig: (config: AppConfig) => call<{ config: AppConfig; changes: string[] }>('/admin/config', { method: 'PUT', body: { config } }),
    audit: () => call<{ log: AdminLogRow[] }>('/admin/audit'),
  },
  setLimit: (monthlyCents: number) => call<{ user: ApiUser }>('/limits', { method: 'PUT', body: { monthlyCents } }),
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
  user: { id: string; email: string; name: string; createdAt: number; bannedAt: number | null; banReason: string | null; monthlyLimitCents: number; lastSeen: number | null }
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
