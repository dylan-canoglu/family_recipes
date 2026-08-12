// Rasterizes public/app-icon.svg into the PNG sizes the home-screen installs
// need. Re-run with `npm run icons` after editing the SVG.
//
// Android reads pwa-192/pwa-512 from the manifest (both flagged maskable, which
// is why the SVG is full-bleed orange with the hat inside the safe zone).
// iOS ignores the manifest icons for the home screen and uses
// apple-touch-icon.png, which must be a PNG with no transparency.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = readFileSync(join(publicDir, 'app-icon.svg'));

const targets = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  // High density so the vector is rasterized cleanly before downscaling.
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(publicDir, file));
  console.log(`wrote public/${file} (${size}x${size})`);
}
