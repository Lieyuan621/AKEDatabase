(function() {
    const t = window.akeI18n.scope('modules.weapon');
    const commonT = window.akeI18n.scope('common');
    let allWeapons = [];
    let rawAllWeapons = [];
    let activeWeaponId = null;
    let isInitialized = false;
    let weaponLevelsToShow = null;
    let showAllWeaponLevels = false;
    let searchTerm = '';
    let currentWeaponData = null;
    let currentWeapon = null;
    let selectedRarities = new Set();
    let selectedTypes = new Set();

    const IMAGE_BASE_PATH = '/public/images/';
    const WEAPON_TYPE_KEY_MAP = { 1: 'oneHandedSword', 2: 'artsUnit', 3: 'twoHandedSword', 5: 'polearm', 6: 'handcannon' };

    function getCurrentShowHidden() {
        return window.akeData?.getConfig().showHidden ?? false;
    }
    function parseText(text) {
        const normalized = typeof text === 'string' ? text.replace(/\\r\\n|\\n|\\r/g, '\n') : text;
        return window.parseText(normalized, IMAGE_BASE_PATH);
    }
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
    }
    function parseLevelInput(input, maxLevel = 90) {
        if (!input || !input.trim()) return [];
        return input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= maxLevel);
    }

    function getWeaponTypeName(weaponType, unknownKey = 'unknown') {
        const key = WEAPON_TYPE_KEY_MAP[weaponType];
        return key ? t(`weaponTypes.${key}`) : t(unknownKey);
    }

    function filterWeapons(weapons) {
        return weapons.filter(w => {
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                if (!(w.name && w.name.toLowerCase().includes(term)) &&
                    !(w.weaponId && w.weaponId.toLowerCase().includes(term))) return false;
            }
            if (selectedRarities.size > 0 && !selectedRarities.has(w.rarity)) return false;
            if (selectedTypes.size > 0 && !selectedTypes.has(w.weaponType)) return false;
            return true;
        });
    }

    function generateFilterButtons() {
        const rc = document.getElementById('v2wpnRarityFilter');
        const tc = document.getElementById('v2wpnTypeFilter');
        if (!rc || !tc) return;

        const existR = new Set(allWeapons.map(w => w.rarity));
        rc.innerHTML = '';
        for (let r = 1; r <= 6; r++) {
            if (!existR.has(r)) continue;
            const btn = document.createElement('span');
            btn.className = `ake-ui-filter__button ${selectedRarities.has(r) ? 'is-active' : ''}`;
            btn.textContent = commonT('rarityStars', { rarity: r });
            btn.addEventListener('click', () => {
                selectedRarities.has(r) ? selectedRarities.delete(r) : selectedRarities.add(r);
                btn.classList.toggle('is-active');
                renderWeaponList();
            });
            rc.appendChild(btn);
        }

        const existT = new Set(allWeapons.map(w => w.weaponType));
        tc.innerHTML = '';
        for (const [tid] of Object.entries(WEAPON_TYPE_KEY_MAP)) {
            const id = parseInt(tid, 10);
            if (!existT.has(id)) continue;
            const btn = document.createElement('span');
            btn.className = `ake-ui-filter__button ${selectedTypes.has(id) ? 'is-active' : ''}`;
            btn.textContent = getWeaponTypeName(id);
            btn.addEventListener('click', () => {
                selectedTypes.has(id) ? selectedTypes.delete(id) : selectedTypes.add(id);
                btn.classList.toggle('is-active');
                renderWeaponList();
            });
            tc.appendChild(btn);
        }
    }

    const mobileBtn = document.getElementById('v2wpnMobileListBtn');
    const mobileOverlay = document.getElementById('v2wpnMobileListOverlay');
    const mobileContent = document.getElementById('v2wpnMobileListContent');

    function buildMobileList() {
        const filtered = filterWeapons(allWeapons);
        mobileContent.innerHTML = '';
        filtered.forEach(w => {
            const div = document.createElement('div');
            div.className = `ake-ui-directory__item ${w.weaponId === activeWeaponId ? 'is-active' : ''}`;
            window.AKEModuleOverview?.markVersionChange(div, w);
            div.innerHTML = `<div class="ake-ui-directory__item-title">${escapeHtml(w.name)}</div><div class="ake-ui-directory__item-id">${escapeHtml(w.weaponId)}</div>`;
            div.addEventListener('click', () => {
                activeWeaponId = w.weaponId;
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_weapon', w.weaponId);
                loadWeaponDetail(w, document.getElementById('v2wpnDetail'));
                closeMobileList();
            });
            mobileContent.appendChild(div);
        });
    }
    function openMobileList() { buildMobileList(); mobileOverlay.classList.add('is-open'); mobileOverlay.setAttribute('aria-hidden', 'false'); }
    function closeMobileList() { mobileOverlay.classList.remove('is-open'); mobileOverlay.setAttribute('aria-hidden', 'true'); }
    if (mobileBtn) mobileBtn.addEventListener('click', openMobileList);
    if (mobileOverlay) mobileOverlay.addEventListener('click', e => { if (e.target === mobileOverlay) closeMobileList(); });

    async function loadWeaponManifest(showHidden) {
        try {
            const res = await (window.akeFetch || fetch)('/public/CH/v2_weapon/manifest.json');
            if (!res.ok) throw new Error('无法加载武器清单');
            const all = await res.json();
        rawAllWeapons = all;
            let weapons = showHidden ? all : all.filter(w => !w.hidden);
            weapons.sort((a, b) => (a.priority || 999) - (b.priority || 999));
            return weapons;
        } catch (err) {
            console.error('加载武器清单失败:', err);
            return [];
        }
    }

    function renderWeaponOverview(items, container) {
        window.AKEModuleOverview.render(container, {
            title: t('overview.title'), description: t('overview.description'),
            group: item => ({ id: String(item.weaponType), name: getWeaponTypeName(item.weaponType, 'unknownType'), order: Number(item.weaponType) }),
            onReset: () => { activeWeaponId = null; },
            onSelect: item => { activeWeaponId = item.weaponId; renderWeaponList(); },
            sidebarSelector: item => `.ake-ui-directory__item[data-weapon-id="${CSS.escape(item.weaponId)}"]`,
            items: items.map(item => ({ ...item, id: item.weaponId, image: item.icon, fallback: t('overview.fallback') }))
        });
    }

    function renderWeaponList() {
        const container = document.getElementById('v2wpnListItems');
        const detailContainer = document.getElementById('v2wpnDetail');
        if (!container) return;

        const filtered = filterWeapons(allWeapons);
        container.innerHTML = '';
        if (filtered.length === 0) {
            container.innerHTML = `<div class="ake-ui-state">${t('noMatches')}</div>`;
            if (detailContainer) detailContainer.innerHTML = `<div class="ake-ui-state">${t('select')}</div>`;
            activeWeaponId = null;
            return;
        }

        filtered.forEach((w, index) => {
            const item = document.createElement('div');
            item.className = `ake-ui-directory__item ${w.weaponId === activeWeaponId ? 'is-active' : (!activeWeaponId && index === 0 && !window.AKEModuleOverview?.isActive('weapon') ? 'is-active' : '')}`;
            window.AKEModuleOverview?.markVersionChange(item, w);
            item.dataset.weaponId = w.weaponId;
            item.dataset.akeRarity = String(w.rarity || 1);

            const icon = document.createElement('img');
            icon.className = 'ake-ui-directory__item-icon';
            icon.src = w.icon || '';

            const info = document.createElement('div');
            info.className = 'ake-ui-directory__item-copy';
            const nm = document.createElement('div');
            nm.className = 'ake-ui-directory__item-title';
            nm.textContent = w.name;
            const nameRow = document.createElement('div');
            nameRow.className = 'weapon-name-row';
            const id = document.createElement('div');
            id.className = 'ake-ui-directory__item-id';
            id.textContent = w.weaponId;
            const typeTag = document.createElement('span');
            typeTag.className = 'weapon-type-tag';
            typeTag.textContent = getWeaponTypeName(w.weaponType);
            nameRow.append(nm, typeTag);
            info.replaceChildren(nameRow, id);

            item.appendChild(icon);
            item.appendChild(info);

            item.addEventListener('click', () => {
                document.querySelectorAll('.ake-ui-directory__item').forEach(el => el.classList.remove('is-active'));
                item.classList.add('is-active');
                activeWeaponId = w.weaponId;
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_weapon', w.weaponId);
                loadWeaponDetail(w, detailContainer);
            });
            container.appendChild(item);
        });

        if (window.__deepLinkId) {
            const deepItem = filtered.find(c => c.weaponId === window.__deepLinkId);
            if (deepItem) {
                activeWeaponId = deepItem.weaponId;
            } else {
                const existsInRaw = rawAllWeapons.some(c => c.weaponId === window.__deepLinkId);
                if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                    window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                }
            }
            window.__deepLinkId = null;
        }

        const activeExists = filtered.some(w => w.weaponId === activeWeaponId);
        if (!activeExists && filtered.length > 0) {
            if (window.AKEModuleOverview?.isActive('weapon')) {
                activeWeaponId = null;
                renderWeaponOverview(filtered, detailContainer);
                return;
            }
            activeWeaponId = filtered[0].weaponId;
            const f = container.querySelector('.ake-ui-directory__item');
            if (f) f.classList.add('is-active');
            if (window.__akeRouter) window.__akeRouter.updateUrl('v2_weapon', activeWeaponId);
            loadWeaponDetail(filtered[0], detailContainer);
        } else if (activeExists) {
            const aw = filtered.find(w => w.weaponId === activeWeaponId);
            if (aw) {
                const ad = container.querySelector(`.ake-ui-directory__item[data-weapon-id="${activeWeaponId}"]`);
                if (ad) ad.classList.add('is-active');
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_weapon', activeWeaponId);
                loadWeaponDetail(aw, detailContainer);
            }
        }
    }

    function replacePlaceholders(desc, valueMap) {
        const lowerValueMap = {};
        for (const [key, val] of Object.entries(valueMap)) {
            lowerValueMap[key.toLowerCase()] = val;
        }
        return desc.replace(/\{([^}]+)\}/g, (match, p1) => {
            const parts = p1.split(':');
            const expr = parts[0].replace(/\s+/g, '');
            const format = parts[1] ? parts[1].trim() : '';
            const varNames = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
            const missingVar = varNames.find(name => !(name.toLowerCase() in lowerValueMap));
            if (missingVar) return match;
            let evalExpr = expr;
            for (const name of varNames) {
                const value = lowerValueMap[name.toLowerCase()];
                evalExpr = evalExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), `(${value})`);
            }
            let result;
            try { result = new Function('return ' + evalExpr)(); } catch (e) { return match; }
            let formatted;
            if (format.includes('%')) formatted = (result * 100).toFixed(1) + '%';
            else if (format.includes('.')) {
                const precision = format.split('.')[1]?.length || 1;
                formatted = result.toFixed(precision);
            }
            else if (format.includes('0')) formatted = Math.round(result).toString();
            else formatted = result.toString();
            const bindings = Object.fromEntries(varNames.map(name => [name, lowerValueMap[name.toLowerCase()]]));
            const changed = !(varNames.length === 1 && expr.toLowerCase() === varNames[0].toLowerCase());
            const rawValue = varNames.length === 1 ? bindings[varNames[0]] : Object.entries(bindings).map(([key, value]) => `${key}=${value}`).join(', ');
            return window.renderRawValueTip ? window.renderRawValueTip(formatted, {
                rawValue, value: result, changed, expression: expr,
                formula: changed ? `${evalExpr} = ${result}` : undefined,
                bindings
            }) : formatted;
        });
    }

    function renderSkills(data, itemTable) {
        const basicTable = data.weaponbasictable || {};
        const skillIds = basicTable.weaponSkillList || [];
        const skillPatch = data.skillpatchtable || {};
        if (skillIds.length === 0) return '';

        let html = `<h3>${t('sections.skillData')}</h3><div class="ake-ui-card-grid" data-size="regular" data-columns="3">`;
        skillIds.forEach(skillId => {
            const skillData = skillPatch[skillId];
            if (!skillData || !skillData.SkillPatchDataBundle) return;
            const bundle = skillData.SkillPatchDataBundle;
            const skillName = bundle[0]?.skillName?.text || skillId;

            const levelRows = [];
            bundle.forEach(skill => {
                const bb = skill.blackboard || [];
                const valueMap = {};
                bb.forEach(b => { valueMap[b.key] = b.value; });
                const desc = skill.description?.text || '';
                let processed = replacePlaceholders(desc, valueMap);
                processed = parseText(processed);
                levelRows.push(`
                    <div class="skill-level-row">
                        <span class="skill-level">${t('levelAbbreviation', { level: skill.level })}</span>
                        <span class="skill-desc">${processed}</span>
                    </div>
                `);
            });

            html += `
                <div class="ake-ui-card" data-card-kind="weapon-skill" data-density="regular">
                    <div class="ake-ui-card__title">${escapeHtml(skillName)}</div>
                    <div class="ake-ui-card__body">${levelRows.join('')}</div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

    function renderBreakthrough(data, itemTable) {
        const btTable = data.weaponbreakthroughtemplatetable;
        if (!btTable) return '';

        const templateId = data.weaponbasictable?.breakthroughTemplateId;
        const btData = btTable[templateId];
        if (!btData || !btData.list) return '';

        let html = `<h3>${t('sections.breakthroughMaterials')}</h3><div class="ake-ui-card-grid" data-size="narrow">`;
        btData.list.forEach(bt => {
            const lv = bt.breakthroughShowLv;
            const gold = bt.breakthroughGold || 0;
            const items = bt.breakItemList || [];
            const bounds = bt.skillLevelBounds || [];

            let costsHtml = '';
            if (gold > 0) {
                costsHtml += `<div class="break-cost-row"><span class="bc-name">${t('gold')}</span><span class="bc-cnt">${gold.toLocaleString()}</span></div>`;
            }
            items.forEach(it => {
                if (it.count <= 0) return;
                const iData = itemTable[it.id];
                const iName = iData?.name?.text || it.id;
                const iIcon = iData?.iconId || it.id;
                costsHtml += `<div class="break-cost-row"><img src="/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${iIcon}.png"><span class="bc-name">${escapeHtml(iName)}</span><span class="bc-cnt">×${it.count}</span></div>`;
            });

            let boundsHtml = '';
            if (bounds.length > 0) {
                boundsHtml = '<div class="break-skill-bounds">';
                bounds.forEach((b, i) => {
                    boundsHtml += `<span>${t('skillLevelBounds', { skill: i + 1, lower: b.lowerBound, upper: b.upperBound })}</span>`;
                });
                boundsHtml += '</div>';
            }

            html += `
                <div class="ake-ui-card" data-card-kind="weapon-break" data-density="regular">
                    <div class="ake-ui-card__title">${t('breakthroughLevel', { level: lv === 0 ? t('initial') : lv })}</div>
                    <div class="ake-ui-card__body">${costsHtml}${boundsHtml}</div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

    function renderTalent(data) {
        const ttTable = data.weapontalenttemplatetable;
        if (!ttTable) return '';

        const templateId = data.weaponbasictable?.talentTemplateId;
        const ttData = ttTable[templateId];
        if (!ttData || !ttData.list) return '';

        let html = `<h3>${t('sections.potentials')}</h3><div class="ake-ui-card-grid" data-size="narrow">`;
        ttData.list.forEach(talent => {
            const lv = talent.talentLv;
            const bounds = talent.skillLevelExtraBounds || [];
            let infoHtml = '';
            bounds.forEach((b, i) => {
                if (b.upperBound > 0) {
                    infoHtml += `<div>${t('skillUpperBound', { skill: i + 1, upper: b.upperBound })}</div>`;
                }
            });
            html += `
                <div class="ake-ui-card" data-card-kind="weapon-talent" data-density="regular">
                    <div class="ake-ui-card__title">${t('potentialLevel', { level: lv })}</div>
                    <div class="ake-ui-card__body">${infoHtml || t('noExtraEffect')}</div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

    function renderAtkTable(data) {
        const upgradeTable = data.weaponupgradetemplatetable;
        if (!upgradeTable) return '';
        const templateId = data.weaponbasictable?.levelTemplateId;
        const upgradeData = upgradeTable[templateId];
        if (!upgradeData || !upgradeData.list) return '';

        const allRows = upgradeData.list.map(entry => {
            const level = window.renderRawValueTip ? window.renderRawValueTip(entry.weaponLv, entry.weaponLv) : entry.weaponLv;
            const atk = window.renderRawValueTip ? window.renderRawValueTip(entry.baseAtk, entry.baseAtk) : entry.baseAtk;
            return `<tr data-level="${entry.weaponLv}"><td>${level}</td><td>${atk}</td></tr>`;
        });

        let rowsToRender = allRows;
        if (weaponLevelsToShow && !showAllWeaponLevels) {
            const levelSet = new Set(weaponLevelsToShow);
            rowsToRender = allRows.filter(row => {
                const match = row.match(/data-level="(\d+)"/);
                return match && levelSet.has(parseInt(match[1], 10));
            });
            if (rowsToRender.length === 0 && weaponLevelsToShow.length > 0) {
                const maxLevel = Math.max(...weaponLevelsToShow);
                const found = allRows.find(r => r.includes(`data-level="${maxLevel}"`));
                if (found) rowsToRender = [found];
            }
        }

        const toggleHtml = weaponLevelsToShow ? `
            <div class="toggle-weapon-levels-container">
                <button class="toggle-weapon-levels-btn">${showAllWeaponLevels ? commonT('collapseExtraLevels') : commonT('expandAllLevels')}</button>
            </div>
        ` : '';

        return `
            <div class="detail-atk">
                <h3>${t('baseAttackRange', { max: upgradeData.list.length })}</h3>
                <div class="ake-ui-table-shell">
                    <table class="ake-ui-table">
                        <thead><tr><th>${commonT('level')}</th><th>${commonT('attack')}</th></tr></thead>
                        <tbody>${rowsToRender.join('')}</tbody>
                    </table>
                </div>
                ${toggleHtml}
            </div>
        `;
    }

    function renderDetail(data, weapon) {
        const basicTable = data.weaponbasictable || {};
        const itemTable = data.itemtable || {};
        const weaponItem = itemTable[weapon.weaponId] || {};

        const name = weaponItem.name?.text || weapon.name;
        const desc = weaponItem.desc?.text || '';
        const decoDesc = weaponItem.decoDesc?.text || '';
        const rarity = basicTable.rarity || weapon.rarity;
        const weaponType = basicTable.weaponType || weapon.weaponType;
        const weaponDesc = basicTable.weaponDesc?.text || '';
        const iconId = weaponItem.iconId || weapon.weaponId;
        const atkHtml = renderAtkTable(data);
        const skillHtml = renderSkills(data, itemTable);
        const breakHtml = renderBreakthrough(data, itemTable);
        const talentHtml = renderTalent(data);

        return `
            <article class="ake-ui-detail" data-detail-kind="weapon" data-accent="rarity" data-accent-value="${rarity}">
            <div class="ake-ui-detail-header" data-layout="showcase">
                <div class="ake-ui-detail-main">
                    <div class="ake-ui-detail-identity">
                        <div class="ake-ui-detail-icon">
                            <img src="/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${iconId}.png">
                        </div>
                        <div class="ake-ui-detail-copy">
                            <div class="ake-ui-detail-title-row">
                                <span class="ake-ui-detail-title">${escapeHtml(name)}</span>
                                <span class="ake-ui-badge" data-accent="rarity" data-accent-value="${rarity}" title="${commonT('rarityLabel', { rarity })}">${commonT('rarityLabel', { rarity })}</span>
                                <span class="ake-ui-detail-id">${escapeHtml(weapon.weaponId)}</span>
                            </div>
                            <div class="detail-desc">${escapeHtml(desc)}</div>
                            ${decoDesc ? `<div class="detail-deco">${escapeHtml(decoDesc)}</div>` : ''}
                        </div>
                    </div>
                    ${atkHtml}
                </div>
                <div class="ake-ui-detail-visual">
                    <div class="ake-ui-detail-visual-frame">
                        <img src="/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/gachaweapon/${iconId}.png">
                    </div>
                </div>
            </div>
            ${skillHtml}
            ${breakHtml}
            ${talentHtml}
            ${weaponDesc ? `<h3>${t('sections.story')}</h3><div class="weapon-desc">${parseText(weaponDesc)}</div>` : ''}
            </article>
        `;
    }

    async function loadWeaponDetail(weapon, container) {
        container.innerHTML = `<div class="ake-ui-state">${t('loading')}</div>`;
        try {
            const data = await (window.akeFetch || fetch)(weapon.contentFile).then(r => r.json());
            currentWeaponData = data;
            currentWeapon = weapon;
            container.innerHTML = renderDetail(data, weapon);
            window.AKEModuleOverview?.renderVersionDiff(container, data, data.__versionDiff?.baseline ? renderDetail(data.__versionDiff.baseline, weapon) : '');

            const toggleBtn = container.querySelector('.toggle-weapon-levels-btn');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', e => {
                    e.preventDefault();
                    showAllWeaponLevels = !showAllWeaponLevels;
                    const tbody = container.querySelector('.ake-ui-table tbody');
                    if (tbody && currentWeaponData) {
                        container.innerHTML = renderDetail(currentWeaponData, currentWeapon);
                        window.AKEModuleOverview?.renderVersionDiff(container, currentWeaponData, currentWeaponData.__versionDiff?.baseline ? renderDetail(currentWeaponData.__versionDiff.baseline, currentWeapon) : '');
                        const newBtn = container.querySelector('.toggle-weapon-levels-btn');
                        if (newBtn) newBtn.addEventListener('click', ev => {
                            ev.preventDefault();
                            showAllWeaponLevels = !showAllWeaponLevels;
                            loadWeaponDetail(currentWeapon, container);
                        });
                    }
                });
            }
        } catch (err) {
            const error = document.createElement('div');
            error.className = 'ake-ui-state';
            error.dataset.state = 'error';
            error.textContent = t('loadFailed', { message: err.message });
            container.replaceChildren(error);
        }
    }

    async function refreshModule() {
        const list = document.getElementById('v2wpnList');
        const detail = document.getElementById('v2wpnDetail');
        if (!list || !detail) return;
        const showHidden = getCurrentShowHidden();
        allWeapons = await loadWeaponManifest(showHidden);
        generateFilterButtons();
        renderWeaponList();
    }

    async function initModule() {
        if (isInitialized) return;
        isInitialized = true;
        if (window.configLoaded) await window.configLoaded;
        const settings = window.akeData?.getLevelSettings?.() || {};
        if (settings.enabled) {
            weaponLevelsToShow = parseLevelInput(settings.weaponLevels, 90);
        }

        window.addEventListener('globalConfigChanged', () => {
            searchTerm = '';
            const si = document.getElementById('v2wpnSearchInput');
            if (si) si.value = '';
            const settings = window.akeData?.getLevelSettings?.() || {};
            if (settings.enabled) {
                weaponLevelsToShow = parseLevelInput(settings.weaponLevels, 90);
            } else {
                weaponLevelsToShow = null;
            }
            showAllWeaponLevels = false;
            selectedRarities.clear();
            selectedTypes.clear();
            refreshModule();
        });

        document.getElementById('v2wpnSearchInput')?.addEventListener('input', e => {
            searchTerm = e.target.value;
            renderWeaponList();
        });

        await refreshModule();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();
