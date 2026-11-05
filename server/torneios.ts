// 🏟️ Torneios com prêmio: o servidor agenda, inscreve (guarda uma cópia do galo), resolve a chave
// inteira com semente no horário e credita os prêmios (pagos pela casa) direto nos saves.
import { randomUUID } from 'node:crypto'
import {
  closesAt,
  doneAt,
  nextDailies,
  nextWeekly,
  opensAt,
  prizeFor,
  PRIZES,
  revealedRounds,
  runBracket,
  statusOf,
  torneioId,
  TORNEIO,
  type Bracket,
  type TorneioDetail,
  type TorneioKind,
  type TorneioNotice,
  type TorneioResult,
  type TorneioView,
} from '../src/game/torneio'
import { power, uid } from '../src/game/rooster'
import type { GameState, Rooster } from '../src/game/types'
import { t } from '../src/i18n'
import { isAdmin } from './admin'
import { getDb, type UserRow } from './db'
import { loadSave, writeSave } from './saves'
import { web3Enabled } from './web3'

export class TorneioError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const fail = (m: string, status = 400): never => {
  throw new TorneioError(status, m)
}

interface TRow {
  id: string
  kind: TorneioKind
  starts_at: number
  size: number
  seed: number
  status: 'aberto' | 'encerrado' | 'cancelado'
  bracket: string | null
  reason: string | null
  paid: number
  created_at: number
}

interface ERow {
  torneio_id: string
  user_id: string
  rooster_id: string
  rooster: string
  name: string
  power: number
  fee: number
  created_at: number
  place: number | null
  credited: number
  refunded: number
  seen: number
}

const db = () => getDb()

let ready = false
function tables() {
  if (ready) return
  db().exec(`
    CREATE TABLE IF NOT EXISTS torneios (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      size INTEGER NOT NULL DEFAULT 16,
      seed INTEGER NOT NULL,
      status TEXT NOT NULL,
      bracket TEXT,
      reason TEXT,
      paid INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS torneios_status ON torneios(status, starts_at);
    CREATE TABLE IF NOT EXISTS torneio_entries (
      torneio_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rooster_id TEXT NOT NULL,
      rooster TEXT NOT NULL,
      name TEXT NOT NULL,
      power INTEGER NOT NULL,
      fee INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      place INTEGER,
      credited INTEGER NOT NULL DEFAULT 0,
      refunded INTEGER NOT NULL DEFAULT 0,
      seen INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (torneio_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS torneio_entries_user ON torneio_entries(user_id, created_at);
    CREATE TABLE IF NOT EXISTS torneio_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      torneio_id TEXT NOT NULL,
      asset TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, torneio_id)
    );
  `)
  ready = true
}

function tx<T>(fn: () => T): T {
  const d = db()
  d.exec('BEGIN')
  try {
    const r = fn()
    d.exec('COMMIT')
    return r
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

const getT = (id: string) => db().prepare('SELECT * FROM torneios WHERE id = ?').get(id) as unknown as TRow | undefined
const entriesOf = (id: string) => db().prepare('SELECT * FROM torneio_entries WHERE torneio_id = ? AND refunded = 0 ORDER BY created_at, user_id').all(id) as unknown as ERow[]
const histEntry = (text: string, milho: number, ovo: number) => ({ id: uid(), at: Date.now(), text, milho, ovo })
const tName = (kind: TorneioKind) => (kind === 'semanal' ? t('🏆 Copa do Terreiro') : t('🏟️ Torneio Diário'))

/** Cópia do galo que vai lutar (só o que a luta e o desenho usam; nada do servidor, ex.: aluguel). */
function snapshot(r: Rooster, owner: string): Rooster {
  return {
    id: r.id,
    name: r.name,
    breedId: r.breedId,
    level: r.level,
    xp: 0,
    base: { ...r.base },
    style: r.style,
    stars: r.stars,
    wins: r.wins,
    losses: r.losses,
    kos: r.kos,
    energy: 100,
    energyAt: 0,
    equipped: { ...r.equipped },
    owner,
    lucky: 0,
    ...(r.skin ? { skin: r.skin } : {}),
    ...(r.tint ? { tint: { ...r.tint } } : {}),
  }
}

// ---------- Agenda e resolução ----------

function ensureSchedule(now = Date.now()) {
  const ins = db().prepare("INSERT OR IGNORE INTO torneios (id, kind, starts_at, size, seed, status, created_at) VALUES (?, ?, ?, 16, ?, 'aberto', ?)")
  for (const s of nextDailies(now, 2)) ins.run(torneioId('diario', s), 'diario', s, Math.floor(Math.random() * 2 ** 31), now)
  const w = nextWeekly(now)
  ins.run(torneioId('semanal', w), 'semanal', w, Math.floor(Math.random() * 2 ** 31), now)
}

/** Cancela e devolve as inscrições (milho). Só para torneio ainda não resolvido. */
function cancelT(tr: TRow, reason: string) {
  tx(() => {
    const ok = db().prepare("UPDATE torneios SET status = 'cancelado', reason = ? WHERE id = ? AND status = 'aberto'").run(reason, tr.id)
    if (!ok.changes) return
    for (const e of entriesOf(tr.id)) {
      if (e.fee > 0) {
        const save = loadSave(e.user_id)
        if (save) {
          const s = save.state
          writeSave(e.user_id, { ...s, milho: s.milho + e.fee, history: [histEntry(t('Inscrição devolvida: {torneio}', { torneio: tName(tr.kind) }), e.fee, 0), ...s.history].slice(0, 80) }, save.rev + 1)
        }
      }
      db().prepare('UPDATE torneio_entries SET refunded = 1, seen = 0 WHERE torneio_id = ? AND user_id = ?').run(tr.id, e.user_id)
    }
  })
}

/** Resolve a chave inteira de uma vez (semente guardada) e marca as colocações. */
function resolveT(tr: TRow) {
  const es = entriesOf(tr.id)
  if (es.length < 2) return cancelT(tr, t('Poucos inscritos'))
  const br = runBracket(
    es.map((e) => ({ userId: e.user_id, name: e.name, rooster: JSON.parse(e.rooster) as Rooster })),
    tr.seed,
  )
  tx(() => {
    const ok = db().prepare("UPDATE torneios SET status = 'encerrado', size = ?, bracket = ? WHERE id = ? AND status = 'aberto'").run(br.size, JSON.stringify(br), tr.id)
    if (!ok.changes) return
    const upd = db().prepare('UPDATE torneio_entries SET place = ? WHERE torneio_id = ? AND user_id = ?')
    br.slots.forEach((s, i) => s.userId && upd.run(br.places[i], tr.id, s.userId))
  })
}

/** Credita os prêmios depois do "ao vivo" (uma vez por inscrito: marca `credited`). */
function payT(tr: TRow) {
  const tokens = web3Enabled()
  tx(() => {
    const es = db().prepare('SELECT * FROM torneio_entries WHERE torneio_id = ? AND credited = 0 AND refunded = 0').all(tr.id) as unknown as ERow[]
    const mark = db().prepare('UPDATE torneio_entries SET credited = 1, seen = 0 WHERE torneio_id = ? AND user_id = ? AND credited = 0')
    for (const e of es) {
      if (!mark.run(tr.id, e.user_id).changes) continue
      const p = prizeFor(tr.kind, e.place)
      const save = loadSave(e.user_id)
      if (!save) continue
      let s: GameState = save.state
      const lugar = e.place ?? 0
      if (p) {
        const skinNew = !!p.skin && !s.skins.includes(p.skin)
        // Já tem a skin exclusiva? Vira ovos extras.
        const extraOvos = p.skin && !skinNew ? 40 : 0
        s = {
          ...s,
          milho: s.milho + p.milho,
          ovos: s.ovos + p.ovos + extraOvos,
          skins: skinNew ? [...s.skins, p.skin!] : s.skins,
          trophies: lugar <= 4 ? [{ id: tr.id, kind: tr.kind, place: lugar, at: Date.now() }, ...(s.trophies ?? [])].slice(0, 100) : s.trophies,
          achievements: lugar === 1 && !s.achievements.includes('campeao-terreiro') ? [...s.achievements, 'campeao-terreiro'] : s.achievements,
          stats: { ...s.stats, milhoEarned: s.stats.milhoEarned + p.milho },
          history: [histEntry(t('Prêmio de torneio: {torneio} ({lugar}º lugar)', { torneio: tName(tr.kind), lugar }), p.milho, p.ovos + extraOvos), ...s.history].slice(0, 80),
        }
        writeSave(e.user_id, s, save.rev + 1)
        if (tokens && p.token > 0) {
          db().prepare("INSERT OR IGNORE INTO torneio_tokens (id, user_id, torneio_id, asset, amount, status, created_at) VALUES (?, ?, ?, 'egg', ?, 'bloqueado', ?)").run(randomUUID(), e.user_id, tr.id, p.token, Date.now())
        }
      }
    }
    db().prepare('UPDATE torneios SET paid = 1 WHERE id = ?').run(tr.id)
  })
}

export function tickTorneios(now = Date.now()) {
  tables()
  const due = db().prepare("SELECT * FROM torneios WHERE status = 'aberto' AND starts_at <= ?").all(now) as unknown as TRow[]
  for (const tr of due) resolveT(tr)
  const toPay = db().prepare("SELECT * FROM torneios WHERE status = 'encerrado' AND paid = 0").all() as unknown as TRow[]
  for (const tr of toPay) if (now >= doneAt(tr.starts_at, tr.size)) payT(tr)
  ensureSchedule(now)
}

// Relógio próprio (igual às apostas): resolve no horário mesmo sem ninguém online.
const timers = globalThis as unknown as { __torneioTimer?: ReturnType<typeof setInterval> }
if (timers.__torneioTimer) clearInterval(timers.__torneioTimer)
timers.__torneioTimer = setInterval(() => {
  try {
    tickTorneios()
  } catch (e) {
    console.error('[torneios]', e)
  }
}, 15_000)
timers.__torneioTimer.unref?.()

// ---------- Visões ----------

function view(tr: TRow, me: string | null, now = Date.now()): TorneioView {
  const n = (db().prepare('SELECT COUNT(*) AS n FROM torneio_entries WHERE torneio_id = ? AND refunded = 0').get(tr.id) as { n: number }).n
  const e = me ? (db().prepare('SELECT * FROM torneio_entries WHERE torneio_id = ? AND user_id = ?').get(tr.id, me) as unknown as ERow | undefined) : undefined
  const status = statusOf({ kind: tr.kind, startsAt: tr.starts_at, size: tr.size, resolved: tr.status === 'encerrado', cancelled: tr.status === 'cancelado' }, now)
  let champion: TorneioView['champion'] = null
  if (status === 'encerrado' && tr.bracket) {
    const br = JSON.parse(tr.bracket) as Bracket
    const i = br.places.indexOf(1)
    if (i >= 0) champion = { name: br.slots[i].name, rooster: br.slots[i].rooster, bot: br.slots[i].bot }
  }
  return {
    id: tr.id,
    kind: tr.kind,
    startsAt: tr.starts_at,
    opensAt: opensAt(tr.kind, tr.starts_at),
    closesAt: closesAt(tr.starts_at),
    doneAt: doneAt(tr.starts_at, tr.size),
    status,
    entrants: n,
    fee: tr.kind === 'semanal' ? TORNEIO.weeklyFee : 0,
    size: tr.size,
    // Colocação só depois do "ao vivo" (não estraga a surpresa)
    mine: e && !e.refunded ? { roosterId: e.rooster_id, rooster: JSON.parse(e.rooster), place: status === 'encerrado' ? e.place : null } : null,
    champion,
  }
}

function detail(tr: TRow, me: string, now = Date.now()): TorneioDetail {
  const v = view(tr, me, now)
  const es = entriesOf(tr.id)
  const avatars = new Map<string, string>()
  for (const e of es) avatars.set(e.user_id, loadSave(e.user_id)?.state.player.avatar ?? '🧑‍🌾')
  let bracket: TorneioDetail['bracket'] = null
  if (tr.status === 'encerrado' && tr.bracket && now >= tr.starts_at) {
    const br = JSON.parse(tr.bracket) as Bracket
    const rev = revealedRounds(tr.starts_at, br.size, now)
    bracket = {
      revealed: rev,
      slots: br.slots.map((s) => ({ name: s.name, rooster: s.rooster, bot: s.bot, power: s.power, ...(s.userId === me ? { mine: true } : {}) })),
      rounds: br.rounds.slice(0, Math.min(br.rounds.length, rev + 1)).map((ms, ri) => (ri < rev ? ms.map((m) => ({ ...m })) : ms.map((m) => ({ a: m.a, b: m.b })))),
    }
  }
  return { ...v, list: es.map((e) => ({ name: e.name, avatar: avatars.get(e.user_id), rooster: JSON.parse(e.rooster), ...(e.user_id === me ? { mine: true } : {}) })), bracket }
}

// ---------- Rotas ----------

export function handleTorneios(path: string, method: string, body: Record<string, unknown>, u: UserRow): { status?: number; body: unknown } | null {
  if (!path.startsWith('/api/torneios')) return null
  tickTorneios()
  const now = Date.now()

  // Próximos, ao vivo e os últimos encerrados
  if (path === '/api/torneios' && method === 'GET') {
    const upcoming = db().prepare("SELECT * FROM torneios WHERE status != 'cancelado' AND starts_at >= ? ORDER BY starts_at").all(now - 40 * 60_000) as unknown as TRow[]
    const recent = db().prepare('SELECT * FROM torneios WHERE starts_at < ? ORDER BY starts_at DESC LIMIT 12').all(now) as unknown as TRow[]
    const live = upcoming.map((r) => view(r, u.id, now)).filter((v) => v.status !== 'encerrado')
    const ids = new Set(live.map((v) => v.id))
    return { body: { now, prizes: PRIZES, fee: TORNEIO.weeklyFee, list: live, recent: recent.filter((r) => !ids.has(r.id)).map((r) => view(r, u.id, now)) } }
  }

  // Meus resultados
  if (path === '/api/torneios/mine' && method === 'GET') {
    const rows = db()
      .prepare('SELECT e.*, t.kind, t.starts_at, t.status AS tstatus, t.size FROM torneio_entries e JOIN torneios t ON t.id = e.torneio_id WHERE e.user_id = ? ORDER BY t.starts_at DESC LIMIT 40')
      .all(u.id) as unknown as (ERow & { kind: TorneioKind; starts_at: number; tstatus: TRow['status']; size: number })[]
    const out: TorneioResult[] = rows.map((r) => {
      const status = statusOf({ kind: r.kind, startsAt: r.starts_at, size: r.size, resolved: r.tstatus === 'encerrado', cancelled: r.tstatus === 'cancelado' }, now)
      const place = status === 'encerrado' ? r.place : null
      const p = prizeFor(r.kind, place)
      return { id: r.torneio_id, kind: r.kind, startsAt: r.starts_at, status, roosterName: (JSON.parse(r.rooster) as Rooster).name, place, ovos: p?.ovos ?? 0, milho: p?.milho ?? 0, fee: r.fee, refunded: !!r.refunded }
    })
    return { body: { results: out } }
  }

  // Avisos novos (prêmio creditado ou torneio cancelado); marca como vistos
  if (path === '/api/torneios/notices' && method === 'GET') {
    const rows = db()
      .prepare('SELECT e.*, t.kind FROM torneio_entries e JOIN torneios t ON t.id = e.torneio_id WHERE e.user_id = ? AND e.seen = 0 LIMIT 10')
      .all(u.id) as unknown as (ERow & { kind: TorneioKind })[]
    db().prepare('UPDATE torneio_entries SET seen = 1 WHERE user_id = ? AND seen = 0').run(u.id)
    const out: TorneioNotice[] = rows.map((r) => {
      const p = r.refunded ? null : prizeFor(r.kind, r.place)
      return { id: r.torneio_id, kind: r.kind, place: r.refunded ? null : r.place, ovos: p?.ovos ?? 0, milho: p?.milho ?? 0, ...(p?.skin ? { skin: p.skin } : {}), ...(r.refunded ? { cancelled: true } : {}) }
    })
    return { body: { notices: out } }
  }

  // Prêmios em token (EGG) presos na conta
  if (path === '/api/torneios/tokens' && method === 'GET') {
    const rows = db().prepare('SELECT torneio_id, asset, amount, status, created_at FROM torneio_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(u.id) as { torneio_id: string; asset: string; amount: number; status: string; created_at: number }[]
    const total = (db().prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM torneio_tokens WHERE user_id = ?').get(u.id) as { s: number }).s
    return { body: { enabled: web3Enabled(), total, list: rows } }
  }

  // Inscrever (ou trocar o galo inscrito)
  if (path === '/api/torneios/register' && method === 'POST') {
    const tr = getT(String(body.id)) ?? fail(t('Torneio não encontrado'), 404)
    const st = statusOf({ kind: tr.kind, startsAt: tr.starts_at, size: tr.size, resolved: tr.status === 'encerrado', cancelled: tr.status === 'cancelado' }, now)
    if (tr.status !== 'aberto' || st !== 'inscricoes') fail(st === 'em_breve' ? t('As inscrições ainda não abriram.') : t('As inscrições estão fechadas.'))
    const save = loadSave(u.id) ?? fail(t('Sem galinheiro'), 409)
    const ro = save.state.roosters.find((r) => r.id === String(body.roosterId)) ?? fail(t('Galo não encontrado'))
    const owner = save.state.player.name || u.name
    const snap = snapshot(ro, owner)
    const prev = db().prepare('SELECT * FROM torneio_entries WHERE torneio_id = ? AND user_id = ?').get(tr.id, u.id) as unknown as ERow | undefined
    if (prev && !prev.refunded) {
      db().prepare('UPDATE torneio_entries SET rooster_id = ?, rooster = ?, name = ?, power = ? WHERE torneio_id = ? AND user_id = ?').run(ro.id, JSON.stringify(snap), owner, power(snap), tr.id, u.id)
      return { body: { ok: true, changed: true } }
    }
    const n = (db().prepare('SELECT COUNT(*) AS n FROM torneio_entries WHERE torneio_id = ? AND refunded = 0').get(tr.id) as { n: number }).n
    if (n >= TORNEIO.maxSlots) fail(t('Chave lotada! Tente o próximo torneio.'))
    const fee = tr.kind === 'semanal' ? TORNEIO.weeklyFee : 0
    if (fee > save.state.milho) fail(t('Milho insuficiente para a inscrição.'))
    const rev = tx(() => {
      db().prepare('DELETE FROM torneio_entries WHERE torneio_id = ? AND user_id = ?').run(tr.id, u.id)
      db()
        .prepare('INSERT INTO torneio_entries (torneio_id, user_id, rooster_id, rooster, name, power, fee, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(tr.id, u.id, ro.id, JSON.stringify(snap), owner, power(snap), fee, now)
      if (!fee) return null
      const s = save.state
      writeSave(u.id, { ...s, milho: s.milho - fee, history: [histEntry(t('Inscrição: {torneio}', { torneio: tName(tr.kind) }), -fee, 0), ...s.history].slice(0, 80) }, save.rev + 1)
      return save.rev + 1
    })
    return { status: 201, body: { ok: true, rev } }
  }

  // Desistir (antes de fechar): devolve a inscrição
  if (path === '/api/torneios/withdraw' && method === 'POST') {
    const tr = getT(String(body.id)) ?? fail(t('Torneio não encontrado'), 404)
    if (tr.status !== 'aberto' || now >= closesAt(tr.starts_at)) fail(t('As inscrições estão fechadas.'))
    const e = (db().prepare('SELECT * FROM torneio_entries WHERE torneio_id = ? AND user_id = ? AND refunded = 0').get(tr.id, u.id) as unknown as ERow | undefined) ?? fail(t('Você não está inscrito.'))
    tx(() => {
      db().prepare('DELETE FROM torneio_entries WHERE torneio_id = ? AND user_id = ?').run(tr.id, u.id)
      if (e.fee > 0) {
        const save = loadSave(u.id)
        if (save) writeSave(u.id, { ...save.state, milho: save.state.milho + e.fee, history: [histEntry(t('Inscrição devolvida: {torneio}', { torneio: tName(tr.kind) }), e.fee, 0), ...save.state.history].slice(0, 80) }, save.rev + 1)
      }
    })
    return { body: { ok: true } }
  }

  // ----- Admin -----
  if (path.startsWith('/api/torneios/admin')) {
    if (!isAdmin(u)) fail(t('Acesso só para administradores'), 403)
    if (path === '/api/torneios/admin' && method === 'GET') {
      const rows = db().prepare('SELECT * FROM torneios ORDER BY starts_at DESC LIMIT 60').all() as unknown as TRow[]
      const list = rows.map((r) => {
        const v = view(r, null, now)
        const es = db().prepare('SELECT place, fee, refunded, credited FROM torneio_entries WHERE torneio_id = ?').all(r.id) as { place: number | null; fee: number; refunded: number; credited: number }[]
        let ovos = 0
        let milho = 0
        for (const e of es) {
          const p = e.credited && !e.refunded ? prizeFor(r.kind, e.place) : null
          ovos += p?.ovos ?? 0
          milho += p?.milho ?? 0
        }
        const fees = es.filter((e) => !e.refunded).reduce((a, e) => a + e.fee, 0)
        const tokens = (db().prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM torneio_tokens WHERE torneio_id = ?').get(r.id) as { s: number }).s
        return { id: r.id, kind: r.kind, startsAt: r.starts_at, status: v.status, entrants: v.entrants, size: r.size, champion: r.bracket ? (() => { const br = JSON.parse(r.bracket!) as Bracket; const i = br.places.indexOf(1); return i >= 0 ? `${br.slots[i].name} · ${br.slots[i].rooster.name}${br.slots[i].bot ? ' 🤖' : ''}` : null })() : null, reason: r.reason, ovos, milho, fees, tokens }
      })
      const sum = (k: 'ovos' | 'milho' | 'fees' | 'tokens') => list.reduce((a, x) => a + x[k], 0)
      return { body: { list, totals: { ovos: sum('ovos'), milho: sum('milho'), fees: sum('fees'), tokens: sum('tokens') } } }
    }
    const tr = method === 'POST' ? (getT(String(body.id)) ?? fail(t('Torneio não encontrado'), 404)) : null
    const audit = (action: string) => db().prepare('INSERT INTO admin_log (at, admin_email, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(Date.now(), u.email, action, null, JSON.stringify({ torneio: tr!.id }))
    if (path === '/api/torneios/admin/cancel' && method === 'POST') {
      if (tr!.status !== 'aberto') fail(t('Só dá para cancelar torneio que ainda não começou.'))
      cancelT(tr!, t('Cancelado pela administração'))
      audit('torneio_cancelar')
      return { body: { ok: true } }
    }
    // Começa agora (teste/QA). `skipLive` pula o "ao vivo" e já paga.
    if (path === '/api/torneios/admin/start' && method === 'POST') {
      if (tr!.status !== 'aberto') fail(t('Esse torneio já foi resolvido.'))
      const at = body.skipLive === true ? now - 6 * TORNEIO.roundMs : now
      db().prepare('UPDATE torneios SET starts_at = ? WHERE id = ?').run(at, tr!.id)
      audit('torneio_iniciar')
      tickTorneios()
      return { body: { ok: true } }
    }
  }

  // Detalhe (chave, inscritos)
  const m = path.match(/^\/api\/torneios\/([\w-]{1,40})$/)
  if (m && method === 'GET') {
    const tr = getT(m[1]) ?? fail(t('Torneio não encontrado'), 404)
    return { body: { now, torneio: detail(tr, u.id, now) } }
  }

  return null
}

/** Exclusão de conta: some com as inscrições abertas (o histórico resolvido fica anônimo na chave). */
export function torneioDeleteUser(userId: string) {
  tables()
  db().prepare('DELETE FROM torneio_entries WHERE user_id = ?').run(userId)
  db().prepare('DELETE FROM torneio_tokens WHERE user_id = ?').run(userId)
}
