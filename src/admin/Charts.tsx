import { useEffect, useRef, useState, type ReactNode } from 'react'

// Cores validadas (fundo escuro #14281e): âmbar = série principal, azul = segunda série.
export const C1 = '#c9821f'
export const C2 = '#3580d6'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number) {
  if (v <= 0) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * p
}

const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Barra vertical com topo arredondado (4px) apoiada na linha de base. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

/** Gráfico de barras de uma série por dia, com dica ao passar o mouse e tabela alternativa. */
export function DailyBars({ title, data, format, color = C1 }: { title: string; data: { day: string; value: number }[]; format: (v: number) => string; color?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const H = 180
  const pad = { l: 48, r: 8, t: 10, b: 24 }
  const plotW = width - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const slot = plotW / Math.max(1, data.length)
  const bw = Math.max(2, Math.min(28, slot - 2))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const labelEvery = Math.ceil(data.length / 7)
  const total = data.reduce((a, d) => a + d.value, 0)

  return (
    <div className="chart card">
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          <span className="tiny muted">Total no período: {format(total)}</span>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setTable((t) => !t)}>
          {table ? '📊 Gráfico' : '📋 Tabela'}
        </button>
      </div>
      {table ? (
        <div className="chart-table">
          <table className="table">
            <thead>
              <tr>
                <th>Dia</th>
                <th className="right">{title}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{shortDay(d.day)}</td>
                  <td className="right">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="chart-box" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-label={title}>
            {ticks.map((t) => {
              const y = pad.t + plotH - (t / max) * plotH
              return (
                <g key={t}>
                  <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid" />
                  <text x={pad.l - 6} y={y + 4} textAnchor="end" className="axis">
                    {format(t)}
                  </text>
                </g>
              )
            })}
            {data.map((d, i) => {
              const h = (d.value / max) * plotH
              const x = pad.l + i * slot + (slot - bw) / 2
              const y = pad.t + plotH - h
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)}>
                  <rect x={pad.l + i * slot} y={pad.t} width={slot} height={plotH} fill="transparent" />
                  <path d={barPath(x, y, bw, h)} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
                  {i % labelEvery === 0 && (
                    <text x={pad.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" className="axis">
                      {shortDay(d.day)}
                    </text>
                  )}
                </g>
              )
            })}
            <line x1={pad.l} x2={width - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} className="baseline" />
          </svg>
          {hover !== null && data[hover] && (
            <div className="chart-tip" style={{ left: Math.min(width - 120, Math.max(0, pad.l + hover * slot + slot / 2 - 60)) }}>
              <span className="tiny muted">{shortDay(data[hover].day)}</span>
              <b>{format(data[hover].value)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Lista de barras horizontais (ranking, funil). */
export function HBars({ rows, format, color = C1 }: { rows: { label: ReactNode; value: number; extra?: ReactNode }[]; format: (v: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="muted tiny">Sem dados no período.</p>
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div key={i} className="hbar-row" title={`${format(r.value)}`}>
          <span className="hbar-label">{r.label}</span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
          <span className="hbar-value">
            {format(r.value)} {r.extra}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Barra dividida em partes de um todo (ex.: Pix x Cartão), com legenda e rótulos diretos. */
export function SplitBar({ parts, format }: { parts: { label: string; value: number; color: string }[]; format: (v: number) => string }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  if (!total) return <p className="muted tiny">Sem vendas no período.</p>
  return (
    <div>
      <div className="split">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} className="split-seg" style={{ flex: p.value, background: p.color }} title={`${p.label}: ${format(p.value)}`} />
          ))}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} /> {p.label}: <b>{format(p.value)}</b> ({Math.round((p.value / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  )
}

/** Indicador com variação em relação ao período anterior. */
export function Kpi({ label, value, prev, current, hint }: { label: string; value: string; prev?: number; current?: number; hint?: string }) {
  let delta: ReactNode = null
  if (prev !== undefined && current !== undefined) {
    if (prev === 0) delta = current > 0 ? <span className="delta up">▲ novo</span> : <span className="delta">—</span>
    else {
      const pct = Math.round(((current - prev) / prev) * 100)
      delta = <span className={`delta ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}`}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {Math.abs(pct)}% vs período anterior</span>
    }
  }
  return (
    <div className="kpi-tile card" title={hint}>
      <span className="tiny muted">{label}</span>
      <b>{value}</b>
      {delta}
    </div>
  )
}
