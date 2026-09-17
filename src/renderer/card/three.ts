import * as THREE from 'three';
import { artistDisplayName, objektMemberLabel } from '@shared/objekt-catalog';
import type { Objekt } from '@shared/types';
import {
  CARD_ASPECT_RATIO,
  DEFAULT_SPIN_PERIOD_SECONDS,
  FLIP_SETTLE_MS,
  HOVER_SLOW_FACTOR,
  HOVER_SPEED_EASE,
  IDLE_BOB_AMPLITUDE_PX,
  IDLE_BOB_PERIOD_SECONDS,
  MAX_TILT_DEG,
  PARALLAX_EASE,
  PARALLAX_RADIUS_MULTIPLIER,
  REDUCED_MOTION_PERIOD_FLOOR_SECONDS,
  SHUFFLE_APPROACH_MS,
  SHUFFLE_RECEDE_MS,
  TILT_Z_FACTOR,
} from './geometry';
import type { CardHandle } from './handle';
import './card.css';

// §9: real per-artist card-back template PNGs (dev fixtures only — never
// committed, see .gitignore). import.meta.glob rather than a static import
// so a checkout without them still builds; buildInfoBackTexture falls back
// to a hand-drawn approximation for any artist with no matching file.
const backTemplateUrls = import.meta.glob('../assets/*-back.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// Maps each template's filename prefix to objekt-catalog.ts's own artist
// display name spelling.
const BACK_TEMPLATE_ARTIST_KEYS: Record<string, string> = {
  idntt: 'idntt',
  triples: 'tripleS',
  artms: 'ARTMS',
};

const backTemplateImages: Partial<Record<string, HTMLImageElement>> = {};
for (const [path, url] of Object.entries(backTemplateUrls)) {
  const filename = path.split('/').pop() ?? '';
  const artistKey = BACK_TEMPLATE_ARTIST_KEYS[filename.replace(/-back\.png$/, '')];
  if (!artistKey) continue;
  const img = new Image();
  img.src = url;
  backTemplateImages[artistKey] = img;
}

// §7: BoxGeometry gives the card real depth instead of the cut CSS
// edge-element's hand-rolled side strips — kept tiny (not 0, to stay a
// valid box) since the edge faces are invisible anyway (see edgeMaterial).
const CARD_DEPTH_PX = 0.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// §8 Shuffle: accelerate into the swap, decelerate out of it.
function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// The card's own on-screen box within its window (the canvas itself fills
// the full container — see resize() below). The margin this leaves only
// needs to cover idle bob (±6px, geometry.ts) and the tiny corner swing
// from parallax's ≤6° tilt — a few px each, nothing like the 30% margin an
// earlier version reserved (a leftover from the old CSS sizing formula,
// `min(70%, calc(70vh * 5/8))`). That much unused margin meant the card
// could never actually reach flush against a screen edge even once the
// window itself could — see window-position.ts's Dock-overlap notes.
function cardTargetSize(containerWidth: number, containerHeight: number): { width: number; height: number } {
  const width = Math.min(containerWidth * 0.9, containerHeight * 0.9 * CARD_ASPECT_RATIO);
  return { width, height: width / CARD_ASPECT_RATIO };
}

function pickTextColor(backgroundColor: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(backgroundColor)?.[1];
  if (!hex) return '#f5f5f5';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#171717' : '#f5f5f5';
}

// Real Cosmo objekts have a real back image, but the v3 metadata fallback
// (used whenever v1 is unavailable — see remote-source.ts, and it has been
// observed down as a whole service, not just per-token) can't provide one.
// Hand-formatted to resemble the real card back's ID-badge layout (a solid
// rounded field in the objekt's own background color; artist wordmark
// top-left as plain text — no attempt at reproducing each group's actual
// logo glyphs; member/unit name printed vertically along the right edge;
// NAME/TYPE/SEASON fields as a ruled label-over-value stack) using only the
// member/season/class/collectionNo data Cosmo did give us. No signature —
// that's the member's own real handwriting, not something to fabricate.
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  corners: { tl: number; tr: number; br: number; bl: number },
): void {
  ctx.beginPath();
  ctx.moveTo(x + corners.tl, y);
  ctx.lineTo(x + width - corners.tr, y);
  ctx.arcTo(x + width, y, x + width, y + corners.tr, corners.tr);
  ctx.lineTo(x + width, y + height - corners.br);
  ctx.arcTo(x + width, y + height, x + width - corners.br, y + height, corners.br);
  ctx.lineTo(x + corners.bl, y + height);
  ctx.arcTo(x, y + height, x, y + height - corners.bl, corners.bl);
  ctx.lineTo(x, y + corners.tl);
  ctx.arcTo(x, y, x + corners.tl, y, corners.tl);
  ctx.closePath();
}

// Season strings in the catalog are always a PascalCase word immediately
// followed by a 2-digit year with no separator ("Winter26", "Atom01" — see
// objekt-catalog.ts's ARTIST_SEASONS). Splitting them lets the year print
// outlined rather than filled, matching the real card's treatment.
const SEASON_PATTERN = /^([A-Za-z]+)(\d+)$/;

function drawSeasonValue(
  ctx: CanvasRenderingContext2D,
  season: string,
  x: number,
  y: number,
  color: string,
  fontPx: number,
): void {
  const match = SEASON_PATTERN.exec(season);
  ctx.font = `700 ${fontPx}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'left';
  if (!match) {
    ctx.fillStyle = color;
    ctx.fillText(season, x, y);
    return;
  }
  const [, word, year] = match;
  ctx.fillStyle = color;
  ctx.fillText(word ?? '', x, y);
  const wordWidth = ctx.measureText(word ?? '').width;
  ctx.strokeStyle = color;
  ctx.lineWidth = fontPx / 32;
  // ~7px measured at fontPx=114 — snug, not the wide gap an earlier version
  // (fontPx * 0.3) left between the word and the outlined year.
  ctx.strokeText(year ?? '', x + wordWidth + fontPx * 0.065, y);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return { r: 0, g: 0, b: 0 };
  const value = match[1] ?? '000000';
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

// The template PNGs are duotone: their own neutral background (#F2F2F2, the
// most common pixel) and black ink (logo/rules/labels), plus one untouched
// pure-white region (the signature block's right panel — confirmed real on
// every color variant by sampling idntt-back.png's actual pixels, and
// visible unchanged across differently-colored real cards). Remaps the
// duotone by luminance in place; near-white pixels are left alone so that
// panel stays white regardless of the objekt's own color.
function recolorBackTemplate(img: HTMLImageElement, backgroundColor: string, textColor: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const bg = hexToRgb(backgroundColor);
  const ink = hexToRgb(textColor);
  for (let i = 0; i < data.length; i += 4) {
    // Not just alpha === 0: the template's anti-aliased rounded-corner
    // boundary is a ring of *partial*-alpha pixels whose RGB can dip just
    // under the white-panel threshold below (measured directly on
    // idntt-back.png, e.g. (245,255,245) at alpha 3-70) — those fell
    // through to the duotone remap and got recolored toward the objekt's
    // own background/text color while keeping their original low alpha,
    // which read as a faint dark fringe tracing the rounded edge on
    // darker-paletted objekts. Only fully opaque pixels are the template's
    // real duotone content; anything else is that boundary ring, whose
    // original (correct, already white-matched) color must stay untouched.
    if (data[i + 3] !== 255) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const avg = (r + g + b) / 3;
    if (avg >= 250) continue; // the signature block's white panel — untouched
    const t = clamp(avg / 242, 0, 1); // 0 = ink black, 1 = template's own #F2F2F2
    data[i] = ink.r + (bg.r - ink.r) * t;
    data[i + 1] = ink.g + (bg.g - ink.g) * t;
    data[i + 2] = ink.b + (bg.b - ink.b) * t;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Pixel positions measured directly from idntt-back.png (1083×1673) — all
// three group templates share these dimensions and this field/box layout,
// differing only in their own logo art and NAME/CLASS-or-TYPE/SEASON labels
// (already baked into each template, so nothing to position per-artist here
// beyond the vertical member name, which no template bakes in).
const TEMPLATE_CONTENT_LEFT = 59;
const TEMPLATE_RULE_YS = [358.5, 578.5, 798] as const; // NAME, TYPE/CLASS, SEASON
const TEMPLATE_VNAME_X = 924;
const TEMPLATE_VNAME_Y = 152;
// Measured against a reference composite at this same 1083×1673 resolution:
// value glyphs (e.g. "Kotone") bbox to a 114px font, baseline sitting 177px
// below its rule; the vertical name to a much smaller 52px (was 84 — too
// big) with its column starting at y=152 (was 180).
const TEMPLATE_VALUE_FONT_PX = 114;
const TEMPLATE_VALUE_BASELINE_OFFSET = 177;
const TEMPLATE_VNAME_FONT_PX = 52;

function drawBackTemplateValues(ctx: CanvasRenderingContext2D, objekt: Objekt, textColor: string): void {
  // Only Unit objekts get the id/S-numbered pairing here — a single
  // member's own name shows plain ("YeJoon", not "id14 YeJoon"). The
  // numeric aliases are objekt.top's device for telling two same-name-
  // field members apart in a Unit pairing, not a general naming style.
  const nameText = objekt.class === 'Unit' ? objektMemberLabel(objekt) : (objekt.member ?? '');

  if (nameText) {
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = `700 ${TEMPLATE_VNAME_FONT_PX}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.translate(TEMPLATE_VNAME_X, TEMPLATE_VNAME_Y);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(nameText, 0, 0);
    ctx.restore();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const values: Array<string | undefined> = [nameText, objekt.class, objekt.season];
  TEMPLATE_RULE_YS.forEach((ruleY, i) => {
    const value = values[i];
    if (!value) return;
    const valueY = ruleY + TEMPLATE_VALUE_BASELINE_OFFSET;
    if (i === 2) {
      drawSeasonValue(ctx, value, TEMPLATE_CONTENT_LEFT, valueY, textColor, TEMPLATE_VALUE_FONT_PX);
      return;
    }
    ctx.fillStyle = textColor;
    ctx.font = `700 ${TEMPLATE_VALUE_FONT_PX}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText(value, TEMPLATE_CONTENT_LEFT, valueY);
  });
}

// Used only when no template PNG exists for the objekt's artist (see
// backTemplateImages) — a hand-drawn approximation of the same layout:
// white outer card, colored inset panel flush-left (rounded only on the
// right), ID-badge fields, and a blank signature block. Kept as a
// reasonable degrade path rather than deleted, since new artist groups
// could appear before a template's ever made for them.
function drawFallbackBack(ctx: CanvasRenderingContext2D, objekt: Objekt, background: string, textColor: string): void {
  const canvas = ctx.canvas;
  const outerRadius = canvas.width * 0.04;
  roundedRectPath(ctx, 0, 0, canvas.width, canvas.height, {
    tl: outerRadius,
    tr: outerRadius,
    br: outerRadius,
    bl: outerRadius,
  });
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const panelX = 0;
  const panelW = canvas.width * 0.91;
  const panelH = canvas.height * 0.88;
  const panelY = (canvas.height - panelH) / 2;
  const panelRadius = canvas.width * 0.035;
  roundedRectPath(ctx, panelX, panelY, panelW, panelH, { tl: 0, tr: panelRadius, br: panelRadius, bl: 0 });
  ctx.fillStyle = background;
  ctx.fill();

  const contentLeft = panelX + panelW * 0.13;
  const ruleRight = panelX + panelW * 0.88;
  const panelBottom = panelY + panelH;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const nameText = objekt.class === 'Unit' ? objektMemberLabel(objekt) : (objekt.member ?? '');

  if (nameText) {
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = '700 40px -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.translate(panelX + panelW * 0.87, panelY + 75);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(nameText, 0, 0);
    ctx.restore();
  }

  ctx.strokeStyle = textColor;
  ctx.lineWidth = 2;
  const fieldSpacing = 114;
  let y = panelY + 200;
  const fields: Array<[string, () => void]> = [
    [
      'NAME',
      () => {
        ctx.fillStyle = textColor;
        ctx.font = '700 42px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(nameText, contentLeft, y + 82);
      },
    ],
    [
      'TYPE',
      () => {
        ctx.fillStyle = textColor;
        ctx.font = '700 42px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(objekt.class ?? '', contentLeft, y + 82);
      },
    ],
    ['SEASON', () => objekt.season && drawSeasonValue(ctx, objekt.season, contentLeft, y + 82, textColor, 42)],
  ];

  for (const [label, drawValue] of fields) {
    ctx.beginPath();
    ctx.moveTo(contentLeft, y);
    ctx.lineTo(ruleRight, y);
    ctx.stroke();

    ctx.globalAlpha = 0.65;
    ctx.fillStyle = textColor;
    ctx.font = '500 20px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, contentLeft, y + 30);
    ctx.globalAlpha = 1;

    drawValue();
    y += fieldSpacing;
  }

  // Signature block, matching the real card's layout: a ruled box split
  // into two panels. Both left intentionally blank — the left one is the
  // member's own real signature, the right is whatever Cosmo puts there;
  // neither is something to fabricate. Wire in real assets here later.
  const boxHeight = 78;
  const boxWidth = ruleRight - contentLeft;
  const dividerX = contentLeft + boxWidth * 0.58;
  ctx.strokeRect(contentLeft, y, boxWidth, boxHeight);
  ctx.beginPath();
  ctx.moveTo(dividerX, y);
  ctx.lineTo(dividerX, y + boxHeight);
  ctx.stroke();

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = textColor;
  ctx.font = '400 15px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('℗&© MODHAUS. All Rights Reserved.', contentLeft, panelBottom - 28);
  ctx.globalAlpha = 1;
}

function buildInfoBackTexture(objekt: Objekt): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const background = objekt.backgroundColor ?? '#1a1a2e';
  const textColor = objekt.textColor || pickTextColor(background);
  const templateImg = backTemplateImages[artistDisplayName(objekt.artist)];

  function draw(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (templateImg && templateImg.complete && templateImg.naturalWidth > 0) {
      canvas.width = templateImg.naturalWidth;
      canvas.height = templateImg.naturalHeight;
      const recolored = recolorBackTemplate(templateImg, background, textColor);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(recolored, 0, 0);
      drawBackTemplateValues(ctx, objekt, textColor);
    } else {
      canvas.width = 500;
      canvas.height = 800;
      drawFallbackBack(ctx, objekt, background, textColor);
    }
  }

  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Mipmaps box-average neighboring texels' stored RGBA per channel,
  // ignoring alpha — a transparent-but-white-authored pixel right next to
  // real duotone ink still gets blended into lower mip levels at full
  // weight, producing a dark fringe right at the rounded edge. Invisible
  // face-on, where the base level is sampled ~1:1, but the renderer starts
  // pulling from those lower levels once the card's rotation minifies the
  // texture — which is exactly the "only visible past ~30°" symptom this
  // was reported as. Disabling mipmaps trades a little minification
  // aliasing (imperceptible for this flat, mostly solid-color content) for
  // not sampling those blended-toward-black levels at all.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  // The template image is preloaded eagerly but may not have finished
  // decoding yet on a very first paint — redraw onto the same canvas and
  // flag the texture dirty once it has, rather than being stuck on the
  // fallback for the rest of this objekt's lifetime.
  if (templateImg && !templateImg.complete) {
    templateImg.addEventListener(
      'load',
      () => {
        draw();
        texture.needsUpdate = true;
      },
      { once: true },
    );
  }

  return texture;
}

// objekt.top's own front overlay draws the collection number vertically
// along the right edge of the front photo, e.g. (from their real rendered
// SVG, viewBox 1083×1673):
//   <text x="1023.435" y="836.5" text-anchor="middle" dy=".33em"
//         font-size="65.6" transform="rotate(90 1023.435 836.5)">113Z</text>
// — a middle-anchored, vertically-centered label at ~94.5% across, rotated
// 90° clockwise about its own position (mirrors ctx.rotate's convention
// exactly, both being clockwise-positive in a Y-down space). Drawn as a
// separate transparent overlay layer rather than composited into the
// front photo itself, so it doesn't have to wait on the photo's own
// (async) load to appear.
// tripleS only — the numeric id text is that group's own S-number/id-number
// convention (see shared/member-aliases.ts); ARTMS and idntt objekts don't
// carry it on the front in objekt.top's own rendering.
function buildFrontOverlayTexture(objekt: Objekt): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (ctx && objekt.collectionNo && artistDisplayName(objekt.artist) === 'tripleS') {
    const x = canvas.width * 0.945;
    const y = canvas.height * 0.5;
    const fontSize = canvas.width * 0.061;

    ctx.fillStyle = objekt.textColor || pickTextColor(objekt.backgroundColor ?? '#1a1a2e');
    ctx.font = `500 ${fontSize}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(objekt.collectionNo, 0, 0);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type FlipMode = 'spinning' | 'settling' | 'shuffle-approach' | 'shuffle-recede';

const textureLoader = new THREE.TextureLoader();

function loadTexture(url: string): THREE.Texture {
  const texture = textureLoader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The four thin edge faces are invisible — every reference design here
// (objekt.top, the real objekt card template) is a flat card with no
// visible edge at all, not a physical object with a colored rim. Tinting
// them with the objekt's background color (an earlier version of this)
// read as a solid-color line flashing across the card as it passed
// edge-on during a normal spin, however thin CARD_DEPTH_PX was made — the
// fix is to not render them, not to keep shrinking them.
function edgeMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ visible: false });
}

// Unlit front/back faces — no environment map, iridescence, or sheen, and
// no lit shading at all, so the objekt artwork (and the synthesized info
// back's rounded color shape) renders at its exact authored colors rather
// than being dimmed/tinted by the scene lights. An earlier version used a
// lit MeshStandardMaterial with a holographic treatment on top (envMap +
// iridescence + sheen), but it stacked multiplicatively with the scene
// lights and was hard to tune to something that didn't wash the card out
// toward white — removed rather than fought with further.
// transparent: true so a texture's alpha channel is actually respected —
// both the front (real Cosmo art is a rounded shape on a transparent
// ground) and the synthesized back (see buildInfoBackTexture) rely on it.
function faceMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, transparent: true });
}

function frontTexture(objekt: Objekt): THREE.Texture {
  return loadTexture(objekt.frontImageUrl);
}

// Motion-class objekts (§9): frontVideoUrl is a locally-cached file, so
// there's no network/autoplay-policy reason for it not to play — muted
// autoplay of a same-origin, already-downloaded video is unrestricted. The
// element is never attached to the DOM — createFrontVideoTexture below reads
// its decoded frames into a canvas every render, rather than sampling it
// directly via THREE.VideoTexture, so this needs explicit per-frame wiring
// (see updateFrontVideoTexture in the render loop), unlike a plain
// VideoTexture which three.js would drive on its own.
function createFrontVideo(url: string): HTMLVideoElement {
  const video = document.createElement('video');
  // pulsar-objekt:// is a distinct origin from the renderer's own page
  // origin, so without this WebGL refuses to read pixel data from the
  // element at all — VideoTexture never uploads a frame and the face stays
  // solid black even though the video is genuinely playing. loadTexture's
  // THREE.TextureLoader sets this same 'anonymous' value on <img> by
  // default; a hand-built <video> element needs it set explicitly.
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  void video.play().catch(() => {});
  return video;
}

function disposeFrontVideo(video: HTMLVideoElement | null): void {
  if (!video) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
}

type FrontVideoTexture = {
  texture: THREE.CanvasTexture;
  update: () => void;
};

// Matches drawFallbackBack's outerRadius ratio — the real Cosmo front art
// already has this same rounded shape baked into its own PNG's alpha
// channel (see faceMaterial's comment), but a raw <video> element has no
// alpha at all, so feeding it straight into a VideoTexture renders as a
// hard-edged rectangle while every other face on the card is rounded.
// Drawing it into a clipped canvas each frame instead — rather than
// THREE.VideoTexture, which samples the element directly — gets the same
// rounded-rect shape (roundedRectPath) that the rest of the card uses.
const FRONT_VIDEO_CORNER_RATIO = 0.04;

// Fixed rather than sized from video.videoWidth/videoHeight once known:
// resizing a <canvas> already backing a live THREE.CanvasTexture — i.e.
// after it's had at least one frame uploaded to the GPU at its old size —
// hits a Chromium bug in its fast canvas-copy path (glCopySubTextureCHROMIUM
// "Offset overflows texture dimensions"), because the destination texture
// stays allocated at the pre-resize size while the source canvas has moved
// on. Drawing at a fixed size and letting drawImage do the scaling avoids
// ever resizing the canvas after creation, so the GPU texture's dimensions
// never change out from under it. CARD_ASPECT_RATIO matches the card's real
// proportions, so a video authored at that aspect (the norm for a card face)
// isn't stretched.
const FRONT_VIDEO_CANVAS_WIDTH = 1080;
const FRONT_VIDEO_CANVAS_HEIGHT = Math.round(FRONT_VIDEO_CANVAS_WIDTH / CARD_ASPECT_RATIO);

function createFrontVideoTexture(video: HTMLVideoElement): FrontVideoTexture {
  const canvas = document.createElement('canvas');
  canvas.width = FRONT_VIDEO_CANVAS_WIDTH;
  canvas.height = FRONT_VIDEO_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  function update(): void {
    if (!ctx || video.videoWidth === 0 || video.readyState < video.HAVE_CURRENT_DATA) return;
    const radius = canvas.width * FRONT_VIDEO_CORNER_RATIO;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw full-bleed first, then cut the alpha with destination-in — not
    // clip()-then-draw. clip() leaves the fully-transparent corner pixels
    // at canvas's default (0,0,0,0): real video color everywhere would
    // still get GPU bilinear-filtered against a *black* neighbor right at
    // the anti-aliased curve boundary, which is what caused a visible thin
    // black line tracing the rounded edge even though alpha correctly hit
    // zero there. Drawing the video across the whole canvas first means
    // every pixel, including the ones about to be masked away, already has
    // real video color — the boundary then blends color-vs-same-color,
    // just fading alpha, with nothing to darken toward.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    roundedRectPath(ctx, 0, 0, canvas.width, canvas.height, { tl: radius, tr: radius, br: radius, bl: radius });
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    texture.needsUpdate = true;
  }

  return { texture, update };
}

// See buildInfoBackTexture. A duplicated front/back URL on a *remote*
// objekt is remote-source's signal that there was no real back image to
// cache. Gated on source === 'remote' so the dev placeholder (which
// intentionally has distinct front/back SVGs anyway) is never affected.
function backTexture(objekt: Objekt): THREE.Texture {
  const missingBackArt = objekt.source === 'remote' && objekt.backImageUrl === objekt.frontImageUrl;
  return missingBackArt ? buildInfoBackTexture(objekt) : loadTexture(objekt.backImageUrl);
}

// §7 M3+: Three.js. Keeps the mount/setSpeed/flip/destroy slice of the
// shared interface (card/handle.ts) so this swap from css3d.ts is
// contained to this module.
export function mount(container: HTMLElement, objekt: Objekt): CardHandle {
  const scene = document.createElement('div');
  scene.className = 'card-scene';

  const press = document.createElement('div');
  press.className = 'card-press';

  const canvas = document.createElement('canvas');
  canvas.className = 'card';

  press.append(canvas);
  scene.append(press);
  container.append(scene);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const threeScene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 2000);
  camera.position.set(0, 0, 500);
  camera.lookAt(0, 0, 0);

  // No lights — front/back are unlit MeshBasicMaterial (render at their
  // exact authored colors) and the edge faces are invisible, so nothing
  // in the scene responds to lighting at all.

  let frontVideoEl: HTMLVideoElement | null = null;
  let updateFrontVideoTexture: (() => void) | null = null;

  function createFrontMaterial(forObjekt: Objekt): THREE.MeshBasicMaterial {
    if (forObjekt.frontVideoUrl) {
      frontVideoEl = createFrontVideo(forObjekt.frontVideoUrl);
      const { texture, update } = createFrontVideoTexture(frontVideoEl);
      updateFrontVideoTexture = update;
      return faceMaterial(texture);
    }
    frontVideoEl = null;
    updateFrontVideoTexture = null;
    return faceMaterial(frontTexture(forObjekt));
  }

  let front = createFrontMaterial(objekt);
  let back = faceMaterial(backTexture(objekt));
  // Shared for the mesh's whole lifetime — edgeMaterial() takes no
  // per-objekt input, so there's nothing to recreate on an objekt change.
  const edge = edgeMaterial();

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // BoxGeometry material order: [+x, -x, +y, -y, +z(front), -z(back)].
  const mesh = new THREE.Mesh(geometry, [edge, edge, edge, edge, front, back]);
  threeScene.add(mesh);

  // Collection-number overlay: a plane coincident with the box's own front
  // face (same local z=0.5, same 1×1 unit sizing so it inherits the box's
  // x/y scale automatically as a child). polygonOffset pushes it in front
  // in the depth buffer without needing a manual epsilon — CARD_DEPTH_PX
  // is too tiny for one to survive being multiplied by mesh.scale.z anyway.
  // PlaneGeometry's default single-sided front face (+z) means this is
  // naturally invisible once the box has turned to show its back, with no
  // extra logic needed.
  let overlayTexture = buildFrontOverlayTexture(objekt);
  const overlayMaterial = new THREE.MeshBasicMaterial({
    map: overlayTexture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), overlayMaterial);
  overlay.position.z = 0.5;
  mesh.add(overlay);

  const raycaster = new THREE.Raycaster();

  function disposeFaceMaterials(): void {
    front.map?.dispose();
    front.dispose();
    back.map?.dispose();
    back.dispose();
    disposeFrontVideo(frontVideoEl);
    frontVideoEl = null;
    updateFrontVideoTexture = null;
  }

  function applyObjekt(newObjekt: Objekt): void {
    disposeFaceMaterials();
    front = createFrontMaterial(newObjekt);
    back = faceMaterial(backTexture(newObjekt));
    mesh.material = [edge, edge, edge, edge, front, back];
    overlayTexture.dispose();
    overlayTexture = buildFrontOverlayTexture(newObjekt);
    overlayMaterial.map = overlayTexture;
    overlayMaterial.needsUpdate = true;
  }

  // The canvas (and so the WebGL buffer resolution and camera frustum) is
  // sized to the full container, not just the card's own box — mirroring
  // the margin the CSS-3D version always had around the card for the idle
  // bob and parallax tilt to move within. Fitting the frustum exactly to
  // the card's box instead (an earlier version of this code did) left zero
  // headroom, so the bob's ±6px vertical motion clipped the top/bottom of
  // the card against the frustum edge every cycle.
  let cardWidthPx = 0;
  let cardHeightPx = 0;

  function resize(): void {
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return;

    renderer.setSize(width, height, false);
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();

    const target = cardTargetSize(width, height);
    cardWidthPx = target.width;
    cardHeightPx = target.height;
    mesh.scale.set(cardWidthPx, cardHeightPx, CARD_DEPTH_PX);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  let periodSeconds = DEFAULT_SPIN_PERIOD_SECONDS;
  let paused = false;
  let hovering = false;
  let reducedMotion = false;
  let direction = 1;
  let speedFactor = 1;
  let angle = 0;
  let tiltX = 0;
  let tiltZ = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerActive = false;

  let flipMode: FlipMode = 'spinning';
  let settleStart = 0;
  let settleFrom = 0;
  let settleTo = 0;
  let pendingShuffleObjekt: Objekt | null = null;

  let lastFrameTime = performance.now();
  let rafHandle = requestAnimationFrame(frame);

  function frame(now: number): void {
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    const targetSpeedFactor = hovering ? HOVER_SLOW_FACTOR : 1;
    speedFactor += (targetSpeedFactor - speedFactor) * HOVER_SPEED_EASE;

    if (flipMode === 'spinning') {
      if (!paused) {
        const effectivePeriod = reducedMotion
          ? Math.max(periodSeconds, REDUCED_MOTION_PERIOD_FLOOR_SECONDS)
          : periodSeconds;
        angle += (360 / effectivePeriod) * speedFactor * dt * direction;
      }
    } else if (flipMode === 'settling') {
      const t = Math.min(1, (now - settleStart) / FLIP_SETTLE_MS);
      angle = settleFrom + (settleTo - settleFrom) * easeInOutCubic(t);
      if (t >= 1) {
        flipMode = 'spinning';
        angle = settleTo;
      }
    } else if (flipMode === 'shuffle-approach') {
      const t = Math.min(1, (now - settleStart) / SHUFFLE_APPROACH_MS);
      angle = settleFrom + (settleTo - settleFrom) * easeInCubic(t);
      if (t >= 1) {
        angle = settleTo;
        if (pendingShuffleObjekt) {
          applyObjekt(pendingShuffleObjekt);
          pendingShuffleObjekt = null;
        }
        flipMode = 'shuffle-recede';
        settleStart = now;
        settleFrom = angle;
        settleTo = angle + 90 * direction;
      }
    } else if (flipMode === 'shuffle-recede') {
      const t = Math.min(1, (now - settleStart) / SHUFFLE_RECEDE_MS);
      angle = settleFrom + (settleTo - settleFrom) * easeOutCubic(t);
      if (t >= 1) {
        angle = settleTo;
        flipMode = 'spinning';
      }
    }

    // Proximity is relative to the card's own box (cardWidthPx/cardHeightPx),
    // not the full (now much larger) canvas — press is centered with the
    // canvas so its rect's center still gives the card's on-screen center.
    const pressRect = press.getBoundingClientRect();
    const halfW = cardWidthPx / 2;
    const halfH = cardHeightPx / 2;
    const cx = pressRect.left + pressRect.width / 2;
    const cy = pressRect.top + pressRect.height / 2;
    const radius = Math.max(halfW, halfH) * PARALLAX_RADIUS_MULTIPLIER;
    const dx = pointerX - cx;
    const dy = pointerY - cy;
    const dist = Math.hypot(dx, dy);

    let targetTiltX = 0;
    let targetTiltZ = 0;
    if (!reducedMotion && pointerActive && dist < radius && halfW > 0 && halfH > 0) {
      const proximity = 1 - dist / radius;
      const normX = clamp(dx / halfW, -1, 1);
      const normY = clamp(dy / halfH, -1, 1);
      targetTiltX = -normY * MAX_TILT_DEG * proximity;
      targetTiltZ = normX * MAX_TILT_DEG * TILT_Z_FACTOR * proximity;
    }
    tiltX += (targetTiltX - tiltX) * PARALLAX_EASE;
    tiltZ += (targetTiltZ - tiltZ) * PARALLAX_EASE;

    const bobY = reducedMotion
      ? 0
      : Math.sin(((now / 1000) * 2 * Math.PI) / IDLE_BOB_PERIOD_SECONDS) * IDLE_BOB_AMPLITUDE_PX;

    mesh.rotation.set(degToRad(tiltX), degToRad(angle), degToRad(tiltZ));
    mesh.position.y = bobY;

    updateFrontVideoTexture?.();
    renderer.render(threeScene, camera);
    rafHandle = requestAnimationFrame(frame);
  }

  return {
    cardElement: canvas,
    pressElement: press,
    setSpeed(newPeriodSeconds) {
      periodSeconds = newPeriodSeconds;
    },
    setPaused(newPaused) {
      paused = newPaused;
    },
    setHovering(newHovering) {
      hovering = newHovering;
    },
    setPointer(clientX, clientY) {
      pointerX = clientX;
      pointerY = clientY;
      pointerActive = true;
    },
    clearPointer() {
      pointerActive = false;
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
    setDirection(newDirection) {
      direction = newDirection === 'ccw' ? -1 : 1;
    },
    setObjekt(nextObjekt) {
      applyObjekt(nextObjekt);
    },
    shuffleTo(nextObjekt) {
      // Aim for the next edge-on angle strictly ahead in the current spin
      // direction — nudged by 1° so a card that's already exactly on a
      // multiple of 90 still travels a full quarter-turn, not zero.
      const nudge = direction;
      pendingShuffleObjekt = nextObjekt;
      flipMode = 'shuffle-approach';
      settleStart = performance.now();
      settleFrom = angle;
      settleTo = direction > 0 ? Math.ceil((angle + nudge) / 90) * 90 : Math.floor((angle + nudge) / 90) * 90;
    },
    flip() {
      flipMode = 'settling';
      settleStart = performance.now();
      settleFrom = angle;
      settleTo = angle + 180;
    },
    setFace(face) {
      // Shortest path to the nearest angle ≡ 0 (front) or 180 (back) mod
      // 360 from wherever the card currently is, in whichever direction
      // is closer — a context-menu jump, not a spin, so it shouldn't take
      // the long way around just because the card is mid-rotation.
      const targetMod = face === 'front' ? 0 : 180;
      const currentMod = ((angle % 360) + 360) % 360;
      const delta = (((targetMod - currentMod + 180) % 360) + 360) % 360 - 180;
      flipMode = 'settling';
      settleStart = performance.now();
      settleFrom = angle;
      settleTo = angle + delta;
    },
    destroy() {
      cancelAnimationFrame(rafHandle);
      resizeObserver.disconnect();
      disposeFaceMaterials();
      edge.dispose();
      geometry.dispose();
      overlayTexture.dispose();
      overlayMaterial.dispose();
      overlay.geometry.dispose();
      renderer.dispose();
      scene.remove();
    },
    hitTest(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      return raycaster.intersectObject(mesh).length > 0;
    },
  };
}
