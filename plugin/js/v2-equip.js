(function() {
        const t = (key, params) => window.akeI18n ? window.akeI18n.t(key, params) : key;
        let allSuits = [];
        let rawAllSuits = [];
        let activeSuitId = null;
        let isInitialized = false;
        let searchTerm = '';
        let attrMap = {};
        let compositeNameMap = {};
        let modifierTypeMap = {};
        let domainMap = {};

        const IMAGE_BASE_PATH = '/public/images/';

        const PART_TYPE_MAP = { 0: '护甲', 1: '护手', 2: '配件' };
        const PART_ICON_MAP = { 0: 'body', 1: 'hand', 2: 'edc' };

        const mobileBtn = document.getElementById('v2equipMobileListBtn');
        const mobileOverlay = document.getElementById('v2equipMobileListOverlay');
        const mobileContent = document.getElementById('v2equipMobileListContent');

        function parseText(text) {
            return window.parseText(text, IMAGE_BASE_PATH);
        }

        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/[&<>]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
        }

        function getCurrentShowHidden() {
            return window.akeData?.getConfig().showHidden ?? false;
        }

        function getAttrName(attrType, compositeAttr) {
            if (compositeAttr && compositeNameMap[compositeAttr]) {
                return compositeNameMap[compositeAttr];
            }
            return attrMap[String(attrType)] || `属性${attrType}`;
        }

        function getDomainName(domainId) {
            return domainMap[domainId] || domainId;
        }

        function formatAttrValue(attrType, val, compositeAttr) {
            if (typeof val !== 'number') return val;
            const name = getAttrName(attrType, compositeAttr);
            const pctKeywords = ['暴击', '伤害加成', '充能', '抗性', '承伤', '减免', '吸血', '增幅', '脆弱', '强度'];
            const isPct = pctKeywords.some(k => name.includes(k)) || Math.abs(val) < 1;
            let display;
            if (isPct && Math.abs(val) < 10) {
                const displayVal = compositeAttr === 'AllDamageTakenScalar' ? 1 - val : val;
                display = (displayVal * 100).toFixed(2) + '%';
                return window.renderRawValueTip ? window.renderRawValueTip(display, val) : display;
            }
            display = Number.isInteger(val) ? val.toString() : val.toFixed(2);
            return window.renderRawValueTip ? window.renderRawValueTip(display, val) : display;
        }

        function getEquipIconSrc(itemId, iconId) {
            if (iconId) return `/public/images/equip/icon/${iconId}.png`;
            return `/public/images/equip/icon/${itemId}.png`;
        }

        function filterSuits(suits) {
            if (!searchTerm) return suits;
            const t = searchTerm.toLowerCase();
            return suits.filter(s =>
                (s.name && s.name.toLowerCase().includes(t)) ||
                (s.suitID && s.suitID.toLowerCase().includes(t))
            );
        }

        function buildMobileList() {
            const filtered = filterSuits(allSuits);
            mobileContent.innerHTML = '';
            filtered.forEach(suit => {
                const div = document.createElement('div');
                div.className = `v2eq-mobile-item ${suit.suitID === activeSuitId ? 'active' : ''}`;
                div.innerHTML = `
                    <div class="v2eq-mobile-name">${escapeHtml(suit.name)}</div>
                    <div class="v2eq-mobile-id">${escapeHtml(suit.suitID)}</div>
                `;
                div.addEventListener('click', () => {
                    activeSuitId = suit.suitID;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_equip', suit.suitID);
                    loadSuitDetail(suit, document.getElementById('v2equipDetail'));
                    closeMobileList();
                    document.querySelectorAll('.v2eq-item').forEach(el => el.classList.remove('active'));
                    const ai = document.querySelector(`.v2eq-item[data-suit-id="${suit.suitID}"]`);
                    if (ai) ai.classList.add('active');
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

        async function loadMaps() {
            try {
                const res = await (window.akeFetch || fetch)(window.akeDataPath?.('/public/CH/maps.json') || '/public/CH/maps.json');
                if (res.ok) {
                    const data = await res.json();
                    attrMap = data.ATTR_MAP || {};
                    compositeNameMap = data.COMPOSITE_NAME_MAP || {};
                    modifierTypeMap = data.MODIFIER_TYPE_MAP || {};
                    domainMap = data.DOMAIN_MAP || {};
                }
            } catch { /* ignore */ }
        }

        async function loadSuitManifest(showHidden) {
            try {
                const res = await (window.akeFetch || fetch)(window.akeDataPath?.('/public/CH/v2_equip/manifest.json') || '/public/CH/v2_equip/manifest.json');
                if (!res.ok) throw new Error('无法加载装备清单');
                const all = await res.json();
                rawAllSuits = all;
                let suits = showHidden ? all : all.filter(s => !s.hidden);
                suits.sort((a, b) => (a.priority || 999) - (b.priority || 999));
                return suits;
            } catch (err) {
                console.error('加载装备清单失败:', err);
                return [];
            }
        }

        function renderSuitList() {
            const container = document.getElementById('v2equipList');
            const detailContainer = document.getElementById('v2equipDetail');
            if (!container) return;

            const filtered = filterSuits(allSuits);
            container.innerHTML = '';

            if (filtered.length === 0) {
                container.innerHTML = `<div class="v2eq-loader">${t('moduleInternal.v2Equip.noMatch')}</div>`;
                if (detailContainer) detailContainer.innerHTML = `<div class="v2eq-loader">${t('moduleInternal.v2Equip.choose')}</div>`;
                activeSuitId = null;
                return;
            }

            filtered.forEach((suit, index) => {
                const div = document.createElement('div');
                div.className = `v2eq-item ${suit.suitID === activeSuitId ? 'active' : (!activeSuitId && index === 0 ? 'active' : '')}`;
                div.dataset.suitId = suit.suitID;

                const rb = document.createElement('span');
                rb.className = `v2eq-rarity-bar rarity-${suit.rarity}`;
                rb.title = t('common.rarityValue', { value: suit.rarity });

                const icon = document.createElement('img');
                icon.className = 'v2eq-item-icon';
                icon.src = suit.icon || '';
                icon.onerror = function() { this.onerror = null; this.src = ''; };

                const info = document.createElement('div');
                info.className = 'v2eq-item-info';
                const nm = document.createElement('div');
                nm.className = 'v2eq-item-name';
                nm.textContent = suit.name;
                const id = document.createElement('div');
                id.className = 'v2eq-item-id';
                id.textContent = suit.suitID;
                info.appendChild(nm);
                info.appendChild(id);

                div.appendChild(rb);
                div.appendChild(icon);
                div.appendChild(info);

                div.addEventListener('click', () => {
                    document.querySelectorAll('.v2eq-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                    activeSuitId = suit.suitID;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_equip', suit.suitID);
                    loadSuitDetail(suit, detailContainer);
                });

                container.appendChild(div);
            });

            if (window.__deepLinkId) {
                const deepItem = filtered.find(c => c.suitID === window.__deepLinkId);
                if (deepItem) {
                    activeSuitId = deepItem.suitID;
                } else {
                    const existsInRaw = rawAllSuits.some(c => c.suitID === window.__deepLinkId);
                    if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                        window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                    }
                }
                window.__deepLinkId = null;
            }

            const activeExists = filtered.some(s => s.suitID === activeSuitId);
            if (!activeExists && filtered.length > 0) {
                activeSuitId = filtered[0].suitID;
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_equip', activeSuitId);
                const f = container.querySelector('.v2eq-item');
                if (f) f.classList.add('active');
                loadSuitDetail(filtered[0], detailContainer);
            } else if (activeExists) {
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_equip', activeSuitId);
                const ai = filtered.find(s => s.suitID === activeSuitId);
                if (ai) {
                    const ad = container.querySelector(`.v2eq-item[data-suit-id="${activeSuitId}"]`);
                    if (ad) ad.classList.add('active');
                    loadSuitDetail(ai, detailContainer);
                }
            }
        }

        function renderSubStatTable(displayAttrModifiers) {
            const showHidden = getCurrentShowHidden();
            const subStats = displayAttrModifiers.filter(m => m.attrIndex > 0);
            if (subStats.length === 0) return '';

            const hasEnhance = subStats.some(m => m.enhancedAttrValues && m.enhancedAttrValues.length > 0);

            let headerCells = '<th>词条</th>';
            if (hasEnhance) {
                headerCells += '<th>基础</th><th>+1</th><th>+2</th><th>+3</th>';
            } else {
                headerCells += '<th>数值</th>';
            }

            let bodyRows = '';
            subStats.forEach(m => {
                const name = getAttrName(m.attrType, m.compositeAttr);
                const baseVal = formatAttrValue(m.attrType, m.attrValue, m.compositeAttr);
                const modType = modifierTypeMap[String(m.modifierType)] || '';
                let cells = `<td>${escapeHtml(name)}`;
                if (showHidden && modType) {
                    cells += `<span class="v2eq-modifier-tag" title="${escapeHtml(modType)}">${modType}</span>`;
                }
                cells += `</td>`;

                if (hasEnhance && m.enhancedAttrValues && m.enhancedAttrValues.length > 0) {
                    cells += `<td class="v2eq-value-cell">${baseVal}</td>`;
                    m.enhancedAttrValues.forEach(v => {
                        cells += `<td class="v2eq-value-cell">${formatAttrValue(m.attrType, v, m.compositeAttr)}</td>`;
                    });
                    const filled = 1 + m.enhancedAttrValues.length;
                    for (let i = filled; i < 4; i++) {
                        cells += `<td class="v2eq-value-cell">-</td>`;
                    }
                } else {
                    cells += `<td class="v2eq-value-cell">${baseVal}</td>`;
                    if (hasEnhance) {
                        for (let i = 1; i < 4; i++) cells += `<td class="v2eq-value-cell">-</td>`;
                    }
                }
                bodyRows += `<tr>${cells}</tr>`;
            });

            return `<table class="v2eq-substat-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>`;
        }

        function renderFormulaBtn(itemId, formulaData, itemTable) {
            if (!formulaData) return '';
            const goldCost = formulaData.costGoldNum || 0;
            const costItems = formulaData.costItemId || [];
            const costNums = formulaData.costItemNum || [];

            let tipHtml = '';
            if (goldCost > 0) {
                const goldName = itemTable[formulaData.costGoldId]?.name?.text || formulaData.costGoldId;
                tipHtml += `<div class="v2eq-cost-item"><img src="/public/images/item/itemicon/${formulaData.costGoldId}.png" onerror="this.style.display='none'"><span class="v2eq-ci-name">${escapeHtml(goldName)}</span><span class="v2eq-ci-cnt">${goldCost.toLocaleString()}</span></div>`;
            }
            costItems.forEach((cid, i) => {
                const num = costNums[i] || 0;
                const cName = itemTable[cid]?.name?.text || cid;
                tipHtml += `<div class="v2eq-cost-item"><img src="/public/images/item/itemicon/${cid}.png" onerror="this.style.display='none'"><span class="v2eq-ci-name">${escapeHtml(cName)}</span><span class="v2eq-ci-cnt">×${num}</span></div>`;
            });

            const allIconIds = [];
            if (formulaData.costGoldId) allIconIds.push(formulaData.costGoldId);
            costItems.forEach(id => allIconIds.push(id));
            const iconsHtml = allIconIds.map(id => `<img src="/public/images/item/itemicon/${id}.png" onerror="this.style.display='none'">`).join('');

            return `<span class="v2eq-cost-wrap"><span class="v2eq-cost-btn" onclick="event.stopPropagation();var t=this.nextElementSibling;t.classList.toggle('pinned');if(t.classList.contains('pinned'))document.querySelectorAll('.v2eq-cost-tip.pinned').forEach(x=>{if(x!==t)x.classList.remove('pinned')})">制造消耗</span><span class="v2eq-cost-icons">${iconsHtml}</span><span class="v2eq-cost-tip">${tipHtml}</span></span>`;
        }

        function renderGuaranteeBtn(itemId, displayAttrModifiers, guaranteeRules, enhanceConst) {
            if (!guaranteeRules || Object.keys(guaranteeRules).length === 0) return '';

            const subStats = (displayAttrModifiers || []).filter(m => m.attrIndex > 0 && m.enhanceGuaranteeTimesRuleId && m.enhancedAttrValues && m.enhancedAttrValues.length > 0);
            if (subStats.length === 0) return '';

            let tipHtml = '';
            if (enhanceConst && enhanceConst.maxAttrEnhanceLevel !== undefined) {
                tipHtml += `<div class="v2eq-enhance-tip">最大强化 +${enhanceConst.maxAttrEnhanceLevel}</div>`;
            }

            let rows = '';
            subStats.forEach(m => {
                const name = getAttrName(m.attrType, m.compositeAttr);
                const rule = guaranteeRules[m.enhanceGuaranteeTimesRuleId];
                if (!rule) return;
                rows += `<tr><td>${escapeHtml(name)}</td><td>${rule.GuaranteeTimes1}</td><td>${rule.GuaranteeTimes2}</td><td>${rule.GuaranteeTimes3}</td></tr>`;
            });

            if (!rows) return '';

            tipHtml += `<table class="v2eq-guarantee-table">
                <thead><tr><th>词条</th><th>+1</th><th>+2</th><th>+3</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;

            return `<span class="v2eq-guarantee-wrap"><span class="v2eq-guarantee-btn" onclick="event.stopPropagation();var t=this.nextElementSibling;t.classList.toggle('pinned');if(t.classList.contains('pinned'))document.querySelectorAll('.v2eq-guarantee-tip.pinned').forEach(x=>{if(x!==t)x.classList.remove('pinned')})">精锻保底</span><span class="v2eq-guarantee-tip">${tipHtml}</span></span>`;
        }

        function renderEquipCard(itemId, equipData, itemData, formulaData, guaranteeRules, enhanceConst, itemTable) {
            const name = itemData?.name?.text || itemId;
            const rarity = itemData?.rarity ?? 0;
            const iconId = itemData?.iconId || '';
            const iconSrc = getEquipIconSrc(itemId, iconId);
            const partType = equipData.partType;
            const partName = PART_TYPE_MAP[partType] || `部位${partType}`;
            const minWearLv = equipData.minWearLv;
            const domainId = equipData.domainId || '';
            const domainName = getDomainName(domainId);
            const decoDesc = itemData?.decoDesc?.text || '';

            const mainMod = equipData.displayBaseAttrModifier;
            const mainName = getAttrName(mainMod.attrType, mainMod.compositeAttr);
            const mainVal = formatAttrValue(mainMod.attrType, mainMod.attrValue, mainMod.compositeAttr);
            const showHidden = getCurrentShowHidden();
            const mainModType = modifierTypeMap[String(mainMod.modifierType)] || '';

            const subTableHtml = renderSubStatTable(equipData.displayAttrModifiers);

            let decoHtml = '';
            if (decoDesc) {
                decoHtml = `<div class="v2eq-deco-desc">${parseText(decoDesc)}</div>`;
            }

            const formulaBtnHtml = renderFormulaBtn(itemId, formulaData, itemTable);
            const guaranteeBtnHtml = renderGuaranteeBtn(itemId, equipData.displayAttrModifiers, guaranteeRules, enhanceConst);
            const hasActions = formulaBtnHtml || guaranteeBtnHtml;

            return `
                <div class="v2eq-card">
                    <div class="v2eq-card-header">
                        <img class="v2eq-card-icon" src="${iconSrc}" onerror="this.onerror=null; this.src='';">
                        <div class="v2eq-card-title">
                            <div class="v2eq-card-name-row">
                                <span class="v2eq-card-name">${escapeHtml(name)}</span>
                                <span class="v2eq-rarity-dot rarity-${rarity}" title="${t('common.rarityValue', { value: rarity })}"></span>
                            </div>
                            ${showHidden ? `<span class="v2eq-card-item-id">${escapeHtml(itemId)}</span>` : ''}
                        </div>
                        ${hasActions ? `<div class="v2eq-card-actions">${formulaBtnHtml}${guaranteeBtnHtml}</div>` : ''}
                    </div>
                    <div class="v2eq-card-body">
                        <div class="v2eq-card-meta">
                            <span class="v2eq-part-tag">${partName}</span>
                            <span>Lv.${minWearLv}</span>
                            ${domainId ? `<span class="v2eq-domain-tag" title="${escapeHtml(domainId)}">${escapeHtml(domainName)}</span>` : ''}
                        </div>
                        <div class="v2eq-card-mainstat">
                            <span class="v2eq-mainstat-desc">${escapeHtml(mainName)}</span>
                            <span>
                                <span class="v2eq-mainstat-value">${mainVal}</span>
                                ${showHidden && mainModType ? `<span class="v2eq-mainstat-modifier">(${mainModType})</span>` : ''}
                            </span>
                        </div>
                        ${subTableHtml}
                        ${decoHtml}
                    </div>
                </div>
            `;
        }

        function renderSkillSection(data) {
            const skillTable = data.skillpatchtable;
            if (!skillTable || Object.keys(skillTable).length === 0) return '';

            const showHidden = getCurrentShowHidden();
            let html = '<div class="v2eq-section"><h3>套装技能</h3>';
            for (const [skillId, skillData] of Object.entries(skillTable)) {
                const bundle = skillData.SkillPatchDataBundle;
                if (!bundle) continue;
                bundle.forEach(skill => {
                    const desc = skill.description?.text || '';
                    if (!desc) return;
                    const blackboard = skill.blackboard || [];
                    const valueMap = {};
                    blackboard.forEach(b => { valueMap[b.key] = b.value; });

                    let processedDesc = desc;
                    processedDesc = replacePlaceholders(processedDesc, valueMap);
                    processedDesc = parseText(processedDesc);
                    processedDesc = processedDesc.replace(/\n/g, '<br>');

                    html += `<div class="v2eq-skill-desc">${processedDesc}</div>`;

                    if (showHidden && blackboard.length > 0) {
                        html += `<div class="v2eq-blackboard-params">`;
                        html += `<span class="v2eq-blackboard-label">参数：</span>`;
                        blackboard.forEach(b => {
                            const displayVal = (typeof b.value === 'number')
                                ? (Math.abs(b.value) < 10 ? (b.value * 100).toFixed(1) + '%' : b.value)
                                : b.value;
                            const valueHtml = window.renderRawValueTip ? window.renderRawValueTip(displayVal, b.value, b.key) : displayVal;
                            html += `<span class="v2eq-blackboard-item"><strong>${escapeHtml(b.key)}</strong> = ${valueHtml}</span>`;
                        });
                        html += `</div>`;
                    }
                });
            }
            html += '</div>';
            return html;
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
                    const regex = new RegExp(`\\b${name}\\b`, 'g');
                    evalExpr = evalExpr.replace(regex, `(${value})`);
                }
                let result;
                try {
                    result = new Function('return ' + evalExpr)();
                } catch (e) {
                    return match;
                }
                let formatted;
                if (format.includes('%')) formatted = (result * 100).toFixed(1) + '%';
                else if (format.includes('.')) {
                    const precision = format.split('.')[1]?.length || 1;
                    formatted = result.toFixed(precision);
                }
                else if (format.includes('0')) formatted = Math.round(result).toString();
                else formatted = result.toString();
                const tipKey = varNames.length === 1 ? varNames[0] : expr;
                return window.renderRawValueTip ? window.renderRawValueTip(formatted, result, tipKey) : formatted;
            });
        }

        function renderPackSection(data) {
            const packTable = data.equippacktable;
            if (!packTable || Object.keys(packTable).length === 0) return '';

            let html = '';
            for (const [packId, pack] of Object.entries(packTable)) {
                const packName = pack.name?.text || packId;
                html += `<span class="v2eq-pack-tag" title="${escapeHtml(packId)}">${escapeHtml(packName)}</span>`;
            }
            return html;
        }

        function renderItemsSection(data) {
            const equipTable = data.equiptable;
            const itemTable = data.itemtable || {};
            const formulaTable = data.equipformulatable || {};
            const reverseFormulaTable = data.equipformulareversetable || {};
            const guaranteeRules = data.equipenhanceguaranteetimesruletable || {};
            const enhanceConst = data.equipconst || null;

            if (!equipTable) return '';

            const partOrder = { 0: 0, 1: 1, 2: 2 };
            const sortedItems = Object.entries(equipTable).sort((a, b) => {
                const ra = itemTable[a[0]]?.rarity ?? 0;
                const rb = itemTable[b[0]]?.rarity ?? 0;
                if (ra !== rb) return rb - ra;
                const pa = partOrder[a[1].partType] ?? 99;
                const pb = partOrder[b[1].partType] ?? 99;
                if (pa !== pb) return pa - pb;
                return a[0].localeCompare(b[0]);
            });

            let cardsHtml = '';
            sortedItems.forEach(([itemId, equipData]) => {
                const iData = itemTable[itemId] || null;
                const formulaId = reverseFormulaTable[itemId] || '';
                const fData = formulaId ? formulaTable[formulaId] : null;
                cardsHtml += renderEquipCard(itemId, equipData, iData, fData, guaranteeRules, enhanceConst, itemTable);
            });

            return `
                <div class="v2eq-section">
                    <h3>套装部件</h3>
                    <div class="v2eq-items-grid">${cardsHtml}</div>
                </div>
            `;
        }

        function renderEnhanceConstSection(data) {
            const techConst = data.equiptechconst;
            if (!techConst) return '';

            let html = '<div class="v2eq-section"><h3>精锻信息</h3>';
            html += `<div class="v2eq-enhance-info">`;
            if (techConst.equipProduceMaxCount !== undefined) {
                html += `<div class="v2eq-enhance-item">
                    <span class="v2eq-enhance-label">最大制造数量</span>
                    <span class="v2eq-enhance-value">${window.renderRawValueTip ? window.renderRawValueTip(techConst.equipProduceMaxCount, techConst.equipProduceMaxCount, 'equipProduceMaxCount') : techConst.equipProduceMaxCount}</span>
                </div>`;
            }
            if (techConst.equipRecycleRatio !== undefined) {
                html += `<div class="v2eq-enhance-item">
                    <span class="v2eq-enhance-label">回收返还比例</span>
                    <span class="v2eq-enhance-value">${window.renderRawValueTip ? window.renderRawValueTip((techConst.equipRecycleRatio * 100).toFixed(0) + '%', techConst.equipRecycleRatio) : (techConst.equipRecycleRatio * 100).toFixed(0) + '%'}</span>
                </div>`;
            }
            html += `</div>`;

            const enhanceCost = data.equipenhancecosttable;
            const showHidden = getCurrentShowHidden();
            if (enhanceCost && showHidden) {
                for (const [domainId, cost] of Object.entries(enhanceCost)) {
                    const dName = getDomainName(cost.domainId || domainId);
                    html += `<div class="v2eq-enhance-cost-card">`;
                    html += `<div class="v2eq-enhance-cost-domain">${escapeHtml(dName)}</div>`;
                    html += `<div class="v2eq-enhance-item">
                        <span class="v2eq-enhance-label">消耗材料</span>
                        <span class="v2eq-enhance-value">${escapeHtml(cost.consumeItemId)} ×${cost.consumeItemCnt}</span>
                    </div>`;
                    if (cost.returnbackItemId) {
                        html += `<div class="v2eq-enhance-item">
                            <span class="v2eq-enhance-label">返还材料</span>
                            <span class="v2eq-enhance-value">${escapeHtml(cost.returnbackItemId)} ×${cost.returnbackItemCnt}</span>
                        </div>`;
                    }
                    html += `</div>`;
                }
            }

            html += '</div>';
            return html;
        }

        async function loadSuitDetail(suit, container) {
            container.innerHTML = `<div class="v2eq-loader">${t('moduleInternal.v2Equip.loading')}</div>`;
            try {
                const data = await (window.akeFetch || fetch)(suit.contentFile).then(r => r.json());
                container.innerHTML = renderDetail(data, suit);
            } catch (err) {
                container.innerHTML = `<div class="v2eq-error">${t('moduleInternal.v2Equip.loadFailed', { message: err.message })}</div>`;
            }
        }

        function renderDetail(data, suit) {
            const suitTable = data.equipsuittable;
            const suitName = suitTable?.list?.[0]?.suitName?.text || suit.name;
            const packHtml = renderPackSection(data);

            let html = `
                <div class="v2eq-detail-container">
                    <div class="v2eq-header">
                        <div class="v2eq-header-icon">
                            <img src="${suit.icon || ''}" onerror="this.onerror=null; this.src='';">
                        </div>
                        <div class="v2eq-header-text">
                            <div class="v2eq-title-row">
                                <span class="v2eq-name">${escapeHtml(suitName)}</span>
                                <span class="v2eq-rarity-dot rarity-${suit.rarity}" title="${t('common.rarityValue', { value: suit.rarity })}"></span>
                                <span class="v2eq-id">${escapeHtml(suit.suitID)}</span>
                            </div>
                            ${packHtml}
                        </div>
                    </div>
            `;

            html += renderSkillSection(data);
            html += renderItemsSection(data);
            html += renderEnhanceConstSection(data);
            html += '</div>';
            return html;
        }

        async function refreshModule() {
            const list = document.getElementById('v2equipList');
            const detail = document.getElementById('v2equipDetail');
            if (!list || !detail) return;

            const showHidden = getCurrentShowHidden();
            allSuits = await loadSuitManifest(showHidden);
            renderSuitList();
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
                const si = document.getElementById('v2equipSearchInput');
                if (si) si.value = '';
                refreshModule();
            });

            document.getElementById('v2equipSearchInput')?.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                renderSuitList();
            });

            await refreshModule();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initModule);
        } else {
            initModule();
        }
    })();
