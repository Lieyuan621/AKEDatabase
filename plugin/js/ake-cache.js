(function () {
    const DB_NAME = 'akedata-data-cache';
    const DB_VERSION = 2;
    const RESPONSE_STORE = 'responses';
    const META_STORE = 'meta';
    const VERSION_URL = '/version.json';
    const pendingRequests = new Map();
    const memoryResponses = new Map();
    const progressRequests = new Map();
    const PROGRESS_DETAILS_DELAY = 3000;
    let progressSequence = 0;
    let progressHideTimer = null;
    let progressDetailsTimer = null;
    let forceProgressDetails = false;
    let progressNotice = '';

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
        const showDetails = window.akeData?.getConfig?.().showHidden === true || forceProgressDetails;
        const active = requests.filter(request => !request.done);
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
            text.textContent = `数据加载完成 · ${formatBytes(loadedBytes)}`;
        } else if (!hasUnknown && totalBytes > 0) {
            text.textContent = `${progressNotice || '正在加载数据'} · ${percent}% · ${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`;
        } else {
            text.textContent = `${progressNotice || '正在加载数据'} · 已加载 ${formatBytes(loadedBytes)} · 总大小计算中`;
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
        const hasActiveRequest = Array.from(progressRequests.values()).some(request => !request.done);
        if (!hasActiveRequest) {
            progressRequests.clear();
            forceProgressDetails = false;
            if (progressDetailsTimer) clearTimeout(progressDetailsTimer);
            progressDetailsTimer = setTimeout(() => {
                progressDetailsTimer = null;
                if (!Array.from(progressRequests.values()).some(request => !request.done)) return;
                forceProgressDetails = true;
                renderProgress();
            }, PROGRESS_DETAILS_DELAY);
        }
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
            if (progressDetailsTimer) {
                clearTimeout(progressDetailsTimer);
                progressDetailsTimer = null;
            }
            progressHideTimer = setTimeout(() => {
                const root = document.getElementById('dataLoadProgress');
                if (root) {
                    root.classList.remove('visible', 'indeterminate');
                    setTimeout(() => { if (!root.classList.contains('visible')) root.hidden = true; }, 200);
                }
                progressRequests.clear();
                forceProgressDetails = false;
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

    async function registerServiceWorker(version) {
        if (!('serviceWorker' in navigator) || !version) return;
        const dataSource = await window.akeDataSource?.ready;
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
        const workerUrl = new URL('/ake-sw.js', window.location.href);
        workerUrl.searchParams.set('v', version.appversion);
        workerUrl.searchParams.set('dataBaseUrl', dataSource?.baseUrl || '');
        workerUrl.searchParams.set('sharedRevision', dataSource?.manifest?.sharedRevision || '');
        if (window.__akeForceRefreshTimestamp) {
            workerUrl.searchParams.set('t', window.__akeForceRefreshTimestamp);
            workerUrl.searchParams.set('forceRefreshTimestamp', window.__akeForceRefreshTimestamp);
        }
        const notify = worker => worker?.postMessage({
            type: 'AKE_VERSION',
            dataBaseUrl: dataSource?.baseUrl || '',
            sharedRevision: dataSource?.manifest?.sharedRevision || '',
            forceRefreshTimestamp: window.__akeForceRefreshTimestamp || ''
        });
        try {
            const registration = await navigator.serviceWorker.register(workerUrl.href, { scope: '/' });
            notify(navigator.serviceWorker.controller);
            notify(registration.active);
            notify(registration.waiting);
            notify(registration.installing);
            const readyRegistration = await navigator.serviceWorker.ready;
            notify(readyRegistration.active);
            if (!navigator.serviceWorker.controller) {
                await Promise.race([
                    new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
            }
            return readyRegistration;
        } catch (error) {
            console.warn('Service Worker 注册失败，图片 URL 仍由页面数据路由改写。', error);
            return null;
        }
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
            typeof value.updatedAt === 'string';
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
                if (request.oldVersion < 2 && db.objectStoreNames.contains(RESPONSE_STORE)) {
                    request.transaction.objectStore(RESPONSE_STORE).clear();
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

    async function prepareDatabase(db, version) {
        if (!db || !version) return null;
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction([RESPONSE_STORE, META_STORE], 'readwrite');
                if (version.debugmode === true) tx.objectStore(RESPONSE_STORE).clear();
                tx.objectStore(META_STORE).put({ key: 'activeAppVersion', value: version.appversion });
                tx.objectStore(META_STORE).put({ key: 'lastPreparedAt', value: Date.now() });
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
        const type = window.akeDataSource?.classify(resource)?.type;
        return method === 'GET' && ['table', 'shared', 'site-public'].includes(type) &&
            !headers.has('Range') && !headers.has('Authorization');
    }

    function isApplicationResource(request) {
        if (request.method !== 'GET') return false;
        const url = normalizeUrl(request);
        return url?.origin === window.location.origin &&
            (url.pathname.startsWith('/plugin/') || url.pathname.startsWith('/theme/'));
    }

    function isPublicResource(request) {
        if (request.method !== 'GET') return false;
        return ['table', 'shared', 'site-public'].includes(window.akeDataSource?.classify(request)?.type);
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
    const serviceWorkerPromise = versionPromise.then(registerServiceWorker);
    const databasePromise = Promise.all([versionPromise, openDatabase()]).then(async ([version, db]) => ({
        version,
        db: await Promise.race([
            prepareDatabase(db, version),
            new Promise(resolve => setTimeout(() => resolve(null), 5000))
        ])
    }));

    window.akeVersionReady = versionPromise;
    window.akeServiceWorkerReady = serviceWorkerPromise;
    window.akeCacheReady = databasePromise;

    window.akeFetch = async function (resource, init) {
        const version = await versionPromise;
        await window.akeDataSource?.ready;
        const request = new Request(resource, init);
        const url = normalizeUrl(request);
        const resourceType = window.akeDataSource?.classify(request)?.type || 'other';
        const resolvedUrl = window.akeDataSource?.resolveUrl(request.url) || request.url;
        const forceRefreshTimestamp = window.__akeForceRefreshTimestamp || (version?.debugmode === true ? String(Date.now()) : '');
        const forceRefresh = Boolean(forceRefreshTimestamp);
        const cacheable = Boolean(version && shouldPersist(request));
        if (!cacheable) {
            if (version && isApplicationResource(request)) {
                const appUrl = new URL(request.url);
                appUrl.searchParams.set('v', version.appversion);
                if (forceRefresh) appUrl.searchParams.set('t', forceRefreshTimestamp);
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
                    cache: forceRefresh ? 'no-store' : 'force-cache'
                });
            }
            if (version && isPublicResource(request)) {
                const publicUrl = new URL(resolvedUrl);
                if (resourceType === 'site-public') publicUrl.searchParams.set('v', version.appversion);
                if (forceRefresh) publicUrl.searchParams.set('t', forceRefreshTimestamp);
                return fetch(new Request(publicUrl.href, request), forceRefresh ? { cache: 'no-store' } : undefined);
            }
            return fetch(request);
        }

        const canonicalResolvedUrl = normalizeUrl(resolvedUrl);
        const canonicalUrl = canonicalResolvedUrl.origin + canonicalResolvedUrl.pathname + canonicalResolvedUrl.search;
        const cacheVersion = window.akeDataSource?.cacheNamespace(request, version.appversion) || `site|${version.appversion}`;
        const key = `${cacheVersion}|${canonicalUrl}`;

        if (!forceRefresh && memoryResponses.has(key)) {
            const progressId = beginProgress(canonicalUrl, 'memory');
            const record = memoryResponses.get(key);
            setProgressSource(progressId, 'memory');
            updateProgress(progressId, record.body.size, record.body.size);
            setProgressSource(progressId, 'memory');
            finishProgress(progressId, false);
            return responseFromRecord(record);
        }

        if (!forceRefresh && pendingRequests.has(key)) {
            const result = await waitForShared(pendingRequests.get(key), request.signal);
            return responseFromRecord(result.record);
        }

        const progressId = beginProgress(canonicalUrl, 'cache');
        if (!pendingRequests.has(key)) {
            const loadPromise = (async () => {
                const { db } = await databasePromise;
                const cached = forceRefresh ? null : await readRecord(db, key);
                if (cached) {
                    memoryResponses.set(key, cached);
                    updateProgress(progressId, cached.body.size, cached.body.size);
                    setProgressSource(progressId, 'indexeddb');
                    return { record: cached, source: 'indexeddb' };
                }

                setProgressSource(progressId, 'network');
                const requestUrl = new URL(resolvedUrl);
                if (resourceType === 'site-public') requestUrl.searchParams.set('v', version.appversion);
                if (forceRefresh) requestUrl.searchParams.set('t', forceRefreshTimestamp);
                const headers = new Headers(request.headers);
                const response = await fetch(requestUrl.href, {
                    method: request.method,
                    headers,
                    credentials: request.credentials,
                    mode: request.mode,
                    redirect: request.redirect,
                    referrer: request.referrer,
                    referrerPolicy: request.referrerPolicy,
                    integrity: request.integrity,
                    cache: forceRefresh ? 'no-store' : (request.cache === 'default' ? 'no-cache' : request.cache)
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
        const directory = window.akeI18n?.getLanguageInfo?.().directory || 'CH';
        if (!window.__akeMapsPromises) window.__akeMapsPromises = {};
        if (!window.__akeMapsPromises[directory]) {
            window.__akeMapsPromises[directory] = window.akeFetch(`/public/${directory}/maps.json`).then(response => {
                if (!response.ok) throw new Error(`无法加载 maps.json (HTTP ${response.status})`);
                return response.json();
            }).catch(error => {
                window.__akeMapsPromises[directory] = null;
                throw error;
            });
        }
        return window.__akeMapsPromises[directory];
    };

    window.addEventListener('globalConfigChanged', () => {
        if (progressRequests.size > 0) renderProgress();
    });

    window.akeDataCache = {
        ready: databasePromise,
        setProgressNotice(message) {
            progressNotice = String(message || '');
            if (progressRequests.size > 0) renderProgress();
        },
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
        async forceRefresh() {
            const timestamp = String(Date.now());
            window.__akeForceRefreshTimestamp = timestamp;
            await this.clear();
            const url = new URL(window.location.href);
            url.searchParams.set('t', timestamp);
            window.location.replace(url.href);
        },
        estimate() {
            return navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve({ usage: 0, quota: 0 });
        }
    };
})();
