// Procedural sound (WebAudio, no files). Everything is synthesised: UI clicks, cash registers and
// coins, glass and wood impacts, footsteps per surface, the zipline trolley, ambience (wind, river,
// birds, the tower's room tone) and the police: 3D cruisers (engine, roof siren, radio chatter), a
// distant siren layer that follows the Jail Chance, searchlight alarm beeps and the bust.
// The context starts on the first user gesture; every call is a no-op until then or without audio.
//
// Mix: sources -> ui / world / police / ambience buses -> master -> compressor -> speakers, with a
// generated reverb tail fed from the world + police buses (more of it inside the tower).
import { Vector3 } from 'three'
import { AUDIO, JAIL } from '../config.js'

let ctx = null
let master = null
let bus = null // { ui, world, police, amb, verbSend }
let noiseBuf = null
let brownBuf = null
let ambient = null // looping beds, made on unlock
let police = null // cruiser voices, made on the first frame with cars
let zip = null
// The portal's master_volume setting (0..1), the mute an ad break asks for and a hidden tab.
let volume = 0.8
let muted = false
let hidden = false

const rnd = (a, b) => a + Math.random() * (b - a)
// Voice budget: every one-shot oscillator / noise source counts until it ends. Over the cap new
// one-shots are dropped instead of overloading the audio thread (that is what crackles).
const VOICE_CAP = window.matchMedia?.('(pointer: coarse)').matches ? AUDIO.voices.mobile : AUDIO.voices.desktop
let voices = 0
const free = () => voices--
const full = () => voices >= VOICE_CAP
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ready = () => ctx && ctx.state === 'running'

const applyGain = () => {
  if (!master) return
  const v = muted || hidden ? 0 : AUDIO.master * volume
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
}
export function setVolume(v) {
  volume = clamp01(Number(v) || 0)
  applyGain()
}
export function setMuted(on) {
  muted = !!on
  applyGain()
}
// The Settings window's Sound Effects switch: silences every effect bus (music has its own, music.js).
let fxOn = true
const applyFx = () => {
  if (!bus) return
  const t = ctx.currentTime
  for (const k of ['ui', 'world', 'police', 'amb']) bus[k].gain.setTargetAtTime(fxOn ? AUDIO.bus[k === 'amb' ? 'ambience' : k] : 0, t, 0.05)
}
export function setSfxEnabled(on) {
  fxOn = !!on
  applyFx()
}
// The shared context for music.js: null until the first gesture has started audio.
export function audioCore() {
  if (!ctx || ctx.state !== 'running') return null
  return { ctx, master, verb: bus.verb, noise: noiseBuf }
}

// --- Context + mix --------------------------------------------------------------------------------
function makeNoise(seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = b.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else d[i] = w
  }
  return b
}
// A stereo room tail: decaying noise, darker as it fades, with a few early reflections.
function makeImpulse(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const k = i / len
      const w = Math.random() * 2 - 1
      lp += (w - lp) * (0.9 - k * 0.75)
      d[i] = lp * Math.pow(1 - k, 2.4)
    }
    for (let r = 0; r < 6; r++) {
      const at = Math.floor(ctx.sampleRate * rnd(0.008, 0.06))
      d[at] += rnd(-0.6, 0.6)
    }
  }
  return b
}

function ensure() {
  if (ctx) return ctx
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC({ latencyHint: 'interactive' })
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -10
    comp.knee.value = 8
    comp.ratio.value = 3
    comp.attack.value = 0.006
    comp.release.value = 0.25
    // a fast limiter after the glue compressor: stacked hits can never clip into crackle
    const lim = ctx.createDynamicsCompressor()
    lim.threshold.value = -2
    lim.knee.value = 0
    lim.ratio.value = 20
    lim.attack.value = 0.001
    lim.release.value = 0.08
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(comp).connect(lim).connect(ctx.destination)
    applyGain()
    const mk = (level) => {
      const g = ctx.createGain()
      g.gain.value = level
      g.connect(master)
      return g
    }
    bus = { ui: mk(AUDIO.bus.ui), world: mk(AUDIO.bus.world), police: mk(AUDIO.bus.police), amb: mk(AUDIO.bus.ambience) }
    const verb = ctx.createConvolver()
    verb.buffer = makeImpulse(AUDIO.reverb.seconds)
    const verbOut = ctx.createGain()
    verbOut.gain.value = 1
    verb.connect(verbOut).connect(master)
    bus.verb = verb
    bus.verbSend = ctx.createGain()
    bus.verbSend.gain.value = AUDIO.reverb.outdoor
    bus.verbSend.connect(verb)
    bus.world.connect(bus.verbSend)
    bus.police.connect(bus.verbSend)
    // the ambience goes through a lowpass that closes inside the tower (outdoor sounds through walls)
    bus.ambLp = ctx.createBiquadFilter()
    bus.ambLp.type = 'lowpass'
    bus.ambLp.frequency.value = 18000
    bus.ambLp.connect(bus.amb)
    noiseBuf = makeNoise(3)
    brownBuf = makeNoise(4, true)
    applyFx()
  } catch {
    ctx = null
  }
  return ctx
}
const unlock = () => {
  if (!ensure()) return
  if (ctx.state === 'suspended' && !hidden) ctx.resume().catch(() => {})
  if (!ambient && ctx.state !== 'closed') startAmbient()
}
window.addEventListener('pointerdown', unlock, { capture: true })
window.addEventListener('keydown', unlock, { capture: true })
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden
  applyGain()
  if (!ctx) return
  if (hidden) ctx.suspend().catch(() => {})
  else ctx.resume().catch(() => {})
})

// --- Building blocks --------------------------------------------------------------------------------
// gain envelope: attack to `peak`, exponential decay
function env(g, t0, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d)
}
function tone(freq, { type = 'sine', at = 0, a = 0.004, d = 0.2, peak = 0.3, slide = null, out = bus?.world, detune = 0 } = {}) {
  if (!ready() || full()) return
  const t0 = ctx.currentTime + at
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  o.detune.value = detune
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + a + d)
  env(g, t0, a, peak, d)
  o.connect(g).connect(out)
  voices++
  o.onended = free
  o.start(t0)
  o.stop(t0 + a + d + 0.05)
}
function noise({ at = 0, a = 0.002, d = 0.25, peak = 0.4, type = 'highpass', freq = 2000, q = 0.7, sweep = null, out = bus?.world, brown = false, rate = 1 } = {}) {
  if (!ready() || full()) return
  const t0 = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = brown ? brownBuf : noiseBuf
  s.playbackRate.value = rate
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t0)
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + a + d)
  f.Q.value = q
  const g = ctx.createGain()
  env(g, t0, a, peak, d)
  s.connect(f).connect(g).connect(out)
  voices++
  s.onended = free
  s.start(t0, Math.random() * 1.5)
  s.stop(t0 + a + d + 0.05)
}
// A struck metal/glass body: inharmonic partials with their own decays (bells, coins, shards).
function metal(f, { at = 0, d = 0.5, peak = 0.12, ratios = [1, 2.76, 5.4, 8.93], out = bus?.world } = {}) {
  ratios.forEach((r, i) => tone(f * r, { at, a: 0.001, d: d / (1 + i * 0.7), peak: peak / (1 + i * 0.6), out }))
}
// A struck wooden/hollow body: a few damped modes plus the knock transient.
function knock(f, { at = 0, peak = 0.35, d = 0.14, out = bus?.world } = {}) {
  ;[1, 2.3, 3.9].forEach((r, i) => tone(f * r * rnd(0.97, 1.03), { at, a: 0.001, d: d / (1 + i), peak: peak / (1 + i * 1.4), out, type: i ? 'sine' : 'triangle' }))
  noise({ at, d: 0.03, peak: peak * 0.6, type: 'bandpass', freq: f * 4, q: 1.2, out })
}
function coins(n, { at = 0, spread = 0.05, peak = 0.07, out = bus?.world } = {}) {
  for (let i = 0; i < n; i++) {
    const t = at + i * spread * rnd(0.5, 1.4)
    metal(rnd(2600, 4800), { at: t, d: rnd(0.12, 0.3), peak: peak * rnd(0.6, 1.1), ratios: [1, 1.52, 2.33], out })
    noise({ at: t, d: 0.012, peak: peak * 0.8, type: 'highpass', freq: 6000, out })
  }
}
function whoosh({ at = 0, d = 0.25, from = 400, to = 2500, peak = 0.25, out = bus?.ui, q = 1.2 } = {}) {
  if (!ready() || full()) return
  const t0 = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = q
  f.frequency.setValueAtTime(from, t0)
  f.frequency.exponentialRampToValueAtTime(to, t0 + d)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + d * 0.55)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d)
  s.connect(f).connect(g).connect(out)
  s.start(t0, Math.random())
  s.stop(t0 + d + 0.05)
}
// A soft-clipping curve (horn speakers, radio).
const curves = new Map()
function drive(k) {
  if (!curves.has(k)) {
    const c = new Float32Array(1024)
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1
      c[i] = Math.tanh(x * k) / Math.tanh(k)
    }
    curves.set(k, c)
  }
  return curves.get(k)
}
function loopNoise(brown = false) {
  const s = ctx.createBufferSource()
  s.buffer = brown ? brownBuf : noiseBuf
  s.loop = true
  s.start(0, Math.random() * 1.5)
  return s
}
function panner(ref, roll, max) {
  const p = ctx.createPanner()
  p.panningModel = 'equalpower'
  p.distanceModel = 'inverse'
  p.refDistance = ref
  p.rolloffFactor = roll
  p.maxDistance = max
  return p
}
function setPos(node, x, y, z) {
  if (node.positionX) {
    const t = ctx.currentTime
    node.positionX.setTargetAtTime(x, t, 0.03)
    node.positionY.setTargetAtTime(y, t, 0.03)
    node.positionZ.setTargetAtTime(z, t, 0.03)
  } else node.setPosition(x, y, z)
}

// --- Ambience ---------------------------------------------------------------------------------------
// wind (pink-ish noise, gusting, stronger high up), the river (brown noise, by distance), bird calls in
// the hub and a low room tone inside the tower.
function startAmbient() {
  if (!ctx) return
  const lp = bus.ambLp
  // wind
  const wind = loopNoise()
  const wf = ctx.createBiquadFilter()
  wf.type = 'bandpass'
  wf.frequency.value = 500
  wf.Q.value = 0.6
  const wg = ctx.createGain()
  wg.gain.value = 0
  wind.connect(wf).connect(wg).connect(lp)
  // river
  const river = loopNoise(true)
  const rf = ctx.createBiquadFilter()
  rf.type = 'lowpass'
  rf.frequency.value = 1100
  const rh = ctx.createBiquadFilter()
  rh.type = 'highpass'
  rh.frequency.value = 120
  const rg = ctx.createGain()
  rg.gain.value = 0
  river.connect(rf).connect(rh).connect(rg).connect(lp)
  // babble on the river: brighter noise, amplitude wobbling
  const bab = loopNoise()
  const bf = ctx.createBiquadFilter()
  bf.type = 'bandpass'
  bf.frequency.value = 2200
  bf.Q.value = 0.8
  const bg = ctx.createGain()
  bg.gain.value = 0
  bab.connect(bf).connect(bg).connect(lp)
  // tower room tone: mains hum + air handling
  const hum = ctx.createOscillator()
  hum.frequency.value = 60
  const hum2 = ctx.createOscillator()
  hum2.frequency.value = 120
  const air = loopNoise(true)
  const af = ctx.createBiquadFilter()
  af.type = 'lowpass'
  af.frequency.value = 300
  const hg = ctx.createGain()
  hg.gain.value = 0
  const h1 = ctx.createGain()
  h1.gain.value = 0.25
  const h2 = ctx.createGain()
  h2.gain.value = 0.08
  hum.connect(h1).connect(hg)
  hum2.connect(h2).connect(hg)
  air.connect(af).connect(hg)
  hg.connect(bus.amb) // inside: not behind the wall filter
  hum.start()
  hum2.start()
  ambient = { wg, wf, rg, bg, hg, gust: 0, gustT: 0, birdT: rnd(1, 3) }
}
function bird() {
  // a short call: two to five chirps, each a fast downward or upward sweep with a trill
  const pan = ctx.createStereoPanner()
  pan.pan.value = rnd(-0.9, 0.9)
  pan.connect(bus.ambLp)
  const base = rnd(2600, 4200)
  const n = 2 + Math.floor(Math.random() * 4)
  const up = Math.random() < 0.5
  for (let i = 0; i < n; i++) {
    const t0 = ctx.currentTime + i * rnd(0.09, 0.16)
    const o = ctx.createOscillator()
    const fm = ctx.createOscillator()
    const fmg = ctx.createGain()
    fm.frequency.value = rnd(30, 70)
    fmg.gain.value = base * 0.06
    fm.connect(fmg).connect(o.frequency)
    const f0 = base * rnd(0.9, 1.1)
    o.frequency.setValueAtTime(up ? f0 * 0.75 : f0 * 1.2, t0)
    o.frequency.exponentialRampToValueAtTime(up ? f0 * 1.2 : f0 * 0.7, t0 + 0.07)
    const g = ctx.createGain()
    env(g, t0, 0.008, rnd(0.04, 0.09), 0.07)
    o.connect(g).connect(pan)
    o.start(t0)
    fm.start(t0)
    o.stop(t0 + 0.1)
    fm.stop(t0 + 0.1)
  }
}

// --- Police cruisers --------------------------------------------------------------------------------
// Per car: an engine (two detuned saws + rumble through a lowpass that opens with speed) and a roof
// siren (two detuned square waves swept by an LFO, horn-shaped by a bandpass + soft clip), both on a
// 3D panner at the car. A global siren layer (muffled, far away) follows the Jail Chance so it is
// heard inside the tower too.
function makeSiren(out) {
  const S = AUDIO.siren
  const centre = (S.low + S.high) / 2
  const depth = (S.high - S.low) / 2
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  o1.type = o2.type = 'square'
  o1.frequency.value = o2.frequency.value = centre
  o2.detune.value = 9
  const lfo = ctx.createOscillator()
  lfo.type = 'triangle'
  lfo.frequency.value = 1 / S.wailSeconds
  const lg = ctx.createGain()
  lg.gain.value = depth
  lfo.connect(lg)
  lg.connect(o1.frequency)
  lg.connect(o2.frequency)
  const mix = ctx.createGain()
  mix.gain.value = 0.5
  const horn = ctx.createBiquadFilter()
  horn.type = 'bandpass'
  horn.frequency.value = 1150
  horn.Q.value = 0.9
  const sh = ctx.createWaveShaper()
  sh.curve = drive(2.5)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3600
  const g = ctx.createGain()
  g.gain.value = 0
  o1.connect(mix)
  o2.connect(mix)
  mix.connect(horn).connect(sh).connect(lp).connect(g).connect(out)
  o1.start()
  o2.start()
  lfo.start()
  return { g, lfo, lp }
}
function setSirenMode(s, yelp) {
  const S = AUDIO.siren
  s.lfo.frequency.setTargetAtTime(1 / (yelp ? S.yelpSeconds : S.wailSeconds), ctx.currentTime, 0.08)
}
function startPolice(count) {
  const C = AUDIO.car
  const cars = []
  for (let i = 0; i < count; i++) {
    const p = panner(C.refDistance, C.rolloff, C.maxDistance)
    p.connect(bus.police)
    // engine
    const e1 = ctx.createOscillator()
    const e2 = ctx.createOscillator()
    e1.type = e2.type = 'sawtooth'
    e1.frequency.value = 38
    e2.frequency.value = 38
    e2.detune.value = 14
    const rum = loopNoise(true)
    const rg = ctx.createGain()
    rg.gain.value = 0.6
    rum.connect(rg)
    const elp = ctx.createBiquadFilter()
    elp.type = 'lowpass'
    elp.frequency.value = 220
    elp.Q.value = 2
    const eg = ctx.createGain()
    eg.gain.value = 0
    e1.connect(elp)
    e2.connect(elp)
    rg.connect(elp)
    elp.connect(eg).connect(p)
    e1.start()
    e2.start()
    // roof siren, each slightly out of step with the others
    const siren = makeSiren(p)
    siren.lfo.frequency.value *= rnd(0.9, 1.1)
    cars.push({ p, e1, e2, elp, eg, siren, tyre: 0 })
  }
  const far = makeSiren(bus.police)
  far.lp.frequency.value = 1400
  police = { cars, far, level: 0, yelp: false, radioT: rnd(...AUDIO.radio.every), beepT: 0, wasAwake: true }
}

// Police radio: squelch, a few "syllables" of band-limited voice-like buzz, squelch tail + roger beep.
function radioCall(out, loud = 1) {
  if (!ready()) return
  const t0 = ctx.currentTime
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1500
  bp.Q.value = 0.7
  const sh = ctx.createWaveShaper()
  sh.curve = drive(4)
  const g = ctx.createGain()
  g.gain.value = 0.5 * loud
  bp.connect(sh).connect(g).connect(out)
  noise({ d: 0.06, peak: 0.35, type: 'bandpass', freq: 2500, q: 0.5, out: bp })
  const words = 4 + Math.floor(Math.random() * 7)
  let t = 0.08
  const pitch = rnd(105, 150)
  for (let i = 0; i < words; i++) {
    const len = rnd(0.07, 0.2)
    const s = t0 + t
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(pitch * rnd(0.9, 1.2), s)
    o.frequency.linearRampToValueAtTime(pitch * rnd(0.85, 1.15), s + len)
    const f1 = ctx.createBiquadFilter()
    f1.type = 'bandpass'
    f1.frequency.setValueAtTime(rnd(450, 850), s)
    f1.frequency.linearRampToValueAtTime(rnd(450, 850), s + len)
    f1.Q.value = 5
    const f2 = ctx.createBiquadFilter()
    f2.type = 'bandpass'
    f2.frequency.setValueAtTime(rnd(1100, 2300), s)
    f2.frequency.linearRampToValueAtTime(rnd(1100, 2300), s + len)
    f2.Q.value = 7
    const vg = ctx.createGain()
    vg.gain.setValueAtTime(0.0001, s)
    vg.gain.exponentialRampToValueAtTime(0.9, s + 0.015)
    vg.gain.setValueAtTime(0.9, s + len - 0.02)
    vg.gain.exponentialRampToValueAtTime(0.0001, s + len)
    o.connect(f1).connect(vg)
    o.connect(f2).connect(vg)
    vg.connect(bp)
    o.start(s)
    o.stop(s + len + 0.02)
    noise({ at: t, d: len, peak: 0.05, type: 'bandpass', freq: 2000, q: 0.4, out: bp })
    t += len + (Math.random() < 0.25 ? rnd(0.12, 0.25) : rnd(0.02, 0.06))
  }
  noise({ at: t, d: 0.14, peak: 0.3, type: 'bandpass', freq: 2600, q: 0.5, out: bp })
  tone(1000, { at: t + 0.02, d: 0.09, a: 0.003, peak: 0.12, type: 'sine', out: bp })
}

// --- Footsteps --------------------------------------------------------------------------------------
const SURFACE = {
  grass: (k) => {
    noise({ d: 0.09, peak: 0.12 * k, type: 'bandpass', freq: rnd(1800, 3200), q: 0.8 })
    noise({ d: 0.07, peak: 0.16 * k, type: 'lowpass', freq: 400, brown: true })
  },
  tile: (k) => {
    noise({ d: 0.025, peak: 0.16 * k, type: 'highpass', freq: rnd(2500, 4000) })
    tone(rnd(140, 180), { a: 0.002, d: 0.06, peak: 0.16 * k, type: 'triangle', slide: 90 })
  },
  concrete: (k) => {
    noise({ d: 0.05, peak: 0.13 * k, type: 'bandpass', freq: rnd(1200, 2000), q: 0.9 })
    noise({ d: 0.06, peak: 0.14 * k, type: 'lowpass', freq: 300, brown: true })
  },
  wood: (k) => knock(rnd(150, 190), { peak: 0.14 * k, d: 0.12 }),
}

// --- Per-frame state --------------------------------------------------------------------------------
const listener = new Vector3()
let stepDist = 0
let lastX = null
let lastZ = null
let wasGrounded = true
let airVy = 0
let lastStars = 0
let place = 'out' // out | in

export const sfx = {
  // ---- UI ----
  click() {
    tone(rnd(1300, 1500), { a: 0.001, d: 0.035, peak: 0.22, slide: 700, out: bus?.ui, type: 'triangle' })
    noise({ d: 0.012, peak: 0.25, type: 'bandpass', freq: 4200, q: 1.5, out: bus?.ui })
  },
  hover() {
    noise({ d: 0.01, peak: 0.05, type: 'bandpass', freq: 5500, q: 2, out: bus?.ui })
    tone(2400, { a: 0.001, d: 0.018, peak: 0.03, out: bus?.ui })
  },
  // an interaction prompt (E / TAP) appearing
  prompt() {
    tone(1040, { a: 0.003, d: 0.06, peak: 0.05, slide: 1560, out: bus?.ui })
  },
  disabled() {
    tone(220, { a: 0.002, d: 0.07, peak: 0.12, type: 'triangle', slide: 160, out: bus?.ui })
  },
  open() {
    whoosh({ d: 0.2, from: 350, to: 2800, peak: 0.22 })
    tone(520, { at: 0.05, d: 0.12, peak: 0.14, slide: 880, out: bus?.ui })
    tone(1320, { at: 0.11, d: 0.16, peak: 0.06, out: bus?.ui, type: 'triangle' })
  },
  close() {
    whoosh({ d: 0.17, from: 2600, to: 400, peak: 0.18 })
    tone(700, { d: 0.09, peak: 0.12, slide: 380, out: bus?.ui })
  },
  toast() {
    tone(660, { a: 0.004, d: 0.09, peak: 0.1, slide: 990, out: bus?.ui })
    tone(1320, { at: 0.05, a: 0.003, d: 0.12, peak: 0.05, out: bus?.ui, type: 'triangle' })
  },
  banner() {
    whoosh({ d: 0.45, from: 250, to: 3200, peak: 0.16, q: 0.8 })
    noise({ at: 0.38, d: 0.3, peak: 0.08, type: 'highpass', freq: 7000, out: bus?.ui })
  },
  deny() {
    tone(150, { type: 'square', d: 0.13, peak: 0.07, out: bus?.ui })
    tone(141, { type: 'square', at: 0.15, d: 0.18, peak: 0.07, out: bus?.ui })
    tone(300, { type: 'sine', d: 0.3, peak: 0.08, slide: 200, out: bus?.ui })
  },
  // ---- money ----
  // cash register: drawer clunk, bell, coins into the tray
  buy() {
    knock(110, { peak: 0.3, d: 0.1, out: bus?.ui })
    noise({ d: 0.08, peak: 0.2, type: 'bandpass', freq: 900, q: 1, out: bus?.ui })
    metal(1960, { at: 0.07, d: 0.9, peak: 0.14, out: bus?.ui })
    metal(2470, { at: 0.07, d: 0.7, peak: 0.08, out: bus?.ui })
    coins(4, { at: 0.16, spread: 0.04, peak: 0.05, out: bus?.ui })
  },
  cash() {
    coins(6 + Math.floor(Math.random() * 4), { spread: 0.04, peak: 0.06 })
    tone(1568, { type: 'triangle', at: 0.02, d: 0.1, peak: 0.07, out: bus?.ui })
    tone(2093, { type: 'triangle', at: 0.08, d: 0.22, peak: 0.07, out: bus?.ui })
  },
  reward() {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => metal(f * 2, { at: i * 0.07, d: 0.6, peak: 0.07, ratios: [1, 2.01, 3.02], out: bus?.ui }))
    coins(8, { at: 0.2, spread: 0.035, peak: 0.05, out: bus?.ui })
    whoosh({ d: 0.5, from: 300, to: 4000, peak: 0.1, q: 0.7 })
  },
  rebirth() {
    whoosh({ d: 1.1, from: 120, to: 5000, peak: 0.25, q: 0.6 })
    ;[262, 330, 392, 523].forEach((f) => tone(f, { at: 0.9, a: 0.05, d: 1.6, peak: 0.08, type: 'sawtooth', out: bus?.ui, detune: rnd(-8, 8) }))
    ;[1047, 1319, 1568, 2093].forEach((f, i) => metal(f, { at: 0.95 + i * 0.06, d: 1.2, peak: 0.06, ratios: [1, 2.01], out: bus?.ui }))
    tone(65, { at: 0.9, d: 0.9, peak: 0.4, slide: 40, out: bus?.ui })
  },
  teleport() {
    whoosh({ d: 0.35, from: 3000, to: 300, peak: 0.2, q: 2, out: bus?.world })
    tone(400, { d: 0.3, peak: 0.08, slide: 1600, type: 'sine', out: bus?.world })
  },
  // ---- heist ----
  hit() {
    // a tool striking a heavy wooden door: thud, knock, splinter crackle
    tone(rnd(85, 100), { type: 'sine', a: 0.002, d: 0.22, peak: 0.55, slide: 45 })
    knock(rnd(170, 210), { peak: 0.35, d: 0.18 })
    for (let i = 0; i < 3; i++) noise({ at: 0.01 + i * rnd(0.01, 0.03), d: 0.015, peak: 0.12, type: 'highpass', freq: 3000 })
    metal(rnd(900, 1200), { d: 0.12, peak: 0.03, ratios: [1, 2.4] })
  },
  doorBreak() {
    // splintering cracks, the slab falling, debris settling
    for (let i = 0; i < 9; i++) noise({ at: i * rnd(0.015, 0.04), d: rnd(0.01, 0.04), peak: rnd(0.15, 0.35), type: 'bandpass', freq: rnd(1500, 4000), q: 1 })
    noise({ d: 0.6, peak: 0.4, type: 'lowpass', freq: 1800, sweep: 200 })
    tone(70, { at: 0.18, type: 'sine', d: 0.5, peak: 0.6, slide: 35 })
    knock(120, { at: 0.2, peak: 0.4, d: 0.3 })
    for (let i = 0; i < 6; i++) knock(rnd(250, 600), { at: 0.35 + Math.random() * 0.5, peak: rnd(0.04, 0.1), d: 0.06 })
  },
  glass() {
    // impact, the pane bursting, shards raining down and tinkling on the floor
    tone(110, { a: 0.001, d: 0.15, peak: 0.45, slide: 50 })
    noise({ d: 0.05, peak: 0.6, type: 'highpass', freq: 1200 })
    noise({ d: 0.5, peak: 0.35, type: 'highpass', freq: 4500, sweep: 7000 })
    for (let i = 0; i < 26; i++) {
      const at = 0.02 + Math.pow(Math.random(), 1.6) * 0.9
      metal(rnd(2800, 7500), { at, d: rnd(0.05, 0.25), peak: rnd(0.02, 0.07), ratios: [1, 1.71, 2.63] })
    }
    noise({ at: 0.35, d: 0.6, peak: 0.08, type: 'highpass', freq: 6000 })
  },
  steal(tier = 0) {
    // grab (cloth swipe) + a sparkle that grows with the rarity
    whoosh({ d: 0.16, from: 800, to: 3500, peak: 0.18, out: bus?.world })
    const notes = [659, 880, 1047, 1319, 1568, 1760, 2093, 2637, 3136]
    const n = 3 + Math.min(6, tier)
    for (let i = 0; i < n; i++) metal(notes[i] * (tier >= 4 ? 1 : 1.5), { at: 0.05 + i * 0.05, d: 0.45, peak: 0.1, ratios: [1, 2.01, 3.0], out: bus?.ui })
    if (tier >= 4) {
      ;[523, 659, 784].forEach((f) => tone(f, { at: 0.1, a: 0.08, d: 1.2, peak: 0.05, type: 'sawtooth', out: bus?.ui, detune: rnd(-10, 10) }))
      whoosh({ at: 0.05, d: 1, from: 500, to: 6000, peak: 0.08, q: 0.5 })
    }
  },
  place() {
    // setting an object down on a stone pedestal + a magical shimmer
    knock(130, { peak: 0.3, d: 0.12 })
    noise({ d: 0.05, peak: 0.12, type: 'lowpass', freq: 600 })
    ;[1047, 1319, 1568].forEach((f, i) => metal(f, { at: 0.08 + i * 0.05, d: 0.5, peak: 0.05, ratios: [1, 2.01], out: bus?.ui }))
  },
  floor() {
    ;[392, 523, 659, 784].forEach((f, i) => metal(f, { at: i * 0.08, d: 0.7, peak: 0.07, ratios: [1, 2.0, 3.01], out: bus?.ui }))
  },
  jump() {
    whoosh({ d: 0.15, from: 500, to: 1500, peak: 0.07, out: bus?.world })
    noise({ d: 0.04, peak: 0.08, type: 'lowpass', freq: 500, brown: true })
  },
  land(k) {
    const surf = SURFACE[sfx.surface] ?? SURFACE.grass
    surf(0.8 + k)
    tone(70, { a: 0.003, d: 0.12, peak: 0.25 * k, slide: 45 })
  },
  // ---- police ----
  busted() {
    // siren "whoop" chirps, a whistle blast, then handcuffs ratcheting shut
    const S = AUDIO.siren
    for (let i = 0; i < 2; i++) {
      tone(S.low, { at: i * 0.32, a: 0.02, d: 0.28, peak: 0.16, type: 'square', slide: S.high * 1.1, out: bus?.police })
      tone(S.low * 1.01, { at: i * 0.32, a: 0.02, d: 0.28, peak: 0.1, type: 'sawtooth', slide: S.high * 1.12, out: bus?.police })
    }
    tone(55, { d: 0.8, peak: 0.6, slide: 30, out: bus?.ui })
    noise({ d: 0.4, peak: 0.3, type: 'lowpass', freq: 400, brown: true, out: bus?.ui })
    if (ready()) {
      // whistle: a pea whistle trills (fast vibrato) with breath
      const t0 = ctx.currentTime + 0.75
      const o = ctx.createOscillator()
      o.frequency.value = 2900
      const v = ctx.createOscillator()
      v.frequency.value = 32
      const vg = ctx.createGain()
      vg.gain.value = 180
      v.connect(vg).connect(o.frequency)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.03)
      g.gain.setValueAtTime(0.14, t0 + 0.5)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65)
      o.connect(g).connect(bus.police)
      o.start(t0)
      v.start(t0)
      o.stop(t0 + 0.7)
      v.stop(t0 + 0.7)
      noise({ at: 0.75, d: 0.6, peak: 0.05, type: 'bandpass', freq: 3000, q: 1.5, out: bus.police })
    }
    for (let i = 0; i < 7; i++) {
      const at = 1.55 + i * 0.045
      noise({ at, d: 0.012, peak: 0.3, type: 'highpass', freq: 3500, out: bus?.ui })
      metal(3300, { at, d: 0.05, peak: 0.04, ratios: [1, 1.6], out: bus?.ui })
    }
    knock(400, { at: 1.9, peak: 0.25, d: 0.08, out: bus?.ui })
    metal(1700, { at: 1.9, d: 0.35, peak: 0.08, ratios: [1, 2.3, 3.7], out: bus?.ui })
  },
  // one more police star lit: a scanner alert, higher for each star
  star(n) {
    const f = 880 + n * 110
    tone(f, { type: 'square', d: 0.07, peak: 0.06, out: bus?.ui })
    tone(f * 1.26, { type: 'square', at: 0.09, d: 0.1, peak: 0.06, out: bus?.ui })
    if (police?.cars[0]) radioCall(bus.police, 0.35)
  },
  policeSleep() {
    noise({ d: 0.08, peak: 0.25, type: 'bandpass', freq: 2500, q: 0.5, out: bus?.ui })
    tone(900, { at: 0.08, d: 0.5, peak: 0.08, slide: 180, type: 'triangle', out: bus?.ui })
  },
  policeWake() {
    noise({ d: 0.08, peak: 0.25, type: 'bandpass', freq: 2500, q: 0.5, out: bus?.ui })
    tone(500, { at: 0.06, d: 0.25, peak: 0.08, slide: 1400, type: 'triangle', out: bus?.ui })
    tone(1400, { at: 0.34, d: 0.08, peak: 0.07, type: 'square', out: bus?.ui })
  },
  // ---- zipline: cable hiss, trolley wheels rattling, wind rush ----
  zipStart() {
    if (!ensure() || ctx.state !== 'running' || zip) return
    const t = ctx.currentTime
    knock(600, { peak: 0.2, d: 0.06 })
    metal(1800, { d: 0.25, peak: 0.07, ratios: [1, 2.6, 4.1] })
    const s = loopNoise()
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 900
    f.Q.value = 3
    const g = ctx.createGain()
    g.gain.value = 0.0001
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.3)
    s.connect(f).connect(g).connect(bus.world)
    // wheels: noise gated by a square LFO (rate = speed)
    const w = loopNoise()
    const wf = ctx.createBiquadFilter()
    wf.type = 'bandpass'
    wf.frequency.value = 2400
    wf.Q.value = 2
    const gate = ctx.createGain()
    gate.gain.value = 0
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = 8
    const lg = ctx.createGain()
    lg.gain.value = 0.05
    lfo.connect(lg).connect(gate.gain)
    w.connect(wf).connect(gate).connect(bus.world)
    lfo.start()
    // wind rush past the ears
    const r = loopNoise()
    const rf = ctx.createBiquadFilter()
    rf.type = 'lowpass'
    rf.frequency.value = 500
    const rg = ctx.createGain()
    rg.gain.value = 0
    r.connect(rf).connect(rg).connect(bus.world)
    zip = { nodes: [s, w, r, lfo], f, g, lfo, rf, rg }
  },
  zipSpeed(k) {
    if (!zip) return
    const t = ctx.currentTime
    zip.f.frequency.setTargetAtTime(600 + k * 1600, t, 0.05)
    zip.lfo.frequency.setTargetAtTime(6 + k * 30, t, 0.05)
    zip.rf.frequency.setTargetAtTime(400 + k * 1400, t, 0.1)
    zip.rg.gain.setTargetAtTime(0.25 * k, t, 0.1)
  },
  zipStop() {
    if (!zip || !ctx) return
    const { nodes, g, rg } = zip
    const t = ctx.currentTime
    for (const gg of [g, rg]) {
      gg.gain.cancelScheduledValues(t)
      gg.gain.setValueAtTime(Math.max(0.0001, gg.gain.value), t)
      gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    }
    for (const n of nodes) n.stop(t + 0.3)
    zip = null
    knock(140, { peak: 0.3, d: 0.15 })
    metal(1500, { d: 0.2, peak: 0.05, ratios: [1, 2.6] })
  },

  surface: 'grass',
  // Per frame (game.js): listener = the camera; me = the player; police = the cruisers + heat.
  // me: { x, y, z, grounded, vy, driven, sprint, inside, zone, surface, riverDist }
  // cops: { cars: [{ x, z, v }], heat, awake, alarm, busted }
  frame(dt, camera, me, cops) {
    if (!ready()) return
    const t = ctx.currentTime
    // listener at the camera
    const L = ctx.listener
    camera.getWorldDirection(listener)
    const cp = camera.position
    if (L.positionX) {
      L.positionX.value = cp.x
      L.positionY.value = cp.y
      L.positionZ.value = cp.z
      L.forwardX.value = listener.x
      L.forwardY.value = listener.y
      L.forwardZ.value = listener.z
      L.upX.value = 0
      L.upY.value = 1
      L.upZ.value = 0
    } else {
      L.setPosition(cp.x, cp.y, cp.z)
      L.setOrientation(listener.x, listener.y, listener.z, 0, 1, 0)
    }

    // inside / outside: reverb, wall filter on the ambience, room tone
    const nowPlace = me.inside ? 'in' : 'out'
    if (nowPlace !== place) {
      place = nowPlace
      bus.verbSend.gain.setTargetAtTime(me.inside ? AUDIO.reverb.indoor : AUDIO.reverb.outdoor, t, 0.3)
      bus.ambLp.frequency.setTargetAtTime(me.inside ? 650 : 18000, t, 0.3)
    }

    // footsteps, jump and landing
    sfx.surface = me.surface
    if (lastX === null) {
      lastX = me.x
      lastZ = me.z
    }
    const moved = Math.hypot(me.x - lastX, me.z - lastZ)
    lastX = me.x
    lastZ = me.z
    const speed = moved / Math.max(dt, 1e-4)
    if (me.grounded && !me.driven && speed > AUDIO.step.minSpeed && speed < 40) {
      stepDist += moved
      const stride = me.sprint ? AUDIO.step.sprintStride : AUDIO.step.stride
      if (stepDist >= stride) {
        stepDist = 0
        ;(SURFACE[me.surface] ?? SURFACE.grass)(me.sprint ? 1.15 : 0.85)
      }
    } else if (!me.grounded) stepDist = AUDIO.step.stride * 0.6
    if (!me.driven) {
      if (wasGrounded && !me.grounded && me.vy > 2) sfx.jump()
      if (!me.grounded) airVy = Math.min(airVy, me.vy)
      if (!wasGrounded && me.grounded && airVy < -6) sfx.land(clamp01((-airVy - 6) / 18))
    }
    if (me.grounded) airVy = 0
    wasGrounded = me.grounded

    // ambience
    if (ambient) {
      ambient.gustT -= dt
      if (ambient.gustT <= 0) {
        ambient.gustT = rnd(2, 6)
        ambient.gust = rnd(0.4, 1)
      }
      const high = clamp01(me.y / 120)
      ambient.wg.gain.setTargetAtTime((0.12 + high * 0.5) * ambient.gust * (me.inside ? 0.4 : 1), t, 0.8)
      ambient.wf.frequency.setTargetAtTime(350 + ambient.gust * 400 + high * 500, t, 1)
      const riv = clamp01(1 - me.riverDist / 40)
      ambient.rg.gain.setTargetAtTime(riv * 0.6, t, 0.4)
      ambient.bg.gain.setTargetAtTime(riv * 0.06 * (0.6 + Math.sin(t * 1.7) * 0.4), t, 0.2)
      ambient.hg.gain.setTargetAtTime(me.inside ? 0.05 : 0, t, 0.3)
      if (!me.zone && !me.inside && me.y < 30) {
        ambient.birdT -= dt
        if (ambient.birdT <= 0) {
          ambient.birdT = rnd(...AUDIO.birds.every)
          bird()
        }
      }
    }

    // police
    if (!cops?.cars?.length) return
    if (!police) startPolice(cops.cars.length)
    const S = AUDIO.siren
    const C = AUDIO.car
    const heatK = clamp01((cops.heat - JAIL.sirenAt) / (100 - JAIL.sirenAt))
    const chase = cops.awake && me.zone && (cops.heat >= JAIL.sirenAt || cops.alarm > 0.25)
    const on = chase || cops.busted
    const yelp = cops.busted || cops.heat >= S.yelpAt || cops.alarm > 0.5
    if (yelp !== police.yelp) {
      police.yelp = yelp
      for (const c of police.cars) setSirenMode(c.siren, yelp)
      setSirenMode(police.far, yelp)
    }
    cops.cars.forEach((car, i) => {
      const c = police.cars[i]
      if (!c) return
      setPos(c.p, car.x, 1.2, car.z)
      const k = clamp01(car.v / 7)
      c.e1.frequency.setTargetAtTime(34 + k * 34, t, 0.2)
      c.e2.frequency.setTargetAtTime(34 + k * 34, t, 0.2)
      c.elp.frequency.setTargetAtTime(160 + k * 500, t, 0.2)
      c.eg.gain.setTargetAtTime(C.engineGain * (0.5 + k * 0.5), t, 0.2)
      c.siren.g.gain.setTargetAtTime(on ? C.sirenGain : 0, t, on ? 0.15 : 0.6)
    })
    // the far siren layer: heard everywhere on the heist bank (inside the tower too), rises with heat
    police.level = on ? (cops.busted ? 1 : Math.max(heatK, cops.alarm)) : 0
    police.far.g.gain.setTargetAtTime(police.level * 0.12 * (me.inside ? 1 : 0.5), t, 0.4)
    police.far.lp.frequency.setTargetAtTime(me.inside ? 900 : 2200, t, 0.3)

    // searchlight alarm: beeps that speed up while a spot holds the player
    if (cops.alarm > 0.02 && !cops.busted) {
      police.beepT -= dt
      if (police.beepT <= 0) {
        police.beepT = 0.32 - cops.alarm * 0.24
        tone(1760 + cops.alarm * 600, { type: 'square', d: 0.05, peak: 0.07, out: bus.ui })
      }
    } else police.beepT = 0

    // radio chatter from the nearest cruiser while on the heist bank
    if (me.zone && cops.awake && !cops.busted) {
      police.radioT -= dt * (1 + heatK * 1.5)
      if (police.radioT <= 0) {
        police.radioT = rnd(...AUDIO.radio.every)
        let best = -1
        let bestD = AUDIO.radio.range
        cops.cars.forEach((car, i) => {
          const d = Math.hypot(car.x - me.x, car.z - me.z)
          if (d < bestD) {
            bestD = d
            best = i
          }
        })
        if (best >= 0) radioCall(police.cars[best].p, 1.4)
      }
    }

    // a police star lit / police asleep or awake again
    const stars = Math.floor(Math.min(100, cops.heat) / 20)
    if (stars > lastStars && me.zone && !cops.busted && stars < 5) sfx.star(stars)
    lastStars = stars
    if (cops.awake && !police.wasAwake) sfx.policeWake()
    police.wasAwake = cops.awake
  },
}

// --- Overlap control --------------------------------------------------------------------------------
// The same sound re-triggered faster than its gap is dropped (a cash pad credits every frame, a
// prompt can flicker between two targets, buttons get mashed): stacked copies smear into noise.
// Minor UI blips (hover, prompt, toast, click) also step aside right after a major sound.
const GAPS = {
  click: 0.05, hover: 0.07, disabled: 0.12, prompt: 0.3, open: 0.12, close: 0.12, toast: 0.25, banner: 0.4,
  deny: 0.25, buy: 0.15, cash: 0.22, reward: 0.4, rebirth: 1.5, teleport: 0.3,
  hit: 0.1, doorBreak: 0.25, glass: 0.15, steal: 0.1, place: 0.12, floor: 0.4, jump: 0.12, land: 0.2,
  busted: 2, star: 0.5, policeSleep: 0.5, policeWake: 0.5,
}
const MINOR = new Set(['click', 'hover', 'prompt', 'toast', 'disabled'])
const lastAt = {}
let lastMajor = -1
for (const [key, gap] of Object.entries(GAPS)) {
  const play = sfx[key]
  sfx[key] = function (...args) {
    if (!ready()) return
    const now = ctx.currentTime
    if (now - (lastAt[key] ?? -1) < gap) return
    if (MINOR.has(key) && key !== 'click' && now - lastMajor < 0.15) return
    lastAt[key] = now
    if (!MINOR.has(key)) lastMajor = now
    return play.apply(this, args)
  }
}

