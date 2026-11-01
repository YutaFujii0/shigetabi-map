// 地図の操作（ズーム・ドラッグ・ピンチ・ツールチップ・国のクリック）。
// 国をクリックすると mapcard 要素に `map:pick` イベント（detail: { id, x, y }）を発火する
const W = 1000,
  H = 520,
  MAX_K = 40;

export const isNarrow = () => matchMedia('(max-width: 760px)').matches;

export type MapController = { select(id: string | null): void; home(): void; el: HTMLElement };
export type PickDetail = { id: string; x: number; y: number };

const parseBox = (s?: string) => {
  if (!s) return null;
  const [x, y, w, h] = s.split(',').map(Number);
  return { x, y, w, h };
};

export function initMap(card: HTMLElement): MapController {
  const svg = card.querySelector<SVGSVGElement>(':scope > svg')!;
  const gC = svg.querySelector<SVGGElement>('.gC')!;
  const gR = svg.querySelector<SVGGElement>('.gR')!;
  const tip = card.querySelector<HTMLElement>('.tip')!;
  const tips: Record<string, string> = JSON.parse(card.querySelector('[data-tips]')?.textContent ?? '{}');
  const scaled = [...svg.querySelectorAll<SVGGElement>('[data-sx]')];
  const dots = [...gC.querySelectorAll<SVGCircleElement>('circle.dot')];
  const routes = [...gR.querySelectorAll<SVGPathElement>('.rt')];
  let view = { cx: W / 2, cy: H / 2, k: 1 };

  function aspect() {
    const r = svg.getBoundingClientRect();
    return r.width ? r.height / r.width : H / W;
  }
  function apply() {
    const asp = aspect();
    let w = W / view.k,
      h = w * asp;
    if (h > H) {
      h = H / view.k;
      w = h / asp;
    }
    // 地図は左右に1枚ずつ複製してある（<use>）。中心を 0〜W に戻せば、見た目は変わらずに何周でも横に回せる
    view.cx = ((view.cx % W) + W) % W;
    view.cy = h >= H ? H / 2 : Math.min(Math.max(view.cy, h / 2), H - h / 2);
    svg.setAttribute('viewBox', `${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`);
    // 印・線・小さな国の点は、拡大しても画面上の大きさがほぼ一定になるようにする
    const s = Math.min(1, 2.5 / view.k);
    for (const g of scaled) g.setAttribute('transform', `translate(${g.dataset.sx},${g.dataset.sy}) scale(${s})`);
    for (const p of routes) p.style.strokeWidth = String(1.3 * s);
    const px = svg.getBoundingClientRect().width / w || 1; // 地図の 1 単位が何 px か
    for (const d of dots) {
      // 形が十分大きく見えるようになったら点は消す。点はタップしやすいよう半径 6px 前後
      const hide = Number(d.dataset.size) * px > 18;
      d.style.display = hide ? 'none' : '';
      d.setAttribute('r', String(6 / px));
    }
    card.classList.toggle('zoomed', view.k > 1.01);
  }
  function fit(b: { x: number; y: number; w: number; h: number }) {
    const asp = aspect();
    view = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, k: Math.max(1, Math.min(MAX_K, Math.min(W / b.w, (W * asp) / b.h))) };
    apply();
  }
  function home() {
    const b = parseBox(isNarrow() ? (card.dataset.fitNarrow ?? card.dataset.fit) : card.dataset.fit);
    if (b) fit(b);
    else {
      view = { cx: W / 2, cy: H / 2, k: 1 };
      apply();
    }
  }
  function zoomAt(factor: number, px?: number, py?: number) {
    const k = Math.min(Math.max(view.k * factor, 1), MAX_K);
    if (px != null && py != null) {
      // 指・カーソルの位置を中心にズーム
      const vb = svg.viewBox.baseVal,
        r = svg.getBoundingClientRect();
      const mx = vb.x + ((px - r.left) / r.width) * vb.width,
        my = vb.y + ((py - r.top) / r.height) * vb.height;
      const f = view.k / k;
      view.cx = mx + (view.cx - mx) * f;
      view.cy = my + (view.cy - my) * f;
    }
    view.k = k;
    apply();
  }

  card.querySelector('.mapctl')!.addEventListener('click', (e) => {
    const z = (e.target as Element).closest<HTMLElement>('button')?.dataset.z;
    if (z === 'in') zoomAt(1.6);
    if (z === 'out') zoomAt(1 / 1.6);
    if (z === 'fit') home();
  });

  // ドラッグ・ピンチ
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; cx: number; cy: number } | null = null;
  let pinch: { d: number } | null = null;
  let moved = false;
  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
      moved = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag = null;
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.d = d;
      moved = true;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    if (!moved) return;
    svg.classList.add('drag');
    const sc = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
    view.cx = drag.cx - dx * sc;
    // 全体表示のとき（k=1）のタッチは、横だけ地図を回し、縦はページのスクロールに譲る（touch-action: pan-y）
    if (!(view.k <= 1.01 && e.pointerType === 'touch')) view.cy = drag.cy - dy * sc;
    apply();
  });
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
    svg.classList.remove('drag');
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // ダブルクリックでその位置を中心に拡大（Shift を押しながらで縮小）
  svg.addEventListener('dblclick', (e) => {
    e.preventDefault();
    tip.hidden = true;
    zoomAt(e.shiftKey ? 1 / 2 : 2, e.clientX, e.clientY);
  });
  svg.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY);
    },
    { passive: false },
  );

  /** ポインタ下の国。複製（<use>）の上なら、ずらした分を戻して元の国を探す */
  const paths = [...gC.querySelectorAll<SVGGeometryElement>('[data-id]')];
  function countryAt(e: MouseEvent): string | undefined {
    const t = e.target as SVGElement;
    if (t.dataset?.id) return t.dataset.id;
    const use = t.closest?.('use.gCopy') as SVGUseElement | null;
    if (!use) return undefined;
    const m = svg.getScreenCTM();
    if (!m) return undefined;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const q = new DOMPoint(p.x - Number(use.dataset.dx), p.y);
    return paths.find((el) => el.isPointInFill(q))?.dataset.id;
  }
  const hoverTarget = svg;

  // ツールチップ
  hoverTarget.addEventListener('pointermove', (e) => {
    const id = countryAt(e);
    if (!id || e.pointerType === 'touch' || (drag && moved)) {
      tip.hidden = true;
      return;
    }
    const r = card.getBoundingClientRect();
    tip.textContent = tips[id] ?? '';
    tip.style.left = `${e.clientX - r.left}px`;
    tip.style.top = `${e.clientY - r.top}px`;
    tip.hidden = false;
  });
  hoverTarget.addEventListener('pointerleave', () => (tip.hidden = true));
  hoverTarget.addEventListener('click', (e) => {
    if (moved) return;
    const id = countryAt(e);
    if (!id) return;
    tip.hidden = true;
    const r = card.getBoundingClientRect();
    card.dispatchEvent(new CustomEvent<PickDetail>('map:pick', { detail: { id, x: e.clientX - r.left, y: e.clientY - r.top } }));
  });

  const rb = card.querySelector<HTMLButtonElement>('.routebtn');
  rb?.addEventListener('click', () => {
    const on = rb.getAttribute('aria-pressed') !== 'true';
    rb.setAttribute('aria-pressed', String(on));
    // 左右の複製（<use>）にも反映されるよう、クラスではなく要素自体の style で消す
    gR.style.display = on ? '' : 'none';
  });

  let lastNarrow = isNarrow();
  new ResizeObserver(() => {
    // モバイル⇔PC をまたいだら初期表示の範囲を切り替える
    if (isNarrow() !== lastNarrow) {
      lastNarrow = isNarrow();
      home();
    } else apply();
  }).observe(card);
  home();

  return {
    el: card,
    home,
    select(id) {
      gC.querySelectorAll('.sel').forEach((p) => p.classList.remove('sel'));
      if (!id) return;
      // 枠線が隣の国に隠れないよう最前面へ。小さな国の点はさらにその上に
      const els = [...gC.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)];
      els.forEach((p) => p.classList.add('sel'));
      els.filter((p) => p.tagName === 'path').forEach((p) => gC.appendChild(p));
      dots.forEach((d) => gC.appendChild(d));
    },
  };
}
