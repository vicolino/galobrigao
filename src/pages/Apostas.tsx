import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, RarityTag, StyleTag, Tabs, go } from '../components/ui'
import { HOUSE_EDGE } from '../game/battle'
import { eventName, type BetView, type FightPhase, type ScheduledFight } from '../game/bets'
import { live } from '../game/config'
import { BREED_BY_ID } from '../game/data'
import { fmt, power } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { BetPick, Rooster } from '../game/types'
import { locale, t, tn, tp, tx } from '../i18n'

const viewerTz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
  } catch {
    return 'America/Sao_Paulo'
  }
})()
/** Nome do evento no fuso de quem está vendo (já traduzido). */
const evName = (startsAt: number): string => eventName(startsAt, viewerTz).name

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
const dayLabel = (ts: number) => {
  const d = new Date(ts)
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86_400_000)
  if (d.toDateString() === today.toDateString()) return t('Hoje')
  if (d.toDateString() === tomorrow.toDateString()) return t('Amanhã')
  return d.toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit' })
}
function countdown(ms: number) {
  if (ms <= 0) return '0:00'
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? t('{h}h {m}min', { h, m: String(m).padStart(2, '0') }) : `${m}:${String(sec).padStart(2, '0')}`
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
      const key = `${dayLabel(f.startsAt)} · ${evName(f.startsAt)}`
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
      toast(t('Aposta feita! Luta às {hora}. Retorno possível: 🌽 {n}', { hora: hhmm(slip.fight.startsAt), n: fmt(amount * odds) }), 'ok')
      setSlip(null)
      void load()
      void loadHistory()
    } else toast(tx(r.error), 'erro')
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
        title={t('🎲 Apostas')}
        subtitle={t('Lutas da casa o dia todo, uma a cada {n} minutos. Aposte e pode sair: o prêmio cai sozinho no seu milho.', { n: live.bets.intervalMin })}
        right={
          <button className="btn btn-sm btn-ghost" onClick={() => setInfo(true)}>
            {t('ℹ️ Como funciona')}
          </button>
        }
      />

      {myLive && (
        <div className="card live-banner">
          <span className="live-dot">{t('AO VIVO')}</span>
          <div className="grow">
            <b>
              {myLive.a.name} x {myLive.b.name}
            </b>
            <div className="tiny muted">
              {evName(myLive.startsAt)} · {t('Luta {n}', { n: myLive.num })}
              {betsOn(myLive.id).length > 0 && ` · ${t('você apostou 🌽 {n}', { n: fmt(betsOn(myLive.id).reduce((a, b) => a + b.amount, 0)) })}`}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => watch(myLive)}>
            {t('▶ Assistir')}
          </button>
        </div>
      )}

      {next && (
        <div className="card next-fight">
          <div className="nf-time">
            <span className="tiny muted">{t('Próxima luta')}</span>
            <b>{countdown(next.startsAt - now)}</b>
            <span className="tiny">
              {phase(next) === 'aberta' ? t('apostas fecham em {t}', { t: countdown(next.startsAt - live.bets.closeSec * 1000 - now) }) : t('🔒 apostas fechadas')}
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
              {hhmm(next.startsAt)} · {evName(next.startsAt)} · {t('Luta {n}', { n: next.num })}
            </span>
          </div>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span>{t('Apostas feitas')}</span>
          <b>{s.stats.betsPlaced}</b>
        </div>
        <div className="kpi">
          <span>{t('Acertos')}</span>
          <b>{settled.length ? Math.round((settled.filter((b) => b.status === 'ganhou').length / settled.length) * 100) : 0}%</b>
        </div>
        <div className="kpi">
          <span title={t('Quanto você ganhou em prêmios menos quanto apostou. Não é o seu milho.')}>{t('Lucro nas apostas')}</span>
          <b className={returned - staked >= 0 ? 'pos' : 'neg'}>
            {returned - staked >= 0 ? '+' : '−'}🌽 {fmt(Math.abs(returned - staked))}
          </b>
          <small className="tiny muted">{t('prêmios − apostado · seu milho: 🌽 {n}', { n: fmt(s.milho) })}</small>
        </div>
        <div className="kpi">
          <span>{t('Maior prêmio')}</span>
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
          { id: 'agenda' as const, label: t('📅 Agenda ({n})', { n: upcoming.length }) },
          { id: 'resultados' as const, label: t('🏁 Resultados') },
          { id: 'minhas' as const, label: t('🧾 Minhas apostas') },
        ]}
      />

      {tab === 'agenda' &&
        (loading && !fights.length ? (
          <p className="muted">
            <span className="spinner" /> {t('Carregando a agenda...')}
          </p>
        ) : upcoming.length === 0 ? (
          <Empty emoji="📅" title={t('Agenda vazia')} text={t('As próximas lutas aparecem em instantes.')} />
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
          <Empty emoji="🏁" title={t('Nenhum resultado ainda')} text={t('Assim que as primeiras lutas da agenda acontecerem, os resultados aparecem aqui.')} />
        ) : (
          <div className="fight-list">
            {[...liveNow, ...done].map((f) => (
              <FightCard key={f.id} f={f} phase={phase(f)} now={now} myBets={betsOn(f.id).map((b) => (phase(f) === 'encerrada' ? settle(b, f) : b))} onWatch={watch} />
            ))}
          </div>
        ))}

      {tab === 'minhas' &&
        (history.length === 0 ? (
          <Empty emoji="🎟️" title={t('Nenhuma aposta ainda')} text={t('Escolha uma luta da agenda e toque numa odd para apostar.')} />
        ) : (
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Horário')}</th>
                  <th>{t('Palpite')}</th>
                  <th className="hide-m">{t('Odd')}</th>
                  <th>{t('Valor')}</th>
                  <th>{t('Retorno')}</th>
                  <th>{t('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td className="tiny">
                      {dayLabel(b.startsAt)} {hhmm(b.startsAt)}
                    </td>
                    <td>
                      {tx(b.label)}
                      <div className="tiny muted">{b.fight}</div>
                    </td>
                    <td className="hide-m">{b.odds.toFixed(2)}</td>
                    <td>🌽 {fmt(b.amount)}</td>
                    <td>{b.status === 'pendente' ? `🌽 ${fmt(b.amount * b.odds)}` : b.payout ? `🌽 ${fmt(b.payout)}` : '—'}</td>
                    <td>
                      <span className={`status status-${b.status}`}>{b.status === 'pendente' ? t('⏳ Aguardando') : b.status === 'ganhou' ? t('✅ Ganhou') : t('❌ Perdeu')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Modal open={!!slip} onClose={() => setSlip(null)} title={t('🧾 Cupom de aposta')}>
        {slip && (
          <div className="slip">
            <div className="slip-fight">
              {slip.fight.a.name} <span className="muted">x</span> {slip.fight.b.name}
              <div className="tiny muted">
                {t('{dia} às {hora}', { dia: dayLabel(slip.fight.startsAt), hora: hhmm(slip.fight.startsAt) })} · {evName(slip.fight.startsAt)} · {t('Luta {n}', { n: slip.fight.num })}
              </div>
            </div>
            <div className="slip-pick">
              <span>
                {t('Palpite:')} <b>{slip.pick === 'a' ? t('{a} vence', { a: slip.fight.a.name }) : slip.pick === 'b' ? t('{a} vence', { a: slip.fight.b.name }) : t('Termina em K.O.')}</b>
              </span>
              <span className="odd-big">{odds.toFixed(2)}</span>
            </div>
            <label className="field">
              <span>{t('Valor (🌽 milho)')}</span>
              <input type="number" min={live.bets.minBet} max={maxBet} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <div className="chips">
              {[50, 100, 500, 1000, 5000].map((v) => (
                <button key={v} className="chip clickable" onClick={() => setAmount(v)}>
                  {fmt(v)}
                </button>
              ))}
              <button className="chip clickable" onClick={() => setAmount(maxBet)}>
                {t('Máx')}
              </button>
            </div>
            <div className="slip-return">
              {tn('Retorno possível: {n}', { n: <b>🌽 {fmt(amount * odds)}</b> })}
            </div>
            <p className="tiny muted center">
              {t('Apostas fecham em {t}. O resultado sai às {hora} e o prêmio entra sozinho.', { t: countdown(slip.fight.startsAt - live.bets.closeSec * 1000 - now), hora: hhmm(slip.fight.startsAt) })}
            </p>
            <button className="btn btn-primary full btn-lg" onClick={place} disabled={busy || amount < live.bets.minBet || amount > s.milho || phase(slip.fight) !== 'aberta'}>
              {busy ? <span className="spinner" /> : t('🎲 Confirmar aposta')}
            </button>
            <p className="tiny muted center">{t('Moeda virtual do jogo. Não há dinheiro real envolvido.')}</p>
          </div>
        )}
      </Modal>

      <Modal open={info} onClose={() => setInfo(false)} title={t('ℹ️ Como funcionam as apostas')}>
        <ul className="info-list">
          <li>
            {tn('A casa tem uma {agenda}: uma a cada {n} minutos, iguais para todos os jogadores. Toda hora cheia tem a {principal}.', {
              agenda: <b>{t('agenda de lutas o dia todo')}</b>,
              n: live.bets.intervalMin,
              principal: <b>{t('luta principal')}</b>,
            })}
          </li>
          <li>{t('As apostas fecham {n} segundos antes de cada luta. Na hora marcada a luta acontece sozinha, mesmo que você esteja fora do jogo.', { n: live.bets.closeSec })}</li>
          <li>{tn('Durante a luta ela fica {aovivo} e você pode assistir. Depois o prêmio entra automaticamente no seu milho.', { aovivo: <b>{t('AO VIVO')}</b> })}</li>
          <li>{t('Cada luta é simulada centenas de vezes para calcular a chance de cada galo. As odds incluem uma margem da casa de {n}%.', { n: Math.round(HOUSE_EDGE * 100) })}</li>
          <li>
            <b>💥 K.O.</b> {t('paga se a luta terminar em nocaute, não importa quem vença.')}
          </li>
          <li>
            {t('Aposta mínima 🌽 {min}, máxima 🌽 {max}.', { min: fmt(live.bets.minBet), max: fmt(live.bets.maxBet) })}
          </li>
          <li>{t('Tudo usa moeda virtual. Milho e ovos não podem ser trocados por dinheiro.')}</li>
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
  const election = f.a.owner === 'Edição Eleições' // i18n-ok
  return (
    <div className={`card fight-row ${closed ? 'closed' : ''} ${f.featured ? 'featured' : ''}`}>
      {f.featured && <div className="featured-tag">{election ? t('🗳️ Clássico Eleitoral') : t('⭐ Luta principal')}</div>}
      <div className="fr-when">
        <span className="fr-time">{hhmm(f.startsAt)}</span>
        <span className="tiny muted">{t('Luta {n}', { n: f.num })}</span>
        {phase === 'aberta' && <span className="phase open">{t('Aberta · fecha em {t}', { t: countdown(f.startsAt - live.bets.closeSec * 1000 - now) })}</span>}
        {phase === 'fechada' && <span className="phase closedp">{t('🔒 Começa em {t}', { t: countdown(f.startsAt - now) })}</span>}
        {phase === 'aovivo' && <span className="phase livep">{t('🔴 AO VIVO')}</span>}
        {closed && <span className="phase donep">{f.method === 'ko' ? '💥 K.O.' : t('⚖️ Decisão')}</span>}
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
            ? t('Suas apostas: {lista}', { lista: myBets.map((b) => `${tx(b.label)} (🌽${fmt(b.amount)}${b.status === 'ganhou' ? ` → ✅ +${fmt(b.payout)}` : b.status === 'perdeu' ? ' → ❌' : ''})`).join(', ') })
            : f.pool.bets
              ? tp('👥 {n} aposta · 🌽 {total} em jogo', '👥 {n} apostas · 🌽 {total} em jogo', f.pool.bets, { total: fmt(f.pool.a + f.pool.b + f.pool.ko) })
              : t('Ninguém apostou ainda')}
        </span>
        {onWatch && (phase === 'aovivo' || closed) && (
          <button className={`btn btn-sm ${phase === 'aovivo' ? 'btn-primary' : ''}`} onClick={() => onWatch(f)}>
            {phase === 'aovivo' ? t('▶ Assistir') : t('▶ Rever')}
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
          {tx(ro.owner)} · {t('Nv {n}', { n: ro.level })}
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
