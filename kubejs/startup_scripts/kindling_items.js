// NOTE (KubeJS Rhino): use let, never const, inside blocks; never console.error here
// (any startup error aborts the launch on server AND clients).
//
// Kindling: items the pack needs that no mod provides.
//   kindling:bronze_ingot  Epic Knights asks for #c:ingots/bronze for its bronze gear (recipes,
//                          anvil repair) but no mod in the pack makes bronze. Tag and recipe
//                          (3 copper + 1 iron -> 4 bronze) live in the kindling-loot datapack.
StartupEvents.registry('item', event => {
  event.create('kindling:bronze_ingot').displayName('Bronze Ingot')
})
