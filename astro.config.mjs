// @ts-check
import { defineConfig } from 'astro/config';

// 独自ドメイン（https://r-u-all-traveling.com/）の直下で公開する。
// github.io のサブパスで出す場合は SITE_URL=https://yutafujii0.github.io BASE_PATH=/shigetabi-map でビルドする
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://r-u-all-traveling.com',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'ignore',
});
