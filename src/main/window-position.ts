import { screen, type BrowserWindow, type Rectangle } from 'electron';
import type { Settings } from '@shared/types';
import { patchSettings } from './settings';

const SNAP_THRESHOLD_PX = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Takes the display's full `bounds`, not `workArea` — the card sits at
// 'screen-saver' window level (see window.ts), which already renders above
// the Dock and menu bar, so there's no reason to reserve their strip of
// screen as off-limits. Only the physical display edge is a real limit.
function clampToArea(x: number, y: number, width: number, height: number, area: Rectangle) {
  const maxX = Math.max(area.x, area.x + area.width - width);
  const maxY = Math.max(area.y, area.y + area.height - height);
  return {
    x: clamp(x, area.x, maxX),
    y: clamp(y, area.y, maxY),
  };
}

// The Dock and menu bar keep OS-level input priority over their own strip
// of screen regardless of window z-order (the same reason nothing can click
// through the real menu bar) — so a drag's cursor can physically reach the
// `workArea` edge but never actually cross into their reserved strip, no
// matter how high the card's window level is. Snapping checks proximity to
// that reachable `workArea` edge, but the snapped-to position is the true
// `bounds` edge — so getting as close as a drag can physically get still
// carries the card the rest of the way, flush over the Dock/menu bar.
function snapToEdges(x: number, y: number, width: number, height: number, bounds: Rectangle, workArea: Rectangle) {
  let snappedX = x;
  let snappedY = y;
  const reachLeft = workArea.x;
  const reachRight = workArea.x + workArea.width - width;
  const reachTop = workArea.y;
  const reachBottom = workArea.y + workArea.height - height;

  if (Math.abs(x - reachLeft) <= SNAP_THRESHOLD_PX) snappedX = bounds.x;
  else if (Math.abs(x - reachRight) <= SNAP_THRESHOLD_PX) snappedX = bounds.x + bounds.width - width;

  if (Math.abs(y - reachTop) <= SNAP_THRESHOLD_PX) snappedY = bounds.y;
  else if (Math.abs(y - reachBottom) <= SNAP_THRESHOLD_PX) snappedY = bounds.y + bounds.height - height;

  return { x: snappedX, y: snappedY };
}

// Applies the last saved position for the display it was on, if that
// display still exists, clamping in case its resolution/work area changed.
export function restoreWindowPosition(win: BrowserWindow, settings: Settings): void {
  const displayId = settings.window.lastDisplayId;
  if (displayId === null) return;
  const saved = settings.window.positions[displayId];
  if (saved === undefined) return;

  const display = screen.getAllDisplays().find((d) => d.id.toString() === displayId);
  if (display === undefined) return;

  const [width, height] = win.getSize();
  const { x, y } = clampToArea(saved.x, saved.y, width, height, display.bounds);
  win.setPosition(Math.round(x), Math.round(y));
}

// §8: snap to display edges within 20px, persist per display. Also clamps
// back fully on-screen — a drag can otherwise leave the card stranded
// mostly or entirely off the display, with no edge close enough to snap to.
//
// Resolves the display fresh from the window's current bounds every time —
// deliberately, since a drag that ends on a different monitor than it
// started on must land there. An earlier version locked this to whichever
// display the drag *started* on, meant to avoid a rare flip at a shared
// boundary, but that locked every cross-monitor drag back into its
// starting display, which broke the much more common case of dragging the
// card onto a different monitor at all.
export function persistWindowPosition(win: BrowserWindow): void {
  const display = screen.getDisplayMatching(win.getBounds());
  const [width, height] = win.getSize();
  const [x, y] = win.getPosition();
  const clamped = clampToArea(x, y, width, height, display.bounds);
  const snapped = snapToEdges(clamped.x, clamped.y, width, height, display.bounds, display.workArea);
  if (snapped.x !== x || snapped.y !== y) {
    win.setPosition(Math.round(snapped.x), Math.round(snapped.y));
  }

  const id = display.id.toString();
  patchSettings({
    window: {
      lastDisplayId: id,
      positions: { [id]: { x: snapped.x, y: snapped.y } },
    },
  });
}

// Recovery action for a lost/stranded card: always centers on the primary
// display, not "wherever it currently is" — if the card were somewhere
// findable it wouldn't need recovering.
export function centerWindowOnPrimaryDisplay(win: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const [width, height] = win.getSize();
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2);
  const y = Math.round(display.workArea.y + (display.workArea.height - height) / 2);
  win.setPosition(x, y);

  const id = display.id.toString();
  patchSettings({
    window: {
      lastDisplayId: id,
      positions: { [id]: { x, y } },
    },
  });
}

// Locking the screen — especially with an external monitor attached — can
// fire a real but transient display-removed/display-metrics-changed: the
// monitor goes into standby for the lock screen and comes back on unlock.
// Reacting to that instantly permanently relocates the card for what's
// really just a blip, with nothing to ever move it back once the "removed"
// display reappears (this was a real reported bug: the card jumping to
// another monitor after a lock/unlock cycle). Debouncing doesn't need to
// explicitly detect "it came back" — reclamp() always re-resolves the
// display from live state when it finally runs, so if the monitor's back
// by then, the window's already-valid position needs no clamping at all.
const RECLAMP_DEBOUNCE_MS = 3000;

// §11: unplugging a monitor must not strand the pet off-screen.
export function registerDisplayReclamp(win: BrowserWindow): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function reclamp(): void {
    const display = screen.getDisplayMatching(win.getBounds());
    const [width, height] = win.getSize();
    const [x, y] = win.getPosition();
    const clamped = clampToArea(x, y, width, height, display.bounds);
    if (clamped.x !== x || clamped.y !== y) {
      win.setPosition(Math.round(clamped.x), Math.round(clamped.y));
    }
  }

  function scheduleReclamp(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(reclamp, RECLAMP_DEBOUNCE_MS);
  }

  screen.on('display-removed', scheduleReclamp);
  screen.on('display-metrics-changed', scheduleReclamp);

  return () => {
    if (timer !== null) clearTimeout(timer);
    screen.removeListener('display-removed', scheduleReclamp);
    screen.removeListener('display-metrics-changed', scheduleReclamp);
  };
}
