// Operações que gastam moeda na loja. Rodam SOMENTE no servidor (fonte da verdade),
// para que ninguém consiga criar ovos, skins ou itens premium editando o save.
import { ACCESSORIES, ACC_BY_ID, BOXES, BREED_BY_ID, CORN_PACKS, ELECTION_ROOSTERS, FOOTBALL_ROOSTERS, SPECIAL_ROOSTERS, ITEM_BY_ID, RARITY, SKIN_BY_ID, SKIN_BUNDLES, TOOL_BY_ID, TOOL_KITS } from './data'
import { genMarket, skinPrice } from './engine'
import { addXp, currentEnergy, feedInstantCost, makeRooster, pick, uid, withEnergy, xpToNext } from './rooster'
import { t } from '../i18n'
import type { Accessory, Currency, GameState, MissionKind, Rarity, Rooster } from './types'

export const FEED_COOLDOWN = 4 * 3600_000
export const STAR_COST = [0, 40, 80, 150, 250] // ovos para subir de N para N+1 estrelas
export const MARKET_REFRESH_COST = 5
export const MARKET_TTL = 30 * 60_000

export type ShopOp =
  | { op: 'buyAccessory'; id: string }
  | { op: 'buyItem'; id: string; qty?: number }
  | { op: 'buyTool'; id: string; qty?: number }
  | { op: 'buyKit'; id: string }
  | { op: 'openBox'; id: string }
  | { op: 'buySkin'; id: string }
  | { op: 'buySkinBundle'; id: string }
  | { op: 'buyElection'; breedId: string }
  | { op: 'refreshMarket' }
  | { op: 'exchange'; id: string }
  | { op: 'upgradeStars'; roosterId: string }
  | { op: 'feedInstant'; roosterId: string }

export class ShopError extends Error {}

const fail = (msg: string): never => {
  throw new ShopError(msg)
}

const log = (s: GameState, text: string, milho: number, ovo: number): GameState => ({
  ...s,
  history: [{ id: uid(), at: Date.now(), text, milho, ovo }, ...s.history].slice(0, 80),
})

const bump = (s: GameState, kind: MissionKind, n = 1): GameState => ({
  ...s,
  missions: { ...s.missions, list: s.missions.list.map((m) => (m.kind === kind && !m.claimed ? { ...m, progress: Math.min(m.goal, m.progress + n) } : m)) },
})

const pay = (s: GameState, price: number, c: Currency): GameState => {
  if (!Number.isFinite(price) || price < 0) fail(t('Preço inválido'))
  if (c === 'milho') return s.milho >= price ? { ...s, milho: s.milho - price } : fail(t('Milho insuficiente 🌽'))
  return s.ovos >= price ? { ...s, ovos: s.ovos - price } : fail(t('Ovos de ouro insuficientes 🥚'))
}

const spent = (c: Currency, v: number): [number, number] => (c === 'milho' ? [-v, 0] : [0, -v])
const purchase = (s: GameState): GameState => bump({ ...s, stats: { ...s.stats, purchases: s.stats.purchases + 1 } }, 'comprar')
const qtyOk = (q: unknown) => (Number.isInteger(q) && (q as number) >= 1 && (q as number) <= 20 ? (q as number) : fail(t('Quantidade inválida')))
const findRooster = (s: GameState, id: string) => s.roosters.find((r) => r.id === id) ?? fail(t('Galo não encontrado'))

/** Crédito de NFT: item lendário obtido com ovos ou dinheiro pode virar NFT (milho nunca). */
export function addMintable(s: GameState, key: string, n = 1): GameState {
  return { ...s, mintable: { ...s.mintable, [key]: (s.mintable?.[key] ?? 0) + n } }
}
const legendaryOvo = (s: GameState, key: string, rarity: Rarity, c: Currency) => (rarity === 'lendario' && c === 'ovo' ? addMintable(s, key) : s)

export function runShop(s: GameState, o: ShopOp): { state: GameState; value?: unknown } {
  switch (o.op) {
    case 'buyAccessory': {
      const acc = ACC_BY_ID[o.id] ?? fail(t('Acessório não existe'))
      let n = pay(s, acc.price, acc.currency)
      n = { ...n, accessories: { ...n.accessories, [o.id]: (n.accessories[o.id] ?? 0) + 1 } }
      n = legendaryOvo(n, `acc:${o.id}`, acc.rarity, acc.currency)
      return { state: log(purchase(n), t('Comprou {nome}', { nome: acc.name }), ...spent(acc.currency, acc.price)) }
    }
    case 'buyItem': {
      const it = ITEM_BY_ID[o.id] ?? fail(t('Item não existe'))
      const q = qtyOk(o.qty ?? 1)
      let n = pay(s, it.price * q, it.currency)
      n = { ...n, items: { ...n.items, [o.id]: (n.items[o.id] ?? 0) + q } }
      return { state: log(purchase(n), t('Comprou {q}x {nome}', { q, nome: it.name }), ...spent(it.currency, it.price * q)) }
    }
    case 'buyTool': {
      const tool = TOOL_BY_ID[o.id] ?? fail(t('Ferramenta não existe'))
      const q = qtyOk(o.qty ?? 1)
      let n = pay(s, tool.price * q, tool.currency)
      n = { ...n, tools: { ...n.tools, [o.id]: (n.tools[o.id] ?? 0) + q } }
      return { state: log(purchase(n), t('{q}x {nome}', { q, nome: tool.name }), ...spent(tool.currency, tool.price * q)) }
    }
    case 'buyKit': {
      const k = TOOL_KITS.find((x) => x.id === o.id) ?? fail(t('Kit não existe'))
      let n = pay(s, k.price, k.currency)
      const tools = { ...n.tools }
      for (const [id, q] of Object.entries(k.tools)) tools[id] = (tools[id] ?? 0) + q
      n = { ...n, tools }
      return { state: log(purchase(n), k.name, ...spent(k.currency, k.price)) }
    }
    case 'openBox': {
      const box = BOXES.find((b) => b.id === o.id) ?? fail(t('Caixa não existe'))
      let n = pay(s, box.price, box.currency)
      const roll = Math.random() * 100
      let acc = 0
      let rarity: Rarity = 'comum'
      for (const [r, p] of Object.entries(box.odds) as [Rarity, number][]) {
        acc += p
        if (roll < acc) {
          rarity = r
          break
        }
      }
      const prize: Accessory = pick(ACCESSORIES.filter((a) => a.rarity === rarity))
      n = { ...n, accessories: { ...n.accessories, [prize.id]: (n.accessories[prize.id] ?? 0) + 1 } }
      n = { ...n, stats: { ...n.stats, boxesOpened: n.stats.boxesOpened + 1 } }
      n = legendaryOvo(n, `acc:${prize.id}`, prize.rarity, box.currency)
      n = log(purchase(n), t('{caixa}: {premio} ({raridade})', { caixa: box.name, premio: prize.name, raridade: RARITY[rarity].label }), ...spent(box.currency, box.price))
      return { state: n, value: prize }
    }
    case 'buySkin': {
      const sk = SKIN_BY_ID[o.id] ?? fail(t('Skin não existe'))
      if (s.skins.includes(o.id)) fail(t('Você já tem essa skin.'))
      const price = skinPrice(o.id)
      let n = pay(s, price, sk.currency)
      n = { ...n, skins: [...n.skins, o.id] }
      n = legendaryOvo(n, `skin:${o.id}`, sk.rarity, sk.currency)
      return { state: log(purchase(n), t('Skin: {nome}', { nome: sk.name }), ...spent(sk.currency, price)) }
    }
    case 'buySkinBundle': {
      const b = SKIN_BUNDLES.find((x) => x.id === o.id) ?? fail(t('Pacote não existe'))
      const missing = b.skins.filter((k) => !s.skins.includes(k))
      if (!missing.length) fail(t('Você já tem todas as skins desse pacote.'))
      let n = pay(s, b.price, 'ovo')
      n = { ...n, skins: [...n.skins, ...missing] }
      for (const k of missing) n = legendaryOvo(n, `skin:${k}`, SKIN_BY_ID[k]?.rarity ?? 'comum', 'ovo')
      return { state: log(purchase(n), b.name, 0, -b.price) }
    }
    case 'buyElection': {
      const e = [...ELECTION_ROOSTERS, ...SPECIAL_ROOSTERS, ...FOOTBALL_ROOSTERS].find((x) => x.breedId === o.breedId) ?? fail(t('Galo não existe'))
      const breed = BREED_BY_ID[o.breedId]
      if (s.roosters.some((r) => r.breedId === o.breedId)) fail(t('Você já tem o {nome}.', { nome: e.name }))
      if (s.roosters.length >= 12) fail(t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: 12 }))
      let n = pay(s, breed.price, 'ovo')
      const ro: Rooster = { ...makeRooster({ breedId: o.breedId, name: e.name, stars: 3, owner: s.player.name }), base: { ...breed.base }, style: 'equilibrado' }
      n = { ...n, roosters: [...n.roosters, ro] }
      return { state: log(purchase(n), t('Edição Especial: {nome}', { nome: e.name }), 0, -breed.price) }
    }
    case 'refreshMarket': {
      // Grátis quando o mercado já venceu (30 min); antes disso custa ovos.
      const expired = Date.now() - s.market.at > MARKET_TTL
      const n = expired ? s : pay(s, MARKET_REFRESH_COST, 'ovo')
      return { state: { ...n, market: { at: Date.now(), roosters: genMarket() } } }
    }
    case 'exchange': {
      const p = CORN_PACKS.find((x) => x.id === o.id) ?? fail(t('Troca não existe'))
      let n = pay(s, p.ovos, 'ovo')
      n = { ...n, milho: n.milho + p.milho }
      return { state: log(n, t('Troca: {ovos} ovos → {milho} milho', { ovos: p.ovos, milho: p.milho }), p.milho, -p.ovos) }
    }
    case 'upgradeStars': {
      const ro = findRooster(s, o.roosterId)
      if (ro.stars >= 5) fail(t('Já está no potencial máximo.'))
      const cost = STAR_COST[ro.stars]
      let n = pay(s, cost, 'ovo')
      const up = (v: number) => Math.round(v * 1.06)
      n = { ...n, roosters: n.roosters.map((r) => (r.id === ro.id ? { ...r, stars: r.stars + 1, base: { hp: up(r.base.hp), atk: up(r.base.atk), def: up(r.base.def), spd: up(r.base.spd) } } : r)) }
      return { state: log(n, t('{nome} evoluiu para {n} estrelas', { nome: ro.name, n: ro.stars + 1 }), 0, -cost) }
    }
    case 'feedInstant': {
      const ro = findRooster(s, o.roosterId)
      let n = pay(s, feedInstantCost(ro.level), 'ovo')
      const xp = 30 + ro.level * 6
      const { levels } = addXp(ro, xp)
      n = { ...n, roosters: n.roosters.map((r) => (r.id === ro.id ? { ...withEnergy(addXp(r, xp).rooster, currentEnergy(r) + 15), fedAt: Date.now() } : r)) }
      return { state: n, value: levels ? t('🎉 {nome} comeu e subiu para o nível {n}!', { nome: ro.name, n: ro.level + levels }) : t('{nome} comeu! +{xp} XP e +{e} de energia 🌽', { nome: ro.name, xp, e: 15 }) }
    }
  }
  return fail(t('Operação desconhecida'))
}

// ---------------- Validação do save enviado pelo navegador ----------------

const OVO_ACC = new Set(ACCESSORIES.filter((a) => a.currency === 'ovo').map((a) => a.id))
const OVO_TOOLS = new Set(Object.values(TOOL_BY_ID).filter((t) => t.currency === 'ovo').map((t) => t.id))
const OVO_ITEMS = new Set(Object.values(ITEM_BY_ID).filter((t) => t.currency === 'ovo').map((t) => t.id))

function accCount(s: GameState, id: string) {
  return (s.accessories[id] ?? 0) + s.roosters.filter((r) => Object.values(r.equipped).includes(id)).length
}

/**
 * Compara o save novo (do navegador) com o atual (do servidor).
 * Devolve uma mensagem se algo premium apareceu sem passar pela loja do servidor.
 */
export function premiumViolation(cur: GameState, next: GameState): string | null {
  // Skins só entram pela loja do servidor
  if (next.skins.some((k) => !cur.skins.includes(k))) return 'skin' // i18n-ok (só log do servidor)
  if (next.roosters.some((r) => r.skin && !next.skins.includes(r.skin))) return 'skin aplicada' // i18n-ok (só log do servidor)
  // Acessórios, ferramentas e itens pagos em ovos não podem aumentar
  for (const id of OVO_ACC) if (accCount(next, id) > accCount(cur, id)) return `acessório ${id}` // i18n-ok (só log do servidor)
  for (const id of OVO_TOOLS) if ((next.tools[id] ?? 0) > (cur.tools[id] ?? 0)) return `ferramenta ${id}` // i18n-ok (só log do servidor)
  for (const id of OVO_ITEMS) if ((next.items[id] ?? 0) > (cur.items[id] ?? 0)) return `item ${id}` // i18n-ok (só log do servidor)
  // Mercado: só o servidor gera; o navegador só pode remover galos (comprados)
  if (next.market.at !== cur.market.at) return 'mercado' // i18n-ok (só log do servidor)
  const curMarket = new Map(cur.market.roosters.map((m) => [m.id, m]))
  if (next.market.roosters.some((m) => JSON.stringify(m) !== JSON.stringify(curMarket.get(m.id)))) return 'mercado' // i18n-ok (só log do servidor)
  // Galos: estrelas e atributos-base não mudam; galo novo só se veio do mercado do servidor
  const same = (a: Rooster, b: Rooster) => a.breedId === b.breedId && a.stars === b.stars && JSON.stringify(a.base) === JSON.stringify(b.base)
  const before = new Map(cur.roosters.map((r) => [r.id, r]))
  for (const r of next.roosters) {
    const old = before.get(r.id)
    if (!old) {
      const m = curMarket.get(r.id)
      if (!m || !same(m, r) || r.level !== m.level) return 'galo novo' // i18n-ok (só log do servidor)
      continue
    }
    if (!same(old, r)) return 'estrelas' // i18n-ok (só log do servidor)
    // Comida comum só a cada 4h
    if (r.fedAt && r.fedAt !== old.fedAt && old.fedAt && r.fedAt - old.fedAt < FEED_COOLDOWN - 60_000) return 'comida' // i18n-ok (só log do servidor)
  }
  return null
}

/**
 * Limites de bom senso para o que o navegador ainda calcula (lutas da Arena, apostas, liga).
 * Impede saltos impossíveis como nível 50 de uma vez.
 */
export function softViolation(cur: GameState, next: GameState): string | null {
  const before = new Map(cur.roosters.map((r) => [r.id, r]))
  for (const r of next.roosters) {
    if (!Number.isInteger(r.level) || r.level < 1 || r.level > 50) return 'nível' // i18n-ok (só log do servidor)
    if (!Number.isFinite(r.xp) || r.xp < 0 || r.xp > xpToNext(r.level)) return 'xp' // i18n-ok (só log do servidor)
    const old = before.get(r.id)
    if (old && r.level - old.level > 3) return 'salto de nível' // i18n-ok (só log do servidor)
    if (r.energy < 0 || r.energy > 100) return 'energia' // i18n-ok (só log do servidor)
  }
  if (next.league.points - cur.league.points > 200) return 'pontos de liga' // i18n-ok (só log do servidor)
  if (!Number.isFinite(next.milho) || next.milho < 0) return 'milho' // i18n-ok (só log do servidor)
  return null
}
