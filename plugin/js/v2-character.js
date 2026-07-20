(function() {
        const t = window.akeI18n.scope('modules.character');
        let allCharacters = [];
        let rawAllCharacters = [];
        let activeCharId = null;
        let isInitialized = false;
        let attrMap = {};
        let attrEnMap = {};
        let paramTypeMap = {};
        let modifierTypeMap = {};
        let charTypeMap = {};
        let weaponMap = {};
        let professionMap = {};
        let roomTypeMap = {};
        let searchTerm = '';
        let currentCharacter = null;
        let currentCharData = null;
        let charLevelsToShow = null;
        let skillLevelsToShow = null;
        let globalSkillExpand = false;
        let skillExpandMap = {};
        let showAllCharLevels = false;

        // 筛选状态
        let selectedRarities = new Set();
        let selectedCharTypes = new Set();
        let selectedProfessions = new Set();
        let selectedWeaponTypes = new Set();

        const TYPE_CLASS_MAP = {
            '物理': 'physical',
            '自然': 'nature',
            '寒冷': 'cold',
            '灼热': 'hot',
            '电磁': 'electro'
        };

        const IMAGE_BASE_PATH = '/public/images/bufficon/';
        const COLUMN_KEY_MAP = {
            'coolDown': 'columns.coolDown',
            'costValue': 'columns.costValue',
        };
        const ALWAYS_SHOW_COLS = ['coolDown', 'costValue'];
        function isAlwaysShowColumn(column) {
            return ALWAYS_SHOW_COLS.includes(column) || column.startsWith('coolDown:');
        }
        const GROWTH_ATTRIBUTES = [
            { id: 'strength', key: 'attributes.strength' },
            { id: 'agility', key: 'attributes.agility' },
            { id: 'intellect', key: 'attributes.intellect' },
            { id: 'will', key: 'attributes.will' },
            { id: 'hp', key: 'attributes.hp' },
            { id: 'attack', key: 'attributes.attack' },
            { id: 'defense', key: 'attributes.defense' },
            { id: 'artsInflictionDamageMultiplier', key: 'attributes.artsInflictionDamageMultiplier', precise: true },
            { id: 'physicalInflictionDamageMultiplier', key: 'attributes.physicalInflictionDamageMultiplier', precise: true }
        ];
        const GROWTH_ATTR_TYPE_TO_ID = Object.freeze({
            39: 'strength',
            40: 'agility',
            41: 'intellect',
            42: 'will',
            1: 'hp',
            2: 'attack',
            3: 'defense',
            49: 'artsInflictionDamageMultiplier',
            25: 'physicalInflictionDamageMultiplier'
        });
        const SKILL_GROUP_ORDER = { 0: 0, 1: 1, 2: 3, 3: 2 };
        const HIDDEN_KEYWORDS = ['atb', 'scale', 'usp', 'duration', 'poise', '_', 'count', 'layer', 'prob'];

        function getCurrentLanguage() {
            const lang = window.akeData?.getLanguage?.() || 'CH';
            return lang === 'CN' ? 'CH' : lang;
        }

        function getCurrentShowHidden() {
            return window.akeData?.getConfig().showHidden ?? false;
        }

        function parseText(text) {
            const normalized = typeof text === 'string' ? text.replace(/\\r\\n|\\n|\\r/g, '\n') : text;
            return window.parseText(normalized, IMAGE_BASE_PATH);
        }

        function getText(value) {
            if (typeof value === 'string') return value;
            return typeof value?.text === 'string' ? value.text : '';
        }

        function parseLevelInput(input, maxLevel = 90) {
            if (!input || input.trim() === '') return [];
            const parts = input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= maxLevel);
            return parts.length ? parts : [maxLevel];
        }

        function formatPlaceholderValue(value, format) {
            const formatMatch = String(format || '').match(/^0(?:\.(0+))?(%)?$/);
            if (!formatMatch) return String(value);

            const precision = formatMatch[1]?.length || 0;
            const formattedValue = formatMatch[2] ? value * 100 : value;
            return formattedValue.toFixed(precision) + (formatMatch[2] || '');
        }

        function removeDynamicFloorSegments(text) {
            return String(text || '').replace(/[（(][^（）()]*\{floor:[^{}]+\}[^（）()]*[）)]/gi, '');
        }

        function replacePlaceholders(desc, valueMap, modifierTypes, showModTag) {
            const normalizePlaceholderValue = value => {
                if (!value || typeof value !== 'object') return value;
                for (const key of ['value', 'valueFloat', 'valueDouble', 'valueInt', 'floatValue', 'paramValue', 'attrValue']) {
                    if (value[key] !== undefined && value[key] !== value) return normalizePlaceholderValue(value[key]);
                }
                return value;
            };
            const lowerValueMap = {};
            for (const [key, val] of Object.entries(valueMap || {})) {
                lowerValueMap[String(key).toLowerCase()] = normalizePlaceholderValue(val);
            }
            const lowerModTypes = {};
            if (modifierTypes) {
                for (const [key, val] of Object.entries(modifierTypes)) {
                    lowerModTypes[String(key).toLowerCase()] = val;
                }
            }
            return removeDynamicFloorSegments(desc).replace(/\{([^}]+)\}/g, (match, p1) => {
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
                let formatted = formatPlaceholderValue(result, format);
                if (showModTag && lowerModTypes) {
                    const matchedModType = varNames.map(name => lowerModTypes[name.toLowerCase()]).find(v => v != null);
                    if (matchedModType != null) {
                        const modName = modifierTypeMap[String(matchedModType)] || '';
                        if (modName) formatted += ` <span class="attr-node-modifier-tag">${modName}</span>`;
                    }
                }
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

        function replaceV2Placeholders(desc, objWithBlackboard) {
            if (!desc || !desc.includes('{')) return desc;
            const lookup = {};
            function normalizePlaceholderValue(value) {
                if (!value || typeof value !== 'object') return value;
                for (const key of ['value', 'valueFloat', 'valueDouble', 'valueInt', 'floatValue', 'paramValue', 'attrValue']) {
                    if (value[key] !== undefined && value[key] !== value) return normalizePlaceholderValue(value[key]);
                }
                return value;
            }
            function traverse(o) {
                if (!o || typeof o !== 'object') return;
                if (Array.isArray(o)) {
                    o.forEach(traverse);
                } else {
                    if (o.key !== undefined && (o.value !== undefined || o.valueStr !== undefined)) {
                        let v = o.valueStr !== undefined && o.valueStr !== "" ? o.valueStr : o.value;
                        lookup[o.key.toLowerCase()] = normalizePlaceholderValue(v);
                    }
                    if (o.bbKey !== undefined && (o.floatValue !== undefined || o.stringValue !== undefined)) {
                        let v = o.stringValue !== undefined && o.stringValue !== "" ? o.stringValue : o.floatValue;
                        lookup[o.bbKey.toLowerCase()] = normalizePlaceholderValue(v);
                    }
                    if (o.paramType !== undefined && o.paramValue !== undefined) {
                        const ptName = paramTypeMap[o.paramType];
                        if (ptName) {
                            lookup[ptName.toLowerCase()] = normalizePlaceholderValue(o.paramValue);
                        }
                    }
                    if (o.attrType !== undefined && o.attrValue !== undefined) {
                        const atName = attrEnMap[o.attrType];
                        if (atName) {
                            lookup[atName.toLowerCase()] = normalizePlaceholderValue(o.attrValue);
                        }
                    }
                    if (o.modifyAttributeType !== undefined && o.attrValue !== undefined) {
                        const atModName = attrEnMap[o.modifyAttributeType];
                        if (atModName) {
                            lookup[atModName.toLowerCase()] = normalizePlaceholderValue(o.attrValue);
                        }
                    }
                    Object.values(o).forEach(traverse);
                }
            }
            traverse(objWithBlackboard);

            return desc.replace(/\{([^}]+)\}/g, (match, fullExpr) => {
                const parts = fullExpr.split(':');
                const expr = parts[0].trim();
                const format = parts[1] ? parts[1].trim() : '';

                const exactKey = expr.toLowerCase();
                let finalValue;

                if (lookup[exactKey] !== undefined) {
                    finalValue = lookup[exactKey];
                } else {
                    let evalExpr = expr.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (varName) => {
                        const lowerVar = varName.toLowerCase();
                        if (lookup[lowerVar] !== undefined) {
                            let val = lookup[lowerVar];
                            return (typeof val === 'number' && val < 0) ? '(' + val + ')' : val;
                        }
                        return varName;
                    });
                    
                    try {
                        // eslint-disable-next-line no-new-func
                        finalValue = new Function('return ' + evalExpr)();
                    } catch (e) {
                        return match;
                    }
                }

                if (typeof finalValue === 'number') {
                    const formatted = formatPlaceholderValue(finalValue, format);
                    const varNames = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
                    const bindings = Object.fromEntries(varNames.filter(name => lookup[name.toLowerCase()] !== undefined).map(name => [name, lookup[name.toLowerCase()]]));
                    const changed = !(varNames.length === 1 && expr.toLowerCase() === varNames[0].toLowerCase());
                    const rawValue = varNames.length === 1 ? bindings[varNames[0]] : Object.entries(bindings).map(([key, value]) => `${key}=${value}`).join(', ');
                    const substituted = expr.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, name => `(${bindings[name] ?? name})`);
                    return window.renderRawValueTip ? window.renderRawValueTip(formatted, {
                        rawValue: rawValue || finalValue, value: finalValue, changed, expression: expr,
                        formula: changed ? `${substituted} = ${finalValue}` : undefined,
                        bindings
                    }) : formatted;
                } else if (typeof finalValue === 'string') {
                    if (/^0(?:\.(0+))?%$/.test(format) && !finalValue.includes('%')) {
                        let num = parseFloat(finalValue);
                        if (!isNaN(num)) return formatPlaceholderValue(num, format);
                    }
                }

                return finalValue !== undefined ? String(finalValue) : match;
            });
        }

        function replaceTalentPlaceholders(desc, dataList) {
            if (!desc || !desc.includes('{') || !dataList || !dataList.length) return desc || '';
            return desc.replace(/\{(\d+),(\d+)(?::([^}]+))?\}/g, (match, dataIdx, valIdx, format) => {
                const di = parseInt(dataIdx, 10);
                const vi = parseInt(valIdx, 10);
                const item = dataList[di];
                if (!item) return match;

                let finalValue;
                const bb = item.attachBuff?.blackboard;
                if (bb && bb[vi] !== undefined) {
                    finalValue = bb[vi].value;
                }
                if (finalValue === undefined && vi === 0) {
                    if (item.skillBbModifier?.floatValue !== undefined && item.skillBbModifier.floatValue !== 0) {
                        finalValue = item.skillBbModifier.floatValue;
                    } else if (item.skillParamModifier?.paramValue !== undefined && item.skillParamModifier.paramValue !== 0) {
                        finalValue = item.skillParamModifier.paramValue;
                    } else if (item.attrModifier?.attrValue !== undefined && item.attrModifier.attrValue !== 0) {
                        finalValue = item.attrModifier.attrValue;
                    }
                }
                if (finalValue === undefined) finalValue = 0;

                if (typeof finalValue === 'number') {
                    const formatted = formatPlaceholderValue(finalValue, format);
                    return window.renderRawValueTip ? window.renderRawValueTip(formatted, finalValue, `${dataIdx},${valIdx}`) : formatted;
                }
                return String(finalValue);
            });
        }

        async function loadMaps() {
            try {
                const data = await window.akeLoadMaps();
                attrMap = data.ATTR_MAP || {};
                attrEnMap = data.ATTR_MAP_EN || {};
                paramTypeMap = data.param_type_map || {};
                modifierTypeMap = data.MODIFIER_TYPE_MAP || {};
                charTypeMap = data.char_type_map || {};
                weaponMap = data.weapon_map || {};
                professionMap = data.profession_map || {};
                roomTypeMap = data.room_type_map || {};
            } catch (err) {
                console.error('加载映射数据失败:', err);
                attrMap = {};
                attrEnMap = {};
                paramTypeMap = {};
                charTypeMap = {};
                weaponMap = {};
                professionMap = {};
                roomTypeMap = {};
            }
        }

        function getAttrName(attrType) {
            return attrMap[attrType] || t('attributeFallback', { name: attrType });
        }

        function getCharTypeName(charType) {
            return charTypeMap[charType] || charType;
        }

        function getWeaponName(weapon) {
            return weaponMap[weapon] || weapon;
        }

        function getProfessionName(prof) {
            return professionMap[prof] || prof;
        }

        function filterCharacters(chars) {
            return chars.filter(c => {
                // 搜索过滤
                if (searchTerm) {
                    const term = searchTerm.toLowerCase();
                    const nameMatch = c.name && c.name.toLowerCase().includes(term);
                    const idMatch = c.charId && c.charId.toLowerCase().includes(term);
                    if (!nameMatch && !idMatch) return false;
                }
                // 稀有度筛选
                if (selectedRarities.size > 0 && !selectedRarities.has(c.rarity)) return false;
                // 属性筛选
                if (selectedCharTypes.size > 0 && !selectedCharTypes.has(c.charType)) return false;
                // 职业筛选
                if (selectedProfessions.size > 0 && !selectedProfessions.has(c.profession)) return false;
                // 武器类型筛选
                if (selectedWeaponTypes.size > 0 && !selectedWeaponTypes.has(c.weapontype)) return false;
                return true;
            });
        }

        // 生成筛选按钮
        function generateFilterButtons() {
            const rarityContainer = document.getElementById('v2charRarityFilter');
            const typeContainer = document.getElementById('v2charTypeFilter');
            const profContainer = document.getElementById('v2charProfessionFilter');
            const weaponContainer = document.getElementById('v2charWeaponFilter');
            if (!rarityContainer || !typeContainer || !profContainer || !weaponContainer) return;

            // 稀有度按钮
            const existingRarities = new Set(allCharacters.map(c => c.rarity));
            rarityContainer.innerHTML = '';
            for (let r = 1; r <= 6; r++) {
                if (existingRarities.has(r)) {
                    const btn = document.createElement('span');
                    btn.className = `filter-btn ${selectedRarities.has(r) ? 'active' : ''}`;
                    btn.dataset.rarity = r;
                    btn.textContent = t('rarityStars', { name: r });
                    btn.addEventListener('click', () => {
                        if (selectedRarities.has(r)) {
                            selectedRarities.delete(r);
                        } else {
                            selectedRarities.add(r);
                        }
                        btn.classList.toggle('active');
                        renderCharacterList();
                    });
                    rarityContainer.appendChild(btn);
                }
            }

            // 属性按钮
            const existingTypes = new Set(allCharacters.map(c => c.charType).filter(t => t));
            typeContainer.innerHTML = '';
            existingTypes.forEach(type => {
                const btn = document.createElement('span');
                const tName = getCharTypeName(type) || type;
                btn.className = `filter-btn ${selectedCharTypes.has(type) ? 'active' : ''}`;
                btn.dataset.type = type;
                btn.textContent = tName;
                btn.addEventListener('click', () => {
                    if (selectedCharTypes.has(type)) {
                        selectedCharTypes.delete(type);
                    } else {
                        selectedCharTypes.add(type);
                    }
                    btn.classList.toggle('active');
                    renderCharacterList();
                });
                typeContainer.appendChild(btn);
            });

            // 职业按钮
            const existingProfessions = new Set(allCharacters.map(c => c.profession).filter(p => p));
            profContainer.innerHTML = '';
            existingProfessions.forEach(prof => {
                const btn = document.createElement('span');
                const pName = getProfessionName(prof) || prof;
                btn.className = `filter-btn ${selectedProfessions.has(prof) ? 'active' : ''}`;
                btn.dataset.profession = prof;
                btn.textContent = pName;
                btn.addEventListener('click', () => {
                    if (selectedProfessions.has(prof)) {
                        selectedProfessions.delete(prof);
                    } else {
                        selectedProfessions.add(prof);
                    }
                    btn.classList.toggle('active');
                    renderCharacterList();
                });
                profContainer.appendChild(btn);
            });

            // 武器类型按钮
            const existingWeapons = new Set(allCharacters.map(c => c.weapontype).filter(w => w));
            weaponContainer.innerHTML = '';
            existingWeapons.forEach(weapon => {
                const btn = document.createElement('span');
                const wName = getWeaponName(weapon) || weapon;
                btn.className = `filter-btn ${selectedWeaponTypes.has(weapon) ? 'active' : ''}`;
                btn.dataset.weapon = weapon;
                btn.textContent = wName;
                btn.addEventListener('click', () => {
                    if (selectedWeaponTypes.has(weapon)) {
                        selectedWeaponTypes.delete(weapon);
                    } else {
                        selectedWeaponTypes.add(weapon);
                    }
                    btn.classList.toggle('active');
                    renderCharacterList();
                });
                weaponContainer.appendChild(btn);
            });
        }

        const mobileBtn = document.getElementById('v2charMobileListBtn');
        const mobileOverlay = document.getElementById('v2charMobileListOverlay');
        const mobileContent = document.getElementById('v2charMobileListContent');

        function buildMobileList() {
            const filtered = filterCharacters(allCharacters);
            mobileContent.innerHTML = '';
            filtered.forEach(char => {
                const item = document.createElement('div');
                item.className = 'mobile-list-item';
                window.AKEModuleOverview?.markVersionChange(item, char);
                if (char.charId === activeCharId) item.classList.add('active');
                item.innerHTML = `
                    <div class="item-name">${char.name}</div>
                    <div class="item-id">${char.charId}</div>
                `;
                item.addEventListener('click', () => {
                    activeCharId = char.charId;
                    loadCharacterDetail(char, document.getElementById('v2characterDetail'));
                    closeMobileList();
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_character', char.charId);
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

        async function loadCharacterManifest(showHidden) {
            try {
                const res = await (window.akeFetch || fetch)('/public/CH/v2_character/manifest.json');
                if (!res.ok) throw new Error('无法加载角色清单');
                const allChars = await res.json();
                rawAllCharacters = allChars;
                let chars = showHidden ? allChars : allChars.filter(c => !c.hidden);
                chars.sort((a, b) => (a.priority || 999) - (b.priority || 999));
                return chars;
            } catch (err) {
                console.error('加载角色清单失败:', err);
                return [];
            }
        }

        function renderCharacterOverview(items, container) {
            window.AKEModuleOverview.render(container, {
                title: t('overview.title'), description: t('overview.description'),
                group: char => ({ id: char.profession || 'unknown', name: char.profession || t('unknownProfession') }),
                onReset: () => { activeCharId = null; },
                onSelect: char => { activeCharId = char.charId; renderCharacterList(); },
                sidebarSelector: char => `.character-item[data-char-id="${CSS.escape(char.charId)}"]`,
                items: items.map(char => ({ ...char, id: char.charId, image: char.icon, fallback: t('overview.fallback'),
                    tags: [t('rarityStars', { name: char.rarity || 1 }), char.charType, char.weapontype] }))
            });
        }

        function renderCharacterList() {
            const container = document.getElementById('v2characterList');
            const detailContainer = document.getElementById('v2characterDetail');
            if (!container) return;

            const filtered = filterCharacters(allCharacters);

            container.innerHTML = '';
            if (filtered.length === 0) {
                container.innerHTML = `<div class="loader">${t('noMatches')}</div>`;
                if (detailContainer) detailContainer.innerHTML = `<div class="loader">${t('select')}</div>`;
                activeCharId = null;
                return;
            }

            filtered.forEach((char, index) => {
                const item = document.createElement('div');
                item.className = `character-item ${char.charId === activeCharId ? 'active' : (index === 0 && !activeCharId && !window.AKEModuleOverview?.isActive('character') ? 'active' : '')}`;
                window.AKEModuleOverview?.markVersionChange(item, char);
                item.dataset.charId = char.charId;
                item.dataset.contentFile = char.contentFile;

                const rarityBar = document.createElement('span');
                rarityBar.className = `rarity-bar rarity-${char.rarity}`;
                rarityBar.title = t('rarityLabel', { name: char.rarity });

                const icon = document.createElement('img');
                icon.className = 'character-icon';
                icon.src = char.icon || '';
                icon.onerror = function() { this.onerror = null; this.src = ''; };

                const textContainer = document.createElement('div');
                textContainer.className = 'character-info';
                const nameDiv = document.createElement('div');
                nameDiv.className = 'character-name';
                nameDiv.textContent = char.name;
                const idDiv = document.createElement('div');
                idDiv.className = 'character-id';
                idDiv.textContent = char.charId;
                textContainer.appendChild(nameDiv);
                textContainer.appendChild(idDiv);

                const typeDisplayName = getCharTypeName(char.charType) || char.charType || t('unknown');
                const typeClass = TYPE_CLASS_MAP[typeDisplayName] || 'unknown';
                const typeDot = document.createElement('span');
                typeDot.className = `char-type-dot type-${typeClass}`;
                typeDot.title = typeDisplayName;

                item.appendChild(rarityBar);
                item.appendChild(icon);
                item.appendChild(textContainer);
                item.appendChild(typeDot);

                item.addEventListener('click', () => {
                    document.querySelectorAll('.character-item').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    activeCharId = char.charId;
                    loadCharacterDetail(char, detailContainer);
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_character', char.charId);
                });

                container.appendChild(item);
            });

            if (window.__deepLinkId) {
                const deepChar = filtered.find(c => c.charId === window.__deepLinkId);
                if (deepChar) {
                    activeCharId = deepChar.charId;
                } else {
                    const existsInRaw = rawAllCharacters.some(c => c.charId === window.__deepLinkId);
                    if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                        window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                    }
                }
                window.__deepLinkId = null;
            }

            const activeExists = filtered.some(c => c.charId === activeCharId);
            if (!activeExists && filtered.length > 0) {
                if (window.AKEModuleOverview?.isActive('character')) {
                    activeCharId = null;
                    renderCharacterOverview(filtered, detailContainer);
                    return;
                }
                activeCharId = filtered[0].charId;
                const firstItem = container.querySelector('.character-item');
                if (firstItem) firstItem.classList.add('active');
                loadCharacterDetail(filtered[0], detailContainer);
                if (window.__akeRouter) window.__akeRouter.updateUrl('v2_character', filtered[0].charId);
            } else if (activeExists) {
                const activeChar = filtered.find(c => c.charId === activeCharId);
                if (activeChar) {
                    const activeItem = container.querySelector(`.character-item[data-char-id="${activeCharId}"]`);
                    if (activeItem) activeItem.classList.add('active');
                    loadCharacterDetail(activeChar, detailContainer);
                    if (window.__akeRouter) window.__akeRouter.updateUrl('v2_character', activeCharId);
                }
            }
        }

        async function loadCharacterDetail(character, container) {
            container.innerHTML = `<div class="loader">${t('loading')}</div>`;
            try {
                const fileName = (character.contentFile || '').split('/').pop() || `${character.charId}.json`;
                const contentFile = `/public/CH/v2_character/${fileName}`;
                const rawData = await (window.akeFetch || fetch)(contentFile).then(r => r.json());
                const data = normalizeV2ToLegacy(character, rawData);
                currentCharData = data;
                currentCharacter = character;
                container.innerHTML = renderDetail(data);
                const baselineData = rawData.__versionDiff?.baseline
                    ? normalizeV2ToLegacy(character, rawData.__versionDiff.baseline)
                    : null;
                window.AKEModuleOverview?.renderVersionDiff(container, rawData, baselineData ? renderDetail(baselineData) : '');

                const globalSkillBtn = container.querySelector('.global-skill-toggle-btn');
                if (globalSkillBtn) {
                    globalSkillBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        globalSkillExpand = !globalSkillExpand;
                        if (globalSkillExpand) skillExpandMap = {};
                        updateAllSkillTables();
                    });
                }

                const skillToggleBtns = container.querySelectorAll('.skill-toggle-btn');
                skillToggleBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const skillKey = btn.dataset.skillKey;
                        if (!skillKey) return;
                        if (globalSkillExpand) globalSkillExpand = false;
                        skillExpandMap[skillKey] = !skillExpandMap[skillKey];
                        updateSkillTable(skillKey);
                    });
                });

                const toggleCharBtn = container.querySelector('.toggle-char-levels-btn');
                if (toggleCharBtn) {
                    toggleCharBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        showAllCharLevels = !showAllCharLevels;
                        updateGrowthTable();
                    });
                }

                container.querySelectorAll('.section-header').forEach(header => {
                    header.addEventListener('click', () => {
                        const indicator = header.querySelector('.collapse-indicator');
                        const content = header.nextElementSibling;
                        if (content && content.classList.contains('collapse-content')) {
                            const isHidden = getComputedStyle(content).display === 'none';
                            content.style.display = isHidden ? 'block' : 'none';
                            indicator.textContent = isHidden ? '▼' : '▶';
                        }
                    });
                });
            } catch (err) {
                const error = document.createElement('div');
                error.className = 'error-message';
                error.textContent = t('loadFailed', { name: err.message });
                container.replaceChildren(error);
            }
        }

        function normalizeV2ToLegacy(baseInfo, rawData) {
            const legacy = {
                charId: baseInfo.charId,
                icon: baseInfo.icon || '',
                pic: rawData.pic || `/public/images/character/charpic/${baseInfo.charId}.png`,
                potentialpics: [],
                name: baseInfo.name || rawData.name || '',
                rarity: baseInfo.rarity,
                charType: baseInfo.charType,
                profession: baseInfo.profession,
                weapontype: baseInfo.weapontype,
                mainAttrType: getAttrName(rawData.charactertable?.mainAttrType) || baseInfo.mainAttrType || '-',
                subAttrType: getAttrName(rawData.chargrowthtable?.subAttrType) || baseInfo.subAttrType || '-',
                charBattleTag: rawData.chargrowthtable?.charBattleTag || baseInfo.charBattleTag || [],
                profile: rawData.itemtable?.desc?.text || baseInfo.profile || '',
                feature: rawData.charprofessiontable?.desc?.text || baseInfo.feature || '',
                cvName: (function() {
                    const cv = rawData.charactertable?.cvName;
                    if (!cv) return baseInfo.cvName || [];
                    const names = [];
                    if (cv.ChiCVName?.text) names.push(cv.ChiCVName.text);
                    if (cv.JapCVName?.text) names.push(cv.JapCVName.text);
                    if (cv.EngCVName?.text) names.push(cv.EngCVName.text);
                    if (cv.KorCVName?.text) names.push(cv.KorCVName.text);
                    return names.length ? names : (baseInfo.cvName || []);
                })(),
                growth: {},
                growthDetails: {},
                talents: [],
                potentials: [],
                attributeNodes: [],
                skills: [],
                skill: {},
                spaceshipSkills: [],
                profileRecord: [],
                profileVoice: []
            };

            const preferredAttrs = GROWTH_ATTRIBUTES.map(attribute => attribute.id);
            preferredAttrs.forEach(id => {
                legacy.growth[id] = [];
            });

            const attributes = rawData.charactertable?.attributes || [];
            const levelMap = {};
            attributes.forEach(levelData => {
                const attrs = levelData?.Attribute?.attrs || [];
                const breakStage = levelData?.breakStage ?? 0;
                const levelEntry = attrs.find(a => a.attrType === 0);
                const level = levelEntry ? levelEntry.attrValue : null;
                if (level == null) return;
                if (!levelMap[level] || breakStage >= levelMap[level].breakStage) {
                    const idValueMap = {};
                    attrs.forEach(a => {
                        const id = GROWTH_ATTR_TYPE_TO_ID[a.attrType];
                        if (id) idValueMap[id] = a.attrValue;
                    });
                    levelMap[level] = { breakStage, idValueMap };
                }
            });
            const sortedLevels = Object.keys(levelMap).map(Number).sort((a, b) => a - b);
            sortedLevels.forEach(level => {
                const idValueMap = levelMap[level].idValueMap;
                preferredAttrs.forEach(id => {
                    const val = idValueMap[id];
                    legacy.growth[id].push(typeof val === 'number' ? val : 0);
                });
            });

            if (sortedLevels.length > 0) {
                legacy.growth.hp = sortedLevels.map(level => Math.round((500 + 5500 / 98 * (level - 1)) * 100) / 100);
                legacy.growthDetails.hp = sortedLevels.map((level, index) => {
                    const rawValue = levelMap[level].idValueMap.hp ?? legacy.growth.hp[index];
                    const value = legacy.growth.hp[index];
                    return {
                        name: 'hp',
                        rawValue,
                        value,
                        changed: value !== rawValue,
                        formula: `(500 + 5500 / 98 × (${level} - 1)) = ${value}`,
                        bindings: { level }
                    };
                });
            }

            legacy.itemInfoMap = Object.fromEntries(Object.entries(rawData.costitemtable || {}).map(([id, item]) => [id, {
                name: getText(item.name) || id,
                description: getText(item.desc),
                iconId: item.iconId || id
            }]));

            const talentNodes = Object.values(rawData.chargrowthtable?.talentNodeMap || {}).filter(n => n.nodeType === 4 && n.passiveSkillNodeInfo?.talentEffectId);
            talentNodes.sort((a, b) => {
                const ai = a.passiveSkillNodeInfo.index ?? 0;
                const bi = b.passiveSkillNodeInfo.index ?? 0;
                if (ai !== bi) return ai - bi;
                return (a.passiveSkillNodeInfo.level ?? 0) - (b.passiveSkillNodeInfo.level ?? 0);
            });
            legacy.talents = talentNodes.map(n => {
                const effect = rawData.potentialtalenteffecttable?.[n.passiveSkillNodeInfo.talentEffectId];
                if (!effect) return null;
                const descRaw = getText(effect.desc);
                const values = {};
                const modifierTypes = {};
                (effect.dataList || []).forEach(item => {
                    (item.attachSkill?.blackboard || []).forEach(bb => {
                        if (bb && bb.key !== undefined) values[bb.key] = bb.value;
                    });
                    (item.attachBuff?.blackboard || []).forEach(bb => {
                        if (bb && bb.key !== undefined) values[bb.key] = bb.value;
                    });
                    if (item.skillBbModifier?.bbKey && item.skillBbModifier.bbKey !== '') {
                        values[item.skillBbModifier.bbKey] = item.skillBbModifier.floatValue;
                    }
                    if (item.skillParamModifier?.paramType && item.skillParamModifier.paramValue) {
                        const ptName = paramTypeMap[item.skillParamModifier.paramType];
                        if (ptName) values[ptName] = item.skillParamModifier.paramValue;
                    }
                    if (item.attrModifier?.attrType && item.attrModifier.attrValue) {
                        const atName = attrEnMap[item.attrModifier.attrType];
                        if (atName) {
                            values[atName] = item.attrModifier.attrValue;
                            if (item.attrModifier.modifierType != null) {
                                modifierTypes[atName] = item.attrModifier.modifierType;
                            }
                        }
                    }
                });
                return {
                    name: n.passiveSkillNodeInfo.name?.text || effect.name?.text || effect.name || t('sections.talents'),
                    description: descRaw,
                    values: values,
                    modifierTypes: modifierTypes,
                    requiredItem: n.requiredItem || []
                };
            }).filter(Boolean);

            const potentials = rawData.characterpotentialtable?.potentialUnlockBundle || [];
            legacy.potentials = potentials.map(p => {
                const effId = p.potentialEffectId;
                let effect = rawData.potentialtalenteffecttable?.[effId];
                let desc = getText(effect?.desc);
                let dataList = effect?.dataList || [];
                if (!desc) {
                    const patch = rawData.skillpatchtable?.[effId]?.SkillPatchDataBundle?.[0];
                    desc = patch?.description?.text || '';
                    if (patch?.blackboard?.length) {
                        dataList = [{ attachBuff: { blackboard: patch.blackboard } }];
                    }
                }
                const values = {};
                const modifierTypes = {};
                dataList.forEach(item => {
                    (item.attachSkill?.blackboard || []).forEach(bb => {
                        if (bb && bb.key !== undefined) values[bb.key] = bb.value;
                    });
                    (item.attachBuff?.blackboard || []).forEach(bb => {
                        if (bb && bb.key !== undefined) values[bb.key] = bb.value;
                    });
                    if (item.skillBbModifier?.bbKey && item.skillBbModifier.bbKey !== '') {
                        values[item.skillBbModifier.bbKey] = item.skillBbModifier.floatValue;
                    }
                    if (item.skillParamModifier?.paramType && item.skillParamModifier.paramValue) {
                        const ptName = paramTypeMap[item.skillParamModifier.paramType];
                        if (ptName) values[ptName] = item.skillParamModifier.paramValue;
                    }
                    if (item.attrModifier?.attrType && item.attrModifier.attrValue) {
                        const atName = attrEnMap[item.attrModifier.attrType];
                        if (atName) {
                            values[atName] = item.attrModifier.attrValue;
                            if (item.attrModifier.modifierType != null) {
                                modifierTypes[atName] = item.attrModifier.modifierType;
                            }
                        }
                    }
                });
                const costItems = (p.itemIds || []).map((id, i) => ({ id, count: (p.itemCnts || [])[i] || 0 }));
                return {
                    name: p.name?.text || p.name || t('potentialName', { name: p.level || '' }),
                    description: desc,
                    values: values,
                    modifierTypes: modifierTypes,
                    costItems: costItems
                };
            });

            const potentialBundles = rawData.characterpotentialtable?.potentialUnlockBundle || [];
            potentialBundles.forEach(p => {
                (p.unlockCharPictureItemList || []).forEach(itemId => {
                    if (!itemId) return;
                    const imgName = itemId.replace(/^item_/, '');
                    legacy.potentialpics.push(`/public/images/character/imagepoaster/largesize/${imgName}.png`);
                });
            });

            const attrNodes = Object.values(rawData.chargrowthtable?.talentNodeMap || {}).filter(n => n.nodeType === 3);
            attrNodes.sort((a, b) => (a.attributeNodeInfo?.breakStage ?? 0) - (b.attributeNodeInfo?.breakStage ?? 0));
            legacy.attributeNodes = attrNodes.map(n => {
                const info = n.attributeNodeInfo || {};
                const modifiers = (info.attributeModifiers || []).filter(mod => mod && !(mod.attrType === 0 && mod.attrValue === 0));
                if (modifiers.length === 0) return null;
                return {
                    title: info.title?.text || '',
                    description: info.desc?.text || '',
                    modifiers: modifiers.map(mod => ({
                        text: `${getAttrName(mod.attrType) || mod.attrType}+${mod.attrValue}`,
                        modifierType: mod.modifierType
                    })),
                    requiredItem: n.requiredItem || []
                };
            }).filter(Boolean);

            const skillGroupMap = rawData.chargrowthtable?.skillGroupMap || {};
            const skillGroups = Object.values(skillGroupMap).sort((a, b) => (SKILL_GROUP_ORDER[a.skillGroupType] ?? a.skillGroupType) - (SKILL_GROUP_ORDER[b.skillGroupType] ?? b.skillGroupType));
            const highestTalentNodes = new Map();
            Object.values(rawData.chargrowthtable?.talentNodeMap || {}).forEach(node => {
                const info = node.passiveSkillNodeInfo;
                if (node.nodeType !== 4 || !info?.talentEffectId) return;
                const previous = highestTalentNodes.get(info.index);
                const previousInfo = previous?.passiveSkillNodeInfo;
                if (!previous || (info.level ?? 0) > (previousInfo.level ?? 0) ||
                    ((info.level ?? 0) === (previousInfo.level ?? 0) && (info.breakStage ?? 0) > (previousInfo.breakStage ?? 0))) {
                    highestTalentNodes.set(info.index, node);
                }
            });
            const highestTalentEffects = Array.from(highestTalentNodes.values())
                .map(node => rawData.potentialtalenteffecttable?.[node.passiveSkillNodeInfo.talentEffectId])
                .filter(Boolean);
            legacy.skills = skillGroups.map(s => {
                const iconPath = s.icon ? `/public/images/character/skillicon/${s.icon}.png` : '';
                const groupName = getText(s.name);
                const groupDescription = getText(s.desc);
                const skillIdList = Array.isArray(s.skillIdList) ? s.skillIdList : [];
                let patchLists = skillIdList
                    .map(skillId => rawData.skillpatchtable?.[skillId]?.SkillPatchDataBundle || [])
                    .filter(patches => patches.length > 0);
                if (patchLists.length === 0 && s.skillGroupId) {
                    const groupPatches = rawData.skillpatchtable?.[s.skillGroupId]?.SkillPatchDataBundle || [];
                    if (groupPatches.length > 0) patchLists = [groupPatches];
                }

                const conditions = [1, 2].map(index => {
                    const conditionId = s[`conditionId${index}`] || '';
                    if (!conditionId) return null;
                    return {
                        id: conditionId,
                        name: s[`conditionName${index}`]?.text || '',
                        icon: s[`conditionIcon${index}`] ? `/public/images/character/skillicon/${s[`conditionIcon${index}`]}.png` : iconPath,
                        conditionDesc: s[`conditionDesc${index}`]?.text || '',
                        description: s[`conditionPostDesc${index}`]?.text || ''
                    };
                }).filter(Boolean);
                const conditionNames = Object.fromEntries(conditions.map(condition => [condition.id, condition.name]));
                const values = { coolDown: [], costValue: [] };
                const subDescNames = [];
                const subDescLabels = {};
                const subDescValues = {};
                if (patchLists.length > 0) {
                    patchLists[0].forEach(patch => {
                        values.coolDown.push(patch.coolDown ?? 0);
                        values.costValue.push(patch.costValue ?? 0);
                    });
                    const seenKeys = new Set();
                    patchLists.forEach((patchList, patchListIndex) => {
                        const localKeyMap = {};
                        (patchList[0]?.blackboard || []).forEach(bb => {
                            if (!bb || !bb.key) return;
                            if (!seenKeys.has(bb.key)) {
                                localKeyMap[bb.key] = bb.key;
                                seenKeys.add(bb.key);
                            } else {
                                let seq = 2;
                                let newKey = bb.key + '_' + seq;
                                while (seenKeys.has(newKey)) { seq++; newKey = bb.key + '_' + seq; }
                                localKeyMap[bb.key] = newKey;
                                seenKeys.add(newKey);
                            }
                        });
                        const localSubDescKeys = [];
                        patchList.forEach((patch, levelIndex) => {
                            (patch.blackboard || []).forEach(bb => {
                                if (!bb || !bb.key) return;
                                const finalKey = localKeyMap[bb.key] || bb.key;
                                if (!values[finalKey]) values[finalKey] = [];
                                values[finalKey].push(bb.value ?? 0);
                            });
                            const occurrenceMap = {};
                            (patch.subDescDataList || []).forEach(subDesc => {
                                const name = subDesc.name?.text || '';
                                if (!name) return;
                                const conditionId = subDesc.conditionId || '';
                                const signature = `${conditionId}\u0000${name}`;
                                const occurrence = occurrenceMap[signature] || 0;
                                occurrenceMap[signature] = occurrence + 1;
                                const localId = `${signature}\u0000${occurrence}`;
                                let column = localSubDescKeys.find(item => item.localId === localId);
                                if (!column) {
                                    const key = `subDesc:${patchListIndex}:${localSubDescKeys.length}`;
                                    column = { localId, key };
                                    localSubDescKeys.push(column);
                                    subDescNames.push(key);
                                    subDescLabels[key] = conditionNames[conditionId]
                                        ? `${conditionNames[conditionId]} · ${name}`
                                        : name;
                                    subDescValues[key] = Array(levelIndex).fill('');
                                }
                                subDescValues[column.key][levelIndex] = subDesc.desc ?? '';
                            });
                            localSubDescKeys.forEach(column => {
                                if (subDescValues[column.key].length <= levelIndex) subDescValues[column.key].push('');
                            });
                        });
                    });
                }

                if (s.skillGroupType === 3 && conditions.length > 1 && values.coolDown.length > 0) {
                    conditions.forEach(condition => {
                        const adjustments = { 2: 0, 4: 0 };
                        const found = { 2: false, 4: false };
                        highestTalentEffects.forEach(effect => {
                            (effect.dataList || []).forEach(item => {
                                const modifier = item.skillParamModifier;
                                if (!modifier || ![2, 4].includes(modifier.paramType) || modifier.modifyType !== 1) return;
                                if (!skillIdList.includes(modifier.skillId) || !(item.activeCondition || []).includes(condition.id)) return;
                                if (typeof modifier.paramValue !== 'number') return;
                                adjustments[modifier.paramType] += modifier.paramValue;
                                found[modifier.paramType] = true;
                            });
                        });
                        const adjustment = found[4] ? adjustments[4] : (found[2] ? adjustments[2] : 0);
                        const key = `coolDown:${condition.id}`;
                        values[key] = values.coolDown.map(coolDown => coolDown + adjustment);
                        subDescLabels[key] = `${condition.name || condition.id} · ${t('columns.coolDown')}`;
                    });
                    delete values.coolDown;
                }

                const descriptionValues = {};
                patchLists.forEach(patches => {
                    const lastPatch = patches[patches.length - 1];
                    (lastPatch.blackboard || []).forEach(bb => {
                        if (bb && bb.key !== undefined) descriptionValues[bb.key] = bb.value;
                    });
                });
                const skillGroupId = s.skillGroupId || skillIdList[0] || groupName;
                const skillKey = `${skillGroupId}:${skillGroupId}`;
                const conditionVariants = conditions.map(condition => ({
                    ...condition,
                    conditionDesc: replacePlaceholders(condition.conditionDesc, descriptionValues).replace(/^\/\*|\*\/$/g, '').trim(),
                    description: replacePlaceholders(condition.description, descriptionValues)
                }));
                legacy.skill[skillKey] = { skillKey, name: groupName, values, subDescNames, subDescLabels, subDescValues };
                return {
                    skillKey,
                    name: groupName,
                    icon: iconPath,
                    description: replacePlaceholders(groupDescription, descriptionValues),
                    conditionVariants,
                    groupType: s.skillGroupType || 0,
                    skillIds: skillIdList,
                    skillGroupId: s.skillGroupId || '',
                    showGroupCosts: true
                };
            });

            const skillLevelUp = rawData.chargrowthtable?.skillLevelUp || [];
            const skillCosts = {};
            const skillGroupIdToName = {};
            legacy.skills.forEach(g => { skillGroupIdToName[g.skillIds?.[0]?.split('_').slice(0, -1).join('_') || ''] = g.name; });
            Object.values(rawData.chargrowthtable?.skillGroupMap || {}).forEach(sg => {
                skillGroupIdToName[sg.skillGroupId] = getText(sg.name);
            });
            skillLevelUp.forEach(entry => {
                const gid = entry.skillGroupId;
                if (!skillCosts[gid]) skillCosts[gid] = [];
                skillCosts[gid].push({ level: entry.level, goldCost: entry.goldCost || 0, items: entry.itemBundle || [] });
            });
            Object.values(skillCosts).forEach(arr => arr.sort((a, b) => a.level - b.level));
            legacy.skillCosts = skillCosts;
            legacy.skillGroupIdToName = skillGroupIdToName;

            const spaceshipChars = rawData.spaceshipcharskilltable?.skillList || [];
            const spaceshipSkills = rawData.spaceshipskilltable || {};
            const groupedSkills = {};
            spaceshipChars.forEach(s => {
                const skill = spaceshipSkills[s.skillId];
                if (!skill) return;
                const tName = getText(skill.talentName);
                if (!groupedSkills[tName]) {
                    groupedSkills[tName] = {
                        icon: skill.icon ? `/public/images/character/spaceshipskillicon/${skill.icon}.png` : '',
                        talentName: tName,
                        roomTypeName: roomTypeMap[String(skill.roomType)] || '',
                        levels: []
                    };
                }
                groupedSkills[tName].levels.push({
                    postfix: skill.skillNamePostfix || '',
                    skillName: getText(skill.name),
                    skillDesc: parseText(getText(skill.desc)),
                    unlockHint: getText(s.unlockHint)
                });
            });
            legacy.spaceshipSkills = Object.values(groupedSkills);

            legacy.profileRecord = (rawData.charactertable?.profileRecord || []).map(rec => ({
                title: rec.recordTitle?.text || '',
                desc: rec.recordDesc?.text || ''
            }));
            legacy.profileVoice = (rawData.charactertable?.profileVoice || []).map(v => ({
                title: getText(v.voiceTitle) || v.voId || '',
                desc: getText(v.voiceDesc)
            }));

            return legacy;
        }

        function updateGrowthTable() {
            const tbody = document.querySelector('.growth-table tbody');
            if (!tbody || !currentCharData) return;
            const growth = currentCharData.growth || {};
            const attributes = GROWTH_ATTRIBUTES.map(attribute => attribute.id);
            const preciseAttrs = new Set(GROWTH_ATTRIBUTES.filter(attribute => attribute.precise).map(attribute => attribute.id));
            const showHiddenGrowth = getCurrentShowHidden();
            const firstAttr = attributes.find(attr => growth[attr] && growth[attr].length);
            const levelCount = firstAttr ? growth[firstAttr].length : 0;
            const allGrowthRows = [];
            for (let lv = 1; lv <= levelCount; lv++) {
                const cells = attributes.map(attr => {
                    const val = growth[attr]?.[lv - 1];
                    const precision = preciseAttrs.has(attr) ? (showHiddenGrowth ? 5 : 3) : 2;
                    if (val === undefined) return '<td>-</td>';
                    const display = Number(val).toFixed(precision);
                    const detail = currentCharData.growthDetails?.[attr]?.[lv - 1];
                    const html = window.renderRawValueTip ? window.renderRawValueTip(display, detail || val) : display;
                    return `<td>${html}</td>`;
                }).join('');
                allGrowthRows.push(`<tr data-level="${lv}"><td>${lv}</td>${cells}</tr>`);
            }

            let rowsToRender = allGrowthRows;
            if (charLevelsToShow && !showAllCharLevels) {
                const levelSet = new Set(charLevelsToShow);
                rowsToRender = allGrowthRows.filter(row => {
                    const match = row.match(/data-level="(\d+)"/);
                    return match && levelSet.has(parseInt(match[1], 10));
                });
            }
            if (rowsToRender.length === 0 && charLevelsToShow && charLevelsToShow.length > 0) {
                const maxLevel = Math.max(...charLevelsToShow);
                const found = allGrowthRows.find(r => r.includes(`data-level="${maxLevel}"`));
                if (found) rowsToRender = [found];
            }
            tbody.innerHTML = rowsToRender.join('');

            const btn = document.querySelector('.toggle-char-levels-btn');
            if (btn) btn.textContent = showAllCharLevels ? t('collapseExtraLevels') : t('expandAllLevels');
        }

        function updateSkillTable(skillKey) {
            const skillItem = Array.from(document.querySelectorAll('.skill-item')).find(item => item.dataset.skillKey === skillKey);
            const skillContainer = skillItem?.querySelector('.skill-detail');
            if (!skillContainer || !currentCharData) return;

            const showHidden = getCurrentShowHidden();
            const group = currentCharData.skills?.find(g => g.skillKey === skillKey);
            const skillDetail = currentCharData.skill?.[skillKey];
            if (!group || !skillDetail) return;

            const values = skillDetail.values || {};
            const subDescNames = skillDetail.subDescNames || [];
            const subDescLabels = skillDetail.subDescLabels || {};
            const subDescValues = skillDetail.subDescValues || {};
            const bbColumns = Object.keys(values).filter(k => Array.isArray(values[k]));
            const hasSubDesc = subDescNames.length > 0;
            let allColumns;
            if (hasSubDesc) {
                if (showHidden) {
                    allColumns = [...subDescNames, ...bbColumns];
                } else {
                    const extraCols = bbColumns.filter(isAlwaysShowColumn);
                    allColumns = [...extraCols, ...subDescNames];
                }
            } else {
                allColumns = bbColumns;
            }
            if (allColumns.length === 0) {
                skillContainer.innerHTML = '';
                return;
            }

            const levelCount = Math.max(0, ...allColumns.map(col => (subDescValues[col] || values[col] || []).length));
            const allSkillRows = [];
            for (let lv = 1; lv <= levelCount; lv++) {
                const cells = allColumns.map(col => {
                    if (hasSubDesc && subDescValues[col] !== undefined) {
                        return `<td>${subDescValues[col][lv - 1] ?? ''}</td>`;
                    }
                    const arr = values[col];
                    let val = arr ? (arr[lv - 1] !== undefined ? arr[lv - 1] : arr[arr.length - 1]) : '';
                    if (typeof val === 'number') {
                        const display = val.toFixed(2);
                        val = window.renderRawValueTip ? window.renderRawValueTip(display, val, col) : display;
                    }
                    return `<td>${val}</td>`;
                }).join('');
                allSkillRows.push(`<tr data-level="${lv}"><td>${t('levelAbbreviation', { name: lv })}</td>${cells}</tr>`);
            }

            const isExpanded = globalSkillExpand ? true : (skillExpandMap[skillKey] || false);
            let rowsToRender = allSkillRows;
            if (!isExpanded && skillLevelsToShow) {
                const levelSet = new Set(skillLevelsToShow);
                rowsToRender = allSkillRows.filter(row => {
                    const match = row.match(/data-level="(\d+)"/);
                    return match && levelSet.has(parseInt(match[1], 10));
                });
            }
            if (rowsToRender.length === 0 && !isExpanded && skillLevelsToShow && skillLevelsToShow.length > 0) {
                const maxLevel = Math.max(...skillLevelsToShow);
                const found = allSkillRows.find(r => r.includes(`data-level="${maxLevel}"`));
                if (found) rowsToRender = [found];
            }

            const headerCells = allColumns.map(col => `<th>${COLUMN_KEY_MAP[col] ? t(COLUMN_KEY_MAP[col]) : (subDescLabels[col] || col)}</th>`).join('');
            const header = `<tr><th>${t('level')}</th>${headerCells}</tr>`;
            const tableHtml = `
                <div class="skill-toggle-container">
                    <button class="skill-toggle-btn" data-skill-key="${skillKey}">${isExpanded ? t('collapseExtraLevels') : t('expandAllLevels')}</button>
                </div>
                <table class="skill-table">
                    <thead>${header}</thead>
                    <tbody>${rowsToRender.join('')}</tbody>
                </table>
            `;
            skillContainer.innerHTML = tableHtml;

            const newBtn = skillContainer.querySelector('.skill-toggle-btn');
            if (newBtn) {
                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (globalSkillExpand) globalSkillExpand = false;
                    skillExpandMap[skillKey] = !skillExpandMap[skillKey];
                    updateSkillTable(skillKey);
                });
            }
        }

        function updateAllSkillTables() {
            const skillKeys = currentCharData.skills?.map(g => g.skillKey) || [];
            skillKeys.forEach(skillKey => updateSkillTable(skillKey));
        }

        function escapeAttribute(value) {
            return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function renderCostItemsHtml(items, goldCost, itemInfoMap) {
            const parts = [...(items || [])];
            if (goldCost && goldCost > 0 && !parts.some(it => it.id === 'item_gold')) {
                parts.push({ id: 'item_gold', count: goldCost });
            }
            if (parts.length === 0) return '';
            return parts.map(it => {
                const info = itemInfoMap?.[it.id] || {};
                return `<div class="cost-item" title="${escapeAttribute(info.description)}"><img src="/public/images/item/itemiconbig/${info.iconId || it.id}.png" onerror="this.style.display='none'"><span class="ci-name">${info.name || it.id}</span><span class="ci-cnt">×${it.count}</span></div>`;
            }).join('');
        }

        function costBtnHtml(innerHtml, itemIds, itemInfoMap) {
            if (!innerHtml) return '';
            const icons = (itemIds || []).map(id => `<img src="/public/images/item/itemiconbig/${itemInfoMap?.[id]?.iconId || id}.png" onerror="this.style.display='none'">`).join('');
            return `<span class="cost-wrap"><span class="cost-btn" onclick="event.stopPropagation();var tip=this.nextElementSibling;tip.classList.toggle('pinned');if(tip.classList.contains('pinned'))document.querySelectorAll('.cost-tip.pinned').forEach(x=>{if(x!==tip)x.classList.remove('pinned')})">${t('developmentCost')}</span><span class="cost-btn-icons">${icons}</span><span class="cost-tip">${innerHtml}</span></span>`;
        }

        function renderDetail(data) {
            const showHidden = getCurrentShowHidden();

            const basicHtml = `
                <div class="detail-header">
                    <div class="detail-left">
                        <div class="detail-icon">
                            <img src="${data.icon || ''}" onerror="this.onerror=null; this.src='';">
                        </div>
                        <div class="detail-text">
                            <div class="detail-title-row">
                                <span class="detail-name">${data.name}</span>
                                <span class="detail-rarity rarity-${data.rarity}" title="${t('rarityLabel', { name: data.rarity })}"></span>
                            </div>
                            <div class="detail-tags">
                                ${(data.charBattleTag || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
                            </div>
                            <div class="detail-meta">
                                <div><span class="meta-label">${t('meta.profession')}</span> ${data.profession || '-'}</div>
                                <div><span class="meta-label">${t('meta.weaponType')}</span> ${data.weapontype || '-'}</div>
                                <div><span class="meta-label">${t('meta.mainAttribute')}</span> ${data.mainAttrType || '-'}</div>
                                <div><span class="meta-label">${t('meta.subAttribute')}</span> ${data.subAttrType || '-'}</div>
                                <div><span class="meta-label">${t('meta.voiceActor')}</span> ${(data.cvName || []).join(' / ')}</div>
                            </div>
                            <div class="detail-profile">${parseText(data.profile || '')}</div>
                            <div class="detail-feature">${parseText(data.feature || '')}</div>
                        </div>
                    </div>
                    <div class="detail-pic">
                        <img src="${data.pic || ''}" onerror="this.style.display='none'">
                    </div>
                </div>
            `;

            const growth = data.growth || {};
            const attributes = GROWTH_ATTRIBUTES.map(attribute => attribute.id);
            const preciseAttrs = new Set(GROWTH_ATTRIBUTES.filter(attribute => attribute.precise).map(attribute => attribute.id));
            const showHiddenGrowth = getCurrentShowHidden();
            const firstAttr = attributes.find(attr => growth[attr] && growth[attr].length);
            const levelCount = firstAttr ? growth[firstAttr].length : 0;
            const allGrowthRows = [];
            for (let lv = 1; lv <= levelCount; lv++) {
                const cells = attributes.map(attr => {
                    const val = growth[attr]?.[lv - 1];
                    const precision = preciseAttrs.has(attr) ? (showHiddenGrowth ? 5 : 3) : 2;
                    if (val === undefined) return '<td>-</td>';
                    const display = Number(val).toFixed(precision);
                    const detail = data.growthDetails?.[attr]?.[lv - 1];
                    const html = window.renderRawValueTip ? window.renderRawValueTip(display, detail || val) : display;
                    return `<td>${html}</td>`;
                }).join('');
                allGrowthRows.push(`<tr data-level="${lv}"><td>${lv}</td>${cells}</tr>`);
            }

            let growthRowsToRender = allGrowthRows;
            if (charLevelsToShow && !showAllCharLevels) {
                const levelSet = new Set(charLevelsToShow);
                growthRowsToRender = allGrowthRows.filter(row => {
                    const match = row.match(/data-level="(\d+)"/);
                    return match && levelSet.has(parseInt(match[1], 10));
                });
            }
            if (growthRowsToRender.length === 0 && charLevelsToShow && charLevelsToShow.length > 0) {
                const maxLevel = Math.max(...charLevelsToShow);
                const found = allGrowthRows.find(r => r.includes(`data-level="${maxLevel}"`));
                if (found) growthRowsToRender = [found];
            }

            const growthHtml = `
                <div class="section">
                    <div class="section-header-row">
                        <h3>${t('sections.attributeGrowth')}</h3>
                        ${charLevelsToShow ? `<button class="toggle-char-levels-btn">${showAllCharLevels ? t('collapseExtraLevels') : t('expandAllLevels')}</button>` : ''}
                    </div>
                    <div class="growth-table-container">
                        <table class="growth-table">
                            <thead>
                                <tr>
                                    <th>${t('level')}</th>
                                    ${GROWTH_ATTRIBUTES.map(attribute => `<th>${t(attribute.key)}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>${growthRowsToRender.join('')}</tbody>
                        </table>
                    </div>
                </div>
            `;

            const itemInfoMap = data.itemInfoMap || {};
            const showHiddenAttr = getCurrentShowHidden();
            const talentsHtml = (data.talents || []).map(talent => {
                const valueMap = talent.values || {};
                let desc = replacePlaceholders(talent.description, valueMap, talent.modifierTypes, showHiddenAttr);
                desc = parseText(desc);
                const costHtml = renderCostItemsHtml(talent.requiredItem, 0, itemInfoMap);
                const costIconIds = (talent.requiredItem || []).map(it => it.id);
                return `
                    <div class="talent-item">
                        <div class="talent-name">${talent.name} ${costBtnHtml(costHtml, costIconIds, itemInfoMap)}</div>
                        <div class="talent-desc">${desc}</div>
                    </div>
                `;
            }).join('');

            const potentialsHtml = (data.potentials || []).map(pot => {
                const valueMap = pot.values || {};
                let desc = replacePlaceholders(pot.description, valueMap, pot.modifierTypes, showHiddenAttr);
                desc = parseText(desc);
                const costHtml = renderCostItemsHtml(pot.costItems, 0, itemInfoMap);
                const costIconIds = (pot.costItems || []).map(it => it.id);
                return `
                    <div class="potential-item">
                        <div class="potential-name">${pot.name} ${costBtnHtml(costHtml, costIconIds, itemInfoMap)}</div>
                        <div class="potential-desc">${desc}</div>
                    </div>
                `;
            }).join('');

            const attrNodes = data.attributeNodes || [];
            const attrNodesHtml = `
                <div class="section">
                    <h3>${t('sections.attributeNodes')}</h3>
                    <div class="attr-nodes-grid">
                        ${attrNodes.map(node => {
                            const costHtml = renderCostItemsHtml(node.requiredItem, 0, itemInfoMap);
                            const costIconIds = (node.requiredItem || []).map(it => it.id);
                            const modifierHtml = (node.modifiers || []).map(mod => {
                                const modTypeTag = (showHiddenAttr && mod.modifierType != null)
                                    ? ` <span class="attr-node-modifier-tag">${modifierTypeMap[String(mod.modifierType)] || ''}</span>`
                                    : '';
                                return `<div class="attr-node-modifier">${mod.text}${modTypeTag}</div>`;
                            }).join('');
                            return `<div class="attr-node-item">
                                <div class="attr-node-title">${node.title} ${costBtnHtml(costHtml, costIconIds, itemInfoMap)}</div>
                                <div class="attr-node-desc">${node.description}</div>
                                ${modifierHtml}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `;

            const skillsGroups = data.skills || [];
            const skillTypePrefix = [t('skillTypes.basicAttack'), t('skillTypes.combatSkill'), t('skillTypes.comboSkill'), t('skillTypes.ultimate')];
            const skillsHtml = skillsGroups.map((group, index) => {
                const skillDetail = data.skill?.[group.skillKey];
                if (!skillDetail) return '';

                const values = skillDetail.values || {};
                const subDescNames = skillDetail.subDescNames || [];
                const subDescLabels = skillDetail.subDescLabels || {};
                const subDescValues = skillDetail.subDescValues || {};
                const level1Values = {};
                for (const [key, val] of Object.entries(values)) {
                    if (Array.isArray(val) && val.length > 0) level1Values[key] = val[0];
                    else level1Values[key] = val;
                }

                const groupDesc = parseText(replacePlaceholders(group.description || '', level1Values));
                const prefixIndex = SKILL_GROUP_ORDER[group.groupType] ?? group.groupType;
                const prefix = skillTypePrefix[prefixIndex] || t('sections.skills');
                const displayName = `${prefix}·${group.name}`;

                const bbColumns = Object.keys(values).filter(k => Array.isArray(values[k]));
                const hasSubDesc = subDescNames.length > 0;
                let allColumns;
                if (hasSubDesc) {
                    if (showHidden) {
                        allColumns = [...subDescNames, ...bbColumns];
                    } else {
                        const extraCols = bbColumns.filter(isAlwaysShowColumn);
                        allColumns = [...extraCols, ...subDescNames];
                    }
                } else {
                    allColumns = bbColumns;
                }

                let skillTables = '';
                if (allColumns.length > 0) {
                    const levelCount = Math.max(0, ...allColumns.map(col => (subDescValues[col] || values[col] || []).length));
                    const allSkillRows = [];
                    for (let lv = 1; lv <= levelCount; lv++) {
                        const cells = allColumns.map(col => {
                            if (hasSubDesc && subDescValues[col] !== undefined) {
                                return `<td>${subDescValues[col][lv - 1] ?? ''}</td>`;
                            }
                            const arr = values[col];
                            let val = arr ? (arr[lv - 1] !== undefined ? arr[lv - 1] : arr[arr.length - 1]) : '';
                            if (typeof val === 'number') {
                                const display = val.toFixed(2);
                                val = window.renderRawValueTip ? window.renderRawValueTip(display, val, col) : display;
                            }
                            return `<td>${val}</td>`;
                        }).join('');
                        allSkillRows.push(`<tr data-level="${lv}"><td>${t('levelAbbreviation', { name: lv })}</td>${cells}</tr>`);
                    }

                    const isExpanded = globalSkillExpand ? true : (skillExpandMap[group.skillKey] || false);
                    let skillRowsToRender = allSkillRows;
                    if (!isExpanded && skillLevelsToShow) {
                        const levelSet = new Set(skillLevelsToShow);
                        skillRowsToRender = allSkillRows.filter(row => {
                            const match = row.match(/data-level="(\d+)"/);
                            return match && levelSet.has(parseInt(match[1], 10));
                        });
                    }
                    if (skillRowsToRender.length === 0 && !isExpanded && skillLevelsToShow && skillLevelsToShow.length > 0) {
                        const maxLevel = Math.max(...skillLevelsToShow);
                        const found = allSkillRows.find(r => r.includes(`data-level="${maxLevel}"`));
                        if (found) skillRowsToRender = [found];
                    }

                    const headerCells = allColumns.map(col => `<th>${COLUMN_KEY_MAP[col] ? t(COLUMN_KEY_MAP[col]) : (subDescLabels[col] || col)}</th>`).join('');
                    const header = `<tr><th>${t('level')}</th>${headerCells}</tr>`;
                    const btnText = isExpanded ? t('collapseExtraLevels') : t('expandAllLevels');

                    skillTables = `
                        <div class="skill-detail">
                            <div class="skill-toggle-container">
                                <button class="skill-toggle-btn" data-skill-key="${group.skillKey}">${btnText}</button>
                            </div>
                            <table class="skill-table">
                                <thead>${header}</thead>
                                <tbody>${skillRowsToRender.join('')}</tbody>
                            </table>
                        </div>
                    `;
                }

                const skCosts = group.showGroupCosts ? ((data.skillCosts || {})[group.skillGroupId] || []) : [];
                let skCostHtml = '';
                if (skCosts.length > 0) {
                    const rows = skCosts.map(c => {
                        const itemParts = [...(c.goldCost > 0 ? [{ id: 'item_gold', count: c.goldCost }] : []), ...c.items.filter(it => it.id !== 'item_gold')];
                        const itemsStr = itemParts.map(it => {
                            const info = itemInfoMap[it.id] || {};
                            return `<span class="ci-ri" title="${escapeAttribute(info.description)}"><img src="/public/images/item/itemiconbig/${info.iconId || it.id}.png" onerror="this.style.display='none'">${info.name || it.id} ×${it.count}</span>`;
                        }).join('');
                        return `<div class="sk-cost-row"><span class="cost-section-title">${t('levelRange', { name: `${c.level - 1}→${c.level}` })}</span>${itemsStr}</div>`;
                    }).join('');
                    skCostHtml = rows;
                }

                const conditionHtml = (group.conditionVariants || []).map(condition => `
                    <div class="skill-condition">
                        <div class="skill-condition-name">
                            <img class="skill-condition-icon" src="${condition.icon}" alt="" onerror="this.onerror=null; this.src='';">
                            ${condition.name}
                        </div>
                        ${condition.conditionDesc ? `<div class="skill-condition-trigger">${parseText(condition.conditionDesc)}</div>` : ''}
                        ${condition.description ? `<div class="skill-condition-desc">${parseText(condition.description)}</div>` : ''}
                    </div>
                `).join('');

                return `
                    <div class="skill-item" data-skill-key="${group.skillKey}">
                        <div class="skill-name">
                            <img class="skill-icon" src="${group.icon}" alt="" onerror="this.onerror=null; this.src='';">
                            ${displayName} ${costBtnHtml(skCostHtml, ['item_gold', ...new Set(skCosts.flatMap(c => c.items.map(it => it.id)))], itemInfoMap)}
                        </div>
                        <div class="skill-desc">${groupDesc}</div>
                        ${conditionHtml ? `<div class="skill-conditions">${conditionHtml}</div>` : ''}
                        ${skillTables}
                    </div>
                `;
            }).join('');

            const potentialPics = data.potentialpics || [];
            const potentialPicsHtml = potentialPics.length > 0 ? `
                <div class="section collapsible-section">
                    <h3 class="section-header">
                        <span class="collapse-indicator">▶</span> ${t('sections.potentialImages')}
                    </h3>
                    <div class="collapse-content">
                        <div class="potential-pics">
                            ${potentialPics.map(src => `<img src="${src}" onerror="this.style.display='none'">`).join('')}
                        </div>
                    </div>
                </div>
            ` : '';

            const profileRecordsHtml = (data.profileRecord || []).map(rec => `
                <div class="profile-record">
                    <div class="profile-title">${rec.title}</div>
                    <div class="profile-desc">${parseText(rec.desc)}</div>
                </div>
            `).join('');

            const voiceHtml = (data.profileVoice || []).length ? `
                <table class="voice-table">
                    ${(data.profileVoice || []).map(v => `
                        <tr>
                            <td class="voice-title">${v.title}</td>
                            <td class="voice-desc">${v.desc}</td>
                        </tr>
                    `).join('')}
                </table>
            ` : `<p>${t('none')}</p>`;

            const spaceshipSkills = data.spaceshipSkills || [];
            const spaceshipHtml = spaceshipSkills.length ? spaceshipSkills.map(slot => `
                <div class="spaceship-skill-item">
                    <div class="spaceship-skill-header">
                        <img class="spaceship-icon" src="${slot.icon}" alt="" onerror="this.onerror=null; this.src='';">
                        <span class="spaceship-skill-name">${slot.talentName}</span>
                        <span class="spaceship-skill-room">${slot.roomTypeName}</span>
                    </div>
                    <div class="spaceship-skill-levels">
                        ${slot.levels.map(lv => `
                            <div class="spaceship-skill-level">
                                <span class="spaceship-skill-postfix">${lv.postfix}</span>
                                <div class="spaceship-skill-info">
                                    <div class="spaceship-skill-fullname">${lv.skillName}</div>
                                    <div class="spaceship-skill-desc">${lv.skillDesc}</div>
                                    <div class="spaceship-skill-unlock">${lv.unlockHint}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('') : `<p>${t('none')}</p>`;

            return `
                ${basicHtml}
                ${growthHtml}
                <div class="section">
                    <h3>${t('sections.talents')}</h3>
                    ${talentsHtml || `<p>${t('none')}</p>`}
                </div>
                <div class="section">
                    <h3>${t('sections.potentials')}</h3>
                    ${potentialsHtml || `<p>${t('none')}</p>`}
                </div>
                ${attrNodesHtml}
                <div class="section">
                    <div class="section-header-row">
                        <h3>${t('sections.skills')}</h3>
                        ${skillLevelsToShow ? `<button class="global-skill-toggle-btn">${globalSkillExpand ? t('collapseAllSkillLevels') : t('expandAllSkillLevels')}</button>` : ''}
                    </div>
                    ${skillsHtml || `<p>${t('none')}</p>`}
                </div>
                <div class="section">
                    <h3>${t('sections.logisticsSkills')}</h3>
                    ${spaceshipHtml}
                </div>
                ${potentialPicsHtml}
                <div class="section collapsible-section">
                    <h3 class="section-header">
                        <span class="collapse-indicator">▶</span> ${t('sections.profile')}
                    </h3>
                    <div class="collapse-content">
                        ${profileRecordsHtml || `<p>${t('none')}</p>`}
                    </div>
                </div>
                <div class="section collapsible-section">
                    <h3 class="section-header">
                        <span class="collapse-indicator">▶</span> ${t('sections.voiceRecords')}
                    </h3>
                    <div class="collapse-content">
                        ${voiceHtml}
                    </div>
                </div>
            `;
        }

        async function refreshModule() {
            const list = document.getElementById('v2characterList');
            const detail = document.getElementById('v2characterDetail');
            if (!list || !detail) return;
            const showHidden = window.akeData?.getConfig().showHidden ?? false;
            const chars = await loadCharacterManifest(showHidden);
            allCharacters = chars;
            generateFilterButtons();
            renderCharacterList();
        }

        async function initModule() {
            if (isInitialized) return;
            isInitialized = true;
            if (window.configLoaded) await window.configLoaded;
            await loadMaps();

            document.addEventListener('click', () => {
                document.querySelectorAll('.cost-tip.pinned').forEach(t => t.classList.remove('pinned'));
            });

            const settings = window.akeData?.getLevelSettings?.() || {};
            if (settings.enabled) {
                charLevelsToShow = parseLevelInput(settings.characterLevels, 90);
                const skillEnabled = settings.skillLevels || Array(12).fill(true);
                skillLevelsToShow = skillEnabled.reduce((acc, checked, idx) => {
                    if (checked) acc.push(idx + 1);
                    return acc;
                }, []);
            }

            if (mobileBtn) mobileBtn.addEventListener('click', openMobileList);
            if (mobileOverlay) mobileOverlay.addEventListener('click', (e) => {
                if (e.target === mobileOverlay) closeMobileList();
            });

            window.addEventListener('globalConfigChanged', (e) => {
                searchTerm = '';
                const searchInput = document.getElementById('v2charSearchInput');
                if (searchInput) searchInput.value = '';

                const settings = window.akeData?.getLevelSettings?.() || {};
                if (settings.enabled) {
                    charLevelsToShow = parseLevelInput(settings.characterLevels, 90);
                    const skillEnabled = settings.skillLevels || Array(12).fill(true);
                    skillLevelsToShow = skillEnabled.reduce((acc, checked, idx) => {
                        if (checked) acc.push(idx + 1);
                        return acc;
                    }, []);
                } else {
                    charLevelsToShow = null;
                    skillLevelsToShow = null;
                }
                showAllCharLevels = false;
                globalSkillExpand = false;
                skillExpandMap = {};

                selectedRarities.clear();
                selectedCharTypes.clear();
                selectedProfessions.clear();
                selectedWeaponTypes.clear();
                refreshModule();
            });

            document.getElementById('v2charSearchInput')?.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                renderCharacterList();
            });

            await refreshModule();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initModule);
        } else {
            initModule();
        }
    })();
