// 📝 Backoffice → Convites → Lista de espera: aprovar (gera convite nominal e manda por e-mail) ou recusar pedidos.
import { useCallback, useEffect, useState } from 'react'
import { api, type AdminWaitlist } from '../api'
import { useGame } from '../game/store'
import { locale, t, tx } from '../i18n'

const STATUS_TABS: { id: string; label: string }[] = [
  { id: 'pendente', label: t('⏳ Pendentes') },
  { id: 'aprovado', label: t('✅ Aprovados') },
  { id: 'recusado', label: t('⛔ Recusados') },
  { id: 'todos', label: t('Todos') },
]

export function EsperaAdmin() {
  const { toast } = useGame()
  const [d, setD] = useState<AdminWaitlist | null>(null)
  const [status, setStatus] = useState('pendente')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [sendEmail, setSendEmail] = useState(true)
  const [days, setDays] = useState(14)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      api.admin
        .espera(status, q)
        .then((r) => {
          setD(r)
          setSel(new Set())
        })
        .catch((e) => toast(tx((e as Error).message), 'erro')),
    [status, q, toast],
  )
  useEffect(() => {
    const h = setTimeout(load, 250)
    return () => clearTimeout(h)
  }, [load])

  const pend = d?.list.filter((w) => w.status === 'pendente') ?? []
  const toggle = (id: number) => setSel((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const all = pend.length > 0 && pend.every((w) => sel.has(w.id))

  const approve = async () => {
    setBusy(true)
    try {
      const r = await api.admin.esperaAprovar([...sel], sendEmail, days)
      toast(sendEmail ? t('{n} aprovados · {m} e-mails enviados', { n: r.approved, m: r.mailed }) : t('{n} aprovados', { n: r.approved }), 'ok')
      void load()
    } catch (e) {
      toast(tx((e as Error).message), 'erro')
    }
    setBusy(false)
  }
  const refuse = async () => {
    if (!confirm(t('Recusar {n} pedidos? A pessoa não é avisada.', { n: sel.size }))) return
    setBusy(true)
    try {
      const r = await api.admin.esperaRecusar([...sel])
      toast(t('{n} recusados', { n: r.refused }), 'ok')
      void load()
    } catch (e) {
      toast(tx((e as Error).message), 'erro')
    }
    setBusy(false)
  }

  return (
    <>
      <p className="tiny muted">{t('Pedidos feitos na página inicial por quem ainda não tem convite. Aprovar cria um convite de 1 uso preso ao e-mail da pessoa e manda por e-mail.')}</p>
      <div className="row-between admin-filters">
        <div className="tabs compact">
          {STATUS_TABS.map((s) => (
            <button key={s.id} className={`tab ${status === s.id ? 'active' : ''}`} onClick={() => setStatus(s.id)}>
              {s.label}
              {d && s.id !== 'todos' && <span className="count-badge">{d.counts[s.id as keyof AdminWaitlist['counts']]}</span>}
            </button>
          ))}
        </div>
        <input placeholder={t('Buscar e-mail, nome ou Discord')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {pend.length > 0 && (
        <div className="card cfg-section row gap" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <b>{t('{n} selecionados', { n: sel.size })}</b>
          <label className="check"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> {t('Enviar o convite por e-mail')}</label>
          <label className="row gap tiny">
            {t('Validade (dias)')}
            <input type="number" min={0} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 80 }} />
          </label>
          <button className="btn btn-primary btn-sm" disabled={busy || !sel.size} onClick={approve}>{t('✅ Aprovar')}</button>
          <button className="btn btn-sm btn-ghost" disabled={busy || !sel.size} onClick={refuse}>{t('Recusar')}</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>{pend.length > 0 && <input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(pend.map((w) => w.id)))} aria-label={t('Selecionar todos')} />}</th>
              <th>#</th>
              <th>{t('Nome')}</th>
              <th>{t('E-mail')}</th>
              <th>{t('Discord')}</th>
              <th>{t('Por que quer jogar')}</th>
              <th>{t('Pediu em')}</th>
              <th>{t('Situação')}</th>
            </tr>
          </thead>
          <tbody>
            {d?.list.map((w) => (
              <tr key={w.id}>
                <td>{w.status === 'pendente' && <input type="checkbox" checked={sel.has(w.id)} onChange={() => toggle(w.id)} />}</td>
                <td className="tiny muted">{w.id}</td>
                <td>{w.name}</td>
                <td className="tiny">{w.email}{w.hasAccount && <span className="tiny pos"> · {t('já tem conta')}</span>}</td>
                <td className="tiny">{w.discord ?? '—'}</td>
                <td className="tiny" style={{ maxWidth: 280 }}>{w.reason ?? '—'}</td>
                <td className="tiny">{new Date(w.createdAt).toLocaleString(locale())}</td>
                <td className="tiny">
                  {w.status === 'pendente' ? t('⏳ pendente') : w.status === 'aprovado' ? <>{t('✅ aprovado')} <code>{w.inviteCode}</code></> : t('⛔ recusado')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d && !d.list.length && <p className="muted">{t('Nenhum pedido aqui.')}</p>}
      </div>
    </>
  )
}
