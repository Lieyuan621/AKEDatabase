(function () {
    'use strict';

    if (window.AKEImageFallback) return;

    const fallbackSource = '/icon_default_missing.png';
    const fallbackUrl = new URL(fallbackSource, window.location.href).href;
    const observedImages = new WeakSet();

    function useFallback(image) {
        if (!(image instanceof HTMLImageElement)) return false;

        const assignedUrl = image.src;
        const currentUrl = image.currentSrc || assignedUrl;
        if (assignedUrl === fallbackUrl || currentUrl === fallbackUrl) return false;

        image.onerror = null;
        image.removeAttribute('onerror');
        image.removeAttribute('srcset');

        const picture = image.parentElement;
        if (picture instanceof HTMLPictureElement) {
            picture.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'));
        }

        image.src = fallbackSource;
        return true;
    }

    function handleImageError(event) {
        if (!useFallback(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function observeImage(image) {
        if (!(image instanceof HTMLImageElement) || observedImages.has(image)) return;
        observedImages.add(image);
        image.addEventListener('error', handleImageError, true);

        const source = image.currentSrc || image.getAttribute('src');
        if (source && image.complete && image.naturalWidth === 0) useFallback(image);
    }

    function observeImages(root) {
        if (root instanceof HTMLImageElement) observeImage(root);
        root.querySelectorAll?.('img').forEach(observeImage);
    }

    window.addEventListener('error', handleImageError, true);
    observeImages(document);

    const observer = new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(node => {
            if (node instanceof Element) observeImages(node);
        }));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.AKEImageFallback = Object.freeze({ source: fallbackSource, useFallback });
})();
