// Envio de e-mail. Com RESEND_API_KEY usa a API do Resend; sem chave, mostra no console (desenvolvimento).
// fromName: nome exibido como remetente (o endereço vem de MAIL_FROM)
import { escapeHtml } from './security'

export async function sendMail(to: string, subject: string, html: string, fromName?: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log(`\n[e-mail de teste] Para: ${to}\nAssunto: ${subject}\n${html.replace(/<[^>]+>/g, ' ')}\n`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: sender(fromName), to, subject, html }), // i18n-ok
  })
  if (!res.ok) console.error('[e-mail] falhou', res.status, await res.text())
}

function sender(name?: string) {
  const from = process.env.MAIL_FROM ?? 'Galo Brigão <nao-responda@galobrigao.com.br>' // i18n-ok
  if (!name) return from
  const addr = from.match(/<([^>]+)>/)?.[1] ?? from
  return `${name} <${addr}>`
}

// ---------- Template com a cara do jogo ----------
// Layout em tabela e estilos inline, para renderizar bem no Gmail, Outlook e apps de celular.

export interface EmailParts {
  /** Nome da marca exibido no cabeçalho (ex.: "Galo Brigão" / "Chicken Fighter"). */
  brand: string
  /** Título grande dentro do card (ex.: "Olá, Vinicius!"). */
  heading: string
  /** Parágrafo principal. */
  intro: string
  /** Botão de ação (opcional). */
  button?: { text: string; href: string }
  /** Texto curto com o link em texto, para quem o botão não abrir (opcional). */
  linkFallback?: { label: string; href: string }
  /** Observação em letra miúda ao final (ex.: validade do link). */
  note?: string
  /** Rodapé em letra miúda (ex.: "e-mail automático, não responda"). */
  footer?: string
}

/** Monta o HTML completo do e-mail, já com cabeçalho da marca, card branco e rodapé. */
export function emailShell(p: EmailParts): string {
  const ink = '#173753'
  const muted = '#5e7f98'
  const line = '#d4e6f1'
  const btn = p.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" bgcolor="#ff6d2a" style="border-radius:12px;">
        <a href="${escapeHtml(p.button.href)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;background:linear-gradient(180deg,#ff9f1c 0%,#ff6d2a 100%);">${escapeHtml(p.button.text)}</a>
      </td></tr></table>`
    : ''
  const fallback = p.linkFallback
    ? `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${muted};">${escapeHtml(p.linkFallback.label)}<br><a href="${escapeHtml(p.linkFallback.href)}" target="_blank" style="color:#d97400;word-break:break-all;">${escapeHtml(p.linkFallback.href)}</a></p>`
    : ''
  const note = p.note ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${muted};">${escapeHtml(p.note)}</p>` : ''
  const footer = p.footer ? escapeHtml(p.footer) : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#e8f5ff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8f5ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <!-- Cabeçalho da marca -->
        <tr><td align="center" style="padding:8px 0 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:34px;line-height:1;padding-right:10px;">🐓</td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:900;letter-spacing:-0.5px;color:${ink};">${escapeHtml(p.brand)}</td>
          </tr></table>
        </td></tr>
        <!-- Card -->
        <tr><td style="background:#ffffff;border:1px solid ${line};border-radius:18px;padding:32px 28px;">
          <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${ink};">${escapeHtml(p.heading)}</h1>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${ink};">${escapeHtml(p.intro)}</p>
          ${btn}
          ${fallback}
          ${note}
        </td></tr>
        <!-- Rodapé -->
        <tr><td align="center" style="padding:20px 8px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${muted};">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
