// Valor do galinheiro: quanto vale tudo o que o jogador tem, em milho.
// Coisas compradas com ovos entram pela taxa da loja de trocas (1 🥚 ≈ 🌽 200).
import { ACC_BY_ID, BREED_BY_ID, ITEM_BY_ID, SKIN_BY_ID, TOOL_BY_ID } from './data'
import type { Currency, GameState, Rooster } from './types'

export const OVO_EM_MILHO = 200
const corn = (price: number, currency: Currency | string) => (currency === 'ovo' ? price * OVO_EM_MILHO : price)

/** Valor de mercado de um galo: raça × estrelas + nível + vitórias + acessórios que está usando. */
export function roosterValue(ro: Rooster): number {
  const b = BREED_BY_ID[ro.breedId]
  // Até o galo de rua tem valor: piso de 🌽 500 para a raça
  const breed = Math.max(500, b ? (b.special ? b.price * OVO_EM_MILHO : b.price) : 0)
  const gear = Object.values(ro.equipped).reduce((a, id) => {
    const acc = id ? ACC_BY_ID[id] : undefined
    return a + (acc ? corn(acc.price, acc.currency) : 0)
  }, 0)
  // Pelagem rara (cruzamento) vale 50% a mais na raça
  return Math.round(breed * (0.8 + ro.stars * 0.12) * (ro.tint ? 1.5 : 1) + ro.level * 260 + ro.wins * 20 + gear)
}

export function coopWorth(s: GameState) {
  const sum = (bag: Record<string, number>, byId: Record<string, { price: number; currency: Currency | string } | undefined>) =>
    Object.entries(bag).reduce((a, [id, n]) => a + (byId[id] && n > 0 ? corn(byId[id]!.price, byId[id]!.currency) * n : 0), 0)
  const roosters = s.roosters.reduce((a, r) => a + roosterValue(r), 0)
  const gear = sum(s.accessories, ACC_BY_ID)
  const items = sum(s.items, ITEM_BY_ID) + sum(s.tools, TOOL_BY_ID)
  const skins = s.skins.reduce((a, id) => a + (SKIN_BY_ID[id] ? corn(SKIN_BY_ID[id].price, SKIN_BY_ID[id].currency) : 0), 0)
  return { roosters, gear, items, skins, total: roosters + gear + items + skins }
}

/**
 * Guarda o valor de cada dia neste aparelho (só para mostrar a variação).
 * Devolve a variação em relação ao último dia anterior a hoje que foi registrado.
 */
export function trackWorth(key: string, value: number): { prev: number; since: string } | null {
  const day = new Date().toISOString().slice(0, 10)
  try {
    const k = `gb.worth.${key}`
    const hist: Record<string, number> = JSON.parse(localStorage.getItem(k) ?? '{}')
    hist[day] = value
    const days = Object.keys(hist).sort()
    for (const d of days.slice(0, Math.max(0, days.length - 30))) delete hist[d]
    localStorage.setItem(k, JSON.stringify(hist))
    const before = days.filter((d) => d < day).pop()
    return before ? { prev: hist[before], since: before } : null
  } catch {
    return null
  }
}
