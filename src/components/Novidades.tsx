import { useEffect, useState } from 'react'
import { useGame } from '../game/store'
import { RELEASES, latestNewsId, unseenNews, type Release } from '../game/news'
import { locale, t, tp } from '../i18n'
import { Modal, PageHead, go } from './ui'

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { day: '2-digit', month: 'long', year: 'numeric' })

function ReleaseBody({ r, onGo }: { r: Release; onGo?: () => void }) {
  return (
    <div className="news-release">
      <div className="news-head">
        <b>{r.title}</b>
        <span className="tiny muted">{fmtDate(r.date)}</span>
      </div>
      <ul className="news-list">
        {r.items.map((it) => (
          <li key={it.title}>
            <span className="news-emoji">{it.emoji}</span>
            <div className="grow">
              <b>{it.title}</b>
              <div className="tiny muted">{it.text}</div>
            </div>
            {it.link && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  onGo?.()
                  go(it.link!)
                }}
              >
                {t('Ver')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Abre sozinho quando há novidades que o jogador ainda não viu (uma vez por versão, em qualquer aparelho). */
export function NewsCenter() {
  const { state, actions } = useGame()
  const seen = state?.settings.newsSeen
  const createdAt = state?.player.createdAt ?? 0
  const [open, setOpen] = useState(false)
  const list = unseenNews(seen)
  useEffect(() => {
    if (!state || !list.length) return
    // Jogador novo (chegou depois da última nota): não mostra o histórico, só marca como visto
    if (!seen && createdAt > new Date(`${list[0].date}T23:59:59`).getTime()) {
      actions.setSettings({ newsSeen: latestNewsId() })
      return
    }
    const h = setTimeout(() => setOpen(true), 900)
    return () => clearTimeout(h)
  }, [!!state, list.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    setOpen(false)
    actions.setSettings({ newsSeen: latestNewsId() })
  }
  if (!open || !list.length) return null
  return (
    <Modal open onClose={close} title={t('🆕 Novidades no terreiro')}>
      <div className="news-modal">
        {list.length > 1 && <p className="tiny muted">{tp('Você perdeu {n} atualização:', 'Você perdeu {n} atualizações:', list.length)}</p>}
        {list.map((r) => (
          <ReleaseBody key={r.id} r={r} onGo={close} />
        ))}
        <button className="btn btn-primary full" onClick={close}>
          {t('Bora jogar! 🐓')}
        </button>
      </div>
    </Modal>
  )
}

/** Quantas notas ainda não vistas (para a bolinha no menu). */
export const newsUnread = (seen?: string) => unseenNews(seen).length

export function Novidades() {
  const { state, actions } = useGame()
  useEffect(() => {
    if (state && state.settings.newsSeen !== latestNewsId()) actions.setSettings({ newsSeen: latestNewsId() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageHead title={t('🆕 Novidades')} subtitle={t('Tudo o que mudou no jogo, da versão mais nova para a mais antiga.')} />
      {RELEASES().map((r) => (
        <div key={r.id} className="card">
          <ReleaseBody r={r} />
        </div>
      ))}
    </>
  )
}
