import type { Objekt } from '@shared/types';
import devFront from './assets/dev-front.svg';
import devBack from './assets/dev-back.svg';
import { DEFAULT_SPIN_PERIOD_SECONDS } from './card/geometry';
import { mount } from './card/three';
import { startHitReporting } from './hit-report';
import {
  startCardContextMenu,
  startCardPointerGestures,
  startParallaxTracking,
  startPressFeedback,
  startWheelToSpeed,
} from './interaction';

// Fallback for when no Cosmo account is connected yet (or the fetch hasn't
// resolved). These are synthetic placeholder SVGs, not real objekt artwork
// (see .gitignore — MODHAUS's art must never be committed, per §1).
const devObjekt: Objekt = {
  id: 'dev-placeholder',
  frontImageUrl: devFront,
  backImageUrl: devBack,
  backgroundColor: '#1a1a2e',
  source: 'local',
};

const root = document.getElementById('card-root');
if (root === null) {
  throw new Error('missing #card-root mount point');
}

void window.pulsar.getCurrentObjekt().then((objekt) => {
  const card = mount(root, objekt ?? devObjekt);
  startPressFeedback(card.cardElement, card.pressElement);
  startCardPointerGestures(card.cardElement, {
    onFlip: () => card.flip(),
    onDragMove: (dx, dy) => window.pulsar.dragWindow(dx, dy),
    onDragEnd: () => window.pulsar.endDragWindow(),
  });
  startParallaxTracking(
    (x, y) => card.setPointer(x, y),
    () => card.clearPointer(),
  );
  let alwaysClickThrough = false;
  startHitReporting(card.hitTest, (over) => card.setHovering(over), () => alwaysClickThrough);
  startCardContextMenu(card.cardElement);

  window.pulsar.onObjektCurrent((next) => {
    card.setObjekt(next ?? devObjekt);
  });
  window.pulsar.onObjektShuffle((next) => {
    if (next) card.shuffleTo(next);
  });
  window.pulsar.onCardFace((face) => card.setFace(face));

  // §13: prefers-reduced-motion drops idle bob/parallax and floors the spin
  // period, live — reacts if the user toggles the OS setting while running.
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  card.setReducedMotion(reducedMotionQuery.matches);
  reducedMotionQuery.addEventListener('change', (event) => card.setReducedMotion(event.matches));

  let currentPeriodSeconds = DEFAULT_SPIN_PERIOD_SECONDS;
  let persistPeriodTimer: ReturnType<typeof setTimeout> | null = null;

  startWheelToSpeed(
    card.cardElement,
    () => currentPeriodSeconds,
    (periodSeconds) => {
      currentPeriodSeconds = periodSeconds;
      card.setSpeed(periodSeconds);
      if (persistPeriodTimer !== null) clearTimeout(persistPeriodTimer);
      persistPeriodTimer = setTimeout(() => {
        void window.pulsar.patchSettings({ spin: { periodSeconds } });
      }, 200);
    },
  );

  void window.pulsar.getSettings().then((settings) => {
    card.setPaused(settings.spin.paused);
    card.setDirection(settings.spin.direction);
    currentPeriodSeconds = settings.spin.periodSeconds;
    card.setSpeed(currentPeriodSeconds);
    alwaysClickThrough = settings.system.alwaysClickThrough;
  });
  window.pulsar.onSettingsChanged((settings) => {
    card.setPaused(settings.spin.paused);
    card.setDirection(settings.spin.direction);
    currentPeriodSeconds = settings.spin.periodSeconds;
    card.setSpeed(currentPeriodSeconds);
    alwaysClickThrough = settings.system.alwaysClickThrough;
  });
});
