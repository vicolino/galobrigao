// 🏟️ Torneios: agenda, inscrição, chave (com replay de cada luta), prêmios e histórico.
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, RoosterCard, Tabs, go } from '../components/ui'
import { ShareButton, recordLine } from '../components/Share'
import { SKIN_BY_ID } from '../game/data'
import { fmt, power } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import { placeLabel, placeRange, roundsOf, statusLabel, torneioName, type PrizeRow, type TorneioDetail, type TorneioKind, type TorneioNotice, type TorneioResult, type TorneioView } from '../game/torneio'
import type { Rooster } from '../game/types'
import { locale, t, tx } from '../i18n'

const when = (ts: number) => new Date(ts).toLocaleString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
function countdown(ms: number) {
  if (ms <= 0) return '0:00'
  const s = Math.ceil(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return t('{d}d {h}h', { d, h })
  if (h) return t('{h}h {m}min', { h, m: String(m).padStart(2, '0') })
  return `${m}:${String(s % 60).padStart(2, '0')}`
}


/** Galos da casa vêm do servidor com nome em português. */
const roName = (ro: Rooster, bot?: boolean) => (bot ? tx(ro.name) : ro.name)

/** Relógio do servidor (para a contagem regressiva bater com o horário real). */
function useClock(serverNow: number | null) {
  const [offset, setOffset] = useState(0)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (serverNow) setOffset(serverNow - Date.now())
  }, [serverNow])
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return Date.now() + offset
}

export function Torneios({ id }: { id?: string }) {
  return id ? <TorneioPage id={id} /> : <TorneioList />
}

// ---------- Lista ----------

function TorneioList() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.torneios.list>> | null>(null)
  const [mine, setMine] = useState<TorneioResult[] | null>(null)
  const [tab, setTab] = useState<'proximos' | 'resultados' | 'meus'>('proximos')
  const [pick, setPick] = useState<TorneioView | null>(null)
  const [err, setErr] = useState('')
  const now = useClock(data?.now ?? null)

  const load = useCallback(async () => {
    try {
      setData(await api.torneios.list())
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => {
    if (tab === 'meus') api.torneios.mine().then((r) => setMine(r.results)).catch(() => setMine([]))
  }, [tab])

  return (
    <>
      <PageHead title={t('🏟️ Torneios')} subtitle={t('Chave eliminatória com prêmios da casa. Inscreva seu melhor galo e assista a cada luta.')} />
      {err && <p className="warn">{err}</p>}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'proximos', label: t('📅 Próximos') },
          { id: 'resultados', label: t('🏁 Resultados') },
          { id: 'meus', label: t('🐓 Meus resultados') },
        ]}
      />
      {!data ? (
        <div className="center"><div className="spinner big" /></div>
      ) : tab === 'proximos' ? (
        <>
          <div className="tz-grid">
            {data.list.map((tr) => (
              <TorneioCard key={tr.id} tr={tr} now={now} onPick={() => setPick(tr)} onChange={load} />
            ))}
          </div>
          <h3 className="section-title">🎁 {t('Prêmios')}</h3>
          <div className="two-col">
            <PrizeTable kind="diario" rows={data.prizes.diario} />
            <PrizeTable kind="semanal" rows={data.prizes.semanal} />
          </div>
          <p className="tiny muted tz-legal">
            {t('Inscrição grátis em todos os torneios (1 por criador). Os prêmios são pagos pela casa. Vagas que sobram são completadas com galos da casa.')}
          </p>
        </>
      ) : tab === 'resultados' ? (
        data.recent.length === 0 ? (
          <Empty emoji="🏟️" title={t('Nenhum torneio encerrado ainda')} />
        ) : (
          <div className="list">
            {data.recent.map((tr) => (
              <div key={tr.id} className="list-row clickable" onClick={() => go(`/torneios/${tr.id}`)}>
                <span>{tr.kind === 'semanal' ? '🏆' : '🏟️'}</span>
                <div className="grow">
                  <b>{torneioName(tr.kind)}</b>
                  <div className="tiny muted">
                    {when(tr.startsAt)} · {statusLabel(tr.status)}
                  </div>
                </div>
                {tr.champion && (
                  <span className="tiny">
                    🥇 {tr.champion.bot ? tx(tr.champion.name) : tr.champion.name} · {roName(tr.champion.rooster, tr.champion.bot)}
                  </span>
                )}
                {tr.mine?.place && <b className="tz-place">{placeLabel(tr.mine.place)}</b>}
              </div>
            ))}
          </div>
        )
      ) : !mine ? (
        <div className="center"><div className="spinner" /></div>
      ) : mine.length === 0 ? (
        <Empty emoji="🐣" title={t('Você ainda não jogou nenhum torneio')} text={t('Inscreva um galo no próximo Torneio Diário: é grátis!')} />
      ) : (
        <div className="list">
          {mine.map((r) => (
            <div key={r.id} className="list-row clickable" onClick={() => go(`/torneios/${r.id}`)}>
              <span>{r.kind === 'semanal' ? '🏆' : '🏟️'}</span>
              <div className="grow">
                <b>{torneioName(r.kind)}</b>
                <div className="tiny muted">
                  {when(r.startsAt)} · 🐓 {r.roosterName}
                </div>
              </div>
              <span className="tiny">{r.refunded ? t('Devolvido') : r.place ? placeLabel(r.place) : statusLabel(r.status)}</span>
              {(r.ovos > 0 || r.milho > 0) && (
                <b className="pos">
                  🥚 {r.ovos} · 🌽 {fmt(r.milho)}
                </b>
              )}
            </div>
          ))}
        </div>
      )}
      <PickRooster tr={pick} onClose={() => setPick(null)} onDone={load} />
    </>
  )
}

function TorneioCard({ tr, now, onPick, onChange }: { tr: TorneioView; now: number; onPick: () => void; onChange: () => void }) {
  const { actions, toast } = useGame()
  const [busy, setBusy] = useState(false)
  const target = tr.status === 'em_breve' ? tr.opensAt : tr.status === 'inscricoes' ? tr.closesAt : tr.status === 'fechado' ? tr.startsAt : tr.doneAt
  const label = tr.status === 'em_breve' ? t('Inscrições abrem em') : tr.status === 'inscricoes' ? t('Inscrições fecham em') : tr.status === 'fechado' ? t('Começa em') : t('Termina em')
  const withdraw = async () => {
    setBusy(true)
    try {
      await actions.reloadFromServer()
      await api.torneios.withdraw(tr.id)
      if (tr.fee) await actions.reloadFromServer()
      toast(t('Inscrição cancelada.'), 'info')
      onChange()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`card tz-card tz-${tr.kind}`}>
      <div className="row-between">
        <h3>{torneioName(tr.kind)}</h3>
        <span className={`tz-status tz-st-${tr.status}`}>{statusLabel(tr.status)}</span>
      </div>
      <p className="tiny muted">
        {when(tr.startsAt)} · {tr.fee ? t('Inscrição: 🌽 {n}', { n: fmt(tr.fee) }) : t('Inscrição grátis')}
      </p>
      <div className="tz-count">
        <span className="tiny muted">{label}</span>
        <b>{countdown(target - now)}</b>
      </div>
      <p className="tiny">{t('👥 {n} inscritos · chave de {vagas}', { n: tr.entrants, vagas: tr.entrants > 16 ? 32 : 16 })}</p>
      {tr.mine && (
        <div className="tz-mine">
          <RoosterSvg breedId={tr.mine.rooster.breedId} skin={tr.mine.rooster.skin} equipped={tr.mine.rooster.equipped} tint={tr.mine.rooster.tint} size={48} />
          <span>
            {t('Inscrito com {galo}', { galo: tr.mine.rooster.name })} · ⚡ {power(tr.mine.rooster)}
          </span>
        </div>
      )}
      <div className="row-center gap tz-actions">
        {tr.status === 'inscricoes' && (
          <button className="btn btn-primary" disabled={busy} onClick={onPick}>
            {tr.mine ? t('🔄 Trocar galo') : t('📝 Inscrever galo')}
          </button>
        )}
        {tr.status === 'inscricoes' && tr.mine && (
          <button className="btn btn-ghost" disabled={busy} onClick={withdraw}>
            {t('Desistir')}
          </button>
        )}
        <button className="btn" onClick={() => go(`/torneios/${tr.id}`)}>
          {tr.status === 'aovivo' ? t('🔴 Assistir') : t('👀 Ver chave')}
        </button>
      </div>
    </div>
  )
}

function PrizeTable({ kind, rows }: { kind: TorneioKind; rows: PrizeRow[] }) {
  const { pubConfig } = useGame()
  const web3 = !!pubConfig?.web3
  return (
    <div className="card">
      <h3>{torneioName(kind)}</h3>
      <div className="list tz-prizes">
        {rows.map((p) => (
          <div key={p.from} className="list-row">
            <b>{placeRange(p)}</b>
            <div className="grow">
              🥚 {p.ovos} · 🌽 {fmt(p.milho)}
              {p.skin && SKIN_BY_ID[p.skin] && <span className="tz-skin"> · {SKIN_BY_ID[p.skin].emoji} {t('skin {nome}', { nome: SKIN_BY_ID[p.skin].name })}</span>}
              {web3 && p.token > 0 && <span className="tiny muted"> · {t('+{n} EGG (bloqueado)', { n: p.token })}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="tiny muted">{t('Campeão ganha o troféu 🏆 Campeão do Terreiro na vitrine.')}</p>
    </div>
  )
}

function PickRooster({ tr, onClose, onDone }: { tr: TorneioView | null; onClose: () => void; onDone: () => void }) {
  const { state, actions, toast } = useGame()
  const [busy, setBusy] = useState(false)
  const choose = async (ro: Rooster) => {
    if (!tr) return
    setBusy(true)
    try {
      // Envia o progresso pendente antes (a cópia do galo é tirada do save do servidor)
      await actions.reloadFromServer()
      const r = await api.torneios.register(tr.id, ro.id)
      if (r.rev) await actions.reloadFromServer()
      sfx.coin()
      toast(r.changed ? t('{galo} agora representa você no torneio!', { galo: ro.name }) : t('{galo} inscrito! Boa sorte no terreiro 🏟️', { galo: ro.name }), 'ok')
      onClose()
      onDone()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setBusy(false)
    }
  }
  const list = [...(state?.roosters ?? [])].sort((a, b) => power(b) - power(a))
  return (
    <Modal open={!!tr} onClose={onClose} wide title={tr ? t('Inscrever no {torneio}', { torneio: torneioName(tr.kind) }) : ''}>
      <p className="tiny muted">{t('Uma cópia do galo (nível, atributos, acessórios e skin) luta no torneio. Ele continua livre para lutar e treinar enquanto isso.')}</p>
      {tr?.fee ? <p className="tiny">{t('Inscrição: 🌽 {n} (devolvida se você desistir antes de fechar ou se o torneio for cancelado).', { n: fmt(tr.fee) })}</p> : null}
      <div className="grid tz-pick">
        {list.map((ro) => (
          <RoosterCard key={ro.id} ro={ro} compact selected={tr?.mine?.roosterId === ro.id} onClick={() => !busy && choose(ro)} />
        ))}
      </div>
    </Modal>
  )
}

// ---------- Detalhe: chave ----------

function TorneioPage({ id }: { id: string }) {
  const { actions } = useGame()
  const [d, setD] = useState<TorneioDetail | null>(null)
  const [serverNow, setServerNow] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<TorneioView | null>(null)
  const now = useClock(serverNow)

  const load = useCallback(async () => {
    try {
      const r = await api.torneios.get(id)
      setD(r.torneio)
      setServerNow(r.now)
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [id])
  useEffect(() => {
    load()
  }, [load])
  // Ao vivo: busca a próxima rodada quando ela é revelada
  useEffect(() => {
    if (!d || (d.status !== 'aovivo' && d.status !== 'fechado' && d.status !== 'inscricoes')) return
    const iv = setInterval(load, d.status === 'aovivo' ? 15_000 : 30_000)
    return () => clearInterval(iv)
  }, [d, load])

  if (err) return <Empty emoji="🏟️" title={err} action={<button className="btn" onClick={() => go('/torneios')}>{t('← Torneios')}</button>} />
  if (!d) return <div className="center"><div className="spinner big" /></div>

  const watch = (ri: number, mi: number) => {
    const br = d.bracket!
    const m = br.rounds[ri][mi]
    if (m.seed === undefined) return
    const a = br.slots[m.a]
    const b = br.slots[m.b]
    const side = a.mine ? 0 : b.mine ? 1 : undefined
    actions.watchTorneio({ ...a.rooster, name: roName(a.rooster, a.bot), owner: a.bot ? tx(a.name) : a.name }, { ...b.rooster, name: roName(b.rooster, b.bot), owner: b.bot ? tx(b.name) : b.name }, m.seed, side, d.id)
    go('/luta')
  }
  const target = d.status === 'em_breve' ? d.opensAt : d.status === 'inscricoes' ? d.closesAt : d.status === 'fechado' ? d.startsAt : d.doneAt
  const rounds = roundsOf(d.bracket ? d.bracket.slots.length : d.size)

  return (
    <>
      <button className="btn btn-ghost" onClick={() => go('/torneios')}>
        {t('← Torneios')}
      </button>
      <PageHead
        title={torneioName(d.kind)}
        subtitle={`${when(d.startsAt)} · ${statusLabel(d.status)}`}
        right={
          d.status !== 'encerrado' && d.status !== 'cancelado' ? (
            <div className="tz-count">
              <span className="tiny muted">{d.status === 'aovivo' ? t('Termina em') : t('Começa em')}</span>
              <b>{countdown(target - now)}</b>
            </div>
          ) : undefined
        }
      />
      {d.status === 'inscricoes' && (
        <div className="row-center gap">
          <button className="btn btn-primary" onClick={() => setPick(d)}>
            {d.mine ? t('🔄 Trocar galo') : t('📝 Inscrever galo')}
          </button>
        </div>
      )}
      {d.mine?.place && (
        <div className="card center tz-result">
          <h2>{placeLabel(d.mine.place)}</h2>
          <p className="muted">{t('{galo} terminou em {lugar}º lugar.', { galo: d.mine.rooster.name, lugar: d.mine.place })}</p>
          {d.mine.place === 1 && <ShareButton className="btn btn-gold" card={{ ro: d.mine.rooster, headline: t('🏆 CAMPEÃO DO TORNEIO!'), stat: recordLine(d.mine.rooster) }} />}
        </div>
      )}
      {d.champion && (
        <div className="card tz-champ">
          <RoosterSvg breedId={d.champion.rooster.breedId} skin={d.champion.rooster.skin} equipped={d.champion.rooster.equipped} tint={d.champion.rooster.tint} size={90} />
          <div>
            <span className="tiny muted">{t('🏆 Campeão do Terreiro')}</span>
            <h2>{roName(d.champion.rooster, d.champion.bot)}</h2>
            <span className="tiny">{d.champion.bot ? t('Galo da casa de {nome}', { nome: tx(d.champion.name) }) : d.champion.name}</span>
          </div>
        </div>
      )}

      {d.bracket ? (
        <>
          <h3 className="section-title">🗂️ {t('Chave')}</h3>
          <p className="tiny muted">{t('Toque numa luta já decidida para assistir ao replay.')}</p>
          <div className="tz-bracket">
            {Array.from({ length: rounds }, (_, ri) => {
              const ms = d.bracket!.rounds[ri] ?? []
              const n = d.bracket!.slots.length / 2 ** (ri + 1)
              return (
                <div key={ri} className="tz-col">
                  <div className="tz-col-head">{roundName(n * 2)}</div>
                  <div className="tz-col-body">
                    {Array.from({ length: n }, (_, mi) => {
                      const m = ms[mi]
                      if (!m) return <div key={mi} className="tz-match tz-tbd">⏳</div>
                      const done = m.seed !== undefined
                      return (
                        <button key={mi} className={`tz-match ${done ? 'done' : ''}`} disabled={!done} onClick={() => watch(ri, mi)} title={done ? t('Assistir replay') : undefined}>
                          {[m.a, m.b].map((si, side) => {
                            const s = d.bracket!.slots[si]
                            const win = done && m.winner === side
                            return (
                              <div key={side} className={`tz-slot ${win ? 'win' : done ? 'lose' : ''} ${s.mine ? 'mine' : ''}`}>
                                <RoosterSvg breedId={s.rooster.breedId} skin={s.rooster.skin} equipped={s.rooster.equipped} tint={s.rooster.tint} size={26} />
                                <span className="tz-name">
                                  <b>{roName(s.rooster, s.bot)}</b>
                                  <small>{s.bot ? `🤖 ${tx(s.name)}` : s.name}</small>
                                </span>
                                {win && <span className="tz-flag">{m.method === 'ko' ? 'K.O.' : '✓'}</span>}
                              </div>
                            )
                          })}
                          {done && <span className="tz-play">▶</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : d.status === 'cancelado' ? (
        <Empty emoji="❌" title={t('Torneio cancelado')} text={t('Faltaram criadores (mínimo de 2). As inscrições foram devolvidas.')} />
      ) : (
        <>
          <h3 className="section-title">👥 {t('Inscritos ({n})', { n: d.list.length })}</h3>
          {d.list.length === 0 ? (
            <Empty emoji="🐣" title={t('Ninguém inscrito ainda')} text={t('Seja o primeiro a entrar na chave!')} />
          ) : (
            <div className="tz-entrants">
              {d.list.map((e, i) => (
                <div key={i} className={`card tz-entrant ${e.mine ? 'mine' : ''}`}>
                  <RoosterSvg breedId={e.rooster.breedId} skin={e.rooster.skin} equipped={e.rooster.equipped} tint={e.rooster.tint} size={64} />
                  <b>{e.rooster.name}</b>
                  <span className="tiny muted">
                    {e.avatar} {e.name} · {t('Nv {n}', { n: e.rooster.level })}
                  </span>
                  <span className="tiny">⚡ {power(e.rooster)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <PickRooster tr={pick} onClose={() => setPick(null)} onDone={load} />
    </>
  )
}

const roundName = (players: number) => (players === 2 ? t('🏆 Final') : players === 4 ? t('Semifinal') : players === 8 ? t('Quartas') : players === 16 ? t('Oitavas') : t('1ª rodada'))

// ---------- Avisos (montado no App) ----------

/** Confere de tempos em tempos se saiu prêmio de torneio e avisa. */
export function TorneioAlert() {
  const { phase, toast, actions } = useGame()
  useEffect(() => {
    if (phase !== 'jogo') return
    let alive = true
    const check = async () => {
      try {
        const { notices } = await api.torneios.notices()
        if (!alive || !notices.length) return
        for (const n of notices) toast(noticeText(n), n.place === 1 ? 'conquista' : 'info')
        if (notices.some((n) => n.ovos || n.milho || n.cancelled)) await actions.reloadFromServer()
        if (notices.some((n) => n.place === 1)) sfx.win()
      } catch {
        /* tenta depois */
      }
    }
    const first = setTimeout(check, 4000)
    const iv = setInterval(check, 60_000)
    return () => {
      alive = false
      clearTimeout(first)
      clearInterval(iv)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function noticeText(n: TorneioNotice) {
  const nome = torneioName(n.kind)
  if (n.cancelled) return t('{torneio} cancelado: inscrição devolvida.', { torneio: nome })
  if (n.place === 1) return t('🏆 Campeão do {torneio}! +🥚 {ovos} · +🌽 {milho}', { torneio: nome, ovos: n.ovos, milho: fmt(n.milho) })
  if (n.ovos || n.milho) return t('{torneio}: {lugar}º lugar! +🥚 {ovos} · +🌽 {milho}', { torneio: nome, lugar: n.place ?? 0, ovos: n.ovos, milho: fmt(n.milho) })
  return t('{torneio} encerrado: seu galo parou em {fase}.', { torneio: nome, fase: placeLabel(n.place ?? 16) })
}

// ---------- Carteira: prêmios em token presos na conta ----------

export function TokenPrizes() {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.torneios.tokens>> | null>(null)
  useEffect(() => {
    api.torneios.tokens().then(setD).catch(() => setD(null))
  }, [])
  if (!d || (!d.total && !d.enabled)) return null
  return (
    <div className="card tz-tokens">
      <h3>🏆 {t('Prêmios em token (bloqueados)')}</h3>
      <div className="stats-list">
        <div>
          <span>🥚 EGG</span>
          <b>{fmt(d.total)}</b>
        </div>
      </div>
      <p className="tiny muted">{t('Ganhos em torneios. Ficam presos na sua conta: não dá para sacar nem enviar até a rede principal e a verificação de identidade estarem prontas.')}</p>
    </div>
  )
}
