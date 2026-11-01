# しげ旅マップ

旅系YouTuber「しげ旅」の**非公式ファンサイト**。訪問国を世界地図で塗り分け、シリーズ（再生リスト）ごとのルートと動画を見られるようにする。

- ホーム `/` … 世界地図（行った国＝青／最新動画の国＝黄／まだの国＝グレー、しげさんアイコン、直近5か国のルート）、最新の動画、Instagram（プロフィール埋め込み）、シリーズ一覧
- シリーズ `/series/[id]/` … シリーズの全ルート（訪問順の番号付き）、国をクリックで吹き出し、訪問順の動画リスト

## 開発

```sh
npm install
npm run dev      # http://localhost:4321/shigetabi-map/
npm run build    # dist/ に静的ファイルを出力
npm run preview
```

Astro（静的出力）＋ d3-geo / world-atlas（Natural Earth 110m）。地図の投影と国境パスはビルド時に計算して SVG に埋め込み、ブラウザ側はズーム・ドラッグ・クリックだけを担当する（`src/scripts/map.ts`）。

## データ

サーバー・DB は持たず、データはすべて `src/data/*.json`（このリポジトリ）に置く。今の `videos.json` / `series.json` / `stops.json` は**サンプル**（動画IDはダミー）で、下の取得スクリプトを実行すると実データに置き換わる。

| ファイル | 書く人 | 内容 |
|---|---|---|
| `playlists.json` | 人 | 対象にする再生リスト（許可リスト）。国内・W杯などはここに入れなければ対象外 |
| `overrides.json` | 人 | 判定の手動修正。`videos.<動画ID>` に `countries`（数字コード）/`cities`/`filmed_at`/`series_id`/`flight`/`exclude`、`series.<id>` に `ended`/`name` |
| `cities.json` | 自動＋人 | 都市の座標キャッシュ（キーは `数字コード:都市名`）。見つからない都市は手で足す |
| `videos.json` | 自動 | 動画。`countries` は ISO 3166 数字コード、`episode` は【南米#01】の番号、`filmed_at` はタイトル末尾の撮影期間、`flight` は移動回 |
| `series.json` | 自動 | シリーズ＝再生リスト。期間は撮影時期から。最後の公開から45日以内なら `ended: null`（旅の途中） |
| `stops.json` | 自動 | ルート上の滞在。同じ国・都市が続く動画を1つにまとめる。座標が無ければ国の代表点に置く |
| `site.json` | 人 | チャンネル・Instagram のアカウント。Instagram はプロフィールの公式埋め込み（直近の投稿が自動で更新される）で表示 |
| `countries.json` | 人 | 国名の上書き（無い国は i18n-iso-countries の日本語名） |
| `location.json` | 人 | しげさんの現在地（国単位の推定。当面は管理者が手で更新する。`iso_n3`・`as_of`・`source`・根拠URL） |

### YouTube からの取得

```sh
YOUTUBE_API_KEY=... npm run data:update   # 取得 → src/data を更新、要約を scripts/out/report.md に出力
npm test                                  # タイトル解析のテスト
```

1. `playlists.json` の再生リストごとに `playlistItems.list` で動画IDを取得（公開動画のみ）
2. `videos.list` で タイトル・公開日・長さ・サムネイル を取得
3. タイトルを解析（`scripts/lib/parse-title.ts`）
   - 国：**国旗の絵文字** → ISO alpha-2 → 数字コード（複数国の回は旗が複数）
   - 都市：先頭の「○○旅」（「34歳ひとり」「乗継」は除く）。飛行機・乗継の回は `flight` にしてルートに載せない
   - 話数：【南米#01】、撮影期間：末尾の「2023年2月3日〜8日」
4. 国が判定できなかった動画・座標が見つからなかった都市はレポートに出るので、`overrides.json` / `cities.json` で直す
5. `extract.reviewed: true` の動画は再取得しても判定を上書きしない。`overrides.json` が最優先
6. 都市の座標は OpenStreetMap Nominatim（1秒1回）で調べて `cities.json` にキャッシュ。`--no-geocode` で無効

API の消費は 1回あたり「再生リストのページ数＋動画数/50」ユニット程度（無料枠は1日10,000）。YouTube の規約上、取得データは定期的に再取得して最新に保つ（毎日全件を取り直している）。

### 定期実行

`.github/workflows/update-data.yml` が毎日 6:17（JST）に取得し、差分があれば `data/update` ブランチで PR を作る。確認してマージすると Pages が再ビルドされる。必要な設定：

- Settings → Secrets and variables → Actions に `YOUTUBE_API_KEY`
- Settings → Actions → General → 「Allow GitHub Actions to create and approve pull requests」をオン

## 公開（GitHub Pages）

`main` に push すると `.github/workflows/deploy.yml` がビルドして GitHub Pages に公開する。リポジトリの Settings → Pages → Source を **GitHub Actions** にしておくこと。

`astro.config.mjs` の `base` は `/shigetabi-map`。独自ドメインにする場合は `SITE_URL` と `BASE_PATH=/` を設定してビルドする。

## 注意

- 非公式ファンサイトであることをヘッダーとフッターに明記している。公開前に本人（運営）へ一声かけるのが望ましい
- 現在地は国単位の推定のみ。根拠と基準日時をアイコンのツールチップに出す
- YouTube API で取得したデータは規約上、定期的に再取得して最新に保つ
