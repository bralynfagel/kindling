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
const HAZARDS = ['lava', 'inFire', 'onFire', 'hotFloor', 'drown', 'outOfWorld', 'inWall', 'freeze', 'cramming', 'dryout']
const COMPASS = 'minecraft:recovery_compass'

// uuid -> { compasses, returnTo } ; in memory is fine, respawn follows death within minutes
const pending = {}

// Dimension id as 'namespace:path' from whatever KubeJS hands us: a ResourceLocation,
// a ResourceKey ("ResourceKey[minecraft:dimension / minecraft:overworld]") or a getter.
function dimId(v) {
  try { if (typeof v === 'function') v = v() } catch (e) {}
  let m = String(v).match(/([a-z0-9_.-]+:[a-z0-9_.\/-]+)\]?$/)
  return m ? m[1] : 'minecraft:overworld'
}

// Damage cause id, e.g. 'lava', 'explosion.player'. Read defensively: KubeJS does not expose
// DamageSource.getMsgId(), but the type record and toString ("DamageSource (lava)") both carry it.
function causeOf(source) {
  try { return String(source.type().msgId()) } catch (e) {}
  let m = String(source).match(/\(([^)]+)\)/)
  return m ? m[1] : ''
}

EntityEvents.death('minecraft:player', event => {
  let player = event.entity
  let entry = { compasses: 0, returnTo: null }
  pending[String(player.uuid)] = entry
  // Each step guarded on its own: a KubeJS naming surprise in one must not skip the others.
  try {
    if (player.tags.contains(RESPAWN_TAG) && HAZARDS.indexOf(causeOf(event.source)) < 0 && player.y > -64) {
      entry.returnTo = { dim: dimId(player.level.dimension), x: player.x, y: player.y, z: player.z }
    }
  } catch (e) { console.error('death_recovery: respawn point: ' + e) }
  try {
    let inv = player.inventory
    for (let i = 0; i < inv.containerSize; i++) {
      let stack = inv.getItem(i)
      if (stack.id == COMPASS) { entry.compasses += stack.count; inv.setItem(i, Item.empty) }
    }
  } catch (e) { console.error('death_recovery: compass: ' + e) }
})

PlayerEvents.respawned(event => {
  let player = event.player
  let key = String(player.uuid)
  let p = pending[key]
  if (!p) return // e.g. leaving the End, not a death
  delete pending[key]
  let name = player.username
  event.server.scheduleInTicks(2, () => {
    if (p.compasses > 0) event.server.runCommandSilent(`give ${name} ${COMPASS} ${p.compasses}`)
    if (p.returnTo) {
      let r = p.returnTo
      event.server.runCommandSilent(`execute in ${r.dim} run tp ${name} ${r.x} ${r.y} ${r.z}`)
      event.server.runCommandSilent(`effect give ${name} minecraft:resistance 5 4 true`)
      player.tell(Text.aqua('You wake where you fell. Your things are in the grave beside you.'))
    }
  })
})

ItemEvents.rightClicked(COMPASS, event => {
  let player = event.player
  if (!player.isShiftKeyDown()) return // plain use keeps vanilla behaviour
  let item = event.item.item
  if (player.cooldowns.isOnCooldown(item)) return
  let death = player.getLastDeathLocation()
  if (!death.isPresent()) {
    player.tell(Text.gray('The needle spins. You have not died yet.'))
    event.cancel()
    return
  }
  let gp = death.get()
  let pos = gp.pos()
  if (pos.y < -64) {
    player.tell(Text.gray('The needle points into the void. Not even the compass can follow.'))
    event.cancel()
    return
  }
  event.server.runCommandSilent(`execute in ${dimId(gp.dimension)} run tp ${player.username} ${pos.x + 0.5} ${pos.y} ${pos.z + 0.5}`)
  player.tell(Text.aqua('The compass pulls you back to where you fell.'))
  player.cooldowns.addCooldown(item, RECALL_COOLDOWN_TICKS)
  event.cancel()
})
