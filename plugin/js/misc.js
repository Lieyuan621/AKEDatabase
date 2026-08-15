(function () {
    'use strict';

    const MODULE_ID = 'misc';
    const MANIFEST_URL = '/plugin/misc/manifest.json';
    const MODULE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
    const root = document.getElementById('miscModule');
    if (!root) return;

    const list = document.getElementById('miscModuleList');
    const mobileList = document.getElementById('miscMobileList');
    const count = document.getElementById('miscModuleCount');
    const content = document.getElementById('miscContent');
    const mobileButton = document.getElementById('miscMobileButton');
    const mobileOverlay = document.getElementById('miscMobileOverlay');
    const registrations = new Map();
    const scriptSources = new Map();
    const routeByModule = new Map();
    const loaderCleanups = [];

    let modules = [];
    let initialized = false;
    let parentActive = true;
    let destroyed = false;
    let activeModuleId = '';
    let activeController = null;
    let activeScope = null;
    let activeLoad = null;
    let loadGeneration = 0;

    function versionedUrl(resource, versionKey) {
        const url = new URL(resource, window.location.href);
        const version = window.__akeBootstrapVersion || {};
        const pathKey = url.pathname.replace(/^\/+/, '');
        const resourceVersion = versionKey === 'plugin'
            ? version.pluginversion?.misc || version.appversion
            : version.jsversion?.[pathKey] || version.appversion;
        if (resourceVersion) url.searchParams.set('v', resourceVersion);
        if (window.__akeForceRefreshTimestamp) url.searchParams.set('t', window.__akeForceRefreshTimestamp);
        return url;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function translate(value) {
        const text = String(value || '');
        return window.akeData?.t?.(text, null, text) ?? text;
    }

    function addLoaderListener(target, type, listener, options) {
        target?.addEventListener?.(type, listener, options);
        const cleanup = () => target?.removeEventListener?.(type, listener, options);
        loaderCleanups.push(cleanup);
        return cleanup;
    }

    function closeMobileList() {
        const wasOpen = mobileOverlay.classList.contains('is-open');
        mobileOverlay.classList.remove('is-open');
        mobileOverlay.setAttribute('aria-hidden', 'true');
        mobileButton.setAttribute('aria-expanded', 'false');
        if (wasOpen) mobileButton.focus({ preventScroll: true });
    }

    function openMobileList() {
        mobileOverlay.classList.add('is-open');
        mobileOverlay.setAttribute('aria-hidden', 'false');
        mobileButton.setAttribute('aria-expanded', 'true');
        const selected = mobileList.querySelector('.ake-ui-directory__item.is-active');
        (selected || mobileList.querySelector('.ake-ui-directory__item'))?.focus({ preventScroll: true });
    }

    function renderShellState(kind, title, detail) {
        const spinner = kind === 'loading' ? '<span class="ake-ui-spinner"></span>' : '';
        content.innerHTML = `<div class="ake-ui-state" data-state="${escapeHtml(kind)}">${spinner}<b>${escapeHtml(title)}</b>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`;
    }

    function normalizeContentFile(value) {
        const url = new URL(String(value || ''), window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.startsWith('/plugin/misc/') || !url.pathname.endsWith('.html')) {
            throw new Error(`子模块页面必须位于 /plugin/misc/：${value}`);
        }
        url.hash = '';
        return `${url.pathname}${url.search}`;
    }

    function normalizeManifest(value) {
        if (!Array.isArray(value)) throw new Error('杂项模块清单必须是数组');
        const ids = new Set();
        return value.map((entry, index) => {
            const id = String(entry?.id || '').trim();
            const title = String(entry?.title || '').trim();
            if (!MODULE_ID_PATTERN.test(id) || ids.has(id)) throw new Error(`子模块 ID 无效或重复：${id || index}`);
            if (!title) throw new Error(`子模块缺少标题：${id}`);
            if (Object.prototype.hasOwnProperty.call(entry, 'icon') || Object.prototype.hasOwnProperty.call(entry, 'description')) {
                throw new Error(`子模块清单不支持 icon 或 description：${id}`);
            }
            ids.add(id);
            return Object.freeze({
                id,
                title,
                priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 999,
                contentFile: normalizeContentFile(entry.contentFile),
                hidden: entry.hidden === true,
                disabled: entry.disabled === true,
                token: entry.token ? String(entry.token) : null
            });
        }).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id, 'en'));
    }

    function isAvailable(module) {
        if (!module || module.disabled) return false;
        const config = window.akeData?.getConfig?.() || {};
        if (module.hidden && !config.showHidden) return false;
        return !module.token || window.akeData?.isTokenUnlocked?.(module.token) === true;
    }

    function visibleModules() {
        return modules.filter(isAvailable);
    }

    function createModuleDirectoryItem(module) {
        return window.AKEUI.directoryItem({
            layout: 'entity',
            title: translate(module.title),
            id: module.id,
            meta: module.hidden ? [{ label: '隐藏', kind: 'hidden' }] : [],
            active: module.id === activeModuleId,
            attributes: { 'data-misc-id': module.id }
        });
    }

    function renderModuleLists() {
        const visible = visibleModules();
        count.textContent = `${visible.length} 个模块`;
        if (!visible.length) {
            list.innerHTML = '<div class="ake-ui-state" data-state="empty">没有可用模块</div>';
            mobileList.innerHTML = '<div class="ake-ui-state" data-state="empty">没有可用模块</div>';
            return;
        }
        list.replaceChildren(...visible.map(createModuleDirectoryItem));
        mobileList.replaceChildren(...visible.map(createModuleDirectoryItem));
    }

    function decodeRoutePart(value) {
        try { return decodeURIComponent(value); } catch { return value; }
    }

    function parseRoute(value) {
        const route = String(value || '');
        if (!route) return { moduleId: '', entryId: null };
        const separator = route.indexOf('/');
        if (separator < 0) return { moduleId: decodeRoutePart(route), entryId: null };
        const moduleId = decodeRoutePart(route.slice(0, separator));
        const rawEntry = route.slice(separator + 1);
        return { moduleId, entryId: rawEntry ? decodeRoutePart(rawEntry) : null };
    }

    function buildRoute(moduleId, entryId) {
        const modulePart = encodeURIComponent(String(moduleId || ''));
        if (entryId === undefined || entryId === null || String(entryId) === '') return modulePart;
        return `${modulePart}/${encodeURIComponent(String(entryId))}`;
    }

    function reportMissingRoute(route, hidden) {
        const handler = window.__akeRouter?.onDeepLinkNotFound;
        if (typeof handler === 'function') {
            handler(route, hidden === true);
            return;
        }
        renderShellState('error', '未找到杂项模块', route || '未知模块');
    }

    function controllerMethod(controller, names) {
        for (const name of names) {
            if (typeof controller?.[name] === 'function') return controller[name].bind(controller);
        }
        return null;
    }

    function createScope(module, entryId) {
        const abortController = new AbortController();
        const cleanups = new Set();
        const timeouts = new Set();
        const intervals = new Set();
        let disposed = false;

        const addCleanup = cleanup => {
            if (typeof cleanup !== 'function') return cleanup;
            if (disposed) cleanup();
            else cleanups.add(cleanup);
            return cleanup;
        };
        const context = {
            id: module.id,
            module,
            root: null,
            host: content,
            routeId: entryId,
            signal: abortController.signal,
            table: (name, version) => window.AKEV3.table(name, version),
            text: (value, fallback) => window.AKEV3?.text?.(value, fallback) ?? value?.text ?? fallback ?? '',
            navigate(nextEntryId) {
                if (disposed || activeModuleId !== module.id) return false;
                const normalized = nextEntryId === undefined || nextEntryId === null || String(nextEntryId) === '' ? null : String(nextEntryId);
                routeByModule.set(module.id, normalized);
                context.routeId = normalized;
                window.__akeRouter?.updateUrl(MODULE_ID, buildRoute(module.id, normalized));
                return true;
            },
            on(target, type, listener, options) {
                if (!target?.addEventListener || typeof listener !== 'function') return () => {};
                target.addEventListener(type, listener, options);
                const cleanup = () => target.removeEventListener(type, listener, options);
                addCleanup(cleanup);
                return cleanup;
            },
            setTimeout(callback, delay, ...args) {
                if (disposed) return null;
                const id = window.setTimeout(() => {
                    timeouts.delete(id);
                    if (!disposed) callback(...args);
                }, delay);
                timeouts.add(id);
                return id;
            },
            clearTimeout(id) {
                window.clearTimeout(id);
                timeouts.delete(id);
            },
            setInterval(callback, delay, ...args) {
                if (disposed) return null;
                const id = window.setInterval(() => { if (!disposed) callback(...args); }, delay);
                intervals.add(id);
                return id;
            },
            clearInterval(id) {
                window.clearInterval(id);
                intervals.delete(id);
            },
            escapeHtml,
            parseText: value => window.parseText ? window.parseText(value) : escapeHtml(value)
        };

        return {
            context,
            dispose() {
                if (disposed) return;
                disposed = true;
                abortController.abort();
                cleanups.forEach(cleanup => { try { cleanup(); } catch {} });
                cleanups.clear();
                timeouts.forEach(id => window.clearTimeout(id));
                intervals.forEach(id => window.clearInterval(id));
                timeouts.clear();
                intervals.clear();
            }
        };
    }

    async function releaseActiveController() {
        const controller = activeController;
        const scope = activeScope;
        activeController = null;
        activeScope = null;
        activeLoad = null;
        scope?.dispose();
        if (!controller) return;
        try {
            await controllerMethod(controller, ['deactivate'])?.();
        } catch (error) {
            console.warn(`杂项子模块停用失败：${activeModuleId}`, error);
        }
        try {
            if (typeof controller === 'function') await controller();
            else await controllerMethod(controller, ['destroy', 'unmount'])?.();
        } catch (error) {
            console.warn(`杂项子模块清理失败：${activeModuleId}`, error);
        }
    }

    async function scriptSource(src, signal) {
        const url = versionedUrl(src, 'script');
        if (url.origin !== window.location.origin || !url.pathname.startsWith('/plugin/js/') || !url.pathname.endsWith('.js')) {
            throw new Error(`子模块脚本必须位于 /plugin/js/：${src}`);
        }
        const key = url.href;
        if (!scriptSources.has(key)) {
            const request = (window.akeFetch || fetch)(url.href, { signal }).then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            }).catch(error => {
                scriptSources.delete(key);
                throw error;
            });
            scriptSources.set(key, request);
        }
        return scriptSources.get(key);
    }

    async function executeScripts(scope, module, generation) {
        const scripts = Array.from(content.querySelectorAll('script'));
        for (const sourceScript of scripts) {
            if (generation !== loadGeneration || scope.context.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const src = sourceScript.getAttribute('src');
            if (!src) throw new Error(`子模块不允许内联脚本：${module.id}`);
            const source = await scriptSource(src, scope.context.signal);
            if (generation !== loadGeneration || scope.context.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const script = document.createElement('script');
            Array.from(sourceScript.attributes).forEach(attribute => {
                if (attribute.name !== 'src') script.setAttribute(attribute.name, attribute.value);
            });
            script.textContent = `${source}\n//# sourceURL=${new URL(src, window.location.href).href}`;
            sourceScript.parentNode.replaceChild(script, sourceScript);
        }
    }

    async function loadSubmodule(module, entryId, generation) {
        await releaseActiveController();
        if (generation !== loadGeneration || !parentActive || destroyed) return;

        const scope = createScope(module, entryId);
        activeScope = scope;
        renderShellState('loading', `正在读取${translate(module.title)}`);
            const response = await (window.akeFetch || fetch)(versionedUrl(module.contentFile, 'plugin').href, { signal: scope.context.signal });
        if (!response.ok) throw new Error(`无法加载 ${module.contentFile} (HTTP ${response.status})`);
        const html = await response.text();
        if (generation !== loadGeneration || scope.context.signal.aborted) return;

        const template = document.createElement('template');
        template.innerHTML = html;
        if (template.content.querySelector('link[rel="stylesheet"], style')) {
            throw new Error(`杂项子模块请使用 AKEUI 共享主题模板：${module.id}`);
        }
        window.akeDataSource?.rewriteDomAssets?.(template.content);
        registrations.delete(module.id);
        content.replaceChildren(template.content.cloneNode(true));
        scope.context.root = content.querySelector(`[data-misc-module="${module.id}"]`) || content.firstElementChild || content;
        await executeScripts(scope, module, generation);
        if (generation !== loadGeneration || scope.context.signal.aborted) return;

        const factory = registrations.get(module.id);
        if (typeof factory !== 'function') throw new Error(`子模块脚本未注册 AKEMisc 控制器：${module.id}`);
        let controller = await factory(scope.context);
        if (generation !== loadGeneration || scope.context.signal.aborted) {
            if (typeof controller === 'function') await controller();
            else await controllerMethod(controller, ['destroy', 'unmount'])?.();
            return;
        }
        controller = controller || {};
        activeController = controller;
        const mount = controllerMethod(controller, ['mount']);
        if (mount) await mount(scope.context.root, scope.context);
        if (generation !== loadGeneration || scope.context.signal.aborted) return;
        await controllerMethod(controller, ['activate'])?.();
        window.akeData?.translateDOM?.(content);
    }

    async function selectModule(moduleId, options = {}) {
        const module = modules.find(entry => entry.id === moduleId);
        if (!module || !isAvailable(module)) {
            if (options.fromRoute) reportMissingRoute(options.rawRoute || moduleId, Boolean(module?.hidden));
            return false;
        }
        const entryId = options.entryId !== undefined ? options.entryId : routeByModule.get(module.id) ?? null;
        routeByModule.set(module.id, entryId);
        activeModuleId = module.id;
        renderModuleLists();
        closeMobileList();
        if (options.updateUrl !== false) window.__akeRouter?.updateUrl(MODULE_ID, buildRoute(module.id, entryId));
        if (!parentActive || destroyed) return true;

        const generation = ++loadGeneration;
        const request = loadSubmodule(module, entryId, generation).catch(async error => {
            if (generation !== loadGeneration || error?.name === 'AbortError') return;
            console.error(`杂项子模块加载失败：${module.id}`, error);
            await releaseActiveController();
            renderShellState('error', `${translate(module.title)}加载失败`, error.message || String(error));
        }).finally(() => {
            if (activeLoad === request) activeLoad = null;
        });
        activeLoad = request;
        await request;
        return generation === loadGeneration;
    }

    function onModuleListClick(event) {
        const item = event.target.closest('[data-misc-id]');
        if (!item) return;
        void selectModule(item.dataset.miscId, { entryId: routeByModule.get(item.dataset.miscId) ?? null });
    }

    async function initialize() {
        try {
            const response = await (window.akeFetch || fetch)(versionedUrl(MANIFEST_URL, 'plugin').href);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            modules = normalizeManifest(await response.json());
            initialized = true;
            renderModuleLists();
            if (!parentActive || destroyed) return;

            const rawRoute = window.__deepLinkId;
            window.__deepLinkId = null;
            const route = parseRoute(rawRoute);
            const requested = modules.find(module => module.id === route.moduleId);
            if (rawRoute && (!requested || !isAvailable(requested))) {
                reportMissingRoute(rawRoute, Boolean(requested?.hidden));
                return;
            }
            const initial = requested || visibleModules()[0];
            if (!initial) {
                renderShellState('empty', '没有可用的杂项模块');
                return;
            }
            if (requested) routeByModule.set(requested.id, route.entryId);
            await selectModule(initial.id, {
                entryId: requested ? route.entryId : null,
                updateUrl: Boolean(rawRoute) ? false : true,
                fromRoute: Boolean(rawRoute),
                rawRoute
            });
        } catch (error) {
            initialized = true;
            console.error('杂项模块清单加载失败', error);
            renderShellState('error', '杂项模块清单加载失败', error.message || String(error));
        }
    }

    function suspend() {
        if (!parentActive) return;
        parentActive = false;
        loadGeneration += 1;
        closeMobileList();
        void releaseActiveController().then(() => {
            if (!parentActive && !destroyed) renderShellState('loading', '杂项模块已暂停');
        });
    }

    function resume() {
        if (parentActive || destroyed) return;
        parentActive = true;
        if (!initialized) return;
        const target = modules.find(module => module.id === activeModuleId && isAvailable(module)) || visibleModules()[0];
        if (target) void selectModule(target.id, { entryId: routeByModule.get(target.id) ?? null, updateUrl: false });
        else renderShellState('empty', '没有可用的杂项模块');
    }

    function onParentDeactivate(event) {
        if (event.detail?.moduleId === MODULE_ID) suspend();
    }

    function onParentActivate(event) {
        if (event.detail?.moduleId === MODULE_ID) resume();
    }

    function onGlobalConfigChanged() {
        renderModuleLists();
        if (!initialized || !parentActive) return;
        const active = modules.find(module => module.id === activeModuleId);
        if (!isAvailable(active)) {
            const replacement = visibleModules()[0];
            if (replacement) void selectModule(replacement.id);
            else renderShellState('empty', '没有可用的杂项模块');
            return;
        }
        void selectModule(active.id, {
            entryId: routeByModule.get(active.id) ?? null,
            updateUrl: false
        });
    }

    const api = Object.freeze({
        register(id, factory) {
            const normalized = String(id || '').trim();
            if (!MODULE_ID_PATTERN.test(normalized) || typeof factory !== 'function') {
                throw new TypeError('AKEMisc.register 需要有效的模块 ID 和 factory');
            }
            registrations.set(normalized, factory);
            return () => { if (registrations.get(normalized) === factory) registrations.delete(normalized); };
        },
        navigate(entryId) {
            if (!activeScope) return false;
            return activeScope.context.navigate(entryId);
        },
        getActiveModule: () => activeModuleId || null,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            parentActive = false;
            loadGeneration += 1;
            loaderCleanups.splice(0).forEach(cleanup => cleanup());
            closeMobileList();
            void releaseActiveController();
            registrations.clear();
            if (window.AKEMisc === api) delete window.AKEMisc;
        }
    });

    window.AKEMisc?.destroy?.();
    window.AKEMisc = api;
    addLoaderListener(list, 'click', onModuleListClick);
    addLoaderListener(mobileList, 'click', onModuleListClick);
    addLoaderListener(mobileButton, 'click', openMobileList);
    addLoaderListener(mobileOverlay, 'click', event => {
        if (event.target === mobileOverlay || event.target.closest('.ake-ui-directory__mobile-header button')) closeMobileList();
    });
    addLoaderListener(window, 'ake:module-deactivate', onParentDeactivate);
    addLoaderListener(window, 'ake:module-activate', onParentActivate);
    addLoaderListener(window, 'globalConfigChanged', onGlobalConfigChanged);
    addLoaderListener(document, 'keydown', event => { if (event.key === 'Escape') closeMobileList(); });
    void initialize();
})();
