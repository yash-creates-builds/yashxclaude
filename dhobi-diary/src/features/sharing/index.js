// Family sharing + cloud backup — the seam for a future paid tier.
//
// Today the app uses LocalOnlyProvider: nothing leaves the phone.
// Later, add e.g. a FirebaseProvider / SupabaseProvider implementing the same interface,
// and switch to it after a purchase. Screens only talk to `sharing`, never to a backend.
//
// Interface:
//   id: string
//   isAvailable(): boolean          → show "Family sharing" as active?
//   pushChanges(db): Promise<void>   → called after every local save
//   pullChanges(): Promise<db|null>  → merge remote edits (from family members)
//   backupNow(db): Promise<void>     → cloud backup
import { onChange } from '../../core/db.js';

export const LocalOnlyProvider = {
  id: 'local',
  isAvailable: () => false,
  pushChanges: async () => {},
  pullChanges: async () => null,
  backupNow: async () => {},
};

let provider = LocalOnlyProvider;

export const sharing = {
  get provider() { return provider; },
  /** Swap the backend (e.g. after the user buys family sharing). */
  use(p) { provider = p; },
  isEnabled: () => provider.isAvailable(),
};

/** Wire local saves to the provider. Safe no-op while local-only. */
export function startSharing() {
  onChange((db) => { provider.pushChanges(db).catch(() => {}); });
}
