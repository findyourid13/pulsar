import type { BrowserWindow } from 'electron';
import { IpcChannel, type Objekt, type Settings } from '@shared/types';
import { getSettings } from '../settings';
import { resolveObjekts, type SourceStatus } from './provider';
import { getListCachedAt, peekCachedObjekts } from './remote-source';

let allObjekts: Objekt[] = [];
let currentIndex = 0;
let win: BrowserWindow | null = null;
let sourceStatus: SourceStatus = 'not-connected';
let shuffleTimer: ReturnType<typeof setInterval> | null = null;
// When the on-disk list cache was last written, re-read after every
// primeFromCache/reloadObjekts so it reflects whatever's actually on disk
// (a live resolve updates it; a fallback-to-cache serve leaves it as-is).
// Kept in memory since the tray menu builds synchronously and can't await a
// disk read — see menu-sections.ts's buildLastCachedItem.
let listCachedAt: number | null = null;

// The chain/API enumeration order is acquisition order, so without this the
// first objekt shown would be the same one every single launch. Applied
// wherever allObjekts is (re)populated, not baked into the cached list
// itself, so a fresh shuffle happens on every launch — including the
// cache-only paint before the live reload lands — not just after a live
// resolve.
function shuffleObjekts(objekts: Objekt[]): Objekt[] {
  const shuffled = [...objekts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as Objekt, shuffled[i] as Objekt];
  }
  return shuffled;
}

// settings.objekts.selectedIds narrows which discovered objekts are in
// rotation; empty means everything found is in rotation.
function activeObjekts(settings: Settings): Objekt[] {
  if (settings.objekts.selectedIds.length === 0) return allObjekts;
  const ids = new Set(settings.objekts.selectedIds);
  const filtered = allObjekts.filter((objekt) => ids.has(objekt.id));
  return filtered.length > 0 ? filtered : allObjekts;
}

export function getCurrentObjekt(): Objekt | null {
  const active = activeObjekts(getSettings());
  if (active.length === 0) return null;
  currentIndex = ((currentIndex % active.length) + active.length) % active.length;
  return active[currentIndex] ?? null;
}

export function getActiveCount(): number {
  return activeObjekts(getSettings()).length;
}

// M4 collection browser: the full discovered list, unfiltered by
// selectedIds (that filter is what the browser itself edits).
export function getAllObjekts(): Objekt[] {
  return allObjekts;
}

// Re-broadcasts the current objekt without re-fetching — for settings
// changes that only affect which of the already-loaded objekts are in
// rotation (selectedIds), not the objekt source itself.
export function refreshCurrentObjekt(): void {
  currentIndex = 0;
  broadcastCurrent();
}

export function getSourceStatus(): SourceStatus {
  return sourceStatus;
}

export function getCollectionCachedAt(): number | null {
  return listCachedAt;
}

// Fills allObjekts from the last-known-good cache without touching the
// network. Called before the pet window even exists (see index.ts) so the
// renderer's very first getCurrentObjekt() IPC call — which reads
// allObjekts directly, synchronously — can already answer with the real
// card instead of the dev placeholder, rather than racing the live
// Cosmo/Abstract fetch (which can take a few seconds). A no-op if there's
// no account configured yet or nothing cached for it — in that case there
// really is nothing to show yet, and the placeholder is correct.
export async function primeFromCache(settings: Settings): Promise<void> {
  const { cosmoAccount } = settings.objekts;
  if (!cosmoAccount) return;
  const cached = await peekCachedObjekts(cosmoAccount.address);
  if (cached && cached.length > 0) {
    allObjekts = shuffleObjekts(cached);
    sourceStatus = 'remote-cached';
    listCachedAt = await getListCachedAt(cosmoAccount.address);
  }
}

export async function reloadObjekts(targetWin: BrowserWindow): Promise<void> {
  win = targetWin;
  const settings = getSettings();

  await primeFromCache(settings);
  if (allObjekts.length > 0) {
    currentIndex = 0;
    broadcastCurrent();
  }

  const resolved = await resolveObjekts(settings);
  allObjekts = shuffleObjekts(resolved.objekts);
  sourceStatus = resolved.status;
  if (settings.objekts.cosmoAccount) {
    listCachedAt = await getListCachedAt(settings.objekts.cosmoAccount.address);
  }
  currentIndex = 0;
  broadcastCurrent();
}

export function nextObjekt(): void {
  const active = activeObjekts(getSettings());
  if (active.length === 0) return;
  currentIndex = (currentIndex + 1) % active.length;
  broadcastCurrent();
}

// §8 Shuffle: swap every N minutes when more than one objekt is in
// rotation, "never" (null) allowed. Broadcast on a separate channel from
// manual "Next objekt" — the renderer plays the fast spin-through
// transition only for this one, never a crossfade, and never for the
// instant swap a manual click still gets.
export function configureShuffle(minutes: number | null): void {
  if (shuffleTimer !== null) {
    clearInterval(shuffleTimer);
    shuffleTimer = null;
  }
  if (minutes === null) return;
  shuffleTimer = setInterval(shuffleTick, minutes * 60 * 1000);
}

function shuffleTick(): void {
  const active = activeObjekts(getSettings());
  if (active.length <= 1 || win === null) return;
  currentIndex = (currentIndex + 1) % active.length;
  win.webContents.send(IpcChannel.ObjektShuffle, getCurrentObjekt());
}

function broadcastCurrent(): void {
  win?.webContents.send(IpcChannel.ObjektCurrent, getCurrentObjekt());
}
