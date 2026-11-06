import type { CSSProperties, ReactNode } from 'react'

/** Partículas espalhadas: cada uma recebe índice, ângulo e atraso próprios. */
const P = (n: number, f: (i: number, st: CSSProperties) => ReactNode) =>
  Array.from({ length: n }, (_, i) => f(i, { ['--i' as string]: i, ['--a' as string]: `${(360 / n) * i + (i % 2) * 12}deg`, ['--x' as string]: `${8 + ((i * 37) % 84)}%`, animationDelay: `calc(var(--fxd) * ${((i * 7) % 5) * 0.06})` }))

/**
 * Animação de cada ferramenta em cima do galo, na hora em que ela age.
 * `big` = momento de destaque (entrada, cura, fênix); sem ele é a versão curta que acompanha os golpes.
 * `ghost` = desenho do galo, usado pelo Espelho para criar as cópias.
 */
export function ToolFx({ tool, side, big, ms, ghost }: { tool: string; side: 0 | 1; big?: boolean; ms: number; ghost?: ReactNode }) {
  const n = (full: number) => (big ? full : Math.ceil(full / 2))
  const style = { ['--fxd' as string]: `${ms}ms` } as CSSProperties
  const cls = `tfx tfx-${tool} side-${side} ${big ? 'big' : ''}`
  switch (tool) {
    case 'energetico':
      return (
        <div className={cls} style={style} aria-hidden>
          {big && <b className="tfx-can">🥤</b>}
          {P(n(8), (i, st) => (
            <i key={i} className="tfx-spark" style={st}>
              ⚡
            </i>
          ))}
        </div>
      )
    case 'escudo':
      return (
        <div className={cls} style={style} aria-hidden>
          <div className="tfx-shield">
            <span>🛡️</span>
          </div>
          <i className="tfx-ripple" />
        </div>
      )
    case 'apito':
      return (
        <div className={cls} style={style} aria-hidden>
          <b className="tfx-horn">📯</b>
          {P(3, (i, st) => (
            <i key={`w${i}`} className="tfx-wave" style={{ ...st, animationDelay: `calc(var(--fxd) * ${i * 0.18})` }} />
          ))}
          {P(n(4), (i, st) => (
            <i key={`p${i}`} className="tfx-puff" style={st}>
              💨
            </i>
          ))}
        </div>
      )
    case 'curativo':
      return (
        <div className={cls} style={style} aria-hidden>
          <i className="tfx-ring" />
          <b className="tfx-aid">🩹</b>
          {P(n(8), (i, st) => (
            <i key={i} className="tfx-cross" style={st}>
              ✚
            </i>
          ))}
        </div>
      )
    case 'espelho':
      return (
        <div className={cls} style={style} aria-hidden>
          {ghost && (
            <>
              <div className="tfx-ghost g1">{ghost}</div>
              <div className="tfx-ghost g2">{ghost}</div>
            </>
          )}
          <b className="tfx-mirror">🪞</b>
          {P(n(6), (i, st) => (
            <i key={i} className="tfx-twinkle" style={st}>
              ✨
            </i>
          ))}
        </div>
      )
    case 'pimenta':
      return (
        <div className={cls} style={style} aria-hidden>
          <b className="tfx-chili">🌶️</b>
          {P(n(8), (i, st) => (
            <i key={`f${i}`} className="tfx-flame" style={st}>
              🔥
            </i>
          ))}
          {P(n(3), (i, st) => (
            <i key={`s${i}`} className="tfx-steam" style={st}>
              💨
            </i>
          ))}
        </div>
      )
    case 'amuleto':
      return (
        <div className={cls} style={style} aria-hidden>
          <i className="tfx-rays" />
          <b className="tfx-eye">🧿</b>
          <i className="tfx-flash" />
        </div>
      )
    case 'banda':
      return (
        <div className={cls} style={style} aria-hidden>
          {P(n(6), (i, st) => (
            <i key={`n${i}`} className="tfx-note" style={st}>
              {i % 2 ? '🎶' : '🎵'}
            </i>
          ))}
          {big &&
            P(12, (i, st) => <i key={`c${i}`} className="tfx-confetti" style={{ ...st, background: ['#ffc640', '#ff5a4f', '#4fd1ff', '#7be07b'][i % 4] }} />)}
        </div>
      )
    case 'fenix':
      return (
        <div className={cls} style={style} aria-hidden>
          <i className="tfx-burst" />
          <b className="tfx-wing w1">🪶</b>
          <b className="tfx-wing w2">🪶</b>
          {P(n(12), (i, st) => (
            <i key={i} className="tfx-ember" style={st}>
              {i % 3 ? '✦' : '🔥'}
            </i>
          ))}
        </div>
      )
    default:
      return null
  }
}
