---
name: verify-before-push
description: しげ旅ルートマップで、変更を main に push（＝本番公開）する前後に行う確認手順。型チェック・テスト・ビルド、実ブラウザでの表示・操作・レイアウトの確認（npm run check:site）、スクリーンショットの目視、データ更新 PR のデータでの確認、Lighthouse、push 後の Deploy／Lighthouse ワークフローと本番の確認。コードや見た目、データの取り込み処理を変えたら push 前に必ず使う。
---

# push 前後の確認（しげ旅ルートマップ）

`main` への push はそのまま本番（https://r-u-all-traveling.com/ 、GitHub Pages）に公開される。push 前に下の順で確認し、問題があれば直してからやり直す。結果はユーザーに数字・事実で報告する（「〜のはず」で済ませない）。

## 1. 静的チェック

```sh
npm test            # タイトル解析などのテスト（scripts/lib/*.test.ts）
npx astro check     # 型チェック。「0 errors」であること
npm run build       # ビルドが通り、ページ数が想定どおりか
```

## 2. 実ブラウザでの確認（必須）

```sh
npm run check:site   # 手元で astro preview を立て、主要ページを PC/スマホ幅で開いて確認
```

`scripts/check-site.mjs` が、ホーム・旅のシリーズ・ワールドカップ編・日本国内編のページを 1440 / 2000 / 390 / 360px で開き、次を確かめる。問題があれば終了コード 1 で一覧を出す。

- JS エラー、同じオリジンの 4xx
- ページの横はみ出し、シリーズのタブが1行に収まるか
- PC のホームで地図と右の列（最新の動画＋Instagram）の高さがそろっているか
- 読み込み中から完了まで、地図と Instagram の枠の高さが変わらないか
- 国をクリックして、ホームはパネルが切り替わり、シリーズページは吹き出しが出るか

**スクリーンショット（`.check-site/*.png`）は必ず Read で開いて目で見る。** 変更した箇所は PC とスマホの両方を見る。スクリプトで拾えない崩れ（文字の折り返し、重なり、色、余白）はここで見つける。新しい UI を足したら、その確認を `check-site.mjs` に追加する。

ブラウザは Mac の Chrome（`/Applications/Google Chrome.app/...`）を使う。別の場所なら `CHROME_PATH` を指定する。

### 細かい操作の確認

スクリプトに無い操作（ホバーのツールチップ、ズーム、ドラッグ、タブ切り替え、スマホのタップ）を変えたときは、playwright-core で個別に確かめる。注意点：

- `astro preview` は同時に1つしか動かない。先に `npx astro preview stop`
- 国の形の中心が海のことがある（日本、島国）。`document.elementFromPoint` で国の上の点を探してから操作する
- 地図は左右に複製（`<use class="gCopy">`）されている。複製側の国も反応するか確かめる
- スマホのスワイプは CDP の `Input.dispatchTouchEvent` で再現できる

## 3. データ取り込みを変えたとき

`scripts/update-data.ts` や `src/data/playlists.json` / `overrides.json` を変えたら、push 後に「Update data」ワークフローを実行し、PR 本文のレポートを読む。

```sh
gh workflow run update-data.yml
gh run watch <run-id> --exit-status
gh run view <run-id> --log | sed -E 's/^.*Z //' | awk '/^### /,0'
```

- 「国が判定できなかった動画」「国旗が無く本文の国名から判定した動画」は確認して `overrides.json` に登録する
- 「座標が見つからなかった都市」「検索で見つけた座標」は位置を確かめ、違えば `cities.json` に `source: manual` で入れる
- 「対象にしていない再生リスト」に新しいシリーズが無いか見る
- 「概要欄の通算○/195ヶ国との照合」で、最後の差が 0 になっているか

PR のデータでサイトを確かめるときは、別フォルダに `src` などをコピーし、`git show origin/data/update:src/data/<file>.json` で4つのデータ（videos / series / stops / cities）を差し替えてビルドし、`check:site` を流す。データ PR のマージはユーザーの了承を得てから。

## 4. パフォーマンスに関わる変更のとき

```sh
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx --yes @lhci/cli@0.15.x autorun
```

基準は `lighthouserc.json`（パフォーマンス 80・アクセシビリティ 95・SEO 95）。HTML の大きさ（`dist/index.html`）も見る。ミニ地図などを HTML に直接埋め込むと一気に重くなる。

## 5. コミットと push

- コミットメッセージは日本語で、1行目に何をしたか、本文に箇条書きで要点。末尾に Co-Authored-By の行
- `main` へ直接 push してよい（ユーザーの了承済み）。push すると Deploy と Lighthouse のワークフローが動く

## 6. push 後の確認

```sh
gh run list --limit 3
gh run watch <deploy の run-id> --exit-status       # Deploy to GitHub Pages
gh run watch <lighthouse の run-id> --exit-status   # Lighthouse（警告はベストプラクティス＝Instagram の Cookie のみが想定）
npm run check:site -- --base https://r-u-all-traveling.com --out <scratchpad>/prodcheck
```

GitHub Pages は最大10分キャッシュする（`cache-control: max-age=600`）。本番で古い表示が見えたら、少し待つかクエリを付けて確かめる。ユーザーには「反映されていなければ再読み込み」と伝える。
