// 🎁 Abertura do Drop (estilo CS): roleta de cards desacelerando até o prêmio, depois a revelação.
// O prêmio já veio do servidor; a roleta é só a animação (o card vencedor fica num índice fixo).
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BREED_BY_ID, SKIN_BY_ID, TOOL_BY_ID } from '../game/data'
import { DROP_BREEDS, DROP_SKINS_BY_TIER, DROP_TOOLS_COMUM, DROP_TOOLS_RARO, mathRng, rollTier, type DropResult, type DropTier } from '../game/drops'
import { sfx } from '../game/sound'
import { useGame } from '../game/store'
import type { Rooster } from '../game/types'
import { t } from '../i18n'
import { RoosterSvg } from './RoosterSvg'
import { ShareButton } from './Share'
import { RarityTag } from './ui'

/** Um card da roleta / da tabela de chances. */
export interface ReelItem {
  tier: DropTier
  kind: 'tool' | 'tools' | 'skin' | 'galo'
  id: string
}

const REEL_LEN = 44
const WIN_AT = 36
const CARD_W = 112
const GAP = 8
const STEP = CARD_W + GAP
const SPIN_MS = 4600

/** Arte do item: galo da raça, galo vestindo a skin ou emoji da ferramenta. */
export function DropArt({ item, size = 84 }: { item: ReelItem; size?: number }) {
  if (item.kind === 'galo') return <RoosterSvg breedId={item.id} size={size} anim="none" />
  if (item.kind === 'skin') return <RoosterSvg breedId="caipira" skin={item.id} size={size} anim="none" />
  if (item.kind === 'tools') return <span className="drop-emoji" style={{ fontSize: size * 0.5 }}>🧰</span>
  return <span className="drop-emoji" style={{ fontSize: size * 0.5 }}>{TOOL_BY_ID[item.id]?.emoji ?? '🎁'}</span>
}

export function itemName(item: ReelItem): string {
  if (item.kind === 'galo') return BREED_BY_ID[item.id]?.name ?? item.id
  if (item.kind === 'skin') return SKIN_BY_ID[item.id]?.name ?? item.id
  if (item.kind === 'tools') return t('Pacote de ferramentas')
  return TOOL_BY_ID[item.id]?.name ?? item.id
}

/** Card aleatório da roleta, com o peso dos tiers. */
function randomItem(): ReelItem {
  const tier = rollTier(mathRng)
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
  if (tier === 'lendario') return { tier, kind: 'galo', id: pick(DROP_BREEDS).id }
  if (tier === 'epico') return { tier, kind: 'skin', id: pick(DROP_SKINS_BY_TIER('epico')).id }
  if (tier === 'raro') return Math.random() < 0.5 ? { tier, kind: 'skin', id: pick(DROP_SKINS_BY_TIER('raro')).id } : { tier, kind: 'tool', id: pick(DROP_TOOLS_RARO) }
  return { tier, kind: 'tool', id: pick(DROP_TOOLS_COMUM) }
}

export function wonItem(d: DropResult): ReelItem {
  if (d.kind === 'galo') return { tier: d.tier, kind: 'galo', id: d.breedId! }
  if (d.kind === 'skin') return { tier: d.tier, kind: 'skin', id: d.skinId! }
  return { tier: d.tier, kind: 'tools', id: Object.keys(d.tools ?? {})[0] ?? '' }
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const TIER_HEADLINE: Record<DropTier, () => string> = {
  comum: () => t('🎁 DROP COMUM!'),
  raro: () => t('🎁 DROP RARO!'),
  epico: () => t('🎁 DROP ÉPICO!'),
  lendario: () => t('🎁 DROP LENDÁRIO!'),
}

export function DropModal({ drop, fallbackRo, onClose, onGo }: { drop: DropResult; fallbackRo: Rooster; onClose: () => void; onGo: (path: string) => void }) {
  const [phase, setPhase] = useState<'spin' | 'reveal'>(reducedMotion() ? 'reveal' : 'spin')
  const win = useMemo(() => wonItem(drop), [drop])
  const items = useMemo(() => Array.from({ length: REEL_LEN }, (_, i) => (i === WIN_AT ? win : randomItem())), [win])
  const boxRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  // Para um pouco fora do centro do card (como no CS), sem cair no vizinho
  const jitter = useMemo(() => (Math.random() - 0.5) * (CARD_W * 0.7), [])

  useEffect(() => {
    if (phase !== 'spin') return
    const box = boxRef.current
    const strip = stripRef.current
    if (!box || !strip) return
    const center = box.clientWidth / 2
    const target = WIN_AT * STEP + CARD_W / 2 - center + jitter
    strip.style.transition = 'none'
    strip.style.transform = 'translate3d(0,0,0)'
    let raf = 0
    let last = -1
    const start = requestAnimationFrame(() => {
      strip.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.06, 0.72, 0.14, 1)`
      strip.style.transform = `translate3d(${-target}px,0,0)`
      // Tic a cada card que passa pelo marcador
      const loop = () => {
        const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform)
        const idx = Math.floor((-m.m41 + center) / STEP)
        if (idx !== last) {
          if (last >= 0) sfx.dropTick()
          last = idx
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    })
    const done = setTimeout(() => setPhase('reveal'), SPIN_MS + 350)
    return () => {
      cancelAnimationFrame(start)
      cancelAnimationFrame(raf)
      clearTimeout(done)
    }
  }, [phase, jitter])

  useEffect(() => {
    if (phase === 'reveal') sfx.dropReveal(drop.tier)
  }, [phase, drop.tier])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const { pubConfig } = useGame()
  const big = drop.tier === 'epico' || drop.tier === 'lendario'
  const shareRo =
    drop.kind === 'galo' && drop.rooster
      ? drop.rooster
      : drop.kind === 'skin'
        ? { ...fallbackRo, skin: drop.skinId, equipped: {}, name: SKIN_BY_ID[drop.skinId!]?.name ?? fallbackRo.name }
        : fallbackRo
  const goPath = drop.kind === 'galo' && drop.rooster ? `/galinheiro/${drop.rooster.id}` : drop.kind === 'skin' ? `/galinheiro/${fallbackRo.id}` : '/rinha'

  return createPortal(
    <div className={`drop-back tier-${drop.tier}`} role="dialog" aria-modal="true" aria-label={t('Abrindo o drop')}>
      {phase === 'spin' ? (
        <div className="drop-stage">
          <h2 className="drop-title">{t('🎁 Abrindo o drop…')}</h2>
          <div className="drop-reel" ref={boxRef}>
            <div className="drop-marker" />
            <div className="drop-strip" ref={stripRef}>
              {items.map((it, i) => (
                <div key={i} className={`drop-card tier-${it.tier}`} style={{ width: CARD_W, marginRight: GAP }}>
                  <DropArt item={it} size={74} />
                  <span className="drop-card-name">{itemName(it)}</span>
                </div>
              ))}
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => setPhase('reveal')}>
            {t('⏭ Pular animação')}
          </button>
        </div>
      ) : (
        <div className="drop-stage">
          <div className={`drop-reveal tier-${drop.tier}`}>
            {big && <div className="drop-rays" aria-hidden />}
            {big && (
              <div className="drop-confetti" aria-hidden>
                {Array.from({ length: drop.tier === 'lendario' ? 36 : 22 }, (_, i) => (
                  <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 0.12}s`, background: ['#ffd23f', '#ff4fd8', '#3dffb0', '#4fa3ff', '#ff7a45'][i % 5] }} />
                ))}
              </div>
            )}
            <div className="drop-headline">{TIER_HEADLINE[drop.tier]()}</div>
            <div className="drop-art-big">
              <DropArt item={win} size={drop.kind === 'tools' ? 150 : 190} />
            </div>
            <div className="drop-name">{drop.kind === 'tools' ? t('Pacote de ferramentas') : itemName(win)}</div>
            <div className="row-center gap">
              <RarityTag rarity={drop.tier} />
              {drop.serial && <span className="drop-serial">{t('Drop #{n}', { n: drop.serial })}</span>}
            </div>
            {drop.kind === 'tools' && (
              <div className="drop-tools">
                {Object.entries(drop.tools ?? {}).map(([id, n]) => (
                  <span key={id} className={`tool-chip rar-${TOOL_BY_ID[id]?.rarity}`}>
                    {TOOL_BY_ID[id]?.emoji} {TOOL_BY_ID[id]?.name} ×{n}
                  </span>
                ))}
              </div>
            )}
            {drop.kind === 'galo' && drop.rooster && <p className="tiny muted">{t('Nível 1 · {n}★ · edição Drop, nunca vendido na loja', { n: drop.rooster.stars })}</p>}
            {drop.kind === 'skin' && <p className="tiny muted">{t('Skin da Coleção Drop: não existe na loja.')}</p>}
          </div>
          <div className="drop-actions">
            <button className="btn btn-primary" onClick={() => onGo(goPath)}>
              {drop.kind === 'galo' ? t('🏠 Ver no galinheiro') : drop.kind === 'skin' ? t('🎨 Equipar') : t('⚔️ Usar na Arena')}
            </button>
            {drop.nft && pubConfig?.web3 && (
              <button className="btn" onClick={() => onGo('/carteira')}>
                {t('✨ Virar NFT')}
              </button>
            )}
            <ShareButton card={{ ro: shareRo, headline: TIER_HEADLINE[drop.tier](), stat: drop.serial ? t('{item} · Drop #{n}', { item: itemName(win), n: drop.serial }) : itemName(win) }} />
            <button className="btn btn-ghost" onClick={onClose}>
              {t('Fechar')}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
