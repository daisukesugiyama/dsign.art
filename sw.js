/* dsign.art をこの端末に保存して、電波がなくても見られるようにする。
   offline.html で「保存する」を押した端末だけで動く（ほかの人の閲覧には関係しない）。
   保存そのものは offline.html のページが行う（iOS は長く動く service worker を止めるため）。
   つながるときはいつもどおりネットから読み、つながらないときだけ保存した分を出す。 */
const CACHE = 'dsign-offline-v1';
const TIMEOUT = 3500;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

function withTimeout(p, ms) {
  return new Promise((ok, ng) => {
    const t = setTimeout(() => ng(new Error('timeout')), ms);
    p.then(r => { clearTimeout(t); ok(r); }, err => { clearTimeout(t); ng(err); });
  });
}

async function fromCache(req) {
  const c = await caches.open(CACHE);
  const url = new URL(req.url);
  let hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  if (url.origin === location.origin) {
    let path = url.pathname;
    if (path.endsWith('/')) path += 'index.html';
    hit = await c.match(location.origin + path, { ignoreSearch: true, ignoreVary: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      return (await c.match(location.origin + '/home.html')) || Response.error();
    }
  }
  return null;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ours && !font) return; // 解析の数行などは触らない（電波がなければ失敗するだけ）
  if (url.pathname === '/sw.js') return;
  if (req.cache === 'reload') return; // offline.html の保存は、そのままネットへ
  e.respondWith((async () => {
    try {
      return await withTimeout(fetch(req), TIMEOUT);
    } catch (err) {
      const hit = await fromCache(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
