import { PageHead, go } from '../components/ui'
import { LEAGUE_TIERS } from '../game/data'
import { fmt } from '../game/rooster'
import { tierFor, useGame } from '../game/store'
import { t, tp, tx } from '../i18n'

export function Liga() {
  const { state, actions, toast } = useGame()
  const s = state!
  const rows = [...s.league.rows].sort((a, b) => b.points - a.points)
  const tier = tierFor(s.league.points)
  const nextTier = LEAGUE_TIERS.find((tr) => tr.min > s.league.points)
  const daysLeft = 7 - (Math.floor((Date.now() - Date.UTC(2024, 0, 1)) / 864e5) % 7)

  return (
    <>
      <PageHead
        title={t('🏆 Liga do Terreiro')}
        subtitle={tp('Temporada {temporada} · termina em {n} dia', 'Temporada {temporada} · termina em {n} dias', daysLeft, { temporada: s.league.season - 140 })}
        right={
          <button className="btn btn-primary" onClick={() => go('/rinha')}>
            {t('⚔️ Lutar e pontuar')}
          </button>
        }
      />

      <div className="card league-hero">
        <div className="tier-emoji">{tier.emoji}</div>
        <div className="grow">
          <h2>{tx(tier.name)}</h2>
          <p className="muted">
            {t('{n} pontos', { n: fmt(s.league.points) })}
            {nextTier ? t(' · faltam {n} para {tier}', { n: fmt(nextTier.min - s.league.points), tier: `${nextTier.emoji} ${tx(nextTier.name)}` }) : t(' · topo da liga!')}
          </p>
          {nextTier && (
            <div className="bar bar-xp">
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${((s.league.points - tier.min) / (nextTier.min - tier.min)) * 100}%` }} />
              </div>
            </div>
          )}
          <p className="tiny muted">{t('Vitória: +15 (fácil) · +25 (médio) · +40 (difícil). Derrota: −8.')}</p>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>{t('Classificação')}</h3>
          <table className="table">
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.isPlayer ? 'me' : ''}>
                  <td className="pos-col">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : t('{n}º', { n: i + 1 })}</td>
                  <td>
                    {tx(r.name)}
                    {r.isPlayer && t(' (você)')}
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
          <h3>{t('Recompensas da temporada')}</h3>
          <div className="list">
            {LEAGUE_TIERS.map((tr) => {
              const reached = s.league.points >= tr.min
              const claimed = s.league.claimed.includes(tr.name)
              return (
                <div key={tr.name} className={`list-row ${reached ? '' : 'locked'}`}>
                  <span className="big-emoji">{tr.emoji}</span>
                  <div className="grow">
                    <b>{tx(tr.name)}</b>
                    <div className="tiny muted">
                      {t('{n} pts', { n: fmt(tr.min) })} · 🌽 {fmt(tr.reward.milho)} + 🥚 {tr.reward.ovo}
                    </div>
                  </div>
                  {claimed ? (
                    <span className="tiny">✅</span>
                  ) : reached ? (
                    <button
                      className="btn btn-sm btn-primary pulse"
                      onClick={() => {
                        const r = actions.claimLeague(tr.name)
                        if (r.ok) toast(t('Recompensa {tier} resgatada!', { tier: tx(tr.name) }), 'ok')
                      }}
                    >
                      {t('Resgatar')}
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
