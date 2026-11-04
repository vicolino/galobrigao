import { useEffect, useRef, useState } from 'react'
import { api, type ApiOrder, type CatalogItem } from '../api'
import { brl } from '../game/catalog'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import { Modal } from './ui'

type Step = 'metodo' | 'aguardando' | 'pago' | 'erro'

/** Pagamento de qualquer produto do catálogo via Pix ou cartão. */
export function Checkout({ item, onClose, onPaid }: { item: CatalogItem | null; onClose: () => void; onPaid?: (o: ApiOrder) => void }) {
  const { actions, toast, provider } = useGame()
  const [step, setStep] = useState<Step>('metodo')
  const [order, setOrder] = useState<ApiOrder | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (item) {
      setStep('metodo')
      setOrder(null)
      setError('')
    }
    return () => {
      if (poll.current) clearInterval(poll.current)
    }
  }, [item])

  const paid = async (o: ApiOrder) => {
    if (poll.current) clearInterval(poll.current)
    setOrder(o)
    setStep('pago')
    sfx.win()
    await actions.reloadFromServer()
    await actions.refreshUser()
    onPaid?.(o)
  }

  const watch = (o: ApiOrder) => {
    if (poll.current) clearInterval(poll.current)
    poll.current = setInterval(async () => {
      try {
        const r = await api.order(o.id)
        if (r.order.status === 'pago') void paid(r.order)
        else if (r.order.status !== 'pendente') {
          if (poll.current) clearInterval(poll.current)
          setError(r.order.status === 'expirado' ? 'O Pix expirou. Gere um novo.' : 'Pagamento recusado.')
          setStep('erro')
        }
      } catch {
        /* tenta de novo */
      }
    }, 3000)
  }

  const start = async (method: 'pix' | 'cartao') => {
    if (!item) return
    setBusy(true)
    try {
      const r = await api.checkout(item.id, method)
      setOrder(r.order)
      setStep('aguardando')
      if (r.order.checkoutUrl) window.open(r.order.checkoutUrl, '_blank', 'noopener')
      watch(r.order)
    } catch (e) {
      setError((e as Error).message)
      setStep('erro')
    } finally {
      setBusy(false)
    }
  }

  const simulate = async () => {
    if (!order) return
    setBusy(true)
    try {
      const r = await api.simulate(order.id)
      await paid(r.order)
    } catch (e) {
      toast((e as Error).message, 'erro')
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (poll.current) clearInterval(poll.current)
    onClose()
  }

  return (
    <Modal open={!!item} onClose={close} title="💳 Finalizar compra">
      {item && (
        <div className="checkout">
          <div className="co-item">
            <span className="big-emoji">{item.emoji}</span>
            <div className="grow">
              <b>{item.name}</b>
              <div className="tiny muted">{item.desc}</div>
            </div>
            <b className="co-price">{brl(item.priceCents)}</b>
          </div>

          {step === 'metodo' && (
            <>
              <div className="co-methods">
                <button className="co-method" disabled={busy} onClick={() => start('pix')}>
                  <span className="big-emoji">⚡</span>
                  <b>Pix</b>
                  <span className="tiny muted">Aprovação na hora</span>
                </button>
                <button className="co-method" disabled={busy} onClick={() => start('cartao')}>
                  <span className="big-emoji">💳</span>
                  <b>Cartão de crédito</b>
                  <span className="tiny muted">{provider === 'mercadopago' ? 'Pagamento seguro no Mercado Pago' : 'Visa, Master, Elo'}</span>
                </button>
              </div>
              <p className="tiny muted center">Itens digitais entregues na hora após a confirmação. Sem saque: moedas do jogo não viram dinheiro.</p>
            </>
          )}

          {step === 'aguardando' && order && (
            <>
              {order.method === 'pix' ? (
                <div className="pix">
                  {order.pixQr ? (
                    <img className="qr-img" src={`data:image/png;base64,${order.pixQr}`} alt="QR Code Pix" />
                  ) : (
                    <FakeQr seed={order.id} />
                  )}
                  <p className="tiny muted">Abra o app do seu banco, escolha Pix e leia o QR Code — ou use o copia e cola:</p>
                  <div className="copy-row">
                    <input readOnly value={order.pixCode ?? ''} onFocus={(e) => e.currentTarget.select()} />
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        void navigator.clipboard?.writeText(order.pixCode ?? '')
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                      }}
                    >
                      {copied ? '✅ Copiado' : '📋 Copiar'}
                    </button>
                  </div>
                  <p className="tiny muted">O código vale por 30 minutos.</p>
                </div>
              ) : (
                <div className="center">
                  {order.checkoutUrl ? (
                    <>
                      <p>Abrimos o pagamento do Mercado Pago em outra aba.</p>
                      <a className="btn btn-primary" href={order.checkoutUrl} target="_blank" rel="noopener noreferrer">
                        Abrir pagamento de novo
                      </a>
                    </>
                  ) : (
                    <p className="muted">No modo de teste não há tela de cartão. Use o botão abaixo para simular a aprovação.</p>
                  )}
                </div>
              )}
              <div className="waiting">
                <span className="spinner" /> Aguardando confirmação do pagamento...
              </div>
              {order.provider === 'sandbox' && (
                <div className="sandbox">
                  <span className="tiny">🧪 Modo de teste — nenhuma cobrança real</span>
                  <button className="btn btn-gold full" disabled={busy} onClick={simulate}>
                    ✅ Simular pagamento aprovado
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'pago' && (
            <div className="center">
              <div className="prize-emoji">🎉</div>
              <h2>Pagamento aprovado!</h2>
              <p className="muted">{item.name} já está na sua conta.</p>
              <button className="btn btn-primary btn-lg" onClick={close}>
                Bora jogar
              </button>
            </div>
          )}

          {step === 'erro' && (
            <div className="center">
              <p className="neg">{error}</p>
              <button className="btn" onClick={() => setStep('metodo')}>
                Tentar de novo
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function FakeQr({ seed }: { seed: string }) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const cells = Array.from({ length: 21 * 21 }).map((_, i) => {
    const x = i % 21
    const y = Math.floor(i / 21)
    const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
    if (finder) {
      const fx = x > 13 ? x - 14 : x
      const fy = y > 13 ? y - 14 : y
      return fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4)
    }
    h = (h * 1103515245 + 12345) >>> 0
    return (h >> 16) % 2 === 0
  })
  return (
    <div className="qr21" title="QR ilustrativo (modo de teste)">
      {cells.map((on, i) => (
        <span key={i} className={on ? 'on' : ''} />
      ))}
    </div>
  )
}
