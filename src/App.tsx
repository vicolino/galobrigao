import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Toasts, useHashRoute } from './components/ui'
import { fmt } from './game/rooster'
import { useGame } from './game/store'
import { Apostas, BetResult } from './pages/Apostas'
import { Galinheiro } from './pages/Galinheiro'
import { Liga } from './pages/Liga'
import { Loja } from './pages/Loja'
import { Luta } from './pages/Luta'
import { Missoes } from './pages/Missoes'
import { Passe } from './pages/Passe'
import { AuthScreen, ResetScreen, StarterScreen } from './pages/Onboarding'
import { Legal } from './pages/Legal'
import { ChallengeAlert, ChallengeDeclined, Desafios } from './pages/Desafios'
import { OfferCenter } from './components/Ofertas'
import { NewsCenter, Novidades } from './components/Novidades'
import { BuyConfirm } from './components/BuyConfirm'
import { Admin } from './admin/Admin'
import { Perfil } from './pages/Perfil'
import { Rinha } from './pages/Rinha'
import { Carteira } from './pages/Carteira'
import { Mercado } from './pages/Mercado'
import { Feira } from './pages/Feira'
import { Cruzamento } from './pages/Cruzamento'
import { Ranking } from './pages/Ranking'
import { TorneioAlert, Torneios } from './pages/Torneios'
import { APP_NAME } from './brand'
import { t, tx } from './i18n'
import { Drops } from './pages/Drops'

export default function App() {
  const { state, phase, wallet, user, pubConfig, updateReady } = useGame()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('aviso-fechado') ?? ''
    } catch {
      return ''
    }
  })
  const route = useHashRoute()
  const [menu, setMenu] = useState(false)

  const publicPath = route.split('?')[0]
  if (publicPath === '/termos' || publicPath === '/privacidade') return <Legal doc={publicPath === '/termos' ? 'termos' : 'privacidade'} />
  if (publicPath === '/redefinir') return <ResetScreen />
  if (phase === 'carregando') return <div className="onboarding"><div className="spinner big" /></div>
  if (phase === 'login') return (<><AuthScreen /><Toasts /></>)
  if (publicPath.startsWith('/admin')) return (<><Admin tab={publicPath.split('/')[2]} /><Toasts /></>)
  if (pubConfig?.maintenance.on && !user?.isAdmin)
    return (
      <div className="onboarding">
        <div className="ob-card center">
          <div className="prize-emoji">🚧</div>
          <h2>{t('Em manutenção')}</h2>
          <p className="muted">{tx(pubConfig.maintenance.message) || t('Estamos ajeitando o terreiro. Voltamos já!')}</p>
          <button className="btn" onClick={() => location.reload()}>{t('Tentar de novo')}</button>
        </div>
      </div>
    )
  if (phase === 'inicio' || !state) return (<><StarterScreen /><Toasts /></>)

  const [, section, param] = route.split('?')[0].split('/')
  let page
  switch (section) {
    case 'rinha': page = <Rinha />; break
    case 'desafios': page = <Desafios />; break
    case 'apostas': page = <Apostas />; break
    case 'luta': page = <Luta />; break
    case 'missoes': page = <Missoes />; break
    case 'passe': page = <Passe />; break
    case 'liga': page = <Liga />; break
    case 'loja': page = <Loja tab={param} />; break
    case 'perfil': page = <Perfil />; break
    case 'carteira': page = <Carteira />; break
    case 'mercado': page = <Mercado />; break
    case 'feira': page = <Feira tab={param} />; break
    case 'cruzamento': page = <Cruzamento />; break
    case 'ranking': page = <Ranking />; break
    case 'torneios': page = <Torneios id={param} />; break
    case 'novidades': page = <Novidades />; break
    case 'drops': page = <Drops />; break
    default: page = <Galinheiro selectedId={param} />
  }

  return (
    <div className="layout">
      <header className="mobile-bar">
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label={t('Menu')}>☰</button>
        <b>🐓 {APP_NAME}</b>
        <span className="tiny">🌽 {fmt(wallet!.milho)} · 🥚 {fmt(wallet!.ovos)}</span>
      </header>
      <Sidebar route={route} open={menu} onClose={() => setMenu(false)} />
      <main className="main">
        {updateReady && (
          <div className="announce announce-promo">
            <span>🔄 {t('Saiu uma versão nova do jogo.')}</span>
            <button className="btn btn-sm btn-primary" onClick={() => location.reload()}>
              {t('Atualizar')}
            </button>
          </div>
        )}
        {pubConfig?.maintenance.on && <div className="announce announce-alerta">🚧 {t('Modo manutenção ligado — só administradores conseguem jogar.')}</div>}
        {pubConfig?.announcement.text && hidden !== pubConfig.announcement.text && (
          <div className={`announce announce-${pubConfig.announcement.kind}`}>
            <span>{pubConfig.announcement.kind === 'promo' ? '🎉' : pubConfig.announcement.kind === 'alerta' ? '⚠️' : '📢'} {tx(pubConfig.announcement.text)}</span>
            <button
              className="icon-btn"
              aria-label={t('Fechar aviso')}
              onClick={() => {
                setHidden(pubConfig.announcement.text)
                try {
                  localStorage.setItem('aviso-fechado', pubConfig.announcement.text)
                } catch {
                  /* sem armazenamento */
                }
              }}
            >
              ✕
            </button>
          </div>
        )}
        <div className="container" key={section}>{page}</div>
      </main>
      <ChallengeAlert />
      <ChallengeDeclined />
      <BetResult />
      <TorneioAlert />
      <OfferCenter />
      <NewsCenter />
      <BuyConfirm />
      <Toasts />
    </div>
  )
}
