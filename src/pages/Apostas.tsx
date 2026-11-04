import { useState } from 'react'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, RarityTag, StyleTag, Tabs, go } from '../components/ui'
import { HOUSE_EDGE } from '../game/battle'
import { BREED_BY_ID } from '../game/data'
import { fmt, power } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { BetPick, HouseFight } from '../game/types'

export function Apostas() {
  const { state, actions, toast } = useGame()
  const s = state!
  const [tab, setTab] = useState<'card' | 'minhas'>('card')
  const [slip, setSlip] = useState<{ fight: HouseFight; pick: BetPick } | null>(null)
  const [amount, setAmount] = useState(100)
  const [info, setInfo] = useState(false)

  const settled = s.bets.filter((b) => b.status !== 'pendente')
  const staked = settled.reduce((a, b) => a + b.amount, 0)
  const returned = settled.reduce((a, b) => a + b.payout, 0)
  const pending = s.bets.filter((b) => b.status === 'pendente')
  const openFights = s.card.fights.filter((f) => f.status === 'aberta')

  const odds = slip ? (slip.pick === 'a' ? slip.fight.oddsA : slip.pick === 'b' ? slip.fight.oddsB : slip.fight.oddsKo) : 0

  const place = () => {
    if (!slip) return
    const r = actions.placeBet(slip.fight.id, slip.pick, amount)
    if (r.ok) {
      toast(`Aposta feita! Retorno possível: 🌽 ${fmt(amount * odds)}`, 'ok')
      setSlip(null)
    } else toast(r.error, 'erro')
  }

  const watch = (id: string) => {
    const m = actions.resolveFight(id, true)
    if (m) {
      sfx.bell()
      go('/luta')
    }
  }

  return (
    <>
      <PageHead
        title="🎲 Apostas"
        subtitle="Aposte milho nas lutas da casa. As odds vêm de simulações reais de cada luta."
        right={
          <button className="btn btn-sm btn-ghost" onClick={() => setInfo(true)}>
            ℹ️ Como funciona
          </button>
        }
      />

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
          <span>Saldo</span>
          <b className={returned - staked >= 0 ? 'pos' : 'neg'}>
            {returned - staked >= 0 ? '+' : ''}
            {fmt(returned - staked)}
          </b>
        </div>
        <div className="kpi">
          <span>Maior prêmio</span>
          <b>🌽 {fmt(s.stats.biggestWin)}</b>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'card', label: `🏟️ Lutas (${openFights.length})` },
          { id: 'minhas', label: `🧾 Minhas apostas${pending.length ? ` (${pending.length})` : ''}` },
        ]}
      />

      {tab === 'card' && (
        <>
          <div className="row-end gap">
            {openFights.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  const total = actions.resolveAll()
                  toast(total > 0 ? `Lutas encerradas! Você recebeu 🌽 ${fmt(total)}` : 'Lutas encerradas.', total > 0 ? 'ok' : 'info')
                }}
              >
                ⏩ Encerrar todas
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => {
                const r = actions.newCard()
                if (r.ok) toast('Novo card de lutas!', 'ok')
                else toast(r.error, 'erro')
              }}
            >
              🔄 Novo card
            </button>
          </div>

          <div className="fight-list">
            {s.card.fights.map((f) => {
              const myBets = s.bets.filter((b) => b.fightId === f.id)
              const closed = f.status === 'encerrada'
              return (
                <div key={f.id} className={`card fight-row ${closed ? 'closed' : ''} ${f.featured ? 'featured' : ''}`}>
                  {f.featured && <div className="featured-tag">{f.a.owner === 'Edição Eleições' ? '🗳️ Clássico Eleitoral' : '⭐ Luta principal'}</div>}
                  <div className="fr-main">
                    <Side ro={f.a} winner={closed && f.winner === 0} loser={closed && f.winner === 1} />
                    <div className="fr-center">
                      <span className="vs">VS</span>
                      {closed && <span className="tiny">{f.method === 'ko' ? '💥 K.O.' : '⚖️ Decisão'}</span>}
                    </div>
                    <Side ro={f.b} flip winner={closed && f.winner === 1} loser={closed && f.winner === 0} />
                  </div>
                  <div className="odds">
                    <OddBtn label={f.a.name} odds={f.oddsA} disabled={closed} won={closed && f.winner === 0} onClick={() => setSlip({ fight: f, pick: 'a' })} />
                    <OddBtn label="💥 K.O." odds={f.oddsKo} disabled={closed} won={closed && f.method === 'ko'} onClick={() => setSlip({ fight: f, pick: 'ko' })} />
                    <OddBtn label={f.b.name} odds={f.oddsB} disabled={closed} won={closed && f.winner === 1} onClick={() => setSlip({ fight: f, pick: 'b' })} />
                  </div>
                  <div className="fr-foot">
                    <span className="tiny muted">
                      {myBets.length ? `Suas apostas: ${myBets.map((b) => `${b.label} (🌽${fmt(b.amount)})`).join(', ')}` : 'Sem apostas suas'}
                    </span>
                    {!closed ? (
                      <button className="btn btn-sm btn-primary" onClick={() => watch(f.id)}>
                        ▶ Assistir
                      </button>
                    ) : (
                      <span className="tiny">Encerrada</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {openFights.length === 0 && (
            <Empty
              emoji="🏁"
              title="Todas as lutas acabaram"
              text="Gere um novo card para continuar apostando."
              action={
                <button className="btn btn-primary" onClick={() => actions.newCard()}>
                  🔄 Novo card
                </button>
              }
            />
          )}
        </>
      )}

      {tab === 'minhas' &&
        (s.bets.length === 0 ? (
          <Empty emoji="🎟️" title="Nenhuma aposta ainda" text="Escolha uma luta e clique numa odd para apostar." />
        ) : (
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Palpite</th>
                  <th>Odd</th>
                  <th>Valor</th>
                  <th>Retorno</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {s.bets.map((b) => (
                  <tr key={b.id}>
                    <td>{b.label}</td>
                    <td>{b.odds.toFixed(2)}</td>
                    <td>🌽 {fmt(b.amount)}</td>
                    <td>{b.status === 'pendente' ? `🌽 ${fmt(b.amount * b.odds)}` : b.payout ? `🌽 ${fmt(b.payout)}` : '—'}</td>
                    <td>
                      <span className={`status status-${b.status}`}>{b.status === 'pendente' ? '⏳ Pendente' : b.status === 'ganhou' ? '✅ Ganhou' : '❌ Perdeu'}</span>
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
            </div>
            <div className="slip-pick">
              <span>
                Palpite: <b>{slip.pick === 'a' ? `${slip.fight.a.name} vence` : slip.pick === 'b' ? `${slip.fight.b.name} vence` : 'Termina em K.O.'}</b>
              </span>
              <span className="odd-big">{odds.toFixed(2)}</span>
            </div>
            <label className="field">
              <span>Valor (🌽 milho)</span>
              <input type="number" min={10} max={Math.min(50000, s.milho)} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <div className="chips">
              {[50, 100, 500, 1000, 5000].map((v) => (
                <button key={v} className="chip clickable" onClick={() => setAmount(v)}>
                  {fmt(v)}
                </button>
              ))}
              <button className="chip clickable" onClick={() => setAmount(Math.min(50000, Math.floor(s.milho)))}>
                Máx
              </button>
            </div>
            <div className="slip-return">
              Retorno possível: <b>🌽 {fmt(amount * odds)}</b>
            </div>
            <button className="btn btn-primary full btn-lg" onClick={place} disabled={amount < 10 || amount > s.milho}>
              🎲 Confirmar aposta
            </button>
            <p className="tiny muted center">Moeda virtual do jogo. Não há dinheiro real envolvido.</p>
          </div>
        )}
      </Modal>

      <Modal open={info} onClose={() => setInfo(false)} title="ℹ️ Como funcionam as apostas">
        <ul className="info-list">
          <li>Cada luta do card é simulada centenas de vezes para calcular a chance de cada galo.</li>
          <li>As odds incluem uma margem da casa de {Math.round(HOUSE_EDGE * 100)}%. Odd 2.00 = você recebe o dobro do que apostou.</li>
          <li>
            <b>💥 K.O.</b> paga se a luta terminar em nocaute, não importa quem vença.
          </li>
          <li>Clique em <b>Assistir</b> para ver a luta ao vivo, ou em <b>Encerrar todas</b> para ver só os resultados.</li>
          <li>Aposta mínima 🌽 10, máxima 🌽 50.000.</li>
          <li>Tudo usa moeda virtual. Milho e ovos não podem ser trocados por dinheiro.</li>
        </ul>
      </Modal>
    </>
  )
}

function Side({ ro, flip, winner, loser }: { ro: HouseFight['a']; flip?: boolean; winner?: boolean; loser?: boolean }) {
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
