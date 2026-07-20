(function() {
    const t = window.akeI18n.scope('modules.cc');
    const commonT = window.akeI18n.scope('common');
    let allGames = [];
    let activeGameId = null;
    let isInitialized = false;
    let searchTerm = '';
    let selectedTagIds = new Set();
    let currentData = null;
    let currentGame = null;
    let currentDungeonData = null;
    let currentDungeonError = null;
    let ccAttrMap = {};
    let ccAttrNameToId = {};
    let ccBuffCache = {};

    const FORMULA_TO_MODTYPE = window.AKEStats.FORMULA_TO_MODTYPE;

    const ATTR_DISPLAY_ORDER = [0, 1, 2, 3, 20, 21, 27, 12, 8, 9, 10, 11, 15];

    const IMAGE_BASE_PATH = '/public/images/';

    const TERM_TYPE_MAP = {
        1: { labelKey: 'termTypes.enemyBuff', cls: 'enemy-buff' },
        2: { labelKey: 'termTypes.selfDebuff', cls: 'self-buff' },
        3: { labelKey: 'termTypes.timeReduction', cls: 'time-reduce' },
        0: { labelKey: 'termTypes.none', cls: '' },
        'None': { labelKey: 'termTypes.none', cls: '' }
    };

    function parseText(text) {
        if (!text) return '';
        text = text.replace(/<color=([^>]+)>/g, '<span style="color:$1">').replace(/<\/color>/g, '</span>');
        text = text.replace(/\n/g, '<br>');
        return window.parseText(text, IMAGE_BASE_PATH);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function getCurrentShowHidden() {
        return window.akeData?.getConfig().showHidden ?? false;
    }

    function formatBlackboardValue(val) {
        if (typeof val === 'number') {
            const display = Number.isInteger(val) ? val.toString() : (val * 100).toFixed(0) + '%';
            return window.renderRawValueTip ? window.renderRawValueTip(display, val) : display;
        }
        return String(val);
    }

    function buildBlackboardValueMap(tagTerms) {
        const map = {};
        for (const term of (tagTerms || [])) {
            for (const bb of (term.blackboard || [])) {
                if (bb.key) {
                    map[bb.key] = (bb.valueStr && bb.valueStr !== '') ? bb.valueStr : bb.value;
                }
            }
        }
        return map;
    }

    function buildAllTagValueMaps(tagTable) {
        const maps = {};
        for (const [tid, td] of Object.entries(tagTable || {})) {
            maps[String(tid)] = buildBlackboardValueMap(td.tagTerms || []);
        }
        return maps;
    }

    function evalExprWithMap(expr, format, valueMap) {
        const lowerValueMap = {};
        for (const [key, val] of Object.entries(valueMap || {})) {
            lowerValueMap[String(key).toLowerCase()] = val;
        }
        const varNames = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
        const missingVar = varNames.find(name => !(name.toLowerCase() in lowerValueMap));
        if (missingVar) return null;
        let evalExpr = expr;
        for (const name of varNames) {
            const value = lowerValueMap[name.toLowerCase()];
            const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
            evalExpr = evalExpr.replace(regex, `(${value})`);
        }
        let result;
        try {
            result = new Function('return ' + evalExpr)();
        } catch (e) {
            return null;
        }
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
    }

    function replacePlaceholders(desc, valueMap, allValueMaps) {
        if (!desc) return desc;
        const hasPlaceholders = desc.includes('{');
        const hasColor = desc.includes('<color');
        if (!hasPlaceholders && !hasColor) return desc;
        return String(desc)
            .replace(/<color=([^>]+)>/g, '<span style="color:$1">')
            .replace(/<\/color>/g, '</span>')
            .replace(/\{(@([^@]*)@)?([^}]+)\}/g, (match, _atPart, refTagId, inner) => {
                const parts = inner.split(':');
                const expr = parts[0].replace(/\s+/g, '');
                const format = parts[1] ? parts[1].trim() : '';
                const lookupMap = (refTagId && allValueMaps)
                    ? allValueMaps[String(refTagId)] || {}
                    : valueMap;
                const result = evalExprWithMap(expr, format, lookupMap);
                return result !== null ? result : match;
            });
    }

    function filterGames(games) {
        if (!searchTerm) return games;
        const t = searchTerm.toLowerCase();
        return games.filter(g =>
            (g.gameId && g.gameId.toLowerCase().includes(t)) ||
            (g.name && g.name.toLowerCase().includes(t)) ||
            (g.activityId && g.activityId.toLowerCase().includes(t))
        );
    }

    function getAllContractTags(cct) {
        if (!cct || !cct.contractGroupMap) return {};
        const all = {};
        for (const gid of Object.keys(cct.contractGroupMap)) {
            const group = cct.contractGroupMap[gid];
            if (!group.contractMap) continue;
            for (const key of Object.keys(group.contractMap)) {
                const tag = group.contractMap[key];
                all[String(tag.tagId)] = tag;
            }
        }
        return all;
    }

    function getAvailableKeys(selectedIds, allTags) {
        const keys = new Set();
        for (const tid of selectedIds) {
            const tag = allTags[tid];
            if (tag && tag.keyId) keys.add(tag.keyId);
        }
        return keys;
    }

    function checkTagRequirements(tagId, selectedIds, allTags) {
        const tag = allTags[tagId];
        if (!tag) return { ok: false, reason: t('conflicts.tagMissing') };

        if (tag.conflictId) {
            for (const sid of selectedIds) {
                if (sid === String(tagId)) continue;
                const st = allTags[sid];
                if (st && st.conflictId === tag.conflictId) {
                    return { ok: false, reason: t('conflicts.withTag', { tag: sid, conflict: tag.conflictId }) };
                }
            }
        }

        if (tag.lockIds && tag.lockIds.length > 0) {
            const availableKeys = getAvailableKeys(selectedIds, allTags);
            const missing = tag.lockIds.filter(k => !availableKeys.has(k));
            if (missing.length > 0) {
                return { ok: false, reason: t('conflicts.missingKeys', { keys: missing.join(', ') }) };
            }
        }

        return { ok: true, reason: '' };
    }

    function isTagSelectable(tagId, selectedIds, allTags) {
        if (selectedIds.has(tagId)) return { ok: true, reason: '' };
        return checkTagRequirements(tagId, selectedIds, allTags);
    }

    function cascadeDeselect(selectedIds, allTags) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const tid of Array.from(selectedIds)) {
                const check = checkTagRequirements(tid, selectedIds, allTags);
                if (!check.ok) {
                    selectedIds.delete(tid);
                    changed = true;
                }
            }
        }
        return selectedIds;
    }

    function computeTotalScore(selectedIds, tagTable) {
        let total = 0;
        for (const tid of selectedIds) {
            const td = tagTable[tid];
            if (td) total += (td.score || 0);
        }
        return total;
    }

    async function loadGameManifest(showHidden) {
        try {
            const res = await (window.akeFetch || fetch)('/public/CH/v2_cc/manifest.json');
            if (!res.ok) throw new Error('无法加载合约清单');
            const all = await res.json();
            let games = showHidden ? all : all.filter(g => !g.hidden);
            games.sort((a, b) => (a.priority || 999) - (b.priority || 999));
            return games;
        } catch (err) {
            console.error('加载合约清单失败:', err);
            return [];
        }
    }

    function renderGameOverview(items, container) {
        const statusNames = ['statuses.active', 'statuses.upcoming', 'statuses.ended', 'statuses.permanent'];
        window.AKEModuleOverview.render(container, {
            title: t('overview.title'), description: t('overview.description'),
            group: item => ({ id: String(item.statusOrder ?? 3), name: t(statusNames[item.statusOrder] || 'statuses.permanent'), order: item.statusOrder ?? 3 }),
            onReset: () => { activeGameId = null; },
            onSelect: item => { activeGameId = item.gameId; renderGameList(); },
            sidebarSelector: item => `.v2cc-item[data-game-id="${CSS.escape(item.gameId)}"]`,
            items: items.map(item => ({ ...item, id: item.gameId, image: item.image, fallback: 'CC',
                tags: [t('counts.indicatorGroups', { count: item.contractGroupCount || 0 }), t('counts.terms', { count: item.contractCount || 0 }), item.dungeonName] }))
        });
    }

    const mobileBtn = document.getElementById('v2ccMobileListBtn');
    const mobileOverlay = document.getElementById('v2ccMobileListOverlay');
    const mobileContent = document.getElementById('v2ccMobileListContent');

    function buildMobileList() {
        const filtered = filterGames(allGames);
        mobileContent.innerHTML = '';
        filtered.forEach(game => {
            const div = document.createElement('div');
            div.className = `v2cc-mobile-item ${game.gameId === activeGameId ? 'active' : ''}`;
            window.AKEModuleOverview?.markVersionChange(div, game);
            div.innerHTML = `
                <div class="v2cc-mobile-name">${escapeHtml(game.name || game.gameId)}</div>
                <div class="v2cc-mobile-id">${escapeHtml(game.activityId)}</div>
            `;
            div.addEventListener('click', () => {
                activeGameId = game.gameId;
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_cc', game.gameId);
                loadGameDetail(game, document.getElementById('v2ccDetail'));
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

    function renderGameList() {
        const container = document.getElementById('v2ccList');
        const detailContainer = document.getElementById('v2ccDetail');
        if (!container) return;

        const filtered = filterGames(allGames);
        container.innerHTML = '';

        if (filtered.length === 0) {
            container.innerHTML = `<div class="v2cc-loader">${t('noMatches')}</div>`;
            if (detailContainer) detailContainer.innerHTML = `<div class="v2cc-loader">${t('select')}</div>`;
            activeGameId = null;
            return;
        }

        filtered.forEach((game, index) => {
            const div = document.createElement('div');
            div.className = `v2cc-item ${game.gameId === activeGameId ? 'active' : (!activeGameId && index === 0 && !window.AKEModuleOverview?.isActive('cc') ? 'active' : '')}`;
            window.AKEModuleOverview?.markVersionChange(div, game);
            div.dataset.gameId = game.gameId;

            const icon = document.createElement('div');
            icon.className = 'v2cc-item-icon';
            icon.style.display = 'flex';
            icon.style.alignItems = 'center';
            icon.style.justifyContent = 'center';
            icon.style.fontSize = '1.4rem';
            icon.textContent = '⚔️';

            const info = document.createElement('div');
            info.className = 'v2cc-item-info';
            const nm = document.createElement('div');
            nm.className = 'v2cc-item-name';
            nm.textContent = game.name || game.gameId;
            const sub = document.createElement('div');
            sub.className = 'v2cc-item-sub';
            sub.textContent = game.activityId;
            info.appendChild(nm);
            info.appendChild(sub);

            div.appendChild(icon);
            div.appendChild(info);

            div.addEventListener('click', () => {
                document.querySelectorAll('.v2cc-item').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                activeGameId = game.gameId;
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_cc', game.gameId);
                loadGameDetail(game, detailContainer);
            });

            container.appendChild(div);
        });

        if (window.__deepLinkId) {
            const deepGame = filtered.find(g => g.gameId === window.__deepLinkId);
            if (deepGame) {
                activeGameId = deepGame.gameId;
            } else {
                const existsInRaw = allGames.some(g => g.gameId === window.__deepLinkId);
                if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                    window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                }
            }
            window.__deepLinkId = null;
        }
        const activeExists = filtered.some(g => g.gameId === activeGameId);
        if (!activeExists && filtered.length > 0) {
            if (window.AKEModuleOverview?.isActive('cc')) {
                activeGameId = null;
                renderGameOverview(filtered, detailContainer);
                return;
            }
            activeGameId = filtered[0].gameId;
            if (window.__akeRouter) window.__akeRouter.updateUrl('v2_cc', activeGameId);
            const f = container.querySelector('.v2cc-item');
            if (f) f.classList.add('active');
            loadGameDetail(filtered[0], detailContainer);
        } else if (activeExists) {
            const ag = filtered.find(g => g.gameId === activeGameId);
            if (ag) {
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_cc', activeGameId);
                const ad = container.querySelector(`.v2cc-item[data-game-id="${activeGameId}"]`);
                if (ad) ad.classList.add('active');
                loadGameDetail(ag, detailContainer);
            }
        }
    }

    async function loadGameDetail(game, container) {
        container.innerHTML = `<div class="v2cc-loader">${t('loading')}</div>`;
        try {
            const data = await (window.akeFetch || fetch)(game.contentFile).then(r => r.json());
            currentData = data;
            currentGame = game;
            currentDungeonData = null;
            currentDungeonError = null;
            selectedTagIds.clear();

            if (data.buffdata) {
                Object.entries(data.buffdata).forEach(([id, buff]) => {
                    ccBuffCache[id] = buff;
                });
            }

            if (game.dungeonFile) {
                try {
                    await loadCcMaps();
                    const response = await (window.akeFetch || fetch)(game.dungeonFile);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const dgData = await response.json();
                    await window.AKECombatData?.enrichDungeonScripts(dgData);
                    const embeddedBuffData = {};
                    Object.values(dgData.dungeontable || {}).forEach(dg => {
                        if (dg.BuffData) Object.assign(embeddedBuffData, dg.BuffData);
                    });
                    const buffIds = new Set();
                    Object.values(dgData.dungeontable || {}).forEach(dg => {
                        Object.values(dg.enemyTable || {}).forEach(e => (e.bornBuffs || []).forEach(id => buffIds.add(id)));
                        Object.values(dg.SpawnerConfig || {}).forEach(sc => {
                            (sc.enemyLibrary || []).forEach(lib => (lib.bornBuffList || []).forEach(b => buffIds.add(b.buffId)));
                        });
                        (window.AKECombatData?.collectScriptBuffIds(dg) || []).forEach(id => buffIds.add(id));
                    });
                    Object.values(data.cctagtable || {}).forEach(tag => (tag.tagTerms || []).forEach(term => {
                        if (term.termType === 1 && term.buffId) buffIds.add(term.buffId);
                    }));
                    await Promise.all(Array.from(buffIds).map(id => loadCcBuff(id, embeddedBuffData)));
                    currentDungeonData = dgData;
                } catch (dgErr) {
                    currentDungeonError = dgErr;
                    console.error('加载副本数据失败:', dgErr);
                }
            }

            container.innerHTML = renderDetail(data, game);
            window.AKEModuleOverview?.renderVersionDiff(container, data, data.__versionDiff?.baseline ? renderDetail(data.__versionDiff.baseline, game) : '');
            bindTagEvents();
            updateSelectedSummary(data.cctagtable || {});
        } catch (err) {
            container.innerHTML = `<div class="v2cc-error">${t('loadFailed', { message: escapeHtml(err.message) })}</div>`;
        }
    }

    function renderActivityInfo(acc) {
        if (!acc) return '';
        const items = [
            { l: t('activityInfo.activityId'), v: acc.activityId },
            { l: t('activityInfo.gameplayType'), v: acc.type },
            { l: t('activityInfo.stageId'), v: acc.gameplayEndStageId },
            { l: t('activityInfo.maxTagColumns'), v: acc.tagMaxColumn },
            { l: t('activityInfo.currencyAmount'), v: acc.compareToMoneyCount },
            { l: t('activityInfo.shopGroup'), v: acc.shopGroupId }
        ].filter(i => i.v !== undefined && i.v !== '');

        if (!items.length) return '';

        return `
            <details class="v2cc-section v2cc-activity-config">
                <summary>${t('sections.activityConfiguration')}</summary>
                <div class="v2cc-info-grid">
                    ${items.map(i => `
                        <div class="v2cc-info-item">
                            <div class="v2cc-info-label">${escapeHtml(i.l)}</div>
                            <div class="v2cc-info-value">${escapeHtml(String(i.v))}</div>
                        </div>
                    `).join('')}
                </div>
            </details>
        `;
    }

    function renderTagTermEffect(term) {
        const typeInfo = TERM_TYPE_MAP[term.termType] || TERM_TYPE_MAP['None'];
        const params = (term.blackboard || []).map(bb => {
            const value = bb.valueStr !== undefined && bb.valueStr !== ''
                ? escapeHtml(String(bb.valueStr))
                : formatBlackboardValue(bb.value);
            return `<span class="v2cc-term-param"><span class="v2cc-term-param-key">${escapeHtml(bb.key)}</span><span class="v2cc-term-param-value">${value}</span></span>`;
        }).join(', ');

        return `
            <div class="v2cc-tag-term">
                <span class="v2cc-term-type ${typeInfo.cls}">${escapeHtml(t(typeInfo.labelKey))}</span>
                ${params ? `<span class="v2cc-term-params">${params}</span>` : ''}
            </div>
        `;
    }

    function renderScorePanel(tagTable) {
        const total = computeTotalScore(selectedTagIds, tagTable);
        const count = selectedTagIds.size;
        return `
            <div class="v2cc-score-panel" id="v2ccScorePanel">
                <div class="v2cc-score-panel-left">
                    <span class="v2cc-score-panel-label">${t('score.currentTotal')}</span>
                    <span class="v2cc-score-panel-value">${total}</span>
                    <span class="v2cc-score-panel-count">${t('score.selectedTerms', { count })}</span>
                </div>
                <div class="v2cc-score-panel-right">
                    <button class="v2cc-reset-btn" id="v2ccResetBtn">${t('score.reset')}</button>
                </div>
            </div>
        `;
    }

    function renderContractGroups(cct, tagTable) {
        if (!cct || !cct.contractGroupMap) return '';
        const groupMap = cct.contractGroupMap;
        const groupIds = Object.keys(groupMap).sort((a, b) => Number(a) - Number(b));
        if (!groupIds.length) return '';

        const allTags = getAllContractTags(cct);
        const allValueMaps = buildAllTagValueMaps(tagTable);

        return `
            <div class="v2cc-section">
                <h3>${t('sections.contractTerms')}</h3>
                ${renderScorePanel(tagTable)}
                <div class="v2cc-groups">
                    ${groupIds.map(gid => {
                        const group = groupMap[gid];
                        const contractMap = group.contractMap || {};
                        const entryKeys = Object.keys(contractMap).sort((a, b) => Number(a) - Number(b));

                        return `
                            <div class="v2cc-group">
                                <div class="v2cc-group-title">${t('contract.group', { id: escapeHtml(gid) })}</div>
                                ${entryKeys.map(ek => {
                                    const tag = contractMap[ek];
                                    const tid = String(tag.tagId);
                                    const tagData = tagTable[tid] || {};
                                    const name = tagData.name?.text || `Tag ${tid}`;
                                    const terms = tagData.tagTerms || [];
                                    const bbValueMap = buildBlackboardValueMap(terms);
                                    const desc = replacePlaceholders(tagData.desc?.text || '', bbValueMap, allValueMaps);
                                    const icon = tagData.icon || '';
                                    const roman = tagData.romanNumSuffix || '';
                                    const score = tagData.score ?? 0;
                                    const isSelected = selectedTagIds.has(tid);
                                    const selCheck = isTagSelectable(tid, selectedTagIds, allTags);
                                    const isSelectable = selCheck.ok || isSelected;
                                    const stateClass = isSelected ? 'selected' : (selCheck.ok ? 'selectable' : 'locked');

                                    let badges = '';
                                    if (tag.keyId) {
                                        const keyHeld = getAvailableKeys(selectedTagIds, allTags).has(tag.keyId);
                                        badges += `<span class="v2cc-tag-badge key${keyHeld ? ' held' : ''}"><span class="badge-dot"></span>${t('contract.key', { key: escapeHtml(tag.keyId) })}</span>`;
                                    }
                                    if (tag.lockIds && tag.lockIds.length > 0) {
                                        tag.lockIds.forEach(lid => {
                                            const keyHeld = getAvailableKeys(selectedTagIds, allTags).has(lid);
                                            badges += `<span class="v2cc-tag-badge lock${keyHeld ? ' held' : ''}"><span class="badge-dot"></span>${t('contract.requires', { key: escapeHtml(lid) })}</span>`;
                                        });
                                    }
                                    if (tag.conflictId) {
                                        let conflictWith = '';
                                        for (const sid of selectedTagIds) {
                                            if (sid === tid) continue;
                                            const st = allTags[sid];
                                            if (st && st.conflictId === tag.conflictId) {
                                                conflictWith = sid;
                                                break;
                                            }
                                        }
                                        const conflictText = conflictWith
                                            ? t('contract.conflictWith', { conflict: escapeHtml(tag.conflictId), tag: escapeHtml(conflictWith) })
                                            : t('contract.conflict', { conflict: escapeHtml(tag.conflictId) });
                                        badges += `<span class="v2cc-tag-badge conflict${conflictWith ? ' active-conflict' : ''}"><span class="badge-dot"></span>${conflictText}</span>`;
                                    }
                                    if (!tag.canPreview) {
                                        badges += `<span class="v2cc-tag-badge preview-off">🔒 ${t('contract.previewUnavailable')}</span>`;
                                    }

                                    let lockReason = '';
                                    if (!isSelected && !selCheck.ok) {
                                        lockReason = `<div class="v2cc-tag-lock-reason">${escapeHtml(selCheck.reason)}</div>`;
                                    }

                                    return `
                                        <div class="v2cc-tag-card ${stateClass}" data-tag-id="${tid}">
                                            <div class="v2cc-tag-header">
                                                <div class="v2cc-tag-check">${isSelected ? '✓' : ''}</div>
                                                ${icon ? `<img class="v2cc-tag-icon" src="/public/images/contingencycontract/${icon}.png" onerror="this.onerror=null; this.style.display='none';">` : ''}
                                                <span class="v2cc-tag-name">${escapeHtml(name)}</span>
                                                ${roman ? `<span class="v2cc-tag-roman">${escapeHtml(roman)}</span>` : ''}
                                                <span class="v2cc-tag-score">+${score}</span>
                                            </div>
                                            ${desc ? `<div class="v2cc-tag-desc">${desc}</div>` : ''}
                                            ${terms.length ? `<div class="v2cc-tag-terms">${terms.map(renderTagTermEffect).join('')}</div>` : ''}
                                            ${badges ? `<div class="v2cc-tag-meta">${badges}</div>` : ''}
                                            ${lockReason}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function resolveRewardItems(rewardId, rewardTable, itemTable) {
        const reward = rewardTable?.[rewardId];
        if (!reward || !reward.itemBundles) return [];
        return reward.itemBundles.map(bundle => {
            const item = itemTable?.[bundle.id];
            return {
                id: bundle.id,
                count: bundle.count,
                name: item?.name?.text || bundle.id,
                iconId: item?.iconId || '',
                rarity: item?.rarity ?? 0
            };
        });
    }

    function renderLevelRewards(data) {
        const lt = data.contingencycontractleveltable;
        if (!lt || !lt.levelMap || !Object.keys(lt.levelMap).length) return '';
        const rewardTable = data.rewardtable || {};
        const itemTable = data.itemtable || {};
        const levels = Object.entries(lt.levelMap).sort((a, b) => (a[1].level || 0) - (b[1].level || 0));

        const acc = data.activitycontingencycontracttable;
        const scoreBand = acc?.scoreBand || [];
        const descs = [];
        levels.forEach(([, lv], i) => {
            const items = resolveRewardItems(lv.firstReward, rewardTable, itemTable);
            const rewardText = items.map(it => `${escapeHtml(it.name)}×${it.count}`).join(t('rewards.separator'));
            const score = scoreBand[i];
            if (score !== undefined) {
                descs.push(`<span class="v2cc-level-desc-line">${t('rewards.scoreLevel', { score, level: lv.level, rewards: rewardText })}</span>`);
            } else {
                descs.push(`<span class="v2cc-level-desc-line">${t('rewards.allCompletedLevel', { level: lv.level, rewards: rewardText })}</span>`);
            }
        });

        return `
            <div class="v2cc-section">
                <h3>${t('sections.levelRewards')}</h3>
                <div class="v2cc-levels">
                    ${levels.map(([, lv]) => {
                        const items = resolveRewardItems(lv.firstReward, rewardTable, itemTable);
                        return `
                            <div class="v2cc-level-card">
                                <div class="v2cc-level-num">Lv.${lv.level}</div>
                                <div class="v2cc-level-reward-list">
                                    ${items.length ? items.map(it => `
                                        <div class="v2cc-reward-item">
                                            <img class="v2cc-reward-icon" src="/public/images/item/itemiconbig/${it.iconId}.png" onerror="this.onerror=null; this.style.display='none';">
                                            <span class="v2cc-reward-name">${escapeHtml(it.name)}</span>
                                            <span class="v2cc-reward-count">×${it.count}</span>
                                        </div>
                                    `).join('') : `<span class="v2cc-reward-empty">${escapeHtml(lv.firstReward || '-')}</span>`}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${descs.length ? `<div class="v2cc-level-desc">${descs.join('<br>')}</div>` : ''}
            </div>
        `;
    }

    function renderShopSection(data) {
        const sgt = data.shopgrouptable;
        const shopTable = data.shoptable || {};
        const goodsTable = data.shopgoodstable || {};
        const itemTable = data.itemtable || {};
        if (!sgt || !Object.keys(shopTable).length) return '';

        const groupName = sgt.shopGroupName?.text || sgt.shopGroupId;
        const shopIds = sgt.shopIds || [];
        const currencyCache = {};

        function getCurrencyName(moneyId) {
            if (currencyCache[moneyId]) return currencyCache[moneyId];
            const item = itemTable[moneyId];
            const name = item?.name?.text || moneyId;
            currencyCache[moneyId] = name;
            return name;
        }

        return `
            <div class="v2cc-section">
                <h3>${t('shop.title', { name: parseText(groupName) })}</h3>
                ${shopIds.map(sid => {
                    const shop = shopTable[sid];
                    if (!shop) return '';
                    const shopName = shop.shopName?.text || sid;
                    const goodsIds = shop.shopGoodsIds || [];
                    const goods = goodsIds.map(gid => goodsTable[gid]).filter(Boolean);

                    return `
                        <div class="v2cc-shop-card">
                            <div class="v2cc-shop-header">
                                <span class="v2cc-shop-name">${parseText(shopName)}</span>
                                <span class="v2cc-shop-count">${t('shop.goodsCount', { count: goods.length })}</span>
                            </div>
                            <table class="v2cc-shop-table">
                                <thead>
                                    <tr>
                                        <th class="col-icon"></th>
                                        <th class="col-name">${t('shop.item')}</th>
                                        <th class="col-price">${t('shop.price')}</th>
                                        <th class="col-limit">${t('shop.limit')}</th>
                                    </tr>
                                </thead>
                            </table>
                            <div class="v2cc-shop-goods-body">
                                ${goods.map(g => {
                                    const rewardItems = resolveRewardItems(g.rewardId, data.rewardtable || {}, itemTable);
                                    const itemIcon = rewardItems.length ? rewardItems[0].iconId : '';
                                    const itemName = rewardItems.length
                                        ? rewardItems.map(r => escapeHtml(r.name) + (r.count > 1 ? `<span class="v2cc-item-qty">×${r.count}</span>` : '')).join(' + ')
                                        : `<span class="v2cc-goods-fallback">${escapeHtml(g.goodsTagId || g.goodsId)}</span>`;
                                    const currencyName = escapeHtml(getCurrencyName(g.moneyId));
                                    const limitText = g.limitCount > 0 ? g.limitCount : '∞';
                                    const hasDiscount = g.cnDiscount > 0 && g.cnDiscount < 1;
                                    const actualPrice = hasDiscount ? Math.ceil(g.price * g.cnDiscount) : g.price;

                                    return `
                                        <div class="v2cc-shop-goods-row">
                                            <span class="col-icon">
                                                ${itemIcon ? `<img class="v2cc-goods-icon" src="/public/images/item/itemiconbig/${itemIcon}.png" onerror="this.onerror=null; this.style.display='none';">` : ''}
                                            </span>
                                            <span class="col-name">${itemName}</span>
                                            <span class="col-price">${hasDiscount ? `<span class="v2cc-price-original">${g.price}</span> ` : ''}${actualPrice} ${currencyName}${hasDiscount ? ` <span class="v2cc-goods-discount">-${Math.round((1 - g.cnDiscount) * 100)}%</span>` : ''}</span>
                                            <span class="col-limit">${limitText}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderTaskGroups(data) {
        const tgt = data.activitycontingencycontracttaskgrouptable;
        if (!tgt || !Object.keys(tgt).length) return '';
        const groups = Object.entries(tgt).sort((a, b) => (a[1].sortId || 0) - (b[1].sortId || 0));

        const acmConfig = data.activityconditionalmultistagetaskconfigtable;
        let taskConfigMap = {};
        if (acmConfig) {
            for (const actKey of Object.keys(acmConfig)) {
                const cfg = acmConfig[actKey];
                if (cfg && cfg.TaskConfigMap) {
                    Object.assign(taskConfigMap, cfg.TaskConfigMap);
                }
            }
        }

        const rewardTable = data.rewardtable || {};
        const itemTable = data.itemtable || {};

        return `
            <div class="v2cc-section">
                <h3>${t('sections.tasks')}</h3>
                <div class="v2cc-task-groups">
                    ${groups.map(([, tg]) => {
                        const tgId = tg.taskGroupId;
                        const tasks = Object.values(taskConfigMap)
                            .filter(t => t.taskGroupId === tgId)
                            .sort((a, b) => (a.sortId || 0) - (b.sortId || 0));

                        return `
                            <div class="v2cc-task-group-card">
                                <div class="v2cc-task-group-header">
                                    ${tg.icon ? `<img class="v2cc-task-group-icon" src="/public/images/contingencycontract/${tg.icon}.png" onerror="this.onerror=null; this.style.display='none';">` : ''}
                                    <span class="v2cc-task-group-name">${tg.name?.text ? parseText(tg.name.text) : escapeHtml(tgId)}</span>
                                    <span class="v2cc-task-group-badge">${t('tasks.count', { count: tasks.length })}</span>
                                    ${tg.canUpdate ? `<span class="v2cc-task-group-badge update">${t('tasks.updatable')}</span>` : ''}
                                </div>
                                ${tasks.length ? `
                                    <div class="v2cc-task-list">
                                        ${tasks.map(task => {
                                            const desc = task.desc?.text ? parseText(task.desc.text) : '';
                                            const rewards = resolveRewardItems(task.rewardId, rewardTable, itemTable);
                                            return `
                                                <div class="v2cc-task-item">
                                                    <div class="v2cc-task-item-header">
                                                        <span class="v2cc-task-item-id">${escapeHtml(task.taskId)}</span>
                                                    </div>
                                                    ${desc ? `<div class="v2cc-task-item-desc">${desc}</div>` : ''}
                                                    ${rewards.length ? `
                                                        <div class="v2cc-task-item-rewards">
                                                            <span class="v2cc-task-reward-label">${t('tasks.rewards')}</span>
                                                            ${rewards.map(r => `
                                                                <span class="v2cc-task-reward">
                                                                    ${r.iconId ? `<img class="v2cc-task-reward-icon" src="/public/images/item/itemiconbig/${r.iconId}.png" onerror="this.onerror=null; this.style.display='none';">` : ''}
                                                                    <span class="v2cc-task-reward-name">${escapeHtml(r.name)}</span>
                                                                    <span class="v2cc-task-reward-count">×${r.count}</span>
                                                                </span>
                                                            `).join('')}
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : `<div class="v2cc-task-empty">${t('tasks.empty')}</div>`}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    async function loadCcMaps() {
        try {
            const data = await window.akeLoadMaps();
            ccAttrMap = data.ATTR_MAP || {};
            const attrEn = data.ATTR_MAP_EN || {};
            Object.entries(attrEn).forEach(([id, name]) => { ccAttrNameToId[name] = parseInt(id, 10); });
        } catch {}
    }

    async function loadCcBuff(buffId, embeddedBuffData) {
        if (ccBuffCache[buffId] !== undefined) return ccBuffCache[buffId];
        if (embeddedBuffData && embeddedBuffData[buffId]) {
            ccBuffCache[buffId] = embeddedBuffData[buffId];
            return ccBuffCache[buffId];
        }
        try {
            const res = await (window.akeFetch || fetch)(`/public/Json/BuffData/${buffId}.json`);
            if (!res.ok) { ccBuffCache[buffId] = null; return null; }
            ccBuffCache[buffId] = await res.json();
            return ccBuffCache[buffId];
        } catch { ccBuffCache[buffId] = null; return null; }
    }

    function getBuffModifiers(buffId, blackboardOverrides) {
        const buff = ccBuffCache[buffId];
        if (!buff?.attributeModifier?.attributeModifiers?.length) return [];
        const bb = {};
        (buff.blackboard || []).forEach(b => { bb[b.key] = b.valueDouble ?? b.value ?? 0; });
        (blackboardOverrides || []).forEach(b => { bb[b.key] = b.valueFloat ?? b.valueDouble ?? b.value ?? 0; });
        return buff.attributeModifier.attributeModifiers.map(mod => {
            const attrType = ccAttrNameToId[mod.attributeType];
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

    function computeAttrWithModifiers(baseValue, modifiers, attrType) {
        return window.AKEStats.computeAttrWithModifiers(baseValue, modifiers, attrType);
    }

    function findTemplateId(instanceId, table) {
        if (table[instanceId]) return instanceId;
        let best = '';
        Object.keys(table).forEach(k => {
            if (instanceId.startsWith(k) && k.length > best.length) best = k;
        });
        return best || instanceId;
    }

    function getEnemyStatsAtLevel(attrTemplateData, enemyLevel, modifiers) {
        return window.AKEStats.getEnemyStatsAtLevel(attrTemplateData, enemyLevel, modifiers, {
            displayOrder: ATTR_DISPLAY_ORDER,
            getAttrName: attrType => ccAttrMap[attrType] || t('attributeFallback', { type: attrType }),
            includeModifierOnlyAttrs: false
        });
    }

    function getEnemyStatDetailsAtLevel(attrTemplateData, enemyLevel, modifiers) {
        return window.AKEStats.getEnemyStatDetailsAtLevel(attrTemplateData, enemyLevel, modifiers, {
            displayOrder: ATTR_DISPLAY_ORDER,
            getAttrName: attrType => ccAttrMap[attrType] || t('attributeFallback', { type: attrType }),
            includeModifierOnlyAttrs: false
        });
    }

    function formatStatValue(value, detail) {
        const display = formatPlainAttrVal(value);
        return detail && window.renderRawValueTip ? window.renderRawValueTip(display, detail) : display;
    }

    function formatPlainAttrVal(val) {
        if (typeof val !== 'number') return val;
        let display;
        if (Math.abs(val) < 1 && val !== 0) display = (val * 100).toFixed(1) + '%';
        else display = Number.isInteger(val) ? val.toString() : val.toFixed(2);
        return display;
    }

    function formatAttrVal(val) {
        const display = formatPlainAttrVal(val);
        return window.renderRawValueTip ? window.renderRawValueTip(display, val) : display;
    }

    function formatModifierSummary(modifiers) {
        return window.AKEStats.combineModifiers(modifiers).map(modifier => {
            const name = ccAttrMap[modifier.attrType] || t('attributeFallback', { type: modifier.attrType });
            const directMultiplier = modifier.modifierType === 4 || modifier.modifierType === 8;
            const multiplier = directMultiplier || modifier.modifierType === 1 || modifier.modifierType === 6;
            const value = directMultiplier ? modifier.attrValue - 1 : modifier.attrValue;
            const display = multiplier
                ? `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
                : `${value > 0 ? '+' : ''}${Number.isInteger(value) ? value : Number(value.toFixed(4))}`;
            return `${escapeHtml(name)} ${display}`;
        }).join(', ');
    }

    function renderModifierSources(groups) {
        const rows = groups.map(([label, modifiers]) => {
            const summary = formatModifierSummary(modifiers);
            return summary ? `<div class="v2d-enemy-modifier"><b>${label}</b> ${summary}</div>` : '';
        }).join('');
        return rows ? `<div class="v2cc-current-buffs">${rows}</div>` : '';
    }

    function buildEnemyBuffTagsHtml(ownBuffs, libBuffs, extraTagBuffs) {
        const extraIds = (extraTagBuffs || []).map(t => t.buffId);
        const allBuffIds = [...new Set([...ownBuffs, ...libBuffs.map(b => b.buffId), ...extraIds])];
        if (!allBuffIds.length) return '';
        const buffBbMap = {};
        libBuffs.forEach(b => {
            if (!buffBbMap[b.buffId]) buffBbMap[b.buffId] = [];
            (b.blackboard || []).forEach(bb => {
                if (!buffBbMap[b.buffId].find(x => x.key === bb.key)) buffBbMap[b.buffId].push(bb);
            });
        });
        (extraTagBuffs || []).forEach(t => {
            if (!buffBbMap[t.buffId]) buffBbMap[t.buffId] = [];
            (t.blackboard || []).forEach(bb => {
                if (!buffBbMap[t.buffId].find(x => x.key === bb.key)) buffBbMap[t.buffId].push(bb);
            });
        });
        function bbVal(bbEntry) {
            return bbEntry.valueFloat ?? bbEntry.valueDouble ?? bbEntry.value ?? 0;
        }
        return `<div class="v2d-enemy-buffs v2cc-current-buffs">${allBuffIds.map(id => {
            const bb = buffBbMap[id] || [];
            const buff = ccBuffCache[id];
            const attrMods = buff?.attributeModifier?.attributeModifiers || [];
            const rows = [];
            attrMods.forEach(mod => {
                const label = mod.attributeType;
                const formula = mod.formulaItem;
                let val;
                if (mod.param.useBlackboardKey && mod.param.blackboardKey) {
                    const bbEntry = bb.find(b => b.key === mod.param.blackboardKey);
                    val = bbEntry ? bbVal(bbEntry) : mod.param.value;
                } else { val = mod.param.value; }
                const pctTypes = ['Multiplier', 'FinalMultiplier', 'BaseMultiplier', 'BaseFinalMultiplier'];
                const directMultiplierTypes = ['FinalMultiplier', 'BaseFinalMultiplier'];
                const displayVal = directMultiplierTypes.includes(formula) ? val - 1 : val;
                const display = pctTypes.includes(formula) ? `${(displayVal * 100).toFixed(0)}%` : val;
                const converted = directMultiplierTypes.includes(formula);
                const valueHtml = window.renderRawValueTip ? window.renderRawValueTip(display, converted ? {
                    name: mod.param.blackboardKey || label,
                    rawValue: val,
                    value: displayVal,
                    changed: true,
                    formula: `${val} - 1 = ${displayVal}`
                } : val, converted ? undefined : (mod.param.blackboardKey || label)) : display;
                rows.push(`${escapeHtml(label)} ${escapeHtml(formula)} ${valueHtml}`);
            });
            bb.forEach(b => {
                if (!attrMods.find(m => m.param.useBlackboardKey && m.param.blackboardKey === b.key)) {
                    const rawVal = bbVal(b);
                    const valueHtml = window.renderRawValueTip ? window.renderRawValueTip(rawVal, rawVal, b.key) : rawVal;
                    rows.push(`${escapeHtml(b.key)}: ${valueHtml}`);
                }
            });
            const isCcTag = extraIds.includes(id);
            const cls = isCcTag ? 'v2d-buff-tag v2d-has-tip cc-tag-buff' : 'v2d-buff-tag v2d-has-tip';
            if (rows.length === 0) return `<span class="${isCcTag ? 'v2d-buff-tag cc-tag-buff' : 'v2d-buff-tag'}">${escapeHtml(id)}</span>`;
            const tipHtml = rows.map(r => `<div>${r}</div>`).join('');
            return `<span class="${cls}">${escapeHtml(id)}<span class="v2d-buff-tip">${tipHtml}</span></span>`;
        }).join('')}</div>`;
    }

    function renderCcEnemyCard(enemyId, enemyLevel, dungeonId, dungeonData, libraryBuffs, scriptedBuffs) {
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
        const libBuffs = [...(libraryBuffs || []), ...(window.AKECombatData?.staticEnemyBuffs(dungeonData, enemyId, enemyLevel) || [])];
        const ownBuffModifiers = ownBuffs.flatMap(id => getBuffModifiers(id, []));
        const libraryBuffModifiers = libBuffs.flatMap(b => getBuffModifiers(b.buffId, b.blackboard));
        const buffModifiers = [...ownBuffModifiers, ...libraryBuffModifiers];
        const allModifiers = [...inlineModifiers, ...buffModifiers];
        const scriptModifiers = (scriptedBuffs || []).flatMap(b => getBuffModifiers(b.buffId, b.blackboard));

        const flags = [];
        if (enemyConfig.isDangerous) flags.push(`<span class="v2d-enemy-flag danger">${t('enemyFlags.dangerous')}</span>`);
        if (enemyConfig.showBigEffect) flags.push(`<span class="v2d-enemy-flag big-effect">${t('enemyFlags.globalEffect')}</span>`);
        if (enemyConfig.showBigHeadbar) flags.push(`<span class="v2d-enemy-flag big-headbar">${t('enemyFlags.pinnedHealthBar')}</span>`);

        const statResult = getEnemyStatDetailsAtLevel(attrData, enemyLevel, allModifiers);
        const stats = statResult?.values || {};
        const scriptResult = scriptModifiers.length ? getEnemyStatDetailsAtLevel(attrData, enemyLevel, [...allModifiers, ...scriptModifiers]) : null;
        const scriptStats = scriptResult?.values || null;
        const changedScriptStats = scriptStats ? Object.fromEntries(Object.entries(scriptStats).filter(([key, val]) => val !== stats?.[key])) : {};
        let statsHtml = '';
        if (stats && Object.keys(stats).length > 0) {
            statsHtml = '<div class="v2d-attr-grid">';
            Object.entries(stats).forEach(([key, val]) => {
                statsHtml += `<div class="v2d-attr-item"><span class="v2d-attr-key">${key}</span><span class="v2d-attr-val">${formatStatValue(val, statResult.details[key])}</span></div>`;
            });
            statsHtml += '</div>';
        }

        const showHidden = getCurrentShowHidden();
        const buffTagsHtml = showHidden
            ? buildEnemyBuffTagsHtml(ownBuffs, libBuffs, [])
            : renderModifierSources([
                ['出生加成', [...inlineModifiers, ...ownBuffModifiers]],
                ['buff加成', libraryBuffModifiers],
                ['副本加成', scriptModifiers]
            ]);
        const scriptBuffTagsHtml = showHidden && (scriptedBuffs || []).length ? `<div class="v2d-enemy-buffs">${scriptedBuffs.map(row => `<span class="v2d-buff-tag v2d-script-buff v2d-has-tip">${escapeHtml(row.buffId)}<small>脚本</small><span class="v2d-buff-tip"><div>条件性脚本 Buff · LevelScript ${escapeHtml(row.scriptId)}</div></span></span>`).join('')}</div>` : '';

        return `
            <div class="v2d-enemy-card" data-dungeon-id="${escapeHtml(dungeonId)}" data-enemy-id="${enemyId}" data-enemy-level="${enemyLevel}" data-lib-buffs='${JSON.stringify(libBuffs)}' data-script-buffs='${JSON.stringify(scriptedBuffs || [])}'>
                <div class="v2d-enemy-header">
                    <img class="v2d-enemy-icon" src="${iconSrc}" onerror="this.onerror=null; this.src='';">
                    <div class="v2d-enemy-title">
                        <span class="v2d-enemy-name">${escapeHtml(name)}</span>
                        ${nickname && nickname !== name ? `<span class="v2d-enemy-nick">${escapeHtml(nickname)}</span>` : ''}
                    </div>
                    <span class="v2d-enemy-level">Lv.${enemyLevel}</span>
                </div>
                ${desc ? `<div class="v2d-enemy-desc">${parseText(desc)}</div>` : ''}
                ${buffTagsHtml}
                ${scriptBuffTagsHtml}
                ${flags.length ? `<div class="v2d-enemy-flags">${flags.join('')}</div>` : ''}
                ${statsHtml}
                ${Object.keys(changedScriptStats).length ? `<div class="v2d-script-stats"><b>脚本 Buff 生效时</b>${Object.entries(changedScriptStats).map(([key, val]) => `<span>${escapeHtml(key)} ${formatAttrVal(stats[key])} → ${formatStatValue(val, scriptResult.details[key])}</span>`).join('')}</div>` : ''}
            </div>
        `;
    }

    function parseDungeonWaves(dungeon) {
        const sc = dungeon.SpawnerConfig;
        if (!sc || Object.keys(sc).length === 0) return null;
        const enemyTable = dungeon.enemyTable || {};
        const displayTable = dungeon.enemyTemplateDisplayInfoTable || {};
        const attrTable = dungeon.enemyAttributeTemplateTable || {};
        const allSpawners = [];
        Object.entries(sc).forEach(([configId, spawner]) => {
            const libMap = {};
            (spawner.enemyLibrary || []).forEach(lib => {
                libMap[lib.key] = lib;
            });
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

    function renderSpawnMap(spawner) {
        const waves = spawner.waves;
        if (!waves || !waves.length) return '';

        let allX = [], allZ = [];
        waves.forEach(w => {
            (w.groups || []).forEach(g => {
                g.spawns.forEach(s => {
                    allX.push(s.position.x);
                    allZ.push(s.position.z);
                });
            });
        });
        const pad = 2;
        const halfX = Math.max(Math.abs(Math.min(...allX)), Math.abs(Math.max(...allX))) + pad;
        const halfZ = Math.max(Math.abs(Math.min(...allZ)), Math.abs(Math.max(...allZ))) + pad;
        const minX = -halfX, maxX = halfX, minZ = -halfZ, maxZ = halfZ;
        const rangeX = maxX - minX || 1, rangeZ = maxZ - minZ || 1;

        function toPct(x, z) {
            return { left: ((x - minX) / rangeX * 100).toFixed(1), top: ((maxZ - z) / rangeZ * 100).toFixed(1) };
        }

        let mapSpotsHtml = '';
        waves.forEach((w, wi) => {
            const vis = wi === 0 ? '' : 'display:none;';

            const allSpawns = [];
            (w.groups || []).forEach((g, gi) => {
                const modeKey = { 'Parallel': 'parallel', 'Sequence': 'sequence', 'PartKilled': 'partKilled', 'AllKilled': 'allKilled', 'Deadline': 'deadline' }[g.groupMode];
                const modeLabel = modeKey ? t(`spawnModes.${modeKey}`) : g.groupMode;
                let conditionText = '';
                let targetGroupKey = '';
                if (g.groupMode === 'PartKilled' && g.groupModeTargetKey) {
                    conditionText = t('spawnConditions.partKilled', { group: g.groupModeTargetKey, count: g.groupModeKillCount });
                    targetGroupKey = g.groupModeTargetKey;
                } else if (g.groupMode === 'AllKilled' && g.groupModeTargetKey) {
                    conditionText = t('spawnConditions.allKilled', { group: g.groupModeTargetKey });
                    targetGroupKey = g.groupModeTargetKey;
                }
                g.spawns.forEach(spawn => {
                    allSpawns.push({ spawn, group: g, modeLabel, conditionText, targetGroupKey });
                });
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
                    `<b>${escapeHtml(spawn.name)} ×${spawn.count} Lv.${spawn.level}</b>`,
                    t('spawn.coordinates', { position: posStr, radius: randomStr }),
                    t('spawn.groupMode', { group: g.groupKey, mode: modeLabel, condition: conditionText ? ' · ' + conditionText : '' }),
                    [delayStr, intervalStr, warnStr, faceStr].filter(Boolean).join(' · ')
                ].filter(Boolean);

                const offsetPct = (0.3 * 100 / (2 * halfX)).toFixed(2);
                const stackStyle = stackIdx > 0
                    ? `margin-left:${stackIdx * offsetPct}%;margin-top:-${stackIdx * offsetPct}%;z-index:${10 - stackIdx};`
                    : 'z-index:10;';

                mapSpotsHtml += `<div class="v2cc-map-spot" data-wave="${wi}" data-group="${g.groupKey}" data-target-group="${targetGroupKey}" style="left:${pct.left}%;top:${pct.top}%;${vis}${stackStyle}">
                    <img class="v2cc-map-spot-icon" src="/public/images/enemy/monstericonbig/${spawn.templateId}.png" onerror="this.style.display='none'">
                    <div class="v2cc-map-tip">${tipLines.map(l => `<div>${l}</div>`).join('')}</div>
                </div>`;
            });
        });

        const coordInfo = `<div class="v2cc-map-coords">X: ${minX.toFixed(0)} ~ ${maxX.toFixed(0)}  Z: ${minZ.toFixed(0)} ~ ${maxZ.toFixed(0)}</div>`;
        const unitPct = (100 / (2 * halfX)).toFixed(2);

        return `<div class="v2cc-spawn-map-container">
            <div class="v2cc-spawn-map" style="--unit:${unitPct}%">
                <div class="v2cc-map-center"></div>
                ${mapSpotsHtml}
            </div>
            ${coordInfo}
        </div>`;
    }

    function renderDungeonSection(dungeonData) {
        if (!dungeonData || !dungeonData.dungeontable) return '';
        const dungeons = dungeonData.dungeontable;
        const dungeonIds = Object.keys(dungeons);
        if (!dungeonIds.length) return '';

        let html = '';
        dungeonIds.forEach(dgId => {
            const dg = dungeons[dgId];
            const name = dg.dungeonName?.text || dgId;
            const desc = dg.dungeonDesc?.text ? parseText(dg.dungeonDesc.text) : '';
            const featureDesc = dg.featureDesc?.text ? parseText(dg.featureDesc.text) : '';
            const recommendLv = dg.recommendLv || '?';

            const waveSpawners = parseDungeonWaves(dg);

            html += `<div class="v2cc-dungeon-card">
                <div class="v2cc-dungeon-header">
                    <span class="v2cc-dungeon-name">${escapeHtml(name)}</span>
                    <span class="v2cc-dungeon-lv">${t('dungeon.recommendedLevel', { label: commonT('level'), level: recommendLv })}</span>
                </div>
                ${desc ? `<div class="v2cc-dungeon-desc">${desc}</div>` : ''}
                ${featureDesc ? `<div class="v2cc-dungeon-feature">${featureDesc}</div>` : ''}`;

            if (waveSpawners) {
                waveSpawners.sort((a, b) => a.configId.localeCompare(b.configId));
                waveSpawners.forEach((sp, spIdx) => {
                    const mergedWaves = [];
                    sp.waves.forEach(w => {
                        const existing = mergedWaves.find(mw => mw.waveIdx === w.waveIdx);
                        if (existing) {
                            existing.groups.push(...w.groups);
                            existing.enemies.push(...w.enemies);
                            existing.maxAlive += w.maxAlive;
                            if (w.hasPause) existing.hasPause = true;
                            if (w.repeatable) existing.repeatable = true;
                        } else {
                            mergedWaves.push({ ...w, groups: [...w.groups], enemies: [...w.enemies] });
                        }
                    });

                    let totalWaves = mergedWaves.length, totalEnemies = 0;
                    mergedWaves.forEach(w => w.enemies.forEach(e => totalEnemies += e.count));

                    let waveDetailHtml = '';
                    mergedWaves.forEach((wave, wIdx) => {
                        const repeatTag = wave.repeatable ? ` <span class="v2d-wave-repeat">${t('waves.repeatable')}</span>` : '';
                        const aliveTag = wave.maxAlive > 0 ? ` <span class="v2d-wave-alive">${t('waves.aliveLimit', { count: wave.maxAlive })}</span>` : '';
                        const pauseTag = wave.hasPause ? ` <span class="v2d-wave-pause">${t('waves.externallyControlled')}</span>` : '';
                        const enemyParts = wave.enemies.map(e => {
                            const iconSrc = `/public/images/enemy/monstericonbig/${e.templateId}.png`;
                            return `<span class="v2d-wave-enemy" data-wave-idx="${wIdx}" data-enemy-id="${e.instanceId}"><img class="v2d-wave-icon" src="${iconSrc}" onerror="this.style.display='none'"><span class="v2d-wave-ename">${escapeHtml(e.name)}</span> ×${e.count} <span class="v2d-wave-lv">Lv.${e.level}</span></span>`;
                        }).join(' ');
                        const activeCls = wIdx === 0 ? ' active' : '';
                        waveDetailHtml += `<div class="v2d-wave-line${activeCls}" data-wave-idx="${wIdx}"><span class="v2d-wave-num" data-wave-idx="${wIdx}">${t('waves.number', { number: wave.waveIdx })}</span>${repeatTag}${aliveTag}${pauseTag}: ${enemyParts}</div>`;
                    });

                    const mergedSpawner = { ...sp, waves: mergedWaves };
                    const spawnMapHtml = renderSpawnMap(mergedSpawner);

                    const enemyLibBuffs = {};
                    const scriptedBuffs = dg.ScriptBuffsBySpawner?.[sp.configId] || [];
                    sp.waves.forEach(wave => {
                        wave.enemies.forEach(e => {
                            if (!enemyLibBuffs[e.instanceId]) enemyLibBuffs[e.instanceId] = [];
                            e.bornBuffList.forEach(b => {
                                if (!enemyLibBuffs[e.instanceId].find(x => x.buffId === b.buffId))
                                    enemyLibBuffs[e.instanceId].push(b);
                            });
                        });
                    });

                    const seenEnemies = new Set();
                    const uniqueEnemies = [];
                    sp.waves.forEach(wave => {
                        wave.enemies.forEach(e => {
                            if (!seenEnemies.has(e.instanceId)) {
                                seenEnemies.add(e.instanceId);
                                uniqueEnemies.push(e);
                            }
                        });
                    });

                    let enemiesHtml = '';
                    if (uniqueEnemies.length > 0) {
                        enemiesHtml = '<div class="v2d-enemy-list">';
                        uniqueEnemies.forEach(e => {
                            enemiesHtml += renderCcEnemyCard(e.instanceId, e.level, dgId, dg, enemyLibBuffs[e.instanceId] || [], scriptedBuffs);
                        });
                        enemiesHtml += '</div>';
                    }

                    const collapsed = spIdx > 0 ? ' collapsed' : '';
                    html += `<div class="v2cc-spawner-block${collapsed}">
                        <div class="v2cc-spawner-title" onclick="this.parentElement.classList.toggle('collapsed')">
                            <span class="v2cc-spawner-toggle">▼</span>
                            ${t('waves.configuration', { number: spIdx + 1 })}
                            <span class="v2cc-spawner-id">${escapeHtml(sp.configId)}</span>
                            <span class="v2cc-spawner-brief">${t('waves.brief', { waves: totalWaves, enemies: totalEnemies })}</span>
                        </div>
                        <div class="v2cc-spawner-body">
                            <div class="v2cc-wave-map-row">
                                <div class="v2d-wave-section">
                                    <div class="v2d-wave-summary"><span class="v2d-wave-label">${t('waves.summaryLabel')}</span> ${t('waves.summary', { waves: totalWaves, enemies: totalEnemies })}</div>
                                    <div class="v2d-wave-detail">${waveDetailHtml}</div>
                                </div>
                                ${spawnMapHtml}
                            </div>
                            ${enemiesHtml}
                        </div>
                    </div>`;
                });
            } else {
                const enemyIds = dg.enemyIds || [];
                const enemyLevels = dg.enemyLevels || [];
                if (enemyIds.length > 0) {
                    html += `<div class="v2d-enemy-list">`;
                    enemyIds.forEach((eid, idx) => {
                        html += renderCcEnemyCard(eid, enemyLevels[idx] || recommendLv, dg, []);
                    });
                    html += '</div>';
                }
            }

            html += '<div class="v2cc-cc-tags"></div></div>';
        });
        return html;
    }

    function renderDetail(data, game) {
        const acc = data.activitycontingencycontracttable;
        const cct = data.contingencycontracttable;
        const tagTable = data.cctagtable || {};
        const title = game.gameId;
        const tagCount = Object.keys(tagTable).length;
        const groupCount = cct && cct.contractGroupMap ? Object.keys(cct.contractGroupMap).length : 0;

        let html = `
            <div class="v2cc-detail-container">
                <div class="v2cc-header">
                    <div class="v2cc-header-icon">⚔️</div>
                    <div class="v2cc-header-text">
                        <div class="v2cc-title">${escapeHtml(title)}</div>
                        ${getCurrentShowHidden() ? `<div class="v2cc-subtitle">${t('detail.subtitle', { activity: escapeHtml(game.activityId), groups: groupCount, terms: tagCount })}</div>` : ''}
                    </div>
                </div>
                ${renderActivityInfo(acc)}
                ${renderContractGroups(cct, tagTable)}
                <div class="v2cc-section" id="v2ccSelectedSummary"></div>
                ${currentDungeonData ? `<div class="v2cc-section"><h3>${t('sections.dungeonEnemies')}</h3>${renderDungeonSection(currentDungeonData)}</div>` : ''}
                ${currentDungeonError ? `<div class="v2cc-section"><h3>${t('sections.dungeonEnemies')}</h3><div class="v2cc-error">${t('dungeon.loadFailed', { message: escapeHtml(currentDungeonError.message) })}</div></div>` : ''}
                ${renderLevelRewards(data)}
                ${renderShopSection(data)}
                ${renderTaskGroups(data)}
            </div>
        `;
        return html;
    }

    function updateSelectedSummary(tagTable) {
        const container = document.getElementById('v2ccSelectedSummary');
        if (!container) return;
        if (selectedTagIds.size === 0) {
            container.innerHTML = '';
            return;
        }
        const allValueMaps = buildAllTagValueMaps(tagTable);
        const items = Array.from(selectedTagIds).map(tid => {
            const td = tagTable[tid];
            if (!td) return '';
            const name = td.name?.text || `Tag ${tid}`;
            const bbMap = buildBlackboardValueMap(td.tagTerms || []);
            const desc = replacePlaceholders(td.desc?.text || '', bbMap, allValueMaps);
            const score = td.score ?? 0;
            return `
                <div class="v2cc-selected-row">
                    <span class="v2cc-selected-name">${escapeHtml(name)}</span>
                    <span class="v2cc-selected-score">+${score}</span>
                    ${desc ? `<span class="v2cc-selected-desc">${desc}</span>` : ''}
                </div>
            `;
        }).join('');
        container.innerHTML = `
            <h3>${t('sections.selectedTermDetails')}</h3>
            <div class="v2cc-selected-list">${items}</div>
        `;
    }

    function getSelectedTagEnemyModifiers() {
        if (!currentData) return { modifiers: [], tagBuffs: [] };
        const tagTable = currentData.cctagtable || {};
        const modifiers = [];
        const tagBuffs = [];
        selectedTagIds.forEach(tid => {
            const td = tagTable[tid];
            if (!td || !td.tagTerms) return;
            const tagName = td.name?.text || `Tag ${tid}`;
            td.tagTerms.forEach(term => {
                if (term.termType !== 1) return;
                const bb = {};
                (term.blackboard || []).forEach(b => { bb[b.key] = b.value; });
                const buff = ccBuffCache[term.buffId];
                if (!buff?.attributeModifier?.attributeModifiers?.length) return;
                buff.attributeModifier.attributeModifiers.forEach(mod => {
                    const attrType = ccAttrNameToId[mod.attributeType];
                    if (attrType === undefined) return;
                    const mt = FORMULA_TO_MODTYPE[mod.formulaItem];
                    if (mt === undefined) return;
                    let val;
                    if (mod.param.useBlackboardKey && mod.param.blackboardKey) {
                        val = bb[mod.param.blackboardKey] ?? mod.param.value;
                    } else { val = mod.param.value; }
                    modifiers.push({ attrType, attrValue: val, modifierType: mt });
                    const attrName = ccAttrMap[attrType] || t('attributeFallback', { type: attrType });
                    const formulaName = mod.formulaItem;
                    tagBuffs.push({ tagName, attrName, formulaName, value: val });
                });
            });
        });
        return { modifiers, tagBuffs };
    }

    function refreshDungeonEnemyStats() {
        if (!currentDungeonData) return;
        const enemyLists = document.querySelectorAll('.v2cc-dungeon-card .v2d-enemy-list');
        if (!enemyLists.length) return;

        const dungeons = currentDungeonData.dungeontable || {};
        const { modifiers: tagModifiers } = getSelectedTagEnemyModifiers();

        const ccTagBuffs = [];
        selectedTagIds.forEach(tid => {
            const td = (currentData.cctagtable || {})[tid];
            if (!td || !td.tagTerms) return;
            td.tagTerms.forEach(term => {
                if (term.termType !== 1) return;
                ccTagBuffs.push({ buffId: term.buffId, blackboard: term.blackboard || [] });
            });
        });

        enemyLists.forEach(list => {
            list.querySelectorAll('.v2d-enemy-card').forEach(card => {
                const dg = dungeons[card.dataset.dungeonId] || dungeons[Object.keys(dungeons)[0]];
                if (!dg) return;
                const enemyId = card.dataset.enemyId;
                const enemyLevel = parseInt(card.dataset.enemyLevel, 10) || 60;
                if (!enemyId) return;

                const enemyConfig = dg.enemyTable?.[enemyId] || {};
                const attrTable = dg.enemyAttributeTemplateTable || {};
                const attrTemplateId = enemyConfig.attrTemplateId || findTemplateId(enemyId, attrTable);
                const attrData = attrTable[attrTemplateId] || {};
                const inlineModifiers = enemyConfig.attrModifiers || [];

                const libBuffs = JSON.parse(card.dataset.libBuffs || '[]');
                const ownBuffs = enemyConfig.bornBuffs || [];
                const ownBuffModifiers = ownBuffs.flatMap(id => getBuffModifiers(id, []));
                const libraryBuffModifiers = libBuffs.flatMap(b => getBuffModifiers(b.buffId, b.blackboard));
                const buffModifiers = [...ownBuffModifiers, ...libraryBuffModifiers];
                const allModifiers = [...inlineModifiers, ...buffModifiers, ...tagModifiers];
                const scriptBuffs = JSON.parse(card.dataset.scriptBuffs || '[]');
                const scriptModifiers = scriptBuffs.flatMap(b => getBuffModifiers(b.buffId, b.blackboard));

                const statResult = getEnemyStatDetailsAtLevel(attrData, enemyLevel, allModifiers);
                const stats = statResult?.values || {};
                const attrGrid = card.querySelector('.v2d-attr-grid');
                if (attrGrid && stats) {
                    let statsHtml = '';
                    Object.entries(stats).forEach(([key, val]) => {
                        statsHtml += `<div class="v2d-attr-item"><span class="v2d-attr-key">${key}</span><span class="v2d-attr-val">${formatStatValue(val, statResult.details[key])}</span></div>`;
                    });
                    attrGrid.innerHTML = statsHtml;
                }
                const scriptResult = scriptModifiers.length ? getEnemyStatDetailsAtLevel(attrData, enemyLevel, [...allModifiers, ...scriptModifiers]) : null;
                const scriptStats = scriptResult?.values || null;
                const changedScriptStats = scriptStats ? Object.fromEntries(Object.entries(scriptStats).filter(([key, val]) => val !== stats?.[key])) : {};
                const scriptStatsEl = card.querySelector('.v2d-script-stats');
                const scriptStatsHtml = Object.keys(changedScriptStats).length ? `<div class="v2d-script-stats"><b>脚本 Buff 生效时</b>${Object.entries(changedScriptStats).map(([key, val]) => `<span>${escapeHtml(key)} ${formatAttrVal(stats[key])} → ${formatStatValue(val, scriptResult.details[key])}</span>`).join('')}</div>` : '';
                if (scriptStatsEl) scriptStatsEl.outerHTML = scriptStatsHtml;
                else if (scriptStatsHtml) card.insertAdjacentHTML('beforeend', scriptStatsHtml);

                const newBuffTagsHtml = getCurrentShowHidden()
                    ? buildEnemyBuffTagsHtml(ownBuffs, libBuffs, ccTagBuffs)
                    : renderModifierSources([
                        ['出生加成', [...inlineModifiers, ...ownBuffModifiers]],
                        ['buff加成', libraryBuffModifiers],
                        ['副本加成', scriptModifiers],
                        ['词条加成', tagModifiers]
                    ]);
                const oldBuffTags = card.querySelector('.v2cc-current-buffs');
                if (newBuffTagsHtml) {
                    if (oldBuffTags) {
                        oldBuffTags.outerHTML = newBuffTagsHtml;
                    } else {
                        const flagsEl = card.querySelector('.v2d-enemy-flags');
                        const statsEl = card.querySelector('.v2d-attr-grid');
                        const refEl = flagsEl || statsEl;
                        if (refEl) refEl.insertAdjacentHTML('beforebegin', newBuffTagsHtml);
                    }
                } else if (oldBuffTags) {
                    oldBuffTags.remove();
                }
            });
        });

        const tagTable = currentData.cctagtable || {};
        const allValueMaps = buildAllTagValueMaps(tagTable);
        const ccTagDescs = [];
        selectedTagIds.forEach(tid => {
            const td = tagTable[tid];
            if (!td || !td.tagTerms) return;
            const hasEnemyTerm = td.tagTerms.some(t => t.termType === 1);
            if (!hasEnemyTerm) return;
            const tagName = td.name?.text || `Tag ${tid}`;
            const bbMap = buildBlackboardValueMap(td.tagTerms || []);
            const desc = replacePlaceholders(td.desc?.text || '', bbMap, allValueMaps);
            ccTagDescs.push({ tagName, desc });
        });

        document.querySelectorAll('.v2cc-cc-tags').forEach(container => {
            if (ccTagDescs.length) {
                container.innerHTML = ccTagDescs.map(d =>
                    `<div class="v2cc-cc-tag-line"><span class="v2cc-cc-tag-name">${parseText(d.tagName)}</span>${d.desc ? `<span class="v2cc-cc-tag-desc">${d.desc}</span>` : ''}</div>`
                ).join('');
                container.style.display = '';
            } else {
                container.innerHTML = '';
                container.style.display = 'none';
            }
        });
    }

    function refreshInteractiveSection() {
        if (!currentData || !currentGame) return;
        const cct = currentData.contingencycontracttable;
        const tagTable = currentData.cctagtable || {};
        if (!cct) return;
        const allTags = getAllContractTags(cct);

        const totalEl = document.querySelector('.v2cc-score-panel-value');
        const countEl = document.querySelector('.v2cc-score-panel-count');
        if (totalEl) totalEl.textContent = computeTotalScore(selectedTagIds, tagTable);
        if (countEl) countEl.textContent = t('score.selectedTerms', { count: selectedTagIds.size });

        document.querySelectorAll('.v2cc-tag-card[data-tag-id]').forEach(card => {
            const tid = card.dataset.tagId;
            const tag = allTags[tid];
            if (!tag) return;
            const tagData = tagTable[String(tag.tagId)] || {};
            const isSelected = selectedTagIds.has(tid);
            const selCheck = isTagSelectable(tid, selectedTagIds, allTags);
            const stateClass = isSelected ? 'selected' : (selCheck.ok ? 'selectable' : 'locked');

            card.classList.remove('selected', 'selectable', 'locked');
            card.classList.add(stateClass);

            const checkEl = card.querySelector('.v2cc-tag-check');
            if (checkEl) checkEl.textContent = isSelected ? '\u2713' : '';

            const badges = card.querySelectorAll('.v2cc-tag-badge');
            const heldKeys = getAvailableKeys(selectedTagIds, allTags);
            badges.forEach(badge => {
                const text = badge.textContent;
                if (badge.classList.contains('key') && tag.keyId) {
                    badge.classList.toggle('held', heldKeys.has(tag.keyId));
                }
                if (badge.classList.contains('lock') && tag.lockIds) {
                    tag.lockIds.forEach(lid => {
                        if (text.includes(lid)) badge.classList.toggle('held', heldKeys.has(lid));
                    });
                }
                if (badge.classList.contains('conflict') && tag.conflictId) {
                    let conflictWith = '';
                    for (const sid of selectedTagIds) {
                        if (sid === tid) continue;
                        const st = allTags[sid];
                        if (st && st.conflictId === tag.conflictId) { conflictWith = sid; break; }
                    }
                    badge.classList.toggle('active-conflict', !!conflictWith);
                    const conflictText = conflictWith
                        ? t('contract.conflictWith', { conflict: escapeHtml(tag.conflictId), tag: escapeHtml(conflictWith) })
                        : t('contract.conflict', { conflict: escapeHtml(tag.conflictId) });
                    badge.innerHTML = '<span class="badge-dot"></span>' + conflictText;
                }
            });

            let lockReasonEl = card.querySelector('.v2cc-tag-lock-reason');
            if (!isSelected && !selCheck.ok) {
                if (!lockReasonEl) {
                    lockReasonEl = document.createElement('div');
                    lockReasonEl.className = 'v2cc-tag-lock-reason';
                    card.appendChild(lockReasonEl);
                }
                lockReasonEl.textContent = selCheck.reason;
            } else if (lockReasonEl) {
                lockReasonEl.remove();
            }
        });

        updateSelectedSummary(tagTable);
        refreshDungeonEnemyStats();
    }

    function bindTagEvents() {
        const cct = currentData ? currentData.contingencycontracttable : null;
        if (!cct) return;
        const allTags = getAllContractTags(cct);

        document.querySelectorAll('.v2cc-tag-card[data-tag-id]').forEach(card => {
            card.addEventListener('click', () => {
                const tid = card.dataset.tagId;
                if (selectedTagIds.has(tid)) {
                    selectedTagIds.delete(tid);
                    cascadeDeselect(selectedTagIds, allTags);
                } else {
                    const check = isTagSelectable(tid, selectedTagIds, allTags);
                    if (!check.ok) return;
                    selectedTagIds.add(tid);
                }
                refreshInteractiveSection();
            });

            card.addEventListener('mouseenter', () => {
                const tid = card.dataset.tagId;
                if (card.classList.contains('locked')) {
                    const tag = allTags[tid];
                    if (!tag) return;
                    if (tag.conflictId) {
                        document.querySelectorAll('.v2cc-tag-card[data-tag-id]').forEach(other => {
                            if (other === card) return;
                            const oTag = allTags[other.dataset.tagId];
                            if (oTag && oTag.conflictId === tag.conflictId) {
                                other.classList.add('highlight-conflict');
                            }
                        });
                    }
                    if (tag.lockIds && tag.lockIds.length > 0) {
                        document.querySelectorAll('.v2cc-tag-card[data-tag-id]').forEach(other => {
                            if (other === card) return;
                            const oTag = allTags[other.dataset.tagId];
                            if (oTag && oTag.keyId && tag.lockIds.includes(oTag.keyId)) {
                                other.classList.add('highlight-key');
                            }
                        });
                    }
                }
            });

            card.addEventListener('mouseleave', () => {
                document.querySelectorAll('.highlight-conflict, .highlight-key').forEach(el => {
                    el.classList.remove('highlight-conflict', 'highlight-key');
                });
            });
        });

        const resetBtn = document.getElementById('v2ccResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                selectedTagIds.clear();
                refreshInteractiveSection();
            });
        }
    }

    async function refreshModule() {
        const list = document.getElementById('v2ccList');
        const detail = document.getElementById('v2ccDetail');
        if (!list || !detail) return;

        const showHidden = getCurrentShowHidden();
        allGames = await loadGameManifest(showHidden);
        renderGameList();
    }

    async function initModule() {
        if (isInitialized) return;
        isInitialized = true;
        if (window.configLoaded) await window.configLoaded;

        if (mobileBtn) mobileBtn.addEventListener('click', openMobileList);
        if (mobileOverlay) mobileOverlay.addEventListener('click', (e) => {
            if (e.target === mobileOverlay) closeMobileList();
        });

        window.addEventListener('globalConfigChanged', () => {
            searchTerm = '';
            const si = document.getElementById('v2ccSearchInput');
            if (si) si.value = '';
            refreshModule();
        });

        document.getElementById('v2ccSearchInput')?.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            renderGameList();
        });

        function adjustTipPosition(spot, map) {
            const tip = spot.querySelector('.v2cc-map-tip');
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

        function switchWave(wi, spawnerBody) {
            const map = spawnerBody.querySelector('.v2cc-spawn-map');
            if (!map) return;
            spawnerBody.querySelectorAll('.v2d-wave-line').forEach(l => {
                l.classList.toggle('active', l.dataset.waveIdx === wi);
            });
            map.querySelectorAll('.v2cc-map-spot').forEach(spot => {
                spot.style.display = spot.dataset.wave === wi ? '' : 'none';
            });
        }

        function clearHighlights(spawnerBody) {
            if (!spawnerBody) return;
            spawnerBody.querySelectorAll('.v2cc-map-spot').forEach(s => {
                s.classList.remove('group-highlight', 'target-highlight');
            });
            spawnerBody.querySelectorAll('.v2d-wave-enemy').forEach(e => {
                e.classList.remove('enemy-highlight', 'enemy-target-highlight');
            });
        }

        function highlightGroup(spawnerBody, groupKey, targetGroup, map) {
            if (!spawnerBody || !map) return;
            map.querySelectorAll('.v2cc-map-spot').forEach(s => {
                if (s.dataset.group === groupKey) s.classList.add('group-highlight');
                if (targetGroup && s.dataset.group === targetGroup) s.classList.add('target-highlight');
            });
            const activeWave = map.querySelector('.v2cc-map-spot[data-wave]:not([style*="display:none"])');
            const wi = activeWave ? activeWave.dataset.wave : null;
            spawnerBody.querySelectorAll('.v2d-wave-enemy').forEach(e => {
                if (wi !== null && e.dataset.waveIdx !== wi) return;
                const line = e.closest('.v2d-wave-line');
                if (!line) return;
                const spots = map.querySelectorAll(`.v2cc-map-spot[data-wave="${wi}"][data-group="${groupKey}"]`);
                if (spots.length && e.dataset.enemyId === spots[0].dataset.group) {
                    e.classList.add('enemy-highlight');
                }
            });
        }

        document.addEventListener('click', (e) => {
            const waveLine = e.target.closest('.v2d-wave-line');
            if (waveLine) {
                const spawnerBody = waveLine.closest('.v2cc-spawner-body');
                if (!spawnerBody) return;
                const wi = waveLine.dataset.waveIdx;
                if (wi !== undefined) switchWave(wi, spawnerBody);
                return;
            }

            const waveEnemy = e.target.closest('.v2d-wave-enemy');
            if (waveEnemy) {
                const spawnerBody = waveEnemy.closest('.v2cc-spawner-body');
                if (!spawnerBody) return;
                const wi = waveEnemy.dataset.waveIdx;
                const eid = waveEnemy.dataset.enemyId;
                if (wi !== undefined) {
                    switchWave(wi, spawnerBody);
                    const map = spawnerBody.querySelector('.v2cc-spawn-map');
                    if (map) {
                        clearHighlights(spawnerBody);
                        map.querySelectorAll(`.v2cc-map-spot[data-wave="${wi}"]`).forEach(spot => {
                            if (spot.dataset.group) {
                                const spots = map.querySelectorAll(`.v2cc-map-spot[data-wave="${wi}"][data-group="${spot.dataset.group}"]`);
                                if (spots.length) {
                                    const icon = spots[0].querySelector('.v2cc-map-spot-icon');
                                    if (icon && icon.src && icon.src.includes(eid)) {
                                        spots.forEach(s => s.classList.add('group-highlight'));
                                    }
                                }
                            }
                        });
                    }
                }
                return;
            }
        });

        document.addEventListener('mouseover', (e) => {
            const spot = e.target.closest('.v2cc-map-spot');
            if (spot) {
                const map = spot.closest('.v2cc-spawn-map');
                const spawnerBody = spot.closest('.v2cc-spawner-body');
                if (!map) return;
                adjustTipPosition(spot, map);

                const groupKey = spot.dataset.group;
                const targetGroup = spot.dataset.targetGroup;
                const wi = spot.dataset.wave;
                map.querySelectorAll('.v2cc-map-spot').forEach(s => {
                    s.classList.remove('group-highlight', 'target-highlight');
                    if (s.dataset.group === groupKey && s !== spot) s.classList.add('group-highlight');
                    if (targetGroup && s.dataset.group === targetGroup) s.classList.add('target-highlight');
                });
                if (spawnerBody) {
                    spawnerBody.querySelectorAll(`.v2d-wave-enemy[data-wave-idx="${wi}"]`).forEach(we => {
                        const iconSrc = we.querySelector('.v2d-wave-icon')?.src || '';
                        const spotIconSrc = spot.querySelector('.v2cc-map-spot-icon')?.src || '';
                        if (iconSrc && spotIconSrc && iconSrc === spotIconSrc) {
                            we.classList.add('enemy-highlight');
                        }
                    });
                }
                return;
            }

            const waveEnemy = e.target.closest('.v2d-wave-enemy');
            if (waveEnemy) {
                const spawnerBody = waveEnemy.closest('.v2cc-spawner-body');
                if (!spawnerBody) return;
                const map = spawnerBody.querySelector('.v2cc-spawn-map');
                if (!map) return;
                const wi = waveEnemy.dataset.waveIdx;
                const iconSrc = waveEnemy.querySelector('.v2d-wave-icon')?.src || '';
                map.querySelectorAll(`.v2cc-map-spot[data-wave="${wi}"]`).forEach(spot => {
                    const spotIconSrc = spot.querySelector('.v2cc-map-spot-icon')?.src || '';
                    if (iconSrc && spotIconSrc && iconSrc === spotIconSrc) {
                        spot.classList.add('group-highlight');
                        const groupKey = spot.dataset.group;
                        const targetGroup = spot.dataset.targetGroup;
                        map.querySelectorAll('.v2cc-map-spot').forEach(s => {
                            if (s.dataset.group === groupKey && s !== spot) s.classList.add('group-highlight');
                            if (targetGroup && s.dataset.group === targetGroup) s.classList.add('target-highlight');
                        });
                    }
                });
                waveEnemy.classList.add('enemy-highlight');
                return;
            }
        });

        document.addEventListener('mouseout', (e) => {
            const spot = e.target.closest('.v2cc-map-spot');
            const waveEnemy = e.target.closest('.v2d-wave-enemy');
            if (!spot && !waveEnemy) return;
            const spawnerBody = (spot || waveEnemy)?.closest('.v2cc-spawner-body');
            if (spawnerBody) clearHighlights(spawnerBody);
        });

        await refreshModule();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();
