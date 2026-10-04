// Kindling: what the extra game controls do (registered in startup_scripts/kindling_keys.js).
KeyBindEvents.pressed('kindling_back', event => {
  try { Client.player.connection.sendCommand('back') } catch (e) { console.warn('kindling_keys back: ' + e) }
})
