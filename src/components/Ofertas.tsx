// Ofertas: relâmpago (modal + chip), edição limitada (estoque), recarga de energia e bônus de primeira compra.
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ITEM_BY_ID, TOOL_BY_ID } from '../game/data'
import { OFFER_BUNDLES, OFFER_OFF, activeOffer, offerBlocked, refillPrice, type OfferReason } from '../game/ofertas'
import { currentEnergy } from '../game/rooster'
import { useGame } from '../game/store'
import type { GameState, Rooster } from '../game/types'
import type { LimitedStock } from '../game/ofertas'
import { t, tx } from '../i18n'
import { Modal, useHashRoute } from './ui'

const pad = (v: number) => String(v).padStart(2, '0')
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}
/** "3d 4h", "5h 12min", "8min" */
export function dur(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d) return t('{d}d {h}h', { d, h })
  if (h) return t('{h}h {m}min', { h, m: m % 60 })
  return t('{m}min', { m })
}

function useNow(ms: number, on = true) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms, on])
  return now
}

type Shop = ReturnType<typeof useGame>['actions']['shop']

/** Pede uma oferta relâmpago ao servidor (só se as regras locais deixarem; o servidor confere de novo). */
export function tryOffer(s: GameState, shop: Shop, reason: OfferReason) {
  if (offerBlocked(s)) return
  void shop({ op: 'triggerOffer', reason })
}

// ---------------- Edição limitada ----------------

let stock: Record<string, LimitedStock> = {}
let skew = 0
let loadedAt = 0
const subs = new Set<() => void>()
export function refreshLimited() {
  loadedAt = Date.now()
  api
    .limited()
    .then((r) => {
      stock = Object.fromEntries(r.items.map((i) => [i.id, i]))
      skew = r.now - Date.now()
      subs.forEach((f) => f())
    })
    .catch(() => null)
}

export function useLimited(id: string) {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((x) => x + 1)
    subs.add(f)
    if (Date.now() - loadedAt > 30_000) refreshLimited()
    return () => void subs.delete(f)
  }, [])
  const st = stock[id]
  if (!st) return null
  const left = Math.max(0, st.total - st.sold)
  const ended = st.endsAt !== null && st.endsAt <= Date.now() + skew
  return { ...st, left, out: left <= 0 || ended, ended }
}

/** "🔥 Restam N de 100" + barra + contagem regressiva, ou ESGOTADO. */
export function LimitedBadge({ id }: { id: string }) {
  const { state } = useGame()
  const st = useLimited(id)
  const now = useNow(30_000) + skew
  // Recarrega o estoque depois de uma compra
  const owned = (state?.roosters.length ?? 0) + (state?.skins.length ?? 0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else refreshLimited()
  }, [owned])
  if (!st) return null
  if (st.out) return <div className="limited-badge out">{st.ended && st.left > 0 ? t('⏰ EDIÇÃO ENCERRADA') : t('🚫 ESGOTADO')}</div>
  return (
    <div className="limited-badge">
      <div className="limited-row">
        <b>{t('🔥 Restam {n} de {total}', { n: st.left, total: st.total })}</b>
        {st.endsAt && <span className="tiny">{t('⏳ termina em {tempo}', { tempo: dur(st.endsAt - now) })}</span>}
      </div>
      <div className="limited-bar">
        <div style={{ width: `${(st.left / Math.max(1, st.total)) * 100}%` }} />
      </div>
    </div>
  )
}

// ---------------- Recarga de energia ----------------

export function RefillButton({ ro, className = 'btn btn-gold btn-sm' }: { ro: Rooster; className?: string }) {
  const { state, actions, toast } = useGame()
  const [busy, setBusy] = useState(false)
  useNow(30_000)
  if (!state || currentEnergy(ro) >= 100) return null
  const price = refillPrice(state)
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const r = await actions.shop({ op: 'refillEnergy', roosterId: ro.id })
        setBusy(false)
        if (r.ok) toast(t('⚡ {nome} está com energia cheia!', { nome: ro.name }), 'ok')
        else {
          toast(tx(r.error), 'erro')
          if (state.ovos < price) tryOffer(state, actions.shop, 'energia')
        }
      }}
    >
      {t('⚡ Recarregar energia · 🥚 {n}', { n: price })}
    </button>
  )
}

// ---------------- Primeira compra ----------------

export function useFirstBonus() {
  const { state } = useGame()
  const [on, setOn] = useState(false)
  const purchases = state?.stats.purchases ?? 0
  useEffect(() => {
    api
      .offersInfo()
      .then((r) => setOn(r.firstBonus))
      .catch(() => null)
  }, [purchases])
  return on
}

export function FirstBuyBanner() {
  const on = useFirstBonus()
  if (!on) return null
  return (
    <div className="first-buy-banner">
      <b>{t('🎁 Primeira compra: ovos em DOBRO')}</b>
      <span className="tiny">{t('Vale para qualquer pacote de ovos de ouro, só na sua primeira compra.')}</span>
    </div>
  )
}

// ---------------- Ofertas relâmpago ----------------

/** Fica no App: dispara ofertas (nível múltiplo de 5, derrota pro Chefão), mostra o modal e o chip. */
export function OfferCenter() {
  const { state, actions, match, toast } = useGame()
  const route = useHashRoute()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const offer = state ? activeOffer(state) : null
  const now = useNow(1000, !!offer)
  const levels = useRef<Record<string, number> | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const pending = useRef<OfferReason | null>(null)
  const bossSeed = useRef<number | null>(null)
  const inFight = route.startsWith('/luta')

  // Galo chegou a um nível múltiplo de 5
  useEffect(() => {
    if (!state) return
    const prev = levels.current
    levels.current = Object.fromEntries(state.roosters.map((r) => [r.id, r.level]))
    if (prev && state.roosters.some((r) => prev[r.id] !== undefined && Math.floor(r.level / 5) > Math.floor(prev[r.id] / 5))) pending.current = 'nivel'
  }, [state])

  // Perdeu para o Chefão na Arena
  useEffect(() => {
    if (match?.kind === 'rinha' && match.difficulty === 3 && (match.rewards?.points ?? 0) < 0 && bossSeed.current !== match.seed) {
      bossSeed.current = match.seed
      pending.current = 'chefao'
    }
  }, [match])

  // Dispara fora da tela de luta
  useEffect(() => {
    if (!state || inFight || !pending.current) return
    const r = pending.current
    pending.current = null
    tryOffer(state, actions.shop, r)
  })

  // Oferta nova → abre o modal (fora da luta)
  useEffect(() => {
    if (!state) return
    const ids = (state.offers ?? []).map((o) => o.id)
    if (!seen.current) {
      seen.current = new Set(ids)
      return
    }
    if (inFight) return
    const fresh = ids.find((id) => !seen.current!.has(id))
    ids.forEach((id) => seen.current!.add(id))
    if (fresh && offer?.id === fresh) setOpen(true)
  }, [state, inFight, offer?.id])

  if (!offer) return null
  const b = OFFER_BUNDLES[offer.kind]
  const left = offer.until - now
  const off = Math.round(OFFER_OFF * 100)
  const lines = [
    ...Object.entries(offer.items).map(([id, q]) => ITEM_BY_ID[id] && `${ITEM_BY_ID[id].emoji} ${ITEM_BY_ID[id].name} ×${q}`),
    ...Object.entries(offer.tools).map(([id, q]) => TOOL_BY_ID[id] && `${TOOL_BY_ID[id].emoji} ${TOOL_BY_ID[id].name} ×${q}`),
  ].filter(Boolean)
  return (
    <>
      {!inFight && (
        <button className="offer-chip" onClick={() => setOpen(true)} title={b.name}>
          ⚡ −{off}% · {mmss(left)}
        </button>
      )}
      <Modal open={open && left > 0} onClose={() => setOpen(false)} title={t('⚡ Oferta relâmpago · −{p}% · {tempo}', { p: off, tempo: mmss(left) })}>
        <div className="offer-modal">
          <div className="offer-emoji">{b.emoji}</div>
          <h2>{b.name}</h2>
          <p className="muted">{b.desc}</p>
          <ul className="offer-list">
            {lines.map((l) => (
              <li key={l as string}>{l}</li>
            ))}
          </ul>
          <p className="offer-price">
            <s className="muted">🥚 {offer.full}</s> <b>🥚 {offer.price}</b>
          </p>
          <button
            className="btn btn-gold btn-lg full"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const r = await actions.shop({ op: 'buyOffer', id: offer.id })
              setBusy(false)
              if (r.ok) {
                toast(t('⚡ {nome} é seu! Bom proveito.', { nome: b.name }), 'ok')
                setOpen(false)
              } else toast(tx(r.error), 'erro')
            }}
          >
            {t('Comprar agora · 🥚 {n}', { n: offer.price })}
          </button>
          <p className="tiny muted center">{t('Só para você. Some quando o tempo acabar.')}</p>
        </div>
      </Modal>
    </>
  )
}
