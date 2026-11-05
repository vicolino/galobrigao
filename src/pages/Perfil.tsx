import { useEffect, useState } from 'react'
import { api, type ApiOrder } from '../api'
import { brl } from '../game/catalog'
import { Modal, PageHead } from '../components/ui'
import { ACHIEVEMENTS, AVATARS } from '../game/data'
import { fmt } from '../game/rooster'
import { titleFor, useGame } from '../game/store'
import { LangSwitch } from '../components/LangSwitch'
import { MyShowcaseCard } from './Ranking'
import { locale, t, tx } from '../i18n'

const ORDER_STATUS: Record<ApiOrder['status'], string> = {
  pendente: t('pendente'),
  pago: t('pago'),
  expirado: t('expirado'),
  recusado: t('recusado'),
}

export function Perfil() {
  const { state, actions, toast, isVip, user } = useGame()
  const [orders, setOrders] = useState<ApiOrder[]>([])
  useEffect(() => {
    api.orders().then((r) => setOrders(r.orders)).catch(() => null)
  }, [])
  const s = state!
  const [name, setName] = useState(s.player.name)
  const [avatar, setAvatar] = useState(s.player.avatar)
  const [confirmReset, setConfirmReset] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [delPass, setDelPass] = useState('')
  const [pwOpen, setPwOpen] = useState(false)
  const [pwCur, setPwCur] = useState('')
  const [pwNew, setPwNew] = useState('')

  const stats = [
    [t('⚔️ Lutas'), s.stats.fights],
    [t('🏆 Vitórias'), s.stats.wins],
    [t('💥 K.O.s'), s.stats.kos],
    [t('🎲 Apostas'), s.stats.betsPlaced],
    [t('✅ Apostas ganhas'), s.stats.betsWon],
    [t('💰 Maior prêmio'), `🎟️ ${fmt(s.stats.biggestWin)}`],
    [t('🌽 Milho ganho'), fmt(s.stats.milhoEarned)],
    [t('🎁 Caixas abertas'), s.stats.boxesOpened],
  ]

  return (
    <>
      <PageHead title={t('👤 Perfil')} subtitle={`${isVip ? '👑 ' : ''}${tx(titleFor(s))} · ${t('criador desde {data}', { data: new Date(s.player.createdAt).toLocaleDateString(locale()) })}`} />
      <div className="two-col">
        <div className="card">
          <h3>{t('Seus dados')}</h3>
          <label className="field">
            <span>{t('Nome')}</span>
            <input maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span>{t('Avatar')}</span>
            <div className="avatar-pick">
              {AVATARS.map((a) => (
                <button key={a} className={`avatar ${a === avatar ? 'selected' : ''}`} onClick={() => setAvatar(a)}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              actions.setProfile(name, avatar)
              toast(t('Perfil salvo!'), 'ok')
            }}
          >
            {t('Salvar')}
          </button>
          <div className="field" style={{ marginTop: 16 }}>
            <span>{t('Idioma')}</span>
            <LangSwitch />
          </div>
        </div>
        <div className="card">
          <h3>{t('Estatísticas')}</h3>
          <div className="stats-list">
            {stats.map(([k, v]) => (
              <div key={k as string}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <MyShowcaseCard />
      </div>

      {user && (
        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="card">
            <h3>{t('💳 Conta e limite de gastos')}</h3>
            <p className="tiny muted">{user.email}</p>
            <div className="bar bar-xp">
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, (user.limits.spentCents / user.limits.monthlyCents) * 100)}%` }} />
              </div>
              <span className="bar-label">
                {t('{gasto} / {limite} no mês', { gasto: brl(user.limits.spentCents), limite: brl(user.limits.monthlyCents) })}
              </span>
            </div>
            <label className="field">
              <span>{t('Limite mensal')}</span>
              <select
                value={user.limits.monthlyCents}
                onChange={async (e) => {
                  const r = await api.setLimit(Number(e.target.value))
                  actions.setUser(r.user)
                  toast(r.user.limits.pendingCents ? t('Aumento de limite vale em 24h.') : t('Limite atualizado.'), 'ok')
                }}
              >
                {user.limits.options.map((c) => (
                  <option key={c} value={c}>
                    {brl(c)}
                  </option>
                ))}
              </select>
            </label>
            {user.limits.pendingCents && (
              <p className="tiny warn">
                {t('Novo limite de {valor} vale a partir de {data}.', { valor: brl(user.limits.pendingCents), data: new Date(user.limits.pendingAt!).toLocaleString(locale()) })}
              </p>
            )}
            <p className="tiny muted">{t('Reduzir vale na hora. Aumentar leva 24h, para evitar compras por impulso.')}</p>
            <div className="row gap wrap">
              <button className="btn btn-sm" onClick={() => setPwOpen(true)}>
                {t('🔑 Trocar senha')}
              </button>
              <button className="btn btn-sm" onClick={() => actions.logout()}>
                {t('🚪 Sair da conta')}
              </button>
            </div>
          </div>
          <div className="card">
            <h3>{t('🧾 Minhas compras')}</h3>
            {orders.length === 0 ? (
              <p className="muted">{t('Nenhuma compra ainda.')}</p>
            ) : (
              <table className="table">
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="tiny muted">{new Date(o.createdAt).toLocaleDateString(locale())}</td>
                      <td>{tx(o.name)}</td>
                      <td className="tiny">{o.method === 'pix' ? t('⚡ Pix') : o.method === 'credito' ? t('🎁 Crédito') : t('💳 Cartão')}</td>
                      <td className="right">{brl(o.amountCents)}</td>
                      <td className={`tiny status-${o.status === 'pago' ? 'ganhou' : o.status === 'pendente' ? 'pendente' : 'perdeu'}`}>{ORDER_STATUS[o.status] ?? o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <h2 className="section-title">
        {t('🏅 Conquistas ({n}/{total})', { n: s.achievements.length, total: ACHIEVEMENTS.length })}
      </h2>
      <div className="achievements">
        {ACHIEVEMENTS.map((a) => {
          const got = s.achievements.includes(a.id)
          return (
            <div key={a.id} className={`card ach ${got ? 'got' : ''}`}>
              <span className="ach-emoji">{got ? a.emoji : '🔒'}</span>
              <b>{a.name}</b>
              <span className="tiny muted">{a.desc}</span>
            </div>
          )
        })}
      </div>

      <h2 className="section-title">{t('🧾 Extrato')}</h2>
      <div className="card">
        {s.history.length === 0 ? (
          <p className="muted">{t('Nada por aqui ainda.')}</p>
        ) : (
          <table className="table">
            <tbody>
              {s.history.slice(0, 30).map((h) => (
                <tr key={h.id}>
                  <td className="tiny muted">{new Date(h.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{tx(h.text)}</td>
                  <td className={`right ${h.milho >= 0 ? 'pos' : 'neg'}`}>{h.milho ? `${h.milho > 0 ? '+' : ''}🌽 ${fmt(h.milho)}` : ''}</td>
                  <td className={`right ${h.ovo >= 0 ? 'pos' : 'neg'}`}>{h.ovo ? `${h.ovo > 0 ? '+' : ''}🥚 ${h.ovo}` : ''}</td>
                  <td className={`right ${(h.fichas ?? 0) >= 0 ? 'pos' : 'neg'}`}>{h.fichas ? `${h.fichas > 0 ? '+' : ''}🎟️ ${fmt(h.fichas)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="center danger-zone">
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmReset(true)}>
          {t('🗑️ Apagar progresso')}
        </button>{' '}
        <button className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}>
          {t('❌ Excluir minha conta')}
        </button>
        <p className="tiny muted">
          <a href="#/termos">{t('Termos de uso')}</a> · <a href="#/privacidade">{t('Privacidade')}</a>
        </p>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title={t('🔑 Trocar senha')}>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await api.changePassword(pwCur, pwNew)
              toast(t('Senha alterada! Outros aparelhos foram desconectados.'), 'ok')
              setPwOpen(false)
              setPwCur('')
              setPwNew('')
            } catch (err) {
              toast(tx((err as Error).message), 'erro')
            }
          }}
        >
          <label className="field">
            <span>{t('Senha atual')}</span>
            <input type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} required />
          </label>
          <label className="field">
            <span>{t('Senha nova (mínimo 8 caracteres)')}</span>
            <input type="password" autoComplete="new-password" minLength={8} value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
          </label>
          <button className="btn btn-primary full">{t('Salvar senha nova')}</button>
        </form>
      </Modal>

      <Modal open={deleting} onClose={() => setDeleting(false)} title={t('Excluir conta')}>
        <p>{t('Sua conta, seus galos e seus dados pessoais serão apagados. Compras já feitas não são devolvidas. Não dá para desfazer.')}</p>
        <label className="field">
          <span>{t('Confirme sua senha')}</span>
          <input type="password" value={delPass} onChange={(e) => setDelPass(e.target.value)} />
        </label>
        <div className="row-end gap">
          <button className="btn" onClick={() => setDeleting(false)}>
            {t('Cancelar')}
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              try {
                await api.deleteAccount(delPass)
                window.location.hash = '/'
                window.location.reload()
              } catch (e) {
                toast(tx((e as Error).message), 'erro')
              }
            }}
          >
            {t('Excluir para sempre')}
          </button>
        </div>
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title={t('Apagar tudo?')}>
        <p>{t('Isso apaga seus galos, moedas e conquistas da sua conta. Compras já feitas não são devolvidas. Não dá para desfazer.')}</p>
        <div className="row-end gap">
          <button className="btn" onClick={() => setConfirmReset(false)}>
            {t('Cancelar')}
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await actions.reset()
              window.location.hash = '/galinheiro'
            }}
          >
            {t('Apagar')}
          </button>
        </div>
      </Modal>
    </>
  )
}
