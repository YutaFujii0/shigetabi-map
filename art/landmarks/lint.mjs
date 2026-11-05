// 使い方: node lint.mjs [svgファイル...]（省略時は icons/ 全部）。SPEC.md の機械的に確かめられる決まりを確認する
import { readFileSync, readdirSync } from 'node:fs';
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(new URL('icons/', import.meta.url)).filter((f) => f.endsWith('.svg')).map((f) => `icons/${f}`);
let bad = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const errs = [];
  if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"/.test(s.trim())) errs.push('ルートの svg が仕様どおりでない');
  for (const t of s.matchAll(/<([a-zA-Z]+)/g)) if (!['svg', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'g'].includes(t[1])) errs.push(`使えない要素 <${t[1]}>`);
  for (const c of s.matchAll(/(?:fill|stroke)="([^"]+)"/g)) if (!['none', '#000'].includes(c[1])) errs.push(`使えない色 ${c[1]}`);
  if (s.length > 6144) errs.push(`大きすぎる ${s.length}B`);
  if (/\d\.\d\d/.test(s)) errs.push('小数2桁以上がある');
  if (errs.length) { bad++; console.log(f, [...new Set(errs)].join(' / ')); }
}
console.log(`${files.length} files, ${bad} with problems`);
process.exit(bad ? 1 : 0);
