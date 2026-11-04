import { useMemo, useState } from 'react'
import { RoosterSvg } from '../components/RoosterSvg'
import { PageHead, RarityTag, RoosterCard, Stars, StyleTag, go } from '../components/ui'
import { estimate } from '../game/battle'
import { BREED_BY_ID, MAX_TOOLS, NPC_OWNERS, TOOLS, TOOL_BY_ID } from '../game/data'
import { ENERGY_COST, currentEnergy, pick, power } from '../game/rooster'
import { sfx } from '../game/sound'
import { makeOpponent, opponentTools, tierFor, useGame } from '../game/store'
import type { Rooster } from '../game/types'

const DIFFS = [
  { label: 'Fácil', emoji: '🐣', cls: 'easy', reward: 'Pouco milho' },
  { label: 'Médio', emoji: '🐔', cls: 'medium', reward: 'Bom prêmio' },
  { label: 'Difícil', emoji: '🦅', cls: 'hard', reward: 'Prêmio alto + 🥚' },
] as const

export function Rinha() {
  const { state, actions, toast } = useGame()
  const s = state!
  const queryId = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('galo')
  const sorted = [...s.roosters].sort((a, b) => currentEnergy(b) - currentEnergy(a) || b.level - a.level)
  const [selId, setSelId] = useState(queryId && s.roosters.some((r) => r.id === queryId) ? queryId : sorted[0]?.id)
  const mine = s.roosters.find((r) => r.id === selId) ?? s.roosters[0]
  const [nonce, setNonce] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const myTools = picked.filter((t) => (s.tools[t] ?? 0) > 0)
  const toggleTool = (id: string) => {
    sfx.click()
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_TOOLS ? [...p.slice(1), id] : [...p, id]))
  }

  const opponents = useMemo(() => {
    return ([0, 1, 2] as const).map((d) => {
      const o = makeOpponent(mine, d)
      o.owner = pick(NPC_OWNERS)
      return { d, o, tools: opponentTools(d) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.id, nonce])

  const chances = useMemo(
    () => opponents.map(({ o, tools }) => estimate(mine, o, 120, [myTools, tools]).pA),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opponents, mine.level, mine.style, JSON.stringify(mine.equipped), myTools.join()],
  )

  const fight = (o: Rooster, d: 0 | 1 | 2, oppTools: string[]) => {
    const r = actions.startRinha(mine.id, o, d, myTools, oppTools)
    if (!r.ok) {
      toast(r.error, 'erro')
      return
    }
    sfx.bell()
    go('/luta')
  }

  const tier = tierFor(s.league.points)

  return (
    <>
      <PageHead
        title="⚔️ Arena"
        subtitle="Escolha seu galo e um adversário. Vitórias dão milho, XP e pontos de liga."
        right={
          <div className="pill">
            {tier.emoji} {tier.name} · {s.league.points} pts
          </div>
        }
      />

      <h2 className="section-title">1. Seu lutador</h2>
      <div className="scroller">
        {sorted.map((r) => (
          <div key={r.id} className="scroller-item">
            <RoosterCard ro={r} compact selected={r.id === mine.id} onClick={() => setSelId(r.id)} />
          </div>
        ))}
      </div>

      <div className="row-between">
        <h2 className="section-title">2. Ferramentas de luta <span className="tiny muted">(até {MAX_TOOLS})</span></h2>
        <a className="btn btn-sm" href="#/loja/ferramentas">
          🧰 Comprar mais
        </a>
      </div>
      <div className="tool-pick">
        {TOOLS.map((t) => {
          const qty = s.tools[t.id] ?? 0
          const on = myTools.includes(t.id)
          return (
            <button key={t.id} className={`tool-btn rar-${t.rarity} ${on ? 'on' : ''}`} disabled={qty === 0} onClick={() => toggleTool(t.id)} title={t.desc}>
              <span className="tool-emoji">{t.emoji}</span>
              <span className="tool-name">{t.name}</span>
              <span className="tool-qty">×{qty}</span>
            </button>
          )
        })}
      </div>
      {myTools.length > 0 && (
        <p className="tiny pos">
          Levando: {myTools.map((t) => `${TOOL_BY_ID[t].emoji} ${TOOL_BY_ID[t].name}`).join(' + ')} · serão gastas na luta
        </p>
      )}

      <div className="row-between">
        <h2 className="section-title">3. Escolha o adversário</h2>
        <button className="btn btn-sm" onClick={() => setNonce((n) => n + 1)}>
          🔄 Outros adversários
        </button>
      </div>

      {currentEnergy(mine) < ENERGY_COST && (
        <div className="warn">
          ⚡ {mine.name} está sem energia ({currentEnergy(mine)}/{ENERGY_COST}). Espere recuperar (+1/min) ou{' '}
          <a href={`#/galinheiro/${mine.id}`}>dê uma ração</a>.
        </div>
      )}

      <div className="opponents">
        {opponents.map(({ d, o, tools }, idx) => {
          const chance = chances[idx] ?? 0.5
          const b = BREED_BY_ID[o.breedId]
          const diff = DIFFS[d]
          return (
            <div key={o.id} className={`card opp diff-${diff.cls}`}>
              <div className="opp-head">
                <span className={`diff-tag ${diff.cls}`}>
                  {diff.emoji} {diff.label}
                </span>
                <span className="tiny muted">{diff.reward}</span>
              </div>
              <div className="opp-vs">
                <RoosterSvg breedId={mine.breedId} skin={mine.skin} equipped={mine.equipped} size={90} anim="none" />
                <span className="vs">VS</span>
                <RoosterSvg breedId={o.breedId} skin={o.skin} equipped={o.equipped} size={90} flip anim="idle" />
              </div>
              <div className="rc-name">{o.name}</div>
              <div className="rc-sub">
                {o.owner} · {b.name} · Nv {o.level}
              </div>
              <div className="rc-row">
                <RarityTag rarity={b.rarity} /> <Stars n={o.stars} />
              </div>
              <div className="rc-row">
                <StyleTag style={o.style} />
                <span className="power">⚡ {power(o)}</span>
              </div>
              {tools.length > 0 && (
                <div className="tiny opp-tools">
                  Leva: {tools.map((t) => <span key={t} className="tool-chip" title={TOOL_BY_ID[t].name}>{TOOL_BY_ID[t].emoji}</span>)}
                </div>
              )}
              <div className="chance">
                <div className="chance-bar">
                  <div style={{ width: `${Math.round(chance * 100)}%` }} />
                </div>
                <span>Chance de vitória: ~{Math.round(chance * 100)}%</span>
              </div>
              <button className="btn btn-primary full" onClick={() => fight(o, d, tools)} disabled={currentEnergy(mine) < ENERGY_COST}>
                ⚔️ Lutar (⚡{ENERGY_COST})
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
