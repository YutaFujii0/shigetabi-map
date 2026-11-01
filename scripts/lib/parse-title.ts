// しげ旅の動画タイトルから国・都市・話数・撮影期間を取り出す。
// 例: 「ボゴタ34歳ひとり旅🇨🇴コロンビアの首都に行ってみた。【南米#01】2023年2月3日〜8日」

export type ParsedTitle = {
  /** 国旗の絵文字から得た ISO alpha-2（出現順・重複なし） */
  a2: string[];
  /** 「○○旅」の○○。移動回など取れないものは null */
  city: string | null;
  /** 飛行機・乗継などの移動回 */
  flight: boolean;
  /** 【南米#01】の 1 */
  episode: number | null;
  /** タイトル末尾の撮影期間 */
  filmed: { from: string; to: string } | null;
};

const FLAG_RE = /([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu;
const FLIGHT_RE = /(航空|エアライン|ファーストクラス|ビジネスクラス|エコノミー|空港|フライト|機内)/;

// イングランド・スコットランド・ウェールズの旗（🏴 + タグ文字 gbeng など）はイギリスとして扱う
const SUBDIVISION_RE = /\u{1F3F4}((?:[\u{E0061}-\u{E007A}])+)\u{E007F}/gu;

export function flagsToA2(title: string): string[] {
  // 「日本vsイラン🇮🇷」のような試合の対戦相手の国旗は、訪問国ではないので外す
  title = title.replace(/vs[^\u{1F1E6}-\u{1F1FF}【】]{1,12}[\u{1F1E6}-\u{1F1FF}]{2}/gu, '');
  const found: { i: number; a2: string }[] = [];
  for (const m of title.matchAll(FLAG_RE)) {
    found.push({ i: m.index, a2: [m[1], m[2]].map((c) => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 65)).join('') });
  }
  for (const m of title.matchAll(SUBDIVISION_RE)) {
    const tag = [...m[1]].map((c) => String.fromCharCode(c.codePointAt(0)! - 0xe0000)).join('');
    found.push({ i: m.index, a2: tag.slice(0, 2).toUpperCase() });
  }
  return [...new Set(found.sort((a, b) => a.i - b.i).map((f) => f.a2))];
}

/**
 * 国旗が無いタイトル用：本文中の国名（長いものから）を探す。nameToA2 は「国名 → alpha-2」の辞書。
 * 誤検出がありうるので、呼び出し側で信頼度を下げて人の確認に回す
 */
export function namesToA2(title: string, nameToA2: Map<string, string>): string[] {
  let rest = title.replace(/【[^】]*】/g, ' ');
  const found: { i: number; a2: string }[] = [];
  for (const name of [...nameToA2.keys()].sort((a, b) => b.length - a.length)) {
    let i: number;
    while ((i = rest.indexOf(name)) >= 0) {
      found.push({ i, a2: nameToA2.get(name)! });
      rest = rest.slice(0, i) + '\u0000'.repeat(name.length) + rest.slice(i + name.length);
    }
  }
  return [...new Set(found.sort((a, b) => a.i - b.i).map((f) => f.a2))];
}

const pad = (n: number) => String(n).padStart(2, '0');
const date = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 「2022年7月30日〜8月2日」「2026年6月29日」「2025年12月30日〜2026年1月3日」など */
export function parseFilmed(title: string): { from: string; to: string } | null {
  const m = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*[〜~～\-－]\s*(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日)?\s*$/);
  if (!m) return null;
  const y1 = +m[1], m1 = +m[2], d1 = +m[3];
  const from = date(y1, m1, d1);
  if (!m[6]) return { from, to: from };
  let y2 = m[4] ? +m[4] : y1;
  const m2 = m[5] ? +m[5] : m1;
  if (!m[4] && m2 < m1) y2 = y1 + 1; // 年をまたぐのに年の表記が無い場合
  return { from, to: date(y2, m2, +m[6]) };
}

export function parseEpisode(title: string): number | null {
  const m = title.match(/【[^】]*#\s*(\d+)\s*】/);
  return m ? Number(m[1]) : null;
}

export function parseCity(title: string): { city: string | null; flight: boolean } {
  // 先頭の【悲報】などを外し、最初の「旅」までを見る
  const head = title.replace(/^(【[^】]*】\s*)+/, '');
  const m = head.match(/^(.+?)旅/);
  if (!m) return { city: null, flight: FLIGHT_RE.test(head) };
  let city = m[1]
    .replace(/\d+歳(ひとり|一人)?$/, '')
    .replace(/乗(り)?継(ぎ)?$/, '')
    .trim();
  // 「バンコクからビエンチャン」は行き先、「ダナン、ホイアン」「ティンプー・プナカ」は最初の都市を採る
  city = city.split(/から|→/).at(-1)!.split(/[、・,]/)[0].trim();
  const flight = FLIGHT_RE.test(city) || /乗(り)?継(ぎ)?/.test(m[1]);
  // 「成田ロンドン」「羽田ニューヨーク」のような移動回は都市として扱わない
  if (FLIGHT_RE.test(city) || /^(成田|羽田|関空|中部|福岡)/.test(city) || /[A-Za-z]{3,}/.test(city)) return { city: null, flight: true };
  return { city: city || null, flight };
}

export function parseTitle(title: string): ParsedTitle {
  const { city, flight } = parseCity(title);
  return { a2: flagsToA2(title), city, flight, episode: parseEpisode(title), filmed: parseFilmed(title) };
}

/** 概要欄の「しげ旅通算　138/195ヶ国」を読む */
export function parseTally(description: string): number | null {
  const m = description.match(/通算\s*(\d+)\s*[\/／]\s*\d+\s*[ヶヵか箇カケ]?国/);
  return m ? Number(m[1]) : null;
}
