(function () {
    'use strict';

    const MODULE_ID = 'asset';
    const ASSET_DATA_ORIGIN = 'https://data.akedata.wiki';
    const root = document.getElementById('akeAssetModule');
    if (!root || !window.akeAssetIndex) return;

    window.__akeAssetController?.destroy?.();

    const t = window.akeI18n?.scope?.('modules.asset') || ((key, params, fallback) => fallback ?? key);
    const elements = {
        sidebarMeta: document.getElementById('akeAssetSidebarMeta'),
        home: document.getElementById('akeAssetHome'),
        search: document.getElementById('akeAssetSearch'),
        directory: document.getElementById('akeAssetDirectory'),
        content: document.getElementById('akeAssetContent'),
        mobileButton: document.getElementById('akeAssetMobileButton'),
        mobileOverlay: document.getElementById('akeAssetMobileOverlay'),
        mobileClose: document.getElementById('akeAssetMobileClose'),
        mobileSearch: document.getElementById('akeAssetMobileSearch'),
        mobileDirectory: document.getElementById('akeAssetMobileDirectory')
    };
    const state = {
        index: null,
        tree: null,
        location: [],
        query: '',
        renderToken: 0,
        disposed: false
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    }

    function formatBytes(value) {
        const size = Number(value) || 0;
        if (size < 1024) return `${size} B`;
        const units = ['KB', 'MB', 'GB', 'TB'];
        let amount = size;
        let unit = -1;
        while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
        return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unit]}`;
    }

    function naturalCompare(a, b) {
        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    }

    function safeParts(path) {
        const parts = String(path || '').replace(/\\/g, '/').split('/');
        if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || /[\r\n]/.test(part))) throw new Error('索引路径不安全');
        return parts;
    }

    function encodePath(parts) {
        return parts.map(encodeURIComponent).join('/');
    }

    function fileUrl(dataset, relative) {
        const rootPath = dataset === 'images' ? 'public/images' : 'public/Json';
        return `${ASSET_DATA_ORIGIN}/${rootPath}/${encodePath(safeParts(relative))}`;
    }

    function isImage(relative) {
        return /\.(?:png|jpe?g|webp|gif|avif|bmp|ico)$/i.test(relative);
    }

    function fileItem(dataset, relative, record) {
        const parts = safeParts(relative);
        return { type: 'file', dataset, relative, parts, name: parts.at(-1), record, url: fileUrl(dataset, relative), image: dataset === 'images' && isImage(relative) };
    }

    function makeTree(index) {
        const roots = new Map();
        for (const dataset of ['images', 'json']) {
            const node = { type: 'directory', dataset, name: dataset === 'images' ? 'public / images' : 'public / Json', parts: [], children: new Map(), files: [] };
            roots.set(dataset, node);
            for (const [relative, record] of Object.entries(index.datasets?.[dataset]?.files || {})) {
                if (dataset === 'json' && safeParts(relative).at(-1).toLowerCase() === 'manifest.json') continue;
                const parts = safeParts(relative);
                let current = node;
                parts.forEach((part, partIndex) => {
                    if (partIndex === parts.length - 1) {
                        current.files.push(fileItem(dataset, relative, record));
                        return;
                    }
                    if (!current.children.has(part)) current.children.set(part, { type: 'directory', dataset, name: part, parts: parts.slice(0, partIndex + 1), children: new Map(), files: [] });
                    current = current.children.get(part);
                });
            }
        }
        return roots;
    }

    function currentNode() {
        if (!state.location.length) return { type: 'directory', name: t('root', null, '根目录'), parts: [], children: state.tree, files: [] };
        let node = state.tree.get(state.location[0]);
        for (const part of state.location.slice(1)) node = node?.children.get(part);
        return node || null;
    }

    function allFiles(node, output = []) {
        if (!node) return output;
        node.files.forEach(file => output.push(file));
        node.children.forEach(child => allFiles(child, output));
        return output;
    }

    function directItems(node) {
        if (!node) return [];
        const folders = Array.from(node.children.values()).map(folder => ({ ...folder, type: 'directory' }));
        const files = node.files.slice();
        const query = state.query.trim().toLocaleLowerCase();
        const filtered = query
            ? files.filter(file => `${file.name} ${file.dataset}/${file.relative}`.toLocaleLowerCase().includes(query))
            : files;
        return [...folders.sort((a, b) => naturalCompare(a.name, b.name)), ...filtered.sort((a, b) => (a.image === b.image ? naturalCompare(a.name, b.name) : a.image ? -1 : 1))];
    }

    function directoryLabel(node) {
        const folders = node ? Array.from(node.children.values()).length : 0;
        const files = node ? node.files.length : 0;
        const images = node ? node.files.filter(file => file.image).length : 0;
        const bytes = node ? node.files.reduce((sum, file) => sum + Number(file.record?.size || 0), 0) : 0;
        return `${t('counts.folders', { count: folders }, `${folders} 个文件夹`)} · ${t('counts.files', { count: files }, `${files} 个文件`)} · ${t('counts.images', { count: images }, `${images} 张图片`)} · ${formatBytes(bytes)}`;
    }

    function nodePath(node) {
        if (!node?.dataset) return t('root', null, '根目录');
        const base = node.dataset === 'images' ? 'public/images' : 'public/Json';
        return [base, ...node.parts].join('/');
    }

    function renderDirectoryList(target) {
        target.replaceChildren();
        const rootButton = document.createElement('button');
        rootButton.type = 'button'; rootButton.className = 'ake-ui-directory__item'; rootButton.textContent = t('root', null, '根目录');
        rootButton.addEventListener('click', () => navigate([])); target.appendChild(rootButton);
        for (const [dataset, node] of state.tree) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'ake-ui-directory__item'; button.textContent = node.name;
            button.addEventListener('click', () => navigate([dataset])); target.appendChild(button);
        }
        if (state.location.length) {
            const node = currentNode();
            const chain = [state.location[0]];
            for (const part of state.location.slice(1)) chain.push(part);
            let prefix = [state.location[0]];
            chain.slice(1).forEach(part => {
                const button = document.createElement('button');
                button.type = 'button'; button.className = 'ake-ui-directory__item'; button.textContent = part;
                const targetPath = prefix.slice(); targetPath.push(part);
                button.addEventListener('click', () => navigate(targetPath)); target.appendChild(button); prefix = targetPath;
            });
            if (node) target.lastElementChild?.classList.add('is-active');
        }
    }

    function breadcrumb(node) {
        const wrapper = document.createElement('nav'); wrapper.setAttribute('aria-label', t('path', null, '当前路径')); wrapper.className = 'ake-ui-section';
        const paths = [{ label: t('root', null, '根目录'), value: [] }];
        if (node?.dataset) {
            paths.push({ label: node.name, value: [node.dataset] });
            node.parts.forEach((part, index) => paths.push({ label: part, value: [node.dataset, ...node.parts.slice(0, index + 1)] }));
        }
        paths.forEach((item, index) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'ake-ui-button'; button.textContent = item.label; button.addEventListener('click', () => navigate(item.value)); wrapper.appendChild(button);
            if (index < paths.length - 1) wrapper.appendChild(document.createTextNode(' / '));
        });
        return wrapper;
    }

    function makeDownload(file) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ake-ui-button'; button.textContent = t('download', null, '下载');
        button.addEventListener('click', async () => {
            button.disabled = true; button.textContent = t('downloading', null, '下载中');
            try {
                const response = await fetch(file.url); if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob(); const href = URL.createObjectURL(blob); const anchor = document.createElement('a');
                anchor.href = href; anchor.download = file.name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(href);
            } catch (error) { window.showToast?.(`${t('downloadFailed', null, '下载失败')}：${error.message}`, 'error'); }
            finally { button.disabled = false; button.textContent = t('download', null, '下载'); }
        }); return button;
    }

    function makeFileCard(file) {
        const card = document.createElement('article'); card.className = 'ake-ui-card';
        const heading = document.createElement('h3'); heading.className = 'ake-ui-card__title'; heading.textContent = file.name; card.appendChild(heading);
        if (file.image) { const image = document.createElement('img'); image.src = file.url; image.alt = file.name; image.loading = 'eager'; image.decoding = 'async'; image.setAttribute('data-ake-image-fallback', 'defer'); image.addEventListener('error', () => { image.alt = `${file.name} (${t('imageFailed', null, '图片加载失败')})`; }); card.appendChild(image); }
        const meta = document.createElement('p'); meta.className = 'ake-ui-card__meta'; meta.textContent = `${file.name.split('.').pop().toUpperCase()} · ${formatBytes(file.record?.size)} · MD5 ${file.record?.md5 || '—'}`; card.appendChild(meta);
        const path = document.createElement('p'); path.className = 'ake-ui-card__meta'; path.textContent = `${file.dataset === 'images' ? 'public/images' : 'public/Json'}/${file.relative}`; card.appendChild(path);
        const actions = document.createElement('div'); actions.className = 'ake-ui-card__actions'; actions.appendChild(makeDownload(file)); const open = document.createElement('a'); open.className = 'ake-ui-button'; open.href = file.url; open.target = '_blank'; open.rel = 'noopener'; open.textContent = t('openOriginal', null, '打开原文件'); actions.appendChild(open); card.appendChild(actions); return card;
    }

    function makeFolderCard(folder) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ake-ui-card is-interactive';
        const count = allFiles(folder).length; button.innerHTML = `<strong>${escapeHtml(folder.name)}</strong><span>${escapeHtml(t('folder', { count }, `文件夹 · ${count} 项`))}</span>`; button.addEventListener('click', () => navigate([folder.dataset, ...folder.parts])); return button;
    }

    function renderContent() {
        const token = ++state.renderToken; const node = currentNode(); elements.content.replaceChildren();
        if (!node) { const section = document.createElement('section'); section.className = 'ake-ui-state'; section.innerHTML = `<div><h2>${escapeHtml(t('title', null, '资产'))}</h2><p>${escapeHtml(t('overview', null, '选择 public / images 或 public / Json 开始浏览'))}</p></div>`; elements.content.appendChild(section); return; }
        const header = document.createElement('header'); header.className = 'ake-ui-section'; header.appendChild(breadcrumb(node));
        const title = document.createElement('h2'); title.textContent = nodePath(node); header.appendChild(title);
        const meta = document.createElement('p'); meta.textContent = directoryLabel(node); header.appendChild(meta); elements.content.appendChild(header);
        const items = directItems(node); if (!items.length) { const empty = document.createElement('div'); empty.className = 'ake-ui-state'; empty.textContent = state.query ? t('empty.search', null, '搜索无结果') : t('empty.directory', null, '空目录'); elements.content.appendChild(empty); return; }
        const grid = document.createElement('div'); grid.className = 'ake-ui-card-grid'; const fragment = document.createDocumentFragment();
        items.forEach(item => fragment.appendChild(item.type === 'directory' ? makeFolderCard(item) : makeFileCard(item)));
        if (token === state.renderToken && !state.disposed) grid.appendChild(fragment); elements.content.appendChild(grid);
    }

    function navigate(path) { state.location = path.slice(); state.query = ''; elements.search.value = ''; elements.mobileSearch.value = ''; renderDirectoryList(elements.directory); renderDirectoryList(elements.mobileDirectory); renderContent(); }

    function openMobile() { elements.mobileOverlay.setAttribute('aria-hidden', 'false'); elements.mobileButton.setAttribute('aria-expanded', 'true'); }
    function closeMobile() { elements.mobileOverlay.setAttribute('aria-hidden', 'true'); elements.mobileButton.setAttribute('aria-expanded', 'false'); }
    function onSearch(event) { state.query = event.target.value; if (event.target !== elements.search) elements.search.value = state.query; if (event.target !== elements.mobileSearch) elements.mobileSearch.value = state.query; renderContent(); }

    async function initialize() {
        try {
            const index = await window.akeAssetIndex.load({ baseUrl: ASSET_DATA_ORIGIN }); if (state.disposed) return;
            state.index = index; state.tree = makeTree(index); elements.sidebarMeta.textContent = `${t('schema', null, 'schema')} ${index.schemaVersion} · ${t('revision', null, 'revision')} ${index.revision}`; navigate([]);
        } catch (error) { elements.content.innerHTML = `<div class="ake-ui-state" data-state="error"><div><h2>${escapeHtml(t('errors.load', null, '索引加载失败'))}</h2><p>${escapeHtml(error.message || t('errors.unavailable', null, '统一索引服务不可用'))}</p></div></div>`; }
    }

    elements.home.addEventListener('click', () => navigate([])); elements.search.addEventListener('input', onSearch); elements.mobileSearch.addEventListener('input', onSearch); elements.mobileButton.addEventListener('click', openMobile); elements.mobileClose.addEventListener('click', closeMobile); elements.mobileOverlay.addEventListener('click', event => { if (event.target === elements.mobileOverlay) closeMobile(); });
    root.dataset.moduleId = MODULE_ID;
    const controller = { destroy() { state.disposed = true; state.renderToken += 1; elements.home.replaceWith(elements.home.cloneNode(true)); elements.search.replaceWith(elements.search.cloneNode(true)); elements.mobileSearch.replaceWith(elements.mobileSearch.cloneNode(true)); elements.mobileButton.replaceWith(elements.mobileButton.cloneNode(true)); elements.mobileClose.replaceWith(elements.mobileClose.cloneNode(true)); } };
    window.__akeAssetController = controller;
    initialize();
})();
