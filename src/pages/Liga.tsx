import { PageHead, go } from '../components/ui'
import { LEAGUE_TIERS } from '../game/data'
import { fmt } from '../game/rooster'
import { tierFor, useGame } from '../game/store'

export function Liga() {
  const { state, actions, toast } = useGame()
  const s = state!
  const rows = [...s.league.rows].sort((a, b) => b.points - a.points)
  const tier = tierFor(s.league.points)
  const nextTier = LEAGUE_TIERS.find((t) => t.min > s.league.points)
  const daysLeft = 7 - (Math.floor((Date.now() - Date.UTC(2024, 0, 1)) / 864e5) % 7)

  return (
    <>
      <PageHead
        title="🏆 Liga do Terreiro"
        subtitle={`Temporada ${s.league.season - 140} · termina em ${daysLeft} dia(s)`}
        right={
          <button className="btn btn-primary" onClick={() => go('/rinha')}>
            ⚔️ Lutar e pontuar
          </button>
        }
      />

      <div className="card league-hero">
        <div className="tier-emoji">{tier.emoji}</div>
        <div className="grow">
          <h2>{tier.name}</h2>
          <p className="muted">
            {s.league.points} pontos
            {nextTier ? ` · faltam ${nextTier.min - s.league.points} para ${nextTier.emoji} ${nextTier.name}` : ' · topo da liga!'}
          </p>
          {nextTier && (
            <div className="bar bar-xp">
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${((s.league.points - tier.min) / (nextTier.min - tier.min)) * 100}%` }} />
              </div>
            </div>
          )}
          <p className="tiny muted">Vitória: +15 (fácil) · +25 (médio) · +40 (difícil). Derrota: −8.</p>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Classificação</h3>
          <table className="table">
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.isPlayer ? 'me' : ''}>
                  <td className="pos-col">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</td>
                  <td>
                    {r.name}
                    {r.isPlayer && ' (você)'}
                  </td>
                  <td className="tiny">{tierFor(r.points).emoji}</td>
                  <td className="right">
                    <b>{fmt(r.points)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Recompensas da temporada</h3>
          <div className="list">
            {LEAGUE_TIERS.map((t) => {
              const reached = s.league.points >= t.min
              const claimed = s.league.claimed.includes(t.name)
              return (
                <div key={t.name} className={`list-row ${reached ? '' : 'locked'}`}>
                  <span className="big-emoji">{t.emoji}</span>
                  <div className="grow">
                    <b>{t.name}</b>
                    <div className="tiny muted">
                      {t.min} pts · 🌽 {fmt(t.reward.milho)} + 🥚 {t.reward.ovo}
                    </div>
                  </div>
                  {claimed ? (
                    <span className="tiny">✅</span>
                  ) : reached ? (
                    <button
                      className="btn btn-sm btn-primary pulse"
                      onClick={() => {
                        const r = actions.claimLeague(t.name)
                        if (r.ok) toast(`Recompensa ${t.name} resgatada!`, 'ok')
                      }}
                    >
                      Resgatar
                    </button>
                  ) : (
                    <span className="tiny muted">🔒</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
