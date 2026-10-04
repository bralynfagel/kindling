// NOTE (KubeJS Rhino): use let, never const, inside loops/try/blocks ("redeclaration of var");
// never console.error here (any startup error aborts the launch on server AND clients);
// never name a top-level binding Events, Priority, Item, Text, etc.: KubeJS defines
// those globals, and a redeclaration aborts ALL startup scripts (server and every client).
//
// Kindling: XP for the Trainer and Arcanist skill trees (Puffish has no built-in source for
// Pokemon or spells). Startup script so each hook is registered exactly once (a server-script
// /reload would subscribe the Cobblemon handlers again and double the XP).
//
// Trainer XP: see server_scripts/trainer_xp.js
// Arcanist: every Iron's Spellbooks or Ars Nouveau cast, mana cost / 5 (minimum 1)

function grant(player, tree, amount) {
  try {
    if (!player || player.level.isClientSide()) return
    let n = Math.max(1, Math.round(amount))
    player.server.runCommandSilent(`puffish_skills experience add ${player.username} kindling:${tree} ${n}`)
  } catch (e) { console.warn(`kindling_skill_xp ${tree}: ${e}`) }
}

// ---------- Trainer ----------
// Cobblemon hooks live in server_scripts/trainer_xp.js. Subscribing here raced other mods
// subscribing during parallel mod construction and corrupted Cobblemon's listener list
// (client crash 2026-10-04: ArrayIndexOutOfBounds in PrioritizedList.add via capture_xp).

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
