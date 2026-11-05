// 使い方: node preview-tile.mjs <tile.svg> <out.png> [--bg #fafaf7]
// タイルを CSS 背景として 2x2 に繰り返した画像を作り、継ぎ目を確認する
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
const [tile, out, ...rest] = process.argv.slice(2);
const bg = rest[0] === '--bg' ? rest[1] : '#fafaf7';
const svg = readFileSync(tile, 'utf8');
const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
const [w, h] = [Number(m[1]), Number(m[2])];
const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: w * 2, height: h * 2 }, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0;width:${w * 2}px;height:${h * 2}px;background:${bg} url('${uri}');background-size:${w}px ${h}px">`);
await page.screenshot({ path: out });
await browser.close();
