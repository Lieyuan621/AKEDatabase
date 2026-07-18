(function() {
        const t = window.akeI18n.scope('modules.enemy');
        const commonT = window.akeI18n.scope('common');
        let allEnemies = [];
        let rawAllEnemies = [];
        let activeEnemyId = null;
        let isInitialized = false;
        let enemyLevelsToShow = null;
        let variantExpandStates = {};
        let searchTerm = '';
        let currentEnemy = null;
        let currentEnemyData = null;
        let attrMap = {};
        let attrEnMap = {};
        let modifierTypeMap = {};

        const IMAGE_BASE_PATH = '/public/images/';
        const LEGACY_ELEMENT_RESISTANCE_ATTR_TYPES = Object.freeze([80, 81, 82, 83, 84, 85]);
        const ELEMENT_RESISTANCE_ATTR_TYPES = Object.freeze({
            physicalResistance: 94,
            naturalResistance: 95,
            crystResistance: 96,
            pulseResistance: 97,
            fireResistance: 98,
            etherResistance: 99
        });

        function getCurrentShowHidden() {
            return window.akeData?.getConfig().showHidden ?? false;
        }

        function parseText(text) {
            return window.parseText(text, IMAGE_BASE_PATH);
        }

        function parseLevelInput(input, maxLevel = 100) {
            if (!input || input.trim() === '') return [];
            const parts = input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= maxLevel);
            return parts.length ? parts : [maxLevel];
        }

        async function loadMaps() {
            try {
                const data = await window.akeLoadMaps();
                attrMap = data.ATTR_MAP || {};
                attrEnMap = data.ATTR_MAP_EN || {};
                modifierTypeMap = data.MODIFIER_TYPE_MAP || {};
            } catch (err) {
                console.error('加载映射数据失败:', err);
                attrMap = {};
                attrEnMap = {};
            }
        }

        function getAttrName(attrType) {
            return attrMap[attrType] || t('attributeFallback', { type: attrType });
        }

        function formatAttrModifiers(modifiers) {
            if (!Array.isArray(modifiers) || modifiers.length === 0) return '';
            const showHidden = getCurrentShowHidden();
            return modifiers.filter(m => !LEGACY_ELEMENT_RESISTANCE_ATTR_TYPES.includes(m.attrType)).map(m => {
                const name = getAttrName(m.attrType);
                const val = m.attrValue;
                const isMult = (m.modifierType === 1 || m.modifierType === 4 ||
                    m.modifierType === 6 || m.modifierType === 8);
                const displayVal = (m.modifierType === 4 || m.modifierType === 8) ? val - 1 : val;
                const displayRaw = (m.modifierType === 4 || m.modifierType === 8) ? displayVal : val;
                const displayText = `${displayVal > 0 ? '+' : ''}${(displayVal * 100).toFixed(1)}%`;
                const displayHtml = window.renderRawValueTip ? window.renderRawValueTip(displayText, displayRaw) : displayText;
                let text = isMult
                    ? `${name} ${displayHtml}`
                    : `${name} ${val > 0 ? '+' : ''}${val}`;
                if (showHidden) {
                    const modName = modifierTypeMap[String(m.modifierType)] || '';
                    if (modName) text += ` <span class="v2e-modifier-type-tag">${modName}</span>`;
                }
                return text;
            }).join(', ');
        }

        function computeVariantAttr(baseValue, modifiers, attrType) {
            return window.AKEStats.computeAttrWithModifiers(baseValue, modifiers, attrType);
        }

        function filterEnemiesBySearch(enemies) {
            if (!searchTerm) return enemies;
            const term = searchTerm.toLowerCase();
            return enemies.filter(e =>
                (e.name && e.name.toLowerCase().includes(term)) ||
                (e.templateId && e.templateId.toLowerCase().includes(term))
            );
        }

        async function loadEnemyManifest(showHidden) {
            try {
                const res = await (window.akeFetch || fetch)('/public/CH/v2_enemy/manifest.json');
                if (!res.ok) throw new Error('无法加载敌人清单');
                const all = await res.json();
                rawAllEnemies = all;
                let enemies = showHidden ? all : all.filter(e => !e.hidden);
                enemies.sort((a, b) => (a.priority || 999) - (b.priority || 999));
                return enemies;
            } catch (err) {
                console.error('加载敌人清单失败:', err);
                return [];
            }
        }

        function buildBaseAttrSnapshot(rawData, attrTemplateId) {
            const attrData = rawData.enemyattributetemplatetable?.[attrTemplateId] || {};
            const li = attrData.levelIndependentAttributes?.attrs || [];
            const m = {};
            li.forEach(a => { m[a.attrType] = a.attrValue; });

            return {
                executionDamageScalar: m[27],
                physicalDamageTakenScalar: m[4],
                fireDamageTakenScalar: m[5],
                electroDamageTakenScalar: m[6],
                coldDamageTakenScalar: m[7],
                naturalDamageTakenScalar: m[48],
                etherDamageTakenScalar: m[60],
                physicalResistance: m[ELEMENT_RESISTANCE_ATTR_TYPES.physicalResistance],
                naturalResistance: m[ELEMENT_RESISTANCE_ATTR_TYPES.naturalResistance],
                crystResistance: m[ELEMENT_RESISTANCE_ATTR_TYPES.crystResistance],
                pulseResistance: m[ELEMENT_RESISTANCE_ATTR_TYPES.pulseResistance],
                fireResistance: m[ELEMENT_RESISTANCE_ATTR_TYPES.fireResistance],
                etherResistance: m[ELEMENT_RESISTANCE_ATTR_TYPES.etherResistance],
                normalAttackRange: m[12],
                maxPoise: m[20],
                poiseRecTime: m[21],
                zeroPoiseSuperArmor: attrData.zeroPoiseSuperArmor,
                breakingAttackedAtbObtain: attrData.breakingAttackedAtbObtain,
                weight: m[8],
                attackValueAgainstTower: attrData.attackValueAgainstTower,
                initialSuperArmor: attrData.initialSuperArmor,
                maxResilience: attrData.maxResilience,
                pushedBackCoefficient: attrData.pushedBackCoefficient,
                resilienceDecreaseWhenHurt: attrData.resilienceDecreaseWhenHurt,
                resilienceFullRecoverTime: attrData.resilienceFullRecoverTime,
                resilienceRecover: attrData.resilienceRecover,
                resilienceRecoverInterval: attrData.resilienceRecoverInterval,
                superArmorWhenResilienceZero: attrData.superArmorWhenResilienceZero,
                criticalRate: m[9],
                criticalDamage: m[10],
                hatred: m[11],
                attackSpeed: m[15]
            };
        }

        function normalizeV2ToLegacy(baseInfo, rawData) {
            const displayInfo = rawData.enemytemplatedisplayinfotable || {};
            const attrTemplateId = baseInfo.templateId;
            const attrData = rawData.enemyattributetemplatetable?.[attrTemplateId] || {};
            const abilityDescs = rawData.enemyabilitydesctable || {};
            const displayType = rawData.displayenemytypetable?.name?.text || '';
            const distributionInfo = rawData.distributioninfotable || {};

            const skillDescs = [];
            (displayInfo.abilityDescIds || []).forEach(id => {
                const ability = abilityDescs[id];
                if (ability?.description?.text) skillDescs.push(ability.description.text);
            });

            const baseSnapshot = buildBaseAttrSnapshot(rawData, attrTemplateId);

            const legacy = {
                templateId: baseInfo.templateId,
                name: displayInfo.name?.text || baseInfo.name || rawData.name || '',
                icon: baseInfo.icon || '',
                iconbig: `/public/images/enemy/monstericonbig/${baseInfo.templateId}.png`,
                enemyTag: displayType,
                rarity: baseInfo.rarity || 1,
                description: displayInfo.description?.text || '',
                skillDescriptions: skillDescs,
                ...baseSnapshot,
                poiseKnotPct: attrData.poiseKnotPctList?.join(', '),
                poiseKnotBuffList: attrData.poiseKnotBuffList || [],
                distributionInfo: distributionInfo,
                baseSnapshot: baseSnapshot,
                variants: []
            };

            const enemyTable = rawData.enemytable || {};
            const attrTypeReverse = {};
            Object.entries(ELEMENT_RESISTANCE_ATTR_TYPES).forEach(([key, attrType]) => {
                attrTypeReverse[key] = attrType;
            });

            Object.keys(enemyTable).forEach(enemyId => {
                const entry = enemyTable[enemyId];
                const variantAttrTemplateId = entry.attrTemplateId || attrTemplateId;
                const variantAttrData = rawData.enemyattributetemplatetable?.[variantAttrTemplateId] || {};
                const levelDepAttrs = variantAttrData.levelDependentAttributes || [];

                const levels = [], hpArr = [], atkArr = [], defArr = [];
                const mods = entry.attrModifiers || [];
                levelDepAttrs.forEach(ld => {
                    const attrs = ld.attrs || [];
                    let lv = 0, hp = 0, atk = 0, def = 0;
                    attrs.forEach(a => {
                        if (a.attrType === 0) lv = a.attrValue;
                        if (a.attrType === 1) hp = a.attrValue;
                        if (a.attrType === 2) atk = a.attrValue;
                        if (a.attrType === 3) def = a.attrValue;
                    });
                    if (lv > 0) {
                        levels.push(lv);
                        hpArr.push(computeVariantAttr(hp, mods, 1));
                        atkArr.push(computeVariantAttr(atk, mods, 2));
                        defArr.push(computeVariantAttr(def, mods, 3));
                    }
                });

                const isBase = enemyId === attrTemplateId;

                const variantFullAttrs = buildBaseAttrSnapshot(rawData, variantAttrTemplateId);
                if (!isBase && mods.length > 0) {
                    Object.keys(variantFullAttrs).forEach(key => {
                        const at = attrTypeReverse[key];
                        if (at !== undefined && mods.some(m => m.attrType === at)) {
                            variantFullAttrs[key] = computeVariantAttr(variantFullAttrs[key], mods, at);
                        }
                    });
                }

                legacy.variants.push({
                    enemyId,
                    attrTemplateId: variantAttrTemplateId,
                    templateId: entry.templateId || baseInfo.templateId,
                    attrModifiers: mods,
                    attrModifiersStr: formatAttrModifiers(mods),
                    aiTemplateId: entry.aiTemplateId || '',
                    bornBuffs: entry.bornBuffs || [],
                    isDangerous: entry.isDangerous || false,
                    showBigEffect: entry.showBigEffect || false,
                    showBigHeadbar: entry.showBigHeadbar || false,
                    isBase,
                    levels, hp: hpArr, atk: atkArr, def: defArr,
                    fullAttrs: variantFullAttrs
                });
            });

            legacy.variants.sort((a, b) => (a.isBase ? 0 : 1) - (b.isBase ? 0 : 1));
            return legacy;
        }

        const META_FIELDS = [
            'initialSuperArmor', 'zeroPoiseSuperArmor', 'superArmorWhenResilienceZero',
            'executionDamageScalar', 'breakingAttackedAtbObtain', 'physicalDamageTakenScalar',
            'naturalDamageTakenScalar', 'coldDamageTakenScalar', 'electroDamageTakenScalar',
            'fireDamageTakenScalar', 'etherDamageTakenScalar', 'physicalResistance',
            'naturalResistance', 'crystResistance', 'pulseResistance', 'fireResistance',
            'etherResistance', 'normalAttackRange', 'maxPoise', 'poiseRecTime', 'poiseKnotPct',
            'weight', 'attackValueAgainstTower', 'maxResilience', 'pushedBackCoefficient',
            'resilienceDecreaseWhenHurt', 'resilienceFullRecoverTime', 'resilienceRecover',
            'resilienceRecoverInterval', 'criticalRate', 'criticalDamage', 'hatred', 'attackSpeed'
        ];

        function getMetaLabel(key) {
            const attrType = ELEMENT_RESISTANCE_ATTR_TYPES[key];
            return attrType === undefined ? t(`meta.${key}`) : getAttrName(attrType);
        }

        function renderMeta(data) {
            let html = '<div class="v2e-meta-grid">';
            META_FIELDS.forEach(key => {
                const val = data[key];
                if (val !== undefined && val !== null && val !== '') {
                    html += `<div class="v2e-meta-item"><span class="v2e-meta-label">${getMetaLabel(key)}</span><span class="v2e-meta-value">${val}</span></div>`;
                }
            });
            html += '</div>';
            return html;
        }

        function renderSkillDesc(arr) {
            if (!Array.isArray(arr) || arr.length === 0) return '';
            return `<div class="v2e-skill-list">${arr.map(s => `<div class="v2e-skill-item">${parseText(s)}</div>`).join('')}</div>`;
        }

        function renderDistributionTags(data) {
            const entries = Object.values(data.distributionInfo || {});
            if (!entries.length) return '';
            return entries.map(d => `<span class="v2e-dist-tag">${d.areaName?.text || d.distributionId}</span>`).join('');
        }

        function renderVariantDiff(variant, baseSnapshot) {
            const fa = variant.fullAttrs;
            if (!fa) return '';

            const items = [];
            META_FIELDS.forEach(key => {
                const bv = baseSnapshot[key];
                const nv = fa[key];
                if (bv === undefined && nv === undefined) return;
                if (bv === nv) return;
                if (typeof bv === 'number' && typeof nv === 'number' && Math.abs(bv - nv) < 0.0001) return;
                const d = (nv || 0) - (bv || 0);
                const sign = d > 0 ? '+' : '';
                const fmt = Number.isInteger(d) ? d : d.toFixed(2);
                const bvHtml = window.renderRawValueTip ? window.renderRawValueTip(bv ?? '-', bv) : (bv ?? '-');
                const nvHtml = window.renderRawValueTip ? window.renderRawValueTip(nv ?? '-', nv) : (nv ?? '-');
                const diffHtml = window.renderRawValueTip ? window.renderRawValueTip(sign + fmt, d) : sign + fmt;
                items.push(`<div class="v2e-diff-item"><span class="v2e-diff-label">${getMetaLabel(key)}:</span><span class="v2e-diff-val ${d < 0 ? 'neg' : ''}">${bvHtml} → ${nvHtml} (${diffHtml})</span></div>`);
            });

            if (!items.length) return '';
            return `<div class="v2e-diff"><strong>${t('variantDifference')}</strong>${items.join('')}</div>`;
        }

        function renderVariantTooltip(variant) {
            const fa = variant.fullAttrs;
            if (!fa) return '';
            const fields = META_FIELDS.filter(key => fa[key] !== undefined && fa[key] !== null);
            if (!fields.length) return '';
            const items = fields.map(key => {
                const val = fa[key];
                const valueHtml = window.renderRawValueTip ? window.renderRawValueTip(val, val) : val;
                return `<div class="v2e-tooltip-item"><span class="v2e-tooltip-label">${getMetaLabel(key)}</span><span class="v2e-tooltip-value">${valueHtml}</span></div>`;
            }).join('');
            return `<span class="v2e-variant-template"><span class="v2e-tag-id">${variant.attrTemplateId}</span><span class="v2e-tooltip"><div class="v2e-tooltip-grid">${items}</div></span></span>`;
        }

        function renderEnemyOverview(items, container) {
            const typeNames = { 0: t('enemyTypes.normal'), 1: t('enemyTypes.elite'), 2: t('enemyTypes.boss'), 3: t('enemyTypes.special'), 4: t('enemyTypes.dangerous') };
            window.AKEModuleOverview.render(container, {
                title: t('overview.title'), description: t('overview.description'),
                group: item => ({ id: String(item.displayType ?? 'unknown'), name: item.displayTypeName || typeNames[item.displayType] || t('enemyTypes.other'), order: -(item.rarity || 1) }),
                onReset: () => { activeEnemyId = null; },
                onSelect: item => { activeEnemyId = item.templateId; renderEnemyList(); },
                sidebarSelector: item => `.v2e-item[data-enemy-id="${CSS.escape(item.templateId)}"]`,
                items: items.slice().sort((a, b) => (b.rarity || 1) - (a.rarity || 1) || (a.priority || 999) - (b.priority || 999)).map(item => ({ ...item, id: item.templateId, image: item.icon, fallback: t('overview.fallback'),
                    tags: [t('overview.dangerLevel', { level: item.rarity || 1 }), item.variantCount ? t('overview.variantCount', { count: item.variantCount }) : ''] }))
            });
        }

        function renderEnemyList() {
            const container = document.getElementById('v2enemyList');
            const detailContainer = document.getElementById('v2enemyDetail');
            if (!container) return;

            const filtered = filterEnemiesBySearch(allEnemies);
            container.innerHTML = '';

            if (!filtered.length) {
                container.innerHTML = `<div class="v2e-loader">${t('noMatches')}</div>`;
                if (detailContainer) detailContainer.innerHTML = `<div class="v2e-loader">${t('select')}</div>`;
                activeEnemyId = null;
                return;
            }

            filtered.forEach((enemy, index) => {
                const item = document.createElement('div');
                item.className = `v2e-item ${enemy.templateId === activeEnemyId ? 'active' : (index === 0 && !activeEnemyId && !window.AKEModuleOverview?.isActive('enemy') ? 'active' : '')}`;
                item.dataset.enemyId = enemy.templateId;

                const rarityBar = document.createElement('span');
                rarityBar.className = `v2e-rarity-bar rarity-${enemy.rarity}`;
                rarityBar.title = commonT('rarityLabel', { rarity: enemy.rarity });

                const icon = document.createElement('img');
                icon.className = 'v2e-item-icon';
                icon.src = enemy.icon || '';
                icon.onerror = function() { this.onerror = null; this.src = ''; };

                const info = document.createElement('div');
                info.className = 'v2e-item-info';
                const nameDiv = document.createElement('div');
                nameDiv.className = 'v2e-item-name';
                nameDiv.textContent = enemy.name;
                const idDiv = document.createElement('div');
                idDiv.className = 'v2e-item-id';
                idDiv.textContent = enemy.templateId;
                info.appendChild(nameDiv);
                info.appendChild(idDiv);

                item.appendChild(rarityBar);
                item.appendChild(icon);
                item.appendChild(info);

                item.addEventListener('click', () => {
                    document.querySelectorAll('.v2e-item').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    activeEnemyId = enemy.templateId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_enemy', enemy.templateId);
                    loadEnemyDetail(enemy, detailContainer);
                });

                container.appendChild(item);
            });

            if (window.__deepLinkId) {
                const deepItem = filtered.find(c => c.templateId === window.__deepLinkId);
                if (deepItem) {
                    activeEnemyId = deepItem.templateId;
                } else {
                    const existsInRaw = rawAllEnemies.some(c => c.templateId === window.__deepLinkId);
                    if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                        window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                    }
                }
                window.__deepLinkId = null;
            }

            const activeExists = filtered.some(e => e.templateId === activeEnemyId);
            if (!activeExists && filtered.length > 0) {
                if (window.AKEModuleOverview?.isActive('enemy')) {
                    activeEnemyId = null;
                    renderEnemyOverview(filtered, detailContainer);
                    return;
                }
                activeEnemyId = filtered[0].templateId;
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_enemy', activeEnemyId);
                const firstItem = container.querySelector('.v2e-item');
                if (firstItem) firstItem.classList.add('active');
                loadEnemyDetail(filtered[0], detailContainer);
            } else if (activeExists) {
                const activeEnemy = filtered.find(e => e.templateId === activeEnemyId);
                if (activeEnemy) {
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_enemy', activeEnemyId);
                    const activeItem = container.querySelector(`.v2e-item[data-enemy-id="${activeEnemyId}"]`);
                    if (activeItem) activeItem.classList.add('active');
                    loadEnemyDetail(activeEnemy, detailContainer);
                }
            }
        }

        async function loadEnemyDetail(enemy, container) {
            container.innerHTML = `<div class="v2e-loader">${t('loading')}</div>`;
            try {
                const rawData = await (window.akeFetch || fetch)(enemy.contentFile).then(r => r.json());
                const data = normalizeV2ToLegacy(enemy, rawData);
                currentEnemyData = data;
                currentEnemy = enemy;

                variantExpandStates = {};
                data.variants.forEach((_, idx) => { variantExpandStates[idx] = false; });

                container.innerHTML = renderDetail(data, enemy);

                container.querySelectorAll('.v2e-toggle-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const vi = parseInt(btn.dataset.variant, 10);
                        if (isNaN(vi)) return;
                        variantExpandStates[vi] = !variantExpandStates[vi];
                        updateVariantTable(data.variants[vi], vi);
                        btn.textContent = variantExpandStates[vi] ? commonT('collapseExtraLevels') : commonT('expandAllLevels');
                    });
                });

                container.querySelectorAll('.v2e-variant-template').forEach(el => {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const tip = el.querySelector('.v2e-tooltip');
                        if (!tip) return;
                        const wasPinned = tip.classList.contains('pinned');
                        container.querySelectorAll('.v2e-tooltip.pinned').forEach(t => t.classList.remove('pinned'));
                        if (!wasPinned) tip.classList.add('pinned');
                    });
                });
            } catch (err) {
                container.textContent = '';
                const error = document.createElement('div');
                error.className = 'v2e-error';
                error.textContent = t('loadFailed', { message: err.message });
                container.appendChild(error);
            }
        }

        function buildVariantRows(variant) {
            const count = variant.levels.length;
            let allRows = '';
            for (let i = 0; i < count; i++) {
                const hpRaw = variant.hp[i];
                const atkRaw = variant.atk[i];
                const defRaw = variant.def[i];
                const hp = typeof hpRaw === 'number' ? (Number.isInteger(hpRaw) ? hpRaw : hpRaw.toFixed(2)) : hpRaw;
                const atk = typeof atkRaw === 'number' ? (Number.isInteger(atkRaw) ? atkRaw : atkRaw.toFixed(2)) : atkRaw;
                const def = typeof defRaw === 'number' ? (Number.isInteger(defRaw) ? defRaw : defRaw.toFixed(2)) : defRaw;
                const lvHtml = window.renderRawValueTip ? window.renderRawValueTip(variant.levels[i], variant.levels[i]) : variant.levels[i];
                const hpHtml = window.renderRawValueTip ? window.renderRawValueTip(hp, hpRaw) : hp;
                const atkHtml = window.renderRawValueTip ? window.renderRawValueTip(atk, atkRaw) : atk;
                const defHtml = window.renderRawValueTip ? window.renderRawValueTip(def, defRaw) : def;
                allRows += `<tr data-level="${variant.levels[i]}"><td>${lvHtml}</td><td>${hpHtml}</td><td>${atkHtml}</td><td>${defHtml}</td></tr>`;
            }
            return allRows;
        }

        function filterRows(allRows) {
            const showAll = false;
            let rowsToRender = allRows;
            if (enemyLevelsToShow) {
                const levelSet = new Set(enemyLevelsToShow);
                const rowArray = allRows.split('</tr>').filter(r => r.trim());
                const filteredRows = rowArray.filter(row => {
                    const match = row.match(/data-level="(\d+)"/);
                    return match && levelSet.has(parseInt(match[1], 10));
                });
                rowsToRender = filteredRows.join('</tr>') + (filteredRows.length ? '</tr>' : '');
            }
            if (!rowsToRender && enemyLevelsToShow && enemyLevelsToShow.length > 0) {
                const maxLevel = Math.max(...enemyLevelsToShow);
                const found = allRows.split('</tr>').find(r => r.includes(`data-level="${maxLevel}"`));
                rowsToRender = found ? found + '</tr>' : '';
            }
            return rowsToRender;
        }

        function updateVariantTable(variant, idx) {
            const container = document.querySelector(`.v2e-variant[data-variant-index="${idx}"] .v2e-table-wrap`);
            if (!container) return;

            const allRows = buildVariantRows(variant);
            const showAll = variantExpandStates[idx] || false;
            const rowsToRender = showAll ? allRows : filterRows(allRows);

            container.innerHTML = `
                <table class="v2e-table">
                    <thead><tr><th>${commonT('level')}</th><th>${t('columns.maxHp')}</th><th>${commonT('attack')}</th><th>${t('columns.defense')}</th></tr></thead>
                    <tbody>${rowsToRender}</tbody>
                </table>
            `;
        }

        function renderVariants(variants, baseSnapshot) {
            if (!variants.length) return `<p>${t('noVariants')}</p>`;
            return variants.map((variant, idx) => {
                if (!variant.levels.length) return '';

                const titleExtra = !variant.isBase ? renderVariantTooltip(variant) : '';
                const modifierHtml = variant.attrModifiersStr ? `<div class="v2e-variant-modifier">${variant.attrModifiersStr}</div>` : '';

                const buffHtml = variant.bornBuffs.length > 0 ? `<div class="v2e-buffs">${variant.bornBuffs.map(b => `<span class="v2e-buff-tag">${b}</span>`).join('')}</div>` : '';

                const flags = [];
                if (variant.isDangerous) flags.push(`<span class="v2e-flag danger">${t('flags.dangerous')}</span>`);
                if (variant.showBigEffect) flags.push(`<span class="v2e-flag big-effect">${t('flags.globalEffect')}</span>`);
                if (variant.showBigHeadbar) flags.push(`<span class="v2e-flag big-headbar">${t('flags.pinnedHealthBar')}</span>`);
                const flagsHtml = flags.length ? `<div class="v2e-flags">${flags.join('')}</div>` : '';

                const diffHtml = !variant.isBase ? renderVariantDiff(variant, baseSnapshot) : '';

                const allRows = buildVariantRows(variant);
                const showAll = variantExpandStates[idx] || false;
                const rowsToRender = showAll ? allRows : filterRows(allRows);

                const variantId = variant.enemyId || t('variantFallback', { number: idx + 1 });
                const toggleButton = enemyLevelsToShow ? `
                    <div style="text-align:right; margin-top:4px;">
                        <button class="v2e-toggle-btn" data-variant="${idx}">${showAll ? commonT('collapseExtraLevels') : commonT('expandAllLevels')}</button>
                    </div>
                ` : '';

                return `
                    <div class="v2e-variant" data-variant-index="${idx}">
                        <div class="v2e-variant-title">${variantId}${titleExtra}</div>
                        ${modifierHtml}
                        ${buffHtml}
                        ${flagsHtml}
                        ${diffHtml}
                        <div class="v2e-table-wrap">
                            <table class="v2e-table">
                                <thead><tr><th>${commonT('level')}</th><th>${t('columns.maxHp')}</th><th>${commonT('attack')}</th><th>${t('columns.defense')}</th></tr></thead>
                                <tbody>${rowsToRender}</tbody>
                            </table>
                        </div>
                        ${toggleButton}
                    </div>
                `;
            }).filter(Boolean).join('');
        }

        function renderDetail(data, enemy) {
            const rarity = data.rarity || enemy.rarity || 1;
            const headerHtml = `
                <div class="v2e-header">
                    <div class="v2e-header-left">
                        <div class="v2e-header-icon">
                            <img src="${data.icon || ''}" onerror="this.onerror=null; this.src='';">
                        </div>
                        <div class="v2e-header-text">
                            <div class="v2e-title-row">
                                <span class="v2e-name">${data.name}</span>
                                <span class="v2e-rarity-dot rarity-${rarity}" title="${commonT('rarityLabel', { rarity })}"></span>
                                <span class="v2e-id">${enemy.templateId}</span>
                            </div>
                            <div class="v2e-tags">
                                ${data.enemyTag ? `<span class="v2e-tag">${data.enemyTag}</span>` : ''}
                                ${renderDistributionTags(data)}
                            </div>
                            <div class="v2e-meta">${renderMeta(data)}</div>
                            ${data.description ? `<div class="v2e-desc">${parseText(data.description)}</div>` : ''}
                            ${data.skillDescriptions ? renderSkillDesc(data.skillDescriptions) : ''}
                        </div>
                    </div>
                    <div class="v2e-pic">
                        <img src="${data.iconbig || data.icon || ''}" onerror="this.onerror=null; this.src='';">
                    </div>
                </div>
            `;

            const poiseBuffHtml = data.poiseKnotBuffList.length > 0 ? `
                <div class="v2e-section">
                    <h3>${t('sections.poiseBreakBuffs')}</h3>
                    <div class="v2e-buffs">${data.poiseKnotBuffList.map(b => `<span class="v2e-buff-tag">${b}</span>`).join('')}</div>
                </div>
            ` : '';

            const variantsHtml = renderVariants(data.variants, data.baseSnapshot);

            return `
                ${headerHtml}
                ${poiseBuffHtml}
                <div class="v2e-section">
                    <h3>${t('sections.variantAttributes')}</h3>
                    ${variantsHtml}
                </div>
            `;
        }

        const mobileBtn = document.getElementById('v2enemyMobileListBtn');
        const mobileOverlay = document.getElementById('v2enemyMobileListOverlay');
        const mobileContent = document.getElementById('v2enemyMobileListContent');

        function buildMobileList() {
            const filtered = filterEnemiesBySearch(allEnemies);
            mobileContent.innerHTML = '';
            filtered.forEach(enemy => {
                const item = document.createElement('div');
                item.className = 'v2e-mobile-item';
                if (enemy.templateId === activeEnemyId) item.classList.add('active');
                item.innerHTML = `<div class="v2e-mobile-name">${enemy.name}</div><div class="v2e-mobile-id">${enemy.templateId}</div>`;
                item.addEventListener('click', () => {
                    activeEnemyId = enemy.templateId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_enemy', enemy.templateId);
                    loadEnemyDetail(enemy, document.getElementById('v2enemyDetail'));
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

        async function refreshModule() {
            const list = document.getElementById('v2enemyList');
            const detail = document.getElementById('v2enemyDetail');
            if (!list || !detail) return;
            const showHidden = getCurrentShowHidden();
            const enemies = await loadEnemyManifest(showHidden);
            allEnemies = enemies;
            renderEnemyList();
        }

        async function initModule() {
            if (isInitialized) return;
            isInitialized = true;
            if (window.configLoaded) await window.configLoaded;
            await loadMaps();

            const settings = window.akeData?.getLevelSettings?.() || {};
            if (settings.enabled) {
                enemyLevelsToShow = parseLevelInput(settings.enemyLevels, 100);
            }

            if (mobileBtn) mobileBtn.addEventListener('click', openMobileList);
            if (mobileOverlay) mobileOverlay.addEventListener('click', (e) => {
                if (e.target === mobileOverlay) closeMobileList();
            });

            document.addEventListener('click', () => {
                document.querySelectorAll('.v2e-tooltip.pinned').forEach(t => t.classList.remove('pinned'));
            });

            window.addEventListener('globalConfigChanged', () => {
                searchTerm = '';
                const si = document.getElementById('v2enemySearchInput');
                if (si) si.value = '';
                const s = window.akeData?.getLevelSettings?.() || {};
                enemyLevelsToShow = s.enabled ? parseLevelInput(s.enemyLevels, 100) : null;
                variantExpandStates = {};
                refreshModule();
            });

            document.getElementById('v2enemySearchInput')?.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                renderEnemyList();
            });

            await refreshModule();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initModule);
        } else {
            initModule();
        }
    })();
