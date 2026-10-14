(function () {
    'use strict';

    // Identity/name contracts follow v3-table-data, v3-shop, v3-archive,
    // season-tower and baker. No Foresight tables are merged into these lists.
    const definitions = [
        ['character', '干员', ['CharacterTable']],
        ['weapon', '武器', ['WeaponBasicTable', 'ItemTable']],
        ['enemy', '滴人', ['EnemyTemplateDisplayInfoTable']],
        ['equip', '装备', ['EquipTable', 'ItemTable']],
        ['activity', '活动', ['ActivityTable']],
        ['shop', '商店', ['ShopGroupTable', 'ShopTable', 'CashShopGroupTable', 'CashShopTable',
            'ShopGoodsTable', 'CashShopGoodsTable', 'RewardTable', 'ItemTable', 'GachaWeaponPoolTable',
            'GiftpackCashShopGoodsDataTable', 'CashShopHideInGameTable']],
        ['item', '物品', ['ItemTable']],
        ['achievement', '奖章', ['AchievementTable', 'AchievementTypeTable']],
        ['monument', '影拓丰碑', ['DungeonSeriesTable']],
        ['season', '战争回响', ['SeasonTowerTable']],
        ['cc', '危机合约', ['ActivityContingencyContractTable', 'ActivityTable']],
        ['archive', '档案库', ['PrtsAllItem', 'PrtsReading', 'RichContentTable', 'RadioTable', 'ReadingPopUpTable', 'DialogTextTable']],
        ['baker', 'Baker', ['SNSChatTable', 'SNSDialogTable', 'SNSDialogTopicTable']]
    ];
    const entries = value => Object.entries(value);
    const plain = value => String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const compareVersions = (a, b) => String(a.gameVersion).localeCompare(String(b.gameVersion), 'en', { numeric: true })
        || String(a.hotfixVersion).localeCompare(String(b.hotfixVersion), 'en', { numeric: true });

    window.AKEMisc.register('update_copy', function (context) {
        const root = context.root;
        const oldSelect = root.querySelector('[data-copy-old]');
        const newSelect = root.querySelector('[data-copy-new]');
        const run = root.querySelector('[data-copy-run]');
        const copy = root.querySelector('[data-copy-clipboard]');
        const status = root.querySelector('[data-copy-status]');
        const results = root.querySelector('[data-copy-results]');
        const diagnosticsRoot = root.querySelector('[data-copy-diagnostics]');
        let versions = [], generation = 0, output = '';
        const alive = token => !context.signal.aborted && token === generation;
        const load = (name, version) => window.AKEV3.table(name, version, { hydrate: false, signal: context.signal });

        function build(module, tables, chinese, index) {
            const rows = new Map(), identities = new Set(), shops = new Map(), shopGroups = new Map(), shopParents = new Map(), issues = [], excluded = {};
            const text = ref => plain(typeof ref === 'string' ? ref : chinese[String(ref?.id)] || ref?.text);
            const skip = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
            const add = (id, ref, source) => {
                if (id === undefined || id === null || id === '') throw new Error(`${source} 缺少条目身份`);
                const name = text(ref);
                if (!name) issues.push({ source, id: String(id), reason: '缺少简体中文名称' });
                identities.add(String(id));
                rows.set(String(id), { name: name || '未命名条目', source });
            };
            const each = (name, action) => entries(tables[name]).forEach(([key, row]) => {
                if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${name} 条目格式错误`);
                action(key, row);
            });
            if (['character', 'enemy', 'activity', 'item', 'season'].includes(module)) {
                const name = definitions.find(row => row[0] === module)[2][0];
                each(name, (id, row) => add(id, row.name, name));
            } else if (module === 'weapon' || module === 'equip') {
                const name = module === 'weapon' ? 'WeaponBasicTable' : 'EquipTable';
                each(name, (key, row) => {
                    const id = module === 'equip' ? row.itemId : key;
                    add(id, tables.ItemTable[id]?.name, name);
                });
            } else if (module === 'monument') {
                each('DungeonSeriesTable', (id, row) => {
                    if (row.gameCategory === 'dungeon_highdifficulty') add(id, row.name, 'DungeonSeriesTable');
                    else skip('非影拓丰碑系列');
                });
            } else if (module === 'achievement') {
                const groups = new Set(Object.values(tables.AchievementTypeTable).flatMap(row => (row.achievementGroupData || []).map(group => group.groupId)));
                each('AchievementTable', (id, row) => {
                    // Keep orphan medals identifiable instead of silently losing new records.
                    if (!groups.has(row.groupId)) issues.push({ id, reason: '奖章分类关联缺失' });
                    add(id, row.name, 'AchievementTable');
                });
            } else if (module === 'cc') {
                each('ActivityContingencyContractTable', (id, row) => add(row.gameId, tables.ActivityTable[row.activityId]?.name, 'ActivityContingencyContractTable'));
            } else if (module === 'shop') {
                for (const [groupTable, shopTable, field, prefix] of [
                    ['ShopGroupTable', 'ShopTable', 'shopIds', 'normal'],
                    ['CashShopGroupTable', 'CashShopTable', 'cashShopIds', 'cash']
                ]) {
                    const linked = new Set();
                    each(groupTable, (id, group) => {
                        // CashShopGroupTable extends the same shopGroupId namespace.
                        const groupId = String(group.shopGroupId || id);
                        shopGroups.set(groupId, text(group.shopGroupName) || '未命名商店');
                        (group[field] || []).forEach(shopId => {
                            linked.add(shopId);
                            const key = `${prefix}:${shopId}`;
                            if (!shopParents.has(key)) shopParents.set(key, []);
                            shopParents.get(key).push(groupId);
                            if (!tables[shopTable][shopId]) throw new Error('商店分组引用了缺失店铺');
                        });
                    });
                    each(shopTable, (id, row) => {
                        if (!linked.has(id)) issues.push({ id, reason: '店铺分组关联缺失' });
                        shops.set(`${prefix}:${id}`, text(row.shopName) || '未命名商店');
                    });
                }
                each('ShopGoodsTable', (id, row) => {
                    const reward = tables.RewardTable[row.rewardId];
                    const bundles = reward?.itemBundles || [];
                    const name = bundles.length ? bundles.map(bundle => text(tables.ItemTable[bundle.id]?.name) || '未命名物品').join(' + ')
                        : text(tables.GachaWeaponPoolTable[row.weaponGachaPoolId]?.name);
                    if (row.rewardId && !reward) issues.push({ id, reason: '商品奖励关联缺失' });
                    add(`normal:${id}`, name, 'ShopGoodsTable');
                });
                each('CashShopGoodsTable', (id, row) => {
                    identities.add(`cash:${id}`);
                    if (tables.GiftpackCashShopGoodsDataTable[id]?.hideInGame === true || tables.CashShopHideInGameTable[id]?.hideInGame === true) {
                        skip('游戏内隐藏商品'); return;
                    }
                    add(`cash:${id}`, row.goodsName, 'CashShopGoodsTable');
                });
            } else if (module === 'baker') {
                const topics = new Map(), chatsWithDialogs = new Set();
                each('SNSDialogTopicTable', (id, row) => (row.includeDialogIds || []).forEach(dialogId => topics.set(dialogId, row)));
                each('SNSDialogTable', (id, row) => {
                    if (!row.chatId) throw new Error('Baker 对话缺少联系人关联');
                    chatsWithDialogs.add(row.chatId);
                    const topic = tables.SNSDialogTopicTable[row.topicId] || topics.get(row.dialogId || id);
                    const name = text(tables.SNSChatTable[row.chatId]?.name);
                    const label = text(topic?.topicName) || text(topic?.topicStartOptionDesc);
                    add(`dialog:${row.dialogId || id}`, [name, label].filter(Boolean).join(' · '), 'SNSDialogTable');
                });
                each('SNSChatTable', (id, row) => {
                    if (!chatsWithDialogs.has(id)) add(`chat:${id}`, row.name, 'SNSChatTable');
                });
            } else if (module === 'archive') {
                const linkedContent = new Set(), linkedItems = new Set(), readingContent = new Set();
                each('PrtsAllItem', (id, row) => {
                    add(`archive:${id}`, row.name, 'PrtsAllItem');
                    linkedContent.add(row.contentId); linkedItems.add(row.id || id);
                });
                const popups = new Map(Object.values(tables.ReadingPopUpTable).map(row => [row.contentId, row]));
                each('PrtsReading', (sourceId, row) => entries(row.list || {}).forEach(([listId, reading]) => {
                    if (!reading.contentId) { skip('阅读条目缺少内容引用'); return; }
                    readingContent.add(reading.contentId);
                    if (linkedContent.has(reading.contentId) || linkedItems.has(reading.prtsId)) { skip('已关联档案的阅读条目'); return; }
                    add(`reading:${sourceId}:${listId}`, text(reading.name) || text(tables.RichContentTable[reading.contentId]?.title)
                        || text(popups.get(reading.contentId)?.title), 'PrtsReading');
                }));
                const files = index?.datasets?.json?.files;
                if (!files || typeof files !== 'object') throw new Error('档案库素材关联索引不可用');
                const dialogs = new Map();
                each('DialogTextTable', (id, row) => {
                    // Same documented row-key protocol as v3-archive.dialogLineIndex.
                    const match = id.match(/^(dlg_.+)_(\d+)$/);
                    if (!match) { skip('非地图对话行'); return; }
                    const previous = dialogs.get(match[1]);
                    if (!previous || Number(match[2]) < previous.order) dialogs.set(match[1], { order: Number(match[2]), text: row.dialogText });
                });
                for (const [path, record] of entries(files)) {
                    if (path.startsWith('LevelData/') && /\.json$/i.test(path)) {
                        if (!Array.isArray(record?.meta?.narrativeDialogIds)) throw new Error('地图文本索引不完整');
                        for (const id of record.meta.narrativeDialogIds) {
                            if (dialogs.has(id)) add(`dialog:${id}`, dialogs.get(id).text, 'DialogTextTable');
                        }
                    }
                    if (path.startsWith('LevelScriptData/') && /\.json$/i.test(path)) {
                        if (!Array.isArray(record?.meta?.narrativeReadingContentIds)) throw new Error('任务阅读索引不完整');
                        for (const id of record.meta.narrativeReadingContentIds) {
                            if (linkedContent.has(id) || readingContent.has(id)) continue;
                            // Shared assets cannot prove a historical addition; require versioned content.
                            const popup = popups.get(id);
                            const rich = tables.RichContentTable[id];
                            // Same text_/radio_ fallback as v3-archive.resolveContent, checked against the table.
                            const override = String(popup?.overrideRadioId || '');
                            const radioId = override.startsWith('radio_') ? override : id.startsWith('radio_') ? id
                                : !rich && id.startsWith('text_') ? `radio_${id.slice(5)}` : '';
                            if (rich || tables.RadioTable[radioId]) add(`content:${id}`, text(rich?.title) || text(popup?.title), 'RichContentTable/RadioTable');
                            else skip('共享阅读引用在所选版本中无内容');
                        }
                    }
                }
            }
            return { rows, identities, shops, shopGroups, shopParents, issues, excluded };
        }

        function clear() {
            generation += 1;
            output = ''; copy.disabled = true;
            results.replaceChildren(); diagnosticsRoot.replaceChildren();
        }

        async function generate() {
            clear();
            const token = generation;
            const oldVersion = versions.find(version => version.id === oldSelect.value);
            const newVersion = versions.find(version => version.id === newSelect.value);
            if (!oldVersion || !newVersion || compareVersions(oldVersion, newVersion) >= 0) {
                status.textContent = '请选择早于新版本的旧版本。'; return;
            }
            run.disabled = true;
            const lines = [], reports = [];
            let failed = 0;
            try {
                const chinese = await load('I18nTextTable_CN', newVersion);
                if (!alive(token)) return;
                for (const [module, title, names] of definitions) {
                    if (!alive(token)) return;
                    status.textContent = `正在比较${title}（${reports.length + 1}/${definitions.length}）…`;
                    let line, shopLine = '';
                    try {
                        const snapshots = await Promise.all([oldVersion, newVersion].map(async version => {
                            const values = await Promise.all(names.map(name => load(name, version)));
                            return Object.fromEntries(names.map((name, i) => [name, values[i]]));
                        }));
                        let index;
                        if (module === 'archive') {
                            index = await window.akeAssetIndex.ready;
                        }
                        if (!alive(token)) return;
                        const before = build(module, snapshots[0], chinese, index);
                        const after = build(module, snapshots[1], chinese, index);
                        const added = [...after.rows].filter(([id]) => !before.identities.has(id));
                        added.sort(([a, left], [b, right]) => left.name.localeCompare(right.name, 'zh-CN') || a.localeCompare(b, 'en', { numeric: true }));
                        line = added.length ? `${title}模块新增 ${added.length} 个条目：${added.slice(0, 5).map(([, row]) => row.name).join('，')}${added.length > 5 ? '等' : ''}`
                            : `${title}模块无新增条目`;
                        if (module === 'shop') {
                            // Name a new storefront once; its new tabs are included under that storefront.
                            const addedGroups = [...after.shopGroups].filter(([id]) => !before.shopGroups.has(id));
                            const newGroupIds = new Set(addedGroups.map(([id]) => id));
                            const addedShops = [...addedGroups, ...[...after.shops].filter(([id]) => !before.shops.has(id)
                                && !(after.shopParents.get(id) || []).some(parent => newGroupIds.has(parent)))];
                            if (addedShops.length) shopLine = `特别说明：新增 ${addedShops.length} 个商店：${addedShops.slice(0, 5).map(([, name]) => name).join('，')}${addedShops.length > 5 ? '等' : ''}`;
                        }
                        reports.push({ title, before, after });
                    } catch (error) {
                        if (!alive(token)) return;
                        failed += 1;
                        line = `${title}模块：无法比较（数据缺失或读取失败，请重试）`;
                        reports.push({ title, error: error.message });
                        console.warn(`[update_copy] ${title}`, error);
                    }
                    lines.push(line);
                    const paragraph = document.createElement('p');
                    paragraph.textContent = line;
                    results.appendChild(paragraph);
                    if (shopLine) {
                        lines.push(shopLine);
                        const note = document.createElement('p');
                        note.textContent = shopLine;
                        results.appendChild(note);
                    }
                }
                if (!alive(token)) return;
                output = [`数据版本：${oldVersion.id} → ${newVersion.id}`, ...lines].join('\n');
                copy.disabled = false;
                status.textContent = failed ? `比较完成，${failed} 个模块无法比较；复制文案会保留失败提示。` : '比较完成，可复制文案。';
                for (const report of reports) {
                    const paragraph = document.createElement('p');
                    const after = report.after;
                    paragraph.textContent = report.error ? `${report.title}：读取失败，请重试；详细原因已记录到控制台。`
                        : `${report.title}：旧版本 ${report.before.rows.size} 条，新版本 ${after.rows.size} 条；名称或关联缺失 ${after.issues.length} 项。`
                            + Object.entries(after.excluded).map(([reason, count]) => `${reason} ${count} 项。`).join('')
                            + [...new Set(after.issues.map(issue => issue.reason))].join('；');
                    diagnosticsRoot.appendChild(paragraph);
                }
            } catch (error) {
                if (alive(token)) status.textContent = '读取版本中文文本失败，未生成文案。请重试。';
                console.warn('[update_copy]', error);
            } finally {
                if (alive(token)) run.disabled = false;
            }
        }

        context.on(run, 'click', generate);
        for (const select of [oldSelect, newSelect]) context.on(select, 'change', () => {
            clear(); run.disabled = versions.length < 2;
            status.textContent = '版本已更改，请重新生成文案。';
        });
        context.on(copy, 'click', async () => {
            const token = generation;
            try {
                await navigator.clipboard.writeText(output);
                if (alive(token)) status.textContent = '文案已复制。';
            } catch {
                if (alive(token)) status.textContent = '无法访问剪贴板，请直接选中概览文字复制。';
            }
        });

        return {
            async mount() {
                try {
                    await window.akeDataSource.ready;
                    if (context.signal.aborted) return;
                    const state = window.akeDataSource.getState();
                    versions = [...state.manifest.versions].filter(version => version.hotfixVersion !== 'local').sort((a, b) => compareVersions(b, a));
                    for (const select of [oldSelect, newSelect]) {
                        select.replaceChildren(...versions.map(version => new Option(`${version.gameVersion} · ${version.hotfixVersion}`, version.id)));
                    }
                    if (versions.length < 2) { status.textContent = '至少需要两个可用的数据版本才能比较。'; return; }
                    newSelect.value = versions[0].id;
                    oldSelect.value = versions[1].id;
                    run.disabled = false;
                    // The misc host reveals only after mount returns; do not hold it for all tables.
                    void generate();
                } catch (error) {
                    if (!context.signal.aborted) status.textContent = '版本列表读取失败，请重新进入模块重试。';
                    console.warn('[update_copy]', error);
                }
            },
            destroy() { generation += 1; }
        };
    });
})();
