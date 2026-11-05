// 使い方: node compose.mjs [--icons icons] [--out ../../public/bg-landmarks.svg] [--w 1200] [--h 1000] [--size 72] [--color #000] [--seed 1]
// icons/ の線画アイコンを全部1回ずつ、継ぎ目なく繰り返せる1枚のタイル SVG に敷き詰める
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const args = { icons: 'icons', out: '../../public/bg-landmarks.svg', w: 1200, h: 1000, size: 72, color: '#000', seed: 1 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i].replace(/^--/, '');
  if (!(k in args)) throw new Error(`unknown option ${argv[i]}`);
  args[k] = typeof args[k] === 'number' ? Number(argv[i + 1]) : argv[i + 1];
}
const { w: W, h: H, size, color } = args;

// seeded PRNG (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(args.seed);

// load icons
const files = readdirSync(args.icons).filter((f) => f.endsWith('.svg')).sort();
if (!files.length) throw new Error('no icons');
const inner = (src) => {
  const m = src.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/);
  if (!m) throw new Error('bad svg');
  return m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
    .replace(/#000000\b|#000\b/gi, color);
};
const icons = files.map((f) => inner(readFileSync(join(args.icons, f), 'utf8')));

// shuffle (Fisher-Yates)
const order = icons.map((_, i) => i);
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}

const items = order.map((idx) => ({
  idx,
  s: 0.85 + rand() * 0.3,
  rot: (rand() * 2 - 1) * 18,
}));

const tdist = (ax, ay, bx, by) => {
  let dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  if (dx > W / 2) dx = W - dx;
  if (dy > H / 2) dy = H - dy;
  return Math.hypot(dx, dy);
};

// best-candidate sampling; relax radius factor until all fit
function tryPlace(factor) {
  const placed = [];
  // larger icons first gives better packing
  const seq = [...items].sort((a, b) => b.s - a.s);
  for (const it of seq) {
    const r = size * it.s * factor;
    let best = null, bestGap = -Infinity;
    for (let c = 0; c < 400; c++) {
      const x = rand() * W, y = rand() * H;
      let gap = Infinity;
      for (const p of placed) gap = Math.min(gap, tdist(x, y, p.x, p.y) - r - p.r);
      // prefer maximum clearance (blue-noise); cap so early points stay random
      if (gap > bestGap) { bestGap = gap; best = { x, y }; }
    }
    if (bestGap < 0) return null;
    placed.push({ ...it, ...best, r });
  }
  return placed;
}

let placed = null, factor = 0.55;
for (; factor >= 0.3; factor -= 0.01) {
  for (let attempt = 0; attempt < 20 && !placed; attempt++) placed = tryPlace(factor);
  if (placed) break;
}
if (!placed) {
  console.warn('WARNING: could not place all icons');
  placed = [];
}
const missing = items.length - placed.length;
if (factor < 0.549) console.warn(`note: spacing relaxed to radius factor ${factor.toFixed(2)}`);
if (missing) console.warn(`WARNING: ${missing} icons could not be placed`);

// output
const n = (v) => String(Math.round(v * 10) / 10);
let dups = 0;
let body = '';
for (const p of placed) {
  const half = size * p.s * 0.71; // conservative half-diagonal
  const k = (size * p.s) / 100;
  for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
    const cx = p.x + ox, cy = p.y + oy;
    if (cx + half <= 0 || cx - half >= W || cy + half <= 0 || cy - half >= H) continue;
    if (ox || oy) dups++;
    body += `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${n(p.rot)}) scale(${n(k * 1000) / 1000}) translate(-50 -50)">${icons[p.idx]}</g>`;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><g fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, svg);
console.log(`icons placed: ${placed.length}/${items.length}, wrap duplicates: ${dups}, bytes: ${Buffer.byteLength(svg)}, gzip: ${gzipSync(svg).length}`);
