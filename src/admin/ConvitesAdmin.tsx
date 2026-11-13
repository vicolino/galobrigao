// 🎟️ Backoffice → Convites: whitelist do cadastro. Cria lotes de códigos, convites presos a e-mail e cancela.
// Ligar/desligar a whitelist e o número de convites por jogador fica em Configurações → Geral.
import { useCallback, useEffect, useState } from 'react'
import { api, type AdminInvites } from '../api'
import { useGame } from '../game/store'
import { locale, t, tx } from '../i18n'

const STATUS: Record<string, string> = {
  ativo: t('🟢 ativo'),
  usado: t('✅ usado'),
  expirado: t('⌛ expirado'),
  cancelado: t('⛔ cancelado'),
}
const FILTERS: { id: string; label: string }[] = [
  { id: 'todos', label: t('Todos') },
  { id: 'admin', label: t('Da equipe') },
  { id: 'jogadores', label: t('De jogadores') },
]
const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(locale()) : '—')

export function ConvitesAdmin() {
  const { toast } = useGame()
  const [d, setD] = useState<AdminInvites | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('todos')
  // Formulário de criação
  const [mode, setMode] = useState<'lote' | 'emails'>('lote')
  const [count, setCount] = useState(10)
  const [maxUses, setMaxUses] = useState(1)
  const [days, setDays] = useState(0)
  const [note, setNote] = useState('')
  const [code, setCode] = useState('')
  const [emails, setEmails] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ code: string; email: string | null; link: string }[]>([])

  const load = useCallback(() => api.admin.convites(q, filter).then(setD).catch((e) => toast(tx((e as Error).message), 'erro')), [q, filter, toast])
  useEffect(() => {
    const h = setTimeout(load, 250)
    return () => clearTimeout(h)
  }, [load])

  const create = async () => {
    setBusy(true)
    try {
      const r = await api.admin.convitesCreate(
        mode === 'emails' ? { emails, note, expiresDays: days, sendEmail, code: code || undefined } : { count, maxUses, note, expiresDays: days, code: code || undefined },
      )
      setCreated(r.created)
      toast(mode === 'emails' && sendEmail ? t('{n} convites criados · {m} e-mails enviados', { n: r.created.length, m: r.mailed }) : t('{n} convites criados', { n: r.created.length }), 'ok')
      setCode('')
      setEmails('')
      void load()
    } catch (e) {
      toast(tx((e as Error).message), 'erro')
    }
    setBusy(false)
  }
  const revoke = async (c: string) => {
    if (!confirm(t('Cancelar o convite {code}? Quem já entrou continua com a conta.', { code: c }))) return
    try {
      await api.admin.convitesRevoke(c)
      void load()
    } catch (e) {
      toast(tx((e as Error).message), 'erro')
    }
  }
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast(t('Copiado!'), 'ok'), () => toast(text, 'info'))
  const csv = () => ['code,email,link', ...created.map((c) => `${c.code},${c.email ?? ''},${c.link}`)].join('\n')

  return (
    <>
      <div className="row-between admin-filters">
        <h1>
          {t('🎟️ Convites (whitelist)')} {d && <span className="count-badge">{d.stats.total}</span>}
        </h1>
        <span className={`tag ${d?.on ? 'pos' : 'muted'}`}>{d?.on ? t('Cadastro só por convite') : t('Cadastro aberto (convite opcional)')}</span>
      </div>
      <p className="tiny muted">{t('Ligar/desligar a whitelist e quantos convites cada jogador pode gerar: Configurações → Geral.')}</p>

      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, margin: '12px 0' }}>
          <div className="card"><div className="tiny muted">{t('Códigos ativos')}</div><b>{d.stats.active}</b></div>
          <div className="card"><div className="tiny muted">{t('Usos')}</div><b>{d.stats.used}</b></div>
          <div className="card"><div className="tiny muted">{t('Contas que entraram por convite')}</div><b>{d.stats.invitedUsers}</b></div>
          <div className="card"><div className="tiny muted">{t('Códigos gerados por jogadores')}</div><b>{d.stats.fromPlayers}</b></div>
        </div>
      )}

      <div className="card cfg-section">
        <h3>{t('Criar convites')}</h3>
        <div className="tabs compact">
          <button className={`tab ${mode === 'lote' ? 'active' : ''}`} onClick={() => setMode('lote')}>{t('Lote de códigos')}</button>
          <button className={`tab ${mode === 'emails' ? 'active' : ''}`} onClick={() => setMode('emails')}>{t('Por e-mail (nominal)')}</button>
        </div>
        <div className="cfg-grid">
          {mode === 'lote' ? (
            <>
              <label className="field"><span>{t('Quantidade')}</span><input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
              <label className="field"><span>{t('Usos por código')}</span><input type="number" min={1} max={100000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} /></label>
            </>
          ) : (
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>{t('E-mails (um por linha ou separados por vírgula) — cada um ganha um código que só ele pode usar')}</span>
              <textarea rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ana@email.com, joao@email.com" />
            </label>
          )}
          <label className="field"><span>{t('Validade (dias, 0 = sem validade)')}</span><input type="number" min={0} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          <label className="field"><span>{t('Nota (ex.: campanha, influenciador)')}</span><input maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <label className="field"><span>{t('Código personalizado (opcional, cria 1)')}</span><input maxLength={24} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="DISCORD-OG" /></label>
        </div>
        {mode === 'emails' && (
          <label className="check"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> {t('Enviar o convite por e-mail')}</label>
        )}
        <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? t('Aguarde...') : t('Criar')}</button>
        {created.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="row gap">
              <b>{t('Criados agora: {n}', { n: created.length })}</b>
              <button className="btn btn-sm" onClick={() => copy(created.map((c) => c.code).join('\n'))}>{t('Copiar códigos')}</button>
              <button className="btn btn-sm" onClick={() => copy(csv())}>{t('Copiar CSV')}</button>
            </div>
            <pre className="tiny" style={{ maxHeight: 160, overflow: 'auto' }}>{created.map((c) => `${c.code}${c.email ? `  ${c.email}` : ''}`).join('\n')}</pre>
          </div>
        )}
      </div>

      <div className="row-between admin-filters" style={{ marginTop: 16 }}>
        <input placeholder={t('Buscar código, e-mail ou nota')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tabs compact">
          {FILTERS.map((f) => (
            <button key={f.id} className={`tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table admin-table">
          <thead>
            <tr>
              <th>{t('Código')}</th>
              <th>{t('Situação')}</th>
              <th className="num">{t('Usos')}</th>
              <th>{t('De quem')}</th>
              <th>{t('Para / nota')}</th>
              <th>{t('Quem entrou')}</th>
              <th>{t('Criado')}</th>
              <th>{t('Validade')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d?.invites.map((i) => (
              <tr key={i.code}>
                <td><code>{i.code}</code></td>
                <td>{STATUS[i.status]}</td>
                <td className="num">{i.uses}/{i.maxUses}</td>
                <td className="tiny">{i.owner ? `${i.owner.name ?? ''} · ${i.owner.email ?? ''}` : i.createdBy}</td>
                <td className="tiny">{[i.email, i.note].filter(Boolean).join(' · ') || '—'}</td>
                <td className="tiny">{i.usedBy.map((u) => u.email).join(', ') || '—'}</td>
                <td className="tiny">{date(i.createdAt)}</td>
                <td className="tiny">{date(i.expiresAt)}</td>
                <td>
                  <div className="row gap">
                    {i.status === 'ativo' && <button className="btn btn-sm btn-ghost" onClick={() => copy(i.link)}>{t('Link')}</button>}
                    {i.status === 'ativo' && <button className="btn btn-sm btn-ghost" onClick={() => revoke(i.code)}>{t('Cancelar')}</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d && !d.invites.length && <p className="muted">{t('Nenhum convite ainda.')}</p>}
      </div>
    </>
  )
}
