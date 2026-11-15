/**
 * Gera fotos sintéticas para testar o pipeline sem fotos reais.
 * Inclui casos-problema: uma quase-duplicada, uma borrada e uma escura.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("exemplo/fotos");

const rooms: [string, string, string][] = [
  ["01-fachada.jpg", "#9ec5e8", "#d9c7a8"],
  ["02-sala.jpg", "#efe4d2", "#a9825a"],
  ["03-sala-2.jpg", "#e8dccb", "#8f6c48"],
  ["04-varanda-gourmet.jpg", "#bcd8f0", "#7a6a58"],
  ["05-cozinha.jpg", "#f4f1ea", "#6b6b6b"],
  ["06-suite-master.jpg", "#e9e0d5", "#8a7a6a"],
  ["07-quarto.jpg", "#e3e8ee", "#9a8d7e"],
  ["08-banheiro-suite.jpg", "#f2f2f0", "#b5aca0"],
  ["09-piscina.jpg", "#7fc3e6", "#d8d2c4"],
  ["10-academia-lazer.jpg", "#dedede", "#555555"],
  ["11-planta.jpg", "#ffffff", "#ffffff"],
];

function rand(seed: number) {
  let x = seed * 9301 + 49297;
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
}

/** Cena abstrata com layout próprio por foto (janelas, horizonte e "móveis" variam). */
function svg(sky: string, floor: string, seed: number) {
  const w = 2400, h = 1600;
  const r = rand(seed + 1);
  const horizon = 700 + Math.round(r() * 500);
  const nWin = 1 + Math.floor(r() * 4);
  const windows = Array.from({ length: nWin }, () => {
    const ww = 200 + r() * 500, wx = r() * (w - ww), wh = 200 + r() * (horizon - 300);
    return `<rect x="${wx}" y="${120 + r() * 100}" width="${ww}" height="${wh}" rx="6" fill="white" opacity="${0.35 + r() * 0.4}"/>`;
  }).join("");
  const furniture = Array.from({ length: 4 + Math.floor(r() * 5) }, () => {
    const fw = 150 + r() * 700, fh = 80 + r() * 300;
    const gray = Math.round(40 + r() * 160);
    return `<rect x="${r() * (w - fw)}" y="${horizon - fh * 0.6 + r() * 300}" width="${fw}" height="${fh}" rx="${r() * 40}" fill="rgb(${gray},${gray - 10},${gray - 20})" opacity="0.9"/>`;
  }).join("");
  const step = 6 + Math.floor(r() * 10);
  const texture = Array.from({ length: Math.floor((h - horizon) / step) }, (_, i) =>
    `<line x1="0" y1="${horizon + i * step}" x2="${w}" y2="${horizon + i * step + r() * 30}" stroke="black" stroke-opacity="0.08" stroke-width="2"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="${r()}" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="white"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>${windows}
    <rect y="${horizon}" width="${w}" height="${h - horizon}" fill="${floor}"/>${texture}${furniture}
  </svg>`;
}

await fs.mkdir(OUT, { recursive: true });
for (const [i, [name, sky, floor]] of rooms.entries()) {
  await sharp(Buffer.from(svg(sky, floor, i))).jpeg({ quality: 88 }).toFile(path.join(OUT, name));
}
// Quase-duplicada da sala, borrada e escura:
await sharp(path.join(OUT, "02-sala.jpg")).modulate({ brightness: 1.03 }).jpeg({ quality: 80 }).toFile(path.join(OUT, "12-sala-dup.jpg"));
await sharp(path.join(OUT, "07-quarto.jpg")).blur(25).toFile(path.join(OUT, "13-quarto-borrado.jpg"));
await sharp(path.join(OUT, "05-cozinha.jpg")).modulate({ brightness: 0.18 }).toFile(path.join(OUT, "14-cozinha-escura.jpg"));
console.log(`Fotos de exemplo em ${OUT}`);
