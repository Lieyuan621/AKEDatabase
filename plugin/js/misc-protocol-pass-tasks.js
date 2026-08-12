(function () {
    'use strict';

    const MODULE_ID = 'protocol_pass_tasks';
    const LABEL_TIME_IDS = Object.freeze({
        bp_task_label_return_01: 'time_bp_return_1'
    });

    window.AKEMisc.register(MODULE_ID, async function (context) {
        const root = context.root;
        const t = (key, params, fallback) => window.akeI18n?.t(`modules.misc.protocolPassTasks.${key}`, params, fallback) || fallback || key;
        const escape = context.escapeHtml;
        const text = (value, fallback) => context.text(value, fallback) || fallback || '';
        const seasonSelect = root.querySelector('#miscPassSeason');
        const searchInput = root.querySelector('#miscPassSearch');
        const statusRoot = root.querySelector('#miscPassStatus');
        const labelsRoot = root.querySelector('#miscPassLabels');
        const timelineRoot = root.querySelector('#miscPassTimeline');
        const tasksRoot = root.querySelector('#miscPassTasks');
        const countRoot = root.querySelector('#miscPassCount');
        const levelContent = root.querySelector('#miscPassLevelContent');
        let tables;
        let selectedSeason = '';
        let selectedCategory = '';
        let selectedWeek = '';
        let query = '';

        function showHidden() {
            return window.akeData?.getConfig?.().showHidden === true;
        }

        function parseGameTime(value) {
            const match = String(value || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
            if (!match) return null;
            const [, year, month, day, hour, minute, second] = match.map(Number);
            return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
        }

        function rangeFor(timeId) {
            const row = tables.timeRanges?.[timeId]?.timeRangeList?.[0] || {};
            return { open: parseGameTime(row.openTime), close: parseGameTime(row.closeTime) };
        }

        function labelTime(labelId, seasonRange) {
            const timeId = LABEL_TIME_IDS[labelId] || `time_${String(labelId).replace('_task_', '_')}`;
            const range = rangeFor(timeId);
            return { open: range.open || seasonRange.open, close: range.close || seasonRange.close };
        }

        function formatDate(date) {
            if (!date) return t('unknownTime', null, '时间未知');
            return new Intl.DateTimeFormat(window.akeI18n?.getLanguageInfo?.().htmlLang || 'zh-CN', {
                timeZone: 'Asia/Shanghai', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }).format(date);
        }

        function stateFor(range) {
            const now = Date.now();
            if (range.open && now < range.open.getTime()) return 'upcoming';
            if (range.close && now >= range.close.getTime()) return 'closed';
            return 'active';
        }

        function stateLabel(state) {
            return state === 'upcoming' ? t('upcoming', null, '尚未开放') : state === 'closed' ? t('closed', null, '已结束') : t('active', null, '开放中');
        }

        function rewardBundles(rewardId) {
            const reward = tables.rewards?.[rewardId] || {};
            return [...(reward.itemBundles || []), ...(reward.probItemBundles || [])];
        }

        function renderRewardIds(ids) {
            const bundles = ids.flatMap(rewardBundles);
            if (!bundles.length) {
                return ids.some(Boolean)
                    ? (showHidden() ? ids.filter(Boolean).map(id => `<code>${escape(id)}</code>`).join('') : escape(t('rewardUnavailable', null, '奖励配置不可用')))
                    : '';
            }
            return bundles.slice(0, 5).map(bundle => {
                const item = tables.items?.[bundle.id] || {};
                const name = text(item.name, showHidden() ? bundle.id : t('unnamedItem', null, '未命名物品'));
                const icon = item.iconId || (showHidden() ? bundle.id : '');
                return `<span class="misc-reward">${icon ? `<img src="/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/itemiconbig/${escape(icon)}.png" alt="">` : ''}<span>${escape(name)}</span><b>x${Number(bundle.count || 0).toLocaleString()}</b></span>`;
            }).join('');
        }

        function seasonGroups(seasonId) {
            return Object.values(tables.groups || {}).filter(group => String(group.groupId || '').startsWith(`${seasonId}_`));
        }

        function parentLabelMap() {
            return Object.fromEntries(Object.entries(tables.subLabelMap || {}).map(([subId, row]) => [subId, row.parentLabelId]));
        }

        function categoriesFor(seasonId) {
            const parents = parentLabelMap();
            const groups = seasonGroups(seasonId);
            const seen = new Map();
            groups.forEach(group => {
                const categoryId = parents[group.labelId] || group.labelId;
                if (!seen.has(categoryId)) {
                    const label = tables.labels?.[categoryId] || {};
                    seen.set(categoryId, { id: categoryId, label, sortId: Number(label.sortId ?? group.sortId ?? 999) });
                }
            });
            return [...seen.values()].sort((a, b) => a.sortId - b.sortId || a.id.localeCompare(b.id));
        }

        function tasksForCategory(seasonId, categoryId) {
            const parents = parentLabelMap();
            const groupIds = new Set(seasonGroups(seasonId)
                .filter(group => (parents[group.labelId] || group.labelId) === categoryId)
                .map(group => group.groupId));
            return Object.values(tables.tasks || {}).filter(task => groupIds.has(task.groupId));
        }

        function formattedTaskName(task) {
            const targets = (task.conditionIds || []).map(id => Number(tables.conditions?.[id]?.progressToCompare || 0).toLocaleString());
            let index = 0;
            return text(task.name, showHidden() ? task.taskId : t('unnamedTask', null, '任务描述不可用')).replace(/%[-+0-9.]*[dfs]/g, () => targets[index++] || targets[0] || '?');
        }

        function renderStatus() {
            const season = tables.seasons?.[selectedSeason] || {};
            const range = rangeFor(`time_${selectedSeason}`);
            const state = stateFor(range);
            statusRoot.innerHTML = `
                <span class="misc-task-chip is-${state}">${escape(stateLabel(state))}</span>
                <span class="misc-task-status__time">${escape(range.open && range.close ? t('dateRange', { open: formatDate(range.open), close: formatDate(range.close) }, `${formatDate(range.open)} - ${formatDate(range.close)}`) : t('unknownTime', null, '时间未知'))}</span>
                <span class="misc-task-chip">${escape(t('maxLevel', { level: season.maxLevel || 0 }, `最高 ${season.maxLevel || 0} 级`))}</span>`;
        }

        function renderTabs() {
            const categories = categoriesFor(selectedSeason);
            if (!categories.some(category => category.id === selectedCategory)) selectedCategory = categories[0]?.id || '';
            labelsRoot.innerHTML = categories.map((category, index) => `<button type="button" class="${category.id === selectedCategory ? 'is-active' : ''}" data-category-index="${index}">${escape(text(category.label.name, t('taskCategory', null, '任务类别')))}</button>`).join('');
            labelsRoot.querySelectorAll('button').forEach(button => context.on(button, 'click', () => {
                selectedCategory = categories[Number(button.dataset.categoryIndex)]?.id || '';
                selectedWeek = '';
                renderTabs();
                renderTimeline();
                renderTasks();
            }));
        }

        function renderTimeline() {
            const seasonRange = rangeFor(`time_${selectedSeason}`);
            const parents = parentLabelMap();
            const labels = seasonGroups(selectedSeason)
                .filter(group => (parents[group.labelId] || group.labelId) === selectedCategory)
                .map(group => tables.labels?.[group.labelId] || { labelId: group.labelId, name: group.name })
                .filter((label, index, rows) => rows.findIndex(other => other.labelId === label.labelId) === index)
                .sort((a, b) => Number(a.sortId || 0) - Number(b.sortId || 0));
            if (labels.length <= 1) {
                selectedWeek = '';
                timelineRoot.innerHTML = '';
                return;
            }
            if (selectedWeek && !labels.some(label => label.labelId === selectedWeek)) selectedWeek = '';
            timelineRoot.innerHTML = `<button type="button" class="misc-release-step ${selectedWeek ? '' : 'is-selected'}" data-week-index="-1"><span></span><b>${escape(t('allWeeks', null, '全部周次'))}</b><small>${escape(t('showAllWeeks', null, '显示全部'))}</small></button>` + labels.map((label, index) => {
                const range = labelTime(label.labelId, seasonRange);
                const state = stateFor(range);
                return `<button type="button" class="misc-release-step is-${state} ${label.labelId === selectedWeek ? 'is-selected' : ''}" data-week-index="${index}"><span></span><b>${escape(text(label.name, t('week', { week: index + 1 }, `第 ${index + 1} 周`)))}</b><small>${escape(range.open ? formatDate(range.open) : t('seasonOpen', null, '赛季开放'))}</small></button>`;
            }).join('');
            timelineRoot.querySelectorAll('button[data-week-index]').forEach(button => context.on(button, 'click', () => {
                selectedWeek = labels[Number(button.dataset.weekIndex)]?.labelId || '';
                renderTimeline();
                renderTasks();
            }));
        }

        function renderTasks() {
            const parents = parentLabelMap();
            const seasonRange = rangeFor(`time_${selectedSeason}`);
            const lowerQuery = query.trim().toLocaleLowerCase();
            const rows = tasksForCategory(selectedSeason, selectedCategory)
                .filter(task => !selectedWeek || tables.groups?.[task.groupId]?.labelId === selectedWeek)
                .filter(task => !lowerQuery || `${formattedTaskName(task)}${showHidden() ? ` ${task.taskId}` : ''}`.toLocaleLowerCase().includes(lowerQuery))
                .sort((a, b) => Number(a.sortId || 0) - Number(b.sortId || 0));
            countRoot.textContent = t('taskCount', { count: rows.length }, `${rows.length} 项`);
            if (!rows.length) {
                tasksRoot.innerHTML = `<div class="misc-task-empty">${escape(t('noTasks', null, '没有匹配的任务'))}</div>`;
                return;
            }
            tasksRoot.innerHTML = rows.map(task => {
                const group = tables.groups?.[task.groupId] || {};
                const label = tables.labels?.[group.labelId] || {};
                const release = labelTime(label.labelId || group.labelId, seasonRange);
                const releaseState = stateFor(release);
                const conditions = (task.conditionIds || []).map(id => ({ id, target: tables.conditions?.[id]?.progressToCompare }));
                return `<article class="misc-task-card"${showHidden() ? ` data-task-id="${escape(task.taskId)}"` : ''}>
                    <div class="misc-task-card__meta">
                        <span class="misc-task-chip is-${releaseState}">${escape(stateLabel(releaseState))}</span>
                        <span class="misc-task-chip">+${Number(task.addexp || 0).toLocaleString()} EXP</span>
                    </div>
                    <h4 class="misc-task-card__title">${context.parseText(formattedTaskName(task))}</h4>
                    ${showHidden() ? `<div class="misc-task-card__description">${conditions.map(condition => `<span class="misc-condition" title="${escape(condition.id)}">${escape(t('conditionTarget', { value: Number(condition.target || 0).toLocaleString() }, `目标 ${Number(condition.target || 0).toLocaleString()}`))}</span>`).join('')}</div>` : ''}
                    <div class="misc-task-card__footer">
                        <span>${escape(text(label.name, t('taskCategory', null, '任务类别')))}</span>
                        <span>${escape(t('operationType', { type: task.opType }, `组合类型 ${task.opType}`))}</span>
                        ${task.defaultEnable ? '' : `<span>${escape(t('conditionGated', null, '条件启用'))}</span>`}
                    </div>
                </article>`;
            }).join('');
        }

        function renderLevels() {
            const season = tables.seasons?.[selectedSeason] || {};
            const levelGroup = tables.levels?.[season.levelGroupId] || {};
            const levels = Object.values(levelGroup.levelInfos || {}).sort((a, b) => Number(a.level || 0) - Number(b.level || 0));
            const milestones = levels.filter(level => level.isMilestone || level.isRecurring);
            levelContent.innerHTML = milestones.length ? `<div class="misc-level-track">${milestones.map(level => `
                <article class="misc-level-node ${level.isRecurring ? 'is-recurring' : ''}">
                    <b>${escape(level.isRecurring ? t('recurringLevel', { level: level.level }, `${level.level}+ 循环`) : t('level', { level: level.level }, `等级 ${level.level}`))}</b>
                    <small>${Number(level.levelExp || 0).toLocaleString()} EXP</small>
                    <div class="misc-task-rewards">${renderRewardIds([level.freeRewardId, level.payRewardId])}</div>
                </article>`).join('')}</div>` : `<div class="misc-task-empty">${escape(t('noLevels', null, '没有等级配置'))}</div>`;
        }

        function renderSeason() {
            const categories = categoriesFor(selectedSeason);
            selectedCategory = categories.some(category => category.id === selectedCategory) ? selectedCategory : categories[0]?.id || '';
            renderStatus();
            renderTabs();
            renderTimeline();
            renderTasks();
            renderLevels();
        }

        try {
            const names = ['BattlePassSeasonTable', 'BattlePassTaskLabelTable', 'BattlePassTaskLabelMapTable', 'BattlePassTaskSubLabelMapTable', 'BattlePassTaskGroupTable', 'BattlePassTaskTable', 'BattlePassConditionTable', 'BattlePassLevelTable', 'TimeRangeTable', 'RewardTable', 'ItemTable'];
            const values = await Promise.all(names.map(name => context.table(name)));
            if (context.signal.aborted) return;
            tables = Object.fromEntries(names.map((name, index) => [name, values[index] || {}]));
            tables = {
                seasons: tables.BattlePassSeasonTable, labels: tables.BattlePassTaskLabelTable,
                labelMap: tables.BattlePassTaskLabelMapTable, subLabelMap: tables.BattlePassTaskSubLabelMapTable,
                groups: tables.BattlePassTaskGroupTable, tasks: tables.BattlePassTaskTable,
                conditions: tables.BattlePassConditionTable, levels: tables.BattlePassLevelTable,
                timeRanges: tables.TimeRangeTable, rewards: tables.RewardTable, items: tables.ItemTable
            };
            const seasons = Object.values(tables.seasons).sort((a, b) => String(a.id).localeCompare(String(b.id)));
            if (!seasons.length) throw new Error(t('missingSeasonTable', null, '通行证赛季表为空'));
            const now = Date.now();
            const active = seasons.find(season => {
                const range = rangeFor(`time_${season.id}`);
                return (!range.open || now >= range.open.getTime()) && (!range.close || now < range.close.getTime());
            });
            const deepLinkSeason = seasons.find(season => season.id === context.routeId);
            selectedSeason = (deepLinkSeason || active || seasons[seasons.length - 1]).id;
            seasonSelect.innerHTML = seasons.map((season, index) => `<option value="${index}">${escape(text(season.name, showHidden() ? season.id : t('seasonNumber', { number: index + 1 }, `赛季 ${index + 1}`)))}</option>`).join('');
            seasonSelect.value = String(Math.max(0, seasons.findIndex(season => season.id === selectedSeason)));
            searchInput.placeholder = showHidden() ? t('searchPlaceholder', null, '任务名称或 ID') : t('searchNamePlaceholder', null, '任务名称');
            renderSeason();
            context.on(seasonSelect, 'change', () => {
                selectedSeason = seasons[Number(seasonSelect.value)]?.id || selectedSeason;
                selectedCategory = '';
                context.navigate(selectedSeason);
                renderSeason();
            });
            context.on(searchInput, 'input', () => {
                query = searchInput.value;
                renderTasks();
            });
        } catch (error) {
            if (!context.signal.aborted) tasksRoot.innerHTML = `<div class="misc-task-error">${escape(t('loadFailed', { message: error.message }, `读取失败：${error.message}`))}</div>`;
        }

        return {};
    });
})();
