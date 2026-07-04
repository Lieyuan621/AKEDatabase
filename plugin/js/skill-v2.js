(function () {
    let manifestList = [];
    let rawAllSkills = [];
    let activeSkillId = null;
    let searchTerm = '';
    let isInitialized = false;
    let currentSkillData = null;
    let timelineHideNodesMode = false;

    const KEY_LABEL_MAP = {
        skillId: '技能ID',
        level: '等级',
        skillName: '技能名',
        castType: '施放类型',
        skillSpecification: '技能规格',
        durationFrame: '持续帧',
        exclusiveFrame: '独占帧',
        timelineActions: '时间轴动作组',
        passiveEventActions: '被动事件动作组',
        actionGroupData: '动作组数据',
        conditionAction: '条件动作',
        succeedActions: '成功分支',
        failActions: '失败分支',
        actionData: '动作列表',
        isEnable: '启用',
        priorityLevel: '优先级',
        priorityOffset: '优先级偏移',
        serverActionIndex: '服务端动作索引',
        duration: '持续时间',
        startTime: '开始时间',
        playbackSpeed: '播放速度',
        blendDuration: '混合时长',
        blendOut: '混出时长',
        exitToIdle: '退出到待机',
        contextKey: '上下文键',
        targetSettings: '目标设置',
        selectorData: '选择器',
        finderData: '查找器',
        validatorData: '校验器',
        postProcessorData: '后处理器',
        rotateType: '旋转类型',
        compareType: '比较方式',
        checkType: '检查类型',
        targetSource: '目标来源',
        selectorOwner: '选择器归属',
        centerType: '中心类型',
        _startFrame: '起始帧',
        _endFrame: '结束帧',
        targetGroupKey: '目标组键',
        checkTarget: '检查目标',
        compareType: '比较方式',
        minNum: '最小数量',
        abilityEvent: '触发事件',
        animName: '动画名',
        cooldownTime: '冷却时间',
        castDistance: '施放距离',
        costData: '消耗数据',
        costType: '消耗类型',
        costValue: '消耗值',
        atbValueThreshold: '阈值',
        canMove: '可移动施放',
        canCastInAir: '可空中施放',
        passiveSkillType: '被动技能类型'
    };

    const VALUE_LABEL_MAP = {
        Active: '主动',
        Passive: '被动',
        CharacterNormalSkill: '角色普通技能',
        Default: '默认',
        UltimateSp: '终极能量',
        RotateToTarget: '朝向目标',
        RotateToMoveDirection: '朝向移动方向',
        GE: '大于等于',
        LE: '小于等于',
        EQ: '等于',
        HasAny: '满足任一标签',
        Context: '上下文',
        Source: '施法者',
        Owner: '拥有者',
        Target: '目标',
        ActionSource: '动作源',
        ContextTarget: '上下文目标'
    };

    function getCurrentShowHidden() {
        return window.akeData?.getConfig().showHidden ?? false;
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeJson(value) {
        try {
            return JSON.stringify(value, null, 2);
        } catch (err) {
            return String(value);
        }
    }

    function formatType(typeText) {
        if (!typeText) return 'UnknownAction';
        const typePart = String(typeText).split(',')[0] || String(typeText);
        const plusParts = typePart.split('+').map(part => part.split('.').pop()).filter(Boolean);
        if (plusParts.length <= 1) return plusParts[0] || typePart;

        const root = plusParts[0];
        const nested = plusParts.slice(1).filter(part => part !== 'Data' && part !== (root + 'Data'));
        return nested.length ? (root + '.' + nested.join('.')) : root;
    }

    function normalizeManifest(list) {
        const showHidden = getCurrentShowHidden();
        const visible = showHidden ? list : list.filter(item => !item.hidden);
        visible.sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));
        return visible;
    }

    function filterList(list) {
        if (!searchTerm) return list;
        const term = searchTerm.toLowerCase();
        return list.filter(item => {
            const id = String(item.id || '').toLowerCase();
            const name = String(item.name || '').toLowerCase();
            return id.includes(term) || name.includes(term);
        });
    }

    async function fetchManifest() {
        const res = await (window.akeFetch || fetch)('/public/Json/SkillData/manifest.json');
        if (!res.ok) throw new Error('无法加载 SkillData 清单');
        const json = await res.json();
        rawAllSkills = json || [];
        return normalizeManifest(rawAllSkills);
    }

    async function fetchSkillData(contentFile) {
        const res = await (window.akeFetch || fetch)(contentFile);
        if (!res.ok) throw new Error('无法加载技能详情: ' + contentFile);
        return res.json();
    }

    function renderList() {
        const listEl = document.getElementById('skillv2List');
        const metaEl = document.getElementById('skillv2ListMeta');
        const mainEl = document.getElementById('skillv2Main');
        if (!listEl || !metaEl || !mainEl) return;

        const filtered = filterList(manifestList);
        metaEl.textContent = '共 ' + filtered.length + ' 项';
        listEl.innerHTML = '';

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="loader">没有匹配项</div>';
            mainEl.innerHTML = '<div class="loader">请选择技能</div>';
            activeSkillId = null;
            return;
        }

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'skillv2-item' + (item.id === activeSkillId ? ' active' : '');
            div.dataset.id = item.id;
            div.innerHTML = `
                <div class="skillv2-item-title">${escapeHtml(item.name || item.id)}</div>
                <div class="skillv2-item-sub">${escapeHtml(item.id)}</div>
            `;
            div.addEventListener('click', () => {
                activeSkillId = item.id;
                if (window.__akeRouter) window.__akeRouter.updateUrl('skill_v2', item.id);
                highlightActive();
                loadSkillDetail(item);
            });
            listEl.appendChild(div);
        });

        if (window.__deepLinkId) {
            const deepItem = filtered.find(c => c.id === window.__deepLinkId);
            if (deepItem) {
                activeSkillId = deepItem.id;
            } else {
                const existsInRaw = rawAllSkills.some(c => c.id === window.__deepLinkId);
                if (window.__akeRouter && window.__akeRouter.onDeepLinkNotFound) {
                    window.__akeRouter.onDeepLinkNotFound(window.__deepLinkId, existsInRaw);
                }
            }
            window.__deepLinkId = null;
        }

        if (!filtered.some(s => s.id === activeSkillId)) {
            activeSkillId = filtered[0].id;
            if (window.__akeRouter) window.__akeRouter.updateUrl('skill_v2', activeSkillId);
            highlightActive();
            loadSkillDetail(filtered[0]);
        } else {
            if (window.__akeRouter) window.__akeRouter.updateUrl('skill_v2', activeSkillId);
        }

        buildMobileList();
    }

    function highlightActive() {
        document.querySelectorAll('.skillv2-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === activeSkillId);
        });
    }

    function summarizePrimitive(value) {
        if (value === null) return '<null>';
        if (value === undefined) return '<undefined>';
        const t = typeof value;
        if (t === 'string') return value.length > 120 ? value.slice(0, 120) + '...' : value;
        if (t === 'number' || t === 'boolean') return String(value);
        if (Array.isArray(value)) return '[Array(' + value.length + ')]';
        if (t === 'object') return '{Object}';
        return String(value);
    }

    function translateKey(key) {
        const cn = KEY_LABEL_MAP[key];
        return cn ? (cn + ' (' + key + ')') : key;
    }

    function translateValue(value) {
        if (typeof value === 'boolean') {
            return value ? '是 (true)' : '否 (false)';
        }
        if (typeof value !== 'string') return summarizePrimitive(value);
        const cn = VALUE_LABEL_MAP[value];
        if (!cn) return summarizePrimitive(value);
        return cn + ' (' + value + ')';
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function hasOwn(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj || {}, key);
    }

    function isBlackboardValueRef(value) {
        return isPlainObject(value) && hasOwn(value, 'useBlackboardKey') && hasOwn(value, 'value') && hasOwn(value, 'blackboardKey');
    }

    function formatNumber(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return summarizePrimitive(value);
        return String(Math.round(num * 10000) / 10000);
    }

    function formatBlackboardEntry(entry) {
        if (!entry || typeof entry !== 'object') return '';
        const valueText = entry.valueStr ? entry.valueStr : formatNumber(entry.valueDouble ?? entry.value ?? 0);
        return valueText + (entry.isDynamic ? ' / dynamic' : '');
    }

    function getBlackboardMap(data) {
        const map = new Map();
        (data?.blackboard || []).forEach(item => {
            if (item && item.key) map.set(String(item.key), item);
        });
        return map;
    }

    function formatBlackboardValueRef(value, blackboardMap) {
        if (!isBlackboardValueRef(value)) return null;
        if (value.useBlackboardKey && value.blackboardKey) {
            const entry = blackboardMap?.get(String(value.blackboardKey));
            const resolved = entry ? ' = ' + formatBlackboardEntry(entry) : '';
            return 'BB(' + value.blackboardKey + ')' + resolved;
        }
        return formatNumber(value.value);
    }

    function formatVectorValue(value, blackboardMap) {
        if (!isPlainObject(value)) return null;
        const keys = ['x', 'y', 'z'];
        if (!keys.every(k => hasOwn(value, k))) return null;
        return keys.map(k => k + '=' + (formatBlackboardValueRef(value[k], blackboardMap) || summarizePrimitive(value[k]))).join(', ');
    }

    function getObjectTypeName(value) {
        return value?.$type ? formatType(value.$type) : '';
    }

    function summarizeShape(shape, blackboardMap) {
        if (!isPlainObject(shape)) return '';
        const parts = [];
        if (shape.shapeType) parts.push(shape.shapeType);
        if (shape.size) parts.push('size(' + (formatVectorValue(shape.size, blackboardMap) || summarizePrimitive(shape.size)) + ')');
        if (shape.radius) parts.push('radius=' + (formatBlackboardValueRef(shape.radius, blackboardMap) || summarizePrimitive(shape.radius)));
        if (shape.height) parts.push('height=' + (formatBlackboardValueRef(shape.height, blackboardMap) || summarizePrimitive(shape.height)));
        if (shape.centerOffset) parts.push('offset(' + (formatVectorValue(shape.centerOffset, blackboardMap) || summarizePrimitive(shape.centerOffset)) + ')');
        if (shape.positionRef) parts.push('pos=' + shape.positionRef);
        if (shape.directionRef) parts.push('dir=' + shape.directionRef);
        return parts.filter(Boolean).join(' | ');
    }

    function summarizeSelector(selectorData, blackboardMap) {
        if (!isPlainObject(selectorData)) return '';
        const finder = selectorData.finderData || {};
        const parts = [];
        const finderType = getObjectTypeName(finder);
        if (finderType) parts.push('finder: ' + finderType);
        if (finder.factionTarget) parts.push('faction=' + finder.factionTarget);
        if (Array.isArray(finder.shapeList) && finder.shapeList.length) {
            const shapes = finder.shapeList.slice(0, 2).map(shape => summarizeShape(shape, blackboardMap)).filter(Boolean);
            parts.push('shape: ' + shapes.join(' / ') + (finder.shapeList.length > 2 ? ' ...' : ''));
        }
        if (Array.isArray(selectorData.validatorData) && selectorData.validatorData.length) {
            parts.push('validators: ' + selectorData.validatorData.map(getObjectTypeName).filter(Boolean).join(', '));
        }
        if (Array.isArray(selectorData.postProcessorData) && selectorData.postProcessorData.length) {
            parts.push('post: ' + selectorData.postProcessorData.map(getObjectTypeName).filter(Boolean).join(', '));
        }
        return parts.join(' | ');
    }

    function summarizeTargetSettings(target, blackboardMap) {
        if (!isPlainObject(target)) return '';
        const parts = [];
        ['targetSource', 'target', 'targetGroupKey', 'centerType', 'selectorOwner', 'selectorDirection'].forEach(key => {
            if (target[key]) parts.push(key + '=' + target[key]);
        });
        const selector = summarizeSelector(target.selectorData, blackboardMap);
        if (selector) parts.push(selector);
        return parts.join(' | ');
    }

    function summarizeStructuredValue(value, key, blackboardMap) {
        if (!value || typeof value !== 'object') return null;
        if (isBlackboardValueRef(value)) return formatBlackboardValueRef(value, blackboardMap);
        const vector = formatVectorValue(value, blackboardMap);
        if (vector) return vector;
        const lowerKey = String(key || '').toLowerCase();
        if (lowerKey.includes('selector') && value.finderData) return summarizeSelector(value, blackboardMap);
        if (lowerKey.includes('target') || lowerKey === 'source' || lowerKey === 'destination' || lowerKey === 'bornat' || lowerKey === 'moveto' || lowerKey === 'teleportto') {
            const target = summarizeTargetSettings(value, blackboardMap);
            if (target) return target;
        }
        if (value.shapeType) return summarizeShape(value, blackboardMap);
        return null;
    }

    function findFirstDeep(value, keys) {
        const wanted = new Set(keys || []);
        const seen = new Set();

        const walk = (node) => {
            if (!node || typeof node !== 'object' || seen.has(node)) return undefined;
            seen.add(node);
            if (!Array.isArray(node)) {
                for (const key of Object.keys(node)) {
                    const candidate = node[key];
                    const isEmptyArray = Array.isArray(candidate) && candidate.length === 0;
                    if (wanted.has(key) && candidate !== '' && candidate !== null && candidate !== undefined && !isEmptyArray) return candidate;
                }
            }
            const children = Array.isArray(node) ? node : Object.keys(node).map(k => node[k]);
            for (const child of children) {
                const found = walk(child);
                if (found !== undefined) return found;
            }
            return undefined;
        };

        return walk(value);
    }

    function summarizeAction(action) {
        const shortType = formatType(action?.$type || 'UnknownAction');
        if (action?.animName) return shortType + ': ' + action.animName;
        if (action?.abilityEvent) return shortType + ': ' + action.abilityEvent;
        if (action?.targetGroupKey) return shortType + ': target=' + action.targetGroupKey;
        if (action?.costType) return shortType + ': cost=' + action.costType;
        const effect = findFirstDeep(action, ['effectName', 'effectKey', 'effectId', 'effectPath']);
        if (effect) return shortType + ': effect=' + summarizePrimitive(effect);
        const sound = findFirstDeep(action, ['soundEvent', 'soundName', 'eventName', 'wwiseEvent']);
        if (sound) return shortType + ': sound=' + summarizePrimitive(sound);
        const buff = findFirstDeep(action, ['buffId', 'buffID', 'buffIds', 'buffIdList']);
        if (buff) return shortType + ': buff=' + summarizePrimitive(buff);
        const skill = findFirstDeep(action, ['skillId', 'castSkillId', 'abilityEntityId', 'entityId', 'projectileId']);
        if (skill) return shortType + ': ' + summarizePrimitive(skill);
        const atkScale = findFirstDeep(action, ['atkScale', 'damageScale', 'damageRate']);
        if (atkScale) return shortType + ': scale=' + summarizePrimitive(atkScale);
        return shortType;
    }

    function getIfElseBranchMeta(action) {
        if (!action || typeof action !== 'object') return null;
        const isIfElse = !!(action.conditionAction || action.succeedActions || action.failActions) || formatType(action.$type || '').toLowerCase().includes('ifelseaction');
        if (!isIfElse) return null;

        const cond = action.conditionAction?.actionData || [];
        const succ = action.succeedActions?.actionData || [];
        const fail = action.failActions?.actionData || [];

        const firstType = (arr) => {
            if (!Array.isArray(arr) || !arr.length) return '无';
            return formatType(arr[0]?.$type || 'UnknownAction');
        };

        return {
            condCount: cond.length,
            succCount: succ.length,
            failCount: fail.length,
            condFirst: firstType(cond),
            succFirst: firstType(succ),
            failFirst: firstType(fail)
        };
    }

    const ACTION_CATEGORY_DEFS = [
        { key: 'anim', label: '动画', patterns: ['animation', 'animator', 'hurtanim', 'weaponvisible', 'weaponanimation', 'animeventreceiver', 'playperfectdodgeanim'] },
        { key: 'damage', label: '伤害/受击', patterns: ['damage', 'blowoff', 'pushback', 'pull', 'knockdown', 'launchupward', 'airborne', 'crushaction', 'fractureaction', 'igniteaction', 'recoverpoise'] },
        { key: 'buff', label: 'Buff/状态', patterns: ['buff', 'superarmor', 'tagaction', 'addtag', 'auraaction', 'weakness', 'inherit', 'dynamicccs', 'finishangry', 'temporarilyunlock', 'temporaryunlock'] },
        { key: 'target', label: '选目标/判定', patterns: ['findtarget', 'selector', 'finder', 'validator', 'targetpostprocessor', 'targetpriorityfilter', 'mergetarget', 'savetargetdistance', 'picktarget', 'distance', 'shapefinder', 'interactiveshapefinder', 'hittableobjectvalidator'] },
        { key: 'move', label: '位移/旋转', patterns: ['move', 'jump', 'teleport', 'rootmotion', 'rotate', 'snaptotarget', 'lookataction', 'receivemoveinput', 'moveto', 'movetolocation', 'movetotarget', 'movetoslot', 'movetodirection'] },
        { key: 'camera', label: '镜头/时间', patterns: ['camera', 'timedilation', 'hitstop', 'ultimatetime', 'lockcamera', 'overridecamera', 'addcameracontrolstate', 'setignoreglobaltimescale'] },
        { key: 'av', label: '音效/特效', patterns: ['playsound', 'voice', 'effect', 'raycasteffect', 'showhideactor', 'facbuildingplayanimation'] },
        { key: 'condition', label: '条件/分支', patterns: ['ifelse', 'condition', 'check', 'compare', 'randomaction', 'switchaction', 'doonce', 'togglable', 'foreachaction', 'eventlistener', 'notnextcheck', 'probablity'] },
        { key: 'spawn', label: '投射物/召唤', patterns: ['projectile', 'spawn', 'castskill', 'commandtocharacters', 'abilityentity', 'createadditionalbattleshape'] },
        { key: 'resource', label: '资源/数值', patterns: ['blackboard', 'calc', 'calculation', 'obtaincost', 'setskillcd', 'atkscale', 'storeattribute', 'modifydynamicblackboard', 'multiplyattribute', 'instantmodifyattribute', 'savevalue'] },
        { key: 'misc', label: '其他', patterns: [] }
    ];

    function normalizeTypeForCategory(typeName) {
        return String(typeName || '')
            .replace(/\+|\.|,/g, ' ')
            .toLowerCase();
    }

    function getActionCategories(typeName) {
        const normalized = normalizeTypeForCategory(typeName);
        const matched = [];

        ACTION_CATEGORY_DEFS.forEach(def => {
            if (def.key === 'misc') return;
            if (def.patterns.some(p => normalized.includes(p))) {
                matched.push({ key: def.key, label: def.label });
            }
        });

        if (!matched.length) {
            const misc = ACTION_CATEGORY_DEFS.find(def => def.key === 'misc');
            return [{ key: misc.key, label: misc.label }];
        }

        return matched;
    }

    function getActionCategory(typeName) {
        return getActionCategories(typeName)[0];
    }

    function formatFrameDuration(frameCount) {
        const safe = Math.max(0, Math.floor(Number(frameCount) || 0));
        const seconds = Math.floor(safe / 30);
        const frames = safe % 30;
        return seconds + 's' + frames + 'f';
    }

    function collectActionTypesDeep(value, typeSet) {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(item => collectActionTypesDeep(item, typeSet));
            return;
        }
        if (typeof value !== 'object') return;

        if (value.$type) {
            typeSet.add(formatType(value.$type));
        }

        Object.keys(value).forEach(key => {
            const child = value[key];
            if (child && typeof child === 'object') {
                collectActionTypesDeep(child, typeSet);
            }
        });
    }

    function extractTimelineActionTypes(timeline) {
        const groupTypeList = [];
        const allTypeSet = new Set();

        (timeline || []).forEach(group => {
            const set = new Set();
            const actions = group?._sequenceActionData?.actionData || [];
            collectActionTypesDeep(actions, set);
            const types = Array.from(set).sort();
            groupTypeList.push(types);
            types.forEach(t => allTypeSet.add(t));
        });

        return {
            groupTypeList,
            allTypes: Array.from(allTypeSet).sort()
        };
    }

    function extractAllActionTypes(value) {
        const typeSet = new Set();
        collectActionTypesDeep(value, typeSet);
        return Array.from(typeSet).sort();
    }

    function analyzeTimeline(timeline) {
        const groups = Array.isArray(timeline) ? timeline : [];
        let negativeRanges = 0;
        let emptyGroups = 0;
        let unsortedPairs = 0;
        let lastStart = Number.NEGATIVE_INFINITY;

        groups.forEach(group => {
            const start = Number(group?._startFrame ?? 0);
            const end = Number(group?._endFrame ?? start);
            const actions = group?._sequenceActionData?.actionData || [];
            if (end < start) negativeRanges += 1;
            if (!actions.length) emptyGroups += 1;
            if (start < lastStart) unsortedPairs += 1;
            lastStart = start;
        });

        return { negativeRanges, emptyGroups, unsortedPairs };
    }

    function renderKeyValueRows(obj, omitKeys, blackboardMap) {
        const rows = [];
        const omitted = new Set(omitKeys || []);

        const renderValueCell = (value, key) => {
            const translated = translateValue(value);
            const structuredSummary = summarizeStructuredValue(value, key, blackboardMap);
            const isComplex = value && typeof value === 'object';
            if (!isComplex) return escapeHtml(translated);

            const fullText = safeJson(value);
            return `
                <details class="skillv2-value-details">
                    <summary class="skillv2-value-summary" title="${escapeHtml(fullText)}">${escapeHtml(structuredSummary || translated)}</summary>
                    <pre class="skillv2-value-expanded">${escapeHtml(fullText)}</pre>
                </details>
            `;
        };

        Object.keys(obj || {}).forEach(key => {
            if (omitted.has(key)) return;
            const value = obj[key];
            rows.push(`
                <tr>
                    <td>${escapeHtml(translateKey(key))}</td>
                    <td>${renderValueCell(value, key)}</td>
                </tr>
            `);
        });
        if (!rows.length) {
            return '<div class="skillv2-empty">无可展示参数</div>';
        }
        return `
            <table class="skillv2-table">
                <thead><tr><th>键</th><th>值摘要</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        `;
    }

    function renderActionSequence(actions, depth, pathLabel, blackboardMap) {
        if (!Array.isArray(actions) || actions.length === 0) {
            return '<div class="skillv2-empty">无动作节点</div>';
        }

        return actions.map((action, index) => {
            const typeText = action?.$type || 'UnknownAction';
            const shortType = formatType(typeText);
            const category = getActionCategory(shortType);
            const nodePath = pathLabel + '.' + (index + 1);

            let branchHtml = '';
            const hasIfElse = !!(action && (action.conditionAction || action.succeedActions || action.failActions));
            if (hasIfElse) {
                branchHtml = `
                    <div class="skillv2-branch-wrap">
                        <div class="skillv2-branch-block">
                            <div class="skillv2-branch-title">条件节点 conditionAction</div>
                            ${renderActionSequence(action.conditionAction?.actionData || [], depth + 1, nodePath + '.if', blackboardMap)}
                        </div>
                        <div class="skillv2-branch-block">
                            <div class="skillv2-branch-title">成立分支 succeedActions</div>
                            ${renderActionSequence(action.succeedActions?.actionData || [], depth + 1, nodePath + '.then', blackboardMap)}
                        </div>
                        <div class="skillv2-branch-block">
                            <div class="skillv2-branch-title">失败分支 failActions</div>
                            ${renderActionSequence(action.failActions?.actionData || [], depth + 1, nodePath + '.else', blackboardMap)}
                        </div>
                    </div>
                `;
            }

            return `
                <div class="skillv2-action-node cat-${category.key}" style="--depth:${depth};">
                    <div class="skillv2-action-head">
                        <span class="skillv2-action-index">节点 ${escapeHtml(nodePath)}</span>
                        <span class="skillv2-action-type">${escapeHtml(shortType)}</span>
                        <span class="skillv2-action-cat">${escapeHtml(category.label)}</span>
                        <span class="skillv2-action-full">${escapeHtml(typeText)}</span>
                    </div>
                    <div class="skillv2-action-body">
                        <div class="skillv2-subtitle">参数摘要</div>
                        ${renderKeyValueRows(action || {}, ['$type', 'conditionAction', 'succeedActions', 'failActions'], blackboardMap)}
                        ${branchHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    function isIfElseAction(action) {
        if (!action || typeof action !== 'object') return false;
        if (action.conditionAction || action.succeedActions || action.failActions) return true;
        return formatType(action.$type || '').toLowerCase().includes('ifelseaction');
    }

    function renderFlowLeafNode(action, indexLabel) {
        const typeText = formatType(action?.$type || 'UnknownAction');
        const category = getActionCategory(typeText);
        return `<div class="skillv2-flow-step"><div class="skillv2-flow-node cat-${category.key}" title="${escapeHtml(category.label)} | ${escapeHtml(typeText)}">
            <div class="skillv2-flow-main">
                <span class="skillv2-flow-index">${escapeHtml(String(indexLabel || ''))}</span>
                <span>${escapeHtml(summarizeAction(action))}</span>
                <span class="skillv2-flow-cat">${escapeHtml(category.label)}</span>
            </div>
        </div></div>`;
    }

    function renderFlowSequenceRecursive(actions, prefix) {
        if (!Array.isArray(actions) || actions.length === 0) {
            return '<span class="skillv2-empty">无节点</span>';
        }

        let content = '';
        actions.forEach((action, idx) => {
            if (idx > 0) {
                content += '<span class="skillv2-flow-link" aria-hidden="true"></span>';
            }
            const indexLabel = (prefix || '') + (idx + 1);
            content += renderFlowActionRecursive(action, indexLabel, prefix + (idx + 1) + '.');
        });
        return `<div class="skillv2-flow-seq">${content}</div>`;
    }

    function renderFlowActionRecursive(action, indexLabel, nestedPrefix) {
        if (!isIfElseAction(action)) {
            return renderFlowLeafNode(action, indexLabel);
        }

        const condActions = action?.conditionAction?.actionData || [];
        const succActions = action?.succeedActions?.actionData || [];
        const failActions = action?.failActions?.actionData || [];
        const condSummary = condActions.length
            ? condActions.slice(0, 2).map(a => summarizeAction(a)).join(' / ') + (condActions.length > 2 ? ' ...' : '')
            : '无条件';
        const ifTypeText = formatType(action?.$type || 'IfElseAction');
        const category = getActionCategory(ifTypeText);

        const ifNode = `<div class="skillv2-flow-node cat-${category.key} has-branch" title="${escapeHtml(category.label)} | ${escapeHtml(ifTypeText)}">
            <div class="skillv2-flow-main">
                <span class="skillv2-flow-index">${escapeHtml(String(indexLabel || ''))}</span>
                <span>${escapeHtml(summarizeAction(action))}</span>
                <span class="skillv2-flow-cat">${escapeHtml(category.label)}</span>
            </div>
            <div class="skillv2-flow-if-cond">condition: ${escapeHtml(condSummary)}</div>
        </div>`;

        const thenSequence = renderFlowSequenceRecursive(succActions, (nestedPrefix || '') + 'T');
        const elseSequence = renderFlowSequenceRecursive(failActions, (nestedPrefix || '') + 'F');

        return `<div class="skillv2-flow-step skillv2-flow-step-ifelse">
            <div class="skillv2-flow-ifelse">
                <div class="skillv2-flow-ifelse-frame-title">IfElseAction</div>
                <div class="skillv2-flow-if-head">${ifNode}</div>
                <div class="skillv2-flow-branch-lanes">
                    <div class="skillv2-flow-branch-lane true">
                        <div class="skillv2-flow-branch-entry true">
                            <span class="skillv2-flow-branch-text true">是</span>
                            <span class="skillv2-flow-link" aria-hidden="true"></span>
                        </div>
                        <div class="skillv2-flow-branch-content">${thenSequence}</div>
                    </div>
                    <div class="skillv2-flow-branch-lane false">
                        <div class="skillv2-flow-branch-entry false">
                            <span class="skillv2-flow-branch-text false">否</span>
                            <span class="skillv2-flow-link" aria-hidden="true"></span>
                        </div>
                        <div class="skillv2-flow-branch-content">${elseSequence}</div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function renderTimelineGraph(actionGroupData) {
        const timeline = actionGroupData?.timelineActions || [];
        if (!timeline.length) {
            return '<div class="skillv2-empty">timelineActions 为空，无法绘制时间轴</div>';
        }

        const summarizeTimelineNodes = (actions) => {
            const list = Array.isArray(actions) ? actions : [];
            if (!list.length) return '节点: 无';
            const head = list.slice(0, 4).map(a => summarizeAction(a)).join(' → ');
            const more = list.length > 4 ? ' ... (共' + list.length + '个)' : '';
            return '节点: ' + head + more;
        };

        const typeInfo = extractTimelineActionTypes(timeline);
        const groupTypeList = typeInfo.groupTypeList;
        const allCategoryMap = new Map();
        const groupCategoryList = groupTypeList.map(types => {
            const catSet = new Set();
            types.forEach(typeName => {
                const categories = getActionCategories(typeName);
                categories.forEach(c => {
                    catSet.add(c.key);
                    allCategoryMap.set(c.key, c.label);
                });
            });
            return Array.from(catSet);
        });

        let minFrame = Number.POSITIVE_INFINITY;
        let maxFrame = 0;
        timeline.forEach(group => {
            const s = Number(group?._startFrame ?? 0);
            const e = Number(group?._endFrame ?? s);
            if (s < minFrame) minFrame = s;
            if (e < minFrame) minFrame = e;
            if (e > maxFrame) maxFrame = e;
            if (s > maxFrame) maxFrame = s;
        });
        if (!Number.isFinite(minFrame)) minFrame = 0;
        const span = Math.max(1, maxFrame - minFrame);

        const lines = timeline.map((group, index) => {
            const s = Number(group?._startFrame ?? 0);
            const e = Number(group?._endFrame ?? s);
            const visualStart = Math.min(s, e);
            const left = ((visualStart - minFrame) / span) * 100;
            const rawDuration = e - s;
            const duration = Math.abs(rawDuration);
            const width = Math.max(0.35, (duration / span) * 100);
            const actions = group?._sequenceActionData?.actionData || [];
            const isSingleFrame = duration <= 1;
            const isInvalidRange = e < s;
            const groupTypes = groupTypeList[index] || [];
            const groupCats = groupCategoryList[index] || [];
            const groupTypeData = groupTypes.join('|');
            const groupCatData = groupCats.join('|');
            const nodes = renderFlowSequenceRecursive(actions, 'G' + (index + 1) + '.');
            const nodeSummary = summarizeTimelineNodes(actions);

            return `
                <div class="skillv2-timeline-line${isInvalidRange ? ' invalid-range' : ''}" data-group-index="${index}" data-start-frame="${s}" data-end-frame="${e}" data-action-types="${escapeHtml(groupTypeData)}" data-action-cats="${escapeHtml(groupCatData)}" data-node-summary="${escapeHtml(nodeSummary)}">
                    <div class="skillv2-timeline-label">组 ${index + 1}${isInvalidRange ? '<br><span class="skillv2-warn-text">反向</span>' : ''}</div>
                    <div class="skillv2-timeline-body">
                        <div class="skillv2-timeline-track">
                            ${isSingleFrame
                                ? `<div class="skillv2-timeline-point" style="left:${left.toFixed(2)}%;" title="帧 ${s}"><span>F${s}</span></div>`
                                : `<div class="skillv2-timeline-seg${isInvalidRange ? ' invalid-range' : ''}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;">${s} - ${e}</div>`
                            }
                        </div>
                        <div class="skillv2-flow-row">
                            ${nodes || '<span class="skillv2-empty">无节点</span>'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const allCategories = Array.from(allCategoryMap.entries()).sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'));
        const filterButtons = allCategories.map(([key, label]) =>
            `<button class="skillv2-action-filter-btn" data-cat="${escapeHtml(key)}">${escapeHtml(label)}</button>`
        ).join('');

        const filterHtml = `
            <div class="skillv2-action-filter" id="skillv2ActionFilter">
                <div class="skillv2-action-filter-head">
                    <div class="skillv2-action-filter-title">筛选动作组（按功能分类，可多选）</div>
                    <button class="skillv2-node-visibility-toggle" id="skillv2NodeVisibilityToggle" data-hide="${timelineHideNodesMode ? 'true' : 'false'}">${timelineHideNodesMode ? '显示节点' : '隐藏节点'}</button>
                </div>
                <div class="skillv2-action-filter-buttons">
                    <button class="skillv2-action-filter-btn active" data-cat="__ALL__">全部</button>
                    ${filterButtons}
                </div>
            </div>
        `;

        const toggleButton = timeline.length > 5
            ? '<button id="skillv2TimelineExpandBtn" class="skillv2-timeline-expand-btn" data-expanded="false">展开全部</button>'
            : '';

        return `
            <div class="skillv2-timeline-graph" id="skillv2TimelineGraph" data-hide-nodes="${timelineHideNodesMode ? 'true' : 'false'}">
                <div class="skillv2-timeline-axis">全局帧区间: ${minFrame} - ${maxFrame}（默认显示约5组高度，可滚轮查看全部）</div>
                ${filterHtml}
                <div class="skillv2-timeline-lines" id="skillv2TimelineLines">${lines}</div>
                ${toggleButton}
            </div>
        `;
    }

    function renderSingleTimelineGroupDetail(group, index, blackboardMap) {
        const actions = group?._sequenceActionData?.actionData || [];
        return `
            <div class="skillv2-time-group compact-open">
                <div class="skillv2-time-head">
                    <span>时间组 #${index + 1}</span>
                    <span>帧 ${group?._startFrame ?? '?'} - ${group?._endFrame ?? '?'}</span>
                    <span>节点数 ${actions.length}</span>
                </div>
                <div class="skillv2-time-body">
                    ${renderActionSequence(actions, 0, 'T' + (index + 1), blackboardMap)}
                </div>
            </div>
        `;
    }

    function updateTimelineDetailFromSelection() {
        const panel = document.getElementById('skillv2TimelineDetailPanel');
        if (!panel) return;

        const selectedLine = document.querySelector('.skillv2-timeline-line.selected');
        if (!selectedLine || selectedLine.style.display === 'none') {
            panel.innerHTML = '<div class="skillv2-empty">请点击一个动作组查看详情。</div>';
            return;
        }

        const groups = currentSkillData?.actionGroupData?.timelineActions || [];
        const index = Number(selectedLine.dataset.groupIndex);
        if (!Number.isFinite(index) || !groups[index]) {
            panel.innerHTML = '<div class="skillv2-empty">该动作组数据不可用。</div>';
            return;
        }

        panel.innerHTML = renderSingleTimelineGroupDetail(groups[index], index, getBlackboardMap(currentSkillData));
    }

    function bindTimelineInteractions() {
        const lines = document.querySelectorAll('.skillv2-timeline-line');
        if (!lines.length) return;

        const inHideMode = () => {
            const graph = document.getElementById('skillv2TimelineGraph');
            return graph?.dataset.hideNodes === 'true';
        };

        const applyNodeVisibilityMode = () => {
            const hidden = inHideMode();
            const pinned = document.querySelector('.skillv2-timeline-line.nodes-pinned');
            lines.forEach(line => {
                line.classList.remove('nodes-hover');
                if (!hidden) {
                    line.classList.remove('nodes-collapsed');
                    line.classList.remove('nodes-pinned');
                    return;
                }
                const keep = pinned && pinned === line;
                line.classList.toggle('nodes-collapsed', !keep);
            });
        };

        lines.forEach(line => {
            line.addEventListener('click', () => {
                if (line.style.display === 'none') return;

                const alreadySelected = line.classList.contains('selected');
                document.querySelectorAll('.skillv2-timeline-line.selected').forEach(n => n.classList.remove('selected'));

                if (!alreadySelected) {
                    line.classList.add('selected');
                }

                if (inHideMode()) {
                    document.querySelectorAll('.skillv2-timeline-line.nodes-pinned').forEach(n => n.classList.remove('nodes-pinned'));
                    if (!alreadySelected) {
                        line.classList.add('nodes-pinned');
                    }
                }

                updateTimelineDetailFromSelection();
                applyNodeVisibilityMode();
            });
        });

        applyNodeVisibilityMode();
    }

    function bindNodeVisibilityToggle() {
        const graph = document.getElementById('skillv2TimelineGraph');
        const btn = document.getElementById('skillv2NodeVisibilityToggle');
        if (!graph || !btn) return;

        const apply = () => {
            graph.dataset.hideNodes = timelineHideNodesMode ? 'true' : 'false';
            btn.dataset.hide = timelineHideNodesMode ? 'true' : 'false';
            btn.textContent = timelineHideNodesMode ? '显示节点' : '隐藏节点';

            const lines = Array.from(document.querySelectorAll('.skillv2-timeline-line'));
            const selected = document.querySelector('.skillv2-timeline-line.selected');
            lines.forEach(line => {
                line.classList.remove('nodes-hover');
                line.classList.remove('nodes-pinned');
                if (!timelineHideNodesMode) {
                    line.classList.remove('nodes-collapsed');
                    return;
                }
                const keep = selected && selected === line && line.style.display !== 'none';
                if (keep) {
                    line.classList.add('nodes-pinned');
                    line.classList.remove('nodes-collapsed');
                } else {
                    line.classList.add('nodes-collapsed');
                }
            });
        };

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            timelineHideNodesMode = !timelineHideNodesMode;
            apply();
        });

        apply();
    }

    function bindTimelineTooltip() {
        const tooltip = document.getElementById('skillv2TimelineTooltip');
        const lines = document.querySelectorAll('.skillv2-timeline-line');
        if (!tooltip || !lines.length) return;

        const show = (line, event) => {
            const start = line.dataset.startFrame || '?';
            const end = line.dataset.endFrame || '?';
            const nodeSummary = line.dataset.nodeSummary || '节点: 无';
            const startNum = Number(start);
            const endNum = Number(end);
            const rawDurationFrame = (Number.isFinite(startNum) && Number.isFinite(endNum)) ? endNum - startNum : 0;
            const durationFrame = Math.abs(rawDurationFrame);
            const durationText = formatFrameDuration(durationFrame);
            const rangeNote = rawDurationFrame < 0 ? ' ｜ 异常: 结束帧早于起始帧' : '';
            tooltip.innerHTML = `
                <div class="skillv2-tooltip-line-main">起始帧: ${escapeHtml(start)} ｜ 结束帧: ${escapeHtml(end)} ｜ 持续帧: ${escapeHtml(durationFrame)} ｜ 持续时间: ${escapeHtml(durationText)}${rangeNote}</div>
                <div class="skillv2-tooltip-line-node">${escapeHtml(nodeSummary)}</div>
            `;
            tooltip.classList.add('show');
            tooltip.setAttribute('aria-hidden', 'false');
            move(event);
        };

        const move = (event) => {
            const offset = 14;
            tooltip.style.left = event.clientX + offset + 'px';
            tooltip.style.top = event.clientY + offset + 'px';
        };

        const hide = () => {
            tooltip.classList.remove('show');
            tooltip.setAttribute('aria-hidden', 'true');
        };

        lines.forEach(line => {
            line.addEventListener('mouseenter', (event) => show(line, event));
            line.addEventListener('mousemove', move);
            line.addEventListener('mouseleave', hide);
        });
    }

    function bindFlowDragScroll() {
        const rows = document.querySelectorAll('.skillv2-flow-row');
        if (!rows.length) return;

        rows.forEach(row => {
            let dragging = false;
            let startX = 0;
            let startScrollLeft = 0;

            row.addEventListener('mousedown', (event) => {
                dragging = true;
                row.classList.add('dragging');
                startX = event.clientX;
                startScrollLeft = row.scrollLeft;
            });

            row.addEventListener('mousemove', (event) => {
                if (!dragging) return;
                event.preventDefault();
                const deltaX = event.clientX - startX;
                row.scrollLeft = startScrollLeft - deltaX;
            });

            const stopDrag = () => {
                dragging = false;
                row.classList.remove('dragging');
            };

            row.addEventListener('mouseleave', stopDrag);
            row.addEventListener('mouseup', stopDrag);
        });
    }

    function bindTimelineExpandButton() {
        const btn = document.getElementById('skillv2TimelineExpandBtn');
        const linesWrap = document.getElementById('skillv2TimelineLines');
        if (!btn || !linesWrap) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const expanded = btn.dataset.expanded === 'true';
            if (expanded) {
                linesWrap.classList.remove('expanded');
                btn.dataset.expanded = 'false';
                btn.textContent = '展开全部';
            } else {
                linesWrap.classList.add('expanded');
                btn.dataset.expanded = 'true';
                btn.textContent = '恢复滚动视图';
            }
        });
    }

    function bindActionTypeFilter() {
        const filterRoot = document.getElementById('skillv2ActionFilter');
        const lines = Array.from(document.querySelectorAll('.skillv2-timeline-line'));
        if (!filterRoot || !lines.length) return;

        const buttons = Array.from(filterRoot.querySelectorAll('.skillv2-action-filter-btn'));

        const applyFilter = (selectedCats) => {
            lines.forEach(line => {
                if (!selectedCats.size) {
                    line.style.display = 'grid';
                    return;
                }
                const cats = String(line.dataset.actionCats || '').split('|').filter(Boolean);
                const hit = cats.some(c => selectedCats.has(c));
                line.style.display = hit ? 'grid' : 'none';
            });
            document.querySelectorAll('.skillv2-timeline-line.selected').forEach(line => {
                if (line.style.display === 'none') line.classList.remove('selected');
            });

            if (timelineHideNodesMode) {
                const selected = document.querySelector('.skillv2-timeline-line.selected');
                lines.forEach(line => {
                    line.classList.remove('nodes-hover');
                    line.classList.remove('nodes-pinned');
                    if (line.style.display === 'none') {
                        line.classList.remove('nodes-collapsed');
                        return;
                    }
                    if (selected && selected === line) {
                        line.classList.add('nodes-pinned');
                        line.classList.remove('nodes-collapsed');
                    } else {
                        line.classList.add('nodes-collapsed');
                    }
                });
            }

            updateTimelineDetailFromSelection();
        };

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.cat || '__ALL__';
                const allBtn = buttons.find(b => (b.dataset.cat || '__ALL__') === '__ALL__');

                if (key === '__ALL__') {
                    buttons.forEach(b => b.classList.remove('active'));
                    if (allBtn) allBtn.classList.add('active');
                    applyFilter(new Set());
                    return;
                }

                btn.classList.toggle('active');
                if (allBtn) allBtn.classList.remove('active');

                const selected = new Set(
                    buttons
                        .filter(b => b.classList.contains('active') && (b.dataset.cat || '__ALL__') !== '__ALL__')
                        .map(b => b.dataset.cat)
                        .filter(Boolean)
                );

                if (!selected.size && allBtn) {
                    allBtn.classList.add('active');
                }

                applyFilter(selected);
            });
        });
    }

    function renderTimelineSection(actionGroupData, blackboardMap) {
        const timeline = actionGroupData?.timelineActions || [];
        if (!timeline.length) {
            return '<div class="skillv2-empty">timelineActions 为空</div>';
        }

        return timeline.map((group, index) => {
            const actions = group?._sequenceActionData?.actionData || [];
            return `
                <div class="skillv2-time-group">
                    <div class="skillv2-time-head">
                        <span>时间组 #${index + 1}</span>
                        <span>帧 ${group?._startFrame ?? '?'} - ${group?._endFrame ?? '?'}</span>
                        <span>节点数 ${actions.length}</span>
                    </div>
                    <div class="skillv2-time-body">
                        ${renderActionSequence(actions, 0, 'T' + (index + 1), blackboardMap)}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderPassiveEventsSection(actionGroupData, blackboardMap) {
        const events = actionGroupData?.passiveEventActions || [];
        if (!events.length) {
            return '<div class="skillv2-empty">passiveEventActions 为空</div>';
        }

        return events.map((eventItem, eventIndex) => {
            const actionWrappers = Array.isArray(eventItem?.actions) ? eventItem.actions : [];
            const blocks = actionWrappers.map((wrap, idx) => {
                const actions = wrap?.actionData || [];
                return `
                    <div class="skillv2-passive-block">
                        <div class="skillv2-passive-title">触发序列 ${idx + 1}（节点 ${actions.length}）</div>
                        ${renderActionSequence(actions, 0, 'P' + (eventIndex + 1) + '.' + (idx + 1), blackboardMap)}
                    </div>
                `;
            }).join('');

            return `
                <div class="skillv2-passive-event">
                    <div class="skillv2-passive-head">事件 #${eventIndex + 1}: ${escapeHtml(eventItem?.abilityEvent || 'Unknown')}</div>
                    ${blocks || '<div class="skillv2-empty">该事件没有动作</div>'}
                </div>
            `;
        }).join('');
    }

    function renderPill(label, value) {
        return `
            <div class="skillv2-pill">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `;
    }

    function renderMetricGrid(items) {
        return `<div class="skillv2-metric-grid">${items.map(item => renderPill(item[0], translateValue(item[1]))).join('')}</div>`;
    }

    function renderBlackboardSection(data) {
        const blackboard = Array.isArray(data?.blackboard) ? data.blackboard : [];
        if (!blackboard.length) {
            return '<div class="skillv2-empty">blackboard 为空</div>';
        }

        const rows = blackboard.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><code>${escapeHtml(item?.key || '')}</code></td>
                <td>${escapeHtml(formatBlackboardEntry(item))}</td>
                <td>${escapeHtml(item?.isDynamic ? '动态' : '固定')}</td>
            </tr>
        `).join('');

        return `
            <table class="skillv2-table skillv2-blackboard-table">
                <thead><tr><th>#</th><th>Key</th><th>值</th><th>类型</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function renderCastSection(data, blackboardMap) {
        const castData = data?.castData || {};
        const distance = formatBlackboardValueRef(castData.castDistance, blackboardMap) || summarizePrimitive(castData.castDistance);
        const height = formatBlackboardValueRef(castData.heightDiffLimit, blackboardMap) || summarizePrimitive(castData.heightDiffLimit);
        return `
            <div class="skillv2-structured-grid">
                <div class="skillv2-structured-panel">
                    <div class="skillv2-structured-title">施放规则</div>
                    ${renderMetricGrid([
                        ['距离检查', castData.checkCastDistanceType ?? ''],
                        ['自定义距离', castData.useCustomCastDistance ?? false],
                        ['施放距离', distance],
                        ['高度差检查', castData.checkHeightDiff ?? false],
                        ['高度差限制', height],
                        ['旋转', castData.rotateType ?? ''],
                        ['角度', castData.castAngle ?? ''],
                        ['冷却', castData.cooldownTime ?? 0],
                        ['起始CD帧', castData.startCdFrame ?? 0],
                        ['最大充能', castData.maxChargeTime ?? 0]
                    ])}
                </div>
                <div class="skillv2-structured-panel">
                    <div class="skillv2-structured-title">消耗</div>
                    ${renderKeyValueRows(castData.costData || {}, [], blackboardMap)}
                </div>
            </div>
        `;
    }

    function renderTagsSection(data) {
        const renderTagList = (tags) => {
            const list = Array.isArray(tags) ? tags : [];
            if (!list.length) return '<span class="skillv2-muted">无</span>';
            return list.map(tag => `<span class="skillv2-tag">${escapeHtml(tag)}</span>`).join('');
        };

        return `
            <div class="skillv2-structured-grid">
                <div class="skillv2-structured-panel">
                    <div class="skillv2-structured-title">skillTags</div>
                    <div class="skillv2-tag-list">${renderTagList(data?.skillTags?.predefinedTag)}</div>
                </div>
                <div class="skillv2-structured-panel">
                    <div class="skillv2-structured-title">tagDuringAttach</div>
                    <div class="skillv2-tag-list">${renderTagList(data?.tagDuringAttach?.predefinedTag)}</div>
                </div>
            </div>
        `;
    }

    function renderDataMap(data, blackboardMap) {
        const actionGroupData = data?.actionGroupData || {};
        const timeline = actionGroupData.timelineActions || [];
        const passiveEvents = actionGroupData.passiveEventActions || [];
        const actionTypes = extractAllActionTypes(actionGroupData);
        const categories = new Map();
        actionTypes.forEach(typeName => getActionCategories(typeName).forEach(cat => categories.set(cat.key, cat.label)));
        const timelineHealth = analyzeTimeline(timeline);

        const basicFields = [
            ['图标背景', data?.iconBgType],
            ['攻击范围', data?.attackRangeType],
            ['选择策略', data?.selectStrategy],
            ['智能选目标', data?.smartTargetSelectStrategy],
            ['可空放', data?.canDummyCast],
            ['可移动', data?.canMove],
            ['可空中施放', data?.canCastInAir],
            ['RootMotion悬崖检查', data?.rootMotionCliffCheck],
            ['返回待机', data?.characterReturnToIdle],
            ['黑板项', (data?.blackboard || []).length],
            ['buffs', (data?.buffs || []).length],
            ['toggleBuffs', (data?.toggleBuffs || []).length]
        ];

        const catTags = Array.from(categories.values()).map(label => `<span class="skillv2-tag">${escapeHtml(label)}</span>`).join('') || '<span class="skillv2-muted">无动作节点</span>';

        return `
            <div class="skillv2-card">
                <div class="skillv2-card-title">SkillData 数据地图</div>
                ${renderMetricGrid(basicFields)}
                <div class="skillv2-block-title">动作类型概览</div>
                <div class="skillv2-tag-list">${catTags}</div>
                <div class="skillv2-block-title">时间轴健康</div>
                ${renderMetricGrid([
                    ['时间组', timeline.length],
                    ['反向帧组', timelineHealth.negativeRanges],
                    ['空动作组', timelineHealth.emptyGroups],
                    ['乱序相邻组', timelineHealth.unsortedPairs]
                ])}
                <div class="skillv2-block-title">施放数据 castData</div>
                ${renderCastSection(data, blackboardMap)}
                <div class="skillv2-block-title">黑板 blackboard</div>
                ${renderBlackboardSection(data)}
                <div class="skillv2-block-title">标签</div>
                ${renderTagsSection(data)}
                <div class="skillv2-block-title">被动事件摘要</div>
                ${passiveEvents.length
                    ? `<div class="skillv2-tag-list">${passiveEvents.map((eventItem, index) => `<span class="skillv2-tag">#${index + 1} ${escapeHtml(eventItem?.abilityEvent || 'Unknown')} (${(eventItem?.actions || []).length})</span>`).join('')}</div>`
                    : '<div class="skillv2-empty">无被动事件</div>'}
            </div>
        `;
    }

    function renderAdditionalDataSection(data, blackboardMap) {
        const omitted = new Set(['skillId', 'level', 'skillName', 'castType', 'skillSpecification', 'durationFrame', 'exclusiveFrame', 'castData', 'actionGroupData', 'blackboard', 'skillTags', 'tagDuringAttach']);
        return `
            <div class="skillv2-card">
                <div class="skillv2-card-title">其他顶层字段</div>
                ${renderKeyValueRows(data || {}, Array.from(omitted), blackboardMap)}
            </div>
        `;
    }

    function renderRawDataSection(data) {
        return `
            <div class="skillv2-card">
                <div class="skillv2-card-title">完整原始数据</div>
                <div class="skillv2-raw-note">用于审计遗漏字段。默认折叠，展开后可查看完整 SkillData JSON。</div>
                <details class="skillv2-raw-details">
                    <summary>展开完整 JSON</summary>
                    <pre class="skillv2-raw-json">${escapeHtml(safeJson(data))}</pre>
                </details>
            </div>
        `;
    }

    function renderJsonTree(value, keyPath, depth) {
        const safeDepth = depth || 0;
        const nextDepth = safeDepth + 1;

        if (value === null || value === undefined) {
            return `<span class="skillv2-json-primitive">${escapeHtml(String(value))}</span>`;
        }

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return `<span class="skillv2-json-primitive">${escapeHtml(String(value))}</span>`;
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '<span class="skillv2-json-primitive">[]</span>';
            }
            const openByDefault = nextDepth <= 2 ? ' open' : '';
            const items = value.map((item, idx) => `
                <div class="skillv2-json-row">
                    <div class="skillv2-json-key">[${idx}]</div>
                    <div class="skillv2-json-value">${renderJsonTree(item, keyPath + '[' + idx + ']', nextDepth)}</div>
                </div>
            `).join('');
            return `
                <details class="skillv2-json-node"${openByDefault}>
                    <summary>Array(${value.length})</summary>
                    <div class="skillv2-json-children">${items}</div>
                </details>
            `;
        }

        const entries = Object.entries(value);
        if (!entries.length) {
            return '<span class="skillv2-json-primitive">{}</span>';
        }

        const openByDefault = nextDepth <= 2 ? ' open' : '';
        const content = entries.map(([k, v]) => `
            <div class="skillv2-json-row">
                <div class="skillv2-json-key">${escapeHtml(translateKey(k))}</div>
                <div class="skillv2-json-value">${renderJsonTree(v, keyPath + '.' + k, nextDepth)}</div>
            </div>
        `).join('');

        return `
            <details class="skillv2-json-node"${openByDefault}>
                <summary>Object(${entries.length})</summary>
                <div class="skillv2-json-children">${content}</div>
            </details>
        `;
    }

    function renderOverview(data, manifestItem) {
        const basic = [
            ['skillId', data?.skillId],
            ['level', data?.level],
            ['skillName', data?.skillName],
            ['castType', data?.castType],
            ['skillSpecification', data?.skillSpecification],
            ['durationFrame', data?.durationFrame],
            ['exclusiveFrame', data?.exclusiveFrame],
            ['timelineActions', data?.actionGroupData?.timelineActions?.length || 0],
            ['passiveEventActions', data?.actionGroupData?.passiveEventActions?.length || 0]
        ];

        const rows = basic.map(([k, v]) => `
            <tr><td>${escapeHtml(translateKey(k))}</td><td>${escapeHtml(translateValue(v))}</td></tr>
        `).join('');

        return `
            <div class="skillv2-card">
                <div class="skillv2-card-title">概览</div>
                <div class="skillv2-overview-id">${escapeHtml(manifestItem?.id || data?.skillId || 'unknown')}</div>
                <table class="skillv2-table">
                    <thead><tr><th>字段</th><th>值</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    function renderDetail(data, manifestItem) {
        const actionGroupData = data?.actionGroupData || {};
        const blackboardMap = getBlackboardMap(data);
        return `
            <div class="skillv2-detail-wrap">
                ${renderOverview(data, manifestItem)}
                ${renderDataMap(data, blackboardMap)}

                <div class="skillv2-card">
                    <div class="skillv2-card-title">ActionGroupData 节点执行视图</div>
                    <div class="skillv2-block-title">时间轴图 / 节点流图（直观模式）</div>
                    ${renderTimelineGraph(actionGroupData)}
                    <div class="skillv2-block-title">timelineActions（点击时间轴动作组后显示详情）</div>
                    <div id="skillv2TimelineDetailPanel" class="skillv2-timeline-detail-panel">
                        <div class="skillv2-empty">默认隐藏全部 timelineActions 详情。请点击上方时间轴中的动作组查看。</div>
                    </div>
                    <div class="skillv2-block-title">passiveEventActions（被动事件触发）</div>
                    ${renderPassiveEventsSection(actionGroupData, blackboardMap)}
                </div>
                ${renderAdditionalDataSection(data, blackboardMap)}
                ${renderRawDataSection(data)}
            </div>
        `;
    }

    async function loadSkillDetail(item) {
        const main = document.getElementById('skillv2Main');
        if (!main) return;
        main.innerHTML = '<div class="loader">加载技能详情中...</div>';

        try {
            const data = await fetchSkillData(item.contentFile);
            currentSkillData = data;
            main.innerHTML = renderDetail(data, item);
            bindActionTypeFilter();
            bindNodeVisibilityToggle();
            bindTimelineInteractions();
            bindTimelineExpandButton();
            bindTimelineTooltip();
            bindFlowDragScroll();
        } catch (err) {
            currentSkillData = null;
            main.innerHTML = '<div class="error-message">加载失败: ' + escapeHtml(err.message) + '</div>';
        }
    }

    function buildMobileList() {
        const mobileContent = document.getElementById('skillv2MobileContent');
        if (!mobileContent) return;

        const filtered = filterList(manifestList);
        mobileContent.innerHTML = '';

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'skillv2-mobile-item' + (item.id === activeSkillId ? ' active' : '');
            div.innerHTML = `
                <div class="skillv2-mobile-item-title">${escapeHtml(item.name || item.id)}</div>
                <div class="skillv2-mobile-item-sub">${escapeHtml(item.id)}</div>
            `;
            div.addEventListener('click', () => {
                activeSkillId = item.id;
                if (window.__akeRouter) window.__akeRouter.updateUrl('skill_v2', item.id);
                highlightActive();
                loadSkillDetail(item);
                closeMobileList();
            });
            mobileContent.appendChild(div);
        });
    }

    function openMobileList() {
        buildMobileList();
        const overlay = document.getElementById('skillv2MobileOverlay');
        if (overlay) overlay.style.display = 'flex';
    }

    function closeMobileList() {
        const overlay = document.getElementById('skillv2MobileOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    async function refreshModule() {
        const list = await fetchManifest();
        manifestList = list;
        renderList();
    }

    async function initModule() {
        if (isInitialized) return;
        isInitialized = true;

        if (window.configLoaded) {
            await window.configLoaded;
        }

        window.addEventListener('globalConfigChanged', () => {
            searchTerm = '';
            const input = document.getElementById('skillv2SearchInput');
            if (input) input.value = '';
            refreshModule();
        });

        document.getElementById('skillv2SearchInput')?.addEventListener('input', (e) => {
            searchTerm = e.target.value || '';
            renderList();
        });

        document.getElementById('skillv2MobileBtn')?.addEventListener('click', openMobileList);
        document.getElementById('skillv2MobileOverlay')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'skillv2MobileOverlay') {
                closeMobileList();
            }
        });

        await refreshModule();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModule);
    } else {
        initModule();
    }
})();
