// @ts-check
// Visible presses for every button of the panel (buttons.css): .is-pressed while the pointer is
// down and a little after it is released, .just-pressed (a short ring) after each click, keyboard
// clicks included. Elements are found by delegation, so redrawn screens need no setup.

const PRESSABLE = 'button, [role="button"], a.btn, a.chat-link, .archive-item';
/** How long the press stays visible after the pointer is released (ms). */
export const STICKY_MS = 180;
/** Length of the click ring (ms), as in buttons.css. */
export const RING_MS = 450;

/** @param {EventTarget | null} target @returns {HTMLElement | null} */
function pressable(target) {
  if (!(target instanceof Element)) return null;
  const node = target.closest(PRESSABLE);
  if (!(node instanceof HTMLElement)) return null;
  if (node instanceof HTMLButtonElement && node.disabled) return null;
  return node;
}

/** Installs the listeners on the document once. */
export function installPressFeedback() {
  /** @type {Set<HTMLElement>} */
  const held = new Set();
  const release = () => {
    for (const node of held) setTimeout(() => node.classList.remove('is-pressed'), STICKY_MS);
    held.clear();
  };
  document.addEventListener('pointerdown', (event) => {
    const node = pressable(event.target);
    if (!node) return;
    node.classList.add('is-pressed');
    held.add(node);
  });
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  document.addEventListener(
    'click',
    (event) => {
      const node = pressable(event.target);
      if (!node) return;
      node.classList.remove('just-pressed');
      // Restart the animation on repeated clicks.
      void node.offsetWidth;
      node.classList.add('just-pressed');
      setTimeout(() => node.classList.remove('just-pressed'), RING_MS);
    },
    true,
  );
}
