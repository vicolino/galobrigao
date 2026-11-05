import { useId, type ReactNode } from 'react'
import { BREED_BY_ID, SKIN_BY_ID } from '../game/data'
import type { Pattern, SkinFx, Slot } from '../game/types'

export type Anim = 'idle' | 'attack' | 'hit' | 'ko' | 'win' | 'special' | 'defend' | 'miss' | 'none'

interface Props {
  breedId: string
  skin?: string
  equipped?: Partial<Record<Slot, string>>
  flip?: boolean
  anim?: Anim
  size?: number | string
  className?: string
}

// Formas principais (coordenadas do viewBox 220x220, galo virado para a direita)
const BODY = { cx: 100, cy: 136, rx: 56, ry: 44 }
const CHEST = { cx: 134, cy: 126, rx: 30, ry: 34 }
const MANE = { cx: 138, cy: 98, r: 26 }
const HEAD = { cx: 146, cy: 72, r: 24 }
const MANE_TIPS = [
  [118, 114],
  [127, 121],
  [138, 125],
  [149, 123],
]
// Acessórios de cabeça/rosto foram desenhados para uma cabeça em (152,56) r19.
const HEAD_ACC = `translate(${HEAD.cx - 152 * (HEAD.r / 19)},${HEAD.cy - 56 * (HEAD.r / 19)}) scale(${HEAD.r / 19})`

const GRADIENT_FX: SkinFx[] = ['fogo', 'arcoiris', 'galaxia', 'ouro', 'robo', 'lava', 'gelo']

export function RoosterSvg({ breedId, skin, equipped = {}, flip, anim = 'idle', size = 200, className = '' }: Props) {
  const uid = useId().replace(/:/g, '')
  const breed = BREED_BY_ID[breedId] ?? BREED_BY_ID.caipira
  const sk = skin ? SKIN_BY_ID[skin] : undefined
  const c = sk ? sk.colors : breed.colors
  const fx = sk?.fx
  const pattern: Pattern | null = sk ? null : breed.pattern
  const ko = anim === 'ko'
  const e = equipped
  const outline = fx === 'neon' ? c.tail2 : fx === 'fantasma' ? '#8f86d9' : '#1a0f08'
  const bodyFill = fx && GRADIENT_FX.includes(fx) ? `url(#skin-${uid})` : c.body
  const headFill = fx && GRADIENT_FX.includes(fx) ? `url(#skin-${uid})` : c.neck
  const clip = `url(#body-${uid})`

  return (
    <svg
      viewBox="0 0 220 220"
      // Tamanho fluido (ex.: "100%"): largura do contêiner e altura proporcional (o viewBox é quadrado).
      // Evita o Safari do iPhone inflar o SVG quando a altura do pai não é definida.
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={`rooster ${fx ? `fx-${fx}` : ''} ${className}`}
      style={{
        transform: flip ? 'scaleX(-1)' : undefined,
        overflow: 'visible',
        ...(typeof size === 'number' ? {} : { width: size, height: 'auto', aspectRatio: '1 / 1', maxWidth: '100%' }),
      }}
    >
      <defs>
        <clipPath id={`body-${uid}`}>
          <ellipse {...BODY} />
          <ellipse {...CHEST} />
          <circle cx={MANE.cx} cy={MANE.cy} r={MANE.r} />
          <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
        </clipPath>
        <radialGradient id={`shade-${uid}`} cx="0.35" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
        <linearGradient id={`gold-${uid}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff6c8" stopOpacity="0.7" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#7a4a00" stopOpacity="0.35" />
        </linearGradient>
        <SkinGradient id={`skin-${uid}`} fx={fx} />
      </defs>

      <ellipse cx="105" cy="203" rx="58" ry="8" fill="#000" opacity="0.3" />

      <g className={`r-anim r-${anim}`}>
        {fx === 'sombra' || fx === 'fogo' || fx === 'lava' ? <ellipse cx="104" cy="120" rx="80" ry="70" fill={fx === 'sombra' ? '#5b1030' : '#ff6a1f'} opacity="0.18" className="fx-aura" /> : null}

        {e.corpo === 'capa' && (
          <path d="M128,96 C96,90 50,112 26,172 C52,162 70,178 94,168 C100,140 114,118 136,106 Z" fill="#c92a35" stroke="#5e1018" strokeWidth="3.5" strokeLinejoin="round" />
        )}

        {/* Cauda: penas grossas e arredondadas */}
        <g className="r-tail" strokeLinecap="round" fill="none">
          {[
            ['M72,120 Q38,96 40,46', 22, c.tail],
            ['M66,128 Q24,118 14,74', 20, c.tail2],
            ['M76,114 Q56,80 70,30', 18, c.tail2],
            ['M64,136 Q30,142 12,116', 18, c.tail],
            ['M82,110 Q76,76 98,44', 15, c.tail],
          ].map(([d, w, col], i) => (
            <g key={i}>
              <path d={d as string} stroke={outline} strokeWidth={(w as number) + 6} />
              <path d={d as string} stroke={col as string} strokeWidth={w as number} />
            </g>
          ))}
          {fx === 'fogo' && (
            <g className="fx-flames">
              <circle cx="40" cy="44" r="7" fill="#ffe14a" />
              <circle cx="14" cy="72" r="6" fill="#ffb020" />
              <circle cx="70" cy="28" r="6" fill="#ffe14a" />
            </g>
          )}
        </g>

        {/* Pernas fortes */}
        <g className="r-legs">
          <ellipse cx="90" cy="168" rx="15" ry="15" fill={bodyFill} stroke={outline} strokeWidth="3" />
          <ellipse cx="120" cy="168" rx="15" ry="15" fill={bodyFill} stroke={outline} strokeWidth="3" />
          <g stroke={outline} strokeWidth="12" strokeLinecap="round" fill="none">
            <path d="M89,178 L87,196 M87,196 L74,199 M87,196 L99,200" />
            <path d="M121,178 L121,196 M121,196 L134,199 M121,196 L110,200" />
          </g>
          <g stroke={c.legs} strokeWidth="7" strokeLinecap="round" fill="none">
            <path d="M89,178 L87,196" />
            <path d="M87,196 L74,199 M87,196 L99,200" strokeWidth="5" />
            <path d="M121,178 L121,196" />
            <path d="M121,196 L134,199 M121,196 L110,200" strokeWidth="5" />
            <path d="M88,188 L80,186 M120,188 L113,186" strokeWidth="4" />
          </g>
        </g>

        <Feet kind={e.pes} />

        {/* Silhueta: contorno grosso por baixo, preenchimento por cima */}
        <g stroke={outline} strokeWidth="7">
          <ellipse {...BODY} fill={outline} />
          <ellipse {...CHEST} fill={outline} />
          <circle cx={MANE.cx} cy={MANE.cy} r={MANE.r} fill={outline} />
          {MANE_TIPS.map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="8" fill={outline} />
          ))}
        </g>
        <ellipse {...BODY} fill={bodyFill} />
        <ellipse {...CHEST} fill={bodyFill} />
        <circle cx={MANE.cx} cy={MANE.cy} r={MANE.r} fill={headFill} />
        {MANE_TIPS.map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="8" fill={headFill} />
        ))}

        {/* Padrões e efeitos de skin no corpo */}
        <g clipPath={clip}>
          {pattern === 'carijo' &&
            Array.from({ length: 16 }).map((_, i) => <path key={i} d={`M40,${48 + i * 9} q30,-6 60,0 t60,0 t60,0`} stroke="#2f2f2f" strokeWidth="4" fill="none" opacity="0.7" />)}
          {pattern === 'pintado' && Array.from({ length: 34 }).map((_, i) => <circle key={i} cx={56 + ((i * 37) % 110)} cy={60 + ((i * 53) % 120)} r={2.6 + (i % 3)} fill="#fff" opacity="0.8" />)}
          {pattern === 'dourado' && <rect width="220" height="220" fill={`url(#gold-${uid})`} />}
          <BodyFx fx={fx} />
          <rect width="220" height="220" fill={`url(#shade-${uid})`} />
          {/* Peitoral marcado */}
          <path d="M120,112 Q136,124 132,150" stroke="#000" strokeOpacity="0.22" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>

        {/* Asa musculosa */}
        <g className="r-wing">
          <path
            d="M66,126 C72,106 112,102 128,122 C134,136 128,150 116,154 C110,160 100,158 96,154 C90,160 80,158 76,152 C66,150 62,138 66,126 Z"
            fill={fx === 'melancia' ? c.wing : fx && GRADIENT_FX.includes(fx) ? `url(#skin-${uid})` : c.wing}
            stroke={outline}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M78,136 Q98,132 120,130 M84,146 Q100,142 116,140" stroke="#000" strokeOpacity="0.25" strokeWidth="3" fill="none" strokeLinecap="round" />
          {fx === 'melancia' && [[84, 136], [98, 132], [110, 140], [92, 146], [104, 148]].map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="2" ry="3.2" fill="#111" />)}
          {fx === 'zumbi' && <path d="M80,128 L118,146" stroke="#2a2a2a" strokeWidth="2" strokeDasharray="4 3" />}
        </g>

        <BodyMark breedId={breed.id} clip={clip} outline={outline} />
        <BodyAcc kind={e.corpo} clip={clip} />

        {/* Cabeça */}
        <g className="r-head">
          <g stroke={outline} strokeWidth="6">
            <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={outline} />
          </g>
          {/* Crista: lobos arredondados */}
          <g stroke={outline} strokeWidth="3.5" fill={c.comb} opacity={breed.id === 'trump' ? 0 : 1}>
            <circle cx="128" cy="54" r="9" />
            <circle cx="139" cy="46" r="11" />
            <circle cx="152" cy="46" r="10" />
            <circle cx="162" cy="54" r="7.5" />
          </g>
          <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={headFill} />
          <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={`url(#shade-${uid})`} />
          {fx === 'robo' && !e.cabeca && (
            <g>
              <path d="M146,48 L146,30" stroke="#5d656e" strokeWidth="3" />
              <circle cx="146" cy="28" r="4" fill="#e5484d" className="fx-blink" />
            </g>
          )}
          {fx === 'zumbi' && <path d="M132,66 L144,82 M134,72 L139,70 M137,77 L142,75" stroke="#2a2a2a" strokeWidth="2" />}
          {/* Barbela */}
          <ellipse cx="164" cy="94" rx="7" ry="10" fill={c.comb} stroke={outline} strokeWidth="3" />
          {breed.id === 'lula' && (
            <g fill="#c9c9c9" stroke={outline} strokeWidth="2.5">
              <circle cx="141" cy="90" r="7" />
              <circle cx="150" cy="96" r="8.5" />
              <circle cx="161" cy="97" r="8.5" />
              <circle cx="170" cy="91" r="7" />
              <path d="M146,94 Q156,100 166,94" stroke="#9a9a9a" strokeWidth="2" fill="none" />
            </g>
          )}
          {/* Bico curvo e forte */}
          <path d="M166,68 Q184,68 190,80 Q178,80 166,82 Z" fill="#f2b233" stroke={outline} strokeWidth="3" strokeLinejoin="round" />
          <path d="M166,82 Q178,82 184,84 Q176,90 166,88 Z" fill="#d9951c" stroke={outline} strokeWidth="3" strokeLinejoin="round" />
          {/* Olho bravo */}
          {ko ? (
            <path d="M149,64 L159,74 M159,64 L149,74" stroke="#111" strokeWidth="3.5" strokeLinecap="round" />
          ) : (
            <g>
              <ellipse cx="155" cy="70" rx="7" ry="6" fill={fx === 'sombra' ? '#2a0008' : '#fff'} stroke={outline} strokeWidth="2" />
              <circle cx="157" cy="71" r="3.4" fill={fx === 'sombra' ? '#ff1f3d' : fx === 'zumbi' ? '#c9d36a' : fx === 'neon' ? c.tail2 : '#111'} className={fx === 'sombra' || fx === 'neon' ? 'fx-eye' : ''} />
              {/* Pálpebra pesada + sobrancelha franzida */}
              <path d="M146,61 L166,67 L166,63 L146,57 Z" fill={headFill} />
              <path d="M145,61 L166,68" stroke={outline} strokeWidth={anim === 'attack' || anim === 'special' ? 6 : 5} strokeLinecap="round" />
            </g>
          )}
          {breed.id === 'trump' && !e.cabeca && <Combover outline={outline} />}
          {/* Cicatriz */}
          <path d="M140,80 L150,88" stroke="#000" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />

          <g transform={HEAD_ACC}>
            <FaceAcc kind={e.rosto} />
            <HeadAcc kind={e.cabeca} />
          </g>
        </g>

        {ko && (
          <g className="r-stars">
            <text x="132" y="24" fontSize="16">⭐</text>
            <text x="160" y="18" fontSize="12">💫</text>
            <text x="112" y="16" fontSize="12">✨</text>
          </g>
        )}
        {(fx === 'ouro' || fx === 'gelo' || fx === 'galaxia') && (
          <g className="fx-sparkle">
            <text x="40" y="100" fontSize="12">✦</text>
            <text x="170" y="130" fontSize="10">✦</text>
            <text x="96" y="80" fontSize="9">✦</text>
          </g>
        )}
      </g>
    </svg>
  )
}

/** Topete loiro penteado para a frente (Edição Especial EUA). */
function Combover({ outline }: { outline: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* volume de trás até a testa, terminando numa onda sobre o olho */}
      <path
        d="M118,70 C112,52 120,36 140,32 C160,28 180,34 186,46 C188,54 182,60 174,58 C170,64 162,62 160,56 C150,58 136,56 126,64 C124,68 121,72 118,70 Z"
        fill="#f4c542"
        stroke={outline}
        strokeWidth="3.5"
      />
      {/* fios penteados */}
      <path d="M124,56 C134,42 156,36 176,44 M128,62 C140,50 158,46 178,52 M132,46 C146,36 164,34 180,40" stroke="#c9961a" strokeWidth="2.2" fill="none" />
      {/* brilho */}
      <path d="M138,38 C150,33 164,33 172,37" stroke="#fff3b0" strokeWidth="2.5" fill="none" opacity="0.8" />
    </g>
  )
}

/** Marcas da Edição Eleições (desenhadas por cima do corpo, mesmo com skin). */
function BodyMark({ breedId, clip, outline }: { breedId: string; clip: string; outline: string }) {
  if (breedId === 'lula') {
    const cx = 140
    const cy = 138
    const pts = Array.from({ length: 10 }).map((_, i) => {
      const r = i % 2 === 0 ? 13 : 5.5
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    })
    return <polygon points={pts.join(' ')} fill="#fff" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
  }
  if (breedId === 'trump') {
    // Colarinho branco + gravata vermelha comprida
    return (
      <g stroke={outline} strokeLinejoin="round">
        <path d="M128,104 L142,118 L156,102 L150,98 L142,108 L134,98 Z" fill="#fff" strokeWidth="2.5" />
        <path d="M138,112 L146,112 L144,120 L140,120 Z" fill="#c8102e" strokeWidth="2.2" />
        <path d="M140,120 L144,120 L150,166 L142,176 L134,166 Z" fill="#c8102e" strokeWidth="2.5" />
        <path d="M141,132 L147,140 M139,148 L148,156" stroke="#8a0a1f" strokeWidth="2" />
      </g>
    )
  }
  if (breedId === 'bolsonaro') {
    return (
      <g>
        <g clipPath={clip}>
          <path d="M160,92 L178,104 L82,196 L64,184 Z" fill="#ffd23f" />
          <path d="M162,98 L172,105 L80,190 L70,183 Z" fill="#1f9d4a" />
        </g>
        <circle cx="122" cy="142" r="8" fill="#1e4fa8" stroke={outline} strokeWidth="2" />
        <path d="M115,140 Q122,137 129,143" stroke="#fff" strokeWidth="1.8" fill="none" />
      </g>
    )
  }
  return null
}

function SkinGradient({ id, fx }: { id: string; fx?: SkinFx }) {
  const stops: Partial<Record<SkinFx, string[]>> = {
    fogo: ['#ffe14a', '#ff8a1f', '#d42a12'],
    arcoiris: ['#ff5e62', '#ffb347', '#ffe14a', '#5fd07a', '#4fa3ff', '#b57bff'],
    galaxia: ['#5a3ac8', '#2a1a5e', '#0d0826'],
    ouro: ['#fff3a8', '#f5c542', '#b07d0a'],
    robo: ['#e2e7ec', '#9aa3ad', '#5d656e'],
    lava: ['#4a2216', '#2a1410', '#140806'],
    gelo: ['#f2fbff', '#bfe6ff', '#7cbde9'],
  }
  const list = fx ? stops[fx] : undefined
  if (!list) return null
  const horizontal = fx === 'arcoiris'
  return (
    <linearGradient id={id} x1="0" y1="0" x2={horizontal ? '1' : '0.3'} y2={horizontal ? '0' : '1'}>
      {list.map((col, i) => (
        <stop key={i} offset={i / (list.length - 1)} stopColor={col} />
      ))}
    </linearGradient>
  )
}

function BodyFx({ fx }: { fx?: SkinFx }) {
  let out: ReactNode = null
  switch (fx) {
    case 'malhado':
      out = [[70, 120, 18, 13], [118, 150, 16, 12], [140, 100, 10, 8], [92, 160, 10, 7], [150, 66, 9, 7], [60, 150, 9, 8]].map(([x, y, rx, ry], i) => (
        <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill="#1d1d1d" transform={`rotate(${i * 25} ${x} ${y})`} />
      ))
      break
    case 'camuflado':
      out = [[64, 118, '#2d351c'], [96, 150, '#8a7a4a'], [126, 110, '#2d351c'], [146, 140, '#8a7a4a'], [84, 100, '#6f7f45'], [140, 72, '#2d351c'], [112, 168, '#2d351c']].map(([x, y, col], i) => (
        <ellipse key={i} cx={x as number} cy={y as number} rx="15" ry="9" fill={col as string} transform={`rotate(${i * 40} ${x} ${y})`} />
      ))
      break
    case 'melancia':
      out = Array.from({ length: 8 }).map((_, i) => <path key={i} d={`M${48 + i * 16},80 q8,50 -4,110`} stroke="#1f5c1b" strokeWidth="6" fill="none" opacity="0.8" />)
      break
    case 'zumbi':
      out = (
        <>
          <rect x="110" y="132" width="20" height="16" rx="3" fill="#b9a27a" stroke="#4a3a2a" strokeWidth="1.5" />
          <path d="M60,128 Q90,110 120,118" stroke="#2a2a2a" strokeWidth="2" fill="none" strokeDasharray="5 3" />
          <path d="M74,116 L76,124 M86,113 L88,121 M98,112 L99,120" stroke="#2a2a2a" strokeWidth="1.8" />
        </>
      )
      break
    case 'robo':
      out = (
        <>
          <path d="M60,128 L160,128 M100,92 L100,180" stroke="#4b535c" strokeWidth="2" />
          {[[66, 122], [154, 122], [94, 98], [106, 172], [130, 96], [142, 156]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="2.6" fill="#4b535c" />
          ))}
        </>
      )
      break
    case 'gelo':
      out = [[70, 116], [128, 140], [104, 168], [146, 92], [86, 150]].map(([x, y], i) => (
        <path key={i} d={`M${x},${y - 8} L${x + 5},${y} L${x},${y + 8} L${x - 5},${y} Z`} fill="#fff" opacity="0.75" />
      ))
      break
    case 'galaxia':
      out = Array.from({ length: 26 }).map((_, i) => (
        <circle key={i} cx={52 + ((i * 41) % 116)} cy={56 + ((i * 29) % 126)} r={i % 5 === 0 ? 1.8 : 1} fill="#fff" className={i % 3 === 0 ? 'fx-twinkle' : ''} />
      ))
      break
    case 'lava':
      out = (
        <g className="fx-lava" stroke="#ff7a1f" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M56,124 L72,132 L80,122 L96,136 L108,128" />
          <path d="M120,150 L132,140 L146,152 L156,140" />
          <path d="M88,160 L98,152 L112,166" />
          <path d="M136,86 L146,96 L156,88" />
          <path d="M130,108 L142,116" />
        </g>
      )
      break
    case 'arcoiris':
      out = <rect width="220" height="220" fill="#fff" opacity="0.08" />
      break
    case 'neon':
      out = (
        <g stroke="#ff2fd0" strokeWidth="2.5" fill="none" opacity="0.9">
          <path d="M60,140 Q100,120 150,140" />
          <path d="M70,160 Q110,146 150,160" />
        </g>
      )
      break
  }
  return <>{out}</>
}

function HeadAcc({ kind }: { kind?: string }) {
  switch (kind) {
    case 'bone':
      return (
        <g>
          <path d="M134,44 C134,26 168,24 170,42 Z" fill="#2563eb" stroke="#1e3a8a" strokeWidth="2" />
          <path d="M160,40 L188,44 C186,48 168,48 158,46 Z" fill="#1e40af" />
          <circle cx="152" cy="28" r="2.5" fill="#1e3a8a" />
        </g>
      )
    case 'chapeu-palha':
      return (
        <g>
          <ellipse cx="152" cy="40" rx="34" ry="7" fill="#e9c46a" stroke="#b08a2e" strokeWidth="2" />
          <path d="M136,40 C136,22 168,22 168,40 Z" fill="#f4d58d" stroke="#b08a2e" strokeWidth="2" />
          <path d="M137,35 L167,35" stroke="#c0392b" strokeWidth="4" />
        </g>
      )
    case 'bandana':
      return (
        <g>
          <path d="M134,44 C140,36 164,36 172,44 L170,50 C160,44 144,44 136,50 Z" fill="#b91c1c" stroke="#450a0a" strokeWidth="1.5" />
          <path d="M136,48 C126,50 118,60 116,66 C124,60 130,56 138,52 Z" fill="#b91c1c" />
          <path d="M136,48 C128,46 118,48 112,52 C122,52 128,52 136,51 Z" fill="#991b1b" />
        </g>
      )
    case 'cowboy':
      return (
        <g>
          <path d="M116,42 C130,48 174,48 188,40 C182,48 170,52 152,52 C134,52 120,48 116,42 Z" fill="#7c4a1e" stroke="#4a2a0e" strokeWidth="2" />
          <path d="M136,44 C134,22 142,18 152,24 C162,18 170,22 168,44 Z" fill="#8b5a2b" stroke="#4a2a0e" strokeWidth="2" />
          <path d="M136,40 L168,40" stroke="#3b2208" strokeWidth="4" />
        </g>
      )
    case 'viking':
      return (
        <g>
          <path d="M138,40 C120,36 112,22 116,10 C120,22 128,28 140,32 Z" fill="#f5f0e1" stroke="#8a8170" strokeWidth="2" />
          <path d="M166,40 C182,34 190,22 186,10 C182,22 174,28 164,32 Z" fill="#f5f0e1" stroke="#8a8170" strokeWidth="2" />
          <path d="M132,46 C130,24 174,24 172,46 Z" fill="#9ca3af" stroke="#4b5563" strokeWidth="2.5" />
          <path d="M132,44 L172,44" stroke="#6b7280" strokeWidth="5" />
          <path d="M152,28 L152,44" stroke="#6b7280" strokeWidth="3" />
        </g>
      )
    case 'coroa':
      return (
        <g>
          <path d="M134,42 L134,22 L143,32 L152,16 L161,32 L170,22 L170,42 Z" fill="#facc15" stroke="#a16207" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="152" cy="34" r="3" fill="#e11d48" />
          <circle cx="141" cy="37" r="2" fill="#2563eb" />
          <circle cx="163" cy="37" r="2" fill="#16a34a" />
        </g>
      )
    default:
      return null
  }
}

function FaceAcc({ kind }: { kind?: string }) {
  switch (kind) {
    case 'oculos':
      return (
        <g>
          <path d="M140,51 L173,51" stroke="#111" strokeWidth="2.5" />
          <rect x="147" y="47" width="19" height="10" rx="4" fill="#111" />
          <path d="M150,50 L158,50" stroke="#5eead4" strokeWidth="1.4" opacity="0.7" />
        </g>
      )
    case 'tapa-olho':
      return (
        <g>
          <path d="M136,44 L170,60" stroke="#111" strokeWidth="2" />
          <ellipse cx="158" cy="52" rx="7" ry="6" fill="#111" />
        </g>
      )
    case 'monoculo':
      return (
        <g>
          <circle cx="158" cy="52" r="7" fill="none" stroke="#d4a017" strokeWidth="2.2" />
          <path d="M158,59 C156,70 150,78 146,90" stroke="#d4a017" strokeWidth="1.2" fill="none" strokeDasharray="2 1.5" />
        </g>
      )
    case 'visor':
      return (
        <g>
          <path d="M136,46 L176,46 L174,56 L138,58 Z" fill="#06b6d4" opacity="0.85" stroke="#0e7490" strokeWidth="2" />
          <path d="M140,50 L170,50" stroke="#cffafe" strokeWidth="1.5" />
          <circle cx="160" cy="52" r="2" fill="#ef4444" />
        </g>
      )
    case 'bigode':
      return <path d="M164,68 C170,62 176,64 178,70 C182,66 188,68 188,74 C182,72 178,76 172,72 C168,76 162,74 164,68 Z" fill="#3b2208" />
    default:
      return null
  }
}

function BodyAcc({ kind, clip }: { kind?: string; clip: string }) {
  switch (kind) {
    case 'cachecol':
      return (
        <g>
          <path d="M116,104 Q140,124 168,104 L170,116 Q140,138 114,116 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" />
          <path d="M126,118 L118,150 L130,152 L138,122 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" />
          <path d="M122,132 L134,134 M120,142 L131,144" stroke="#fff" strokeWidth="3" />
        </g>
      )
    case 'colete':
      return (
        <g clipPath={clip}>
          <rect x="62" y="104" width="110" height="90" fill="#f97316" opacity="0.95" />
          <path d="M62,136 L172,136 M62,156 L172,156" stroke="#fde047" strokeWidth="5" />
          <path d="M118,104 L118,190" stroke="#9a3412" strokeWidth="2" />
        </g>
      )
    case 'cinturao':
      return (
        <g>
          <g clipPath={clip}>
            <rect x="40" y="146" width="140" height="15" fill="#1f1f1f" />
          </g>
          <ellipse cx="132" cy="153" rx="15" ry="11" fill="#facc15" stroke="#a16207" strokeWidth="2" />
          <text x="125" y="158" fontSize="12">🏆</text>
        </g>
      )
    case 'gravata':
      return (
        <g>
          <path d="M150,116 L138,108 L138,124 Z M150,116 L162,108 L162,124 Z" fill="#db2777" stroke="#831843" strokeWidth="1.5" />
          <circle cx="150" cy="116" r="3.5" fill="#be185d" />
        </g>
      )
    default:
      return null
  }
}

function Feet({ kind }: { kind?: string }) {
  const xs = [87, 121]
  switch (kind) {
    case 'tenis':
      return (
        <g>
          {xs.map((x) => (
            <g key={x}>
              <path d={`M${x - 11},201 C${x - 11},190 ${x + 6},190 ${x + 15},198 L${x + 15},204 L${x - 11},204 Z`} fill="#ef4444" stroke="#7f1d1d" strokeWidth="1.5" />
              <path d={`M${x - 11},202 L${x + 15},202`} stroke="#fff" strokeWidth="2.5" />
            </g>
          ))}
        </g>
      )
    case 'botas':
      return (
        <g>
          {xs.map((x) => (
            <path key={x} d={`M${x - 7},178 L${x + 5},178 L${x + 5},194 L${x + 15},198 L${x + 15},205 L${x - 9},205 Z`} fill="#6b3f1d" stroke="#3b2208" strokeWidth="1.5" />
          ))}
        </g>
      )
    case 'patins':
      return (
        <g>
          {xs.map((x) => (
            <g key={x}>
              <path d={`M${x - 11},190 L${x + 4},190 L${x + 4},195 L${x + 15},197 L${x + 15},203 L${x - 11},203 Z`} fill="#a855f7" stroke="#581c87" strokeWidth="1.5" />
              <circle cx={x - 6} cy={208} r="3.5" fill="#fde047" stroke="#713f12" />
              <circle cx={x + 10} cy={208} r="3.5" fill="#fde047" stroke="#713f12" />
            </g>
          ))}
        </g>
      )
    case 'chinelo':
      return (
        <g>
          {xs.map((x) => (
            <g key={x}>
              <ellipse cx={x + 2} cy={203} rx="15" ry="3.5" fill="#22c55e" stroke="#14532d" strokeWidth="1.2" />
              <path d={`M${x - 4},202 L${x + 2},196 L${x + 8},202`} stroke="#facc15" strokeWidth="2.5" fill="none" />
            </g>
          ))}
        </g>
      )
    default:
      return null
  }
}
