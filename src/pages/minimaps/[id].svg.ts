// シリーズカードのミニ地図（/minimaps/<シリーズID>.svg）
import type { APIRoute } from 'astro';
import { allSeries } from '../../lib/data';
import { miniMapSvg } from '../../lib/minimap';

export function getStaticPaths() {
  return allSeries.map((s) => ({ params: { id: s.id } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(miniMapSvg(params.id!), { headers: { 'Content-Type': 'image/svg+xml' } });
