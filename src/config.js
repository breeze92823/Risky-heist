// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'risky-heist' // slug registered on bloxity.io
export const GAME_TITLE = 'Risky Heist'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The ground (world.js): one convex slab of land in a sea. The shoreline sweeps from
// the front edge (-Z) back toward +Z on both wings.
export const BEACH = {
  front: -46, // z of the shoreline at the front edge
  back: 90, // z of the back edge
  halfWidth: 75, // x extent of the wings
  wingZ: 24, // z of the shoreline at the far left/right ends
  gateEdge: 21.5, // half-width of the straight shoreline at the front edge
  depth: 4, // slab thickness above the sea floor
  tile: 18, // m per sand texture tile
  fenceHeight: 3, // invisible wall around the sand so nobody walks into the sea
}
export const WATER = { level: -1.3, size: 1400, color: '#19c6f2', shallow: '#7ff0ff' }
export const SPAWN = { x: 0, y: 0.6, z: 17 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 190, far: 620 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#3b1fb8',
    horizon: '#ff62d8',
    sunColor: '#fff2e2',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.5,
    sunElevation: 58, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#efe6ff',
    hemiGround: '#6f8a4a',
    hemiIntensity: 0.95,
    envIntensity: 0.5,
    lampIntensity: 0,
    stars: 0.35,
    exposure: 1.0,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 48, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.3, // radians above the horizon
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 13, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  master_volume: { def: '80', type: 'number', min: 0, max: 100 }, // the sound effects (sfx.js); the game has no music
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
}

// Hosted leaderboards, declared with leaderboard.define() right after init (ids are permanent: lowercase
// a-z 0-9 _ -, max 32). The game SERVER reports the scores from its own copy of the progress (backend
// constants.ts LEADERBOARD_BOARDS declares the same boards), the client never submits.
export const LEADERBOARDS = [
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'earned', label: 'Cash earned', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'maxfloor', label: 'Highest floor', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'stolen', label: 'Treasures stolen', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
]
// Screens for Boxity's screen ads: the world itself (gameplay banners stay off) and the HUD windows
// (Upgrades, Tools, Index, Rebirth, Daily Gifts, Zipline), which open in the middle of the screen.
// Boxity's own menu / pause / chat / death screens are not the game's.
export const AD_SCREENS = { gameplay: {}, panel: {} }
// The rewarded ad button (right HUD column): watch an ad, get cash worth `incomeSeconds` of the base's
// income (at least `base`). Never premium currency. `placement` is lowercase letters, digits, hyphens.
export const REWARDED_AD = { placement: 'free-cash', base: 5000, incomeSeconds: 300, cooldownSeconds: 300 }

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// =============================================================================
// --- Risky Heist: game data -----------------------------------------------------
// =============================================================================
// World layout (metres, +X east, +Z south). The HUB sits south of a river (z > 0);
// the heist building stands on the far bank (z < -38). Both banks are flat at y = 0.
export const LAYOUT = {
  hub: { minX: -72, maxX: 72, minZ: 0, maxZ: 100 },
  river: { minZ: -38, maxZ: 0, bedY: -9 },
  bank: { minX: -72, maxX: 72, minZ: -140, maxZ: -38 },
  yard: { minX: -40, maxX: 40, minZ: -108, maxZ: -38 }, // fenced heist yard round the building
  cliff: { tiers: 3, tierHeight: 6, tierStep: 7 }, // terraced cliffs on every outer edge
  slabDepth: 12, // the land slabs reach this far below y = 0
}

// The heist building. Local frame: +z faces the river (front), x across.
export const BUILDING = {
  x: 0,
  z: -75,
  halfW: 15,
  halfD: 11,
  floors: 50,
  floorH: 6,
  wall: 0.6,
  slab: 0.5,
  stairBand: 3.6, // width of the stair strip along a side wall
  stairLow: 6, // local z where a stair starts (its bottom, front end)
  stairHigh: -5, // local z where it reaches the next floor (landing behind it)
  exitX: 6, // local x of each upper floor's glass exit door + balcony
  entranceW: 3.2,
  doorW: 2.6,
  doorH: 4.2,
  spots: [[-7.5, -3.2], [-2.5, -3.2], [2.5, -3.2], [7.5, -3.2], [-7.5, 3.6], [-2.5, 3.6], [2.5, 3.6], [7.5, 3.6]],
}

// Zipline: hub tower -> active building anchor (the ground tower, or the balcony of
// the highest floor the player has reached). Ride speed in m/s, sag as a fraction of length.
export const ZIPLINE = {
  hub: { x: 0, z: 3, top: 11.5, deck: 1.2 }, // deck = height of the dock top the tower stands on
  ground: { x: 0, z: -50, top: 7.5 },
  balconyDepth: 3.2,
  speed: 19,
  sag: 0.06,
  hang: 2.25, // feet below the cable while riding
}

// Bases in the hub: one plot per player, and a room holds exactly this many players (6: backend
// ROOM_MAX_CLIENTS; the server assigns each joining player a free plot). `player` is the plot you use
// before the server has assigned one (offline play).
export const BASE = {
  positions: [[-46, 47], [0, 47], [46, 47], [-46, 83], [0, 83], [46, 83]],
  player: 1,
  width: 24,
  depth: 30,
  slotsPerSide: 6,
  startSlots: 4,
  slotStep: 4.3,
  collectRadius: 1.3,
  offlineCapSeconds: 2 * 3600, // collectors keep filling while away, up to this long
}

// Stalls in the hub (E opens their panel).
export const STALLS = {
  upgrades: { x: -21, z: 13, title: 'Upgrades', awning: '#2f8cff', ring: '#33d6ff' },
  tools: { x: -11, z: 13, title: 'Tools', awning: '#b23cff', ring: '#c56bff' },
  sell: { x: 14, z: 13, title: 'Sell', awning: '#2bd94f', ring: '#2bff6a' },
}

// Rarities, lowest first. `glow` tints the light rays and sparkles under a treasure;
// `outline` marks rarities whose dark name colour needs a white outline in the UI.
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#e6e6e6', glow: '#ffffff' },
  { id: 'uncommon', name: 'Uncommon', color: '#3ee66b', glow: '#6dff8e' },
  { id: 'rare', name: 'Rare', color: '#3aa8ff', glow: '#58b8ff' },
  { id: 'epic', name: 'Epic', color: '#c24bff', glow: '#d27bff' },
  { id: 'legendary', name: 'Legendary', color: '#ffc21a', glow: '#ffd75a' },
  { id: 'mythic', name: 'Mythic', color: '#ff3d6e', glow: '#ff6a8f' },
  { id: 'divine', name: 'Divine', color: '#fff2a8', glow: '#fff7d0' },
  { id: 'celestial', name: 'Celestial', color: '#5ff0ff', glow: '#9ffbff' },
  { id: 'secret', name: 'Secret', color: '#1b1b1b', glow: '#ffffff', outline: '#ffffff' },
]
// Colour to print a rarity's name in on dark UI.
export const rarityTextColor = (r) => (r.outline ? '#ffffff' : r.color)

// Treasures: value = sell price (and the worth shown in the building), luck = % added
// to the base's luck when placed, income = $ per second on a base slot.
// Values climb roughly x6 per rarity; income is about value / 60-100.
export const TREASURES = [
  // common (~1K)
  { id: 'coin', name: 'Coin', rarity: 'common', value: 780, luck: 1, income: 8 },
  { id: 'iron', name: 'Iron Bar', rarity: 'common', value: 900, luck: 1.5, income: 9 },
  { id: 'copper', name: 'Copper Bar', rarity: 'common', value: 980, luck: 1.5, income: 10 },
  { id: 'dollar', name: 'Dollar', rarity: 'common', value: 1050, luck: 2, income: 11 },
  { id: 'cashbag', name: 'Cash Bag', rarity: 'common', value: 1200, luck: 2, income: 12 },
  { id: 'silvercoin', name: 'Silver Coin', rarity: 'common', value: 1400, luck: 2.5, income: 14 },
  { id: 'wallet', name: 'Fat Wallet', rarity: 'common', value: 1650, luck: 3, income: 17 },
  // uncommon (~5K)
  { id: 'gem', name: 'Gem', rarity: 'uncommon', value: 4300, luck: 5, income: 48 },
  { id: 'bracelet', name: 'Bracelet', rarity: 'uncommon', value: 4750, luck: 5.5, income: 52 },
  { id: 'topaz', name: 'Topaz', rarity: 'uncommon', value: 5100, luck: 6, income: 56 },
  { id: 'binoculars', name: 'Binoculars', rarity: 'uncommon', value: 5600, luck: 6.5, income: 62 },
  { id: 'perfume', name: 'Perfume', rarity: 'uncommon', value: 6100, luck: 7, income: 68 },
  { id: 'camera', name: 'Old Camera', rarity: 'uncommon', value: 6800, luck: 7.5, income: 75 },
  { id: 'ring', name: 'Gem Ring', rarity: 'uncommon', value: 7500, luck: 8, income: 84 },
  // rare (~30K)
  { id: 'goblet', name: 'Silver Goblet', rarity: 'rare', value: 22000, luck: 10, income: 300 },
  { id: 'watch', name: 'Pocket Watch', rarity: 'rare', value: 25000, luck: 11, income: 340 },
  { id: 'necklace', name: 'Pearl Necklace', rarity: 'rare', value: 28000, luck: 11.5, income: 380 },
  { id: 'vase', name: 'Ming Vase', rarity: 'rare', value: 31000, luck: 12, income: 420 },
  { id: 'coinpile', name: 'Coin Pile', rarity: 'rare', value: 34000, luck: 12.5, income: 460 },
  { id: 'sapphire', name: 'Sapphire', rarity: 'rare', value: 38000, luck: 13, income: 510 },
  { id: 'mask', name: 'Carnival Mask', rarity: 'rare', value: 42000, luck: 14, income: 560 },
  // epic (~200K)
  { id: 'goldbar', name: 'Gold Bar', rarity: 'epic', value: 170000, luck: 18, income: 2700 },
  { id: 'amethyst', name: 'Amethyst', rarity: 'epic', value: 180000, luck: 19, income: 2900 },
  { id: 'emerald', name: 'Emerald', rarity: 'epic', value: 200000, luck: 20, income: 3200 },
  { id: 'chest', name: 'Treasure Chest', rarity: 'epic', value: 215000, luck: 21, income: 3450 },
  { id: 'ruby', name: 'Ruby', rarity: 'epic', value: 230000, luck: 22, income: 3700 },
  { id: 'idol', name: 'Golden Idol', rarity: 'epic', value: 250000, luck: 23, income: 4000 },
  { id: 'egg', name: 'Jeweled Egg', rarity: 'epic', value: 275000, luck: 25, income: 4400 },
  // legendary (~1.5M)
  { id: 'diamond', name: 'Diamond', rarity: 'legendary', value: 1100000, luck: 30, income: 17500 },
  { id: 'clam', name: 'Pearl Clam', rarity: 'legendary', value: 1300000, luck: 32, income: 21000 },
  { id: 'crown', name: 'Royal Crown', rarity: 'legendary', value: 1500000, luck: 34, income: 24000 },
  { id: 'skull', name: 'Crystal Skull', rarity: 'legendary', value: 1650000, luck: 36, income: 26500 },
  { id: 'sword', name: 'Jeweled Sword', rarity: 'legendary', value: 1800000, luck: 38, income: 29000 },
  { id: 'meteor', name: 'Meteorite', rarity: 'legendary', value: 2000000, luck: 40, income: 32000 },
  // mythic (~9M)
  { id: 'musicbox', name: 'Music Box', rarity: 'mythic', value: 7000000, luck: 45, income: 112000 },
  { id: 'ship', name: 'Bottled Ship', rarity: 'mythic', value: 8000000, luck: 48, income: 128000 },
  { id: 'hourglass', name: 'Sands of Time', rarity: 'mythic', value: 9000000, luck: 51, income: 145000 },
  { id: 'globe', name: 'Golden Globe', rarity: 'mythic', value: 10000000, luck: 54, income: 160000 },
  { id: 'lamp', name: 'Magic Lamp', rarity: 'mythic', value: 11500000, luck: 58, income: 185000 },
  // divine (~55M)
  { id: 'halo', name: 'Angel Halo', rarity: 'divine', value: 45000000, luck: 70, income: 720000 },
  { id: 'feather', name: 'Phoenix Feather', rarity: 'divine', value: 52000000, luck: 75, income: 830000 },
  { id: 'grail', name: 'Holy Grail', rarity: 'divine', value: 58000000, luck: 80, income: 930000 },
  { id: 'harp', name: 'Golden Harp', rarity: 'divine', value: 64000000, luck: 85, income: 1020000 },
  { id: 'sunstone', name: 'Sunstone', rarity: 'divine', value: 72000000, luck: 90, income: 1150000 },
  // celestial (~350M)
  { id: 'moon', name: 'Moon Shard', rarity: 'celestial', value: 280000000, luck: 100, income: 4600000 },
  { id: 'star', name: 'Fallen Star', rarity: 'celestial', value: 320000000, luck: 110, income: 5200000 },
  { id: 'comet', name: 'Comet Core', rarity: 'celestial', value: 360000000, luck: 118, income: 5900000 },
  { id: 'galaxy', name: 'Galaxy Orb', rarity: 'celestial', value: 400000000, luck: 126, income: 6500000 },
  // secret (~2B)
  { id: 'scepter', name: 'Royal Scepter', rarity: 'secret', value: 1800000000, luck: 150, income: 30000000 },
  { id: 'fossil', name: 'Dino Fossil', rarity: 'secret', value: 2000000000, luck: 160, income: 33000000 },
  { id: 'robot', name: 'Robot Head', rarity: 'secret', value: 2200000000, luck: 170, income: 36000000 },
  { id: 'car', name: 'Gold Racer', rarity: 'secret', value: 2500000000, luck: 180, income: 41000000 },
  { id: 'blackhole', name: 'Black Hole', rarity: 'secret', value: 3000000000, luck: 200, income: 50000000 },
  // Daily Gift exclusives (exclusive: never rolled in the tower)
  { id: 'trophy', name: 'Golden Trophy', rarity: 'legendary', value: 2400000, luck: 42, income: 38000, exclusive: true },
  { id: 'barrel', name: 'Nuclear Barrel', rarity: 'mythic', value: 15000000, luck: 62, income: 240000, exclusive: true },
]

// --- Floors (generated) -------------------------------------------------------------------
// Rarity odds per floor: a bell curve over the rarity tiers whose centre climbs from
// Common on floor 1 to `topCenter` on the top floor; luck pushes the centre further up
// by LUCK_SHIFT * log2(1 + luck% / 100) tiers. The last tier (Secret) is scaled by
// secretWeight so it stays rare even at the top.
export const FLOOR_ODDS = { topCenter: 7.4, spread: 1.0, secretWeight: 0.35 }
export const LUCK_SHIFT = 0.6
// Interior palettes (cycled). The ground floor is always the Lobby (theme 0).
const THEMES = [
  { name: 'Lobby', wall: '#6d6be0', floor: '#b9b3e6' },
  { name: 'Offices', wall: '#6461d6', floor: '#b0aee6' },
  { name: 'Vault Lounge', wall: '#5f57cf', floor: '#aaa4e2' },
  { name: 'Gallery', wall: '#584ec8', floor: '#a49cdf' },
  { name: 'Penthouse', wall: '#5246c0', floor: '#9e94dc' },
]
export const FLOOR_COUNT = 50
// Door into floor f (1-based, f >= 2): doorBase * doorGrowth ^ (f - 2) hit points.
export const DOORS = { base: 20, growth: 1.3 }
export const FLOORS = Array.from({ length: FLOOR_COUNT }, (_, i) => {
  const theme = i === 0 ? 0 : 1 + ((i - 1) % 4)
  return {
    ...THEMES[theme],
    theme,
    doorHP: i === 0 ? 0 : Math.round(DOORS.base * Math.pow(DOORS.growth, i - 1)),
    luckSign: i + 1,
    center: (i / (FLOOR_COUNT - 1)) * FLOOR_ODDS.topCenter,
  }
})

// Upgrades (all bought with cash, never premium currency).
export const UPGRADES = {
  carry: { start: 1, max: 8, costs: [1500, 12000, 80000, 600000, 5000000, 50000000, 500000000] }, // items held at once
  base: { start: BASE.startSlots, step: 2, costs: [6000, 60000, 600000, 6000000] }, // slots unlocked
}
// Tools break doors: damage per hit. Each one is "right" for a band of ~3-4 floors
// (around 50 hits per door at HIT_INTERVAL).
export const TOOLS = [
  { id: 'fists', name: 'Fists', damage: 1, cost: 0, color: '#f2c79a' },
  { id: 'bat', name: 'Wooden Bat', damage: 2, cost: 2500, color: '#b7814a' },
  { id: 'crowbar', name: 'Crowbar', damage: 5, cost: 20000, color: '#d23b3b' },
  { id: 'hammer', name: 'Claw Hammer', damage: 12, cost: 120000, color: '#c9ced8' },
  { id: 'sledge', name: 'Sledgehammer', damage: 30, cost: 700000, color: '#8a8f99' },
  { id: 'axe', name: 'Fire Axe', damage: 75, cost: 4000000, color: '#ff5a3a' },
  { id: 'drill', name: 'Power Drill', damage: 180, cost: 22000000, color: '#ffd21f' },
  { id: 'jackhammer', name: 'Jackhammer', damage: 450, cost: 120000000, color: '#ffb31a' },
  { id: 'saw', name: 'Diamond Saw', damage: 1100, cost: 650000000, color: '#bff6ff' },
  { id: 'torch', name: 'Thermal Lance', damage: 2800, cost: 3500000000, color: '#ff8a1f' },
  { id: 'plasma', name: 'Plasma Cutter', damage: 7000, cost: 18000000000, color: '#38e8ff' },
  { id: 'laser', name: 'Laser Drill', damage: 18000, cost: 90000000000, color: '#ff2fd0' },
  { id: 'ram', name: 'Quantum Ram', damage: 45000, cost: 450000000000, color: '#9b5bff' },
  { id: 'gravity', name: 'Gravity Hammer', damage: 110000, cost: 2200000000000, color: '#ffffff' },
]
export const HIT_INTERVAL = 0.3 // s between hits while E / the prompt is held

// Police heat ("Jail Chance"): rises while on the heist bank, faster on higher floors;
// at 100% the player is busted (carried loot lost, sent back to the hub).
export const JAIL = {
  risePerSecond: 0.35, // on the yard / ground floor
  risePerFloor: 0.026, // extra %/s per floor above the ground (floor 50: ~1.6%/s)
  decayPerSecond: 12, // back in the hub
  steal: 2.5, // added per item stolen
  glass: 2, // added per glass door smashed
  hit: 0.12, // added per door hit
  sirenAt: 70, // flashing lights from here
}
// Police cruisers patrolling the heist yard's roads: the west, back and east sides of the loop and the
// two spurs into the cliff tunnels (they drive in, U-turn hidden inside the cliff and come back out),
// never the front road by the building entrance / ground zipline tower (they U-turn at `endZ` before it).
export const POLICE_PATROL = {
  cars: 4,
  tunnelDepth: 12, // m past the cliff face where a cruiser turns round inside a tunnel (out of sight)
  speed: 7, // m/s on the straights
  turnSpeed: 3.5, // m/s through U-turns and corners
  lane: 1.5, // lane centre offset from the road centre (right-hand traffic)
  cornerRadius: 4, // m, the fillet at the loop's back corners
  endZ: -65, // the U-turn point on the west/east roads (front road starts at z = -61)
  brakeDist: 6.5, // a cruiser stops when the player stands this close ahead of it
  safeZ: -61, // the front road (z > safeZ) is never searched: searchlight spots stay behind it
  // Roof searchlight: a spot on the ground sweeping side to side ahead of each cruiser. A player on
  // the ground outside the building who stays in a spot for `catchTime` s is busted (spot turns red).
  // Off while the police are asleep (Stop Police boost).
  spot: { radius: 3.2, dist: 7.5, sweep: 0.75, sweepSpeed: 0.9, catchTime: 0.35 },
}

// Cash-priced boosts on the right of the HUD ("slightly high" cash prices).
export const BOOSTS = {
  stopPolice: { seconds: 60, base: 3000, incomeSeconds: 40 },
  randomTreasure: { base: 15000, incomeSeconds: 180, floor: 14 }, // rolled like a floor-15 spot, with your luck
}
// Timed spawns: when one runs out, that rarity appears on a floor at or above minFloor (0-based).
export const TIMED_SPAWNS = [
  { rarity: 'legendary', label: 'Legendary spawns in', seconds: 6 * 60, color: '#ffc21a', minFloor: 14 },
  { rarity: 'celestial', label: 'Celestial spawns in', seconds: 15 * 60, color: '#5ff0ff', minFloor: 34 },
  { rarity: 'secret', label: 'Secret spawns in', seconds: 25 * 60, color: '#ffffff', minFloor: 42 },
]
// Rebirth: trade ALL your cash (once you have at least the cost) for a permanent cash
// multiplier on base income and sales. multiplier = 1 + step * rebirths;
// cost = baseCost * costGrowth ^ rebirths. Items, slots, tools and upgrades are kept.
export const REBIRTH = { baseCost: 1000000, costGrowth: 3.5, step: 0.5 }
// Daily Gifts: a new day unlocks every `dayHours` of play-time calendar (checked while
// playing and on load); claim each unlocked day once. After day 7 is claimed the cycle
// restarts. "Claim All" (premium currency in the reference) is CASH here: the unclaimed
// rewards' total worth x allMarkup (slightly high), scaled by the cash rewards too.
export const DAILY = {
  dayHours: 24,
  allMarkup: 1.15,
  rewards: [
    { cash: 10000 },
    { item: 'trophy' },
    { cash: 250000 },
    { item: 'egg' },
    { cash: 5000000 },
    { item: 'lamp' },
    { item: 'barrel' },
  ],
}
// The browser's own copy of the save: the offline fallback, and the first server save of a new account.
export const SAVE_KEY = 'risky-heist-save-v1'

// Colyseus game server (../Risky-heist-backend), one URL per Bloxity Legion channel: `npm run build`
// (production) reads _MAIN, `npm run dev` and `npm run build:dev` read _DEV (`npm run dev` defaults to
// the local server). Empty = net.js asks the Bloxity SDK for the channel's endpoint; with no SDK either
// the game runs offline on the local save only.
const SERVER_URL_DEV = import.meta.env.VITE_SERVER_URL_DEV || (import.meta.env.DEV ? 'ws://localhost:2567' : '')
const SERVER_URL_MAIN = import.meta.env.VITE_SERVER_URL_MAIN || ''
export const SERVER_URL = import.meta.env.MODE === 'production' ? SERVER_URL_MAIN : SERVER_URL_DEV
export const NET = {
  poseHz: 12, // pose messages per second (only when the pose changed)
  remoteLerp: 12, // 1/s: how fast another player's character eases toward their last reported pose
  remoteSnap: 25, // m: a bigger jump (zipline, teleport) snaps instead of sliding
  remoteRange: 70, // m: only players this close are drawn (and animated, and their look loaded)
  remoteRangeSlack: 10, // m of hysteresis: a drawn player disappears only beyond range + slack
  remoteNameHeight: 0.55, // m above the character's head for the name tag
  saveEvery: 8, // s: at most one save to the server per this (the local copy is written every ~6 s)
  retryMax: 15, // s: the longest wait between connection attempts (they back off 1, 2, 4, 8, 15, ...)
  giveUpAfter: 60, // s of failed attempts before pausing (a cold server can take ~45 s to wake)
  retryPause: 30, // s to wait before starting the attempts over
}
