/**
 * Action keys shared by every mode: AltGr (right Alt) puts you back on the
 * course, Ctrl fires the surprise you hold (Enter works too).
 *
 * On Windows, AltGr also sends a left-Ctrl press just before it; a Ctrl
 * press is therefore only acted on a frame later, once it is clear it was
 * not part of an AltGr.
 */
const pending = new WeakMap();

export function actionKeys(input) {
  const I = input;
  const altgr = I.wasPressed('AltRight') || I.isDown('AltRight');
  const reset = I.wasPressed('AltRight');
  const was = pending.get(I) || 0;
  let use = false;
  if (was === 1) use = !altgr;
  const ctrl = I.wasPressed('ControlLeft') || I.wasPressed('ControlRight');
  pending.set(I, ctrl && !altgr ? 1 : 0);
  if (I.wasPressed('Enter')) use = true;
  return { reset, use };
}
