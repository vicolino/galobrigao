import { useState } from 'react'
import { fmt, today } from '../game/rooster'
import { sfx } from '../game/sound'
import { titleFor, useGame } from '../game/store'
import { Modal, go } from './ui'
import { DAILY_OVOS } from '../game/rewards'
import { brl } from '../game/catalog'
import { APP_NAME, ARENA } from '../brand'

const NAV = [
  { path: '/galinheiro', label: 'Galinheiro', emoji: '🏠' },
  { path: '/rinha', label: ARENA, emoji: '⚔️' },
  { path: '/desafios', label: 'Desafios', emoji: '🤝' },
  { path: '/apostas', label: 'Apostas', emoji: '🎲' },
  { path: '/missoes', label: 'Missões', emoji: '🎯' },
  { path: '/liga', label: 'Liga', emoji: '🏆' },
  { path: '/loja/skins', label: 'Skins', emoji: '🎨' },
  { path: '/loja/ferramentas', label: 'Ferramentas', emoji: '🧰' },
  { path: '/loja', label: 'Loja', emoji: '🛒' },
  { path: '/perfil', label: 'Perfil', emoji: '👤' },
]

export function Sidebar({ route, open, onClose }: { route: string; open: boolean; onClose: () => void }) {
  const { state, actions, toast, isVip, wallet, pvp, user, pubConfig } = useGame()
  const [daily, setDaily] = useState<{ milho: number; ovo: number; streak: number } | null>(null)
  if (!state) return null
  const s = state
  const dailyReady = s.daily.last !== today()
  const missionsReady = s.missions.list.filter((m) => !m.claimed && m.progress >= m.goal).length
  const openBets = s.bets.filter((b) => b.status === 'pendente').length

  const claim = () => {
    const r = actions.claimDaily()
    if (r.ok) setDaily(r.value!)
    else toast(r.error, 'info')
  }

  return (
    <>
      <div className={`sidebar-back ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand" onClick={() => go('/galinheiro')}>
          <div className="brand-logo">🐓</div>
          <span>{APP_NAME}</span>
        </div>
        <nav>
          {NAV.map((n) => {
            const special = ['/loja/skins', '/loja/ferramentas']
            const active = special.includes(n.path) ? route.startsWith(n.path) : route.startsWith(n.path) && !special.some((p) => route.startsWith(p))
            const badge = n.path === '/missoes' ? missionsReady : n.path === '/apostas' ? openBets : n.path === '/desafios' ? (pvp?.incoming.length ?? 0) : 0
            return (
              <a
                key={n.path}
                href={`#${n.path}`}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => {
                  sfx.click()
                  onClose()
                }}
              >
                <span className="nav-emoji">{n.emoji}</span>
                {n.label}
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </a>
            )
          })}
        </nav>
        {user?.isAdmin && (
          <a href="#/admin" className="nav-item admin-link">
            <span className="nav-emoji">🛠️</span>
            Backoffice
          </a>
        )}

        <div className="side-bottom">
          <div className="wallet">
            <div className="wallet-row" onClick={() => go('/loja/trocar')}>
              <span>🌽 Milho</span>
              <b>{fmt(wallet!.milho)}</b>
            </div>
            <div className="wallet-row" onClick={() => go('/loja/ovos')}>
              <span>🥚 Ovo de ouro</span>
              <b>{fmt(wallet!.ovos)}</b>
            </div>
            {pubConfig?.mvp.on && (
              <div className="wallet-row credit-row" onClick={() => go('/loja/ovos')} title="Crédito de teste do Modo MVP (sem valor real)">
                <span>🎁 Crédito MVP</span>
                <b>{brl(user?.mvpCreditCents ?? 0)}</b>
              </div>
            )}
            <a className="btn btn-sm btn-gold" href="#/loja/ovos">💎 Comprar ovos</a>
            <p className="tiny muted center">Moeda virtual · sem saque</p>
            <button className={`btn btn-daily ${dailyReady ? 'pulse' : ''}`} onClick={claim}>
              🎁 {dailyReady ? 'Bônus diário' : `Sequência: ${s.daily.streak} dia${s.daily.streak === 1 ? '' : 's'}`}
            </button>
          </div>

          <div className="user-box">
            <div className="avatar" onClick={() => go('/perfil')}>
              {s.player.avatar}
            </div>
            <div className="user-info" onClick={() => go('/perfil')}>
              <b>{s.player.name}</b>
              <span className="tiny">
                {isVip ? '👑 ' : '🏅 '}
                {titleFor(s)}
              </span>
            </div>
          </div>
          <div className="volume">
            <button className="icon-btn" onClick={() => actions.setSettings({ muted: !s.settings.muted })} title="Som">
              {s.settings.muted || s.settings.volume === 0 ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.settings.muted ? 0 : s.settings.volume}
              onChange={(e) => actions.setSettings({ volume: Number(e.target.value), muted: false })}
            />
          </div>
        </div>
      </aside>

      <Modal open={!!daily} onClose={() => setDaily(null)} title="🎁 Bônus diário">
        {daily && (
          <div className="center">
            <div className="streak">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className={`streak-day ${i < daily.streak ? 'done' : ''} ${i === 6 ? 'big' : ''}`}>
                  <span>Dia {i + 1}</span>
                  <b>{i === 6 ? `🥚×${DAILY_OVOS(7)}` : `🌽${300 * (i + 1)}`}</b>
                  {i < 6 && <small>🥚 {DAILY_OVOS(i + 1)}</small>}
                </div>
              ))}
            </div>
            <p className="reward-big">
              +🌽 {fmt(daily.milho)} &nbsp; +🥚 {daily.ovo}
            </p>
            <p className="muted">Volte amanhã para manter a sequência! O 7º dia dá um prêmio especial.</p>
            <button className="btn btn-primary" onClick={() => setDaily(null)}>
              Valeu!
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}
