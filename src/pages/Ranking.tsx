import { useEffect, useState } from 'react'
import { api, type PublicRooster, type RankRow, type Showcase } from '../api'
import { RoosterSvg } from '../components/RoosterSvg'
import { Empty, Modal, PageHead, Stars } from '../components/ui'
import { BREED_BY_ID } from '../game/data'
import { fmt } from '../game/rooster'
import { useGame } from '../game/store'
import { locale, t, tx, tp } from '../i18n'

type Board = Awaited<ReturnType<typeof api.ranking>>

const MEDAL = ['🥇', '🥈', '🥉']

function Mini({ ro, size }: { ro: PublicRooster; size: number }) {
  return <RoosterSvg breedId={ro.breedId} skin={ro.skin ?? undefined} equipped={ro.equipped} tint={ro.tint ?? undefined} size={size} anim="idle" />
}

export function Ranking() {
  const { user } = useGame()
  const [board, setBoard] = useState<Board | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    api.ranking().then(setBoard).catch((e) => setErr((e as Error).message))
  }, [])

  const podium = board?.top.slice(0, 3) ?? []
  const rest = board?.top.slice(3) ?? []
  // Quem está logo acima de você (ou o último do top, se você está fora dele)
  const me = board?.me
  const above = me && me.pos > 1 ? board!.top[me.pos <= board!.top.length ? me.pos - 2 : board!.top.length - 1] : undefined

  return (
    <>
      <PageHead title={t('📈 Ranking de galinheiros')} subtitle={t('Quem tem o terreiro mais valioso? Atualiza a cada 5 minutos.')} />
      {err && <p className="warn">{err}</p>}
      {!board && !err && <div className="spinner" />}
      {board && board.me && (
        <div className="card rk-me" onClick={() => setOpen(board.me!.id)}>
          <span className="rk-me-pos">#{board.me.pos}</span>
          <div className="grow">
            <b>{t('Você está em #{n}', { n: board.me.pos })}</b>
            <div className="tiny muted">{t('de {n} galinheiros · valor 🌽 {v}', { n: fmt(board.total), v: fmt(board.me.total) })}</div>
          </div>
          {above && <span className="tiny muted">{t('Faltam 🌽 {v} para subir', { v: fmt(Math.max(1, above.total - board.me.total + 1)) })}</span>}
        </div>
      )}
      {board && board.top.length === 0 && <Empty emoji="🐓" title={t('Ninguém no ranking ainda')} />}

      {podium.length > 0 && (
        <div className="rk-podium">
          {[1, 0, 2].map((i) => {
            const p = podium[i]
            if (!p) return <div key={i} className="rk-step empty" />
            return (
              <div key={p.id} className={`rk-step rk-${i + 1} ${p.id === user?.id ? 'mine' : ''}`} onClick={() => setOpen(p.id)}>
                <div className="rk-art">{p.best && <Mini ro={p.best} size={i === 0 ? 170 : 130} />}</div>
                <div className="rk-medal">{MEDAL[i]}</div>
                <b className="rk-name">
                  {p.avatar} {p.name}
                  {(p.champ ?? 0) > 0 && <span title={t('🏆 Campeão do Terreiro')}> 🏆</span>}
                </b>
                <span className="rk-val">🌽 {fmt(p.total)}</span>
                <div className="rk-block">{i + 1}</div>
              </div>
            )
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="card rk-list">
          {rest.map((p, i) => (
            <Row key={p.id} p={p} pos={i + 4} mine={p.id === user?.id} onClick={() => setOpen(p.id)} />
          ))}
        </div>
      )}

      <ShowcaseModal id={open} onClose={() => setOpen(null)} />
    </>
  )
}

function Row({ p, pos, mine, onClick }: { p: RankRow; pos: number; mine: boolean; onClick: () => void }) {
  return (
    <div className={`rk-row ${mine ? 'mine' : ''}`} onClick={onClick}>
      <span className="rk-pos">#{pos}</span>
      <span className="rk-ava">{p.avatar}</span>
      <div className="grow">
        <b>{p.name}{(p.champ ?? 0) > 0 && <span title={t('🏆 Campeão do Terreiro')}> 🏆</span>}</b>
        <div className="tiny muted">{tp('{n} galo · melhor: {galo}', '{n} galos · melhor: {galo}', p.roosters, { galo: p.best ? `${p.best.name} (${t('Nv {n}', { n: p.best.level })})` : '—' })}</div>
      </div>
      {p.best && (
        <span className="rk-thumb">
          <Mini ro={p.best} size={46} />
        </span>
      )}
      <b className="rk-val">🌽 {fmt(p.total)}</b>
    </div>
  )
}

/** Vitrine de um jogador (modal). */
export function ShowcaseModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [data, setData] = useState<Showcase | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setData(null)
    setErr('')
    if (id) api.showcase(id).then(setData).catch((e) => setErr((e as Error).message))
  }, [id])
  return (
    <Modal open={!!id} onClose={onClose} wide title={data ? `${data.avatar} ${data.name}` : t('🏆 Vitrine')}>
      {err && <p className="warn">{err}</p>}
      {!data && !err && <div className="spinner" />}
      {data && (
        <div className="sc">
          <div className="sc-stats">
            <div>
              <b>🌽 {fmt(data.worth)}</b>
              <span>{t('Valor do galinheiro')}</span>
            </div>
            <div>
              <b>{data.pos ? `#${data.pos}` : '—'}</b>
              <span>{t('Ranking')}</span>
            </div>
            <div>
              <b>
                {data.tier.emoji} {tx(data.tier.name)}
              </b>
              <span>{t('Liga')}</span>
            </div>
            <div>
              <b>{fmt(data.wins)}</b>
              <span>{t('Vitórias')}</span>
            </div>
            <div>
              <b>🏅 {data.achievements}</b>
              <span>{t('Conquistas')}</span>
            </div>
            <div>
              <b>🐓 {data.count}</b>
              <span>{t('Galos')}</span>
            </div>
          </div>
          {(data.champ ?? 0) > 0 && <p className="center tz-title">{t('🏆 Campeão do Terreiro')} ×{data.champ}</p>}
          {data.since && <p className="tiny muted center">{t('criador desde {data}', { data: new Date(data.since).toLocaleDateString(locale()) })}</p>}
          <div className="sc-grid">
            {data.roosters.map((ro) => (
              <div key={ro.id} className={`sc-ro rar-${BREED_BY_ID[ro.breedId]?.rarity ?? 'comum'}`}>
                <Mini ro={ro} size={96} />
                <b>{ro.name}</b>
                <span className="tiny muted">
                  {BREED_BY_ID[ro.breedId]?.name} · {t('Nv {n}', { n: ro.level })}
                </span>
                <Stars n={ro.stars} />
                {ro.tint && <span className="tiny">{t('🌈 Pelagem rara')}</span>}
                <span className="rc-value">🌽 {fmt(ro.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Card "Minha vitrine" do Perfil: posição no ranking e atalho. */
export function MyShowcaseCard() {
  const { user } = useGame()
  const [me, setMe] = useState<Board['me'] | undefined>(undefined)
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    api
      .ranking()
      .then((r) => {
        setMe(r.me)
        setTotal(r.total)
      })
      .catch(() => setMe(null))
  }, [])
  return (
    <div className="card rk-mycard">
      <h3>{t('🏆 Minha vitrine')}</h3>
      {me === undefined ? (
        <div className="spinner" />
      ) : me ? (
        <div className="row gap">
          {me.best && (
            <span className="rk-thumb">
              <Mini ro={me.best} size={64} />
            </span>
          )}
          <div className="grow">
            <b>{t('Você está em #{n}', { n: me.pos })}</b>
            <div className="tiny muted">{t('de {n} galinheiros · valor 🌽 {v}', { n: fmt(total), v: fmt(me.total) })}</div>
          </div>
        </div>
      ) : (
        <p className="muted">{t('Seu galinheiro entra no ranking na próxima atualização.')}</p>
      )}
      <div className="row gap wrap" style={{ marginTop: 10 }}>
        <a className="btn btn-sm btn-primary" href="#/ranking">
          {t('Ver ranking')}
        </a>
        {user && (
          <button className="btn btn-sm" onClick={() => setOpen(true)}>
            {t('Ver minha vitrine')}
          </button>
        )}
      </div>
      <ShowcaseModal id={open && user ? user.id : null} onClose={() => setOpen(false)} />
    </div>
  )
}
