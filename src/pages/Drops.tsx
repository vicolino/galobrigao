// 🎁 Drops da Arena: chances transparentes (valores ao vivo do backoffice), coleção e feed.
import { useEffect, useState } from 'react'
import { api } from '../api'
import { DropArt, itemName, type ReelItem } from '../components/DropReveal'
import { PageHead, RarityTag, go } from '../components/ui'
import { RARITY } from '../game/data'
import { DROP_BREEDS, DROP_SKINS_BY_TIER, DROP_TIERS, DROP_TOOLS_COMUM, DROP_TOOLS_RARO, dropOdds, winsToPity, type RecentDrop } from '../game/drops'
import { useGame } from '../game/store'
import { locale, t, tn } from '../i18n'

const DIFF_LABELS = () => [t('🐣 Fácil'), t('🐔 Médio'), t('🦅 Difícil'), t('👑 Chefão')]
const pct = (n: number) => `${(Math.round(n * 1000) / 10).toLocaleString(locale(), { maximumFractionDigits: 1 })}%`

/** Barra "Drop garantido em N vitórias" (Arena e página de Drops). */
export function PityBar() {
  const { state } = useGame()
  const o = dropOdds()
  if (!state || !o.on) return null
  const left = winsToPity(state.dropPity)
  const done = o.pity + 1 - left
  return (
    <div className="drop-pity" title={t('A cada vitória sem drop, a garantia sobe. Ao completar, o próximo drop é certo.')}>
      <div className="row-between">
        <span>{left <= 1 ? t('🎁 Drop GARANTIDO na próxima vitória!') : tn('🎁 Drop garantido em {n} vitórias', { n: <b>{left}</b> })}</span>
        <a className="tiny" href="#/drops">
          {t('Ver chances')}
        </a>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.min(100, (done / (o.pity + 1)) * 100)}%`, background: 'linear-gradient(90deg,#b57bff,#ffb020)' }} />
      </div>
    </div>
  )
}

const feedItem = (d: RecentDrop): ReelItem => ({ tier: d.tier, kind: d.kind, id: d.itemId })

/** Faixa "🔥 Fulano dropou Galo Cometa #3" com os últimos drops épicos/lendários. */
export function DropTicker() {
  const [list, setList] = useState<RecentDrop[] | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .dropsRecent()
        .then((r) => alive && setList(r.drops))
        .catch(() => alive && setList((l) => l ?? []))
    void load()
    const id = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  if (!list?.length) return null
  return (
    <div className="drop-ticker" aria-label={t('Últimos drops')}>
      <div className="drop-ticker-track">
        {[...list, ...list].map((d, i) => (
          <span key={i} className={`drop-tick-item tier-${d.tier}`} aria-hidden={i >= list.length}>
            {t('🔥 {nome} dropou {item} #{n}', { nome: d.name || t('Alguém'), item: itemName(feedItem(d)), n: d.serial })}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Drops() {
  const o = dropOdds()
  const labels = DIFF_LABELS()
  const [recent, setRecent] = useState<RecentDrop[]>([])
  useEffect(() => {
    api
      .dropsRecent()
      .then((r) => setRecent(r.drops))
      .catch(() => undefined)
  }, [])
  const pools: Record<string, ReelItem[]> = {
    comum: DROP_TOOLS_COMUM.map((id) => ({ tier: 'comum', kind: 'tool', id })),
    raro: [...DROP_SKINS_BY_TIER('raro').map((k) => ({ tier: 'raro' as const, kind: 'skin' as const, id: k.id })), ...DROP_TOOLS_RARO.map((id) => ({ tier: 'raro' as const, kind: 'tool' as const, id }))],
    epico: DROP_SKINS_BY_TIER('epico').map((k) => ({ tier: 'epico', kind: 'skin', id: k.id })),
    lendario: DROP_BREEDS.map((b) => ({ tier: 'lendario', kind: 'galo', id: b.id })),
  }
  const what: Record<string, string> = {
    comum: t('Pacote com 2 ou 3 ferramentas de luta comuns/raras.'),
    raro: t('2 ferramentas raras/épicas OU uma skin rara da Coleção Drop.'),
    epico: t('Uma skin épica da Coleção Drop, numerada. Pode virar NFT.'),
    lendario: t('Um galo lendário exclusivo (nível 1, 3 a 5★), numerado. Pode virar NFT.'),
  }

  return (
    <>
      <PageHead title={t('🎁 Drops da Arena')} subtitle={t('Vença lutas na Arena e ganhe itens raros de graça. Drops nunca são vendidos: só saem jogando.')} />
      {!o.on && <div className="warn">{t('Os drops estão pausados no momento.')}</div>}
      <PityBar />

      <div className="admin-two drops-odds">
        <div className="card">
          <h3>{t('🎲 Chance de drop por vitória')}</h3>
          <table className="table">
            <tbody>
              {labels.map((l, i) => (
                <tr key={i}>
                  <td>{l}</td>
                  <td className="num">
                    <b>{pct(o.chance[i])}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="tiny muted drops-rules">
            <li>{t('Só vale vitória na Arena.')}</li>
            <li>{t('Garantia: depois de {n} vitórias seguidas sem drop, a próxima vitória dá drop com certeza.', { n: o.pity })}</li>
            <li>{t('Máximo de {n} drops por dia.', { n: o.dailyCap })}</li>
            {o.supplyCap > 0 && <li>{t('Itens épicos e lendários têm tiragem limitada: só {n} de cada no mundo. Esgotou, sai outro do mesmo tier.', { n: o.supplyCap })}</li>}
          </ul>
        </div>
        <div className="card">
          <h3>{t('💎 Raridade quando sai drop')}</h3>
          <table className="table">
            <tbody>
              {DROP_TIERS.map((tier) => (
                <tr key={tier}>
                  <td>
                    <RarityTag rarity={tier} />
                  </td>
                  <td className="num">
                    <b style={{ color: RARITY[tier].color }}>{pct(o.tiers[tier])}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny muted">{t('Exemplo: no Chefão, a chance de um galo lendário por vitória é {p}.', { p: pct(o.chance[3] * o.tiers.lendario) })}</p>
        </div>
      </div>

      {DROP_TIERS.map((tier) => (
        <div key={tier} className={`card drops-pool tier-${tier}`}>
          <div className="row-between">
            <h3>
              <RarityTag rarity={tier} /> {pct(o.tiers[tier])}
            </h3>
          </div>
          <p className="tiny muted">{what[tier]}</p>
          <div className="drops-items">
            {pools[tier].map((it) => (
              <div key={`${it.kind}-${it.id}`} className={`drop-card tier-${it.tier}`}>
                <DropArt item={it} size={70} />
                <span className="drop-card-name">{itemName(it)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {recent.length > 0 && (
        <div className="card">
          <h3>{t('🔥 Últimos drops raros')}</h3>
          <ul className="drops-recent">
            {recent.map((d, i) => (
              <li key={i} className={`tier-${d.tier}`}>
                <span>{t('{nome} dropou {item} #{n}', { nome: d.name || t('Alguém'), item: itemName(feedItem(d)), n: d.serial })}</span>
                <span className="tiny muted">{new Date(d.at).toLocaleString(locale())}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="center">
        <button className="btn btn-primary" onClick={() => go('/rinha')}>
          {t('⚔️ Ir para a Arena')}
        </button>
      </p>
    </>
  )
}
