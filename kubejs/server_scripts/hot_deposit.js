// Kindling: hot deposit (Terraria-style "quick stack to nearby chests").
//
// Sneak + right-click a chest or barrel with an EMPTY main hand: items in your main inventory
// go into nearby containers that already hold a match. Anything unmatched stays with you.
// Open to everyone for now (gating comes later).
//   Stackables match the exact item (cobblestone -> the chest with cobblestone).
//   Gear matches by CATEGORY: a chest holding any helmet takes every helmet; likewise
//   chestplates, leggings, boots, melee weapons, ranged weapons, shields, pickaxes, axes,
//   shovels, hoes. Put one in a chest and that chest becomes the home for its kind.
//
// Never moved: hotbar, worn armor, offhand, Curios slots, storage items (backpacks, pouches,
// shulkers, bundles) and other non-stackables outside those categories, the
// #kindling:never_stash tag, and items on your personal keep list:
//     /stash keep     (adds the item in your main hand)   /stash unkeep   /stash list   /stash clear
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
  event.add(NEVER_TAG, ['#c:shulker_boxes', 'minecraft:bundle', '@sophisticatedbackpacks'])
})

function keepList(server, player) {
  try { return JSON.parse(String(server.persistentData.getString(KEEP_KEY + player.uuid)) || '[]') } catch (e) { return [] }
}
function saveKeep(server, player, list) {
  server.persistentData.putString(KEEP_KEY + player.uuid, JSON.stringify(list))
}

function stash(player, level, server) {
  let keep = keepList(server, player)
  let px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z)
  let handlers = []
  for (let x = px - STASH_H; x <= px + STASH_H; x++)
    for (let y = py - STASH_V; y <= py + STASH_V; y++)
      for (let z = pz - STASH_H; z <= pz + STASH_H; z++) {
        let b = level.getBlock(x, y, z)
        if (!isStashTarget(String(b.id))) continue
        let h = level.getCapability(ItemCaps.BLOCK, b.pos, null)
        if (h) handlers.push({ h: h, x: x, y: y, z: z, got: 0 })
      }
  if (handlers.length == 0) return { moved: 0, into: 0 }

  let inv = player.inventory
  let moved = 0
  for (let i = 9; i < 36; i++) {           // main inventory only: 0-8 hotbar, 36-39 armor, 40 offhand
    let stack = inv.getItem(i)
    if (stack.isEmpty()) continue
    if (stack.hasTag(NEVER_TAG) || keep.indexOf(String(stack.id)) >= 0) continue
    let cat = stack.getMaxStackSize() <= 1 ? gearCategory(stack) : null
    if (stack.getMaxStackSize() <= 1 && !cat) continue
    for (let hi = 0; hi < handlers.length; hi++) {
      let t = handlers[hi]
      let holds = false
      for (let s = 0; s < t.h.getSlots() && !holds; s++) {
        let there = t.h.getStackInSlot(s)
        if (there.isEmpty()) continue
        holds = cat ? gearCategory(there) == cat : ItemStack.isSameItemSameComponents(there, stack)
      }
      if (!holds) continue
      let before = stack.getCount()
      let rest = ItemHandlerHelper.insertItemStacked(t.h, stack.copy(), false)
      let n = before - rest.getCount()
      if (n > 0) { t.got += n; moved += n }
      inv.setItem(i, rest)
      stack = rest
      if (stack.isEmpty()) break
    }
  }
  let into = 0
  for (let hi = 0; hi < handlers.length; hi++) {
    let t = handlers[hi]
    if (t.got <= 0) continue
    into++
    server.runCommandSilent(`execute in ${String(level.dimension)} run particle minecraft:happy_villager ${t.x + 0.5} ${t.y + 1.0} ${t.z + 0.5} 0.25 0.2 0.25 0 6`)
  }
  return { moved: moved, into: into }
}

BlockEvents.rightClicked(event => {
  let player = event.player
  if (!player || !player.isShiftKeyDown()) return
  if (String(event.hand) != 'MAIN_HAND' || !player.mainHandItem.isEmpty()) return
  if (!isStashTarget(String(event.block.id))) return
  // Sneak + empty hand on a chest = stash, not open. event.cancel() must come LAST:
  // in KubeJS 2101 it throws to end the handler, so nothing after it runs.
  try {
    let r = stash(player, event.level, event.server)
    let name = player.username
    let msg = r.moved > 0
      ? `Stashed ${r.moved} item${r.moved == 1 ? '' : 's'} into ${r.into} container${r.into == 1 ? '' : 's'}`
      : 'Nothing to stash: no nearby container holds what you are carrying'
    event.server.runCommandSilent(`title ${name} actionbar {"text":"${msg}","color":"${r.moved > 0 ? 'aqua' : 'gray'}"}`)
    if (r.moved > 0) event.server.runCommandSilent(`execute at ${name} run playsound minecraft:block.barrel.close player ${name} ~ ~ ~ 0.6 1.3`)
  } catch (e) { console.error('hot_deposit: ' + e) }
  event.cancel()
})

ServerEvents.commandRegistry(event => {
  let { commands: Commands } = event
  let held = ctx => String(ctx.source.getPlayerOrException().mainHandItem.id)
  event.register(Commands.literal('stash')
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
