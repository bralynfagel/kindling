// NOTE (KubeJS Rhino): use let, never const, inside blocks; never console.error here
// (any startup error aborts the launch on server AND clients).
//
// Kindling: extra game controls, bindable to a key or to a Controlify radial-menu slot.
//   "Back (/back)": runs FTB Essentials' /back (last death or teleport spot). The press is
//   handled in client_scripts/kindling_keys.js.
// KeyBindEvents is client-side: on the dedicated server it may not exist, hence the guard.
if (typeof KeyBindEvents !== 'undefined') {
  try {
    KeyBindEvents.registry(event => {
      event.register('kindling_back').category('key.categories.kindling')
    })
  } catch (e) { console.warn('kindling_keys: ' + e) }
}
