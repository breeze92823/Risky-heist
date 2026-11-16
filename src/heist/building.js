// The heist building on the far bank: five floors of studded brick with framed
// windows, orange trim bands, corner pilasters, a roof with machinery and a
// neon name sign. Inside, each floor has its own theme (lobby, offices, vault
// lounge, gallery, penthouse), ceiling light panels, a clover luck sign and
// eight treasure spots. Floors connect by alternating-side stairs: a stair
// rises along one side wall into an enclosed stairwell on the floor above,
// whose wooden door (with hit points) opens into that floor. Every upper floor
// has a glass exit door onto a balcony with a zipline pole; the ground floor's
// glass entrance faces the ground zipline tower.
//
// All coordinates below are local (building centre at x = 0, z = 0, +z = front);
// helpers offset them to world space for meshes and colliders alike.
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, SphereGeometry, Vector3 } from 'three'
import { bake } from '../bake.js'
import { BUILDING as B, FLOORS, RARITIES, TREASURES, ZIPLINE } from '../config.js'
import { world } from '../physics.js'
import { mulberry32 } from '../textures.js'
import { boxGeo, boxMM, bricks, canvasSign, emissive, glass, glowSprite, groundDecal, infoLabel, metal, money, outlinedText, plainTex, raysTexture, ringTexture, roundRect, solid, solidCuboid, solidMM, studs } from './kit.js'
import { makeTreasure } from './models.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { paintCloverSign, paintDoor } from './paint.js'

const H = B.floorH
const SLAB = B.slab
const FLOOR0 = 0.15
export const floorY = (i) => FLOOR0 + i * H
const IW = B.halfW - B.wall // inner half width (14.4)
const ID = B.halfD - B.wall // inner half depth (10.4)
const BAND_IN = IW - B.stairBand // 10.8: inner edge of a stair band
const stairSide = (i) => (i % 2 === 0 ? -1 : 1) // floor i's stair (up to i+1) runs along this side
const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, tier: i }]))
const TREASURE = Object.fromEntries(TREASURES.map((t) => [t.id, t]))
const VEST_DOOR_Z = (-ID + B.stairHigh) / 2 // centre of the stairwell door along z
const VEST_FRONT = 4.3 // z of the stairwell's front cap wall

export function buildBuilding(scene, { fx, sfx }) {
  const OX = B.x
  const OZ = B.z
  const root = new Group() // opaque, baked, casts shadows
  const glassRoot = new Group() // windows, baked separately, no shadows
  const live = new Group()
  scene.add(live)
  const rand = mulberry32(777)

  const R = (parent, x0, y0, z0, x1, y1, z1, mat, opts) => boxMM(parent, OX + x0, y0, OZ + z0, OX + x1, y1, OZ + z1, mat, opts)
  const S = (x0, y0, z0, x1, y1, z1) => solidMM(OX + x0, y0, OZ + z0, OX + x1, y1, OZ + z1)
  const W = (x, y, z) => new Vector3(OX + x, y, OZ + z)

  const wallMat = bricks('#5d5bd9')
  const trimMat = studs('#d9702a', { tile: 4 })
  const frameMat = solid('#e0893a', 0.55)
  const plinthMat = studs('#3b3570', { tile: 4 })
  const winGlass = glass('#9fd6ff', 0.38)
  const stairMat = studs('#cfc8f2', { tile: 2 })
  const railMat = metal('#c9ced8', 0.3)
  const doorTex = plainTex(paintDoor())
  const doorFace = new MeshStandardMaterial({ map: doorTex, roughness: 0.6 })
  const doorEdge = solid('#5a1e0c', 0.7)
  const knobMat = metal('#ffc531', 0.25)

  // --- Wall builders (with window/door openings) ----------------------------------
  // Wall running along x (front/back), thickness between zA..zB.
  // Visual pieces go round every opening; colliders only split at doors (a window is
  // solid glass), so each wall costs a handful of colliders instead of dozens.
  function wallColliders(along, a0, a1, b0, b1, y0, y1, openings) {
    const box = (u0, v0, u1, v1) => (along === 'x' ? S(u0, v0, b0, u1, v1, b1) : S(b0, v0, u0, b1, v1, u1))
    let cur = a0
    for (const o of openings.filter((q) => !q.window).sort((p, q) => p.a - q.a)) {
      if (o.a > cur) box(cur, y0, o.a, y1)
      if (o.y1 < y1) box(o.a, o.y1, o.b, y1)
      cur = o.b
    }
    if (cur < a1) box(cur, y0, a1, y1)
  }
  function wallX(zA, zB, xFrom, xTo, y0, y1, openings, mat = wallMat) {
    let cur = xFrom
    for (const o of [...openings].sort((a, b) => a.a - b.a)) {
      if (o.a > cur) R(root, cur, y0, zA, o.a, y1, zB, mat)
      if (o.y0 > y0) R(root, o.a, y0, zA, o.b, o.y0, zB, mat)
      if (o.y1 < y1) R(root, o.a, o.y1, zA, o.b, y1, zB, mat)
      if (o.window) windowX((o.a + o.b) / 2, (zA + zB) / 2, o.b - o.a, o.y0, o.y1, Math.sign(zA + zB))
      cur = o.b
    }
    if (cur < xTo) R(root, cur, y0, zA, xTo, y1, zB, mat)
    wallColliders('x', xFrom, xTo, zA, zB, y0, y1, openings)
  }
  // Wall running along z (sides), thickness between xA..xB.
  function wallZ(xA, xB, zFrom, zTo, y0, y1, openings, mat = wallMat) {
    let cur = zFrom
    for (const o of [...openings].sort((a, b) => a.a - b.a)) {
      if (o.a > cur) R(root, xA, y0, cur, xB, y1, o.a, mat)
      if (o.y0 > y0) R(root, xA, y0, o.a, xB, o.y0, o.b, mat)
      if (o.y1 < y1) R(root, xA, o.y1, o.a, xB, y1, o.b, mat)
      if (o.window) windowZ((xA + xB) / 2, (o.a + o.b) / 2, o.b - o.a, o.y0, o.y1, Math.sign(xA + xB))
      cur = o.b
    }
    if (cur < zTo) R(root, xA, y0, cur, xB, y1, zTo, mat)
    wallColliders('z', zFrom, zTo, xA, xB, y0, y1, openings)
  }
  const T = B.wall + 0.16 // frame depth
  function windowX(xc, zc, w, y0, y1, out) {
    R(glassRoot, xc - w / 2, y0, zc - 0.03, xc + w / 2, y1, zc + 0.03, winGlass, { cast: false })
    R(root, xc - w / 2 - 0.1, y0 - 0.12, zc - T / 2, xc + w / 2 + 0.1, y0 + 0.06, zc + T / 2, frameMat)
    R(root, xc - w / 2 - 0.1, y1 - 0.06, zc - T / 2, xc + w / 2 + 0.1, y1 + 0.12, zc + T / 2, frameMat)
    R(root, xc - w / 2 - 0.1, y0, zc - T / 2, xc - w / 2 + 0.08, y1, zc + T / 2, frameMat)
    R(root, xc + w / 2 - 0.08, y0, zc - T / 2, xc + w / 2 + 0.1, y1, zc + T / 2, frameMat)
    R(root, xc - 0.05, y0, zc - 0.08, xc + 0.05, y1, zc + 0.08, frameMat)
    R(root, xc - w / 2, (y0 + y1) / 2 - 0.05, zc - 0.08, xc + w / 2, (y0 + y1) / 2 + 0.05, zc + 0.08, frameMat)
    R(root, xc - w / 2 - 0.25, y0 - 0.3, zc + out * (B.wall / 2), xc + w / 2 + 0.25, y0 - 0.1, zc + out * (B.wall / 2 + 0.35), trimMat) // sill
  }
  function windowZ(xc, zc, w, y0, y1, out) {
    R(glassRoot, xc - 0.03, y0, zc - w / 2, xc + 0.03, y1, zc + w / 2, winGlass, { cast: false })
    R(root, xc - T / 2, y0 - 0.12, zc - w / 2 - 0.1, xc + T / 2, y0 + 0.06, zc + w / 2 + 0.1, frameMat)
    R(root, xc - T / 2, y1 - 0.06, zc - w / 2 - 0.1, xc + T / 2, y1 + 0.12, zc + w / 2 + 0.1, frameMat)
    R(root, xc - T / 2, y0, zc - w / 2 - 0.1, xc + T / 2, y1, zc - w / 2 + 0.08, frameMat)
    R(root, xc - T / 2, y0, zc + w / 2 - 0.08, xc + T / 2, y1, zc + w / 2 + 0.1, frameMat)
    R(root, xc - 0.08, y0, zc - 0.05, xc + 0.08, y1, zc + 0.05, frameMat)
    R(root, xc - 0.08, (y0 + y1) / 2 - 0.05, zc - w / 2, xc + 0.08, (y0 + y1) / 2 + 0.05, zc + w / 2, frameMat)
    R(root, xc + out * (B.wall / 2), y0 - 0.3, zc - w / 2 - 0.25, xc + out * (B.wall / 2 + 0.35), y0 - 0.1, zc + w / 2 + 0.25, trimMat)
  }
  const win = (a, fy, w = 2.6) => ({ a: a - w / 2, b: a + w / 2, y0: fy + 1.5, y1: fy + 4.1, window: true })

  // --- Floors, walls, slabs -----------------------------------------------------------
  const floors = []
  const doors = [] // every breakable door
  const roofY = floorY(B.floors)
  for (let i = 0; i < B.floors; i++) {
    const fy = floorY(i)
    const y0 = i === 0 ? 0 : fy - SLAB
    const y1 = i === B.floors - 1 ? roofY + 1.3 : floorY(i + 1) - SLAB
    const theme = FLOORS[i]
    const floorMat = studs(theme.floor, { tile: 4 })
    // front wall: entrance (ground) or exit door (upper floors)
    const front = i === 0
      ? [{ a: -B.entranceW / 2, b: B.entranceW / 2, y0: fy, y1: fy + B.doorH }, win(-10.5, fy), win(-5.5, fy), win(5.5, fy), win(10.5, fy)]
      : [{ a: B.exitX - B.doorW / 2, b: B.exitX + B.doorW / 2, y0: fy, y1: fy + B.doorH }, win(-10.5, fy), win(-5, fy), win(0.5, fy), win(11, fy)]
    wallX(ID, B.halfD, -B.halfW, B.halfW, y0, y1, front)
    wallX(-B.halfD, -ID, -B.halfW, B.halfW, y0, y1, [win(-10, fy), win(-5, fy), win(5, fy), win(10, fy)])
    for (const sx of [-1, 1]) {
      const [xa, xb] = sx < 0 ? [-B.halfW, -IW] : [IW, B.halfW]
      wallZ(xa, xb, -ID, ID, y0, y1, [win(-7, fy), win(0, fy), win(7, fy)])
    }

    // floor slab (ground: a thin slab; upper floors: with the stair hole of the floor below)
    if (i === 0) R(root, -IW, 0, -ID, IW, fy, ID, floorMat, { collide: true, cast: false })
    else {
      const v = stairSide(i - 1)
      const [bx0, bx1] = v < 0 ? [-IW, -BAND_IN] : [BAND_IN, IW]
      const [mx0, mx1] = v < 0 ? [-BAND_IN, IW] : [-IW, BAND_IN]
      R(root, mx0, fy - SLAB, -ID, mx1, fy, ID, floorMat, { collide: true })
      R(root, bx0, fy - SLAB, -ID, bx1, fy, B.stairHigh, floorMat, { collide: true }) // landing
      R(root, bx0, fy - SLAB, VEST_FRONT - 0.3, bx1, fy, ID, floorMat, { collide: true })
    }

    // trim band at this floor line, plinth at the ground
    if (i > 0) {
      const ty0 = fy - SLAB - 0.12
      const ty1 = fy + 0.12
      R(root, -B.halfW - 0.25, ty0, B.halfD, B.halfW + 0.25, ty1, B.halfD + 0.25, trimMat)
      R(root, -B.halfW - 0.25, ty0, -B.halfD - 0.25, B.halfW + 0.25, ty1, -B.halfD, trimMat)
      R(root, -B.halfW - 0.25, ty0, -B.halfD, -B.halfW, ty1, B.halfD, trimMat)
      R(root, B.halfW, ty0, -B.halfD, B.halfW + 0.25, ty1, B.halfD, trimMat)
    }

    // ceiling light panels (emissive) + a baseboard
    const ceil = floorY(i + 1) - SLAB
    for (const lx of [-6, 0, 6]) for (const lz of [-4, 4]) R(root, lx - 1.4, ceil - 0.08, lz - 0.5, lx + 1.4, ceil, lz + 0.5, emissive('#fff4dc', 1.6, '#c8c0a0'), { cast: false })
    R(root, -IW, fy, -ID, IW, fy + 0.25, -ID + 0.08, trimMat, { cast: false })
    R(root, -IW, fy, ID - 0.08, IW, fy + 0.25, ID, trimMat, { cast: false })

    floors.push({ i, fy, theme, spots: [], hpDoor: null, exitDoor: null, anchor: null, ceil })
  }

  // --- Roof: slab, parapet cap, machinery, water tower, antenna, neon sign ------------------
  R(root, -IW, roofY - SLAB, -ID, IW, roofY, ID, studs('#8c88b8', { tile: 4 }), { collide: true })
  R(root, -B.halfW - 0.2, roofY + 1.3, -B.halfD - 0.2, B.halfW + 0.2, roofY + 1.6, B.halfD + 0.2, trimMat)
  R(root, -B.halfW - 0.3, 0, -B.halfD - 0.3, B.halfW + 0.3, 0.7, B.halfD + 0.3, plinthMat)
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) R(root, cx * B.halfW - 0.75, 0, cz * B.halfD - 0.75, cx * B.halfW + 0.75, roofY + 1.9, cz * B.halfD + 0.75, trimMat)
  const acMat = metal('#c7cbd6', 0.4)
  for (const [ax, az] of [[-8, -6], [-3, -6], [8, 4]]) {
    R(root, ax - 1.6, roofY, az - 1.2, ax + 1.6, roofY + 1.6, az + 1.2, acMat)
    R(root, ax - 1.1, roofY + 1.6, az - 0.7, ax + 1.1, roofY + 1.7, az + 0.7, metal('#3a3e4a', 0.5))
  }
  // water tower
  for (const [lx, lz] of [[7, -7], [10, -7], [7, -4], [10, -4]]) R(root, lx - 0.15, roofY, lz - 0.15, lx + 0.15, roofY + 3.2, lz + 0.15, metal('#4a4f5c'))
  const tank = new Mesh(new CylinderGeometry(1.8, 1.8, 3, 20), solid('#a0663a', 0.7))
  tank.position.copy(W(8.5, roofY + 4.7, -5.5))
  tank.castShadow = true
  root.add(tank)
  R(root, 6.6, roofY + 6.2, -7.4, 10.4, roofY + 6.5, -3.6, solid('#7a4a24', 0.7))
  // antenna with a blinking beacon (live)
  R(root, -10.2, roofY, 6.8, -9.8, roofY + 8, 7.2, metal('#c9ced8', 0.3))
  const beaconMat = new MeshStandardMaterial({ color: '#330000', emissive: '#ff2030', emissiveIntensity: 4 })
  const beacon = new Mesh(new SphereGeometry(0.35, 12, 10), beaconMat)
  beacon.position.copy(W(-10, roofY + 8.3, 7))
  live.add(beacon)
  // neon name sign on a frame over the front edge
  const nameSign = canvasSign(17, 3.2, 1024, 192, (ctx, w, h) => {
    ctx.fillStyle = '#16082e'
    roundRect(ctx, 0, 0, w, h, 40)
    ctx.fill()
    ctx.strokeStyle = '#ff4fd8'
    ctx.lineWidth = 10
    roundRect(ctx, 12, 12, w - 24, h - 24, 32)
    ctx.stroke()
    outlinedText(ctx, 'VAULT TOWER', w / 2, h / 2 + 4, 120, '#ffe14d', '#ff2fa0')
  }, { emissiveBoost: 1.4 })
  nameSign.mesh.position.copy(W(0, roofY + 4.2, B.halfD - 0.4))
  live.add(nameSign.mesh)
  R(root, -7.5, roofY, B.halfD - 0.7, -7.2, roofY + 2.7, B.halfD - 0.5, metal('#4a4f5c'))
  R(root, 7.2, roofY, B.halfD - 0.7, 7.5, roofY + 2.7, B.halfD - 0.5, metal('#4a4f5c'))

  // --- Entrance: awning, planters, name plate ---------------------------------------------
  R(root, -3.2, 4.9, B.halfD, 3.2, 5.15, B.halfD + 2.6, solid('#b0122a', 0.6))
  R(root, -3.2, 4.6, B.halfD + 2.45, 3.2, 5.0, B.halfD + 2.6, solid('#ffd21f', 0.5))
  for (const sx of [-3.0, 3.0]) R(root, sx - 0.1, 0.15, B.halfD + 2.4, sx + 0.1, 4.9, B.halfD + 2.6, metal('#2d3140'))
  for (const sx of [-4.6, 4.6]) {
    R(root, sx - 0.8, 0.15, B.halfD + 0.4, sx + 0.8, 1.0, B.halfD + 1.8, studs('#7a4a24', { tile: 2 }), { collide: true })
    R(root, sx - 0.7, 1.0, B.halfD + 0.5, sx + 0.7, 2.0, B.halfD + 1.7, solid('#3fbf2a', 0.8))
  }

  // --- Stairs + stairwells -------------------------------------------------------------------
  const run = B.stairLow - B.stairHigh
  const slope = Math.atan2(H, run)
  const steps = 16
  for (let i = 0; i < B.floors - 1; i++) {
    const s = stairSide(i)
    const fy = floorY(i)
    const [x0, x1] = s < 0 ? [-IW, -BAND_IN] : [BAND_IN, IW]
    const d = run / steps
    const rise = H / steps
    for (let k = 0; k < steps; k++) {
      R(root, x0, fy, B.stairLow - (k + 1) * d, x1, fy + (k + 1) * rise, B.stairLow - k * d, stairMat, { cast: k % 4 === 0 })
      R(root, x0, fy + (k + 1) * rise - 0.04, B.stairLow - k * d - 0.08, x1, fy + (k + 1) * rise + 0.02, B.stairLow - k * d, frameMat, { cast: false }) // nosing
    }
    // ramp collider (raised half a step so feet sit on the nosings)
    const L = Math.hypot(run, H) + 0.6
    const cz = (B.stairLow + B.stairHigh) / 2
    const cy = fy + H / 2 + rise * 0.5
    const n = 0.2
    // solidCuboid(hx, hy, hz, x, y, z, rotY, rotX)
    solidCuboid((x1 - x0) / 2, n, L / 2, OX + (x0 + x1) / 2, cy - n * Math.cos(slope), OZ + cz - n * Math.sin(slope), 0, slope)
    // inner railing: glass panel + handrail along the slope, and a wall collider
    const rx = s * BAND_IN
    const railGroup = new Group()
    for (let k = 0; k <= 6; k++) {
      const z = B.stairHigh + 0.3 + k * ((run - 1.6) / 6)
      const sy = fy + ((B.stairLow - z) / run) * H + rise * 0.5
      R(root, rx - 0.06, sy, z - 0.06, rx + 0.06, sy + 1.15, z + 0.06, railMat, { cast: false })
    }
    const hand = new Mesh(boxGeo(0.12, 0.12, L - 1.4), railMat)
    hand.position.copy(W(rx, fy + H / 2 + 1.25, cz - 0.4))
    hand.rotation.x = slope
    railGroup.add(hand)
    const pane = new Mesh(boxGeo(0.05, 1.0, L - 1.6), winGlass)
    pane.position.copy(W(rx, fy + H / 2 + 0.65, cz - 0.4))
    pane.rotation.x = slope
    glassRoot.add(pane)
    root.add(railGroup)
    S(rx - 0.12, fy, B.stairHigh, rx + 0.12, floorY(i + 1) - SLAB, B.stairLow - 1.2)

    // the stairwell enclosure on floor i+1 with the HP door into that floor
    const up = floorY(i + 1)
    const ceil = i + 2 < B.floors ? floorY(i + 2) - SLAB : roofY - SLAB
    const wx0 = s * (BAND_IN - 0.3)
    const wx1 = s * BAND_IN
    const [wa, wb] = s < 0 ? [wx1, wx0] : [wx0, wx1]
    const dz0 = VEST_DOOR_Z - B.doorW / 2
    const dz1 = VEST_DOOR_Z + B.doorW / 2
    const vestMat = bricks(FLOORS[i + 1].wall)
    wallZ(wa, wb, -ID, VEST_FRONT, up - SLAB, ceil, [{ a: dz0, b: dz1, y0: up, y1: up + B.doorH }], vestMat)
    R(root, x0, up - SLAB, VEST_FRONT - 0.3, x1, ceil, VEST_FRONT, vestMat, { collide: true })
    // door frame
    R(root, wa - 0.08, up, dz0 - 0.22, wb + 0.08, up + B.doorH + 0.25, dz0, frameMat)
    R(root, wa - 0.08, up, dz1, wb + 0.08, up + B.doorH + 0.25, dz1 + 0.22, frameMat)
    R(root, wa - 0.08, up + B.doorH, dz0, wb + 0.08, up + B.doorH + 0.25, dz1, frameMat)
    // "STAIRS" lamp over the landing
    R(root, x0 + 0.6, ceil - 0.1, -ID + 0.6, x1 - 0.6, ceil, -ID + 2.4, emissive('#fff4dc', 1.4, '#c8c0a0'), { cast: false })
    floors[i + 1].hpDoor = makeHpDoor(i + 1, s, (wa + wb) / 2, up)
  }

  // --- Doors -----------------------------------------------------------------------------------

  function makeHpDoor(floorIndex, side, x, y) {
    const g = new Group()
    g.position.copy(W(x, y, VEST_DOOR_Z))
    const slab = new Mesh(boxGeo(0.22, B.doorH, B.doorW), [doorFace, doorFace, doorEdge, doorEdge, doorEdge, doorEdge])
    slab.position.y = B.doorH / 2
    slab.castShadow = true
    g.add(slab)
    for (const sx of [-1, 1]) {
      const knob = new Mesh(new SphereGeometry(0.11, 12, 10), knobMat)
      knob.position.set(sx * 0.18, B.doorH * 0.48, B.doorW * 0.36)
      g.add(knob)
    }
    g.visible = false
    live.add(g)
    const hp = FLOORS[floorIndex].doorHP
    const bar = canvasSign(2.4, 0.6, 256, 64, () => {})
    bar.mesh.material.depthTest = true
    bar.mesh.material.transparent = true
    bar.mesh.position.copy(W(x + side * 0.3, y + B.doorH + 0.75, VEST_DOOR_Z))
    bar.mesh.rotation.y = side * Math.PI / 2
    bar.mesh.visible = false
    live.add(bar.mesh)
    const back = bar.mesh.clone()
    back.rotation.y = -side * Math.PI / 2
    back.position.copy(W(x - side * 0.3, y + B.doorH + 0.75, VEST_DOOR_Z))
    live.add(back)
    const door = {
      kind: 'hp',
      floor: floorIndex,
      side,
      group: g,
      slab,
      bar,
      barBack: back,
      hp,
      max: hp,
      broken: false,
      fall: -1,
      collider: null,
      colliderDesc: [OX + x - 0.15, y, OZ + VEST_DOOR_Z - B.doorW / 2, OX + x + 0.15, y + B.doorH, OZ + VEST_DOOR_Z + B.doorW / 2],
      at: W(x + side * 1.1, y, VEST_DOOR_Z), // where the player stands to hit it (stairwell side)
      center: W(x, y + B.doorH / 2, VEST_DOOR_Z),
    }
    drawBar(door)
    doors.push(door)
    return door
  }
  function drawBar(door) {
    door.bar.setDraw((ctx, w, h) => {
      // A plain health bar (no number): dark frame, a fill that runs green -> yellow -> red as the
      // door weakens, a shine strip on top.
      ctx.fillStyle = '#14081f'
      roundRect(ctx, 0, 0, w, h, 28)
      ctx.fill()
      ctx.fillStyle = '#3a2a44'
      roundRect(ctx, 6, 6, w - 12, h - 12, 22)
      ctx.fill()
      const k = door.max > 0 ? Math.max(0, Math.min(1, door.hp / door.max)) : 0
      if (k > 0) {
        const [top, bot] = k > 0.5 ? ['#8dff5a', '#2fbf1f'] : k > 0.25 ? ['#ffe44d', '#f0a10f'] : ['#ff6a5a', '#d81f2a']
        const g = ctx.createLinearGradient(0, 6, 0, h - 6)
        g.addColorStop(0, top)
        g.addColorStop(1, bot)
        ctx.fillStyle = g
        const fw = Math.max(h - 12, (w - 12) * k)
        roundRect(ctx, 6, 6, fw, h - 12, 22)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        roundRect(ctx, 14, 10, Math.max(0, fw - 16), (h - 12) * 0.28, 8)
        ctx.fill()
      }
    })
    door.barBack.material = door.bar.mesh.material
  }

  const glassFrameMat = metal('#2d3140', 0.4)
  const glassPaneMat = glass('#bfeaff', 0.42)
  function makeGlassDoor(floorIndex, x, y, width, double) {
    const g = new Group()
    g.position.copy(W(x, y, ID + B.wall / 2))
    const panes = []
    const leaves = double ? [-width / 4, width / 4] : [0]
    const lw = double ? width / 2 : width
    const parts = []
    const piece = (w, h, d, px, py, pz) => parts.push(boxGeo(w, h, d).translate(px, py, pz))
    for (const lx of leaves) {
      piece(lw, 0.12, 0.16, lx, 0.06, 0)
      piece(lw, 0.12, 0.16, lx, B.doorH - 0.06, 0)
      piece(0.12, B.doorH, 0.16, lx - lw / 2 + 0.06, B.doorH / 2, 0)
      piece(0.12, B.doorH, 0.16, lx + lw / 2 - 0.06, B.doorH / 2, 0)
      piece(lw * 0.6, 0.08, 0.12, lx, B.doorH * 0.48, 0.1)
      const pane = new Mesh(boxGeo(lw - 0.2, B.doorH - 0.2, 0.05), glassPaneMat)
      pane.position.set(lx, B.doorH / 2, 0)
      g.add(pane)
      panes.push(pane)
    }
    const frame = new Mesh(mergeGeometries(parts), glassFrameMat)
    frame.castShadow = true
    g.add(frame)
    live.add(g)
    const door = {
      kind: 'glass',
      floor: floorIndex,
      group: g,
      panes,
      broken: false,
      collider: null,
      colliderDesc: [OX + x - width / 2, y, OZ + ID, OX + x + width / 2, y + B.doorH, OZ + B.halfD],
      at: W(x, y, B.halfD - B.wall / 2), // in the door plane: reachable from inside and from the balcony
      center: W(x, y + B.doorH / 2, B.halfD - B.wall / 2),
    }
    doors.push(door)
    return door
  }

  // ground entrance + upper-floor exits with balconies and zipline poles
  floors[0].exitDoor = makeGlassDoor(0, 0, floorY(0), B.entranceW, true)
  for (let i = 1; i < B.floors; i++) {
    const fy = floorY(i)
    floors[i].exitDoor = makeGlassDoor(i, B.exitX, fy, B.doorW, false)
    const bx0 = B.exitX - 2.6
    const bx1 = B.exitX + 2.6
    const bz0 = B.halfD
    const bz1 = B.halfD + ZIPLINE.balconyDepth
    R(root, bx0, fy - 0.4, bz0, bx1, fy, bz1, studs('#ff8a1a', { tile: 4 }), { collide: true })
    R(root, bx0 + 0.3, fy - 1.2, bz0, bx0 + 0.6, fy - 0.4, bz0 + 2, metal('#4a4f5c'))
    R(root, bx1 - 0.6, fy - 1.2, bz0, bx1 - 0.3, fy - 0.4, bz0 + 2, metal('#4a4f5c'))
    // railing: glass panels with a steel top rail; tall invisible collider
    R(glassRoot, bx0, fy, bz1 - 0.06, bx1, fy + 1.1, bz1, winGlass, { cast: false })
    R(glassRoot, bx0, fy, bz0, bx0 + 0.06, fy + 1.1, bz1, winGlass, { cast: false })
    R(glassRoot, bx1 - 0.06, fy, bz0, bx1, fy + 1.1, bz1, winGlass, { cast: false })
    R(root, bx0, fy + 1.1, bz1 - 0.1, bx1, fy + 1.22, bz1 + 0.04, railMat)
    R(root, bx0 - 0.04, fy + 1.1, bz0, bx0 + 0.1, fy + 1.22, bz1, railMat)
    R(root, bx1 - 0.1, fy + 1.1, bz0, bx1 + 0.04, fy + 1.22, bz1, railMat)
    S(bx0, fy, bz1 - 0.2, bx1, fy + 2.6, bz1 + 0.1)
    S(bx0 - 0.1, fy, bz0, bx0 + 0.1, fy + 2.6, bz1)
    S(bx1 - 0.1, fy, bz0, bx1 + 0.1, fy + 2.6, bz1)
    // zipline pole at the front-right corner
    const px = bx1 - 0.5
    const pz = bz1 - 0.5
    R(root, px - 0.14, fy, pz - 0.14, px + 0.14, fy + 5.2, pz + 0.14, metal('#5c6170', 0.4))
    R(root, px - 0.3, fy + 4.9, pz - 0.3, px + 0.3, fy + 5.3, pz + 1.0, metal('#3a3e4a', 0.5))
    R(root, px - 0.6, fy + 2.0, pz - 0.05, px + 0.6, fy + 2.4, pz + 0.05, solid('#ffcc22', 0.5))
    const pad = groundDecal(ringTexture(), '#33c9ff', 2.6, 0.85)
    pad.position.copy(W(B.exitX, fy + 0.03, bz0 + 1.5))
    pad.visible = false
    live.add(pad)
    floors[i].anchor = {
      top: W(px, fy + 5.1, pz + 0.8),
      stand: W(B.exitX, fy + 0.02, bz0 + 1.5),
      pad,
    }
  }

  // --- Interiors ---------------------------------------------------------------------------------
  const artMats = []
  for (const f of floors) furnish(f)

  function furnish(f) {
    const { i, fy } = f
    const add = (x0, y0, z0, x1, y1, z1, m, collide = false) => R(root, x0, fy + y0, z0, x1, fy + y1, z1, m, { collide })
    const th = f.theme.theme
    const wood = solid('#8a4a22', 0.6)
    const dark = solid('#2b2440', 0.6)
    const plant = (x, z) => {
      add(x - 0.45, 0, z - 0.45, x + 0.45, 0.8, z + 0.45, solid('#d9702a', 0.7), true)
      add(x - 0.6, 0.8, z - 0.6, x + 0.6, 1.9, z + 0.6, solid('#3fbf2a', 0.85))
      add(x - 0.35, 1.9, z - 0.35, x + 0.35, 2.5, z + 0.35, solid('#55d633', 0.85))
    }
    if (th === 0) {
      // reception desk (back left), sofa + table (front right), plants, vending machine
      add(-9.5, 0, -8.6, -4.5, 1.1, -7.4, wood, true)
      add(-9.6, 1.1, -8.7, -4.4, 1.2, -7.3, solid('#f2efe8', 0.25))
      add(-8.2, 1.2, -8.4, -7.2, 1.85, -8.3, emissive('#58c8ff', 1.4, '#0a1a2a'))
      add(4.0, 0, 8.4, 9.0, 0.55, 9.6, solid('#c2185b', 0.8), true)
      add(4.0, 0.55, 9.3, 9.0, 1.3, 9.8, solid('#a3124a', 0.8))
      add(5.5, 0, 6.6, 7.5, 0.45, 7.6, wood, true)
      plant(-8.5, 9.4)
      plant(9.2, -9.2)
      add(4.5, 0, -10.3, 6.3, 3.0, -9.3, solid('#2c6bff', 0.4), true)
      add(4.7, 1.2, -9.3, 6.1, 2.7, -9.25, emissive('#9fe8ff', 1.2, '#103040'))
    } else if (th === 1) {
      for (const [dx, dz] of [[-8.5, 8.4], [-2.8, 8.4], [8.5, -8.6]]) {
        add(dx - 1.6, 0.9, dz - 0.8, dx + 1.6, 1.0, dz + 0.8, wood, false)
        add(dx - 1.5, 0, dz - 0.7, dx - 1.3, 0.9, dz + 0.7, dark, true)
        add(dx + 1.3, 0, dz - 0.7, dx + 1.5, 0.9, dz + 0.7, dark, true)
        add(dx - 0.6, 1.0, dz - 0.15, dx + 0.6, 1.75, dz - 0.05, dark)
        add(dx - 0.52, 1.07, dz - 0.05, dx + 0.52, 1.68, dz - 0.03, emissive('#58c8ff', 1.6, '#0a1a2a'))
        add(dx - 0.4, 0, dz + 1.0, dx + 0.4, 0.55, dz + 1.8, solid('#3b3e4a', 0.5))
        add(dx - 0.4, 0.55, dz + 1.7, dx + 0.4, 1.4, dz + 1.85, solid('#3b3e4a', 0.5))
      }
      for (const fx of [-3.4, -2.5]) add(fx - 0.45, 0, -10.3, fx + 0.45, 1.8, -9.5, metal('#9aa1ad', 0.5), true)
      add(9.0, 0, 8.6, 9.8, 1.4, 9.4, solid('#e8f2ff', 0.3), true)
      add(9.1, 1.4, 8.7, 9.7, 2.1, 9.3, glass('#7fd0ff', 0.6))
    } else if (th === 2) {
      // safe-deposit walls + a round vault door on the back wall, leather sofa
      const steel = metal('#b8bfcc', 0.35)
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -9.6 : 3.6
        add(x0, 0, -10.4, x0 + 6, 3.6, -10.0, metal('#6c7385', 0.45), true)
        for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) add(x0 + 0.1 + c * 0.98, 0.2 + r * 0.85, -10.0, x0 + 0.98 + c * 0.98, 0.95 + r * 0.85, -9.92, steel)
      }
      add(-9.6, 0, 8.4, -6.4, 0.6, 9.6, solid('#4a2b1a', 0.5), true)
      add(-9.6, 0.6, 9.2, -6.4, 1.3, 9.8, solid('#3a2014', 0.5))
      add(-5.6, 0, 8.6, -1.6, 1.0, 9.6, metal('#ffc531', 0.3), true) // gold bar shelf
      for (let k = 0; k < 5; k++) add(-5.3 + k * 0.76, 1.0, 8.8, -4.7 + k * 0.76, 1.25, 9.4, metal('#ffc531', 0.2))
    } else if (th === 3) {
      // gallery: paintings on the back wall, rope stanchions, a statue
      const colors = ['#ff4d6d', '#38c6ff', '#ffd23a', '#59ff8a', '#b46bff']
      for (const [px, pw] of [[-7, 3], [7, 3]]) {
        add(px - pw / 2 - 0.15, 1.6, -10.4, px + pw / 2 + 0.15, 4.0, -10.25, solid('#d9a520', 0.35, 0.8))
        const k = ((px > 0) | 0) + (i % 3) * 2
        if (!artMats[k]) {
          const c = document.createElement('canvas')
          c.width = c.height = 128
          const ctx = c.getContext('2d')
          ctx.fillStyle = colors[k % 5]
          ctx.fillRect(0, 0, 128, 128)
          for (let q = 0; q < 8; q++) {
            ctx.fillStyle = colors[(q + k) % 5]
            ctx.beginPath()
            ctx.arc(rand() * 128, rand() * 128, 10 + rand() * 30, 0, Math.PI * 2)
            ctx.fill()
          }
          artMats[k] = new MeshStandardMaterial({ map: plainTex(c), roughness: 0.8 })
        }
        const art = new Mesh(new PlaneGeometry(pw, 2.1), artMats[k])
        art.position.copy(W(px, fy + 2.8, -10.22))
        root.add(art)
      }
      for (const [sx, sz] of [[-10.2, 7], [-6.2, 7], [6.2, 7], [10.2, 7]]) {
        add(sx - 0.12, 0, sz - 0.12, sx + 0.12, 1.0, sz + 0.12, metal('#d9a520', 0.3))
        add(sx - 0.2, 0, sz - 0.2, sx + 0.2, 0.08, sz + 0.2, metal('#d9a520', 0.3))
      }
      add(-10.2, 0.85, 6.95, -6.2, 0.95, 7.05, solid('#b0102a', 0.8))
      add(6.2, 0.85, 6.95, 10.2, 0.95, 7.05, solid('#b0102a', 0.8))
      add(-1.2, 0, 8.6, 1.2, 1.1, 9.8, solid('#f2efe8', 0.3), true)
      add(-0.5, 1.1, 8.9, 0.5, 2.8, 9.5, solid('#e8e4dc', 0.4))
      add(-0.4, 2.8, 9.0, 0.4, 3.4, 9.4, solid('#e8e4dc', 0.4))
    } else {
      // penthouse: rug, gold columns, piano, chandelier
      add(-6, 0, -6, 6, 0.05, 6, solid('#9a0f2a', 0.9))
      add(-5.6, 0.05, -5.6, 5.6, 0.07, 5.6, solid('#c8102e', 0.9))
      for (const [cx, cz] of [[-7.5, -9.6], [-10, 9.3], [7.5, -9.6], [10, 9.3]]) add(cx - 0.45, 0, cz - 0.45, cx + 0.45, H - SLAB, cz + 0.45, metal('#ffc531', 0.3), true)
      add(-9.5, 0, -8.8, -5.5, 1.2, -6.8, solid('#141218', 0.25), true)
      add(-9.4, 1.0, -6.95, -5.6, 1.12, -6.6, solid('#fafafa', 0.3))
      add(-9.4, 1.2, -8.8, -5.6, 2.3, -8.6, solid('#141218', 0.25))
      const chand = new Group()
      chand.position.copy(W(0, f.ceil - 1.4, 0))
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2
        const c = new Mesh(boxGeo(0.12, 0.45, 0.12), emissive('#fff2c8', 2.6, '#806a30'))
        c.position.set(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2)
        chand.add(c)
      }
      const ringMesh = new Mesh(boxGeo(2.8, 0.12, 2.8), metal('#ffc531', 0.3))
      ringMesh.position.y = 0.3
      chand.add(ringMesh)
      root.add(chand)
    }
    // treasure spots (data only: visuals are built while the floor is live)
    B.spots.forEach(([sx, sz], j) => {
      f.spots.push({ floor: i, index: j, at: W(sx, fy, sz), item: null, holder: null, model: null, spin: rand() * 6 })
    })
  }

  // --- Bake -------------------------------------------------------------------------------------
  const baked = bake(root, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(baked)
  const bakedGlass = bake(glassRoot, false)
  bakedGlass.traverse((o) => {
    if (o.isMesh) o.renderOrder = 1
  })
  scene.add(bakedGlass)

  // Lights that follow the player's floor (fixed count: no shader recompiles).
  const lamps = [new PointLight('#fff1d6', 42, 26, 1.2), new PointLight('#fff1d6', 42, 26, 1.2), new PointLight('#ffe6c4', 30, 22, 1.2)]
  for (const l of lamps) live.add(l)

  // --- Floor streaming ----------------------------------------------------------------------
  // Only floors near the player keep their treasure models, labels, clover sign, door and
  // balcony pad in the scene; the rest is plain data (a 50-floor tower stays cheap to draw).
  const liveFloors = new Set()
  function buildSpot(spot) {
    if (!spot.item) return
    const t = TREASURE[spot.item]
    const r = RARITY[t.rarity]
    const holder = new Group()
    holder.position.copy(spot.at)
    const disc = new Mesh(boxGeo(1.9, 0.1, 1.9), solid(r.tier >= 3 ? r.glow : '#f4f2ff', 0.4))
    disc.position.y = 0.05
    disc.receiveShadow = true
    const model = makeTreasure(spot.item, 1.1)
    model.position.y = 0.12
    const label = infoLabel(
      [
        { text: t.name, size: 40, color: '#ffffff' },
        { text: r.name, size: 30, color: r.color, outline: r.outline ?? '#0d0a1f' },
        { text: money(t.value), size: 42, color: '#7dff5a' },
      ],
      0.015,
    )
    label.position.y = 1.75
    const rays = groundDecal(raysTexture(), r.glow, 3.6, r.tier >= 2 ? 0.9 : 0.55)
    rays.position.y = 0.12
    const glowS = glowSprite(r.glow, 2.4, r.tier >= 3 ? 0.65 : 0.3)
    glowS.position.y = 0.7
    holder.add(disc, model, label, rays, glowS)
    live.add(holder)
    Object.assign(spot, { holder, model, label, rays, disc, glow: glowS })
  }
  function dropSpot(spot) {
    if (!spot.holder) return
    live.remove(spot.holder)
    // the treasure model shares cached geometry/materials: only per-spot pieces are freed
    spot.label.dispose()
    spot.disc.geometry.dispose()
    spot.rays.geometry.dispose()
    spot.rays.material.dispose()
    spot.glow.material.dispose()
    spot.holder = spot.model = spot.label = spot.rays = spot.disc = spot.glow = null
  }
  function showFloor(i) {
    const f = floors[i]
    liveFloors.add(i)
    for (const sp of f.spots) buildSpot(sp)
    const sign = paintCloverSign(f.theme.luckSign)
    const signTex = plainTex(sign.canvas)
    const signMesh = new Mesh(new PlaneGeometry(4.6, 2.3), new MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.35 }))
    signMesh.position.copy(W(0, f.fy + 3.1, -ID + 0.05))
    const plate = infoLabel([{ text: `Floor ${i + 1}`, size: 44, color: '#ffe14d' }, { text: f.theme.name, size: 34, color: '#ffffff' }], 0.016)
    plate.position.copy(W(0, f.fy + 4.55, -ID + 0.4))
    live.add(signMesh, plate)
    f.decor = { signMesh, signTex, plate }
    if (f.hpDoor) {
      f.hpDoor.group.visible = f.hpDoor.fall < 0 || f.hpDoor.fall < 2.2
      f.hpDoor.bar.mesh.visible = f.hpDoor.barBack.visible = !f.hpDoor.broken
    }
    if (f.anchor) f.anchor.pad.visible = true
  }
  function hideFloor(i) {
    const f = floors[i]
    liveFloors.delete(i)
    for (const sp of f.spots) dropSpot(sp)
    if (f.decor) {
      live.remove(f.decor.signMesh, f.decor.plate)
      f.decor.signTex.dispose()
      f.decor.signMesh.material.dispose()
      f.decor.signMesh.geometry.dispose()
      f.decor.plate.dispose()
      f.decor = null
    }
    if (f.hpDoor) {
      f.hpDoor.group.visible = false
      f.hpDoor.bar.mesh.visible = f.hpDoor.barBack.visible = false
    }
    if (f.anchor) f.anchor.pad.visible = false
  }
  function setLive(want) {
    for (const i of [...liveFloors]) if (!want.has(i)) hideFloor(i)
    for (const i of want) if (!liveFloors.has(i)) showFloor(i)
  }

  function setSpot(spot, id) {
    dropSpot(spot)
    spot.item = id
    if (liveFloors.has(spot.floor)) buildSpot(spot)
  }

  // --- Door state -------------------------------------------------------------------------------
  function addCollider(door) {
    if (door.collider) return
    const [x0, y0, z0, x1, y1, z1] = door.colliderDesc
    door.collider = solidMM(x0, y0, z0, x1, y1, z1)
  }
  function removeCollider(door) {
    if (!door.collider) return
    world.removeCollider(door.collider, false)
    door.collider = null
  }
  function resetDoors() {
    for (const d of doors) {
      d.broken = false
      addCollider(d)
      if (d.kind === 'glass') {
        d.panes.forEach((p) => (p.visible = true))
      } else {
        d.hp = d.max
        d.fall = -1
        d.group.visible = liveFloors.has(d.floor)
        d.group.rotation.set(0, 0, 0)
        d.group.position.y = d.center.y - B.doorH / 2
        d.slab.position.set(0, B.doorH / 2, 0)
        d.bar.mesh.visible = d.barBack.visible = liveFloors.has(d.floor)
        drawBar(d)
      }
    }
  }
  function smashGlass(door) {
    if (door.broken) return
    door.broken = true
    removeCollider(door)
    door.panes.forEach((p) => (p.visible = false))
    const c = door.center
    fx.chunks(c, { count: 46, glass: true, size: [0.12, 0.45], speed: 5, up: 3, floor: c.y - B.doorH / 2 + 0.02, spread: 1.1 })
    fx.burst(c, { count: 40, color: ['#ffffff', '#bfeaff', '#7fd8ff'], speed: 7, up: 1, spread: 1, size: 0.35, life: 0.7 })
    fx.flash('#dff6ff', 0.25)
    fx.shake(0.45)
    sfx.glass()
  }
  // Returns true when the hit broke it.
  function hitDoor(door, damage) {
    if (door.broken) return false
    door.hp = Math.max(0, door.hp - damage)
    door.wobble = 0.18
    const c = door.center
    fx.chunks(c, { count: 5, color: ['#7a2a12', '#93371a', '#5a1e0c'], size: [0.08, 0.22], speed: 3, up: 2.5, floor: c.y - B.doorH / 2 + 0.02, spread: 0.6 })
    fx.burst(c, { count: 8, color: '#d9b38c', speed: 3, up: 1.2, spread: 0.6, size: 0.4, life: 0.6, gravity: -2 })
    fx.shake(0.18)
    sfx.hit()
    if (door.hp > 0) {
      drawBar(door)
      return false
    }
    door.broken = true
    door.fall = 0
    removeCollider(door)
    door.bar.mesh.visible = door.barBack.visible = false
    fx.chunks(c, { count: 30, color: ['#7a2a12', '#93371a', '#5a1e0c', '#ffc531'], size: [0.12, 0.5], speed: 6, up: 4, floor: c.y - B.doorH / 2 + 0.02, spread: 1 })
    fx.burst(c, { count: 50, color: ['#ffe2b8', '#ffd21f', '#ffffff'], speed: 8, up: 2, spread: 1, size: 0.5, life: 0.8 })
    fx.shake(0.7)
    sfx.doorBreak()
    return true
  }
  resetDoors()

  // --- Queries -----------------------------------------------------------------------------------
  const local = new Vector3()
  function toLocal(p) {
    return local.set(p.x - OX, p.y, p.z - OZ)
  }
  // Floor index whose ROOM the point is in (outside the stair bands), else -1.
  function roomAt(p) {
    const l = toLocal(p)
    if (Math.abs(l.x) > BAND_IN - 0.4 || Math.abs(l.z) > ID) return -1
    const i = Math.floor((l.y - FLOOR0 + 0.6) / H)
    return i >= 0 && i < B.floors ? i : -1
  }
  // Floor index by height when anywhere inside the shell (stairs included), else -1.
  function insideFloor(p, withBalcony = true) {
    const l = toLocal(p)
    if (Math.abs(l.x) > B.halfW || l.z < -B.halfD || l.z > B.halfD + (withBalcony && l.y > 2 ? ZIPLINE.balconyDepth + 0.2 : 0)) return -1
    const i = Math.floor((l.y - FLOOR0 + 0.6) / H)
    return Math.max(0, Math.min(B.floors - 1, i))
  }

  let elapsed = 0
  const want = new Set()
  let forced = -1 // a floor kept live on request (the zipline destination)
  return {
    keepLive(i) {
      forced = i
    },
    floors,
    doors,
    setSpot,
    resetDoors,
    smashGlass,
    hitDoor,
    roomAt,
    insideFloor,
    footprint: { x: OX, z: OZ, halfW: B.halfW, halfD: B.halfD },
    update(dt, t, playerPos) {
      elapsed += dt
      // spin + bob treasures, rays rotate
      // which floors are live: the player's floor and its neighbours (ground floor from outside)
      const fiLive = insideFloor(playerPos)
      want.clear()
      if (fiLive >= 0) for (let k = fiLive - 1; k <= fiLive + 1; k++) k >= 0 && k < B.floors && want.add(k)
      else if (playerPos.y < 3) want.add(0)
      if (forced >= 0) want.add(forced)
      setLive(want)
      for (const i of liveFloors)
        for (const s of floors[i].spots) {
          if (!s.model) continue
          s.spin += dt * 0.8
          s.model.rotation.y = s.spin
          s.model.position.y = 0.14 + Math.sin(t * 2.2 + s.index) * 0.07
          s.rays.rotation.z -= dt * 0.35
        }
      // door wobble / fall
      for (const d of doors) {
        if (d.kind !== 'hp') continue
        if (d.wobble > 0) {
          d.wobble = Math.max(0, d.wobble - dt)
          d.slab.position.x = Math.sin(d.wobble * 90) * d.wobble * 0.5 * -d.side
        }
        if (d.fall >= 0 && d.group.visible) {
          d.fall += dt
          const k = Math.min(1, d.fall / 0.55)
          d.group.rotation.z = d.side * k * k * (Math.PI / 2) // tip over into the room
          d.group.position.y = d.center.y - B.doorH / 2 - k * 0.1
          if (d.fall > 2.2) d.group.visible = false
        }
      }
      // floor lamps follow the player's floor
      const fi = insideFloor(playerPos)
      const fy = floorY(fi < 0 ? 0 : fi)
      lamps[0].position.copy(W(-6, fy + 4.4, -2))
      lamps[1].position.copy(W(6, fy + 4.4, -2))
      lamps[2].position.copy(W(0, fy + 4.4, 6))
      beaconMat.emissiveIntensity = Math.sin(elapsed * 3) > 0.6 ? 6 : 0.4
      for (const i of liveFloors) if (floors[i].anchor) floors[i].anchor.pad.material.opacity = 0.55 + Math.sin(t * 3) * 0.3
    },
  }
}
