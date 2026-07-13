(function () {
    const DB_NAME = 'akedata-data-cache';
    const DB_VERSION = 1;
    const RESPONSE_STORE = 'responses';
    const META_STORE = 'meta';
    const VERSION_URL = '/version.json';
    const pendingRequests = new Map();
    const memoryResponses = new Map();

    function registerServiceWorker(version) {
        if (!('serviceWorker' in navigator) || !version) return;
        let reloadingForControl = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloadingForControl || navigator.serviceWorker.controller) {
                const reloadKey = `akedata-sw-controlled-${version.appversion}`;
                if (storage.get(reloadKey) === 'true') return;
                reloadingForControl = true;
                storage.set(reloadKey, 'true');
                location.reload();
            }
        });
        navigator.serviceWorker.register(`/plugin/js/ake-sw.js?v=${encodeURIComponent(version.appversion)}`, { scope: '/' })
            .then(registration => {
                const notify = worker => worker?.postMessage({
                    type: 'AKE_VERSION',
                    cacheVersion: getCacheVersion(version)
                });
                notify(registration.active);
                notify(registration.waiting);
                notify(registration.installing);
                navigator.serviceWorker.ready.then(readyRegistration => notify(readyRegistration.active));
            })
            .catch(error => console.warn('Service Worker 注册失败，原生 public 资源使用浏览器 HTTP 缓存。', error));
    }

    const storage = {
        get(key, fallback = null) {
            try {
                const value = localStorage.getItem(key);
                return value === null ? fallback : value;
            } catch {
                return fallback;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, String(value));
                return true;
            } catch {
                return false;
            }
        },
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch {
                return false;
            }
        },
        getJSON(key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch {
                return fallback;
            }
        }
    };

    window.akeStorage = storage;

    function validVersion(value) {
        return value &&
            typeof value.appversion === 'string' &&
            typeof value.gameversion === 'string' &&
            typeof value.hotfixversion === 'string' &&
            typeof value.updatedAt === 'string';
    }

    function getCacheVersion(version) {
        return version ? `${version.gameversion}|${version.hotfixversion}` : '';
    }

    async function loadVersion() {
        try {
            let version = window.__akeBootstrapVersion;
            if (!version) {
                const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                version = await response.json();
            }
            if (!validVersion(version)) throw new Error('版本文件格式无效');
            window.akeVersion = Object.freeze(version);
            return version;
        } catch (error) {
            console.warn('无法读取 version.json，持久数据缓存已停用。', error);
            window.akeVersion = null;
            return null;
        }
    }

    function openDatabase() {
        if (!('indexedDB' in window)) return Promise.resolve(null);
        return new Promise(resolve => {
            const timeout = setTimeout(() => resolve(null), 3000);
            let request;
            try {
                request = indexedDB.open(DB_NAME, DB_VERSION);
            } catch {
                resolve(null);
                return;
            }
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(RESPONSE_STORE)) {
                    const store = db.createObjectStore(RESPONSE_STORE, { keyPath: 'key' });
                    store.createIndex('cacheVersion', 'cacheVersion', { unique: false });
                    store.createIndex('url', 'url', { unique: false });
                }
                if (!db.objectStoreNames.contains(META_STORE)) {
                    db.createObjectStore(META_STORE, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => { clearTimeout(timeout); resolve(request.result); };
            request.onerror = () => { clearTimeout(timeout); resolve(null); };
            request.onblocked = () => { clearTimeout(timeout); resolve(null); };
        });
    }

    function idbRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function prepareDatabase(db, cacheVersion) {
        if (!db || !cacheVersion) return null;
        try {
            const readTx = db.transaction(META_STORE, 'readonly');
            const meta = await idbRequest(readTx.objectStore(META_STORE).get('activeCacheVersion'));
            if (meta?.value === cacheVersion) return db;
            await new Promise((resolve, reject) => {
                const tx = db.transaction([RESPONSE_STORE, META_STORE], 'readwrite');
                tx.objectStore(RESPONSE_STORE).clear();
                tx.objectStore(META_STORE).put({ key: 'activeCacheVersion', value: cacheVersion });
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
            return db;
        } catch (error) {
            console.warn('IndexedDB 缓存初始化失败，本次访问使用网络缓存。', error);
            return null;
        }
    }

    function normalizeUrl(resource) {
        const raw = typeof resource === 'string' ? resource : resource?.url;
        if (!raw) return null;
        const url = new URL(raw, window.location.href);
        url.searchParams.delete('t');
        url.searchParams.delete('v');
        return url;
    }

    function shouldPersist(resource, init) {
        const method = String(init?.method || (typeof resource !== 'string' ? resource?.method : '') || 'GET').toUpperCase();
        const url = normalizeUrl(resource);
        return method === 'GET' && url?.origin === window.location.origin && url.pathname.startsWith('/public/');
    }

    function responseFromRecord(record) {
        return new Response(record.body, {
            status: 200,
            headers: { 'Content-Type': record.contentType || 'application/octet-stream' }
        });
    }

    async function readRecord(db, key) {
        if (!db) return null;
        try {
            const tx = db.transaction(RESPONSE_STORE, 'readonly');
            return await idbRequest(tx.objectStore(RESPONSE_STORE).get(key));
        } catch {
            return null;
        }
    }

    async function writeRecord(db, record) {
        if (!db) return;
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(RESPONSE_STORE, 'readwrite');
                tx.objectStore(RESPONSE_STORE).put(record);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } catch (error) {
            console.warn(`无法缓存 ${record.url}`, error);
        }
    }

    const versionPromise = loadVersion();
    versionPromise.then(registerServiceWorker);
    const databasePromise = Promise.all([versionPromise, openDatabase()]).then(async ([version, db]) => ({
        version,
        db: await Promise.race([
            prepareDatabase(db, getCacheVersion(version)),
            new Promise(resolve => setTimeout(() => resolve(null), 5000))
        ])
    }));

    window.akeVersionReady = versionPromise;
    window.akeCacheReady = databasePromise;

    window.akeFetch = async function (resource, init) {
        const version = await versionPromise;
        const requestInit = init ? { ...init } : {};
        const url = normalizeUrl(resource);
        const cacheable = Boolean(version && shouldPersist(resource, requestInit));
        const canonicalUrl = url ? url.pathname + url.search : String(resource);
        const cacheVersion = getCacheVersion(version);
        const key = cacheable ? `${cacheVersion}|${canonicalUrl}` : '';

        if (cacheable) {
            if (memoryResponses.has(key)) return responseFromRecord(memoryResponses.get(key));
            if (pendingRequests.has(key)) return responseFromRecord(await pendingRequests.get(key));
            const { db } = await databasePromise;
            const cached = await readRecord(db, key);
            if (cached) return responseFromRecord(cached);
        }

        const requestUrl = typeof resource === 'string' && version
            ? (() => {
                const versioned = new URL(resource, window.location.href);
                if (versioned.origin === window.location.origin) versioned.searchParams.set('v', version.appversion);
                return versioned.origin === window.location.origin ? versioned.pathname + versioned.search + versioned.hash : versioned.href;
            })()
            : resource;
        const headers = new Headers(requestInit.headers || {});
        if (cacheable) headers.set('X-AKE-Page-Cache', '1');
        const response = await fetch(requestUrl, { ...requestInit, headers, cache: requestInit.cache || 'no-cache' });

        if (cacheable && response.ok) {
            const recordPromise = response.clone().blob().then(async body => {
                const record = {
                    key,
                    cacheVersion,
                    url: canonicalUrl,
                    body,
                    contentType: response.headers.get('Content-Type') || body.type || 'application/octet-stream',
                    storedAt: Date.now()
                };
                memoryResponses.set(key, record);
                const { db } = await databasePromise;
                void writeRecord(db, record);
                return record;
            });
            pendingRequests.set(key, recordPromise);
            recordPromise.finally(() => pendingRequests.delete(key));
        }
        return response;
    };

    window.akeDataCache = {
        ready: databasePromise,
        async clear() {
            memoryResponses.clear();
            const { db } = await databasePromise;
            if (!db) return false;
            try {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(RESPONSE_STORE, 'readwrite');
                    tx.objectStore(RESPONSE_STORE).clear();
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
                return true;
            } catch {
                return false;
            }
        },
        estimate() {
            return navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve({ usage: 0, quota: 0 });
        }
    };
})();
