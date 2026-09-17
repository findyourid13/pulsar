import type { CardFace, Objekt } from '@shared/types';

// §7: the public interface both renderer implementations (css3d.ts for
// M0–M2, three.ts for M3+) satisfy, so the swap between them is contained
// to one module — everything else in the renderer (interaction.ts,
// hit-report.ts, main.ts) is written against this shape only.
export type CardHandle = {
  cardElement: HTMLElement; // the interactive element — target pointer/drag/click listeners here
  pressElement: HTMLElement; // flat transform anchor for press-scale feedback; never hit-tested
  setSpeed(periodSeconds: number): void;
  setPaused(paused: boolean): void;
  setHovering(hovering: boolean): void;
  setPointer(clientX: number, clientY: number): void;
  clearPointer(): void;
  setReducedMotion(reduced: boolean): void;
  setDirection(direction: 'cw' | 'ccw'): void;
  setObjekt(objekt: Objekt): void;
  // §8 Shuffle: swap to `objekt` via the fast spin-through transition
  // (accelerate to edge-on, swap textures, decelerate out) rather than
  // setObjekt's instant cut — used only for the timed automatic shuffle,
  // never for a manual "Next objekt".
  shuffleTo(objekt: Objekt): void;
  flip(): void;
  // Right-click context menu's "Face front"/"Face back" — settle to
  // whichever face is requested via the shortest rotation, not a toggle.
  setFace(face: CardFace): void;
  destroy(): void;
  // §6: is (clientX, clientY) over the card's actual rendered silhouette
  // right now? css3d.ts answers this with document.elementFromPoint, which
  // does the browser's own perspective math for a CSS-3D-transformed
  // element. three.ts answers it with a raycast against the mesh, since a
  // <canvas> is one opaque rectangle to elementFromPoint regardless of what
  // 3D shape is drawn inside it.
  hitTest(clientX: number, clientY: number): boolean;
};
