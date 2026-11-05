import { useEffect, useMemo, useRef, useState } from 'react'
import { RoosterSvg, type Anim } from '../components/RoosterSvg'
import { Bar, Empty, StyleTag, go } from '../components/ui'
import { MAX_STA, simulate } from '../game/battle'
import { BREED_BY_ID, TOOL_BY_ID } from '../game/data'
import { fmt } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { BattleEvent, Rooster, Tool, ToolProc } from '../game/types'
import { t, tn, tp, tx } from '../i18n'

const BASE_MS = 1150
/** Duração da entrada dos lutadores (acompanha a vinheta de 6 tempos a 128 BPM). */
const INTRO_MS = 2900

/** A Banda que toca no início de cada round (curta) — as entradas vêm antes do primeiro round. */
function isRoundBanda(events: BattleEvent[], i: number) {
  return events[i]?.t === 'tool' && events.slice(0, i).some((e) => e.t === 'round')
}

/** Quanto cada evento fica na tela (em múltiplos do tempo base). A charanga da Banda dura ~3 s. */
function holdFor(events: BattleEvent[], i: number) {
  const ev = events[i]
  if (ev?.t !== 'tool') return 1
  if (ev.emoji === '🥁') return isRoundBanda(events, i) ? 1.6 : 3
  return 1.5
}

/** Texto curto do efeito da ferramenta quando ela age. */
function procLabel(tool: Tool) {
  const pct = Math.round(tool.value * 100)
  switch (tool.effect) {
    case 'atk': return t('Ataque +{pct}%', { pct })
    case 'def': return t('Dano −{pct}%', { pct })
    case 'tudo': return t('Torcida +{pct}%', { pct })
    case 'critico': return t('Crítico!')
    case 'esquiva': return t('Esquivou!')
    case 'sta': return t('Fôlego!')
    case 'cura': return t('Cura +{pct}%', { pct })
    case 'fenix': return t('Renasceu!')
    default: return t('Turbinado!')
  }
}

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
  const [intro, setIntro] = useState(true)
  const [toolCard, setToolCard] = useState<{ key: number; side: 0 | 1; id: string; text: string } | null>(null)
  const [procs, setProcs] = useState<{ key: number; list: ToolProc[] } | null>(null)

  // Entrada estilo UFC antes de cada luta
  useEffect(() => {
    if (!match) return
    setIdx(0)
    setIntro(true)
    sfx.walkout()
    const vs = setTimeout(() => {
      setShake(true)
      setTimeout(() => setShake(false), 400)
    }, 1400)
    const t = setTimeout(() => setIntro(false), INTRO_MS)
    return () => {
      clearTimeout(t)
      clearTimeout(vs)
    }
  }, [match])

  const events = result?.events ?? []
  const done = idx >= events.length
  const finished = done && events.length > 0

  // Avança a narração
  useEffect(() => {
    if (!result || done || intro) return
    const t = setTimeout(() => setIdx((i) => i + 1), idx === 0 ? 300 : (BASE_MS * holdFor(events, idx - 1)) / speed)
    return () => clearTimeout(t)
  }, [idx, speed, result, done, intro])

  // Efeitos visuais de cada evento
  useEffect(() => {
    if (!result || idx === 0) return
    const ev = events[idx - 1]
    if (!ev) return
    const dur = Math.min(700, BASE_MS / speed - 80)
    const reset = () => setTimeout(() => setAnims((a) => [a[0] === 'ko' ? 'ko' : a[0] === 'win' ? 'win' : 'idle', a[1] === 'ko' ? 'ko' : a[1] === 'win' ? 'win' : 'idle']), dur)
    if (ev.t === 'intro' || ev.t === 'round') {
      sfx.bell()
      setBubble(ev.t === 'round' ? t('ROUND {n}', { n: ev.round }) : t('LUTEM!'))
      setTimeout(() => setBubble(null), 900 / speed)
    } else if (ev.t === 'attack') {
      const a: [Anim, Anim] = ['idle', 'idle']
      a[ev.side] = 'attack'
      a[1 - ev.side] = ev.dodged ? 'miss' : 'hit'
      setAnims(a)
      setFx({ key: idx, side: (1 - ev.side) as 0 | 1, text: ev.dodged ? t('Errou!') : `-${ev.dmg}`, crit: ev.crit, miss: ev.dodged })
      if (ev.boost?.length) {
        setProcs({ key: idx, list: ev.boost })
        setTimeout(sfx.proc, 120)
      }
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
      const id = Object.values(TOOL_BY_ID).find((t) => t.emoji === ev.emoji)?.id ?? ''
      setToolCard({ key: idx, side: ev.side, id, text: ev.text })
      setProcs({ key: idx, list: id ? [{ side: ev.side, tool: id }] : [] })
      setTimeout(() => setToolCard((c) => (c?.key === idx ? null : c)), (BASE_MS * (holdFor(events, idx - 1) - 0.1)) / speed)
      if (ev.emoji === '🥁') sfx.charanga(isRoundBanda(events, idx - 1))
      else sfx.powerup()
      reset()
    } else if (ev.t === 'defend') {
      const a: [Anim, Anim] = ['idle', 'idle']
      a[ev.side] = 'defend'
      setAnims(a)
      reset()
    } else if (ev.t === 'rest') {
      setFx({ key: idx, side: ev.side, text: '😮‍💨', crit: false, miss: true })
      if (ev.boost?.length) setProcs({ key: idx, list: ev.boost })
    } else if (ev.t === 'ko' || ev.t === 'decision') {
      const a: [Anim, Anim] = ['idle', 'idle']
      a[ev.winner] = 'win'
      a[1 - ev.winner] = ev.t === 'ko' ? 'ko' : 'idle'
      setAnims(a)
      setBubble(ev.t === 'ko' ? 'K.O.!' : t('DECISÃO!'))
      if (ev.t === 'ko') sfx.ko()
      else sfx.bell()
      setTimeout(() => {
        const mineWon = match?.kind !== 'casa' ? ev.winner === (match?.mySide ?? 0) : (match?.myBets ?? []).some((b) => b.status === 'ganhou')
        const anyBet = match?.kind === 'torneio' ? match.mySide !== undefined : match?.kind !== 'casa' || (match?.myBets?.length ?? 0) > 0
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
    return <Empty emoji="🥚" title={t('Nenhuma luta em andamento')} text={t('Escolha uma luta na Arena ou nas Apostas.')} action={<button className="btn btn-primary" onClick={() => go('/rinha')}>{t('Ir para a Arena')}</button>} />
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
    setIntro(false)
    setSpeed(1)
    setIdx(events.length)
  }

  const isTorneio = match.kind === 'torneio'
  const isRinha = match.kind !== 'casa' && !isTorneio
  const isPvp = match.kind === 'pvp'
  const mySide = match.mySide ?? 0
  const myRooster = mySide === 0 ? match.a : match.b
  const theirRooster = mySide === 0 ? match.b : match.a
  const back = () => {
    const to = isTorneio ? `/torneios${match.fightId ? `/${match.fightId}` : ''}` : isPvp ? '/desafios' : isRinha ? '/rinha' : '/apostas'
    actions.clearMatch()
    go(to)
  }
  const won = isRinha && result.winner === mySide
  const bets = match.myBets ?? []
  const betTotal = bets.reduce((a, b) => a + b.payout, 0)
  const betStake = bets.reduce((a, b) => a + b.amount, 0)
  // Apostas novas são em 🎟️ fichas; as antigas (antes das fichas) foram em milho
  const betCur = (b: (typeof bets)[number]) => (b.currency === 'milho' ? '🌽' : '🎟️')

  return (
    <div className="fight-page">
      <button className="btn btn-ghost back" onClick={back}>
        {isTorneio ? t('← Voltar ao torneio') : isPvp ? t('← Voltar aos desafios') : isRinha ? t('← Voltar à arena') : t('← Voltar às lutas')}
      </button>
      <div className="center">
        <span className="pill">{isTorneio ? t('🏟️ Torneio') : isPvp ? t('🤝 Desafio entre jogadores') : isRinha ? t('⚔️ Arena') : t('🏟️ Luta da casa')}</span>
      </div>

      <div className="hud">
        <FighterHud side={0} tools={match.tools?.[0]} pulse={procs?.list.filter((p) => p.side === 0).map((p) => p.tool)} pulseKey={procs?.key} name={match.a.name} sub={t('{dono} · Nv {nivel}', { dono: match.a.owner, nivel: match.a.level })} style={match.a.style} hp={hp[0]} maxHp={result.maxHp[0]} sta={sta[0]} hurt={anims[0] === 'hit'} />
        <div className="hud-round">
          {t('Round {n}/3', { n: round })}
          {bets.length > 0 && <span className="tiny muted">{tp('{n} aposta', '{n} apostas', bets.length)}</span>}
        </div>
        <FighterHud side={1} tools={match.tools?.[1]} pulse={procs?.list.filter((p) => p.side === 1).map((p) => p.tool)} pulseKey={procs?.key} name={match.b.name} sub={t('{dono} · Nv {nivel}', { dono: match.b.owner, nivel: match.b.level })} style={match.b.style} hp={hp[1]} maxHp={result.maxHp[1]} sta={sta[1]} hurt={anims[1] === 'hit'} />
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

        {([0, 1] as const).map((side) =>
          match.tools?.[side]?.includes('banda') ? (
            <div key={`banda${side}`} className={`banda banda-${side} ${toolCard?.id === 'banda' && toolCard.side === side ? 'loud' : ''}`} aria-hidden>
              <span>🥁</span>
              <span>🎺</span>
              <span>🥁</span>
            </div>
          ) : null,
        )}
        {intro && <Walkout a={match.a} b={match.b} tools={match.tools} />}
        {toolCard && !intro && TOOL_BY_ID[toolCard.id] && (
          <div key={toolCard.key} className={`tool-banner side-${toolCard.side} r-${TOOL_BY_ID[toolCard.id].rarity}`}>
            <span className="tb-emoji">{TOOL_BY_ID[toolCard.id].emoji}</span>
            <div>
              <b>{TOOL_BY_ID[toolCard.id].name}</b>
              <span>{procLabel(TOOL_BY_ID[toolCard.id])} · {toolCard.side === 0 ? match.a.name : match.b.name}</span>
            </div>
          </div>
        )}
        {bubble && !intro && <div className={`bubble ${bubble === 'K.O.!' ? 'ko' : ''}`}>{bubble}</div>}

        {[0, 1].map((side) => (
          <div key={side} className={`fighter fighter-${side} ${anims[side] === 'attack' ? 'lunge' : ''} ${intro ? `enter-${side}` : ''}`}>
            {(match.tools?.[side]?.length ?? 0) > 0 && <div className={`tool-aura ${procs?.list.some((p) => p.side === side) ? 'on' : ''}`} key={`aura${procs?.key ?? 0}`} />}
            {(match.tools?.[side]?.length ?? 0) > 0 && (
              <div className="fighter-tools">
                {match.tools![side].map((t) => (
                  <span key={t} title={TOOL_BY_ID[t]?.name}>
                    {TOOL_BY_ID[t]?.emoji}
                  </span>
                ))}
              </div>
            )}
            {procs && !intro && procs.list.some((p) => p.side === side) && (
              <div key={`p${procs.key}`} className="tool-procs">
                {procs.list
                  .filter((p) => p.side === side && TOOL_BY_ID[p.tool])
                  .map((p) => (
                    <span key={p.tool} className={`r-${TOOL_BY_ID[p.tool].rarity}`}>
                      {TOOL_BY_ID[p.tool].emoji} {procLabel(TOOL_BY_ID[p.tool])}
                    </span>
                  ))}
              </div>
            )}
            <RoosterSvg breedId={side === 0 ? match.a.breedId : match.b.breedId} skin={side === 0 ? match.a.skin : match.b.skin} equipped={side === 0 ? match.a.equipped : match.b.equipped} tint={side === 0 ? match.a.tint : match.b.tint} flip={side === 1} anim={anims[side]} size="100%" />
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
        {intro && (
          <button className="btn btn-sm" onClick={() => setIntro(false)}>
            {t('⏩ Pular entrada')}
          </button>
        )}
        {[1, 2, 3].map((v) => (
          <button key={v} className={`btn btn-sm ${speed === v ? 'btn-primary' : ''}`} onClick={() => setSpeed(v)} disabled={finished}>
            {v}x
          </button>
        ))}
        <button className="btn btn-sm" onClick={skip} disabled={finished}>
          {t('⏭ Pular')}
        </button>
      </div>

      {finished && (
        <div className={`card result ${isTorneio ? (match.mySide === undefined ? '' : result.winner === mySide ? 'win' : 'lose') : isRinha ? (won ? 'win' : 'lose') : betTotal > 0 ? 'win' : bets.length ? 'lose' : ''}`}>
          {isTorneio ? (
            <>
              <h2>{result.method === 'ko' ? t('{nome} venceu por K.O.!', { nome: result.winner === 0 ? match.a.name : match.b.name }) : t('{nome} venceu por decisão!', { nome: result.winner === 0 ? match.a.name : match.b.name })}</h2>
              {match.mySide !== undefined && <p className="muted">{result.winner === mySide ? t('{nome} passou de fase! 🏟️', { nome: myRooster.name }) : t('{nome} foi eliminado. Fica para o próximo torneio!', { nome: myRooster.name })}</p>}
              <div className="row-center gap">
                <button className="btn btn-primary" onClick={back}>
                  {t('🏟️ Voltar ao torneio')}
                </button>
              </div>
            </>
          ) : isRinha ? (
            <>
              <h2>{won ? t('🏆 VITÓRIA!') : t('😵 Derrota...')}</h2>
              <p className="muted">
                {won
                  ? result.method === 'ko'
                    ? t('{nome} venceu por K.O.!', { nome: myRooster.name })
                    : t('{nome} venceu por decisão dos juízes!', { nome: myRooster.name })
                  : t('{nome} lutou bravamente, mas {rival} levou essa.', { nome: myRooster.name, rival: theirRooster.name })}
              </p>
              {match.rewards && (
                <div className="rewards">
                  <span>🌽 +{fmt(match.rewards.milho)}</span>
                  {match.rewards.ovo > 0 && <span>🥚 +{match.rewards.ovo}</span>}
                  {(match.rewards.fichas ?? 0) > 0 && <span title={t('Fichas são só para apostar: você ganha jogando, não dá para comprar nem trocar.')}>🎟️ +{fmt(match.rewards.fichas!)}</span>}
                  <span>✨ +{match.rewards.xp} XP</span>
                  <span>
                    🏆 {match.rewards.points >= 0 ? '+' : ''}
                    {t('{n} pts', { n: match.rewards.points })}
                  </span>
                  {match.rewards.levels > 0 && <span className="lvlup">{t('⭐ Subiu de nível!')}</span>}
                </div>
              )}
              {match.limited && <p className="tiny muted">{t('Você já usou os desafios com prêmio de hoje. Este valeu só pelo recorde.')}</p>}
              <div className="row-center gap">
                <button className="btn btn-primary" onClick={back}>
                  {isPvp ? t('⚔️ Novo desafio') : t('⚔️ Lutar de novo')}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    actions.clearMatch()
                    go(`/galinheiro/${myRooster.id}`)
                  }}
                >
                  {t('🏠 Ver galo')}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>{result.method === 'ko' ? t('{nome} venceu por K.O.!', { nome: result.winner === 0 ? match.a.name : match.b.name }) : t('{nome} venceu por decisão!', { nome: result.winner === 0 ? match.a.name : match.b.name })}</h2>
              {bets.length === 0 ? (
                <p className="muted">{t('Você não apostou nessa luta.')}</p>
              ) : (
                <div className="list">
                  {bets.map((b) => (
                    <div key={b.id} className={`list-row bet-${b.status}`}>
                      <span>{b.status === 'ganhou' ? '✅' : '❌'}</span>
                      <div className="grow">
                        {tx(b.label)} @ {b.odds.toFixed(2)}
                      </div>
                      <b>{b.status === 'ganhou' ? `+${betCur(b)} ${fmt(b.payout)}` : `-${betCur(b)} ${fmt(b.amount)}`}</b>
                    </div>
                  ))}
                  <p className="center">
                    {tn('Resultado: {valor}', { valor: <b className={betTotal - betStake >= 0 ? 'pos' : 'neg'}>{betTotal - betStake >= 0 ? '+' : ''}
                          {bets.every((b) => b.currency === 'milho') ? '🌽' : '🎟️'} {fmt(betTotal - betStake)}
                        </b> })}
                  </p>
                </div>
              )}
              <div className="row-center gap">
                <button className="btn btn-primary" onClick={back}>
                  {t('🎲 Voltar às apostas')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card narration">
        <h3>{t('Narração')}</h3>
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

function FighterHud({ side, name, sub, style, hp, maxHp, sta, hurt, tools, pulse, pulseKey }: { tools?: string[]; pulse?: string[]; pulseKey?: number; side: 0 | 1; name: string; sub: string; style: Parameters<typeof StyleTag>[0]['style']; hp: number; maxHp: number; sta: number; hurt: boolean }) {
  return (
    <div className={`card hud-card side-${side} ${hp <= 0 ? 'down' : ''} ${hurt ? 'hurt' : ''}`}>
      <b className="hud-name">{name}</b>
      <span className="tiny muted">{sub}</span>
      <div className="hud-tags">
        <StyleTag style={style} />
        {tools?.map((t) => (
          <span key={pulse?.includes(t) ? `${t}${pulseKey}` : t} className={`tool-chip ${pulse?.includes(t) ? 'pulse' : ''}`} title={`${TOOL_BY_ID[t]?.name}: ${TOOL_BY_ID[t]?.desc}`}>
            {TOOL_BY_ID[t]?.emoji} <span className="tool-chip-name">{TOOL_BY_ID[t]?.name}</span>
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

/** Apresentação dos lutadores: holofotes, painéis dos cantos e o VS no impacto da música. */
function Walkout({ a, b, tools }: { a: Rooster; b: Rooster; tools?: [string[], string[]] }) {
  const card = (r: Rooster, side: 0 | 1) => (
    <div className={`wo-card wo-${side === 0 ? 'left' : 'right'}`}>
      <span className="wo-corner">{side === 0 ? t('🔴 CANTO VERMELHO') : t('CANTO AZUL 🔵')}</span>
      <b className="wo-name">{r.name}</b>
      <span className="wo-info">
        {t('{raca} · Nv {nivel} · {v}V {d}D', { raca: BREED_BY_ID[r.breedId]?.name ?? '', nivel: r.level, v: r.wins, d: r.losses })}
      </span>
      <span className="wo-owner">{r.owner}</span>
      {(tools?.[side]?.length ?? 0) > 0 && <span className="wo-tools">{t('{itens} equipado', { itens: tools![side].map((id) => TOOL_BY_ID[id]?.emoji).join(' ') })}</span>}
    </div>
  )
  return (
    <div className="walkout" aria-label={t('{a} contra {b}', { a: a.name, b: b.name })}>
      <div className="wo-dim" />
      <div className="spot spot-l" />
      <div className="spot spot-r" />
      {card(a, 0)}
      {card(b, 1)}
      <div className="wo-vs">VS</div>
      <div className="wo-flash" />
    </div>
  )
}
