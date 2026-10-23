/* D.sign — full-size viewer for a work (OpenSeadragon underneath).
   From the whole down to full size: one pixel of the data on one pixel of the screen.
   There is no overview map on purpose. Up close the whole is lost, as it is in front
   of the work; the scale bar says only how close you are, in centimetres of the work.

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
    zoomPerClick: 2,
    imageLoaderLimit: 8,
    timeout: 60000,
    gestureSettingsMouse: { clickToZoom: true, dblClickToZoom: false, scrollToZoom: true, flickEnabled: true, pinchRotate: false },
    gestureSettingsTouch: Object.assign({}, FINGERS_PAGE),
    gestureSettingsPen: { clickToZoom: true, dblClickToZoom: false, pinchRotate: false },
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
    hintTimer = setTimeout(() => { hint.dataset.show = 'false'; }, kind === 'touch' ? 2400 : 1500);
  };

  // the wheel keeps scrolling the page; the work zooms with Ctrl/⌘ + wheel, a trackpad pinch,
  // a click, the buttons — or freely once the viewer fills the screen
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
  // filling the screen gives every gesture to the work
  const setTouch = () => {
    const ta = isFull() ? 'none' : 'pan-y';
    if (v.canvas.style.touchAction !== ta) { v.canvas.style.touchAction = ta; v.container.style.touchAction = ta; }
  };

  // on the page, fingers that try to move the work get told where that happens
  const isTouch = e => (e.pointerType || (e.originalEvent && e.originalEvent.pointerType)) === 'touch';
  // a tap on the picture opens it to the full screen
  v.addHandler('canvas-click', e => { if (!isFull() && isTouch(e) && e.quick) enterFull(); });
  let draggedHint = false;
  v.addHandler('canvas-drag', e => { if (!isFull() && isTouch(e) && !draggedHint) { draggedHint = true; flashHint('touch'); } });
  v.addHandler('canvas-release', () => { draggedHint = false; });

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
  const fullMark = host.querySelector('.scale-full');
  const NICE = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  const fmt = cm => cm < 1 ? `${+(cm * 10).toFixed(1)} mm` : `${cm} cm`;
  const updateScale = () => {
    if (!bar) return;
    const cmPerScreenPx = CM_PER_PX / imageZoom();
    let len = NICE[NICE.length - 1];
    for (const n of NICE) { if (n / cmPerScreenPx >= 60) { len = n; break; } }
    bar.style.width = `${Math.round(len / cmPerScreenPx)}px`;
    barLabel.textContent = fmt(len);
    if (fullMark) fullMark.dataset.on = String(imageZoom() >= 0.97);
  };

  const tick = () => { updateScale(); setTouch(); };
  v.addHandler('animation', tick);
  v.addHandler('animation-finish', tick);
  v.addHandler('resize', tick);

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
    const back = () => scrollTo(0, keepY);
    back(); requestAnimationFrame(back); setTimeout(back, 150);
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
    in: () => { vp().zoomBy(2); vp().applyConstraints(); },
    out: () => { vp().zoomBy(0.5); vp().applyConstraints(); },
    full: () => { vp().zoomTo(vp().imageToViewportZoom(1)); vp().applyConstraints(); },
    screen: () => (isFull() ? closeFull() : enterFull()),
    close: () => closeFull(),
  };
  host.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act[b.dataset.act]()));
})();
