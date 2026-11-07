// 🔑 Aluguel de galos (Feira): o dono anuncia um galo por 1, 3 ou 7 dias; quem aluga paga adiantado
// (a Feira fica com 10%) e luta com ele. O galo vai para o save de quem alugou com o campo `rental`
// (só o servidor mexe) e volta sozinho ao dono no fim do prazo, com o XP e os níveis que ganhou.
// Parte opcional da Arena: o dono fica com X% do milho que o galo ganhar (rentalShare, chamada pela Arena do servidor).
import { randomUUID } from 'node:crypto'
import { BREED_BY_ID, ELECTION_ROOSTERS, FOOTBALL_ROOSTERS, BRAZIL_ROOSTERS, SPECIAL_ROOSTERS } from '../src/game/data'
import { ALUGUEL, DAY, rentalCut, rentDaysOk, sharePctOk, type AluguelAdmin, type AluguelData, type AluguelListing } from '../src/game/aluguel'
import { FEIRA, feiraFee, feiraPriceOk } from '../src/game/feira'
import { roosterLock } from '../src/game/galonft'
import { fmt, uid } from '../src/game/rooster'
import type { Currency, GameState, LentRooster, Rooster } from '../src/game/types'
import { t } from '../src/i18n'
import { getDb, type UserRow } from './db'
import { loadSave, writeSave } from './saves'
import { creditTreasury } from './treasury'

export class AluguelError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const fail = (m: string, status = 400): never => {
  throw new AluguelError(status, m)
}

const db = () => getDb()
const now = () => Date.now()
const HOUR = 3600_000
/** Teto do save (PUT /api/save recusa mais que isso). */
const SAVE_MAX_ROOSTERS = 16
const UNIQUE_BREEDS = new Set([...ELECTION_ROOSTERS, ...SPECIAL_ROOSTERS, ...FOOTBALL_ROOSTERS, ...BRAZIL_ROOSTERS].map((e) => e.breedId))

type Status = AluguelListing['status']
interface Row {
  id: string
  owner: string
  rooster_id: string
  payload: string
  days: number
  price: number
  currency: Currency
  share_pct: number
  status: Status
  created_at: number
  expires_at: number
  borrower: string | null
  rented_at: number | null
  until: number | null
  closed_at: number | null
  fee: number
  share_earned: number
}

let ready = false
function schema() {
  if (ready) return
  db().exec(`
    CREATE TABLE IF NOT EXISTS aluguel (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      rooster_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      days INTEGER NOT NULL,
      price INTEGER NOT NULL,
      currency TEXT NOT NULL,
      share_pct INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      borrower TEXT,
      rented_at INTEGER,
      until INTEGER,
      closed_at INTEGER,
      fee INTEGER NOT NULL DEFAULT 0,
      share_earned INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS aluguel_status ON aluguel(status, created_at);
    CREATE INDEX IF NOT EXISTS aluguel_owner ON aluguel(owner, status);
    CREATE INDEX IF NOT EXISTS aluguel_borrower ON aluguel(borrower, status);
    CREATE INDEX IF NOT EXISTS aluguel_rooster ON aluguel(rooster_id, status);
    CREATE TABLE IF NOT EXISTS feira_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0
    );
  `)
  ready = true
}

// ---------- Ajudantes ----------

const userName = (id: string) => (db().prepare('SELECT name FROM users WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? t('Criador')
const coin = (c: Currency) => (c === 'milho' ? '🌽' : '🥚')
const priceText = (v: number, c: Currency) => `${coin(c)} ${fmt(v)}`
const ddmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

const log = (s: GameState, text: string, milho: number, ovo: number): GameState => ({
  ...s,
  history: [{ id: uid(), at: now(), text, milho, ovo }, ...s.history].slice(0, 80),
})

/** Avisos vão para a mesma caixa da Feira (entregues no poll). */
function notify(userId: string, text: string) {
  db().prepare('INSERT INTO feira_notices (user_id, text, at) VALUES (?, ?, ?)').run(userId, text, now())
}

/** Galo em desafio pendente não pode trocar de galinheiro agora. */
function roosterBusy(roosterId: string) {
  try {
    return !!db().prepare("SELECT 1 FROM challenges WHERE status = 'pendente' AND expires_at > ? AND (from_rooster = ? OR to_rooster = ?)").get(now(), roosterId, roosterId)
  } catch {
    return false
  }
}

const parse = (r: Row) => JSON.parse(r.payload) as Rooster
const getRow = (id: string) => (db().prepare('SELECT * FROM aluguel WHERE id = ?').get(id) as unknown as Row | undefined) ?? fail(t('Anúncio não encontrado'), 404)
const countWhere = (sql: string, ...args: (string | number)[]) => (db().prepare(`SELECT COUNT(*) AS n FROM aluguel WHERE ${sql}`).get(...args) as { n: number }).n

const setLent = (s: GameState, entry: LentRooster): GameState => ({ ...s, lent: [...(s.lent ?? []).filter((l) => l.listingId !== entry.listingId), entry] })
const dropLent = (s: GameState, listingId: string): GameState => ({ ...s, lent: (s.lent ?? []).filter((l) => l.listingId !== listingId) })

function view(r: Row, me: string): AluguelListing {
  const ro = parse(r)
  return {
    id: r.id,
    rooster: { ...ro, lucky: 0 },
    owner: userName(r.owner),
    ownerAvatar: loadSave(r.owner)?.state.player.avatar ?? '🧑‍🌾',
    mine: r.owner === me,
    days: r.days,
    price: r.price,
    currency: r.currency,
    sharePct: r.share_pct,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    borrower: r.borrower ? userName(r.borrower) : undefined,
    borrowedByMe: r.borrower === me,
    rentedAt: r.rented_at ?? undefined,
    until: r.until ?? undefined,
    closedAt: r.closed_at ?? undefined,
    fee: r.fee || undefined,
    shareEarned: r.share_earned,
  }
}

/** Roda escritas em transação (ou direto, se já estiver dentro de uma). */
function tx(fn: () => void, inTx = false) {
  if (inTx) return fn()
  const d = db()
  d.exec('BEGIN')
  try {
    fn()
    d.exec('COMMIT')
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

/** Anúncio (ainda não alugado) volta ao dono. */
function returnListing(r: Row, reason: 'cancelado' | 'vencido'): string | null {
  const cur = loadSave(r.owner)
  if (!cur) return t('Sem galinheiro')
  if (cur.state.roosters.length >= SAVE_MAX_ROOSTERS) return t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: FEIRA.maxRoosters })
  const ro = parse(r)
  let s: GameState = dropLent({ ...cur.state, roosters: [...cur.state.roosters, { ...ro, owner: cur.state.player.name }] }, r.id)
  s = log(s, reason === 'cancelado' ? t('🔑 Aluguel cancelado: {nome} voltou', { nome: ro.name }) : t('🔑 Ninguém alugou {nome}: ele voltou', { nome: ro.name }), 0, 0)
  let gone = false
  tx(() => {
    const u = db().prepare("UPDATE aluguel SET status = ?, closed_at = ? WHERE id = ? AND status = 'ativo'").run(reason, now(), r.id)
    if (!u.changes) {
      gone = true
      return
    }
    writeSave(r.owner, s, cur.rev + 1)
    if (reason === 'vencido') notify(r.owner, t('⌛ Ninguém alugou {nome} em {n}h. Ele voltou para o seu galinheiro.', { nome: ro.name, n: ALUGUEL.ttlHours }))
  })
  return gone ? t('Esse anúncio não está mais ativo.') : null
}

/**
 * Fim do aluguel: o galo sai do save de quem alugou (os acessórios dele voltam para ele) e volta ao dono
 * com o XP/níveis ganhos, sem skin que o dono não tenha. A parte acumulada da Arena cai para o dono.
 */
function endRental(r: Row, early = false, inTx = false): string | null {
  const own = loadSave(r.owner)
  if (!own) return t('Sem galinheiro')
  if (!inTx && roosterBusy(r.rooster_id)) return t('{nome} está num desafio pendente.', { nome: parse(r).name })
  if (own.state.roosters.length >= SAVE_MAX_ROOSTERS) return t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: FEIRA.maxRoosters })
  const bor = r.borrower ? loadSave(r.borrower) : null
  const there = bor?.state.roosters.find((x) => x.id === r.rooster_id)
  const ro = there ?? parse(r)
  const before = parse(r)
  const { rental: _r, ...plain } = ro
  void _r
  const back: Rooster = { ...plain, name: before.name, style: before.style, equipped: {}, skin: ro.skin && own.state.skins.includes(ro.skin) ? ro.skin : undefined, owner: own.state.player.name }
  const share = r.share_earned
  const borrowerName = r.borrower ? userName(r.borrower) : t('Criador')
  const up = back.level - before.level
  let o: GameState = dropLent({ ...own.state, milho: own.state.milho + share, roosters: [...own.state.roosters, back] }, r.id)
  o = log(o, t('🔑 {nome} voltou do aluguel com {quem}', { nome: ro.name, quem: borrowerName }), share, 0)
  let b: GameState | null = null
  if (bor) {
    const accs = { ...bor.state.accessories }
    if (there) Object.values(there.equipped).forEach((a) => a && (accs[a] = (accs[a] ?? 0) + 1))
    b = { ...bor.state, accessories: accs, roosters: bor.state.roosters.filter((x) => x.id !== r.rooster_id) }
    b = log(b, t('🔑 Fim do aluguel: {nome} voltou para {dono}', { nome: ro.name, dono: userName(r.owner) }), 0, 0)
  }
  let gone = false
  tx(() => {
    const u = db().prepare("UPDATE aluguel SET status = 'devolvido', closed_at = ? WHERE id = ? AND status = 'alugado'").run(now(), r.id)
    if (!u.changes) {
      gone = true
      return
    }
    writeSave(r.owner, o, own.rev + 1)
    if (bor && b) writeSave(r.borrower!, b, bor.rev + 1)
    const p = { nome: ro.name, quem: borrowerName, n: up, v: priceText(share, 'milho') }
    notify(
      r.owner,
      up > 0 && share > 0
        ? t('🔑 {nome} voltou do aluguel com {quem}: subiu {n} nível(is) e rendeu {v} da Arena!', p)
        : up > 0
          ? t('🔑 {nome} voltou do aluguel com {quem} e subiu {n} nível(is)!', p)
          : share > 0
            ? t('🔑 {nome} voltou do aluguel com {quem} e rendeu {v} da Arena!', p)
            : t('🔑 {nome} voltou do aluguel com {quem}.', p),
    )
    if (r.borrower)
      notify(r.borrower, early ? t('🔑 Você devolveu {nome} para {dono}.', { nome: ro.name, dono: userName(r.owner) }) : t('⌛ O aluguel de {nome} acabou: ele voltou para {dono}.', { nome: ro.name, dono: userName(r.owner) }))
  }, inTx)
  return gone ? t('Esse aluguel já acabou.') : null
}

/** Vencimentos preguiçosos: anúncios sem interessado e aluguéis no fim do prazo. */
export function expireRentals(userId?: string) {
  schema()
  const t0 = now()
  const listings = (
    userId
      ? db().prepare("SELECT * FROM aluguel WHERE status = 'ativo' AND expires_at < ? AND owner = ? LIMIT 10").all(t0, userId)
      : db().prepare("SELECT * FROM aluguel WHERE status = 'ativo' AND expires_at < ? LIMIT 30").all(t0)
  ) as unknown as Row[]
  for (const r of listings) if (returnListing(r, 'vencido')) db().prepare('UPDATE aluguel SET expires_at = ? WHERE id = ?').run(t0 + 24 * HOUR, r.id)
  const rentals = (
    userId
      ? db().prepare("SELECT * FROM aluguel WHERE status = 'alugado' AND until < ? AND (owner = ? OR borrower = ?) LIMIT 10").all(t0, userId, userId)
      : db().prepare("SELECT * FROM aluguel WHERE status = 'alugado' AND until < ? LIMIT 30").all(t0)
  ) as unknown as Row[]
  // Não deu para devolver (desafio pendente / galinheiro do dono no teto): tenta de novo em 1h
  for (const r of rentals) if (endRental(r)) db().prepare('UPDATE aluguel SET until = ? WHERE id = ?').run(t0 + HOUR, r.id)
}

/**
 * Parte do dono no milho que um galo alugado ganhou na Arena. A Arena do servidor chama isto DEPOIS de
 * gravar o prêmio: o valor sai do save de quem alugou (rev+1; a Arena relê o save) e acumula no contrato,
 * caindo para o dono quando o galo volta (evita reescrever o save do dono a cada luta). Devolve quanto saiu.
 */
export function rentalShare(borrowerId: string, roosterId: string, cornWon: number): number {
  schema()
  if (!Number.isFinite(cornWon) || cornWon <= 0) return 0
  const r = db().prepare("SELECT id, owner, share_pct FROM aluguel WHERE status = 'alugado' AND borrower = ? AND rooster_id = ? AND until > ?").get(borrowerId, roosterId, now()) as
    | { id: string; owner: string; share_pct: number }
    | undefined
  if (!r) return 0
  const cur = loadSave(borrowerId)
  if (!cur || !cur.state.roosters.some((x) => x.id === roosterId && x.rental?.listingId === r.id)) return 0
  const cut = Math.min(rentalCut(Math.floor(cornWon), r.share_pct), Math.max(0, Math.floor(cur.state.milho)))
  if (cut <= 0) return 0
  const s = log({ ...cur.state, milho: cur.state.milho - cut }, t('🔑 Parte de {dono} na luta ({p}%)', { dono: userName(r.owner), p: r.share_pct }), -cut, 0)
  tx(() => {
    db().prepare('UPDATE aluguel SET share_earned = share_earned + ? WHERE id = ?').run(cut, r.id)
    writeSave(borrowerId, s, cur.rev + 1)
  })
  return cut
}

/**
 * PUT /api/save: o contrato do aluguel é do servidor. Galo alugado não pode sumir do save (vender, soltar)
 * e o campo `rental`/`lent` não pode ser inventado pelo navegador. Ajusta `next` e devolve o motivo de recusa.
 */
export function guardRentals(cur: GameState, next: GameState): string | null {
  const byId = new Map(next.roosters.map((r) => [r.id, r]))
  const rented = new Set<string>()
  for (const r of cur.roosters) {
    if (!r.rental) continue
    const n = byId.get(r.id)
    if (!n) return 'galo alugado' // i18n-ok (só log do servidor)
    n.rental = r.rental
    rented.add(r.id)
  }
  for (const r of next.roosters) if (r.rental && !rented.has(r.id)) delete r.rental
  next.lent = cur.lent
  return null
}

// ---------- Rotas ----------

export function handleAluguel(path: string, method: string, body: Record<string, unknown>, u: UserRow): { status?: number; body: unknown } | null {
  schema()
  expireRentals()

  if (path === '/api/aluguel' && method === 'GET') {
    const open = db()
      .prepare("SELECT a.* FROM aluguel a JOIN users u ON u.id = a.owner WHERE a.status = 'ativo' AND a.expires_at > ? AND a.owner != ? AND u.banned_at IS NULL ORDER BY a.created_at DESC LIMIT 200")
      .all(now(), u.id) as unknown as Row[]
    const since = now() - 30 * DAY
    const mine = db().prepare("SELECT * FROM aluguel WHERE owner = ? AND (status IN ('ativo', 'alugado') OR closed_at > ?) ORDER BY created_at DESC LIMIT 40").all(u.id, since) as unknown as Row[]
    const borrowed = db().prepare("SELECT * FROM aluguel WHERE borrower = ? AND (status = 'alugado' OR closed_at > ?) ORDER BY rented_at DESC LIMIT 40").all(u.id, since) as unknown as Row[]
    const data: AluguelData = { listings: open.map((r) => view(r, u.id)), mine: mine.map((r) => view(r, u.id)), borrowed: borrowed.map((r) => view(r, u.id)) }
    return { body: data }
  }

  // Colocar para alugar (o galo fica em custódia até alguém alugar)
  if (path === '/api/aluguel/list' && method === 'POST') {
    const roosterId = String(body.roosterId ?? '')
    const days = Number(body.days)
    const price = Number(body.price)
    const currency: Currency = body.currency === 'ovo' ? 'ovo' : 'milho'
    const sharePct = Number(body.sharePct ?? 0)
    if (!rentDaysOk(days)) fail(t('Escolha 1, 3 ou 7 dias.'))
    if (!sharePctOk(sharePct)) fail(t('A parte da Arena vai de 0% a {n}%.', { n: ALUGUEL.maxSharePct }))
    if (!feiraPriceOk(price, currency)) fail(t('Preço fora do permitido: {min} a {max}.', { min: priceText(FEIRA.min[currency], currency), max: priceText(FEIRA.max[currency], currency) }))
    const out = countWhere("owner = ? AND status IN ('ativo', 'alugado')", u.id)
    if (out >= ALUGUEL.maxLent) fail(t('Você já tem {n} galos no aluguel. Espere algum voltar.', { n: ALUGUEL.maxLent }))
    const cur = loadSave(u.id) ?? fail(t('Sem galinheiro'), 409)
    const ro = cur.state.roosters.find((r) => r.id === roosterId) ?? fail(t('Galo não encontrado'))
    if (ro.rental) fail(t('Esse galo é alugado: não dá para realugar.'))
    if ((ro as { nft?: unknown }).nft) fail(t('Galo NFT não pode ser alugado.'))
    const lock = roosterLock(cur.state, ro)
    if (lock) fail(lock)
    if (cur.state.roosters.length <= 1) fail(t('Você precisa ter pelo menos um galo.'))
    if (roosterBusy(ro.id)) fail(t('{nome} está num desafio pendente.', { nome: ro.name }))
    if (countWhere("rooster_id = ? AND status IN ('ativo', 'alugado')", ro.id)) fail(t('Esse galo já está no aluguel.'))
    // Acessórios voltam para o inventário do dono; a skin fica com ele
    const accs = { ...cur.state.accessories }
    Object.values(ro.equipped).forEach((a) => a && (accs[a] = (accs[a] ?? 0) + 1))
    const clean: Rooster = { ...ro, equipped: {}, skin: undefined }
    const lid = randomUUID()
    let s: GameState = { ...cur.state, accessories: accs, roosters: cur.state.roosters.filter((r) => r.id !== ro.id) }
    s = setLent(s, { listingId: lid, roosterId: ro.id, name: ro.name, breedId: ro.breedId, level: ro.level, stars: ro.stars, status: 'anunciado' })
    s = log(s, t('🔑 Pôs {nome} para alugar: {d} dia(s) por {preco}', { nome: ro.name, d: days, preco: priceText(price, currency) }), 0, 0)
    tx(() => {
      db()
        .prepare('INSERT INTO aluguel (id, owner, rooster_id, payload, days, price, currency, share_pct, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(lid, u.id, ro.id, JSON.stringify(clean), days, price, currency, sharePct, 'ativo', now(), now() + ALUGUEL.ttlHours * HOUR)
      writeSave(u.id, s, cur.rev + 1)
    })
    return { status: 201, body: { rev: cur.rev + 1, state: s, listing: view(getRow(lid), u.id) } }
  }

  // Cancelar anúncio (só antes de alguém alugar)
  if (path === '/api/aluguel/cancel' && method === 'POST') {
    const r = getRow(String(body.id))
    if (r.owner !== u.id) fail(t('Esse anúncio não é seu'), 403)
    if (r.status === 'alugado') fail(t('Já está alugado: o galo volta no fim do prazo.'))
    if (r.status !== 'ativo') fail(t('Esse anúncio não está mais ativo.'))
    const why = returnListing(r, 'cancelado')
    if (why) fail(why)
    const cur = loadSave(u.id)!
    return { body: { rev: cur.rev, state: cur.state } }
  }

  // Alugar
  if (path === '/api/aluguel/rent' && method === 'POST') {
    const r = getRow(String(body.id))
    if (r.status !== 'ativo' || r.expires_at < now()) fail(t('Esse anúncio não está mais ativo.'), 409)
    if (r.owner === u.id) fail(t('Esse galo é seu.'))
    if (body.price !== undefined && (Number(body.price) !== r.price || body.currency !== r.currency)) fail(t('O preço mudou. Confira de novo.'), 409)
    if (countWhere("borrower = ? AND status = 'alugado'", u.id) >= ALUGUEL.maxBorrowed) fail(t('Você já tem {n} galos alugados. Espere algum voltar.', { n: ALUGUEL.maxBorrowed }))
    const me = loadSave(u.id) ?? fail(t('Sem galinheiro'), 409)
    const own = loadSave(r.owner) ?? fail(t('O dono não existe mais.'), 409)
    const ro = parse(r)
    if (me.state.roosters.length >= FEIRA.maxRoosters) fail(t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: FEIRA.maxRoosters }))
    if (me.state.roosters.some((x) => x.id === ro.id)) fail(t('Esse galo já está no galinheiro.'))
    const b0 = UNIQUE_BREEDS.has(ro.breedId) ? BREED_BY_ID[ro.breedId] : undefined
    if (b0 && me.state.roosters.some((x) => x.breedId === b0.id)) fail(t('Já tem um {nome} no galinheiro.', { nome: b0.name }))
    const isMilho = r.currency === 'milho'
    if ((isMilho ? me.state.milho : me.state.ovos) < r.price) fail(isMilho ? t('Milho insuficiente 🌽') : t('Ovos de ouro insuficientes 🥚'))
    const fee = feiraFee(r.price)
    const net = r.price - fee
    const until = now() + r.days * DAY
    const ownerName = userName(r.owner)
    const myName = userName(u.id)
    let b: GameState = { ...me.state, milho: me.state.milho - (isMilho ? r.price : 0), ovos: me.state.ovos - (isMilho ? 0 : r.price) }
    b = { ...b, roosters: [...b.roosters, { ...ro, rental: { owner: r.owner, ownerName, until, sharePct: r.share_pct, listingId: r.id } }] }
    b = log(b, t('🔑 Alugou {nome} de {dono} por {d} dia(s)', { nome: ro.name, dono: ownerName, d: r.days }), isMilho ? -r.price : 0, isMilho ? 0 : -r.price)
    let o: GameState = { ...own.state, milho: own.state.milho + (isMilho ? net : 0), ovos: own.state.ovos + (isMilho ? 0 : net) }
    o = setLent(o, { listingId: r.id, roosterId: ro.id, name: ro.name, breedId: ro.breedId, level: ro.level, stars: ro.stars, status: 'alugado', borrowerName: myName, until })
    o = log(o, t('🔑 {quem} alugou {nome}', { quem: myName, nome: ro.name }), isMilho ? net : 0, isMilho ? 0 : net)
    tx(() => {
      const up = db().prepare("UPDATE aluguel SET status = 'alugado', borrower = ?, rented_at = ?, until = ?, fee = ? WHERE id = ? AND status = 'ativo'").run(u.id, now(), until, fee, r.id)
      if (!up.changes) fail(t('Esse anúncio não está mais ativo.'), 409)
      writeSave(u.id, b, me.rev + 1)
      writeSave(r.owner, o, own.rev + 1)
      // A taxa do aluguel não some: vai para a carteira do sistema.
      if (fee > 0) creditTreasury('aluguel', isMilho ? 'milho' : 'ovo', fee, r.id, `Aluguel: ${ro.name}`)
      notify(
        r.owner,
        t('🔑 {quem} alugou {nome} até {data}! Você recebeu {liquido} (taxa da Feira: {taxa}).', { quem: myName, nome: ro.name, data: ddmm(until), liquido: priceText(net, r.currency), taxa: priceText(fee, r.currency) }),
      )
    })
    return { body: { rev: me.rev + 1, state: b } }
  }

  // Devolver antes do prazo (sem reembolso)
  if (path === '/api/aluguel/return' && method === 'POST') {
    const r = getRow(String(body.id))
    if (r.borrower !== u.id || r.status !== 'alugado') fail(t('Esse aluguel não é seu.'), 403)
    const why = endRental(r, true)
    if (why) fail(why)
    const cur = loadSave(u.id)!
    return { body: { rev: cur.rev, state: cur.state } }
  }

  return null
}

// ---------- Conta excluída / backoffice ----------

/** Chamado dentro da transação de exclusão da conta (sem BEGIN próprio). */
export function aluguelDeleteUser(userId: string) {
  schema()
  // Quem alugou saiu: o galo volta ao dono (pela foto do anúncio, se o save já foi apagado)
  const asBorrower = db().prepare("SELECT * FROM aluguel WHERE borrower = ? AND status = 'alugado'").all(userId) as unknown as Row[]
  for (const r of asBorrower) if (endRental(r, true, true)) db().prepare("UPDATE aluguel SET status = 'excluido', closed_at = ? WHERE id = ?").run(now(), r.id)
  // O dono saiu: anúncios somem e galos alugados saem de quem alugou
  const asOwner = db().prepare("SELECT * FROM aluguel WHERE owner = ? AND status IN ('ativo', 'alugado')").all(userId) as unknown as Row[]
  for (const r of asOwner) {
    if (r.status === 'alugado' && r.borrower) {
      const bor = loadSave(r.borrower)
      const there = bor?.state.roosters.find((x) => x.id === r.rooster_id)
      if (bor && there) {
        const accs = { ...bor.state.accessories }
        Object.values(there.equipped).forEach((a) => a && (accs[a] = (accs[a] ?? 0) + 1))
        writeSave(r.borrower, { ...bor.state, accessories: accs, roosters: bor.state.roosters.filter((x) => x.id !== r.rooster_id) }, bor.rev + 1)
        notify(r.borrower, t('🔑 O dono de {nome} saiu do jogo: o aluguel acabou.', { nome: there.name }))
      }
    }
    db().prepare("UPDATE aluguel SET status = 'excluido', closed_at = ? WHERE id = ?").run(now(), r.id)
  }
  // Avisos criados acima para a própria conta excluída
  db().prepare('DELETE FROM feira_notices WHERE user_id = ?').run(userId)
}

export function aluguelAdmin(): AluguelAdmin {
  schema()
  const agg = db().prepare("SELECT currency, COUNT(*) AS n, COALESCE(SUM(fee), 0) AS fee, COALESCE(SUM(price), 0) AS volume, COALESCE(SUM(share_earned), 0) AS share FROM aluguel WHERE rented_at IS NOT NULL GROUP BY currency").all() as {
    currency: Currency
    n: number
    fee: number
    volume: number
    share: number
  }[]
  const by = (c: Currency) => agg.find((a) => a.currency === c)
  return {
    active: countWhere("status = 'ativo'"),
    rented: countWhere("status = 'alugado'"),
    total: agg.reduce((a, x) => a + x.n, 0),
    feesMilho: by('milho')?.fee ?? 0,
    feesOvos: by('ovo')?.fee ?? 0,
    volumeMilho: by('milho')?.volume ?? 0,
    volumeOvos: by('ovo')?.volume ?? 0,
    shareMilho: agg.reduce((a, x) => a + x.share, 0),
  }
}
