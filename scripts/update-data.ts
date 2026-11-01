// YouTube Data API v3 からシリーズ（再生リスト）の動画を取得し、src/data の videos / series / stops を更新する。
//   YOUTUBE_API_KEY=... node scripts/update-data.ts [--no-geocode]
// - 対象の再生リストは src/data/playlists.json（許可リスト）
// - 国・都市・話数・撮影期間はタイトルから判定（scripts/lib/parse-title.ts）
// - extract.reviewed が true の動画は判定結果を上書きしない。src/data/overrides.json の手動修正が最優先
// - 都市の座標は src/data/cities.json にキャッシュ。無いものは Wikipedia（日本語版）→ OpenStreetMap Nominatim の順に調べ、
//   その国の範囲内にあるものだけ採用する
// - 結果の要約を scripts/out/report.md に書く（PR の本文に使う）
import fs from 'node:fs';
import path from 'node:path';
import countries from 'i18n-iso-countries';
import ja from 'i18n-iso-countries/langs/ja.json' with { type: 'json' };
import { geoBounds } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-50m.json' with { type: 'json' };
import { parseTitle, namesToA2 } from './lib/parse-title.ts';

countries.registerLocale(ja);

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'src/data');
const OUT = path.join(ROOT, 'scripts/out');
const API = 'https://www.googleapis.com/youtube/v3';
const KEY = process.env.YOUTUBE_API_KEY;
const GEOCODE = !process.argv.includes('--no-geocode');
/** 最後の公開からこの日数以内のシリーズは「旅の途中」とみなす */
const ONGOING_DAYS = 45;

type Playlist = { playlist_id: string; id: string; name: string; playlist_title: string };
type Extract = { method: 'title' | 'llm' | 'manual' | 'unresolved'; confidence: number; reviewed: boolean };
type Video = {
  video_id: string; title: string; published_at: string; duration: string; series_id: string;
  episode: number | null; countries: string[]; cities: string[]; filmed_at: { from: string; to: string } | null;
  flight?: boolean; thumbnail?: string; extract: Extract;
};
type Overrides = {
  videos: Record<string, Partial<Pick<Video, 'countries' | 'cities' | 'filmed_at' | 'series_id' | 'flight'>> & { exclude?: boolean }>;
  series: Record<string, { ended?: string | null; name?: string }>;
};
type City = { lat: number; lng: number; source: 'wikipedia' | 'nominatim' | 'search' | 'manual' };

const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const write = (f: string, d: unknown) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2) + '\n');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function yt<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: KEY! });
  const res = await fetch(`${API}/${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type PlaylistItems = { nextPageToken?: string; items: { contentDetails: { videoId: string }; status?: { privacyStatus: string } }[] };
async function playlistVideoIds(playlistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await yt<PlaylistItems>('playlistItems', { part: 'contentDetails,status', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    for (const it of r.items) if (it.status?.privacyStatus !== 'private') ids.push(it.contentDetails.videoId);
    pageToken = r.nextPageToken;
  } while (pageToken);
  return ids;
}

type VideoItems = {
  items: {
    id: string;
    snippet: { title: string; publishedAt: string; thumbnails: Record<string, { url: string }> };
    contentDetails: { duration: string };
    status: { privacyStatus: string };
  }[];
};
async function videoDetails(ids: string[]) {
  const out: VideoItems['items'] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt<VideoItems>('videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
    out.push(...r.items.filter((v) => v.status.privacyStatus === 'public'));
  }
  return out;
}

const UA = { 'User-Agent': 'shigetabi-map data updater (https://github.com/YutaFujii0/shigetabi-map)' };
const round = (n: number) => Math.round(n * 100) / 100;

// 座標の検証用：国ごとの範囲（50m は小さな島国も含む）。同じ国コードの図形が複数ある（オーストラリアと周辺の小島など）ので配列で持つ
const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
const bounds = new Map<string, [[number, number], [number, number]][]>();
for (const f of (feature(topo, topo.objects.countries) as FeatureCollection).features) {
  const id = String(f.id);
  bounds.set(id, [...(bounds.get(id) ?? []), geoBounds(f)]);
}
// 海外領土を持つ国（グアム・サイパン＝🇺🇸 など）は本土の範囲で判定できないので検証しない
const HAS_TERRITORIES = new Set(['840', '250', '826', '528', '208', '554', '036', '578']);
/**
 * 座標がその国の範囲（を約1度広げた長方形）に入っているか。同じ名前の別の国の場所を弾くのが目的。
 * 小さな島や海沿いの都市は国境データが粗くて外れるので、厳密な国境判定はしない
 */
function inCountry(c: City, n3: string): boolean {
  const bs = bounds.get(n3);
  if (!bs || HAS_TERRITORIES.has(n3)) return true;
  const M = 1;
  return bs.some(([[x0, y0], [x1, y1]]) => {
    if (c.lat < y0 - M || c.lat > y1 + M) return false;
    // 日付変更線をまたぐ国は x0 > x1 になる
    return x0 <= x1 ? c.lng >= x0 - M && c.lng <= x1 + M : c.lng >= x0 - M || c.lng <= x1 + M;
  });
}

async function wikipedia(city: string): Promise<City | null> {
  const qs = new URLSearchParams({ action: 'query', titles: city, redirects: '1', prop: 'coordinates|pageprops', ppprop: 'wikibase_item', format: 'json', formatversion: '2' });
  const res = await fetch(`https://ja.wikipedia.org/w/api.php?${qs}`, { headers: UA });
  if (!res.ok) return null;
  type Page = { coordinates?: { lat: number; lon: number }[]; pageprops?: { wikibase_item?: string } };
  const page = ((await res.json()) as { query?: { pages?: Page[] } }).query?.pages?.[0];
  const co = page?.coordinates?.[0];
  if (co) return { lat: round(co.lat), lng: round(co.lon), source: 'wikipedia' };
  // 日本語版に座標が無いページは Wikidata の座標（P625）を見る
  const q = page?.pageprops?.wikibase_item;
  if (!q) return null;
  const wd = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`, { headers: UA });
  if (!wd.ok) return null;
  type Entity = { claims?: { P625?: { mainsnak: { datavalue?: { value: { latitude: number; longitude: number } } } }[] } };
  const v = ((await wd.json()) as { entities: Record<string, Entity> }).entities[q]?.claims?.P625?.[0]?.mainsnak.datavalue?.value;
  return v ? { lat: round(v.latitude), lng: round(v.longitude), source: 'wikipedia' } : null;
}

async function nominatim(city: string, a2: string): Promise<City | null> {
  const qs = new URLSearchParams({ q: city, countrycodes: a2.toLowerCase(), format: 'json', limit: '1', 'accept-language': 'ja' });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: UA });
  await sleep(1100); // Nominatim の利用規約：1秒に1回まで
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? { lat: round(+hit.lat), lng: round(+hit.lon), source: 'nominatim' } : null;
}

/** 表記揺れ（エルカラファテ → エル・カラファテ など）用：Wikipedia の検索結果の上位から座標を探す */
async function wikipediaSearch(city: string, n3: string): Promise<City | null> {
  const qs = new URLSearchParams({ action: 'query', list: 'search', srsearch: city, srlimit: '3', format: 'json', formatversion: '2' });
  const res = await fetch(`https://ja.wikipedia.org/w/api.php?${qs}`, { headers: UA });
  if (!res.ok) return null;
  const hits = ((await res.json()) as { query?: { search?: { title: string }[] } }).query?.search ?? [];
  for (const h of hits) {
    const c = await wikipedia(h.title).catch(() => null);
    if (c && inCountry(c, n3)) return { ...c, source: 'search' };
  }
  return null;
}

async function geocode(city: string, n3: string): Promise<City | null> {
  const w = await wikipedia(city).catch(() => null);
  if (w && inCountry(w, n3)) return w;
  const n = await nominatim(city, toA2(n3) ?? '').catch(() => null);
  if (n && inCountry(n, n3)) return n;
  return wikipediaSearch(city, n3).catch(() => null);
}

/** 国旗の無いタイトル用の国名辞書（i18n-iso-countries の日本語名と別名 ＋ countries.json） */
function nameDictionary(): Map<string, string> {
  const dict = new Map<string, string>();
  for (const [a2, names] of Object.entries(countries.getNames('ja', { select: 'all' }))) for (const n of names) if (n.length >= 2) dict.set(n, a2);
  for (const c of read<{ iso_a2: string; name_ja: string; aliases: string[] }[]>('countries.json')) for (const n of [c.name_ja, ...c.aliases]) dict.set(n, c.iso_a2);
  return dict;
}

const toN3 = (a2: string) => countries.alpha2ToNumeric(a2);
const toA2 = (n3: string) => countries.numericToAlpha2(n3);
const month = (d: string) => d.slice(0, 7);

async function main() {
  if (!KEY) throw new Error('YOUTUBE_API_KEY が設定されていません');
  const playlists = read<Playlist[]>('playlists.json');
  const overrides = read<Overrides>('overrides.json');
  const cities = read<Record<string, City>>('cities.json');
  const prev = new Map(read<Video[]>('videos.json').map((v) => [v.video_id, v]));
  const names = nameDictionary();
  const report = { unresolved: [] as Video[], byName: [] as Video[], searched: [] as string[], unknownFlags: [] as string[], noCoords: [] as string[], dup: [] as string[], removed: [] as string[], added: [] as Video[] };

  // 1. 再生リスト → 動画ID（複数の再生リストに入っている動画は先に書いたシリーズを優先）
  const seriesOf = new Map<string, string>();
  for (const pl of playlists) {
    const ids = await playlistVideoIds(pl.playlist_id);
    console.log(`${pl.playlist_title}: ${ids.length} 本`);
    for (const id of ids) {
      if (seriesOf.has(id)) report.dup.push(`${id}（${seriesOf.get(id)} / ${pl.id}）`);
      else seriesOf.set(id, pl.id);
    }
  }

  // 2. 動画の詳細とタイトル解析
  const details = await videoDetails([...seriesOf.keys()]);
  const videos: Video[] = [];
  for (const d of details) {
    const ov = overrides.videos[d.id];
    if (ov?.exclude) continue;
    const old = prev.get(d.id);
    const p = parseTitle(d.snippet.title);
    // 国旗が無い回（古い動画など）は本文の国名から推定する。移動回は除く
    const byName = !p.a2.length && !p.flight;
    if (byName) p.a2 = namesToA2(d.snippet.title, names);
    const n3 = p.a2.map((a2) => {
      const n = toN3(a2);
      if (!n) report.unknownFlags.push(`${a2}（${d.snippet.title}）`);
      return n;
    }).filter((n): n is string => !!n);
    let v: Video = {
      video_id: d.id,
      title: d.snippet.title,
      published_at: d.snippet.publishedAt,
      duration: d.contentDetails.duration,
      series_id: seriesOf.get(d.id)!,
      episode: p.episode,
      countries: n3,
      cities: p.city ? [p.city] : [],
      filmed_at: p.filmed,
      ...(p.flight ? { flight: true } : {}),
      thumbnail: (d.snippet.thumbnails.medium ?? d.snippet.thumbnails.default)?.url,
      extract: n3.length
        ? { method: 'title', confidence: byName ? 0.6 : p.city || p.flight ? 1 : 0.7, reviewed: false }
        : { method: 'unresolved', confidence: 0, reviewed: false },
    };
    // 人が確認済みの判定は残す（タイトル・公開日などAPIの値だけ更新）
    if (old?.extract.reviewed) v = { ...v, countries: old.countries, cities: old.cities, filmed_at: old.filmed_at, flight: old.flight, episode: old.episode, extract: old.extract };
    if (ov) v = { ...v, ...ov, extract: { method: 'manual', confidence: 1, reviewed: true } };
    if (!v.flight) delete v.flight;
    if (v.extract.method === 'unresolved' && !v.flight) report.unresolved.push(v);
    if (byName && n3.length && !v.extract.reviewed) report.byName.push(v);
    if (!old) report.added.push(v);
    videos.push(v);
  }
  for (const id of prev.keys()) if (!videos.some((v) => v.video_id === id)) report.removed.push(id);
  videos.sort((a, b) => a.published_at.localeCompare(b.published_at));

  // 3. ルート（stops）：シリーズごとに撮影順に並べ、同じ国・都市が続く動画を1つの滞在にまとめる
  const when = (v: Video) => v.filmed_at?.from ?? v.published_at.slice(0, 10);
  const stops: unknown[] = [];
  for (const pl of playlists) {
    const vs = videos
      .filter((v) => v.series_id === pl.id && v.countries.length === 1 && !v.flight)
      .sort((a, b) => when(a).localeCompare(when(b)) || (a.episode ?? 0) - (b.episode ?? 0));
    type S = { series_id: string; seq: number; iso_n3: string; city: string | null; lat: number | null; lng: number | null; arrived: string; departed: string; video_ids: string[] };
    const ss: S[] = [];
    for (const v of vs) {
      const iso = v.countries[0], city = v.cities[0] ?? null;
      const last = ss.at(-1);
      if (last && last.iso_n3 === iso && (last.city === city || !city)) {
        last.video_ids.push(v.video_id);
        last.departed = v.filmed_at?.to ?? last.departed;
        continue;
      }
      let c: City | null | undefined = city ? cities[`${iso}:${city}`] : undefined;
      if (city && !c && GEOCODE) {
        c = await geocode(city, iso);
        if (c) cities[`${iso}:${city}`] = c;
        if (c?.source === 'search') report.searched.push(`${city}（${iso}）→ ${c.lat}, ${c.lng}`);
      }
      if (city && !c) report.noCoords.push(`${city}（${iso}）`);
      ss.push({ series_id: pl.id, seq: ss.length + 1, iso_n3: iso, city, lat: c?.lat ?? null, lng: c?.lng ?? null, arrived: when(v), departed: v.filmed_at?.to ?? when(v), video_ids: [v.video_id] });
    }
    stops.push(...ss);
  }

  // 4. シリーズ：期間は撮影時期から。最後の公開が最近なら「旅の途中」
  const now = Date.now();
  const series = playlists
    .map((pl) => {
      const vs = videos.filter((v) => v.series_id === pl.id);
      if (!vs.length) return null;
      const ws = vs.map(when).sort();
      const lastPub = Math.max(...vs.map((v) => Date.parse(v.published_at)));
      const ov = overrides.series[pl.id] ?? {};
      const ended = 'ended' in ov ? ov.ended! : now - lastPub < ONGOING_DAYS * 864e5 ? null : month(ws.at(-1)!);
      return { id: pl.id, name: ov.name ?? pl.name, playlist_title: pl.playlist_title, order: 0, started: month(ws[0]), ended, playlist_id: pl.playlist_id };
    })
    .filter((s) => !!s)
    .sort((a, b) => a.started.localeCompare(b.started))
    .map((s, i) => ({ ...s, order: i + 1 }));

  write('videos.json', videos);
  write('stops.json', stops);
  write('series.json', series);
  write('cities.json', Object.fromEntries(Object.entries(cities).sort(([a], [b]) => a.localeCompare(b))));

  // 5. レポート
  const visited = new Set(videos.flatMap((v) => v.countries));
  const lines = [
    `## データ更新`,
    ``,
    `- 動画 ${videos.length} 本（新規 ${report.added.length} / 削除 ${report.removed.length}）、シリーズ ${series.length}、滞在 ${stops.length}、訪問国 ${visited.size}`,
    ``,
    ...(report.added.length ? [`### 新しい動画`, ...report.added.map((v) => `- ${v.title}（${v.countries.join(',') || '国なし'}）`), ``] : []),
    ...(report.unresolved.length ? [`### 国が判定できなかった動画（overrides.json で指定してください）`, ...report.unresolved.map((v) => `- \`${v.video_id}\` ${v.title}`), ``] : []),
    ...(report.byName.length ? [`### 国旗が無く本文の国名から判定した動画（確認して overrides.json か reviewed で確定してください）`, ...report.byName.map((v) => `- \`${v.video_id}\` ${v.title} → ${v.countries.join(',')}`), ``] : []),
    ...(report.searched.length ? [`### 検索で見つけた座標（別の場所の可能性あり。地図で確認し、違えば cities.json を直してください）`, ...report.searched.map((c) => `- ${c}`), ``] : []),
    ...(report.noCoords.length ? [`### 座標が見つからなかった都市（cities.json に追加してください）`, ...[...new Set(report.noCoords)].map((c) => `- ${c}`), ``] : []),
    ...(report.unknownFlags.length ? [`### 国コードに変換できなかった国旗`, ...report.unknownFlags.map((c) => `- ${c}`), ``] : []),
    ...(report.dup.length ? [`### 複数のシリーズに入っている動画（先のシリーズを採用）`, ...report.dup.map((c) => `- ${c}`), ``] : []),
    ...(report.removed.length ? [`### 取得できなくなった動画（削除・非公開）`, ...report.removed.map((c) => `- ${c}`), ``] : []),
  ];
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
  console.log(lines.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
