// Adaptive background music: an original spy-jazz score, synthesised live (no files) on the shared
// WebAudio context of sfx.js. One 8-bar loop in D minor (Dm, DmMaj7, Dm7, Dm6, Bbmaj7, A7b9, Dm, A7)
// is arranged five ways and the arrangement follows the heist (MUSIC in config.js):
//   lounge  - the hub: walking upright bass, brushes + ride, vibraphone melody, swung
//   stealth - on the heist bank: bass ostinato, twangy spy guitar riff, rim clicks, hats
//   tension - Jail Chance >= MUSIC.heat.tension: drums kick in, muted trumpet melody, brass stabs
//   chase   - the siren level: fast, driving drums, open brass, tremolo strings, gritty guitar
//   climax  - near a bust: faster still and a semitone up
// Layers crossfade step by step and the tempo glides, so the score turns with the Jail Chance; a
// step up lands on the next beat with a crash + timpani. Busts and escapes play stingers.
// A lookahead scheduler (called every frame) books notes ~0.3 s ahead on the audio clock.
import { MUSIC } from '../config.js'
import { audioCore } from './sfx.js'

const ORDER = ['lounge', 'stealth', 'tension', 'chase', 'climax']
const LOOKAHEAD = 0.3 // s of notes booked ahead
// --- The tune (semitones from the tonic) ------------------------------------------------------------
const ROOT = [0, 0, 0, 0, -4, -5, 0, -5]
const CHORD = [
  [0, 3, 7],
  [0, 3, 7, 11],
  [0, 3, 7, 10],
  [0, 3, 7, 9],
  [-4, 0, 3, 7],
  [-5, -1, 2, 5, 8],
  [0, 3, 7],
  [-5, -1, 2, 5],
]
// Chord tones folded into one octave above the tonic + 2 (the inner voice walks D, C#, C, B).
const VOICING = CHORD.map((c) => [...new Set(c.map((n) => (((n % 12) + 12) % 12 < 2 ? (((n % 12) + 12) % 12) + 12 : ((n % 12) + 12) % 12)))].sort((a, b) => a - b))
// The spy guitar riff (low register): [16th step, semitone, length in 16ths] per bar.
const RIFF = [
  [[0, 0, 3], [3, 3, 1], [4, 5, 2], [6, 6, 1], [7, 7, 4], [12, 10, 2], [14, 7, 2]],
  [[0, 0, 3], [3, 3, 1], [4, 7, 2], [6, 11, 5], [12, 7, 2], [14, 3, 2]],
  [[0, 0, 3], [3, 3, 1], [4, 5, 2], [6, 6, 1], [7, 7, 4], [12, 10, 2], [14, 12, 2]],
  [[0, 0, 3], [3, 3, 1], [4, 9, 4], [8, 7, 2], [10, 3, 2], [12, 2, 2], [14, 0, 2]],
  [[0, -4, 3], [3, 0, 1], [4, 3, 2], [6, 7, 6], [12, 3, 4]],
  [[0, -5, 3], [3, -1, 1], [4, 2, 2], [6, 5, 2], [8, 8, 4], [12, 7, 2], [14, 5, 2]],
  [[0, 0, 3], [3, 3, 1], [4, 5, 2], [6, 6, 1], [7, 7, 4], [12, 10, 2], [14, 7, 2]],
  [[0, -5, 2], [2, -4, 2], [4, -3, 2], [6, -2, 2], [8, -1, 8]],
]
// The melody (an octave above the riff): [step, semitone, length].
const LEAD = [
  [[0, 14, 6], [6, 12, 2], [8, 10, 8]],
  [[0, 11, 12], [12, 7, 4]],
  [[0, 10, 6], [6, 12, 2], [8, 15, 8]],
  [[0, 14, 12], [12, 9, 4]],
  [[0, 7, 8], [8, 8, 4], [12, 10, 4]],
  [[0, 14, 6], [6, 11, 2], [8, 8, 8]],
  [[0, 7, 16]],
  [[0, 11, 4], [4, 14, 4], [8, 17, 4], [12, 20, 4]],
]

const rnd = (a, b) => a + Math.random() * (b - a)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

let A = null // { ctx, out, noise }
let enabled = true
let section = 'lounge'
let shift = 0
let bpm = MUSIC.sections.lounge.bpm
const w = { ...MUSIC.sections.lounge, bass: 0, guitar: 0, vibes: 0, lead: 0, brass: 0, strings: 0, drums: 0 }
let step = 0
let nextT = 0
let silent = false // busted: the loop is stopped until the respawn
let duckUntil = 0
let switchedAt = -10 // audio time of the last section change
let stingAt = -10 // audio time of the last stinger

function init() {
  const core = audioCore()
  if (!core) return null
  const { ctx } = core
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(core.master)
  const send = ctx.createGain()
  send.gain.value = MUSIC.reverb
  out.connect(send).connect(core.verb)
  // stingers play on their own bus so they sound while the loop is faded out
  const sting = ctx.createGain()
  sting.gain.value = MUSIC.level * 1.5
  sting.connect(core.master)
  sting.connect(send)
  // the vibraphone's motor tremolo: one LFO for every vibes note
  const vib = ctx.createGain()
  vib.gain.value = 0.8
  const vlfo = ctx.createOscillator()
  vlfo.frequency.value = 5
  const vdepth = ctx.createGain()
  vdepth.gain.value = 0.2
  vlfo.connect(vdepth).connect(vib.gain)
  vlfo.start()
  vib.connect(out)
  A = { ctx, out, sting, vibes: vib, noise: core.noise }
  nextT = ctx.currentTime + 0.1
  fadeTo(enabled ? MUSIC.level : 0, 1.5)
  return A
}
function fadeTo(v, secs) {
  if (!A) return
  const t = A.ctx.currentTime
  A.out.gain.cancelScheduledValues(t)
  A.out.gain.setValueAtTime(A.out.gain.value, t)
  A.out.gain.linearRampToValueAtTime(v, t + secs)
}

// --- Instruments ------------------------------------------------------------------------------------
function osc(type, f, t, end, detune = 0) {
  const o = A.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.detune.value = detune
  o.start(t)
  o.stop(end)
  return o
}
function gain(v = 0.0001) {
  const g = A.ctx.createGain()
  g.gain.value = v
  return g
}
function filt(type, f, q = 0.7) {
  const b = A.ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}
// decaying hit: attack a, then exponential decay over d
function hitEnv(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
}
// held note: attack a, sustain to t + len, release r
function holdEnv(g, t, a, peak, len, r) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.setValueAtTime(peak, t + Math.max(a, len))
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, len) + r)
}
function nz(t, d, type, f, q, peak, a = 0.001, out = A.out) {
  const s = A.ctx.createBufferSource()
  s.buffer = A.noise
  const b = filt(type, f, q)
  const g = gain()
  hitEnv(g, t, a, peak, d)
  s.connect(b).connect(g).connect(out)
  s.start(t, Math.random() * 1.5)
  s.stop(t + a + d + 0.05)
}
const curves = new Map()
function shaper(k) {
  if (!curves.has(k)) {
    const c = new Float32Array(512)
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1
      c[i] = Math.tanh(x * k) / Math.tanh(k)
    }
    curves.set(k, c)
  }
  const s = A.ctx.createWaveShaper()
  s.curve = curves.get(k)
  return s
}

// upright (lounge / stealth) or electric (tension up) bass
function bass(t, m, len, vel, electric) {
  const end = t + len + 0.1
  const f = mtof(m)
  const lp = filt('lowpass', electric ? 1400 : 800, electric ? 3 : 1)
  lp.frequency.setValueAtTime(electric ? 1400 : 800, t)
  lp.frequency.exponentialRampToValueAtTime(electric ? 380 : 260, t + 0.25)
  const g = gain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.42 * vel, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.15 * vel, t + len * 0.9)
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  osc(electric ? 'sawtooth' : 'triangle', f, t, end).connect(lp)
  osc('sine', f, t, end).connect(lp)
  lp.connect(g).connect(A.out)
  if (!electric) nz(t, 0.02, 'bandpass', 1200, 1, 0.05 * vel)
}
// twangy spy guitar: saw + square through a plucked resonant lowpass, delayed vibrato
function guitar(t, m, len, vel, grit) {
  const end = t + len + 0.2
  const f = mtof(m)
  const lp = filt('lowpass', 4000, 5)
  lp.frequency.setValueAtTime(4200, t)
  lp.frequency.exponentialRampToValueAtTime(900, t + 0.3)
  const g = gain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.09 * vel, t + 0.25)
  g.gain.setValueAtTime(0.09 * vel, t + Math.max(0.25, len))
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  const o1 = osc('sawtooth', f, t, end)
  const o2 = osc('square', f, t, end, 7)
  const o2g = gain(0.5)
  const lfo = osc('sine', 5.5, t, end)
  const depth = gain(0)
  depth.gain.setValueAtTime(0, t + 0.12)
  depth.gain.linearRampToValueAtTime(14, t + 0.45)
  lfo.connect(depth)
  depth.connect(o1.detune)
  depth.connect(o2.detune)
  o1.connect(lp)
  o2.connect(o2g).connect(lp)
  if (grit) lp.connect(shaper(3)).connect(g)
  else lp.connect(g)
  g.connect(A.out)
}
// vibraphone: sine + a bright partial, long ring; the motor tremolo is one shared LFO (A.vibes)
function vibes(t, m, vel) {
  const end = t + 1.6
  const f = mtof(m)
  const g = gain()
  hitEnv(g, t, 0.002, 0.11 * vel, 1.5)
  osc('sine', f, t, end).connect(g)
  const p = gain()
  hitEnv(p, t, 0.001, 0.035 * vel, 0.3)
  osc('sine', f * 4, t, t + 0.4).connect(p).connect(g)
  g.connect(A.vibes)
}
// trumpet: two saws, brassy filter swell, delayed vibrato; muted = cup mute (bandpass)
function trumpet(t, m, len, vel, muted) {
  const end = t + len + 0.15
  const f = mtof(m)
  const g = gain()
  holdEnv(g, t, 0.035, (muted ? 0.13 : 0.1) * vel, len, 0.1)
  const b = muted ? filt('bandpass', 1300, 2.5) : filt('lowpass', 700, 1.5)
  if (!muted) {
    b.frequency.setValueAtTime(700, t)
    b.frequency.exponentialRampToValueAtTime(3000, t + 0.06)
    b.frequency.exponentialRampToValueAtTime(1900, t + 0.3)
  }
  const o1 = osc('sawtooth', f, t, end)
  const o2 = osc('sawtooth', f, t, end, 6)
  const lfo = osc('sine', 5.2, t, end)
  const depth = gain(0)
  depth.gain.setValueAtTime(0, t + 0.22)
  depth.gain.linearRampToValueAtTime(16, t + 0.5)
  lfo.connect(depth)
  depth.connect(o1.detune)
  depth.connect(o2.detune)
  o1.connect(b)
  o2.connect(b)
  b.connect(g).connect(A.out)
}
// brass section stab / swell on a chord: two saws per note into one shared filter + envelope
function brass(t, notes, len, vel) {
  const end = t + len + 0.2
  const lp = filt('lowpass', 400, 1.2)
  lp.frequency.setValueAtTime(400, t)
  lp.frequency.exponentialRampToValueAtTime(3200, t + 0.035)
  lp.frequency.exponentialRampToValueAtTime(1100, t + len)
  const g = gain()
  holdEnv(g, t, 0.02, 0.06 * vel, len, 0.12)
  for (const m of notes) {
    const f = mtof(m)
    osc('sawtooth', f, t, end, -8).connect(lp)
    osc('sawtooth', f, t, end, 8).connect(lp)
  }
  lp.connect(g).connect(A.out)
}
// string section: detuned saws, slow bow or tremolo (one filter, envelope and LFO per chord)
function strings(t, notes, len, vel, trem) {
  const end = t + len + 0.6
  const lp = filt('lowpass', trem ? 2600 : 1900, 0.8)
  const g = gain()
  holdEnv(g, t, trem ? 0.06 : 0.35, 0.032 * vel, len, 0.5)
  for (const m of notes) {
    const f = mtof(m)
    osc('sawtooth', f, t, end, -10).connect(lp)
    osc('sawtooth', f, t, end, 10).connect(lp)
  }
  if (trem) {
    const tg = gain(0.6)
    const lfo = osc('sine', 12, t, end)
    const lg = gain(0.4)
    lfo.connect(lg).connect(tg.gain)
    lp.connect(tg).connect(g)
  } else lp.connect(g)
  g.connect(A.out)
}
// drums
function kick(t, vel) {
  const o = osc('sine', 140, t, t + 0.4)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
  const g = gain()
  hitEnv(g, t, 0.002, 0.7 * vel, 0.32)
  o.connect(g).connect(A.out)
  nz(t, 0.012, 'highpass', 3000, 0.7, 0.08 * vel)
}
function snare(t, vel) {
  nz(t, 0.16, 'highpass', 1600, 0.7, 0.32 * vel)
  nz(t, 0.08, 'bandpass', 4500, 1, 0.12 * vel)
  const o = osc('triangle', 200, t, t + 0.12)
  o.frequency.exponentialRampToValueAtTime(150, t + 0.08)
  const g = gain()
  hitEnv(g, t, 0.001, 0.22 * vel, 0.08)
  o.connect(g).connect(A.out)
}
const hat = (t, vel, open = false) => nz(t, open ? 0.24 : 0.035, 'highpass', 8000, 0.8, 0.14 * vel)
const shaker = (t, vel) => nz(t, 0.05, 'bandpass', 6500, 1.2, 0.07 * vel, 0.012)
const brush = (t, vel) => nz(t, 0.22, 'bandpass', 3800, 0.5, 0.09 * vel, 0.03)
function rim(t, vel) {
  nz(t, 0.02, 'bandpass', 2600, 2, 0.18 * vel)
  const g = gain()
  hitEnv(g, t, 0.001, 0.1 * vel, 0.03)
  osc('triangle', 1750, t, t + 0.06).connect(g).connect(A.out)
}
function ride(t, vel) {
  const g = gain()
  hitEnv(g, t, 0.001, 0.04 * vel, 0.7)
  for (const r of [1, 1.48, 2.21, 2.93]) osc('sine', 2900 * r, t, t + 0.8).connect(g)
  g.connect(A.out)
  nz(t, 0.05, 'highpass', 9000, 0.7, 0.07 * vel)
}
function crash(t, vel) {
  nz(t, 1.6, 'highpass', 4500, 0.6, 0.22 * vel)
  nz(t, 0.6, 'bandpass', 7000, 0.8, 0.1 * vel)
}
function tom(t, m, vel) {
  const o = osc('sine', mtof(m), t, t + 0.4)
  o.frequency.exponentialRampToValueAtTime(mtof(m) * 0.7, t + 0.3)
  const g = gain()
  hitEnv(g, t, 0.002, 0.4 * vel, 0.3)
  o.connect(g).connect(A.out)
  nz(t, 0.03, 'lowpass', 1500, 0.7, 0.08 * vel)
}
function timpani(t, m, vel) {
  const f = mtof(m)
  const g = gain()
  hitEnv(g, t, 0.004, 0.5 * vel, 1.4)
  const o = osc('sine', f * 1.02, t, t + 1.6)
  o.frequency.exponentialRampToValueAtTime(f, t + 0.15)
  o.connect(g)
  osc('sine', f * 1.5, t, t + 1.6).connect(gain(0.3)).connect(g)
  g.connect(A.out)
  nz(t, 0.08, 'lowpass', 600, 0.7, 0.2 * vel)
}

// --- Arrangement ------------------------------------------------------------------------------------
function playStep(st, t) {
  const S = MUSIC.sections[section]
  const bar = Math.floor(st / 16) % 8
  const s = st % 16
  const sd = 60 / bpm / 4
  const T = s % 4 === 2 ? t + w.swing * sd : t // swung off-beat 8ths
  const k = MUSIC.tonic + shift
  const root = ROOT[bar]
  const lvl = section === 'lounge' ? 0 : ORDER.indexOf(section) // 1 stealth .. 4 climax
  const voice = (base) => VOICING[bar].map((n) => base + n)

  // bass
  if (w.bass > 0.02) {
    const b = k - 12 + root
    if (section === 'lounge') {
      if (s % 4 === 0) {
        const c = CHORD[bar]
        const next = ROOT[(bar + 1) % 8]
        const line = [root, c[1] + (c[1] < root ? 12 : 0), c[2] + (c[2] < root ? 12 : 0), next + (Math.random() < 0.6 ? -1 : 1)]
        bass(T, k - 12 + line[s / 4], sd * 3.6, w.bass * 0.9, false)
      }
    } else if (section === 'stealth') {
      const hits = { 0: [0, 3], 3: [0, 1], 6: [12, 2], 8: [0, 3], 11: [7, 1], 14: [10, 2] }
      if (hits[s]) bass(T, b + hits[s][0], sd * hits[s][1], w.bass, false)
    } else if (s % 2 === 0) {
      const pat = section === 'tension' ? [0, 0, 12, 0, 7, 0, 10, 12] : [0, 0, 12, 0, 0, 12, 7, 10]
      bass(t, b + pat[s / 2], sd * 1.7, w.bass * (s % 4 === 0 ? 1 : 0.8), true)
    } else if (lvl >= 3 && (s === 7 || s === 15)) bass(t, b, sd * 0.8, w.bass * 0.55, true)
  }
  // spy guitar riff
  if (w.guitar > 0.02)
    for (const [at, n, len] of RIFF[bar]) if (at === s) guitar(T, k + n, sd * len, w.guitar * (lvl >= 3 ? 1 : 0.85), lvl >= 3)
  // vibraphone: the melody + comping in the lounge, sparse colour in stealth
  if (w.vibes > 0.02) {
    if (section === 'lounge') {
      for (const [at, n] of LEAD[bar]) if (at === s) vibes(T, k + 12 + n, w.vibes * 0.9)
      if (s === 4 || s === 10) for (const m of voice(k)) vibes(T, m, w.vibes * 0.45)
    } else if (s === 0 && bar % 2 === 0) for (const m of voice(k + 12).slice(-2)) vibes(T, m, w.vibes)
  }
  // the melody on trumpet (muted in tension, open + an octave below from the chase)
  if (w.lead > 0.02 && lvl >= 2)
    for (const [at, n, len] of LEAD[bar])
      if (at === s) {
        trumpet(t, k + 12 + n, sd * len * 0.95, w.lead, lvl === 2)
        if (lvl >= 3) trumpet(t, k + n, sd * len * 0.95, w.lead * 0.6, false)
      }
  // brass stabs
  if (w.brass > 0.02 && lvl >= 2) {
    const notes = voice(k)
    if (lvl === 2) {
      if ((bar === 3 || bar === 7) && (s === 0 || s === 6)) brass(t, notes, sd * (s ? 4 : 2), w.brass)
      if (bar === 5 && s === 0) brass(t, notes, sd * 6, w.brass * 0.8)
    } else if (bar === 7) {
      if (s % 4 === 0) brass(t, notes, sd * 2, w.brass * (0.7 + s / 40))
    } else if (s === 0 || s === 10 || (lvl === 4 && s === 6)) brass(t, notes, sd * 1.6, w.brass)
  }
  // strings: a pad per bar (tremolo from the chase)
  if (w.strings > 0.02 && s === 0) strings(t, voice(k + 12), sd * 16, w.strings, lvl >= 3)

  // drums
  const D = w.drums
  if (D > 0.02) {
    if (section === 'lounge') {
      if ([0, 4, 6, 8, 12, 14].includes(s)) ride(T, D * (s % 4 === 0 ? 0.9 : 0.6))
      if (s === 4 || s === 12) brush(T, D)
      if (s === 0 || s === 8) kick(t, D * 0.35)
    } else if (section === 'stealth') {
      if (s === 4 || s === 12) rim(t, D)
      if (s % 2 === 0) hat(T, D * (s % 4 === 2 ? 0.6 : 0.35))
      if (s === 0 || s === 10) kick(t, D * 0.6)
      shaker(t, D * (s % 4 === 0 ? 0.6 : 0.35))
    } else {
      const chase = lvl >= 3
      const kicks = chase ? [0, 4, 8, 10, 12] : [0, 8, 11]
      if (kicks.includes(s) || (lvl === 4 && s === 14)) kick(t, D * 0.95)
      if (s === 4 || s === 12) snare(t, D)
      else if (chase && (s === 7 || s === 15)) snare(t, D * 0.25)
      if (chase && s % 4 === 2) hat(t, D * 0.7, true)
      else hat(t, D * (s % 2 === 0 ? 0.5 : 0.28))
      if (bar === 0 && s === 0 && chase) crash(t, D * 0.8)
      if (chase && (bar === 0 || bar === 4) && s === 0) timpani(t, k - 12 + root, D * 0.8)
      // fills at the end of the loop
      if (bar === 7 && s >= 12 && !chase) tom(t, k + 7 - (s - 12) * 3, D * 0.8)
      if (bar === 7 && s >= 8 && chase) snare(t, D * (0.3 + (s - 8) * 0.08))
    }
  }
}

// Which arrangement the game state asks for (with a little hysteresis on the way down).
function wanted(g) {
  if (!g.zone && !g.riding) return 'lounge'
  if (!g.awake) return 'stealth'
  const H = MUSIC.heat
  const h = Math.max(g.heat, g.alarm * H.climax)
  const cur = ORDER.indexOf(section)
  const pick = h >= H.climax ? 4 : h >= H.chase ? 3 : h >= H.tension ? 2 : 1
  if (pick < cur && cur >= 2) {
    const floor = [0, 0, H.tension, H.chase, H.climax][cur] - 5
    if (h > floor) return section
  }
  return ORDER[pick]
}
function switchTo(next, t) {
  const up = ORDER.indexOf(next) > ORDER.indexOf(section)
  section = next
  shift = MUSIC.sections[next].shift
  if (up && ORDER.indexOf(next) >= 2) {
    crash(t, 0.8)
    timpani(t, MUSIC.tonic - 12 + shift, 0.9)
  }
}

export const music = {
  get section() {
    return section
  },
  // The Settings window's Music switch.
  setEnabled(on) {
    enabled = !!on
    if (A) fadeTo(enabled && !silent ? MUSIC.level : 0, enabled ? 1.2 : 0.4)
  },
  get enabled() {
    return enabled
  },
  // Every frame from game.js: g = { zone, riding, heat, awake, alarm, busted }.
  frame(g) {
    if (!A && !init()) return
    const { ctx } = A
    const now = ctx.currentTime
    if (g.busted) {
      if (!silent) {
        silent = true
        fadeTo(0, 0.35)
        if (enabled) this.stinger('bust')
      }
      return
    }
    if (silent) {
      // back from a bust: start the lounge loop from the top
      silent = false
      section = 'lounge'
      shift = 0
      step = 0
      nextT = now + 0.1
      fadeTo(enabled ? MUSIC.level : 0, 2)
    }
    if (!enabled) {
      nextT = now + 0.1
      return
    }
    if (duckUntil && now >= duckUntil) {
      duckUntil = 0
      fadeTo(MUSIC.level, 1.2)
    }
    if (nextT < now - 0.1) nextT = now + 0.05 // behind (a long frame / resumed tab): resync
    const target = wanted(g)
    while (nextT < now + LOOKAHEAD) {
      const s = step % 16
      // up at once, down only after 3 s in a section (a flickering searchlight cannot bounce the score)
      const down = ORDER.indexOf(target) < ORDER.indexOf(section)
      if (s % 4 === 0 && target !== section && (!down || nextT - switchedAt > 3)) {
        switchTo(target, nextT)
        switchedAt = nextT
      }
      // glide the mix and the tempo toward the current section
      const S = MUSIC.sections[section]
      for (const key of ['bass', 'guitar', 'vibes', 'lead', 'brass', 'strings', 'drums', 'swing']) w[key] += (S[key] - w[key]) * 0.2
      bpm += (S.bpm - bpm) * 0.12
      playStep(step, nextT)
      nextT += 60 / bpm / 4
      step = (step + 1) % 128
    }
  },
  // One-shots over (or instead of) the loop: 'bust' (a dark orchestral hit, the loop stops) and
  // 'escape' (a heroic brass cadence while the loop ducks).
  stinger(kind) {
    if (!A || !enabled || A.ctx.currentTime - stingAt < 1.5) return
    stingAt = A.ctx.currentTime
    const t = A.ctx.currentTime + 0.02
    const k = MUSIC.tonic
    const keep = A.out
    A.out = A.sting // the instruments write to A.out: point them at the stinger bus for a moment
    if (kind === 'bust') {
      brass(t, [k - 12, k - 11, k - 6, k], 1.2, 1)
      strings(t, [k - 1, k, k + 6], 1.6, 1.2, true)
      timpani(t, k - 12, 1)
      timpani(t + 0.4, k - 13, 0.8)
      timpani(t + 0.8, k - 14, 0.9)
      crash(t, 0.9)
    } else if (kind === 'escape') {
      fadeTo(MUSIC.level * 0.25, 0.2)
      duckUntil = A.ctx.currentTime + 2.6
      const chords = [[k - 4, k, k + 3], [k - 2, k + 2, k + 5], [k, k + 4, k + 7]] // Bb, C, D major
      chords.forEach((c, i) => brass(t + i * 0.28, c.map((m) => m + 12), i === 2 ? 1.4 : 0.22, 1))
      trumpet(t + 0.56, k + 24, 1.3, 1, false)
      timpani(t, k - 16, 0.8)
      timpani(t + 0.56, k - 12, 1)
      crash(t + 0.56, 0.9)
    }
    A.out = keep
  },
}
