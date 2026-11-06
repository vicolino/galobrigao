import { useEffect, useRef, useState } from 'react'
import { LANGS, lang, setLang, t } from '../i18n'

/** Seletor de idioma próprio (HTML), não usa o <select> nativo. Recarrega a página ao trocar. */
export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const cur = lang()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = LANGS.find((l) => l.id === cur) ?? LANGS[0]

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className={`lang-switch${compact ? ' compact' : ''}`} ref={ref} title={t('Idioma')}>
      <span aria-hidden>🌐</span>
      <button type="button" className="lang-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="lang-cur">
          {active.flag} {active.label}
        </span>
        <svg className="lang-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div className="lang-back" onClick={() => setOpen(false)} />
          <ul className="lang-menu" role="listbox" aria-label={t('Idioma')}>
            {LANGS.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l.id === cur}
                  className={`lang-opt${l.id === cur ? ' on' : ''}`}
                  onClick={() => {
                    setOpen(false)
                    if (l.id !== cur) setLang(l.id)
                  }}
                >
                  <span>
                    {l.flag} {l.label}
                  </span>
                  {l.id === cur && <span aria-hidden>✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
