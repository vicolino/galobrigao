import { useCallback, useEffect, useState } from 'react'
import { api, type AdminLogRow, type AdminOrderRow, type AdminOverview, type AdminUserDetail, type AdminUserRow } from '../api'
import { APP_NAME } from '../brand'
import { Modal } from '../components/ui'
import { CATALOG, brl } from '../game/catalog'
import type { AppConfig } from '../game/config'
import { useGame } from '../game/store'
import { SKIN_BY_ID } from '../game/data'
import { locale, t, tp, tx } from '../i18n'
import { C1, C2, DailyBars, HBars, Kpi, SplitBar } from './Charts'

type Tab = 'geral' | 'jogadores' | 'pedidos' | 'config' | 'auditoria'

const TABS: { id: Tab; label: string }[] = [
  { id: 'geral', label: t('📈 Visão geral') },
  { id: 'jogadores', label: t('👥 Jogadores') },
  { id: 'pedidos', label: t('💳 Pedidos') },
  { id: 'config', label: t('⚙️ Configurações') },
  { id: 'auditoria', label: t('🧾 Auditoria') },
]

const n = (v: number) => v.toLocaleString(locale())
const pct = (v: number) => `${(v * 100).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const dt = (ms: number | null) => (ms ? new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '—')
const ago = (ms: number | null) => {
  if (!ms) return t('nunca')
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 2) return t('🟢 agora')
  if (m < 60) return t('{n} min atrás', { n: m })
  if (m < 1440) return t('{n} h atrás', { n: Math.round(m / 60) })
  return tp('{n} dia atrás', '{n} dias atrás', Math.round(m / 1440))
}

export function Admin({ tab: tabParam }: { tab?: string }) {
  const { user } = useGame()
  const tab = (TABS.some((x) => x.id === tabParam) ? tabParam : 'geral') as Tab
  if (!user?.isAdmin)
    return (
      <div className="onboarding">
        <div className="ob-card center">
          <h2>{t('🔒 Acesso restrito')}</h2>
          <p className="muted">{t('O backoffice é só para administradores.')}</p>
          <a className="btn btn-primary" href="#/galinheiro">
            {t('Voltar ao jogo')}
          </a>
        </div>
      </div>
    )
  return (
    <div className="admin">
      <header className="admin-top">
        <b>{t('🛠️ Backoffice')} · {APP_NAME}</b>
        <nav className="tabs admin-tabs">
          {TABS.map((x) => (
            <a key={x.id} href={`#/admin/${x.id}`} className={`tab ${tab === x.id ? 'active' : ''}`}>
              {x.label}
            </a>
          ))}
        </nav>
        <span className="tiny muted">{user.email}</span>
        <a className="btn btn-sm" href="#/galinheiro">
          {t('← Jogo')}
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
      .catch((e) => setErr(tx(e.message)))
  }, [days])

  return (
    <>
      <div className="row-between admin-filters">
        <h1>{t('Visão geral')}</h1>
        <div className="tabs compact">
          {[7, 30, 90].map((v) => (
            <button key={v} className={`tab ${days === v ? 'active' : ''}`} onClick={() => setDays(v)}>
              {t('{n} dias', { n: v })}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="neg">{err}</p>}
      {!d ? (
        <p className="muted">
          <span className="spinner" /> {t('Carregando...')}
        </p>
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi label={t('Receita ({n} dias)', { n: days })} value={brl(d.kpis.revenueCents)} current={d.kpis.revenueCents} prev={d.kpis.revenuePrevCents} />
            <Kpi label={t('Receita hoje')} value={brl(d.kpis.revenueTodayCents)} />
            <Kpi label={t('Gasto médio por pagante')} value={brl(d.kpis.arppuCents)} hint={t('Receita do período ÷ jogadores que pagaram no período')} />
            <Kpi label={t('Conversão (já pagou)')} value={pct(d.kpis.conversion)} hint={t('Jogadores que já compraram ÷ total de contas')} />
            <Kpi label={t('Novas contas ({n} dias)', { n: days })} value={n(d.kpis.newUsers)} current={d.kpis.newUsers} prev={d.kpis.newUsersPrev} />
            <Kpi label={t('Ativos por dia (média)')} value={n(d.kpis.avgDau)} current={d.kpis.avgDau} prev={d.kpis.avgDauPrev} />
            <Kpi label={t('Ativos no mês')} value={n(d.kpis.mau)} />
            <Kpi label={t('Online agora')} value={n(d.kpis.online)} />
          </div>

          <div className="admin-two">
            <DailyBars title={t('Receita por dia')} data={d.series.map((s) => ({ day: s.day, value: s.revenueCents }))} format={(v) => brl(v)} />
            <DailyBars title={t('Jogadores ativos por dia')} data={d.series.map((s) => ({ day: s.day, value: s.active }))} format={n} />
            <DailyBars title={t('Novas contas por dia')} data={d.series.map((s) => ({ day: s.day, value: s.signups }))} format={n} />
            <DailyBars title={t('Desafios entre jogadores por dia')} data={d.series.map((s) => ({ day: s.day, value: s.pvp }))} format={n} />
          </div>

          <div className="admin-two">
            <div className="card">
              <h3>{t('Receita por produto')}</h3>
              <HBars rows={d.bySku.map((s) => ({ label: tx(s.name), value: s.cents, extra: <span className="tiny muted">· {tp('{n} venda', '{n} vendas', s.count)}</span> }))} format={brl} />
            </div>
            <div className="card">
              <h3>{t('Pix x Cartão')}</h3>
              <SplitBar
                parts={[
                  { label: 'Pix', value: d.byMethod.pix?.cents ?? 0, color: C1 },
                  { label: t('Cartão'), value: d.byMethod.cartao?.cents ?? 0, color: C2 },
                ]}
                format={brl}
              />
              <h3 style={{ marginTop: 18 }}>{t('Funil de jogadores (todo o período)')}</h3>
              <HBars
                rows={d.funnel.map((f, i) => ({
                  label: tx(f.step),
                  value: f.n,
                  extra: i > 0 && d.funnel[0].n ? <span className="tiny muted">· {pct(f.n / d.funnel[0].n)}</span> : null,
                }))}
                format={n}
              />
            </div>
          </div>

          <div className="kpi-grid small">
            <Kpi label={t('Contas no total')} value={n(d.kpis.totalUsers)} />
            <Kpi label={t('Pagantes (sempre)')} value={n(d.kpis.payingUsersAll)} />
            <Kpi label={t('Receita total')} value={brl(d.kpis.revenueAllCents)} />
            <Kpi label={t('Pedidos pendentes')} value={n(d.kpis.pendingOrders)} />
            <Kpi label={t('Vendas ({n} dias)', { n: days })} value={n(d.kpis.orders)} />
            <Kpi label={t('Contas bloqueadas')} value={n(d.kpis.banned)} />
            <Kpi label={t('Gasto com crédito MVP ({n} dias)', { n: days })} value={brl(d.kpis.creditSpentCents)} hint={t('Compras pagas com crédito de teste — não entram na receita')} />
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
    const h = setTimeout(load, 250)
    return () => clearTimeout(h)
  }, [load])

  return (
    <>
      <div className="row-between admin-filters">
        <h1>{t('Jogadores')}</h1>
        <div className="row gap">
          <input placeholder={t('Buscar por e-mail ou nome')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tabs compact">
            {['todos', 'pagantes', 'bloqueados'].map((f) => (
              <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {USER_FILTER_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>{t('Jogador')}</th>
              <th className="hide-m">{t('Cadastro')}</th>
              <th>{t('Último acesso')}</th>
              <th className="right hide-m">{t('Galos')}</th>
              <th className="right hide-m">{t('Nível máx.')}</th>
              <th className="right">{t('Ovos')}</th>
              <th className="right">{t('Gastou')}</th>
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
                <td className="tiny hide-m">{dt(r.created_at)}</td>
                <td className="tiny">{ago(r.last_seen)}</td>
                <td className="right hide-m">{r.roosters}</td>
                <td className="right hide-m">{r.maxLevel || '—'}</td>
                <td className="right">{n(r.ovos)}</td>
                <td className="right">{r.spent ? brl(r.spent) : '—'}</td>
                <td>{r.banned_at ? <span className="status-perdeu tiny">{t('⛔ Bloqueado')}</span> : r.spent ? <span className="status-ganhou tiny">{t('💎 Pagante')}</span> : null}</td>{/* i18n-ok */}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted center">{t('Nenhum jogador encontrado.')}</p>}
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
    if (id) api.admin.user(id).then(setD).catch((e) => toast(tx(e.message), 'erro'))
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
    <Modal open={!!id} onClose={onClose} title={d ? t('👤 Jogador') : t('Carregando...')} wide>
      {d && (
        <div className="user-detail">
          <div className="ud-head">
            <div className="ud-avatar">{d.user.name.slice(0, 1).toUpperCase()}</div>
            <div className="grow">
              <h2>{d.user.name}</h2>
              <div className="ud-email">{d.user.email}</div>
              <div className="tiny muted">
                {t('Cadastro em {data} · último acesso {quando}', { data: dt(d.user.createdAt), quando: ago(d.user.lastSeen) })}
              </div>
            </div>
            {d.user.bannedAt ? <span className="ud-badge bad">{t('⛔ Bloqueado')}</span> : d.orders.some((o) => o.status === 'pago' && o.method !== 'credito') ? <span className="ud-badge good">{t('💎 Pagante')}</span> : null}
          </div>

          <h3>{t('Conta')}</h3>
          <div className="ud-stats cols-4">
            <Stat label={t('📅 Dias jogados')} value={n(d.activeDays)} />
            <Stat label={t('🤝 Desafios')} value={n(d.pvpFights)} />
            <Stat label={t('💳 Limite mensal')} value={brl(d.user.monthlyLimitCents)} />
            <Stat label={t('🎁 Crédito MVP')} value={brl(d.user.mvpCreditCents)} />
          </div>
          {d.user.bannedAt && (
            <div className="warn">
              {t('⛔ Bloqueado em {data} — {motivo}', { data: dt(d.user.bannedAt), motivo: d.user.banReason ?? '' })}
            </div>
          )}

          {d.game ? (
            <>
              <h3>{t('Jogo')}</h3>
              <div className="ud-stats cols-3">
                <Stat label={t('🌽 Milho')} value={n(d.game.milho)} />
                <Stat label={t('🥚 Ovos')} value={n(d.game.ovos)} />
                <Stat label={t('👑 VIP até')} value={d.game.vipUntil > Date.now() ? dt(d.game.vipUntil) : t('Não')} />
                <Stat label={t('🏆 Pontos de liga')} value={n(d.game.leaguePoints)} />
                <Stat label={t('⚔️ Lutas / vitórias')} value={`${d.game.stats.fights ?? 0} / ${d.game.stats.wins ?? 0}`} />
                <Stat label={t('🎨 Skins')} value={String(d.game.skins.length)} />
              </div>
              <h3>{t('Galos')}</h3>
              <table className="table ud-table">
                <tbody>
                  {d.game.roosters.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.name}</b> <span className="tiny muted">{tx(r.breed)}</span>
                      </td>
                      <td>{t('Nv {n}', { n: r.level })}</td>
                      <td>{'★'.repeat(r.stars)}</td>
                      <td>
                        {t('{v}V {d}D', { v: r.wins, d: r.losses })}
                      </td>
                      <td className="tiny muted">{r.skin ? (SKIN_BY_ID[r.skin]?.name ?? r.skin) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">{t('Ainda não escolheu o primeiro galo.')}</p>
          )}

          <h3>{t('Compras')}</h3>
          {d.orders.length === 0 ? (
            <p className="muted tiny">{t('Nenhuma compra.')}</p>
          ) : (
            <table className="table ud-table">
              <tbody>
                {d.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="tiny">{dt(o.created_at)}</td>
                    <td>{CATALOG.find((c) => c.id === o.sku)?.name ?? o.sku}</td>
                    <td className="tiny">{methodLabel(o.method)}</td>
                    <td className="right">{brl(o.amount_cents)}</td>
                    <td>
                      <span className={`tiny status-${o.status === 'pago' ? 'ganhou' : o.status === 'pendente' ? 'pendente' : 'perdeu'}`}>{statusLabel(o.status)}</span>{/* i18n-ok */}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {d.game && (
            <div className="card admin-action">
              <h3>{t('🎁 Ajustar saldo')}</h3>
              <p className="tiny muted">{t('Use para compensar problemas (ex.: pagamento aprovado sem entrega). Valores negativos tiram. Fica registrado na auditoria.')}</p>
              <div className="grant-grid">
                <label className="field">
                  <span>{t('🥚 Ovos')}</span>
                  <input type="number" value={ovos} onChange={(e) => setOvos(Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>{t('🌽 Milho')}</span>
                  <input type="number" value={milho} onChange={(e) => setMilho(Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>{t('🎁 Crédito MVP (R$)')}</span>
                  <input type="number" step="1" value={credit} onChange={(e) => setCredit(Number(e.target.value))} />
                </label>
                <label className="field grant-reason">
                  <span>{t('Motivo (obrigatório)')}</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Ex.: compensação pedido #1234')} />
                </label>
              </div>
              <button
                className="btn btn-primary"
                disabled={!reason.trim() || (!ovos && !milho && !credit)}
                onClick={async () => {
                  try {
                    await api.admin.grant(d.user.id, ovos, milho, reason, Math.round(credit * 100))
                    toast(t('Saldo ajustado.'), 'ok')
                    setOvos(0)
                    setMilho(0)
                    setCredit(0)
                    setReason('')
                    load()
                    onChange()
                  } catch (e) {
                    toast(tx((e as Error).message), 'erro')
                  }
                }}
              >
                {t('Aplicar ajuste')}
              </button>
            </div>
          )}

          <div className="card admin-action">
            <h3>{d.user.bannedAt ? t('✅ Desbloquear conta') : t('⛔ Bloquear conta')}</h3>
            {!d.user.bannedAt && (
              <label className="field">
                <span>{t('Motivo (aparece para o jogador)')}</span>
                <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder={t('Ex.: uso de trapaça')} />
              </label>
            )}
            <button
              className={`btn ${d.user.bannedAt ? '' : 'btn-danger'}`}
              disabled={!d.user.bannedAt && !banReason.trim()}
              onClick={async () => {
                try {
                  await api.admin.ban(d.user.id, !d.user.bannedAt, banReason)
                  toast(d.user.bannedAt ? t('Conta desbloqueada.') : t('Conta bloqueada e desconectada.'), 'ok')
                  load()
                  onChange()
                } catch (e) {
                  toast(tx((e as Error).message), 'erro')
                }
              }}
            >
              {d.user.bannedAt ? t('Desbloquear') : t('Bloquear')}
            </button>
          </div>

          {d.log.length > 0 && (
            <>
              <h3>{t('Ações do suporte neste jogador')}</h3>
              <table className="table">
                <tbody>
                  {d.log.map((l, i) => (
                    <tr key={i}>
                      <td className="tiny">{dt(l.at)}</td>
                      <td className="tiny">{l.admin_email}</td>
                      <td>{AUDIT_LABEL[l.action] ?? l.action}</td>
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

const methodLabel = (m: string) => (m === 'pix' ? '⚡ Pix' : m === 'credito' ? t('🎁 Crédito MVP') : t('💳 Cartão'))

const USER_FILTER_LABEL: Record<string, string> = { todos: t('Todos'), pagantes: t('Pagantes'), bloqueados: t('Bloqueados') }

const STATUS_LABEL: Record<string, string> = { pago: t('pago'), pendente: t('pendente'), expirado: t('expirado'), recusado: t('recusado'), cancelado: t('cancelado'), reembolsado: t('reembolsado') }
const statusLabel = (s: string) => STATUS_LABEL[s] ?? tx(s)

const AUDIT_LABEL: Record<string, string> = {
  configuracao: t('⚙️ Configuração'),
  ajuste_saldo: t('🎁 Ajuste de saldo'),
  bloqueio: t('⛔ Bloqueio'),
  desbloqueio: t('✅ Desbloqueio'),
  reconsultar_pedido: t('💳 Reconsulta de pedido'),
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ud-stat" title={`${label}: ${value}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
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
    const h = setTimeout(load, 250)
    return () => clearTimeout(h)
  }, [load])
  const total = rows.filter((r) => r.status === 'pago').reduce((a, r) => a + r.amount_cents, 0)

  return (
    <>
      <div className="row-between admin-filters">
        <h1>{t('Pedidos')}</h1>
        <div className="row gap">
          <input placeholder={t('Buscar por e-mail ou nº do pedido')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tabs compact">
            {[
              ['', t('Todos')],
              ['pago', t('Pagos')],
              ['pendente', t('Pendentes')],
              ['expirado', t('Expirados')],
              ['recusado', t('Recusados')],
            ].map(([v, l]) => (
              <button key={v} className={`tab ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="tiny muted">
        {tp('{n} pedido na lista · pagos somam {total}', '{n} pedidos na lista · pagos somam {total}', rows.length, { total: brl(total) })}
      </p>
      <div className="card">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>{t('Data')}</th>
              <th>{t('Jogador')}</th>
              <th>{t('Produto')}</th>
              <th className="hide-m">{t('Meio')}</th>
              <th className="right">{t('Valor')}</th>
              <th>{t('Status')}</th>
              <th className="hide-m">{t('Pedido')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="tiny">{dt(o.created_at)}</td>
                <td className="tiny">{tx(o.email)}</td>
                <td>{tx(o.name)}</td>
                <td className="tiny hide-m">
                  {methodLabel(o.method)} <span className="muted">({o.provider})</span>
                </td>
                <td className="right">{brl(o.amount_cents)}</td>
                <td>
                  <span className={`tiny status-${o.status === 'pago' ? 'ganhou' : o.status === 'pendente' ? 'pendente' : 'perdeu'}`}>{statusLabel(o.status)}</span>{/* i18n-ok */}
                </td>
                <td className="tiny muted mono hide-m">{o.id.slice(0, 8)}</td>
                <td>
                  {o.status === 'pendente' && (
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        const r = await api.admin.recheck(o.id)
                        toast(t('Status atual: {status}', { status: statusLabel(r.status) }), 'info')
                        load()
                      }}
                    >
                      {t('Reconsultar')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted center">{t('Nenhum pedido.')}</p>}
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
  if (!cfg || !defaults) return <p className="muted">{t('Carregando...')}</p>
  const dirty = JSON.stringify(cfg) !== saved
  const set = <K extends keyof AppConfig>(k: K, v: Partial<AppConfig[K]>) => setCfg({ ...cfg, [k]: { ...cfg[k], ...v } })
  const setSku = (id: string, v: Partial<AppConfig['catalog'][string]>) => setCfg({ ...cfg, catalog: { ...cfg.catalog, [id]: { ...cfg.catalog[id], ...v } } })

  const save = async () => {
    try {
      const r = await api.admin.putConfig(cfg)
      toast(r.changes.length ? tp('Salvo: {n} alteração. Já vale para todos.', 'Salvo: {n} alterações. Já vale para todos.', r.changes.length) : t('Nada mudou.'), 'ok')
      await load()
    } catch (e) {
      toast(tx((e as Error).message), 'erro')
    }
  }

  return (
    <>
      <div className="row-between admin-filters">
        <div>
          <h1>{t('Configurações')}</h1>
          <p className="tiny muted">
            {t('Alterações valem na hora para todos os jogadores, sem publicar de novo.')}
            {meta.at && ' ' + t('Última alteração: {data} por {quem}.', { data: dt(meta.at), quem: meta.by ?? '—' })}
          </p>
        </div>
        <div className="row gap">
          <button className="btn btn-sm" disabled={!dirty} onClick={() => setCfg(JSON.parse(saved))}>
            {t('Descartar')}
          </button>
          <button className="btn btn-primary" disabled={!dirty} onClick={save}>
            {t('💾 Salvar alterações')}
          </button>
        </div>
      </div>

      <div className="card cfg-section">
        <h3>{t('📢 Aviso para todos os jogadores')}</h3>
        <div className="row gap wrap">
          <label className="field grow">
            <span>{t('Texto (vazio = sem aviso)')}</span>
            <input value={cfg.announcement.text} maxLength={200} onChange={(e) => set('announcement', { text: e.target.value })} placeholder={t('Ex.: Fim de semana com 50% de bônus nos ovos!')} />
          </label>
          <label className="field">
            <span>{t('Tipo')}</span>
            <select value={cfg.announcement.kind} onChange={(e) => set('announcement', { kind: e.target.value as AppConfig['announcement']['kind'] })}>
              <option value="info">{t('ℹ️ Informação')}</option>
              <option value="promo">{t('🎉 Promoção')}</option>
              <option value="alerta">{t('⚠️ Alerta')}</option>
            </select>
          </label>
        </div>
        {cfg.announcement.text && <div className={`announce announce-${cfg.announcement.kind}`}>{cfg.announcement.text}</div>}
      </div>

      <div className="card cfg-section">
        <h3>{t('🎁 Modo MVP (crédito de teste)')}</h3>
        <label className="check">
          <input type="checkbox" checked={cfg.mvp.on} onChange={(e) => set('mvp', { on: e.target.checked })} /> {t('Ligado — cada conta recebe o crédito uma única vez (no cadastro ou no próximo acesso) e pode gastar na loja sem pagar')}
        </label>
        <NumField label={t('Crédito por conta (R$)')} step={10} value={cfg.mvp.creditCents / 100} onChange={(v) => set('mvp', { creditCents: Math.round(v * 100) })} />
        <p className="tiny muted">{t('Compras com crédito não contam como receita. Mudar o valor vale só para quem ainda não recebeu.')}</p>
      </div>

      <div className={`card cfg-section ${cfg.maintenance.on ? 'danger-box' : ''}`}>
        <h3>{t('🚧 Modo manutenção')}</h3>
        <label className="check">
          <input type="checkbox" checked={cfg.maintenance.on} onChange={(e) => set('maintenance', { on: e.target.checked })} /> {t('Ligado — jogadores veem a mensagem abaixo e não conseguem jogar nem comprar (administradores continuam entrando)')}
        </label>
        <label className="field">
          <span>{t('Mensagem')}</span>
          <input value={cfg.maintenance.message} maxLength={200} onChange={(e) => set('maintenance', { message: e.target.value })} />
        </label>
      </div>

      <div className="card cfg-section">
        <h3>{t('💎 Produtos e preços')}</h3>
        <table className="table">
          <thead>
            <tr>
              <th>{t('Produto')}</th>
              <th>{t('Preço (R$)')}</th>
              <th>{t('Ovos')}</th>
              <th>{t('Bônus')}</th>
              <th>{t('À venda')}</th>
            </tr>
          </thead>
          <tbody>
            {CATALOG.map((s) => {
              const o = cfg.catalog[s.id]
              const changed = JSON.stringify(o) !== JSON.stringify(defaults.catalog[s.id])
              return (
                <tr key={s.id} className={o.active ? '' : 'muted'}>
                  <td>
                    {s.emoji} {s.name} {changed && <span className="tiny pos">· {t('alterado')}</span>}
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
          <h3>{t('🎁 Ovos grátis')}</h3>
          <div className="cfg-grid">
            <NumField label={t('Bônus diário (dias 1 a 6)')} value={cfg.rewards.dailyOvos} onChange={(v) => set('rewards', { dailyOvos: v })} />
            <NumField label={t('Bônus do 7º dia')} value={cfg.rewards.day7Ovos} onChange={(v) => set('rewards', { day7Ovos: v })} />
            <NumField label={t('Vitória difícil na Arena')} value={cfg.rewards.arenaHardWinOvos} onChange={(v) => set('rewards', { arenaHardWinOvos: v })} />
            <NumField label={t('Multiplicador das missões')} step={0.1} value={cfg.rewards.missionOvosMultiplier} onChange={(v) => set('rewards', { missionOvosMultiplier: v })} hint={t('1 = normal, 2 = dobro (vale para as missões do dia seguinte)')} />
          </div>
        </div>
        <div className="card cfg-section">
          <h3>{t('🤝 Desafios entre jogadores')}</h3>
          <div className="cfg-grid">
            <NumField label={t('Diferença máxima de nível')} value={cfg.pvp.maxLevelDiff} onChange={(v) => set('pvp', { maxLevelDiff: v })} />
            <NumField label={t('Desafios com prêmio por dia')} value={cfg.pvp.dailyRewards} onChange={(v) => set('pvp', { dailyRewards: v })} />
            <NumField label={t('Tempo para aceitar (segundos)')} value={cfg.pvp.challengeTtlSec} onChange={(v) => set('pvp', { challengeTtlSec: v })} />
          </div>
          <h3>{t('🎲 Agenda de apostas')}</h3>
          <div className="cfg-grid">
            <NumField label={t('Uma luta a cada (minutos)')} value={cfg.bets.intervalMin} onChange={(v) => set('bets', { intervalMin: v })} hint={t('Vale para as lutas que ainda vão ser criadas')} />
            <NumField label={t('Apostas fecham antes (segundos)')} value={cfg.bets.closeSec} onChange={(v) => set('bets', { closeSec: v })} />
            <NumField label={t('Agenda à frente (minutos)')} step={30} value={cfg.bets.horizonMin} onChange={(v) => set('bets', { horizonMin: v })} />
            <NumField label={t('Tempo AO VIVO (segundos)')} value={cfg.bets.liveSec} onChange={(v) => set('bets', { liveSec: v })} />
            <NumField label={t('Aposta mínima (milho)')} value={cfg.bets.minBet} onChange={(v) => set('bets', { minBet: v })} />
            <NumField label={t('Aposta máxima (milho)')} step={1000} value={cfg.bets.maxBet} onChange={(v) => set('bets', { maxBet: v })} />
          </div>
          <h3>{t('🛡️ Economia e segurança')}</h3>
          <div className="cfg-grid">
            <NumField label={t('Ovos grátis máximos por dia')} value={cfg.economy.freeOvosPerDay} onChange={(v) => set('economy', { freeOvosPerDay: v })} hint={t('Acima disso o servidor recusa o progresso (anti-trapaça)')} />
            <NumField label={t('Milho ganho por dia (limite)')} step={100000} value={cfg.economy.freeMilhoPerDay} onChange={(v) => set('economy', { freeMilhoPerDay: v })} hint={t('Acima disso o servidor recusa o progresso')} />
            <NumField label={t('Limite de gasto padrão (R$)')} step={10} value={cfg.economy.defaultSpendLimitCents / 100} onChange={(v) => set('economy', { defaultSpendLimitCents: Math.round(v * 100) })} hint={t('Vale para contas novas')} />
          </div>
        </div>
      </div>
      <div className="center">
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setCfg(defaults)
            toast(t('Valores padrão carregados. Clique em Salvar para aplicar.'), 'info')
          }}
        >
          {t('↺ Restaurar todos os padrões')}
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
  return (
    <>
      <h1>{t('Auditoria')}</h1>
      <p className="tiny muted">{t('Tudo que administradores fizeram no backoffice.')}</p>
      <div className="card">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>{t('Quando')}</th>
              <th>{t('Quem')}</th>
              <th>{t('Ação')}</th>
              <th>{t('Jogador')}</th>
              <th>{t('Detalhes')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="tiny">{dt(r.at)}</td>
                <td className="tiny">{r.admin_email}</td>
                <td>{AUDIT_LABEL[r.action] ?? r.action}</td>
                <td className="tiny">{r.target_email ?? '—'}</td>
                <td>
                  {r.detail && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setView(r.detail)}>
                      {t('Ver')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted center">{t('Nenhuma ação registrada ainda.')}</p>}
      </div>
      <Modal open={!!view} onClose={() => setView(null)} title={t('Detalhes')}>
        <pre className="audit-pre">{view && JSON.stringify(JSON.parse(view), null, 2)}</pre>
      </Modal>
    </>
  )
}
