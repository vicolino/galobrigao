// Tradução do jogo. O texto-fonte é o português: t('Galinheiro') devolve 'Coop' em inglês.
// Parâmetros usam chaves: t('Olá, {nome}!', { nome }). Nunca use ${} dentro da chave.
// No servidor o idioma é sempre 'pt' (textos salvos ficam em português e são traduzidos na tela com tx()).
import type { ReactNode } from 'react'
import { EN } from './en'

export type Lang = 'en' | 'pt'
export const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'pt', label: 'Português', flag: '🇧🇷' },
]
const KEY = 'gb.lang'
const DICTS: Record<Lang, Record<string, string> | null> = { pt: null, en: EN }

function detect(): Lang {
  if (typeof window === 'undefined') return 'pt'
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'en' || s === 'pt') return s
  } catch {
    /* sem storage */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  return langs.some((l) => /^pt\b/i.test(l ?? '')) ? 'pt' : 'en'
}

let current: Lang = detect()
if (typeof document !== 'undefined') document.documentElement.lang = current === 'pt' ? 'pt-BR' : 'en'

export const lang = () => current
/** Locale para Intl/toLocaleString. */
export const locale = (l: Lang = current) => (l === 'pt' ? 'pt-BR' : 'en-US')

/** Troca o idioma e recarrega a página (os textos de dados são montados na carga). */
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* sem storage */
  }
  if (l !== current) window.location.reload()
}

type Params = Record<string, string | number>
const warned = new Set<string>()
const isDev = (() => {
  try {
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  } catch {
    return false
  }
})()

function interp(s: string, p?: Params) {
  if (!p) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m))
}

function lookup(key: string, l: Lang): string {
  const d = DICTS[l]
  if (!d) return key
  const v = d[key]
  if (v !== undefined) return v
  if (isDev && typeof window !== 'undefined' && !warned.has(key) && /\p{L}/u.test(key)) {
    warned.add(key)
    console.warn('[i18n] sem tradução:', JSON.stringify(key))
  }
  return key
}

/** Executa fn (síncrona) com outro idioma — usado no servidor para criar o jogo no idioma do jogador. */
export function withLang<T>(l: Lang, fn: () => T): T {
  const prev = current
  current = l
  try {
    return fn()
  } finally {
    current = prev
  }
}

/** Traduz um texto fixo (a chave é o texto em português). */
export function t(key: string, params?: Params, l: Lang = current): string {
  return interp(lookup(key, l), params)
}

/** Singular/plural: tp('{n} galo', '{n} galos', n). */
export function tp(one: string, other: string, n: number, params?: Params, l: Lang = current): string {
  return t(n === 1 ? one : other, { n, ...params }, l)
}

/** Igual a t(), mas aceita elementos React como parâmetros: tn('Você tem {x} milho', { x: <b>10</b> }). */
export function tn(key: string, params: Record<string, ReactNode>, l: Lang = current): ReactNode[] {
  const s = lookup(key, l)
  const out: ReactNode[] = []
  let last = 0
  for (const m of s.matchAll(/\{(\w+)\}/g)) {
    out.push(s.slice(last, m.index))
    out.push(m[1] in params ? params[m[1]] : m[0])
    last = m.index! + m[0].length
  }
  out.push(s.slice(last))
  return out
}

// ---------- tx(): traduz textos que chegam prontos (servidor, histórico salvo) ----------
type Pattern = { re: RegExp; names: string[]; key: string; weight: number }
const patterns: Partial<Record<Lang, Pattern[]>> = {}
const txCache = new Map<string, string>()

function compile(l: Lang): Pattern[] {
  const d = DICTS[l]
  if (!d) return []
  const list: Pattern[] = []
  for (const key of Object.keys(d)) {
    if (!/\{\w+\}/.test(key)) continue
    const names: string[] = []
    let src = ''
    let last = 0
    for (const m of key.matchAll(/\{(\w+)\}/g)) {
      src += key.slice(last, m.index).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
      src += '([\\s\\S]+?)'
      names.push(m[1])
      last = m.index! + m[0].length
    }
    src += key.slice(last).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
    list.push({ re: new RegExp(`^${src}$`, 'u'), names, key, weight: key.replace(/\{\w+\}/g, '').length })
  }
  return list.sort((a, b) => b.weight - a.weight)
}

// Número no formato brasileiro (1.234 ou 1.234,5) vira o formato do idioma
function reformat(v: string, l: Lang): string {
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(v) || (!v.includes('.') && !v.includes(','))) return v
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n.toLocaleString(locale(l)) : v
}

/** Traduz um texto dinâmico (mensagem do servidor, item de histórico). Sem tradução, devolve igual. */
export function tx(text: string | null | undefined, l: Lang = current): string {
  if (!text) return text ?? ''
  if (l === 'pt') return text
  const ck = l + '\u0000' + text
  const hit = txCache.get(ck)
  if (hit !== undefined) return hit
  const d = DICTS[l]!
  let out = d[text]
  if (out === undefined) {
    out = text
    const ps = (patterns[l] ??= compile(l))
    for (const p of ps) {
      const m = p.re.exec(text)
      if (!m) continue
      const params: Params = {}
      p.names.forEach((n, i) => (params[n] = reformat(tx(m[i + 1], l), l)))
      out = interp(d[p.key], params)
      break
    }
  }
  if (txCache.size > 2000) txCache.clear()
  txCache.set(ck, out)
  return out
}
