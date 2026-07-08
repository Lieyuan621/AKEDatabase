(function() {
    const CACHE_MARKER_KEY = 'akedata-about-cache-marker';

    function getAboutMarker() {
        const aboutBox = document.querySelector('.about-box');
        return aboutBox ? aboutBox.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function appendCacheBust(resource, cacheBustValue) {
        if (!cacheBustValue || typeof resource !== 'string') return resource;

        const url = new URL(resource, window.location.href);
        url.searchParams.set('t', cacheBustValue);
        return url.origin === window.location.origin
            ? url.pathname + url.search + url.hash
            : url.href;
    }

    const currentMarker = getAboutMarker();
    const previousMarker = localStorage.getItem(CACHE_MARKER_KEY);
    const shouldRefreshCache = Boolean(currentMarker && previousMarker !== currentMarker);
    const cacheBustValue = shouldRefreshCache ? String(Date.now()) : '';

    if (currentMarker && previousMarker !== currentMarker) {
        localStorage.setItem(CACHE_MARKER_KEY, currentMarker);
    }

    window.akeFetch = function(resource, init) {
        const requestInit = init ? { ...init } : undefined;
        const requestResource = appendCacheBust(resource, cacheBustValue);

        if (cacheBustValue) {
            return fetch(requestResource, { ...requestInit, cache: 'no-cache' });
        }

        return fetch(requestResource, { ...requestInit, cache: requestInit?.cache || 'force-cache' });
    };

    window.akeDataCacheRefreshRequired = shouldRefreshCache;
})();
