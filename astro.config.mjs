// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 独自ドメイン（https://r-u-all-traveling.com/）の直下で公開する。
// github.io のサブパスで出す場合は SITE_URL=https://yutafujii0.github.io BASE_PATH=/shigetabi-map でビルドする
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://r-u-all-traveling.com',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'ignore',
  // CSS は小さいので HTML に埋め込み、描画を止めないようにする
  build: { inlineStylesheets: 'always' },
  integrations: [sitemap()],
  // 国旗などの画像を HTML に埋め込まない（同じ国旗が何度も出るので、ファイルにしてキャッシュさせる）
  vite: { build: { assetsInlineLimit: 0 } },
});
