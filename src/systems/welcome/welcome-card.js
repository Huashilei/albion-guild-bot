import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { parseGIF, decompressFrames } from 'gifuct-js';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc; // CommonJS package

const ASSET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/welcome');
const BACKGROUND = path.join(ASSET_DIR, 'background.gif');
const FONT_FAMILY = 'Cinzel Decorative';

GlobalFonts.registerFromPath(path.join(ASSET_DIR, 'CinzelDecorative-Bold.ttf'), FONT_FAMILY);

// Output is the background scaled up so the text stays crisp
const SCALE = 2;

const GOLD_TOP = '#ffe9a8';
const GOLD_BOTTOM = '#d9a441';

// Decoded background frames, built once on first use: [{ canvas, delay }]
let backgroundFrames = null;

/**
 * Decode the background GIF into fully composited, scaled frames.
 * Handles GIF disposal so partial-frame GIFs also render correctly.
 */
function loadBackground() {
  if (backgroundFrames) return backgroundFrames;

  const gif = parseGIF(fs.readFileSync(BACKGROUND));
  const frames = decompressFrames(gif, true);
  const { width, height } = gif.lsd;

  const composite = createCanvas(width, height);
  const cctx = composite.getContext('2d');
  const patch = createCanvas(width, height);
  const pctx = patch.getContext('2d');

  backgroundFrames = frames.map((frame) => {
    const { top, left, width: fw, height: fh } = frame.dims;
    const before = frame.disposalType === 3 ? cctx.getImageData(0, 0, width, height) : null;

    patch.width = fw;
    patch.height = fh;
    const data = pctx.createImageData(fw, fh);
    data.data.set(frame.patch);
    pctx.putImageData(data, 0, 0);
    cctx.drawImage(patch, left, top);

    const out = createCanvas(width * SCALE, height * SCALE);
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(composite, 0, 0, width * SCALE, height * SCALE);

    if (frame.disposalType === 2) cctx.clearRect(left, top, fw, fh);
    else if (before) cctx.putImageData(before, 0, 0);

    return { canvas: out, delay: frame.delay || 100 };
  });

  return backgroundFrames;
}

// Largest font size (px) at which `text` fits in `maxWidth`
function fitFontSize(ctx, text, maxSize, minSize, maxWidth) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `bold ${size}px "${FONT_FAMILY}"`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawGoldText(ctx, text, x, y, size) {
  ctx.font = `bold ${size}px "${FONT_FAMILY}"`;
  const gradient = ctx.createLinearGradient(0, y - size, 0, y);
  gradient.addColorStop(0, GOLD_TOP);
  gradient.addColorStop(1, GOLD_BOTTOM);

  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = size * 0.35;
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.strokeStyle = '#2a0d06';
  ctx.strokeText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = gradient;
  ctx.fillText(text, x, y);
}

// Draws the dark band and the WELCOME / name text over one frame
function drawOverlay(ctx, width, height, name) {
  const bandTop = height * 0.66;
  const shade = ctx.createLinearGradient(0, bandTop, 0, height);
  shade.addColorStop(0, 'rgba(15, 4, 2, 0)');
  shade.addColorStop(0.35, 'rgba(15, 4, 2, 0.7)');
  shade.addColorStop(1, 'rgba(15, 4, 2, 0.9)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, bandTop, width, height - bandTop);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const maxWidth = width * 0.88;

  const welcomeSize = fitFontSize(ctx, 'WELCOME', Math.round(height * 0.085), 16, maxWidth);
  drawGoldText(ctx, 'WELCOME', width / 2, height * 0.82, welcomeSize);

  const nameSize = fitFontSize(ctx, name, Math.round(height * 0.07), 14, maxWidth);
  drawGoldText(ctx, name, width / 2, height * 0.93, nameSize);
}

/**
 * Render the animated welcome card for `name`.
 * @returns {Buffer} GIF file contents
 */
export function renderWelcomeCard(name) {
  const frames = loadBackground();
  const { width, height } = frames[0].canvas;
  const label = String(name || 'Adventurer').trim().slice(0, 32);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const encoder = GIFEncoder();

  for (const frame of frames) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frame.canvas, 0, 0);
    drawOverlay(ctx, width, height, label);

    const { data } = ctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    encoder.writeFrame(index, width, height, { palette, delay: frame.delay });
  }

  encoder.finish();
  return Buffer.from(encoder.bytes());
}
