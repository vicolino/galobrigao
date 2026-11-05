// Selos do galo: cruzamentos (x/7, virgem) e Galo NFT.
import { MAX_BREEDS, breedsOf } from '../game/galonft'
import type { Rooster } from '../game/types'
import { t } from '../i18n'

export function BreedBadge({ ro, long }: { ro: Pick<Rooster, 'breedCount'>; long?: boolean }) {
  const n = breedsOf(ro)
  const cls = n === 0 ? 'virgem' : n >= MAX_BREEDS ? 'esgotado' : ''
  const title = t('Cruzamentos: {n}/{max}', { n, max: MAX_BREEDS })
  return (
    <span className={`gn-breed ${cls}`} title={title}>
      {long ? title : `🧬 ${n}/${MAX_BREEDS}`}
      {n === 0 && <b> · {t('virgem')}</b>}
    </span>
  )
}

export function NftBadge({ ro }: { ro: Pick<Rooster, 'nft'> }) {
  if (!ro.nft) return null
  return (
    <span className="gn-nft" title={t('Galo NFT na sua carteira')}>
      💎 NFT{ro.nft.tokenId !== 'pendente' ? ` #${ro.nft.tokenId}` : ''}
    </span>
  )
}
