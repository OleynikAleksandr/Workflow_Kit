// The author of a plan proposal (spec M31 3.2): a session whose turn began after the proposal was
// created did not write it, so it neither asks about the review nor starts one.

/** True when the turn began no later than the proposal; unknown times count as the author. */
export function isAuthor(turnStartedAt: string | null | undefined, createdAt: string | null | undefined): boolean {
  const started = Date.parse(String(turnStartedAt ?? ''));
  const created = Date.parse(String(createdAt ?? ''));
  if (!Number.isFinite(started) || !Number.isFinite(created)) return true;
  return started <= created;
}
