// Gera a imagem vertical (1080x1920, tamanho de Story) para compartilhar no Instagram.
// Carregado só quando o jogador toca em "📸 Compartilhar" (import dinâmico), para não pesar o jogo.
import { renderToStaticMarkup } from 'react-dom/server'
import { appName } from '../brand'
import { BREED_BY_ID } from '../game/data'
import { IG_HANDLE, SITE_LABEL } from '../game/social'
import type { Rooster } from '../game/types'
import { t } from '../i18n'
import { RoosterSvg } from './RoosterSvg'

export interface ShareCardOpts {
  ro: Pick<Rooster, 'name' | 'breedId' | 'level' | 'stars' | 'skin' | 'equipped' | 'tint'>
  /** Manchete grande no topo (ex.: "🏆 VITÓRIA POR K.O.!"). */
  headline: string
  /** Linha de números embaixo do nome (ex.: "12 vitórias · 5 K.O."). */
  stat?: string
}

const W = 1080
const H = 1920
const GOLD = '#ffc640'
const DISPLAY = "'Lilita One', 'Nunito', system-ui, sans-serif"
const BODY = "'Nunito', system-ui, sans-serif"

async function loadFonts() {
  try {
    await Promise.all([document.fonts.load(`96px 'Lilita One'`), document.fonts.load(`800 40px 'Nunito'`), document.fonts.load(`900 40px 'Nunito'`)])
  } catch {
    /* sem a fonte: usa a do sistema */
  }
}

function roosterImage(o: ShareCardOpts['ro'], size: number): Promise<HTMLImageElement> {
  const markup = renderToStaticMarkup(<RoosterSvg breedId={o.breedId} skin={o.skin} equipped={o.equipped ?? {}} tint={o.tint} anim="none" size={size} />)
  const svg = markup.startsWith('<svg xmlns') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  return new Promise((ok, fail) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => fail(new Error(t('Não deu para desenhar o galo.')))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** Escreve centralizado, diminuindo a fonte até caber na largura. */
function fitText(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, maxW: number, font: (px: number) => string, fill: string, stroke?: { color: string; width: number }) {
  let px = size
  ctx.font = font(px)
  while (px > 24 && ctx.measureText(text).width > maxW) {
    px -= 4
    ctx.font = font(px)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  if (stroke) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = stroke.width * (px / size)
    ctx.strokeStyle = stroke.color
    ctx.strokeText(text, W / 2, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(text, W / 2, y)
  return px
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Fundo: arena verde escura com holofote, raios dourados e confete. */
function background(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0b1510')
  bg.addColorStop(0.45, '#14281e')
  bg.addColorStop(1, '#07100b')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Raios saindo de trás do galo
  ctx.save()
  ctx.translate(W / 2, 900)
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-90, -1400)
    ctx.lineTo(90, -1400)
    ctx.closePath()
    ctx.fillStyle = i % 2 ? 'rgba(255,198,64,0.05)' : 'rgba(70,196,122,0.05)'
    ctx.fill()
  }
  ctx.restore()

  // Holofote
  const spot = ctx.createRadialGradient(W / 2, 880, 40, W / 2, 880, 620)
  spot.addColorStop(0, 'rgba(255,214,110,0.35)')
  spot.addColorStop(0.5, 'rgba(70,196,122,0.12)')
  spot.addColorStop(1, 'rgba(11,21,16,0)')
  ctx.fillStyle = spot
  ctx.fillRect(0, 0, W, H)

  // Chão da arena (anel dourado)
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(W / 2, 1075, 420, 95, 0, 0, Math.PI * 2)
  const floor = ctx.createRadialGradient(W / 2, 1075, 20, W / 2, 1075, 420)
  floor.addColorStop(0, '#2c5a40')
  floor.addColorStop(1, '#143222')
  ctx.fillStyle = floor
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = GOLD
  ctx.globalAlpha = 0.8
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.restore()

  // Confete (posições fixas por semente simples, sempre o mesmo desenho)
  let seed = 7
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  const colors = [GOLD, '#46c47a', '#f2a93b', '#e8f3ea']
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W
    const y = 300 + rnd() * 1000
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rnd() * Math.PI)
    ctx.fillStyle = colors[i % colors.length]
    ctx.globalAlpha = 0.35 + rnd() * 0.4
    ctx.fillRect(-7, -3, 14, 6)
    ctx.restore()
  }

  // Moldura
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(255,198,64,0.55)'
  roundRect(ctx, 30, 30, W - 60, H - 60, 44)
  ctx.stroke()
}

/** Desenha o card e devolve o PNG. */
export async function makeShareCard(o: ShareCardOpts): Promise<Blob> {
  await loadFonts()
  // Se o navegador não conseguir rasterizar o galo (ex.: Safari antigo), o card sai mesmo assim.
  let img: HTMLImageElement | null = null
  try {
    img = await roosterImage(o.ro, 720)
  } catch {
    img = null
  }
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  if (!ctx) throw new Error(t('Seu navegador não conseguiu gerar a imagem.'))

  background(ctx)
  const display = (px: number) => `${px}px ${DISPLAY}`
  const body = (px: number) => `800 ${px}px ${BODY}`

  // Marca
  fitText(ctx, appName().toUpperCase(), 330, 96, W - 160, display, GOLD, { color: '#1a0f08', width: 16 })

  // Faixa da manchete
  ctx.save()
  ctx.fillStyle = 'rgba(232,105,42,0.95)'
  ctx.translate(W / 2, 425)
  ctx.rotate(-0.025)
  roundRect(ctx, -430, -56, 860, 112, 28)
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.restore()
  fitText(ctx, o.headline, 448, 70, 800, display, '#fff', { color: '#7a2c0c', width: 10 })

  // Galo
  if (img) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 40
    ctx.drawImage(img, (W - 600) / 2, 505, 600, 600)
    ctx.restore()
  }

  // Placa com nome, raça, nível e estrelas
  const breed = BREED_BY_ID[o.ro.breedId]?.name ?? ''
  ctx.save()
  ctx.fillStyle = 'rgba(16,32,25,0.92)'
  roundRect(ctx, 90, 1125, W - 180, o.stat ? 345 : 285, 36)
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(255,198,64,0.6)'
  ctx.stroke()
  ctx.restore()
  fitText(ctx, o.ro.name, 1222, 92, W - 260, display, '#fff', { color: '#000', width: 8 })
  fitText(ctx, `${breed} · ${t('Nv {n}', { n: o.ro.level })}`, 1290, 46, W - 260, body, '#8fb39d')
  const stars = Math.max(0, Math.min(5, o.ro.stars))
  ctx.font = `58px ${BODY}`
  ctx.textAlign = 'center'
  const full = '★'.repeat(stars)
  const dim = '★'.repeat(5 - stars)
  const wFull = ctx.measureText(full).width
  const wAll = ctx.measureText(full + dim).width
  const x0 = W / 2 - wAll / 2
  ctx.textAlign = 'left'
  ctx.fillStyle = GOLD
  ctx.fillText(full, x0, 1368)
  ctx.fillStyle = 'rgba(255,198,64,0.22)'
  ctx.fillText(dim, x0 + wFull, 1368)
  if (o.stat) fitText(ctx, o.stat, 1432, 42, W - 260, body, GOLD)

  // Rodapé (dentro da área segura do Story: o Instagram cobre ~250 px no topo e ~300 px embaixo)
  fitText(ctx, t('Jogue grátis · {site}', { site: SITE_LABEL }), 1530, 46, W - 160, (px) => `900 ${px}px ${BODY}`, '#e8f3ea')
  fitText(ctx, IG_HANDLE, 1582, 42, W - 160, body, GOLD)
  fitText(ctx, t('Galos de desenho · nenhum animal real'), 1618, 24, W - 160, (px) => `700 ${px}px ${BODY}`, 'rgba(232,243,234,0.5)')

  return new Promise((ok, fail) => cv.toBlob((b) => (b ? ok(b) : fail(new Error(t('Seu navegador não conseguiu gerar a imagem.')))), 'image/png'))
}
