(function () {
    'use strict';

    const MODULE_ID = 'v3_archive';
    const root = document.getElementById('akeArchiveModule');
    if (!root || !window.AKEV3) return;

    window.__akeArchiveController?.destroy?.();

    const archiveT = window.akeI18n?.scope?.('modules.archive')
        || ((key, params, fallback) => fallback ?? key);
    const t = (key, params, fallback) => archiveT(key, params, fallback);
    const elements = {
        sidebar: document.getElementById('akeArchiveSidebar'),
        meta: document.getElementById('akeArchiveMeta'),
        home: document.getElementById('akeArchiveHome'),
        search: document.getElementById('akeArchiveSearch'),
        directory: document.getElementById('akeArchiveDirectory'),
        content: document.getElementById('akeArchiveContent'),
        mobileButton: document.getElementById('akeArchiveMobileButton'),
        mobileOverlay: document.getElementById('akeArchiveMobileOverlay'),
        mobilePanel: document.getElementById('akeArchiveMobilePanel'),
        mobileClose: document.getElementById('akeArchiveMobileClose'),
        mobileSearch: document.getElementById('akeArchiveMobileSearch'),
        mobileDirectory: document.getElementById('akeArchiveMobileDirectory')
    };
    if (!elements.directory || !elements.content) return;

    const pendingDeepId = String(window.__deepLinkId || '');
    window.__deepLinkId = null;
    root.dataset.moduleId = MODULE_ID;
    root.dataset.moduleTitle = t('title', null, '档案库');

    const SPRITE_ROOT = '/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/';
    const PAGE_ORDER = Object.freeze(['document', 'multi_media', 'text']);
    const CATEGORY_PAGE = Object.freeze({
        document: 'document',
        report: 'document',
        media: 'multi_media',
        paper: 'text',
        digital: 'text',
        collection: 'text'
    });
    const TABLE_NAMES = Object.freeze([
        'PrtsPage',
        'PrtsCategory',
        'PrtsFirstLv',
        'PrtsAllItem',
        'RichContentTable',
        'RadioTable',
        'ReadingPopUpTable',
        'ReadingPopUpIconTable'
    ]);

    const state = {
        tables: null,
        comparisonVersion: '',
        addedGroupIds: new Set(),
        addedItemIds: new Set(),
        pages: [],
        categories: [],
        groups: [],
        groupMap: new Map(),
        itemMap: new Map(),
        itemsByGroup: new Map(),
        popupByContent: new Map(),
        groupSearch: new Map(),
        itemSearch: new Map(),
        query: '',
        activePageType: '',
        activeGroupId: '',
        activeItemId: '',
        gender: 'f',
        mobileReturnFocus: null,
        loadToken: 0,
        disposed: false
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        })[character]);
    }

    function gameText(ref, fallback) {
        return window.AKEV3.text(ref, fallback || '');
    }

    function gameHtml(value) {
        const source = String(value || '');
        return window.parseText
            ? window.parseText(source)
            : escapeHtml(source).replace(/\r?\n/g, '<br>');
    }

    function gamePlainText(value) {
        return String(value || '')
            .replace(/<image(?:\s[^>]*)?>[\s\S]*?<\/image>/gi, '')
            .replace(/<image[^>]*>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function interpolate(template, params) {
        return String(template || '').replace(/\{(\w+)\}/g, (match, key) => params?.[key] ?? match);
    }

    function tr(key, params, fallback) {
        const translated = t(key, params, fallback);
        return interpolate(translated, params);
    }

    function assetUrl(folder, name) {
        if (!name) return '';
        const file = /\.[a-z0-9]+$/i.test(String(name)) ? String(name) : `${name}.png`;
        const path = encodeURI(`${SPRITE_ROOT}${folder}/${file}`);
        return window.akeDataSource?.resolveImageUrl?.(path) || path;
    }

    function pageIcon(page) {
        return assetUrl('prts', page?.icon);
    }

    function groupIcon(group) {
        const icon = String(group?.icon || '');
        return icon ? assetUrl('prts/icon', icon) : '/icon_default_missing.png';
    }

    function imageTag(source, className, alt, extraAttributes, fallbackMode) {
        if (!source) return '';
        const fallbackAttribute = fallbackMode === 'global' ? '' : ' data-ake-image-fallback="defer"';
        return `<img class="${escapeHtml(className || '')}" src="${escapeHtml(source)}" alt="${escapeHtml(alt || '')}"${fallbackAttribute}${extraAttributes || ''}>`;
    }

    function groupIconTag(group, alt, className) {
        return imageTag(groupIcon(group), className === undefined ? 'ake-ui-directory__item-icon' : className, alt || '', alt ? '' : ' aria-hidden="true"', 'global');
    }

    function safeOrder(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER;
    }

    function compareRows(a, b, idField) {
        return safeOrder(a?.order) - safeOrder(b?.order)
            || gameText(a?.name, '').localeCompare(gameText(b?.name, ''), undefined, { numeric: true })
            || String(a?.[idField] || '').localeCompare(String(b?.[idField] || ''), 'en');
    }

    function tableEntityIds(table, idField) {
        return new Set(Object.entries(table || {}).map(([key, row]) => String(row?.[idField] || key)).filter(Boolean));
    }

    function prepareVersionChanges(raw, baselineRaw, comparison) {
        state.comparisonVersion = '';
        state.addedGroupIds.clear();
        state.addedItemIds.clear();
        if (!comparison?.baseline || !baselineRaw) return;
        const baselineVersion = String(comparison.baseline.id || comparison.baseline.gameVersion || '');
        if (!baselineVersion) {
            console.warn('Archive version comparison was skipped because the baseline version is missing');
            return;
        }
        const baselineGroups = baselineRaw.PrtsFirstLv || {};
        const baselineItems = baselineRaw.PrtsAllItem || {};
        if (!Object.keys(baselineGroups).length || !Object.keys(baselineItems).length) {
            console.warn('Archive version comparison was skipped because the baseline tables are empty');
            return;
        }
        const baselineGroupIds = tableEntityIds(baselineGroups, 'firstLvId');
        const baselineItemIds = tableEntityIds(baselineItems, 'id');
        tableEntityIds(raw.PrtsFirstLv, 'firstLvId').forEach(id => {
            if (!baselineGroupIds.has(id)) state.addedGroupIds.add(id);
        });
        tableEntityIds(raw.PrtsAllItem, 'id').forEach(id => {
            if (!baselineItemIds.has(id)) state.addedItemIds.add(id);
        });
        state.comparisonVersion = baselineVersion;
    }

    function normalizeSearch(value) {
        return String(value || '')
            .normalize('NFKC')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase();
    }

    function pageTypeForCategory(categoryId) {
        if (CATEGORY_PAGE[categoryId]) return CATEGORY_PAGE[categoryId];
        const group = state.groups.find(row => row.categoryId === categoryId);
        return state.itemsByGroup.get(group?.firstLvId)?.[0]?.type || 'text';
    }

    function pageForCategory(categoryId) {
        const type = pageTypeForCategory(categoryId);
        return state.pages.find(page => page.pageType === type) || null;
    }

    function categoryForGroup(group) {
        return state.categories.find(category => category.categoryId === group?.categoryId) || null;
    }

    function itemRowsForGroup(groupId) {
        return state.itemsByGroup.get(String(groupId || '')) || [];
    }

    function groupVersionInfo(groupId) {
        const normalizedId = String(groupId || '');
        const addedItemCount = itemRowsForGroup(normalizedId)
            .filter(item => state.addedItemIds.has(String(item.id || ''))).length;
        const isNewGroup = state.addedGroupIds.has(normalizedId);
        return { isNewGroup, addedItemCount, hasAddition: isNewGroup || addedItemCount > 0 };
    }

    function groupChangeRank(groupId) {
        const info = groupVersionInfo(groupId);
        return !info.hasAddition ? 2 : info.isNewGroup ? 0 : 1;
    }

    function addedTag(label, compact) {
        return `<span class="ake-ui-badge" data-tone="added"${compact ? ' data-density="compact"' : ''}>${escapeHtml(label)}</span>`;
    }

    function groupChangeTag(info, compact) {
        if (!info?.hasAddition) return '';
        const label = compact || info.isNewGroup
            ? t('changes.added', null, '新增')
            : tr('changes.addedEntries', { count: info.addedItemCount }, `新增 ${info.addedItemCount} 条记录`);
        return addedTag(label, compact);
    }

    function itemChangeTag(item) {
        return state.addedItemIds.has(String(item?.id || ''))
            ? addedTag(t('changes.added', null, '新增'), true)
            : '';
    }

    function comparisonLabel() {
        return String(state.comparisonVersion || '').split('@')[0];
    }

    function popupForItem(item) {
        return state.popupByContent.get(String(item?.contentId || '')) || null;
    }

    function popupLogo(popup) {
        if (!popup || !popup.iconType) return '';
        const iconGroup = state.tables.popupIcons?.[String(popup.iconType)]?.iconMap || {};
        const mediumByBgType = { 0: '0', 1: '1', 2: '1' };
        const medium = mediumByBgType[Number(popup.bgType)];
        if (medium === undefined) return '';
        const icon = iconGroup[medium]?.icon || '';
        return assetUrl('readingpoplogo', icon);
    }

    function buildIndexes() {
        state.groupMap.clear();
        state.itemMap.clear();
        state.itemsByGroup.clear();
        state.popupByContent.clear();
        state.groupSearch.clear();
        state.itemSearch.clear();

        state.groups.forEach(group => {
            state.groupMap.set(String(group.firstLvId), group);
            state.itemsByGroup.set(String(group.firstLvId), []);
        });
        Object.values(state.tables.items || {}).forEach(item => {
            const itemId = String(item.id || '');
            if (!itemId) return;
            state.itemMap.set(itemId, item);
            const groupId = String(item.firstLvId || '');
            if (!state.itemsByGroup.has(groupId)) state.itemsByGroup.set(groupId, []);
            state.itemsByGroup.get(groupId).push(item);
        });
        state.itemsByGroup.forEach(items => items.sort((a, b) => {
            const addedRank = Number(!state.addedItemIds.has(String(a.id || '')))
                - Number(!state.addedItemIds.has(String(b.id || '')));
            return addedRank || compareRows(a, b, 'id');
        }));
        Object.values(state.tables.popups || {}).forEach(popup => {
            const contentId = String(popup.contentId || '');
            if (contentId && !state.popupByContent.has(contentId)) state.popupByContent.set(contentId, popup);
        });

        state.groups.forEach(group => {
            const category = categoryForGroup(group);
            const page = pageForCategory(group.categoryId);
            const ownParts = [
                group.firstLvId,
                group.icon,
                gameText(group.name),
                gameText(group.subName),
                category?.categoryId,
                gameText(category?.name),
                page?.pageType,
                gameText(page?.name)
            ];
            state.groupSearch.set(String(group.firstLvId), normalizeSearch(ownParts.join(' ')));
            itemRowsForGroup(group.firstLvId).forEach(item => {
                const rich = state.tables.richContent?.[item.contentId] || null;
                const radio = state.tables.radio?.[item.contentId] || null;
                const popup = popupForItem(item);
                const parts = [
                    item.id,
                    item.contentId,
                    item.type,
                    gameText(item.name),
                    gameText(item.desc),
                    gameText(rich?.title),
                    gameText(popup?.title)
                ];
                (rich?.contentList || []).forEach(entry => parts.push(gameText(entry?.content)));
                (radio?.radioSingleDataList || []).forEach(line => {
                    parts.push(line.actorNameId, gameText(line.actorName), gameText(line.infoActorName), gameText(line.radioText));
                });
                state.itemSearch.set(String(item.id), normalizeSearch(parts.join(' ')));
            });
        });
    }

    function prepareTables(raw) {
        state.tables = {
            pages: raw.PrtsPage || {},
            categories: raw.PrtsCategory || {},
            groups: raw.PrtsFirstLv || {},
            items: raw.PrtsAllItem || {},
            richContent: raw.RichContentTable || {},
            radio: raw.RadioTable || {},
            popups: raw.ReadingPopUpTable || {},
            popupIcons: raw.ReadingPopUpIconTable || {}
        };
        const pageValues = Object.values(state.tables.pages);
        state.pages = PAGE_ORDER.map(type => pageValues.find(page => page.pageType === type)).filter(Boolean);
        pageValues.forEach(page => {
            if (!state.pages.includes(page)) state.pages.push(page);
        });
        state.categories = Object.values(state.tables.categories).sort((a, b) => {
            return PAGE_ORDER.indexOf(pageTypeForCategory(a.categoryId)) - PAGE_ORDER.indexOf(pageTypeForCategory(b.categoryId))
                || compareRows(a, b, 'categoryId');
        });
        state.groups = Object.values(state.tables.groups).sort((a, b) => {
            const aPage = PAGE_ORDER.indexOf(CATEGORY_PAGE[a.categoryId] || 'text');
            const bPage = PAGE_ORDER.indexOf(CATEGORY_PAGE[b.categoryId] || 'text');
            const aCategory = state.tables.categories[a.categoryId];
            const bCategory = state.tables.categories[b.categoryId];
            return aPage - bPage
                || safeOrder(aCategory?.order) - safeOrder(bCategory?.order)
                || String(a.categoryId || '').localeCompare(String(b.categoryId || ''), 'en')
                || compareRows(a, b, 'firstLvId');
        });
        buildIndexes();
    }

    function filteredGroups(options) {
        const pageType = options?.pageType || '';
        const result = [];
        state.groups.forEach(group => {
            if (pageType && pageTypeForCategory(group.categoryId) !== pageType) return;
            const allItems = itemRowsForGroup(group.firstLvId);
            if (!state.query) {
                result.push({ group, items: allItems, ownMatch: true });
                return;
            }
            const ownMatch = state.groupSearch.get(String(group.firstLvId))?.includes(state.query);
            const items = ownMatch
                ? allItems
                : allItems.filter(item => state.itemSearch.get(String(item.id))?.includes(state.query));
            if (ownMatch || items.length) result.push({ group, items, ownMatch: Boolean(ownMatch) });
        });
        return result;
    }

    function groupEntryCount(records) {
        return records.reduce((sum, record) => sum + record.items.length, 0);
    }

    function directoryRichText(html) {
        const node = document.createElement('span');
        node.innerHTML = html;
        return node;
    }

    function createArchiveHomeItem() {
        return window.AKEUI.directoryItem({
            layout: 'entity',
            title: t('directory.all', null, '全部档案'),
            subtitle: t('overview.subtitle', null, '浏览全部档案与收录内容'),
            icon: { src: pageIcon(state.pages[0]), alt: '' },
            count: state.itemMap.size,
            active: !state.activeGroupId,
            attributes: { 'data-akearchive-action': 'show-overview' }
        });
    }

    function createArchiveGroupItem(record, page) {
        const group = record.group;
        const secondary = gameText(group.subName) || gameText(page?.name, page?.pageType || '');
        const changeInfo = groupVersionInfo(group.firstLvId);
        return window.AKEUI.directoryItem({
            layout: 'entity',
            title: directoryRichText(gameHtml(gameText(group.name, group.firstLvId))),
            subtitle: directoryRichText(gameHtml(secondary)),
            icon: { src: groupIcon(group), alt: '' },
            count: record.items.length,
            change: changeInfo.hasAddition
                ? { type: 'added', label: t('changes.added', null, '新增') }
                : null,
            active: group.firstLvId === state.activeGroupId,
            attributes: {
                'data-akearchive-action': 'open-group',
                'data-group-id': group.firstLvId
            }
        });
    }

    function createArchiveDirectorySection(heading, count) {
        const section = document.createElement('section');
        section.className = 'akearchive-directory-section';
        if (heading) {
            const title = document.createElement('div');
            title.className = 'akearchive-directory-heading';
            title.append(directoryRichText(heading), window.AKEUI.element('span', '', count));
            section.appendChild(title);
        }
        const list = document.createElement('div');
        list.className = 'akearchive-directory-list';
        section.appendChild(list);
        return { section, list };
    }

    function renderDirectoryNode(node, records, includeHome) {
        if (!node) return;
        const grouped = new Map();
        records.forEach(record => {
            const categoryId = record.group.categoryId || 'unknown';
            if (!grouped.has(categoryId)) grouped.set(categoryId, []);
            grouped.get(categoryId).push(record);
        });
        const fragment = document.createDocumentFragment();
        if (includeHome) {
            const home = createArchiveDirectorySection('', 0);
            home.list.appendChild(createArchiveHomeItem());
            fragment.appendChild(home.section);
        }
        state.categories.forEach(category => {
            const rows = [...(grouped.get(category.categoryId) || [])].sort((a, b) =>
                groupChangeRank(a.group.firstLvId) - groupChangeRank(b.group.firstLvId));
            if (!rows.length) return;
            const page = pageForCategory(category.categoryId);
            const entryCount = groupEntryCount(rows);
            const result = createArchiveDirectorySection(
                gameHtml(gameText(category.name, category.categoryId)),
                entryCount
            );
            result.list.append(...rows.map(record => createArchiveGroupItem(record, page)));
            fragment.appendChild(result.section);
        });
        if (!records.length) {
            const empty = window.AKEUI.element('div', 'ake-ui-state');
            empty.dataset.state = 'empty';
            empty.appendChild(window.AKEUI.element('p', '', t('empty.search', null, '没有匹配的档案')));
            fragment.appendChild(empty);
        }
        node.replaceChildren(fragment);
    }

    function renderDirectories() {
        const records = filteredGroups();
        renderDirectoryNode(elements.directory, records, false);
        renderDirectoryNode(elements.mobileDirectory, records, true);
        if (!elements.meta) return;
        if (state.query) {
            elements.meta.textContent = tr('counts.results', { count: records.length }, `找到 ${records.length} 项`);
        } else {
            elements.meta.textContent = `${tr('counts.groups', { count: state.groups.length }, `${state.groups.length} 组档案`)} · ${tr('counts.entries', { count: state.itemMap.size }, `${state.itemMap.size} 条记录`)}`;
        }
    }

    function renderPageTabs(records) {
        return `<div class="ake-ui-tabs" data-variant="media" role="group" aria-label="${escapeHtml(t('overview.title', null, '档案一览'))}">${state.pages.map(page => {
            const type = String(page.pageType || '');
            const count = groupEntryCount(records.filter(record => pageTypeForCategory(record.group.categoryId) === type));
            const active = state.activePageType === type;
            return `<button type="button" class="ake-ui-tabs__button${active ? ' is-active' : ''}" aria-pressed="${active}"
                data-akearchive-action="filter-page" data-page-type="${escapeHtml(type)}">
                ${imageTag(pageIcon(page), '', '', ' aria-hidden="true"')}
                <span><strong>${gameHtml(gameText(page.name, type))}</strong><small>${escapeHtml(tr('counts.entries', { count }, `${count} 条记录`))}</small></span>
            </button>`;
        }).join('')}</div>`;
    }

    function renderOverviewCard(record) {
        const group = record.group;
        const category = categoryForGroup(group);
        const subtitle = gameText(group.subName) || gameText(record.items[0]?.desc) || group.firstLvId;
        const icon = groupIconTag(group, '', '');
        const changeInfo = groupVersionInfo(group.firstLvId);
        return `<button type="button" class="ake-ui-card is-interactive has-media" data-ake-component="card" data-density="compact" data-card-kind="archive" data-category="${escapeHtml(group.categoryId)}"
            data-akearchive-action="open-group" data-group-id="${escapeHtml(group.firstLvId)}">
            <span class="ake-ui-card__media">${icon}</span>
            <span class="ake-ui-card__content">
                <strong class="ake-ui-card__title">${gameHtml(gameText(group.name, group.firstLvId))}</strong>
                <small class="ake-ui-card__subtitle">${gameHtml(subtitle)}</small>
                <span class="ake-ui-card__meta">${groupChangeTag(changeInfo)}<span class="ake-ui-badge">${gameHtml(gameText(category?.name, group.categoryId))}</span><span class="ake-ui-badge">${escapeHtml(tr('counts.entries', { count: record.items.length }, `${record.items.length} 条记录`))}</span></span>
            </span>
        </button>`;
    }

    function renderOverview() {
        const allRecords = filteredGroups();
        const records = state.activePageType
            ? allRecords.filter(record => pageTypeForCategory(record.group.categoryId) === state.activePageType)
            : allRecords;
        const addedRecords = records.filter(record => groupVersionInfo(record.group.firstLvId).hasAddition)
            .sort((a, b) => groupChangeRank(a.group.firstLvId) - groupChangeRank(b.group.firstLvId));
        const regularRecords = records.filter(record => !groupVersionInfo(record.group.firstLvId).hasAddition);
        const changeSection = state.comparisonVersion && addedRecords.length
            ? `<section class="ake-ui-section" data-tone="added">
                <header class="ake-ui-section__header"><h2 class="ake-ui-section__title">${escapeHtml(tr('changes.group', { version: comparisonLabel() }, `版本差异 · 相比 ${comparisonLabel()}`))}</h2><span class="ake-ui-section__meta">${escapeHtml(tr('counts.groups', { count: addedRecords.length }, `${addedRecords.length} 组档案`))}</span></header>
                <div class="ake-ui-card-grid" data-size="regular">${addedRecords.map(renderOverviewCard).join('')}</div>
            </section>`
            : '';
        const sections = state.categories.map(category => {
            const rows = regularRecords.filter(record => record.group.categoryId === category.categoryId);
            if (!rows.length) return '';
            const entryCount = groupEntryCount(rows);
            return `<section class="ake-ui-section">
                <header class="ake-ui-section__header"><h2 class="ake-ui-section__title">${gameHtml(gameText(category.name, category.categoryId))}</h2><span class="ake-ui-section__meta">${escapeHtml(tr('counts.entries', { count: entryCount }, `${entryCount} 条记录`))}</span></header>
                <div class="ake-ui-card-grid" data-size="regular">${rows.map(renderOverviewCard).join('')}</div>
            </section>`;
        }).join('');
        const visibleCount = groupEntryCount(records);
        const noResults = `<div class="ake-ui-state" data-state="empty"><div><h2>${escapeHtml(t('empty.archives', null, '暂无档案'))}</h2><p>${escapeHtml(state.query ? t('empty.search', null, '没有匹配的档案') : t('empty.archives', null, '暂无档案'))}</p></div></div>`;
        elements.content.innerHTML = `<section class="ake-ui-page">
            <header class="ake-ui-page__header">
                <div><h1 class="ake-ui-page__title">${escapeHtml(t('overview.title', null, '档案一览'))}</h1><p class="ake-ui-page__summary">${escapeHtml(t('overview.subtitle', null, '浏览全部档案与收录内容'))}</p></div>
                <div class="ake-ui-page__status">
                    <strong>${escapeHtml(tr('counts.groups', { count: records.length }, `${records.length} 组档案`))}</strong>
                    <span>${escapeHtml(tr('counts.entries', { count: visibleCount }, `${visibleCount} 条记录`))}</span>
                </div>
            </header>
            ${renderPageTabs(allRecords)}
            ${changeSection}${sections || (changeSection ? '' : noResults)}
        </section>`;
    }

    function readingImageUrl(rawSource) {
        let source = String(rawSource || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
        let gendered = false;
        if (/^fm\/\//i.test(source)) {
            gendered = true;
            source = source.replace(/^fm\/\//i, '');
        }
        source = source.replace(/^reading\//i, '');
        if (gendered) {
            const extensionMatch = source.match(/(\.[a-z0-9]+)$/i);
            source = extensionMatch
                ? `${source.slice(0, -extensionMatch[1].length)}_${state.gender}${extensionMatch[1]}`
                : `${source}_${state.gender}.png`;
        } else if (!/\.[a-z0-9]+$/i.test(source)) {
            source += '.png';
        }
        const path = encodeURI(`${SPRITE_ROOT}reading/${source}`);
        return window.akeDataSource?.resolveImageUrl?.(path) || path;
    }

    function renderRichValue(value) {
        const source = String(value || '');
        if (!source) return '';
        const imagePattern = /<image(?:\s[^>]*)?>([\s\S]*?)<\/image>/gi;
        const parts = [];
        let cursor = 0;
        let match;
        while ((match = imagePattern.exec(source))) {
            const textBefore = source.slice(cursor, match.index);
            if (textBefore.trim()) parts.push(`<p class="akearchive-paragraph">${gameHtml(textBefore)}</p>`);
            const imageSource = readingImageUrl(match[1]);
            parts.push(`<div class="akearchive-image-row">${imageTag(
                imageSource,
                'akearchive-content-image',
                t('contentImage.alt', null, '档案正文图片'),
                ' data-archive-content-image="true"'
            )}</div>`);
            cursor = imagePattern.lastIndex;
        }
        const textAfter = source.slice(cursor);
        if (textAfter.trim()) parts.push(`<p class="akearchive-paragraph">${gameHtml(textAfter)}</p>`);
        if (!parts.length && source.trim()) parts.push(`<p class="akearchive-paragraph">${gameHtml(source)}</p>`);
        return parts.join('');
    }

    function richContentHasGenderImage(rich) {
        return (rich?.contentList || []).some(entry => /<image(?:\s[^>]*)?>\s*fm\/\//i.test(gameText(entry?.content)));
    }

    function renderGenderControl() {
        return `<div class="akearchive-gender-control">
            <span>${escapeHtml(t('protagonistGender.label', null, '主角性别'))}</span>
            <span class="ake-ui-segmented" role="group" aria-label="${escapeHtml(t('protagonistGender.label', null, '主角性别'))}">
                <button type="button" class="ake-ui-segmented__button${state.gender === 'f' ? ' is-active' : ''}" data-akearchive-action="set-gender" data-gender="f" aria-pressed="${state.gender === 'f'}">${escapeHtml(t('protagonistGender.female', null, '女'))}</button>
                <button type="button" class="ake-ui-segmented__button${state.gender === 'm' ? ' is-active' : ''}" data-akearchive-action="set-gender" data-gender="m" aria-pressed="${state.gender === 'm'}">${escapeHtml(t('protagonistGender.male', null, '男'))}</button>
            </span>
        </div>`;
    }

    function renderDocument(item, popup) {
        const rich = state.tables.richContent?.[item.contentId] || null;
        const title = gameText(rich?.title) || gameText(popup?.title) || gameText(item.name, item.id);
        const logo = popupLogo(popup);
        const body = (rich?.contentList || []).map(entry => renderRichValue(gameText(entry?.content))).join('');
        return `${richContentHasGenderImage(rich) ? renderGenderControl() : ''}
            <article class="akearchive-document">
                <header class="ake-ui-section__header">
                    <div>${logo ? imageTag(logo, 'akearchive-popup-logo', '', ' aria-hidden="true"') : ''}<h2 class="ake-ui-section__title">${gameHtml(title)}</h2><p class="ake-ui-section__meta">${gameHtml(gameText(item.name, item.id))}</p></div>
                </header>
                ${body || `<p class="akearchive-paragraph">${escapeHtml(t('empty.content', null, '该档案暂无正文内容'))}</p>`}
            </article>`;
    }

    function renderTranscript(item, popup) {
        const radio = state.tables.radio?.[item.contentId] || null;
        const lines = [...(radio?.radioSingleDataList || [])].sort((a, b) => safeOrder(a.index) - safeOrder(b.index));
        const logo = popupLogo(popup);
        const lineHtml = lines.map(line => {
            const speaker = gameText(line.actorName) || gameText(line.infoActorName) || line.actorNameId || '';
            return `<div class="akearchive-line${speaker ? '' : ' akearchive-line--anonymous'}">
                ${speaker ? `<div class="akearchive-line-speaker">${gameHtml(speaker)}</div>` : ''}
                <div class="akearchive-line-text">${gameHtml(gameText(line.radioText))}</div>
            </div>`;
        }).join('');
        return `<section class="akearchive-transcript ake-ui-section">
            <header class="ake-ui-section__header">
                <div>${logo ? imageTag(logo, 'akearchive-popup-logo', '', ' aria-hidden="true"') : ''}<h2 class="ake-ui-section__title">${gameHtml(gameText(popup?.title) || gameText(item.name, item.id))}</h2></div>
                <span class="ake-ui-section__meta">${escapeHtml(tr('counts.entries', { count: lines.length }, `${lines.length} 条记录`))}</span>
            </header>
            <div class="akearchive-transcript-list">${lineHtml || `<div class="ake-ui-state" data-state="empty"><div><p>${escapeHtml(t('empty.transcript', null, '该档案暂无字幕'))}</p></div></div>`}</div>
        </section>`;
    }

    function renderEntryTabs(group, activeItem) {
        const items = itemRowsForGroup(group.firstLvId);
        if (items.length < 2) return '';
        return `<div class="ake-ui-tabs" data-variant="underline" role="group" aria-label="${escapeHtml(t('details.entry', null, '条目'))}">${items.map((item, index) => {
            const active = item.id === activeItem.id;
            return `<button type="button" class="ake-ui-tabs__button${active ? ' is-active' : ''}" aria-pressed="${active}"
                data-akearchive-action="select-entry" data-entry-id="${escapeHtml(item.id)}">${gameHtml(gameText(item.name, `${t('details.entry', null, '条目')} ${index + 1}`))}${itemChangeTag(item)}</button>`;
        }).join('')}</div>`;
    }

    function renderDetail(item) {
        const group = state.groupMap.get(String(item.firstLvId));
        if (!group) return;
        const category = categoryForGroup(group);
        const page = pageForCategory(group.categoryId);
        const popup = popupForItem(item);
        const groupName = gameText(group.name, group.firstLvId);
        const description = gameText(group.subName) || gameText(item.desc) || gameText(item.name, item.id);
        const icon = groupIconTag(group, gamePlainText(groupName), '');
        const detailIsAdded = state.addedGroupIds.has(String(group.firstLvId))
            || state.addedItemIds.has(String(item.id));
        elements.content.innerHTML = `<article class="ake-ui-detail" data-detail-kind="archive">
            <header class="ake-ui-detail-header">
                <div class="ake-ui-detail-media">${icon}</div>
                <div class="ake-ui-detail-copy">
                    <div class="ake-ui-detail-meta">
                        <span>${gameHtml(gameText(page?.name, page?.pageType || ''))}</span>
                        <span>${escapeHtml(t('details.category', null, '分类'))}: ${gameHtml(gameText(category?.name, group.categoryId))}</span>
                        <span>${escapeHtml(t('details.archiveId', null, '档案组 ID'))}: ${escapeHtml(group.firstLvId)}</span>
                        <span>${escapeHtml(t('details.entryId', null, '条目 ID'))}: ${escapeHtml(item.id)}</span>
                        ${detailIsAdded ? addedTag(t('changes.added', null, '新增')) : ''}
                    </div>
                    <h1>${gameHtml(groupName)}</h1>
                    <p>${gameHtml(description)}</p>
                </div>
            </header>
            ${renderEntryTabs(group, item)}
            ${item.type === 'multi_media' ? renderTranscript(item, popup) : renderDocument(item, popup)}
        </article>`;
    }

    function renderEmptyGroup(group) {
        const category = categoryForGroup(group);
        const groupName = gameText(group.name, group.firstLvId);
        const groupIsAdded = state.addedGroupIds.has(String(group.firstLvId));
        elements.content.innerHTML = `<article class="ake-ui-detail" data-detail-kind="archive">
            <header class="ake-ui-detail-header">
                <div class="ake-ui-detail-media">${groupIconTag(group, gamePlainText(groupName), '')}</div>
                <div class="ake-ui-detail-copy">
                    <div class="ake-ui-detail-meta"><span>${gameHtml(gameText(category?.name, group.categoryId))}</span><span>${escapeHtml(group.firstLvId)}</span>${groupIsAdded ? addedTag(t('changes.added', null, '新增')) : ''}</div>
                    <h1>${gameHtml(groupName)}</h1><p>${gameHtml(gameText(group.subName))}</p>
                </div>
            </header>
            <div class="ake-ui-state" data-state="empty"><div><p>${escapeHtml(t('empty.content', null, '该档案暂无正文内容'))}</p></div></div>
        </article>`;
    }

    function closeMobileDirectory(options) {
        const wasOpen = elements.mobileOverlay?.classList.contains('is-open');
        elements.mobileOverlay?.classList.remove('is-open');
        elements.mobileOverlay?.setAttribute('aria-hidden', 'true');
        elements.mobileButton?.setAttribute('aria-expanded', 'false');
        if (wasOpen && options?.restoreFocus !== false) {
            window.setTimeout(() => state.mobileReturnFocus?.focus?.(), 0);
        }
    }

    function openMobileDirectory() {
        state.mobileReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : elements.mobileButton;
        elements.mobileOverlay?.classList.add('is-open');
        elements.mobileOverlay?.setAttribute('aria-hidden', 'false');
        elements.mobileButton?.setAttribute('aria-expanded', 'true');
        window.setTimeout(() => elements.mobileSearch?.focus?.(), 0);
    }

    function focusContent() {
        elements.content.scrollTop = 0;
        elements.content.focus?.({ preventScroll: true });
    }

    function showOverview(options) {
        state.activeGroupId = '';
        state.activeItemId = '';
        if (options?.resetPage !== false) state.activePageType = '';
        renderDirectories();
        renderOverview();
        closeMobileDirectory({ restoreFocus: options?.restoreFocus });
        if (options?.updateUrl !== false) window.__akeRouter?.updateUrl?.(MODULE_ID, '');
        if (options?.focusContent) focusContent();
    }

    function selectItem(itemId, options) {
        const item = state.itemMap.get(String(itemId || ''));
        if (!item) return false;
        state.activeItemId = String(item.id);
        state.activeGroupId = String(item.firstLvId || '');
        state.activePageType = '';
        renderDirectories();
        renderDetail(item);
        closeMobileDirectory({ restoreFocus: false });
        if (options?.updateUrl !== false) window.__akeRouter?.updateUrl?.(MODULE_ID, state.activeGroupId);
        if (options?.focusContent !== false) focusContent();
        return true;
    }

    function openGroup(groupId, options) {
        const group = state.groupMap.get(String(groupId || ''));
        if (!group) return false;
        const items = itemRowsForGroup(group.firstLvId);
        const queryItem = state.query ? items.find(item => state.itemSearch.get(String(item.id))?.includes(state.query)) : null;
        if (queryItem || items[0]) return selectItem((queryItem || items[0]).id, options);
        state.activeGroupId = String(group.firstLvId);
        state.activeItemId = '';
        renderDirectories();
        renderEmptyGroup(group);
        closeMobileDirectory({ restoreFocus: false });
        if (options?.updateUrl !== false) window.__akeRouter?.updateUrl?.(MODULE_ID, state.activeGroupId);
        if (options?.focusContent !== false) focusContent();
        return true;
    }

    function onDirectoryClick(event) {
        const target = event.target.closest('[data-akearchive-action]');
        if (!target) return;
        if (target.dataset.akearchiveAction === 'open-group') openGroup(target.dataset.groupId, { updateUrl: true });
        if (target.dataset.akearchiveAction === 'show-overview') showOverview({ updateUrl: true, focusContent: true, restoreFocus: false });
    }

    function onContentClick(event) {
        const target = event.target.closest('[data-akearchive-action]');
        if (!target) return;
        const action = target.dataset.akearchiveAction;
        if (action === 'open-group') openGroup(target.dataset.groupId, { updateUrl: true });
        if (action === 'select-entry') selectItem(target.dataset.entryId, { updateUrl: true });
        if (action === 'filter-page') {
            const pageType = String(target.dataset.pageType || '');
            state.activePageType = state.activePageType === pageType ? '' : pageType;
            renderOverview();
            elements.content.scrollTop = 0;
        }
        if (action === 'set-gender' && /^(?:f|m)$/.test(target.dataset.gender || '')) {
            state.gender = target.dataset.gender;
            const item = state.itemMap.get(state.activeItemId);
            if (item) renderDetail(item);
        }
        if (action === 'show-overview') showOverview({ updateUrl: true, focusContent: true });
    }

    function onSearchInput(event) {
        const value = event.currentTarget.value || '';
        state.query = normalizeSearch(value);
        state.activePageType = '';
        if (elements.search && elements.search !== event.currentTarget) elements.search.value = value;
        if (elements.mobileSearch && elements.mobileSearch !== event.currentTarget) elements.mobileSearch.value = value;
        const leftDetail = Boolean(state.activeItemId || state.activeGroupId);
        state.activeItemId = '';
        state.activeGroupId = '';
        renderDirectories();
        renderOverview();
        if (leftDetail) window.__akeRouter?.updateUrl?.(MODULE_ID, '');
    }

    function onOverlayClick(event) {
        if (event.target === elements.mobileOverlay) closeMobileDirectory();
    }

    function onModuleDeactivate(event) {
        if (event.detail?.moduleId === MODULE_ID) closeMobileDirectory({ restoreFocus: false });
    }

    function onViewportChange(event) {
        if (!event.matches) closeMobileDirectory({ restoreFocus: false });
    }

    function onHomeClick() {
        showOverview({ updateUrl: true, focusContent: true });
    }

    function onKeyDown(event) {
        if (!elements.mobileOverlay?.classList.contains('is-open')) return;
        if (event.key === 'Escape') {
            closeMobileDirectory();
            return;
        }
        if (event.key !== 'Tab' || !elements.mobilePanel) return;
        const focusable = Array.from(elements.mobilePanel.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )).filter(element => !element.hidden && element.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function onImageError(event) {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        if (image.dataset.archiveContentImage === 'true') {
            const placeholder = document.createElement('div');
            placeholder.className = 'akearchive-image-placeholder';
            placeholder.textContent = t('contentImage.unavailable', null, '正文图片不可用');
            (image.closest('.akearchive-image-row') || image).replaceWith(placeholder);
            return;
        }
        image.hidden = true;
    }

    function loadingHtml() {
        return `<div class="ake-ui-state" data-state="loading" role="status">
            <span class="ake-ui-spinner" aria-hidden="true"></span>
            <div><h2>${escapeHtml(t('title', null, '档案库'))}</h2><p>${escapeHtml(t('loading.archive', null, '正在读取档案库数据'))}</p></div>
        </div>`;
    }

    function errorHtml(error) {
        const message = error?.message || String(error || 'Unknown error');
        return `<div class="ake-ui-state" data-state="error" role="alert"><div><h2>${escapeHtml(t('title', null, '档案库'))}</h2><p>${escapeHtml(tr('errors.loadFailed', { message }, `档案库加载失败：${message}`))}</p></div></div>`;
    }

    async function load() {
        const token = ++state.loadToken;
        elements.content.innerHTML = loadingHtml();
        try {
            if (window.configLoaded) await window.configLoaded;
            const comparison = window.akeDataSource?.getState?.()?.comparison;
            const baselinePromise = comparison?.baseline
                ? Promise.all(['PrtsFirstLv', 'PrtsAllItem'].map(name => window.AKEV3.table(name, comparison.baseline)))
                    .then(loaded => ({ PrtsFirstLv: loaded[0], PrtsAllItem: loaded[1] }))
                    .catch(error => {
                        console.warn('Failed to load baseline archive data for version comparison', error);
                        return null;
                    })
                : Promise.resolve(null);
            const [loaded, baselineRaw] = await Promise.all([
                Promise.all(TABLE_NAMES.map(name => window.AKEV3.table(name))),
                baselinePromise
            ]);
            if (state.disposed || token !== state.loadToken) return;
            const raw = Object.fromEntries(TABLE_NAMES.map((name, index) => [name, loaded[index]]));
            prepareVersionChanges(raw, baselineRaw, comparison);
            prepareTables(raw);
            renderDirectories();
            if (pendingDeepId) {
                const selected = openGroup(pendingDeepId, { updateUrl: false, focusContent: false });
                if (selected) return;
                window.__akeRouter?.onDeepLinkNotFound?.(pendingDeepId, false);
            }
            showOverview({ updateUrl: false, focusContent: false });
        } catch (error) {
            if (state.disposed || token !== state.loadToken) return;
            console.error('Failed to load archive data', error);
            if (elements.meta) elements.meta.textContent = t('errors.loadFailed', null, '加载失败');
            elements.directory.innerHTML = '';
            if (elements.mobileDirectory) elements.mobileDirectory.innerHTML = '';
            elements.content.innerHTML = errorHtml(error);
        }
    }

    elements.home?.addEventListener('click', onHomeClick);
    elements.directory.addEventListener('click', onDirectoryClick);
    elements.mobileDirectory?.addEventListener('click', onDirectoryClick);
    elements.content.addEventListener('click', onContentClick);
    root.addEventListener('error', onImageError, true);
    elements.search?.addEventListener('input', onSearchInput);
    elements.mobileSearch?.addEventListener('input', onSearchInput);
    elements.mobileButton?.addEventListener('click', openMobileDirectory);
    elements.mobileClose?.addEventListener('click', closeMobileDirectory);
    elements.mobileOverlay?.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('ake:module-deactivate', onModuleDeactivate);
    const mobileViewport = window.matchMedia('(max-width: 999px)');
    mobileViewport.addEventListener?.('change', onViewportChange);

    window.__akeArchiveController = {
        destroy() {
            state.disposed = true;
            state.loadToken += 1;
            elements.home?.removeEventListener('click', onHomeClick);
            elements.directory.removeEventListener('click', onDirectoryClick);
            elements.mobileDirectory?.removeEventListener('click', onDirectoryClick);
            elements.content.removeEventListener('click', onContentClick);
            root.removeEventListener('error', onImageError, true);
            elements.search?.removeEventListener('input', onSearchInput);
            elements.mobileSearch?.removeEventListener('input', onSearchInput);
            elements.mobileButton?.removeEventListener('click', openMobileDirectory);
            elements.mobileClose?.removeEventListener('click', closeMobileDirectory);
            elements.mobileOverlay?.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('ake:module-deactivate', onModuleDeactivate);
            mobileViewport.removeEventListener?.('change', onViewportChange);
        },
        showOverview: () => showOverview({ updateUrl: true, focusContent: true }),
        selectItem: itemId => selectItem(itemId, { updateUrl: true }),
        openGroup: groupId => openGroup(groupId, { updateUrl: true })
    };

    load();
})();
