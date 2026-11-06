// Efeitos sonoros sintetizados com WebAudio (não precisa de arquivos).
let ctx: AudioContext | null = null
let volume = 0.4
let muted = false

export function setAudio(v: number, m: boolean) {
  volume = v
  muted = m
}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.3, slide = 0, delay = 0) {
  if (muted || volume <= 0) return
  try {
    const c = ac()
    const t = c.currentTime + delay
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur)
    g.gain.setValueAtTime(gain * volume, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(c.destination)
    o.start(t)
    o.stop(t + dur + 0.02)
  } catch {
    /* sem áudio */
  }
}

function noise(dur: number, gain = 0.3, delay = 0) {
  if (muted || volume <= 0) return
  try {
    const c = ac()
    const t = c.currentTime + delay
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
    const s = c.createBufferSource()
    const g = c.createGain()
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1800
    s.buffer = buf
    g.gain.value = gain * volume
    s.connect(f).connect(g).connect(c.destination)
    s.start(t)
  } catch {
    /* sem áudio */
  }
}

// ---------- Peças da vinheta de entrada ----------

function kick(delay: number, gain = 0.7) {
  tone(150, 0.28, 'sine', gain, -105, delay)
}

/** Ruído com filtro passa-alta (prato/palma). */
function hiNoise(dur: number, gain: number, delay: number, cutoff = 5000) {
  if (muted || volume <= 0) return
  try {
    const c = ac()
    const t = c.currentTime + delay
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2)
    const src = c.createBufferSource()
    const f = c.createBiquadFilter()
    const g = c.createGain()
    f.type = 'highpass'
    f.frequency.value = cutoff
    src.buffer = buf
    g.gain.value = gain * volume
    src.connect(f).connect(g).connect(c.destination)
    src.start(t)
  } catch {
    /* sem áudio */
  }
}

/** Acorde "distorcido" (ondas dente-de-serra com filtro), estilo guitarra/metais. */
function stab(freqs: number[], dur: number, delay: number, gain = 0.12) {
  if (muted || volume <= 0) return
  try {
    const c = ac()
    const t = c.currentTime + delay
    const f = c.createBiquadFilter()
    const g = c.createGain()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(2400, t)
    f.frequency.exponentialRampToValueAtTime(500, t + dur)
    g.gain.setValueAtTime(gain * volume, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    f.connect(g).connect(c.destination)
    for (const fr of freqs) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = fr
        o.detune.value = det
        o.connect(f)
        o.start(t)
        o.stop(t + dur + 0.05)
      }
    }
  } catch {
    /* sem áudio */
  }
}


/** Torcida gritando: ruído com filtro passa-banda que cresce e some. */
function crowd(dur: number, delay: number, gain = 0.12) {
  if (muted || volume <= 0) return
  try {
    const c = ac()
    const t = c.currentTime + delay
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    const f = c.createBiquadFilter()
    const g = c.createGain()
    f.type = 'bandpass'
    f.frequency.value = 700
    f.Q.value = 0.8
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain * volume, t + dur * 0.3)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    src.buffer = buf
    src.connect(f).connect(g).connect(c.destination)
    src.start(t)
  } catch {
    /* sem áudio */
  }
}

/** Apito do mestre de bateria (seno agudo com trinado). */
function apito(dur: number, delay: number, gain = 0.09) {
  if (muted || volume <= 0) return
  try {
    const c = ac()
    const t = c.currentTime + delay
    const o = c.createOscillator()
    const lfo = c.createOscillator()
    const lg = c.createGain()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.value = 2700
    lfo.frequency.value = 28
    lg.gain.value = 140
    lfo.connect(lg).connect(o.frequency)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain * volume, t + 0.015)
    g.gain.setValueAtTime(gain * volume, t + dur - 0.03)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(c.destination)
    o.start(t)
    lfo.start(t)
    o.stop(t + dur + 0.02)
    lfo.stop(t + dur + 0.02)
  } catch {
    /* sem áudio */
  }
}

/** Surdo: grave com queda de afinação. `abafado` = mão no couro (curto). */
const surdo = (freq: number, delay: number, gain = 0.9, abafado = false) => tone(freq, abafado ? 0.12 : 0.55, 'sine', gain, -freq * 0.35, delay)
const caixa = (delay: number, acento: boolean) => {
  hiNoise(0.07, acento ? 0.32 : 0.14, delay, 1400)
  tone(240, 0.04, 'triangle', acento ? 0.12 : 0.05, -60, delay)
}
const tamborim = (delay: number) => tone(980, 0.035, 'square', 0.1, -200, delay)
const chocalho = (delay: number, acento: boolean) => hiNoise(0.045, acento ? 0.12 : 0.06, delay, 6500)
const repique = (delay: number, gain = 0.35) => {
  tone(380, 0.09, 'triangle', gain, -120, delay)
  hiNoise(0.05, gain * 0.6, delay, 2500)
}

/**
 * Bateria de escola de samba (~3,4 s; `curta` ~1,7 s):
 * apito do mestre → chamada do repique → bateria completa → paradinha final.
 */
function charanga(curta: boolean) {
  const q = 60 / 140 // tempo (2 tempos por compasso)
  const s16 = q / 4
  let t0 = 0
  if (!curta) {
    apito(0.16, 0)
    apito(0.16, 0.22)
    apito(0.34, 0.44)
    t0 = 0.86
  }
  // Chamada do repique: tá-tá-tá . tá-tá . tá
  ;[0, 1, 2, 4, 5, 7].forEach((k) => repique(t0 + k * s16, k === 7 ? 0.5 : 0.35))
  t0 += 2 * q
  const compassos = curta ? 1 : 2
  // Teleco-teco do tamborim (2 compassos = 16 semicolcheias)
  const teleco = [0, 2, 3, 5, 7, 9, 10, 12, 14]
  for (let m = 0; m < compassos; m++) {
    const c0 = t0 + m * 2 * q
    surdo(78, c0, 0.7) // segunda (tempo 1)
    surdo(78, c0 + q * 0.5, 0.25, true)
    surdo(62, c0 + q, 1) // primeira (tempo 2, o mais forte)
    surdo(92, c0 + 3 * s16, 0.4) // terceira, sincopado
    surdo(92, c0 + q + 2 * s16, 0.35)
    for (let k = 0; k < 8; k++) {
      const at = c0 + k * s16
      caixa(at, k % 4 === 1 || k % 4 === 3)
      chocalho(at, k % 2 === 1)
      if (teleco.includes((m % 2) * 8 + k)) tamborim(at)
    }
    tone(m % 2 ? 640 : 900, 0.08, 'square', 0.07, 0, c0) // agogô
    tone(m % 2 ? 900 : 640, 0.08, 'square', 0.06, 0, c0 + q)
    tone(900, 0.08, 'square', 0.06, 0, c0 + q + 2 * s16)
  }
  // Paradinha: todos juntos num golpe só + torcida
  const fim = t0 + compassos * 2 * q
  surdo(62, fim, 1)
  surdo(78, fim, 0.7)
  repique(fim, 0.5)
  hiNoise(0.6, 0.25, fim, 1200)
  if (!curta) apito(0.5, fim + 0.05, 0.07)
  crowd(fim + 0.8, 0.2, curta ? 0.07 : 0.11)
}

export const sfx = {
  /** Vinheta de entrada (~2,8 s, 128 BPM): bumbo, palmas, acordes, subida e impacto no "VS". */
  walkout: () => {
    const b = 60 / 128
    const E = [82.4, 123.5, 164.8] // Mi (power chord)
    const G = [98, 146.8, 196] // Sol
    const A = [110, 164.8, 220] // Lá
    ;[0, 1, 2].forEach((i) => kick(i * b))
    ;[0.5, 1.5].forEach((i) => hiNoise(0.12, 0.35, i * b, 1500))
    stab(E, 0.42, 0)
    stab(G, 0.3, b * 1.5)
    stab(A, 0.4, b * 2)
    tone(220, b * 1.0, 'sawtooth', 0.06, 660, b * 2) // subida antes do VS
    hiNoise(0.6, 0.08, b * 2.2, 3000)
    // IMPACTO no VS
    const hit = b * 3
    kick(hit, 1)
    tone(55, 0.9, 'sine', 0.5, -20, hit)
    stab([...E, 329.6], 1.1, hit, 0.16)
    hiNoise(1.4, 0.3, hit, 4000)
    ;[4, 5].forEach((i) => kick(i * b, 0.5))
    stab(E, 0.25, b * 5, 0.1)
  },

  /** Bateria de samba da Banda do Terreiro (~3,4 s). `curta` = ~1,7 s, no início de cada round. */
  charanga: (curta = false) => charanga(curta),
  /** Brilho de ferramenta ativando. */
  powerup: () => {
    ;[523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.16, 0, i * 0.05))
    hiNoise(0.3, 0.06, 0.1, 6000)
  },
  /** "Ding" curto quando uma ferramenta ajuda num golpe. */
  proc: () => tone(1320, 0.09, 'triangle', 0.1, 400),
  click: () => tone(660, 0.05, 'square', 0.12),
  coin: () => {
    tone(988, 0.08, 'square', 0.2)
    tone(1319, 0.18, 'square', 0.2, 0, 0.08)
  },
  hit: () => {
    noise(0.12, 0.5)
    tone(180, 0.12, 'sawtooth', 0.25, -120)
  },
  crit: () => {
    noise(0.2, 0.7)
    tone(120, 0.25, 'sawtooth', 0.35, -80)
    tone(880, 0.1, 'square', 0.15, 0, 0.05)
  },
  miss: () => tone(900, 0.15, 'sine', 0.15, -600),
  bell: () => {
    tone(1200, 0.6, 'sine', 0.3)
    tone(1800, 0.4, 'sine', 0.12)
  },
  special: () => {
    for (let i = 0; i < 5; i++) tone(400 + i * 120, 0.09, 'square', 0.15, 0, i * 0.06)
  },
  ko: () => {
    tone(400, 0.6, 'sawtooth', 0.3, -340)
    noise(0.4, 0.5, 0.05)
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.2, 0, i * 0.12)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.25, 0, i * 0.18)),
  crow: () => {
    // "cocoricó" estilizado
    tone(500, 0.12, 'sawtooth', 0.18, 200)
    tone(700, 0.12, 'sawtooth', 0.18, 150, 0.14)
    tone(900, 0.45, 'sawtooth', 0.18, -250, 0.28)
  },
  box: () => [300, 400, 500, 650, 800, 1000].forEach((f, i) => tone(f, 0.1, 'triangle', 0.2, 0, i * 0.07)),
  /** 🎁 Drop: "tic" de cada card passando na roleta. */
  dropTick: () => tone(1900, 0.025, 'square', 0.06),
  /** 🎁 Drop: revelação, mais festa quanto mais raro. */
  dropReveal: (tier: 'comum' | 'raro' | 'epico' | 'lendario') => {
    if (tier === 'comum') {
      ;[659, 988].forEach((f, i) => tone(f, 0.14, 'triangle', 0.18, 0, i * 0.08))
      return
    }
    if (tier === 'raro') {
      ;[523, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.18, 0, i * 0.07))
      hiNoise(0.4, 0.06, 0.25, 6000)
      return
    }
    // Épico/lendário: acorde + brilho; lendário ganha bumbo e fanfarra mais longa
    const big = tier === 'lendario'
    if (big) kick(0, 0.9)
    stab([261.6, 329.6, 392], 0.5, 0, 0.14)
    ;[523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, 0, 0.05 + i * 0.06))
    hiNoise(0.9, 0.1, 0.3, 5000)
    if (big) {
      stab([349.2, 440, 523.3], 0.5, 0.5, 0.14)
      stab([392, 493.9, 587.3, 784], 1.2, 0.85, 0.16)
      kick(0.85, 0.8)
      hiNoise(1.4, 0.18, 0.85, 4000)
    }
  },
}
