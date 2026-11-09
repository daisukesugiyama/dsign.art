/* D.sign — the door.
   Two works take turns at the door, TORSO and DRIVER'S SEAT (the list is #door-works in index.html).
   The first visit gets either one; every visit after that gets the other one. ?door=torso or
   ?door=ds opens that one (for checking).
   TORSO opens on the torso at full size, close enough to want it, and pulls back until the whole
   picture stands on the wall: from wanting to looking.
   DRIVER'S SEAT opens at full size just before the slender tree and slides sideways, the way the view
   goes by while one drives; still moving, it pulls back until the whole stands on the wall: from the
   view going by to the image it leaves in the head.
   One movement, once. A click anywhere goes in. */
(() => {
  // the door never zooms: CSS touch-action does it, and iOS Safari also has to be asked here
  if ('ongesturestart' in window) {
    ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  }
  const el = document.querySelector('[data-door]');
  if (!el) return;
  const root = document.documentElement;
  const done = () => root.classList.add('door-done');

  // which work: the one asked for; else the other one from last time; else either, by chance
  let works = [];
  try { works = JSON.parse(document.getElementById('door-works').textContent); } catch (e) {}
  if (!works.length) { done(); return; }
  let last = null;
  try { last = localStorage.getItem('dsign-door'); } catch (e) {}
  const asked = new URLSearchParams(location.search).get('door');
  const prev = works.findIndex(w => w.key === last);
  const work = works.find(w => w.key === asked)
    || (prev >= 0 ? works[(prev + 1) % works.length] : works[Math.floor(Math.random() * works.length)]);
  try { localStorage.setItem('dsign-door', work.key); } catch (e) {}

  // the label: the title, and under it the year and the size
  const label = el.querySelector('.label'), cue = el.querySelector('.go');
  const sub = document.createElement('span');
  label.textContent = work.title;
  sub.textContent = work.sub;
  label.appendChild(sub);

  const W = work.w, H = work.h;           // data size in px
  const TX = work.tx, TY = work.ty;       // where the movement comes to rest (the torso, the slender tree), in data px

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
  // the label sits under the work's lower-left corner, the way to go in under its right
  // (without the viewer, the still picture hangs in the same place)
  const still = el.querySelector('.door-static');
  const place = () => {
    const r = layout({ x: innerWidth, y: innerHeight }).rect;
    label.style.left = `${r.x}px`; label.style.top = `${r.y + r.h + 14}px`;
    cue.style.right = `${innerWidth - (r.x + r.w)}px`; cue.style.top = `${r.y + r.h + 16}px`;
    if (el.classList.contains('is-static')) Object.assign(still.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  };
  const toStatic = () => {
    still.width = work.sw; still.height = work.sh; still.src = work.still;
    el.classList.add('is-static');
    place();
    done();
  };
  place();

  const OSD = window.OpenSeadragon;
  if (!OSD) { toStatic(); return; }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const v = OSD({
    element: el.querySelector('.door-stage'),
    tileSources: work.dzi,
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

  const endView = vp => {
    const c = vp.getContainerSize(), L = layout(c);
    return new OSD.Rect(0.5 - c.x / 2 / L.s, L.ar / 2 - (L.top + L.avail / 2) / L.s, c.x / L.s, c.y / L.s);
  };

  // warm the cache with the tiles the whole will want, so the pull-back never shows holes
  const preload = (item, endZoom, cap = 40) => {
    const src = item.source;
    const want = item.viewportToImageZoom(endZoom) * (window.devicePixelRatio || 1);
    const max = src.maxLevel;
    const level = Math.max(src.minLevel, Math.min(max, max + Math.ceil(Math.log2(Math.max(want, 1e-6)))));
    const n = src.getNumTiles(level);
    if (n.x * n.y > cap) return;
    for (let x = 0; x < n.x; x++) for (let y = 0; y < n.y; y++) { const i = new Image(); i.src = src.getTileUrl(level, x, y); }
  };
  // fetch the full-size tiles of a stretch of the data ahead of time; settles when they are all in
  const warm = (item, x0, y0, x1, y1) => {
    const src = item.source, lv = src.maxLevel, ts = src.getTileWidth(lv), n = src.getNumTiles(lv);
    const jobs = [];
    for (let x = Math.max(0, Math.floor(x0 / ts)); x <= Math.min(n.x - 1, Math.floor(x1 / ts)); x++) {
      for (let y = Math.max(0, Math.floor(y0 / ts)); y <= Math.min(n.y - 1, Math.floor(y1 / ts)); y++) {
        jobs.push(new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = src.getTileUrl(lv, x, y); }));
      }
    }
    return Promise.all(jobs);
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
    if (reduce) {
      item.immediateRender = false;
      el.classList.add('is-drawn');
      done();
      return;
    }
    if (work.move === 'glide') { glide(vp, item, endZ); return; }
    // start: one pixel of the data on one pixel of the screen, the torso where it will end up
    const T = vp.imageToViewportCoordinates(TX, TY);
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

  // DRIVER'S SEAT. P is the spot on the screen where the slender tree will hang once the whole is on
  // the wall. The point of the data under P runs from D to the left of the tree up to the tree, so the
  // view goes by from right to left: at full size it picks up speed and cruises; then, still moving,
  // the pull-back starts, and the run and the pull-back settle together on the curve of the torso's
  // pull-back (OpenSeadragon's spring, 6.4 s, stiffness 5.2), the run going on at the speed it had.
  function glide(vp, item, endZ) {
    const c = vp.getContainerSize(), r = layout(c).rect;
    const P = new OSD.Point(r.x + TX / W * r.w, r.y + TY / H * r.h);
    const z1 = vp.imageToViewportZoom(1);
    const K = 5.2, PULL = 6400;
    const spring = u => (1 - Math.exp(-K * u)) / (1 - Math.exp(-K));
    const V = 0.25 * c.x / 1000;                      // a quarter of the screen's width a second (data px per ms)
    const RISE = 800, CRUISE = 2000;                  // ms
    const R = V * PULL * (1 - Math.exp(-K)) / K;      // what is left to run when the pull-back starts
    const D = V * (RISE / 2 + CRUISE) + R;
    const put = (s, z) => {                           // the data point (s, TY) under P, at zoom z
      const k = c.x * z;                              // screen px per viewport unit
      vp.zoomTo(z, null, true);
      vp.panTo(new OSD.Point(s / W - (P.x - c.x / 2) / k, TY / W - (P.y - c.y / 2) / k), true);
    };
    put(TX - D, z1);
    let started = false, viewIn = false, runIn = false;
    const run = () => {
      let t0 = 0;
      const tick = now => {
        if (!t0) t0 = now;
        const t = now - t0;
        if (t < RISE) put(TX - D + V * (t / 2 - RISE / (2 * Math.PI) * Math.sin(Math.PI * t / RISE)), z1);
        else if (t < RISE + CRUISE) put(TX - D + V * (t - RISE / 2), z1);
        else if (t < RISE + CRUISE + PULL) {
          const F = spring((t - RISE - CRUISE) / PULL);
          put(TX - R * (1 - F), z1 * Math.pow(endZ / z1, F));
        } else { vp.fitBounds(endView(vp), true); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const go = () => {
      if (started) return;
      started = true;
      item.immediateRender = false;
      el.classList.add('is-drawn');
      preload(item, endZ, 64);
      setTimeout(run, 450);
      setTimeout(done, 450 + RISE + CRUISE + 3750);
    };
    const check = () => { if (viewIn && runIn) go(); };
    item.addHandler('fully-loaded-change', e => { if (e.fullyLoaded) { viewIn = true; check(); } });
    warm(item, TX - D - P.x, TY - P.y, TX + c.x - P.x, TY + c.y - P.y).then(() => { runIn = true; check(); });
    setTimeout(go, 5000);
  }
  v.addHandler('open-failed', toStatic);

  addEventListener('resize', () => {
    place();
    if (!root.classList.contains('door-done') || !v.world.getItemAt(0)) return;
    v.viewport.fitBounds(endView(v.viewport), true);
  });
})();
