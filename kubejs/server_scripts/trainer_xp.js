// Kindling: Trainer skill tree XP from Cobblemon events.
//   capture +10 (shiny x3, legendary x5) | battle won vs wild +5, vs NPC trainer +20 | evolution +15
//
// Subscribed once, after the server has loaded (single-threaded). NOT in a startup script:
// subscribing during mod construction races other mods' subscriptions and corrupts
// Cobblemon's listener list (client crash 2026-10-04). global.* survives /reload, so the
// guard stops a reload from subscribing twice. subscribe(Consumer) only: the
// (Priority, fn) form matches two Java overloads and Rhino refuses it.

function trainerXp(player, amount) {
  try {
    if (!player || !player.username) return
    player.server.runCommandSilent(`puffish_skills experience add ${player.username} kindling:trainer ${Math.max(1, Math.round(amount))}`)
  } catch (e) { console.warn('trainer_xp grant: ' + e) }
}

ServerEvents.loaded(event => {
  if (global.kindlingTrainerHooked) return
  try {
    let CobbleEvents = Java.loadClass('com.cobblemon.mod.common.api.events.CobblemonEvents')
    let server = event.server

    CobbleEvents.POKEMON_CAPTURED.subscribe(e => {
      let mon = e.getPokemon()
      let xp = 10
      try { if (mon.getShiny()) xp *= 3 } catch (x) {}
      try { if (mon.isLegendary()) xp *= 5 } catch (x) {}
      trainerXp(e.getPlayer(), xp)
    })

    CobbleEvents.EVOLUTION_COMPLETE.subscribe(e => {
      try { trainerXp(e.getPokemon().getOwnerPlayer(), 15) } catch (x) {}
    })

    CobbleEvents.BATTLE_VICTORY.subscribe(e => {
      try {
        let vsNpc = false
        let losers = e.getLosers()
        for (let i = 0; i < losers.size(); i++) {
          if (String(losers.get(i).getType()) == 'NPC') vsNpc = true
        }
        let winners = e.getWinners()
        for (let w = 0; w < winners.size(); w++) {
          let winner = winners.get(w)
          if (String(winner.getType()) != 'PLAYER') continue
          let it = winner.getPlayerUUIDs().iterator()
          while (it.hasNext()) trainerXp(server.getPlayerList().getPlayer(it.next()), vsNpc ? 20 : 5)
        }
      } catch (x) { console.warn('trainer_xp battle: ' + x) }
    })

    global.kindlingTrainerHooked = true
    console.info('trainer_xp: Cobblemon hooks registered')
  } catch (e) { console.error('trainer_xp: Cobblemon hooks failed: ' + e) }
})
