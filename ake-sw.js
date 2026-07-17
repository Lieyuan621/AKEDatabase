let dataBaseUrl = '';
let sharedRevision = '';
let forceRefreshTimestamp = '';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('message', event => {
    if (event.data?.type !== 'AKE_VERSION') return;
    dataBaseUrl = String(event.data.dataBaseUrl || '').replace(/\/$/, '');
    sharedRevision = String(event.data.sharedRevision || '');
    forceRefreshTimestamp = String(event.data.forceRefreshTimestamp || '');
    event.source?.postMessage({ type: 'AKE_VERSION_READY' });
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/public/images/')) return;
    if (!dataBaseUrl || new URL(dataBaseUrl).origin === self.location.origin) return;
    const target = new URL(url.pathname + url.search, `${dataBaseUrl}/`);
    if (sharedRevision) target.searchParams.set('v', sharedRevision);
    if (forceRefreshTimestamp) target.searchParams.set('t', forceRefreshTimestamp);
    event.respondWith(fetch(new Request(target.href, request), forceRefreshTimestamp ? { cache: 'no-store' } : undefined));
});
