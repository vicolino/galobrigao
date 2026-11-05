// Envio de e-mail. Com RESEND_API_KEY usa a API do Resend; sem chave, mostra no console (desenvolvimento).
// fromName: nome exibido como remetente (o endereço vem de MAIL_FROM)
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
