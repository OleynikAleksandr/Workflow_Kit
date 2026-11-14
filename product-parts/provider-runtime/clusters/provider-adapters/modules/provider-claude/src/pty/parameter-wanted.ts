// M29 3.2: the user's wanted parameter choices and how each went. The service writes the wanted
// file; the host applies one field at a time and reports statuses in its state snapshot.
import { WANTED_ATTEMPTS, WANTED_ORDER } from './parameter-protocol.ts';
import type { NativeWanted, NativeWantedStatus, WantedField } from './parameter-protocol.ts';

export class WantedChoices {
  private wanted: NativeWanted | null = null;
  private statuses = new Map<WantedField, NativeWantedStatus>();
  /** Ids already applied or failed: a choice still in the file is never applied twice. */
  private settled = new Map<string, { status: 'applied' | 'failed'; reason: string | null }>();

  /** The current wanted file of this host and session; other fields and ids are forgotten. */
  update(value: NativeWanted | null, hostId: string, sessionId: string | null): void {
    this.wanted = value && value.hostId === hostId && sessionId && value.sessionId === sessionId ? value : null;
    for (const [field, status] of this.statuses) if (this.wanted?.ids[field] !== status.id) this.statuses.delete(field);
    for (const field of WANTED_ORDER) {
      const id = this.wanted?.ids[field]; const value = this.wanted?.changes[field];
      if (!id || !value || this.statuses.has(field)) continue;
      const done = this.settled.get(id);
      this.statuses.set(field, { id, value, status: done?.status ?? 'pending', reason: done?.reason ?? null, attempts: 0 });
    }
  }
  /** Fields still to apply, in WANTED_ORDER. */
  open(): { field: WantedField; status: NativeWantedStatus }[] {
    return WANTED_ORDER.flatMap(field => {
      const status = this.statuses.get(field);
      return status && (status.status === 'pending' || status.status === 'applying') ? [{ field, status }] : [];
    });
  }
  current(field: WantedField, id: string): NativeWantedStatus | null {
    const status = this.statuses.get(field);
    return status?.id === id ? status : null;
  }
  settle(field: WantedField, status: 'applied' | 'failed', reason: string | null): void {
    const st = this.statuses.get(field); if (!st) return;
    Object.assign(st, { status, reason });
    this.settled.set(st.id, { status, reason });
    if (this.settled.size > 64) this.settled.delete(this.settled.keys().next().value!);
  }
  /** A counted failure: the field goes back to pending, after WANTED_ATTEMPTS it fails. */
  count(field: WantedField, reason: string): void {
    const st = this.statuses.get(field); if (!st) return;
    st.attempts += 1; st.reason = reason;
    if (st.attempts >= WANTED_ATTEMPTS) this.settle(field, 'failed', reason); else st.status = 'pending';
  }
  /** Cancelled by the user or a turn: tried again later, not counted. */
  retry(field: WantedField): void {
    const st = this.statuses.get(field); if (st && st.status === 'applying') st.status = 'pending';
  }
  get active(): boolean { return this.wanted !== null; }
  snapshot(): Partial<Record<WantedField, NativeWantedStatus>> | null {
    return this.statuses.size ? Object.fromEntries([...this.statuses].map(([k, v]) => [k, { ...v }])) : null;
  }
}
