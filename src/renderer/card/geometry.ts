// §5/§7/§8 — shared by both renderer implementations and the hit reporter.

export const CARD_ASPECT_RATIO = 5 / 8; // width:height, standard objekt proportions
export const DEFAULT_SPIN_PERIOD_SECONDS = 32;
export const SPIN_PERIOD_CLAMP = { min: 8, max: 120 } as const;
export const CARD_SELECTOR = '.card';

// §8 interactions
export const HOVER_SLOW_FACTOR = 0.5; // spin decelerates to ~50% speed on hover
export const HOVER_SPEED_EASE = 0.06; // per-frame lerp factor toward the target speed
export const MAX_TILT_DEG = 6; // parallax rotateX clamp
export const TILT_Z_FACTOR = 0.35; // rotateZ is a "slight" fraction of the X tilt
export const PARALLAX_RADIUS_MULTIPLIER = 1.5; // proximity radius, as a multiple of half the card's size
export const PARALLAX_EASE = 0.15; // per-frame lerp factor toward the target tilt
export const FLIP_SETTLE_MS = 400; // duration of the click-to-flip settle animation
export const IDLE_BOB_AMPLITUDE_PX = 6;
export const IDLE_BOB_PERIOD_SECONDS = 7;
export const WHEEL_STEP_SECONDS = 2; // period change per wheel notch

// §13: prefers-reduced-motion drops idle bob and parallax, and floors the
// spin period — never stops the rotation entirely, just calms it.
export const REDUCED_MOTION_PERIOD_FLOOR_SECONDS = 45;

// §8 Shuffle: "a fast spin-through: accelerate to edge-on, swap textures at
// 90°, decelerate out." Two phases — an accelerating approach to the
// nearest edge-on angle, then a decelerating recede through the next 90°
// once the new objekt's textures are in place.
export const SHUFFLE_APPROACH_MS = 220;
export const SHUFFLE_RECEDE_MS = 380;
