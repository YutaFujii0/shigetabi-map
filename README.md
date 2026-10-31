# しげ旅マップ

旅系YouTuber「しげ旅」の**非公式ファンサイト**。訪問国を世界地図で塗り分け、シリーズ（再生リスト）ごとのルートと動画を見られるようにする。

- ホーム `/` … 世界地図（行った国＝青／最新動画の国＝黄／まだの国＝グレー、しげさんアイコン、直近5か国のルート）、最新の動画、最新の Instagram 投稿、シリーズ一覧
- シリーズ `/series/[id]/` … シリーズの全ルート（訪問順の番号付き）、国をクリックで吹き出し、訪問順の動画リスト

## 開発

```sh
npm install
npm run dev      # http://localhost:4321/sigetabi-map/
npm run build    # dist/ に静的ファイルを出力
npm run preview
```

Astro（静的出力）＋ d3-geo / world-atlas（Natural Earth 110m）。地図の投影と国境パスはビルド時に計算して SVG に埋め込み、ブラウザ側はズーム・ドラッグ・クリックだけを担当する（`src/scripts/map.ts`）。

## データ

`src/data/*.json` は今は**サンプル**（動画ID `sample00001` などはダミー。タイトル形式・再生リスト名は実チャンネルに合わせてある）。サーバー・DB は持たず、データはすべてこのリポジトリの JSON に置く。定期バッチ（GitHub Actions の cron）が YouTube / Instagram の新着を取得してこの JSON を更新する PR を作り、人が確認してマージ → 再ビルドで公開される。

| ファイル | 内容 |
|---|---|
| `series.json` | シリーズ＝チャンネルの再生リスト（`id` は URL 用、`playlist_title` は再生リスト名、`ended: null` は旅の途中） |
| `videos.json` | 動画。`countries` は ISO 3166 数字コード、`episode` はタイトルの【南米#01】の番号、`filmed_at` はタイトル末尾の撮影期間 |
| `stops.json` | ルート上の滞在（都市の代表座標）。全体の順番は撮影時期（`arrived`）で決める |
| `countries.json` | 国名の上書きと別名（無い国は i18n-iso-countries の日本語名） |
| `location.json` | しげさんの現在地（国単位の推定。`source: manual` が最優先） |
| `instagram_posts.json` | 最新投稿の URL（手動登録。`sample: true` の間は埋め込みの代わりにダミーカード） |

### 実チャンネルを見て分かったこと（収集の実装向けメモ）

- タイトルは `{都市}旅🇨🇴{説明}【南米#01】2023年2月3日〜8日` の形。**国は国旗の絵文字**で入っている（複数国の回は旗が複数）。国旗 → ISO alpha-2 → 数字コードで機械的に判定できる。旗が無い回（移動・フライト回）は LLM か手動
- 【シリーズ#話数】と撮影期間もタイトルから取れる（`filmed_at`・`stops.arrived/departed` の材料）
- 再生リストには国内（北海道・沖縄…）やイベント（北中米W杯・JAL修行）もあるので、対象の再生リストは許可リストで指定する
- 1つの再生リストが何年にもまたがる（ヨーロッパ #1 は2022年、#64 は2026年）。シリーズの期間は飛び飛びになる

## 公開（GitHub Pages）

`main` に push すると `.github/workflows/deploy.yml` がビルドして GitHub Pages に公開する。リポジトリの Settings → Pages → Source を **GitHub Actions** にしておくこと。

`astro.config.mjs` の `base` は `/sigetabi-map`。独自ドメインにする場合は `SITE_URL` と `BASE_PATH=/` を設定してビルドする。

## 注意

- 非公式ファンサイトであることをヘッダーとフッターに明記している。公開前に本人（運営）へ一声かけるのが望ましい
- 現在地は国単位の推定のみ。根拠と基準日時をアイコンのツールチップに出す
- YouTube API で取得したデータは規約上、定期的に再取得して最新に保つ
