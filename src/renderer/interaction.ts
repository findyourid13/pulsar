import { SPIN_PERIOD_CLAMP, WHEEL_STEP_SECONDS } from './card/geometry';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// interactiveElement receives real pointer events (the 3D-rotated card);
// transformElement is the flat, pointer-events:none wrapper the scale
// feedback is applied to (see card.css .card-press).
export function startPressFeedback(interactiveElement: HTMLElement, transformElement: HTMLElement): () => void {
  const onDown = () => transformElement.classList.add('is-pressed');
  const onUp = () => transformElement.classList.remove('is-pressed');

  interactiveElement.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);

  return () => {
    interactiveElement.removeEventListener('mousedown', onDown);
    window.removeEventListener('mouseup', onUp);
  };
}

const CLICK_MAX_MOVEMENT_PX = 6;
const CLICK_MAX_DURATION_MS = 500;

// §6/§8: a single left-button mousedown→mouseup gesture on the card is
// either a click (flip to the opposite face) or a drag (move the window) —
// decided by how far the pointer actually travels, not by a modifier key.
// Cmd/Ctrl-gated drag is deprecated: requiring a modifier for the single
// most common gesture fought the "always-on-top desktop pet" framing more
// than it protected click-to-flip, which already tolerates
// CLICK_MAX_MOVEMENT_PX of jitter before it stops counting as a click.
// dragElement should be the interactive card element (see
// startPressFeedback), not the flat pointer-events:none wrapper — dragging
// must only start on the card, never on empty window space.
export function startCardPointerGestures(
  dragElement: HTMLElement,
  handlers: { onFlip: () => void; onDragMove: (dx: number, dy: number) => void; onDragEnd: () => void },
): () => void {
  let down = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let lastScreenX = 0;
  let lastScreenY = 0;

  function onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    down = true;
    dragging = false;
    startX = event.clientX;
    startY = event.clientY;
    startTime = performance.now();
    lastScreenX = event.screenX;
    lastScreenY = event.screenY;
  }

  function onMouseMove(event: MouseEvent): void {
    if (!down) return;
    if (!dragging) {
      const movement = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (movement <= CLICK_MAX_MOVEMENT_PX) return;
      dragging = true;
    }
    const dx = event.screenX - lastScreenX;
    const dy = event.screenY - lastScreenY;
    lastScreenX = event.screenX;
    lastScreenY = event.screenY;
    handlers.onDragMove(dx, dy);
  }

  function onMouseUp(event: MouseEvent): void {
    if (!down) return;
    down = false;
    if (dragging) {
      dragging = false;
      handlers.onDragEnd();
      return;
    }
    const movement = Math.hypot(event.clientX - startX, event.clientY - startY);
    const duration = performance.now() - startTime;
    if (movement <= CLICK_MAX_MOVEMENT_PX && duration <= CLICK_MAX_DURATION_MS) {
      handlers.onFlip();
    }
  }

  dragElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return () => {
    dragElement.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

// §8: parallax reacts to proximity, not just exact hover, so it's driven by
// every window mousemove (always forwarded, see §6) rather than hit-report's
// precise-silhouette signal. onLeave resets the tilt once the pointer exits
// the window entirely — without it the last known position lingers forever
// since no more mousemove events fire outside the window.
export function startParallaxTracking(onMove: (clientX: number, clientY: number) => void, onLeave: () => void): () => void {
  function onMouseMove(event: MouseEvent): void {
    onMove(event.clientX, event.clientY);
  }
  function onMouseLeave(): void {
    onLeave();
  }
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseleave', onMouseLeave);
  return () => {
    window.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseleave', onMouseLeave);
  };
}

// §8: wheel over the card adjusts the spin period, clamped to 8–120s.
// Only fires while genuinely hovering the card, since click-through means
// wheel events reach the renderer exactly when hit-report says we're over it.
export function startWheelToSpeed(
  cardElement: HTMLElement,
  getPeriodSeconds: () => number,
  onChange: (periodSeconds: number) => void,
): () => void {
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const direction = event.deltaY > 0 ? 1 : -1;
    const next = clamp(getPeriodSeconds() + direction * WHEEL_STEP_SECONDS, SPIN_PERIOD_CLAMP.min, SPIN_PERIOD_CLAMP.max);
    onChange(next);
  }
  cardElement.addEventListener('wheel', onWheel, { passive: false });
  return () => cardElement.removeEventListener('wheel', onWheel);
}

// §8: right-click on the card shows a native context menu (built in main —
// see card-context-menu.ts) instead of Chromium's default one.
export function startCardContextMenu(cardElement: HTMLElement): () => void {
  function onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    window.pulsar.requestContextMenu();
  }
  cardElement.addEventListener('contextmenu', onContextMenu);
  return () => cardElement.removeEventListener('contextmenu', onContextMenu);
}
