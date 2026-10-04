// NOTE (KubeJS Rhino): use let, never const, inside blocks; never console.error here
// (any startup error aborts the launch on server AND clients).
//
// Kindling: extra game controls, bindable to a key or to a Controlify radial-menu slot.
//   "Go back to last death"  -> /back  (FTB Essentials: last death or teleport spot)
//   "Go to home"             -> /home  (FTB Essentials: the spot saved with /sethome)
// What a press does lives in client_scripts/kindling_keys.js. The ids double as display
// names (KubeJS title-cases them) in case the lang file in kubejs/assets is not applied.
// KeyBindEvents is client-side: on the dedicated server it may not exist, hence the guard.
if (typeof KeyBindEvents !== 'undefined') {
  try {
    KeyBindEvents.registry(event => {
      event.register('go_back_to_last_death').category('key.categories.kindling')
      event.register('go_to_home').category('key.categories.kindling')
    })
  } catch (e) { console.warn('kindling_keys: ' + e) }
}
