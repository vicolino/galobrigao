// Backoffice: métricas de ofertas e estoque das edições limitadas.
import { useEffect, useState } from 'react'
import { api, type OffersAdmin } from '../api'
import { useGame } from '../game/store'
import { Kpi } from './Charts'
import { locale, t, tx } from '../i18n'

const NAMES: Record<string, string> = { rei: t('👑 Rei do Gramado'), 'skin:diamante': t('💎 Coroa de Diamante') }
const dateIn = (ms: number | null) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')

export function OfertasAdmin({ days }: { days: number }) {
  const { toast } = useGame()
  const [d, setD] = useState<OffersAdmin | null>(null)
  const [edit, setEdit] = useState<Record<string, { total: string; ends: string }>>({})
  useEffect(() => {
    api
      .offersAdmin(days)
      .then((r) => {
        setD(r)
        setEdit(Object.fromEntries(r.stock.map((s) => [s.id, { total: String(s.total), ends: dateIn(s.endsAt) }])))
      })
      .catch(() => null)
  }, [days])
  if (!d) return null
  const n = (v: number) => v.toLocaleString(locale())
  const kpi = (label: string, value: string) => <Kpi label={label} value={value} />
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>{t('⚡ Ofertas ({n} dias)', { n: days })}</h3>
      <div className="kpi-grid small">
        {kpi(t('Ofertas mostradas'), n(d.shown))}
        {kpi(t('Ofertas compradas'), n(d.bought))}
        {kpi(t('Conversão das ofertas'), `${(d.conversion * 100).toLocaleString(locale(), { maximumFractionDigits: 1 })}%`)}
        {kpi(t('Ovos gastos em ofertas'), `🥚 ${n(d.offerOvos)}`)}
        {kpi(t('Bônus de primeira compra'), n(d.firstBonus))}
        {kpi(t('Edição limitada vendida'), n(d.limitedSold))}
        {kpi(t('Recargas de energia'), `${n(d.refills)} · 🥚 ${n(d.refillOvos)}`)}
      </div>
      <h3 style={{ marginTop: 14 }}>{t('🔥 Estoque das edições limitadas')}</h3>
      {d.stock.map((s) => (
        <div key={s.id} className="row-between wrap gap" style={{ marginBottom: 8 }}>
          <span>
            <b>{NAMES[s.id] ?? s.id}</b> <span className="tiny muted">{t('{v} vendidos de {total}', { v: n(s.sold), total: n(s.total) })}</span>
          </span>
          <span className="row gap">
            <input style={{ width: 90 }} type="number" min={0} value={edit[s.id]?.total ?? ''} onChange={(e) => setEdit({ ...edit, [s.id]: { ...edit[s.id], total: e.target.value } })} aria-label={t('Total')} />
            <input type="datetime-local" value={edit[s.id]?.ends ?? ''} onChange={(e) => setEdit({ ...edit, [s.id]: { ...edit[s.id], ends: e.target.value } })} aria-label={t('Termina em')} />
            <button
              className="btn btn-sm"
              onClick={async () => {
                const e = edit[s.id]
                try {
                  const r = await api.offersStock(s.id, Number(e.total), e.ends ? new Date(e.ends).getTime() : null)
                  setD({ ...d, stock: r.stock })
                  toast(t('Estoque salvo'), 'ok')
                } catch (err) {
                  toast(tx((err as Error).message), 'erro')
                }
              }}
            >
              {t('Salvar')}
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
