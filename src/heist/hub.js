// The world outside the building: the HUB island (dock + zipline tower, stalls,
// billboards, roads, lamps, trees, the six bases), the river, the far bank with
// its fenced heist yard (road loop, police cruisers, ground zipline tower,
// tunnels) and terraced toy-brick cliffs with voxel trees round everything.
// Static meshes are baked into a few draw calls; sprites and animated parts stay live.
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, Vector3 } from 'three'
import { bake } from '../bake.js'
import { BASE, LAYOUT, STALLS, ZIPLINE } from '../config.js'
import { mulberry32 } from '../textures.js'
import { asphalt, box, boxGeo, boxMM, bricks, canvasSign, cliff, emissive, glass, groundDecal, infoLabel, metal, outlinedText, plainTex, ringTexture, roundRect, solid, solidMM, studs } from './kit.js'
import { paintLeaves, paintStripes } from './paint.js'
import { buildBaseShell } from './base.js'

const GREEN = '#58dd34'
const TRIM = '#ff9a1f'

// A lattice zipline tower: four posts, cross braces, a deck and a pulley arm.
export function buildTower(root, x, y0, z, top, faceZ = -1) {
  const steel = metal('#5c6170', 0.45)
  const dark = metal('#3a3e4a', 0.5)
  const h = top - y0
  const w = 0.75
  for (const [dx, dz] of [[-w, -w], [w, -w], [-w, w], [w, w]]) box(root, 0.22, h, 0.22, steel, x + dx, y0 + h / 2, z + dz)
  for (let y = y0 + 1.2; y < top - 0.4; y += 1.6) {
    box(root, 1.7, 0.12, 0.12, dark, x, y, z - w)
    box(root, 1.7, 0.12, 0.12, dark, x, y, z + w)
    box(root, 0.12, 0.12, 1.7, dark, x - w, y, z)
    box(root, 0.12, 0.12, 1.7, dark, x + w, y, z)
    // diagonal braces on two faces
    const d1 = box(root, 0.08, 2.1, 0.08, dark, x, y + 0.8, z - w)
    d1.rotation.z = 0.75
    const d2 = box(root, 0.08, 2.1, 0.08, dark, x - w, y + 0.8, z)
    d2.rotation.x = -0.75
  }
  box(root, 2.2, 0.25, 2.2, steel, x, top, z)
  box(root, 0.3, 0.3, 2.4, dark, x, top + 0.4, z + faceZ * 0.9)
  const wheel = new Mesh(new BoxGeometry(0.1, 0.7, 0.7), metal('#c9ced8', 0.25))
  wheel.position.set(x, top + 0.2, z + faceZ * 2)
  root.add(wheel)
  box(root, 1.6, 0.4, 0.15, solid('#ffcc22', 0.5), x, top - 0.6, z + faceZ * 0.85) // hazard plate
}

// Pulsing glow pad at a tower's foot (live, not baked).
function towerPad(live, x, y, z, color = '#33c9ff') {
  const pad = new Mesh(boxGeo(2.6, 0.12, 2.6), emissive(color, 1.6, '#123a6a'))
  pad.position.set(x, y + 0.06, z)
  pad.receiveShadow = true
  live.add(pad)
  const ring = groundDecal(ringTexture(), color, 4.4, 0.9)
  ring.position.set(x, y + 0.14, z)
  live.add(ring)
  return ring
}

// A market stall: four posts, counter, striped awning, title sprite, glow ring.
function buildStall(root, live, s) {
  const { x, z } = s
  const wood = solid('#8a4a22', 0.75)
  for (const [dx, dz] of [[-2.2, -1.3], [2.2, -1.3], [-2.2, 1.3], [2.2, 1.3]]) box(root, 0.28, 3.4, 0.28, wood, x + dx, 1.7, z + dz, { collide: true })
  box(root, 4.8, 1.1, 1.0, solid('#a65a28', 0.7), x, 0.55, z + 0.9, { collide: true })
  box(root, 5.0, 0.15, 1.3, solid('#c9773a', 0.6), x, 1.15, z + 0.9)
  box(root, 4.6, 2.3, 0.2, solid('#5a2e14', 0.8), x, 1.15, z - 1.3)
  // goods on the counter
  const rand = mulberry32(x * 13)
  for (let i = 0; i < 5; i++) box(root, 0.45, 0.35, 0.4, solid(['#ffd23a', '#38c6ff', '#ff4d6d', '#59ff8a'][i % 4], 0.4), x - 1.7 + i * 0.85, 1.4, z + 0.85 + (rand() - 0.5) * 0.2)
  // striped awning: a sloped slab with a scalloped valance
  const stripe = plainTex(paintStripes(s.awning, '#ffffff', 8))
  const awnMat = new MeshStandardMaterial({ map: stripe, roughness: 0.7 })
  const awn = new Mesh(boxGeo(5.4, 0.16, 3.6), awnMat)
  awn.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = i % 2 === 0 ? v / 5.4 : v / 3.6))
  awn.position.set(x, 3.65, z + 0.25)
  awn.rotation.x = 0.28
  awn.castShadow = true
  root.add(awn)
  for (let i = 0; i < 8; i++) {
    const v = new Mesh(boxGeo(0.68, 0.45, 0.08), solid(i % 2 ? '#ffffff' : s.awning, 0.7))
    v.position.set(x - 2.38 + i * 0.68, 3.0, z + 2.05)
    v.castShadow = true
    root.add(v)
  }
  const title = infoLabel([{ text: s.title, size: 64, color: s.awning === '#2bd94f' ? '#8dff5a' : s.ring, outline: '#10082a' }], 0.03)
  title.position.set(x, 4.35, z + 0.2)
  live.add(title)
  const ring = groundDecal(ringTexture(), s.ring, 3.6, 0.85)
  ring.position.set(x, 0.06, z + 3.2)
  live.add(ring)
  return { ring, at: new Vector3(x, 0, z + 3.2) }
}

// Street lamp: pole, arm and a glowing bulb.
function lamp(root, x, z, rotY = 0, color = '#ffe08a') {
  box(root, 0.22, 4.6, 0.22, metal('#2d3140', 0.5), x, 2.3, z)
  box(root, 0.5, 0.3, 0.5, metal('#2d3140', 0.5), x, 0.15, z)
  const arm = box(root, 1.1, 0.14, 0.14, metal('#2d3140', 0.5), x + Math.cos(rotY) * 0.5, 4.55, z - Math.sin(rotY) * 0.5)
  arm.rotation.y = rotY
  box(root, 0.55, 0.32, 0.55, emissive(color, 3.2, '#4a3a10'), x + Math.cos(rotY) * 1.0, 4.35, z - Math.sin(rotY) * 1.0, { cast: false })
}

// Low railing with posts (visual) along a line; the collider is separate.
function fence(root, x0, z0, x1, z1, color = '#3f7bff', h = 1.1) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.max(1, Math.round(len / 2.4))
  const yaw = Math.atan2(-(z1 - z0), x1 - x0)
  const post = solid(color, 0.5)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    box(root, 0.3, h, 0.3, post, x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t)
  }
  for (const y of [h * 0.45, h * 0.92]) box(root, len, 0.16, 0.16, solid('#9fc1ff', 0.4), (x0 + x1) / 2, y, (z0 + z1) / 2, { rotY: yaw })
}

// A parked police cruiser with a light bar (bar materials returned for blinking).
function cruiser(root, live, x, z, rotY, bars) {
  const g = new Group()
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  const white = solid('#f4f6fb', 0.35, 0.2)
  const blackPaint = solid('#1a1c25', 0.35, 0.3)
  box(g, 4.4, 0.7, 2.0, blackPaint, 0, 0.75, 0)
  box(g, 2.2, 0.72, 2.02, white, 0, 0.76, 0)
  box(g, 2.3, 0.75, 1.8, glass('#1e2a44', 0.85), -0.2, 1.45, 0)
  box(g, 2.0, 0.12, 1.7, white, -0.2, 1.86, 0)
  for (const [dx, dz] of [[1.4, 1], [1.4, -1], [-1.4, 1], [-1.4, -1]]) {
    const w = box(g, 0.75, 0.75, 0.3, solid('#111216', 0.8), dx, 0.4, dz)
    w.rotation.x = 0
  }
  box(g, 0.1, 0.18, 0.5, emissive('#fff6c2', 2.5), 2.21, 0.85, 0.6)
  box(g, 0.1, 0.18, 0.5, emissive('#fff6c2', 2.5), 2.21, 0.85, -0.6)
  root.add(g)
  // light bar stays live (blinks)
  const red = new MeshStandardMaterial({ color: '#330000', emissive: '#ff1f2f', emissiveIntensity: 3 })
  const blue = new MeshStandardMaterial({ color: '#000533', emissive: '#1f6bff', emissiveIntensity: 3 })
  const lb = new Group()
  lb.position.set(x, 0, z)
  lb.rotation.y = rotY
  const a = new Mesh(boxGeo(0.4, 0.18, 0.7), red)
  a.position.set(-0.2, 2.01, 0.38)
  const b = new Mesh(boxGeo(0.4, 0.18, 0.7), blue)
  b.position.set(-0.2, 2.01, -0.38)
  lb.add(a, b)
  live.add(lb)
  bars.push(red, blue)
}

export function buildHub(scene) {
  const root = new Group() // baked
  const live = new Group() // sprites, glows, anything animated
  scene.add(live)
  const rand = mulberry32(4242)
  const { hub, bank, river, slabDepth } = LAYOUT

  // --- Land slabs -------------------------------------------------------------
  const top = studs(GREEN, { kind: 'tile', tile: 4 })
  const side = cliff()
  const slabMats = [side, side, top, side, side, side]
  const hubSlab = new Mesh(boxGeo(hub.maxX - hub.minX, slabDepth, hub.maxZ - hub.minZ), slabMats)
  hubSlab.position.set((hub.minX + hub.maxX) / 2, -slabDepth / 2, (hub.minZ + hub.maxZ) / 2)
  hubSlab.receiveShadow = true
  root.add(hubSlab)
  solidMM(hub.minX, -slabDepth, hub.minZ, hub.maxX, 0, hub.maxZ)
  const bankSlab = new Mesh(boxGeo(bank.maxX - bank.minX, slabDepth, bank.maxZ - bank.minZ), slabMats)
  bankSlab.position.set((bank.minX + bank.maxX) / 2, -slabDepth / 2, (bank.minZ + bank.maxZ) / 2)
  bankSlab.receiveShadow = true
  root.add(bankSlab)
  solidMM(bank.minX, -slabDepth, bank.minZ, bank.maxX, 0, bank.maxZ)
  // river bed (deep blue, no collider: falling in respawns)
  const bed = new Mesh(new PlaneGeometry(200, 60), new MeshStandardMaterial({ color: '#0a3d8a', roughness: 1 }))
  bed.rotation.x = -Math.PI / 2
  bed.position.set(0, river.bedY, (river.minZ + river.maxZ) / 2)
  root.add(bed)
  // orange brick trims along both river banks
  const trim = studs(TRIM, { kind: 'round', tile: 4 })
  boxMM(root, hub.minX, -0.6, -0.4, hub.maxX, 0.12, 1.4, trim)
  boxMM(root, bank.minX, -0.6, bank.maxZ - 1.4, bank.maxX, 0.12, bank.maxZ + 0.4, trim)

  // --- Cliffs (three terraces on every outer edge) ---------------------------------
  const { tiers, tierHeight, tierStep } = LAYOUT.cliff
  const capMat = studs('#47c92b', { kind: 'tile', tile: 4 })
  const minX = hub.minX
  const maxX = hub.maxX
  const minZ = bank.minZ
  const maxZ = hub.maxZ
  const FAR = 70
  const edges = [] // for hedges: [x0,z0,x1,z1,y]
  for (let k = 0; k < tiers; k++) {
    const o = k * tierStep
    const h = (k + 1) * tierHeight
    const y0 = -slabDepth
    // west, east, north (bank side), south (hub back)
    boxMM(root, minX - o - FAR, y0, minZ - FAR, minX - o, h, maxZ + FAR, side, { cast: k === 0 })
    boxMM(root, maxX + o, y0, minZ - FAR, maxX + o + FAR, h, maxZ + FAR, side, { cast: k === 0 })
    boxMM(root, minX - FAR, y0, minZ - o - FAR, maxX + FAR, h, minZ - o, side, { cast: k === 0 })
    boxMM(root, minX - FAR, y0, maxZ + o, maxX + FAR, h, maxZ + o + FAR, side, { cast: k === 0 })
    const capEnd = k < tiers - 1 ? tierStep : FAR
    boxMM(root, minX - o - capEnd, h, minZ - o - capEnd, minX - o + 0.5, h + 0.7, maxZ + o + capEnd, capMat, { cast: false })
    boxMM(root, maxX + o - 0.5, h, minZ - o - capEnd, maxX + o + capEnd, h + 0.7, maxZ + o + capEnd, capMat, { cast: false })
    boxMM(root, minX - o - capEnd, h, minZ - o - capEnd, maxX + o + capEnd, h + 0.7, minZ - o + 0.5, capMat, { cast: false })
    boxMM(root, minX - o - capEnd, h, maxZ + o - 0.5, maxX + o + capEnd, h + 0.7, maxZ + o + capEnd, capMat, { cast: false })
    edges.push([minX - o, minZ - o, minX - o, maxZ + o, h + 0.7], [maxX + o, minZ - o, maxX + o, maxZ + o, h + 0.7], [minX - o, minZ - o, maxX + o, minZ - o, h + 0.7], [minX - o, maxZ + o, maxX + o, maxZ + o, h + 0.7])
  }
  // invisible walls so nobody climbs out
  solidMM(minX - 2, -slabDepth, minZ - 2, minX, 40, maxZ + 2)
  solidMM(maxX, -slabDepth, minZ - 2, maxX + 2, 40, maxZ + 2)
  solidMM(minX - 2, -slabDepth, minZ - 2, maxX + 2, 40, minZ)
  solidMM(minX - 2, -slabDepth, maxZ, maxX + 2, 40, maxZ + 2)

  // --- Instanced foliage: hedges on cliff lips, voxel trees ---------------------------
  const leavesMat = new MeshStandardMaterial({ map: plainTex(paintLeaves()), roughness: 0.85 })
  const trunkMat = solid('#7a4a24', 0.85)
  const hedgeList = []
  for (const [x0, z0, x1, z1, y] of edges) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.floor(len / 2.6)
    for (let i = 0; i < n; i++) {
      const t = (i + rand() * 0.5) / n
      const s = 1.6 + rand() * 1.6
      const inward = x0 === x1 ? (x0 < 0 ? -1 : 1) : 0
      const inwardZ = z0 === z1 ? (z0 < 0 ? -1 : 1) : 0
      hedgeList.push([x0 + (x1 - x0) * t + inward * (s * 0.5 + rand()), y + s * 0.4, z0 + (z1 - z0) * t + inwardZ * (s * 0.5 + rand()), s])
    }
  }
  const trees = []
  const addTree = (x, z, y = 0, s = 1) => trees.push([x, y, z, s * (0.85 + rand() * 0.4)])
  // trees on the terraces
  for (let i = 0; i < 70; i++) {
    const sideIdx = i % 4
    const k = (i >> 2) % tiers
    const o = k * tierStep + 2 + rand() * (tierStep - 3)
    const y = (k + 1) * tierHeight + 0.7
    if (sideIdx === 0) addTree(minX - o, minZ + rand() * (maxZ - minZ), y, 1.3)
    else if (sideIdx === 1) addTree(maxX + o, minZ + rand() * (maxZ - minZ), y, 1.3)
    else if (sideIdx === 2) addTree(minX + rand() * (maxX - minX), minZ - o, y, 1.3)
    else addTree(minX + rand() * (maxX - minX), maxZ + o, y, 1.3)
  }
  // hub trees (edges and between bases), bank trees outside the yard
  for (const [x, z] of [[-66, 8], [-62, 18], [-67, 30], [66, 8], [62, 20], [67, 32], [-66, 60], [66, 62], [-23, 96], [23, 96], [-66, 96], [66, 96], [-23, 30], [23, 30], [-60, 2], [58, 3]]) addTree(x + rand() * 2, z + rand() * 2)
  for (const [x, z] of [[-50, -50], [-58, -66], [-50, -82], [-62, -100], [-48, -120], [50, -50], [60, -64], [52, -84], [62, -104], [48, -122], [-20, -125], [0, -128], [20, -126], [-34, -116], [34, -116]]) addTree(x + rand() * 3, z + rand() * 3)

  const unit = boxGeo(1, 1, 1)
  const hedges = new InstancedMesh(unit, leavesMat, hedgeList.length + trees.length * 4)
  const trunks = new InstancedMesh(unit, trunkMat, trees.length)
  const m4 = new Matrix4()
  const q = new Quaternion()
  const v = new Vector3()
  const sc = new Vector3()
  let li = 0
  for (const [x, y, z, s] of hedgeList) {
    q.setFromAxisAngle(v.set(0, 1, 0), rand() * 0.4)
    hedges.setMatrixAt(li++, m4.compose(v.set(x, y, z), q, sc.set(s, s * 0.8, s)))
  }
  trees.forEach(([x, y, z, s], i) => {
    const th = 2.6 * s
    q.identity()
    trunks.setMatrixAt(i, m4.compose(v.set(x, y + th / 2, z), q, sc.set(0.7 * s, th, 0.7 * s)))
    const blocks = [[0, th + 1.2 * s, 0, 3.2 * s], [0.6 * s, th + 2.7 * s, 0.3 * s, 2.4 * s], [-0.7 * s, th + 2.2 * s, -0.4 * s, 2.0 * s], [0.1 * s, th + 3.9 * s, -0.2 * s, 1.5 * s]]
    for (const [dx, dy, dz, bs] of blocks) {
      q.setFromAxisAngle(v.set(0, 1, 0), rand() * 0.6)
      hedges.setMatrixAt(li++, m4.compose(v.set(x + dx, y + dy, z + dz), q, sc.set(bs, bs, bs)))
    }
  })
  hedges.count = li
  for (const im of [hedges, trunks]) {
    im.castShadow = true
    im.receiveShadow = true
    scene.add(im)
  }

  // --- Hub fence along the river (gap for the dock) ----------------------------------
  fence(root, hub.minX, 0.9, -7.2, 0.9)
  fence(root, 7.2, 0.9, hub.maxX, 0.9)
  solidMM(hub.minX, 0, 0.6, -7.2, 3, 1.2)
  solidMM(7.2, 0, 0.6, hub.maxX, 3, 1.2)

  // --- Dock + hub zipline tower --------------------------------------------------------
  const deckMat = studs('#ff8a1a', { kind: 'round', tile: 4 })
  const deck2 = studs('#ffa52e', { kind: 'round', tile: 4 })
  boxMM(root, -7, -1.4, -4, 7, 0.4, 10, deckMat, { collide: true })
  boxMM(root, -5, 0.4, -2, 5, 0.8, 8, deck2, { collide: true })
  boxMM(root, -3, 0.8, 0, 3, 1.2, 6, deckMat, { collide: true })
  // dock pilings into the water
  for (const [px, pz] of [[-6.4, -3.4], [6.4, -3.4], [-6.4, 0], [6.4, 0]]) box(root, 0.7, 4, 0.7, solid('#6b3a1a', 0.8), px, -2.6, pz)
  fence(root, -7, -4, 7, -4, '#3f7bff')
  fence(root, -7, -4, -7, 0.9, '#3f7bff')
  fence(root, 7, -4, 7, 0.9, '#3f7bff')
  solidMM(-7.2, 0, -4.4, 7.2, 3.5, -3.6)
  solidMM(-7.4, 0, -4.4, -6.6, 3.5, 1.2)
  solidMM(6.6, 0, -4.4, 7.4, 3.5, 1.2)
  const hz = ZIPLINE.hub
  buildTower(root, hz.x, hz.deck, hz.z, hz.top, -1)
  solidMM(hz.x - 0.9, hz.deck, hz.z - 0.9, hz.x + 0.9, hz.top, hz.z + 0.9)
  const hubPad = towerPad(live, hz.x, hz.deck, hz.z + 2.2)
  const towerLight = new PointLight('#5fd0ff', 18, 14, 1.6)
  towerLight.position.set(hz.x, hz.deck + 2, hz.z + 2.2)
  live.add(towerLight)

  // --- Paths and roads ---------------------------------------------------------------------
  const path = studs('#c9c4e6', { kind: 'round', tile: 4 })
  boxMM(root, -4, 0, 10, 4, 0.06, 31, path, { cast: false })
  boxMM(root, -30, 0, 16, 30, 0.05, 19.5, path, { cast: false })
  const road = asphalt('#6e7183')
  const lineMat = solid('#fff3b0', 0.6)
  boxMM(root, hub.minX, 0, 62.5, hub.maxX, 0.07, 67.5, road, { cast: false })
  for (let x = hub.minX + 2; x < hub.maxX - 2; x += 5) boxMM(root, x, 0.07, 64.85, x + 2.4, 0.09, 65.15, lineMat, { cast: false })
  for (const rx of [-23, 23]) {
    boxMM(root, rx - 2.5, 0, 22, rx + 2.5, 0.07, hub.maxZ, road, { cast: false })
    for (let z = 24; z < hub.maxZ - 2; z += 5) boxMM(root, rx - 0.15, 0.07, z, rx + 0.15, 0.09, z + 2.4, lineMat, { cast: false })
  }
  // flower beds
  const petals = ['#ff4d8d', '#ffd23a', '#ffffff', '#b46bff']
  for (const [fx, fz] of [[-8, 22], [8, 22], [-30, 24], [30, 24], [-62, 46], [62, 46], [-36, 9], [36, 9]]) {
    boxMM(root, fx - 1.6, 0, fz - 1.0, fx + 1.6, 0.35, fz + 1.0, studs('#7a4a24', { tile: 4 }), { cast: false })
    for (let i = 0; i < 6; i++) box(root, 0.35, 0.35, 0.35, solid(petals[i % 4], 0.5), fx - 1.2 + (i % 3) * 1.2 + rand() * 0.3, 0.55, fz - 0.4 + Math.floor(i / 3) * 0.8, { cast: false })
  }
  // lamps
  for (const [lx, lz, r] of [[-9, 12, 0], [9, 12, Math.PI], [-26, 22, 0], [26, 22, Math.PI], [-26, 44, 0], [26, 44, Math.PI], [-26, 80, 0], [26, 80, Math.PI], [-60, 65, -Math.PI / 2], [60, 65, -Math.PI / 2], [-4.6, 28, 0], [4.6, 28, Math.PI]]) lamp(root, lx, lz, r)

  // --- Stalls ---------------------------------------------------------------------------
  const stalls = {}
  for (const [key, s] of Object.entries(STALLS)) stalls[key] = buildStall(root, live, s)

  // --- Bases (the player's is index BASE.player; base.js adds its live parts) ------------
  const baseSlots = []
  BASE.positions.forEach(([bx, bz], i) => {
    baseSlots.push(buildBaseShell(root, bx, bz, i === BASE.player))
    if (i !== BASE.player) {
      const tag = infoLabel([{ text: 'Empty Base', size: 56, color: '#d7d3ff' }, { text: 'Coming soon', size: 34, color: '#9f9acb' }], 0.028)
      tag.position.set(bx, 3.2, bz - BASE.depth / 2 + 1)
      live.add(tag)
    }
  })

  // --- Billboards: timed spawns (left), heist stats (right) --------------------------------
  const boardPost = metal('#2d3140', 0.5)
  const timerSign = canvasSign(13, 6.5, 1024, 512, () => {})
  timerSign.mesh.position.set(-38, 7.2, 9)
  timerSign.mesh.rotation.y = 0.45
  live.add(timerSign.mesh)
  for (const dx of [-4.5, 4.5]) box(root, 0.5, 4.2, 0.5, boardPost, -38 + Math.cos(0.45) * dx, 2.1, 9 - Math.sin(0.45) * dx)
  box(root, 13.6, 7.1, 0.4, solid('#24123f', 0.6), -38 - Math.sin(0.45) * 0.25, 7.2, 9 - Math.cos(0.45) * 0.25, { rotY: 0.45 })
  const statsSign = canvasSign(11, 7, 1024, 640, () => {})
  statsSign.mesh.position.set(38, 6.8, 9)
  statsSign.mesh.rotation.y = -0.45
  live.add(statsSign.mesh)
  for (const dx of [-3.8, 3.8]) box(root, 0.5, 3.6, 0.5, boardPost, 38 + Math.cos(-0.45) * dx, 1.8, 9 - Math.sin(-0.45) * dx)
  box(root, 11.6, 7.6, 0.4, solid('#3a1406', 0.6), 38 + Math.sin(0.45) * 0.25, 6.8, 9 - Math.cos(0.45) * 0.25, { rotY: -0.45 })

  // --- The far bank: heist yard -----------------------------------------------------------
  const { yard } = LAYOUT
  fence(root, yard.minX, yard.maxZ - 1.2, yard.maxX, yard.maxZ - 1.2, '#3f7bff')
  fence(root, yard.minX, yard.minZ, yard.maxX, yard.minZ, '#7d7f8c', 1.6)
  fence(root, yard.minX, yard.minZ, yard.minX, yard.maxZ - 1.2, '#7d7f8c', 1.6)
  fence(root, yard.maxX, yard.minZ, yard.maxX, yard.maxZ - 1.2, '#7d7f8c', 1.6)
  solidMM(yard.minX, 0, yard.maxZ - 1.5, yard.maxX, 4, yard.maxZ - 0.9)
  solidMM(yard.minX, 0, yard.minZ - 0.3, yard.maxX, 4, yard.minZ + 0.3)
  solidMM(yard.minX - 0.3, 0, yard.minZ, yard.minX + 0.3, 4, yard.maxZ)
  solidMM(yard.maxX - 0.3, 0, yard.minZ, yard.maxX + 0.3, 4, yard.maxZ)
  // road loop round the building + spurs to the tunnels
  const loop = { x0: -31, x1: 31, z0: -101, z1: -55, w: 6 }
  boxMM(root, loop.x0, 0, loop.z0, loop.x1, 0.07, loop.z0 + loop.w, road, { cast: false })
  boxMM(root, loop.x0, 0, loop.z1 - loop.w, loop.x1, 0.07, loop.z1, road, { cast: false })
  boxMM(root, loop.x0, 0, loop.z0, loop.x0 + loop.w, 0.07, loop.z1, road, { cast: false })
  boxMM(root, loop.x1 - loop.w, 0, loop.z0, loop.x1, 0.07, loop.z1, road, { cast: false })
  boxMM(root, bank.minX, 0, -93, loop.x0, 0.07, -87, road, { cast: false })
  boxMM(root, loop.x1, 0, -93, bank.maxX, 0.07, -87, road, { cast: false })
  for (let x = loop.x0 + 3; x < loop.x1 - 3; x += 5) {
    boxMM(root, x, 0.07, loop.z0 + 2.85, x + 2.4, 0.09, loop.z0 + 3.15, lineMat, { cast: false })
    boxMM(root, x, 0.07, loop.z1 - 3.15, x + 2.4, 0.09, loop.z1 - 2.85, lineMat, { cast: false })
  }
  for (let z = loop.z0 + 6; z < loop.z1 - 6; z += 5) {
    boxMM(root, loop.x0 + 2.85, 0.07, z, loop.x0 + 3.15, 0.09, z + 2.4, lineMat, { cast: false })
    boxMM(root, loop.x1 - 3.15, 0.07, z, loop.x1 - 2.85, 0.09, z + 2.4, lineMat, { cast: false })
  }
  // sidewalk round the building
  boxMM(root, -19, 0, -90, 19, 0.12, -61.5, studs('#d2cde8', { kind: 'tile', tile: 2 }), { cast: false })
  // tunnels in the west/east cliff faces
  const tunnelStone = studs('#6a5fb0', { tile: 4 })
  for (const sx of [-1, 1]) {
    const fx = sx * bank.maxX
    boxMM(root, fx - sx * 0.2, 0, -97, fx + sx * 1.6, 9, -83, tunnelStone)
    boxMM(root, fx - sx * 0.3, 0.05, -94, fx + sx * 1.7, 6.5, -86, solid('#090814', 1))
  }
  // police cruisers + street lamps on the bank
  const bars = []
  cruiser(root, live, -22, -58, 0, bars)
  cruiser(root, live, 25, -96, Math.PI / 2, bars)
  cruiser(root, live, -27, -84, Math.PI / 2, bars)
  for (const [lx, lz, r] of [[-34, -60, 0], [34, -60, Math.PI], [-34, -80, 0], [34, -80, Math.PI], [-34, -100, 0], [34, -100, Math.PI], [-8, -48, 0], [8, -48, Math.PI]]) lamp(root, lx, lz, r)
  // ground zipline tower in front of the building
  const gz = ZIPLINE.ground
  boxMM(root, gz.x - 2.6, 0, gz.z - 2.6, gz.x + 2.6, 0.3, gz.z + 2.6, studs('#3a8dff', { tile: 4 }), { collide: true })
  buildTower(root, gz.x, 0.3, gz.z, gz.top, 1)
  solidMM(gz.x - 0.9, 0.3, gz.z - 0.9, gz.x + 0.9, gz.top, gz.z + 0.9)
  const groundPad = towerPad(live, gz.x, 0.3, gz.z - 2.2)

  // --- Bake the static scene -------------------------------------------------------------
  const baked = bake(root, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(baked)

  const pulse = [hubPad, groundPad, ...Object.values(stalls).map((s) => s.ring)]
  return {
    stalls,
    baseSlots,
    hubPadAt: new Vector3(hz.x, hz.deck, hz.z + 2.2),
    groundPadAt: new Vector3(gz.x, 0.3, gz.z - 2.2),
    timerSign,
    statsSign,
    update(dt, t) {
      pulse.forEach((r, i) => {
        const k = 1 + Math.sin(t * 3 + i) * 0.08
        r.scale.set(k, k, k)
        r.material.opacity = 0.65 + Math.sin(t * 3 + i) * 0.25
      })
      const on = Math.sin(t * 9) > 0
      for (let i = 0; i < bars.length; i += 2) {
        bars[i].emissiveIntensity = on ? 4 : 0.3
        bars[i + 1].emissiveIntensity = on ? 0.3 : 4
      }
    },
  }
}

// Draw helpers for the two billboards (called by game.js with live data).
export function drawTimerBoard(ctx, w, h, rows) {
  ctx.fillStyle = '#1b0d33'
  ctx.fillRect(0, 0, w, h)
  const colors = [['#ffd21f', '#ff9a1f'], ['#ff4fa3', '#d62f8a'], ['#9b5bff', '#5d2bd6']]
  rows.forEach((r, i) => {
    const y = 26 + i * 160
    const g = ctx.createLinearGradient(0, y, w, y + 140)
    g.addColorStop(0, colors[i][0])
    g.addColorStop(1, colors[i][1])
    ctx.fillStyle = g
    roundRect(ctx, 24, y, w - 48, 140, 26)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    roundRect(ctx, 34, y + 8, w - 68, 40, 18)
    ctx.fill()
    outlinedText(ctx, `${r.label}: ${r.time}`, w / 2, y + 74, 64, '#ffffff', '#2a0b3d')
  })
}
export function drawStatsBoard(ctx, w, h, stats) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#ff6a1f')
  g.addColorStop(1, '#d6331f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  roundRect(ctx, 30, 120, w - 60, h - 150, 24)
  ctx.fill()
  outlinedText(ctx, 'Heist Stats', w / 2, 66, 76, '#ffe14d', '#3a0b05')
  stats.forEach((s, i) => {
    const y = 175 + i * 88
    ctx.font = '700 46px Fredoka, Arial Black, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 9
    ctx.strokeStyle = '#2a0805'
    ctx.strokeText(s[0], 70, y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(s[0], 70, y)
    ctx.textAlign = 'right'
    ctx.strokeText(s[1], w - 70, y)
    ctx.fillStyle = s[2] ?? '#7dff5a'
    ctx.fillText(s[1], w - 70, y)
  })
}
