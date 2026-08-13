(function () {
    if (window.AKESelect) return;

    const instances = new WeakMap();
    let openInstance = null;

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

    function create(select) {
        if (!(select instanceof HTMLSelectElement) || instances.has(select)) return instances.get(select);

        const shell = document.createElement('div');
        shell.className = 'app-custom-select';

        const trigger = document.createElement('button');
        trigger.className = 'app-custom-select__trigger';
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<span class="app-custom-select__value"></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>';

        const menu = document.createElement('div');
        menu.className = 'app-custom-select__menu';
        menu.hidden = true;

        const list = document.createElement('div');
        list.className = 'app-custom-select__list';
        list.setAttribute('role', 'listbox');
        menu.appendChild(list);
        document.body.appendChild(menu);

        const connector = document.createElement('div');
        connector.className = 'app-custom-select__connector';
        connector.hidden = true;
        document.body.appendChild(connector);

        select.parentNode.insertBefore(shell, select);
        shell.append(select, trigger);
        select.classList.add('app-select--native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');

        const instance = { select, shell, trigger, menu, list, connector, items: [], activeIndex: -1 };
        instances.set(select, instance);

        function selectedIndexInItems() {
            return instance.items.findIndex(item => item.dataset.value === select.value && item.getAttribute('aria-disabled') !== 'true');
        }

        function updateActive(index, scroll = true) {
            if (!instance.items.length) return;
            const next = Math.max(0, Math.min(index, instance.items.length - 1));
            instance.activeIndex = next;
            instance.items.forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === next));
            if (scroll) instance.items[next]?.scrollIntoView({ block: 'nearest' });
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
            trigger.querySelector('.app-custom-select__value').textContent = selected?.textContent?.trim() || '';
            trigger.disabled = select.disabled;
            shell.classList.toggle('is-disabled', select.disabled);
            instance.items.forEach(item => {
                const isSelected = item.dataset.value === select.value;
                item.classList.toggle('is-selected', isSelected);
                item.setAttribute('aria-selected', String(isSelected));
            });
        }

        function rebuild() {
            list.replaceChildren();
            instance.items = [];
            optionEntries(select).forEach(entry => {
                if (entry.type === 'group') {
                    const group = document.createElement('div');
                    group.className = 'app-custom-select__group';
                    group.textContent = entry.label;
                    list.appendChild(group);
                    return;
                }

                const item = document.createElement('button');
                item.className = 'app-custom-select__option';
                item.type = 'button';
                item.dataset.value = entry.option.value;
                item.textContent = entry.option.textContent;
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
            if (openInstance && openInstance !== instance) openInstance.close();
            rebuild();
            menu.hidden = false;
            connector.hidden = false;
            shell.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            openInstance = instance;
            positionMenu();
            updateActive(Math.max(0, selectedIndexInItems()), false);
        }

        function close() {
            menu.hidden = true;
            connector.hidden = true;
            shell.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
            if (openInstance === instance) openInstance = null;
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

    function enhanceAll(root = document) {
        root.querySelectorAll?.('select.app-select').forEach(create);
    }

    document.addEventListener('click', event => {
        if (!openInstance) return;
        if (openInstance.shell.contains(event.target) || openInstance.menu.contains(event.target)) return;
        openInstance.close();
    });
    new MutationObserver(() => {
        if (openInstance && openInstance.trigger.offsetParent === null) openInstance.close();
    }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
    window.addEventListener('resize', () => openInstance?.positionMenu());
    window.addEventListener('scroll', () => openInstance?.positionMenu(), true);

    window.AKESelect = {
        enhanceAll,
        refresh(select) {
            const instance = instances.get(select) || create(select);
            instance?.rebuild();
        }
    };

    enhanceAll();
})();
