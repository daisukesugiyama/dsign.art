/* D.sign — the door.
   It opens on the torso at full size, close enough to want it, and pulls back until the
   whole picture stands on the wall: from wanting to looking. One movement, once.
   A click anywhere goes in. */
(() => {
  const el = document.querySelector('[data-door]');
  if (!el) return;
  const root = document.documentElement;
  const done = () => root.classList.add('door-done');
  const OSD = window.OpenSeadragon;
  if (!OSD) { el.classList.add('is-static'); done(); return; }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = +el.dataset.w, H = +el.dataset.h;           // data size in px
  const TX = +el.dataset.tx, TY = +el.dataset.ty;       // the torso, in data px

  const v = OSD({
    element: el.querySelector('.door-stage'),
    tileSources: el.dataset.dzi,
    showNavigationControl: false,
    showNavigator: false,
    mouseNavEnabled: false,
    drawer: 'canvas',
    animationTime: 6.4,
    springStiffness: 5.2,
    blendTime: 0.35,
    immediateRender: true,
    visibilityRatio: 0,
    constrainDuringPan: false,
    minZoomImageRatio: 0,
    maxZoomPixelRatio: 4,
    imageLoaderLimit: 8,
  });

  // where the whole will hang: centred in the room left between the top and the line
  const layout = c => {
    const portrait = c.y > c.x * 1.1;
    const top = portrait ? c.y * 0.2 : Math.max(76, c.y * 0.11);
    const bottom = portrait ? c.y * 0.26 : Math.max(150, c.y * 0.2);
    const avail = c.y - top - bottom;
    const ar = H / W;
    const s = Math.min((portrait ? 0.9 : 0.86) * c.x, avail / ar);   // screen px per viewport unit
    const w = s, h = s * ar, x = (c.x - w) / 2, y = top + (avail - h) / 2;
    return { s, top, avail, ar, rect: { x, y, w, h } };
  };
  const endView = vp => {
    const c = vp.getContainerSize(), L = layout(c);
    return new OSD.Rect(0.5 - c.x / 2 / L.s, L.ar / 2 - (L.top + L.avail / 2) / L.s, c.x / L.s, c.y / L.s);
  };
  // the label sits under the work's lower-left corner, the way to go in under its right
  const label = el.querySelector('.label'), cue = el.querySelector('.go');
  const place = () => {
    const r = layout({ x: innerWidth, y: innerHeight }).rect;
    label.style.left = `${r.x}px`; label.style.top = `${r.y + r.h + 14}px`;
    cue.style.right = `${innerWidth - (r.x + r.w)}px`; cue.style.top = `${r.y + r.h + 16}px`;
  };
  place();

  // warm the cache with the tiles the whole will want, so the pull-back never shows holes
  const preload = (item, endZoom) => {
    const src = item.source;
    const want = item.viewportToImageZoom(endZoom) * (window.devicePixelRatio || 1);
    const max = src.maxLevel;
    const level = Math.max(src.minLevel, Math.min(max, max + Math.ceil(Math.log2(Math.max(want, 1e-6)))));
    const n = src.getNumTiles(level);
    if (n.x * n.y > 40) return;
    for (let x = 0; x < n.x; x++) for (let y = 0; y < n.y; y++) { const i = new Image(); i.src = src.getTileUrl(level, x, y); }
  };

  // some in-app browsers open the page before it has a size; wait for one before measuring
  const stage = el.querySelector('.door-stage');
  v.addOnceHandler('open', function begin() {
    const r = stage.getBoundingClientRect(), cs = v.viewport.getContainerSize();
    if (!(r.width > 0 && r.height > 0 && cs.x > 0 && cs.y > 0)) { setTimeout(begin, 100); return; }
    start();
  });
  function start() {
    const vp = v.viewport, item = v.world.getItemAt(0);
    vp.fitBounds(endView(vp), true);
    const endZ = vp.getZoom();
    const T = vp.imageToViewportCoordinates(TX, TY);
    if (reduce) {
      item.immediateRender = false;
      el.classList.add('is-drawn');
      done();
      return;
    }
    // start: one pixel of the data on one pixel of the screen, the torso where it will end up
    vp.zoomTo(vp.imageToViewportZoom(1), T, true);
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      item.immediateRender = false;
      el.classList.add('is-drawn');
      setTimeout(() => vp.zoomTo(endZ, T), 450);
      setTimeout(done, 4200);
    };
    item.addHandler('fully-loaded-change', e => { if (e.fullyLoaded) go(); });
    setTimeout(go, 4500);
    preload(item, endZ);
  }
  v.addHandler('open-failed', () => { el.classList.add('is-static'); done(); });

  addEventListener('resize', () => {
    place();
    if (!root.classList.contains('door-done') || !v.world.getItemAt(0)) return;
    v.viewport.fitBounds(endView(v.viewport), true);
  });
})();
