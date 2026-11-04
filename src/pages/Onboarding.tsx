import { useEffect, useState } from 'react'
import { api, type CatalogItem } from '../api'
import { Checkout } from '../components/Checkout'
import { RoosterSvg } from '../components/RoosterSvg'
import { RarityTag, Stars } from '../components/ui'
import { AVATARS, BREED_BY_ID, SKIN_BY_ID, TOOL_BY_ID } from '../game/data'
import { brl } from '../game/catalog'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import { APP_NAME, APP_TAGLINE } from '../brand'

// ---------------- Cadastro / Login ----------------

export function AuthScreen() {
  const { actions } = useGame()
  const [mode, setMode] = useState<'cadastro' | 'login' | 'esqueci'>('cadastro')
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [adult, setAdult] = useState(false)
  const [terms, setTerms] = useState(false)
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
    const r = mode === 'cadastro' ? await actions.signup({ email, password, name, adult, terms }) : await actions.login(email, password)
    setBusy(false)
    if (!r.ok) setError(r.error)
    else sfx.crow()
  }

  return (
    <div className="onboarding">
      <div className="ob-card">
        <div className="ob-hero">
          <RoosterSvg breedId="dourado" skin="fogo" anim="idle" size={170} equipped={{ cabeca: 'coroa' }} />
          <div>
            <h1 className="title-font">{APP_NAME}</h1>
            <p className="muted">{APP_TAGLINE}</p>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${mode === 'cadastro' ? 'active' : ''}`} onClick={() => setMode('cadastro')}>
            Criar conta
          </button>
          <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            Já tenho conta
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'cadastro' && (
            <label className="field">
              <span>Nome de criador</span>
              <input maxLength={16} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Zé do Terreiro" required />
            </label>
          )}
          <label className="field">
            <span>E-mail</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" required />
          </label>
          {mode !== 'esqueci' && (
          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              autoComplete={mode === 'cadastro' ? 'new-password' : 'current-password'}
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
            />
          </label>
          )}
          {mode === 'cadastro' && (
            <>
              <label className="check">
                <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> Tenho 18 anos ou mais
              </label>
              <label className="check">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> Li e aceito os{' '}
                <a href="#/termos" target="_blank">
                  termos de uso
                </a>{' '}
                e a{' '}
                <a href="#/privacidade" target="_blank">
                  política de privacidade
                </a>
              </label>
            </>
          )}
          {error && <p className="neg">{error}</p>}
          {sent && mode === 'esqueci' ? (
            <p className="pos">Se existir uma conta com esse e-mail, enviamos um link para criar uma senha nova. Confira sua caixa de entrada.</p>
          ) : (
            <button className="btn btn-primary btn-lg full" disabled={busy || (mode === 'cadastro' && (!adult || !terms))}>
              {busy ? 'Aguarde...' : mode === 'cadastro' ? '🐓 Criar conta' : mode === 'login' ? 'Entrar' : 'Enviar link'}
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="btn btn-ghost btn-sm full" onClick={() => setMode('esqueci')}>
              Esqueci minha senha
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
              ← Voltar para o login
            </button>
          )}
        </form>
        <p className="tiny muted center">
          <a href="#/termos">Termos de uso</a> · <a href="#/privacidade">Privacidade</a> · Proibido para menores de 18 anos
        </p>
      </div>
    </div>
  )
}

// ---------------- Escolha do primeiro galo ----------------

export function StarterScreen() {
  const { actions, toast, user } = useGame()
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
    if (!r.ok) toast(r.error, 'erro')
  }

  const livre = BREED_BY_ID.livre

  return (
    <div className="onboarding">
      <div className="starter-page">
        <div className="center">
          <h1 className="title-font">Bem-vindo, {user?.name}! 🐣</h1>
          <p className="muted">Escolha como começar. Galos melhores ganham mais lutas e sobem de nível mais rápido.</p>
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
            <span className="pill-free">GRÁTIS</span>
            <RoosterSvg breedId="livre" size={150} anim="idle" />
            <h3>🐔 Galo Livre</h3>
            <p className="tiny muted italic">"{livre.desc}"</p>
            <div className="tiny">
              <RarityTag rarity="comum" /> <Stars n={1} />
            </div>
            <ul className="starter-list">
              <li>❤️ {livre.base.hp} · 🗡️ {livre.base.atk} · 🛡️ {livre.base.def} · 💨 {livre.base.spd}</li>
              <li>🌽 1.500 de milho · 🥚 10 ovos</li>
              <li>Potencial baixo: cresce devagar</li>
            </ul>
            <button className="btn full" disabled={busy} onClick={free}>
              Começar de graça
            </button>
          </div>

          {items.map((it) => {
            const b = BREED_BY_ID[it.breedId!]
            return (
              <div key={it.id} className={`card starter-card rar-${b.rarity} ${it.tag ? 'tagged' : ''}`}>
                {it.tag && <span className="pack-tag">{it.tag}</span>}
                <RoosterSvg breedId={b.id} skin={it.skin} size={150} anim="idle" />
                <h3>
                  {it.emoji} {it.name}
                </h3>
                <div className="tiny">
                  <RarityTag rarity={b.rarity} /> <Stars n={it.stars ?? 3} />
                </div>
                <ul className="starter-list">
                  <li>
                    🐓 {b.name}: ❤️ {b.base.hp} · 🗡️ {b.base.atk} · 🛡️ {b.base.def} · 💨 {b.base.spd}
                  </li>
                  {it.skin && <li>🎨 Skin {SKIN_BY_ID[it.skin].name}</li>}
                  <li>🥚 {it.ovos} ovos de ouro</li>
                  {it.tools && <li>🧰 {Object.entries(it.tools).map(([t, q]) => `${TOOL_BY_ID[t].emoji}×${q}`).join(' ')}</li>}
                </ul>
                <button className="btn btn-gold full btn-lg" onClick={() => setBuying(it)}>
                  ⚡ {brl(it.priceCents)} no Pix
                </button>
              </div>
            )
          })}
        </div>
        <p className="tiny muted center">
          Pagamento por Pix ou cartão. Itens virtuais, sem valor em dinheiro e sem saque. Você pode trocar de ideia: o kit também aparece depois na Loja (uma vez por conta).
        </p>
        <div className="center">
          <button className="btn btn-ghost btn-sm" onClick={() => actions.logout()}>
            Sair
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
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <h2>🔑 Criar senha nova</h2>
        {done ? (
          <>
            <p className="pos">Senha alterada! Entre com a senha nova.</p>
            <a className="btn btn-primary" href="#/">
              Ir para o login
            </a>
          </>
        ) : (
          <>
            <label className="field">
              <span>Nova senha</span>
              <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <p className="neg">{error}</p>}
            <button className="btn btn-primary btn-lg full" disabled={busy}>
              Salvar senha
            </button>
          </>
        )}
      </form>
    </div>
  )
}
