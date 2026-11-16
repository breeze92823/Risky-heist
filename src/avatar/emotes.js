// Portal emotes (https://docs.bloxity.io, "Add emote support"). The player picks an emote in the portal's
// emote wheel; the SDK sends play_emote with its id (stop_emote when they take it off). The catalogue
// (GET {apiUrl}/v1/avatar/emotes) gives each emote a clip: { len, loop, tracks: { Bone: [[t, xDeg, yDeg, zDeg], ...] } },
// the values being degree deltas over the bind pose (XYZ euler), smoothstep between keys. The clip is
// applied on top of the animator's pose, blended in over BLEND_IN seconds, and stops when the player
// moves. Unknown ids / bones are ignored, ownership is never checked, nothing here throws.
import { Euler, MathUtils, Quaternion } from 'three'
import { apiUrl, onEnvironment, onEmote } from '../bloxity.js'

const BLEND_IN = 0.1 // s
const MOVE_STOP = 0.6 // m/s of horizontal speed that cancels the emote

let catalogue = null // Map id -> { id, name, clip }
let loading = null
onEnvironment(() => {
  catalogue = null
  loading = null
})

function loadCatalogue() {
  if (catalogue) return Promise.resolve(catalogue)
  if (!loading) {
    const base = apiUrl()
    loading = (base ? fetch(`${base}/v1/avatar/emotes`) : Promise.reject(new Error('no api url')))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : Array.isArray(data?.emotes) ? data.emotes : []
        catalogue = new Map(list.filter((e) => e?.id && e.clip?.tracks).map((e) => [String(e.id), e]))
        return catalogue
      })
      .catch((err) => {
        console.warn('[emotes] could not load the emote catalogue', err?.message ?? err)
        loading = null // try again on the next emote
        return null
      })
  }
  return loading
}

const smooth = (t) => t * t * (3 - 2 * t)

// One track's delta (degrees) at time t: smoothstep between the surrounding keys, clamped outside them.
export function sampleTrack(keys, t, out) {
  const n = keys.length
  if (t <= keys[0][0]) {
    out[0] = keys[0][1]
    out[1] = keys[0][2]
    out[2] = keys[0][3]
    return out
  }
  if (t >= keys[n - 1][0]) {
    out[0] = keys[n - 1][1]
    out[1] = keys[n - 1][2]
    out[2] = keys[n - 1][3]
    return out
  }
  let i = 1
  while (keys[i][0] < t) i++
  const a = keys[i - 1]
  const b = keys[i]
  const k = smooth((t - a[0]) / (b[0] - a[0] || 1))
  out[0] = a[1] + (b[1] - a[1]) * k
  out[1] = a[2] + (b[2] - a[2]) * k
  out[2] = a[3] + (b[3] - a[3]) * k
  return out
}

// Plays emotes on ONE character (the local player's, or another player's): play(id) / stop(), then
// update() every frame after the animator wrote its pose. onChange(fn) reports what is playing
// (fn(id), fn('') when it stops) so the local player's emote can be sent to the others.
export function createEmotePlayer() {
  let want = '' // the id asked for ('' = none)
  let current = null // { id, clip, t, tracks: [{ bone, rest, keys }] }
  let avatar = null
  const rests = new WeakMap() // bone -> its bind quaternion, captured before we ever touch it
  const euler = new Euler()
  const q = new Quaternion()
  const delta = [0, 0, 0]
  const changeListeners = new Set()
  const notify = (id) => {
    for (const fn of changeListeners) {
      try {
        fn(id)
      } catch (err) {
        console.warn('[emotes] listener threw', err)
      }
    }
  }

  async function start(id) {
    want = id
    if (!id) return stop()
    const cat = await loadCatalogue()
    if (want !== id) return // changed meanwhile
    const emote = cat?.get(id)
    if (!emote) return stop() // unknown id: ignore
    begin(emote.clip, id)
  }

  function begin(clip, id) {
    clear()
    if (!avatar?.nodes) return
    const tracks = []
    for (const [name, keys] of Object.entries(clip.tracks)) {
      const bone = avatar.nodes[name]
      if (!bone || !Array.isArray(keys) || !keys.length) continue
      if (!rests.has(bone)) rests.set(bone, bone.quaternion.clone())
      tracks.push({ bone, rest: rests.get(bone), keys })
    }
    if (tracks.length) {
      current = { id, clip, t: 0, tracks }
      notify(id)
    }
  }

  // Puts the bones back without telling anyone (a new emote is about to start).
  function clear() {
    if (!current) return
    for (const tr of current.tracks) tr.bone.quaternion.copy(tr.rest)
    current = null
  }
  function stop() {
    if (!current) return
    clear()
    notify('')
  }

  return {
    get playing() {
      return !!current
    },
    onChange(fn) {
      changeListeners.add(fn)
      return () => changeListeners.delete(fn)
    },
    play: start,
    stop() {
      want = ''
      stop()
    },
    // The avatar was rebuilt (sign-in, customizer edit): its bones are new objects.
    setAvatar(next) {
      const was = current?.id
      avatar = next
      current = null
      if (was) notify('')
    },
    // After the animator wrote this frame's pose. `speed` = horizontal m/s, `grounded` = on the floor.
    update(dt, speed, grounded) {
      if (!current) return
      if (speed > MOVE_STOP || !grounded) {
        want = ''
        return stop()
      }
      const c = current
      c.t += dt
      const len = c.clip.len > 0 ? c.clip.len : 1
      let t = c.t
      if (c.clip.loop) t %= len
      else if (t > len) {
        want = ''
        return stop()
      }
      const w = Math.min(1, c.t / BLEND_IN)
      for (const tr of c.tracks) {
        sampleTrack(tr.keys, t, delta)
        euler.set(MathUtils.degToRad(delta[0]), MathUtils.degToRad(delta[1]), MathUtils.degToRad(delta[2]), 'XYZ')
        q.setFromEuler(euler)
        // On top of the bind quaternion; the first 0.1 s fades from the animator's pose into it.
        const target = tr.rest.clone().multiply(q)
        tr.bone.quaternion.slerp(target, w)
      }
    },
  }
}

// The local player's emotes: the portal's emote wheel (play_emote / stop_emote) drives them.
export function createEmotes() {
  const player = createEmotePlayer()
  onEmote((id) => void player.play(id))
  return player
}
