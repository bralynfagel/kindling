// NOTE (KubeJS Rhino): use let, never const, inside loops/try/blocks ("redeclaration of var");
// never console.error here (any startup error aborts the launch on server AND clients);
// never name a top-level binding Events, Priority, Item, Text, etc.: KubeJS defines
// those globals, and a redeclaration aborts ALL startup scripts (server and every client).
//
// Kindling: XP for the Arcanist skill tree (Puffish has no built-in source for spells).
// Startup script so each hook is registered exactly once.
//
// Arcanist: every Iron's Spellbooks or Ars Nouveau cast, mana cost / 5 (minimum 1)

function grant(player, tree, amount) {
  try {
    if (!player || player.level.isClientSide()) return
    let n = Math.max(1, Math.round(amount))
    player.server.runCommandSilent(`puffish_skills experience add ${player.username} kindling:${tree} ${n}`)
  } catch (e) { console.warn(`kindling_skill_xp ${tree}: ${e}`) }
}

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
