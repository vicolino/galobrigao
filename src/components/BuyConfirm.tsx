import { useEffect, useRef, useState } from 'react'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import type { Currency } from '../game/types'
import { t } from '../i18n'
import { Modal, go } from './ui'

/** Pedido de confirmação de compra (o que é, quanto custa e o que o jogador ganha). */
export interface BuyRequest {
  emoji?: string
  title: string
  detail?: string
  price: number
  currency: Currency
  /** Ganho em milho (ex.: troca de ovos por milho), mostrado no saldo depois. */
  gainMilho?: number
}

let push: ((r: (BuyRequest & { resolve: (ok: boolean) => void }) | null) => void) | null = null

/** Abre a confirmação e devolve true se o jogador confirmar. Sem o componente montado, segue direto. */
export const confirmBuy = (r: BuyRequest) => new Promise<boolean>((resolve) => (push ? push({ ...r, resolve }) : resolve(true)))

const sym = (c: Currency) => (c === 'ovo' ? '🥚' : '🌽')

/** Janela "Confirmar compra": preço, saldo agora e saldo depois. Montada uma vez no App. */
export function BuyConfirm() {
  const { wallet } = useGame()
  const [req, setReq] = useState<(BuyRequest & { resolve: (ok: boolean) => void }) | null>(null)
  useEffect(() => {
    push = setReq
    return () => {
      push = null
    }
  }, [])
  if (!req || !wallet) return null
  const close = (ok: boolean) => {
    req.resolve(ok)
    setReq(null)
  }
  const have = req.currency === 'ovo' ? wallet.ovos : wallet.milho
  const after = have - req.price
  const short = after < 0
  return (
    <Modal open onClose={() => close(false)} title={t('🛒 Confirmar compra')}>
      <div className="buyc">
        <div className="buyc-item">
          {req.emoji && <span className="buyc-emoji">{req.emoji}</span>}
          <div>
            <b>{req.title}</b>
            {req.detail && <div className="tiny muted">{req.detail}</div>}
          </div>
        </div>
        <div className="buyc-rows">
          <div>
            <span>{t('Preço')}</span>
            <b>
              {sym(req.currency)} {fmt(req.price)}
            </b>
          </div>
          <div>
            <span>{t('Seu saldo agora')}</span>
            <b>
              {sym(req.currency)} {fmt(have)}
            </b>
          </div>
          <div className={`buyc-after ${short ? 'neg' : ''}`}>
            <span>{t('Saldo depois da compra')}</span>
            <b>
              {sym(req.currency)} {fmt(Math.max(0, after))}
            </b>
          </div>
          {!!req.gainMilho && (
            <div className="buyc-gain">
              <span>{t('Você recebe')}</span>
              <b>🌽 +{fmt(req.gainMilho)}</b>
            </div>
          )}
        </div>
        {short ? (
          <>
            <p className="tiny neg center">{req.currency === 'ovo' ? t('Faltam 🥚 {n} ovos de ouro.', { n: fmt(-after) }) : t('Faltam 🌽 {n} de milho.', { n: fmt(-after) })}</p>
            <button
              className="btn btn-gold full"
              onClick={() => {
                close(false)
                go(req.currency === 'ovo' ? '/loja/ovos' : '/loja/trocar')
              }}
            >
              {req.currency === 'ovo' ? t('💎 Comprar ovos') : t('🔁 Trocar ovos por milho')}
            </button>
          </>
        ) : (
          <div className="row gap">
            <button className="btn grow" onClick={() => close(false)}>
              {t('Cancelar')}
            </button>
            <button className="btn btn-primary grow" autoFocus onClick={() => close(true)}>
              {t('Confirmar compra')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Barra de saldo fixa no topo da Loja; quando o saldo cai, mostra quanto saiu. */
export function WalletBar({ hideBuy = false }: { hideBuy?: boolean } = {}) {
  const { wallet } = useGame()
  const prev = useRef(wallet)
  const [delta, setDelta] = useState<{ milho: number; ovos: number; key: number } | null>(null)
  useEffect(() => {
    if (!wallet || !prev.current) {
      prev.current = wallet
      return
    }
    const dm = wallet.milho - prev.current.milho
    const dov = wallet.ovos - prev.current.ovos
    prev.current = wallet
    if (dm || dov) {
      setDelta({ milho: dm, ovos: dov, key: Date.now() })
      const h = setTimeout(() => setDelta(null), 2200)
      return () => clearTimeout(h)
    }
  }, [wallet?.milho, wallet?.ovos]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!wallet) return null
  const chip = (v: number, s: string) => (v ? <span key={s} className={`wb-delta ${v < 0 ? 'neg' : 'pos'}`}>{`${v > 0 ? '+' : '−'}${s} ${fmt(Math.abs(v))}`}</span> : null)
  return (
    <div className="walletbar">
      <span className="tiny muted">{t('Seu saldo')}</span>
      <span className="wb-item">
        🌽 <b>{fmt(wallet.milho)}</b>
      </span>
      <span className="wb-item">
        🥚 <b>{fmt(wallet.ovos)}</b>
      </span>
      {delta && <span className="wb-deltas" key={delta.key}>{[chip(delta.milho, '🌽'), chip(delta.ovos, '🥚')]}</span>}
      <span className="grow" />
      {!hideBuy && (
        <button className="btn btn-sm btn-gold" onClick={() => go('/loja/ovos')}>
          {t('💎 Comprar ovos')}
        </button>
      )}
    </div>
  )
}
