import * as THREE from 'three'
import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { CAMERA, graphicsPreset, RENDER } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import * as physics from './physics.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createGame } from './heist/game.js'
import { initNet, net, sendEmote, sendPose, syncAvatar } from './net.js'
import { createRemotePlayers } from './avatar/remotePlayers.js'
import { setVolume, setMuted } from './heist/sfx.js'
import { setFpsVisible, tickFps } from './fps.js'
import { createEmotes } from './avatar/emotes.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> ground + sky + lighting,
// player body -> avatar (async, swaps in when ready) -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null
let game = null

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'master_volume') setVolume(value / 100)
  else if (key === 'show_fps') setFpsVisible(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    game?.setDensity(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => (game?.panelOpen ? game.hud.closePanel() : bloxity.showMenu()), renderer.domElement) // Esc closes a panel, else opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + ground + sky --------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // the sea (river water) and clouds
bloxity.loadingStep('Building the heist')
game = createGame({ scene, camera, renderer, preset })
initNet(game) // loads / mirrors the saved progress through the game server (offline-safe)
createPlayerBody()
syncYawToPlayer()

// --- Player avatar ----------------------------------------------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

const emotes = createEmotes()
emotes.onChange(sendEmote) // the others see the emote you play
const remotes = createRemotePlayers(scene) // everyone else in the room

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
  emotes.setAvatar(avatar, animator)
}

// --- Chat bubbles -------------------------------------------------------------
// The portal draws the chat box; the game shows each message as a bubble over the sender's character for
// chat.bubbleSeconds (a new message replaces the old bubble). The message's userId is matched to a
// character: this player's own, or another player's by the account id the server verified for them.
let bubble = null
let bubbleTimer = 0
bloxity.onChat((m) => {
  if (!m) return
  if (!m.isLocalPlayer) return void remotes.say(m.userId, bloxity.bubbleText(m))
  if (!avatar) return
  bubble?.remove?.()
  clearTimeout(bubbleTimer)
  bubble = bloxity.attachBubble(THREE, playerGroup, bloxity.bubbleText(m))
  bubbleTimer = setTimeout(() => {
    bubble?.remove?.()
    bubble = null
  }, bloxity.chatBubbleSeconds() * 1000)
})

// --- Ad breaks --------------------------------------------------------------------
// While Boxity plays an ad the game stands still and silent; it resumes when the break ends.
let adPaused = false
bloxity.onAdBreak((on) => {
  adPaused = on
  setMuted(on)
})

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
    syncAvatar() // the others rebuild your look from the ids
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => {
  applyProportions(avatar, bloxity.getProportions())
  syncAvatar()
})
bloxity.onRespawnRequest(respawn)

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn })

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  const elapsed = clock.elapsedTime

  tickFps(dt)
  if (adPaused) {
    postfx.render() // an ad break: the world stands still (and silent) behind the ad
    return
  }

  stepPhysics(dt) // runs the player controller + world at the fixed rate, interpolates bodies
  interpolatePlayer()

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  animator?.update(dt, {
    grounded: player.grounded,
    speed,
    verticalVelocity: player.velocity.y,
    turn: 0,
  })
  emotes.update(dt, speed, player.grounded) // a portal emote plays on top of the animator until you move
  sendPose(player, speed, game.bodyState()) // the others see you move, carry loot, ride the zipline
  remotes.update(dt, net.players, net.sessionId, player.position) // ...and you see the ones near you
  game.animate(animator, emotes.playing)

  updateCamera(camera, dt)
  game.fx.applyShake(dt)
  game.update(dt, elapsed)
  world.update(dt, elapsed)
  lighting.update(dt, playerGroup.position)
  postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  window.__game = { player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, game, physics, emotes, remotes }
}
