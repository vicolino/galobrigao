// 🐓 Galo NFT na Carteira: transformar galos em NFT (só aparece com a carteira cripto ligada).
import { useState } from 'react'
import { api, type GaloLook } from '../api'
import { BreedBadge } from '../components/BreedBadge'
import { RoosterSvg } from '../components/RoosterSvg'
import { Modal, Stars } from '../components/ui'
import { ACC_BY_ID, SKIN_BY_ID } from '../game/data'
import { NFT_MIN_LEVEL, nftIneligible, roosterLock } from '../game/galonft'
import { useGame } from '../game/store'
import type { Rooster } from '../game/types'
import { t, tp } from '../i18n'
import type { PanelProps } from './Carteira'

/** Arte do NFT: o desenho do galo ou o emoji do item. */
export function NftArt({ kind, itemId, rooster }: { kind: 'acc' | 'skin' | 'galo'; itemId: string; rooster?: GaloLook }) {
  if (kind === 'galo')
    return <div className="gn-art">{rooster ? <RoosterSvg breedId={rooster.breedId} tint={rooster.tint ?? undefined} equipped={{}} size={96} anim="none" /> : '🐓'}</div>
  const it = kind === 'acc' ? ACC_BY_ID[itemId] : SKIN_BY_ID[itemId]
  return <div className="shop-emoji">{it?.emoji ?? '❔'}</div>
}

export function GaloNftPanel({ busy, run, okTx }: Omit<PanelProps, 'info'> & { info?: unknown }) {
  const { state } = useGame()
  const [pick, setPick] = useState<Rooster | null>(null)
  if (!state) return null
  const free = state.roosters.filter((r) => !r.nft)
  const ok = free.filter((r) => !nftIneligible(state, r) && !roosterLock(state, r))
  const blocked = free.length - ok.length

  return (
    <>
      <h3 className="section-title">🐓 {t('Galos NFT')}</h3>
      <p className="tiny muted">
        {t('Viram NFT: galos de cruzamento, edições especiais, galos de kits pagos e qualquer galo de nível {n}+. O Galo Livre do cadastro não vira. O galo continua lutando no seu galinheiro.', { n: NFT_MIN_LEVEL })}
      </p>
      {ok.length === 0 ? (
        <p className="muted">{t('Nenhum galo pode virar NFT agora.')}</p>
      ) : (
        <div className="grid-shop">
          {ok.map((r) => (
            <div key={r.id} className="card shop-item web3-item">
              <div className="gn-art">
                <RoosterSvg breedId={r.breedId} skin={r.skin} equipped={r.equipped} tint={r.tint} size={96} anim="none" />
              </div>
              <b>{r.name}</b>
              <div className="row gap wrap w3-meta">
                <span className="tiny muted">
                  {t('Nv {n}', { n: r.level })} · <Stars n={r.stars} />
                </span>
                <BreedBadge ro={r} />
              </div>
              <div className="w3-actions">
                <button className="btn btn-gold full" disabled={busy} onClick={() => setPick(r)}>
                  ✨ {t('Transformar em NFT')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {blocked > 0 && <p className="tiny muted">{tp('{n} galo ainda não pode virar NFT.', '{n} galos ainda não podem virar NFT.', blocked)}</p>}

      <Modal open={!!pick} onClose={() => setPick(null)} title={'✨ ' + t('Galo NFT')}>
        {pick && (
          <div className="center">
            <RoosterSvg breedId={pick.breedId} skin={pick.skin} equipped={pick.equipped} tint={pick.tint} size={140} anim="idle" />
            <h3>{pick.name}</h3>
            <p className="muted">{t('{nome} vira um NFT na sua carteira, com raça, estrelas, atributos e cruzamentos gravados. Ele continua lutando no seu galinheiro e pode ser vendido no Mercado por USDC.', { nome: pick.name })}</p>
            <p className="tiny muted">{t('Enquanto for NFT, não dá para vender na Feira, presentear nem alugar. Dá para trazer de volta quando quiser.')}</p>
            <div className="row-center gap" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setPick(null)}>
                {t('Cancelar')}
              </button>
              <button
                className="btn btn-gold"
                disabled={busy}
                onClick={async () => {
                  const done = await run(() => api.mintGalo(pick.id), (r) => okTx(t('NFT #{id} criado!', { id: r.tokenId }), r.tx), true)
                  if (done) setPick(null)
                }}
              >
                {busy ? t('Aguarde...') : t('Transformar em NFT')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
