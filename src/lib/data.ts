// データの読み込みと派生値の計算。データはすべてリポジトリ内の src/data/*.json に置く（サーバー・DB は持たない）。
// 定期バッチ（クローラー）はこの JSON を更新して PR を出し、マージ → 再ビルドで反映する
import countries from 'i18n-iso-countries';
import ja from 'i18n-iso-countries/langs/ja.json';
import seriesJson from '../data/series.json';
import videosJson from '../data/videos.json';
import stopsJson from '../data/stops.json';
import countriesJson from '../data/countries.json';
import locationJson from '../data/location.json';
import siteJson from '../data/site.json';
import { COUNTRY_SHAPES, countryCenter, project, type Pt } from './geo';

countries.registerLocale(ja);

export type Series = {
  id: string;
  name: string;
  playlist_title: string;
  order: number;
  started: string;
  ended: string | null;
  playlist_id: string;
};
export type Video = {
  video_id: string;
  title: string;
  published_at: string;
  duration: string;
  series_id: string;
  episode?: number | null;
  countries: string[];
  cities: string[];
  filmed_at?: { from: string; to: string } | null;
  /** 飛行機・乗継などの移動回（ルートには載せない） */
  flight?: boolean;
  thumbnail?: string;
  extract: { method: 'title' | 'llm' | 'manual' | 'unresolved'; confidence: number; reviewed: boolean };
};
export type Stop = {
  series_id: string;
  seq: number;
  iso_n3: string;
  city: string | null;
  /** 都市の座標が無いときは国の代表点に置く */
  lat: number | null;
  lng: number | null;
  arrived: string | null;
  departed: string | null;
  video_ids: string[];
};
export type Location = { iso_n3: string; as_of: string; source: 'instagram' | 'manual'; evidence_url?: string };

export const site = siteJson;
export const allSeries = (seriesJson as Series[]).slice().sort((a, b) => a.order - b.order);
export const videos = (videosJson as Video[]).slice().sort((a, b) => a.published_at.localeCompare(b.published_at));
export const location = locationJson as Location;

const seriesById = new Map(allSeries.map((s) => [s.id, s]));
export const getSeries = (id: string) => seriesById.get(id)!;
const videoById = new Map(videos.map((v) => [v.video_id, v]));

/* ---------- 国 ---------- */
const override = new Map(countriesJson.map((c) => [c.iso_n3, c]));
const shapeName = new Map(COUNTRY_SHAPES.map((c) => [c.id, c.nameEn]));
export function countryName(iso: string): string {
  const o = override.get(iso);
  if (o) return o.name_ja;
  const a2 = countries.numericToAlpha2(iso);
  return (a2 && countries.getName(a2, 'ja', { select: 'alias' })) || shapeName.get(iso) || iso;
}
export function countryA2(iso: string): string | undefined {
  return override.get(iso)?.iso_a2 ?? countries.numericToAlpha2(iso);
}

/* ---------- ルート（stops） ---------- */
export type RouteStop = Stop & Pt & { name: string; videos: Video[] };
// 全体の順番は撮影時期（arrived）で決める。シリーズは何年にもまたがることがあるので series.order では並べない
export const stops: RouteStop[] = (stopsJson as Stop[])
  .slice()
  .sort((a, b) => (a.arrived ?? '').localeCompare(b.arrived ?? '') || a.seq - b.seq)
  .flatMap((s) => {
    // 110m の地図に無い小さな国で都市の座標も無いものは、地図には載せられないので除く
    const pos = s.lat != null && s.lng != null ? project(s.lng, s.lat) : countryCenter(s.iso_n3);
    if (!pos) return [];
    const vs = s.video_ids.map((id) => videoById.get(id)).filter((v): v is Video => !!v);
    return vs.length ? [{ ...s, ...pos, name: countryName(s.iso_n3), videos: vs }] : [];
  });
export const seriesStops = (id: string) => stops.filter((s) => s.series_id === id).sort((a, b) => a.seq - b.seq);
/** 直近5か国ぶんの滞在（同じ国の別の都市は1か国と数える） */
export const recentStops = (() => {
  const isos = new Set<string>();
  let i = stops.length;
  while (i > 0 && (isos.size < 5 || isos.has(stops[i - 1].iso_n3))) isos.add(stops[--i].iso_n3);
  return stops.slice(i);
})();

/* ---------- 地図の色 ---------- */
// 行った国 ＝ 動画が公開されている国
export const visited = new Set(videos.flatMap((v) => v.countries));
export const latestVideo = videos.at(-1)!;
export const latestCountries = new Set(latestVideo.countries);

export const videosByCountry = (iso: string) => videos.filter((v) => v.countries.includes(iso)).reverse();
export const videosOfSeries = (id: string) => videos.filter((v) => v.series_id === id);
/** その国を一番最近訪れた滞在 */
export const lastStopIn = (iso: string) => stops.findLast((s) => s.iso_n3 === iso);
export const seriesOfCountry = (iso: string) => [...new Set(videosByCountry(iso).map((v) => v.series_id))].map(getSeries);

/* ---------- 現在地（推定） ---------- */
export const currentPos = countryCenter(location.iso_n3);

/* ---------- 表示用 ---------- */
export const ym = (d: string | null | undefined) => (d ? d.slice(0, 7).replace('-', '.') : '');
export const ymd = (d: string) => d.slice(0, 10).replaceAll('-', '.');
export function duration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const [h, mi, s] = [m[1], m[2], m[3]].map((x) => Number(x ?? 0));
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(mi).padStart(2, '0')}:${ss}` : `${mi}:${ss}`;
}
export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const seriesPeriod = (s: Series) => `${ym(s.started)} – ${s.ended ? ym(s.ended) : '旅の途中'}`;

export function seriesSummary(s: Series) {
  const st = seriesStops(s.id);
  const vs = videosOfSeries(s.id);
  const inStops = new Set(st.flatMap((x) => x.video_ids));
  return {
    stops: st,
    /** ルートに載らない動画（移動回・複数国の総集編など） */
    others: vs.filter((v) => !inStops.has(v.video_id)),
    countryCount: new Set(vs.flatMap((v) => v.countries)).size,
    videoCount: vs.length,
    countryNames: st.map((x) => x.name).filter((n, i, a) => n !== a[i - 1]),
  };
}

/** タイトル中の国旗絵文字（Windows では文字で出る）を分解して、国旗 SVG に置き換えられるようにする */
export function titleParts(title: string): ({ text: string } | { flag: string })[] {
  const parts: ({ text: string } | { flag: string })[] = [];
  const re = /([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu;
  let last = 0;
  for (const m of title.matchAll(re)) {
    if (m.index > last) parts.push({ text: title.slice(last, m.index) });
    const a2 = [m[1], m[2]].map((c) => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 65)).join('');
    parts.push({ flag: a2.toLowerCase() });
    last = m.index + m[0].length;
  }
  if (last < title.length) parts.push({ text: title.slice(last) });
  return parts;
}
