import { useEffect, useState } from 'react'
import { api, type CatalogItem } from '../api'
import { Checkout } from '../components/Checkout'
import { RoosterSvg } from '../components/RoosterSvg'
import { RarityTag, Stars } from '../components/ui'
import { AVATARS, BREED_BY_ID, SKIN_BY_ID, TOOL_BY_ID } from '../game/data'
import { usdc } from '../game/catalog'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import { storedInvite } from '../game/social'
import { APP_NAME, APP_TAGLINE, DISCORD_URL } from '../brand'
import { LangSwitch } from '../components/LangSwitch'
import { locale, t, tn, tx } from '../i18n'

// ---------------- Cadastro / Login ----------------

export function AuthScreen({ initialMode = 'login' }: { initialMode?: 'cadastro' | 'login' } = {}) {
  const { actions, pubConfig } = useGame()
  const [mode, setMode] = useState<'cadastro' | 'login' | 'esqueci'>(initialMode)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [adult, setAdult] = useState(false)
  const [terms, setTerms] = useState(false)
  const [invite, setInvite] = useState(storedInvite)
  // 🎟️ Whitelist: com o acesso fechado, o cadastro pede o código (o servidor confere de verdade)
  const inviteOnly = pubConfig?.invites?.on !== false
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (mode === 'esqueci') {
      await api.forgot(email).catch(() => null)
      setBusy(false)
      setSent(true)
      return
    }
    const r = mode === 'cadastro' ? await actions.signup({ email, password, name, adult, terms, invite: invite.trim() || undefined }) : await actions.login(email, password)
    setBusy(false)
    if (!r.ok) setError(tx(r.error))
    else sfx.crow()
  }

  return (
    <div className="onboarding">
      <div className="ob-card">
        <div className="row-between" style={{ width: '100%' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { window.location.hash = '/' }}>
            {t('← Início')}
          </button>
          <LangSwitch compact />
        </div>
        <div className="ob-hero">
          <RoosterSvg breedId="dourado" skin="fogo" anim="idle" size={170} equipped={{ cabeca: 'coroa' }} />
          <div>
            <h1 className="title-font">{APP_NAME}</h1>
            <p className="muted">{t(APP_TAGLINE)}</p>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            {t('Já tenho conta')}
          </button>
          <button className={`tab ${mode === 'cadastro' ? 'active' : ''}`} onClick={() => setMode('cadastro')}>
            {t('Criar conta')}
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'cadastro' && (inviteOnly || invite) && (
            <label className="field">
              <span>{inviteOnly ? t('🎟️ Código de convite') : t('🎟️ Código de convite (opcional)')}</span>
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value.toUpperCase())}
                placeholder={t('Ex.: GALO-AB12-CD34')}
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                required={inviteOnly}
              />
              {inviteOnly && (
                <small className="tiny muted">
                  {t('O acesso está fechado: só entra quem foi convidado. Peça um convite a um amigo que já joga ou entre no nosso Discord.')}
                  {DISCORD_URL && (
                    <>
                      {' '}
                      <a href={DISCORD_URL} target="_blank" rel="noreferrer">
                        {t('Entrar no Discord')}
                      </a>
                    </>
                  )}
                </small>
              )}
            </label>
          )}
          {mode === 'cadastro' && (
            <label className="field">
              <span>{t('Nome de criador')}</span>
              <input maxLength={16} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Ex.: Zé do Terreiro')} required />
            </label>
          )}
          <label className="field">
            <span>{t('E-mail')}</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('voce@email.com')} required />
          </label>
          {mode !== 'esqueci' && (
          <label className="field">
            <span>{t('Senha')}</span>
            <input
              type="password"
              autoComplete={mode === 'cadastro' ? 'new-password' : 'current-password'}
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('Mínimo 8 caracteres')}
              required
            />
          </label>
          )}
          {mode === 'cadastro' && (
            <>
              <label className="check">
                <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> {t('Tenho 18 anos ou mais')}
              </label>
              <label className="check">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />{' '}
                <>
                  {tn('Li e aceito os {termos} e a {privacidade}', {
                    termos: (
                      <a key="t" href="#/termos" target="_blank">
                        {t('termos de uso')}
                      </a>
                    ),
                    privacidade: (
                      <a key="p" href="#/privacidade" target="_blank">
                        {t('política de privacidade')}
                      </a>
                    ),
                  })}
                </>
              </label>
            </>
          )}
          {error && <p className="neg">{error}</p>}
          {sent && mode === 'esqueci' ? (
            <p className="pos">{t('Se existir uma conta com esse e-mail, enviamos um link para criar uma senha nova. Confira sua caixa de entrada.')}</p>
          ) : (
            <button className="btn btn-primary btn-lg full" disabled={busy || (mode === 'cadastro' && (!adult || !terms))}>
              {busy ? t('Aguarde...') : mode === 'cadastro' ? t('🐓 Criar conta') : mode === 'login' ? t('Entrar') : t('Enviar link')}
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="btn btn-ghost btn-sm full" onClick={() => setMode('esqueci')}>
              {t('Esqueci minha senha')}
            </button>
          )}
          {mode === 'esqueci' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm full"
              onClick={() => {
                setMode('login')
                setSent(false)
              }}
            >
              {t('← Voltar para o login')}
            </button>
          )}
        </form>
        <p className="tiny muted center">
          <a href="#/termos">{t('Termos de uso')}</a> · <a href="#/privacidade">{t('Privacidade')}</a> · {t('Proibido para menores de 18 anos')}
        </p>
      </div>
    </div>
  )
}

// ---------------- Escolha do primeiro galo ----------------

export function StarterScreen() {
  const { actions, toast, user, pubConfig } = useGame()
  const mvp = !!pubConfig?.mvp.on
  const [items, setItems] = useState<CatalogItem[]>([])
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [buying, setBuying] = useState<CatalogItem | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.catalog().then((r) => setItems(r.items.filter((i) => i.kind === 'starter')))
  }, [])

  const free = async () => {
    setBusy(true)
    const r = await actions.startFree(avatar)
    setBusy(false)
    if (!r.ok) toast(tx(r.error), 'erro')
  }

  const livre = BREED_BY_ID.livre

  return (
    <div className="onboarding">
      <div className="starter-page">
        <div className="center">
          <h1 className="title-font">{t('Bem-vindo, {nome}! 🐣', { nome: user?.name ?? '' })}</h1>
          <p className="muted">{t('Escolha como começar. Galos melhores ganham mais lutas e sobem de nível mais rápido.')}</p>
          {mvp && (
            <div className="mvp-banner">
              🎁 <b>{t('MODO MVP:')}</b>{' '}
              {user && !user.emailVerified ? (
                <>✉️ {t('confirme seu e-mail para ganhar o seu crédito de teste e escolher um kit. Por enquanto, você pode começar de graça com o Galo Livre.')}</>
              ) : (
                <>{tn('você ganhou {valor} de crédito de teste para gastar na loja. Escolha um kit abaixo!', { valor: <b key="v">{usdc(user?.mvpCreditCents ?? 0)}</b> })}</>
              )}
            </div>
          )}
          <div className="avatar-pick center-row">
            {AVATARS.map((a) => (
              <button key={a} className={`avatar ${a === avatar ? 'selected' : ''}`} onClick={() => setAvatar(a)}>
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="starter-grid">
          <div className="card starter-card">
            <span className="pill-free">{t('GRÁTIS')}</span>
            <RoosterSvg breedId="livre" size={150} anim="idle" />
            <h3>🐔 {t('Galo Livre')}</h3>
            <p className="tiny muted italic">"{livre.desc}"</p>
            <div className="tiny">
              <RarityTag rarity="comum" /> <Stars n={1} />
            </div>
            <ul className="starter-list">
              <li>❤️ {livre.base.hp} · 🗡️ {livre.base.atk} · 🛡️ {livre.base.def} · 💨 {livre.base.spd}</li>
              <li>{t('🌽 {milho} de milho · 🥚 {ovos} ovos', { milho: (1500).toLocaleString(locale()), ovos: 10 })}</li>
              <li>{t('Potencial baixo: cresce devagar')}</li>
            </ul>
            <button className="btn full" disabled={busy} onClick={free}>
              {t('Começar de graça')}
            </button>
          </div>

          {items.map((it) => {
            const b = BREED_BY_ID[it.breedId!]
            return (
              <div key={it.id} className={`card starter-card rar-${b.rarity} ${it.tag ? 'tagged' : ''}`}>
                {it.tag && <span className="pack-tag">{tx(it.tag)}</span>}
                <RoosterSvg breedId={b.id} skin={it.skin} size={150} anim="idle" />
                <h3>
                  {it.emoji} {tx(it.name)}
                </h3>
                <div className="tiny">
                  <RarityTag rarity={b.rarity} /> <Stars n={it.stars ?? 3} />
                </div>
                <ul className="starter-list">
                  <li>
                    🐓 {b.name}: ❤️ {b.base.hp} · 🗡️ {b.base.atk} · 🛡️ {b.base.def} · 💨 {b.base.spd}
                  </li>
                  {it.skin && <li>{t('🎨 Skin {nome}', { nome: SKIN_BY_ID[it.skin].name })}</li>}
                  <li>{t('🥚 {n} ovos de ouro', { n: (it.ovos ?? 0).toLocaleString(locale()) })}</li>
                  {it.tools && <li>🧰 {Object.entries(it.tools).map(([tid, q]) => `${TOOL_BY_ID[tid].emoji}×${q}`).join(' ')}</li>}
                </ul>
                <button className="btn btn-gold full btn-lg" onClick={() => setBuying(it)}>
                  {mvp ? t('🎁 Usar crédito · {preco}', { preco: usdc(it.priceCents) }) : '💵 ' + usdc(it.priceCents)}
                </button>
              </div>
            )
          })}
        </div>
        <p className="tiny muted center">
          {t('Pagamento em USDC pela sua carteira cripto. Itens virtuais, sem valor em dinheiro e sem saque. Você pode trocar de ideia: o kit também aparece depois na Loja (uma vez por conta).')}
        </p>
        <div className="center">
          <button className="btn btn-ghost btn-sm" onClick={() => actions.logout()}>
            {t('Sair')}
          </button>
        </div>
      </div>
      <Checkout item={buying} onClose={() => setBuying(null)} />
    </div>
  )
}

// ---------------- Redefinir senha (link do e-mail) ----------------

export function ResetScreen() {
  const token = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token') ?? ''
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="onboarding">
      <form
        className="ob-card"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            await api.reset(token, password)
            setDone(true)
          } catch (err) {
            setError(tx((err as Error).message))
          } finally {
            setBusy(false)
          }
        }}
      >
        <h2>{t('🔑 Criar senha nova')}</h2>
        {done ? (
          <>
            <p className="pos">{t('Senha alterada! Entre com a senha nova.')}</p>
            <a className="btn btn-primary" href="#/">
              {t('Ir para o login')}
            </a>
          </>
        ) : (
          <>
            <label className="field">
              <span>{t('Nova senha')}</span>
              <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <p className="neg">{error}</p>}
            <button className="btn btn-primary btn-lg full" disabled={busy}>
              {t('Salvar senha')}
            </button>
          </>
        )}
      </form>
    </div>
  )
}

/** Tela de confirmação de e-mail (link do e-mail → #/confirmar?token=...). Confirma ao abrir. */
export function ConfirmEmailScreen() {
  const token = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token') ?? ''
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    api
      .verifyEmail(token)
      .then(() => alive && setStatus('ok'))
      .catch((err) => {
        if (!alive) return
        setError(tx((err as Error).message))
        setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [token])
  return (
    <div className="onboarding">
      <div className="ob-card center">
        {status === 'loading' && (
          <>
            <div className="spinner big" />
            <p className="muted">{t('Confirmando seu e-mail…')}</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div className="prize-emoji">✅</div>
            <h2>{t('E-mail confirmado!')}</h2>
            <p className="pos">{t('Pronto! Seu crédito de boas-vindas foi liberado.')}</p>
            <a className="btn btn-primary btn-lg" href="/">
              {t('Entrar no jogo')}
            </a>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="prize-emoji">⚠️</div>
            <h2>{t('Não deu para confirmar')}</h2>
            <p className="neg">{error}</p>
            <a className="btn" href="/">
              {t('Voltar')}
            </a>
          </>
        )}
      </div>
    </div>
  )
}
