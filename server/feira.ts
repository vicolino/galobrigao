// 🏪 Feira: anúncios entre jogadores (galos, acessórios e skins) + presentes.
// O servidor guarda o item em custódia enquanto está à venda e cobra 10% de taxa na venda.
import { randomUUID } from 'node:crypto'
import { ACC_BY_ID, BREED_BY_ID, ELECTION_ROOSTERS, FOOTBALL_ROOSTERS, BRAZIL_ROOSTERS, SKIN_BY_ID, SPECIAL_ROOSTERS } from '../src/game/data'
import { today, uid } from '../src/game/rooster'
import { FEIRA, feiraFee, feiraPriceOk, type FeiraKind, type FeiraListing, type FeiraNotice, type FeiraPlayer, type FeiraTrade } from '../src/game/feira'
import type { Currency, GameState, Rooster } from '../src/game/types'
import { getDb, type UserRow } from './db'
import { loadSave, writeSave } from './saves'
import { fmt } from '../src/game/rooster'
import { t } from '../src/i18n'
import { aluguelAdmin, expireRentals } from './aluguel'
// Arena do servidor (server/economia.ts) procura a parte do aluguel aqui
export { rentalShare } from './aluguel'
import { roosterLock } from '../src/game/galonft'

export class FeiraError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const fail = (m: string, status = 400): never => {
  throw new FeiraError(status, m)
}

const db = () => getDb()
const UNIQUE_BREEDS = new Set([...ELECTION_ROOSTERS, ...SPECIAL_ROOSTERS, ...FOOTBALL_ROOSTERS, ...BRAZIL_ROOSTERS].map((e) => e.breedId))
const now = () => Date.now()
const HOUR = 3600_000

interface ListingRow {
  id: string
  seller: string
  kind: FeiraKind
  item_id: string
  payload: string | null
  price: number
  currency: Currency
  status: 'ativo' | 'vendido' | 'cancelado' | 'devolvido'
  created_at: number
  expires_at: number
  closed_at: number | null
  buyer: string | null
}

let ready = false
function schema() {
  if (ready) return
  db().exec(`
    CREATE TABLE IF NOT EXISTS feira_listings (
      id TEXT PRIMARY KEY,
      seller TEXT NOT NULL,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      payload TEXT,
      price INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      closed_at INTEGER,
      buyer TEXT
    );
    CREATE INDEX IF NOT EXISTS feira_listings_status ON feira_listings(status, created_at);
    CREATE INDEX IF NOT EXISTS feira_listings_seller ON feira_listings(seller, status);
    CREATE TABLE IF NOT EXISTS feira_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      listing_id TEXT,
      seller TEXT NOT NULL,
      buyer TEXT NOT NULL,
      asset_kind TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      currency TEXT NOT NULL,
      fee INTEGER NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS feira_trades_at ON feira_trades(at);
    CREATE INDEX IF NOT EXISTS feira_trades_buyer ON feira_trades(buyer, at);
    CREATE INDEX IF NOT EXISTS feira_trades_seller ON feira_trades(seller, kind, at);
    CREATE TABLE IF NOT EXISTS feira_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS feira_notices_user ON feira_notices(user_id, seen);
  `)
  ready = true
}

// ---------- Ajudantes ----------

const userName = (id: string) => (db().prepare('SELECT name FROM users WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? t('Criador')
const coin = (c: Currency) => (c === 'milho' ? '🌽' : '🥚')
const priceText = (v: number, c: Currency) => `${coin(c)} ${fmt(v)}`

const log = (s: GameState, text: string, milho: number, ovo: number): GameState => ({
  ...s,
  history: [{ id: uid(), at: now(), text, milho, ovo }, ...s.history].slice(0, 80),
})

function notify(userId: string, text: string) {
  db().prepare('INSERT INTO feira_notices (user_id, text, at) VALUES (?, ?, ?)').run(userId, text, now())
}

function assetName(kind: FeiraKind, id: string, ro?: Rooster | null) {
  if (kind === 'galo') return ro?.name ?? t('Galo')
  if (kind === 'acessorio') return ACC_BY_ID[id] ? `${ACC_BY_ID[id].emoji} ${ACC_BY_ID[id].name}` : id
  return SKIN_BY_ID[id] ? `${SKIN_BY_ID[id].emoji} ${SKIN_BY_ID[id].name}` : id
}

/** Galo em desafio pendente não pode sair do galinheiro. */
function roosterBusy(roosterId: string) {
  return !!db().prepare("SELECT 1 FROM challenges WHERE status = 'pendente' AND expires_at > ? AND (from_rooster = ? OR to_rooster = ?)").get(now(), roosterId, roosterId)
}

/** Unidades presas a NFT (web3) não podem sair do save. */
function nftHeld(userId: string, kind: FeiraKind, id: string) {
  const k = kind === 'skin' ? 'skin' : 'acc'
  try {
    return (db().prepare('SELECT COUNT(*) AS n FROM nfts WHERE owner_user_id = ? AND kind = ? AND item_id = ?').get(userId, k, id) as { n: number }).n
  } catch {
    return 0
  }
}

const units = (s: GameState, kind: FeiraKind, id: string) =>
  kind === 'skin' ? (s.skins.includes(id) ? 1 : 0) : (s.accessories[id] ?? 0) + s.roosters.filter((r) => Object.values(r.equipped).includes(id)).length

/** Créditos de NFT não podem passar do que sobrou do item. */
function capMintable(s: GameState, kind: FeiraKind, id: string): GameState {
  if (kind === 'galo' || !s.mintable) return s
  const key = `${kind === 'skin' ? 'skin' : 'acc'}:${id}`
  const left = units(s, kind, id)
  return (s.mintable[key] ?? 0) > left ? { ...s, mintable: { ...s.mintable, [key]: left } } : s
}

/** Tira o item do save (custódia). Devolve o novo estado e o galo (sem acessórios e sem skin). */
function takeAsset(s: GameState, userId: string, kind: FeiraKind, id: string): { state: GameState; rooster?: Rooster } {
  if (kind === 'galo') {
    const ro = s.roosters.find((r) => r.id === id) ?? fail(t('Galo não encontrado'))
    if (s.roosters.length <= 1) fail(t('Você precisa ter pelo menos um galo.'))
    if (ro.rental) fail(t('Galo alugado não pode ser vendido nem dado.'))
    if (roosterBusy(id)) fail(t('{nome} está num desafio pendente.', { nome: ro.name }))
    // Ninho, NFT ou aluguel: não sai daqui (evita gasto duplo)
    const lockWhy = roosterLock(s, ro)
    if (lockWhy) fail(lockWhy)
    const accs = { ...s.accessories }
    Object.values(ro.equipped).forEach((a) => a && (accs[a] = (accs[a] ?? 0) + 1))
    const clean: Rooster = { ...ro, equipped: {}, skin: undefined }
    return { state: { ...s, accessories: accs, roosters: s.roosters.filter((r) => r.id !== id) }, rooster: clean }
  }
  if (kind === 'acessorio') {
    if (!ACC_BY_ID[id]) fail(t('Acessório não existe'))
    if ((s.accessories[id] ?? 0) < 1) fail(t('Você não tem esse acessório guardado (tire do galo primeiro).'))
    if (units(s, kind, id) - 1 < nftHeld(userId, kind, id)) fail(t('Esse item é um NFT: não dá para vender aqui.'))
    return { state: capMintable({ ...s, accessories: { ...s.accessories, [id]: s.accessories[id] - 1 } }, kind, id) }
  }
  if (kind === 'skin') {
    if (!SKIN_BY_ID[id]) fail(t('Skin não existe'))
    if (!s.skins.includes(id)) fail(t('Você não tem essa skin.'))
    if (s.roosters.some((r) => r.skin === id)) fail(t('Tire a skin do galo antes.'))
    if (nftHeld(userId, kind, id) > 0) fail(t('Esse item é um NFT: não dá para vender aqui.'))
    return { state: capMintable({ ...s, skins: s.skins.filter((k) => k !== id) }, kind, id) }
  }
  return fail(t('Tipo de item inválido'))
}

/** O jogador pode receber esse item? (devolve a mensagem de erro, ou null) */
function cannotReceive(s: GameState, kind: FeiraKind, id: string, ro?: Rooster | null): string | null {
  if (kind === 'galo') {
    if (s.roosters.length >= FEIRA.maxRoosters) return t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: FEIRA.maxRoosters })
    if (ro && s.roosters.some((r) => r.id === ro.id)) return t('Esse galo já está no galinheiro.')
    // Edições especiais da loja: um de cada por galinheiro
    const b = ro && UNIQUE_BREEDS.has(ro.breedId) ? BREED_BY_ID[ro.breedId] : undefined
    if (b && s.roosters.some((r) => r.breedId === b.id)) return t('Já tem um {nome} no galinheiro.', { nome: b.name })
  }
  if (kind === 'skin' && s.skins.includes(id)) return t('Você já tem essa skin.')
  return null
}

function giveAsset(s: GameState, kind: FeiraKind, id: string, ro: Rooster | null | undefined, ownerName: string): GameState {
  if (kind === 'galo') return { ...s, roosters: [...s.roosters, { ...ro!, owner: ownerName }] }
  if (kind === 'acessorio') return { ...s, accessories: { ...s.accessories, [id]: (s.accessories[id] ?? 0) + 1 } }
  return { ...s, skins: [...s.skins, id] }
}

const parseRooster = (l: ListingRow): Rooster | null => (l.payload ? (JSON.parse(l.payload) as Rooster) : null)

function view(l: ListingRow, me: string): FeiraListing {
  const ro = parseRooster(l)
  return {
    id: l.id,
    kind: l.kind,
    itemId: l.item_id,
    rooster: ro ? { ...ro, lucky: 0 } : undefined,
    price: l.price,
    currency: l.currency,
    status: l.status,
    seller: userName(l.seller),
    sellerAvatar: loadSave(l.seller)?.state.player.avatar ?? '🧑‍🌾',
    mine: l.seller === me,
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    closedAt: l.closed_at ?? undefined,
    buyer: l.buyer ? userName(l.buyer) : undefined,
  }
}

function getListing(id: string) {
  return (db().prepare('SELECT * FROM feira_listings WHERE id = ?').get(id) as unknown as ListingRow | undefined) ?? fail(t('Anúncio não encontrado'), 404)
}

/** Devolve o item ao vendedor. Se não couber (galinheiro cheio, skin repetida), continua à venda. */
function returnListing(l: ListingRow, reason: 'cancelado' | 'devolvido'): string | null {
  const cur = loadSave(l.seller)
  if (!cur) return t('Sem galinheiro')
  const ro = parseRooster(l)
  const why = cannotReceive(cur.state, l.kind, l.item_id, ro)
  if (why) return why
  let s = giveAsset(cur.state, l.kind, l.item_id, ro, cur.state.player.name)
  const name = assetName(l.kind, l.item_id, ro)
  s = log(s, reason === 'cancelado' ? t('Feira: anúncio cancelado ({item})', { item: name }) : t('Feira: anúncio venceu, {item} voltou', { item: name }), 0, 0)
  const d = db()
  d.exec('BEGIN')
  try {
    const r = d.prepare("UPDATE feira_listings SET status = ?, closed_at = ? WHERE id = ? AND status = 'ativo'").run(reason, now(), l.id)
    if (!r.changes) {
      d.exec('ROLLBACK')
      return t('Esse anúncio não está mais ativo.')
    }
    writeSave(l.seller, s, cur.rev + 1)
    if (reason === 'devolvido') notify(l.seller, t('⌛ Seu anúncio de {item} venceu e voltou para você.', { item: name }))
    d.exec('COMMIT')
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
  return null
}

/** Anúncios vencidos voltam ao dono (preguiçoso: roda nas chamadas da Feira e no poll do dono). */
export function expireListings(sellerId?: string) {
  schema()
  const rows = (
    sellerId
      ? db().prepare("SELECT * FROM feira_listings WHERE status = 'ativo' AND expires_at < ? AND seller = ? LIMIT 20").all(now(), sellerId)
      : db().prepare("SELECT * FROM feira_listings WHERE status = 'ativo' AND expires_at < ? LIMIT 50").all(now())
  ) as unknown as ListingRow[]
  for (const l of rows) {
    // Não coube: fica mais um dia à venda
    if (returnListing(l, 'devolvido')) db().prepare('UPDATE feira_listings SET expires_at = ? WHERE id = ?').run(now() + 24 * HOUR, l.id)
  }
}

/** Avisos novos da Feira (vão no poll dos desafios; são marcados como vistos ao entregar). */
export function feiraNotices(userId: string): FeiraNotice[] {
  schema()
  expireListings(userId)
  expireRentals(userId)
  const rows = db().prepare('SELECT id, text, at FROM feira_notices WHERE user_id = ? AND seen = 0 ORDER BY id LIMIT 10').all(userId) as unknown as FeiraNotice[]
  if (rows.length) db().prepare('UPDATE feira_notices SET seen = 1 WHERE user_id = ? AND id <= ?').run(userId, rows[rows.length - 1].id)
  return rows
}

/** Recebido pela Feira há menos de 24h? (não pode ser revendido por ovos logo em seguida) */
function recentlyReceived(userId: string, kind: FeiraKind, id: string) {
  return !!db().prepare('SELECT 1 FROM feira_trades WHERE buyer = ? AND asset_kind = ? AND asset_id = ? AND at > ?').get(userId, kind, id, now() - FEIRA.eggResaleHours * HOUR)
}

function trade(row: Omit<FeiraTrade, 'id' | 'sellerName' | 'buyerName'>) {
  db()
    .prepare('INSERT INTO feira_trades (kind, listing_id, seller, buyer, asset_kind, asset_id, asset_name, price, currency, fee, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(row.kind, row.listingId ?? null, row.seller, row.buyer, row.assetKind, row.assetId, row.assetName, row.price, row.currency, row.fee, row.at)
}

const startOfDay = () => new Date(today()).getTime()

// ---------- Rotas ----------

export function handleFeira(path: string, method: string, url: URL, body: Record<string, unknown>, u: UserRow): { status?: number; body: unknown } | null {
  schema()
  expireListings()

  // Tudo de uma vez: anúncios dos outros, os meus, avisos recentes e presentes de hoje
  if (path === '/api/feira' && method === 'GET') {
    const open = db()
      .prepare("SELECT l.* FROM feira_listings l JOIN users u ON u.id = l.seller WHERE l.status = 'ativo' AND l.expires_at > ? AND u.banned_at IS NULL ORDER BY l.created_at DESC LIMIT 300")
      .all(now()) as unknown as ListingRow[]
    const mine = db().prepare("SELECT * FROM feira_listings WHERE seller = ? AND (status = 'ativo' OR closed_at > ?) ORDER BY created_at DESC LIMIT 60").all(u.id, now() - 30 * 24 * HOUR) as unknown as ListingRow[]
    const notices = db().prepare('SELECT id, text, at FROM feira_notices WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(u.id) as unknown as FeiraNotice[]
    db().prepare('UPDATE feira_notices SET seen = 1 WHERE user_id = ? AND seen = 0').run(u.id)
    const gifts = (db().prepare("SELECT COUNT(*) AS n FROM feira_trades WHERE kind = 'presente' AND seller = ? AND at >= ?").get(u.id, startOfDay()) as { n: number }).n
    return {
      body: {
        listings: open.filter((l) => l.seller !== u.id).map((l) => view(l, u.id)),
        mine: mine.map((l) => view(l, u.id)),
        notices,
        giftsToday: gifts,
      },
    }
  }

  // Busca de jogadores para presentear (nome ou id; nunca e-mail)
  if (path === '/api/feira/players' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 40)
    if (q.length < 2) return { body: { players: [] } }
    const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`
    const rows = db()
      .prepare("SELECT u.id, u.name FROM users u JOIN saves s ON s.user_id = u.id WHERE u.id != ? AND u.banned_at IS NULL AND (u.id = ? OR u.name LIKE ? ESCAPE '\\') ORDER BY (u.id = ?) DESC, u.name LIMIT 10")
      .all(u.id, q, like, q) as { id: string; name: string }[]
    const players: FeiraPlayer[] = rows.map((r) => {
      const s = loadSave(r.id)?.state
      return { id: r.id, name: r.name, avatar: s?.player.avatar ?? '🧑‍🌾', roosters: s?.roosters.length ?? 0 }
    })
    return { body: { players } }
  }

  // Anunciar
  if (path === '/api/feira/list' && method === 'POST') {
    const kind = String(body.kind) as FeiraKind
    const id = String(body.id ?? '')
    const currency: Currency = body.currency === 'ovo' ? 'ovo' : 'milho'
    const price = Number(body.price)
    if (!['galo', 'acessorio', 'skin'].includes(kind)) fail(t('Tipo de item inválido'))
    if (!feiraPriceOk(price, currency))
      fail(t('Preço fora do permitido: {min} a {max}.', { min: priceText(FEIRA.min[currency], currency), max: priceText(FEIRA.max[currency], currency) }))
    const active = (db().prepare("SELECT COUNT(*) AS n FROM feira_listings WHERE seller = ? AND status = 'ativo'").get(u.id) as { n: number }).n
    if (active >= FEIRA.maxListings) fail(t('Você já tem {n} anúncios ativos. Cancele algum ou espere vender.', { n: FEIRA.maxListings }))
    if (currency === 'ovo' && recentlyReceived(u.id, kind, id)) fail(t('Item recebido na Feira há menos de 24h só pode ser revendido por milho.'))
    const cur = loadSave(u.id) ?? fail(t('Sem galinheiro'), 409)
    const { state, rooster } = takeAsset(cur.state, u.id, kind, id)
    const name = assetName(kind, id, rooster)
    const s = log(state, t('Feira: anunciou {item} por {preco}', { item: name, preco: priceText(price, currency) }), 0, 0)
    const lid = randomUUID()
    const d = db()
    d.exec('BEGIN')
    try {
      d.prepare('INSERT INTO feira_listings (id, seller, kind, item_id, payload, price, currency, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        lid, u.id, kind, id, rooster ? JSON.stringify(rooster) : null, price, currency, 'ativo', now(), now() + FEIRA.ttlHours * HOUR,
      )
      writeSave(u.id, s, cur.rev + 1)
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    return { status: 201, body: { rev: cur.rev + 1, state: s, listing: view(getListing(lid), u.id) } }
  }

  // Cancelar (o item volta)
  if (path === '/api/feira/cancel' && method === 'POST') {
    const l = getListing(String(body.id))
    if (l.seller !== u.id) fail(t('Esse anúncio não é seu'), 403)
    if (l.status !== 'ativo') fail(t('Esse anúncio não está mais ativo.'))
    const why = returnListing(l, 'cancelado')
    if (why) fail(why)
    const cur = loadSave(u.id)!
    return { body: { rev: cur.rev, state: cur.state } }
  }

  // Comprar
  if (path === '/api/feira/buy' && method === 'POST') {
    const l = getListing(String(body.id))
    if (l.status !== 'ativo' || l.expires_at < now()) fail(t('Esse anúncio não está mais ativo.'), 409)
    if (l.seller === u.id) fail(t('Esse anúncio é seu.'))
    if (body.price !== undefined && (Number(body.price) !== l.price || body.currency !== l.currency)) fail(t('O preço mudou. Confira de novo.'), 409)
    const buyer = loadSave(u.id) ?? fail(t('Sem galinheiro'), 409)
    const seller = loadSave(l.seller) ?? fail(t('O vendedor não existe mais.'), 409)
    const ro = parseRooster(l)
    const why = cannotReceive(buyer.state, l.kind, l.item_id, ro)
    if (why) fail(why)
    const have = l.currency === 'milho' ? buyer.state.milho : buyer.state.ovos
    if (have < l.price) fail(l.currency === 'milho' ? t('Milho insuficiente 🌽') : t('Ovos de ouro insuficientes 🥚'))
    const fee = feiraFee(l.price)
    const net = l.price - fee
    const name = assetName(l.kind, l.item_id, ro)
    const buyerName = userName(u.id)
    const sellerName = userName(l.seller)
    const isMilho = l.currency === 'milho'
    let b: GameState = { ...buyer.state, milho: buyer.state.milho - (isMilho ? l.price : 0), ovos: buyer.state.ovos - (isMilho ? 0 : l.price) }
    b = giveAsset(b, l.kind, l.item_id, ro, buyer.state.player.name)
    b = { ...b, stats: { ...b.stats, purchases: b.stats.purchases + 1 } }
    b = log(b, t('Feira: comprou {item} de {nome}', { item: name, nome: sellerName }), isMilho ? -l.price : 0, isMilho ? 0 : -l.price)
    let s: GameState = { ...seller.state, milho: seller.state.milho + (isMilho ? net : 0), ovos: seller.state.ovos + (isMilho ? 0 : net) }
    s = log(s, t('Feira: vendeu {item} para {nome}', { item: name, nome: buyerName }), isMilho ? net : 0, isMilho ? 0 : net)
    const d = db()
    d.exec('BEGIN')
    try {
      const r = d.prepare("UPDATE feira_listings SET status = 'vendido', closed_at = ?, buyer = ? WHERE id = ? AND status = 'ativo'").run(now(), u.id, l.id)
      if (!r.changes) fail(t('Esse anúncio não está mais ativo.'), 409)
      writeSave(u.id, b, buyer.rev + 1)
      writeSave(l.seller, s, seller.rev + 1)
      trade({ kind: 'venda', listingId: l.id, seller: l.seller, buyer: u.id, assetKind: l.kind, assetId: l.item_id, assetName: name, price: l.price, currency: l.currency, fee, at: now() })
      notify(l.seller, t('🏪 {nome} comprou {item}! Você recebeu {liquido} (taxa da Feira: {taxa}).', { nome: buyerName, item: name, liquido: priceText(net, l.currency), taxa: priceText(fee, l.currency) }))
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    return { body: { rev: buyer.rev + 1, state: b } }
  }

  // Presente: 🥚 2 de embrulho, até 5 por dia
  if (path === '/api/feira/gift' && method === 'POST') {
    const kind = String(body.kind) as FeiraKind
    const id = String(body.id ?? '')
    const to = String(body.to ?? '')
    if (!['galo', 'acessorio', 'skin'].includes(kind)) fail(t('Tipo de item inválido'))
    if (to === u.id) fail(t('Não dá para presentear a si mesmo.'))
    const target = db().prepare('SELECT id, name, banned_at FROM users WHERE id = ?').get(to) as { id: string; name: string; banned_at: number | null } | undefined
    if (!target || target.banned_at) fail(t('Jogador não encontrado'), 404)
    const sent = (db().prepare("SELECT COUNT(*) AS n FROM feira_trades WHERE kind = 'presente' AND seller = ? AND at >= ?").get(u.id, startOfDay()) as { n: number }).n
    if (sent >= FEIRA.giftsPerDay) fail(t('Limite de {n} presentes por dia. Volte amanhã!', { n: FEIRA.giftsPerDay }), 429)
    const cur = loadSave(u.id) ?? fail(t('Sem galinheiro'), 409)
    const dest = loadSave(to) ?? fail(t('Esse jogador ainda não tem galinheiro.'))
    if (cur.state.ovos < FEIRA.giftFee) fail(t('O embrulho custa 🥚 {n}.', { n: FEIRA.giftFee }))
    const taken = takeAsset(cur.state, u.id, kind, id)
    const why = cannotReceive(dest.state, kind, id, taken.rooster)
    if (why) fail(t('{nome} não pode receber: {motivo}', { nome: target!.name, motivo: why }))
    const name = assetName(kind, id, taken.rooster)
    const myName = userName(u.id)
    let s: GameState = { ...taken.state, ovos: taken.state.ovos - FEIRA.giftFee }
    s = log(s, t('🎁 Presente para {nome}: {item}', { nome: target!.name, item: name }), 0, -FEIRA.giftFee)
    let r = giveAsset(dest.state, kind, id, taken.rooster, dest.state.player.name)
    r = log(r, t('🎁 Presente de {nome}: {item}', { nome: myName, item: name }), 0, 0)
    const d = db()
    d.exec('BEGIN')
    try {
      writeSave(u.id, s, cur.rev + 1)
      writeSave(to, r, dest.rev + 1)
      trade({ kind: 'presente', seller: u.id, buyer: to, assetKind: kind, assetId: id, assetName: name, price: 0, currency: 'ovo', fee: FEIRA.giftFee, at: now() })
      notify(to, t('🎁 {nome} te mandou {item}!', { nome: myName, item: name }))
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    return { body: { rev: cur.rev + 1, state: s } }
  }

  return null
}

// ---------- Backoffice ----------

/** Conta excluída: anúncios ativos saem da Feira (o item some com a conta) e os avisos são apagados. */
export function feiraDeleteUser(userId: string) {
  schema()
  db().prepare("UPDATE feira_listings SET status = 'excluido', closed_at = ? WHERE seller = ? AND status = 'ativo'").run(now(), userId)
  db().prepare('DELETE FROM feira_notices WHERE user_id = ?').run(userId)
}

export function feiraAdmin() {
  schema()
  const fees = db().prepare('SELECT currency, kind, COALESCE(SUM(fee), 0) AS fee, COALESCE(SUM(price), 0) AS volume, COUNT(*) AS n FROM feira_trades GROUP BY currency, kind').all() as {
    currency: Currency
    kind: 'venda' | 'presente'
    fee: number
    volume: number
    n: number
  }[]
  const sum = (c: Currency, k?: string) => fees.filter((f) => f.currency === c && (!k || f.kind === k))
  const active = (db().prepare("SELECT COUNT(*) AS n FROM feira_listings WHERE status = 'ativo'").get() as { n: number }).n
  const rows = db().prepare('SELECT * FROM feira_trades ORDER BY at DESC LIMIT 50').all() as Record<string, unknown>[]
  const trades: FeiraTrade[] = rows.map((r) => ({
    id: r.id as number,
    kind: r.kind as FeiraTrade['kind'],
    listingId: (r.listing_id as string) ?? undefined,
    seller: r.seller as string,
    buyer: r.buyer as string,
    sellerName: userName(r.seller as string),
    buyerName: userName(r.buyer as string),
    assetKind: r.asset_kind as FeiraKind,
    assetId: r.asset_id as string,
    assetName: r.asset_name as string,
    price: r.price as number,
    currency: r.currency as Currency,
    fee: r.fee as number,
    at: r.at as number,
  }))
  return {
    active,
    sales: fees.filter((f) => f.kind === 'venda').reduce((a, f) => a + f.n, 0),
    gifts: fees.filter((f) => f.kind === 'presente').reduce((a, f) => a + f.n, 0),
    feesMilho: sum('milho').reduce((a, f) => a + f.fee, 0),
    feesOvos: sum('ovo').reduce((a, f) => a + f.fee, 0),
    volumeMilho: sum('milho', 'venda').reduce((a, f) => a + f.volume, 0),
    volumeOvos: sum('ovo', 'venda').reduce((a, f) => a + f.volume, 0),
    trades,
    rentals: aluguelAdmin(),
  }
}
