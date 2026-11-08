// NOTE (KubeJS Rhino): use let, never const, inside loops/try/blocks ("redeclaration of var");
// never console.error here (any startup error aborts the launch on server AND clients);
// never name a top-level binding Events, Priority, Item, Text, etc.: KubeJS defines
// those globals, and a redeclaration aborts ALL startup scripts (server and every client).
//
// Kindling: casting spells earns vanilla experience, like fighting, mining, trading and smelting do. Skill points
// are bought with experience levels (skill tree v4, 2026-11-07), so spellcasters can level the tree too.
// Startup script so each hook is registered exactly once.
//
// Every Iron's Spellbooks or Ars Nouveau cast: mana cost / 10 experience points (minimum 1)

function grant(player, amount) {
  try {
    if (!player || player.level.isClientSide()) return
    let n = Math.max(1, Math.round(amount))
    player.server.runCommandSilent(`xp add ${player.username} ${n} points`)
  } catch (e) { console.warn(`kindling_skill_xp: ${e}`) }
}

// Shared flags for server scripts. Only startup scripts may assign to global; server scripts
// can still call methods on this Java map, e.g. as a once-only guard (see docs/landmines.md).
try { global.kindlingFlags = new (Java.loadClass('java.util.HashMap'))() } catch (e) { console.warn('kindling flags: ' + e) }

// ---------- Arcanist (spell cast events) ----------
try {
  NativeEvents.onEvent('io.redspace.ironsspellbooks.api.events.SpellOnCastEvent', e => {
    grant(e.getEntity(), e.getManaCost() / 10)
  })
  console.info("kindling_skill_xp: Iron's hook registered")
} catch (e) { console.warn("kindling_skill_xp: Iron's hook failed: " + e) }

try {
  NativeEvents.onEvent('com.hollingsworth.arsnouveau.api.event.SpellCastEvent', e => {
    let cost = 10
    try { cost = e.spell.getCost() } catch (x) {}
    let caster = e.getEntity()
    if (caster && caster.username) grant(caster, cost / 10)   // players only
  })
  console.info('kindling_skill_xp: Ars hook registered')
} catch (e) { console.warn('kindling_skill_xp: Ars hook failed: ' + e) }
