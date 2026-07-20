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

    function markVersionChange(element, item) {
        if (!element || !item?.changeType) return;
        const label = item.changeType === 'added'
            ? (window.akeData?.t('versionDiff.added', null, '新增') || '新增')
            : (window.akeData?.t('versionDiff.modified', null, '修改') || '修改');
        element.dataset.akeChange = item.changeType;
        element.dataset.akeChangeLabel = label;
    }

    function visibleTextTokens(root, maxTokens = 1200) {
        const tokens = [];
        let truncated = false;
        const visit = node => {
            if (tokens.length >= maxTokens) { truncated = true; return; }
            if (node.nodeType === Node.TEXT_NODE) {
                const value = String(node.textContent || '').replace(/\s+/g, ' ').trim();
                if (value) tokens.push(value);
                return;
            }
            if (!(node instanceof Element) || node.matches('.ake-version-diff, script, style, template')) return;
            const style = getComputedStyle(node);
            if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return;
            Array.from(node.childNodes).forEach(visit);
        };
        visit(root);
        return { tokens, truncated };
    }

    function diffVisibleTokens(current, baseline, limit = 500) {
        const currentValues = current.tokens;
        const baselineValues = baseline.tokens;
        const columns = currentValues.length + 1;
        const matrix = new Uint16Array((baselineValues.length + 1) * columns);
        for (let oldIndex = baselineValues.length - 1; oldIndex >= 0; oldIndex -= 1) {
            for (let newIndex = currentValues.length - 1; newIndex >= 0; newIndex -= 1) {
                const offset = oldIndex * columns + newIndex;
                matrix[offset] = baselineValues[oldIndex] === currentValues[newIndex]
                    ? matrix[(oldIndex + 1) * columns + newIndex + 1] + 1
                    : Math.max(matrix[(oldIndex + 1) * columns + newIndex], matrix[offset + 1]);
            }
        }
        const changes = [];
        let oldIndex = 0;
        let newIndex = 0;
        while (oldIndex < baselineValues.length || newIndex < currentValues.length) {
            if (changes.length >= limit) break;
            if (oldIndex < baselineValues.length && newIndex < currentValues.length && baselineValues[oldIndex] === currentValues[newIndex]) {
                oldIndex += 1;
                newIndex += 1;
            } else if (oldIndex < baselineValues.length &&
                (newIndex >= currentValues.length || matrix[(oldIndex + 1) * columns + newIndex] >= matrix[oldIndex * columns + newIndex + 1])) {
                changes.push({ kind: 'removed', value: baselineValues[oldIndex] });
                oldIndex += 1;
            } else {
                changes.push({ kind: 'added', value: currentValues[newIndex] });
                newIndex += 1;
            }
        }
        return {
            changes,
            truncated: current.truncated || baseline.truncated || oldIndex < baselineValues.length || newIndex < currentValues.length
        };
    }

    function renderVersionDiff(container, data, baselineHtml) {
        container?.querySelector?.('.ake-version-diff')?.remove();
        const diff = data?.__versionDiff;
        if (!container || !diff?.baseline || !baselineHtml) return;
        const baselineRoot = document.createElement('div');
        baselineRoot.className = container.className;
        baselineRoot.style.cssText = 'position:fixed;left:-100000px;top:0;width:1000px;visibility:visible;pointer-events:none;';
        baselineRoot.innerHTML = baselineHtml;
        document.body.appendChild(baselineRoot);
        const currentTokens = visibleTextTokens(container);
        const baselineTokens = visibleTextTokens(baselineRoot);
        baselineRoot.remove();
        const result = diffVisibleTokens(currentTokens, baselineTokens);
        if (!result.changes.length) return;
        const baseVersion = String(diff.baseVersion || '').split('@')[0];
        const details = document.createElement('details');
        details.className = 'ake-version-diff';
        details.open = true;

        const summary = document.createElement('summary');
        const title = document.createElement('strong');
        title.textContent = window.akeData?.t('versionDiff.detailTitle', { version: baseVersion }, `字段差异 · 相比 ${baseVersion}`) || `字段差异 · 相比 ${baseVersion}`;
        const count = document.createElement('span');
        count.textContent = window.akeData?.t('versionDiff.changeCount', { count: result.changes.length }, `${result.changes.length} 处变更`) || `${result.changes.length} 处变更`;
        summary.append(title, count);
        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'ake-version-diff__body';
        result.changes.forEach(change => {
            const line = document.createElement('div');
            line.className = `ake-version-diff__line ake-version-diff__line--${change.kind}`;
            const marker = document.createElement('b');
            marker.textContent = change.kind === 'removed' ? '−' : '+';
            const value = document.createElement('span');
            value.textContent = change.value;
            line.append(marker, value);
            body.appendChild(line);
        });
        if (result.truncated) {
            const note = document.createElement('p');
            note.className = 'ake-version-diff__truncated';
            note.textContent = window.akeData?.t('versionDiff.truncated', null, '差异过多，仅显示前 500 项。') || '差异过多，仅显示前 500 项。';
            body.appendChild(note);
        }
        details.appendChild(body);
        container.prepend(details);
    }

    function render(container, options) {
        if (!container) return;
        roots.set(container.id, { container, options });
        const items = options.items || [];
        const groups = new Map();
        items.forEach((item) => {
            const baseVersion = String(item.changeBaseVersion || '').split('@')[0];
            const group = item.changeType
                ? { id: '__version_diff__', name: window.akeData?.t('versionDiff.group', { version: baseVersion }, `版本差异 · 相比 ${baseVersion}`) || `版本差异 · 相比 ${baseVersion}`, order: -10000 }
                : (options.group(item) || { id: 'all', name: window.akeData?.t('common.all', null, '全部') || '全部' });
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
                if (item.changeType) {
                    card.classList.add(`ake-overview__card--${item.changeType}`);
                    if (item.changeType === 'modified') card.classList.add('ake-overview__card--changed');
                }
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
                if (item.changeType) {
                    const changeTag = document.createElement('span');
                    changeTag.className = `ake-overview__change-tag ake-overview__change-tag--${item.changeType}`;
                    changeTag.textContent = item.changeType === 'added'
                        ? (window.akeData?.t('versionDiff.added', null, '新增') || '新增')
                        : (window.akeData?.t('versionDiff.modified', null, '修改') || '修改');
                    tags.appendChild(changeTag);
                }
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
        options.afterRender?.(root);
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

    window.AKEModuleOverview = { render, isActive, showRoot, markVersionChange, renderVersionDiff };
    installHomeButton();
})();
