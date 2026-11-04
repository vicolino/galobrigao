import { Bar, PageHead } from '../components/ui'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import type { MissionKind } from '../game/types'

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
      <PageHead title="🎯 Missões diárias" subtitle={`Novas missões em ${hrs}h ${mins}min · ${done}/${s.missions.list.length} resgatadas`} />
      <div className="missions">
        {s.missions.list.map((m) => {
          const ready = m.progress >= m.goal && !m.claimed
          return (
            <div key={m.id} className={`card mission ${m.claimed ? 'claimed' : ''} ${ready ? 'ready' : ''}`}>
              <div className="grow">
                <b>{m.text}</b>
                <Bar value={m.progress} max={m.goal} kind="xp" label={`${m.progress}/${m.goal}`} />
              </div>
              <div className="mission-reward">
                <span>🌽 {fmt(m.reward.milho)}</span>
                {m.reward.ovo > 0 && <span>🥚 {m.reward.ovo}</span>}
              </div>
              {m.claimed ? (
                <span className="tiny">✅ Resgatada</span>
              ) : ready ? (
                <button
                  className="btn btn-primary pulse"
                  onClick={() => {
                    const r = actions.claimMission(m.id)
                    if (r.ok) toast(`Missão concluída! +🌽 ${fmt(m.reward.milho)}${m.reward.ovo ? ` +🥚 ${m.reward.ovo}` : ''}`, 'ok')
                  }}
                >
                  Resgatar
                </button>
              ) : (
                <a className="btn btn-sm" href={LINKS[m.kind]}>
                  Ir →
                </a>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted tiny center">Conquistas também dão 🥚 5 cada. Veja todas no seu Perfil.</p>
    </>
  )
}
