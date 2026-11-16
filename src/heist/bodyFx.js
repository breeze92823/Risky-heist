// What a character's body does in this game besides walking: hanging from the zipline, holding loot
// overhead and swinging at a door. Shared by the local player (game.js) and every other player's
// character (avatar/remotePlayers.js), so both look the same.
import { Group, Mesh, Quaternion } from 'three'
import { HIT_INTERVAL, ZIPLINE } from '../config.js'
import { BONE_INDEX } from '../avatar/rig.js'
import { boxGeo, metal } from './kit.js'

// The trolley + handle bar that runs on the cable. Its origin is on the cable; the rider's feet hang
// ZIPLINE.hang below it.
export function makeTrolley() {
  const trolley = new Group()
  const body = new Mesh(boxGeo(0.5, 0.3, 0.7), metal('#ffcc22', 0.35))
  const bar = new Mesh(boxGeo(1.3, 0.12, 0.12), metal('#3a3e4a', 0.4))
  bar.position.y = -ZIPLINE.hang + 1.9
  const rod = new Mesh(boxGeo(0.08, ZIPLINE.hang - 0.5, 0.08), metal('#3a3e4a', 0.4))
  rod.position.y = -(ZIPLINE.hang - 0.5) / 2
  trolley.add(body, bar, rod)
  trolley.visible = false
  return trolley
}

// 0..1 swing amount from the seconds left of a door-hit swing (0 = not swinging).
export const swingAmount = (timeLeft) => (timeLeft > 0 ? Math.sin((1 - timeLeft / HIT_INTERVAL) * Math.PI) : 0)

const qa = new Quaternion()
const qb = new Quaternion()

// After the animator wrote this frame's pose: arms up and legs tucked while riding, one arm back for a
// swing, both arms up while holding loot. `rig` is animator.rig.
export function applyArmPose(rig, { ride = false, swing = 0, holding = false } = {}) {
  if (!rig) return
  if (!ride && swing <= 0 && !holding) return
  for (const b of rig.bindings) {
    let x = 0
    let z = 0
    if (b.index === BONE_INDEX.ArmR1 * 3) {
      if (ride) {
        x = -2.9
        z = 0.25
      } else if (swing > 0) x = -2.4 * swing - 0.3
      else if (holding) x = -2.8
    } else if (b.index === BONE_INDEX.ArmL1 * 3) {
      if (ride) {
        x = -2.9
        z = -0.25
      } else if (holding && swing <= 0) x = -2.8
    } else if ((b.index === BONE_INDEX.LegL1 * 3 || b.index === BONE_INDEX.LegR1 * 3) && ride) x = -0.35
    if (x === 0 && z === 0) continue
    qa.setFromAxisAngle(b.axisX, x)
    if (z) qa.premultiply(qb.setFromAxisAngle(b.axisZ, z))
    b.bone.quaternion.premultiply(qa)
  }
}
