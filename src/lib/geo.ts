// 地図の投影・国境パスはビルド時に計算して SVG として出力する（クライアントでは d3 を読み込まない）
import { geoNaturalEarth1, geoPath, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import world50 from 'world-atlas/countries-50m.json';

export const W = 1000;
export const H = 520;

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

type Topo = Topology<{ countries: GeometryCollection<{ name: string }> }>;
// 南極は表示しない。id が無い地域は名前で識別する（コソボだけは ISO の暫定コード 983 を使う）
const NO_ID: Record<string, string> = { Kosovo: '983' };
const load = (t: unknown) =>
  (feature(t as Topo, (t as Topo).objects.countries) as FeatureCollection<Geometry, { name: string }>).features
    .filter((f) => f.id !== '010')
    .map((f) => ({ ...f, id: (f.id as string | undefined) ?? NO_ID[f.properties.name] ?? `x-${f.properties.name}` })) as Feature<Geometry, { name: string }>[];
// 基本は軽い 110m。110m に入っていない小さな国（カリブ海・太平洋の島国、マルタ、シンガポールなど）だけ 50m から足す
const base = load(world);
const baseIds = new Set(base.map((f) => String(f.id)));
const extra = load(world50).filter((f) => !baseIds.has(String(f.id)));
const features = [...base, ...extra];

const projection = geoNaturalEarth1().fitExtent(
  [
    [4, 4],
    [W - 4, H - 4],
  ],
  { type: 'FeatureCollection', features: base },
);
const path = geoPath(projection).digits(1);
// 小さな島は拡大して見るので細かめに出す
const finePath = geoPath(projection).digits(2);

/** 世界全体の表示でこれより小さい国（地図の単位）は、タップできるよう丸い点も重ねる */
export const SMALL = 4;

export type CountryShape = { id: string; nameEn: string; d: string; bounds: Box; center: Pt; size: number };

export const COUNTRY_SHAPES: CountryShape[] = features.map((f) => {
  const [[x0, y0], [x1, y1]] = path.bounds(f);
  const size = Math.max(x1 - x0, y1 - y0);
  const [cx, cy] = path.centroid(f);
  return {
    id: String(f.id),
    nameEn: f.properties.name,
    d: (size < SMALL * 4 ? finePath(f) : path(f)) ?? '',
    bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    center: { x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10 },
    size,
  };
});

const byId = new Map(features.map((f) => [String(f.id), f]));

/** 日本だけは 50m の細かい形（沖縄・伊豆諸島・小笠原などの島を含む）。ページに1回だけ定義し、地図からは <use> で参照する */
const japan50 = load(world50).find((f) => String(f.id) === '392');
export const JAPAN_FINE_D = japan50 ? (finePath(japan50) ?? '') : '';

export function project(lng: number, lat: number): Pt {
  const p = projection([lng, lat]) ?? [0, 0];
  return { x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10 };
}

/** 国の代表点（現在地アイコン用）。地図データに無い小国は undefined */
export function countryCenter(iso: string): Pt | undefined {
  const f = byId.get(iso);
  if (!f) return undefined;
  // 飛び地の多い国は重心が海に落ちるので、一番大きいポリゴンの重心を使う
  let g: Geometry = f.geometry;
  if (g.type === 'MultiPolygon') {
    const polys = g.coordinates.map((c) => ({ type: 'Polygon' as const, coordinates: c }));
    g = polys.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
  }
  const [lng, lat] = geoCentroid(g);
  return project(lng, lat);
}

function curve(a: Pt, b: Pt): string {
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2,
    dx = b.x - a.x,
    dy = b.y - a.y,
    k = 0.18;
  return `M${a.x},${a.y} Q${(mx - dy * k).toFixed(1)},${(my + dx * k).toFixed(1)} ${b.x},${b.y}`;
}

/**
 * 2点間を少し膨らんだ弧で結ぶ。日付変更線をまたぐ近い方の経路（オーストラリア → サモアなど）は、
 * 地図を横断させずに端から出て反対の端から入る2本の弧にする
 */
export function arc(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  if (Math.abs(dx) <= W / 2) return curve(a, b);
  const s = Math.sign(dx) * W;
  return `${curve(a, { x: b.x - s, y: b.y })} ${curve({ x: a.x + s, y: a.y }, b)}`;
}

/** 日付変更線をまたいで散らばる点（太平洋の島々など）は、西側を +W ずらして1か所にまとまる座標にする */
export function unwrap<T extends Pt>(pts: T[]): T[] {
  const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  const xs = pts.map((p) => p.x);
  if (span(xs) <= W / 2) return pts;
  const shifted = pts.map((p) => (p.x < W / 2 ? { ...p, x: p.x + W } : p));
  return span(shifted.map((p) => p.x)) < span(xs) ? shifted : pts;
}

export function bbox(pts: Pt[], pad: number): Box {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** 範囲の大きさに比例した余白で囲む（狭い範囲のシリーズほど拡大される） */
export function fitBox(pts: Pt[], ratio: number, min: number): Box {
  const b = bbox(pts, 0);
  return bbox(pts, Math.max(min, Math.max(b.w, b.h) * ratio));
}

export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
