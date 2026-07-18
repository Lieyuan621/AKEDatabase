(function() {
        const t = window.akeI18n.scope('modules.achievement');
        let allCategories = [];
        let rawAllCategories = [];
        let activeCategoryId = null;
        let isInitialized = false;
        let searchTerm = '';

        const IMAGE_BASE_PATH = '/public/images/';
        
        const mobileBtn = document.getElementById('achievementMobileListBtn');
        const mobileOverlay = document.getElementById('achievementMobileListOverlay');
        const mobileContent = document.getElementById('achievementMobileListContent');

        function buildMobileList() {
            const filtered = filterCategoriesBySearch(allCategories);
            mobileContent.innerHTML = '';
            filtered.forEach(cat => {
                const item = document.createElement('div');
                item.className = 'mobile-list-item';
                window.AKEModuleOverview?.markVersionChange(item, cat);
                if (cat.categoryId === activeCategoryId) item.classList.add('active');
                item.innerHTML = `
                    <div class="item-name">${cat.name}</div>
                    <div class="item-id">${cat.categoryId}</div>
                `;
                item.addEventListener('click', () => {
                    activeCategoryId = cat.categoryId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('achievement', cat.categoryId);
                    loadCategoryDetail(cat, document.getElementById('achievementDetail'));
                    closeMobileList();
                });
                mobileContent.appendChild(item);
            });
        }

        function openMobileList() {
            buildMobileList();
            mobileOverlay.style.display = 'flex';
        }

        function closeMobileList() {
            mobileOverlay.style.display = 'none';
        }

        function getCurrentShowHidden() {
            return window.akeData?.getConfig().showHidden ?? false;
        }

        function parseText(text) {
            return window.parseText(text, IMAGE_BASE_PATH);
        }

        function filterCategoriesBySearch(cats) {
            if (!searchTerm) return cats;
            const term = searchTerm.toLowerCase();
            return cats.filter(c => 
                (c.name && c.name.toLowerCase().includes(term)) || 
                (c.categoryId && c.categoryId.toLowerCase().includes(term))
            );
        }

        async function loadCategoryManifest(showHidden) {
            try {
                const res = await (window.akeFetch || fetch)('/public/CH/achievement/manifest.json');
                if (!res.ok) throw new Error('无法加载奖章分类清单');
                const all = await res.json();
                rawAllCategories = all;
                let cats = showHidden ? all : all.filter(c => !c.hidden);
                cats.sort((a, b) => (a.priority || 999) - (b.priority || 999));
                return cats;
            } catch (err) {
                console.error('加载分类清单失败:', err);
                return [];
            }
        }

        function renderAchievementOverview(items, container) {
            window.AKEModuleOverview.render(container, {
                title: t('overview.title'), description: t('overview.description'),
                group: () => ({ id: 'categories', name: t('overview.group'), order: 0 }),
                onReset: () => { activeCategoryId = null; },
                onSelect: item => { activeCategoryId = item.categoryId; renderCategoryList(); },
                sidebarSelector: item => `.category-item[data-cat-id="${CSS.escape(item.categoryId)}"]`,
                items: items.map(item => ({ ...item, id: item.categoryId, image: item.icon, fallback: t('overview.fallback'),
                    tags: [t('overview.achievementCount', { count: item.achievementCount || 0 }), t('overview.groupCount', { count: item.groupCount || 0 }), item.platedCount ? t('overview.platedCount', { count: item.platedCount }) : ''] }))
            });
        }

        function renderCategoryList() {
            const container = document.getElementById('categoryList');
            const detailContainer = document.getElementById('achievementDetail');
            if (!container) return;

            const filtered = filterCategoriesBySearch(allCategories);

            container.innerHTML = '';
            if (filtered.length === 0) {
                container.innerHTML = `<div class="loader">${t('noMatches')}</div>`;
                if (detailContainer) detailContainer.innerHTML = `<div class="loader">${t('select')}</div>`;
                activeCategoryId = null;
                return;
            }

            filtered.forEach((cat, index) => {
                const item = document.createElement('div');
                item.className = `category-item ${cat.categoryId === activeCategoryId ? 'active' : (index === 0 && !activeCategoryId && !window.AKEModuleOverview?.isActive('achievement') ? 'active' : '')}`;
                window.AKEModuleOverview?.markVersionChange(item, cat);
                item.dataset.catId = cat.categoryId;
                item.dataset.contentFile = cat.contentFile;

                const nameDiv = document.createElement('div');
                nameDiv.className = 'category-name';
                nameDiv.textContent = cat.name;

                item.appendChild(nameDiv);

                item.addEventListener('click', () => {
                    document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    activeCategoryId = cat.categoryId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('achievement', cat.categoryId);
                    loadCategoryDetail(cat, detailContainer);
                });

                container.appendChild(item);
            });

            if (window.__deepLinkId) {
                const deepItem = filtered.find(c => c.categoryId === window.__deepLinkId);
                if (deepItem) {
                    activeCategoryId = deepItem.categoryId;
                } else {
                    const existsInRaw = rawAllCategories.some(c => c.categoryId === window.__deepLinkId);
                    if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                        window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                    }
                }
                window.__deepLinkId = null;
            }
            const activeExists = filtered.some(c => c.categoryId === activeCategoryId);
            if (!activeExists && filtered.length > 0) {
                if (window.AKEModuleOverview?.isActive('achievement')) {
                    activeCategoryId = null;
                    renderAchievementOverview(filtered, detailContainer);
                    return;
                }
                activeCategoryId = filtered[0].categoryId;
                const firstItem = container.querySelector('.category-item');
                if (firstItem) firstItem.classList.add('active');
                if (window.__akeRouter) window.__akeRouter.updateUrl('achievement', activeCategoryId);
                loadCategoryDetail(filtered[0], detailContainer);
            } else if (activeExists) {
                const activeCat = filtered.find(c => c.categoryId === activeCategoryId);
                if (activeCat) {
                    const activeItem = container.querySelector(`.category-item[data-cat-id="${activeCategoryId}"]`);
                    if (activeItem) activeItem.classList.add('active');
                    if (window.__akeRouter) window.__akeRouter.updateUrl('achievement', activeCategoryId);
                    loadCategoryDetail(activeCat, detailContainer);
                }
            }
        }

        async function loadCategoryDetail(category, container) {
            container.innerHTML = `<div class="loader">${t('loading')}</div>`;
            try {
                const data = await (window.akeFetch || fetch)(category.contentFile).then(r => r.json());
                container.innerHTML = renderDetail(data);
                window.AKEModuleOverview?.renderVersionDiff(container, data, data.__versionDiff?.baseline ? renderDetail(data.__versionDiff.baseline) : '');
            } catch (err) {
                container.innerHTML = `<div class="error-message">${t('loadFailed', { message: err.message })}</div>`;
            }
        }

        function renderBadges(achv, isVersionAdded) {
            let badges = [];
            if (isVersionAdded) {
                const addedLabel = window.akeData?.t('versionDiff.added', null, '新增') || '新增';
                badges.push(`<span class="badge version-added">${addedLabel}</span>`);
            }
            if (achv.canBeUpgraded) badges.push(`<span class="badge upgrade">${t('badges.upgradable')}</span>`);
            if (achv.canBePlated) badges.push(`<span class="badge plate">${t('badges.platable')}</span>`);
            if (achv.applyRareEffect) badges.push(`<span class="badge rare">${t('badges.rareEffect')}</span>`);
            if (achv.noObtainCanView === false) badges.push(`<span class="badge hidden">${t('badges.hidden')}</span>`);
            return badges.length ? `<div class="badge-group">${badges.join('')}</div>` : '';
        }

        function renderAchievementLevels(achv) {
            const levels = achv.level || [];
            let levelsHtml = '';
            levels.forEach(lvl => {
                const conditions = lvl.conditions || [];
                const progress = lvl.progressToCompare || [];
                let conditionsHtml = '';
                conditions.forEach((cond, idx) => {
                    const progVal = progress[idx] !== undefined ? progress[idx] : '';
                    const progText = progVal !== '' ? ` <span class="progress-value">(${progVal})</span>` : '';
                    conditionsHtml += `<div class="condition-item">${parseText(cond)}${progText}</div>`;
                });

                const iconSrc = lvl.icon || '';
                levelsHtml += `
                    <div class="level-item">
                        <div class="level-icon">
                            <img src="${iconSrc}" onerror="this.onerror=null; this.src='';">
                        </div>
                        <div class="level-info">
                            <div class="level-desc">${parseText(lvl.desc || '')}</div>
                            <div class="level-conditions">${conditionsHtml}</div>
                        </div>
                    </div>
                `;
            });
            return levelsHtml;
        }

        function renderGroupAchievements(achvMap, addedAchievementIds) {
            const achvList = Object.entries(achvMap).map(([id, achv]) => ({ id, ...achv }));
            achvList.sort((a, b) => {
                const addedOrder = Number(addedAchievementIds.has(b.id)) - Number(addedAchievementIds.has(a.id));
                return addedOrder || (a.order || 999) - (b.order || 999);
            });

            let html = '';
            achvList.forEach(achv => {
                const badgesHtml = renderBadges(achv, addedAchievementIds.has(achv.id));
                const levelsHtml = renderAchievementLevels(achv);
                html += `
                    <div class="achievement-card">
                        <div class="achievement-header">
                            <span class="achievement-name">${achv.name}</span>
                            ${badgesHtml}
                        </div>
                        <div class="achievement-levels">
                            ${levelsHtml}
                        </div>
                    </div>
                `;
            });
            return html;
        }

        function renderDetail(data) {
            const group = data.group || {};
            const groupKeys = Object.keys(group);
            const addedAchievementIds = new Set(data.__versionAddedAchievementIds || []);

            if (groupKeys.length === 1 && groupKeys[0] === 'default') {
                return `
                    <div class="category-title">${t('detail.title', { name: data.categoryName || '' })}</div>
                    <div class="achievement-group">
                        ${renderGroupAchievements(group.default, addedAchievementIds)}
                    </div>
                `;
            } else {
                let groupsHtml = '';
                groupKeys.forEach(key => {
                    if (key === 'default') return;
                    const groupName = key;
                    const achvMap = group[key];
                    groupsHtml += `
                        <div class="group-section">
                            <h3 class="group-title">${groupName}</h3>
                            <div class="achievement-group">
                                ${renderGroupAchievements(achvMap, addedAchievementIds)}
                            </div>
                        </div>
                    `;
                });
                return `
                    <div class="category-title">${t('detail.title', { name: data.categoryName || '' })}</div>
                    ${groupsHtml}
                `;
            }
        }

        async function refreshModule() {
            const list = document.getElementById('categoryList');
            const detail = document.getElementById('achievementDetail');
            if (!list || !detail) return;

            const showHidden = getCurrentShowHidden();
            const cats = await loadCategoryManifest(showHidden);
            allCategories = cats;
            renderCategoryList();
        }

        async function initModule() {
            if (isInitialized) return;
            isInitialized = true;
            if (window.configLoaded) await window.configLoaded;

            if (mobileBtn) mobileBtn.addEventListener('click', openMobileList);
            if (mobileOverlay) mobileOverlay.addEventListener('click', (e) => {
                if (e.target === mobileOverlay) closeMobileList();
            });

            window.addEventListener('globalConfigChanged', (e) => {
                searchTerm = '';
                const searchInput = document.getElementById('achievementSearchInput');
                if (searchInput) searchInput.value = '';
                refreshModule();
            });

            document.getElementById('achievementSearchInput')?.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                renderCategoryList();
            });

            await refreshModule();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initModule);
        } else {
            initModule();
        }
    })();
