(function () {
        const t = window.akeI18n.scope('modules.activity');
        const commonT = window.akeI18n.scope('common');
        let allActivities = [];
        let rawAllActivities = [];
        let activeActivityId = null;
        let isInitialized = false;
        let searchTerm = '';
        let selectedTagIds = new Set();
        let selectedStatus = null;

        const IMAGE_BASE_PATH = '/public/images/';

        function getCurrentShowHidden() {
            return window.akeData?.getConfig().showHidden ?? false;
        }

        function parseText(text) {
            return window.parseText(text, IMAGE_BASE_PATH);
        }

        function getActivityStatus(openTime, closeTime) {
            const now = new Date();
            const open = openTime ? new Date(openTime) : null;
            const close = closeTime ? new Date(closeTime) : null;
            if (!close) return { text: t('statuses.permanent'), class: 'status-permanent' };
            if (close && now > close) return { text: t('statuses.closed'), class: 'status-closed' };
            if (open && now < open) return { text: t('statuses.upcoming'), class: 'status-upcoming' };
            return { text: t('statuses.active'), class: 'status-active' };
        }

        function formatTime(timeStr) {
            if (!timeStr) return t('dates.permanent');
            return timeStr.replace(/\s/g, ' ');
        }

        function getCountdownText(targetTimeStr, isEnd = false) {
            if (!targetTimeStr) return '';
            const target = new Date(targetTimeStr);
            const now = new Date();
            if (isNaN(target)) return '';
            const diff = target - now;
            if (diff <= 0) return isEnd ? t('countdown.ended') : t('countdown.started');
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (86400000)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (3600000)) / (1000 * 60));
            const parts = [];
            if (days > 0) parts.push(commonT('time.days', { count: days }));
            if (hours > 0 || days > 0) parts.push(commonT('time.hours', { count: hours }));
            parts.push(commonT('time.minutes', { count: minutes }));
            const duration = parts.join(t('countdown.unitSeparator'));
            return isEnd ? t('countdown.untilEnd', { duration }) : t('countdown.untilStart', { duration });
        }

        function filterActivities(activities) {
            return activities.filter(act => {
                if (searchTerm) {
                    const term = searchTerm.toLowerCase();
                    const nameMatch = act.name && act.name.toLowerCase().includes(term);
                    const idMatch = act.activityId && act.activityId.toLowerCase().includes(term);
                    if (!nameMatch && !idMatch) return false;
                }
                if (selectedTagIds.size > 0 && !(act.tags || []).some(tag => selectedTagIds.has(tag.tagId))) return false;
                if (selectedStatus) {
                    const status = getActivityStatus(act.openTime, act.closeTime);
                    if (status.class !== selectedStatus) return false;
                }
                return true;
            });
        }

        function generateTypeButtons() {
            const container = document.getElementById('activityTypeFilter');
            if (!container) return;
            const tags = new Map();
            allActivities.forEach(activity => (activity.tags || []).forEach(tag => {
                if (!tags.has(tag.tagId)) tags.set(tag.tagId, tag);
            }));
            container.innerHTML = '';
            tags.forEach(tag => {
                const btn = document.createElement('span');
                btn.className = `filter-btn ${selectedTagIds.has(tag.tagId) ? 'active' : ''}`;
                btn.dataset.tagId = tag.tagId;
                btn.textContent = tag.name || tag.tagId;
                btn.addEventListener('click', () => {
                    if (selectedTagIds.has(tag.tagId)) {
                        selectedTagIds.delete(tag.tagId);
                    } else {
                        selectedTagIds.add(tag.tagId);
                    }
                    btn.classList.toggle('active');
                    renderActivityList();
                    if (mobileOverlay?.style.display === 'flex') buildMobileList();
                });
                container.appendChild(btn);
            });
        }

        function generateStatusButtons() {
            const container = document.getElementById('activityStatusFilter');
            if (!container) return;
            const statuses = [
                { value: null, label: commonT('all') },
                { value: 'status-active', label: t('statuses.active') },
                { value: 'status-upcoming', label: t('statuses.upcoming') },
                { value: 'status-closed', label: t('statuses.closed') },
                { value: 'status-permanent', label: t('statuses.permanent') }
            ];
            container.innerHTML = '';
            statuses.forEach(s => {
                const btn = document.createElement('span');
                btn.className = `filter-btn ${selectedStatus === s.value ? 'active' : ''}`;
                btn.textContent = s.label;
                btn.addEventListener('click', () => {
                    selectedStatus = s.value;
                    renderActivityList();
                    document.querySelectorAll('#activityStatusFilter .filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    if (mobileOverlay?.style.display === 'flex') buildMobileList();
                });
                container.appendChild(btn);
            });
        }

        async function loadActivityManifest(showHidden) {
            try {
                const res = await (window.akeFetch || fetch)('/public/CH/activity/manifest.json');
                if (!res.ok) throw new Error('无法加载活动清单');
                const all = await res.json();
                rawAllActivities = all;
                let activities = showHidden ? all : all.filter(a => !a.hidden);
                activities.sort((a, b) => (a.priority || 999) - (b.priority || 999));
                return activities;
            } catch (err) {
                console.error('加载活动清单失败:', err);
                return [];
            }
        }

        const TIMELINE_DAY_MS = 24 * 60 * 60 * 1000;
        const TIMELINE_DAY_WIDTH = 28;
        const TIMELINE_PAST_DAYS = 14;
        const TIMELINE_FUTURE_DAYS = 90;

        function getTimelineTooltip() {
            let tooltip = document.getElementById('activityTimelineTooltip');
            if (tooltip) return tooltip;
            tooltip = document.createElement('div');
            tooltip.id = 'activityTimelineTooltip';
            tooltip.className = 'activity-timeline-tooltip';
            tooltip.hidden = true;
            document.body.appendChild(tooltip);
            return tooltip;
        }

        function positionTimelineTooltip(tooltip, x, y) {
            const gap = 12;
            const maxLeft = window.innerWidth - tooltip.offsetWidth - 8;
            const maxTop = window.innerHeight - tooltip.offsetHeight - 8;
            tooltip.style.left = `${Math.max(8, Math.min(x + gap, maxLeft))}px`;
            tooltip.style.top = `${Math.max(8, Math.min(y + gap, maxTop))}px`;
        }

        function showTimelineTooltip(item, x, y) {
            const tooltip = getTimelineTooltip();
            tooltip.textContent = `${item.name || item.activityId}\n${t('dates.range', { start: formatTime(item.openTime), end: formatTime(item.closeTime) })}`;
            tooltip.hidden = false;
            positionTimelineTooltip(tooltip, x, y);
        }

        function hideTimelineTooltip() {
            const tooltip = document.getElementById('activityTimelineTooltip');
            if (tooltip) tooltip.hidden = true;
        }

        function parseActivityTime(value) {
            if (!value) return null;
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        function startOfDay(value) {
            const date = new Date(value);
            date.setHours(0, 0, 0, 0);
            return date;
        }

        function timelineLocale() {
            const language = window.akeData?.getLanguage?.() || 'CH';
            return { CH: 'zh-CN', TC: 'zh-TW', JP: 'ja-JP', KR: 'ko-KR', EN: 'en-US' }[language] || 'en-US';
        }

        function renderActivityTimeline(items, container) {
            const now = new Date();
            const windowStart = startOfDay(now.getTime() - TIMELINE_PAST_DAYS * TIMELINE_DAY_MS);
            const windowEnd = startOfDay(now.getTime() + TIMELINE_FUTURE_DAYS * TIMELINE_DAY_MS);
            windowEnd.setDate(windowEnd.getDate() + 1);

            const timedItems = items.map(item => ({
                item,
                open: parseActivityTime(item.openTime),
                close: parseActivityTime(item.closeTime)
            })).filter(entry => entry.open && entry.close && entry.close > entry.open);
            let visibleItems = timedItems.filter(entry => entry.close >= windowStart && entry.open <= windowEnd);
            if (!visibleItems.length) {
                visibleItems = timedItems.sort((a, b) => b.close - a.close).slice(0, 12);
            }
            if (!visibleItems.length) return;

            visibleItems.sort((a, b) => a.open - b.open || a.close - b.close || String(a.item.name).localeCompare(String(b.item.name), timelineLocale()));
            const earliestOpen = Math.min(...visibleItems.map(entry => entry.open.getTime()));
            const latestClose = Math.max(...visibleItems.map(entry => entry.close.getTime()));
            const rangeStart = startOfDay(Math.max(earliestOpen, windowStart.getTime()));
            const rangeEnd = startOfDay(Math.min(latestClose, windowEnd.getTime()));
            rangeEnd.setDate(rangeEnd.getDate() + 1);
            const dayCount = Math.max(1, Math.ceil((rangeEnd - rangeStart) / TIMELINE_DAY_MS));

            const section = document.createElement('section');
            section.className = 'activity-timeline';
            section.setAttribute('aria-label', t('overview.title'));
            section.style.setProperty('--timeline-days', dayCount);
            section.style.setProperty('--timeline-day-width', `${TIMELINE_DAY_WIDTH}px`);

            const viewport = document.createElement('div');
            viewport.className = 'activity-timeline__viewport';
            const canvas = document.createElement('div');
            canvas.className = 'activity-timeline__canvas';

            const axis = document.createElement('div');
            axis.className = 'activity-timeline__axis';
            const locale = timelineLocale();
            for (let index = 0; index < dayCount; index += 1) {
                const date = new Date(rangeStart);
                date.setDate(date.getDate() + index);
                const tick = document.createElement('div');
                tick.className = 'activity-timeline__tick';
                if (date.getDate() === 1 || index === 0) tick.classList.add('is-month-start');
                tick.textContent = new Intl.DateTimeFormat(locale, {
                    month: date.getDate() === 1 || index === 0 ? 'numeric' : undefined,
                    day: '2-digit'
                }).format(date);
                axis.appendChild(tick);
            }
            canvas.appendChild(axis);

            visibleItems.forEach(({ item, open, close }) => {
                const row = document.createElement('div');
                row.className = 'activity-timeline__row';
                const clippedOpen = Math.max(open.getTime(), rangeStart.getTime());
                const clippedClose = Math.min(close.getTime(), rangeEnd.getTime());
                const offset = Math.max(0, Math.floor((clippedOpen - rangeStart) / TIMELINE_DAY_MS));
                const span = Math.max(1, Math.ceil((clippedClose - clippedOpen) / TIMELINE_DAY_MS));
                const bar = document.createElement('button');
                bar.type = 'button';
                const typeIndex = Math.abs(Number(item.rawType) || 0) % 5;
                const status = getActivityStatus(item.openTime, item.closeTime);
                bar.className = `activity-timeline__bar activity-timeline__bar--type-${typeIndex} ${status.class}`;
                bar.style.gridColumn = `${offset + 1} / span ${Math.min(span, dayCount - offset)}`;
                const title = document.createElement('span');
                title.className = 'activity-timeline__bar-title';
                title.textContent = item.name || item.activityId;
                bar.appendChild(title);
                if (item.tabImg) {
                    const image = document.createElement('img');
                    image.className = 'activity-timeline__bar-icon';
                    image.src = item.tabImg;
                    image.alt = '';
                    image.loading = 'lazy';
                    image.onerror = function () { this.remove(); };
                    bar.appendChild(image);
                }
                bar.setAttribute('aria-label', `${item.name || item.activityId}，${t('dates.range', { start: formatTime(item.openTime), end: formatTime(item.closeTime) })}`);
                bar.addEventListener('pointerenter', event => showTimelineTooltip(item, event.clientX, event.clientY));
                bar.addEventListener('pointermove', event => positionTimelineTooltip(getTimelineTooltip(), event.clientX, event.clientY));
                bar.addEventListener('pointerleave', hideTimelineTooltip);
                bar.addEventListener('focus', () => {
                    const rect = bar.getBoundingClientRect();
                    showTimelineTooltip(item, rect.left + Math.min(rect.width, 160), rect.bottom);
                });
                bar.addEventListener('blur', hideTimelineTooltip);
                bar.addEventListener('click', () => {
                    hideTimelineTooltip();
                    activeActivityId = item.activityId;
                    renderActivityList();
                });
                row.appendChild(bar);
                canvas.appendChild(row);
            });

            if (now >= rangeStart && now <= rangeEnd) {
                const todayOffset = (now - rangeStart) / TIMELINE_DAY_MS;
                const marker = document.createElement('div');
                marker.className = 'activity-timeline__today';
                marker.style.setProperty('--today-offset', todayOffset);
                canvas.appendChild(marker);
            }

            viewport.appendChild(canvas);
            section.appendChild(viewport);
            container.querySelector('.ake-overview__header')?.after(section);
            requestAnimationFrame(() => {
                const todayOffset = (now - rangeStart) / TIMELINE_DAY_MS;
                if (todayOffset >= 0) viewport.scrollLeft = Math.max(0, todayOffset * TIMELINE_DAY_WIDTH - viewport.clientWidth * 0.3);
            });
        }

        function renderActivityOverview(items, container) {
            const statusOrder = { 'status-active': 0, 'status-upcoming': 1, 'status-closed': 2, 'status-permanent': 3 };
            window.AKEModuleOverview.render(container, {
                title: t('overview.title'), description: t('overview.description'),
                group: item => { const status = getActivityStatus(item.openTime, item.closeTime); return { id: status.class, name: status.text, order: statusOrder[status.class] }; },
                onReset: () => { activeActivityId = null; },
                afterRender: () => renderActivityTimeline(items, container),
                onSelect: item => { activeActivityId = item.activityId; renderActivityList(); },
                sidebarSelector: item => `.activity-item[data-activity-id="${CSS.escape(item.activityId)}"]`,
                items: items.map(item => {
                    const status = getActivityStatus(item.openTime, item.closeTime);
                    const outlines = { 'status-active': 'status-active', 'status-upcoming': 'status-upcoming', 'status-closed': 'status-closed' };
                    return { ...item, id: item.activityId, image: item.tabImg, fallback: t('overview.fallback'), outline: outlines[status.class],
                        tags: [...(item.tags || []).map(tag => tag.name || tag.tagId), item.openTime ? t('dates.opensOn', { date: item.openTime.split(' ')[0] }) : t('dates.permanentContent')] };
                })
            });
        }

        function renderActivityList() {
            const container = document.getElementById('activityList');
            const detailContainer = document.getElementById('activityDetail');
            if (!container) return;

            const filtered = filterActivities(allActivities);
            container.innerHTML = '';
            if (filtered.length === 0) {
                container.innerHTML = `<div class="loader">${t('noMatches')}</div>`;
                if (detailContainer) detailContainer.innerHTML = `<div class="loader">${t('select')}</div>`;
                activeActivityId = null;
                return;
            }

            filtered.forEach((act, index) => {
                const item = document.createElement('div');
                item.className = `activity-item ${act.activityId === activeActivityId ? 'active' : (index === 0 && !activeActivityId && !window.AKEModuleOverview?.isActive('activity') ? 'active' : '')}`;
                window.AKEModuleOverview?.markVersionChange(item, act);
                item.dataset.activityId = act.activityId;
                item.dataset.contentFile = act.contentFile;

                if (act.tabImg) {
                    item.style.setProperty('--bg-image', `url(${act.tabImg})`);
                }

                const infoDiv = document.createElement('div');
                infoDiv.className = 'activity-info';
                const nameSpan = document.createElement('div');
                nameSpan.className = 'activity-name';
                nameSpan.textContent = act.name;
                const idSpan = document.createElement('div');
                idSpan.className = 'activity-id';
                idSpan.textContent = act.activityId;
                infoDiv.appendChild(nameSpan);
                infoDiv.appendChild(idSpan);

                const status = getActivityStatus(act.openTime, act.closeTime);
                const statusSpan = document.createElement('span');
                statusSpan.className = `activity-status ${status.class}`;
                statusSpan.textContent = status.text;

                item.appendChild(infoDiv);
                item.appendChild(statusSpan);

                item.addEventListener('click', () => {
                    document.querySelectorAll('.activity-item').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    activeActivityId = act.activityId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('activity', act.activityId);
                    loadActivityDetail(act, detailContainer);
                });

                container.appendChild(item);
            });

            if (window.__deepLinkId) {
                const deepItem = filtered.find(c => c.activityId === window.__deepLinkId);
                if (deepItem) {
                    activeActivityId = deepItem.activityId;
                } else {
                    const existsInRaw = rawAllActivities.some(c => c.activityId === window.__deepLinkId);
                    if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                        window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                    }
                }
                window.__deepLinkId = null;
            }
            const activeExists = filtered.some(a => a.activityId === activeActivityId);
            if (!activeExists && filtered.length > 0) {
                if (window.AKEModuleOverview?.isActive('activity')) {
                    activeActivityId = null;
                    renderActivityOverview(filtered, detailContainer);
                    return;
                }
                activeActivityId = filtered[0].activityId;
                const firstItem = container.querySelector('.activity-item');
                if (firstItem) firstItem.classList.add('active');
                if (window.__akeRouter) window.__akeRouter.updateUrl('activity', activeActivityId);
                loadActivityDetail(filtered[0], detailContainer);
            } else if (activeExists) {
                const activeAct = filtered.find(a => a.activityId === activeActivityId);
                if (activeAct) {
                    const activeItem = container.querySelector(`.activity-item[data-activity-id="${activeActivityId}"]`);
                    if (activeItem) activeItem.classList.add('active');
                    if (window.__akeRouter) window.__akeRouter.updateUrl('activity', activeActivityId);
                    loadActivityDetail(activeAct, detailContainer);
                }
            }
        }

        async function loadActivityDetail(activity, container) {
            container.innerHTML = `<div class="loader">${t('loading')}</div>`;
            try {
                const data = await (window.akeFetch || fetch)(activity.contentFile).then(r => r.json());
                container.innerHTML = renderDetail(data, activity);
                window.AKEModuleOverview?.renderVersionDiff(container, data, data.__versionDiff?.baseline ? renderDetail(data.__versionDiff.baseline, activity) : '');
            } catch (err) {
                container.innerHTML = `<div class="error-message">${t('loadFailed', { message: err.message })}</div>`;
            }
        }

        function renderRewards(rewardList) {
            if (!rewardList || rewardList.length === 0) return `<p>${t('rewards.none')}</p>`;
            let html = '<div class="reward-grid">';
            rewardList.forEach(reward => {
                const iconSrc = reward.picpath || '';
                html += `
                    <div class="reward-item">
                        <img class="reward-icon" src="${iconSrc}" onerror="this.onerror=null; this.src='';">
                        <span class="reward-name">${reward.name}</span>
                        <span class="reward-count">${t('rewards.count', { count: reward.count })}</span>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        }

        function renderStages(stageList) {
            if (!stageList || Object.keys(stageList).length === 0) return '';
            let html = `<div class="stage-section"><h3>${t('sections.stages')}</h3><div class="stage-list">`;
            const stages = Object.values(stageList);
            stages.sort((a, b) => (a.sortId || 0) - (b.sortId || 0));
            stages.forEach(function (stage) {
                let stageTimeHtml = '';
                if (stage.opentime && stage.opentime.trim() !== '') {
                    const startTimeStr = formatTime(stage.opentime);
                    const countdown = getCountdownText(stage.opentime, false);
                    const stageTime = countdown
                        ? t('dates.stageOpenTimeWithCountdown', { time: startTimeStr, countdown })
                        : t('dates.stageOpenTime', { time: startTimeStr });
                    stageTimeHtml = `<div class="stage-time">${stageTime}</div>`;
                }
                html += '<div class="stage-card">' +
                    '<div class="stage-name">' + stage.name + '</div>' +
                    '<div class="stage-desc">' + parseText(stage.desc || '') + '</div>' +
                    stageTimeHtml +
                    '<div class="stage-rewards">' +
                    `<div class="stage-rewards-title">${t('rewards.stage')}</div>` +
                    renderRewards(stage.rewarddetail || []) +
                    '</div>' +
                    '</div>';
            });
            html += '</div></div>';
            return html;
        }

        function renderDetail(data, activity) {
            const status = getActivityStatus(activity.openTime, activity.closeTime);
            const openTimeStr = formatTime(activity.openTime);
            const closeTimeStr = formatTime(activity.closeTime);

            let countdownHtml = '';
            if (status.class === 'status-upcoming' && activity.openTime) {
                countdownHtml = `<div class="detail-countdown">${getCountdownText(activity.openTime, false)}</div>`;
            } else if (status.class === 'status-active' && activity.closeTime) {
                countdownHtml = `<div class="detail-countdown">${getCountdownText(activity.closeTime, true)}</div>`;
            }

            let conditionsHtml = '';
            if (data.conditions && data.conditions.length) {
                conditionsHtml = `<div class="detail-section"><h3>${t('sections.conditions')}</h3><ul class="conditions-list">${data.conditions.map(c => `<li>${parseText(c)}</li>`).join('')}</ul></div>`;
            }

            let rewardsHtml = '';
            if (data.rewarddetail && data.rewarddetail.length) {
                rewardsHtml = `<div class="detail-section"><h3>${t('rewards.activity')}</h3>${renderRewards(data.rewarddetail)}</div>`;
            }

            let stagesHtml = renderStages(data.stageList);
            const tagsHtml = (data.tags || []).length
                ? `<div class="activity-tags">${data.tags.map(tag => tag.name ? `<span class="activity-tag">${tag.name}</span>` : '').join('')}</div>`
                : '';

            return `
                <div class="activity-detail-container">
                    <div class="detail-header">
                        <div class="detail-info">
                            <div class="detail-title-row">
                                <span class="detail-name">${data.name || activity.name}</span>
                                <span class="detail-status ${status.class}">${status.text}</span>
                            </div>
                            <div class="detail-time">
                                <span>${t('dates.range', { start: openTimeStr, end: closeTimeStr })}</span>
                            </div>
                            ${tagsHtml}
                            ${countdownHtml}
                            <div class="detail-desc">${parseText(data.desc || '')}</div>
                        </div>
                    </div>
                    ${conditionsHtml}
                    ${rewardsHtml}
                    ${stagesHtml}
                </div>
            `;
        }

        async function refreshModule() {
            const list = document.getElementById('activityList');
            const detail = document.getElementById('activityDetail');
            if (!list || !detail) return;
            const showHidden = getCurrentShowHidden();
            const acts = await loadActivityManifest(showHidden);
            allActivities = acts;
            generateTypeButtons();
            generateStatusButtons();
            renderActivityList();
            if (mobileOverlay?.style.display === 'flex') buildMobileList();
        }

        // 移动端列表
        const mobileBtn = document.getElementById('activityMobileListBtn');
        const mobileOverlay = document.getElementById('activityMobileListOverlay');
        const mobileContent = document.getElementById('activityMobileListContent');

        function buildMobileList() {
            if (!mobileContent) return;
            const filtered = filterActivities(allActivities);
            mobileContent.innerHTML = '';
            filtered.forEach(act => {
                const item = document.createElement('div');
                item.className = 'mobile-list-item';
                window.AKEModuleOverview?.markVersionChange(item, act);
                if (act.activityId === activeActivityId) item.classList.add('active');
                item.innerHTML = `
                    <div class="item-name">${act.name}</div>
                    <div class="item-id">${act.activityId}</div>
                `;
                item.addEventListener('click', () => {
                    activeActivityId = act.activityId;
                    if (window.__akeRouter) window.__akeRouter.updateUrl('activity', act.activityId);
                    loadActivityDetail(act, document.getElementById('activityDetail'));
                    closeMobileList();
                    document.querySelectorAll('.activity-item').forEach(el => el.classList.remove('active'));
                    const activeItem = document.querySelector(`.activity-item[data-activity-id="${act.activityId}"]`);
                    if (activeItem) activeItem.classList.add('active');
                });
                mobileContent.appendChild(item);
            });
        }

        function openMobileList() {
            buildMobileList();
            if (mobileOverlay) mobileOverlay.style.display = 'flex';
        }

        function closeMobileList() {
            if (mobileOverlay) mobileOverlay.style.display = 'none';
        }

        async function initModule() {
            if (isInitialized) return;
            isInitialized = true;
            if (window.configLoaded) await window.configLoaded;

            window.addEventListener('globalConfigChanged', (e) => {
                searchTerm = '';
                const searchInput = document.getElementById('activitySearchInput');
                if (searchInput) searchInput.value = '';
                selectedTagIds.clear();
                selectedStatus = null;
                refreshModule();
            });

            document.getElementById('activitySearchInput')?.addEventListener('input', (e) => {
                searchTerm = e.target.value;
                renderActivityList();
                if (mobileOverlay?.style.display === 'flex') buildMobileList();
            });

            if (mobileBtn) mobileBtn.addEventListener('click', openMobileList);
            if (mobileOverlay) mobileOverlay.addEventListener('click', (e) => {
                if (e.target === mobileOverlay) closeMobileList();
            });

            await refreshModule();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initModule);
        } else {
            initModule();
        }
    })();
