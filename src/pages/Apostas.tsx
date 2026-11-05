import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, RarityTag, StyleTag, Tabs, go } from '../components/ui'
import { HOUSE_EDGE } from '../game/battle'
import type { BetView, FightPhase, ScheduledFight } from '../game/bets'
import { live } from '../game/config'
import { BREED_BY_ID } from '../game/data'
import { fmt, power } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { BetPick, Rooster } from '../game/types'

const hhmm = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (t: number) => {
  const d = new Date(t)
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}
function countdown(ms: number) {
  if (ms <= 0) return '0:00'
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Resultado da aposta calculado a partir do resultado da luta (para mostrar ao assistir). */
function settle(b: BetView, f: ScheduledFight): BetView {
  if (f.winner === undefined) return b
  const hit = (b.pick === 'a' && f.winner === 0) || (b.pick === 'b' && f.winner === 1) || (b.pick === 'ko' && f.method === 'ko')
  return { ...b, status: hit ? 'ganhou' : 'perdeu', payout: hit ? Math.floor(b.amount * b.odds) : 0 }
}

export function Apostas() {
  const { state, actions, toast } = useGame()
  const s = state!
  const [tab, setTab] = useState<'agenda' | 'resultados' | 'minhas'>('agenda')
  const [fights, setFights] = useState<ScheduledFight[]>([])
  const [mineHere, setMineHere] = useState<BetView[]>([])
  const [history, setHistory] = useState<BetView[]>([])
  const [offset, setOffset] = useState(0) // diferença entre o relógio do servidor e o do aparelho
  const [loading, setLoading] = useState(true)
  const [slip, setSlip] = useState<{ fight: ScheduledFight; pick: BetPick } | null>(null)
  const [amount, setAmount] = useState(100)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState(false)
  const [, setTick] = useState(0)
  const now = Date.now() + offset

  const load = useCallback(async () => {
    try {
      const r = await api.betsSchedule()
      setOffset(r.now - Date.now())
      setFights(r.fights)
      setMineHere(r.mine)
    } catch {
      /* tenta de novo */
    } finally {
      setLoading(false)
    }
  }, [])
  const loadHistory = useCallback(() => api.betsMine().then((r) => setHistory(r.bets)).catch(() => null), [])

  // Agenda atualiza a cada 10 s; o relógio da tela a cada 1 s
  useEffect(() => {
    void load()
    void loadHistory()
    const a = setInterval(load, 10_000)
    const b = setInterval(() => setTick((t) => t + 1), 1000)
    const c = setInterval(loadHistory, 30_000)
    return () => {
      clearInterval(a)
      clearInterval(b)
      clearInterval(c)
    }
  }, [load, loadHistory])

  // Chegou a hora de uma luta e ainda não temos o resultado: busca na hora (sem esperar os 10 s)
  const due = fights.some((f) => f.seed === undefined && now >= f.startsAt + 800)
  useEffect(() => {
    if (!due) return
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [due, Math.floor(now / 2000)]) // eslint-disable-line react-hooks/exhaustive-deps

  const phase = (f: ScheduledFight): FightPhase => {
    if (now < f.startsAt - live.bets.closeSec * 1000) return 'aberta'
    if (f.seed === undefined || now < f.startsAt) return 'fechada'
    if (now < f.startsAt + live.bets.liveSec * 1000) return 'aovivo'
    return 'encerrada'
  }
  const betsOn = (id: string) => mineHere.filter((b) => b.fightId === id)

  const upcoming = fights.filter((f) => phase(f) === 'aberta' || phase(f) === 'fechada')
  const liveNow = fights.filter((f) => phase(f) === 'aovivo')
  const done = fights.filter((f) => phase(f) === 'encerrada').reverse()
  const next = upcoming[0]
  const myLive = liveNow.find((f) => betsOn(f.id).length) ?? liveNow[0]

  // Agrupa a agenda por dia + evento
  const groups = useMemo(() => {
    const out: { key: string; title: string; list: ScheduledFight[] }[] = []
    for (const f of upcoming) {
      const key = `${dayLabel(f.startsAt)} · ${f.event}`
      const g = out.find((x) => x.key === key)
      if (g) g.list.push(f)
      else out.push({ key, title: key, list: [f] })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fights, Math.floor(now / 5000)])

  const settled = history.filter((b) => b.status !== 'pendente')
  const staked = settled.reduce((a, b) => a + b.amount, 0)
  const returned = settled.reduce((a, b) => a + b.payout, 0)

  const odds = slip ? (slip.pick === 'a' ? slip.fight.oddsA : slip.pick === 'b' ? slip.fight.oddsB : slip.fight.oddsKo) : 0
  const maxBet = Math.min(live.bets.maxBet, Math.floor(s.milho))

  const place = async () => {
    if (!slip) return
    setBusy(true)
    const r = await actions.placeBet(slip.fight.id, slip.pick, amount)
    setBusy(false)
    if (r.ok) {
      toast(`Aposta feita! Luta às ${hhmm(slip.fight.startsAt)}. Retorno possível: 🌽 ${fmt(amount * odds)}`, 'ok')
      setSlip(null)
      void load()
      void loadHistory()
    } else toast(r.error, 'erro')
  }

  const watch = (f: ScheduledFight) => {
    actions.watchHouse(f, betsOn(f.id).map((b) => settle(b, f)))
    sfx.bell()
    go('/luta')
  }

  const openSlip = (f: ScheduledFight, pick: BetPick) => {
    if (phase(f) !== 'aberta') return
    sfx.click()
    setAmount(Math.max(live.bets.minBet, Math.min(amount, maxBet || live.bets.minBet)))
    setSlip({ fight: f, pick })
  }

  return (
    <>
      <PageHead
        title="🎲 Apostas"
        subtitle={`Lutas da casa o dia todo, uma a cada ${live.bets.intervalMin} minutos. Aposte e pode sair: o prêmio cai sozinho no seu milho.`}
        right={
          <button className="btn btn-sm btn-ghost" onClick={() => setInfo(true)}>
            ℹ️ Como funciona
          </button>
        }
      />

      {myLive && (
        <div className="card live-banner">
          <span className="live-dot">AO VIVO</span>
          <div className="grow">
            <b>
              {myLive.a.name} x {myLive.b.name}
            </b>
            <div className="tiny muted">
              {myLive.event} · Luta {myLive.num}
              {betsOn(myLive.id).length > 0 && ` · você apostou 🌽 ${fmt(betsOn(myLive.id).reduce((a, b) => a + b.amount, 0))}`}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => watch(myLive)}>
            ▶ Assistir
          </button>
        </div>
      )}

      {next && (
        <div className="card next-fight">
          <div className="nf-time">
            <span className="tiny muted">Próxima luta</span>
            <b>{countdown(next.startsAt - now)}</b>
            <span className="tiny">
              {phase(next) === 'aberta' ? `apostas fecham em ${countdown(next.startsAt - live.bets.closeSec * 1000 - now)}` : '🔒 apostas fechadas'}
            </span>
          </div>
          <div className="nf-vs">
            <RoosterSvg breedId={next.a.breedId} skin={next.a.skin} equipped={next.a.equipped} size={70} anim="idle" />
            <span className="vs">VS</span>
            <RoosterSvg breedId={next.b.breedId} skin={next.b.skin} equipped={next.b.equipped} size={70} flip anim="idle" />
          </div>
          <div className="nf-info">
            <b>
              {next.a.name} x {next.b.name}
            </b>
            <span className="tiny muted">
              {hhmm(next.startsAt)} · {next.event} · Luta {next.num}
            </span>
          </div>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span>Apostas feitas</span>
          <b>{s.stats.betsPlaced}</b>
        </div>
        <div className="kpi">
          <span>Acertos</span>
          <b>{settled.length ? Math.round((settled.filter((b) => b.status === 'ganhou').length / settled.length) * 100) : 0}%</b>
        </div>
        <div className="kpi">
          <span title="Quanto você ganhou em prêmios menos quanto apostou. Não é o seu milho.">Lucro nas apostas</span>
          <b className={returned - staked >= 0 ? 'pos' : 'neg'}>
            {returned - staked >= 0 ? '+' : '−'}🌽 {fmt(Math.abs(returned - staked))}
          </b>
          <small className="tiny muted">prêmios − apostado · seu milho: 🌽 {fmt(s.milho)}</small>
        </div>
        <div className="kpi">
          <span>Maior prêmio</span>
          <b>🌽 {fmt(s.stats.biggestWin)}</b>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v)
          if (v === 'minhas') void loadHistory()
        }}
        tabs={[
          { id: 'agenda' as const, label: `📅 Agenda (${upcoming.length})` },
          { id: 'resultados' as const, label: '🏁 Resultados' },
          { id: 'minhas' as const, label: '🧾 Minhas apostas' },
        ]}
      />

      {tab === 'agenda' &&
        (loading && !fights.length ? (
          <p className="muted">
            <span className="spinner" /> Carregando a agenda...
          </p>
        ) : upcoming.length === 0 ? (
          <Empty emoji="📅" title="Agenda vazia" text="As próximas lutas aparecem em instantes." />
        ) : (
          groups.map((g) => (
            <section key={g.key}>
              <h2 className="section-title">{g.title}</h2>
              <div className="fight-list">
                {g.list.map((f) => (
                  <FightCard key={f.id} f={f} phase={phase(f)} now={now} myBets={betsOn(f.id)} onPick={openSlip} />
                ))}
              </div>
            </section>
          ))
        ))}

      {tab === 'resultados' &&
        (liveNow.length + done.length === 0 ? (
          <Empty emoji="🏁" title="Nenhum resultado ainda" text="Assim que as primeiras lutas da agenda acontecerem, os resultados aparecem aqui." />
        ) : (
          <div className="fight-list">
            {[...liveNow, ...done].map((f) => (
              <FightCard key={f.id} f={f} phase={phase(f)} now={now} myBets={betsOn(f.id).map((b) => (phase(f) === 'encerrada' ? settle(b, f) : b))} onWatch={watch} />
            ))}
          </div>
        ))}

      {tab === 'minhas' &&
        (history.length === 0 ? (
          <Empty emoji="🎟️" title="Nenhuma aposta ainda" text="Escolha uma luta da agenda e toque numa odd para apostar." />
        ) : (
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Palpite</th>
                  <th className="hide-m">Odd</th>
                  <th>Valor</th>
                  <th>Retorno</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td className="tiny">
                      {dayLabel(b.startsAt)} {hhmm(b.startsAt)}
                    </td>
                    <td>
                      {b.label}
                      <div className="tiny muted">{b.fight}</div>
                    </td>
                    <td className="hide-m">{b.odds.toFixed(2)}</td>
                    <td>🌽 {fmt(b.amount)}</td>
                    <td>{b.status === 'pendente' ? `🌽 ${fmt(b.amount * b.odds)}` : b.payout ? `🌽 ${fmt(b.payout)}` : '—'}</td>
                    <td>
                      <span className={`status status-${b.status}`}>{b.status === 'pendente' ? '⏳ Aguardando' : b.status === 'ganhou' ? '✅ Ganhou' : '❌ Perdeu'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Modal open={!!slip} onClose={() => setSlip(null)} title="🧾 Cupom de aposta">
        {slip && (
          <div className="slip">
            <div className="slip-fight">
              {slip.fight.a.name} <span className="muted">x</span> {slip.fight.b.name}
              <div className="tiny muted">
                {dayLabel(slip.fight.startsAt)} às {hhmm(slip.fight.startsAt)} · {slip.fight.event} · Luta {slip.fight.num}
              </div>
            </div>
            <div className="slip-pick">
              <span>
                Palpite: <b>{slip.pick === 'a' ? `${slip.fight.a.name} vence` : slip.pick === 'b' ? `${slip.fight.b.name} vence` : 'Termina em K.O.'}</b>
              </span>
              <span className="odd-big">{odds.toFixed(2)}</span>
            </div>
            <label className="field">
              <span>Valor (🌽 milho)</span>
              <input type="number" min={live.bets.minBet} max={maxBet} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <div className="chips">
              {[50, 100, 500, 1000, 5000].map((v) => (
                <button key={v} className="chip clickable" onClick={() => setAmount(v)}>
                  {fmt(v)}
                </button>
              ))}
              <button className="chip clickable" onClick={() => setAmount(maxBet)}>
                Máx
              </button>
            </div>
            <div className="slip-return">
              Retorno possível: <b>🌽 {fmt(amount * odds)}</b>
            </div>
            <p className="tiny muted center">
              Apostas fecham em {countdown(slip.fight.startsAt - live.bets.closeSec * 1000 - now)}. O resultado sai às {hhmm(slip.fight.startsAt)} e o prêmio entra sozinho.
            </p>
            <button className="btn btn-primary full btn-lg" onClick={place} disabled={busy || amount < live.bets.minBet || amount > s.milho || phase(slip.fight) !== 'aberta'}>
              {busy ? <span className="spinner" /> : '🎲 Confirmar aposta'}
            </button>
            <p className="tiny muted center">Moeda virtual do jogo. Não há dinheiro real envolvido.</p>
          </div>
        )}
      </Modal>

      <Modal open={info} onClose={() => setInfo(false)} title="ℹ️ Como funcionam as apostas">
        <ul className="info-list">
          <li>
            A casa tem uma <b>agenda de lutas o dia todo</b>: uma a cada {live.bets.intervalMin} minutos, iguais para todos os jogadores. Toda hora cheia tem a <b>luta principal</b>.
          </li>
          <li>As apostas fecham {live.bets.closeSec} segundos antes de cada luta. Na hora marcada a luta acontece sozinha, mesmo que você esteja fora do jogo.</li>
          <li>Durante a luta ela fica <b>AO VIVO</b> e você pode assistir. Depois o prêmio entra automaticamente no seu milho.</li>
          <li>Cada luta é simulada centenas de vezes para calcular a chance de cada galo. As odds incluem uma margem da casa de {Math.round(HOUSE_EDGE * 100)}%.</li>
          <li>
            <b>💥 K.O.</b> paga se a luta terminar em nocaute, não importa quem vença.
          </li>
          <li>
            Aposta mínima 🌽 {fmt(live.bets.minBet)}, máxima 🌽 {fmt(live.bets.maxBet)}.
          </li>
          <li>Tudo usa moeda virtual. Milho e ovos não podem ser trocados por dinheiro.</li>
        </ul>
      </Modal>
    </>
  )
}

function FightCard({
  f,
  phase,
  now,
  myBets,
  onPick,
  onWatch,
}: {
  f: ScheduledFight
  phase: FightPhase
  now: number
  myBets: BetView[]
  onPick?: (f: ScheduledFight, pick: BetPick) => void
  onWatch?: (f: ScheduledFight) => void
}) {
  const closed = phase === 'encerrada'
  const open = phase === 'aberta'
  const winner = closed ? f.winner : undefined
  const election = f.a.owner === 'Edição Eleições'
  return (
    <div className={`card fight-row ${closed ? 'closed' : ''} ${f.featured ? 'featured' : ''}`}>
      {f.featured && <div className="featured-tag">{election ? '🗳️ Clássico Eleitoral' : '⭐ Luta principal'}</div>}
      <div className="fr-when">
        <span className="fr-time">{hhmm(f.startsAt)}</span>
        <span className="tiny muted">Luta {f.num}</span>
        {phase === 'aberta' && <span className="phase open">Aberta · fecha em {countdown(f.startsAt - live.bets.closeSec * 1000 - now)}</span>}
        {phase === 'fechada' && <span className="phase closedp">🔒 Começa em {countdown(f.startsAt - now)}</span>}
        {phase === 'aovivo' && <span className="phase livep">🔴 AO VIVO</span>}
        {closed && <span className="phase donep">{f.method === 'ko' ? '💥 K.O.' : '⚖️ Decisão'}</span>}
      </div>
      <div className="fr-main">
        <Side ro={f.a} winner={winner === 0} loser={winner === 1} />
        <div className="fr-center">
          <span className="vs">VS</span>
        </div>
        <Side ro={f.b} flip winner={winner === 1} loser={winner === 0} />
      </div>
      <div className="odds">
        <OddBtn label={f.a.name} odds={f.oddsA} disabled={!open} won={closed && f.winner === 0} onClick={() => onPick?.(f, 'a')} />
        <OddBtn label="💥 K.O." odds={f.oddsKo} disabled={!open} won={closed && f.method === 'ko'} onClick={() => onPick?.(f, 'ko')} />
        <OddBtn label={f.b.name} odds={f.oddsB} disabled={!open} won={closed && f.winner === 1} onClick={() => onPick?.(f, 'b')} />
      </div>
      <div className="fr-foot">
        <span className="tiny muted">
          {myBets.length
            ? `Suas apostas: ${myBets.map((b) => `${b.label} (🌽${fmt(b.amount)}${b.status === 'ganhou' ? ` → ✅ +${fmt(b.payout)}` : b.status === 'perdeu' ? ' → ❌' : ''})`).join(', ')}`
            : f.pool.bets
              ? `👥 ${f.pool.bets} aposta(s) · 🌽 ${fmt(f.pool.a + f.pool.b + f.pool.ko)} em jogo`
              : 'Ninguém apostou ainda'}
        </span>
        {onWatch && (phase === 'aovivo' || closed) && (
          <button className={`btn btn-sm ${phase === 'aovivo' ? 'btn-primary' : ''}`} onClick={() => onWatch(f)}>
            {phase === 'aovivo' ? '▶ Assistir' : '▶ Rever'}
          </button>
        )}
      </div>
    </div>
  )
}

function Side({ ro, flip, winner, loser }: { ro: Rooster; flip?: boolean; winner?: boolean; loser?: boolean }) {
  const b = BREED_BY_ID[ro.breedId]
  return (
    <div className={`fr-side ${flip ? 'right' : ''} ${winner ? 'winner' : ''} ${loser ? 'loser' : ''}`}>
      <RoosterSvg breedId={ro.breedId} skin={ro.skin} equipped={ro.equipped} size={84} flip={flip} anim={loser ? 'ko' : 'none'} />
      <div>
        <b>
          {winner && '🏆 '}
          {ro.name}
        </b>
        <div className="tiny muted">
          {ro.owner} · Nv {ro.level}
        </div>
        <div className="tiny">
          <RarityTag rarity={b.rarity} /> <StyleTag style={ro.style} />
        </div>
        <div className="tiny power">⚡ {power(ro)}</div>
      </div>
    </div>
  )
}

function OddBtn({ label, odds, onClick, disabled, won }: { label: string; odds: number; onClick: () => void; disabled?: boolean; won?: boolean }) {
  return (
    <button className={`odd ${won ? 'won' : ''}`} onClick={onClick} disabled={disabled}>
      <span className="tiny">{label}</span>
      <b>{odds.toFixed(2)}</b>
    </button>
  )
}
