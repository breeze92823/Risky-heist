// Tiny procedural sound effects (WebAudio, no files). The context starts on the
// first user gesture; every call is a no-op until then or if audio is unavailable.
let ctx = null
let master = null
let noiseBuf = null
let zip = null

function ensure() {
  if (ctx) return ctx
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.45
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  } catch {
    ctx = null
  }
  return ctx
}
const unlock = () => {
  if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {})
}
window.addEventListener('pointerdown', unlock, { capture: true })
window.addEventListener('keydown', unlock, { capture: true })

function env(gain, t0, a, peak, d) {
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + a)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d)
}
function tone(freq, { type = 'sine', at = 0, a = 0.005, d = 0.2, peak = 0.3, slide = null } = {}) {
  if (!ctx || ctx.state !== 'running') return
  const t0 = ctx.currentTime + at
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + a + d)
  env(g, t0, a, peak, d)
  o.connect(g).connect(master)
  o.start(t0)
  o.stop(t0 + a + d + 0.05)
}
function noise({ at = 0, a = 0.002, d = 0.25, peak = 0.4, type = 'highpass', freq = 2000, q = 0.7, sweep = null } = {}) {
  if (!ctx || ctx.state !== 'running') return
  const t0 = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t0)
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + a + d)
  f.Q.value = q
  const g = ctx.createGain()
  env(g, t0, a, peak, d)
  s.connect(f).connect(g).connect(master)
  s.start(t0, Math.random() * 0.5)
  s.stop(t0 + a + d + 0.05)
}

export const sfx = {
  hit() {
    tone(140, { type: 'triangle', d: 0.16, peak: 0.5, slide: 60 })
    noise({ d: 0.09, peak: 0.25, type: 'lowpass', freq: 900 })
  },
  doorBreak() {
    noise({ d: 0.7, peak: 0.6, type: 'lowpass', freq: 1400, sweep: 200 })
    tone(90, { type: 'sawtooth', d: 0.5, peak: 0.25, slide: 40 })
    for (let i = 0; i < 4; i++) tone(200 + Math.random() * 200, { type: 'square', at: 0.05 + i * 0.07, d: 0.06, peak: 0.06 })
  },
  glass() {
    noise({ d: 0.35, peak: 0.5, type: 'highpass', freq: 3500 })
    for (let i = 0; i < 7; i++) tone(2500 + Math.random() * 3500, { at: Math.random() * 0.25, d: 0.15, peak: 0.08 })
  },
  steal() {
    ;[660, 880, 1320].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.06, d: 0.18, peak: 0.22 }))
  },
  place() {
    tone(330, { type: 'sine', d: 0.12, peak: 0.3, slide: 520 })
    tone(990, { type: 'triangle', at: 0.06, d: 0.2, peak: 0.14 })
  },
  cash() {
    tone(1568, { type: 'triangle', d: 0.12, peak: 0.2 })
    tone(2093, { type: 'triangle', at: 0.07, d: 0.25, peak: 0.2 })
  },
  buy() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.07, d: 0.22, peak: 0.2 }))
  },
  deny() {
    tone(160, { type: 'square', d: 0.18, peak: 0.12 })
    tone(120, { type: 'square', at: 0.1, d: 0.2, peak: 0.12 })
  },
  busted() {
    for (let i = 0; i < 4; i++) {
      tone(i % 2 ? 620 : 880, { type: 'sawtooth', at: i * 0.28, a: 0.02, d: 0.26, peak: 0.16 })
    }
  },
  floor() {
    ;[392, 523, 659].forEach((f, i) => tone(f, { type: 'sine', at: i * 0.09, d: 0.35, peak: 0.18 }))
  },
  zipStart() {
    if (!ensure() || ctx.state !== 'running' || zip) return
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 900
    f.Q.value = 2.5
    const g = ctx.createGain()
    g.gain.value = 0.0001
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.3)
    s.connect(f).connect(g).connect(master)
    s.start()
    zip = { s, f, g }
  },
  zipSpeed(k) {
    if (zip) zip.f.frequency.value = 600 + k * 1400
  },
  zipStop() {
    if (!zip || !ctx) return
    const { s, g } = zip
    g.gain.cancelScheduledValues(ctx.currentTime)
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    s.stop(ctx.currentTime + 0.3)
    zip = null
  },
}
