(function() {
    const CACHE_MARKER_KEY = 'akedata-about-cache-marker';
    const VERSION_INFO_PATH = '/public/version.json';
    let cacheBustValue = '';

    async function initVersionMarker() {
        try {
            const response = await fetch(VERSION_INFO_PATH, { cache: 'no-cache' });
            if (!response.ok) return;
            const currentMarker = (await response.text()).replace(/\s+/g, ' ').trim();
            const previousMarker = localStorage.getItem(CACHE_MARKER_KEY);
            const shouldRefreshCache = Boolean(currentMarker && previousMarker !== currentMarker);
            if (shouldRefreshCache) {
                cacheBustValue = String(Date.now());
            }
            if (currentMarker && previousMarker !== currentMarker) {
                localStorage.setItem(CACHE_MARKER_KEY, currentMarker);
            }
            window.akeDataCacheRefreshRequired = shouldRefreshCache;
            try {
                window.akeVersionInfo = JSON.parse(currentMarker);
            } catch (err) {
                window.akeVersionInfo = null;
            }
        } catch (err) {
            console.warn('Failed to load version marker:', err);
        }
    }

    function appendCacheBust(resource, cacheBustValue) {
        if (!cacheBustValue || typeof resource !== 'string') return resource;

        const url = new URL(resource, window.location.href);
        url.searchParams.set('t', cacheBustValue);
        return url.origin === window.location.origin
            ? url.pathname + url.search + url.hash
            : url.href;
    }

    const versionMarkerReady = initVersionMarker();
    window.akeVersionReady = versionMarkerReady;

    window.akeFetchBase = async function(resource, init) {
        await versionMarkerReady;
        const requestInit = init ? { ...init } : undefined;
        const requestResource = appendCacheBust(resource, cacheBustValue);

        if (cacheBustValue) {
            return fetch(requestResource, { ...requestInit, cache: 'no-cache' });
        }

        return fetch(requestResource, { ...requestInit, cache: requestInit?.cache || 'force-cache' });
    };

    window.akeFetch = async function(resource, init) {
        const localizedResource = window.akeI18n ? window.akeI18n.dataPath(resource) : resource;
        const fallbackResource = window.akeI18n ? window.akeI18n.fallbackDataPath(localizedResource) : localizedResource;
        const response = await window.akeFetchBase(localizedResource, init);
        if (response.ok || !window.akeI18n) return response;

        if (fallbackResource === localizedResource) return response;
        return window.akeFetchBase(fallbackResource, init);
    };

    window.akeDataCacheRefreshRequired = false;
})();
