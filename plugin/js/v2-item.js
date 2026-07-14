(function() {
        let allItems = [];
        let rawAllItems = [];
        let activeItemId = null;
        let isInitialized = false;
        let searchTerm = '';
        let selectedRarities = new Set();
        let selectedCategories = new Set();
        let itemTypeMap = {};

        const IMAGE_BASE_PATH = '/public/images/';

        function getItemCategory(item) {
            return item.categoryId || `type:${item.type}`;
        }

        function getItemCategoryName(item) {
            return item.categoryName || itemTypeMap[String(item.type)] || `类型 ${item.type}`;
        }

        function getCurrentShowHidden() {
            return window.akeData?.getConfig().showHidden ?? false;
        }

        function valueTip(displayValue, rawValue, variableName) {
            return window.renderRawValueTip ? window.renderRawValueTip(displayValue, rawValue, variableName) : displayValue;
        }

        function parseText(text) {
            return window.parseText(text, IMAGE_BASE_PATH);
        }

        function getTypeName(typeId, itemtypetable) {
            if (itemtypetable?.name?.text) return itemtypetable.name.text;
            return itemTypeMap[String(typeId)] || `类型 ${typeId}`;
        }

        function filterItems(items) {
            return items.filter(item => {
                if (searchTerm) {
                    const t = searchTerm.toLowerCase();
                    if (!(item.name && item.name.toLowerCase().includes(t)) &&
                        !(item.itemId && item.itemId.toLowerCase().includes(t))) return false;
                }
                if (selectedRarities.size > 0 && !selectedRarities.has(item.rarity)) return false;
                if (selectedCategories.size > 0) {
                    if (!selectedCategories.has(getItemCategory(item))) return false;
                }
                return true;
            });
        }

        async function loadMaps() {
            try {
                const data = await window.akeLoadMaps();
                itemTypeMap = data.item_type_map || {};
            } catch { itemTypeMap = {}; }
        }

        function generateFilterButtons() {
            const rc = document.getElementById('v2itemRarityFilter');
            const cc = document.getElementById('v2itemCategoryFilter');
            if (!rc || !cc) return;

            const existR = new Set(allItems.map(i => i.rarity));
            rc.innerHTML = '';
            for (let r = 1; r <= 6; r++) {
                if (!existR.has(r)) continue;
                const btn = document.createElement('span');
                btn.className = `v2i-filter-btn ${selectedRarities.has(r) ? 'active' : ''}`;
                btn.textContent = r + '星';
                btn.addEventListener('click', () => {
                    selectedRarities.has(r) ? selectedRarities.delete(r) : selectedRarities.add(r);
                    btn.classList.toggle('active');
                    updateFilterSummary();
                    renderItemList();
                });
                rc.appendChild(btn);
            }

            const categories = new Map();
            allItems.forEach((item, index) => {
                const id = getItemCategory(item);
                const current = categories.get(id);
                const order = item.categoryOrder ?? (1000 + Number(item.type || 0));
                if (!current || order < current.order) {
                    categories.set(id, { id, name: getItemCategoryName(item), order, sourceOrder: index });
                }
            });
            const ordered = Array.from(categories.values()).sort((a, b) =>
                a.order - b.order || a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id, 'zh-CN'));

            cc.innerHTML = '';
            ordered.forEach(cat => {
                const btn = document.createElement('span');
                btn.className = `v2i-filter-btn ${selectedCategories.has(cat.id) ? 'active' : ''}`;
                btn.textContent = cat.name;
                btn.addEventListener('click', () => {
                    selectedCategories.has(cat.id) ? selectedCategories.delete(cat.id) : selectedCategories.add(cat.id);
                    btn.classList.toggle('active');
                    updateFilterSummary();
                    renderItemList();
                });
                cc.appendChild(btn);
            });
            updateFilterSummary();
        }

        function updateFilterSummary() {
            const summary = document.getElementById('v2itemFilterSummary');
            if (!summary) return;
            const count = selectedRarities.size + selectedCategories.size;
            summary.textContent = count ? `筛选 (${count})` : '筛选';
        }

        const mobileBtn = document.getElementById('v2itemMobileListBtn');
        const mobileOverlay = document.getElementById('v2itemMobileListOverlay');
        const mobileContent = document.getElementById('v2itemMobileListContent');

        function buildMobileList() {
            const filtered = filterItems(allItems);
            mobileContent.innerHTML = '';
            filtered.forEach(item => {
                const div = document.createElement('div');
                div.className = `v2i-mobile-item ${item.itemId === activeItemId ? 'active' : ''}`;
                div.innerHTML = `
                    <div class="v2i-mobile-name">${item.name}</div>
                    <div class="v2i-mobile-id">${item.itemId}</div>
                `;
                div.addEventListener('click', () => {
                    activeItemId = item.itemId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_item', item.itemId);
                    loadItemDetail(item, document.getElementById('v2itemDetail'));
                    closeMobileList();
                });
                mobileContent.appendChild(div);
            });
        }

        function openMobileList() {
            buildMobileList();
            mobileOverlay.style.display = 'flex';
        }

        function closeMobileList() {
            mobileOverlay.style.display = 'none';
        }

        async function loadItemManifest(showHidden) {
            try {
                const res = await (window.akeFetch || fetch)('/public/CH/v2_item/manifest.json');
                if (!res.ok) throw new Error('无法加载物品清单');
                const all = await res.json();
                rawAllItems = all;
                let items = showHidden ? all : all.filter(i => !i.hidden);
                items.sort((a, b) => (a.priority || 999) - (b.priority || 999));
                return items;
            } catch (err) {
                console.error('加载物品清单失败:', err);
                return [];
            }
        }

        function renderItemOverview(items, container) {
            window.AKEModuleOverview.render(container, {
                title: '物品总览', description: '按游戏内展示分类分组，汇总所有物品与稀有度',
                group: item => ({ id: item.categoryId, name: item.categoryName || '其他物品', order: item.categoryOrder }),
                onReset: () => { activeItemId = null; },
                onSelect: item => { activeItemId = item.itemId; renderItemList(); },
                sidebarSelector: item => `.v2i-item[data-item-id="${CSS.escape(item.itemId)}"]`,
                items: items.map(item => ({ ...item, id: item.itemId, image: item.icon, fallback: 'ITEM', tags: [`${item.rarity || 1} 星`] }))
            });
        }

        function renderItemList() {
            const container = document.getElementById('v2itemList');
            const detailContainer = document.getElementById('v2itemDetail');
            if (!container) return;

            const filtered = filterItems(allItems);
            container.innerHTML = '';

            if (filtered.length === 0) {
                container.innerHTML = '<div class="v2i-loader">无匹配物品</div>';
                if (detailContainer) detailContainer.innerHTML = '<div class="v2i-loader">请选择物品</div>';
                activeItemId = null;
                return;
            }

            filtered.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = `v2i-item ${item.itemId === activeItemId ? 'active' : (!activeItemId && index === 0 && !window.AKEModuleOverview?.isActive('item') ? 'active' : '')}`;
                div.dataset.itemId = item.itemId;

                const rb = document.createElement('span');
                rb.className = `v2i-rarity-bar rarity-${item.rarity}`;
                rb.title = `稀有度 ${item.rarity}`;

                const icon = document.createElement('img');
                icon.className = 'v2i-item-icon';
                icon.src = item.icon || '';
                icon.onerror = function() { this.onerror = null; this.src = ''; };

                const info = document.createElement('div');
                info.className = 'v2i-item-info';
                const nm = document.createElement('div');
                nm.className = 'v2i-item-name';
                nm.textContent = item.name;
                const id = document.createElement('div');
                id.className = 'v2i-item-id';
                id.textContent = item.itemId;
                info.appendChild(nm);
                info.appendChild(id);

                div.appendChild(rb);
                div.appendChild(icon);
                div.appendChild(info);

                div.addEventListener('click', () => {
                    document.querySelectorAll('.v2i-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                    activeItemId = item.itemId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_item', item.itemId);
                    loadItemDetail(item, detailContainer);
                });

                container.appendChild(div);
            });

            if (window.__deepLinkId) {
                const deepItem = filtered.find(c => c.itemId === window.__deepLinkId);
                if (deepItem) {
                    activeItemId = deepItem.itemId;
                } else {
                    const existsInRaw = rawAllItems.some(c => c.itemId === window.__deepLinkId);
                    if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                        window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                    }
                }
                window.__deepLinkId = null;
            }
            const activeExists = filtered.some(i => i.itemId === activeItemId);
            if (!activeExists && filtered.length > 0) {
                if (window.AKEModuleOverview?.isActive('item')) {
                    activeItemId = null;
                    renderItemOverview(filtered, detailContainer);
                    return;
                }
                activeItemId = filtered[0].itemId;
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_item', activeItemId);
                const f = container.querySelector('.v2i-item');
                if (f) f.classList.add('active');
                loadItemDetail(filtered[0], detailContainer);
            } else if (activeExists) {
                const ai = filtered.find(i => i.itemId === activeItemId);
                if (ai) {
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_item', activeItemId);
                    const ad = container.querySelector(`.v2i-item[data-item-id="${activeItemId}"]`);
                    if (ad) ad.classList.add('active');
                    loadItemDetail(ai, detailContainer);
                }
            }
        }

        async function loadItemDetail(item, container) {
            container.innerHTML = '<div class="v2i-loader">加载物品数据...</div>';
            try {
                const data = await (window.akeFetch || fetch)(item.contentFile).then(r => r.json());
                container.innerHTML = renderDetail(data, item);
            } catch (err) {
                container.innerHTML = `<div class="v2i-error">加载失败: ${err.message}</div>`;
            }
        }

        function renderObtainWays(data) {
            const it = data.itemtable || {};
            const sj = data.systemjumptable || {};
            const ids = it.obtainWayIds || [];
            if (ids.length === 0) return '';

            const ways = ids.map(id => sj[id]).filter(Boolean);
            if (ways.length === 0) return '';

            return `
                <div class="v2i-section">
                    <h3>获取方式</h3>
                    <div class="v2i-obtain-list">
                        ${ways.map(w => `
                            <div class="v2i-obtain-item">
                                <img class="v2i-obtain-icon" src="/public/images/item/itemtips/${w.iconId}.png" onerror="this.onerror=null; this.src='';">
                                <span class="v2i-obtain-desc">${parseText(w.desc?.text || w.id)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        function renderProperties(it, itt) {
            const props = [];
            if (it.maxStackCount !== undefined && it.maxStackCount !== -1)
                props.push({ l: '最大堆叠', v: it.maxStackCount });
            if (it.maxBackpackStackCount !== undefined && it.maxBackpackStackCount !== -1)
                props.push({ l: '背包堆叠上限', v: it.maxBackpackStackCount });
            if (itt.storageSpace !== undefined)
                props.push({ l: '占用空间', v: itt.storageSpace });
            if (!props.length) return '';

            return `
                <div class="v2i-section">
                    <h3>属性</h3>
                    <div class="v2i-props-grid">
                        ${props.map(p => `
                            <div class="v2i-prop-item">
                                <span class="v2i-prop-label">${p.l}</span>
                                <span class="v2i-prop-value">${valueTip(p.v, p.v, p.l)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        function renderExtraTables(data) {
            let h = '';

            if (data.weaponpotentialuptable) {
                const wpns = data.weaponpotentialuptable.weaponIds || [];
                if (wpns.length) {
                    h += `<div class="v2i-section">
                        <h3>适用武器</h3>
                        <div class="v2i-tags">${wpns.map(id => `<span class="v2i-tag">${id}</span>`).join('')}</div>
                    </div>`;
                }
            }

            if (data.usableitemchesttable) {
                const ch = data.usableitemchesttable;
                const rwd = ch.rewardIdList || [];
                h += `<div class="v2i-section"><h3>自选箱内容</h3>`;
                if (ch.selectedCount) h += `<div class="v2i-chest-meta">可选数量: ${valueTip(ch.selectedCount, ch.selectedCount, 'selectedCount')}</div>`;
                if (rwd.length) h += `<div class="v2i-tags">${rwd.map(id => `<span class="v2i-tag">${id}</span>`).join('')}</div>`;
                h += `</div>`;
            }

            if (data.itemiconcompositetable) {
                const c = data.itemiconcompositetable;
                h += `<div class="v2i-section"><h3>图标合成</h3><div class="v2i-props-grid">`;
                h += `<div class="v2i-prop-item"><span class="v2i-prop-label">合成类型</span><span class="v2i-prop-value">${valueTip(c.iconTransType, c.iconTransType, 'iconTransType')}</span></div>`;
                if (c.showRarity !== undefined) h += `<div class="v2i-prop-item"><span class="v2i-prop-label">显示稀有度</span><span class="v2i-prop-value">${valueTip(c.showRarity ? '是' : '否', c.showRarity, 'showRarity')}</span></div>`;
                if (c.markIcon) h += `<div class="v2i-prop-item"><span class="v2i-prop-label">标记图标</span><span class="v2i-prop-value">${c.markIcon}</span></div>`;
                h += `</div></div>`;
            }

            if (data.itemshowingtypetable) {
                const s = data.itemshowingtypetable;
                h += `<div class="v2i-section">
                    <h3>显示类型</h3>
                    <span class="v2i-tag">${s.name?.text || s.type}</span>
                </div>`;
            }

            if (data.wikientrydatatable) {
                const w = data.wikientrydatatable;
                h += `<div class="v2i-section"><h3>百科条目</h3><div class="v2i-props-grid">`;
                h += `<div class="v2i-prop-item"><span class="v2i-prop-label">条目ID</span><span class="v2i-prop-value">${w.id}</span></div>`;
                if (w.groupId) h += `<div class="v2i-prop-item"><span class="v2i-prop-label">分组</span><span class="v2i-prop-value">${w.groupId}</span></div>`;
                h += `</div></div>`;
            }

            return h;
        }

        function renderDetail(data, item) {
            const it = data.itemtable || {};
            const itt = data.itemtypetable || {};
            const name = it.name?.text || data.name || item.name;
            const rarity = it.rarity ?? item.rarity;
            const iconId = it.iconId || '';
            const iconBig = iconId ? `/public/images/item/itemiconbig/${iconId}.png` : (item.icon || '');
            const typeName = getTypeName(it.type, itt);
            const desc = it.desc?.text || '';
            const decoDesc = it.decoDesc?.text || '';
            const showDeco = decoDesc && decoDesc !== desc;

            let html = `
                <div class="v2i-detail-container">
                    <div class="v2i-header">
                        <div class="v2i-header-icon">
                            <img src="${iconBig}" onerror="this.onerror=null; this.src='${item.icon || ''}';">
                        </div>
                        <div class="v2i-header-text">
                            <div class="v2i-title-row">
                                <span class="v2i-name">${name}</span>
                                <span class="v2i-rarity-dot rarity-${rarity}" title="稀有度 ${rarity}"></span>
                                <span class="v2i-id">${data.itemId || item.itemId}</span>
                            </div>
                            <span class="v2i-type-tag">${typeName}</span>
                        </div>
                    </div>
            `;

            if (desc) html += `<div class="v2i-desc">${parseText(desc)}</div>`;
            if (showDeco) html += `<div class="v2i-deco-desc">${parseText(decoDesc)}</div>`;
            html += renderProperties(it, itt);
            html += renderObtainWays(data);
            html += renderExtraTables(data);
            html += '</div>';
            return html;
        }

        async function refreshModule() {
            const list = document.getElementById('v2itemList');
            const detail = document.getElementById('v2itemDetail');
            if (!list || !detail) return;

            const showHidden = getCurrentShowHidden();
            allItems = await loadItemManifest(showHidden);
            generateFilterButtons();
            renderItemList();
        }

        async function initModule() {
            if (isInitialized) return;
            isInitialized = true;
            if (window.configLoaded) await window.configLoaded;
            await loadMaps();

            if (mobileBtn) mobileBtn.addEventListener('click', openMobileList);
            document.getElementById('v2itemFilterToggle')?.addEventListener('click', (event) => {
                const button = event.currentTarget;
                const content = document.getElementById('v2itemFilterContent');
                if (!content) return;
                const expanded = button.getAttribute('aria-expanded') === 'true';
                button.setAttribute('aria-expanded', String(!expanded));
                content.hidden = expanded;
            });
            if (mobileOverlay) mobileOverlay.addEventListener('click', (e) => {
                if (e.target === mobileOverlay) closeMobileList();
            });

            window.addEventListener('globalConfigChanged', () => {
                searchTerm = '';
                const si = document.getElementById('v2itemSearchInput');
                if (si) si.value = '';
                selectedRarities.clear();
                selectedCategories.clear();
                refreshModule();
            });

            document.getElementById('v2itemSearchInput')?.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                renderItemList();
            });

            await refreshModule();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initModule);
        } else {
            initModule();
        }
    })();
