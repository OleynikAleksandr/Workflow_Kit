// Self reload after a new release (spec M4 section 13.5): the window keeps the panel code it
// loaded, so when the service reports another version the page reloads once to take the new code.

/**
 * Whether the page must reload: the service version is known and differs from the one the page
 * started with, and this version has not triggered a reload already (no reload loop).
 * @param {string | null} loaded version seen by the first state of this page
 * @param {string | null | undefined} current version of the latest state
 * @param {string | null} reloadedFor version a previous reload was made for
 * @returns {boolean}
 */
export function shouldReload(loaded, current, reloadedFor) {
  if (!loaded || !current || current === loaded) return false;
  return reloadedFor !== current;
}
