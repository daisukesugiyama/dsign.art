/* D.sign — full-size viewer for a work (OpenSeadragon underneath).
   From the whole down to full size: one pixel of the data on one pixel of the screen.
   There is no overview map on purpose. Up close the whole is lost, as it is in front
   of the work; the scale bar says only how close you are, in centimetres of the work. */
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
    gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true, pinchToZoom: true, flickEnabled: true, pinchRotate: false },
    gestureSettingsPen: { clickToZoom: true, dblClickToZoom: false, pinchRotate: false },
  });

  const vp = () => v.viewport;
  const imageZoom = () => vp().viewportToImageZoom(vp().getZoom(true));
  const atHome = () => vp().getZoom(true) <= vp().getHomeZoom() * 1.03;
  const isFull = () => host.classList.contains('is-full');

  // the page keeps scrolling with the wheel; the work zooms with a pinch, Ctrl/⌘ + wheel,
  // a click, the buttons — or freely once the viewer fills the screen
  const hint = host.querySelector('.viewer-hint');
  let hintTimer = 0;
  const flashHint = () => {
    if (!hint) return;
    hint.dataset.show = 'true';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hint.dataset.show = 'false'; }, 1500);
  };
  v.addHandler('canvas-scroll', e => {
    const o = e.originalEvent;
    if (isFull() || o.ctrlKey || o.metaKey) return;
    e.preventDefaultAction = true;
    e.preventDefault = false;
    flashHint();
  });
  // no turning or mirroring the work from the keyboard
  v.addHandler('canvas-key', e => {
    const k = e.originalEvent.keyCode;
    if (k === 82 || k === 70 || k === 74 || k === 75) e.preventDefaultAction = true;
  });

  // touch: while the whole is shown, a one-finger swipe scrolls the page;
  // once you have come closer, it moves you across the work
  const setTouch = () => {
    const ta = (isFull() || !atHome()) ? 'none' : 'pan-y';
    if (v.canvas.style.touchAction !== ta) { v.canvas.style.touchAction = ta; v.container.style.touchAction = ta; }
  };

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

  // places that appear when you come close: go there at full size
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
      const r = host.getBoundingClientRect();
      if (b.dataset.name) history.replaceState(null, '', '#' + b.dataset.name);
      if (!isFull() && (r.top < -40 || r.top > innerHeight * 0.3)) {
        host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        setTimeout(() => goTo(x, y), reduce ? 0 : 520);
      } else goTo(x, y);
    });
  });

  v.addHandler('open', () => {
    host.classList.add('is-open');
    const name = decodeURIComponent(location.hash.slice(1));
    if (spots[name]) goTo(...spots[name], true);
    tick();
  });
  v.addHandler('open-failed', () => host.classList.add('is-static'));

  // filling the screen: our own mode, so the controls come along
  const enterFull = () => {
    host.classList.add('is-full');
    document.documentElement.style.overflow = 'hidden';
    if (host.requestFullscreen) host.requestFullscreen().catch(() => {});
    setTimeout(tick, 60);
  };
  const exitFull = () => {
    host.classList.remove('is-full');
    document.documentElement.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setTimeout(tick, 60);
  };
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && isFull()) exitFull(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && isFull()) exitFull(); });

  const act = {
    whole: () => vp().goHome(),
    in: () => { vp().zoomBy(2); vp().applyConstraints(); },
    out: () => { vp().zoomBy(0.5); vp().applyConstraints(); },
    full: () => { vp().zoomTo(vp().imageToViewportZoom(1)); vp().applyConstraints(); },
    screen: () => (isFull() ? exitFull() : enterFull()),
  };
  host.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    act[b.dataset.act]();
    if (b.dataset.act === 'screen') b.setAttribute('aria-pressed', String(isFull()));
  }));
})();
