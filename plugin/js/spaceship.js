(function () {
    'use strict';
    // Explicit page scope requested for the Dijiang module; levels remain table-driven.
    const visibleRoomTypes = new Set(['0', '1', '2', '5']);
    // User-specified presentation overrides for the four retained rooms.
    const roomIcons = {
        '0': { file: 'icon_sapceship_room_icon_control_console', background: 'rgb(30, 145, 253)' },
        '1': { file: 'icon_sapceship_room_icon_manufacturing_station', background: 'rgb(255, 225, 22)' },
        '2': { file: 'icon_sapceship_room_icon_grow_cabin', background: 'rgb(153, 241, 32)' },
        '5': { file: 'icon_sapceship_room_icon_guest_room_clue', background: 'rgb(158, 138, 249)' }
    };
    const roomIconUrl = file => `/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/spaceship/spaceshiproom/${file}.png`;
    const creditIcon = '/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/item_spaceship_credit.png';
    const levelTables = ['SpaceshipControlCenterLvTable', 'SpaceshipManufacturingStationLvTable', 'SpaceshipGrowCabinLvTable', 'SpaceshipGuestRoomLvTable', 'SpaceshipGuestRoomClueLvTable', 'SpaceshipCommandCenterLvTable'];
    window.AKECatalog.mount({
        id: 'spaceship',
        showRaw: false,
        itemIcons: true,
        tables: ['SpaceshipRoomTypeTable', 'SpaceshipRoomLvTable', 'SpaceshipRoomLvHelperTable', ...levelTables,
            'SpaceshipCreditTable', 'SpaceshipDomainMoneyExchangeRateDataTable',
            'SpaceshipGrowCabinFormulaTable', 'SpaceshipGrowCabinSeedFormulaTable', 'SpaceshipManufactureFormulaTable',
            'SpaceshipSkillTable', 'SpaceshipCharSkillTable', 'CharacterTable', 'SpaceshipRoomAttrTypeTable',
            'SpaceshipGrowCabinFormulaShowingTypeTable', 'SpaceshipClueDataIndex2IdTable'],
        optional: ['SpaceshipCommandCenterLvTable'],
        primary: ['SpaceshipRoomTypeTable', 'SpaceshipRoomLvTable', 'SpaceshipCharSkillTable', 'SpaceshipSkillTable', ...levelTables],
        build(c) {
            const T = c.tables;
            const levels = new Map();
            for (const [key, row] of c.entries(T.SpaceshipRoomLvTable)) levels.set(key, { ...row, key });
            for (const source of levelTables) for (const [key, row] of c.entries(T[source])) {
                const id = row.id || key;
                const helper = T.SpaceshipRoomLvHelperTable[id] || {};
                const previous = levels.get(id) || {};
                levels.set(id, { ...previous, ...helper, ...row, key: id, refs: [...(previous.refs || []), { table: source, key }] });
            }
            for (const [id, row] of levels) {
                const helper = T.SpaceshipRoomLvHelperTable[id];
                if (row.roomType === undefined && helper) Object.assign(row, helper);
            }
            const roomTypes = new Set([...Object.keys(T.SpaceshipRoomTypeTable), ...[...levels.values()].map(row => String(row.roomType ?? 'unassigned'))]);
            const rows = [...roomTypes].filter(id => {
                if (visibleRoomTypes.has(id)) return true;
                c.issue('excluded-by-page-scope', 'SpaceshipRoomTypeTable', id, 'Room detail pages only include room:0, room:1, room:2 and room:5; logistics filtering includes all room types.');
                for (const level of levels.values()) if (String(level.roomType ?? 'unassigned') === id) {
                    if (T.SpaceshipRoomLvTable[level.key]) c.issue('excluded-by-page-scope', 'SpaceshipRoomLvTable', level.key, `room:${id}`);
                    for (const ref of level.refs || []) c.issue('excluded-by-page-scope', ref.table, ref.key, `room:${id}`);
                }
                return false;
            }).sort((a, b) => Number(a) - Number(b)).map(id => {
                const room = T.SpaceshipRoomTypeTable[id] || {};
                const roomLevels = [...levels.values()].filter(row => String(row.roomType ?? 'unassigned') === id).sort((a, b) => (a.level || 0) - (b.level || 0));
                if (!T.SpaceshipRoomTypeTable[id]) c.issue('unmapped-room', 'SpaceshipRoomTypeTable', id);
                const roomName = c.name(room.name, id);
                return { id: `room:${id}`, key: id, kind: 'room', name: roomName, group: '', raw: room, levels: roomLevels,
                    icon: roomIconUrl(roomIcons[id].file), iconBackground: roomIcons[id].background,
                    subtitle: c.t('levelCount', { count: roomLevels.length }),
                    search: [c.text(room.desc), c.text(room.helpDesc)].join(' '), sources: [
                        ...(T.SpaceshipRoomTypeTable[id] ? [{ table: 'SpaceshipRoomTypeTable', key: id }] : []),
                        ...roomLevels.filter(row => T.SpaceshipRoomLvTable[row.key]).map(row => ({ table: 'SpaceshipRoomLvTable', key: row.key })),
                        ...roomLevels.flatMap(row => row.refs || [])
                    ] };
            });
            rows.push({ id: 'credit', kind: 'credit', name: c.t('creditExchange'), group: '', raw: {}, icon: creditIcon });
            rows.push({ id: 'logistics', kind: 'logistics', name: window.akeI18n.t('modules.spaceship.skills.title'), group: '', raw: {},
                icon: roomIconUrl('spaceship_room_icon_friend_help'), iconBackground: 'var(--accent-color)', iconOriginalColors: true,
                sources: ['SpaceshipCharSkillTable', 'SpaceshipSkillTable'].flatMap(table => c.entries(T[table]).map(([key]) => ({ table, key }))) });
            return rows;
        },
        mountDetail(entry, c, detail) {
            if (entry.kind === 'logistics') return window.AKESpaceshipSkills.mount(detail.querySelector('[data-spaceship-skills]'), c, roomIcons);
        },
        render(entry, c) {
            if (entry.kind === 'logistics') return '<div data-spaceship-skills></div>';
            // Use the shared detail section structure and theme styles throughout this page.
            const section = (title, content) => `<section class="ake-ui-section"><header class="ake-ui-section__header"><h3 class="ake-ui-section__title">${c.h(title)}</h3></header><div class="ake-ui-section__body">${content || c.state()}</div></section>`;
            const T = c.tables, r = entry.raw;
            const roomLink = type => {
                const label = c.name(T.SpaceshipRoomTypeTable[type]?.name, type);
                const presentation = roomIcons[type];
                if (!presentation) return c.h(label);
                const content = window.AKEUI.materialItem({ name: label, icon: roomIconUrl(presentation.file) });
                const image = content.querySelector('img');
                const media = document.createElement('span');
                media.className = 'ake-ui-material__item-icon';
                image.replaceWith(media);
                media.appendChild(window.AKECatalog.iconTile(image, presentation.background));
                return window.AKEUI.entryLinkHtml({ plugin: 'spaceship', id: `room:${type}`, label, contentHtml: content.outerHTML });
            };
            if (entry.kind === 'credit') return section(c.t('creditExchange'), c.table([c.t('totalPrice'), c.t('creditRewards')], c.values(T.SpaceshipCreditTable).map(row => [c.number(row.totalPrice), c.item('item_spaceship_credit', row.creditRewardCnt)])))
                + section(c.t('exchangeRate'), c.table([c.t('item'), c.t('exchangeRate')], c.entries(T.SpaceshipDomainMoneyExchangeRateDataTable).map(([id, row]) => [c.item(row.id || id), c.number(row.exchangeRate)])));
            let html = [r.desc, r.helpDesc, r.extraDesc1].map(value => c.rich(value)).filter(Boolean).map(content => `<div class="ake-ui-section ake-ui-section__body">${content}</div>`).join('');
            const formula = id => {
                const grow = T.SpaceshipGrowCabinFormulaTable[id], manufacture = T.SpaceshipManufactureFormulaTable[id], seed = T.SpaceshipGrowCabinSeedFormulaTable[id];
                const row = grow || manufacture || seed;
                if (!row) { c.issue('missing-recipe', 'spaceship', id); return c.h(c.t('unavailable')); }
                const output = grow ? c.item(grow.outcomeItemId, grow.outcomeItemCount) : manufacture ? c.item(manufacture.outcomeItemId) : c.item(seed.outcomeseedItemId, seed.outcomeseedItemCount);
                const input = grow ? c.item(grow.seedItemId, grow.seedItemCount) : seed ? c.item(seed.materialItemId, seed.materialItemCount) : '';
                const relatedSeed = grow?.seedFormulaId ? T.SpaceshipGrowCabinSeedFormulaTable[grow.seedFormulaId] : null;
                return `${input ? input + ' → ' : ''}${output}${relatedSeed ? `<br>${c.h(c.t('seedExtraction'))}: ${c.item(relatedSeed.materialItemId, relatedSeed.materialItemCount)} → ${c.item(relatedSeed.outcomeseedItemId, relatedSeed.outcomeseedItemCount)}` : ''}`;
            };
            for (const level of entry.levels) {
                const upgrade = T.SpaceshipRoomLvTable[level.key];
                const content = (upgrade ? c.rich(upgrade.conditionDesc) + section(c.t('cost'), c.items(upgrade.costItems)) : '')
                    + c.fields(level, ['stationMaxCount', 'machineCapacity', 'manufacturingStationMaxCount', 'growCabinMaxCount', 'commandCenterMaxCount', 'baseCreditReward', 'baseInfoReward', 'extraCreditPerRole', 'extraInfoPerRole', 'maxCalcRoleCount', 'maxExtraCredit', 'maxExtraInfo', 'creditFriendJoinExchangeGain'])
                    + c.rich(level.unlockAreaText)
                    + (level.unlockRoomType !== undefined ? `<p>${c.h(c.t('unlocks'))}: ${roomLink(level.unlockRoomType)}</p>` : '')
                    + (level.unlockPlantingField?.length ? `<p>${c.h(c.t('plantingFields', { count: level.unlockPlantingField.length }))}</p>` : '')
                    + (level.unlockRecipe?.length ? section(c.t('recipes'), level.unlockRecipe.map(formula).join('<br>')) : '')
                    + (level.rewardId ? section(c.t('rewards'), c.reward(level.rewardId)) : '');
                html += section(c.t('levelValue', { value: level.level ?? '—' }), content);
            }
            if (!entry.levels.length) html += c.state(c.t('noLevels'));
            const skills = c.entries(T.SpaceshipSkillTable).filter(([, skill]) => String(skill.roomType) === entry.key);
            html += section(c.t('logisticsSkills'), c.table([c.t('name'), c.t('effect'), c.t('characters')], skills.map(([id, skill]) => {
                const chars = c.entries(T.SpaceshipCharSkillTable).flatMap(([charId, row]) => (row.skillList || []).filter(slot => slot.skillId === id).map(slot => ({ charId, slot })));
                return [c.h(c.name(skill.name, id)), c.rich(skill.desc), chars.map(({ charId, slot }) => c.link('v3_character', charId, c.name(T.CharacterTable[charId]?.name, charId)) + c.rich(slot.unlockHint)).join('<br>') || '—'];
            })));
            if (r.previewProductItemIds?.length) html += section(c.t('products'), r.previewProductItemIds.map(id => c.item(id)).join(' '));
            return html;
        }
    });
})();
