const DEBOUNCE_MS = 40; // §6 — prevents flicker while the card's rotating edge is under the cursor

// hitTest answers "is (x, y) over the card's actual rendered silhouette
// right now?" — see card/handle.ts for why this can't be a fixed DOM query
// once the renderer might be a <canvas> (three.ts, M3+).
//
// onHoverChange also drives §8's hover-slow behavior — same debounced
// over/not-over signal click-through already needs, reused rather than
// duplicated.
//
// getAlwaysClickThrough is a hard on/off (§6): when it returns true, the
// card never counts as "over" for either purpose (capture or hover-slow) —
// clicks and hover pass through untouched, same as empty window space
// always has. Re-enable the card from the tray to interact with it again.
export function startHitReporting(
  hitTest: (clientX: number, clientY: number) => boolean,
  onHoverChange?: (over: boolean) => void,
  getAlwaysClickThrough?: () => boolean,
): () => void {
  let isOverCard = false;
  let pendingState: boolean | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function commit(over: boolean): void {
    if (over === isOverCard) return;
    isOverCard = over;
    window.pulsar.reportPointerOverCard(over);
    onHoverChange?.(over);
  }

  function onMouseMove(event: MouseEvent): void {
    const over = hitTest(event.clientX, event.clientY) && !(getAlwaysClickThrough?.() ?? false);

    if (over === isOverCard) {
      pendingState = null;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    if (pendingState === over) return;
    pendingState = over;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      commit(over);
    }, DEBOUNCE_MS);
  }

  window.addEventListener('mousemove', onMouseMove);
  return () => window.removeEventListener('mousemove', onMouseMove);
}
