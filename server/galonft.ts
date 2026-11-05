// 🐓 Galo NFT: ficha completa do galo guardada por tokenId, metadados públicos e imagem (RoosterSvg no servidor).
import { createElement } from 'react'
// Versão "browser": não depende de node:stream (o bundle ESM do servidor não aceita require dinâmico)
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { RoosterSvg } from '../src/components/RoosterSvg'
import { BREED_BY_ID, ELECTION_ROOSTERS, FOOTBALL_ROOSTERS, SPECIAL_ROOSTERS } from '../src/game/data'
import { MAX_COOP } from '../src/game/criacao'
import { MAX_BREEDS, breedsOf } from '../src/game/galonft'
import type { GameState, Rooster } from '../src/game/types'
import { t } from '../src/i18n'
import { getDb } from './db'
import { loadSave } from './saves'

const db = () => getDb()
let ready = false
function schema() {
  if (ready) return
  db().exec(`
    CREATE TABLE IF NOT EXISTS galo_nfts (
      token_id INTEGER PRIMARY KEY,
      rooster_id TEXT NOT NULL,
      data TEXT NOT NULL,
      minted_by TEXT NOT NULL,
      minted_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      burned_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS galo_nfts_rooster ON galo_nfts(rooster_id);
  `)
  ready = true
}

/** Guarda (ou atualiza) a ficha do galo do token: raça, estrelas, base, pelagem, pais, cruzamentos… */
export function saveGaloSnapshot(tokenId: number, ro: Rooster, mintedBy?: string) {
  schema()
  const data = JSON.stringify({ ...ro, equipped: {}, skin: undefined, lucky: 0 })
  const r = db().prepare('UPDATE galo_nfts SET data = ?, updated_at = ? WHERE token_id = ?').run(data, Date.now(), tokenId)
  if (!r.changes) db().prepare('INSERT INTO galo_nfts (token_id, rooster_id, data, minted_by, minted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(tokenId, ro.id, data, mintedBy ?? '', Date.now(), Date.now())
}

export function markGaloBurned(tokenId: number) {
  schema()
  db().prepare('UPDATE galo_nfts SET burned_at = ? WHERE token_id = ?').run(Date.now(), tokenId)
}

export function galoSnapshot(tokenId: number): Rooster | null {
  schema()
  const r = db().prepare('SELECT data FROM galo_nfts WHERE token_id = ?').get(tokenId) as { data: string } | undefined
  return r ? (JSON.parse(r.data) as Rooster) : null
}

/** Galo do token: o vivo (no save do dono) ou a ficha guardada. */
export function liveGalo(tokenId: number, ownerId: string | null, roosterId: string): Rooster | null {
  const live = ownerId ? loadSave(ownerId)?.state.roosters.find((r) => r.id === roosterId && r.nft?.tokenId === String(tokenId)) : undefined
  return live ?? galoSnapshot(tokenId)
}

/** Visual público (para cartas no Mercado/Carteira). */
export const galoLook = (r: Rooster) => ({ id: r.id, name: r.name, breedId: r.breedId, level: r.level, stars: r.stars, tint: r.tint ?? null, parents: r.parents ?? null, breedCount: breedsOf(r), base: r.base })

// ---------- Mercado USDC: tirar e dar o galo ----------

const UNIQUE = new Set([...ELECTION_ROOSTERS, ...SPECIAL_ROOSTERS, ...FOOTBALL_ROOSTERS].map((e) => e.breedId))

/** O comprador pode receber esse galo? (motivo ou null) */
export function galoReceiveBlock(s: GameState, ro: Rooster): string | null {
  if (s.roosters.length >= MAX_COOP) return t('Galinheiro lotado (máx. {n}). Venda algum galo.', { n: MAX_COOP })
  if (s.roosters.some((r) => r.id === ro.id)) return t('Esse galo já está no galinheiro.')
  const b = UNIQUE.has(ro.breedId) ? BREED_BY_ID[ro.breedId] : undefined
  if (b && s.roosters.some((r) => r.breedId === b.id)) return t('Já tem um {nome} no galinheiro.', { nome: b.name })
  return null
}

/** Tira o galo do vendedor (acessórios voltam para o estoque dele; a skin fica com ele). */
export function takeGalo(s: GameState, id: string): { state: GameState; rooster: Rooster | null } {
  const ro = s.roosters.find((r) => r.id === id)
  if (!ro) return { state: s, rooster: null }
  const accs = { ...s.accessories }
  Object.values(ro.equipped).forEach((a) => a && (accs[a] = (accs[a] ?? 0) + 1))
  return { state: { ...s, accessories: accs, roosters: s.roosters.filter((r) => r.id !== id) }, rooster: { ...ro, equipped: {}, skin: undefined } }
}

export const giveGalo = (s: GameState, ro: Rooster, ownerName: string): GameState => ({ ...s, roosters: [...s.roosters, { ...ro, owner: ownerName }] })

// ---------- Metadados e imagem ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
const RAR_EN: Record<string, string> = { comum: 'Common', raro: 'Rare', epico: 'Epic', lendario: 'Legendary' }

export function galoMetadata(tokenId: number, ro: Rooster, base: string) {
  const breed = BREED_BY_ID[ro.breedId]
  const breedName = breed ? t(breed.name, undefined, 'en') : ro.breedId
  const attrs: { trait_type: string; value: string | number; max_value?: number; display_type?: string }[] = [
    { trait_type: 'Type', value: 'Rooster' },
    { trait_type: 'Breed', value: breedName },
    { trait_type: 'Rarity', value: RAR_EN[breed?.rarity ?? 'comum'] ?? 'Common' },
    { trait_type: 'Stars', value: ro.stars, max_value: 5 },
    { trait_type: 'Level', value: ro.level, display_type: 'number' },
    { trait_type: 'HP', value: ro.base.hp, display_type: 'number' },
    { trait_type: 'Attack', value: ro.base.atk, display_type: 'number' },
    { trait_type: 'Defense', value: ro.base.def, display_type: 'number' },
    { trait_type: 'Speed', value: ro.base.spd, display_type: 'number' },
    { trait_type: 'Breed count', value: breedsOf(ro), max_value: MAX_BREEDS },
    { trait_type: 'Virgin', value: breedsOf(ro) === 0 ? 'Yes' : 'No' },
    { trait_type: 'Rare coat', value: ro.tint ? 'Yes' : 'No' },
  ]
  if (ro.parents) attrs.push({ trait_type: 'Parents', value: `${ro.parents[0]} × ${ro.parents[1]}` })
  return {
    name: `${ro.name} #${tokenId}`,
    description: `${breedName} rooster from Chicken Fighter. ${ro.stars}★, level ${ro.level}, bred ${breedsOf(ro)}/${MAX_BREEDS} times.`,
    image: `${base}/api/nft/${tokenId}/image.svg`,
    external_url: base,
    attributes: attrs,
  }
}

export function galoSvg(tokenId: number, ro: Rooster) {
  const art = renderToStaticMarkup(createElement(RoosterSvg, { breedId: ro.breedId, tint: ro.tint, equipped: {}, anim: 'none', size: 300 }))
    // Encaixa o desenho no quadro (svg aninhado com posição)
    .replace(/^<svg /, '<svg x="50" y="30" ')
  const breed = BREED_BY_ID[ro.breedId]
  const sub = `${breed ? t(breed.name, undefined, 'en') : ro.breedId} · ${'★'.repeat(Math.max(0, Math.min(5, ro.stars)))} · Lv ${ro.level} · ${breedsOf(ro)}/${MAX_BREEDS}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<defs><linearGradient id="gbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2410"/><stop offset="1" stop-color="#140c06"/></linearGradient></defs>
<rect width="400" height="400" rx="28" fill="url(#gbg)"/>
<rect x="10" y="10" width="380" height="380" rx="22" fill="none" stroke="${ro.tint ? '#c070ff' : '#ffb020'}" stroke-width="4"/>
${art}
<text x="200" y="338" font-size="24" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${esc(ro.name)} #${tokenId}</text>
<text x="200" y="368" font-size="16" font-family="sans-serif" fill="#ffb020" text-anchor="middle">${esc(sub)}</text>
</svg>`
}
