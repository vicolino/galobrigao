import { useEffect, useRef, useState } from 'react'
import { api, type ApiOrder, type CatalogItem, type DepositInfo } from '../api'
import { usdc } from '../game/catalog'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import { Modal } from './ui'
import { t, tn, tx } from '../i18n'

type Step = 'metodo' | 'aguardando' | 'pago' | 'erro'

/** Pagamento de qualquer produto do catálogo em USDC, direto da carteira cripto (Pix e cartão desativados). */
export function Checkout({ item, onClose, onPaid }: { item: CatalogItem | null; onClose: () => void; onPaid?: (o: ApiOrder) => void }) {
  const { actions, user, pubConfig } = useGame()
  const mvp = !!pubConfig?.mvp.on
  const web3 = !!pubConfig?.web3
  const credit = user?.mvpCreditCents ?? 0
  const [step, setStep] = useState<Step>('metodo')
  const [order, setOrder] = useState<ApiOrder | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [wallet, setWallet] = useState<DepositInfo | null>(null)
  const [walletErr, setWalletErr] = useState(false)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadWallet = () => {
    if (!web3) return
    setWalletErr(false)
    api
      .deposit()
      .then(setWallet)
      .catch(() => setWalletErr(true))
  }

  useEffect(() => {
    if (item) {
      setStep('metodo')
      setOrder(null)
      setError('')
      loadWallet()
    }
    return () => {
      if (poll.current) clearInterval(poll.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, web3])

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
          setError(t('A rede recusou a transferência. Nenhum USDC saiu e nada foi cobrado.'))
          setStep('erro')
        }
      } catch {
        /* tenta de novo */
      }
    }, 4000)
  }

  const payWithCredit = async () => {
    if (!item) return
    setBusy(true)
    try {
      const r = await api.checkout(item.id, 'credito')
      await paid(r.order)
    } catch (e) {
      setError((e as Error).message)
      setStep('erro')
    } finally {
      setBusy(false)
    }
  }

  const payWithUsdc = async () => {
    if (!item) return
    setBusy(true)
    try {
      const r = await api.checkout(item.id, 'usdc')
      if (r.order.status === 'pago') await paid(r.order)
      else {
        // Assinada e enviada, esperando a rede confirmar
        setOrder(r.order)
        setStep('aguardando')
        watch(r.order)
      }
    } catch (e) {
      setError((e as Error).message)
      setStep('erro')
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (poll.current) clearInterval(poll.current)
    onClose()
  }

  const priceUsdc = item ? item.priceCents / 100 : 0
  const balance = wallet?.balance ?? null
  const enough = balance != null && balance + 1e-9 >= priceUsdc
  const goWallet = () => {
    close()
    window.location.hash = '#/carteira'
  }

  return (
    <Modal open={!!item} onClose={close} title={'💵 ' + t('Finalizar compra')}>
      {item && (
        <div className="checkout">
          <div className="co-item">
            <span className="big-emoji">{item.emoji}</span>
            <div className="grow">
              <b>{tx(item.name)}</b>
              <div className="tiny muted">{tx(item.desc)}</div>
            </div>
            <b className="co-price">{usdc(item.priceCents)}</b>
          </div>

          {step === 'metodo' && (
            <>
              {mvp && (
                <button className="co-method co-credit" disabled={busy || credit < item.priceCents} onClick={payWithCredit}>
                  <span className="big-emoji">🎁</span>
                  <b>{t('Usar crédito de teste')}</b>
                  <span className="tiny">
                    {tn('Saldo: {v}', { v: <b key="v">{usdc(credit)}</b> })}
                    {credit >= item.priceCents ? t(' → fica {v}', { v: usdc(credit - item.priceCents) }) : t(' · saldo insuficiente')}
                  </span>
                </button>
              )}
              <div className="co-methods">
                <button className="co-method" disabled={busy || !web3 || !enough || (wallet?.kycRequired ?? false)} onClick={payWithUsdc}>
                  <span className="big-emoji">💵</span>
                  <b>{busy ? t('Enviando USDC...') : t('Pagar com USDC')}</b>
                  <span className="tiny muted">
                    {!web3
                      ? t('Carteira cripto indisponível no momento.')
                      : walletErr
                        ? t('Não deu para ler sua carteira agora.')
                        : !wallet
                          ? t('Lendo sua carteira...')
                          : wallet.kycRequired
                            ? t('Pagamentos em USDC exigem verificação de identidade (KYC).')
                            : balance == null
                              ? t('Abra a Carteira para criar seu endereço USDC.')
                              : tn('Saldo: {v}', { v: <b key="v">{usdc(Math.round(balance * 100))}</b> })}
                    {wallet && balance != null && !enough && t(' · faltam {n} USDC', { n: (priceUsdc - balance).toFixed(2) })}
                  </span>
                </button>
              </div>
              {web3 && wallet && !enough && (
                <button className="btn full" onClick={goWallet}>
                  ➕ {t('Adicionar USDC na Carteira')}
                </button>
              )}
              {wallet?.network.testnet && <p className="tiny muted center">🧪 {t('Rede de teste: o USDC aqui não tem valor real.')}</p>}
              <p className="tiny muted center">{t('Pago em USDC da sua carteira cripto. Itens entregues assim que a rede confirma. Sem saque: moedas do jogo não viram dinheiro.')}</p>
            </>
          )}

          {step === 'aguardando' && order && (
            <div className="waiting">
              <span className="spinner" /> {t('USDC enviado. Aguardando a rede confirmar...')}
            </div>
          )}

          {step === 'pago' && (
            <div className="center">
              <div className="prize-emoji">🎉</div>
              <h2>{t('Pagamento aprovado!')}</h2>
              <p className="muted">{t('{item} já está na sua conta.', { item: tx(item.name) })}</p>
              {order?.method === 'credito' && <p className="tiny">{tn('Crédito de teste restante: {v}', { v: <b key="v">{usdc(user?.mvpCreditCents ?? 0)}</b> })}</p>}
              <button className="btn btn-primary btn-lg" onClick={close}>
                {t('Bora jogar')}
              </button>
            </div>
          )}

          {step === 'erro' && (
            <div className="center">
              <p className="neg">{error}</p>
              <button className="btn" onClick={() => setStep('metodo')}>
                {t('Tentar de novo')}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
