// Edições Limitadas de Raros: o admin lança uma edição de uma skin da coleção (RAROS_SKINS)
// com estoque e preço em ovos. O jogador compra com ovos e recebe o NFT na carteira (server/web3.ts).
import { randomUUID } from 'node:crypto'
import { RAROS_SKINS } from '../src/game/data'
import { getDb } from './db'

const db = () => getDb()

export interface EditionRow {
  id: string
  item_kind: string
  item_id: string
  price_ovos: number
  supply_total: number
  supply_left: number
  active: number
  created_at: number
}

/** Ids de skins que podem virar edição (só a coleção Raros). */
export const RARO_IDS = new Set(RAROS_SKINS.map((s) => s.id))

const view = (e: EditionRow) => ({
  id: e.id,
  itemKind: e.item_kind,
  itemId: e.item_id,
  price: e.price_ovos,
  total: e.supply_total,
  left: e.supply_left,
  sold: e.supply_total - e.supply_left,
  active: !!e.active,
  createdAt: e.created_at,
})
export type EditionView = ReturnType<typeof view>

export function getEdition(id: string) {
  return db().prepare('SELECT * FROM editions WHERE id = ?').get(id) as unknown as EditionRow | undefined
}
/** Todas as edições (admin). */
export function listEditions() {
  return (db().prepare('SELECT * FROM editions ORDER BY created_at DESC').all() as unknown as EditionRow[]).map(view)
}
/** Edições ativas e com estoque (loja do jogador). */
export function activeEditions() {
  return (db().prepare('SELECT * FROM editions WHERE active = 1 AND supply_left > 0 ORDER BY created_at DESC').all() as unknown as EditionRow[]).map(view)
}

export function createEdition(itemId: string, priceOvos: number, supply: number, active: boolean) {
  if (!RARO_IDS.has(itemId)) throw new Error('item fora da coleção Raros')
  const price = Math.round(priceOvos)
  const total = Math.round(supply)
  if (!(price > 0)) throw new Error('preço deve ser maior que zero')
  if (!(total > 0)) throw new Error('estoque deve ser maior que zero')
  const id = randomUUID()
  db()
    .prepare('INSERT INTO editions (id, item_kind, item_id, price_ovos, supply_total, supply_left, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, 'skin', itemId, price, total, total, active ? 1 : 0, Date.now())
  return view(getEdition(id)!)
}

export function setEditionActive(id: string, active: boolean) {
  db().prepare('UPDATE editions SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
  const e = getEdition(id)
  return e ? view(e) : null
}

export function deleteEdition(id: string) {
  return db().prepare('DELETE FROM editions WHERE id = ?').run(id).changes > 0
}

/** Reserva 1 unidade de estoque atomicamente (só se ativa e com estoque). true = conseguiu. */
export function claimStock(id: string) {
  return db().prepare('UPDATE editions SET supply_left = supply_left - 1 WHERE id = ? AND active = 1 AND supply_left > 0').run(id).changes > 0
}
/** Devolve 1 unidade ao estoque (compensação quando a compra falha). */
export function releaseStock(id: string) {
  db().prepare('UPDATE editions SET supply_left = supply_left + 1 WHERE id = ? AND supply_left < supply_total').run(id)
}
