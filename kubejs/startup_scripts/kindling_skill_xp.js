// Kindling: XP for the Trainer and Arcanist skill trees (Puffish has no built-in source for
// Pokemon or spells). Startup script so each hook is registered exactly once (a server-script
// /reload would subscribe the Cobblemon handlers again and double the XP).
//
// Trainer:  capture +10 (shiny x3, legendary x5) | battle won vs wild +5, vs NPC trainer +20
//           | evolution +15
// Arcanist: every Iron's Spellbooks or Ars Nouveau cast, mana cost / 5 (minimum 1)

function grant(player, tree, amount) {
  try {
    if (!player || player.level.isClientSide()) return
    const n = Math.max(1, Math.round(amount))
    player.server.runCommandSilent(`puffish_skills experience add ${player.username} kindling:${tree} ${n}`)
  } catch (e) { console.error(`kindling_skill_xp ${tree}: ${e}`) }
}

// ---------- Trainer (Cobblemon events) ----------
try {
  const Events = Java.loadClass('com.cobblemon.mod.common.api.events.CobblemonEvents')
  const Priority = Java.loadClass('com.cobblemon.mod.common.api.Priority')

  Events.POKEMON_CAPTURED.subscribe(Priority.NORMAL, e => {
    const mon = e.getPokemon()
    let xp = 10
    try { if (mon.getShiny()) xp *= 3 } catch (x) {}
    try { if (mon.isLegendary()) xp *= 5 } catch (x) {}
    grant(e.getPlayer(), 'trainer', xp)
  })

  Events.EVOLUTION_COMPLETE.subscribe(Priority.NORMAL, e => {
    try { grant(e.getPokemon().getOwnerPlayer(), 'trainer', 15) } catch (x) {}
  })

  Events.BATTLE_VICTORY.subscribe(Priority.NORMAL, e => {
    try {
      let vsNpc = false
      for (const loser of e.getLosers()) if (String(loser.getType()) == 'NPC') vsNpc = true
      for (const winner of e.getWinners()) {
        if (String(winner.getType()) != 'PLAYER') continue
        for (const uuid of winner.getPlayerUUIDs()) {
          const server = Java.loadClass('net.neoforged.neoforge.server.ServerLifecycleHooks').getCurrentServer()
          const p = server ? server.getPlayerList().getPlayer(uuid) : null
          grant(p, 'trainer', vsNpc ? 20 : 5)
        }
      }
    } catch (x) { console.error('kindling_skill_xp battle: ' + x) }
  })
  console.info('kindling_skill_xp: Cobblemon hooks registered')
} catch (e) { console.error('kindling_skill_xp: Cobblemon hooks failed: ' + e) }

// ---------- Arcanist (spell cast events) ----------
try {
  NativeEvents.onEvent('io.redspace.ironsspellbooks.api.events.SpellOnCastEvent', e => {
    grant(e.getEntity(), 'arcanist', e.getManaCost() / 5)
  })
  console.info("kindling_skill_xp: Iron's hook registered")
} catch (e) { console.error("kindling_skill_xp: Iron's hook failed: " + e) }

try {
  NativeEvents.onEvent('com.hollingsworth.arsnouveau.api.event.SpellCastEvent', e => {
    let cost = 10
    try { cost = e.spell.getCost() } catch (x) {}
    const caster = e.getEntity()
    if (caster && caster.username) grant(caster, 'arcanist', cost / 5)   // players only
  })
  console.info('kindling_skill_xp: Ars hook registered')
} catch (e) { console.error('kindling_skill_xp: Ars hook failed: ' + e) }
