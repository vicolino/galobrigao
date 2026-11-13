// 📝 Formulário da lista de espera (página inicial): quem não tem convite pede um aqui.
import { useState } from 'react'
import { api } from '../api'
import { DISCORD_URL } from '../brand'
import { t, tx } from '../i18n'

export function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [discord, setDiscord] = useState('')
  const [reason, setReason] = useState('')
  const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ position: number | null } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.espera({ name, email, discord: discord || undefined, reason: reason || undefined, adult })
      setDone({ position: r.position })
    } catch (err) {
      setError(tx((err as Error).message))
    }
    setBusy(false)
  }

  if (done)
    return (
      <div className="lp-card lp-wait-done">
        <div className="lp-mode-ico">🎉</div>
        <h3>{t('Você está na lista!')}</h3>
        <p className="muted">
          {done.position ? t('Sua posição na fila: {n}.', { n: done.position }) + ' ' : ''}
          {t('Quando chegar sua vez, o convite chega no seu e-mail. Fique de olho na caixa de spam também.')}
        </p>
        {DISCORD_URL && (
          <a className="btn btn-lg" href={DISCORD_URL} target="_blank" rel="noreferrer">
            💬 {t('Entrar no Discord enquanto isso')}
          </a>
        )}
      </div>
    )

  return (
    <form className="lp-card lp-wait-form" onSubmit={submit}>
      <label className="field">
        <span>{t('Como podemos te chamar?')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder={t('Ex.: Zé do Terreiro')} />
      </label>
      <label className="field">
        <span>{t('E-mail')}</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder={t('voce@email.com')} />
      </label>
      <label className="field">
        <span>{t('Usuário do Discord (opcional)')}</span>
        <input value={discord} onChange={(e) => setDiscord(e.target.value)} maxLength={40} placeholder="@galeiro" />
      </label>
      <label className="field">
        <span>{t('Por que quer jogar? (opcional)')}</span>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t('Ex.: curto jogo de criar bicho e PvP')} />
      </label>
      <label className="check">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> {t('Tenho 18 anos ou mais')}
      </label>
      {error && <p className="neg">{error}</p>}
      <button className="btn btn-primary btn-lg full" disabled={busy || !adult}>
        {busy ? t('Aguarde...') : t('📝 Entrar na lista de espera')}
      </button>
      <p className="tiny muted">{t('Usamos seu e-mail só para mandar o convite. Nada de spam.')}</p>
    </form>
  )
}
