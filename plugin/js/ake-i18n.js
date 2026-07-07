(function() {
    const STORAGE_KEY = 'akedata-language';
    const DEFAULT_LANGUAGE = 'zh-CN';
    const SUPPORTED_LANGUAGES = {
        'zh-CN': { label: '中文', dataDir: 'CH', htmlLang: 'zh-CN' },
        'en-US': { label: 'English', dataDir: 'EN', htmlLang: 'en' }
    };
    const DATA_DIR_PATTERN = '(CH|EN|JP|KR)';

    let messages = {};
    let fallbackMessages = {};
    let currentLanguage = normalizeLanguage(getInitialLanguage());

    function normalizeLanguage(language) {
        if (!language) return DEFAULT_LANGUAGE;
        if (SUPPORTED_LANGUAGES[language]) return language;
        const lower = String(language).toLowerCase();
        if (lower.startsWith('zh')) return 'zh-CN';
        if (lower.startsWith('en')) return 'en-US';
        return DEFAULT_LANGUAGE;
    }

    function getInitialLanguage() {
        const params = new URLSearchParams(window.location.search);
        return params.get('lang') || localStorage.getItem(STORAGE_KEY) || navigator.language || DEFAULT_LANGUAGE;
    }

    function getLanguage() {
        return currentLanguage;
    }

    function getDataDir(language = currentLanguage) {
        return SUPPORTED_LANGUAGES[normalizeLanguage(language)]?.dataDir || SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE].dataDir;
    }

    function getHtmlLang(language = currentLanguage) {
        return SUPPORTED_LANGUAGES[normalizeLanguage(language)]?.htmlLang || SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE].htmlLang;
    }

    function setLanguage(language) {
        currentLanguage = normalizeLanguage(language);
        localStorage.setItem(STORAGE_KEY, currentLanguage);
        document.documentElement.lang = getHtmlLang(currentLanguage);
    }

    function dataPath(resource, language = currentLanguage) {
        if (typeof resource !== 'string') return resource;
        const dataDir = getDataDir(language);
        return resource
            .replace(new RegExp(`/public/${DATA_DIR_PATTERN}/`), `/public/${dataDir}/`)
            .replace(new RegExp(`(^|[^/])public/${DATA_DIR_PATTERN}/`), `$1public/${dataDir}/`);
    }

    function fallbackDataPath(resource) {
        if (typeof resource !== 'string') return resource;
        return resource
            .replace(new RegExp(`/public/${DATA_DIR_PATTERN}/`), '/public/CH/')
            .replace(new RegExp(`(^|[^/])public/${DATA_DIR_PATTERN}/`), '$1public/CH/');
    }

    function isDataManifestPath(resource) {
        if (typeof resource !== 'string') return false;
        const path = resource.split('?')[0].split('#')[0];
        return new RegExp(`(^|/)public/${DATA_DIR_PATTERN}/.+/manifest\\.json$`).test(path);
    }

    function interpolate(value, params) {
        return String(value).replace(/\{(\w+)\}/g, (_, key) => params[key] ?? '');
    }

    function getByPath(source, key) {
        if (!source || !key) return undefined;
        if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
        return String(key).split('.').reduce((node, part) => {
            if (node && Object.prototype.hasOwnProperty.call(node, part)) return node[part];
            return undefined;
        }, source);
    }

    function t(key, params = {}) {
        const value = getByPath(messages, key) ?? getByPath(fallbackMessages, key) ?? key;
        return interpolate(value, params);
    }

    async function loadJson(path) {
        const response = await fetch(path, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    async function loadMessages(language = currentLanguage) {
        const normalized = normalizeLanguage(language);
        if (!Object.keys(fallbackMessages).length) {
            fallbackMessages = await loadJson(`/public/i18n/${DEFAULT_LANGUAGE}/ui.json`).catch(() => ({}));
        }
        messages = normalized === DEFAULT_LANGUAGE
            ? fallbackMessages
            : await loadJson(`/public/i18n/${normalized}/ui.json`).catch(() => ({}));
        document.documentElement.lang = getHtmlLang(normalized);
        return messages;
    }

    function apply(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        root.querySelectorAll('[data-i18n-html]').forEach(el => {
            el.innerHTML = t(el.dataset.i18nHtml);
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.dataset.i18nTitle);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
    }

    window.akeI18n = {
        defaultLanguage: DEFAULT_LANGUAGE,
        supportedLanguages: SUPPORTED_LANGUAGES,
        normalizeLanguage,
        getLanguage,
        setLanguage,
        getDataDir,
        dataPath,
        fallbackDataPath,
        isDataManifestPath,
        loadMessages,
        apply,
        t
    };
    window.akeDataPath = dataPath;
})();
