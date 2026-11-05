import { useEffect, useState } from 'react'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, RoosterCard, Stars, go } from '../components/ui'
import { BREED_BY_ID } from '../game/data'
import { BREED_COOLDOWN, BREED_MIN_LEVEL, INCUBATION, MAX_COOP, MUTATION_CHANCE, STAR4_CHANCE, STAR_ODDS, TINT_CHANCE, breedCost, chickBreeds, cooldownLeft, skipCost, type ChickRoll } from '../game/criacao'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import type { Rooster } from '../game/types'
import { t, tx } from '../i18n'

const pct = (x: number) => `${Math.round(x * 100)}%`
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const hours = (ms: number) => t('{h}h {m}min', { h: Math.floor(ms / 3600_000), m: Math.ceil((ms % 3600_000) / 60_000) })
const STAT_LABEL: Record<string, string> = { hp: t('Vida'), atk: t('Ataque'), def: t('Defesa'), spd: t('Velocidade') }

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function Cruzamento() {
  const { state, actions, toast } = useGame()
  const s = state!
  const now = useNow()
  const [pickA, setPickA] = useState<string | null>(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('a'))
  const [pickB, setPickB] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [born, setBorn] = useState<ChickRoll | null>(null)
  const [cracked, setCracked] = useState(false)

  const egg = s.nest?.egg
  const a = s.roosters.find((r) => r.id === pickA)
  const b = s.roosters.find((r) => r.id === pickB)
  const full = s.roosters.length >= MAX_COOP

  const why = (ro: Rooster): string | null => {
    if (ro.level < BREED_MIN_LEVEL) return t('Nível {n}+', { n: BREED_MIN_LEVEL })
    const cd = cooldownLeft(s, ro.id, now)
    if (cd > 0) return t('😴 Descansa {t}', { t: hours(cd) })
    return null
  }

  const toggle = (ro: Rooster) => {
    if (why(ro)) return
    if (ro.id === pickA) return setPickA(null)
    if (ro.id === pickB) return setPickB(null)
    if (!a) setPickA(ro.id)
    else setPickB(ro.id)
  }

  const reveal = (r: { ok: true; value?: ChickRoll } | { ok: false; error: string }) => {
    if (!r.ok) {
      if (tx(r.error) === t('Ovos de ouro insuficientes 🥚')) go('/loja/ovos')
      else toast(tx(r.error), 'erro')
      return
    }
    setCracked(false)
    setBorn(r.value!)
    setTimeout(() => setCracked(true), 1400)
  }

  const start = async () => {
    if (!a || !b) return
    setBusy(true)
    const r = await actions.shop({ op: 'breedStart', a: a.id, b: b.id })
    setBusy(false)
    if (r.ok) {
      toast(t('🥚 Ovo no ninho! Volta em {t} para chocar.', { t: hours(INCUBATION) }), 'ok')
      setPickA(null)
      setPickB(null)
    } else if (tx(r.error) === t('Ovos de ouro insuficientes 🥚')) go('/loja/ovos')
    else toast(tx(r.error), 'erro')
  }
  const hatch = async (skip: boolean) => {
    setBusy(true)
    const r = await actions.shop<ChickRoll>(skip ? { op: 'breedSkip' } : { op: 'breedHatch' })
    setBusy(false)
    reveal(r)
  }

  const cost = a && b ? breedCost(a, b) : null
  const ready = egg ? egg.readyAt <= now : false
  const skip = egg ? skipCost(egg.readyAt, now) : 0
  const eligible = s.roosters.filter((r) => !why(r)).length

  return (
    <>
      <PageHead title={t('🥚 Cruzamento')} subtitle={t('Junte dois galos de nível {n}+ e choque um pintinho com o melhor dos dois.', { n: BREED_MIN_LEVEL })} />

      {egg ? (
        <div className="card br-nest">
          <div className={`br-egg ${ready ? 'ready' : ''}`}>🥚</div>
          <div className="br-nest-info">
            <h3>{ready ? t('🐣 O ovo está pronto!') : t('Chocando...')}</h3>
            <p className="muted">{t('Filho de {a} com {b}', { a: egg.parents[0].name, b: egg.parents[1].name })}</p>
            {!ready && <div className="br-clock">⏳ {clock(egg.readyAt - now)}</div>}
            {!ready && (
              <div className="br-bar">
                <div style={{ width: `${Math.min(100, ((now - egg.startedAt) / (egg.readyAt - egg.startedAt)) * 100)}%` }} />
              </div>
            )}
            {full && <p className="tiny warn">{t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: MAX_COOP })}</p>}
            <div className="row gap wrap">
              {ready ? (
                <button className="btn btn-primary pulse" disabled={busy || full} onClick={() => hatch(false)}>
                  {t('🐣 Chocar ovo')}
                </button>
              ) : (
                <button className="btn btn-gold" disabled={busy || full} onClick={() => hatch(true)}>
                  {t('Chocar agora · 🥚 {n}', { n: skip })}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card br-pair">
          <ParentSlot ro={a} label={t('Pai A')} onClear={() => setPickA(null)} />
          <div className="br-x">×</div>
          <ParentSlot ro={b} label={t('Pai B')} onClear={() => setPickB(null)} />
          <div className="br-go">
            {cost ? (
              <>
                <div className="tiny muted">{t('Raça do pintinho: {r}', { r: chickBreeds(a!, b!).map((id) => BREED_BY_ID[id]?.name ?? id).join(' / ') })}</div>
                <button className="btn btn-primary" disabled={busy || full} onClick={start}>
                  {t('🥚 Cruzar · 🥚 {o} · 🌽 {m}', { o: cost.ovos, m: fmt(cost.milho) })}
                </button>
              </>
            ) : (
              <p className="muted">{t('Escolha dois galos aí embaixo.')}</p>
            )}
            {full && <p className="tiny warn">{t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: MAX_COOP })}</p>}
          </div>
        </div>
      )}

      <div className="card br-odds">
        <h3>{t('🎲 Chances do pintinho')}</h3>
        <ul>
          <li>{t('Atributos: média dos pais, ±10%.')}</li>
          <li>{t('🧬 Mutação ({p}): +15% em um atributo.', { p: pct(MUTATION_CHANCE) })}</li>
          <li>{t('🌈 Pelagem rara ({p}): cores únicas que ninguém mais tem.', { p: pct(TINT_CHANCE) })}</li>
          <li>{t('⭐ Estrelas: {lista}', { lista: STAR_ODDS.map(([n, p]) => `${n}★ ${pct(p)}`).join(' · ') })}</li>
          <li>{t('🌟 Pais com 4★ ou mais: {p} de chance de 4★.', { p: pct(STAR4_CHANCE) })}</li>
          <li>{t('Edições especiais não passam a raça: o filhote puxa o outro pai.')}</li>
          <li>{t('Choca em {a}; cada pai descansa {b} depois de cruzar.', { a: hours(INCUBATION), b: hours(BREED_COOLDOWN) })}</li>
        </ul>
      </div>

      {!egg && (
        <>
          <h2 className="section-title">{t('Seus galos')}</h2>
          {eligible < 2 && <p className="muted">{t('Você precisa de dois galos de nível {n}+ sem descanso. Treine na Rinha!', { n: BREED_MIN_LEVEL })}</p>}
          {s.roosters.length === 0 ? (
            <Empty emoji="🐓" title={t('Nenhum galo')} />
          ) : (
            <div className="grid-cards">
              {s.roosters.map((ro) => {
                const no = why(ro)
                const sel = ro.id === pickA || ro.id === pickB
                return (
                  <div key={ro.id} className={`br-pick ${no ? 'off' : ''}`}>
                    <RoosterCard ro={ro} compact selected={sel} onClick={no ? undefined : () => toggle(ro)} footer={<div className="br-tag">{no ?? (sel ? t('✅ Escolhido') : t('Toque para escolher'))}</div>} />
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <Modal open={!!born} onClose={() => setBorn(null)} title={t('🐣 Nasceu!')}>
        {born && (
          <div className="center br-reveal">
            {!cracked ? (
              <div className="br-crack">🥚</div>
            ) : (
              <div className="br-born">
                <RoosterSvg breedId={born.chick.breedId} equipped={{}} tint={born.chick.tint} size={180} anim="win" />
                <h2>{born.chick.name}</h2>
                <p className="muted">
                  {BREED_BY_ID[born.chick.breedId]?.name} · <Stars n={born.chick.stars} />
                </p>
                {born.chick.parents && <p className="tiny muted">{t('Filho de {a} com {b}', { a: born.chick.parents[0], b: born.chick.parents[1] })}</p>}
                {born.rareColor && <p className="br-badge rare">{t('🌈 Pelagem rara! Só ele tem essas cores.')}</p>}
                {born.mutation && <p className="br-badge">{t('🧬 Mutação: +15% de {stat}', { stat: STAT_LABEL[born.mutation] })}</p>}
                <div className="row-center gap">
                  <button className="btn btn-primary" onClick={() => go(`/galinheiro/${born.chick.id}`)}>
                    {t('Ver no galinheiro')}
                  </button>
                  <button className="btn" onClick={() => setBorn(null)}>
                    {t('Fechar')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

function ParentSlot({ ro, label, onClear }: { ro?: Rooster; label: string; onClear: () => void }) {
  return (
    <div className={`br-slot ${ro ? 'filled' : ''}`} onClick={ro ? onClear : undefined} title={ro ? t('Tirar') : undefined}>
      <span className="tiny muted">{label}</span>
      {ro ? (
        <>
          <RoosterSvg breedId={ro.breedId} skin={ro.skin} equipped={ro.equipped} tint={ro.tint} size={110} anim="idle" />
          <b>{ro.name}</b>
          <span className="tiny">
            {t('Nv {n}', { n: ro.level })} · <Stars n={ro.stars} />
          </span>
        </>
      ) : (
        <div className="br-q">?</div>
      )}
    </div>
  )
}
