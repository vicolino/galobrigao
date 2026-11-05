// 🏟️ Backoffice dos torneios: lista, cancelar/devolver, começar agora (QA) e prêmios pagos.
import { useCallback, useEffect, useState } from 'react'
import { api, type TorneioAdminRow } from '../api'
import { useGame } from '../game/store'
import { statusLabel, torneioName } from '../game/torneio'
import { locale, t, tx } from '../i18n'
import { Kpi } from './Charts'

const n = (v: number) => v.toLocaleString(locale())
const dt = (ms: number) => new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })

export function TorneiosAdmin() {
  const { toast } = useGame()
  const [d, setD] = useState<{ list: TorneioAdminRow[]; totals: { ovos: number; milho: number; fees: number; tokens: number } } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    api.torneios
      .admin()
      .then(setD)
      .catch((e) => setErr(tx((e as Error).message)))
  }, [])
  useEffect(load, [load])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast(ok, 'ok')
      load()
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>{t('Torneios')}</h1>
      <p className="tiny muted">{t('Diário (grátis) e Copa do Terreiro (inscrição em milho). Prêmios pagos pela casa; a chave é resolvida no servidor com semente.')}</p>
      {err && <div className="warn">{err}</div>}
      {d && (
        <>
          <div className="kpi-grid small">
            <Kpi label={t('🥚 Ovos pagos em prêmios')} value={n(d.totals.ovos)} />
            <Kpi label={t('🌽 Milho pago em prêmios')} value={n(d.totals.milho)} />
            <Kpi label={t('🌽 Inscrições (milho)')} value={n(d.totals.fees)} />
            <Kpi label={t('🏆 EGG bloqueado')} value={n(d.totals.tokens)} />
          </div>
          <div className="card tz-admin-scroll">
            <table className="table admin-table">
              <thead>
                <tr>
                  <th>{t('Torneio')}</th>
                  <th>{t('Início')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Inscritos')}</th>
                  <th>{t('Campeão')}</th>
                  <th>{t('Prêmios')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.list.map((r) => {
                  const open = r.status === 'em_breve' || r.status === 'inscricoes' || r.status === 'fechado'
                  return (
                    <tr key={r.id}>
                      <td>
                        {torneioName(r.kind)}
                        <div className="tiny muted">{r.id}</div>
                      </td>
                      <td>{dt(r.startsAt)}</td>
                      <td>
                        {statusLabel(r.status)}
                        {r.reason && <div className="tiny muted">{tx(r.reason)}</div>}
                      </td>
                      <td>
                        {r.entrants} / {r.size}
                      </td>
                      <td>{r.champion ? tx(r.champion) : '—'}</td>
                      <td className="tiny">
                        🥚 {n(r.ovos)} · 🌽 {n(r.milho)}
                        {r.tokens > 0 && ` · EGG ${n(r.tokens)}`}
                      </td>
                      <td>
                        {open && (
                          <div className="row gap">
                            <button className="btn btn-sm" disabled={busy} onClick={() => confirm(t('Começar este torneio agora?')) && act(() => api.torneios.adminStart(r.id, false), t('Torneio iniciado.'))}>
                              {t('▶ Começar agora')}
                            </button>
                            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => confirm(t('Cancelar e devolver as inscrições?')) && act(() => api.torneios.adminCancel(r.id), t('Torneio cancelado.'))}>
                              {t('Cancelar')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
