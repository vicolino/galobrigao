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

export const sfx = {
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
