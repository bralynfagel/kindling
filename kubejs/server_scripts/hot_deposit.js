// Kindling: hot deposit (Terraria-style "quick stack to nearby chests").
//
// Two ways to trigger it, both open to everyone for now (gating comes later):
//   * the "Hot deposit" control (any key or a Controlify radial slot; it sends /stash), from anywhere
//     within range of your chests, whatever you are holding;
//   * sneak + right-click a chest or barrel with an EMPTY main hand.
// Items go into nearby containers that already hold a match. Anything unmatched stays with you.
//   Stackables match the exact item (cobblestone -> the chest with cobblestone).
//   Gear matches by CATEGORY: a chest holding any helmet takes every helmet; likewise
//   chestplates, leggings, boots, melee weapons, ranged weapons, shields, pickaxes, axes,
//   shovels, hoes. Put one in a chest and that chest becomes the home for its kind.
// Backpacks: a Sophisticated Backpack you carry that has a Deposit Upgrade (basic or advanced)
// is emptied by the same rules. A backpack without one is never touched. (The upgrade's own
// sneak-click / key behaviour is unchanged; we only use it as the opt-in switch.)
//
// Never moved: hotbar, worn armor, offhand, Curios slots, Recovery Compasses, storage items (backpacks, pouches,
// shulkers, bundles) and other non-stackables outside those categories, the
// #kindling:never_stash tag, and items on your personal keep list:
//     /stash keep     (adds the item in your main hand)   /stash unkeep   /stash list   /stash clear
// NOTE (KubeJS 2101): event.cancel() ends the handler on the spot, so it is always the last statement.
const STASH_H = 8          // horizontal radius in blocks
const STASH_V = 4          // vertical radius in blocks
const NEVER_TAG = 'kindling:never_stash'
const KEEP_KEY = 'kindlingStashKeep:'   // + uuid, JSON array of item ids in server persistentData

const ItemStack = Java.loadClass('net.minecraft.world.item.ItemStack')
const ItemHandlerHelper = Java.loadClass('net.neoforged.neoforge.items.ItemHandlerHelper')
const ItemCaps = Java.loadClass('net.neoforged.neoforge.capabilities.Capabilities$ItemHandler')
const C = n => Java.loadClass('net.minecraft.world.item.' + n)
const ArmorItem = C('ArmorItem'), ShieldItem = C('ShieldItem'), BowItem = C('BowItem'),
  CrossbowItem = C('CrossbowItem'), SwordItem = C('SwordItem'), TridentItem = C('TridentItem'),
  MaceItem = C('MaceItem'), PickaxeItem = C('PickaxeItem'), AxeItem = C('AxeItem'),
  ShovelItem = C('ShovelItem'), HoeItem = C('HoeItem')

// Sophisticated Backpacks hooks; if the mod or these classes are missing, backpacks are skipped.
// (Upgrades are identified with instanceof: KubeJS forbids reflection such as getClass().)
let SBProvider = null, SBResolver = null, SBInteraction = null, SBDeposit = null
try {
  SBProvider = Java.loadClass('net.p3pp3rf1y.sophisticatedbackpacks.util.PlayerInventoryProvider')
  SBResolver = Java.loadClass('net.p3pp3rf1y.sophisticatedbackpacks.backpack.wrapper.BackpackLinkedStorageResolver')
  SBInteraction = Java.loadClass('net.p3pp3rf1y.sophisticatedbackpacks.api.IItemHandlerInteractionUpgrade')
  SBDeposit = Java.loadClass('net.p3pp3rf1y.sophisticatedbackpacks.upgrades.deposit.DepositUpgradeWrapper')
} catch (e) { console.warn('hot_deposit: backpack support off: ' + e) }

// Category for non-stackable gear, or null (never stashed).
function gearCategory(stack) {
  let it = stack.item
  if (it instanceof ArmorItem) return 'armor:' + String(it.getType().getName())
  if (it instanceof ShieldItem) return 'shield'
  if (it instanceof BowItem || it instanceof CrossbowItem) return 'ranged'
  if (it instanceof SwordItem || it instanceof TridentItem || it instanceof MaceItem) return 'melee'
  if (it instanceof PickaxeItem) return 'pickaxe'
  if (it instanceof AxeItem) return 'axe'
  if (it instanceof ShovelItem) return 'shovel'
  if (it instanceof HoeItem) return 'hoe'
  return null
}

// Containers we deposit into. Deliberately an allow-list: Lootr chests, ender chests,
// Lightman's traders/ATMs/coin chests and anything else not listed here are never touched.
// Quark Variant Chests is on, so a chest made from spruce planks is quark:spruce_chest
// (trapped: quark:trapped_spruce_chest). Quark's quark:lootr_*_chest are Lootr chests: excluded.
function isStashTarget(id) {
  if (id == 'minecraft:chest' || id == 'minecraft:trapped_chest' || id == 'minecraft:barrel') return true
  if (id.startsWith('quark:') && id.endsWith('_chest') && !id.startsWith('quark:lootr_')) return true
  return id.startsWith('sophisticatedstorage:') && /(chest|barrel)$/.test(id)
}

ServerEvents.tags('item', event => {
  event.add(NEVER_TAG, ['#c:shulker_boxes', 'minecraft:bundle', '@sophisticatedbackpacks', 'minecraft:recovery_compass'])
})

function keepList(server, player) {
  try { return JSON.parse(String(server.persistentData.getString(KEEP_KEY + player.uuid)) || '[]') } catch (e) { return [] }
}
function saveKeep(server, player, list) {
  server.persistentData.putString(KEEP_KEY + player.uuid, JSON.stringify(list))
}

// Should this stack go anywhere at all? Returns its gear category, '' for a plain stackable, or null.
function stashKind(stack, keep) {
  if (stack.isEmpty()) return null
  if (stack.hasTag(NEVER_TAG) || keep.indexOf(String(stack.id)) >= 0) return null
  if (stack.getMaxStackSize() > 1) return ''
  return gearCategory(stack)
}

// Does target t already hold something this stack belongs with?
function targetTakes(t, stack, cat) {
  for (let s = 0; s < t.h.getSlots(); s++) {
    let there = t.h.getStackInSlot(s)
    if (there.isEmpty()) continue
    if (cat ? gearCategory(there) == cat : ItemStack.isSameItemSameComponents(there, stack)) return true
  }
  return false
}

// Carried backpacks with a Deposit Upgrade -> their item handlers.
function depositBackpacks(player, level) {
  let out = []
  if (!SBProvider) return out
  try {
    SBProvider.get().runOnBackpacks(player, (stack, handlerName, identifier, slot) => {
      try {
        let w = SBResolver.resolveForGlobalUpgradeProcessing(level, stack)
        let ups = w.getUpgradeHandler().getWrappersThatImplement(SBInteraction)
        for (let i = 0; i < ups.size(); i++) {
          if (ups.get(i) instanceof SBDeposit) { out.push(w.getInventoryForUpgradeProcessing()); break }
        }
      } catch (e) { console.warn('hot_deposit backpack: ' + e) }
      return false   // keep looking at the rest
    })
  } catch (e) { console.warn('hot_deposit backpacks: ' + e) }
  return out
}

// Move what fits from backpack slot s of handler src into target t. Backpack slots can hold more
// than a normal stack (stack upgrades), so move in stack-sized bites.
function moveFromHandler(src, s, t) {
  let moved = 0
  for (let guard = 0; guard < 64; guard++) {
    let stack = src.getStackInSlot(s)
    if (stack.isEmpty()) break
    let probe = stack.copyWithCount(Math.min(stack.getCount(), stack.getMaxStackSize()))
    let fits = probe.getCount() - ItemHandlerHelper.insertItemStacked(t.h, probe, true).getCount()
    if (fits <= 0) break
    let taken = src.extractItem(s, fits, false)
    if (taken.isEmpty()) break
    let left = ItemHandlerHelper.insertItemStacked(t.h, taken, false)
    if (!left.isEmpty()) src.insertItem(s, left, false)
    moved += taken.getCount() - left.getCount()
    if (!left.isEmpty()) break
  }
  return moved
}

function stash(player, level, server) {
  let keep = keepList(server, player)
  let px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z)
  let targets = []
  for (let x = px - STASH_H; x <= px + STASH_H; x++)
    for (let y = py - STASH_V; y <= py + STASH_V; y++)
      for (let z = pz - STASH_H; z <= pz + STASH_H; z++) {
        let b = level.getBlock(x, y, z)
        if (!isStashTarget(String(b.id))) continue
        let h = level.getCapability(ItemCaps.BLOCK, b.pos, null)
        if (h) targets.push({ h: h, x: x, y: y, z: z, got: 0 })
      }
  if (targets.length == 0) return { moved: 0, into: 0, containers: 0, packs: 0 }

  let moved = 0
  // 1. Main inventory: 0-8 hotbar, 36-39 armor and 40 offhand are never touched.
  let inv = player.inventory
  for (let i = 9; i < 36; i++) {
    let stack = inv.getItem(i)
    let cat = stashKind(stack, keep)
    if (cat === null) continue
    for (let ti = 0; ti < targets.length; ti++) {
      let t = targets[ti]
      if (!targetTakes(t, stack, cat)) continue
      let before = stack.getCount()
      let rest = ItemHandlerHelper.insertItemStacked(t.h, stack.copy(), false)
      let n = before - rest.getCount()
      if (n > 0) { t.got += n; moved += n }
      inv.setItem(i, rest)
      stack = rest
      if (stack.isEmpty()) break
    }
  }
  // 2. Backpacks with a Deposit Upgrade, same rules.
  let packs = depositBackpacks(player, level)
  for (let p = 0; p < packs.length; p++) {
    let src = packs[p]
    for (let s = 0; s < src.getSlots(); s++) {
      let stack = src.getStackInSlot(s)
      let cat = stashKind(stack, keep)
      if (cat === null) continue
      for (let ti = 0; ti < targets.length; ti++) {
        let t = targets[ti]
        if (!targetTakes(t, stack, cat)) continue
        let n = moveFromHandler(src, s, t)
        if (n > 0) { t.got += n; moved += n }
        if (src.getStackInSlot(s).isEmpty()) break
      }
    }
  }

  let into = 0
  for (let ti = 0; ti < targets.length; ti++) {
    let t = targets[ti]
    if (t.got <= 0) continue
    into++
    server.runCommandSilent(`execute in ${String(level.dimension)} run particle minecraft:happy_villager ${t.x + 0.5} ${t.y + 1.0} ${t.z + 0.5} 0.25 0.2 0.25 0 6`)
  }
  return { moved: moved, into: into, containers: targets.length, packs: packs.length }
}

// Run a stash for this player and tell them how it went.
function stashAndReport(player, server, level) {
  let r
  try { r = stash(player, level || player.level, server) }
  catch (e) { console.error('hot_deposit: ' + e); return 0 }
  let name = player.username
  let msg = r.moved > 0
    ? `Stashed ${r.moved} item${r.moved == 1 ? '' : 's'} into ${r.into} container${r.into == 1 ? '' : 's'}`
    : r.containers == 0
      ? `No chests or barrels within ${STASH_H} blocks`
      : 'Nothing to stash: no nearby container holds what you are carrying'
  if (r.packs > 0) msg += ` (incl. ${r.packs} backpack${r.packs == 1 ? '' : 's'})`
  server.runCommandSilent(`title ${name} actionbar {"text":"${msg}","color":"${r.moved > 0 ? 'aqua' : 'gray'}"}`)
  if (r.moved > 0) server.runCommandSilent(`execute at ${name} run playsound minecraft:block.barrel.close player ${name} ~ ~ ~ 0.6 1.3`)
  return r.moved
}

BlockEvents.rightClicked(event => {
  let player = event.player
  if (!player || !player.isShiftKeyDown()) return
  if (String(event.hand) != 'MAIN_HAND' || !player.mainHandItem.isEmpty()) return
  if (!isStashTarget(String(event.block.id))) return
  // Sneak + empty hand on a chest = stash, not open. cancel() must stay LAST (it exits the handler).
  stashAndReport(player, event.server, event.level)
  event.cancel()
})

ServerEvents.commandRegistry(event => {
  let { commands: Commands } = event
  let held = ctx => String(ctx.source.getPlayerOrException().mainHandItem.id)
  event.register(Commands.literal('stash')
    .executes(ctx => {   // bare /stash: what the "Hot deposit" control sends
      let p = ctx.source.getPlayerOrException()
      stashAndReport(p, ctx.source.server)
      return 1
    })
    .then(Commands.literal('keep').executes(ctx => {
      let p = ctx.source.getPlayerOrException(), id = held(ctx)
      if (id == 'minecraft:air') { p.tell(Text.gray('Hold the item you want to keep.')); return 0 }
      let list = keepList(ctx.source.server, p)
      if (list.indexOf(id) < 0) list.push(id)
      saveKeep(ctx.source.server, p, list)
      p.tell(Text.aqua(`Hot deposit will leave ${id} with you.`)); return 1
    }))
    .then(Commands.literal('unkeep').executes(ctx => {
      let p = ctx.source.getPlayerOrException(), id = held(ctx)
      saveKeep(ctx.source.server, p, keepList(ctx.source.server, p).filter(x => x != id))
      p.tell(Text.aqua(`${id} can be stashed again.`)); return 1
    }))
    .then(Commands.literal('list').executes(ctx => {
      let p = ctx.source.getPlayerOrException(), list = keepList(ctx.source.server, p)
      p.tell(Text.aqua(list.length ? 'Kept: ' + list.join(', ') : 'Your keep list is empty.')); return 1
    }))
    .then(Commands.literal('clear').executes(ctx => {
      let p = ctx.source.getPlayerOrException()
      saveKeep(ctx.source.server, p, [])
      p.tell(Text.aqua('Keep list cleared.')); return 1
    })))
})
