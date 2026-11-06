import { useState } from 'react'
import { newsUnread } from './Novidades'
import { fmt, today } from '../game/rooster'
import { sfx } from '../game/sound'
import { titleFor, useGame } from '../game/store'
import { Modal, go } from './ui'
import { Icon, type IconName } from './Icon'
import { Logo } from './Logo'
import { DAILY_OVOS } from '../game/rewards'
import { brl } from '../game/catalog'
import { ARENA } from '../brand'
import { t, tp } from '../i18n'
import { LangSwitch } from './LangSwitch'
import { passClaimable } from '../pages/Passe'

type Item = { path: string; label: string; icon: IconName }

const NAV: Item[] = [
  { path: '/galinheiro', label: t('Galinheiro'), icon: 'galinheiro' },
  { path: '/cruzamento', label: t('Cruzamento'), icon: 'cruzamento' },
  { path: '/rinha', label: t(ARENA), icon: 'arena' },
  { path: '/drops', label: t('Drops'), icon: 'drops' },
  { path: '/desafios', label: t('Desafios'), icon: 'desafios' },
  { path: '/torneios', label: t('Torneios'), icon: 'torneios' },
  { path: '/apostas', label: t('Apostas'), icon: 'apostas' },
  { path: '/missoes', label: t('Missões'), icon: 'missoes' },
  { path: '/passe', label: t('Passe'), icon: 'passe' },
  { path: '/liga', label: t('Liga'), icon: 'liga' },
  { path: '/ranking', label: t('Ranking'), icon: 'ranking' },
  { path: '/loja/skins', label: t('Skins'), icon: 'skins' },
  { path: '/loja/ferramentas', label: t('Ferramentas'), icon: 'ferramentas' },
  { path: '/loja', label: t('Loja'), icon: 'loja' },
  { path: '/feira', label: t('Feira'), icon: 'feira' },
  { path: '/carteira', label: t('Carteira'), icon: 'carteira' },
  { path: '/mercado', label: t('Mercado'), icon: 'mercado' },
  { path: '/novidades', label: t('Novidades'), icon: 'novidades' },
  { path: '/perfil', label: t('Perfil'), icon: 'perfil' },
]

// Principais no topo (desktop) e na barra de baixo (celular)
const TOP = ['/galinheiro', '/rinha', '/desafios', '/torneios', '/apostas', '/loja']
const BOTTOM = ['/galinheiro', '/rinha', '/apostas', '/loja']
const SPECIAL = ['/loja/skins', '/loja/ferramentas']

export function Nav({ route }: { route: string }) {
  const { state, actions, toast, isVip, wallet, pvp, user, pubConfig, betsInfo } = useGame()
  const [sheet, setSheet] = useState(false)
  const [daily, setDaily] = useState<{ milho: number; ovo: number; fichas: number; streak: number } | null>(null)
  if (!state) return null
  const s = state
  const dailyReady = s.daily.last !== today()
  const missionsReady = s.missions.list.filter((m) => !m.claimed && m.progress >= m.goal).length
  const openBets = betsInfo?.open ?? 0
  const web3 = !!pubConfig?.web3

  const items = NAV.filter((n) => web3 || (n.path !== '/carteira' && n.path !== '/mercado'))
  const isActive = (p: string) => (SPECIAL.includes(p) ? route.startsWith(p) : route.startsWith(p) && !SPECIAL.some((x) => route.startsWith(x)))
  const badgeFor = (p: string) =>
    p === '/missoes' ? missionsReady : p === '/passe' ? passClaimable(s) : p === '/apostas' ? openBets : p === '/desafios' ? pvp?.incoming.length ?? 0 : p === '/novidades' ? newsUnread(s.settings.newsSeen) : 0
  const totalBadge = items.reduce((n, it) => (TOP.includes(it.path) ? n : n + badgeFor(it.path)), 0)

  const claim = async () => {
    const r = await actions.claimDaily()
    if (r.ok) setDaily(r.value!)
    else toast(r.error, 'info')
  }

  const navClick = () => {
    sfx.click()
    setSheet(false)
  }

  const byPath = (p: string) => items.find((i) => i.path === p)

  const link = (it: Item, kind: 'top' | 'bottom' | 'sheet') => {
    const b = badgeFor(it.path)
    return (
      <a key={it.path} href={`#${it.path}`} className={`navlink navlink-${kind} ${isActive(it.path) ? 'active' : ''}`} onClick={navClick}>
        <span className="navlink-ico">
          <Icon name={it.icon} size={kind === 'top' ? 20 : 24} />
          {b > 0 && <span className="navlink-dot">{b > 9 ? '9+' : b}</span>}
        </span>
        <span className="navlink-txt">{it.label}</span>
      </a>
    )
  }

  const walletPills = (
    <div className="wpills">
      <button className="wpill" onClick={() => go('/loja/trocar')} title={t('Milho')}>
        🌽 <b>{fmt(wallet!.milho)}</b>
      </button>
      <button className="wpill" onClick={() => go('/loja/ovos')} title={t('Ovo de ouro')}>
        🥚 <b>{fmt(wallet!.ovos)}</b>
      </button>
      <button className="wpill wpill-add" onClick={() => go('/loja/ovos')} aria-label={t('Comprar ovos')}>
        +
      </button>
    </div>
  )

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <button className="brand" onClick={() => go('/galinheiro')}>
            <Logo size={46} />
          </button>
          <nav className="topnav">{TOP.map((p) => byPath(p)).filter(Boolean).map((it) => link(it!, 'top'))}</nav>
          <div className="topbar-right">
            {walletPills}
            <button className={`btn-candy btn-daily ${dailyReady ? 'wiggle' : ''}`} onClick={claim}>
              🎁 <span className="hide-sm">{dailyReady ? t('Bônus') : tp('{n} dia', '{n} dias', s.daily.streak)}</span>
            </button>
            <button className="more-btn" onClick={() => setSheet(true)} aria-label={t('Mais')}>
              <Icon name="mais" size={22} />
              {totalBadge > 0 && <span className="navlink-dot">{totalBadge > 9 ? '9+' : totalBadge}</span>}
            </button>
            <button className="avatar-btn" onClick={() => go('/perfil')} aria-label={t('Perfil')}>
              <span className="avatar">{s.player.avatar}</span>
            </button>
          </div>
        </div>
      </header>

      <nav className="bottombar">
        {BOTTOM.map((p) => byPath(p)).filter(Boolean).map((it) => link(it!, 'bottom'))}
        <button className={`navlink navlink-bottom ${sheet ? 'active' : ''}`} onClick={() => setSheet(true)}>
          <span className="navlink-ico">
            <Icon name="mais" size={24} />
            {totalBadge > 0 && <span className="navlink-dot">{totalBadge > 9 ? '9+' : totalBadge}</span>}
          </span>
          <span className="navlink-txt">{t('Mais')}</span>
        </button>
      </nav>

      <Modal open={sheet} onClose={() => setSheet(false)} title={t('Menu')}>
        <div className="sheet">
          <div className="sheet-user" onClick={() => { setSheet(false); go('/perfil') }}>
            <span className="avatar big">{s.player.avatar}</span>
            <div>
              <b>{s.player.name}</b>
              <span className="tiny gold">{isVip ? '👑 ' : '🏅 '}{titleFor(s)}</span>
            </div>
          </div>

          <div className="sheet-wallet">
            <button className="wcard" onClick={() => { setSheet(false); go('/loja/trocar') }}>
              <span>🌽 {t('Milho')}</span>
              <b>{fmt(wallet!.milho)}</b>
            </button>
            <button className="wcard" onClick={() => { setSheet(false); go('/loja/ovos') }}>
              <span>🥚 {t('Ovo de ouro')}</span>
              <b>{fmt(wallet!.ovos)}</b>
            </button>
            <button className="wcard" onClick={() => { setSheet(false); go('/apostas') }} title={t('Fichas são só para apostar: você ganha jogando, não dá para comprar nem trocar.')}>
              <span>🎟️ {t('Fichas')}</span>
              <b>{fmt(wallet!.fichas)}</b>
            </button>
            {pubConfig?.mvp.on && (
              <button className="wcard" onClick={() => { setSheet(false); go('/loja/ovos') }} title={t('Crédito de teste do Modo MVP (sem valor real)')}>
                <span>🎁 {t('Crédito MVP')}</span>
                <b>{brl(user?.mvpCreditCents ?? 0)}</b>
              </button>
            )}
          </div>
          <p className="tiny muted center nomargin">{t('Moeda virtual · sem saque')}</p>

          <div className="sheet-grid">
            {items.map((it) => link(it, 'sheet'))}
            {user?.isAdmin && (
              <a href="#/admin" className="navlink navlink-sheet" onClick={navClick}>
                <span className="navlink-ico"><Icon name="admin" size={24} /></span>
                <span className="navlink-txt">{t('Backoffice')}</span>
              </a>
            )}
          </div>

          <div className="sheet-foot">
            <button className="icon-btn" onClick={() => actions.setSettings({ muted: !s.settings.muted })} aria-label={t('Som')}>
              <Icon name={s.settings.muted || s.settings.volume === 0 ? 'mudo' : 'som'} size={20} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.settings.muted ? 0 : s.settings.volume}
              onChange={(e) => actions.setSettings({ volume: Number(e.target.value), muted: false })}
            />
            <LangSwitch compact />
          </div>
        </div>
      </Modal>

      <Modal open={!!daily} onClose={() => setDaily(null)} title={'🎁 ' + t('Bônus diário')}>
        {daily && (
          <div className="center">
            <div className="streak">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className={`streak-day ${i < daily.streak ? 'done' : ''} ${i === 6 ? 'big' : ''}`}>
                  <span>{t('Dia {n}', { n: i + 1 })}</span>
                  <b>{i === 6 ? `🥚×${DAILY_OVOS(7)}` : `🌽${300 * (i + 1)}`}</b>
                  {i < 6 && <small>🥚 {DAILY_OVOS(i + 1)}</small>}
                </div>
              ))}
            </div>
            <p className="reward-big">
              +🌽 {fmt(daily.milho)} &nbsp; +🥚 {daily.ovo}
              {daily.fichas > 0 && <> &nbsp; +🎟️ {fmt(daily.fichas)}</>}
            </p>
            <p className="muted">{t('Volte amanhã para manter a sequência! O 7º dia dá um prêmio especial.')}</p>
            <button className="btn btn-primary" onClick={() => setDaily(null)}>
              {t('Valeu!')}
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
