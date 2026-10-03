// Kindling: kinder deaths.
//
// 1. Recovery Compasses are kept through death (taken out before the gravestone collects
//    drops, handed back on respawn). Sneak + use one to return to where you last died.
// 2. Players tagged `kindling.respawn_at_death` respawn at their death spot, beside their
//    gravestone, with 5 s of Resistance. Opt in per player:
//        /tag LilSchlamm add kindling.respawn_at_death
//    Deaths to lava, fire, drowning, the void, suffocation or freezing are NOT returned to
//    (that would be a death loop); they respawn at bed/spawn as normal.
const RECALL_COOLDOWN_TICKS = 20 * 60
const RESPAWN_TAG = 'kindling.respawn_at_death'
const HAZARDS = ['lava', 'inFire', 'onFire', 'hotFloor', 'drown', 'outOfWorld', 'inWall', 'freeze', 'cramming', 'dryOut']
const COMPASS = 'minecraft:recovery_compass'

// uuid -> { compasses, returnTo } ; in memory is fine, respawn follows death within minutes
const pending = {}

EntityEvents.death('minecraft:player', event => {
  const player = event.entity
  const inv = player.inventory
  let compasses = 0
  for (let i = 0; i < inv.containerSize; i++) {
    const stack = inv.getItem(i)
    if (stack.id == COMPASS) { compasses += stack.count; inv.setItem(i, Item.empty) }
  }
  let returnTo = null
  const cause = event.source.getMsgId()
  if (player.tags.contains(RESPAWN_TAG) && HAZARDS.indexOf(cause) < 0 && player.y > -64) {
    returnTo = { dim: player.level.dimension().location().toString(), x: player.x, y: player.y, z: player.z }
  }
  pending[player.uuid.toString()] = { compasses: compasses, returnTo: returnTo }
})

PlayerEvents.respawned(event => {
  const player = event.player
  const key = player.uuid.toString()
  const p = pending[key]
  if (!p) return // e.g. leaving the End, not a death
  delete pending[key]
  const name = player.username
  event.server.scheduleInTicks(2, () => {
    if (p.compasses > 0) event.server.runCommandSilent(`give ${name} ${COMPASS} ${p.compasses}`)
    if (p.returnTo) {
      const r = p.returnTo
      event.server.runCommandSilent(`execute in ${r.dim} run tp ${name} ${r.x} ${r.y} ${r.z}`)
      event.server.runCommandSilent(`effect give ${name} minecraft:resistance 5 4 true`)
      player.tell(Text.aqua('You wake where you fell. Your things are in the grave beside you.'))
    }
  })
})

ItemEvents.rightClicked(COMPASS, event => {
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
  const pos = gp.pos()
  if (pos.y < -64) {
    player.tell(Text.gray('The needle points into the void. Not even the compass can follow.'))
    event.cancel()
    return
  }
  event.server.runCommandSilent(`execute in ${gp.dimension().location()} run tp ${player.username} ${pos.x + 0.5} ${pos.y} ${pos.z + 0.5}`)
  player.tell(Text.aqua('The compass pulls you back to where you fell.'))
  player.cooldowns.addCooldown(item, RECALL_COOLDOWN_TICKS)
  event.cancel()
})
