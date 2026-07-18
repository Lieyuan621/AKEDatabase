(function() {
        const t = window.akeI18n.scope('modules.dungeon');
        const commonT = window.akeI18n.scope('common');
        let allSeries = [];
        let rawAllSeries = [];
        let activeSeriesId = null;
        let isInitialized = false;
        let searchTerm = '';
        let attrMap = {};
        let attrNameToId = {};
        let buffCache = {};
        let modifierTypeMap = {};

        const FORMULA_TO_MODTYPE = window.AKEStats.FORMULA_TO_MODTYPE;
        const LEGACY_ELEMENT_RESISTANCE_ATTR_TYPES = Object.freeze([80, 81, 82, 83, 84, 85]);

        const IMAGE_BASE_PATH = '/public/images/';

        const CATEGORY_MAP = {
            'dungeon_highdifficulty': 'highDifficulty',
            'dungeon_bossrush': 'bossRush',
            'dungeon_ss': 'protocolSpace',
            'dungeon_actmonster': 'eventCombat',
            'dungeon_challenge': 'challenge',
            'dungeon_resource': 'resource',
            'dungeon_weeklyraid': 'weeklyRaid',
            'dungeon_char': 'characterMission',
            'dungeon_chartutorial': 'characterTutorial',
            'dungeon_contract': 'contingencyContract',
            'dungeon_train': 'training',
            'dungeon_worldlevel': 'worldLevel',
            'dungeon_wuling_A': 'wulingA',
            'dungeon_wuling_B': 'wulingB',
            'dungeon_puzzle': 'mystery',
            'dungeon_roguelike': 'protocolDivergence'
        };

        function getCategoryLabel(category) {
            const key = CATEGORY_MAP[category];
            return key ? t(`categories.${key}`) : category;
        }

        function getCurrentShowHidden() {
            return window.akeData?.getConfig().showHidden ?? false;
        }

        function parseText(text) {
            return window.parseText(text, IMAGE_BASE_PATH);
        }

        async function loadMaps() {
            try {
                const data = await window.akeLoadMaps();
                attrMap = data.ATTR_MAP || {};
                const attrEn = data.ATTR_MAP_EN || {};
                Object.entries(attrEn).forEach(([id, name]) => { attrNameToId[name] = parseInt(id, 10); });
                modifierTypeMap = data.MODIFIER_TYPE_MAP || {};
            } catch (err) {
                console.error('加载映射数据失败:', err);
                attrMap = {};
                attrNameToId = {};
            }
        }

        async function loadBuff(buffId) {
            if (buffCache[buffId] !== undefined) return buffCache[buffId];
            try {
                const res = await (window.akeFetch || fetch)(`/public/Json/BuffData/${buffId}.json`);
                if (!res.ok) { buffCache[buffId] = null; return null; }
                buffCache[buffId] = await res.json();
                return buffCache[buffId];
            } catch { buffCache[buffId] = null; return null; }
        }

        async function loadAllBuffs(buffIds) {
            await Promise.all(buffIds.filter(id => buffCache[id] === undefined).map(id => loadBuff(id)));
        }

        function collectBuffIds(data) {
            const ids = new Set();
            Object.values(data.dungeontable || {}).forEach(dg => {
                Object.values(dg.enemyTable || {}).forEach(e => (e.bornBuffs || []).forEach(id => ids.add(id)));
                Object.values(dg.SpawnerConfig || {}).forEach(sc => {
                    (sc.enemyLibrary || []).forEach(lib => (lib.bornBuffList || []).forEach(b => ids.add(b.buffId)));
                });
            });
            return Array.from(ids);
        }

        function getBuffModifiers(buffId, blackboardOverrides) {
            const buff = buffCache[buffId];
            if (!buff?.attributeModifier?.attributeModifiers?.length) return [];
            const bb = {};
            (buff.blackboard || []).forEach(b => { bb[b.key] = b.valueDouble; });
            (blackboardOverrides || []).forEach(b => { bb[b.key] = b.valueFloat ?? b.valueDouble ?? 0; });
            return buff.attributeModifier.attributeModifiers.map(mod => {
                const attrType = attrNameToId[mod.attributeType];
                if (attrType === undefined) return null;
                const mt = FORMULA_TO_MODTYPE[mod.formulaItem];
                if (mt === undefined) return null;
                let val;
                if (mod.param.useBlackboardKey && mod.param.blackboardKey) {
                    val = bb[mod.param.blackboardKey] ?? mod.param.value;
                } else { val = mod.param.value; }
                return { attrType, attrValue: val, modifierType: mt };
            }).filter(Boolean);
        }

        function findTemplateId(instanceId, table) {
            if (table[instanceId]) return instanceId;
            let best = '';
            Object.keys(table).forEach(k => {
                if (instanceId.startsWith(k) && k.length > best.length) best = k;
            });
            return best || instanceId;
        }

        function escH(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

        function renderSpawnMap(spawner) {
            const waves = spawner.waves;
            if (!waves || !waves.length) return '';

            let allX = [], allZ = [];
            waves.forEach(w => {
                (w.groups || []).forEach(g => {
                    g.spawns.forEach(s => { allX.push(s.position.x); allZ.push(s.position.z); });
                });
            });
            if (!allX.length) return '';
            const pad = 2;
            const halfX = Math.max(Math.abs(Math.min(...allX)), Math.abs(Math.max(...allX))) + pad;
            const halfZ = Math.max(Math.abs(Math.min(...allZ)), Math.abs(Math.max(...allZ))) + pad;
            const minX = -halfX, maxX = halfX, minZ = -halfZ, maxZ = halfZ;
            const rangeX = maxX - minX || 1, rangeZ = maxZ - minZ || 1;
            function toPct(x, z) { return { left: ((x - minX) / rangeX * 100).toFixed(1), top: ((maxZ - z) / rangeZ * 100).toFixed(1) }; }

            let mapSpotsHtml = '';
            waves.forEach((w, wi) => {
                const vis = wi === 0 ? '' : 'display:none;';
                const allSpawns = [];
                (w.groups || []).forEach(g => {
                    const modeKey = { 'Parallel': 'parallel', 'Sequence': 'sequence', 'PartKilled': 'partKilled', 'AllKilled': 'allKilled', 'Deadline': 'deadline' }[g.groupMode];
                    const modeLabel = modeKey ? t(`spawnModes.${modeKey}`) : g.groupMode;
                    let conditionText = '', targetGroupKey = '';
                    if (g.groupMode === 'PartKilled' && g.groupModeTargetKey) { conditionText = t('spawnConditions.partKilled', { group: g.groupModeTargetKey, count: g.groupModeKillCount }); targetGroupKey = g.groupModeTargetKey; }
                    else if (g.groupMode === 'AllKilled' && g.groupModeTargetKey) { conditionText = t('spawnConditions.allKilled', { group: g.groupModeTargetKey }); targetGroupKey = g.groupModeTargetKey; }
                    g.spawns.forEach(spawn => { allSpawns.push({ spawn, group: g, modeLabel, conditionText, targetGroupKey }); });
                });
                const posCount = {};
                allSpawns.forEach(item => {
                    const key = `${item.spawn.position.x.toFixed(1)},${item.spawn.position.z.toFixed(1)}`;
                    if (!posCount[key]) posCount[key] = 0;
                    item.stackIdx = posCount[key];
                    posCount[key]++;
                });
                allSpawns.forEach(item => {
                    const { spawn, group: g, modeLabel, conditionText, targetGroupKey, stackIdx } = item;
                    const pct = toPct(spawn.position.x, spawn.position.z);
                    const posStr = `(${spawn.position.x.toFixed(1)}, ${spawn.position.z.toFixed(1)})`;
                    const randomStr = spawn.randomizeRadius > 0 ? t('spawn.randomRadius', { radius: spawn.randomizeRadius.toFixed(1) }) : '';
                    const delayStr = spawn.timestamp > 0 ? t('spawn.delay', { seconds: spawn.timestamp.toFixed(1) }) : '';
                    const intervalStr = spawn.spawnInterval > 0 ? t('spawn.interval', { seconds: spawn.spawnInterval.toFixed(1) }) : '';
                    const warnStr = spawn.preWarnTime > 0 ? t('spawn.preWarning', { seconds: spawn.preWarnTime.toFixed(1) }) : '';
                    const faceStr = spawn.faceMainCharacter ? t('spawn.faceMainCharacter') : '';
                    const tipLines = [
                        `<b>${escH(spawn.name)} ×${spawn.count} Lv.${spawn.level}</b>`,
                        t('spawn.coordinates', { position: posStr, radius: randomStr }),
                        t('spawn.groupMode', { group: g.groupKey, mode: modeLabel, condition: conditionText ? ` · ${conditionText}` : '' }),
                        [delayStr, intervalStr, warnStr, faceStr].filter(Boolean).join(' · ')
                    ].filter(Boolean);
                    const offsetPct = (0.3 * 100 / (2 * halfX)).toFixed(2);
                    const stackStyle = stackIdx > 0 ? `margin-left:${stackIdx * offsetPct}%;margin-top:-${stackIdx * offsetPct}%;z-index:${10 - stackIdx};` : 'z-index:10;';
                    mapSpotsHtml += `<div class="v2d-map-spot" data-wave="${wi}" data-group="${g.groupKey}" data-target-group="${targetGroupKey}" style="left:${pct.left}%;top:${pct.top}%;${vis}${stackStyle}">
                        <img class="v2d-map-spot-icon" src="/public/images/enemy/monstericonbig/${spawn.templateId}.png" onerror="this.style.display='none'">
                        <div class="v2d-map-tip">${tipLines.map(l => `<div>${l}</div>`).join('')}</div>
                    </div>`;
                });
            });

            const coordInfo = `<div class="v2d-map-coords">X: ${minX.toFixed(0)} ~ ${maxX.toFixed(0)}  Z: ${minZ.toFixed(0)} ~ ${maxZ.toFixed(0)}</div>`;
            const unitPct = (100 / (2 * halfX)).toFixed(2);
            return `<div class="v2d-spawn-map-container"><div class="v2d-spawn-map" style="--unit:${unitPct}%"><div class="v2d-map-center"></div>${mapSpotsHtml}</div>${coordInfo}</div>`;
        }

        function parseDungeonWaves(dungeon) {
            const sc = dungeon.SpawnerConfig;
            if (!sc || Object.keys(sc).length === 0) return null;
            const enemyTable = dungeon.enemyTable || {};
            const displayTable = dungeon.enemyTemplateDisplayInfoTable || {};
            const attrTable = dungeon.enemyAttributeTemplateTable || {};
            const dungeonLv = dungeon.recommendLv || 0;
            const allSpawners = [];
            Object.entries(sc).forEach(([configId, spawner]) => {
                const libMap = {};
                const libLevels = new Set();
                (spawner.enemyLibrary || []).forEach(lib => {
                    libMap[lib.key] = lib;
                    libLevels.add(lib.enemyLevel);
                });
                if (libLevels.size === 1 && libLevels.has(0)) return;
                if (dungeonLv > 0 && !libLevels.has(dungeonLv)) return;
                if (!Object.keys(libMap).length) return;
                const waves = [];
                Object.entries(spawner.waveMap || {}).forEach(([waveIdx, wave]) => {
                    const enemies = [];
                    const groups = [];
                    let maxAlive = 0;
                    let hasPause = false;
                    Object.entries(wave.groupMap || {}).forEach(([mapIdx, group]) => {
                        const groupInfo = {
                            groupKey: group.groupKey || mapIdx,
                            groupId: group.groupId,
                            groupMode: group.groupMode || 'Sequence',
                            groupModeTargetKey: group.groupModeTargetKey || '',
                            groupModeKillCount: group.groupModeKillCount || 0,
                            maxCount: (group.limitGroupMaxCount && group.groupMaxCount > 0) ? group.groupMaxCount : 0,
                            timestamp: group.timestamp || 0,
                            spawns: []
                        };
                        if (groupInfo.maxCount > 0) maxAlive += groupInfo.maxCount;
                        Object.values(group.actionMap || {}).forEach(action => {
                            if (action.$type && action.$type.includes('Pause')) { hasPause = true; return; }
                            if (!action.libraryKey) return;
                            const lib = libMap[action.libraryKey];
                            if (!lib) return;
                            const eid = lib.enemyId;
                            const cfg = enemyTable[eid] || {};
                            const templateId = cfg.templateId || findTemplateId(eid, displayTable);
                            const attrTemplateId = cfg.attrTemplateId || findTemplateId(eid, attrTable);
                            const disp = displayTable[templateId] || {};
                            const name = disp.name?.text || templateId;
                            const count = action.spawnCount || 1;
                            groupInfo.spawns.push({
                                instanceId: eid, templateId, attrTemplateId, name, count,
                                level: lib.enemyLevel, bornBuffList: lib.bornBuffList || [],
                                timestamp: action.timestamp || 0,
                                spawnInterval: action.spawnInterval || 0,
                                position: action.position || { x: 0, y: 0, z: 0 },
                                faceMainCharacter: action.faceMainCharacter ?? true,
                                randomizeRadius: action.randomizeRadius || 0,
                                routeId: action.routeId ?? null,
                                preWarnTime: lib.preWarnTime || 0
                            });
                            enemies.push(groupInfo.spawns[groupInfo.spawns.length - 1]);
                        });
                        if (groupInfo.spawns.length > 0) groups.push(groupInfo);
                    });
                    if (enemies.length > 0) {
                        waves.push({
                            waveIdx,
                            waveMode: wave.waveMode || 'Parallel',
                            repeatable: wave.repeatable || false,
                            maxAlive,
                            hasPause,
                            enemies,
                            groups
                        });
                    }
                });
                if (waves.length > 0) allSpawners.push({ configId, waves });
            });
            return allSpawners.length > 0 ? allSpawners : null;
        }

        function getAttrName(attrType) {
            return attrMap[attrType] || t('attributeFallback', { type: attrType });
        }

        function computeAttrWithModifiers(baseValue, modifiers, attrType) {
            return window.AKEStats.computeAttrWithModifiers(baseValue, modifiers, attrType);
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
                    if (modName) text += ` <span class="v2d-modifier-type-tag">${modName}</span>`;
                }
                return text;
            }).join(', ');
        }

        function formatValue(val) {
            if (typeof val !== 'number') return val;
            let display;
            if (Math.abs(val) < 1 && val !== 0) {
                display = (val * 100).toFixed(1) + '%';
                return window.renderRawValueTip ? window.renderRawValueTip(display, val) : display;
            }
            display = Number.isInteger(val) ? val.toString() : val.toFixed(2);
            return window.renderRawValueTip ? window.renderRawValueTip(display, val) : display;
        }

        function filterSeriesBySearch(series) {
            if (!searchTerm) return series;
            const term = searchTerm.toLowerCase();
            return series.filter(s =>
                (s.name && s.name.toLowerCase().includes(term)) ||
                (s.templateId && s.templateId.toLowerCase().includes(term))
            );
        }

        const mobileBtn = document.getElementById('v2dungeonMobileListBtn');
        const mobileOverlay = document.getElementById('v2dungeonMobileListOverlay');
        const mobileContent = document.getElementById('v2dungeonMobileListContent');

        function buildMobileList() {
            const filtered = filterSeriesBySearch(allSeries);
            mobileContent.innerHTML = '';
            filtered.forEach(series => {
                const item = document.createElement('div');
                item.className = 'v2d-mobile-item';
                if (series.templateId === activeSeriesId) item.classList.add('active');
                item.innerHTML = `
                    <div class="v2d-mobile-name">${series.name}</div>
                    <div class="v2d-mobile-id">${series.templateId}</div>
                `;
                item.addEventListener('click', () => {
                    activeSeriesId = series.templateId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_dungeon', series.templateId);
                    loadSeriesDetail(series, document.getElementById('v2dungeonDetail'));
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

        async function loadSeriesManifest(showHidden) {
            try {
                const res = await (window.akeFetch || fetch)('/public/CH/v2_dungeon/manifest.json');
                if (!res.ok) throw new Error('无法加载副本系列清单');
                const all = await res.json();
                rawAllSeries = all;
                let series = showHidden ? all : all.filter(s => !s.hidden);
                series.sort((a, b) => (a.priority || 999) - (b.priority || 999));
                return series;
            } catch (err) {
                console.error('加载副本系列清单失败:', err);
                return [];
            }
        }

        function renderDungeonOverview(items, container) {
            window.AKEModuleOverview.render(container, {
                title: t('overview.title'), description: t('overview.description'),
                group: item => ({ id: item.gameCategory || 'other', name: item.gameCategoryName || t('categories.other'), order: item.categoryOrder }),
                onReset: () => { activeSeriesId = null; },
                onSelect: item => { activeSeriesId = item.templateId; renderSeriesList(); },
                sidebarSelector: item => `.v2d-item[data-series-id="${CSS.escape(item.templateId)}"]`,
                items: items.map(item => ({ ...item, id: item.templateId, image: item.image, fallback: t('overview.fallback'),
                    tags: [t('overview.stageCount', { count: item.dungeonCount || 0 }), commonT('rarityLabel', { rarity: item.rarity || 1 })] }))
            });
        }

        function renderSeriesList() {
            const container = document.getElementById('v2dungeonList');
            const detailContainer = document.getElementById('v2dungeonDetail');
            if (!container) return;

            const filtered = filterSeriesBySearch(allSeries);
            container.innerHTML = '';

            if (filtered.length === 0) {
                container.innerHTML = `<div class="v2d-loader">${t('noMatches')}</div>`;
                if (detailContainer) detailContainer.innerHTML = `<div class="v2d-loader">${t('select')}</div>`;
                activeSeriesId = null;
                return;
            }

            filtered.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = `v2d-item ${item.templateId === activeSeriesId ? 'active' : (index === 0 && !activeSeriesId && !window.AKEModuleOverview?.isActive('dungeon') ? 'active' : '')}`;
                div.dataset.seriesId = item.templateId;

                const rarityBar = document.createElement('span');
                rarityBar.className = `v2d-rarity-bar rarity-${item.rarity || 1}`;
                rarityBar.title = commonT('rarityLabel', { rarity: item.rarity || 1 });

                const infoDiv = document.createElement('div');
                infoDiv.className = 'v2d-item-info';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'v2d-item-name';
                nameDiv.textContent = item.name;

                const idDiv = document.createElement('div');
                idDiv.className = 'v2d-item-id';
                idDiv.textContent = item.templateId;

                infoDiv.appendChild(nameDiv);
                infoDiv.appendChild(idDiv);
                div.appendChild(rarityBar);
                div.appendChild(infoDiv);

                div.addEventListener('click', () => {
                    document.querySelectorAll('.v2d-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                    activeSeriesId = item.templateId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_dungeon', item.templateId);
                    loadSeriesDetail(item, detailContainer);
                });

                container.appendChild(div);
            });

            if (window.__deepLinkId) {
                const deepItem = filtered.find(c => c.templateId === window.__deepLinkId);
                if (deepItem) {
                    activeSeriesId = deepItem.templateId;
                } else {
                    const existsInRaw = rawAllSeries.some(c => c.templateId === window.__deepLinkId);
                    if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                        window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                    }
                }
                window.__deepLinkId = null;
            }

            const activeExists = filtered.some(s => s.templateId === activeSeriesId);
            if (!activeExists && filtered.length > 0) {
                if (window.AKEModuleOverview?.isActive('dungeon')) {
                    activeSeriesId = null;
                    renderDungeonOverview(filtered, detailContainer);
                    return;
                }
                activeSeriesId = filtered[0].templateId;
                const firstItem = container.querySelector('.v2d-item');
                if (firstItem) firstItem.classList.add('active');
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_dungeon', activeSeriesId);
                loadSeriesDetail(filtered[0], detailContainer);
            } else if (activeExists) {
                const activeItem = filtered.find(s => s.templateId === activeSeriesId);
                if (activeItem) {
                    const activeDiv = container.querySelector(`.v2d-item[data-series-id="${activeSeriesId}"]`);
                    if (activeDiv) activeDiv.classList.add('active');
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_dungeon', activeSeriesId);
                    loadSeriesDetail(activeItem, detailContainer);
                }
            }
        }

        async function loadSeriesDetail(seriesItem, container) {
            container.innerHTML = `<div class="v2d-loader">${t('loading')}</div>`;
            try {
                const data = await (window.akeFetch || fetch)(seriesItem.contentFile).then(r => r.json());
                const buffIds = collectBuffIds(data);
                if (buffIds.length > 0) await loadAllBuffs(buffIds);
                container.innerHTML = renderDetail(data, seriesItem);
            } catch (err) {
                container.innerHTML = `<div class="v2d-error">${t('loadFailed', { message: err.message })}</div>`;
            }
        }

        function renderRewards(rewardId, rewardTable, itemTable) {
            if (!rewardId || !rewardTable) return '';
            const reward = rewardTable[rewardId];
            if (!reward || !reward.itemBundles || reward.itemBundles.length === 0) return '';

            return reward.itemBundles.map(bundle => {
                const item = itemTable?.[bundle.id];
                const name = item?.name?.text || bundle.id;
                const rarity = item?.rarity || 0;
                const iconId = item?.iconId || '';
                const iconSrc = iconId ? `/public/images/item/itemiconbig/${iconId}.png` : '';
                const iconHtml = iconSrc ? `<img class="v2d-reward-icon" src="${iconSrc}" onerror="this.style.display='none'">` : '';
                const rarityDot = rarity > 0 ? `<span class="v2d-reward-rarity r-${rarity}"></span>` : '';
                return `<span class="v2d-reward-item">${iconHtml}${rarityDot}${name} ×${bundle.count}</span>`;
            }).join('');
        }

        function getEnemyStatsAtLevel(attrTemplateData, enemyLevel, modifiers) {
            return window.AKEStats.getEnemyStatsAtLevel(attrTemplateData, enemyLevel, modifiers, {
                getAttrName,
                includeModifierOnlyAttrs: true,
                excludeAttrTypes: LEGACY_ELEMENT_RESISTANCE_ATTR_TYPES
            });
        }

        function renderEnemyCard(enemyId, enemyLevel, dungeonData, libraryBuffs) {
            const enemyConfig = dungeonData.enemyTable?.[enemyId] || {};
            const displayTable = dungeonData.enemyTemplateDisplayInfoTable || {};
            const attrTable = dungeonData.enemyAttributeTemplateTable || {};
            const templateId = enemyConfig.templateId || findTemplateId(enemyId, displayTable);
            const attrTemplateId = enemyConfig.attrTemplateId || findTemplateId(enemyId, attrTable);
            const displayInfo = displayTable[templateId] || {};
            const attrData = attrTable[attrTemplateId] || {};

            const name = displayInfo.name?.text || templateId;
            const nickname = displayInfo.nickname?.text || '';
            const desc = displayInfo.description?.text || '';
            const inlineModifiers = enemyConfig.attrModifiers || [];
            const iconSrc = `/public/images/enemy/monstericonbig/${templateId}.png`;

            const ownBuffs = enemyConfig.bornBuffs || [];
            const libBuffs = libraryBuffs || [];
            const buffModifiers = [];
            ownBuffs.forEach(id => buffModifiers.push(...getBuffModifiers(id, [])));
            libBuffs.forEach(b => buffModifiers.push(...getBuffModifiers(b.buffId, b.blackboard)));
            const allModifiers = [...inlineModifiers, ...buffModifiers];

            const flags = [];
            if (enemyConfig.isDangerous) flags.push(`<span class="v2d-enemy-flag danger">${t('flags.dangerous')}</span>`);
            if (enemyConfig.showBigEffect) flags.push(`<span class="v2d-enemy-flag big-effect">${t('flags.globalEffect')}</span>`);
            if (enemyConfig.showBigHeadbar) flags.push(`<span class="v2d-enemy-flag big-headbar">${t('flags.pinnedHealthBar')}</span>`);
            const flagsHtml = flags.length ? `<div class="v2d-enemy-flags">${flags.join('')}</div>` : '';

            const modifierStr = formatAttrModifiers(inlineModifiers);
            const modifierHtml = modifierStr ? `<div class="v2d-enemy-modifier">${modifierStr}</div>` : '';

            const allBuffIds = [...new Set([...ownBuffs, ...libBuffs.map(b => b.buffId)])];
            const buffBbMap = {};
            libBuffs.forEach(b => {
                if (!buffBbMap[b.buffId]) buffBbMap[b.buffId] = [];
                (b.blackboard || []).forEach(bb => {
                    if (!buffBbMap[b.buffId].find(x => x.key === bb.key)) buffBbMap[b.buffId].push(bb);
                });
            });
            const buffTagsHtml = allBuffIds.length > 0 ?
                `<div class="v2d-enemy-buffs">${allBuffIds.map(id => {
                    const bb = buffBbMap[id] || [];
                    const buff = buffCache[id];
                    const attrMods = buff?.attributeModifier?.attributeModifiers || [];
                    const rows = [];
                    attrMods.forEach(mod => {
                        const attrType = attrNameToId[mod.attributeType];
                        if (LEGACY_ELEMENT_RESISTANCE_ATTR_TYPES.includes(attrType)) return;
                        const label = attrType === undefined ? mod.attributeType : getAttrName(attrType);
                        const formula = mod.formulaItem;
                        let val;
                        if (mod.param.useBlackboardKey && mod.param.blackboardKey) {
                            const bbEntry = bb.find(b => b.key === mod.param.blackboardKey);
                            val = bbEntry ? (bbEntry.valueFloat ?? bbEntry.valueDouble ?? 0) : mod.param.value;
                        } else { val = mod.param.value; }
                        const pctTypes = ['Multiplier', 'FinalMultiplier', 'BaseMultiplier', 'BaseFinalMultiplier'];
                        const directMultiplierTypes = ['FinalMultiplier', 'BaseFinalMultiplier'];
                        const displayVal = directMultiplierTypes.includes(formula) ? val - 1 : val;
                        const display = pctTypes.includes(formula) ? `${(displayVal * 100).toFixed(0)}%` : val;
                        const valueHtml = window.renderRawValueTip ? window.renderRawValueTip(display, val, mod.param.blackboardKey || label) : display;
                        rows.push(`${escH(label)} ${escH(formula)} ${valueHtml}`);
                    });
                    bb.forEach(b => {
                        if (!attrMods.find(m => m.param.useBlackboardKey && m.param.blackboardKey === b.key)) {
                            const rawVal = b.valueFloat ?? b.valueDouble ?? 0;
                            const valueHtml = window.renderRawValueTip ? window.renderRawValueTip(rawVal, rawVal, b.key) : rawVal;
                            rows.push(`${escH(b.key)}: ${valueHtml}`);
                        }
                    });
                    if (rows.length === 0) return `<span class="v2d-buff-tag">${id}</span>`;
                    const tipHtml = rows.map(r => `<div>${r}</div>`).join('');
                    return `<span class="v2d-buff-tag v2d-has-tip">${id}<span class="v2d-buff-tip">${tipHtml}</span></span>`;
                }).join('')}</div>` : '';

            const stats = getEnemyStatsAtLevel(attrData, enemyLevel, allModifiers);
            let statsHtml = '';
            if (stats && Object.keys(stats).length > 0) {
                statsHtml = '<div class="v2d-attr-grid">';
                Object.entries(stats).forEach(([key, val]) => {
                    statsHtml += `<div class="v2d-attr-item"><span class="v2d-attr-key">${key}</span><span class="v2d-attr-val">${formatValue(val)}</span></div>`;
                });
                statsHtml += '</div>';
            }

            return `
                <div class="v2d-enemy-card">
                    <div class="v2d-enemy-header">
                        <img class="v2d-enemy-icon" src="${iconSrc}" onerror="this.onerror=null; this.src='';">
                        <div class="v2d-enemy-title">
                            <span class="v2d-enemy-name">${name}</span>
                            ${nickname && nickname !== name ? `<span class="v2d-enemy-nick">${nickname}</span>` : ''}
                        </div>
                        <span class="v2d-enemy-level">Lv.${enemyLevel}</span>
                    </div>
                    ${desc ? `<div class="v2d-enemy-desc">${parseText(desc)}</div>` : ''}
                    ${modifierHtml}
                    ${buffTagsHtml}
                    ${flagsHtml}
                    ${statsHtml}
                </div>
            `;
        }

        function renderDungeonCard(dungeonId, dungeon) {
            const name = dungeon.dungeonName?.text || dungeonId;
            const level = dungeon.dungeonLevelDesc?.text || '';
            const desc = dungeon.dungeonDesc?.text ? parseText(dungeon.dungeonDesc.text) : '';
            const featureDesc = dungeon.featureDesc?.text ? parseText(dungeon.featureDesc.text) : '';
            const costStamina = dungeon.costStamina !== undefined ? dungeon.costStamina : 0;
            const recommendLv = dungeon.recommendLv || '?';
            const dungeonCategory = dungeon.dungeonCategory || '';
            const categoryLabel = getCategoryLabel(dungeonCategory);
            const picPath = dungeon.dungeonPicPath || '';
            const dungeonImg = dungeon.dungeonImg || '';

            const mainGoal = dungeon.mainGoalDesc?.text || '';
            const extraGoal = dungeon.extraGoalDesc?.text || '';
            let goalsHtml = '';
            if (mainGoal) goalsHtml += `<div><strong>${t('goals.main')}</strong>${parseText(mainGoal)}</div>`;
            if (extraGoal) goalsHtml += `<div><strong>${t('goals.extra')}</strong>${parseText(extraGoal)}</div>`;
            if (goalsHtml) goalsHtml = `<div class="v2d-card-goal">${goalsHtml}</div>`;

            const rewardTable = dungeon.rewardTable || {};
            const itemTable = dungeon.itemTable || {};
            const fixedRewards = renderRewards(dungeon.rewardId, rewardTable, itemTable);
            const firstRewards = renderRewards(dungeon.firstPassRewardId, rewardTable, itemTable);

            let rewardsHtml = '';
            if (fixedRewards || firstRewards) {
                rewardsHtml = `<div class="v2d-rewards">
                    ${fixedRewards ? `<div class="v2d-rewards-block"><span class="v2d-rewards-title">${t('rewards.fixed')}</span><div class="v2d-rewards-content">${fixedRewards}</div></div>` : ''}
                    ${firstRewards ? `<div class="v2d-rewards-block"><span class="v2d-rewards-title">${t('rewards.firstClear')}</span><div class="v2d-rewards-content">${firstRewards}</div></div>` : ''}
                </div>`;
            }

            const waveSpawners = parseDungeonWaves(dungeon);

            let waveSummaryHtml = '';
            let enemiesHtml = '';

            if (waveSpawners) {
                const allWaves = [];
                waveSpawners.forEach(sp => {
                    sp.waves.forEach(w => {
                        const existing = allWaves.find(aw => aw.waveIdx === w.waveIdx);
                        if (existing) {
                            existing.groups.push(...w.groups);
                            existing.enemies.push(...w.enemies);
                            existing.maxAlive += w.maxAlive;
                            if (w.hasPause) existing.hasPause = true;
                            if (w.repeatable) existing.repeatable = true;
                        } else {
                            allWaves.push({ ...w, groups: [...w.groups], enemies: [...w.enemies] });
                        }
                    });
                });
                allWaves.sort((a, b) => (a.waveIdx || 0) - (b.waveIdx || 0));

                let totalWaves = allWaves.length, totalEnemies = 0;
                allWaves.forEach(w => w.enemies.forEach(e => totalEnemies += e.count));

                let waveDetailHtml = '';
                allWaves.forEach((wave, wIdx) => {
                    const repeatTag = wave.repeatable ? ` <span class="v2d-wave-repeat">${t('waves.repeatable')}</span>` : '';
                    const aliveTag = wave.maxAlive > 0 ? ` <span class="v2d-wave-alive">${t('waves.aliveLimit', { count: wave.maxAlive })}</span>` : '';
                    const pauseTag = wave.hasPause ? ` <span class="v2d-wave-pause">${t('waves.externallyControlled')}</span>` : '';
                    const enemyParts = wave.enemies.map(e => {
                        const iconSrc = `/public/images/enemy/monstericonbig/${e.templateId}.png`;
                        return `<span class="v2d-wave-enemy" data-wave-idx="${wIdx}" data-enemy-id="${e.instanceId}"><img class="v2d-wave-icon" src="${iconSrc}" onerror="this.style.display='none'"><span class="v2d-wave-ename">${e.name}</span> ×${e.count} <span class="v2d-wave-lv">Lv.${e.level}</span></span>`;
                    }).join(' ');
                    const activeCls = wIdx === 0 ? ' active' : '';
                    waveDetailHtml += `<div class="v2d-wave-line${activeCls}" data-wave-idx="${wIdx}"><span class="v2d-wave-num" data-wave-idx="${wIdx}">${t('waves.number', { number: wave.waveIdx })}</span>${repeatTag}${aliveTag}${pauseTag}: ${enemyParts}</div>`;
                });

                const mergedSpawner = { configId: 'merged', waves: allWaves };
                const spawnMapHtml = renderSpawnMap(mergedSpawner);

                waveSummaryHtml = `<div class="v2d-wave-map-row"><div class="v2d-wave-section"><div class="v2d-wave-summary"><span class="v2d-wave-label">${t('waves.summaryLabel')}</span> ${t('waves.summary', { waves: totalWaves, enemies: totalEnemies })}</div><div class="v2d-wave-detail">${waveDetailHtml}</div></div>${spawnMapHtml}</div>`;

                const enemyLibBuffs = {};
                waveSpawners.forEach(sp => {
                    sp.waves.forEach(wave => {
                        wave.enemies.forEach(e => {
                            if (!enemyLibBuffs[e.instanceId]) enemyLibBuffs[e.instanceId] = [];
                            e.bornBuffList.forEach(b => {
                                if (!enemyLibBuffs[e.instanceId].find(x => x.buffId === b.buffId))
                                    enemyLibBuffs[e.instanceId].push(b);
                            });
                        });
                    });
                });

                const seenEnemies = new Set();
                const uniqueEnemies = [];
                waveSpawners.forEach(sp => {
                    sp.waves.forEach(wave => {
                        wave.enemies.forEach(e => {
                            if (!seenEnemies.has(e.instanceId)) {
                                seenEnemies.add(e.instanceId);
                                uniqueEnemies.push(e);
                            }
                        });
                    });
                });

                if (uniqueEnemies.length > 0) {
                    enemiesHtml = `<h4 class="v2d-enemies-title">${t('enemyDetails')}</h4><div class="v2d-enemy-list">`;
                    uniqueEnemies.forEach(e => {
                        enemiesHtml += renderEnemyCard(e.instanceId, e.level, dungeon, enemyLibBuffs[e.instanceId] || []);
                    });
                    enemiesHtml += '</div>';
                }
            } else {
                const enemyIds = dungeon.enemyIds || [];
                const enemyLevels = dungeon.enemyLevels || [];
                if (enemyIds.length > 0) {
                    enemiesHtml = `<h4 class="v2d-enemies-title">${t('enemyDetails')}</h4><div class="v2d-enemy-list">`;
                    enemyIds.forEach((eid, idx) => {
                        const eLevel = enemyLevels[idx] || recommendLv;
                        enemiesHtml += renderEnemyCard(eid, eLevel, dungeon, []);
                    });
                    enemiesHtml += '</div>';
                }
            }

            const cardBgSrc = picPath ? `/public/images/dungeon/${picPath}.png` : '';
            const cardBgHtml = cardBgSrc ? `<img class="v2d-card-bg" src="${cardBgSrc}" onerror="this.style.display='none'">` : '';

            const dungeonIconSrc = dungeonImg ? `/public/images/item/itemiconbig/${dungeonImg}.png` : '';
            const dungeonIconHtml = dungeonIconSrc ? `<img class="v2d-card-icon" src="${dungeonIconSrc}" onerror="this.style.display='none'">` : '';

            return `
                <div class="v2d-card">
                    ${cardBgHtml}
                    <div class="v2d-card-header">
                        ${dungeonIconHtml}
                        <h4 class="v2d-card-name">${name}</h4>
                        ${level ? `<span class="v2d-card-level">${level}</span>` : ''}
                        <span class="v2d-card-id">${dungeonId}</span>
                    </div>
                    ${desc ? `<div class="v2d-card-desc">${desc}</div>` : ''}
                    ${featureDesc ? `<div class="v2d-card-feature">${featureDesc}</div>` : ''}
                    ${goalsHtml}
                    <div class="v2d-card-meta">
                        ${costStamina > 0 ? `<div><span class="v2d-meta-label">${t('meta.staminaCost')}</span> ${costStamina}</div>` : ''}
                        ${recommendLv ? `<div><span class="v2d-meta-label">${t('meta.recommendedLevel')}</span> ${recommendLv}</div>` : ''}
                        ${categoryLabel ? `<div><span class="v2d-meta-label">${t('meta.category')}</span> ${categoryLabel}</div>` : ''}
                    </div>
                    ${waveSummaryHtml}
                    ${rewardsHtml}
                    ${enemiesHtml}
                </div>
            `;
        }

        function renderDetail(data, seriesItem) {
            const seriesName = data.dungeonseriestable?.name?.text || seriesItem.name;
            const seriesDesc = data.dungeonseriestable?.desc?.text || '';
            const staminaText = data.dungeonseriestable?.staminaText?.text || '';
            const gameCategory = data.dungeonseriestable?.gameCategory || '';
            const categoryLabel = getCategoryLabel(gameCategory);
            const picPath = data.dungeonseriestable?.dungeonPicPath || '';
            const roleImg = data.dungeonseriestable?.dungeonRoleImg || '';

            const dungeons = data.dungeontable || {};
            const dungeonIds = Object.keys(dungeons);
            if (dungeonIds.length === 0) {
                return `<div class="v2d-error">${t('noData')}</div>`;
            }

            const includeIds = data.dungeonseriestable?.includeDungeonIds || dungeonIds;
            const orderedIds = includeIds.filter(id => dungeons[id]);

            let metaHtml = '';
            if (categoryLabel) metaHtml += `<span class="v2d-series-tag">${categoryLabel}</span>`;
            if (staminaText) metaHtml += `<span class="v2d-series-tag">${t('stamina', { value: staminaText })}</span>`;
            if (metaHtml) metaHtml = `<div class="v2d-series-meta">${metaHtml}</div>`;

            const bgSrc = picPath ? `/public/images/dungeon/${picPath}_bg.png` : '';
            const bgImg = bgSrc ? `<img class="v2d-series-bg" src="${bgSrc}" onerror="this.style.display='none'">` : '';

            const roleSrc = roleImg ? `/public/images/enemy/monstericonbig/${roleImg}.png` : '';
            const roleImgHtml = roleSrc ? `<img class="v2d-series-role" src="${roleSrc}" onerror="this.style.display='none'">` : '';

            let dungeonsHtml = '';
            orderedIds.forEach(id => {
                dungeonsHtml += renderDungeonCard(id, dungeons[id]);
            });

            return `
                <div class="v2d-series-banner">
                    ${bgImg}
                    <div class="v2d-series-header">
                        <h2 class="v2d-series-title">${seriesName}</h2>
                        <span class="v2d-series-id">${data.dungeonSeriesId || seriesItem.templateId}</span>
                    </div>
                    ${roleImgHtml}
                </div>
                ${metaHtml}
                ${seriesDesc ? `<div class="v2d-series-desc">${parseText(seriesDesc)}</div>` : ''}
                <div class="v2d-dungeons">
                    ${dungeonsHtml}
                </div>
            `;
        }

        async function refreshModule() {
            const list = document.getElementById('v2dungeonList');
            const detail = document.getElementById('v2dungeonDetail');
            if (!list || !detail) return;

            const showHidden = getCurrentShowHidden();
            const series = await loadSeriesManifest(showHidden);
            allSeries = series;
            renderSeriesList();
        }

        async function initModule() {
            if (isInitialized) return;
            isInitialized = true;
            if (window.configLoaded) await window.configLoaded;
            await loadMaps();

            if (mobileBtn) mobileBtn.addEventListener('click', openMobileList);
            if (mobileOverlay) mobileOverlay.addEventListener('click', (e) => {
                if (e.target === mobileOverlay) closeMobileList();
            });

            window.addEventListener('globalConfigChanged', () => {
                searchTerm = '';
                const si = document.getElementById('v2dungeonSearchInput');
                if (si) si.value = '';
                refreshModule();
            });

            document.getElementById('v2dungeonSearchInput')?.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                renderSeriesList();
            });

            function adjustTipPosition(spot, map) {
                const tip = spot.querySelector('.v2d-map-tip');
                if (!tip) return;
                const mapRect = map.getBoundingClientRect();
                const spotRect = spot.getBoundingClientRect();
                const spotCenterX = spotRect.left + spotRect.width / 2 - mapRect.left;
                const spotTop = spotRect.top - mapRect.top;
                tip.classList.remove('tip-below', 'tip-left', 'tip-right');
                if (spotTop < 60) tip.classList.add('tip-below');
                if (spotCenterX > mapRect.width * 0.7) tip.classList.add('tip-left');
                else if (spotCenterX < mapRect.width * 0.3) tip.classList.add('tip-right');
            }

            function switchWave(wi, body) {
                const map = body.querySelector('.v2d-spawn-map');
                if (!map) return;
                body.querySelectorAll('.v2d-wave-line').forEach(l => l.classList.toggle('active', l.dataset.waveIdx === wi));
                map.querySelectorAll('.v2d-map-spot').forEach(s => { s.style.display = s.dataset.wave === wi ? '' : 'none'; });
            }

            function clearHL(body) {
                if (!body) return;
                body.querySelectorAll('.v2d-map-spot').forEach(s => { s.classList.remove('group-highlight', 'target-highlight'); });
                body.querySelectorAll('.v2d-wave-enemy').forEach(e => { e.classList.remove('enemy-highlight', 'enemy-target-highlight'); });
            }

            document.addEventListener('click', (e) => {
                const wl = e.target.closest('.v2d-wave-line');
                if (wl) { const b = wl.closest('.v2d-card'); if (b && wl.dataset.waveIdx !== undefined) switchWave(wl.dataset.waveIdx, b); return; }
                const we = e.target.closest('.v2d-wave-enemy');
                if (we) { const b = we.closest('.v2d-card'); if (b && we.dataset.waveIdx !== undefined) switchWave(we.dataset.waveIdx, b); return; }
            });

            document.addEventListener('mouseover', (e) => {
                const spot = e.target.closest('.v2d-map-spot');
                if (spot) {
                    const map = spot.closest('.v2d-spawn-map');
                    const card = spot.closest('.v2d-card');
                    if (!map) return;
                    adjustTipPosition(spot, map);
                    const gk = spot.dataset.group, tg = spot.dataset.targetGroup, wi = spot.dataset.wave;
                    map.querySelectorAll('.v2d-map-spot').forEach(s => {
                        s.classList.remove('group-highlight', 'target-highlight');
                        if (s.dataset.group === gk && s !== spot) s.classList.add('group-highlight');
                        if (tg && s.dataset.group === tg) s.classList.add('target-highlight');
                    });
                    if (card) {
                        const iconSrc = spot.querySelector('.v2d-map-spot-icon')?.src || '';
                        card.querySelectorAll(`.v2d-wave-enemy[data-wave-idx="${wi}"]`).forEach(we => {
                            const weSrc = we.querySelector('.v2d-wave-icon')?.src || '';
                            if (iconSrc && weSrc && iconSrc === weSrc) we.classList.add('enemy-highlight');
                        });
                    }
                    return;
                }
                const we = e.target.closest('.v2d-wave-enemy');
                if (we) {
                    const card = we.closest('.v2d-card');
                    if (!card) return;
                    const map = card.querySelector('.v2d-spawn-map');
                    if (!map) return;
                    const wi = we.dataset.waveIdx, iconSrc = we.querySelector('.v2d-wave-icon')?.src || '';
                    map.querySelectorAll(`.v2d-map-spot[data-wave="${wi}"]`).forEach(s => {
                        const sSrc = s.querySelector('.v2d-map-spot-icon')?.src || '';
                        if (iconSrc && sSrc && iconSrc === sSrc) {
                            s.classList.add('group-highlight');
                            const gk = s.dataset.group, tg = s.dataset.targetGroup;
                            map.querySelectorAll('.v2d-map-spot').forEach(ss => {
                                if (ss.dataset.group === gk && ss !== s) ss.classList.add('group-highlight');
                                if (tg && ss.dataset.group === tg) ss.classList.add('target-highlight');
                            });
                        }
                    });
                    we.classList.add('enemy-highlight');
                }
            });

            document.addEventListener('mouseout', (e) => {
                const spot = e.target.closest('.v2d-map-spot');
                const we = e.target.closest('.v2d-wave-enemy');
                if (!spot && !we) return;
                const card = (spot || we)?.closest('.v2d-card');
                if (card) clearHL(card);
            });

            await refreshModule();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initModule);
        } else {
            initModule();
        }
    })();
