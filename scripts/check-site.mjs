// ビルド済みサイトを実ブラウザで開き、表示・操作・レイアウトを確かめる（push 前の確認用）。
//   npm run build && npm run check:site                  … 手元で astro preview を立てて確認
//   npm run check:site -- --base https://r-u-all-traveling.com   … 公開中のサイトを確認
//   オプション: --out <dir>（スクリーンショットの保存先。既定は .check-site/）
// ブラウザは端末の Chrome を使う（CHROME_PATH で変更可）。問題があれば終了コード 1
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const PORT = 4329;
const BASE = (opt('base', `http://127.0.0.1:${PORT}`)).replace(/\/$/, '');
const OUT = opt('out', '.check-site');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const local = !args.includes('--base');

const series = JSON.parse(fs.readFileSync('src/data/series.json', 'utf8'));
const pick = (g) => series.find((s) => (s.group ?? 'travel') === g)?.id;
const PAGES = ['/', ...['travel', 'worldcup', 'japan'].map(pick).filter(Boolean).map((id) => `/series/${id}/`)];
const WIDTHS = [
  { name: 'pc', width: 1440, height: 900 },
  { name: 'pc-wide', width: 2000, height: 1150 },
  { name: 'sp', width: 390, height: 844, mobile: true },
  { name: 'sp-small', width: 360, height: 800, mobile: true },
];

const problems = [];
const fail = (msg) => problems.push(msg);

async function startServer() {
  if (!local) return null;
  // astro preview は同時に1つしか動かないので、残っていれば止める
  await new Promise((r) => spawn('npx', ['astro', 'preview', 'stop'], { stdio: 'ignore' }).on('exit', r));
  const p = spawn('npx', ['astro', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${BASE}/`)).ok) return p;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('astro preview が起動しませんでした（先に npm run build を）');
}

async function checkPage(browser, url, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  const page = await ctx.newPage();
  const tag = `${url} @${vp.name}`;
  page.on('pageerror', (e) => fail(`${tag}: JS エラー ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(BASE)) fail(`${tag}: ${r.status()} ${r.url()}`);
  });
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });

  // ホーム：読み込み中から完了まで、地図と Instagram の枠の高さが変わらないか
  const heights = new Set();
  if (url === '/') {
    for (let i = 0; i < 16; i++) {
      heights.add(await page.evaluate(() => {
        const m = document.querySelector('#homemap')?.getBoundingClientRect().height;
        const g = document.querySelector('.igwrap')?.getBoundingClientRect().height;
        return `${Math.round(m ?? 0)}/${Math.round(g ?? 0)}`;
      }));
      await page.waitForTimeout(250);
    }
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => {
    const m = document.querySelector('.main > .mapcard')?.getBoundingClientRect();
    const s = document.querySelector('.main > .side')?.getBoundingClientRect();
    const tabs = document.querySelector('.tabs');
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      tabsOverflow: tabs ? tabs.scrollWidth - tabs.clientWidth : 0,
      mapSide: m && s ? [Math.round(m.top), Math.round(m.bottom), Math.round(s.top), Math.round(s.bottom)] : null,
    };
  });
  if (r.pageOverflow > 1) fail(`${tag}: ページが横にはみ出している（${r.pageOverflow}px）`);
  if (r.tabsOverflow > 1) fail(`${tag}: シリーズのタブが1行に収まっていない（${r.tabsOverflow}px）`);
  if (url === '/' && vp.width >= 1021 && r.mapSide) {
    const [mt, mb, st, sb] = r.mapSide;
    if (Math.abs(mt - st) > 2 || Math.abs(mb - sb) > 2) fail(`${tag}: 地図と右の列の高さがずれている（地図 ${mt}-${mb} / 右 ${st}-${sb}）`);
  }
  // 最初の1フレームの丸めの差（1〜2px）は許す
  if (heights.size > 1) {
    const hs = [...heights].map((h) => h.split('/').map(Number));
    const spread = (i) => Math.max(...hs.map((h) => h[i])) - Math.min(...hs.map((h) => h[i]));
    if (spread(0) > 2 || spread(1) > 2) fail(`${tag}: 読み込み中に高さが変わった（地図/Instagram: ${[...heights].join(' → ')}）`);
  }

  // 操作：ホームは国のクリックで右のパネル、シリーズページは吹き出し
  const mapSel = url === '/' ? '#homemap' : '#sermap';
  // 地図の表示範囲の中で、実際にクリックが届く（凡例やボタンに隠れていない）行った国を探す
  const hit = await page.evaluate((sel) => {
    const card = document.querySelector(sel);
    card.scrollIntoView({ block: 'start' });
    const c = card.getBoundingClientRect();
    for (const el of card.querySelectorAll('.c.v[data-id]')) {
      const b = el.getBoundingClientRect();
      const x0 = Math.max(b.left, c.left), x1 = Math.min(b.right, c.right), y0 = Math.max(b.top, c.top, 0), y1 = Math.min(b.bottom, c.bottom, innerHeight);
      if (x1 - x0 < 6 || y1 - y0 < 6) continue;
      for (let y = y0 + 2; y < y1; y += 4)
        for (let x = x0 + 2; x < x1; x += 4) if (document.elementFromPoint(x, y) === el) return { x, y, id: el.dataset.id };
    }
    return null;
  }, mapSel);
  if (hit) {
    await page.mouse.click(hit.x, hit.y);
    await page.waitForTimeout(250);
    const ok =
      url === '/'
        ? await page.locator(`[data-panel="${hit.id}"]`).isVisible()
        : (await page.locator(`${mapSel} .bubble`).count()) > 0;
    if (!ok) fail(`${tag}: 国（${hit.id}）をクリックしても${url === '/' ? 'パネルが切り替わらない' : '吹き出しが出ない'}`);
  } else fail(`${tag}: クリックできる国が見つからない`);

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${url.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home'}-${vp.name}.png`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: file });
  await ctx.close();
  return file;
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const shots = [];
try {
  for (const url of PAGES) for (const vp of WIDTHS) shots.push(await checkPage(browser, url, vp));
} finally {
  await browser.close();
  server?.kill();
  if (server) spawn('npx', ['astro', 'preview', 'stop'], { stdio: 'ignore' });
}

console.log(`確認したページ: ${PAGES.join(' ')}（${WIDTHS.map((w) => `${w.name} ${w.width}px`).join(', ')}）`);
console.log(`スクリーンショット: ${OUT}/（${shots.length}枚）`);
if (problems.length) {
  console.log(`\n問題 ${problems.length} 件:`);
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
console.log('問題なし');
