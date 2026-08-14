(function () {
    if (window.AKEUI) return;

    const isNode = value => typeof Node !== 'undefined' && value instanceof Node;
    const isPresent = value => value !== undefined
        && value !== null
        && (typeof value !== 'string' || value.trim() !== '');
    const hasItems = value => Array.isArray(value) && value.length > 0;

    function appendContent(parent, value) {
        if (!isPresent(value)) return;
        if (isNode(value)) {
            parent.appendChild(value);
            return;
        }
        parent.appendChild(document.createTextNode(String(value)));
    }

    function element(tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        appendContent(node, content);
        return node;
    }

    function applyCommonState(node, options) {
        const density = options.density || 'regular';
        const layout = options.layout || 'compact';
        node.dataset.density = density;
        node.dataset.layout = layout;

        const accent = options.accent;
        if (accent?.type && isPresent(accent.value)) {
            node.dataset.accent = accent.type;
            node.dataset.accentValue = String(accent.value);
        }
        if (options.change?.type) {
            node.dataset.akeChange = options.change.type;
            if (options.change.label) node.dataset.akeChangeLabel = options.change.label;
        }
        if (options.disabled) {
            node.classList.add('is-disabled');
            if ('disabled' in node) node.disabled = true;
            node.setAttribute('aria-disabled', 'true');
        }
    }

    function enhanceCard(node, options = {}) {
        if (!(node instanceof Element)) return node;
        node.classList.add('ake-ui-card');
        node.dataset.variant = options.variant || node.dataset.variant || 'entity';
        applyCommonState(node, options);
        if (options.interactive === true || typeof options.onSelect === 'function') {
            node.classList.add('is-interactive');
            if (typeof options.onSelect === 'function' && !options.disabled) {
                node.addEventListener('click', event => options.onSelect(event, options));
            }
        }
        return node;
    }

    function badge(data) {
        if (!isPresent(data)) return null;
        const definition = typeof data === 'object' ? data : { label: data };
        if (!isPresent(definition.label)) return null;
        const node = element('span', 'ake-ui-badge', definition.label);
        if (definition.tone) node.dataset.tone = definition.tone;
        if (definition.title) node.title = definition.title;
        return node;
    }

    function metaGrid(items, options = {}) {
        const visibleItems = (items || []).filter(item => item && isPresent(item.value));
        if (!visibleItems.length && !options.preserveEmpty) return null;
        const grid = element('dl', 'ake-ui-meta-grid');
        if (options.columns) grid.style.setProperty('--ake-ui-meta-columns', String(options.columns));
        visibleItems.forEach(item => {
            const row = element('div', 'ake-ui-meta-grid__item');
            const label = element('dt');
            if (item.icon) {
                const icon = element('img', 'ake-ui-meta-grid__icon');
                icon.src = item.icon;
                icon.alt = '';
                label.appendChild(icon);
            }
            if (isPresent(item.label)) appendContent(label, item.label);
            if (label.childNodes.length) row.appendChild(label);
            row.appendChild(element('dd', null, item.value));
            grid.appendChild(row);
        });
        return grid;
    }

    function dataTable(definition = {}) {
        const columns = definition.columns || [];
        const rows = definition.rows || [];
        if (!columns.length && !rows.length && !definition.preserveEmpty) return null;
        const shell = element('div', 'ake-ui-table-shell');
        const table = element('table', 'ake-ui-table');
        if (columns.length) {
            const head = table.createTHead();
            const row = head.insertRow();
            columns.forEach(column => {
                const cell = document.createElement('th');
                cell.scope = 'col';
                appendContent(cell, typeof column === 'object' ? column.label : column);
                row.appendChild(cell);
            });
        }
        const body = table.createTBody();
        rows.forEach(rowData => {
            const row = body.insertRow();
            const values = Array.isArray(rowData) ? rowData : columns.map(column => rowData?.[column.key]);
            values.forEach(value => appendContent(row.insertCell(), value));
        });
        shell.appendChild(table);
        return shell;
    }

    function section(definition = {}) {
        if (!definition.preserveEmpty && !isPresent(definition.content) && !hasItems(definition.items) && !hasItems(definition.rows)) {
            return null;
        }
        const node = element(definition.element || 'section', 'ake-ui-section');
        if (definition.variant) node.dataset.variant = definition.variant;
        if (isPresent(definition.title)) node.appendChild(element('h3', 'ake-ui-section__title', definition.title));

        let content = definition.content;
        if (definition.type === 'meta') content = metaGrid(definition.items, definition);
        if (definition.type === 'table') content = dataTable(definition);
        if (definition.type === 'list') {
            const list = element('ul', 'ake-ui-list');
            (definition.items || []).filter(isPresent).forEach(item => list.appendChild(element('li', null, item)));
            content = list.childElementCount ? list : null;
        }
        if (isPresent(content)) {
            const body = element('div', 'ake-ui-section__body');
            appendContent(body, content);
            node.appendChild(body);
        }
        return node.childElementCount || definition.preserveEmpty ? node : null;
    }

    function card(options = {}) {
        const interactive = options.interactive === true || typeof options.onSelect === 'function';
        const tag = options.element || (interactive ? 'button' : 'article');
        const node = element(tag, 'ake-ui-card');
        node.dataset.akeComponent = 'card';
        if (tag === 'button') node.type = 'button';
        enhanceCard(node, options);

        let media = null;
        if (options.media?.src || isNode(options.media)) {
            media = element('div', 'ake-ui-card__media');
            if (isNode(options.media)) {
                media.appendChild(options.media);
            } else {
                const image = element('img');
                image.src = options.media.src;
                image.alt = options.media.alt || '';
                if (options.media.loading !== false) image.loading = 'lazy';
                media.appendChild(image);
            }
            node.classList.add('has-media');
        } else if (options.media?.placeholder) {
            media = element('div', 'ake-ui-card__media is-placeholder', options.media.placeholder);
            node.classList.add('has-media');
        }

        const content = element('div', 'ake-ui-card__content');
        const headerData = options.header || {};
        const hasHeader = Boolean(media) || isPresent(headerData.title) || isPresent(headerData.subtitle) || isPresent(headerData.id) || hasItems(headerData.badges);
        if (hasHeader) {
            const header = element('header', 'ake-ui-card__header');
            if (media) header.appendChild(media);
            const copy = element('div', 'ake-ui-card__heading');
            if (isPresent(headerData.title)) copy.appendChild(element('h3', 'ake-ui-card__title', headerData.title));
            if (isPresent(headerData.subtitle)) copy.appendChild(element('p', 'ake-ui-card__subtitle', headerData.subtitle));
            if (isPresent(headerData.id)) copy.appendChild(element('small', 'ake-ui-card__id', headerData.id));
            if (copy.childElementCount) header.appendChild(copy);
            if (hasItems(headerData.badges)) {
                const badges = element('div', 'ake-ui-card__badges');
                headerData.badges.forEach(item => {
                    const node = badge(item);
                    if (node) badges.appendChild(node);
                });
                if (badges.childElementCount) header.appendChild(badges);
            }
            content.appendChild(header);
        }

        const meta = metaGrid(options.meta, options.metaOptions);
        if (meta) content.appendChild(meta);
        (options.sections || []).forEach(definition => {
            const node = section(definition);
            if (node) content.appendChild(node);
        });

        if (hasItems(options.actions)) {
            const actions = element('div', 'ake-ui-card__actions');
            options.actions.filter(isPresent).forEach(action => appendContent(actions, action));
            if (actions.childNodes.length) content.appendChild(actions);
        }
        if (isPresent(options.footer)) {
            const footer = element('footer', 'ake-ui-card__footer');
            appendContent(footer, options.footer);
            content.appendChild(footer);
        }
        if (content.childElementCount) node.appendChild(content);

        return node;
    }

    function stateView(options = {}) {
        const node = element('div', 'ake-ui-state');
        node.dataset.state = options.state || 'empty';
        if (options.density) node.dataset.density = options.density;
        node.setAttribute('role', options.state === 'error' ? 'alert' : 'status');
        if (options.state === 'loading' && options.spinner !== false) node.appendChild(element('span', 'ake-ui-spinner'));
        if (options.icon) appendContent(node, options.icon);
        if (isPresent(options.title)) node.appendChild(element('strong', 'ake-ui-state__title', options.title));
        if (isPresent(options.message)) node.appendChild(element('p', 'ake-ui-state__message', options.message));
        if (isPresent(options.action)) appendContent(node, options.action);
        return node;
    }

    function directoryItem(options = {}) {
        const node = element(options.element || 'button', 'ake-ui-directory__item');
        if (node.tagName === 'BUTTON') node.type = 'button';
        applyCommonState(node, options);
        if (options.active) node.classList.add('is-active');
        if (options.icon?.src) {
            const image = element('img', 'ake-ui-directory__item-icon');
            image.src = options.icon.src;
            image.alt = options.icon.alt || '';
            node.appendChild(image);
        }
        const copy = element('span', 'ake-ui-directory__item-copy');
        if (isPresent(options.title)) copy.appendChild(element('strong', 'ake-ui-directory__item-title', options.title));
        if (isPresent(options.subtitle)) copy.appendChild(element('small', 'ake-ui-directory__item-subtitle', options.subtitle));
        if (copy.childElementCount) node.appendChild(copy);
        if (isPresent(options.count)) node.appendChild(element('span', 'ake-ui-directory__item-count', options.count));
        if (typeof options.onSelect === 'function' && !options.disabled) node.addEventListener('click', options.onSelect);
        return node;
    }

    function detailHeader(options = {}) {
        const header = element('header', 'ake-ui-detail-header');
        if (options.icon?.src || isNode(options.icon)) {
            const media = element('div', 'ake-ui-detail-media');
            if (isNode(options.icon)) {
                media.appendChild(options.icon);
            } else {
                const image = element('img');
                image.src = options.icon.src;
                image.alt = options.icon.alt || '';
                media.appendChild(image);
            }
            header.appendChild(media);
        }
        const hasCopy = isPresent(options.title) || isPresent(options.id) || isPresent(options.subtitle) || hasItems(options.badges) || hasItems(options.meta);
        if (hasCopy) {
            const copy = element('div', 'ake-ui-detail-copy');
            if (isPresent(options.title) || isPresent(options.id) || hasItems(options.badges)) {
                const titleRow = element('div', 'ake-ui-detail-title-row');
                if (isPresent(options.title)) titleRow.appendChild(element('h2', 'ake-ui-detail-title', options.title));
                if (isPresent(options.id)) titleRow.appendChild(element('small', 'ake-ui-detail-id', options.id));
                (options.badges || []).forEach(item => {
                    const badgeNode = badge(item);
                    if (badgeNode) titleRow.appendChild(badgeNode);
                });
                if (titleRow.childElementCount) copy.appendChild(titleRow);
            }
            if (isPresent(options.subtitle)) copy.appendChild(element('p', 'ake-ui-detail-subtitle', options.subtitle));
            const meta = metaGrid(options.meta, options.metaOptions);
            if (meta) copy.appendChild(meta);
            if (copy.childElementCount) header.appendChild(copy);
        }
        return header.childElementCount ? header : null;
    }

    function directory(options = {}) {
        const root = element(options.element || 'div', 'ake-ui-directory');
        if (options.moduleId) root.dataset.akeModule = options.moduleId;
        const sidebar = element('aside', 'ake-ui-directory__sidebar');
        if (isPresent(options.sidebarHeader)) sidebar.appendChild(element('header', 'ake-ui-directory__sidebar-header', options.sidebarHeader));
        if (isNode(options.search)) sidebar.appendChild(options.search);
        const list = element(options.listElement || 'nav', 'ake-ui-directory__list');
        (options.items || []).filter(isPresent).forEach(item => appendContent(list, item));
        sidebar.appendChild(list);
        root.appendChild(sidebar);
        const content = element(options.contentElement || 'main', 'ake-ui-directory__content');
        if (isPresent(options.content)) appendContent(content, options.content);
        root.appendChild(content);
        return { root, sidebar, list, content };
    }

    window.AKEUI = Object.freeze({
        isPresent,
        element,
        enhanceCard,
        badge,
        metaGrid,
        dataTable,
        section,
        card,
        stateView,
        directoryItem,
        detailHeader,
        directory
    });
})();
