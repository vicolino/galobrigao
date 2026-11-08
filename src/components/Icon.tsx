/** Ícones desenhados do app (traço único, 24×24, usam currentColor). Estilo cartoon limpo. */
export type IconName =
  | 'galinheiro' | 'cruzamento' | 'arena' | 'drops' | 'desafios' | 'torneios' | 'apostas'
  | 'missoes' | 'passe' | 'liga' | 'ranking' | 'skins' | 'ferramentas' | 'loja' | 'feira'
  | 'carteira' | 'mercado' | 'novidades' | 'perfil' | 'mais' | 'admin' | 'som' | 'mudo' | 'ajuda'

const P: Record<IconName, string> = {
  galinheiro: 'M3 11.5 12 4l9 7.5M5 10v9h14v-9M9.5 19v-4a2.5 2.5 0 0 1 5 0v4',
  cruzamento: 'M12 3c3 2.4 4.5 5 4.5 8a4.5 4.5 0 0 1-9 0c0-3 1.5-5.6 4.5-8Z',
  arena: 'M6.5 4 4 6.5 15 17.5 17.5 15 6.5 4ZM4 6.5l3 .3M6.8 4 7 7M17.5 4 20 6.5 9 17.5 6.5 15M20 6.5l-3 .3M17.2 4 17 7M5 19l3-3M19 19l-3-3',
  drops: 'M4 8h16v3H4zM5 11v8h14v-8M12 8v11M12 8S9.5 3.5 7.5 5.2 10.5 8 12 8ZM12 8s2.5-4.5 4.5-2.8S13.5 8 12 8Z',
  desafios: 'M7 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 19v-1a4 4 0 0 1 8 0v1M13 19v-1a4 4 0 0 1 8 0v1M11 12.5 13 14M13 12.5 11 14',
  torneios: 'M8 4h8v3a4 4 0 0 1-8 0V4ZM8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M10 11.5l-.5 3.5h5l-.5-3.5M8 20h8l-1-2H9z',
  apostas: 'M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9ZM12 3v18M4 7.5 12 12l8-4.5M9 10.2v0M15 13.8v0M12 12v0',
  missoes: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12v0',
  passe: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 1.5 1.5 0 0 0 0 3v2a1.5 1.5 0 0 0 0 3 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 1.5 1.5 0 0 0 0-3v-2a1.5 1.5 0 0 0 0-3ZM10 6v12',
  liga: 'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM9.5 13.5 8 21l4-2 4 2-1.5-7.5M12 7v2l1.5.8',
  ranking: 'M4 20V9h4v11M10 20V4h4v16M16 20v-7h4v7M3 20h18',
  skins: 'M12 3a9 9 0 0 0 0 18 2 2 0 0 0 2-2c0-1 .8-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-5-4-8.5-9-8.5ZM7.5 11v0M10 7.5v0M15 7.5v0',
  ferramentas: 'M14.5 6.5a3.5 3.5 0 0 0-4.6 4.3l-5.6 5.6 1.8 1.8 5.6-5.6a3.5 3.5 0 0 0 4.3-4.6l-2 2-1.8-.4-.4-1.8 2.7-1.3ZM14 14l4 4',
  loja: 'M5 7h14l-1.2 8.5a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7L5 7ZM8.5 7a3.5 3.5 0 0 1 7 0M9 20.5v0M15 20.5v0',
  feira: 'M4 10h16v9H4zM4 10 6 5h12l2 5M4 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0M10 19v-4h4v4',
  carteira: 'M4 7a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v1M4 7v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M4 7h14a2 2 0 0 1 2 2v2h-4a2 2 0 0 0 0 4h4M16 13v0',
  mercado: 'M5 8h12l-2.5-2.5M5 8l2.5 2.5M19 16H7l2.5 2.5M19 16l-2.5-2.5',
  novidades: 'M12 3l2.2 4.6L19 8.3l-3.5 3.4.8 4.9L12 14.3 7.7 16.6l.8-4.9L5 8.3l4.8-.7L12 3Z',
  perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1',
  mais: 'M6 7h.01M12 7h.01M18 7h.01M6 12h.01M12 12h.01M18 12h.01M6 17h.01M12 17h.01M18 17h.01',
  admin: 'M12 3l7 3v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3ZM9 12l2 2 4-4',
  som: 'M4 9v6h3l5 4V5L7 9H4ZM16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13',
  mudo: 'M4 9v6h3l5 4V5L7 9H4ZM16 9l5 6M21 9l-5 6',
  ajuda: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.3 9a2.8 2.8 0 0 1 5.4 1c0 1.8-2.7 2.5-2.7 4M12 17.5v0',
}

const ROUND = new Set<IconName>(['mais'])

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden style={ROUND.has(name) ? { strokeWidth: 2.6 } : undefined}>
      <path d={P[name]} />
    </svg>
  )
}
