const DB_NAME = 'akedata-data-cache';
const DB_VERSION = 1;
const RESPONSE_STORE = 'responses';
const META_STORE = 'meta';
let hotfixVersion = '';
let forceRefreshTimestamp = '';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        await self.clients.claim();
    })());
});

self.addEventListener('message', event => {
    if (event.data?.type === 'AKE_VERSION' && typeof event.data.publicCacheVersion === 'string') {
        hotfixVersion = typeof event.data.hotfixVersion === 'string' ? event.data.hotfixVersion : '';
        forceRefreshTimestamp = typeof event.data.forceRefreshTimestamp === 'string' ? event.data.forceRefreshTimestamp : '';
        if (event.source) event.source.postMessage({ type: 'AKE_VERSION_READY', publicCacheVersion: event.data.publicCacheVersion });
    }
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/public/')) return;
    if (request.headers.get('X-AKE-Page-Cache') === '1') return;
    const responsePromise = cachePublicResource(request, url);
    event.respondWith(responsePromise);
    event.waitUntil(responsePromise.then(() => undefined, () => undefined));
});

function openDatabase() {
    return new Promise(resolve => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(RESPONSE_STORE)) {
                const store = db.createObjectStore(RESPONSE_STORE, { keyPath: 'key' });
                store.createIndex('cacheVersion', 'cacheVersion', { unique: false });
                store.createIndex('url', 'url', { unique: false });
            }
            if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function readActiveVersion() {
    const db = await openDatabase();
    if (!db) return '';
    try {
        const tx = db.transaction(META_STORE, 'readonly');
        const record = await requestResult(tx.objectStore(META_STORE).get('activePublicCacheVersion'));
        return record?.value || '';
    } catch {
        return '';
    } finally {
        db.close();
    }
}

function canonicalPath(url) {
    const clean = new URL(url.href);
    clean.searchParams.delete('t');
    clean.searchParams.delete('v');
    return clean.pathname + clean.search;
}

function responseFromRecord(record) {
    return new Response(record.body, {
        status: 200,
        headers: { 'Content-Type': record.contentType || 'application/octet-stream' }
    });
}

async function getRecord(db, key) {
    try {
        const tx = db.transaction(RESPONSE_STORE, 'readonly');
        return await requestResult(tx.objectStore(RESPONSE_STORE).get(key));
    } catch {
        return null;
    }
}

async function putRecord(db, record) {
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(RESPONSE_STORE, 'readwrite');
            tx.objectStore(RESPONSE_STORE).put(record);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } catch {
        // Cache writes are best effort and must not break resource loading.
    }
}

async function cachePublicResource(request, url) {
    const activeCacheVersion = await readActiveVersion();
    if (!activeCacheVersion) return fetch(request);
    const canonicalUrl = canonicalPath(url);
    const key = `${activeCacheVersion}|${canonicalUrl}`;
    const db = await openDatabase();
    if (!db) return fetch(request);
    try {
        const cached = forceRefreshTimestamp ? null : await getRecord(db, key);
        if (cached) {
            db.close();
            return responseFromRecord(cached);
        }
        const requestUrl = new URL(request.url);
        const activeHotfixVersion = hotfixVersion || activeCacheVersion.slice(activeCacheVersion.lastIndexOf('|') + 1);
        if (activeHotfixVersion) requestUrl.searchParams.set('v', activeHotfixVersion);
        if (forceRefreshTimestamp) requestUrl.searchParams.set('t', forceRefreshTimestamp);
        const response = await fetch(new Request(requestUrl.href, request), forceRefreshTimestamp ? { cache: 'no-store' } : undefined);
        if (response.ok) {
            const body = await response.clone().blob();
            await putRecord(db, {
                key,
                cacheVersion: activeCacheVersion,
                url: canonicalUrl,
                body,
                contentType: response.headers.get('Content-Type') || body.type || 'application/octet-stream',
                storedAt: Date.now()
            });
            db.close();
        } else {
            db.close();
        }
        return response;
    } catch (error) {
        db.close();
        throw error;
    }
}
