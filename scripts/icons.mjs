// Genera los íconos de la PWA a partir de un SVG. Uso: node scripts/icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

// Calendario con un check; `pad` deja margen para el recorte de los íconos "maskable" de Android.
const svg = (pad, radius) => {
  const s = 512, inner = s - pad * 2, k = inner / 512;
  const t = (x) => pad + x * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${radius}" fill="#0d6e5f"/>
  <rect x="${t(112)}" y="${t(136)}" width="${288 * k}" height="${264 * k}" rx="${36 * k}" fill="#fff"/>
  <rect x="${t(112)}" y="${t(136)}" width="${288 * k}" height="${72 * k}" rx="${36 * k}" fill="#f4c95d"/>
  <rect x="${t(112)}" y="${t(180)}" width="${288 * k}" height="${28 * k}" fill="#f4c95d"/>
  <rect x="${t(170)}" y="${t(104)}" width="${28 * k}" height="${68 * k}" rx="${14 * k}" fill="#fff"/>
  <rect x="${t(314)}" y="${t(104)}" width="${28 * k}" height="${68 * k}" rx="${14 * k}" fill="#fff"/>
  <path d="M${t(184)} ${t(300)} l${50 * k} ${48 * k} l${96 * k} ${-100 * k}" fill="none" stroke="#0d6e5f"
        stroke-width="${34 * k}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
};

const out = "public/icons";
const normal = Buffer.from(svg(0, 112));
const maskable = Buffer.from(svg(72, 0));
writeFileSync(`${out}/icon.svg`, normal);
await sharp(normal).resize(192).png().toFile(`${out}/icon-192.png`);
await sharp(normal).resize(512).png().toFile(`${out}/icon-512.png`);
await sharp(maskable).resize(512).png().toFile(`${out}/icon-maskable-512.png`);
// iOS recorta las esquinas solo: fondo completo sin bordes redondeados.
await sharp(Buffer.from(svg(24, 0))).resize(180).png().toFile(`${out}/apple-touch-icon.png`);
console.log("íconos listos");
