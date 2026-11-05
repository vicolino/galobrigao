// Catálogo de produtos pagos com dinheiro real. Preço sempre em centavos (BRL).
// Fonte única de verdade: o servidor usa estes valores para cobrar e entregar.

import { locale, t } from '../i18n'

const num = (n: number) => n.toLocaleString(locale())

export type SkuKind = 'ovos' | 'vip' | 'starter' | 'pass'

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
  { id: 'ovos-50', kind: 'ovos', name: t('{n} ovos de ouro', { n: num(50) }), emoji: '🥚', desc: t('Para começar.'), priceCents: 490, ovos: 50 },
  { id: 'ovos-120', kind: 'ovos', name: t('{n} ovos de ouro', { n: num(130) }), emoji: '🥚', desc: t('{a} + {b} de bônus.', { a: num(120), b: num(10) }), priceCents: 990, ovos: 120, bonus: 10 },
  { id: 'ovos-300', kind: 'ovos', name: t('{n} ovos de ouro', { n: num(345) }), emoji: '🥚', desc: t('{a} + {b} de bônus.', { a: num(300), b: num(45) }), priceCents: 2290, ovos: 300, bonus: 45, tag: t('Mais vendido') },
  { id: 'ovos-700', kind: 'ovos', name: t('{n} ovos de ouro', { n: num(850) }), emoji: '🥚', desc: t('{a} + {b} de bônus.', { a: num(700), b: num(150) }), priceCents: 4990, ovos: 700, bonus: 150 },
  { id: 'ovos-1600', kind: 'ovos', name: t('{n} ovos de ouro', { n: num(2000) }), emoji: '🥚', desc: t('{a} + {b} de bônus.', { a: num(1600), b: num(400) }), priceCents: 9990, ovos: 1600, bonus: 400, tag: t('Melhor valor') },
  // Assinatura
  { id: 'vip-30', kind: 'vip', name: t('Assinatura VIP ({n} dias)', { n: 30 }), emoji: '👑', desc: t('{a} ovos na hora, +{b} ovos/dia e +{p}% de milho.', { a: 100, b: 10, p: 25 }), priceCents: 1990, ovos: 100 },
  // Passe da Temporada (premium do mês atual; uma vez por temporada)
  { id: 'passe-temporada', kind: 'pass', name: t('Passe da Temporada'), emoji: '🎫', desc: t('Trilha premium da temporada: skins e galo exclusivos, ovos e itens raros.'), priceCents: 1990 },
  // Pacotes iniciais (uma vez por conta)
  {
    id: 'starter-raro',
    kind: 'starter',
    name: t('Kit Brigão'),
    emoji: '🐓',
    desc: t('Índio Gigante ★★★ + {n} ovos + {f} ferramentas.', { n: 120, f: 9 }),
    priceCents: 990,
    breedId: 'indio',
    stars: 3,
    roosterName: 'Brigão', // i18n-ok (nome próprio)
    ovos: 120,
    tools: { energetico: 3, escudo: 3, apito: 3 },
    oncePerUser: true,
  },
  {
    id: 'starter-epico',
    kind: 'starter',
    name: t('Kit Campeão'),
    emoji: '🔥',
    desc: t('Aurora ★★★★ + skin Camuflado + {n} ovos + ferramentas raras.', { n: 350 }),
    priceCents: 2490,
    breedId: 'aurora',
    stars: 4,
    roosterName: 'Aurora',
    skin: 'camuflado',
    ovos: 350,
    tools: { curativo: 3, espelho: 3, amuleto: 2, energetico: 3 },
    oncePerUser: true,
    tag: t('Mais escolhido'),
  },
  {
    id: 'starter-lendario',
    kind: 'starter',
    name: t('Kit Lenda'),
    emoji: '👑',
    desc: t('Galo de Ouro ★★★★★ + skin Fênix de Fogo + {n} ovos + Kit Campeão de ferramentas.', { n: 800 }),
    priceCents: 4990,
    breedId: 'dourado',
    stars: 5,
    roosterName: 'Midas',
    skin: 'fogo',
    ovos: 800,
    tools: { banda: 3, fenix: 2, amuleto: 3, curativo: 3 },
    oncePerUser: true,
    tag: t('Melhor valor'),
  },
]

export const SKU_BY_ID: Record<string, Sku> = Object.fromEntries(CATALOG.map((s) => [s.id, s]))

export const brl = (cents: number) => (cents / 100).toLocaleString(locale(), { style: 'currency', currency: 'BRL' })

/** Limites de gasto mensal oferecidos ao usuário (centavos). */
export const SPEND_LIMITS = [5000, 10000, 25000, 50000, 100000]
export const DEFAULT_SPEND_LIMIT = 50000
/** Quanto de ovos um jogador pode ganhar jogando por dia (missões, bônus, conquistas, liga). */
export const FREE_OVOS_PER_DAY = 400
