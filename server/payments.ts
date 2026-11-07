// Provedores de pagamento.
// - "sandbox": modo de teste local, sem cobrança. Libera o botão "simular pagamento".
// - "mercadopago": Pix (QR + copia e cola) e cartão (Checkout Pro, o cartão é digitado no site do Mercado Pago).
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { OrderRow, UserRow } from './db'
import type { Sku } from '../src/game/catalog'

export interface PaymentStart {
  providerRef: string | null
  pixCode?: string
  pixQr?: string // imagem PNG em base64
  checkoutUrl?: string
}

export type RemoteStatus = 'pendente' | 'pago' | 'recusado' | 'expirado'

export function providerName(): 'sandbox' | 'mercadopago' {
  return process.env.MP_ACCESS_TOKEN && process.env.PAYMENT_PROVIDER !== 'sandbox' ? 'mercadopago' : 'sandbox'
}

const MP = 'https://api.mercadopago.com'
const token = () => process.env.MP_ACCESS_TOKEN!
const publicUrl = () => (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')

async function mp(path: string, init: RequestInit & { idem?: string } = {}) {
  const res = await fetch(MP + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(init.idem ? { 'X-Idempotency-Key': init.idem } : {}),
    },
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${JSON.stringify(body).slice(0, 300)}`)
  return body
}

export async function startPayment(order: OrderRow, sku: Sku, user: UserRow): Promise<PaymentStart> {
  if (providerName() === 'sandbox') {
    // Código no formato "copia e cola" apenas ilustrativo.
    return { providerRef: `sandbox-${order.id}`, pixCode: `00020126580014BR.GOV.BCB.PIX0136SANDBOX-${order.id}5204000053039865406${(order.amount_cents / 100).toFixed(2)}5802BR5911GALO BRIGAO6009SAO PAULO62070503***6304TEST` }
  }

  const amount = order.amount_cents / 100
  const notification_url = `${publicUrl()}/api/webhooks/mercadopago`
  if (order.method === 'pix') {
    const p = await mp('/v1/payments', {
      method: 'POST',
      idem: order.id,
      body: JSON.stringify({
        transaction_amount: amount,
        description: `Galo Brigão - ${sku.name}`, // i18n-ok
        payment_method_id: 'pix',
        external_reference: order.id,
        notification_url,
        date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
        payer: { email: user.email },
      }),
    })
    const tx = (p.point_of_interaction as { transaction_data?: { qr_code?: string; qr_code_base64?: string } })?.transaction_data ?? {}
    return { providerRef: String(p.id), pixCode: tx.qr_code, pixQr: tx.qr_code_base64 }
  }

  // Cartão: Checkout Pro. Nenhum dado de cartão passa pelo nosso servidor.
  const pref = await mp('/checkout/preferences', {
    method: 'POST',
    idem: order.id,
    body: JSON.stringify({
      items: [{ id: sku.id, title: `Galo Brigão - ${sku.name}`, quantity: 1, unit_price: amount, currency_id: 'BRL' }], // i18n-ok
      external_reference: order.id,
      notification_url,
      payer: { email: user.email },
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 1 },
      back_urls: { success: `${publicUrl()}/#/loja/ovos`, failure: `${publicUrl()}/#/loja/ovos`, pending: `${publicUrl()}/#/loja/ovos` }, // i18n-ok
      auto_return: 'approved',
    }),
  })
  return { providerRef: String(pref.id), checkoutUrl: String(pref.init_point) }
}

function mapStatus(s: string): RemoteStatus {
  if (s === 'approved') return 'pago'
  if (s === 'rejected' || s === 'cancelled' || s === 'refunded' || s === 'charged_back') return 'recusado'
  return 'pendente'
}

/** Consulta o status no provedor (usado no polling e no webhook). */
export async function fetchRemoteStatus(order: OrderRow): Promise<{ status: RemoteStatus; amountCents?: number }> {
  if (providerName() === 'sandbox' || order.provider === 'sandbox') return { status: order.status === 'pago' ? 'pago' : 'pendente' }
  if (order.method === 'pix' && order.provider_ref) {
    const p = await mp(`/v1/payments/${order.provider_ref}`)
    return { status: mapStatus(String(p.status)), amountCents: Math.round(Number(p.transaction_amount) * 100) }
  }
  const found = await mp(`/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc`)
  const results = (found.results as { status: string; transaction_amount: number }[]) ?? []
  const approved = results.find((r) => r.status === 'approved')
  if (approved) return { status: 'pago', amountCents: Math.round(approved.transaction_amount * 100) }
  return { status: results[0] ? mapStatus(results[0].status) : 'pendente' }
}

/**
 * Webhook do Mercado Pago. Só trata notificações de pagamento (ignora merchant_order e afins).
 * A assinatura é validada quando vem (webhook assinado); se faltar (IPN/legado) ou não bater, a
 * notificação NÃO é descartada: o status real é sempre reconsultado em /v1/payments com o nosso
 * Access Token (fonte da verdade), então um payload forjado não consegue creditar nada — o crédito
 * depende de o MP confirmar o pagamento daquela ordem. Isso garante confirmação mesmo sem webhook assinado.
 */
export async function parseMpWebhook(headers: Record<string, string | string[] | undefined>, url: URL, body: Record<string, unknown>) {
  const q = url.searchParams
  const topic = String(body.type ?? body.topic ?? q.get('type') ?? q.get('topic') ?? '').toLowerCase()
  if (topic && topic !== 'payment') return null // merchant_order etc.: o pagamento vem em notificação própria
  const dataId = String((body.data as { id?: string })?.id ?? q.get('data.id') ?? q.get('id') ?? '')
  if (!dataId) return null

  const secret = process.env.MP_WEBHOOK_SECRET
  const sig = String(headers['x-signature'] ?? '')
  if (secret && sig) {
    const reqId = String(headers['x-request-id'] ?? '')
    const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=') as [string, string]))
    const manifest = `id:${dataId.toLowerCase()};request-id:${reqId};ts:${parts.ts};`
    const expected = createHmac('sha256', secret).update(manifest).digest('hex')
    const got = Buffer.from(String(parts.v1 ?? ''), 'utf8')
    const exp = Buffer.from(expected, 'utf8')
    if (got.length === exp.length && timingSafeEqual(got, exp)) {
      // Assinada e válida: rejeita replay (ts em segundos ou ms)
      const ts = Number(parts.ts)
      const tsMs = ts < 1e12 ? ts * 1000 : ts
      if (ts && Math.abs(Date.now() - tsMs) > 10 * 60_000) throw new Error('notificação expirada') // i18n-ok
    } else {
      console.warn(`[webhook] assinatura não confere (id=${dataId}) — confirmando pela API do MP`) // i18n-ok
    }
  } else if (!sig) {
    console.warn(`[webhook] notificação sem assinatura (IPN/legado, id=${dataId}) — confirmando pela API do MP`) // i18n-ok
  }

  const p = await mp(`/v1/payments/${dataId}`)
  return {
    orderId: String(p.external_reference ?? ''),
    status: mapStatus(String(p.status)),
    amountCents: Math.round(Number(p.transaction_amount) * 100),
    paymentId: String(p.id),
  }
}
