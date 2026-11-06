// Botão "📸 Compartilhar": gera a imagem de Story (gerador carregado só no clique) e abre o modal.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { appName } from '../brand'
import { IG_HANDLE, SHARE_URL } from '../game/social'
import { t } from '../i18n'
import type { ShareCardOpts } from './shareCard'
import { Modal } from './ui'
import type { Rooster } from '../game/types'

/** Linha de cartel do galo para o card (vitórias, derrotas, K.O.). */
export const recordLine = (ro: Pick<Rooster, 'wins' | 'losses' | 'kos'>) => t('🏆 {v}V · {d}D · 💥 {k} K.O.', { v: ro.wins, d: ro.losses, k: ro.kos ?? 0 })

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function ShareButton({ card, className = 'btn' }: { card: ShareCardOpts; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {t('📸 Compartilhar')}
      </button>
      {/* Portal: pode abrir de dentro de outro modal (ex.: pintinho que nasceu) */}
      {open && createPortal(<ShareModal card={card} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function ShareModal({ card, onClose }: { card: ShareCardOpts; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    let made = ''
    import('./shareCard')
      .then((m) => m.makeShareCard(card))
      .then((blob) => {
        if (!alive) return
        made = URL.createObjectURL(blob)
        setFile(new File([blob], `${slug(appName())}-${slug(card.ro.name) || 'galo'}.png`, { type: 'image/png' }))
        setUrl(made)
      })
      .catch((e: Error) => alive && setErr(e.message || t('Não deu para gerar a imagem.')))
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const text = t('Olha o meu galo {nome} no {jogo}! Jogue grátis: {url} {ig}', { nome: card.ro.name, jogo: appName(), url: SHARE_URL, ig: IG_HANDLE })
  const canShare = !!file && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] })

  const share = async () => {
    if (!file) return
    setBusy(true)
    try {
      await navigator.share({ files: [file], text })
    } catch {
      /* cancelou ou o app não aceitou */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('📸 Compartilhar no Instagram')}>
      <div className="share-modal">
        <div className="share-preview">{url ? <img src={url} alt={card.headline} /> : err ? <p className="neg tiny">{err}</p> : <span className="spinner" />}</div>
        <p className="tiny muted center">{t('Poste no Story e marque {handle}', { handle: IG_HANDLE })}</p>
        <div className="row-center gap">
          {canShare && (
            <button className="btn btn-primary" onClick={share} disabled={busy}>
              {t('Compartilhar')}
            </button>
          )}
          {url && file && (
            <a className={`btn ${canShare ? '' : 'btn-primary'}`} href={url} download={file.name}>
              {t('Baixar imagem')}
            </a>
          )}
        </div>
      </div>
    </Modal>
  )
}
