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
}
