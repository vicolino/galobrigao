// Proteções gerais do servidor: IP real, limite de requisições, cabeçalhos e origem.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { t } from '../src/i18n'

export const isProd = () => process.env.NODE_ENV === 'production'

/** IP do cliente. Atrás do Caddy (TRUST_PROXY=1) usa o X-Forwarded-For. */
export function clientIp(req: IncomingMessage) {
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
    if (xff) return xff
  }
  return req.socket.remoteAddress ?? '?'
}

// Janela deslizante simples em memória (um único processo).
const buckets = new Map<string, number[]>()
setInterval(() => {
  const now = Date.now()
  for (const [k, hits] of buckets) if (!hits.length || now - hits[hits.length - 1] > 3600_000) buckets.delete(k)
}, 600_000).unref()

/** true = passou do limite. */
export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  hits.push(now)
  buckets.set(key, hits)
  return hits.length > max
}

/** Cabeçalhos de segurança comuns a todas as respostas. */
export function baseHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  }
  if (isProd()) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  return h
}

/** Política de conteúdo da página do jogo. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

/** Bloqueia requisições que alteram dados vindas de outro site (defesa extra além do cookie SameSite). */
export function badOrigin(req: IncomingMessage) {
  if (!isProd()) return false
  const m = req.method ?? 'GET'
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false
  if ((req.url ?? '').startsWith('/api/webhooks/')) return false
  const allowed = new URL(process.env.PUBLIC_URL ?? 'http://localhost').origin
  const origin = req.headers.origin
  if (origin) return origin !== allowed
  const ref = req.headers.referer
  return !!ref && !String(ref).startsWith(allowed + '/')
}

export function tooMany(res: ServerResponse) {
  res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60', ...baseHeaders() })
  res.end(JSON.stringify({ error: t('Muitas requisições. Espere um pouco e tente de novo.') }))
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
