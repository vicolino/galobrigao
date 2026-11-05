import { LANGS, lang, setLang, t } from '../i18n'

/** Seletor de idioma (recarrega a página ao trocar). */
export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const cur = lang()
  return (
    <label className={`lang-switch${compact ? ' compact' : ''}`} title={t('Idioma')}>
      <span aria-hidden>🌐</span>
      <select aria-label={t('Idioma')} value={cur} onChange={(e) => setLang(e.target.value as typeof cur)}>
        {LANGS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.flag} {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
