import { useEffect, useMemo, useRef, useState } from 'react'
import { RoosterSvg, type Anim } from '../components/RoosterSvg'
import { Bar, Empty, StyleTag, go } from '../components/ui'
import { MAX_STA, simulate } from '../game/battle'
import { TOOL_BY_ID } from '../game/data'
import { fmt } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { BattleEvent } from '../game/types'

const BASE_MS = 1150

export function Luta() {
  const { match, actions } = useGame()
  const result = useMemo(() => (match ? simulate(match.a, match.b, match.seed, match.tools ?? [[], []]) : null), [match])
  const [idx, setIdx] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [anims, setAnims] = useState<[Anim, Anim]>(['idle', 'idle'])
  const [fx, setFx] = useState<{ key: number; side: 0 | 1; text: string; crit: boolean; miss: boolean } | null>(null)
  const [shake, setShake] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const logRef = useRef<HTMLOListElement>(null)

  const events = result?.events ?? []
  const done = idx >= events.length
  const finished = done && events.length > 0

  // Avança a narração
  useEffect(() => {
    if (!result || done) return
    const t = setTimeout(() => setIdx((i) => i + 1), idx === 0 ? 700 : BASE_MS / speed)
    return () => clearTimeout(t)
  }, [idx, speed, result, done])

  // Efeitos visuais de cada evento
  useEffect(() => {
    if (!result || idx === 0) return
    const ev = events[idx - 1]
    if (!ev) return
    const dur = Math.min(700, BASE_MS / speed - 80)
    const reset = () => setTimeout(() => setAnims((a) => [a[0] === 'ko' ? 'ko' : a[0] === 'win' ? 'win' : 'idle', a[1] === 'ko' ? 'ko' : a[1] === 'win' ? 'win' : 'idle']), dur)
    if (ev.t === 'intro' || ev.t === 'round') {
      sfx.bell()
      setBubble(ev.t === 'round' ? `ROUND ${ev.round}` : 'LUTEM!')
      setTimeout(() => setBubble(null), 900 / speed)
    } else if (ev.t === 'attack') {
      const a: [Anim, Anim] = ['idle', 'idle']
      a[ev.side] = 'attack'
      a[1 - ev.side] = ev.dodged ? 'miss' : 'hit'
      setAnims(a)
      setFx({ key: idx, side: (1 - ev.side) as 0 | 1, text: ev.dodged ? 'Errou!' : `-${ev.dmg}`, crit: ev.crit, miss: ev.dodged })
      if (ev.dodged) sfx.miss()
      else if (ev.crit) {
        sfx.crit()
        setShake(true)
        setTimeout(() => setShake(false), 400)
      } else sfx.hit()
      reset()
    } else if (ev.t === 'special') {
      const a: [Anim, Anim] = ['idle', 'idle']
      a[ev.side] = 'special'
      setAnims(a)
      setFx({ key: idx, side: ev.side, text: ev.move, crit: false, miss: false })
      sfx.special()
      reset()
    } else if (ev.t === 'tool') {
      const a: [Anim, Anim] = ['idle', 'idle']
      a[ev.side] = 'special'
      setAnims(a)
      setFx({ key: idx, side: ev.side, text: ev.emoji, crit: false, miss: true })
      sfx.special()
      reset()
    } else if (ev.t === 'defend') {
      const a: [Anim, Anim] = ['idle', 'idle']
      a[ev.side] = 'defend'
      setAnims(a)
      reset()
    } else if (ev.t === 'rest') {
      setFx({ key: idx, side: ev.side, text: '😮‍💨', crit: false, miss: true })
    } else if (ev.t === 'ko' || ev.t === 'decision') {
      const a: [Anim, Anim] = ['idle', 'idle']
      a[ev.winner] = 'win'
      a[1 - ev.winner] = ev.t === 'ko' ? 'ko' : 'idle'
      setAnims(a)
      setBubble(ev.t === 'ko' ? 'K.O.!' : 'DECISÃO!')
      if (ev.t === 'ko') sfx.ko()
      else sfx.bell()
      setTimeout(() => {
        const mineWon = match?.kind !== 'casa' ? ev.winner === (match?.mySide ?? 0) : (match?.myBets ?? []).some((b) => b.status === 'ganhou')
        const anyBet = match?.kind !== 'casa' || (match?.myBets?.length ?? 0) > 0
        if (anyBet) (mineWon ? sfx.win : sfx.lose)()
        else sfx.crow()
      }, 700)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  // Libera o saldo real no menu quando a luta termina
  useEffect(() => {
    if (finished) actions.releaseWallet()
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [idx])

  if (!match || !result) {
    return <Empty emoji="🥚" title="Nenhuma luta em andamento" text="Escolha uma luta na Arena ou nas Apostas." action={<button className="btn btn-primary" onClick={() => go('/rinha')}>Ir para a Arena</button>} />
  }

  // Estado atual de vida/fôlego
  let hp: [number, number] = [result.maxHp[0], result.maxHp[1]]
  let sta: [number, number] = [MAX_STA, MAX_STA]
  let round = 1
  for (let i = 0; i < idx && i < events.length; i++) {
    const e = events[i] as BattleEvent
    if ('hp' in e) {
      hp = e.hp
      sta = e.sta
    }
    if (e.t === 'round') round = e.round
  }

  const skip = () => {
    setSpeed(1)
    setIdx(events.length)
  }

  const isRinha = match.kind !== 'casa'
  const isPvp = match.kind === 'pvp'
  const mySide = match.mySide ?? 0
  const myRooster = mySide === 0 ? match.a : match.b
  const theirRooster = mySide === 0 ? match.b : match.a
  const back = () => {
    const to = isPvp ? '/desafios' : isRinha ? '/rinha' : '/apostas'
    actions.clearMatch()
    go(to)
  }
  const won = isRinha && result.winner === mySide
  const bets = match.myBets ?? []
  const betTotal = bets.reduce((a, b) => a + b.payout, 0)
  const betStake = bets.reduce((a, b) => a + b.amount, 0)

  return (
    <div className="fight-page">
      <button className="btn btn-ghost back" onClick={back}>
        ← Voltar {isPvp ? 'aos desafios' : isRinha ? 'à arena' : 'às lutas'}
      </button>
      <div className="center">
        <span className="pill">{isPvp ? '🤝 Desafio entre jogadores' : isRinha ? '⚔️ Arena' : '🏟️ Luta da casa'}</span>
      </div>

      <div className="hud">
        <FighterHud side={0} tools={match.tools?.[0]} name={match.a.name} sub={`${match.a.owner} · Nv ${match.a.level}`} style={match.a.style} hp={hp[0]} maxHp={result.maxHp[0]} sta={sta[0]} hurt={anims[0] === 'hit'} />
        <div className="hud-round">
          Round {round}/3
          {bets.length > 0 && <span className="tiny muted">{bets.length} aposta(s)</span>}
        </div>
        <FighterHud side={1} tools={match.tools?.[1]} name={match.b.name} sub={`${match.b.owner} · Nv ${match.b.level}`} style={match.b.style} hp={hp[1]} maxHp={result.maxHp[1]} sta={sta[1]} hurt={anims[1] === 'hit'} />
      </div>

      <div className={`arena ${shake ? 'shake' : ''}`}>
        <div className="arena-bg">
          <div className="lamp l1" />
          <div className="lamp l2" />
          <div className="crowd">
            {Array.from({ length: 22 }).map((_, i) => (
              <span key={i} className={`fan ${finished ? 'cheer' : ''}`} style={{ left: `${i * 4.6}%`, animationDelay: `${(i % 5) * 0.12}s`, height: `${46 + ((i * 17) % 22)}px` }} />
            ))}
          </div>
          <div className="fence">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="post" style={{ left: `${i * 9}%` }} />
            ))}
          </div>
          <div className="ring" />
          <div className="straw" />
        </div>

        {bubble && <div className={`bubble ${bubble === 'K.O.!' ? 'ko' : ''}`}>{bubble}</div>}

        {[0, 1].map((side) => (
          <div key={side} className={`fighter fighter-${side} ${anims[side] === 'attack' ? 'lunge' : ''}`}>
            <RoosterSvg breedId={side === 0 ? match.a.breedId : match.b.breedId} skin={side === 0 ? match.a.skin : match.b.skin} equipped={side === 0 ? match.a.equipped : match.b.equipped} flip={side === 1} anim={anims[side]} size="100%" />
            {fx && fx.side === side && (
              <div key={fx.key} className={`dmg ${fx.crit ? 'crit' : ''} ${fx.miss ? 'miss' : ''}`}>
                {fx.text}
              </div>
            )}
            {fx && fx.side === side && !fx.miss && fx.text.startsWith('-') && (
              <div key={`f${fx.key}`} className="feathers">
                {Array.from({ length: fx.crit ? 7 : 4 }).map((_, i) => (
                  <span key={i} style={{ ['--dx' as string]: `${(i - 3) * 22}px`, animationDelay: `${i * 0.03}s` }}>
                    🪶
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="speed">
        {[1, 2, 3].map((v) => (
          <button key={v} className={`btn btn-sm ${speed === v ? 'btn-primary' : ''}`} onClick={() => setSpeed(v)} disabled={finished}>
            {v}x
          </button>
        ))}
        <button className="btn btn-sm" onClick={skip} disabled={finished}>
          ⏭ Pular
        </button>
      </div>

      {finished && (
        <div className={`card result ${isRinha ? (won ? 'win' : 'lose') : betTotal > 0 ? 'win' : bets.length ? 'lose' : ''}`}>
          {isRinha ? (
            <>
              <h2>{won ? '🏆 VITÓRIA!' : '😵 Derrota...'}</h2>
              <p className="muted">
                {won ? `${myRooster.name} venceu ${result.method === 'ko' ? 'por K.O.' : 'por decisão dos juízes'}!` : `${myRooster.name} lutou bravamente, mas ${theirRooster.name} levou essa.`}
              </p>
              {match.rewards && (
                <div className="rewards">
                  <span>🌽 +{fmt(match.rewards.milho)}</span>
                  {match.rewards.ovo > 0 && <span>🥚 +{match.rewards.ovo}</span>}
                  <span>✨ +{match.rewards.xp} XP</span>
                  <span>
                    🏆 {match.rewards.points >= 0 ? '+' : ''}
                    {match.rewards.points} pts
                  </span>
                  {match.rewards.levels > 0 && <span className="lvlup">⭐ Subiu de nível!</span>}
                </div>
              )}
              {match.limited && <p className="tiny muted">Você já usou os desafios com prêmio de hoje. Este valeu só pelo recorde.</p>}
              <div className="row-center gap">
                <button className="btn btn-primary" onClick={back}>
                  ⚔️ {isPvp ? 'Novo desafio' : 'Lutar de novo'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    actions.clearMatch()
                    go(`/galinheiro/${myRooster.id}`)
                  }}
                >
                  🏠 Ver galo
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>{result.winner === 0 ? match.a.name : match.b.name} venceu {result.method === 'ko' ? 'por K.O.' : 'por decisão'}!</h2>
              {bets.length === 0 ? (
                <p className="muted">Você não apostou nessa luta.</p>
              ) : (
                <div className="list">
                  {bets.map((b) => (
                    <div key={b.id} className={`list-row bet-${b.status}`}>
                      <span>{b.status === 'ganhou' ? '✅' : '❌'}</span>
                      <div className="grow">
                        {b.label} @ {b.odds.toFixed(2)}
                      </div>
                      <b>{b.status === 'ganhou' ? `+🌽 ${fmt(b.payout)}` : `-🌽 ${fmt(b.amount)}`}</b>
                    </div>
                  ))}
                  <p className="center">
                    Resultado: <b className={betTotal - betStake >= 0 ? 'pos' : 'neg'}>{betTotal - betStake >= 0 ? '+' : ''}🌽 {fmt(betTotal - betStake)}</b>
                  </p>
                </div>
              )}
              <div className="row-center gap">
                <button className="btn btn-primary" onClick={back}>
                  🎲 Voltar às apostas
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card narration">
        <h3>Narração</h3>
        <ol ref={logRef}>
          {events.slice(0, idx).map((e, i) => (
            <li key={i} className={`ev-${e.t} ${'crit' in e && e.crit ? 'ev-crit' : ''}`}>
              {e.text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function FighterHud({ side, name, sub, style, hp, maxHp, sta, hurt, tools }: { tools?: string[]; side: 0 | 1; name: string; sub: string; style: Parameters<typeof StyleTag>[0]['style']; hp: number; maxHp: number; sta: number; hurt: boolean }) {
  return (
    <div className={`card hud-card side-${side} ${hp <= 0 ? 'down' : ''} ${hurt ? 'hurt' : ''}`}>
      <b className="hud-name">{name}</b>
      <span className="tiny muted">{sub}</span>
      <div className="hud-tags">
        <StyleTag style={style} />
        {tools?.map((t) => (
          <span key={t} className="tool-chip" title={TOOL_BY_ID[t]?.desc}>
            {TOOL_BY_ID[t]?.emoji}
          </span>
        ))}
      </div>
      <div className="hud-bar">
        <span>❤️</span>
        <Bar value={hp} max={maxHp} kind="hp" />
        <span className="tiny">
          {hp}/{maxHp}
        </span>
      </div>
      <div className="hud-bar">
        <span>⚡</span>
        <Bar value={sta} max={MAX_STA} kind="sta" />
        <span className="tiny">🔥 {sta}</span>
      </div>
    </div>
  )
}
