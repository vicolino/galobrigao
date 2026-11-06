import { useEffect, useMemo, useRef, useState } from 'react'
import { RoosterSvg } from '../components/RoosterSvg'
import { PageHead, RarityTag, RoosterCard, Stars, StyleTag, go } from '../components/ui'
import { estimate } from '../game/battle'
import { BREED_BY_ID, MAX_TOOLS, TOOLS, TOOL_BY_ID, npcOwners } from '../game/data'
import { ENERGY_COST, currentEnergy, pick, power } from '../game/rooster'
import { sfx } from '../game/sound'
import { makeOpponent, opponentTools, tierFor, useGame } from '../game/store'
import type { Rooster } from '../game/types'
import { t, tn, tx } from '../i18n'
import { RefillButton, tryOffer } from '../components/Ofertas'
import { api } from '../api'
import { serverEconomy } from '../game/economia'
import { DropTicker, PityBar } from './Drops'
import { dropOdds } from '../game/drops'

type Opp = { d: 0 | 1 | 2 | 3; o: Rooster; tools: string[] }

const DIFFS = [
  { label: t('Fácil'), emoji: '🐣', cls: 'easy', reward: t('Pouco milho') },
  { label: t('Médio'), emoji: '🐔', cls: 'medium', reward: t('Bom prêmio') },
  { label: t('Difícil'), emoji: '🦅', cls: 'hard', reward: t('Prêmio alto 🥚') },
  { label: t('Chefão'), emoji: '👑', cls: 'boss', reward: t('Prêmio máximo 🥚🥚') },
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

  // 🌽 Economia no servidor: os adversários vêm do servidor (ele guarda e usa na luta); senão, gera aqui (modo antigo)
  const server = serverEconomy()
  const [srvOpps, setSrvOpps] = useState<Opp[] | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const fresh = useRef(false)
  const localOpps = useMemo((): Opp[] => {
    if (server) return []
    return ([0, 1, 2, 3] as const).map((d) => {
      const o = makeOpponent(mine, d)
      o.owner = pick(npcOwners())
      return { d, o, tools: opponentTools(d) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.id, nonce, server])
  useEffect(() => {
    if (!server) return
    let alive = true
    const want = fresh.current
    fresh.current = false
    setSrvOpps(null)
    api
      .arenaOpponents(mine.id, want)
      .then((r) => alive && setSrvOpps(r.opponents))
      .catch((e: Error) => {
        if (!alive) return
        toast(tx(e.message), 'erro')
        setSrvOpps([])
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.id, nonce, reload, server])
  const opponents = server ? (srvOpps ?? []) : localOpps

  const chances = useMemo(
    () => opponents.map(({ o, tools }) => estimate(mine, o, 120, [myTools, tools]).pA),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opponents, mine.level, mine.style, JSON.stringify(mine.equipped), myTools.join()],
  )

  const fight = async (o: Rooster, d: 0 | 1 | 2 | 3, oppTools: string[]) => {
    if (busy) return
    setBusy(true)
    const r = await actions.startRinha(mine.id, o, d, myTools, oppTools)
    setBusy(false)
    if (!r.ok) {
      toast(tx(r.error), 'erro')
      // Adversários vencidos/trocados no servidor: busca de novo
      if (server) setReload((n) => n + 1)
      // Sem energia: oferta relâmpago de Banquete
      if (currentEnergy(mine) < ENERGY_COST) tryOffer(s, actions.shop, 'energia')
      return
    }
    sfx.bell()
    go('/luta')
  }

  const tier = tierFor(s.league.points)

  return (
    <>
      <PageHead
        title={t('⚔️ Arena')}
        subtitle={t('Escolha seu galo e um adversário. Vitórias dão milho, XP e pontos de liga.')}
        right={
          <div className="pill">
            {tier.emoji} {tx(tier.name)} · {t('{n} pts', { n: s.league.points })}
          </div>
        }
      />
      {/* 🎁 Drops: garantia e feed dos últimos drops raros */}
      {server && dropOdds().on && (
        <div className="arena-drops">
          <DropTicker />
          <PityBar />
        </div>
      )}

      <h2 className="section-title">{t('1. Seu lutador')}</h2>
      <div className="scroller">
        {sorted.map((r) => (
          <div key={r.id} className="scroller-item">
            <RoosterCard ro={r} compact selected={r.id === mine.id} onClick={() => setSelId(r.id)} />
          </div>
        ))}
      </div>

      <div className="row-between">
        <h2 className="section-title">{t('2. Ferramentas de luta')} <span className="tiny muted">{t('(até {n})', { n: MAX_TOOLS })}</span></h2>
        <a className="btn btn-sm" href="#/loja/ferramentas">
          {t('🧰 Comprar mais')}
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
          {t('Levando: {itens} · serão gastas na luta', { itens: myTools.map((id) => `${TOOL_BY_ID[id].emoji} ${TOOL_BY_ID[id].name}`).join(' + ') })}
        </p>
      )}

      <div className="row-between">
        <h2 className="section-title">{t('3. Escolha o adversário')}</h2>
        <button
          className="btn btn-sm"
          disabled={server && srvOpps === null}
          onClick={() => {
            fresh.current = true
            setNonce((n) => n + 1)
          }}
        >
          {t('🔄 Outros adversários')}
        </button>
      </div>

      {currentEnergy(mine) < ENERGY_COST && (
        <div className="warn">
          {tn('⚡ {nome} está sem energia ({atual}/{custo}). Espere recuperar (+1/min) ou {link}.', {
            nome: mine.name,
            atual: currentEnergy(mine),
            custo: ENERGY_COST,
            link: <a href={`#/galinheiro/${mine.id}`}>{t('dê uma ração')}</a>,
          })}{' '}
          <RefillButton ro={mine} />
        </div>
      )}

      {server && srvOpps === null && <p className="muted center">{t('🐓 Procurando adversários…')}</p>}
      {server && srvOpps?.length === 0 && (
        <p className="center">
          <button className="btn" onClick={() => setReload((n) => n + 1)}>
            {t('🔄 Tentar de novo')}
          </button>
        </p>
      )}
      <div className="opponents arena-opps">
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
                <span className="tiny muted opp-reward">{diff.reward}</span>
                {server && dropOdds().on && (
                  <a className="drop-chance" href="#/drops" title={t('Chance de drop por vitória')}>
                    🎁 {Math.round(dropOdds().chance[d] * 1000) / 10}%
                  </a>
                )}
              </div>
              <div className="opp-vs">
                <RoosterSvg breedId={mine.breedId} skin={mine.skin} equipped={mine.equipped} size={90} anim="none" />
                <span className="vs">VS</span>
                <RoosterSvg breedId={o.breedId} skin={o.skin} equipped={o.equipped} size={90} flip anim="idle" />
              </div>
              <div className="rc-name">{o.name}</div>
              <div className="rc-sub">
                {t('{dono} · {raca} · Nv {nivel}', { dono: o.owner, raca: b.name, nivel: o.level })}
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
                  {t('Leva:')} {tools.map((id) => <span key={id} className="tool-chip" title={TOOL_BY_ID[id].name}>{TOOL_BY_ID[id].emoji}</span>)}
                </div>
              )}
              <div className="chance">
                <div className="chance-bar">
                  <div style={{ width: `${Math.round(chance * 100)}%` }} />
                </div>
                <span>{t('Chance de vitória: ~{n}%', { n: Math.round(chance * 100) })}</span>
              </div>
              <button className="btn btn-primary full" onClick={() => void fight(o, d, tools)} disabled={busy || currentEnergy(mine) < ENERGY_COST}>
                {t('⚔️ Lutar (⚡{n})', { n: ENERGY_COST })}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
