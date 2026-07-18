(function () {
    if (window.akeDataSource) return;

    const BASE_URL_KEY = 'akedata-data-base-url';
    const VERSION_KEY = 'akedata-data-version';
    const MANIFEST_CACHE_PREFIX = 'akedata-data-manifest:';
    const bootstrapVersion = window.__akeBootstrapVersion || {};
    const debugLocalMode = bootstrapVersion.debugmode === true;
    const defaultBaseUrl = normalizeBaseUrl(bootstrapVersion.dataBaseUrl || 'https://data.akedata.wiki');
    const localBaseUrl = normalizeBaseUrl(window.location.origin);
    const manifestPath = String(bootstrapVersion.dataManifestPath || '/manifest.json');
    let state = null;

    const storage = {
        get(key, fallback = null) {
            try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, String(value)); return true; } catch { return false; }
        },
        remove(key) {
            try { localStorage.removeItem(key); return true; } catch { return false; }
        }
    };

    function normalizeBaseUrl(value) {
        const raw = String(value || '').trim();
        const url = new URL(raw || window.location.origin, window.location.href);
        if (!/^https?:$/.test(url.protocol)) throw new Error('数据请求域名仅支持 HTTP 或 HTTPS');
        url.pathname = url.pathname.replace(/\/+$/, '') || '/';
        url.search = '';
        url.hash = '';
        return url.href.replace(/\/$/, '');
    }

    function normalizeObjectPath(value) {
        const path = String(value || '').replace(/^\/+/, '').replace(/\/+$/, '');
        if (!path || path.split('/').includes('..')) throw new Error(`无效的数据目录：${value}`);
        return path;
    }

    function validateManifest(value) {
        if (!value || value.schemaVersion !== 1 || !Array.isArray(value.versions) || value.versions.length === 0) {
            throw new Error('版本清单格式无效');
        }
        const ids = new Set();
        const versions = value.versions.map(item => {
            const gameVersion = String(item?.gameVersion || '').trim();
            const hotfixVersion = String(item?.hotfixVersion || '').trim();
            const id = String(item?.id || `${gameVersion}@${hotfixVersion}`).trim();
            if (!gameVersion || !hotfixVersion || !id || ids.has(id)) throw new Error(`版本条目无效或重复：${id}`);
            ids.add(id);
            return Object.freeze({
                id,
                gameVersion,
                hotfixVersion,
                tableCfgPath: normalizeObjectPath(item.tableCfgPath),
                publishedAt: String(item.publishedAt || '')
            });
        });
        const latest = String(value.latest || '');
        if (!ids.has(latest)) throw new Error(`latest 指向不存在的版本：${latest}`);
        return Object.freeze({
            schemaVersion: 1,
            latest,
            sharedRevision: String(value.sharedRevision || value.updatedAt || '1'),
            updatedAt: String(value.updatedAt || ''),
            versions: Object.freeze(versions)
        });
    }

    function fallbackManifest(baseUrl) {
        const id = 'local@local';
        return validateManifest({
            schemaVersion: 1,
            latest: id,
            sharedRevision: `local-${bootstrapVersion.appversion || bootstrapVersion.updatedAt || '1'}`,
            updatedAt: bootstrapVersion.updatedAt || '',
            versions: [{
                id,
                gameVersion: 'local',
                hotfixVersion: 'local',
                tableCfgPath: 'public/TableCfg',
                publishedAt: bootstrapVersion.updatedAt || ''
            }]
        });
    }

    function isLocalDataSource(baseUrl) {
        const url = new URL(baseUrl);
        return url.origin === window.location.origin || ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    }

    function compareGameVersions(a, b) {
        const aParts = String(a || '').split('.').map(part => Number(part));
        const bParts = String(b || '').split('.').map(part => Number(part));
        const length = Math.max(aParts.length, bParts.length);
        for (let index = 0; index < length; index += 1) {
            const difference = (aParts[index] || 0) - (bParts[index] || 0);
            if (difference) return difference;
        }
        return String(a || '').localeCompare(String(b || ''), 'en');
    }

    function findLatestComparison(manifest) {
        const current = manifest.versions.find(item => item.id === manifest.latest);
        if (!current || current.gameVersion === 'local') return null;
        const previousGameVersion = Array.from(new Set(manifest.versions.map(item => item.gameVersion)))
            .filter(gameVersion => compareGameVersions(gameVersion, current.gameVersion) < 0)
            .sort((a, b) => compareGameVersions(b, a))[0];
        if (!previousGameVersion) return null;
        const baseline = manifest.versions
            .filter(item => item.gameVersion === previousGameVersion)
            .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt), 'en'))[0];
        return baseline ? Object.freeze({ current, baseline }) : null;
    }

    async function loadManifest(baseUrl, localFallbackBaseUrl = null) {
        const cacheKey = `${MANIFEST_CACHE_PREFIX}${baseUrl}`;
        const url = new URL(manifestPath, `${baseUrl}/`);
        url.searchParams.set('t', Date.now());
        try {
            const response = await fetch(url.href, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const manifest = validateManifest(await response.json());
            storage.set(cacheKey, JSON.stringify(manifest));
            return { manifest, source: 'network' };
        } catch (error) {
            const cached = storage.get(cacheKey);
            if (cached) {
                try {
                    return { manifest: validateManifest(JSON.parse(cached)), source: 'cache', error };
                } catch {}
            }
            if (localFallbackBaseUrl && isLocalDataSource(localFallbackBaseUrl)) {
                console.warn(`无法读取 ${url.origin} 的版本清单，使用本地未版本化数据。`, error);
                return { manifest: fallbackManifest(localFallbackBaseUrl), source: 'fallback', error };
            }
            throw new Error(`无法读取 ${url.origin} 的版本清单，且没有可用的缓存清单`);
        }
    }

    function classify(resource) {
        const url = new URL(typeof resource === 'string' ? resource : resource?.url, window.location.href);
        if (url.origin !== window.location.origin) return { type: 'external', url };
        if (url.pathname.startsWith('/public/TableCfg/')) return { type: 'table', url };
        if (url.pathname.startsWith('/public/Json/')) return { type: 'shared', url };
        if (url.pathname.startsWith('/public/images/')) return { type: 'shared', url };
        if (url.pathname.startsWith('/public/')) return { type: 'site-public', url };
        return { type: 'other', url };
    }

    function resolveUrl(resource) {
        const result = classify(resource);
        if (!state || (result.type !== 'table' && result.type !== 'shared')) return result.url.href;
        const target = new URL(`${state.baseUrl}/`);
        if (result.type === 'table') {
            const suffix = result.url.pathname.slice('/public/TableCfg/'.length);
            target.pathname = `/${state.selected.tableCfgPath}/${suffix}`.replace(/\/+/g, '/');
        } else {
            target.pathname = result.url.pathname;
            target.searchParams.set('v', state.manifest.sharedRevision);
        }
        result.url.searchParams.forEach((value, key) => target.searchParams.set(key, value));
        return target.href;
    }

    function cacheNamespace(resource, appVersion) {
        const result = classify(resource);
        if (!state) return `site|${appVersion || '1'}`;
        if (result.type === 'table') return `table|${state.baseUrl}|${state.selected.id}`;
        if (result.type === 'shared') return `shared|${state.baseUrl}|${state.manifest.sharedRevision}`;
        return `site|${window.location.origin}|${appVersion || '1'}`;
    }

    async function initialize() {
        let selection = storage.get(VERSION_KEY, 'latest');
        let baseUrl;
        if (debugLocalMode) {
            baseUrl = selection === 'latest' ? localBaseUrl : defaultBaseUrl;
        } else {
            try {
                baseUrl = normalizeBaseUrl(storage.get(BASE_URL_KEY, defaultBaseUrl));
            } catch {
                storage.remove(BASE_URL_KEY);
                baseUrl = defaultBaseUrl;
            }
        }
        const manifestBaseUrl = debugLocalMode ? defaultBaseUrl : baseUrl;
        const localFallbackBaseUrl = debugLocalMode && selection === 'latest'
            ? localBaseUrl
            : (isLocalDataSource(baseUrl) ? baseUrl : null);
        const loaded = await loadManifest(manifestBaseUrl, localFallbackBaseUrl);
        let selectedId = selection === 'latest' ? loaded.manifest.latest : selection;
        let selected = loaded.manifest.versions.find(item => item.id === selectedId);
        if (!selected) {
            selection = 'latest';
            selected = loaded.manifest.versions.find(item => item.id === loaded.manifest.latest);
            storage.set(VERSION_KEY, selection);
        }
        const debugLocal = debugLocalMode && selection === 'latest';
        if (debugLocal) {
            selected = Object.freeze({ ...selected, tableCfgPath: 'public/TableCfg' });
        }
        state = Object.freeze({
            baseUrl,
            defaultBaseUrl,
            localBaseUrl,
            manifest: loaded.manifest,
            manifestSource: loaded.source,
            selection,
            selected,
            comparison: selection === 'latest' ? findLatestComparison(loaded.manifest) : null,
            debugMode: debugLocalMode,
            debugLocal
        });
        window.dispatchEvent(new CustomEvent('akeDataSourceReady', { detail: state }));
        return state;
    }

    const ready = initialize();

    window.akeDataSource = {
        ready,
        classify,
        resolveUrl,
        cacheNamespace,
        getState: () => state,
        async configure({ baseUrl, selection }) {
            const normalizedBase = normalizeBaseUrl(baseUrl || defaultBaseUrl);
            const nextSelection = String(selection || 'latest');
            if (!debugLocalMode) {
                if (normalizedBase === defaultBaseUrl) storage.remove(BASE_URL_KEY);
                else storage.set(BASE_URL_KEY, normalizedBase);
            }
            storage.set(VERSION_KEY, nextSelection);
            return nextSelection !== state?.selection || (!debugLocalMode && normalizedBase !== state?.baseUrl);
        },
        reset() {
            storage.remove(BASE_URL_KEY);
            storage.set(VERSION_KEY, 'latest');
        }
    };
})();
