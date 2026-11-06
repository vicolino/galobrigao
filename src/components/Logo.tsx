import { useId } from 'react'

/** Logotipo do Galo Brigão: galo mascote desenhado num selo arredondado. Nítido em qualquer tamanho. */
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
      {/* selo */}
      <rect x="4" y="4" width="92" height="92" rx="26" fill={`url(#bg${id})`} stroke="#d97400" strokeWidth="4" />
      <rect x="4" y="4" width="92" height="46" rx="26" fill="#fff" opacity="0.14" />
      <g stroke="#3a1606" strokeWidth="4.2" strokeLinejoin="round" strokeLinecap="round">
        {/* crista */}
        <path d="M44 30c-3-8 4-13 8-9 1-7 10-7 10 1 5-3 11 2 7 9z" fill="#ff4d4d" />
        {/* cabeça/corpo do galo */}
        <path d="M40 34c-9 2-16 11-16 22 0 12 10 21 24 21 7 0 13-2 17-6l10 7-2-13c2-4 3-8 3-12 0-16-22-24-36-16z" fill={`url(#face${id})`} />
        {/* barbela */}
        <path d="M44 72c-1 7 3 12 9 11 4-1 5-6 3-10z" fill="#ff4d4d" />
        {/* bico */}
        <path d="M24 50l-14 3 14 7z" fill="#ffb020" />
      </g>
      {/* olho bravo */}
      <circle cx="44" cy="50" r="7.5" fill="#fff" stroke="#3a1606" strokeWidth="3" />
      <circle cx="42" cy="51" r="3.6" fill="#1a0f08" />
      <path d="M36 41l12 4" stroke="#3a1606" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  )
}
