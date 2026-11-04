import { useEffect, useState } from 'react'
import { api, type ApiOrder } from '../api'
import { brl } from '../game/catalog'
import { Modal, PageHead } from '../components/ui'
import { ACHIEVEMENTS, AVATARS } from '../game/data'
import { fmt } from '../game/rooster'
import { titleFor, useGame } from '../game/store'

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
    ['⚔️ Lutas', s.stats.fights],
    ['🏆 Vitórias', s.stats.wins],
    ['💥 K.O.s', s.stats.kos],
    ['🎲 Apostas', s.stats.betsPlaced],
    ['✅ Apostas ganhas', s.stats.betsWon],
    ['💰 Maior prêmio', `🌽 ${fmt(s.stats.biggestWin)}`],
    ['🌽 Milho ganho', fmt(s.stats.milhoEarned)],
    ['🎁 Caixas abertas', s.stats.boxesOpened],
  ]

  return (
    <>
      <PageHead title="👤 Perfil" subtitle={`${isVip ? '👑 ' : ''}${titleFor(s)} · criador desde ${new Date(s.player.createdAt).toLocaleDateString('pt-BR')}`} />
      <div className="two-col">
        <div className="card">
          <h3>Seus dados</h3>
          <label className="field">
            <span>Nome</span>
            <input maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span>Avatar</span>
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
              toast('Perfil salvo!', 'ok')
            }}
          >
            Salvar
          </button>
        </div>
        <div className="card">
          <h3>Estatísticas</h3>
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

      {user && (
        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="card">
            <h3>💳 Conta e limite de gastos</h3>
            <p className="tiny muted">{user.email}</p>
            <div className="bar bar-xp">
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, (user.limits.spentCents / user.limits.monthlyCents) * 100)}%` }} />
              </div>
              <span className="bar-label">
                {brl(user.limits.spentCents)} / {brl(user.limits.monthlyCents)} no mês
              </span>
            </div>
            <label className="field">
              <span>Limite mensal</span>
              <select
                value={user.limits.monthlyCents}
                onChange={async (e) => {
                  const r = await api.setLimit(Number(e.target.value))
                  actions.setUser(r.user)
                  toast(r.user.limits.pendingCents ? 'Aumento de limite vale em 24h.' : 'Limite atualizado.', 'ok')
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
                Novo limite de {brl(user.limits.pendingCents)} vale a partir de {new Date(user.limits.pendingAt!).toLocaleString('pt-BR')}.
              </p>
            )}
            <p className="tiny muted">Reduzir vale na hora. Aumentar leva 24h, para evitar compras por impulso.</p>
            <div className="row gap wrap">
              <button className="btn btn-sm" onClick={() => setPwOpen(true)}>
                🔑 Trocar senha
              </button>
              <button className="btn btn-sm" onClick={() => actions.logout()}>
                🚪 Sair da conta
              </button>
            </div>
          </div>
          <div className="card">
            <h3>🧾 Minhas compras</h3>
            {orders.length === 0 ? (
              <p className="muted">Nenhuma compra ainda.</p>
            ) : (
              <table className="table">
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="tiny muted">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td>{o.name}</td>
                      <td className="tiny">{o.method === 'pix' ? '⚡ Pix' : '💳 Cartão'}</td>
                      <td className="right">{brl(o.amountCents)}</td>
                      <td className={`tiny status-${o.status === 'pago' ? 'ganhou' : o.status === 'pendente' ? 'pendente' : 'perdeu'}`}>{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <h2 className="section-title">
        🏅 Conquistas ({s.achievements.length}/{ACHIEVEMENTS.length})
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

      <h2 className="section-title">🧾 Extrato</h2>
      <div className="card">
        {s.history.length === 0 ? (
          <p className="muted">Nada por aqui ainda.</p>
        ) : (
          <table className="table">
            <tbody>
              {s.history.slice(0, 30).map((h) => (
                <tr key={h.id}>
                  <td className="tiny muted">{new Date(h.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{h.text}</td>
                  <td className={`right ${h.milho >= 0 ? 'pos' : 'neg'}`}>{h.milho ? `${h.milho > 0 ? '+' : ''}🌽 ${fmt(h.milho)}` : ''}</td>
                  <td className={`right ${h.ovo >= 0 ? 'pos' : 'neg'}`}>{h.ovo ? `${h.ovo > 0 ? '+' : ''}🥚 ${h.ovo}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="center danger-zone">
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmReset(true)}>
          🗑️ Apagar progresso
        </button>{' '}
        <button className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}>
          ❌ Excluir minha conta
        </button>
        <p className="tiny muted">
          <a href="#/termos">Termos de uso</a> · <a href="#/privacidade">Privacidade</a>
        </p>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="🔑 Trocar senha">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await api.changePassword(pwCur, pwNew)
              toast('Senha alterada! Outros aparelhos foram desconectados.', 'ok')
              setPwOpen(false)
              setPwCur('')
              setPwNew('')
            } catch (err) {
              toast((err as Error).message, 'erro')
            }
          }}
        >
          <label className="field">
            <span>Senha atual</span>
            <input type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} required />
          </label>
          <label className="field">
            <span>Senha nova (mínimo 8 caracteres)</span>
            <input type="password" autoComplete="new-password" minLength={8} value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
          </label>
          <button className="btn btn-primary full">Salvar senha nova</button>
        </form>
      </Modal>

      <Modal open={deleting} onClose={() => setDeleting(false)} title="Excluir conta">
        <p>Sua conta, seus galos e seus dados pessoais serão apagados. Compras já feitas não são devolvidas. Não dá para desfazer.</p>
        <label className="field">
          <span>Confirme sua senha</span>
          <input type="password" value={delPass} onChange={(e) => setDelPass(e.target.value)} />
        </label>
        <div className="row-end gap">
          <button className="btn" onClick={() => setDeleting(false)}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              try {
                await api.deleteAccount(delPass)
                window.location.hash = '/'
                window.location.reload()
              } catch (e) {
                toast((e as Error).message, 'erro')
              }
            }}
          >
            Excluir para sempre
          </button>
        </div>
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Apagar tudo?">
        <p>Isso apaga seus galos, moedas e conquistas da sua conta. Compras já feitas não são devolvidas. Não dá para desfazer.</p>
        <div className="row-end gap">
          <button className="btn" onClick={() => setConfirmReset(false)}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await actions.reset()
              window.location.hash = '/galinheiro'
            }}
          >
            Apagar
          </button>
        </div>
      </Modal>
    </>
  )
}
