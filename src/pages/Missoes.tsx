import { Bar, PageHead } from '../components/ui'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import type { MissionKind } from '../game/types'
import { t, tx } from '../i18n'

const LINKS: Record<MissionKind, string> = {
  vencer: '#/rinha',
  lutar: '#/rinha',
  ko: '#/rinha',
  apostar: '#/apostas',
  ganhar_aposta: '#/apostas',
  assistir: '#/apostas',
  treinar: '#/galinheiro',
  equipar: '#/galinheiro',
  comprar: '#/loja',
}

export function Missoes() {
  const { state, actions, toast } = useGame()
  const s = state!
  const done = s.missions.list.filter((m) => m.claimed).length
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  const hrs = Math.floor((midnight.getTime() - now.getTime()) / 36e5)
  const mins = Math.floor(((midnight.getTime() - now.getTime()) % 36e5) / 6e4)

  return (
    <>
      <PageHead title={t('🎯 Missões diárias')} subtitle={t('Novas missões em {h}h {m}min · {feitas}/{total} resgatadas', { h: hrs, m: mins, feitas: done, total: s.missions.list.length })} />
      <div className="missions">
        {s.missions.list.map((m) => {
          const ready = m.progress >= m.goal && !m.claimed
          return (
            <div key={m.id} className={`card mission ${m.claimed ? 'claimed' : ''} ${ready ? 'ready' : ''}`}>
              <div className="grow">
                <b>{tx(m.text)}</b>
                <Bar value={m.progress} max={m.goal} kind="xp" label={`${m.progress}/${m.goal}`} />
              </div>
              <div className="mission-reward">
                <span>🌽 {fmt(m.reward.milho)}</span>
                {m.reward.ovo > 0 && <span>🥚 {m.reward.ovo}</span>}
              </div>
              {m.claimed ? (
                <span className="tiny">{t('✅ Resgatada')}</span>
              ) : ready ? (
                <button
                  className="btn btn-primary pulse"
                  onClick={() => {
                    const r = actions.claimMission(m.id)
                    if (r.ok) toast(t('Missão concluída! +🌽 {milho}', { milho: fmt(m.reward.milho) }) + (m.reward.ovo ? ` +🥚 ${m.reward.ovo}` : ''), 'ok') // i18n-ok
                  }}
                >
                  {t('Resgatar')}
                </button>
              ) : (
                <a className="btn btn-sm" href={LINKS[m.kind]}>
                  {t('Ir →')}
                </a>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted tiny center">{t('Conquistas também dão 🥚 5 cada. Veja todas no seu Perfil.')}</p>
    </>
  )
}
