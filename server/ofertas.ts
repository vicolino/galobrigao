// Ofertas: bônus de primeira compra, edições limitadas (estoque global), ofertas relâmpago e métricas.
import type { Sku } from '../src/game/catalog'
import { LIMITED_ITEMS, limitedKey, type LimitedStock } from '../src/game/ofertas'
import { ShopError, type ShopOp } from '../src/game/premium'
import type { Offer } from '../src/game/types'
import { t } from '../src/i18n'
import { isAdmin } from './admin'
import { getDb, type UserRow } from './db'

const DAY = 864e5
let ready = false

/** Cria as tabelas na primeira chamada e semeia o estoque (fim da edição conta do primeiro boot). */
function db() {
  const d = getDb()
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS limited_stock (item_id TEXT PRIMARY KEY, total INTEGER NOT NULL, sold INTEGER NOT NULL DEFAULT 0, ends_at INTEGER);
      CREATE TABLE IF NOT EXISTS offer_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT, value INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS offer_events_at ON offer_events (at);`)
    const ins = d.prepare('INSERT OR IGNORE INTO limited_stock (item_id, total, sold, ends_at) VALUES (?, ?, 0, ?)')
    for (const [id, x] of Object.entries(LIMITED_ITEMS)) ins.run(id, x.total, x.days ? Date.now() + x.days * DAY : null)
    ready = true
  }
  return d
}

export function logOfferEvent(userId: string, kind: string, ref: string | null, value = 0) {
  db().prepare('INSERT INTO offer_events (user_id, kind, ref, value, at) VALUES (?, ?, ?, ?, ?)').run(userId, kind, ref, value, Date.now())
}

export function limitedStock(): LimitedStock[] {
  return (db().prepare('SELECT item_id, total, sold, ends_at FROM limited_stock ORDER BY item_id').all() as { item_id: string; total: number; sold: number; ends_at: number | null }[]).map((r) => ({
    id: r.item_id,
    total: r.total,
    sold: r.sold,
    endsAt: r.ends_at,
  }))
}

// ---------- Primeira compra ----------

/** Nunca teve pedido pago (o pedido atual é ignorado). Crédito MVP conta como compra. */
export function isFirstPurchase(userId: string, exceptOrderId = '') {
  return !getDb().prepare("SELECT 1 FROM orders WHERE user_id = ? AND status = 'pago' AND id != ?").get(userId, exceptOrderId)
}

/** Na primeira compra, pacotes de ovos vêm com o DOBRO de ovos (bônus igual). Chamado dentro da transação do fulfill(). */
export function firstPurchaseSku(userId: string, orderId: string, sku: Sku): Sku {
  if (sku.kind !== 'ovos' || !sku.ovos || !isFirstPurchase(userId, orderId)) return sku
  logOfferEvent(userId, 'first_bonus', sku.id, sku.ovos)
  return { ...sku, ovos: sku.ovos * 2 }
}

// ---------- Loja: estoque limitado em volta do runShop ----------

/** Roda a compra consumindo 1 unidade do estoque global, tudo numa transação (devolve se a compra falhar). */
export function withStock<R>(op: ShopOp, run: () => R): R {
  const key = limitedKey(op as { op: string })
  if (!key) return run()
  const d = db()
  d.exec('BEGIN')
  try {
    const up = d.prepare('UPDATE limited_stock SET sold = sold + 1 WHERE item_id = ? AND sold < total AND (ends_at IS NULL OR ends_at > ?)').run(key, Date.now())
    if (!up.changes) throw new ShopError(t('ESGOTADO! Essa edição limitada acabou.'))
    const r = run()
    d.exec('COMMIT')
    return r
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

/** Métricas das compras da loja ligadas a ofertas. */
export function afterShop(userId: string, op: ShopOp, value: unknown) {
  const key = limitedKey(op as { op: string })
  if (key) logOfferEvent(userId, 'limited_sold', key)
  if (op.op === 'triggerOffer') logOfferEvent(userId, 'offer_shown', (value as Offer).kind)
  if (op.op === 'buyOffer') logOfferEvent(userId, 'offer_bought', (value as Offer).kind, (value as Offer).price)
  if (op.op === 'refillEnergy') logOfferEvent(userId, 'refill', null, Number(value) || 0)
}

// ---------- Rotas /api/limited e /api/offers/* ----------

export class OfertasError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function handleOfertas(path: string, method: string, url: URL, body: Record<string, unknown>, u: UserRow | null): unknown | null {
  if (path === '/api/limited' && method === 'GET') return { items: limitedStock(), now: Date.now() }
  if (!u) throw new OfertasError(401, t('Faça login para continuar'))
  if (path === '/api/offers' && method === 'GET') return { firstBonus: isFirstPurchase(u.id) }

  if (path.startsWith('/api/offers/admin')) {
    if (!isAdmin(u)) throw new OfertasError(403, t('Acesso só para administradores'))
    if (path === '/api/offers/admin' && method === 'GET') {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30))
      const since = Date.now() - days * DAY
      const rows = db().prepare('SELECT kind, COUNT(*) AS n, COALESCE(SUM(value),0) AS v FROM offer_events WHERE at >= ? GROUP BY kind').all(since) as { kind: string; n: number; v: number }[]
      const by = Object.fromEntries(rows.map((r) => [r.kind, r]))
      const shown = by.offer_shown?.n ?? 0
      const bought = by.offer_bought?.n ?? 0
      return {
        shown,
        bought,
        conversion: shown ? bought / shown : 0,
        offerOvos: by.offer_bought?.v ?? 0,
        firstBonus: by.first_bonus?.n ?? 0,
        limitedSold: by.limited_sold?.n ?? 0,
        refills: by.refill?.n ?? 0,
        refillOvos: by.refill?.v ?? 0,
        stock: limitedStock(),
      }
    }
    if (path === '/api/offers/admin/stock' && method === 'PUT') {
      const id = String(body.id ?? '')
      const total = Number(body.total)
      const endsAt = body.endsAt == null || body.endsAt === '' ? null : Number(body.endsAt)
      if (!LIMITED_ITEMS[id]) throw new OfertasError(404, t('Item não existe'))
      if (!Number.isInteger(total) || total < 0 || total > 1_000_000) throw new OfertasError(400, t('Quantidade inválida'))
      if (endsAt !== null && !Number.isFinite(endsAt)) throw new OfertasError(400, t('Data inválida'))
      db().prepare('UPDATE limited_stock SET total = ?, ends_at = ? WHERE item_id = ?').run(total, endsAt, id)
      getDb().prepare('INSERT INTO admin_log (at, admin_email, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(Date.now(), u.email, 'estoque', null, JSON.stringify({ id, total, endsAt }))
      return { stock: limitedStock() }
    }
  }
  return null
}

/** Exclusão de conta: apaga os eventos do jogador. */
export function deleteOfferData(userId: string) {
  db().prepare('DELETE FROM offer_events WHERE user_id = ?').run(userId)
}
