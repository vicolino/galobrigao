import { useEffect, useState, type ReactNode } from 'react'
import { BREED_BY_ID, RARITY, STYLES } from '../game/data'
import { currentEnergy, finalStats, fmt, power } from '../game/rooster'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { Currency, Rarity, Rooster } from '../game/types'
import { RoosterSvg } from './RoosterSvg'
import { BreedBadge, NftBadge } from './BreedBadge'
import { t, tx } from '../i18n'

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/galinheiro')
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash.slice(1) || '/galinheiro')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export const go = (path: string) => {
  window.location.hash = path
}

export function Price({ value, currency, className = '' }: { value: number; currency: Currency; className?: string }) {
  return (
    <span className={`price ${className}`}>
      {currency === 'milho' ? '🌽' : '🥚'} {fmt(value)}
    </span>
  )
}

export function RarityTag({ rarity }: { rarity: Rarity }) {
  return (
    <span className="rarity" style={{ color: RARITY[rarity].color, borderColor: RARITY[rarity].color + '66' }}>
      {RARITY[rarity].label}
    </span>
  )
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars" title={t('Potencial {n}/5', { n })}>
      {'★'.repeat(n)}
      <span className="dim">{'★'.repeat(5 - n)}</span>
    </span>
  )
}

export function Bar({ value, max, kind, label }: { value: number; max: number; kind: 'hp' | 'sta' | 'xp' | 'energy'; label?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={`bar bar-${kind}`}>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {label !== undefined && <span className="bar-label">{label}</span>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        {title && (
          <div className="modal-head">
            <h3>{title}</h3>
            <button className="icon-btn" onClick={onClose} aria-label={t('Fechar')}>
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Toasts() {
  const { toasts } = useGame()
  return (
    <div className="toasts">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast-${x.kind}`}>
          {tx(x.text)}
        </div>
      ))}
    </div>
  )
}

export function StyleTag({ style }: { style: Rooster['style'] }) {
  const s = STYLES[style]
  return (
    <span className={`style-tag style-${style}`}>
      {s.emoji} {s.label}
    </span>
  )
}

export function RoosterCard({ ro, onClick, footer, selected, compact }: { ro: Rooster; onClick?: () => void; footer?: ReactNode; selected?: boolean; compact?: boolean }) {
  const breed = BREED_BY_ID[ro.breedId]
  const st = finalStats(ro)
  const en = currentEnergy(ro)
  return (
    <div
      className={`card rooster-card ${onClick ? 'clickable' : ''} ${selected ? 'selected' : ''} rar-${breed.rarity}`}
      onClick={() => {
        if (onClick) {
          sfx.click()
          onClick()
        }
      }}
    >
      <div className="rc-top">
        <RarityTag rarity={breed.rarity} />
        <span className="rc-level">{t('Nv {n}', { n: ro.level })}</span>
      </div>
      <div className="rc-art">
        <RoosterSvg breedId={ro.breedId} skin={ro.skin} equipped={ro.equipped} tint={ro.tint} size={compact ? 110 : 150} />
      </div>
      <div className="rc-name">{ro.name}</div>
      <div className="rc-sub">
        {breed.name} · <Stars n={ro.stars} />
      </div>
      <div className="gn-badges">
        <BreedBadge ro={ro} />
        <NftBadge ro={ro} />
      </div>
      <div className="rc-row">
        <StyleTag style={ro.style} />
        <span className="power">⚡ {power(ro)}</span>
      </div>
      {!compact && (
        <div className="rc-stats">
          <span title={t('Vida')}>❤️ {st.hp}</span>
          <span title={t('Ataque')}>🗡️ {st.atk}</span>
          <span title={t('Defesa')}>🛡️ {st.def}</span>
          <span title={t('Velocidade')}>💨 {st.spd}</span>
        </div>
      )}
      <Bar value={en} max={100} kind="energy" label={`⚡ ${en}`} />
      {footer}
    </div>
  )
}

export function Empty({ emoji, title, text, action }: { emoji: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-emoji">{emoji}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function PageHead({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

/** Dropdown próprio (sem <select> nativo), com a cara do jogo. */
export function Picker({ value, options, onChange }: { value: string; options: { value: string; label: string; danger?: boolean }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const active = options.find((o) => o.value === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div className="cfg-picker">
      <button type="button" className={`cfg-picker-btn${active?.danger ? ' danger' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{active?.label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div className="cfg-picker-back" onClick={() => setOpen(false)} />
          <ul className="cfg-picker-menu" role="listbox">
            {options.map((o) => (
              <li key={o.value}>
                <button type="button" role="option" aria-selected={o.value === value} className={`cfg-picker-opt${o.value === value ? ' on' : ''}${o.danger ? ' danger' : ''}`} onClick={() => { setOpen(false); onChange(o.value) }}>
                  <span>{o.label}</span>
                  {o.value === value && <span aria-hidden>✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[] }) {
  return (
    <div className="tabs">
      {tabs.map((tb) => (
        <button
          key={tb.id}
          className={`tab ${value === tb.id ? 'active' : ''}`}
          onClick={() => {
            sfx.click()
            onChange(tb.id)
          }}
        >
          {tb.label}
        </button>
      ))}
    </div>
  )
}
