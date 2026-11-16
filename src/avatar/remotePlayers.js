// The other players in the room (net.js -> server roster): each one is a character like the local
// player's, dressed in their Bloxity look, animated by the same procedural animator (driven by their
// reported speed / grounded flag), playing their portal emote, showing their chat bubbles, carrying
// their loot overhead, hanging from the zipline and swinging at doors exactly like the local player
// (heist/bodyFx.js), with a name tag over the head. Everything about them is relayed by the server and
// drawn here only: the pose eases toward the last report, nothing is trusted for gameplay.
// Only players within NET.remoteRange are drawn, animated and have their look loaded.
import * as THREE from 'three'
import { Group, Vector3 } from 'three'
import { HIT_INTERVAL, NET, PLAYER_DIMS, ZIPLINE } from '../config.js'
import * as bloxity from '../bloxity.js'
import { buildDefaultCharacter, loadBaseCharacter } from './character.js'
import { applyProportions, attachEquippedAccessories } from './loader.js'
import { AVATAR_SLOTS } from './cdn.js'
import { disposeAnimator, makeAnimator } from './animator.js'
import { createEmotePlayer } from './emotes.js'
import { infoLabel } from '../heist/kit.js'
import { makeTreasure } from '../heist/models.js'
import { applyArmPose, makeTrolley, swingAmount } from '../heist/bodyFx.js'

// A look arrives from another client: only known slot keys and slug-shaped ids get through, since an id
// ends up inside an asset URL. Anything else is dropped (= nothing equipped in that slot).
const LOOK_KEYS = new Set([...AVATAR_SLOTS.map((s) => s.key), 'skinId', 'pantsId', 'shirtId', 'faceId', 'characterId'])
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
export function parseLook(json) {
  if (typeof json !== 'string' || !json) return null
  try {
    const raw = JSON.parse(json)
    const equipped = {}
    for (const [key, value] of Object.entries(raw?.equipped ?? {})) {
      if (!LOOK_KEYS.has(key)) continue
      const v = typeof value === 'number' ? String(value) : value
      if (typeof v === 'string' && SAFE_ID.test(v)) equipped[key] = v
    }
    const proportions = {}
    for (const [key, value] of Object.entries(raw?.proportions ?? {})) if (typeof value === 'number' && Number.isFinite(value)) proportions[key] = value
    return { equipped, proportions }
  } catch {
    return null
  }
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const HELD_HEIGHT = 2.55 // m over the feet, like the local player's loot
const TAG_HEIGHT = PLAYER_DIMS.height + NET.remoteNameHeight
const TAG_HEIGHT_CARRYING = HELD_HEIGHT + 0.9 // above the loot

class Remote {
  constructor(root) {
    this.root = root
    this.group = new Group()
    this.group.visible = false // shown once the player is near
    root.add(this.group)
    this.avatar = null
    this.animator = null
    this.emotes = createEmotePlayer()
    this.pos = new Vector3()
    this.prevY = 0
    this.yaw = 0
    this.placed = false
    this.near = false
    this.age = 0
    this.lookKey = null
    this.lookGen = 0
    this.emoteId = ''
    this.userId = ''
    this.bubble = null
    this.bubbleTimer = 0
    this.swingT = 0
    this.carryId = ''
    this.held = new Group() // the best carried treasure, spinning over the head
    this.held.position.y = HELD_HEIGHT
    this.held.visible = false
    this.group.add(this.held)
    this.trolley = makeTrolley() // on the cable above a zipline rider
    this.trolley.position.y = ZIPLINE.hang
    this.group.add(this.trolley)
    this.tag = infoLabel([{ text: '', size: 40, color: '#ffffff' }], 0.011)
    this.tag.position.y = TAG_HEIGHT
    this.group.add(this.tag)
    this.setAvatar(buildDefaultCharacter()) // visible at once; their real look swaps in when it has loaded
  }

  setAvatar(next) {
    if (this.avatar) this.group.remove(this.avatar)
    disposeAnimator(this.animator)
    this.avatar = next
    this.group.add(next)
    this.animator = makeAnimator(next)
    this.emotes.setAvatar(next)
  }

  // Rebuilds the character in `json`'s look (a stale load never lands: only the newest one counts).
  async loadLook(json) {
    const mine = ++this.lookGen
    const look = parseLook(json)
    try {
      const group = await loadBaseCharacter()
      if (mine !== this.lookGen) return
      if (look) {
        await attachEquippedAccessories(group, look.equipped)
        if (mine !== this.lookGen) return
        applyProportions(group, look.proportions)
      }
      this.setAvatar(group)
    } catch (err) {
      console.warn('[remote] could not build the look', err)
    }
  }

  setCarry(id) {
    if (id === this.carryId) return
    this.carryId = id
    this.held.clear()
    if (id) {
      try {
        this.held.add(makeTreasure(id, 0.7))
      } catch {
        // an id this build has no model for: nothing is shown
      }
    }
    this.held.visible = !!id
    this.tag.position.y = id ? TAG_HEIGHT_CARRYING : TAG_HEIGHT
  }

  // `viewer` = the local player's feet position. Far players are hidden and cost nothing (no animation,
  // no look load); they snap to where they are when they come back into range.
  update(p, dt, viewer) {
    this.userId = p.userId || '' // always: a chat bubble may still need to find them
    const dist = Math.hypot(p.x - viewer.x, p.y - viewer.y, p.z - viewer.z)
    this.near = dist <= NET.remoteRange + (this.near ? NET.remoteRangeSlack : 0)
    this.group.visible = this.near
    if (!this.near) {
      if (this.placed) {
        this.placed = false
        this.emoteId = '' // play it again if they are still at it when they return
        this.emotes.stop()
      }
      return
    }
    this.age += dt

    // look, name, emote: only when they changed
    if (p.avatar !== this.lookKey) {
      this.lookKey = p.avatar
      void this.loadLook(p.avatar)
    }
    const name = p.username || 'Player'
    if (this.tag.userData.name !== name) {
      this.tag.userData.name = name
      this.tag.setLines([{ text: name, size: 40, color: '#ffffff' }])
    }
    if (p.emote !== this.emoteId) {
      this.emoteId = p.emote
      void this.emotes.play(p.emote)
    }

    // pose: ease toward the report; a big jump (zipline, teleport) snaps
    const dx = p.x - this.pos.x
    const dy = p.y - this.pos.y
    const dz = p.z - this.pos.z
    if (!this.placed || Math.hypot(dx, dy, dz) > NET.remoteSnap) {
      this.pos.set(p.x, p.y, p.z)
      this.yaw = p.yaw
      this.prevY = p.y
      this.placed = true
    } else {
      const k = 1 - Math.exp(-NET.remoteLerp * dt)
      this.pos.x += dx * k
      this.pos.y += dy * k
      this.pos.z += dz * k
      this.yaw += wrapAngle(p.yaw - this.yaw) * k
    }
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.yaw
    const vy = dt > 0 ? (this.pos.y - this.prevY) / dt : 0
    this.prevY = this.pos.y
    this.animator?.update(dt, { grounded: p.grounded, speed: p.speed, verticalVelocity: vy, turn: 0 })
    this.emotes.update(dt, p.speed, p.grounded)

    // body: zipline hang (+ trolley on the cable), door swing, loot held overhead
    if (p.swing && this.swingT <= 0) this.swingT = HIT_INTERVAL
    this.swingT = Math.max(0, this.swingT - dt)
    applyArmPose(this.animator?.rig, { ride: p.riding, swing: swingAmount(this.swingT), holding: !!p.carry })
    this.trolley.visible = p.riding
    this.trolley.rotation.y = -this.yaw // the cable runs along the world axes, not with the rider's facing
    this.setCarry(p.carry)
    if (this.carryId) {
      this.held.position.y = HELD_HEIGHT + Math.sin(this.age * 3) * 0.08
      this.held.rotation.y += dt * 1.5
    }
  }

  say(text, seconds) {
    this.bubble?.remove?.()
    clearTimeout(this.bubbleTimer)
    this.bubble = bloxity.attachBubble(THREE, this.group, text)
    this.bubbleTimer = setTimeout(() => {
      this.bubble?.remove?.()
      this.bubble = null
    }, seconds * 1000)
  }

  dispose() {
    this.lookGen++
    this.bubble?.remove?.()
    clearTimeout(this.bubbleTimer)
    this.emotes.stop()
    disposeAnimator(this.animator)
    this.held.clear()
    this.tag.dispose()
    this.root.remove(this.group)
  }
}

export function createRemotePlayers(scene) {
  const root = new Group()
  scene.add(root)
  const remotes = new Map() // sessionId -> Remote

  return {
    // `players` = the roster (MapSchema, null when not connected), `mine` = this player's session id,
    // `viewer` = the local player's position: only the players near it are drawn.
    update(dt, players, mine, viewer) {
      if (!players) {
        for (const r of remotes.values()) r.dispose()
        remotes.clear()
        return
      }
      const seen = new Set()
      players.forEach((p, id) => {
        if (id === mine) return
        seen.add(id)
        let r = remotes.get(id)
        if (!r) remotes.set(id, (r = new Remote(root)))
        r.update(p, dt, viewer)
      })
      for (const [id, r] of remotes) {
        if (seen.has(id)) continue
        r.dispose()
        remotes.delete(id)
      }
    },
    // A chat message from someone else (Boxity's `userId` = the roster's verified account id). Their
    // bubble is only visible while they are drawn, like the character.
    say(userId, text) {
      if (!userId) return false
      for (const r of remotes.values()) {
        if (r.userId !== userId) continue
        r.say(text, bloxity.chatBubbleSeconds())
        return true
      }
      return false
    },
    get count() {
      return remotes.size
    },
    get drawn() {
      let n = 0
      for (const r of remotes.values()) if (r.near) n++
      return n
    },
    // dev / tests
    get remotes() {
      return remotes
    },
  }
}
