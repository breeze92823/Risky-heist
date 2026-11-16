// The portal's `show_fps` setting: a small frames-per-second counter in the top-right corner (the portal's
// own toolbar and chat take the top-left). Off until the setting turns it on.
let el = null
let frames = 0
let acc = 0

export function setFpsVisible(on) {
  if (on && !el) {
    el = document.createElement('div')
    el.style.cssText =
      'position:fixed;top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));z-index:30;' +
      'padding:2px 8px;border-radius:6px;background:rgba(10,8,30,.55);color:#9dff7a;' +
      "font:600 13px/1.4 'Fredoka',system-ui,sans-serif;pointer-events:none;user-select:none"
    el.textContent = '-- fps'
    document.body.appendChild(el)
  }
  if (el) el.style.display = on ? 'block' : 'none'
}

// Call once per rendered frame with the frame time in seconds.
export function tickFps(dt) {
  if (!el || el.style.display === 'none') return
  frames++
  acc += dt
  if (acc >= 0.5) {
    el.textContent = `${Math.round(frames / acc)} fps`
    frames = 0
    acc = 0
  }
}
