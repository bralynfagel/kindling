// Kindling: what the extra game controls do (registered in startup_scripts/kindling_keys.js).
//
// Not KeyBindEvents.pressed: KubeJS only sees a PHYSICAL key held down, so a Controlify
// radial-menu slot (which presses the control virtually) never fired it. Instead, every
// client tick read the control itself: consumeClick() catches keyboard and radial presses,
// the isDown edge catches anything that only holds it down. One command per press.
let KINDLING_KEYS = { 'key.kubejs.go_back_to_last_death': 'back', 'key.kubejs.go_to_home': 'home' }
let kindlingKeyState = {}   // name -> { mapping, wasDown }

ClientEvents.tick(event => {
  let mc = Client
  if (!mc.player) return   // no screen check: Controlify's radial menu is itself a screen
  try {
    let all = mc.options.keyMappings
    for (let name in KINDLING_KEYS) {
      let st = kindlingKeyState[name]
      if (!st) {
        for (let i = 0; i < all.length; i++) {
          if (String(all[i].getName()) == name) { st = kindlingKeyState[name] = { mapping: all[i], wasDown: false }; break }
        }
        if (!st) continue
      }
      let fired = false
      while (st.mapping.consumeClick()) fired = true
      let down = st.mapping.isDown()
      if (down && !st.wasDown) fired = true
      st.wasDown = down
      if (fired) mc.player.connection.sendCommand(KINDLING_KEYS[name])
    }
  } catch (e) { console.warn('kindling_keys: ' + e) }
})
