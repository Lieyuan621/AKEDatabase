(function () {
    if (window.AKEUI) return;

    const isNode = value => typeof Node !== 'undefined' && value instanceof Node;
    const isPresent = value => value !== undefined
        && value !== null
        && (typeof value !== 'string' || value.trim() !== '');
    const hasItems = value => Array.isArray(value) && value.length > 0;
    const selectInstances = new WeakMap();
    const filterPanelInstances = new WeakMap();
    let openSelectInstance = null;
    let selectSequence = 0;
    let filterPanelSequence = 0;

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

    function applyAttributes(node, attributes = {}) {
        Object.entries(attributes).forEach(([name, value]) => {
            if (value === undefined || value === null || value === false) return;
            node.setAttribute(name, value === true ? '' : String(value));
        });
    }

    function setFilterButtonPressed(button, pressed) {
        if (!(button instanceof HTMLButtonElement)) return button;
        const isPressed = Boolean(pressed);
        button.classList.toggle('is-active', isPressed);
        button.setAttribute('aria-pressed', String(isPressed));
        return button;
    }

    function filterButton(options = {}) {
        const classes = ['ake-ui-filter__button'];
        if (options.className) classes.push(options.className);
        const node = element('button', classes.join(' '), options.label);
        node.type = 'button';
        applyCommonState(node, options);
        applyAttributes(node, options.attributes);
        setFilterButtonPressed(node, options.pressed);
        if (typeof options.onChange === 'function' && !options.disabled) {
            node.addEventListener('click', event => {
                const pressed = options.mode === 'single'
                    ? true
                    : node.getAttribute('aria-pressed') !== 'true';
                if (options.mode === 'single') {
                    node.parentElement?.querySelectorAll('.ake-ui-filter__button').forEach(button => {
                        setFilterButtonPressed(button, button === node);
                    });
                } else {
                    setFilterButtonPressed(node, pressed);
                }
                options.onChange(pressed, event, node);
            });
        }
        return node;
    }

    function enhanceFilterPanel(panel, options = {}) {
        if (!(panel instanceof Element)) return null;
        const existing = filterPanelInstances.get(panel);
        if (existing) {
            if (isPresent(options.summary)) existing.setSummary(options.summary);
            return existing;
        }

        let toggle = panel.querySelector(':scope > .ake-ui-filter__toggle');
        let content = panel.querySelector(':scope > .ake-ui-filter__content');

        if (!content) {
            content = element('div', 'ake-ui-filter__content');
            Array.from(panel.children).forEach(child => {
                if (child !== toggle) content.appendChild(child);
            });
            panel.appendChild(content);
        }

        if (!toggle) {
            toggle = element('button', 'ake-ui-filter__toggle');
            toggle.type = 'button';
            const summary = element('span', 'ake-ui-filter__summary', options.summary);
            const chevron = element('span', 'ake-ui-filter__chevron');
            chevron.setAttribute('aria-hidden', 'true');
            toggle.append(summary, chevron);
            panel.insertBefore(toggle, content);
        }

        const summary = toggle.querySelector('.ake-ui-filter__summary') || toggle.firstElementChild;
        summary?.classList.add('ake-ui-filter__summary');
        if (!content.id) content.id = `akeUiFilterContent-${++filterPanelSequence}`;
        toggle.setAttribute('aria-controls', content.id);

        const setExpanded = expanded => {
            const isExpanded = Boolean(expanded);
            toggle.setAttribute('aria-expanded', String(isExpanded));
            content.hidden = !isExpanded;
            panel.classList.toggle('is-expanded', isExpanded);
        };
        const setSummary = value => {
            if (summary && isPresent(value)) summary.textContent = String(value);
        };
        const initialExpanded = options.expanded ?? toggle.getAttribute('aria-expanded') === 'true';
        const instance = { panel, toggle, content, setExpanded, setSummary };
        filterPanelInstances.set(panel, instance);
        toggle.addEventListener('click', () => setExpanded(toggle.getAttribute('aria-expanded') !== 'true'));
        setSummary(options.summary);
        setExpanded(initialExpanded);
        return instance;
    }

    function updateFilterPanel(panel, options = {}) {
        const instance = filterPanelInstances.get(panel) || enhanceFilterPanel(panel, options);
        if (isPresent(options.summary)) instance?.setSummary(options.summary);
        return instance;
    }

    function optionEntries(select) {
        const entries = [];
        Array.from(select.children).forEach(child => {
            if (child instanceof HTMLOptGroupElement) {
                entries.push({ type: 'group', label: child.label });
                Array.from(child.children).forEach(option => entries.push({ type: 'option', option }));
                return;
            }
            if (child instanceof HTMLOptionElement) entries.push({ type: 'option', option: child });
        });
        return entries;
    }

    function enhanceSelect(select) {
        if (!(select instanceof HTMLSelectElement)) return null;
        if (selectInstances.has(select)) return selectInstances.get(select);
        if (!select.parentNode) return null;

        const shell = element('div', 'ake-ui-select');
        const trigger = element('button', 'ake-ui-select__trigger');
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<span class="ake-ui-select__value"></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>';

        const menu = element('div', 'ake-ui-select__menu');
        menu.hidden = true;
        menu.id = `akeUiSelectMenu-${++selectSequence}`;
        trigger.setAttribute('aria-controls', menu.id);

        const list = element('div', 'ake-ui-select__list');
        list.setAttribute('role', 'listbox');
        menu.appendChild(list);

        const connector = element('div', 'ake-ui-select__connector');
        connector.hidden = true;

        const accessibleLabel = select.getAttribute('aria-label') || select.labels?.[0]?.textContent?.trim();
        if (accessibleLabel) trigger.setAttribute('aria-label', accessibleLabel);

        const instance = { select, shell, trigger, menu, list, connector, items: [], activeIndex: -1 };
        selectInstances.set(select, instance);
        select.parentNode.insertBefore(shell, select);
        shell.append(select, trigger);
        document.body.append(menu, connector);
        select.classList.add('ake-ui-select__native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');

        function selectedIndexInItems() {
            return instance.items.findIndex(item => item.dataset.value === select.value && item.getAttribute('aria-disabled') !== 'true');
        }

        function updateActive(index, scroll = true) {
            if (!instance.items.length) return;
            let next = Math.max(0, Math.min(index, instance.items.length - 1));
            if (instance.items[next]?.disabled) {
                const enabledIndex = instance.items.findIndex(item => !item.disabled);
                if (enabledIndex < 0) return;
                next = enabledIndex;
            }
            instance.activeIndex = next;
            instance.items.forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === next));
            trigger.setAttribute('aria-activedescendant', instance.items[next].id);
            if (scroll) instance.items[next].scrollIntoView({ block: 'nearest' });
        }

        function positionMenu() {
            if (menu.hidden) return;
            const rect = trigger.getBoundingClientRect();
            const viewportGap = 10;
            const spaceBelow = window.innerHeight - rect.bottom - viewportGap;
            const spaceAbove = rect.top - viewportGap;
            const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
            const connectorHeight = 8;
            const connectorWidth = 16;
            const menuGap = connectorHeight;
            const maxHeight = Math.max(120, Math.min(280, (openAbove ? spaceAbove : spaceBelow) - menuGap));
            const menuLeft = Math.max(viewportGap, Math.min(rect.left, window.innerWidth - rect.width - viewportGap));
            const connectorLeft = menuLeft + ((rect.width - connectorWidth) / 2);
            menu.style.left = `${menuLeft}px`;
            menu.style.width = `${rect.width}px`;
            menu.style.maxHeight = `${maxHeight}px`;
            list.style.maxHeight = `${Math.max(106, maxHeight - 14)}px`;
            menu.style.top = openAbove ? 'auto' : `${rect.bottom + menuGap}px`;
            menu.style.bottom = openAbove ? `${window.innerHeight - rect.top + menuGap}px` : 'auto';
            menu.classList.toggle('opens-above', openAbove);
            menu.classList.toggle('opens-below', !openAbove);
            connector.classList.toggle('opens-above', openAbove);
            connector.classList.toggle('opens-below', !openAbove);
            connector.style.left = `${connectorLeft}px`;
            connector.style.top = openAbove ? `${rect.top - connectorHeight}px` : `${rect.bottom}px`;
        }

        function sync() {
            const selected = select.selectedOptions[0];
            trigger.querySelector('.ake-ui-select__value').textContent = selected?.textContent?.trim() || '';
            trigger.disabled = select.disabled;
            shell.classList.toggle('is-disabled', select.disabled);
            instance.items.forEach(item => {
                const selectedItem = item.dataset.value === select.value;
                item.classList.toggle('is-selected', selectedItem);
                item.setAttribute('aria-selected', String(selectedItem));
            });
        }

        function rebuild() {
            list.replaceChildren();
            instance.items = [];
            optionEntries(select).forEach(entry => {
                if (entry.type === 'group') {
                    const group = element('div', 'ake-ui-select__group', entry.label);
                    list.appendChild(group);
                    return;
                }

                const item = element('button', 'ake-ui-select__option', entry.option.textContent);
                item.type = 'button';
                item.id = `${menu.id}-option-${instance.items.length}`;
                item.dataset.value = entry.option.value;
                item.setAttribute('role', 'option');
                item.setAttribute('aria-disabled', String(entry.option.disabled));
                item.disabled = entry.option.disabled;
                item.addEventListener('click', () => {
                    if (entry.option.disabled) return;
                    select.value = entry.option.value;
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    sync();
                    close();
                    trigger.focus();
                });
                instance.items.push(item);
                list.appendChild(item);
            });
            sync();
        }

        function open() {
            if (select.disabled) return;
            if (openSelectInstance && openSelectInstance !== instance) openSelectInstance.close();
            rebuild();
            menu.hidden = false;
            connector.hidden = false;
            shell.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            openSelectInstance = instance;
            positionMenu();
            updateActive(Math.max(0, selectedIndexInItems()), false);
        }

        function close() {
            menu.hidden = true;
            connector.hidden = true;
            shell.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.removeAttribute('aria-activedescendant');
            if (openSelectInstance === instance) openSelectInstance = null;
        }

        instance.close = close;
        instance.rebuild = rebuild;
        instance.positionMenu = positionMenu;

        trigger.addEventListener('click', () => menu.hidden ? open() : close());
        trigger.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                close();
                return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            if (menu.hidden) {
                open();
                return;
            }
            if (event.key === 'ArrowDown') updateActive(instance.activeIndex + 1);
            if (event.key === 'ArrowUp') updateActive(instance.activeIndex - 1);
            if (event.key === 'Home') updateActive(0);
            if (event.key === 'End') updateActive(instance.items.length - 1);
            if (event.key === 'Enter' || event.key === ' ') instance.items[instance.activeIndex]?.click();
        });

        select.addEventListener('focus', () => trigger.focus());
        select.addEventListener('change', sync);
        new MutationObserver(rebuild).observe(select, { childList: true, subtree: true, attributes: true });
        rebuild();
        return instance;
    }

    function enhanceSelects(root = document) {
        if (root.matches?.('select.ake-ui-control--select')) enhanceSelect(root);
        root.querySelectorAll?.('select.ake-ui-control--select').forEach(enhanceSelect);
    }

    function refreshSelect(select) {
        const instance = selectInstances.get(select) || enhanceSelect(select);
        instance?.rebuild();
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

    function directoryItemMeta(entry) {
        if (!isPresent(entry)) return null;
        if (isNode(entry)) return entry;
        if (typeof entry === 'object' && entry.src) {
            const image = element('img', 'ake-ui-directory__item-meta-icon');
            image.src = entry.src;
            image.alt = entry.label || entry.alt || '';
            image.title = entry.label || entry.title || '';
            image.loading = 'lazy';
            image.decoding = 'async';
            if (entry.kind) image.dataset.kind = entry.kind;
            return image;
        }
        const label = typeof entry === 'object' ? entry.label : entry;
        if (!isPresent(label)) return null;
        const tag = element('span', 'ake-ui-directory__item-tag', label);
        if (typeof entry === 'object' && entry.kind) tag.dataset.kind = entry.kind;
        return tag;
    }

    function setDirectoryItemActive(container, activeItem) {
        if (!(container instanceof Element)) return activeItem;
        container.querySelectorAll('.ake-ui-directory__item').forEach(item => {
            const active = item === activeItem;
            item.classList.toggle('is-active', active);
            if (active) item.setAttribute('aria-current', 'true');
            else item.removeAttribute('aria-current');
        });
        return activeItem;
    }

    function directoryItem(options = {}) {
        const classes = ['ake-ui-directory__item'];
        if (options.className) classes.push(options.className);
        const node = element(options.element || 'button', classes.join(' '));
        if (node.tagName === 'BUTTON') node.type = 'button';
        applyCommonState(node, options);
        applyAttributes(node, options.attributes);
        if (options.active) {
            node.classList.add('is-active');
            node.setAttribute('aria-current', 'true');
        }

        if (options.background?.src) {
            const background = element('img', options.background.className || 'ake-ui-directory__item-background');
            background.src = options.background.src;
            background.alt = options.background.alt || '';
            background.loading = 'lazy';
            background.decoding = 'async';
            if (!background.alt) background.setAttribute('aria-hidden', 'true');
            node.appendChild(background);
        }

        let icon = null;
        if (isNode(options.icon)) {
            icon = options.icon;
        } else if (options.icon?.src) {
            const iconClasses = ['ake-ui-directory__item-icon'];
            if (options.icon.className) iconClasses.push(options.icon.className);
            const image = element('img', iconClasses.join(' '));
            image.src = options.icon.src;
            image.alt = options.icon.alt || '';
            image.loading = 'lazy';
            image.decoding = 'async';
            icon = image;
        }
        if (icon) {
            if (options.layout === 'entity') {
                const media = element('span', 'ake-ui-directory__item-media');
                media.appendChild(icon);
                node.appendChild(media);
            } else {
                node.appendChild(icon);
            }
        }

        const copy = element('span', 'ake-ui-directory__item-copy');
        if (options.layout === 'entity') {
            const heading = element('span', 'ake-ui-directory__item-heading');
            if (isPresent(options.title)) heading.appendChild(element('strong', 'ake-ui-directory__item-title', options.title));
            (options.titleMeta || []).map(directoryItemMeta).filter(Boolean).forEach(item => heading.appendChild(item));
            if (isPresent(options.count)) heading.appendChild(element('span', 'ake-ui-directory__item-count', options.count));
            if (heading.childElementCount) copy.appendChild(heading);

            const supporting = element('span', 'ake-ui-directory__item-supporting');
            if (isPresent(options.id)) supporting.appendChild(element('small', 'ake-ui-directory__item-id', options.id));
            else if (isPresent(options.subtitle)) supporting.appendChild(element('small', 'ake-ui-directory__item-subtitle', options.subtitle));
            const meta = element('span', 'ake-ui-directory__item-meta');
            (options.meta || []).map(directoryItemMeta).filter(Boolean).forEach(item => meta.appendChild(item));
            if (meta.childElementCount) supporting.appendChild(meta);
            if (supporting.childElementCount) copy.appendChild(supporting);
        } else {
            if (isPresent(options.title)) copy.appendChild(element('strong', 'ake-ui-directory__item-title', options.title));
            if (isPresent(options.subtitle)) copy.appendChild(element('small', 'ake-ui-directory__item-subtitle', options.subtitle));
        }
        if (copy.childElementCount) node.appendChild(copy);
        if (isPresent(options.trailing)) {
            const tail = element('span', 'ake-ui-directory__item-tail');
            appendContent(tail, options.trailing);
            node.appendChild(tail);
        }
        if (options.layout !== 'entity' && isPresent(options.count)) node.appendChild(element('span', 'ake-ui-directory__item-count', options.count));
        if (typeof options.onSelect === 'function' && !options.disabled) {
            node.addEventListener('click', event => options.onSelect(event, node));
        }
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

    document.addEventListener('click', event => {
        if (!openSelectInstance) return;
        if (openSelectInstance.shell.contains(event.target) || openSelectInstance.menu.contains(event.target)) return;
        openSelectInstance.close();
    });
    new MutationObserver(records => {
        records.forEach(record => Array.from(record.addedNodes).forEach(node => {
            if (node instanceof Element) enhanceSelects(node);
        }));
        if (openSelectInstance && openSelectInstance.trigger.offsetParent === null) openSelectInstance.close();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('resize', () => openSelectInstance?.positionMenu());
    window.addEventListener('scroll', () => openSelectInstance?.positionMenu(), true);

    window.AKEUI = Object.freeze({
        isPresent,
        element,
        filterButton,
        updateFilterPanel,
        refreshSelect,
        enhanceCard,
        badge,
        metaGrid,
        dataTable,
        section,
        card,
        stateView,
        directoryItem,
        setDirectoryItemActive,
        detailHeader,
        directory
    });

    enhanceSelects();
})();
