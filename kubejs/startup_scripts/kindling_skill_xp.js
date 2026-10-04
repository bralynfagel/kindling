// NOTE (KubeJS Rhino): use let, never const, inside loops/try/blocks ("redeclaration of var");
// never console.error here (any startup error aborts the launch on server AND clients);
// never name a top-level binding Events, Priority, Item, Text, etc.: KubeJS defines
// those globals, and a redeclaration aborts ALL startup scripts (server and every client).
//
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
    let n = Math.max(1, Math.round(amount))
    player.server.runCommandSilent(`puffish_skills experience add ${player.username} kindling:${tree} ${n}`)
  } catch (e) { console.warn(`kindling_skill_xp ${tree}: ${e}`) }
}

// ---------- Trainer (Cobblemon events) ----------
try {
  let KCobbleEvents = Java.loadClass('com.cobblemon.mod.common.api.events.CobblemonEvents')

  // subscribe(Consumer) only: the (Priority, fn) form matches two Java overloads and Rhino refuses it
  KCobbleEvents.POKEMON_CAPTURED.subscribe(e => {
    let mon = e.getPokemon()
    let xp = 10
    try { if (mon.getShiny()) xp *= 3 } catch (x) {}
    try { if (mon.isLegendary()) xp *= 5 } catch (x) {}
    grant(e.getPlayer(), 'trainer', xp)
  })

  KCobbleEvents.EVOLUTION_COMPLETE.subscribe(e => {
    try { grant(e.getPokemon().getOwnerPlayer(), 'trainer', 15) } catch (x) {}
  })

  KCobbleEvents.BATTLE_VICTORY.subscribe(function (e) {
    try {
      var vsNpc = false
      var losers = e.getLosers()
      for (var i = 0; i < losers.size(); i++) {
        if (String(losers.get(i).getType()) == 'NPC') vsNpc = true
      }
      var server = Java.loadClass('net.neoforged.neoforge.server.ServerLifecycleHooks').getCurrentServer()
      var winners = e.getWinners()
      for (var w = 0; w < winners.size(); w++) {
        var winner = winners.get(w)
        if (String(winner.getType()) != 'PLAYER') continue
        var it = winner.getPlayerUUIDs().iterator()
        while (it.hasNext()) {
          var p = server ? server.getPlayerList().getPlayer(it.next()) : null
          grant(p, 'trainer', vsNpc ? 20 : 5)
        }
      }
    } catch (x) { console.warn('kindling_skill_xp battle: ' + x) }
  })
  console.info('kindling_skill_xp: Cobblemon hooks registered')
} catch (e) { console.warn('kindling_skill_xp: Cobblemon hooks failed: ' + e) }

// ---------- Arcanist (spell cast events) ----------
try {
  NativeEvents.onEvent('io.redspace.ironsspellbooks.api.events.SpellOnCastEvent', e => {
    grant(e.getEntity(), 'arcanist', e.getManaCost() / 5)
  })
  console.info("kindling_skill_xp: Iron's hook registered")
} catch (e) { console.warn("kindling_skill_xp: Iron's hook failed: " + e) }

try {
  NativeEvents.onEvent('com.hollingsworth.arsnouveau.api.event.SpellCastEvent', e => {
    let cost = 10
    try { cost = e.spell.getCost() } catch (x) {}
    let caster = e.getEntity()
    if (caster && caster.username) grant(caster, 'arcanist', cost / 5)   // players only
  })
  console.info('kindling_skill_xp: Ars hook registered')
} catch (e) { console.warn('kindling_skill_xp: Ars hook failed: ' + e) }
