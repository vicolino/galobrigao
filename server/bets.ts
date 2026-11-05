// Agenda de lutas da casa: o servidor cria as lutas com data e hora, fecha as apostas,
// resolve cada luta no horário e paga quem acertou. Igual para todos os jogadores.
import { randomUUID } from 'node:crypto'
import { simulate } from '../src/game/battle'
import { applyBetCredit, applyBetPlaced, betCloseMs, betInterval, eventName, liveMs, phaseOf, pickLabel, type BetCredit, type BetView, type ScheduledFight } from '../src/game/bets'
import { live } from '../src/game/config'
import { electionFight, houseFight } from '../src/game/engine'
import type { BetPick, GameState, Rooster } from '../src/game/types'
import { getDb } from './db'
import { loadSave, writeSave } from './saves'
import { locale, t } from '../src/i18n'

export class BetError extends Error {}
const fail = (m: string): never => {
  throw new BetError(m)
}

interface FightRow {
  id: string
  starts_at: number
  event: string
  num: number
  featured: number
  a: string
  b: string
  odds_a: number
  odds_b: number
  odds_ko: number
  seed: number
  status: 'aberta' | 'encerrada'
  winner: number | null
  method: 'ko' | 'decisao' | null
}

interface BetRow {
  id: string
  user_id: string
  fight_id: string
  pick: BetPick
  amount: number
  odds: number
  label: string
  status: 'pendente' | 'ganhou' | 'perdeu'
  payout: number
  created_at: number
  settled_at: number | null
  credited: number
}

const db = () => getDb()

/** Galo sem dados que não interessam ao público. */
const pub = (r: Rooster): Rooster => ({ ...r, lucky: 0 })

/** Cria as lutas que faltam até o fim do horizonte da agenda. */
function ensureSchedule(now = Date.now()) {
  const iv = betInterval()
  const first = Math.ceil(now / iv) * iv
  const last = now + Math.max(30, live.bets.horizonMin) * 60_000
  const have = new Set((db().prepare('SELECT starts_at FROM house_fights WHERE starts_at >= ?').all(first) as { starts_at: number }[]).map((r) => r.starts_at))
  const ins = db().prepare(
    'INSERT OR IGNORE INTO house_fights (id, starts_at, event, num, featured, a, b, odds_a, odds_b, odds_ko, seed, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (let t = first; t <= last; t += iv) {
    if (have.has(t)) continue
    // Toda hora cheia tem a luta principal (às vezes o Clássico Eleitoral)
    const principal = t % 3_600_000 === 0
    const f = principal && Math.random() < 0.4 ? electionFight() : houseFight(principal)
    const ev = eventName(t)
    // Número da luta dentro do evento (Brasília = UTC-3, sem horário de verão)
    const d = new Date(t)
    const minutesIn = (((d.getUTCHours() + 21) % 24) - ev.startHour) * 60 + d.getUTCMinutes()
    const num = Math.floor((minutesIn * 60_000) / iv) + 1
    ins.run(randomUUID(), t, ev.name, num, principal ? 1 : 0, JSON.stringify(pub(f.a)), JSON.stringify(pub(f.b)), f.oddsA, f.oddsB, f.oddsKo, f.seed, 'aberta', now)
  }
}

/** Resolve as lutas cujo horário chegou e acerta as apostas. */
function resolveDue(now = Date.now()) {
  const due = db().prepare("SELECT * FROM house_fights WHERE status = 'aberta' AND starts_at <= ?").all(now) as unknown as FightRow[]
  for (const f of due) {
    const res = simulate(JSON.parse(f.a), JSON.parse(f.b), f.seed)
    const d = db()
    d.exec('BEGIN')
    try {
      d.prepare("UPDATE house_fights SET status = 'encerrada', winner = ?, method = ? WHERE id = ? AND status = 'aberta'").run(res.winner, res.method, f.id)
      const bets = d.prepare("SELECT * FROM house_bets WHERE fight_id = ? AND status = 'pendente'").all(f.id) as unknown as BetRow[]
      const upd = d.prepare('UPDATE house_bets SET status = ?, payout = ?, settled_at = ? WHERE id = ?')
      for (const b of bets) {
        const hit = (b.pick === 'a' && res.winner === 0) || (b.pick === 'b' && res.winner === 1) || (b.pick === 'ko' && res.method === 'ko')
        upd.run(hit ? 'ganhou' : 'perdeu', hit ? Math.floor(b.amount * b.odds) : 0, now, b.id)
      }
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
  }
}

let lastCleanup = 0
function cleanup(now = Date.now()) {
  if (now - lastCleanup < 3_600_000) return
  lastCleanup = now
  db().prepare("DELETE FROM house_fights WHERE status = 'encerrada' AND starts_at < ? AND id NOT IN (SELECT fight_id FROM house_bets)").run(now - 2 * 86_400_000)
  db().prepare('DELETE FROM house_bets WHERE created_at < ? AND credited = 1').run(now - 30 * 86_400_000)
}

/** Chamado a cada poucos segundos pelo servidor. */
export function tickBets() {
  resolveDue()
  ensureSchedule()
  cleanup()
}

function view(f: FightRow, pool: Map<string, ScheduledFight['pool']>, now = Date.now()): ScheduledFight {
  const phase = phaseOf(f.starts_at, f.status === 'encerrada', now)
  const started = f.status === 'encerrada'
  return {
    id: f.id,
    startsAt: f.starts_at,
    event: f.event,
    num: f.num,
    featured: !!f.featured,
    a: JSON.parse(f.a),
    b: JSON.parse(f.b),
    oddsA: f.odds_a,
    oddsB: f.odds_b,
    oddsKo: f.odds_ko,
    phase,
    // A semente (que define o resultado) só sai depois que a luta começou
    seed: started ? f.seed : undefined,
    winner: started ? ((f.winner ?? 0) as 0 | 1) : undefined,
    method: started ? (f.method ?? undefined) : undefined,
    pool: pool.get(f.id) ?? { bets: 0, a: 0, b: 0, ko: 0 },
  }
}

const betView = (b: BetRow & { starts_at?: number; fa?: string; fb?: string }): BetView => ({
  id: b.id,
  fightId: b.fight_id,
  pick: b.pick,
  amount: b.amount,
  odds: b.odds,
  label: b.label,
  // Até o fim do "ao vivo" o resultado fica escondido para não estragar a luta
  status: b.starts_at && Date.now() < b.starts_at + liveMs() ? 'pendente' : b.status,
  payout: b.starts_at && Date.now() < b.starts_at + liveMs() ? 0 : b.payout,
  at: b.created_at,
  startsAt: b.starts_at ?? 0,
  fight: b.fa && b.fb ? `${(JSON.parse(b.fa) as Rooster).name} x ${(JSON.parse(b.fb) as Rooster).name}` : '',
})

/** Junta o resultado das apostas já reveladas (depois do "ao vivo") que ainda não foram para o save. */
export function takeCredits(userId: string, now = Date.now()): BetCredit | null {
  const rows = db()
    .prepare(
      `SELECT b.*, f.starts_at, f.a AS fa, f.b AS fb FROM house_bets b JOIN house_fights f ON f.id = b.fight_id
       WHERE b.user_id = ? AND b.credited = 0 AND b.status != 'pendente' AND f.starts_at <= ?`,
    )
    .all(userId, now - liveMs()) as unknown as (BetRow & { starts_at: number; fa: string; fb: string })[]
  if (!rows.length) return null
  const c: BetCredit = { milho: 0, ovos: 0, won: 0, biggest: 0, zebra: false, entries: [] }
  for (const r of rows) {
    const fight = betView(r).fight
    if (r.status === 'ganhou') {
      c.milho += r.payout
      c.won++
      c.biggest = Math.max(c.biggest, r.payout)
      if (r.odds >= 3) c.zebra = true
    }
    c.entries.push({ text: r.status === 'ganhou' ? t('Prêmio de aposta: {aposta} ({luta})', { aposta: r.label, luta: fight }) : t('Aposta perdida: {aposta} ({luta})', { aposta: r.label, luta: fight }), milho: r.status === 'ganhou' ? r.payout : -r.amount, won: r.status === 'ganhou' })
  }
  const mark = db().prepare('UPDATE house_bets SET credited = 1 WHERE id = ?')
  for (const r of rows) mark.run(r.id)
  return c
}

/** Aplica créditos pendentes direto no save guardado (usado ao abrir o jogo). */
export function creditSave(userId: string): { rev: number; state: GameState } | null {
  const save = loadSave(userId)
  if (!save) return null
  const c = takeCredits(userId)
  if (!c) return save
  const state = applyBetCredit(save.state, c)
  writeSave(userId, state, save.rev + 1)
  return { rev: save.rev + 1, state }
}

/** Novidades das apostas para o aviso periódico do navegador. */
export function betsNotice(userId: string) {
  const now = Date.now()
  const open = (db().prepare("SELECT COUNT(*) AS n FROM house_bets WHERE user_id = ? AND status = 'pendente'").get(userId) as { n: number }).n
  const ready = (
    db()
      .prepare(
        "SELECT COUNT(*) AS n FROM house_bets b JOIN house_fights f ON f.id = b.fight_id WHERE b.user_id = ? AND b.credited = 0 AND b.status != 'pendente' AND f.starts_at <= ?",
      )
      .get(userId, now - liveMs()) as { n: number }
  ).n
  // Luta com aposta minha acontecendo agora (para oferecer "assistir ao vivo")
  const liveRow = db()
    .prepare('SELECT DISTINCT f.id FROM house_bets b JOIN house_fights f ON f.id = b.fight_id WHERE b.user_id = ? AND f.starts_at <= ? AND f.starts_at > ? LIMIT 1')
    .get(userId, now, now - liveMs()) as { id: string } | undefined
  return { open, ready, liveFightId: liveRow?.id ?? null }
}

export function handleBets(path: string, method: string, body: Record<string, unknown>, userId: string): { status?: number; body: unknown } | null {
  if (!path.startsWith('/api/bets')) return null
  tickBets()

  if (path === '/api/bets/schedule' && method === 'GET') {
    const now = Date.now()
    const rows = db().prepare('SELECT * FROM house_fights WHERE starts_at >= ? ORDER BY starts_at').all(now - 90 * 60_000) as unknown as FightRow[]
    const pool = new Map<string, ScheduledFight['pool']>()
    const agg = db()
      .prepare(`SELECT fight_id, pick, COUNT(*) AS n, SUM(amount) AS s FROM house_bets WHERE fight_id IN (SELECT id FROM house_fights WHERE starts_at >= ?) GROUP BY fight_id, pick`)
      .all(now - 90 * 60_000) as { fight_id: string; pick: BetPick; n: number; s: number }[]
    for (const r of agg) {
      const p = pool.get(r.fight_id) ?? { bets: 0, a: 0, b: 0, ko: 0 }
      p.bets += r.n
      p[r.pick] += r.s
      pool.set(r.fight_id, p)
    }
    const mine = db()
      .prepare('SELECT b.*, f.starts_at, f.a AS fa, f.b AS fb FROM house_bets b JOIN house_fights f ON f.id = b.fight_id WHERE b.user_id = ? AND f.starts_at >= ?')
      .all(userId, now - 90 * 60_000) as unknown as (BetRow & { starts_at: number; fa: string; fb: string })[]
    return { body: { now, closeMs: betCloseMs(), liveMs: liveMs(), fights: rows.map((f) => view(f, pool, now)), mine: mine.map(betView) } }
  }

  if (path === '/api/bets/mine' && method === 'GET') {
    const rows = db()
      .prepare('SELECT b.*, f.starts_at, f.a AS fa, f.b AS fb FROM house_bets b JOIN house_fights f ON f.id = b.fight_id WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 100')
      .all(userId) as unknown as (BetRow & { starts_at: number; fa: string; fb: string })[]
    return { body: { bets: rows.map(betView) } }
  }

  if (path === '/api/bets' && method === 'POST') {
    const f = db().prepare('SELECT * FROM house_fights WHERE id = ?').get(String(body.fightId)) as unknown as FightRow | undefined
    if (!f) fail(t('Luta não encontrada'))
    if (f!.status !== 'aberta' || Date.now() >= f!.starts_at - betCloseMs()) fail(t('As apostas para essa luta já fecharam.'))
    const pick = String(body.pick) as BetPick
    if (!['a', 'b', 'ko'].includes(pick)) fail(t('Escolha inválida'))
    const amount = Math.floor(Number(body.amount))
    if (!Number.isFinite(amount) || amount < live.bets.minBet) fail(t('Aposta mínima: {n} de milho.', { n: live.bets.minBet }))
    if (amount > live.bets.maxBet) fail(t('Aposta máxima: {n} de milho.', { n: live.bets.maxBet.toLocaleString(locale()) }))
    const save = loadSave(userId) ?? fail(t('Sem galinheiro'))
    let state = save!.state
    const c = takeCredits(userId)
    if (c) state = applyBetCredit(state, c)
    if (state.milho < amount) fail(t('Milho insuficiente 🌽'))
    const a = JSON.parse(f!.a) as Rooster
    const b = JSON.parse(f!.b) as Rooster
    const odds = pick === 'a' ? f!.odds_a : pick === 'b' ? f!.odds_b : f!.odds_ko
    const label = pickLabel(pick, a.name, b.name)
    state = applyBetPlaced(state, amount, label, odds)
    const d = db()
    d.exec('BEGIN')
    try {
      writeSave(userId, state, save!.rev + 1)
      d.prepare("INSERT INTO house_bets (id, user_id, fight_id, pick, amount, odds, label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?)").run(
        randomUUID(),
        userId,
        f!.id,
        pick,
        amount,
        odds,
        label,
        Date.now(),
      )
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    return { status: 201, body: { rev: save!.rev + 1, state, credit: c } }
  }

  return null
}

/**
 * Uma vez: devolve o milho das apostas antigas (feitas no navegador) que ficaram pendentes
 * e limpa o card antigo. Depois disso tudo passa pela agenda do servidor.
 */
export function migrateOldBets() {
  const rows = db().prepare('SELECT user_id, rev, data FROM saves').all() as { user_id: string; rev: number; data: string }[]
  let n = 0
  for (const r of rows) {
    const s = JSON.parse(r.data) as GameState
    const pending = (s.bets ?? []).filter((b) => b.status === 'pendente')
    if (!pending.length && !(s.card?.fights?.length)) continue
    const refund = pending.reduce((a, b) => a + b.amount, 0)
    const next: GameState = {
      ...s,
      milho: s.milho + refund,
      bets: (s.bets ?? []).filter((b) => b.status !== 'pendente'),
      card: { at: Date.now(), fights: [] },
      history: refund ? [{ id: randomUUID(), at: Date.now(), text: t('Apostas antigas devolvidas (nova agenda de lutas)'), milho: refund, ovo: 0 }, ...s.history].slice(0, 80) : s.history,
    }
    writeSave(r.user_id, next, r.rev + 1)
    n++
  }
  if (n) console.log(`[apostas] ${n} save(s) migrados para a agenda de lutas`)
}

