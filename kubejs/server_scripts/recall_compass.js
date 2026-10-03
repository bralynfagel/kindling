// Kindling: sneak + use a Recovery Compass to return to where you last died.
// Built for controller players (no chat needed), works for everyone.
// Acquisition is the gate: the compass needs echo shards, or an admin can gift one.
const RECALL_COOLDOWN_TICKS = 20 * 60 // 60 s

ItemEvents.rightClicked('minecraft:recovery_compass', event => {
  const player = event.player
  if (!player.isShiftKeyDown()) return // plain use keeps vanilla behaviour
  const item = event.item.item
  if (player.cooldowns.isOnCooldown(item)) return

  const death = player.getLastDeathLocation()
  if (!death.isPresent()) {
    player.tell(Text.gray('The needle spins. You have not died yet.'))
    event.cancel()
    return
  }
  const gp = death.get()
  const dim = gp.dimension().location().toString()
  const pos = gp.pos()
  if (pos.y < -64) { // fell into the void: nothing to return to
    player.tell(Text.gray('The needle points into the void. Not even the compass can follow.'))
    event.cancel()
    return
  }
  event.server.runCommandSilent(
    `execute in ${dim} run tp ${player.username} ${pos.x + 0.5} ${pos.y} ${pos.z + 0.5}`)
  player.tell(Text.aqua('The compass pulls you back to where you fell.'))
  player.cooldowns.addCooldown(item, RECALL_COOLDOWN_TICKS)
  event.cancel()
})
