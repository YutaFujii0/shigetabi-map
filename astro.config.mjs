// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages（https://<user>.github.io/sigetabi-map/）を想定。独自ドメインにしたら BASE_PATH=/ でビルドする
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://yutafujii0.github.io',
  base: process.env.BASE_PATH ?? '/sigetabi-map',
  trailingSlash: 'ignore',
});
