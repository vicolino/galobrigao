import { useId } from 'react'

/** Logotipo do Galo Brigão: galo mascote de frente num selo arredondado. Nítido em qualquer tamanho. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-label="Galo Brigão" role="img">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffcf4a" />
          <stop offset="0.5" stopColor="#ff9f1c" />
          <stop offset="1" stopColor="#ff6d2a" />
        </linearGradient>
        <linearGradient id={`face${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3df" />
          <stop offset="1" stopColor="#f3d9b0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="26" fill={`url(#bg${id})`} stroke="#d97400" strokeWidth="4" />
      <rect x="4" y="4" width="92" height="46" rx="26" fill="#fff" opacity="0.14" />
      <g stroke="#3a1606" strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round">
        {/* crista */}
        <path d="M39 33c0-7 6-7 6-1 1-8 7-8 8-1 1-7 7-6 6 2z" fill="#ff4d4d" />
        {/* cabeça */}
        <ellipse cx="50" cy="57" rx="25" ry="23" fill={`url(#face${id})`} />
        {/* barbela */}
        <path d="M45 76c-2 6 1 9 5 9 4 0 7-3 5-9z" fill="#ff4d4d" />
        {/* bico */}
        <path d="M43 61h14l-7 10z" fill="#ffb020" />
      </g>
      {/* olhos */}
      <circle cx="41" cy="55" r="6.5" fill="#fff" stroke="#3a1606" strokeWidth="3" />
      <circle cx="59" cy="55" r="6.5" fill="#fff" stroke="#3a1606" strokeWidth="3" />
      <circle cx="42" cy="56" r="3" fill="#1a0f08" />
      <circle cx="58" cy="56" r="3" fill="#1a0f08" />
      {/* sobrancelhas bravas */}
      <path d="M34 48l10 4" stroke="#3a1606" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M66 48l-10 4" stroke="#3a1606" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  )
}
