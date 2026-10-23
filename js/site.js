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
