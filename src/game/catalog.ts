// Catálogo de produtos pagos com dinheiro real. Preço sempre em centavos (BRL).
// Fonte única de verdade: o servidor usa estes valores para cobrar e entregar.

export type SkuKind = 'ovos' | 'vip' | 'starter'

export interface Sku {
  id: string
  kind: SkuKind
  name: string
  emoji: string
  desc: string
  priceCents: number
  ovos?: number
  bonus?: number
  breedId?: string
  stars?: number
  roosterName?: string
  skin?: string
  tools?: Record<string, number>
  oncePerUser?: boolean
  tag?: string
}

export const CATALOG: Sku[] = [
  // Pacotes de ovos de ouro (moeda premium)
  { id: 'ovos-50', kind: 'ovos', name: '50 ovos de ouro', emoji: '🥚', desc: 'Para começar.', priceCents: 490, ovos: 50 },
  { id: 'ovos-120', kind: 'ovos', name: '130 ovos de ouro', emoji: '🥚', desc: '120 + 10 de bônus.', priceCents: 990, ovos: 120, bonus: 10 },
  { id: 'ovos-300', kind: 'ovos', name: '345 ovos de ouro', emoji: '🥚', desc: '300 + 45 de bônus.', priceCents: 2290, ovos: 300, bonus: 45, tag: 'Mais vendido' },
  { id: 'ovos-700', kind: 'ovos', name: '850 ovos de ouro', emoji: '🥚', desc: '700 + 150 de bônus.', priceCents: 4990, ovos: 700, bonus: 150 },
  { id: 'ovos-1600', kind: 'ovos', name: '2.000 ovos de ouro', emoji: '🥚', desc: '1.600 + 400 de bônus.', priceCents: 9990, ovos: 1600, bonus: 400, tag: 'Melhor valor' },
  // Assinatura
  { id: 'vip-30', kind: 'vip', name: 'Passe do Criador (30 dias)', emoji: '👑', desc: '100 ovos na hora, +10 ovos/dia e +25% de milho.', priceCents: 1990, ovos: 100 },
  // Pacotes iniciais (uma vez por conta)
  {
    id: 'starter-raro',
    kind: 'starter',
    name: 'Kit Brigão',
    emoji: '🐓',
    desc: 'Índio Gigante ★★★ + 120 ovos + 9 ferramentas.',
    priceCents: 990,
    breedId: 'indio',
    stars: 3,
    roosterName: 'Brigão',
    ovos: 120,
    tools: { energetico: 3, escudo: 3, apito: 3 },
    oncePerUser: true,
  },
  {
    id: 'starter-epico',
    kind: 'starter',
    name: 'Kit Campeão',
    emoji: '🔥',
    desc: 'Aurora ★★★★ + skin Camuflado + 350 ovos + ferramentas raras.',
    priceCents: 2490,
    breedId: 'aurora',
    stars: 4,
    roosterName: 'Aurora',
    skin: 'camuflado',
    ovos: 350,
    tools: { curativo: 3, espelho: 3, amuleto: 2, energetico: 3 },
    oncePerUser: true,
    tag: 'Mais escolhido',
  },
  {
    id: 'starter-lendario',
    kind: 'starter',
    name: 'Kit Lenda',
    emoji: '👑',
    desc: 'Galo de Ouro ★★★★★ + skin Fênix de Fogo + 800 ovos + Kit Campeão de ferramentas.',
    priceCents: 4990,
    breedId: 'dourado',
    stars: 5,
    roosterName: 'Midas',
    skin: 'fogo',
    ovos: 800,
    tools: { banda: 3, fenix: 2, amuleto: 3, curativo: 3 },
    oncePerUser: true,
    tag: 'Melhor valor',
  },
]

export const SKU_BY_ID: Record<string, Sku> = Object.fromEntries(CATALOG.map((s) => [s.id, s]))

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Limites de gasto mensal oferecidos ao usuário (centavos). */
export const SPEND_LIMITS = [5000, 10000, 25000, 50000, 100000]
export const DEFAULT_SPEND_LIMIT = 50000
/** Quanto de ovos um jogador pode ganhar jogando por dia (missões, bônus, conquistas, liga). */
export const FREE_OVOS_PER_DAY = 400
