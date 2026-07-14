(function () {
    const DB_NAME = 'akedata-data-cache';
    const DB_VERSION = 1;
    const RESPONSE_STORE = 'responses';
    const META_STORE = 'meta';
    const VERSION_URL = '/version.json';
    const pendingRequests = new Map();
    const memoryResponses = new Map();
    const progressRequests = new Map();
    let progressSequence = 0;
    let progressHideTimer = null;

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, unit);
        return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
    }

    function renderProgress() {
        const root = document.getElementById('dataLoadProgress');
        const bar = document.getElementById('dataLoadProgressBar');
        const text = document.getElementById('dataLoadProgressText');
        const file = document.getElementById('dataLoadProgressFile');
        if (!root || !bar || !text || !file) return;
        const requests = Array.from(progressRequests.values());
        const showDetails = window.akeData?.getConfig?.().showHidden === true;
        const active = requests.filter(request => !request.done);
        const completed = requests.length - active.length;
        const failed = requests.filter(request => request.error).length;
        const hasUnknown = active.some(request => !request.total);
        const totalBytes = requests.reduce((sum, request) => sum + (request.total || 0), 0);
        const loadedBytes = requests.reduce((sum, request) => sum + Math.min(request.loaded || 0, request.total || request.loaded || 0), 0);
        const percent = active.length === 0
            ? 100
            : (totalBytes > 0 && !hasUnknown ? Math.min(99, Math.round(loadedBytes / totalBytes * 100)) : 0);
        const current = active[active.length - 1] || requests[requests.length - 1];
        const sourceNames = { memory: '内存缓存', indexeddb: 'IndexedDB', network: '网络', cache: '缓存查询' };

        root.hidden = false;
        root.classList.add('visible');
        root.classList.toggle('compact', !showDetails);
        root.classList.toggle('indeterminate', active.length > 0 && (hasUnknown || totalBytes === 0));
        if (active.length > 0 && (hasUnknown || totalBytes === 0)) root.removeAttribute('aria-valuenow');
        else root.setAttribute('aria-valuenow', String(percent));
        bar.style.width = `${percent}%`;
        if (active.length === 0 && failed) {
            text.textContent = `${failed} 个数据文件加载失败`;
        } else if (active.length === 0) {
            text.textContent = `数据加载完成 · ${requests.length} 个文件`;
        } else if (!hasUnknown && totalBytes > 0) {
            text.textContent = `正在加载数据 · ${percent}% · ${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`;
        } else {
            text.textContent = `正在加载数据 · ${completed}/${requests.length} 个文件`;
        }
        if (current) {
            const size = current.loaded ? ` · ${formatBytes(current.loaded)}${current.total ? ` / ${formatBytes(current.total)}` : ''}` : '';
            file.textContent = `${sourceNames[current.source] || current.source} · ${current.url}${size}`;
            file.title = current.url;
        } else {
            file.textContent = '';
        }
        root.setAttribute('aria-valuetext', `${text.textContent}${file.textContent ? `，${file.textContent}` : ''}`);
    }

    function beginProgress(url, source) {
        if (progressHideTimer) {
            clearTimeout(progressHideTimer);
            progressHideTimer = null;
        }
        if (!Array.from(progressRequests.values()).some(request => !request.done)) progressRequests.clear();
        const id = ++progressSequence;
        progressRequests.set(id, { url, source, loaded: 0, total: 0, done: false });
        renderProgress();
        return id;
    }

    function updateProgress(id, loaded, total) {
        const request = progressRequests.get(id);
        if (!request || request.done) return;
        request.loaded = loaded;
        request.total = total || 0;
        request.source = 'network';
        renderProgress();
    }

    function setProgressSource(id, source) {
        const request = progressRequests.get(id);
        if (!request || request.done) return;
        request.source = source;
        renderProgress();
    }

    function finishProgress(id, error) {
        const request = progressRequests.get(id);
        if (!request || request.done) return;
        request.done = true;
        request.error = Boolean(error);
        if (request.total) request.loaded = request.total;
        renderProgress();
        if (Array.from(progressRequests.values()).every(item => item.done)) {
            progressHideTimer = setTimeout(() => {
                const root = document.getElementById('dataLoadProgress');
                if (root) {
                    root.classList.remove('visible', 'indeterminate');
                    setTimeout(() => { if (!root.classList.contains('visible')) root.hidden = true; }, 200);
                }
                progressRequests.clear();
                progressHideTimer = null;
            }, error || Array.from(progressRequests.values()).some(item => item.error) ? 1400 : 450);
        }
    }

    async function readResponseWithProgress(response, progressId) {
        const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
        const total = Number(response.headers.get('Content-Length')) || 0;
        if (!response.body?.getReader) {
            const body = await response.blob();
            updateProgress(progressId, body.size, total || body.size);
            return body;
        }
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.byteLength;
            updateProgress(progressId, loaded, total);
        }
        const body = new Blob(chunks, { type: contentType });
        updateProgress(progressId, loaded, total || loaded);
        return body;
    }

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
        return version ? `${version.appversion}|${version.hotfixversion}` : '';
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
        const headers = new Headers(init?.headers || (typeof resource !== 'string' ? resource?.headers : undefined));
        return method === 'GET' && url?.origin === window.location.origin && url.pathname.startsWith('/public/') &&
            !headers.has('Range') && !headers.has('Authorization');
    }

    function isApplicationResource(request) {
        if (request.method !== 'GET') return false;
        const url = normalizeUrl(request);
        return url?.origin === window.location.origin &&
            (url.pathname.startsWith('/plugin/') || url.pathname.startsWith('/theme/'));
    }

    function responseFromRecord(record) {
        return new Response(record.body, {
            status: record.status || 200,
            statusText: record.statusText || '',
            headers: record.headers || { 'Content-Type': record.contentType || 'application/octet-stream' }
        });
    }

    function safeResponseHeaders(response) {
        const headers = [];
        const contentType = response.headers.get('Content-Type');
        const cacheControl = response.headers.get('Cache-Control');
        if (contentType) headers.push(['Content-Type', contentType]);
        if (cacheControl) headers.push(['Cache-Control', cacheControl]);
        return headers;
    }

    function waitForShared(promise, signal) {
        if (!signal) return promise;
        if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
        return new Promise((resolve, reject) => {
            const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
            signal.addEventListener('abort', abort, { once: true });
            promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
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
        const request = new Request(resource, init);
        const url = normalizeUrl(request);
        const cacheable = Boolean(version && shouldPersist(request));
        if (!cacheable) {
            if (version && isApplicationResource(request)) {
                const appUrl = new URL(request.url);
                appUrl.searchParams.set('v', version.appversion);
                return fetch(appUrl.href, {
                    method: request.method,
                    headers: request.headers,
                    credentials: request.credentials,
                    mode: request.mode,
                    redirect: request.redirect,
                    referrer: request.referrer,
                    referrerPolicy: request.referrerPolicy,
                    integrity: request.integrity,
                    signal: request.signal,
                    cache: 'force-cache'
                });
            }
            return fetch(request);
        }

        const canonicalUrl = url.pathname + url.search;
        const cacheVersion = getCacheVersion(version);
        const key = `${cacheVersion}|${canonicalUrl}`;

        if (memoryResponses.has(key)) {
            const progressId = beginProgress(canonicalUrl, 'memory');
            const record = memoryResponses.get(key);
            setProgressSource(progressId, 'memory');
            updateProgress(progressId, record.body.size, record.body.size);
            setProgressSource(progressId, 'memory');
            finishProgress(progressId, false);
            return responseFromRecord(record);
        }

        if (pendingRequests.has(key)) {
            const result = await waitForShared(pendingRequests.get(key), request.signal);
            return responseFromRecord(result.record);
        }

        const progressId = beginProgress(canonicalUrl, 'cache');
        if (!pendingRequests.has(key)) {
            const loadPromise = (async () => {
                const { db } = await databasePromise;
                const cached = await readRecord(db, key);
                if (cached) {
                    memoryResponses.set(key, cached);
                    updateProgress(progressId, cached.body.size, cached.body.size);
                    setProgressSource(progressId, 'indexeddb');
                    return { record: cached, source: 'indexeddb' };
                }

                setProgressSource(progressId, 'network');
                const requestUrl = new URL(request.url);
                requestUrl.searchParams.set('v', version.appversion);
                const headers = new Headers(request.headers);
                headers.set('X-AKE-Page-Cache', '1');
                const response = await fetch(requestUrl.href, {
                    method: request.method,
                    headers,
                    credentials: request.credentials,
                    mode: request.mode,
                    redirect: request.redirect,
                    referrer: request.referrer,
                    referrerPolicy: request.referrerPolicy,
                    integrity: request.integrity,
                    cache: request.cache === 'default' ? 'no-cache' : request.cache
                });
                if (!response.ok || response.status !== 200) {
                    const body = await response.blob();
                    return {
                        record: {
                            body,
                            status: response.status,
                            statusText: response.statusText,
                            headers: safeResponseHeaders(response),
                            contentType: response.headers.get('Content-Type') || body.type || 'application/octet-stream'
                        },
                        source: 'network',
                        cacheable: false
                    };
                }

                const body = await readResponseWithProgress(response, progressId);
                const record = {
                    key,
                    cacheVersion,
                    url: canonicalUrl,
                    body,
                    status: response.status,
                    statusText: response.statusText,
                    headers: safeResponseHeaders(response),
                    contentType: response.headers.get('Content-Type') || body.type || 'application/octet-stream',
                    storedAt: Date.now()
                };
                memoryResponses.set(key, record);
                void writeRecord(db, record);
                return { record, source: 'network' };
            })();
            pendingRequests.set(key, loadPromise);
            loadPromise.finally(() => pendingRequests.delete(key)).catch(() => {});
        }

        try {
            const result = await waitForShared(pendingRequests.get(key), request.signal);
            setProgressSource(progressId, result.source);
            finishProgress(progressId, result.record.status >= 400);
            return responseFromRecord(result.record);
        } catch (error) {
            finishProgress(progressId, true);
            throw error;
        }
    };

    window.akeLoadMaps = function () {
        if (!window.__akeMapsPromise) {
            window.__akeMapsPromise = window.akeFetch('/public/CH/maps.json').then(response => {
                if (!response.ok) throw new Error(`无法加载 maps.json (HTTP ${response.status})`);
                return response.json();
            }).catch(error => {
                window.__akeMapsPromise = null;
                throw error;
            });
        }
        return window.__akeMapsPromise;
    };

    window.addEventListener('globalConfigChanged', () => {
        if (progressRequests.size > 0) renderProgress();
    });

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
