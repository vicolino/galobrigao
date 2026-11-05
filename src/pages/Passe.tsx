import { useEffect, useRef, useState } from 'react'
import { api, type CatalogItem } from '../api'
import { Checkout } from '../components/Checkout'
import { RoosterSvg } from '../components/RoosterSvg'
import { Bar, PageHead } from '../components/ui'
import { brl, SKU_BY_ID } from '../game/catalog'
import { BREED_BY_ID, SKIN_BY_ID } from '../game/data'
import {
  currentPass,
  PASS_DAILY_XP,
  PASS_MAX_XP,
  PASS_PRICE_OVOS,
  PASS_REWARDS,
  PASS_SKIP_OVOS,
  PASS_SKU,
  PASS_TIER_XP,
  PASS_TIERS,
  PASS_XP,
  passTier,
  rewardEmoji,
  rewardLabel,
  seasonEnd,
  seasonName,
  type PassReward,
} from '../game/pass'
import { today } from '../game/rooster'
import { useGame } from '../game/store'
import type { GameState } from '../game/types'
import { t, tp } from '../i18n'

/** Prêmios que já dá para pegar. */
export function passClaimable(s: GameState) {
  const p = currentPass(s)
  const reached = passTier(p.xp)
  let n = 0
  for (let i = 1; i <= reached; i++) {
    if (!p.claimed.free.includes(i)) n++
    if (p.premium && !p.claimed.premium.includes(i)) n++
  }
  return n
}

function timeLeft() {
  const ms = Math.max(0, seasonEnd() - Date.now())
  const d = Math.floor(ms / 864e5)
  const h = Math.floor((ms % 864e5) / 36e5)
  return d > 0 ? t('{d}d {h}h', { d, h }) : t('{h}h', { h })
}

/** Faixa compacta do passe (para outras páginas). */
export function PassWidget() {
  const { state } = useGame()
  if (!state) return null
  const p = currentPass(state)
  const tier = passTier(p.xp)
  const ready = passClaimable(state)
  return (
    <a className="card pass-widget" href="#/passe">
      <span className="pw-emoji">🎫</span>
      <div className="grow">
        <b>
          {seasonName(p.season)} · {t('Nível {n}', { n: tier })}
          {p.premium && <span className="pw-prem"> 👑</span>}
        </b>
        <Bar value={tier >= PASS_TIERS ? PASS_TIER_XP : p.xp % PASS_TIER_XP} max={PASS_TIER_XP} kind="xp" />
      </div>
      {ready > 0 ? <span className="pw-ready pulse">{tp('{n} prêmio', '{n} prêmios', ready)}</span> : <span className="tiny muted">{t('Ver passe →')}</span>}
    </a>
  )
}

export function Passe() {
  const { state, actions, toast } = useGame()
  const [item, setItem] = useState<CatalogItem | null>(null)
  const [buying, setBuying] = useState<CatalogItem | null>(null)
  const [busy, setBusy] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const s = state!
  const p = currentPass(s)
  const tier = passTier(p.xp)
  const ready = passClaimable(s)
  const dayXp = p.day === today() ? (p.dayXp ?? 0) : 0
  const canSkip = !busy && p.xp < PASS_MAX_XP && s.ovos >= PASS_SKIP_OVOS

  useEffect(() => {
    void api
      .catalog()
      .then((r) => setItem(r.items.find((i) => i.id === PASS_SKU) ?? null))
      .catch(() => setItem(SKU_BY_ID[PASS_SKU] ?? null))
  }, [])

  // Rola a trilha até o nível atual
  useEffect(() => {
    const el = track.current?.querySelector<HTMLElement>(`[data-tier="${Math.max(1, tier)}"]`)
    if (el && track.current) track.current.scrollLeft = el.offsetLeft - track.current.clientWidth / 2 + el.clientWidth / 2
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async <T,>(fn: () => Promise<{ ok: boolean; error?: string; value?: T }>, ok: (v: T) => string) => {
    if (busy) return
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (r.ok) toast(ok(r.value as T), 'ok')
    else toast(r.error ?? t('Algo deu errado.'), 'erro')
  }

  const claim = (track: 'free' | 'premium', n: number) => run(() => actions.passClaim(track, n), (v) => t('🎁 Resgatado: {premio}', { premio: String(v) }))
  const claimAll = () =>
    run(
      () => actions.passClaimAll(),
      (v) => tp('🎁 {n} prêmio resgatado!', '🎁 {n} prêmios resgatados!', v.count) + (v.skipped ? ' ' + t('(galinheiro lotado: o galo ficou para depois)') : ''),
    )
  const skip = () => run(() => actions.passSkip(), (v) => t('⭐ Subiu para o nível {n}!', { n: v }))
  const buyOvos = () => {
    if (!confirm(t('Comprar o Passe Premium por 🥚 {n} ovos de ouro?', { n: PASS_PRICE_OVOS }))) return
    void run(() => actions.passBuy(), () => t('👑 Passe Premium liberado! Pegue seus prêmios.'))
  }

  const cell = (n: number, trk: 'free' | 'premium', r: PassReward) => {
    const claimed = p.claimed[trk].includes(n)
    const locked = trk === 'premium' && !p.premium
    const reached = tier >= n
    const can = reached && !claimed && !locked
    const cls = claimed ? 'claimed' : can ? 'ready' : locked ? 'locked' : 'future'
    const big = !!(r.skin || r.breedId)
    return (
      <button
        className={`pass-cell ${cls} ${trk} ${big ? 'big' : ''}`}
        title={rewardLabel(r)}
        disabled={busy}
        onClick={() => (can ? void claim(trk, n) : toast(`${rewardLabel(r)} · ${claimed ? t('já resgatado') : locked ? t('só no Premium') : t('chegue no nível {n}', { n })}`, 'info'))}
      >
        <span className="pc-emoji">{rewardEmoji(r)}</span>
        <span className="pc-label">{rewardLabel(r)}</span>
        {claimed && <span className="pc-state">✅</span>}
        {locked && !claimed && <span className="pc-state">🔒</span>}
      </button>
    )
  }

  const earn: [string, number][] = [
    [t('⚔️ Luta na Arena'), PASS_XP.lutar],
    [t('🏆 Vitória na Arena (a mais)'), PASS_XP.vencer],
    [t('🎯 Missão resgatada'), PASS_XP.missao],
    [t('🤝 Desafio contra jogador'), PASS_XP.desafio],
    [t('💪 Treino'), PASS_XP.treinar],
    [t('🌽 Alimentar um galo'), PASS_XP.alimentar],
    [t('🎲 Aposta numa luta da casa'), PASS_XP.apostar],
  ]

  return (
    <>
      <PageHead title={t('🎫 Passe da Temporada')} subtitle={t('{temporada} · termina em {tempo}', { temporada: seasonName(p.season), tempo: timeLeft() })} />

      <div className="card pass-hero">
        <div className="pass-tier">
          <small>{t('Nível')}</small>
          <b>{tier}</b>
          <small>/{PASS_TIERS}</small>
        </div>
        <div className="grow">
          <Bar
            value={tier >= PASS_TIERS ? PASS_TIER_XP : p.xp % PASS_TIER_XP}
            max={PASS_TIER_XP}
            kind="xp"
            label={tier >= PASS_TIERS ? t('Nível máximo! 🏆') : t('⭐ {a}/{b} para o nível {n}', { a: p.xp % PASS_TIER_XP, b: PASS_TIER_XP, n: tier + 1 })}
          />
          <p className="tiny muted">
            {t('⭐ {xp} pontos do passe · hoje {d}/{max}', { xp: p.xp, d: dayXp, max: PASS_DAILY_XP })}
            {p.premium && <span className="pos"> · {t('👑 Premium ativo')}</span>}
          </p>
        </div>
        <div className="pass-actions">
          <button className="btn btn-primary" disabled={busy || !ready} onClick={() => void claimAll()}>
            {ready ? t('🎁 Pegar tudo ({n})', { n: ready }) : t('🎁 Pegar tudo')}
          </button>
          <button className="btn btn-sm" disabled={!canSkip} onClick={() => void skip()}>
            {t('+1 nível · 🥚 {n}', { n: PASS_SKIP_OVOS })}
          </button>
        </div>
      </div>

      {!p.premium && (
        <div className="card pass-premium">
          <div className="pp-roosters">
            <RoosterSvg breedId="temporada" size={110} anim="idle" />
            <RoosterSvg breedId="caipira" skin="tp-campeao" size={90} anim="none" />
          </div>
          <div className="grow">
            <h2>{t('👑 Passe Premium')}</h2>
            <ul className="tiny">
              <li>{t('🐓 Galo exclusivo da temporada no nível 30')}</li>
              <li>{t('🎨 2 skins exclusivas (níveis 15 e 30)')}</li>
              <li>{t('🥚 {n} ovos de ouro + acessórios épicos e lendários', { n: PASS_REWARDS.reduce((a, r) => a + (r.premium.ovos ?? 0), 0) })}</li>
              <li>{t('🎁 Os prêmios dos níveis que você já passou ficam liberados na hora')}</li>
            </ul>
          </div>
          <div className="pass-actions">
            <button className="btn btn-gold btn-lg" disabled={!item} onClick={() => item && setBuying(item)}>
              {t('Comprar Passe Premium · {preco}', { preco: brl(item?.priceCents ?? SKU_BY_ID[PASS_SKU].priceCents) })}
            </button>
            <button className="btn btn-sm" disabled={busy || s.ovos < PASS_PRICE_OVOS} onClick={buyOvos}>
              {t('ou 🥚 {n} ovos', { n: PASS_PRICE_OVOS })}
            </button>
          </div>
        </div>
      )}

      <div className="pass-track-wrap">
        <div className="pass-rowlabels">
          <span />
          <span>{t('Grátis')}</span>
          <span>{t('👑 Premium')}</span>
        </div>
        <div className="pass-track" ref={track}>
          {PASS_REWARDS.map((r) => (
            <div key={r.tier} data-tier={r.tier} className={`pass-col ${tier >= r.tier ? 'reached' : ''} ${tier + 1 === r.tier ? 'next' : ''}`}>
              <span className="pass-num">{r.tier}</span>
              {cell(r.tier, 'free', r.free)}
              {cell(r.tier, 'premium', r.premium)}
            </div>
          ))}
        </div>
      </div>

      <div className="pass-bottom">
        <div className="card">
          <h3>{t('⭐ Como ganhar pontos')}</h3>
          <ul className="pass-earn">
            {earn.map(([label, xp]) => (
              <li key={label}>
                <span>{label}</span>
                <b>+{xp}</b>
              </li>
            ))}
          </ul>
          <p className="tiny muted">{t('Até ⭐ {n} pontos por dia jogando. Cada nível = ⭐ {x}. A temporada zera todo mês.', { n: PASS_DAILY_XP, x: PASS_TIER_XP })}</p>
        </div>
        <div className="card">
          <h3>{t('✨ Exclusivos da temporada')}</h3>
          <div className="pass-excl">
            <div>
              <RoosterSvg breedId="caipira" skin="tp-aurora" size={96} anim="none" />
              <b>{SKIN_BY_ID['tp-aurora'].name}</b>
              <span className="tiny muted">{t('Skin · nível {n}', { n: 15 })}</span>
            </div>
            <div>
              <RoosterSvg breedId="caipira" skin="tp-campeao" size={96} anim="none" />
              <b>{SKIN_BY_ID['tp-campeao'].name}</b>
              <span className="tiny muted">{t('Skin · nível {n}', { n: 30 })}</span>
            </div>
            <div>
              <RoosterSvg breedId="temporada" size={96} anim="none" />
              <b>{BREED_BY_ID.temporada.name}</b>
              <span className="tiny muted">{t('Galo ★★★★ · nível {n}', { n: 30 })}</span>
            </div>
          </div>
        </div>
      </div>

      <Checkout item={buying} onClose={() => setBuying(null)} />
    </>
  )
}
