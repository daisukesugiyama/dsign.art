/* D.sign — full-size viewer for a work (OpenSeadragon underneath).
   From the whole down to full size — one pixel of the data on one pixel of the screen — and on to
   the pixels themselves. There is no overview map on purpose. Up close the whole is lost, as it is
   in front of the work; the scale bar says how big what you see is, in centimetres of the work, and
   the ruler beside it says where you stand between the whole and the pixels.

   The mouse: a click comes one stop closer. At the pixels the next click steps back to the whole,
   so a click never goes dead, and the pointer shows which it will be (a magnifier with + or −).
   Shift or ⌥ with a click steps back one stop.

   Fingers: on the page, the page comes first. One finger always scrolls the page and never
   moves the work; two fingers let you look closer for a moment, and the work settles back to
   the whole when they leave. "Fill the screen" is where the fingers move about in the work
   itself, and "back" (or the phone's own back) returns to the page. The page never zooms. */
(() => {
  const host = document.querySelector('[data-viewer]');
  if (!host) return;
  const OSD = window.OpenSeadragon;
  if (!OSD) { host.classList.add('is-static'); return; }

  const stage = host.querySelector('.viewer-stage');
  const W = +host.dataset.w;            // data width in px
  const CM = +host.dataset.cm;          // width of the work at full size, in cm
  const CM_PER_PX = CM / W;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;   // a phone or a tablet: fingers first
  if (coarse) host.classList.add('is-touch');

  // what fingers may do: on the page only a closer look; filling the screen hands them the work
  const FINGERS_PAGE = { dragToPan: false, flickEnabled: false, pinchToZoom: true, zoomToRefPoint: true,
    clickToZoom: false, dblClickToZoom: false, dblClickDragToZoom: false, scrollToZoom: false, pinchRotate: false };
  const FINGERS_FULL = { dragToPan: true, flickEnabled: true, pinchToZoom: true, zoomToRefPoint: true,
    clickToZoom: false, dblClickToZoom: true, dblClickDragToZoom: true, scrollToZoom: false, pinchRotate: false };

  const v = OSD({
    element: stage,
    tileSources: host.dataset.dzi,
    showNavigationControl: false,
    showNavigator: false,
    drawer: 'canvas',
    animationTime: reduce ? 0.01 : 1.1,
    springStiffness: 7.5,
    blendTime: 0.15,
    maxZoomPixelRatio: 2,
    minZoomImageRatio: 0.85,
    visibilityRatio: 0.5,
    constrainDuringPan: true,
    zoomPerScroll: 1.25,
    imageLoaderLimit: 8,
    timeout: 60000,
    // clicks with a mouse or a pen go stop by stop along the ruler (below), not by a fixed factor
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false, scrollToZoom: true, flickEnabled: true, pinchRotate: false },
    gestureSettingsTouch: Object.assign({}, FINGERS_PAGE),
    gestureSettingsPen: { clickToZoom: false, dblClickToZoom: false, pinchRotate: false },
  });

  const vp = () => v.viewport;
  const imageZoom = () => vp().viewportToImageZoom(vp().getZoom(true));
  const isFull = () => host.classList.contains('is-full');
  const setFingers = full => Object.assign(v.gestureSettingsTouch, full ? FINGERS_FULL : FINGERS_PAGE);

  // a short word in the middle of the work: how to come closer with what is in your hand
  const hint = host.querySelector('.viewer-hint');
  let hintTimer = 0;
  const flashHint = kind => {
    if (!hint) return;
    hint.dataset.for = kind;
    hint.dataset.show = 'true';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hint.dataset.show = 'false'; }, kind === 'wheel' ? 1500 : 2400);
  };

  // the wheel keeps scrolling the page; the work zooms with Ctrl/⌘ + wheel, a trackpad pinch,
  // a click, the ruler — or freely once the viewer fills the screen
  v.addHandler('canvas-scroll', e => {
    const o = e.originalEvent;
    if (isFull() || o.ctrlKey || o.metaKey) return;
    e.preventDefault = false;
    e.preventDefaultAction = true;
    flashHint('wheel');
  });
  // no turning or mirroring the work from the keyboard
  v.addHandler('canvas-key', e => {
    const k = e.originalEvent.keyCode;
    if (k === 82 || k === 70 || k === 74 || k === 75) e.preventDefaultAction = true;
  });

  // touch-action: on the page a finger scrolls it up and down (and nothing else);
  // filling the screen gives every gesture to the work. If iOS let the page itself get zoomed
  // (see site.js), the fingers go back to the browser here too, so the page can be pinched back.
  const pageZoomed = () => document.documentElement.classList.contains('is-zoomed');
  const setTouch = () => {
    const ta = isFull() ? 'none' : pageZoomed() ? 'auto' : 'pan-y';
    if (v.canvas.style.touchAction !== ta) { v.canvas.style.touchAction = ta; v.container.style.touchAction = ta; }
  };
  document.addEventListener('dsign:zoom', setTouch);

  // ---------- where you stand: the ruler under the work ----------
  // Stops, from far to near: the whole, halvings of full size, full size, the pixels (the closest
  // the viewer goes, two screen pixels to one of the data). The ruler is drawn in steps of halving,
  // so each stop sits as far from the next as it looks.
  const track = host.querySelector('.track');
  const here = host.querySelector('.here');
  const stepOut = host.querySelector('.step[data-act="out"]');
  const stepIn = host.querySelector('.step[data-act="in"]');
  const major = {};
  host.querySelectorAll('.stop[data-stop]').forEach(b => { major[b.dataset.stop] = b; });
  let stops = [], minors = [];
  const ZH = { 2: '二', 4: '四', 8: '八', 16: '十六', 32: '三十二' };
  const FRACTION = { 2: '½', 4: '¼', 8: '⅛' };
  const near = (a, b) => Math.abs(Math.log2(a / b)) < 0.06;            // within about 4%
  const nextStop = z => stops.find(s => s > z * 1.06);
  const prevStop = z => { for (let i = stops.length - 1; i >= 0; i--) if (stops[i] < z / 1.06) return stops[i]; };
  const at = z => Math.min(1, Math.max(0, Math.log2(z / stops[0]) / (Math.log2(stops[stops.length - 1] / stops[0]) || 1)));
  const place = (el, z) => { el.style.left = `${(at(z) * 100).toFixed(3)}%`; };

  const goStop = (s, ref) => {
    if (!stops.length || !(s > 0)) return;
    if (s <= stops[0] * 1.001) { vp().goHome(); return; }
    vp().zoomTo(vp().imageToViewportZoom(s), ref || null);
    vp().applyConstraints();
  };

  const build = () => {
    if (!track || !v.world.getItemCount()) return;
    const home = vp().viewportToImageZoom(vp().getHomeZoom());
    const max = vp().viewportToImageZoom(vp().getMaxZoom());
    const halves = [];
    for (let s = 0.5; s > home * 1.3; s /= 2) halves.unshift(s);
    stops = [home, ...halves, 1, max];
    if (minors.length !== halves.length) {      // the small ticks between: how many depends on the screen
      minors.forEach(b => b.remove());
      const lang = document.documentElement.dataset.lang || 'ja';
      minors = halves.map(s => {
        const d = Math.round(1 / s), b = document.createElement('button'), t = document.createElement('span');
        b.type = 'button';
        b.className = 'stop minor';
        b.dataset.labelJa = `原寸の${d}分の1`;
        b.dataset.labelEn = `1/${d} of full size`;
        b.dataset.labelZh = `原尺寸的${ZH[d] || d}分之一`;
        b.setAttribute('aria-label', b.getAttribute('data-label-' + lang) || b.dataset.labelJa);
        t.className = 'lbl';
        t.textContent = FRACTION[d] || `1/${d}`;
        b.append(t);
        b.addEventListener('click', () => goStop(+b.dataset.z));
        track.insertBefore(b, major.full);
        return b;
      });
    }
    minors.forEach((b, i) => { b.dataset.z = halves[i]; place(b, halves[i]); });
    [[major.whole, home], [major.full, 1], [major.pixel, max]].forEach(([b, z]) => { if (b) { b.dataset.z = z; place(b, z); } });
    fitLabels();
  };
  // the words under the ruler must not run into each other: on a short ruler,
  // "full size" steps to the left of its tick
  const fitLabels = () => {
    const f = major.full, p = major.pixel;
    if (!f || !p) return;
    f.classList.remove('tuck');
    const a = f.querySelector('.lbl').getBoundingClientRect(), b = p.querySelector('.lbl').getBoundingClientRect();
    if (a.width && a.right > b.left - 8) f.classList.add('tuck');
  };
  document.addEventListener('dsign:lang', () => requestAnimationFrame(fitLabels));
  if (document.fonts) document.fonts.ready.then(fitLabels);

  // the mouse pointer says what a click will do; Shift or ⌥ held turns it to stepping back
  let back = false;
  const setClick = () => {
    if (!stops.length) return;
    host.dataset.click = back || nextStop(imageZoom()) === undefined ? 'out' : 'in';
  };
  const holdBack = e => { const b = !!(e.shiftKey || e.altKey); if (b !== back) { back = b; setClick(); } };
  addEventListener('keydown', holdBack);
  addEventListener('keyup', holdBack);
  stage.addEventListener('pointermove', holdBack);
  addEventListener('blur', () => { back = false; setClick(); });

  const updateRuler = () => {
    if (!stops.length) return;
    const z = imageZoom();
    if (here) place(here, z);
    [major.whole, ...minors, major.full, major.pixel].forEach(b => { if (b) b.setAttribute('aria-current', String(near(+b.dataset.z, z))); });
    if (stepOut) stepOut.setAttribute('aria-disabled', String(prevStop(z) === undefined));
    if (stepIn) stepIn.setAttribute('aria-disabled', String(nextStop(z) === undefined));
    setClick();
  };
  host.querySelectorAll('.stop.major').forEach(b => b.addEventListener('click', () => goStop(+b.dataset.z)));

  // a click: one stop closer; at the pixels, back to the whole (the first time, a word says so)
  let toldEnd = false;
  v.addHandler('canvas-click', e => {
    const o = e.originalEvent || {};
    if (o.pointerType === 'touch' || !e.quick) return;    // fingers have their own ways (below)
    e.preventDefaultAction = true;
    const z = imageZoom(), ref = vp().pointFromPixel(e.position, true);
    if (e.shift || o.altKey) { goStop(prevStop(z), ref); return; }
    const s = nextStop(z);
    if (s === undefined) { vp().goHome(); return; }
    goStop(s, ref);
    if (s === stops[stops.length - 1] && !toldEnd) { toldEnd = true; setTimeout(() => flashHint('end'), 700); }
  });

  // on the page, fingers that try to move the work get told where that happens
  const isTouch = e => (e.pointerType || (e.originalEvent && e.originalEvent.pointerType)) === 'touch';
  // a tap on the picture opens it to the full screen
  v.addHandler('canvas-click', e => { if (!isFull() && isTouch(e) && e.quick) enterFull(); });
  let draggedHint = false;
  v.addHandler('canvas-drag', e => {
    if (!isTouch(e)) { host.classList.add('is-dragging'); return; }
    if (!isFull() && !draggedHint) { draggedHint = true; flashHint('touch'); }
  });
  v.addHandler('canvas-release', () => { draggedHint = false; host.classList.remove('is-dragging'); });

  // two fingers on the page: spreading them opens the picture to the full screen, at the place
  // and the closeness the fingers chose; a small or backward pinch just settles back
  const down = new Set();
  let settleTimer = 0, pinched = false;
  addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !v.container.contains(e.target)) return;
    down.add(e.pointerId);
    if (down.size > 1) pinched = true;
    clearTimeout(settleTimer);
  }, true);
  const awayFromWhole = () => {
    const z = vp().getZoom(true) / vp().getHomeZoom();
    const c = vp().getCenter(true), h = vp().getHomeBounds().getCenter();
    const tol = 0.004 / Math.max(z, 1);
    return Math.abs(z - 1) > 0.02 || Math.abs(c.x - h.x) > tol || Math.abs(c.y - h.y) > tol;
  };
  const lift = e => {
    if (!down.delete(e.pointerId) || down.size) return;
    const was = pinched;
    pinched = false;
    if (!was || isFull()) return;
    settleTimer = setTimeout(() => {
      if (isFull() || down.size) return;
      if (vp().getZoom(true) / vp().getHomeZoom() > 1.12) enterFullHere();
      else if (awayFromWhole()) vp().goHome();
    }, 160);
  };
  addEventListener('pointerup', lift, true);
  addEventListener('pointercancel', lift, true);

  // scale bar, in centimetres of the work
  const bar = host.querySelector('.scale-bar');
  const barLabel = host.querySelector('.scale-label');
  const NICE = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  const fmt = cm => cm < 1 ? `${+(cm * 10).toFixed(1)} mm` : `${cm} cm`;
  const updateScale = () => {
    if (!bar) return;
    const cmPerScreenPx = CM_PER_PX / imageZoom();
    let len = NICE[NICE.length - 1];
    for (const n of NICE) { if (n / cmPerScreenPx >= 60) { len = n; break; } }
    bar.style.width = `${Math.round(len / cmPerScreenPx)}px`;
    barLabel.textContent = fmt(len);
  };

  const tick = () => { updateScale(); setTouch(); updateRuler(); };
  v.addHandler('animation', tick);
  v.addHandler('animation-finish', tick);
  v.addHandler('resize', () => { build(); tick(); });

  // filling the screen: our own mode, so the controls come along. It is a step in the
  // history, so the phone's back gesture returns to the page instead of leaving the site.
  const screenButtons = [...host.querySelectorAll('[data-act="screen"]')];
  let pushed = false, keep = null, keepY = 0;
  const enterFull = (push = true) => {
    if (isFull()) return;
    // hold the viewer's place in the page, so the page stays where it was underneath
    keepY = scrollY;
    const h = host.offsetHeight;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';   // we put the page back ourselves
    keep = document.createElement('div');
    keep.style.height = `${h}px`;
    host.before(keep);
    host.classList.add('is-full');
    document.documentElement.style.overflow = 'hidden';
    setFingers(true);
    screenButtons.forEach(b => b.setAttribute('aria-pressed', 'true'));
    if (push) { try { history.pushState({ dsignFull: true }, ''); pushed = true; } catch (e) {} }
    // on a computer the browser's own full screen too; on a phone the page already fills it
    if (!coarse && host.requestFullscreen) host.requestFullscreen().catch(() => {});
    setTimeout(tick, 60);
  };
  const exitFull = () => {
    if (!isFull()) return;
    host.classList.remove('is-full');
    document.documentElement.style.overflow = '';
    if (keep) { keep.remove(); keep = null; }
    const restore = () => scrollTo(0, keepY);
    restore(); requestAnimationFrame(restore); setTimeout(restore, 150);
    setTimeout(() => { if ('scrollRestoration' in history) history.scrollRestoration = 'auto'; }, 200);
    setFingers(false);
    screenButtons.forEach(b => b.setAttribute('aria-pressed', 'false'));
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (coarse) setTimeout(() => vp().goHome(true), 60);   // the page shows the whole again
    setTimeout(tick, 60);
  };
  const closeFull = () => { if (pushed) history.back(); else exitFull(); };
  // into the full screen without losing the place: the same point, the same closeness
  const enterFullHere = () => {
    const c = vp().getCenter(true), z = imageZoom();
    enterFull();
    const put = () => { vp().panTo(c, true); vp().zoomTo(vp().imageToViewportZoom(z), null, true); vp().applyConstraints(true); tick(); };
    v.addOnceHandler('resize', () => setTimeout(put, 0));
    setTimeout(put, 120);
  };
  addEventListener('popstate', () => { if (isFull()) { pushed = false; exitFull(); } });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && isFull()) closeFull(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && isFull()) closeFull(); });

  // places that appear when you come close: go there at full size
  // (with fingers, the place opens filling the screen, where the fingers can move about)
  const goTo = (x, y, now) => {
    const p = vp().imageToViewportCoordinates(x, y);
    vp().panTo(p, now);
    vp().zoomTo(vp().imageToViewportZoom(1), null, now);
  };
  const spots = {};
  document.querySelectorAll('[data-spot]').forEach(b => {
    const [x, y] = b.dataset.spot.split(',').map(Number);
    if (b.dataset.name) spots[b.dataset.name] = [x, y];
    b.addEventListener('click', e => {
      e.preventDefault();
      if (b.dataset.name) history.replaceState(history.state, '', '#' + b.dataset.name);
      if (coarse) {
        if (!isFull()) enterFull();
        setTimeout(() => goTo(x, y), 80);
        return;
      }
      const r = host.getBoundingClientRect();
      if (!isFull() && (r.top < -40 || r.top > innerHeight * 0.3)) {
        host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        setTimeout(() => goTo(x, y), reduce ? 0 : 520);
      } else goTo(x, y);
    });
  });

  v.addHandler('open', () => {
    host.classList.add('is-open');
    build();
    const name = decodeURIComponent(location.hash.slice(1));
    if (spots[name]) {
      if (coarse) { enterFull(false); setTimeout(() => goTo(...spots[name], true), 80); }
      else goTo(...spots[name], true);
    }
    tick();
  });
  v.addHandler('open-failed', () => host.classList.add('is-static'));

  const act = {
    whole: () => vp().goHome(),
    in: () => goStop(nextStop(imageZoom())),
    out: () => goStop(prevStop(imageZoom())),
    full: () => goStop(1),
    screen: () => (isFull() ? closeFull() : enterFull()),
    close: () => closeFull(),
  };
  host.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.getAttribute('aria-disabled') !== 'true') act[b.dataset.act]();
  }));
})();
