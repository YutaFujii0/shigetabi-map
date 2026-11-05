// 使い方: node render.mjs <out.png> <svgファイル...>
// SVG を並べた一覧画像を作る（各アイコン 160px、下に名前）。playwright-core と Mac の Chrome を使う
import { chromium } from '../../node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const [out, ...files] = process.argv.slice(2);
const cells = files.map((f) => `<figure><div>${readFileSync(f, 'utf8')}</div><figcaption>${basename(f, '.svg')}</figcaption></figure>`).join('');
const cols = Math.min(5, files.length);
const html = `<style>body{margin:0;padding:12px;background:#fff;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},180px);gap:8px}
figure{margin:0;border:1px solid #ddd}figure div{width:160px;height:160px;margin:10px}figure svg{width:100%;height:100%}figcaption{text-align:center;padding-bottom:4px}</style>${cells}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
