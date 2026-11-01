import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTitle, namesToA2 } from './parse-title.ts';

// チャンネルで実際に使われている形式のタイトル
const cases: [string, Partial<ReturnType<typeof parseTitle>>][] = [
  ['ボゴタ34歳ひとり旅🇨🇴コロンビアの首都に行ってみた。【南米#01】2023年2月3日〜8日', { a2: ['CO'], city: 'ボゴタ', flight: false, episode: 1, filmed: { from: '2023-02-03', to: '2023-02-08' } }],
  ['ミラノ旅🇮🇹イタリア第二の都市で飲み歩き【ヨーロッパ#64】2026年8月12日〜18日', { a2: ['IT'], city: 'ミラノ', episode: 64, filmed: { from: '2026-08-12', to: '2026-08-18' } }],
  ['ワルシャワ33歳ひとり旅🇵🇱大都市なのに物価激安！【ヨーロッパ#16 】2022年7月30日〜8月2日', { a2: ['PL'], city: 'ワルシャワ', episode: 16, filmed: { from: '2022-07-30', to: '2022-08-02' } }],
  ['【悲報】レイキャビク33歳ひとり旅🇮🇸グリーンランドに行けなくなりました...【ヨーロッパ#22】2022年8月13日〜16日', { a2: ['IS'], city: 'レイキャビク', episode: 22 }],
  ['羽田ニューヨーク34歳ひとり旅。ANA新ビジネスクラスTHE Roomが快適すぎた【南米#00 】2023年2月2日〜3日', { a2: [], city: null, flight: true, episode: 0 }],
  ['フランクフルト乗継旅🇩🇪ドイツ経由でアフリカのチュニジアへ【アフリカ#1】2026年5月13日〜14日', { a2: ['DE'], city: 'フランクフルト', flight: true, episode: 1 }],
  ['カタール航空旅🇶🇦世界最高ビジネスクラスQsuiteドーハ→ダラス15時間半【W杯2026 #0】2026年6月9日〜10日', { a2: ['QA'], city: null, flight: true, episode: 0 }],
  ['サッカーW杯2026総集編前半🇺🇸ダラス🇲🇽モンテレイ2026年6月10日〜21日', { a2: ['US', 'MX'], city: null, episode: null, filmed: { from: '2026-06-10', to: '2026-06-21' } }],
  ['W杯ブラジル戦、現地スタジアムの天国と地獄。【北中米W杯#10】2026年6月29日', { a2: [], episode: 10, filmed: { from: '2026-06-29', to: '2026-06-29' } }],
  ['年越し旅🇹🇭テスト【アジア#9】2025年12月30日〜1月3日', { filmed: { from: '2025-12-30', to: '2026-01-03' } }],
  ['エディンバラ33歳ひとり旅🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}USJよりハリーポッターな魔法の街【ヨーロッパ#28 】2022年8月31日〜9月1日', { a2: ['GB'], city: 'エディンバラ' }],
  ['バンコクからビエンチャン30歳ひとり旅。14時間の陸路国境越え。【東南アジア一周#1】', { a2: [], city: 'ビエンチャン', filmed: null, episode: 1 }],
  ['ダナン、ホイアン30歳ひとり旅。ベトナムはフォーだけじゃない。【東南アジア一周#8】', { city: 'ダナン' }],
  ['ヤンゴン30歳ひとり旅前編。ミャンマーでぼったくりトゥクトゥクと口論になった【東南アジア一周#15】', { city: 'ヤンゴン' }],
];

for (const [title, want] of cases) {
  test(title, () => {
    const got = parseTitle(title);
    for (const [k, v] of Object.entries(want)) assert.deepEqual(got[k as keyof typeof got], v, k);
  });
}

test('国旗が無いタイトルは国名で判定する', () => {
  const dict = new Map([['タイ', 'TH'], ['ラオス', 'LA'], ['インド', 'IN'], ['インドネシア', 'ID']]);
  assert.deepEqual(namesToA2('バンコクからビエンチャン30歳ひとり旅。タイから寝台列車とバスを乗り継ぎラオスへ【東南アジア一周#1】', dict), ['TH', 'LA']);
  assert.deepEqual(namesToA2('ジャカルタ30歳ひとり旅。インドネシアの首都は格差がカオス', dict), ['ID']);
});
