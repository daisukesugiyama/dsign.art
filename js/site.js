/* D.sign — shared behaviour: language (ja / en / zh) and the menu on small screens.
   The language is first decided by a tiny inline script in each page's <head>
   (so the right text is there at first paint); this file wires the switches. */
(() => {
  const root = document.documentElement;
  const LANGS = ['ja', 'en', 'zh'];

  const set = (l, remember = true) => {
    if (!LANGS.includes(l)) return;
    root.dataset.lang = l;
    root.lang = l === 'zh' ? 'zh-Hans' : l;
    document.querySelectorAll('[data-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.set === l)));
    const t = root.getAttribute('data-title-' + l);
    if (t) document.title = t;
    document.querySelectorAll('[data-alt-' + l + ']').forEach(i => { i.alt = i.getAttribute('data-alt-' + l); });
    document.querySelectorAll('[data-label-' + l + ']').forEach(i => { i.setAttribute('aria-label', i.getAttribute('data-label-' + l)); });
    if (remember) { try { localStorage.setItem('dsign-lang', l); } catch (e) {} }
    document.dispatchEvent(new CustomEvent('dsign:lang', { detail: l }));
  };
  document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => set(b.dataset.set)));
  set(root.dataset.lang || 'ja', false);

  // the page itself never zooms: it is laid out like the work, and coming closer happens in
  // the work. CSS (touch-action) stops pinch and double-tap zoom; iOS Safari also needs this.
  // One gap is left that no page can close: while the page is still gliding after a flick, iOS
  // Safari keeps the fingers to itself (a WebKit bug), so a pinch right then zooms the page.
  // If that happens, the page is marked html.is-zoomed and nothing holds the fingers back, so it
  // can be pinched or double-tapped back to 1×; there it locks again.
  const vv = window.visualViewport;
  let zoomed = false;
  const syncZoom = () => {
    const z = !!vv && vv.scale > 1.01;
    if (z === zoomed) return;
    zoomed = z;
    root.classList.toggle('is-zoomed', z);
    document.dispatchEvent(new CustomEvent('dsign:zoom', { detail: z }));
  };
  if (vv) {
    vv.addEventListener('resize', syncZoom);
    vv.addEventListener('scroll', syncZoom);
    addEventListener('pageshow', syncZoom);
    syncZoom();
  }
  if ('ongesturestart' in window) {
    const stop = e => { if (!zoomed) e.preventDefault(); };
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    let last = 0, lx = 0, ly = 0;
    document.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      if (!t) return;
      const quick = e.timeStamp - last < 350 && Math.hypot(t.clientX - lx, t.clientY - ly) < 40;
      if (quick && !zoomed && !e.target.closest('a,button,input,textarea,select,label,.openseadragon-container,.stage')) e.preventDefault();
      last = e.timeStamp; lx = t.clientX; ly = t.clientY;
    }, { passive: false });
  }

  // two fingers on a picture: a closer look for a moment; it settles back when they are lifted
  // (not while the page is zoomed: then two fingers are for pinching the page back)
  document.querySelectorAll('[data-peek]').forEach(img => {
    let g = null;
    const mid = (a, b) => [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2];
    const gap = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    img.addEventListener('touchstart', e => {
      if (e.touches.length !== 2 || zoomed) return;
      e.preventDefault();
      const [a, b] = e.touches, r = img.getBoundingClientRect(), m = mid(a, b);
      g = { d: gap(a, b) || 1, m };
      img.style.transition = 'none';
      img.style.transformOrigin = `${m[0] - r.left}px ${m[1] - r.top}px`;
      img.classList.add('is-peek');
    }, { passive: false });
    img.addEventListener('touchmove', e => {
      if (!g || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = e.touches, m = mid(a, b);
      const s = Math.min(4, Math.max(1, gap(a, b) / g.d));
      img.style.transform = `translate(${m[0] - g.m[0]}px, ${m[1] - g.m[1]}px) scale(${s})`;
    }, { passive: false });
    const settle = e => {
      if (!g || e.touches.length >= 2) return;
      g = null;
      img.style.transition = 'transform .38s cubic-bezier(.2,.7,.2,1)';
      img.style.transform = '';
      setTimeout(() => { if (!g) img.classList.remove('is-peek'); }, 400);
    };
    img.addEventListener('touchend', settle);
    img.addEventListener('touchcancel', settle);
  });

  // menu (small screens): one button opens the whole list
  const menu = document.querySelector('.site-nav');
  const toggle = document.querySelector('.menu-toggle');
  if (menu && toggle) {
    const close = () => { menu.dataset.open = 'false'; toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', () => {
      const open = menu.dataset.open !== 'true';
      menu.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  }
})();
