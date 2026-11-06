// Redes sociais e origem dos cadastros. Troque aqui o @ das redes e o endereço do site.
export const IG_HANDLE = '@galobrigao.jogo' // i18n-ok perfil do jogo no Instagram
export const TIKTOK_HANDLE = '@galobrigao.jogo' // i18n-ok perfil do jogo no TikTok

/** Endereço do site (sem barra no fim). Por padrão, o próprio domínio onde o jogo está aberto. */
export const SITE_URL = typeof location !== 'undefined' ? location.origin : 'https://www.galobrigao.com.br' // i18n-ok

/** Link com UTM para quem vem pelo Story compartilhado. */
export const SHARE_URL = `${SITE_URL}/?utm_source=instagram&utm_medium=story&utm_campaign=share`

/** Endereço curto para imprimir na imagem (sem https://). */
export const SITE_LABEL = SITE_URL.replace(/^https?:\/\//, '')

// ---------- Origem (UTM, primeiro acesso) ----------

const KEY = 'gb.utm'
export type Utm = Partial<Record<'source' | 'medium' | 'campaign' | 'ref', string>>

const clean = (v: string | null) => (v ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)

/** Guarda a origem do primeiro acesso (utm_* e ref da URL, antes do #). Não sobrescreve. */
export function captureUtm() {
  if (typeof location === 'undefined') return
  try {
    if (localStorage.getItem(KEY)) return
    const q = new URLSearchParams(location.search)
    const u: Utm = {}
    for (const k of ['source', 'medium', 'campaign'] as const) {
      const v = clean(q.get(`utm_${k}`))
      if (v) u[k] = v
    }
    const ref = clean(q.get('ref'))
    if (ref) u.ref = ref
    if (Object.keys(u).length) localStorage.setItem(KEY, JSON.stringify(u))
  } catch {
    /* sem storage */
  }
}

/** Origem guardada, para mandar junto com o cadastro. */
export function storedUtm(): Utm | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    const u = raw ? (JSON.parse(raw) as Utm) : null
    return u && typeof u === 'object' ? u : undefined
  } catch {
    return undefined
  }
}
