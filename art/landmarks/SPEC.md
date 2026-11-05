# 観光スポット線画アイコンの仕様

背景柄（参考：手描きの落書き風ドゥードゥル柄）に敷き詰める、単色の線画アイコン。

## ファイル
- `icons/<番号>-<id>.svg`（例 `icons/001-fuji.svg`）。番号と id は `items.tsv` のとおり
- 1ファイル1アイコン。`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` から始める
- ルートの `<svg>` に `fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"` を付け、子要素では色・線幅を基本的に上書きしない
  - 例外：細部の線は `stroke-width="1.6"`、小さな塗り（窓の点、目など）は `fill="#000" stroke="none"` を使ってよい。色は #000 のみ
- 使ってよい要素：path, circle, ellipse, line, polyline, polygon, rect, g。`<text>`・`<image>`・`<defs>`・`<use>`・`<style>`・グラデーション・フィルター・transform 以外の属性トリックは禁止（文字は線で描く）。g への transform は可
- 絵は 100×100 の中で、上下左右に 4 以上の余白を取り、だいたい 8〜92 の範囲いっぱいに描く
- 座標は小数1桁まで。1ファイル 3KB 以内が目安（最大 6KB）

## タッチ
- 参考画像のような、手描きっぽいかわいい落書き。写実ではなく、ひと目で「どこの何か」がわかる特徴を強調したアイコン
- 線だけで描く（塗りつぶしの面は使わない）。ハッチング、点、短い線で質感（石垣、窓、模様）を足すと落書き感が出る
- 地面のラインや雲、波、草など小さな添え物を入れてよい。ただし主役が小さくならないように
- 背景として小さく（40〜70px 程度）表示されるので、細かすぎる線は潰れる。線同士の間隔は 2.5 以上空ける
- 線画アイコン（Material Symbols のような幾何学）より、少しゆるい手描き感：完全な直線より、わずかに曲げた線や、角の丸いゆがみを使う

## 背景柄の作り直し
アイコンを足したり直したりしたら、`art/landmarks/` で次を実行して `src/assets/bg-landmarks.svg` を作り直す（global.css の `background-size` はタイルの大きさに合わせる）。

```sh
node lint.mjs
node compose.mjs --out ../../src/assets/bg-landmarks.svg --w 1000 --h 820 --size 80 --color '#d9d3c6' --seed 3
node preview-tile.mjs ../../src/assets/bg-landmarks.svg <out.png>   # 継ぎ目の確認
```
