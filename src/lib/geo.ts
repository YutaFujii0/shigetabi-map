// 地図の投影・国境パスはビルド時に計算して SVG として出力する（クライアントでは d3 を読み込まない）
import { geoNaturalEarth1, geoPath, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';

export const W = 1000;
export const H = 520;

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
// 南極は表示しない。id が無い地域（北キプロスなど）は名前で識別する
const features = fc.features
  .filter((f) => f.id !== '010')
  .map((f) => ({ ...f, id: (f.id as string | undefined) ?? `x-${f.properties.name}` })) as Feature<Geometry, { name: string }>[];

const projection = geoNaturalEarth1().fitExtent(
  [
    [4, 4],
    [W - 4, H - 4],
  ],
  { type: 'FeatureCollection', features },
);
const path = geoPath(projection).digits(1);

export type CountryShape = { id: string; nameEn: string; d: string; bounds: Box };

export const COUNTRY_SHAPES: CountryShape[] = features.map((f) => {
  const [[x0, y0], [x1, y1]] = path.bounds(f);
  return { id: String(f.id), nameEn: f.properties.name, d: path(f) ?? '', bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
});

const byId = new Map(features.map((f) => [String(f.id), f]));

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

/** 2点間を少し膨らんだ弧で結ぶ */
export function arc(a: Pt, b: Pt): string {
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2,
    dx = b.x - a.x,
    dy = b.y - a.y,
    k = 0.18;
  return `M${a.x},${a.y} Q${(mx - dy * k).toFixed(1)},${(my + dx * k).toFixed(1)} ${b.x},${b.y}`;
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

export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
