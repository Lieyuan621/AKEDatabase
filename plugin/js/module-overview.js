(function () {
    const roots = new Map();
    const searchSelectors = {
        v3_cc: '.v2cc-search',
        research: '.research-module .list-search',
        v3_character: '.character-module .list-search',
        v3_weapon: '.weapon-module .list-search-fixed',
        v3_enemy: '.v2e-search',
        v3_equip: '.v2eq-search',
        v3_activity: '.activity-module .list-search',
        v3_item: '.v2i-search',
        v3_dungeon: '.v2d-search',
        v3_achievement: '.achievement-module .list-search',
        spawn: '.spawner-module .list-search'
    };
    function text(value, fallback) {
        return value === undefined || value === null || value === '' ? (fallback || '') : String(value);
    }

    function render(container, options) {
        if (!container) return;
        roots.set(container.id, { container, options });
        const items = options.items || [];
        const groups = new Map();
        items.forEach((item) => {
            const group = options.group(item) || { id: 'all', name: window.akeData?.t('common.all', null, '全部') || '全部' };
            if (!groups.has(group.id)) groups.set(group.id, { ...group, items: [] });
            groups.get(group.id).items.push(item);
        });

        container.innerHTML = '';
        const root = document.createElement('div');
        root.className = 'ake-overview';

        const header = document.createElement('header');
        header.className = 'ake-overview__header';
        const heading = document.createElement('div');
        const eyebrow = document.createElement('div');
        eyebrow.className = 'ake-overview__eyebrow';
        eyebrow.textContent = window.akeData?.t('overview.count', { count: items.length }, `${items.length} 条数据`) || `${items.length} 条数据`;
        const title = document.createElement('h1');
        title.textContent = options.title;
        const description = document.createElement('p');
        description.textContent = options.description || window.akeData?.t('overview.hint', null, '选择卡片查看完整数据') || '选择卡片查看完整数据';
        heading.append(eyebrow, title, description);
        header.appendChild(heading);
        root.appendChild(header);

        const groupList = Array.from(groups.values()).sort((a, b) =>
            (a.order ?? 999) - (b.order ?? 999) || text(a.name).localeCompare(text(b.name), window.akeData?.getLanguage?.() === 'EN' ? 'en' : 'zh-CN'));
        groupList.forEach((group) => {
            const section = document.createElement('section');
            section.className = 'ake-overview__section';
            const groupTitle = document.createElement('h2');
            groupTitle.innerHTML = `<span></span><b></b>`;
            groupTitle.querySelector('span').textContent = group.name;
            groupTitle.querySelector('b').textContent = group.items.length;
            section.appendChild(groupTitle);

            const grid = document.createElement('div');
            grid.className = 'ake-overview__grid';
            group.items.forEach((item) => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'ake-overview__card';
                if (Number(item.rarity) >= 1 && Number(item.rarity) <= 6) {
                    card.classList.add(`ake-overview__card--rarity-${item.rarity}`);
                }
                if (item.outline) card.classList.add(`ake-overview__card--${item.outline}`);
                card.addEventListener('click', () => {
                    options.onSelect(item);
                    const selector = options.sidebarSelector?.(item);
                    if (!selector) return;
                    requestAnimationFrame(() => {
                        document.querySelector(selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    });
                });

                const visual = document.createElement('div');
                visual.className = 'ake-overview__visual';
                if (item.image) {
                    const image = document.createElement('img');
                    image.src = item.image;
                    image.alt = '';
                    image.loading = 'lazy';
                    image.onerror = function () { this.remove(); visual.classList.add('is-empty'); };
                    visual.appendChild(image);
                } else {
                    visual.classList.add('is-empty');
                    visual.textContent = text(item.fallback, 'DATA');
                }

                const body = document.createElement('div');
                body.className = 'ake-overview__body';
                const cardTitle = document.createElement('h3');
                cardTitle.textContent = item.name;
                const id = document.createElement('div');
                id.className = 'ake-overview__id';
                id.textContent = item.id;
                const tags = document.createElement('div');
                tags.className = 'ake-overview__tags';
                (item.tags || []).filter(Boolean).forEach((tag) => {
                    const chip = document.createElement('span');
                    chip.textContent = tag;
                    tags.appendChild(chip);
                });
                body.append(cardTitle, id, tags);
                card.append(visual, body);
                grid.appendChild(card);
            });
            section.appendChild(grid);
            root.appendChild(section);
        });
        container.appendChild(root);
    }

    function isActive(module) {
        return document.querySelector('#contentArea script[data-ake-v3-module]')?.dataset.akeV3Module === module;
    }

    function showRoot(module) {
        const detailIds = {
            v3_cc: 'v2ccDetail', research: 'researchDetail', v3_character: 'v2characterDetail',
            v3_weapon: 'v2wpnDetail', v3_enemy: 'v2enemyDetail', v3_equip: 'v2equipDetail',
            v3_activity: 'activityDetail', v3_item: 'v2itemDetail', v3_dungeon: 'v2dungeonDetail',
            v3_achievement: 'achievementDetail'
        };
        const entry = roots.get(detailIds[module]);
        if (entry?.container.isConnected) {
            entry.options.onReset?.();
            render(entry.container, entry.options);
            return true;
        }
        return false;
    }

    function installHomeButton() {
        const match = Object.entries(searchSelectors).find(([, selector]) => document.querySelector(selector));
        const module = match?.[0];
        const container = match ? document.querySelector(match[1]) : null;
        if (!container || container.querySelector('.ake-module-home')) return;
        container.classList.add('ake-module-search-row');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ake-module-home';
        button.title = window.akeData?.t('nav.home', null, '返回起始页') || '返回起始页';
        button.setAttribute('aria-label', button.title);
        button.innerHTML = '<span aria-hidden="true">⌂</span>';
        button.addEventListener('click', () => {
            window.__akeRouter?.updateUrl(module);
            if (showRoot(module)) return;
            const url = new URL(window.location.href);
            url.search = '';
            url.searchParams.set('plugin', module);
            window.location.assign(url.href);
        });
        container.prepend(button);
    }

    window.AKEModuleOverview = { render, isActive, showRoot };
    installHomeButton();
})();
