import { useCallback, useEffect, useState } from 'react'
import { api, type AdminLogRow, type AdminOrderRow, type AdminOverview, type AdminUserDetail, type AdminUserRow } from '../api'
import { APP_NAME } from '../brand'
import { Modal } from '../components/ui'
import { CATALOG, brl } from '../game/catalog'
import type { AppConfig } from '../game/config'
import { useGame } from '../game/store'
import { C1, C2, DailyBars, HBars, Kpi, SplitBar } from './Charts'

type Tab = 'geral' | 'jogadores' | 'pedidos' | 'config' | 'auditoria'

const TABS: { id: Tab; label: string }[] = [
  { id: 'geral', label: '📈 Visão geral' },
  { id: 'jogadores', label: '👥 Jogadores' },
  { id: 'pedidos', label: '💳 Pedidos' },
  { id: 'config', label: '⚙️ Configurações' },
  { id: 'auditoria', label: '🧾 Auditoria' },
]

const n = (v: number) => v.toLocaleString('pt-BR')
const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
const dt = (ms: number | null) => (ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const ago = (ms: number | null) => {
  if (!ms) return 'nunca'
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 2) return '🟢 agora'
  if (m < 60) return `${m} min atrás`
  if (m < 1440) return `${Math.round(m / 60)} h atrás`
  return `${Math.round(m / 1440)} dias atrás`
}

export function Admin({ tab: tabParam }: { tab?: string }) {
  const { user } = useGame()
  const tab = (TABS.some((t) => t.id === tabParam) ? tabParam : 'geral') as Tab
  if (!user?.isAdmin)
    return (
      <div className="onboarding">
        <div className="ob-card center">
          <h2>🔒 Acesso restrito</h2>
          <p className="muted">O backoffice é só para administradores.</p>
          <a className="btn btn-primary" href="#/galinheiro">
            Voltar ao jogo
          </a>
        </div>
      </div>
    )
  return (
    <div className="admin">
      <header className="admin-top">
        <b>🛠️ Backoffice · {APP_NAME}</b>
        <nav className="tabs admin-tabs">
          {TABS.map((t) => (
            <a key={t.id} href={`#/admin/${t.id}`} className={`tab ${tab === t.id ? 'active' : ''}`}>
              {t.label}
            </a>
          ))}
        </nav>
        <span className="tiny muted">{user.email}</span>
        <a className="btn btn-sm" href="#/galinheiro">
          ← Jogo
        </a>
      </header>
      <main className="admin-main">
        {tab === 'geral' && <Overview />}
        {tab === 'jogadores' && <Users />}
        {tab === 'pedidos' && <Orders />}
        {tab === 'config' && <Config />}
        {tab === 'auditoria' && <Audit />}
      </main>
    </div>
  )
}

// ---------------- Visão geral ----------------

function Overview() {
  const [days, setDays] = useState(30)
  const [d, setD] = useState<AdminOverview | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setD(null)
    api.admin
      .overview(days)
      .then(setD)
      .catch((e) => setErr(e.message))
  }, [days])

  return (
    <>
      <div className="row-between admin-filters">
        <h1>Visão geral</h1>
        <div className="tabs compact">
          {[7, 30, 90].map((v) => (
            <button key={v} className={`tab ${days === v ? 'active' : ''}`} onClick={() => setDays(v)}>
              {v} dias
            </button>
          ))}
        </div>
      </div>
      {err && <p className="neg">{err}</p>}
      {!d ? (
        <p className="muted">
          <span className="spinner" /> Carregando...
        </p>
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi label={`Receita (${days} dias)`} value={brl(d.kpis.revenueCents)} current={d.kpis.revenueCents} prev={d.kpis.revenuePrevCents} />
            <Kpi label="Receita hoje" value={brl(d.kpis.revenueTodayCents)} />
            <Kpi label="Gasto médio por pagante" value={brl(d.kpis.arppuCents)} hint="Receita do período ÷ jogadores que pagaram no período" />
            <Kpi label="Conversão (já pagou)" value={pct(d.kpis.conversion)} hint="Jogadores que já compraram ÷ total de contas" />
            <Kpi label={`Novas contas (${days} dias)`} value={n(d.kpis.newUsers)} current={d.kpis.newUsers} prev={d.kpis.newUsersPrev} />
            <Kpi label="Ativos por dia (média)" value={n(d.kpis.avgDau)} current={d.kpis.avgDau} prev={d.kpis.avgDauPrev} />
            <Kpi label="Ativos no mês" value={n(d.kpis.mau)} />
            <Kpi label="Online agora" value={n(d.kpis.online)} />
          </div>

          <div className="admin-two">
            <DailyBars title="Receita por dia" data={d.series.map((s) => ({ day: s.day, value: s.revenueCents }))} format={(v) => brl(v)} />
            <DailyBars title="Jogadores ativos por dia" data={d.series.map((s) => ({ day: s.day, value: s.active }))} format={n} />
            <DailyBars title="Novas contas por dia" data={d.series.map((s) => ({ day: s.day, value: s.signups }))} format={n} />
            <DailyBars title="Desafios entre jogadores por dia" data={d.series.map((s) => ({ day: s.day, value: s.pvp }))} format={n} />
          </div>

          <div className="admin-two">
            <div className="card">
              <h3>Receita por produto</h3>
              <HBars rows={d.bySku.map((s) => ({ label: s.name, value: s.cents, extra: <span className="tiny muted">· {s.count} venda(s)</span> }))} format={brl} />
            </div>
            <div className="card">
              <h3>Pix x Cartão</h3>
              <SplitBar
                parts={[
                  { label: 'Pix', value: d.byMethod.pix?.cents ?? 0, color: C1 },
                  { label: 'Cartão', value: d.byMethod.cartao?.cents ?? 0, color: C2 },
                ]}
                format={brl}
              />
              <h3 style={{ marginTop: 18 }}>Funil de jogadores (todo o período)</h3>
              <HBars
                rows={d.funnel.map((f, i) => ({
                  label: f.step,
                  value: f.n,
                  extra: i > 0 && d.funnel[0].n ? <span className="tiny muted">· {pct(f.n / d.funnel[0].n)}</span> : null,
                }))}
                format={n}
              />
            </div>
          </div>

          <div className="kpi-grid small">
            <Kpi label="Contas no total" value={n(d.kpis.totalUsers)} />
            <Kpi label="Pagantes (sempre)" value={n(d.kpis.payingUsersAll)} />
            <Kpi label="Receita total" value={brl(d.kpis.revenueAllCents)} />
            <Kpi label="Pedidos pendentes" value={n(d.kpis.pendingOrders)} />
            <Kpi label={`Vendas (${days} dias)`} value={n(d.kpis.orders)} />
            <Kpi label="Contas bloqueadas" value={n(d.kpis.banned)} />
            <Kpi label={`Gasto com crédito MVP (${days} dias)`} value={brl(d.kpis.creditSpentCents)} hint="Compras pagas com crédito de teste — não entram na receita" />
          </div>
        </>
      )}
    </>
  )
}

// ---------------- Jogadores ----------------

function Users() {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('todos')
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const load = useCallback(() => {
    api.admin.users(q, filter).then((r) => setRows(r.users)).catch(() => null)
  }, [q, filter])
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  return (
    <>
      <div className="row-between admin-filters">
        <h1>Jogadores</h1>
        <div className="row gap">
          <input placeholder="Buscar por e-mail ou nome" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tabs compact">
            {['todos', 'pagantes', 'bloqueados'].map((f) => (
              <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>Jogador</th>
              <th>Cadastro</th>
              <th>Último acesso</th>
              <th className="right">Galos</th>
              <th className="right">Nível máx.</th>
              <th className="right">Ovos</th>
              <th className="right">Gastou</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable-row" onClick={() => setOpen(r.id)}>
                <td>
                  <b>{r.name}</b>
                  <div className="tiny muted">{r.email}</div>
                </td>
                <td className="tiny">{dt(r.created_at)}</td>
                <td className="tiny">{ago(r.last_seen)}</td>
                <td className="right">{r.roosters}</td>
                <td className="right">{r.maxLevel || '—'}</td>
                <td className="right">{n(r.ovos)}</td>
                <td className="right">{r.spent ? brl(r.spent) : '—'}</td>
                <td>{r.banned_at ? <span className="status-perdeu tiny">⛔ Bloqueado</span> : r.spent ? <span className="status-ganhou tiny">💎 Pagante</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted center">Nenhum jogador encontrado.</p>}
      </div>
      <UserDetail id={open} onClose={() => setOpen(null)} onChange={load} />
    </>
  )
}

function UserDetail({ id, onClose, onChange }: { id: string | null; onClose: () => void; onChange: () => void }) {
  const { toast } = useGame()
  const [d, setD] = useState<AdminUserDetail | null>(null)
  const [ovos, setOvos] = useState(0)
  const [milho, setMilho] = useState(0)
  const [credit, setCredit] = useState(0)
  const [reason, setReason] = useState('')
  const [banReason, setBanReason] = useState('')
  const load = useCallback(() => {
    if (id) api.admin.user(id).then(setD).catch((e) => toast(e.message, 'erro'))
  }, [id, toast])
  useEffect(() => {
    setD(null)
    setOvos(0)
    setMilho(0)
    setReason('')
    setBanReason('')
    load()
  }, [load])

  return (
    <Modal open={!!id} onClose={onClose} title={d ? `👤 ${d.user.name}` : 'Carregando...'} wide>
      {d && (
        <div className="user-detail">
          <div className="kpi-grid small">
            <Kpi label="E-mail" value={d.user.email} />
            <Kpi label="Cadastro" value={dt(d.user.createdAt)} />
            <Kpi label="Último acesso" value={ago(d.user.lastSeen)} />
            <Kpi label="Dias jogados" value={n(d.activeDays)} />
            <Kpi label="Desafios disputados" value={n(d.pvpFights)} />
            <Kpi label="Limite mensal" value={brl(d.user.monthlyLimitCents)} />
            <Kpi label="🎁 Crédito MVP" value={brl(d.user.mvpCreditCents)} />
          </div>
          {d.user.bannedAt && (
            <div className="warn">
              ⛔ Bloqueado em {dt(d.user.bannedAt)} — {d.user.banReason}
            </div>
          )}

          {d.game ? (
            <>
              <div className="kpi-grid small">
                <Kpi label="🌽 Milho" value={n(d.game.milho)} />
                <Kpi label="🥚 Ovos" value={n(d.game.ovos)} />
                <Kpi label="👑 VIP até" value={d.game.vipUntil > Date.now() ? dt(d.game.vipUntil) : 'Não'} />
                <Kpi label="🏆 Pontos de liga" value={n(d.game.leaguePoints)} />
                <Kpi label="⚔️ Lutas / vitórias" value={`${d.game.stats.fights ?? 0} / ${d.game.stats.wins ?? 0}`} />
                <Kpi label="🎨 Skins" value={String(d.game.skins.length)} />
              </div>
              <h3>Galos</h3>
              <table className="table">
                <tbody>
                  {d.game.roosters.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.name}</b> <span className="tiny muted">{r.breed}</span>
                      </td>
                      <td>Nv {r.level}</td>
                      <td>{'★'.repeat(r.stars)}</td>
                      <td>
                        {r.wins}V {r.losses}D
                      </td>
                      <td className="tiny muted">{r.skin ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">Ainda não escolheu o primeiro galo.</p>
          )}

          <h3>Compras</h3>
          {d.orders.length === 0 ? (
            <p className="muted tiny">Nenhuma compra.</p>
          ) : (
            <table className="table">
              <tbody>
                {d.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="tiny">{dt(o.created_at)}</td>
                    <td>{CATALOG.find((c) => c.id === o.sku)?.name ?? o.sku}</td>
                    <td className="tiny">{o.method === 'pix' ? '⚡ Pix' : '💳 Cartão'}</td>
                    <td className="right">{brl(o.amount_cents)}</td>
                    <td className="tiny">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {d.game && (
            <div className="card admin-action">
              <h3>🎁 Ajustar saldo</h3>
              <p className="tiny muted">Use para compensar problemas (ex.: pagamento aprovado sem entrega). Valores negativos tiram. Fica registrado na auditoria.</p>
              <div className="row gap wrap">
                <label className="field">
                  <span>🥚 Ovos</span>
                  <input type="number" value={ovos} onChange={(e) => setOvos(Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>🌽 Milho</span>
                  <input type="number" value={milho} onChange={(e) => setMilho(Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>🎁 Crédito MVP (R$)</span>
                  <input type="number" step="1" value={credit} onChange={(e) => setCredit(Number(e.target.value))} />
                </label>
                <label className="field grow">
                  <span>Motivo (obrigatório)</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: compensação pedido #1234" />
                </label>
              </div>
              <button
                className="btn btn-primary"
                disabled={!reason.trim() || (!ovos && !milho && !credit)}
                onClick={async () => {
                  try {
                    await api.admin.grant(d.user.id, ovos, milho, reason, Math.round(credit * 100))
                    toast('Saldo ajustado.', 'ok')
                    setOvos(0)
                    setMilho(0)
                    setCredit(0)
                    setReason('')
                    load()
                    onChange()
                  } catch (e) {
                    toast((e as Error).message, 'erro')
                  }
                }}
              >
                Aplicar ajuste
              </button>
            </div>
          )}

          <div className="card admin-action">
            <h3>{d.user.bannedAt ? '✅ Desbloquear conta' : '⛔ Bloquear conta'}</h3>
            {!d.user.bannedAt && (
              <label className="field">
                <span>Motivo (aparece para o jogador)</span>
                <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Ex.: uso de trapaça" />
              </label>
            )}
            <button
              className={`btn ${d.user.bannedAt ? '' : 'btn-danger'}`}
              disabled={!d.user.bannedAt && !banReason.trim()}
              onClick={async () => {
                try {
                  await api.admin.ban(d.user.id, !d.user.bannedAt, banReason)
                  toast(d.user.bannedAt ? 'Conta desbloqueada.' : 'Conta bloqueada e desconectada.', 'ok')
                  load()
                  onChange()
                } catch (e) {
                  toast((e as Error).message, 'erro')
                }
              }}
            >
              {d.user.bannedAt ? 'Desbloquear' : 'Bloquear'}
            </button>
          </div>

          {d.log.length > 0 && (
            <>
              <h3>Ações do suporte neste jogador</h3>
              <table className="table">
                <tbody>
                  {d.log.map((l, i) => (
                    <tr key={i}>
                      <td className="tiny">{dt(l.at)}</td>
                      <td className="tiny">{l.admin_email}</td>
                      <td>{l.action}</td>
                      <td className="tiny muted">{l.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

// ---------------- Pedidos ----------------

function Orders() {
  const { toast } = useGame()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminOrderRow[]>([])
  const load = useCallback(() => {
    api.admin.orders(status, q).then((r) => setRows(r.orders)).catch(() => null)
  }, [status, q])
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])
  const total = rows.filter((r) => r.status === 'pago').reduce((a, r) => a + r.amount_cents, 0)

  return (
    <>
      <div className="row-between admin-filters">
        <h1>Pedidos</h1>
        <div className="row gap">
          <input placeholder="Buscar por e-mail ou nº do pedido" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tabs compact">
            {[
              ['', 'Todos'],
              ['pago', 'Pagos'],
              ['pendente', 'Pendentes'],
              ['expirado', 'Expirados'],
              ['recusado', 'Recusados'],
            ].map(([v, l]) => (
              <button key={v} className={`tab ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="tiny muted">
        {rows.length} pedido(s) na lista · pagos somam {brl(total)}
      </p>
      <div className="card">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Jogador</th>
              <th>Produto</th>
              <th>Meio</th>
              <th className="right">Valor</th>
              <th>Status</th>
              <th>Pedido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="tiny">{dt(o.created_at)}</td>
                <td className="tiny">{o.email}</td>
                <td>{o.name}</td>
                <td className="tiny">
                  {o.method === 'pix' ? '⚡ Pix' : '💳 Cartão'} <span className="muted">({o.provider})</span>
                </td>
                <td className="right">{brl(o.amount_cents)}</td>
                <td>
                  <span className={`tiny status-${o.status === 'pago' ? 'ganhou' : o.status === 'pendente' ? 'pendente' : 'perdeu'}`}>{o.status}</span>
                </td>
                <td className="tiny muted mono">{o.id.slice(0, 8)}</td>
                <td>
                  {o.status === 'pendente' && (
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        const r = await api.admin.recheck(o.id)
                        toast(`Status atual: ${r.status}`, 'info')
                        load()
                      }}
                    >
                      Reconsultar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted center">Nenhum pedido.</p>}
      </div>
    </>
  )
}

// ---------------- Configurações ----------------

function Config() {
  const { toast } = useGame()
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [defaults, setDefaults] = useState<AppConfig | null>(null)
  const [meta, setMeta] = useState<{ at: number | null; by: string | null }>({ at: null, by: null })
  const [saved, setSaved] = useState('')
  const load = () =>
    api.admin.getConfig().then((r) => {
      setCfg(r.config)
      setDefaults(r.defaults)
      setSaved(JSON.stringify(r.config))
      setMeta({ at: r.updatedAt, by: r.updatedBy })
    })
  useEffect(() => {
    void load()
  }, [])
  if (!cfg || !defaults) return <p className="muted">Carregando...</p>
  const dirty = JSON.stringify(cfg) !== saved
  const set = <K extends keyof AppConfig>(k: K, v: Partial<AppConfig[K]>) => setCfg({ ...cfg, [k]: { ...cfg[k], ...v } })
  const setSku = (id: string, v: Partial<AppConfig['catalog'][string]>) => setCfg({ ...cfg, catalog: { ...cfg.catalog, [id]: { ...cfg.catalog[id], ...v } } })

  const save = async () => {
    try {
      const r = await api.admin.putConfig(cfg)
      toast(r.changes.length ? `Salvo: ${r.changes.length} alteração(ões). Já vale para todos.` : 'Nada mudou.', 'ok')
      await load()
    } catch (e) {
      toast((e as Error).message, 'erro')
    }
  }

  return (
    <>
      <div className="row-between admin-filters">
        <div>
          <h1>Configurações</h1>
          <p className="tiny muted">
            Alterações valem na hora para todos os jogadores, sem publicar de novo.
            {meta.at && ` Última alteração: ${dt(meta.at)} por ${meta.by}.`}
          </p>
        </div>
        <div className="row gap">
          <button className="btn btn-sm" disabled={!dirty} onClick={() => setCfg(JSON.parse(saved))}>
            Descartar
          </button>
          <button className="btn btn-primary" disabled={!dirty} onClick={save}>
            💾 Salvar alterações
          </button>
        </div>
      </div>

      <div className="card cfg-section">
        <h3>📢 Aviso para todos os jogadores</h3>
        <div className="row gap wrap">
          <label className="field grow">
            <span>Texto (vazio = sem aviso)</span>
            <input value={cfg.announcement.text} maxLength={200} onChange={(e) => set('announcement', { text: e.target.value })} placeholder="Ex.: Fim de semana com 50% de bônus nos ovos!" />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select value={cfg.announcement.kind} onChange={(e) => set('announcement', { kind: e.target.value as AppConfig['announcement']['kind'] })}>
              <option value="info">ℹ️ Informação</option>
              <option value="promo">🎉 Promoção</option>
              <option value="alerta">⚠️ Alerta</option>
            </select>
          </label>
        </div>
        {cfg.announcement.text && <div className={`announce announce-${cfg.announcement.kind}`}>{cfg.announcement.text}</div>}
      </div>

      <div className="card cfg-section">
        <h3>🎁 Modo MVP (crédito de teste)</h3>
        <label className="check">
          <input type="checkbox" checked={cfg.mvp.on} onChange={(e) => set('mvp', { on: e.target.checked })} /> Ligado — cada conta recebe o crédito uma única vez (no cadastro ou no próximo acesso) e pode gastar na loja sem pagar
        </label>
        <NumField label="Crédito por conta (R$)" step={10} value={cfg.mvp.creditCents / 100} onChange={(v) => set('mvp', { creditCents: Math.round(v * 100) })} />
        <p className="tiny muted">Compras com crédito não contam como receita. Mudar o valor vale só para quem ainda não recebeu.</p>
      </div>

      <div className={`card cfg-section ${cfg.maintenance.on ? 'danger-box' : ''}`}>
        <h3>🚧 Modo manutenção</h3>
        <label className="check">
          <input type="checkbox" checked={cfg.maintenance.on} onChange={(e) => set('maintenance', { on: e.target.checked })} /> Ligado — jogadores veem a mensagem abaixo e não conseguem jogar nem comprar (administradores continuam entrando)
        </label>
        <label className="field">
          <span>Mensagem</span>
          <input value={cfg.maintenance.message} maxLength={200} onChange={(e) => set('maintenance', { message: e.target.value })} />
        </label>
      </div>

      <div className="card cfg-section">
        <h3>💎 Produtos e preços</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Preço (R$)</th>
              <th>Ovos</th>
              <th>Bônus</th>
              <th>À venda</th>
            </tr>
          </thead>
          <tbody>
            {CATALOG.map((s) => {
              const o = cfg.catalog[s.id]
              const changed = JSON.stringify(o) !== JSON.stringify(defaults.catalog[s.id])
              return (
                <tr key={s.id} className={o.active ? '' : 'muted'}>
                  <td>
                    {s.emoji} {s.name} {changed && <span className="tiny pos">· alterado</span>}
                  </td>
                  <td>
                    <input className="cfg-num" type="number" step="0.01" value={(o.priceCents / 100).toFixed(2)} onChange={(e) => setSku(s.id, { priceCents: Math.round(Number(e.target.value) * 100) })} />
                  </td>
                  <td>{o.ovos !== undefined ? <input className="cfg-num" type="number" value={o.ovos} onChange={(e) => setSku(s.id, { ovos: Number(e.target.value) })} /> : '—'}</td>
                  <td>{o.bonus !== undefined ? <input className="cfg-num" type="number" value={o.bonus} onChange={(e) => setSku(s.id, { bonus: Number(e.target.value) })} /> : '—'}</td>
                  <td>
                    <input type="checkbox" checked={o.active} onChange={(e) => setSku(s.id, { active: e.target.checked })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="admin-two">
        <div className="card cfg-section">
          <h3>🎁 Ovos grátis</h3>
          <div className="cfg-grid">
            <NumField label="Bônus diário (dias 1 a 6)" value={cfg.rewards.dailyOvos} onChange={(v) => set('rewards', { dailyOvos: v })} />
            <NumField label="Bônus do 7º dia" value={cfg.rewards.day7Ovos} onChange={(v) => set('rewards', { day7Ovos: v })} />
            <NumField label="Vitória difícil na Arena" value={cfg.rewards.arenaHardWinOvos} onChange={(v) => set('rewards', { arenaHardWinOvos: v })} />
            <NumField label="Multiplicador das missões" step={0.1} value={cfg.rewards.missionOvosMultiplier} onChange={(v) => set('rewards', { missionOvosMultiplier: v })} hint="1 = normal, 2 = dobro (vale para as missões do dia seguinte)" />
          </div>
        </div>
        <div className="card cfg-section">
          <h3>🤝 Desafios entre jogadores</h3>
          <div className="cfg-grid">
            <NumField label="Diferença máxima de nível" value={cfg.pvp.maxLevelDiff} onChange={(v) => set('pvp', { maxLevelDiff: v })} />
            <NumField label="Desafios com prêmio por dia" value={cfg.pvp.dailyRewards} onChange={(v) => set('pvp', { dailyRewards: v })} />
            <NumField label="Tempo para aceitar (segundos)" value={cfg.pvp.challengeTtlSec} onChange={(v) => set('pvp', { challengeTtlSec: v })} />
          </div>
          <h3>🛡️ Economia e segurança</h3>
          <div className="cfg-grid">
            <NumField label="Ovos grátis máximos por dia" value={cfg.economy.freeOvosPerDay} onChange={(v) => set('economy', { freeOvosPerDay: v })} hint="Acima disso o servidor recusa o progresso (anti-trapaça)" />
            <NumField label="Milho ganho por dia (limite)" step={100000} value={cfg.economy.freeMilhoPerDay} onChange={(v) => set('economy', { freeMilhoPerDay: v })} hint="Acima disso o servidor recusa o progresso" />
            <NumField label="Limite de gasto padrão (R$)" step={10} value={cfg.economy.defaultSpendLimitCents / 100} onChange={(v) => set('economy', { defaultSpendLimitCents: Math.round(v * 100) })} hint="Vale para contas novas" />
          </div>
        </div>
      </div>
      <div className="center">
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setCfg(defaults)
            toast('Valores padrão carregados. Clique em Salvar para aplicar.', 'info')
          }}
        >
          ↺ Restaurar todos os padrões
        </button>
      </div>
    </>
  )
}

function NumField({ label, value, onChange, step = 1, hint }: { label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small className="tiny muted">{hint}</small>}
    </label>
  )
}

// ---------------- Auditoria ----------------

function Audit() {
  const [rows, setRows] = useState<AdminLogRow[]>([])
  const [view, setView] = useState<string | null>(null)
  useEffect(() => {
    api.admin.audit().then((r) => setRows(r.log)).catch(() => null)
  }, [])
  const label: Record<string, string> = { configuracao: '⚙️ Configuração', ajuste_saldo: '🎁 Ajuste de saldo', bloqueio: '⛔ Bloqueio', desbloqueio: '✅ Desbloqueio', reconsultar_pedido: '💳 Reconsulta de pedido' }
  return (
    <>
      <h1>Auditoria</h1>
      <p className="tiny muted">Tudo que administradores fizeram no backoffice.</p>
      <div className="card">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>Ação</th>
              <th>Jogador</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="tiny">{dt(r.at)}</td>
                <td className="tiny">{r.admin_email}</td>
                <td>{label[r.action] ?? r.action}</td>
                <td className="tiny">{r.target_email ?? '—'}</td>
                <td>
                  {r.detail && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setView(r.detail)}>
                      Ver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted center">Nenhuma ação registrada ainda.</p>}
      </div>
      <Modal open={!!view} onClose={() => setView(null)} title="Detalhes">
        <pre className="audit-pre">{view && JSON.stringify(JSON.parse(view), null, 2)}</pre>
      </Modal>
    </>
  )
}
