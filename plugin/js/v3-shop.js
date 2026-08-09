(function () {
    const MODULE_ID = 'v3_shop';
    const root = document.getElementById('akeShopModule');
    if (!root || !window.AKEV3) return;

    window.__akeShopController?.destroy?.();

    const t = window.akeI18n.scope('modules.shop');
    const list = document.getElementById('akeShopGroupList');
    const mobileGroups = document.getElementById('akeShopMobileGroups');
    const content = document.getElementById('akeShopContent');
    const search = document.getElementById('akeShopSearch');
    const mobileButton = document.getElementById('akeShopMobileButton');
    const overlay = document.getElementById('akeShopMobileOverlay');
    const ROTATION_START = Date.parse('2026-01-22T00:00:00+08:00');
    const DAY_MS = 24 * 60 * 60 * 1000;
    const DAILY_REFRESH_OFFSET = 4 * 60 * 60 * 1000;
    const WEEKLY_REFRESH_OFFSET = 12 * 60 * 60 * 1000;
    const WEEKLY_SIX_STAR = [
        'wpn_sword_0021', 'wpn_funnel_0009', 'wpn_lance_0010', 'wpn_pistol_0009',
        'wpn_funnel_0008', 'wpn_claym_0006', 'wpn_sword_0013', 'wpn_funnel_0009',
        'wpn_sword_0011', 'wpn_pistol_0009', 'wpn_lance_0010', 'wpn_claym_0004',
        'wpn_claym_0008', 'wpn_funnel_0009', 'wpn_lance_0011', 'wpn_pistol_0009',
        'wpn_funnel_0010', 'wpn_lance_0010', 'wpn_sword_0014', 'wpn_funnel_0008',
        'wpn_pistol_0008', 'wpn_lance_0011', 'wpn_sword_0013', 'wpn_claym_0006',
        'wpn_funnel_0009', 'wpn_funnel_0008', 'wpn_lance_0011', 'wpn_claym_0008',
        'wpn_sword_0012', 'wpn_lance_0010', 'wpn_pistol_0009', 'wpn_sword_0011'
    ];
    const WEEKLY_FIVE_STAR = [
        'wpn_funnel_0004', 'wpn_sword_0019', 'wpn_pistol_0012', 'wpn_funnel_0014',
        'wpn_sword_0018', 'wpn_sword_0020', 'wpn_lance_0013', 'wpn_pistol_0006',
        'wpn_funnel_0012', 'wpn_funnel_0005', 'wpn_sword_0005', 'wpn_lance_0004',
        'wpn_funnel_0004', 'wpn_claym_0011', 'wpn_funnel_0014', 'wpn_sword_0018',
        'wpn_pistol_0004', 'wpn_sword_0007', 'wpn_lance_0006', 'wpn_claym_0012',
        'wpn_sword_0019', 'wpn_claym_0015', 'wpn_lance_0013', 'wpn_funnel_0012',
        'wpn_lance_0004', 'wpn_sword_0005', 'wpn_pistol_0006', 'wpn_funnel_0004',
        'wpn_claym_0014', 'wpn_funnel_0007', 'wpn_lance_0006', 'wpn_lance_0013'
    ];

    const DAILY_ROTATION = [
        ['wpn_claym_0011', 'wpn_pistol_0004'], ['wpn_sword_0007', 'wpn_pistol_0006'],
        ['wpn_claym_0014', 'wpn_sword_0018'], ['wpn_funnel_0014', 'wpn_lance_0006'],
        ['wpn_funnel_0004', 'wpn_sword_0020'], ['wpn_lance_0004', 'wpn_sword_0018'],
        ['wpn_funnel_0005', 'wpn_pistol_0012'], ['wpn_sword_0005', 'wpn_claym_0015'],
        ['wpn_pistol_0012', 'wpn_sword_0020'], ['wpn_funnel_0005', 'wpn_claym_0012'],
        ['wpn_sword_0007', 'wpn_lance_0013'], ['wpn_claym_0011', 'wpn_lance_0006'],
        ['wpn_sword_0005', 'wpn_funnel_0012'], ['wpn_funnel_0007', 'wpn_claym_0014'],
        ['wpn_funnel_0007', 'wpn_sword_0015'], ['wpn_lance_0004', 'wpn_sword_0015'],
        ['wpn_pistol_0004', 'wpn_claym_0012'], ['wpn_funnel_0004', 'wpn_sword_0019'],
        ['wpn_funnel_0014', 'wpn_claym_0015'], ['wpn_pistol_0006', 'wpn_lance_0013'],
        ['wpn_funnel_0012', 'wpn_sword_0019']
    ];
    const state = {
        tables: null,
        baseline: null,
        comparisonVersion: '',
        changes: { normal: {}, cash: {}, groups: {} },
        groups: [],
        activeGroupId: '',
        activeShopId: '',
        query: ''
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
    }

    function gameText(ref, fallback) {
        return window.AKEV3.text(ref, fallback || '');
    }

    function parseGameText(value) {
        return window.parseText ? window.parseText(value || '') : escapeHtml(value || '').replace(/\n/g, '<br>');
    }

    function currentLocale() {
        return window.akeI18n?.getLanguageInfo?.().htmlLang || 'zh-CN';
    }

    function showIds() {
        return window.akeData?.getConfig?.().showHidden === true;
    }

    function idText(value, className) {
        return showIds() && value ? `<small class="${className || ''}">${escapeHtml(value)}</small>` : '';
    }


    function renderPoolContent(pool, poolContent) {
        if (!poolContent || !poolContent.list?.length) return '';
        const groups = new Map();
        poolContent.list.forEach(entry => {
            const rarity = state.tables.weapons[entry.itemId]?.rarity || 0;
            if (!groups.has(rarity)) groups.set(rarity, []);
            groups.get(rarity).push(entry);
        });
        Array.from(groups.keys()).sort((a, b) => b - a);
        const rarityNames = { 6: '六星', 5: '五星', 4: '四星', 3: '三星' };
        let html = `<div class="akeshop-pool-content"><b>${escapeHtml(gameText(pool?.name, pool?.id || ''))}</b>`;
        const entries = Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
        entries.forEach(([rarity, items], idx) => {
            const isFirst = idx === 0;
            const label = rarityNames[rarity] || `${rarity}星`;
            const rows = items.map(entry => {
                const weaponId = entry.itemId;
                const weight = entry.randomWeight;
                return `<div class="akeshop-pool-row">${weaponIconCell(weaponId)}<span class="akeshop-pool-weight">${escapeHtml(String(weight))}</span></div>`;
            }).join('');
            if (isFirst) {
                html += `<div class="akeshop-pool-rarity"><span>${escapeHtml(label)}</span><div class="akeshop-pool-items">${rows}</div></div>`;
            } else {
                html += `<details class="akeshop-pool-rarity"><summary>${escapeHtml(label)} <i>(${items.length})</i></summary><div class="akeshop-pool-items">${rows}</div></details>`;
            }
        });
        html += '</div>';
        return html;
    }

    function formatDate(value, options) {
        if (!value) return '';
        if (typeof value === 'number') return new Intl.DateTimeFormat(currentLocale(), options || { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
        const match = String(value).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (!match) return value;
        const date = new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T${match[4].padStart(2, '0')}:${match[5].padStart(2, '0')}:${match[6].padStart(2, '0')}+08:00`);
        if (Number.isNaN(date.getTime())) return value;
        return new Intl.DateTimeFormat(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    }

    function formatNumber(value) {
        return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 }).format(Number(value || 0));
    }

    function itemInfo(itemId) {
        return state.tables.items[itemId] || { id: itemId, name: { text: itemId }, iconId: '' };
    }

    function resolveReward(rewardId) {
        const reward = state.tables.rewards[rewardId];
        if (!reward) return [];
        return (reward.itemBundles || []).map(bundle => ({
            id: bundle.id,
            count: bundle.count,
            item: itemInfo(bundle.id)
        }));
    }

    function rewardSearchText(items) {
        return items.map(entry => `${entry.id} ${gameText(entry.item.name, entry.id)}`).join(' ');
    }

    function signature(value) {
        return JSON.stringify(value, function (key, child) {
            if (key === 'text' && this && Object.prototype.hasOwnProperty.call(this, 'id')) return undefined;
            return child;
        });
    }

    function normalGoodsSignature(tables, goodsId) {
        const goods = tables.goods?.[goodsId];
        if (!goods) return '';
        return signature([
            goods,
            tables.rewards?.[goods.rewardId],
            tables.weaponPools?.[goods.weaponGachaPoolId]
        ]);
    }

    function cashGoodsSignature(tables, goodsId) {
        const goods = tables.cashGoods?.[goodsId];
        if (!goods) return '';
        return signature([
            goods,
            tables.rewards?.[goods.rewardId],
            tables.cashGoodsMeta?.[goodsId],
            tables.cashHidden?.[goodsId],
            tables.cashRecharge?.[goodsId],
            tables.monthlyRewards?.[goodsId]
        ]);
    }

    function rawGroupProducts(group, tables) {
        if (group.shopGroupId === 'shop_pay_recommend') {
            return Object.values(tables.recommendations || {}).flatMap(row => {
                let ids = row.cashGoodsIdList || [];
                if (!ids.length && row.type === 'BattlePass') ids = tables.cashShops?.BP?.cashGoodsIds || [];
                return ids.map(id => ({ kind: tables.cashGoods?.[id] ? 'cash' : 'normal', id }));
            });
        }
        const cashGroup = tables.cashGroups?.[group.shopGroupId];
        if (cashGroup) return (cashGroup.cashShopIds || []).flatMap(shopId =>
            (tables.cashShops?.[shopId]?.cashGoodsIds || []).map(id => ({ kind: 'cash', id })));
        return (group.shopIds || []).flatMap(shopId =>
            (tables.shops?.[shopId]?.shopGoodsIds || []).map(id => ({ kind: 'normal', id })));
    }

    function prepareVersionChanges() {
        state.changes = { normal: {}, cash: {}, groups: {} };
        if (!state.baseline) return;
        const includeModified = window.akeData?.getConfig?.().showVersionChanges === true;
        Object.keys(state.tables.goods).forEach(id => {
            if (!state.baseline.goods?.[id]) state.changes.normal[id] = 'added';
            else if (includeModified && normalGoodsSignature(state.tables, id) !== normalGoodsSignature(state.baseline, id)) state.changes.normal[id] = 'modified';
        });
        Object.keys(state.tables.cashGoods).forEach(id => {
            if (!state.baseline.cashGoods?.[id]) state.changes.cash[id] = 'added';
            else if (includeModified && cashGoodsSignature(state.tables, id) !== cashGoodsSignature(state.baseline, id)) state.changes.cash[id] = 'modified';
        });
        state.groups.forEach(group => {
            const baselineGroup = state.baseline.shopGroups?.[group.shopGroupId];
            const products = rawGroupProducts(group, state.tables);
            const childChanges = products.map(product => state.changes[product.kind]?.[product.id]).filter(Boolean);
            const groupChanged = signature([
                group,
                state.tables.cashGroups?.[group.shopGroupId],
                group.shopGroupId === 'shop_pay_recommend' ? state.tables.recommendations : null
            ]) !== signature([
                baselineGroup,
                state.baseline.cashGroups?.[group.shopGroupId],
                group.shopGroupId === 'shop_pay_recommend' ? state.baseline.recommendations : null
            ]);
            if (!baselineGroup || childChanges.includes('added')) state.changes.groups[group.shopGroupId] = 'added';
            else if (includeModified && (groupChanged || childChanges.includes('modified'))) state.changes.groups[group.shopGroupId] = 'modified';
        });
    }

    function changeRank(value) {
        return value === 'added' ? 0 : value === 'modified' ? 1 : 2;
    }

    function normalProduct(goodsId, recommendation) {
        const goods = state.tables.goods[goodsId];
        if (!goods) return null;
        const rewards = resolveReward(goods.rewardId);
        const pool = goods.weaponGachaPoolId ? state.tables.weaponPools[goods.weaponGachaPoolId] : null;
        const poolContent = goods.weaponGachaPoolId ? state.tables.weaponPoolContents[goods.weaponGachaPoolId] : null;
        const weaponId = pool?.upWeaponIds?.[0] || '';
        const weapon = weaponId ? state.tables.weapons[weaponId] : null;
        const name = rewards.length
            ? rewards.map(entry => gameText(entry.item.name, entry.id)).join(' + ')
            : gameText(pool?.name, goods.goodsId);
        const currency = itemInfo(goods.moneyId);
        const tag = state.tables.goodsTags[goods.goodsTagId] || state.tables.commonGoodsTags[goods.goodsTagId];
        return {
            id: goods.goodsId,
            kind: 'normal',
            name,
            goods,
            rewards,
            bonusRewards: [],
            monthlyRewards: [],
            pool,
            poolContent,
            weapon,
            currency,
            tagName: gameText(tag?.tagName, goods.goodsTagId),
            hint: '',
            recommendation,
            hidden: false,
            changeType: state.changes.normal[goodsId] || '',
            changeBaseVersion: state.comparisonVersion,
            searchText: `${goods.goodsId} ${name} ${goods.moneyId} ${gameText(currency.name)} ${rewardSearchText(rewards)} ${recommendation?.name || ''}`.toLowerCase()
        };
    }

    function cashProduct(goodsId, recommendation) {
        const goods = state.tables.cashGoods[goodsId];
        if (!goods) return null;
        const meta = state.tables.cashGoodsMeta[goodsId] || {};
        const hideRow = state.tables.cashHidden[goodsId] || {};
        const rewards = resolveReward(goods.rewardId);
        const recharge = state.tables.cashRecharge[goodsId];
        const bonusRewards = resolveReward(recharge?.bonusRewardId);
        const monthly = state.tables.monthlyRewards[goodsId];
        const monthlyRewards = monthly ? [1, 2, 3].filter(index => monthly[`rewardId${index}`]).map(index => ({
            id: monthly[`rewardId${index}`],
            count: monthly[`rewardCount${index}`],
            item: itemInfo(monthly[`rewardId${index}`])
        })) : [];
        const hint = gameText(state.tables.cashHints[goodsId]?.hintText);
        const hidden = meta.hideInGame === true || hideRow.hideInGame === true;
        return {
            id: goods.cashGoodsId,
            kind: 'cash',
            name: gameText(goods.goodsName, goods.cashGoodsId),
            goods,
            meta,
            rewards,
            bonusRewards,
            monthlyRewards,
            hint,
            hidden,
            recommendation,
            changeType: state.changes.cash[goodsId] || '',
            changeBaseVersion: state.comparisonVersion,
            searchText: `${goods.cashGoodsId} ${gameText(goods.goodsName)} ${rewardSearchText(rewards)} ${recommendation?.name || ''}`.toLowerCase()
        };
    }

    function shouldShowProduct(product) {
        return product && (window.akeData?.getConfig?.().showHidden === true || !product.hidden);
    }

    function shopDisplayName(shop, idField) {
        const sid = shop[idField];
        const override = t(`shopNames.${sid}`, null, '');
        if (override) return override;
        return gameText(shop.shopName, sid);
    }

    function normalShops(group) {
        return (group.shopIds || []).map(shopId => state.tables.shops[shopId]).filter(Boolean).map(shop => ({
            id: shop.shopId,
            name: shopDisplayName(shop, 'shopId'),
            raw: shop,
            products: (shop.shopGoodsIds || []).map(id => normalProduct(id)).filter(shouldShowProduct)
                .sort((a, b) => changeRank(a.changeType) - changeRank(b.changeType))
        }));
    }

    function cashShops(group) {
        const cashGroup = state.tables.cashGroups[group.shopGroupId];
        return (cashGroup?.cashShopIds || []).map(shopId => state.tables.cashShops[shopId]).filter(Boolean).map(shop => ({
            id: shop.cashShopId,
            name: shopDisplayName(shop, 'cashShopId'),
            raw: shop,
            products: (shop.cashGoodsIds || []).map(id => cashProduct(id)).filter(shouldShowProduct)
                .sort((a, b) => changeRank(a.changeType) - changeRank(b.changeType))
        }));
    }

    function recommendationShop() {
        const products = [];
        Object.values(state.tables.recommendations).sort((a, b) => (a.priority || 0) - (b.priority || 0)).forEach(row => {
            const recommendation = { id: row.id, name: gameText(row.name, row.id), type: row.type };
            let ids = row.cashGoodsIdList || [];
            if (!ids.length && row.type === 'BattlePass') ids = state.tables.cashShops.BP?.cashGoodsIds || [];
            ids.forEach(id => {
                const product = state.tables.cashGoods[id]
                    ? cashProduct(id, recommendation)
                    : normalProduct(id, recommendation);
                if (shouldShowProduct(product)) products.push(product);
            });
        });
        products.sort((a, b) => changeRank(a.changeType) - changeRank(b.changeType));
        return [{ id: 'recommendations', name: t('recommendations'), raw: {}, products }];
    }

    function rotationProduct(shopId, weaponId) {
        const candidates = (state.tables.shops[shopId]?.shopGoodsIds || []).map(normalProduct).filter(product =>
            product?.rewards?.some(reward => reward.id === weaponId));
        candidates.sort((a, b) => changeRank(a.changeType) - changeRank(b.changeType));
        const product = candidates[0] || null;
        if (product) {
            product.rarity = state.tables.weapons[weaponId]?.rarity || 0;
        }
        return product;
    }

    function weeklyRotation(index) {
        if (index < 0 || index >= WEEKLY_SIX_STAR.length) return null;
        return [WEEKLY_SIX_STAR[index], WEEKLY_FIVE_STAR[index]];
    }

    function rotationState() {
        const now = Date.now();
        const dailyAdjusted = now - DAILY_REFRESH_OFFSET;
        const weeklyAdjusted = now - WEEKLY_REFRESH_OFFSET;
        const dayIndex = Math.floor((dailyAdjusted - ROTATION_START) / DAY_MS);
        const weekIndex = Math.floor((weeklyAdjusted - ROTATION_START) / (7 * DAY_MS));
        const dailyIndex = dayIndex >= 0 ? dayIndex % DAILY_ROTATION.length : -1;
        const weeklyIds = weeklyRotation(weekIndex) || [];
        const dailyIds = dailyIndex >= 0 ? DAILY_ROTATION[dailyIndex] : [];
        return { dayIndex, weekIndex, dailyIndex, weeklyIds, dailyIds };
    }

    function rotationShop() {
        const rotation = rotationState();
        const weekly = rotation.weeklyIds.map(id => rotationProduct('shop_pay_weapon_weekly', id)).filter(Boolean);
        const daily = rotation.dailyIds.map(id => rotationProduct('shop_pay_weapon_daily', id)).filter(Boolean);
        return {
            id: 'shop_pay_weapon_rotation',
            name: t('rotation.title'),
            kind: 'rotation',
            raw: {},
            rotation,
            weekly,
            daily,
            products: [...weekly, ...daily]
        };
    }

    function shopChangeType(shop) {
        if (shop.products.some(product => product.changeType === 'added')) return 'added';
        if (shop.products.some(product => product.changeType === 'modified')) return 'modified';
        return '';
    }

    function shopsForGroup(group) {
        if (group.shopGroupId === 'shop_pay_recommend') return recommendationShop();
        if (state.tables.cashGroups[group.shopGroupId]) return cashShops(group);
        const shops = normalShops(group);
        if (group.shopGroupId === 'shop_pay_weapon') shops.unshift(rotationShop());
        return shops.map((shop, sourceOrder) => ({ ...shop, sourceOrder, changeType: shopChangeType(shop) }))
            .sort((a, b) => {
                if (a.kind === 'rotation') return -1;
                if (b.kind === 'rotation') return 1;
                return changeRank(a.changeType) - changeRank(b.changeType) || a.sourceOrder - b.sourceOrder;
            });
    }

    function groupType(group) {
        if (group.shopGroupId === 'shop_pay_recommend') return t('groupTypes.recommend');
        if (state.tables.cashGroups[group.shopGroupId]) return t('groupTypes.cash');
        return t(`groupTypes.type${group.shopGroupType}`, null, t('groupTypes.other'));
    }

    function groupContext(group) {
        const rows = [];
        const additional = Object.values(state.tables.activityShop).find(row => row.shopGroupId === group.shopGroupId);
        if (additional) {
            const activity = state.tables.activities[additional.activityId] || {};
            const range = state.tables.times[activity.timeId]?.timeRangeList?.[0] || {};
            rows.push({ label: t('context.activity'), value: gameText(activity.name, additional.activityId) });
            if (range.openTime || range.closeTime) rows.push({
                label: t('context.openTime'),
                value: `${formatDate(range.openTime) || t('unknown')} - ${formatDate(range.closeTime) || t('permanent')}`
            });
        }
        const domain = state.tables.groupDomains[group.shopGroupId];
        if (domain) {
            const domainRow = Object.values(state.tables.domains).find(row => row.domainShopGroupId === group.shopGroupId);
            rows.push({ label: t('context.domain'), value: gameText(domainRow?.domainName, domain.domainId) });
        }
        const channels = Object.values(state.tables.channels).filter(row => row.shopGroupId === group.shopGroupId);
        if (channels.length) rows.push({
            label: t('context.channels'),
            value: channels.map(row => gameText(row.channelName, row.levelId)).join(t('separator'))
        });
        return rows;
    }

    function matches(product) {
        return !state.query || product.searchText.includes(state.query);
    }

    function groupMatches(group) {
        if (!state.query) return true;
        const ownText = `${group.shopGroupId} ${gameText(group.shopGroupName)} ${groupType(group)}`.toLowerCase();
        return ownText.includes(state.query) || shopsForGroup(group).some(shop =>
            `${shop.id} ${shop.name}`.toLowerCase().includes(state.query) || shop.products.some(matches));
    }

    function productCount(group) {
        return shopsForGroup(group).filter(shop => shop.kind !== 'rotation').reduce((sum, shop) => sum + shop.products.length, 0);
    }

    function changeTag(changeType) {
        if (!changeType) return '';
        const label = window.akeData?.t(
            changeType === 'added' ? 'versionDiff.added' : 'versionDiff.modified',
            null,
            changeType === 'added' ? '新增' : '修改'
        ) || (changeType === 'added' ? '新增' : '修改');
        return `<span class="akeshop-change-tag akeshop-change-tag--${changeType}">${escapeHtml(label)}</span>`;
    }

    function changeTabBadge(changeType) {
        if (!changeType) return '';
        const label = changeType === 'added' ? '新' : '改';
        return `<span class="akeshop-tab-badge akeshop-tab-badge--${changeType}">${label}</span>`;
    }

    function compareGroups(a, b) {
        const aChange = state.changes.groups[a.shopGroupId];
        const bChange = state.changes.groups[b.shopGroupId];
        const aWeapon = a.shopGroupId === 'shop_pay_weapon';
        const bWeapon = b.shopGroupId === 'shop_pay_weapon';
        const aRank = aWeapon && aChange === 'added' ? 0 : aChange === 'added' ? 1 : aWeapon ? 2 : 3;
        const bRank = bWeapon && bChange === 'added' ? 0 : bChange === 'added' ? 1 : bWeapon ? 2 : 3;
        return aRank - bRank || a.sourceOrder - b.sourceOrder;
    }

    function groupButton(group) {
        const active = group.shopGroupId === state.activeGroupId;
        const changeType = state.changes.groups[group.shopGroupId];
        const changeLabel = changeType === 'added'
            ? (window.akeData?.t('versionDiff.added', null, '新增') || '新增')
            : changeType === 'modified'
            ? (window.akeData?.t('versionDiff.modified', null, '修改') || '修改')
            : '';
        return `<button class="akeshop-group${active ? ' is-active' : ''}${changeType ? ` akeshop-group--${changeType}` : ''}" type="button" data-group-id="${escapeHtml(group.shopGroupId)}">
            <span class="akeshop-group-mark" aria-hidden="true"></span>
            <span class="akeshop-group-copy"><b>${escapeHtml(gameText(group.shopGroupName, group.shopGroupId))}</b><small>${escapeHtml(groupType(group))}</small></span>
            <span class="akeshop-group-count">${productCount(group)}</span>
            ${changeLabel ? `<span class="akeshop-group-change-tag akeshop-change-tag--${changeType}">${escapeHtml(changeLabel)}</span>` : ''}
        </button>`;
    }

    function renderGroupLists() {
        const visible = state.groups.filter(groupMatches).sort(compareGroups);
        const html = visible.length ? visible.map(groupButton).join('') : `<div class="akeshop-empty">${escapeHtml(t('noMatches'))}</div>`;
        list.innerHTML = html;
        mobileGroups.innerHTML = html;
    }

    function rewardRows(items, className) {
        if (!items.length) return '';
        return `<div class="akeshop-rewards ${className || ''}">${items.map(entry => {
            const name = gameText(entry.item.name, entry.id);
            return `<div class="akeshop-reward">
                ${entry.item.iconId ? `<img src="/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${escapeHtml(entry.item.iconId)}.png" alt="" onerror="this.style.display='none'">` : ''}
                <span>${escapeHtml(name)}</span><b>×${formatNumber(entry.count)}</b>
            </div>`;
        }).join('')}</div>`;
    }

    function refreshLabel(type) {
        // ByTimeId has no exposed TimeId on ShopGoodsTable in the current data, so keep the enum meaning without inventing a date range.
        const known = { 0: 'none', 1: 'daily', 2: 'weekly', 3: 'monthly', 4: 'pool', 5: 'subVersion', 6: 'byTime' };
        const enumNames = { 0: 'Forever', 1: 'Daily', 2: 'Weekly', 3: 'Monthly', 4: 'WeaponGacha', 5: 'SubVersion', 6: 'ByTimeId' };
        const fallback = t('refresh.unknown', { type: enumNames[type] || type }, String(type));
        return t(`refresh.${known[type] || 'unknown'}`, { type }, fallback);
    }

    function normalPrice(product) {
        const goods = product.goods;
        const discount = Number(goods.cnDiscount || 1);
        let current = Number(goods.price || 0);
        let original = 0;
        if (Number(goods.randomGoodsStandardPrice || 0) > 0) {
            original = Number(goods.randomGoodsStandardPrice);
        } else if (discount > 0 && discount < 1) {
            original = current;
            current = Math.ceil(current * discount);
        }
        const currencyName = gameText(product.currency.name, goods.moneyId);
        return `<div class="akeshop-price">
            ${product.currency.iconId ? `<img src="/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${escapeHtml(product.currency.iconId)}.png" alt="">` : ''}
            ${original ? `<del>${formatNumber(original)}</del>` : ''}<strong>${formatNumber(current)}</strong><span>${escapeHtml(currencyName)}</span>
            ${discount < 1 ? `<em>-${Math.round((1 - discount) * 100)}%</em>` : ''}
        </div>`;
    }

    function cashPrice(product) {
        const goods = product.goods;
        const isFree = product.meta.isFree === true || (!Number(goods.priceCNY) && !Number(goods.priceUSD));
        if (isFree) return `<div class="akeshop-price"><strong>${escapeHtml(t('free'))}</strong></div>`;
        const parts = [];
        if (Number(goods.priceCNY) > 0) parts.push(`¥${formatNumber(goods.priceCNY)}`);
        if (Number(goods.priceUSD) > 0) parts.push(`$${formatNumber(goods.priceUSD)}`);
        return `<div class="akeshop-price"><strong>${parts.join(' / ')}</strong></div>`;
    }

    function productIcon(product) {
        if (product.poolContent?.list?.length) {
            let bestWeaponId = '';
            let bestWeight = -1;
            product.poolContent.list.forEach(entry => {
                const rarity = state.tables.weapons[entry.itemId]?.rarity || 0;
                if (rarity === 6 && entry.randomWeight > bestWeight) {
                    bestWeight = entry.randomWeight;
                    bestWeaponId = entry.itemId;
                }
            });
            if (bestWeaponId) {
                const item = state.tables.items[bestWeaponId];
                const iconId = item?.iconId || bestWeaponId;
                return `/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${iconId}.png`;
            }
        }
        const rewardIcon = product.rewards[0]?.item?.iconId;
        if (rewardIcon) return `/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${rewardIcon}.png`;
        if (product.weapon?.iconId) return `/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${product.weapon.iconId}.png`;
        return '';
    }

    function limitLabel(product) {
        if (product.kind === 'cash') {
            const count = Number(product.meta.availCount || 0);
            return count > 0
                ? t('limitWithRefresh', { count, refresh: refreshLabel(product.meta.availRefresh) })
                : t('unlimited');
        }
        const count = Number(product.goods.limitCount || 0);
        return count > 0
            ? t('limitWithRefresh', { count, refresh: refreshLabel(product.goods.limitCountRefreshType) })
            : t('unlimited');
    }

    function renderProduct(product) {
        const icon = productIcon(product);
        const badges = [];
        if (product.tagName) badges.push(product.tagName);
        if (product.recommendation?.name) badges.push(product.recommendation.name);
        if (product.hidden) badges.push(t('hidden'));
        if (product.pool) badges.push(t('weaponClaim'));
        const lockText = gameText(product.goods.lockDesc);
        const rarityClass = product.rarity ? `akeshop-rarity-${product.rarity}` : '';
        const changeHtml = changeTag(product.changeType);
        return `<article class="akeshop-product ${rarityClass}${product.hidden ? ' is-hidden' : ''}">
            ${changeHtml}
            <div class="akeshop-product-head">
                <div class="akeshop-product-icon">${icon ? `<img src="${escapeHtml(icon)}" alt="" onerror="this.style.display='none'">` : '<span aria-hidden="true">◇</span>'}</div>
                <div class="akeshop-product-title"><h3>${escapeHtml(product.name)}</h3><small class="akeshop-product-id">${escapeHtml(product.id)}</small></div>
            </div>
            ${badges.length ? `<div class="akeshop-badges">${badges.map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div>` : ''}
            ${product.kind === 'cash' ? cashPrice(product) : normalPrice(product)}
            <div class="akeshop-product-body">
                ${rewardRows(product.rewards)}
                ${product.bonusRewards.length ? `<div class="akeshop-subtitle">${escapeHtml(t('bonusReward'))}</div>${rewardRows(product.bonusRewards, 'is-bonus')}` : ''}
                ${product.monthlyRewards.length ? `<div class="akeshop-subtitle">${escapeHtml(t('monthlyReward'))}</div>${rewardRows(product.monthlyRewards, 'is-monthly')}` : ''}
                ${product.pool ? renderPoolContent(product.pool, product.poolContent) : ''}
                ${product.hint ? `<div class="akeshop-note">${parseGameText(product.hint)}</div>` : ''}
                ${lockText ? `<div class="akeshop-note">${parseGameText(lockText)}</div>` : ''}
            </div>
            <footer><span>${escapeHtml(limitLabel(product))}</span></footer>
        </article>`;
    }

    function renderRotationSection(products, sectionKey, nextProducts) {
        const sectionTitle = t(`rotation.${sectionKey}`);
        const cdClass = sectionKey === 'weekly' ? 'akeshop-cd-weekly' : 'akeshop-cd-daily';
        const hasNext = nextProducts && nextProducts.length;
        return `<div class="akeshop-rotation-section">
            <div class="akeshop-rotation-head">
                <h3 class="akeshop-rotation-title">${escapeHtml(sectionTitle)}</h3>
                <span class="akeshop-countdown-inline"><span class="akeshop-cd-label">${escapeHtml(t('rotation.refreshIn'))}</span> <strong class="${cdClass}">--:--:--</strong></span>
            </div>
            <div class="akeshop-products">${products.map(renderProduct).join('')}</div>
            ${hasNext ? `<h3 class="akeshop-rotation-title akeshop-rotation-next">${escapeHtml(t('rotation.nextBatch'))}</h3><div class="akeshop-products">${nextProducts.map(renderProduct).join('')}</div>` : ''}
        </div>`;
    }

    let countdownTimer = null;

    function nextDailyRefresh() {
        const now = new Date();
        const refresh = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 20, 0, 0));
        if (now >= refresh) refresh.setUTCDate(refresh.getUTCDate() + 1);
        return refresh;
    }

    function nextWeeklyRefresh() {
        const now = new Date();
        let refresh = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0));
        while (refresh.getUTCDay() !== 4) refresh.setUTCDate(refresh.getUTCDate() + 1);
        if (now >= refresh) refresh.setUTCDate(refresh.getUTCDate() + 7);
        return refresh;
    }

    function formatCountdown(seconds) {
        if (seconds <= 0) return '00:00:00:00';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(d).padStart(2, '0')}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function startCountdown() {
        stopCountdown();
        function tick() {
            const el = document.getElementById('akeShopCountdown');
            if (!el) { stopCountdown(); return; }
            const daily = Math.floor((nextDailyRefresh() - Date.now()) / 1000);
            const weekly = Math.floor((nextWeeklyRefresh() - Date.now()) / 1000);
            const dailyEl = el.querySelector('.akeshop-cd-daily');
            const weeklyEl = el.querySelector('.akeshop-cd-weekly');
            if (dailyEl) dailyEl.textContent = formatCountdown(daily);
            if (weeklyEl) weeklyEl.textContent = formatCountdown(weekly);
        }
        tick();
        countdownTimer = setInterval(tick, 1000);
    }

    function stopCountdown() {
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    }

    function onModuleActivate(event) {
        if (event.detail?.moduleId !== MODULE_ID || !root.isConnected) return;
        if (root.querySelector('#akeShopCountdown')) startCountdown();
    }

    function onModuleDeactivate(event) {
        if (event.detail?.moduleId === MODULE_ID) stopCountdown();
    }

    function nextBatchWeekly() {
        const rot = rotationState();
        const nextIdx = rot.weekIndex + 1;
        const ids = weeklyRotation(nextIdx) || [];
        return ids.filter(Boolean).map(id => rotationProduct('shop_pay_weapon_weekly', id)).filter(Boolean);
    }

    function nextBatchDaily() {
        const rot = rotationState();
        const nextIdx = ((rot.dailyIndex + 1) % DAILY_ROTATION.length + DAILY_ROTATION.length) % DAILY_ROTATION.length;
        return DAILY_ROTATION[nextIdx].filter(Boolean).map(id => rotationProduct('shop_pay_weapon_daily', id)).filter(Boolean);
    }

    const DAY_LABELS = ['rotation.thu', 'rotation.fri', 'rotation.sat', 'rotation.sun', 'rotation.mon', 'rotation.tue', 'rotation.wed'];

    function weaponName(weaponId) {
        const item = state.tables.items[weaponId];
        return item ? gameText(item.name, weaponId) : weaponId;
    }

    function weaponIconCell(weaponId) {
        const name = weaponName(weaponId);
        const item = state.tables.items[weaponId];
        const iconId = item?.iconId || weaponId;
        return `<a href="/?plugin=v3_weapon&id=${escapeHtml(weaponId)}" class="akeshop-rot-weapon" title="${escapeHtml(name)}"><img src="/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${escapeHtml(iconId)}.png" alt="${escapeHtml(name)}" onerror="this.style.display='none'"></a>`;
    }

    function renderRotationCombinedTable() {
        const rot = rotationState();
        const totalWeeks = WEEKLY_SIX_STAR.length;
        const header1Html = '<th></th><th></th><th></th><th></th><th></th>' +
            `<th colspan="7">${escapeHtml(t('rotation.dailyTitle'))}</th>`;
        const header2Html = '<th></th>' +
            `<th>${escapeHtml(t('rotation.startDate'))}</th>` +
            `<th>${escapeHtml(t('rotation.endDate'))}</th>` +
            `<th>${escapeHtml(t('rotation.weekly6'))}</th>` +
            `<th>${escapeHtml(t('rotation.weekly5'))}</th>` +
            DAY_LABELS.map(key => `<th>${escapeHtml(t(key))}</th>`).join('');

        let rows = '';
        const currentDow = rot.dayIndex >= 0 ? rot.dayIndex % 7 : -1;
        for (let w = 0; w < totalWeeks; w++) {
            const isActiveWeek = w === rot.weekIndex;
            const weekStart = new Date(ROTATION_START + w * 7 * DAY_MS);
            const weekEnd = new Date(ROTATION_START + (w + 1) * 7 * DAY_MS - 1);
            let dayCells = '';
            for (let dow = 0; dow < 7; dow++) {
                const absoluteDay = w * 7 + dow;
                const di = ((absoluteDay % DAILY_ROTATION.length) + DAILY_ROTATION.length) % DAILY_ROTATION.length;
                const isActiveDay = isActiveWeek && dow === currentDow;
                dayCells += `<td class="${isActiveDay ? 'is-active' : ''} akeshop-rot-day">${weaponIconCell(DAILY_ROTATION[di][0])}${weaponIconCell(DAILY_ROTATION[di][1])}</td>`;
            }
            rows += `<tr class="${isActiveWeek ? 'is-active' : ''}">
                <td>${w + 1}</td>
                <td>${formatDate(weekStart.getTime())}</td>
                <td>${formatDate(weekEnd.getTime())}</td>
                <td>${weaponIconCell(WEEKLY_SIX_STAR[w])}</td>
                <td>${weaponIconCell(WEEKLY_FIVE_STAR[w])}</td>
                ${dayCells}
            </tr>`;
        }

        return `<div class="akeshop-rotation-full">
            <details class="akeshop-rotation-details" open>
                <summary>${escapeHtml(t('rotation.fullTable'))}</summary>
                <div class="akeshop-rot-scroll">
                    <table class="akeshop-rot-table">
                        <thead><tr>${header1Html}</tr><tr>${header2Html}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </details>
        </div>`;
    }

    function renderDetail() {
        const group = state.groups.find(row => row.shopGroupId === state.activeGroupId);
        if (!group) {
            content.innerHTML = `<div class="akeshop-empty">${escapeHtml(t('selectGroup'))}</div>`;
            return;
        }
        const ownMatch = `${group.shopGroupId} ${gameText(group.shopGroupName)} ${groupType(group)}`.toLowerCase().includes(state.query);
        const shops = shopsForGroup(group).map(shop => ({
            ...shop,
            products: !state.query || ownMatch || `${shop.id} ${shop.name}`.toLowerCase().includes(state.query)
                ? shop.products
                : shop.products.filter(matches)
        })).filter(shop => !state.query || shop.products.length);
        if (!shops.some(shop => shop.id === state.activeShopId)) state.activeShopId = shops[0]?.id || '';
        const activeShop = shops.find(shop => shop.id === state.activeShopId);
        const contextRows = groupContext(group);
        const total = shops.reduce((sum, shop) => sum + shop.products.length, 0);
        const rotationProductsHtml = activeShop?.kind === 'rotation'
            ? `<div id="akeShopCountdown">${renderRotationSection(activeShop.weekly, 'weekly', nextBatchWeekly())}${renderRotationSection(activeShop.daily, 'daily', nextBatchDaily())}${renderRotationCombinedTable()}</div>`
            : '';
        content.innerHTML = `<section class="akeshop-group-header">
            <div><span>${escapeHtml(groupType(group))}</span><h1>${escapeHtml(gameText(group.shopGroupName, group.shopGroupId))}</h1><small class="akeshop-group-id">${escapeHtml(group.shopGroupId)}</small></div>
            <strong>${escapeHtml(t('goodsCount', { count: total }))}</strong>
        </section>
        ${contextRows.length ? `<dl class="akeshop-context">${contextRows.map(row => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}</dl>` : ''}
        ${shops.length > 1 ? `<div class="akeshop-tabs" role="tablist">${shops.map(shop => `<button type="button" role="tab" aria-selected="${shop.id === state.activeShopId}" class="${shop.id === state.activeShopId ? 'is-active' : ''}" data-shop-id="${escapeHtml(shop.id)}"><span>${escapeHtml(shop.name)}</span><b>${shop.products.length}</b>${changeTabBadge(shop.changeType)}</button>`).join('')}</div>` : ''}
        ${activeShop && activeShop.kind === 'rotation'
            ? `<section class="akeshop-shop-section"><header><div><h2>${escapeHtml(activeShop.name)}</h2></div><span>${escapeHtml(t('goodsCount', { count: activeShop.products.length }))}</span></header>${rotationProductsHtml}</section>`
            : activeShop ? `<section class="akeshop-shop-section"><header><div><h2>${escapeHtml(activeShop.name)}</h2><small class="akeshop-shop-id">${escapeHtml(activeShop.id)}</small></div><span>${escapeHtml(t('goodsCount', { count: activeShop.products.length }))}</span></header><div class="akeshop-products">${activeShop.products.map(renderProduct).join('')}</div></section>` : `<div class="akeshop-empty">${escapeHtml(t('noGoods'))}</div>`}`;
        if (activeShop?.kind === 'rotation') startCountdown(); else stopCountdown();
    }

    function closeOverlay() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function selectGroup(groupId, updateUrl) {
        if (!state.groups.some(group => group.shopGroupId === groupId)) return false;
        state.activeGroupId = groupId;
        state.activeShopId = '';
        renderGroupLists();
        renderDetail();
        closeOverlay();
        if (updateUrl !== false) window.__akeRouter?.updateUrl?.(MODULE_ID, groupId);
        return true;
    }

    function onGroupClick(event) {
        const button = event.target.closest('[data-group-id]');
        if (button) selectGroup(button.dataset.groupId, true);
    }

    function remapShopTables(raw) {
        return {
            shopGroups: raw.ShopGroupTable,
            shops: raw.ShopTable,
            goods: raw.ShopGoodsTable,
            rewards: raw.RewardTable,
            items: raw.ItemTable,
            goodsTags: raw.ShopGoodsTagTable,
            commonGoodsTags: raw.ShopGoodsTagCommonTable,
            groupDomains: raw.ShopGroupDomainTable,
            channels: raw.ShopChannelDevelopmentTable,
            domains: raw.DomainDataTable,
            activityShop: raw.ActivityShopAdditionalTable,
            activities: raw.ActivityTable,
            times: raw.TimeRangeTable,
            cashGroups: raw.CashShopGroupTable,
            cashShops: raw.CashShopTable,
            cashGoods: raw.CashShopGoodsTable,
            cashGoodsMeta: raw.GiftpackCashShopGoodsDataTable,
            cashHidden: raw.CashShopHideInGameTable,
            cashRecharge: raw.CashShopRechargeTable,
            cashHints: raw.CashShopHintTextTable,
            recommendations: raw.CashShopRecommendTable,
            monthlyRewards: raw.ShopMonthlyPassRewardTable,
            weaponPools: raw.GachaWeaponPoolTable,
            weaponPoolContents: raw.GachaWeaponPoolContentTable,
            weapons: raw.WeaponBasicTable
        };
    }

    async function load() {
        try {
            if (window.configLoaded) await window.configLoaded;
            const names = [
                'ShopGroupTable', 'ShopTable', 'ShopGoodsTable', 'RewardTable', 'ItemTable',
                'ShopGoodsTagTable', 'ShopGoodsTagCommonTable', 'ShopGroupDomainTable', 'ShopChannelDevelopmentTable',
                'DomainDataTable', 'ActivityShopAdditionalTable', 'ActivityTable', 'TimeRangeTable',
                'CashShopGroupTable', 'CashShopTable', 'CashShopGoodsTable', 'GiftpackCashShopGoodsDataTable',
                'CashShopHideInGameTable', 'CashShopRechargeTable', 'CashShopHintTextTable', 'CashShopRecommendTable',
                'ShopMonthlyPassRewardTable', 'GachaWeaponPoolTable', 'GachaWeaponPoolContentTable', 'WeaponBasicTable'
            ];
            const loaded = await Promise.all(names.map(name => window.AKEV3.table(name)));
            const raw = Object.fromEntries(names.map((name, index) => [name, loaded[index]]));
            state.tables = remapShopTables(raw);
            state.groups = Object.values(state.tables.shopGroups);
            const comparison = window.akeDataSource?.getState?.()?.comparison;
            if (comparison?.baseline) {
                state.comparisonVersion = comparison.baseline.id;
                try {
                    const baselineLoaded = await Promise.all(names.map(name => window.AKEV3.table(name, comparison.baseline)));
                    const baselineRaw = Object.fromEntries(names.map((name, index) => [name, baselineLoaded[index]]));
                    state.baseline = remapShopTables(baselineRaw);
                } catch (baselineError) {
                    console.warn('Failed to load baseline shop data for version diff', baselineError);
                }
                prepareVersionChanges();
            }
            const deepId = window.__deepLinkId;
            window.__deepLinkId = null;
            if (deepId && !selectGroup(deepId, false)) window.__akeRouter?.onDeepLinkNotFound?.(deepId, false);
            if (!state.activeGroupId) selectGroup('shop_pay_weapon', false);
        } catch (error) {
            console.error('Failed to load shop data', error);
            content.innerHTML = `<div class="akeshop-error"><b>${escapeHtml(t('loadFailed'))}</b><span>${escapeHtml(error.message)}</span></div>`;
        }
    }

    function onConfigChanged() {
        if (!document.body.contains(root) || !state.tables) return;
        renderGroupLists();
        renderDetail();
    }

    list.addEventListener('click', onGroupClick);
    mobileGroups.addEventListener('click', onGroupClick);
    content.addEventListener('click', event => {
        const button = event.target.closest('[data-shop-id]');
        if (!button) return;
        state.activeShopId = button.dataset.shopId;
        renderDetail();
    });
    search.addEventListener('input', () => {
        state.query = search.value.trim().toLowerCase();
        renderGroupLists();
        renderDetail();
    });
    mobileButton.addEventListener('click', () => {
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
    });
    overlay.addEventListener('click', event => {
        if (event.target === overlay || event.target.closest('.akeshop-mobile-title button')) closeOverlay();
    });
    window.addEventListener('globalConfigChanged', onConfigChanged);
    window.addEventListener('ake:module-activate', onModuleActivate);
    window.addEventListener('ake:module-deactivate', onModuleDeactivate);
    window.__akeShopController = {
        destroy() {
            window.removeEventListener('globalConfigChanged', onConfigChanged);
            window.removeEventListener('ake:module-activate', onModuleActivate);
            window.removeEventListener('ake:module-deactivate', onModuleDeactivate);
            stopCountdown();
        }
    };
    load();
})();
