// A base in the hub: a studded platform with a red carpet down the middle, a
// row of slot pedestals on each side and a green cash collector beside each
// slot. buildBaseShell adds the static parts (baked with the hub) for any base;
// createBase adds the player's live parts: padlocks on locked slots, the placed
// treasures with their info labels and light rays, collector cash labels, the
// Luck / Income sign and the Base Upgrade board.
import { Group, Mesh, TorusGeometry, Vector3 } from 'three'
import { BASE, RARITIES, TREASURES } from '../config.js'
import { box, boxMM, canvasSign, emissive, fmt, glowSprite, groundDecal, infoLabel, metal, money, outlinedText, raysTexture, roundRect, solid, studs } from './kit.js'
import { makeTreasure } from './models.js'

const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, tier: i }]))
const SLOT_COUNT = BASE.slotsPerSide * 2
const TREASURES_BY_ID = Object.fromEntries(TREASURES.map((t) => [t.id, t]))

// Slot k: side alternates (left first), rows run from the entrance (front, -z) back.
export function slotLayout(cx, cz) {
  const out = []
  for (let k = 0; k < SLOT_COUNT; k++) {
    const side = k % 2 ? 1 : -1
    const row = k >> 1
    const z = cz - BASE.depth / 2 + 3.8 + row * BASE.slotStep
    out.push({ index: k, side, row, pedestal: new Vector3(cx + side * 8.2, 0.7, z), pad: new Vector3(cx + side * 4.85, 0.58, z) })
  }
  return out
}

export function buildBaseShell(root, cx, cz, isPlayer) {
  const W = BASE.width / 2
  const D = BASE.depth / 2
  const deck = studs('#5f6272', { tile: 4 })
  const rim = studs('#8b8fa3', { tile: 4 })
  boxMM(root, cx - W, 0, cz - D, cx + W, 0.4, cz + D, deck, { collide: true, cast: false })
  boxMM(root, cx - W, 0.4, cz - D, cx + W, 0.46, cz - D + 0.6, rim, { cast: false })
  boxMM(root, cx - 4, 0, cz - D - 1.2, cx + 4, 0.2, cz - D, rim, { collide: true, cast: false }) // entrance step
  // carpet with yellow borders
  boxMM(root, cx - 3, 0.4, cz - D + 0.6, cx + 3, 0.46, cz + D - 0.6, studs('#e3222b', { tile: 4 }), { cast: false })
  boxMM(root, cx - 3.35, 0.4, cz - D + 0.6, cx - 3, 0.5, cz + D - 0.6, solid('#ffd21f', 0.45), { cast: false })
  boxMM(root, cx + 3, 0.4, cz - D + 0.6, cx + 3.35, 0.5, cz + D - 0.6, solid('#ffd21f', 0.45), { cast: false })
  // slots
  const ped = studs('#3d404c', { tile: 4 })
  const pedRim = studs('#7a7e90', { tile: 4 })
  const padMat = studs('#7dff3a', { tile: 2, emissive: '#3dff1a', ei: isPlayer ? 0.55 : 0.12 })
  for (const s of slotLayout(cx, cz)) {
    const p = s.pedestal
    boxMM(root, p.x - 1.9, 0.4, p.z - 1.8, p.x + 1.9, 0.52, p.z + 1.8, pedRim, { cast: false })
    boxMM(root, p.x - 1.7, 0.52, p.z - 1.6, p.x + 1.7, 0.7, p.z + 1.6, ped, { collide: true, cast: false })
    boxMM(root, s.pad.x - 1.0, 0.4, s.pad.z - 1.4, s.pad.x + 1.0, 0.58, s.pad.z + 1.4, padMat, { cast: false })
  }
  // side walls with a neon top strip, back wall, corner pillars and an entrance arch
  const wall = studs('#474a59', { tile: 4 })
  const neonMat = isPlayer ? emissive('#36e0ff', 2.4, '#0b3a4a') : solid('#6c7085', 0.5)
  for (const sx of [-1, 1]) {
    boxMM(root, cx + sx * W - 0.35, 0.4, cz - D + 1.5, cx + sx * W + 0.35, 1.5, cz + D, wall, { collide: true })
    boxMM(root, cx + sx * W - 0.4, 1.5, cz - D + 1.5, cx + sx * W + 0.4, 1.68, cz + D, neonMat, { cast: false })
    boxMM(root, cx + sx * W - 0.8, 0, cz - D - 0.4, cx + sx * W + 0.4, 4.4, cz - D + 1.5, studs('#3a3d4a', { tile: 4 }), { collide: true })
    boxMM(root, cx + sx * W - 0.9, 4.4, cz - D - 0.5, cx + sx * W + 0.5, 4.8, cz - D + 1.6, neonMat, { cast: false })
    // arch posts at the carpet
    boxMM(root, cx + sx * 4.2 - 0.4, 0.4, cz - D + 0.2, cx + sx * 4.2 + 0.4, 5.2, cz - D + 1.0, studs('#3a3d4a', { tile: 4 }), { collide: true })
  }
  boxMM(root, cx - 4.8, 5.2, cz - D + 0.1, cx + 4.8, 6.0, cz - D + 1.1, studs('#3a3d4a', { tile: 4 }))
  boxMM(root, cx - 4.9, 5.05, cz - D + 0.05, cx + 4.9, 5.2, cz - D + 1.15, neonMat, { cast: false })
  boxMM(root, cx - W, 0.4, cz + D - 0.6, cx + W, 3.4, cz + D, wall, { collide: true })
  boxMM(root, cx - W, 3.4, cz + D - 0.65, cx + W, 3.58, cz + D + 0.05, neonMat, { cast: false })
  // lamp-cubes along the back wall
  for (let i = -2; i <= 2; i++) box(root, 0.8, 0.8, 0.3, emissive(isPlayer ? '#ffe08a' : '#8c8c9c', isPlayer ? 2.2 : 0.4, '#3a2a10'), cx + i * 4.4, 2.4, cz + D - 0.75, { cast: false })
  return { cx, cz, slots: slotLayout(cx, cz) }
}

// Padlock model for locked slots.
function padlock() {
  const g = new Group()
  box(g, 0.9, 0.75, 0.4, metal('#d9a520', 0.35), 0, 0.38, 0)
  const shackle = new Mesh(new TorusGeometry(0.3, 0.08, 8, 20, Math.PI), metal('#c9ced8', 0.25))
  shackle.position.y = 0.75
  shackle.castShadow = true
  g.add(shackle)
  box(g, 0.14, 0.24, 0.05, solid('#3a2a05', 0.6), 0, 0.36, 0.21)
  return g
}

export function createBase(scene, shell) {
  const live = new Group()
  scene.add(live)
  const { cx, cz } = shell
  const D = BASE.depth / 2
  const slots = shell.slots.map((s) => {
    const holder = new Group()
    holder.position.copy(s.pedestal)
    live.add(holder)
    const lock = padlock()
    lock.position.set(0, 0, 0)
    holder.add(lock)
    const cash = infoLabel([{ text: '$0', size: 46, color: '#7dff5a' }], 0.022)
    cash.position.set(s.pad.x, 1.0, s.pad.z)
    cash.visible = false
    live.add(cash)
    return { ...s, holder, lock, cash, item: null, display: null, label: null, rays: null, glow: null, spin: Math.random() * 6 }
  })

  const sign = infoLabel([{ text: 'Your Base', size: 60, color: '#ffffff' }], 0.03)
  sign.position.set(cx, 8.6, cz - D + 0.6)
  live.add(sign)
  const stats = infoLabel([{ text: 'Luck: +0%', size: 46, color: '#ffe14d' }, { text: 'Income: $0/s', size: 46, color: '#7dff5a' }], 0.026)
  stats.position.set(cx, 6.1, cz - D + 0.6)
  live.add(stats)

  // Base Upgrade board at the front-left corner
  const board = canvasSign(3.6, 1.8, 512, 256, () => {})
  board.mesh.position.set(cx - 7.6, 2.0, cz - D - 1.9)
  live.add(board.mesh)
  const legs = new Group()
  box(legs, 0.18, 1.2, 0.18, metal('#2d3140'), cx - 9.0, 0.6, cz - D - 2.0)
  box(legs, 0.18, 1.2, 0.18, metal('#2d3140'), cx - 6.2, 0.6, cz - D - 2.0)
  box(legs, 3.8, 2.0, 0.12, solid('#1a2c55', 0.6), cx - 7.6, 2.0, cz - D - 2.0)
  live.add(legs)
  const boardAt = new Vector3(cx - 7.6, 0.4, cz - D - 2.6)

  function setItem(index, id) {
    const s = slots[index]
    if (s.display) {
      s.holder.remove(s.display)
      s.label.dispose()
      s.holder.remove(s.label, s.rays, s.glow)
      s.display = s.label = s.rays = s.glow = null
    }
    s.item = id
    if (!id) return
    const t = TREASURES_BY_ID[id]
    const r = RARITY[t.rarity]
    s.display = makeTreasure(id, 1.25)
    s.display.position.y = 0.05
    s.display.traverse((o) => {
      if (o.isMesh) o.castShadow = true
    })
    s.holder.add(s.display)
    s.label = infoLabel(
      [
        { text: t.name, size: 40, color: '#ffffff' },
        { text: r.name, size: 30, color: r.color, outline: r.outline ?? '#0d0a1f' },
        { text: `+${t.luck}% Luck`, size: 34, color: '#ffe14d' },
        { text: `${money(t.income)}/s`, size: 34, color: '#7dff5a' },
      ],
      0.016,
    )
    s.label.position.y = 2.0
    s.holder.add(s.label)
    s.rays = groundDecal(raysTexture(), r.glow, 3.4, r.tier >= 3 ? 0.85 : 0.5)
    s.rays.position.y = 0.03
    s.holder.add(s.rays)
    s.glow = glowSprite(r.glow, 2.6, r.tier >= 3 ? 0.6 : 0.3)
    s.glow.position.y = 0.8
    s.holder.add(s.glow)
  }

  function setUnlocked(n) {
    slots.forEach((s, i) => {
      s.lock.visible = i >= n
    })
  }

  function setStored(index, amount) {
    const s = slots[index]
    const show = amount >= 1
    s.cash.visible = show
    if (show) s.cash.setLines([{ text: money(amount), size: 46, color: '#7dff5a' }])
  }

  function setStats(luck, income) {
    stats.setLines([
      { text: `Luck: +${fmt(luck, 1)}%`, size: 46, color: '#ffe14d' },
      { text: `Income: ${money(income)}/s`, size: 46, color: '#7dff5a' },
    ])
  }

  function setUpgrade(unlocked, total, cost) {
    board.setDraw((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#2c6bff')
      g.addColorStop(1, '#1a3fb0')
      ctx.fillStyle = g
      roundRect(ctx, 0, 0, w, h, 30)
      ctx.fill()
      outlinedText(ctx, 'Base Upgrade', w / 2, 52, 50, '#ffffff', '#0a1a4a')
      ctx.fillStyle = cost == null ? '#5a6585' : '#ffd21f'
      roundRect(ctx, 60, 100, w - 120, 90, 24)
      ctx.fill()
      outlinedText(ctx, cost == null ? 'MAXED' : money(cost), w / 2, 146, 54, '#ffffff', '#5a3a00')
      outlinedText(ctx, `${unlocked}/${total} slots`, w / 2, 222, 34, '#cfe0ff', '#0a1a4a')
    })
  }

  return {
    slots,
    boardAt,
    setItem,
    setUnlocked,
    setStored,
    setStats,
    setUpgrade,
    entrance: new Vector3(cx, 0.6, cz - D - 3.5),
    contains: (p) => Math.abs(p.x - cx) < BASE.width / 2 + 1 && p.z > cz - D - 4 && p.z < cz + D,
    update(dt, t) {
      for (const s of slots) {
        if (!s.display) continue
        s.spin += dt * 0.6
        s.display.rotation.y = s.spin
        s.display.position.y = 0.08 + Math.sin(t * 2 + s.index) * 0.06
        s.rays.rotation.z += dt * 0.4
      }
    },
  }
}
