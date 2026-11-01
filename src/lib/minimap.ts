// シリーズカード用の小さな地図を、ビルド時に単独の SVG 画像として作る（HTML に埋め込むと重いため）。
// 画像の中ではページの CSS が効かないので、色はここで直接指定する
import { COUNTRY_SHAPES, JAPAN_FINE_D, W as MAP_W, arc, fitBox, intersects, unwrap } from './geo';
import { visited, UNRECOGNIZED_STATES, connected, countriesOfSeries, seriesColor, getSeries, seriesStops, JAPAN } from './data';

// global.css の --sea / --land / --visited-dim / --unrecognized / --japan / --surface / --route と同じ色
const C = { sea: '#e4f2f6', land: '#e9e6df', dim: '#c3d3d9', unrecognized: '#80868b', japan: '#d4a017', surface: '#ffffff', route: '#3c4043' };

export function miniMapSvg(seriesId: string): string {
  const st = unwrap(seriesStops(seriesId));
  const inSeries = countriesOfSeries(seriesId);
  const color = seriesColor(seriesId);
  // 日本国内編は旅の順序に意味が無いので、ルートの線は引かず点だけにする
  const noRoute = getSeries(seriesId).group === 'japan';
  const b = fitBox(st, 0.3, 4);
  const asp = 8 / 16;
  const w = Math.max(b.w, b.h / asp),
    h = w * asp;
  const view = { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
  const fillOf = (id: string) =>
    id === JAPAN ? C.japan : inSeries.has(id) ? color : visited.has(id) ? C.dim : UNRECOGNIZED_STATES.has(id) ? C.unrecognized : C.land;
  const out: string[] = [];
  // 日付変更線をまたぐ範囲では、国を左右にずらしたコピーも描く
  for (const dx of [0, MAP_W, -MAP_W]) {
    for (const c of COUNTRY_SHAPES) {
      if (!intersects({ ...c.bounds, x: c.bounds.x + dx }, view)) continue;
      const d = c.id === JAPAN && JAPAN_FINE_D ? JAPAN_FINE_D : c.d;
      out.push(`<path d="${d}" fill="${fillOf(c.id)}"${dx ? ` transform="translate(${dx},0)"` : ''}/>`);
    }
  }
  const sw = (w / 400).toFixed(2);
  if (!noRoute)
    st.slice(1).forEach((s, i) => {
      if (connected(st[i], s)) out.push(`<path class="rt" d="${arc(st[i], s)}" stroke-width="${sw}" stroke-dasharray="${(w / 120).toFixed(2)} ${(w / 160).toFixed(2)}"/>`);
    });
  for (const s of st) out.push(`<circle cx="${s.x}" cy="${s.y}" r="${(w / 180).toFixed(2)}" fill="${C.surface}" stroke="${C.route}" stroke-width="${(w / 600).toFixed(2)}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.x.toFixed(1)} ${view.y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice"><style>path{stroke:${C.surface};stroke-width:.4;vector-effect:non-scaling-stroke}.rt{fill:none;stroke:${C.route};opacity:.75;vector-effect:none}</style><rect x="${(view.x - w).toFixed(1)}" y="${(view.y - h).toFixed(1)}" width="${(w * 3).toFixed(1)}" height="${(h * 3).toFixed(1)}" fill="${C.sea}"/>${out.join('')}</svg>`;
}
