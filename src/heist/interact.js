// "Press E" interactions. Targets register a world point, a radius and callbacks;
// each frame the nearest enabled target in range gets a prompt (key cap + item
// name + action) projected next to it. E (or a tap / press on the prompt itself on
// touch screens) fires it; targets with `hold` repeat every `interval` seconds
// while the key or finger stays down (breaking doors).
import { Vector3 } from 'three'
import { COARSE_POINTER } from '../config.js'

export function createInteractions(camera) {
  const targets = new Set()
  let current = null
  let holding = false
  let repeatT = 0
  let blocked = false

  const el = document.createElement('div')
  el.className = 'prompt hidden'
  el.innerHTML = '<div class="prompt-key">E</div><div class="prompt-text"><div class="prompt-title"></div><div class="prompt-action"></div></div>'
  document.body.appendChild(el)
  const keyEl = el.querySelector('.prompt-key')
  const titleEl = el.querySelector('.prompt-title')
  const actionEl = el.querySelector('.prompt-action')
  let lastTitle = ''
  let lastAction = ''
  let lastColor = ''

  function fire() {
    if (!current || blocked) return
    current.press()
    repeatT = current.interval ?? 0.3
    el.classList.remove('pop')
    void el.offsetWidth
    el.classList.add('pop')
  }
  function release() {
    holding = false
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || e.target instanceof HTMLInputElement) return
    holding = true
    fire()
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') release()
  })
  window.addEventListener('blur', release)
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    holding = true
    fire()
  })
  el.addEventListener('pointerup', release)
  el.addEventListener('pointercancel', release)
  el.addEventListener('pointerleave', release)

  const proj = new Vector3()
  const touchMode = () => document.body.classList.contains('touch-ui') || COARSE_POINTER

  return {
    register(t) {
      targets.add(t)
      return t
    },
    unregister(t) {
      targets.delete(t)
    },
    set blocked(v) {
      blocked = v
    },
    get current() {
      return current
    },
    update(dt, p) {
      let best = null
      let bestD = Infinity
      if (!blocked) {
        for (const t of targets) {
          if (t.enabled && !t.enabled()) continue
          const dy = Math.abs(p.y - t.at.y)
          if (dy > (t.dy ?? 2.6)) continue
          const d = Math.hypot(p.x - t.at.x, p.z - t.at.z) - (t.priority ?? 0)
          if (d < t.radius - (t.priority ?? 0) && d < bestD) {
            best = t
            bestD = d
          }
        }
      }
      if (best !== current) {
        current = best
        holding = false
      }
      if (!current) {
        el.classList.add('hidden')
        return
      }
      // hold-to-repeat
      if (holding && current.hold) {
        repeatT -= dt
        if (repeatT <= 0) fire()
      }
      const title = current.title?.() ?? ''
      const action = current.action()
      const color = current.titleColor?.() ?? '#7dff5a'
      if (title !== lastTitle) titleEl.textContent = lastTitle = title
      if (action !== lastAction) actionEl.textContent = lastAction = action
      if (color !== lastColor) titleEl.style.color = lastColor = color
      keyEl.textContent = touchMode() ? 'TAP' : 'E'
      el.classList.toggle('touch', touchMode())
      el.classList.toggle('disabled', !!current.disabled?.())
      proj.copy(current.labelAt ?? current.at)
      if (!current.labelAt) proj.y += 1.4
      proj.project(camera)
      if (proj.z > 1 || proj.z < -1) {
        el.classList.add('hidden')
        return
      }
      el.classList.remove('hidden')
      const x = Math.min(window.innerWidth - 120, Math.max(120, (proj.x * 0.5 + 0.5) * window.innerWidth))
      const y = Math.min(window.innerHeight - 160, Math.max(140, (-proj.y * 0.5 + 0.5) * window.innerHeight))
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
    },
  }
}
