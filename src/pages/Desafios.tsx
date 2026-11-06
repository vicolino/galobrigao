import { useEffect, useState } from 'react'
import { api } from '../api'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, RoosterCard, go } from '../components/ui'
import { BREED_BY_ID, LEAGUE_TIERS } from '../game/data'
import { PVP_ENERGY, type ChallengeView, type LobbyPlayer, type LobbyRooster } from '../game/pvp'
import { currentEnergy } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import { t, tn, tp, tx } from '../i18n'

function useCountdown(until?: number) {
  const [, setT] = useState(0)
  useEffect(() => {
    if (!until) return
    const iv = setInterval(() => setT(Date.now()), 500)
    return () => clearInterval(iv)
  }, [until])
  return until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0
}

export function Desafios() {
  const { state, actions, toast, pvp } = useGame()
  const s = state!
  const sorted = [...s.roosters].sort((a, b) => currentEnergy(b) - currentEnergy(a) || b.level - a.level)
  const [selId, setSelId] = useState(sorted[0]?.id)
  const mine = s.roosters.find((r) => r.id === selId) ?? s.roosters[0]
  const [players, setPlayers] = useState<LobbyPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<ChallengeView[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const outgoing = pvp?.outgoing ?? null
  const left = useCountdown(outgoing?.expiresAt)

  // Lobby: todos os jogadores online, atualiza a cada 5s
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await api.pvpLobby()
        if (alive) setPlayers(r.players)
      } catch {
        /* tenta de novo */
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const iv = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [])

  useEffect(() => {
    api.pvpHistory().then((r) => setHistory(r.history)).catch(() => null)
  }, [pvp?.updates.length, s.stats.fights])

  const shown = players.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
  const open = shown.find((p) => p.userId === openId) ?? null

  const challenge = async (p: LobbyPlayer, ro: LobbyRooster) => {
    const r = await actions.pvpChallenge(mine.id, p.userId, ro.id)
    if (r.ok) toast(t('Desafio enviado para {nome}! Esperando resposta...', { nome: p.name }), 'ok')
    else toast(tx(r.error), 'erro')
  }

  const lowEnergy = currentEnergy(mine) < PVP_ENERGY

  return (
    <>
      <PageHead
        title={t('🤝 Desafios')}
        subtitle={tp('{n} jogador online agora · desafie qualquer um, de qualquer nível', '{n} jogadores online agora · desafie qualquer um, de qualquer nível', pvp?.online ?? 0)}
        right={<span className="pill">{t('🟢 Você está online')}</span>}
      />

      {outgoing && (
        <div className="card outgoing">
          <div className="opp-vs">
            <RoosterSvg breedId={outgoing.a.breedId} skin={outgoing.a.skin} equipped={outgoing.a.equipped} size={80} anim="idle" />
            <span className="vs">VS</span>
            <RoosterSvg breedId={outgoing.b.breedId} skin={outgoing.b.skin} equipped={outgoing.b.equipped} size={80} flip anim="idle" />
          </div>
          <div className="grow">
            <b>
              {t('Aguardando {nome} responder...', { nome: outgoing.toName })} <span className="spinner" />
            </b>
            <div className="tiny muted">
              {t('{a} (Nv {na}) x {b} (Nv {nb}) · expira em {s}s', { a: outgoing.a.name, na: outgoing.a.level, b: outgoing.b.name, nb: outgoing.b.level, s: left })}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => actions.pvpCancel(outgoing.id)}>
            {t('Cancelar')}
          </button>
        </div>
      )}

      <h2 className="section-title">{t('1. Seu galo')}</h2>
      <div className="scroller">
        {sorted.map((r) => (
          <div key={r.id} className="scroller-item">
            <RoosterCard ro={r} compact selected={r.id === mine.id} onClick={() => setSelId(r.id)} />
          </div>
        ))}
      </div>
      {lowEnergy && (
        <div className="warn">
          {tn('⚡ {nome} precisa de {n} de energia para desafiar. {link}.', { nome: mine.name, n: PVP_ENERGY, link: <a href={`#/galinheiro/${mine.id}`}>{t('Dar comida ou ração')}</a> })}
        </div>
      )}

      <div className="row-between lobby-head">
        <h2 className="section-title">
          {t('2. Jogadores online')} <span className="count-badge">{players.length}</span>
        </h2>
        <input className="input lobby-search" placeholder={t('Buscar jogador...')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && players.length === 0 ? (
        <p className="muted">
          <span className="spinner" /> {t('Procurando jogadores...')}
        </p>
      ) : shown.length === 0 ? (
        <Empty
          emoji="🦗"
          title={q.trim() ? t('Ninguém online com esse nome') : t('Ninguém online agora')}
          text={t('Fique nesta tela: a lista atualiza sozinha. Você também pode treinar outro galo ou lutar na Arena enquanto espera.')}
          action={
            <button className="btn btn-primary" onClick={() => go('/rinha')}>
              {t('⚔️ Ir para a Arena')}
            </button>
          }
        />
      ) : (
        <div className="lobby">
          <div className="card lobby-list">
            {shown.map((p) => {
              const tier = [...LEAGUE_TIERS].reverse().find((tr) => p.leaguePoints >= tr.min) ?? LEAGUE_TIERS[0]
              const top = p.roosters[0]
              const ready = p.roosters.filter((r) => !r.busy).length
              return (
                <button key={p.userId} className={`lobby-row ${openId === p.userId ? 'on' : ''}`} onClick={() => setOpenId(p.userId)}>
                  <span className="avatar sm">{p.avatar}</span>
                  <span className="lobby-name">
                    <b>{p.name}</b>
                    <span className="tiny muted">
                      {tier.emoji} {tier.label} · {tp('{n} galo', '{n} galos', p.roosters.length)}
                    </span>
                  </span>
                  <span className="lobby-lv" title={t('Galo de maior nível')}>
                    {t('Nv {n}', { n: top?.level ?? 0 })}
                  </span>
                  <span className={`lobby-st ${p.inChallenge ? 'busy' : ready ? 'ok' : 'off'}`}>{p.inChallenge ? t('🟡 Em desafio') : ready ? t('🟢 Livre') : t('😴 Sem energia')}</span>
                </button>
              )
            })}
          </div>

          <div className="lobby-detail">
            {!open ? (
              <div className="card center muted lobby-hint">{t('👈 Escolha um jogador para ver os galos dele e desafiar.')}</div>
            ) : (
              <div className="card">
                <div className="row gap lobby-detail-head">
                  <span className="avatar">{open.avatar}</span>
                  <div className="grow">
                    <b>{open.name}</b>
                    <div className="tiny muted">{t('Escolha qual galo dele você quer enfrentar com {galo} (Nv {n}).', { galo: mine.name, n: mine.level })}</div>
                  </div>
                </div>
                <div className="lobby-roosters">
                  {open.roosters.map((ro) => {
                    const diff = ro.level - mine.level
                    const why = ro.busy === 'desafio' ? t('Em outro desafio') : ro.busy === 'energia' ? t('Sem energia') : open.inChallenge ? t('Jogador em desafio') : null
                    return (
                      <div key={ro.id} className={`lobby-ro ${why ? 'off' : ''}`}>
                        <RoosterSvg breedId={ro.breedId} skin={ro.skin} equipped={ro.equipped} tint={ro.tint} size={72} flip anim="none" />
                        <div className="grow">
                          <b>{ro.name}</b>
                          <div className="tiny muted">
                            {t('{raca} · {v}V {d}D', { raca: BREED_BY_ID[ro.breedId]?.name ?? '', v: ro.wins, d: ro.losses })}
                          </div>
                          <div className="row gap wrap lobby-ro-tags">
                            <span className="lv-vs">
                              {t('Nv {a}', { a: mine.level })} <i>×</i> {t('Nv {b}', { b: ro.level })}
                            </span>
                            <span className={`lvl-diff ${diff === 0 ? 'same' : diff > 0 ? 'up' : 'down'}`}>{diff === 0 ? t('Mesmo nível') : diff > 0 ? tp('{d} nível acima', '{d} níveis acima', diff, { d: `+${diff}` }) : tp('{d} nível abaixo', '{d} níveis abaixo', -diff, { d: diff })}</span>
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm" disabled={!!outgoing || lowEnergy || !!why} title={why ?? undefined} onClick={() => challenge(open, ro)}>
                          {why ?? t('🤝 Desafiar')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2 className="section-title">{t('📜 Últimos desafios')}</h2>
          <div className="card">
            <table className="table">
              <tbody>
                {history.map((h) => {
                  const mySide = h.mine === 'from' ? 0 : 1
                  const won = h.result?.winner === mySide
                  const me = mySide === 0 ? h.a : h.b
                  const them = mySide === 0 ? h.b : h.a
                  return (
                    <tr key={h.id}>
                      <td>{won ? '🏆' : '😵'}</td>
                      <td>
                        <b>{me.name}</b> x {them.name} <span className="tiny muted">({h.mine === 'from' ? h.toName : h.fromName})</span>
                      </td>
                      <td className="tiny">{h.result?.method === 'ko' ? 'K.O.' : t('Decisão')}</td>
                      <td className={`right ${won ? 'pos' : 'neg'}`}>🌽 +{h.result?.rewards.milho ?? 0}</td>
                      <td className="right">
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            actions.watchPvp(h)
                            go('/luta')
                          }}
                        >
                          {t('▶ Rever')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

/** Aviso de desafio recebido: aparece em qualquer tela do jogo. */
export function ChallengeAlert() {
  const { pvp, actions, toast } = useGame()
  const c = pvp?.incoming[0] ?? null
  const left = useCountdown(c?.expiresAt)
  const [busy, setBusy] = useState(false)
  const [lastId, setLastId] = useState<string | null>(null)

  useEffect(() => {
    if (c && c.id !== lastId) {
      setLastId(c.id)
      sfx.crow()
    }
  }, [c?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Quem desafia é o lado A; o meu galo é o B
  const gap = c ? c.a.level - c.b.level : 0

  if (!c || left <= 0) return null

  const respond = async (accept: boolean) => {
    setBusy(true)
    const r = await actions.pvpRespond(c.id, accept)
    setBusy(false)
    if (!r.ok) toast(tx(r.error), 'erro')
    else if (accept) {
      sfx.bell()
      go('/luta')
    }
  }

  return (
    <Modal open onClose={() => respond(false)} title={t('🤝 Você foi desafiado!')}>
      <div className="center">
        <p>
          {tn('{nome} quer lutar contra seu galo {galo}.', { nome: <b>{c.fromName}</b>, galo: <b>{c.b.name}</b> })}
        </p>
        <div className="opp-vs alert-vs">
          <div>
            <span className="tiny muted">{t('Galo dele')}</span>
            <RoosterSvg breedId={c.a.breedId} skin={c.a.skin} equipped={c.a.equipped} size={120} anim="idle" />
            <b>{c.a.name}</b>
            <span className={`alert-lv ${gap > 0 ? 'up' : gap < 0 ? 'down' : ''}`}>{t('Nv {n}', { n: c.a.level })}</span>
          </div>
          <span className="vs">VS</span>
          <div>
            <span className="tiny muted">{t('Seu galo')}</span>
            <RoosterSvg breedId={c.b.breedId} skin={c.b.skin} equipped={c.b.equipped} size={120} flip anim="idle" />
            <b>{c.b.name}</b>
            <span className="alert-lv">{t('Nv {n}', { n: c.b.level })}</span>
          </div>
        </div>
        <p className={`alert-gap ${gap > 0 ? 'up' : gap < 0 ? 'down' : 'same'}`}>
          {gap === 0
            ? t('⚖️ Mesmo nível')
            : gap > 0
              ? tp('⚠️ O galo dele é {d} nível acima do seu', '⚠️ O galo dele é {d} níveis acima do seu', gap, { d: gap })
              : tp('💪 O galo dele é {d} nível abaixo do seu', '💪 O galo dele é {d} níveis abaixo do seu', -gap, { d: -gap })}
        </p>
        <p className="tiny muted">{t('Gasta {n} de energia. Quem vencer leva milho, XP e pontos de liga.', { n: PVP_ENERGY })}</p>
        <div className="timer-bar">
          <div style={{ width: `${Math.min(100, (left / Math.max(1, Math.round((c.expiresAt - c.createdAt) / 1000))) * 100)}%` }} />
        </div>
        <p className="tiny">{t('{s}s para responder', { s: left })}</p>
        <div className="row-center gap">
          <button className="btn" disabled={busy} onClick={() => respond(false)}>
            {t('Recusar')}
          </button>
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => respond(true)}>
            {t('⚔️ Aceitar desafio')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
