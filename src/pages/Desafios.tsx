import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, RarityTag, RoosterCard, StyleTag, go } from '../components/ui'
import { estimate } from '../game/battle'
import { BREED_BY_ID } from '../game/data'
import { maxLevelDiff, PVP_ENERGY, type ChallengeView, type LobbyEntry } from '../game/pvp'
import { currentEnergy, power } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'

function useCountdown(until?: number) {
  const [, setT] = useState(0)
  useEffect(() => {
    if (!until) return
    const t = setInterval(() => setT(Date.now()), 500)
    return () => clearInterval(t)
  }, [until])
  return until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0
}

export function Desafios() {
  const { state, actions, toast, pvp } = useGame()
  const s = state!
  const sorted = [...s.roosters].sort((a, b) => currentEnergy(b) - currentEnergy(a) || b.level - a.level)
  const [selId, setSelId] = useState(sorted[0]?.id)
  const mine = s.roosters.find((r) => r.id === selId) ?? s.roosters[0]
  const [players, setPlayers] = useState<LobbyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<ChallengeView[]>([])
  const outgoing = pvp?.outgoing ?? null
  const left = useCountdown(outgoing?.expiresAt)

  // Atualiza a lista de adversários a cada 5s
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await api.pvpLobby(mine.id)
        if (alive) setPlayers(r.players)
      } catch {
        /* tenta de novo */
      } finally {
        if (alive) setLoading(false)
      }
    }
    setLoading(true)
    void load()
    const t = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [mine.id, mine.level])

  useEffect(() => {
    api.pvpHistory().then((r) => setHistory(r.history)).catch(() => null)
  }, [pvp?.updates.length, s.stats.fights])

  const chances = useMemo(() => Object.fromEntries(players.map((p) => [p.rooster.id, estimate(mine, p.rooster, 80).pA])), [players, mine])

  const challenge = async (p: LobbyEntry) => {
    const r = await actions.pvpChallenge(mine.id, p.userId, p.rooster.id)
    if (r.ok) toast(`Desafio enviado para ${p.name}! Esperando resposta...`, 'ok')
    else toast(r.error, 'erro')
  }

  const lowEnergy = currentEnergy(mine) < PVP_ENERGY
  const range = `${Math.max(1, mine.level - maxLevelDiff())}–${mine.level + maxLevelDiff()}`

  return (
    <>
      <PageHead
        title="🤝 Desafios"
        subtitle={`${pvp?.online ?? 0} jogador(es) online agora · só galos de nível igual ou até ${maxLevelDiff()} de diferença`}
        right={<span className="pill">🟢 Você está online</span>}
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
              Aguardando {outgoing.toName} responder... <span className="spinner" />
            </b>
            <div className="tiny muted">
              {outgoing.a.name} (Nv {outgoing.a.level}) x {outgoing.b.name} (Nv {outgoing.b.level}) · expira em {left}s
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => actions.pvpCancel(outgoing.id)}>
            Cancelar
          </button>
        </div>
      )}

      <h2 className="section-title">1. Seu galo</h2>
      <div className="scroller">
        {sorted.map((r) => (
          <div key={r.id} className="scroller-item">
            <RoosterCard ro={r} compact selected={r.id === mine.id} onClick={() => setSelId(r.id)} />
          </div>
        ))}
      </div>
      {lowEnergy && (
        <div className="warn">
          ⚡ {mine.name} precisa de {PVP_ENERGY} de energia para desafiar. <a href={`#/galinheiro/${mine.id}`}>Dar comida ou ração</a>.
        </div>
      )}

      <h2 className="section-title">
        2. Adversários online <span className="tiny muted">(nível {range})</span>
      </h2>
      {loading && players.length === 0 ? (
        <p className="muted">
          <span className="spinner" /> Procurando jogadores...
        </p>
      ) : players.length === 0 ? (
        <Empty
          emoji="🦗"
          title={`Ninguém online com galo de nível ${range} agora`}
          text="Fique nesta tela: a lista atualiza sozinha. Você também pode treinar outro galo ou lutar na Arena enquanto espera."
          action={
            <button className="btn btn-primary" onClick={() => go('/rinha')}>
              ⚔️ Ir para a Arena
            </button>
          }
        />
      ) : (
        <div className="opponents">
          {players.map((p) => {
            const b = BREED_BY_ID[p.rooster.breedId]
            const diff = p.rooster.level - mine.level
            const chance = chances[p.rooster.id] ?? 0.5
            return (
              <div key={p.rooster.id} className="card opp">
                <div className="opp-head">
                  <span className="player-tag">
                    <span className="avatar sm">{p.avatar}</span> {p.name}
                  </span>
                  <span className={`lvl-diff ${diff === 0 ? 'same' : diff > 0 ? 'up' : 'down'}`}>{diff === 0 ? 'Mesmo nível' : diff > 0 ? `+${diff} nível` : `${diff} nível`}</span>
                </div>
                <div className="opp-vs">
                  <RoosterSvg breedId={mine.breedId} skin={mine.skin} equipped={mine.equipped} size={90} anim="none" />
                  <span className="vs">VS</span>
                  <RoosterSvg breedId={p.rooster.breedId} skin={p.rooster.skin} equipped={p.rooster.equipped} size={90} flip anim="idle" />
                </div>
                <div className="rc-name">{p.rooster.name}</div>
                <div className="rc-sub">
                  {b.name} · Nv {p.rooster.level} · {p.rooster.wins}V {p.rooster.losses}D
                </div>
                <div className="rc-row">
                  <RarityTag rarity={b.rarity} />
                  <StyleTag style={p.rooster.style} />
                  <span className="power">⚡ {power(p.rooster)}</span>
                </div>
                <div className="chance">
                  <div className="chance-bar">
                    <div style={{ width: `${Math.round(chance * 100)}%` }} />
                  </div>
                  <span>Sua chance: ~{Math.round(chance * 100)}%</span>
                </div>
                <button className="btn btn-primary full" disabled={!!outgoing || lowEnergy} onClick={() => challenge(p)}>
                  🤝 Desafiar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2 className="section-title">📜 Últimos desafios</h2>
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
                      <td className="tiny">{h.result?.method === 'ko' ? 'K.O.' : 'Decisão'}</td>
                      <td className={`right ${won ? 'pos' : 'neg'}`}>🌽 +{h.result?.rewards.milho ?? 0}</td>
                      <td className="right">
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            actions.watchPvp(h)
                            go('/luta')
                          }}
                        >
                          ▶ Rever
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

  if (!c || left <= 0) return null

  const respond = async (accept: boolean) => {
    setBusy(true)
    const r = await actions.pvpRespond(c.id, accept)
    setBusy(false)
    if (!r.ok) toast(r.error, 'erro')
    else if (accept) {
      sfx.bell()
      go('/luta')
    }
  }

  return (
    <Modal open onClose={() => respond(false)} title="🤝 Você foi desafiado!">
      <div className="center">
        <p>
          <b>{c.fromName}</b> quer lutar contra seu galo <b>{c.b.name}</b>.
        </p>
        <div className="opp-vs alert-vs">
          <div>
            <RoosterSvg breedId={c.a.breedId} skin={c.a.skin} equipped={c.a.equipped} size={120} anim="idle" />
            <b>{c.a.name}</b>
            <div className="tiny muted">
              Nv {c.a.level} · ⚡ {power(c.a)}
            </div>
          </div>
          <span className="vs">VS</span>
          <div>
            <RoosterSvg breedId={c.b.breedId} skin={c.b.skin} equipped={c.b.equipped} size={120} flip anim="idle" />
            <b>{c.b.name}</b>
            <div className="tiny muted">
              Nv {c.b.level} · ⚡ {power(c.b)}
            </div>
          </div>
        </div>
        <p className="tiny muted">Gasta {PVP_ENERGY} de energia. Quem vencer leva milho, XP e pontos de liga.</p>
        <div className="timer-bar">
          <div style={{ width: `${Math.min(100, (left / Math.max(1, Math.round((c.expiresAt - c.createdAt) / 1000))) * 100)}%` }} />
        </div>
        <p className="tiny">{left}s para responder</p>
        <div className="row-center gap">
          <button className="btn" disabled={busy} onClick={() => respond(false)}>
            Recusar
          </button>
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => respond(true)}>
            ⚔️ Aceitar desafio
          </button>
        </div>
      </div>
    </Modal>
  )
}
