const startupConfig = new URL(self.location.href).searchParams;
let dataBaseUrl = String(startupConfig.get('dataBaseUrl') || '').replace(/\/$/, '');
let sharedRevision = String(startupConfig.get('sharedRevision') || '');
let forceRefreshTimestamp = String(startupConfig.get('forceRefreshTimestamp') || '');

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
    const isMainHudAsset = url.pathname.startsWith('/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/mainhud/');
    const target = new URL(isMainHudAsset ? url.pathname : url.pathname + url.search, `${dataBaseUrl}/`);
    if (!isMainHudAsset && sharedRevision) target.searchParams.set('v', sharedRevision);
    if (!isMainHudAsset && forceRefreshTimestamp) target.searchParams.set('t', forceRefreshTimestamp);
    event.respondWith(fetch(new Request(target.href, request), !isMainHudAsset && forceRefreshTimestamp ? { cache: 'no-store' } : undefined));
});
