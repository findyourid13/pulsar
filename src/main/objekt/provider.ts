import type { Objekt, Settings } from '@shared/types';
import { createRemoteSource } from './remote-source';

// §9: ObjektProvider is an interface with one method. remote-source (M3)
// is the only implementation — local-source (M2) was removed; Cosmo is
// now the sole objekt source.
export interface ObjektProvider {
  list(): Promise<Objekt[]>;
}

export type SourceStatus =
  | 'not-connected' // no cosmoAccount signed in yet
  | 'remote' // live fetch from Cosmo/Abstract succeeded
  | 'remote-cached' // live fetch failed; served the last-known-good cached list
  | 'remote-unavailable'; // live fetch failed and no cache existed either

export type ResolvedObjekts = { objekts: Objekt[]; status: SourceStatus };

export async function resolveObjekts(settings: Settings): Promise<ResolvedObjekts> {
  const { cosmoAccount } = settings.objekts;
  if (!cosmoAccount) {
    return { objekts: [], status: 'not-connected' };
  }

  const remote = createRemoteSource(cosmoAccount.address, settings.objekts.cosmoSession);
  try {
    const objekts = await remote.list();
    return { objekts, status: remote.lastServedFromCache() ? 'remote-cached' : 'remote' };
  } catch {
    return { objekts: [], status: 'remote-unavailable' };
  }
}
