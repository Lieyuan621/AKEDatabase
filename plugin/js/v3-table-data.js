(function () {
    if (window.AKEV3) return;

    const TABLE_ROOT = '/public/TableCfg/';
    const tableCache = new Map();
    let i18nPromise = null;
    let originalAkeFetch = window.akeFetch || window.fetch.bind(window);

    const MODULE_ALIASES = {
        character: 'v2_character', weapon: 'v2_weapon', enemy: 'v2_enemy',
        equip: 'v2_equip', item: 'v2_item', dungeon: 'v2_dungeon',
        cc: 'v2_cc', activity: 'activity', achievement: 'achievement'
    };

    function losslessParse(text) {
        // Text references use signed Int64 IDs. Preserve them before JSON.parse
        // converts them to imprecise Numbers.
        return JSON.parse(text.replace(/("id"\s*:\s*)(-?\d{16,})(?=\s*[,}])/g, '$1"$2"'));
    }

    async function fetchText(url) {
        const response = await originalAkeFetch(url);
        if (!response.ok) throw new Error(`无法加载 ${url} (HTTP ${response.status})`);
        return response.text();
    }

    async function loadI18n() {
        if (!i18nPromise) {
            i18nPromise = fetchText(`${TABLE_ROOT}I18nTextTable_CN.json`).then(JSON.parse);
        }
        return i18nPromise;
    }

    async function table(name) {
        if (!tableCache.has(name)) {
            tableCache.set(name, Promise.all([
                fetchText(`${TABLE_ROOT}${name}.json`).then(losslessParse),
                loadI18n()
            ]).then(([data, i18n]) => hydrate(data, i18n)));
        }
        return tableCache.get(name);
    }

    function hydrate(value, i18n, seen) {
        if (!value || typeof value !== 'object') return value;
        seen = seen || new WeakSet();
        if (seen.has(value)) return value;
        seen.add(value);
        if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'id') &&
            Object.prototype.hasOwnProperty.call(value, 'text') && !value.text) {
            value.text = i18n[String(value.id)] || '';
        }
        Object.values(value).forEach(child => hydrate(child, i18n, seen));
        return value;
    }

    function pick(source, keys) {
        const result = {};
        (keys || []).forEach(key => { if (source && source[key] !== undefined) result[key] = source[key]; });
        return result;
    }

    function valuesBy(source, field, expected) {
        return Object.fromEntries(Object.entries(source || {}).filter(([, row]) => row && row[field] === expected));
    }

    function virtualResponse(data) {
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    function text(ref, fallback) {
        if (typeof ref === 'string') return ref;
        return ref?.text || fallback || '';
    }

    function compareId(a, b) {
        const aId = a.charId || a.weaponId || a.templateId || a.suitID || a.itemId || a.activityId || a.categoryId || a.gameId || a.id || '';
        const bId = b.charId || b.weaponId || b.templateId || b.suitID || b.itemId || b.activityId || b.categoryId || b.gameId || b.id || '';
        return String(aId).localeCompare(String(bId), 'en');
    }

    function byRarityThenId(a, b) {
        return (b.rarity || 0) - (a.rarity || 0) || compareId(a, b);
    }

    function assignPriority(rows) {
        return rows.map((row, index) => ({ ...row, priority: index + 1 }));
    }

    async function optionalJson(url) {
        try {
            const response = await originalAkeFetch(url);
            return response.ok ? response.json() : null;
        } catch {
            return null;
        }
    }

    const ENEMY_RARITY_BY_DISPLAY_TYPE = { 0: 2, 3: 3, 1: 4, 4: 5, 2: 6 };

    function dungeonRarity(row) {
        if (row.gameCategory === 'dungeon_highdifficulty') return 6;
        if (row.gameCategory === 'dungeon_bossrush') return row.dungeonCategory === 3 ? 5 : 3;
        if (row.gameCategory === 'dungeon_ss') return 4;
        if (['dungeon_actmonster', 'dungeon_challenge', 'dungeon_resource', 'dungeon_weeklyraid'].includes(row.gameCategory)) return 3;
        if (['dungeon_char', 'dungeon_chartutorial', 'dungeon_contract', 'dungeon_train', 'dungeon_worldlevel',
            'dungeon_wuling_A', 'dungeon_wuling_B'].includes(row.gameCategory)) return 2;
        return 1;
    }

    function icon(kind, id, iconId) {
        const paths = {
            character: `/public/images/character/charremoteicon/icon_${id}.png`,
            weapon: `/public/images/weapon/icon/${iconId || id}.png`,
            enemy: `/public/images/enemy/monstericon/${id}.png`,
            item: `/public/images/item/itemicon/${iconId || id}.png`,
            equip: `/public/images/equip/icon/${iconId || id}.png`
        };
        return paths[kind] || '';
    }

    async function characterManifest() {
        const [chars, growth, maps] = await Promise.all([table('CharacterTable'), table('CharGrowthTable'), loadMaps()]);
        const rows = Object.entries(chars).map(([charId, row], index) => {
            const grow = growth[charId] || {};
            return {
                charId, name: text(row.name, charId), rarity: row.rarity,
                charType: maps.char_type_map?.[grow.charTypeId] || grow.charTypeId,
                profession: maps.profession_id_map?.[String(grow.profession)] || grow.profession,
                weapontype: maps.weapon_id_map?.[String(grow.weaponType)] || grow.weaponType,
                mainAttrType: row.mainAttrType, charBattleTag: grow.charBattleTag || [],
                icon: icon('character', charId), contentFile: `/__v3/character/${charId}.json`,
                sourceOrder: index, hidden: false
            };
        });
        return assignPriority(rows.sort(byRarityThenId));
    }

    async function characterDetail(id) {
        const [chars, growth, potentials, talentEffects, skills, shipChars, shipSkills, items, professions] = await Promise.all([
            table('CharacterTable'), table('CharGrowthTable'), table('CharacterPotentialTable'),
            table('PotentialTalentEffectTable'), table('SkillPatchTable'), table('SpaceshipCharSkillTable'),
            table('SpaceshipSkillTable'), table('ItemTable'), table('CharProfessionTable')
        ]);
        const char = chars[id] || {};
        const grow = growth[id] || {};
        const talentIds = Object.values(grow.talentNodeMap || {}).map(n => n.passiveSkillNodeInfo?.talentEffectId).filter(Boolean);
        const potential = potentials[id] || {};
        const potentialIds = (potential.potentialUnlockBundle || []).map(p => p.potentialEffectId).filter(Boolean);
        const skillIds = new Set();
        Object.values(grow.skillGroupMap || {}).forEach(group => {
            (group.skillIdList || []).forEach(skillId => skillIds.add(skillId));
            if (group.skillGroupId) skillIds.add(group.skillGroupId);
        });
        potentialIds.forEach(skillId => skillIds.add(skillId));
        const shipRow = shipChars[id] || {};
        const shipIds = (shipRow.skillList || []).map(s => s.skillId);
        const itemIds = new Set([id]);
        Object.values(grow.talentNodeMap || {}).forEach(n => (n.requiredItem || []).forEach(item => itemIds.add(item.id)));
        (potential.potentialUnlockBundle || []).forEach(p => (p.itemIds || []).forEach(itemId => itemIds.add(itemId)));
        (grow.skillLevelUp || []).forEach(level => (level.itemBundle || []).forEach(item => itemIds.add(item.id)));
        Object.values(grow.talentNodeMap || {}).forEach(node => {
            (node.requiredItem || []).forEach(required => {
                if (!required.name && items[required.id]?.name) required.name = items[required.id].name;
            });
        });
        return {
            charId: id, charactertable: char, chargrowthtable: grow, characterpotentialtable: potential,
            potentialtalenteffecttable: pick(talentEffects, talentIds.concat(potentialIds)),
            skillpatchtable: pick(skills, Array.from(skillIds)), spaceshipcharskilltable: shipRow,
            spaceshipskilltable: pick(shipSkills, shipIds), itemtable: items[id] || {},
            charprofessiontable: professions[char.profession] || {}
        };
    }

    async function weaponManifest() {
        const [weapons, items] = await Promise.all([table('WeaponBasicTable'), table('ItemTable')]);
        const rows = Object.entries(weapons).map(([weaponId, row], index) => {
            const item = items[weaponId] || {};
            return { weaponId, name: text(item.name, weaponId), rarity: row.rarity, weaponType: row.weaponType,
                icon: icon('weapon', weaponId, item.iconId), contentFile: `/__v3/weapon/${weaponId}.json`, sourceOrder: index, hidden: false };
        });
        return assignPriority(rows.sort(byRarityThenId));
    }

    async function weaponDetail(id) {
        const [weapons, items, skills, breakthrough, upgrade, upgradeSum, talents] = await Promise.all([
            table('WeaponBasicTable'), table('ItemTable'), table('SkillPatchTable'), table('WeaponBreakThroughTemplateTable'),
            table('WeaponUpgradeTemplateTable'), table('WeaponUpgradeTemplateSumTable'), table('WeaponTalentTemplateTable')
        ]);
        const weapon = weapons[id] || {};
        const bt = breakthrough[weapon.breakthroughTemplateId];
        const materialIds = (bt?.list || []).flatMap(row => (row.breakItemList || []).map(item => item.id));
        return { weaponId: id, weaponbasictable: weapon, itemtable: pick(items, [id].concat(materialIds)),
            skillpatchtable: pick(skills, weapon.weaponSkillList || []), weaponbreakthroughtemplatetable: pick(breakthrough, [weapon.breakthroughTemplateId]),
            weaponupgradetemplatetable: pick(upgrade, [weapon.levelTemplateId]), weaponupgradetemplatesumtable: pick(upgradeSum, [weapon.levelTemplateId]),
            weapontalenttemplatetable: pick(talents, [weapon.talentTemplateId]) };
    }

    async function enemyManifest() {
        const [display, enemies, types] = await Promise.all([
            table('EnemyTemplateDisplayInfoTable'), table('EnemyTable'), table('DisplayEnemyTypeTable')
        ]);
        const variantCounts = {};
        Object.values(enemies).forEach(row => { variantCounts[row.templateId] = (variantCounts[row.templateId] || 0) + 1; });
        const rows = Object.entries(display).map(([templateId, row], index) => ({ templateId, name: text(row.name, templateId),
            rarity: ENEMY_RARITY_BY_DISPLAY_TYPE[row.displayType] || 1, icon: icon('enemy', templateId),
            displayType: row.displayType, displayTypeName: text(types[row.displayType]?.name), variantCount: variantCounts[templateId] || 0,
            contentFile: `/__v3/enemy/${templateId}.json`, sourceOrder: index, hidden: false }));
        return assignPriority(rows.sort(byRarityThenId));
    }

    async function enemyDetail(id) {
        const [display, enemies, attrs, abilities, types, distributions] = await Promise.all([
            table('EnemyTemplateDisplayInfoTable'), table('EnemyTable'), table('EnemyAttributeTemplateTable'),
            table('EnemyAbilityDescTable'), table('DisplayEnemyTypeTable'), table('DistributionInfoTable')
        ]);
        const info = display[id] || {};
        const variants = valuesBy(enemies, 'templateId', id);
        const attrIds = new Set([id]);
        Object.values(variants).forEach(row => attrIds.add(row.attrTemplateId));
        return { templateId: id, enemytemplatedisplayinfotable: info, enemytable: variants,
            enemyattributetemplatetable: pick(attrs, Array.from(attrIds)), enemyabilitydesctable: pick(abilities, info.abilityDescIds || []),
            displayenemytypetable: types[info.displayType] || {}, distributioninfotable: pick(distributions, info.distributionIds || []) };
    }

    async function equipManifest() {
        const [suits, equips, items] = await Promise.all([table('EquipSuitTable'), table('EquipTable'), table('ItemTable')]);
        const rows = Object.entries(suits);
        const unsuited = Object.keys(equips).filter(id => !rows.some(([, suit]) => (suit.equipList || []).includes(id)));
        if (unsuited.length) rows.unshift(['suit_none', { equipList: unsuited, list: [] }]);
        const manifestRows = rows.map(([suitID, row], index) => {
            const highestId = (row.equipList || []).reduce((bestId, itemId) => {
                if (!bestId) return itemId;
                return (items[itemId]?.rarity || 0) > (items[bestId]?.rarity || 0) ? itemId : bestId;
            }, '');
            const highest = items[highestId] || {};
            return { suitID, name: text(row.list?.[0]?.suitName, suitID === 'suit_none' ? '独立装备' : suitID), rarity: highest.rarity || 1,
                icon: icon('equip', highestId, highest.iconId), equipCount: (row.equipList || []).length, isIndependentGroup: suitID === 'suit_none',
                contentFile: `/__v3/equip/${suitID}.json`, sourceOrder: index, hidden: false };
        });
        return assignPriority(manifestRows.sort(byRarityThenId));
    }

    async function equipDetail(id) {
        const [suits, equips, items, skills, formulas, reverse, packs, packFormulas, costs, guarantees, constants, tech] = await Promise.all([
            table('EquipSuitTable'), table('EquipTable'), table('ItemTable'), table('SkillPatchTable'), table('EquipFormulaTable'),
            table('EquipFormulaReverseTable'), table('EquipPackTable'), table('EquipPackFormulaTable'), table('EquipEnhanceCostTable'),
            table('EquipEnhanceGuaranteeTimesRuleTable'), table('EquipConst'), table('EquipTechConst')
        ]);
        let suit = suits[id];
        if (!suit && id === 'suit_none') {
            const assigned = new Set(Object.values(suits).flatMap(row => row.equipList || []));
            suit = { equipList: Object.keys(equips).filter(itemId => !assigned.has(itemId)), list: [] };
        }
        suit = suit || { equipList: [], list: [] };
        const equipRows = pick(equips, suit.equipList || []);
        const formulaIds = (suit.equipList || []).map(itemId => reverse[itemId]).filter(Boolean);
        const materialIds = formulaIds.flatMap(formulaId => {
            const row = formulas[formulaId] || {};
            return [row.costGoldId].concat(row.costItemId || []).filter(Boolean);
        });
        const skillIds = (suit.list || []).map(row => row.skillID).filter(Boolean);
        const packRows = Object.fromEntries(Object.entries(packs).filter(([, row]) => (row.equipList || []).some(itemId => suit.equipList.includes(itemId))));
        return { suitId: id, equipsuittable: suit, equiptable: equipRows, itemtable: pick(items, (suit.equipList || []).concat(materialIds)),
            skillpatchtable: pick(skills, skillIds), equipformulatable: pick(formulas, formulaIds), equipformulareversetable: pick(reverse, suit.equipList || []),
            equippacktable: packRows, equippackformulatable: packFormulas, equipenhancecosttable: costs,
            equipenhanceguaranteetimesruletable: guarantees, equipconst: constants, equiptechconst: tech };
    }

    async function itemManifest() {
        const [items, itemTypes, showingTypes, itemsByType, itemsByShowingType] = await Promise.all([
            table('ItemTable'), table('ItemTypeTable'), table('ItemShowingTypeTable'),
            table('ItemListByTypeTable'), table('ItemListByShowingTypeTable')
        ]);
        const showingTypeByItem = {};
        Object.entries(itemsByShowingType).forEach(([showingType, row]) => {
            (row.list || []).forEach(itemId => { showingTypeByItem[itemId] = showingType; });
        });
        const typeByItem = {};
        Object.entries(itemsByType).forEach(([type, row]) => {
            (row.list || []).forEach(itemId => { typeByItem[itemId] = type; });
        });
        const rows = Object.entries(items).map(([itemId, row], index) => {
            const showingType = String(showingTypeByItem[itemId] ?? row.showingType ?? 0);
            const showing = showingTypes[showingType];
            const type = String(typeByItem[itemId] ?? row.type);
            const itemType = itemTypes[type];
            const categoryId = showing && showingType !== '0' ? `showing:${showingType}` : `type:${type}`;
            return { itemId, name: text(row.name, itemId), rarity: row.rarity, type: row.type, categoryId,
                categoryName: text(showing?.name, text(itemType?.name, `类型 ${type}`)),
                categoryOrder: showing ? showing.sortId : 1000 + Number(type),
                icon: icon('item', itemId, row.iconId), contentFile: `/__v3/item/${itemId}.json`, sourceOrder: index, hidden: false };
        });
        return assignPriority(rows.sort(byRarityThenId));
    }

    async function itemDetail(id) {
        const [items, types, jumps, composites, showing, useItems, equipItems, machineCrafts, machineCraftGroups,
            manualCrafts, hubCrafts, buildings, equipFormulas, growFormulas, seedFormulas, spaceshipFormulas] = await Promise.all([
            table('ItemTable'), table('ItemTypeTable'), table('SystemJumpTable'), table('ItemIconCompositeTable'), table('ItemShowingTypeTable'),
            table('UseItemTable'), table('EquipItemTable'), table('FactoryMachineCraftTable'), table('FactoryMachineCraftGroupTable'),
            table('FactoryManualCraftTable'), table('FactoryHubCraftTable'), table('FactoryBuildingTable'), table('EquipFormulaTable'),
            table('SpaceshipGrowCabinFormulaTable'), table('SpaceshipGrowCabinSeedFormulaTable'), table('SpaceshipManufactureFormulaTable')
        ]);
        const item = items[id] || {};
        const flattenGroups = rows => (rows || []).flatMap(row => row.group || []);
        const recipeRows = [];
        const addRecipe = (recipeId, kind, name, inputs, outputs, meta, durationMs) => {
            const normalizedInputs = (inputs || []).filter(row => row?.id);
            const normalizedOutputs = (outputs || []).filter(row => row?.id);
            if (!normalizedInputs.some(row => row.id === id) && !normalizedOutputs.some(row => row.id === id)) return;
            recipeRows.push({ recipeId, kind, name, inputs: normalizedInputs, outputs: normalizedOutputs,
                meta: meta || '', durationMs: durationMs || 0 });
        };
        Object.entries(machineCrafts).forEach(([recipeId, row]) => {
            const building = buildings[row.machineId] || {};
            const msPerRound = machineCraftGroups[row.formulaGroupId]?.msPerRound || 0;
            addRecipe(recipeId, '集成工业生产', text(row.formulaDesc, recipeId), flattenGroups(row.ingredients), flattenGroups(row.outcomes),
                text(building.name, row.machineId), row.progressRound * msPerRound);
        });
        Object.entries(manualCrafts).forEach(([recipeId, row]) => {
            addRecipe(recipeId, '简易制作', text(row.name, recipeId), row.ingredients, row.outcomes, '');
        });
        Object.entries(hubCrafts).forEach(([recipeId, row]) => {
            addRecipe(recipeId, '枢纽制造', recipeId, row.ingredients, row.outcomes, row.usableLevel ? `可用等级 ${row.usableLevel}` : '');
        });
        Object.entries(equipFormulas).forEach(([recipeId, row]) => {
            const inputs = (row.costItemId || []).map((itemId, index) => ({ id: itemId, count: row.costItemNum?.[index] || 0 }));
            if (row.costGoldId && row.costGoldNum) inputs.unshift({ id: row.costGoldId, count: row.costGoldNum });
            addRecipe(recipeId, '装备制造', recipeId, inputs, [{ id: row.outcomeEquipId, count: 1 }], '');
        });
        Object.entries(growFormulas).forEach(([recipeId, row]) => {
            addRecipe(recipeId, '培养舱种植', recipeId, [{ id: row.seedItemId, count: row.seedItemCount }],
                [{ id: row.outcomeItemId, count: row.outcomeItemCount }], row.level ? `设施等级 ${row.level}` : '', row.totalProgress);
        });
        Object.entries(seedFormulas).forEach(([recipeId, row]) => {
            addRecipe(recipeId, '培养舱采种', recipeId, [{ id: row.materialItemId, count: row.materialItemCount }],
                [{ id: row.outcomeseedItemId, count: row.outcomeseedItemCount }], row.level ? `设施等级 ${row.level}` : '');
        });
        Object.entries(spaceshipFormulas).forEach(([recipeId, row]) => {
            addRecipe(recipeId, '飞船制造', recipeId, [], [{ id: row.outcomeItemId, count: 1 }],
                row.level ? `设施等级 ${row.level}` : '', row.totalProgress);
        });
        recipeRows.sort((a, b) => a.kind.localeCompare(b.kind, 'zh-CN') || a.recipeId.localeCompare(b.recipeId, 'en'));
        const recipeItemIds = new Set(recipeRows.flatMap(row => row.inputs.concat(row.outputs).map(entry => entry.id)));
        return { itemId: id, itemtable: item, itemtypetable: types[item.type] || {}, systemjumptable: pick(jumps, item.obtainWayIds || []),
            itemiconcompositetable: composites[item.iconCompositeId], itemshowingtypetable: showing[item.showingType],
            useitemtable: useItems[id], equipitemtable: equipItems[id], craftrecipes: recipeRows,
            craftitemtable: pick(items, Array.from(recipeItemIds)) };
    }

    async function dungeonManifest() {
        const series = await table('DungeonSeriesTable');
        const categoryNames = {
            dungeon_highdifficulty: '高难挑战', dungeon_bossrush: '首领挑战', dungeon_ss: '协议空间',
            dungeon_actmonster: '活动作战', dungeon_challenge: '挑战副本', dungeon_resource: '资源副本',
            dungeon_weeklyraid: '每周讨伐', dungeon_char: '角色任务', dungeon_chartutorial: '角色教学',
            dungeon_contract: '危机合约', dungeon_train: '训练副本', dungeon_worldlevel: '世界等级',
            dungeon_wuling_A: '武陵区域 A', dungeon_wuling_B: '武陵区域 B'
        };
        const rows = Object.entries(series).filter(([, row]) => row.gameCategory).map(([templateId, row], index) => ({
            templateId, name: text(row.name, templateId), rarity: dungeonRarity(row),
            gameCategory: row.gameCategory, gameCategoryName: categoryNames[row.gameCategory] || row.gameCategory,
            categoryOrder: dungeonRarity(row) * -1, dungeonCount: (row.includeDungeonIds || []).length,
            image: row.dungeonPicPath ? `/public/images/dungeon/${row.dungeonPicPath}_bg.png` : '',
            contentFile: `/__v3/dungeon/${templateId}.json`, sourceOrder: index, hidden: false
        }));
        return assignPriority(rows.sort(byRarityThenId));
    }

    async function dungeonDetail(id) {
        const [series, dungeons, rewards, items, enemies, display, attrs] = await Promise.all([
            table('DungeonSeriesTable'), table('DungeonTable'), table('RewardTable'), table('ItemTable'),
            table('EnemyTable'), table('EnemyTemplateDisplayInfoTable'), table('EnemyAttributeTemplateTable')
        ]);
        const seriesRow = series[id] || {};
        const dungeonRows = pick(dungeons, seriesRow.includeDungeonIds || []);
        const rewardIds = new Set();
        const enemyIds = new Set();
        const spawnerByDungeon = {};
        const levelDataByDungeon = {};
        Object.values(dungeonRows).forEach(row => {
            ['rewardId', 'firstPassRewardId', 'extraRewardId', 'customRewardId', 'hunterModeRewardId'].forEach(key => { if (row[key]) rewardIds.add(row[key]); });
            (row.enemyIds || []).forEach(enemyId => enemyIds.add(enemyId));
        });
        await Promise.all(Object.entries(dungeonRows).map(async ([dungeonId, row]) => {
            if (!row.sceneId) return;
            const mainLevelData = await optionalJson(`/public/Json/LevelData/${row.sceneId}/${row.sceneId}_lv_data.json`);
            levelDataByDungeon[dungeonId] = mainLevelData ? { [`${row.sceneId}_lv_data`]: mainLevelData } : {};
            const base = `/public/Json/SpawnerConfig/${row.sceneId}`;
            const manifest = await optionalJson(`${base}/manifest.json`);
            if (!Array.isArray(manifest)) return;
            const entries = manifest.filter(entry => !entry.hidden).sort((a, b) =>
                (a.priority || 999) - (b.priority || 999) || String(a.id || '').localeCompare(String(b.id || ''), 'en'));
            const configs = await Promise.all(entries.map(entry => optionalJson(entry.contentFile || `${base}/${entry.id}.json`)));
            const spawners = {};
            configs.filter(Boolean).forEach(config => {
                spawners[config.configId] = config;
                (config.enemyLibrary || []).forEach(enemy => enemyIds.add(enemy.enemyId));
            });
            spawnerByDungeon[dungeonId] = spawners;
        }));
        const rewardRows = pick(rewards, Array.from(rewardIds));
        const itemIds = Object.values(rewardRows).flatMap(row => (row.itemBundles || []).map(bundle => bundle.id));
        const enemyRows = pick(enemies, Array.from(enemyIds));
        const templateIds = Object.values(enemyRows).map(row => row.templateId);
        const attrIds = Object.values(enemyRows).map(row => row.attrTemplateId);
        Object.values(dungeonRows).forEach(row => {
            row.enemyTable = enemyRows; row.enemyTemplateDisplayInfoTable = pick(display, templateIds);
            row.enemyAttributeTemplateTable = pick(attrs, attrIds); row.rewardTable = rewardRows; row.itemTable = pick(items, itemIds);
        });
        Object.entries(dungeonRows).forEach(([dungeonId, row]) => {
            row.LevelData = levelDataByDungeon[dungeonId] || {};
            row.SpawnerConfig = spawnerByDungeon[dungeonId] || {};
        });
        return { dungeonSeriesId: id, dungeonseriestable: seriesRow, dungeontable: dungeonRows };
    }

    async function achievementManifest() {
        const [types, achievements] = await Promise.all([table('AchievementTypeTable'), table('AchievementTable')]);
        const rows = Object.entries(types).map(([categoryId, row]) => {
            const groupIds = new Set((row.achievementGroupData || []).map(group => group.groupId));
            const entries = Object.entries(achievements).filter(([, achievement]) => groupIds.has(achievement.groupId));
            const first = entries[0];
            const firstLevel = first ? Object.values(first[1].levelInfos || {})[0] : null;
            return { categoryId, name: text(row.categoryName, categoryId), achievementCount: entries.length,
                groupCount: groupIds.size, platedCount: entries.filter(([, achievement]) => achievement.canBePlated).length,
                icon: first && firstLevel ? `/public/images/achievement/medaliconbig/${first[0]}_lv${String(firstLevel.achieveLevel).padStart(2, '0')}.png` : '',
                contentFile: `/__v3/achievement/${categoryId}.json`, categoryPriority: row.categoryPriority, hidden: false };
        });
        rows.sort((a, b) => (a.categoryPriority || 999) - (b.categoryPriority || 999) || compareId(a, b));
        return assignPriority(rows);
    }

    async function achievementDetail(id) {
        const [types, achievements] = await Promise.all([table('AchievementTypeTable'), table('AchievementTable')]);
        const category = types[id] || {};
        const groupNames = Object.fromEntries((category.achievementGroupData || []).map(group => [group.groupId, text(group.groupName, 'default')]));
        const group = {};
        Object.entries(achievements).forEach(([achieveId, row]) => {
            if (!(row.groupId in groupNames)) return;
            const groupName = groupNames[row.groupId] || 'default';
            if (!group[groupName]) group[groupName] = {};
            group[groupName][achieveId] = { name: text(row.name, achieveId), order: row.order, canBeUpgraded: row.canBeUpgraded,
                canBePlated: row.canBePlated, applyRareEffect: row.applyRareEffect, noObtainCanView: category.noObtainCanView,
                level: Object.values(row.levelInfos || {}).map(level => ({ level: level.achieveLevel,
                    icon: `/public/images/achievement/medaliconbig/${achieveId}_lv${String(level.achieveLevel).padStart(2, '0')}.png`,
                    desc: text(level.completeDesc), conditions: (level.conditions || []).map(cond => text(cond.desc)),
                    progressToCompare: (level.conditions || []).map(cond => cond.progressToCompare) })) };
        });
        return { categoryId: id, categoryName: text(category.categoryName, id), group };
    }

    function rewardsToView(rewardId, rewards, items) {
        return (rewards[rewardId]?.itemBundles || []).map(bundle => {
            const item = items[bundle.id] || {};
            return { id: bundle.id, count: bundle.count, name: text(item.name, bundle.id), picpath: icon('item', bundle.id, item.iconId) };
        });
    }

    async function activityManifest() {
        const [activities, times] = await Promise.all([table('ActivityTable'), table('TimeRangeTable')]);
        const now = Date.now();
        const rows = Object.entries(activities).map(([activityId, row], index) => {
            const range = times[row.timeId]?.timeRangeList?.[0] || {};
            const open = range.openTime ? new Date(range.openTime).getTime() : 0;
            const close = range.closeTime ? new Date(range.closeTime).getTime() : 0;
            const statusOrder = !close ? 3 : (open > now ? 1 : (close < now ? 2 : 0));
            return { activityId, name: text(row.name, activityId), type: row.type, openTime: range.openTime || '', closeTime: range.closeTime || '',
                tabImg: row.tabImg ? `/public/images/activity/${row.tabImg}.png` : '', contentFile: `/__v3/activity/${activityId}.json`,
                statusOrder, sourceOrder: row.sortId ?? index, hidden: false };
        });
        rows.sort((a, b) => a.statusOrder - b.statusOrder || a.sourceOrder - b.sourceOrder || compareId(a, b));
        return assignPriority(rows);
    }

    async function activityDetail(id) {
        const [activities, tags, rewards, items, conditionalStages, fightingStages, dungeons, times] = await Promise.all([
            table('ActivityTable'), table('ActivityTagTable'), table('RewardTable'), table('ItemTable'),
            table('ActivityConditionalMultiStageTable'), table('ActivityDungeonFightingStageTable'),
            table('DungeonTable'), table('TimeRangeTable')
        ]);
        const row = activities[id] || {};
        const stageList = {};
        Object.entries(conditionalStages[id]?.stageList || {}).forEach(([stageId, stage]) => {
            const range = times[stage.timeId]?.timeRangeList?.[0] || {};
            stageList[stageId] = { name: text(stage.name, stageId), desc: text(stage.desc), sortId: stage.sortId,
                opentime: range.openTime || '', rewarddetail: rewardsToView(stage.rewardId, rewards, items) };
        });
        if (id === 'dungeon_fighting') {
            Object.entries(fightingStages).forEach(([stageId, stage]) => {
                const dungeon = dungeons[stage.levelId] || {};
                stageList[stageId] = { name: text(dungeon.dungeonName, stageId), desc: text(dungeon.dungeonDesc), sortId: dungeon.sortId,
                    opentime: times[row.timeId]?.timeRangeList?.[0]?.openTime || '', rewarddetail: rewardsToView(dungeon.rewardId, rewards, items) };
            });
        }
        return { id, name: text(row.name, id), desc: text(row.desc), conditions: (row.conditions || []).map(condition => text(condition.desc)),
            rewarddetail: rewardsToView(row.rewardId, rewards, items), sortId: row.sortId, tabImg: row.tabImg, tabImgColor: row.tabImgColor,
            tags: (row.tagIds || []).map(tagId => text(tags[tagId]?.name, tagId)), type: row.type, stageList };
    }

    async function ccManifest() {
        const [activityCc, activities, dungeons, contracts, times] = await Promise.all([
            table('ActivityContingencyContractTable'), table('ActivityTable'), table('DungeonTable'),
            table('ContingencyContractTable'), table('TimeRangeTable')
        ]);
        const now = Date.now();
        const rows = Object.values(activityCc).map((row, index) => {
            const activity = activities[row.activityId] || {};
            const dungeon = dungeons[row.gameId] || {};
            const range = times[activity.timeId]?.timeRangeList?.[0] || {};
            const open = range.openTime ? new Date(range.openTime).getTime() : 0;
            const close = range.closeTime ? new Date(range.closeTime).getTime() : 0;
            const statusOrder = !close ? 3 : (open > now ? 1 : (close < now ? 2 : 0));
            const groups = Object.values(contracts[row.gameId]?.contractGroupMap || {});
            const contractCount = groups.reduce((sum, group) => sum + Object.keys(group.contractMap || {}).length, 0);
            return { gameId: row.gameId, activityId: row.activityId, name: text(activity.name, row.gameId),
                image: activity.tabImg ? `/public/images/activity/${activity.tabImg}.png` : '',
                openTime: range.openTime || '', closeTime: range.closeTime || '', statusOrder,
                dungeonName: text(dungeon.dungeonName), contractGroupCount: groups.length, contractCount,
                contentFile: `/__v3/cc/${row.gameId}.json`,
                dungeonFile: dungeon.dungeonSeriesId ? `/__v3/dungeon/${dungeon.dungeonSeriesId}.json` : '',
                sourceOrder: index, hidden: false };
        });
        rows.sort((a, b) => a.sourceOrder - b.sourceOrder || compareId(a, b));
        return assignPriority(rows);
    }

    async function ccDetail(id) {
        const [activityCc, contracts, tags, tips, locks, levels, rewards, items, taskGroups, tasks, shopGroups, shops, goods] = await Promise.all([
            table('ActivityContingencyContractTable'), table('ContingencyContractTable'), table('CcTagTable'), table('CcTagTipTable'),
            table('ContingencyContractKeyLockTable'), table('ContingencyContractLevelTable'), table('RewardTable'), table('ItemTable'),
            table('ActivityContingencyContractTaskGroupTable'), table('ActivityConditionalMultiStageTaskConfigTable'),
            table('ShopGroupTable'), table('ShopTable'), table('ShopGoodsTable')
        ]);
        const activity = Object.values(activityCc).find(row => row.gameId === id) || {};
        return { gameId: id, activitycontingencycontracttable: activity, contingencycontracttable: contracts[id] || {}, cctagtable: tags,
            cctagtiptable: tips, contingencycontractkeylocktable: locks, contingencycontractleveltable: levels[id] || {},
            rewardtable: rewards, itemtable: items, activitycontingencycontracttaskgrouptable: taskGroups,
            activityconditionalmultistagetaskconfigtable: tasks, shopgrouptable: shopGroups[activity.shopGroupId] || {}, shoptable: shops, shopgoodstable: goods };
    }

    const adapters = {
        character: [characterManifest, characterDetail], weapon: [weaponManifest, weaponDetail], enemy: [enemyManifest, enemyDetail],
        equip: [equipManifest, equipDetail], item: [itemManifest, itemDetail], dungeon: [dungeonManifest, dungeonDetail],
        achievement: [achievementManifest, achievementDetail], activity: [activityManifest, activityDetail], cc: [ccManifest, ccDetail]
    };

    function loadMaps() {
        return window.akeLoadMaps();
    }

    async function v3Fetch(input, init) {
        const url = typeof input === 'string' ? input : input.url;
        const mountedModule = document.querySelector('#contentArea script[data-ake-v3-module]')?.dataset.akeV3Module || '';
        const manifestMatch = url.match(/^\/public\/CH\/(?:v2_)?(character|weapon|enemy|equip|item|dungeon|cc|activity|achievement)\/manifest\.json(?:\?|$)/);
        if (manifestMatch && manifestMatch[1] === mountedModule) return virtualResponse(await adapters[mountedModule][0]());
        const detailMatch = url.match(/^\/__v3\/(character|weapon|enemy|equip|item|dungeon|cc|activity|achievement)\/([^/?]+)\.json/);
        if (detailMatch && (detailMatch[1] === mountedModule || (mountedModule === 'cc' && detailMatch[1] === 'dungeon'))) {
            return virtualResponse(await adapters[detailMatch[1]][1](decodeURIComponent(detailMatch[2])));
        }
        const charDetailMatch = mountedModule === 'character' && url.match(/^\/public\/CH\/v2_character\/([^/?]+)\.json/);
        if (charDetailMatch) return virtualResponse(await characterDetail(decodeURIComponent(charDetailMatch[1])));
        return originalAkeFetch(input, init);
    }

    function patchRouter() {
        if (!window.__akeRouter || window.__akeRouter.__v3Patched) return;
        const originalUpdate = window.__akeRouter.updateUrl.bind(window.__akeRouter);
        window.__akeRouter.updateUrl = function (plugin, id) {
            const marker = document.querySelector('#contentArea script[data-ake-v3-module]');
            const module = marker?.dataset.akeV3Module || '';
            const alias = MODULE_ALIASES[module];
            return originalUpdate(plugin === alias ? `v3_${module}` : plugin, id);
        };
        window.__akeRouter.__v3Patched = true;
    }

    window.AKEV3 = {
        activate(module) {
            if (!adapters[module]) throw new Error(`未知 v3 模块: ${module}`);
            if (document.currentScript) document.currentScript.dataset.akeV3Module = module;
            window.akeFetch = v3Fetch;
            patchRouter();
        },
        table,
        text
    };
})();
