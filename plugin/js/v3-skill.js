(function () {
    'use strict';

    const MODULE_ID = 'v3_skill';
    const MODULE_TITLE = '战斗';
    const OTHER_ID = '__other_combat_entities__';
    const HIDDEN_ENTITY_PATTERN = /^(?:chr_9000_endmin|eny_0057_dog)(?:_|$)/i;
    const root = document.getElementById('combatv3Module');
    if (!root || !window.AKEV3) return;

    window.__akeV3SkillController?.destroy?.();

    const elements = {
        search: document.getElementById('combatv3SearchInput'),
        mobileSearch: document.getElementById('combatv3MobileSearchInput'),
        meta: document.getElementById('combatv3ListMeta'),
        list: document.getElementById('combatv3GroupList'),
        detail: document.getElementById('combatv3Detail'),
        mobileButton: document.getElementById('combatv3MobileListButton'),
        mobileOverlay: document.getElementById('combatv3MobileOverlay'),
        mobilePanel: document.getElementById('combatv3MobilePanel'),
        mobileClose: document.getElementById('combatv3MobileClose'),
        mobileList: document.getElementById('combatv3MobileList'),
        tooltip: document.getElementById('combatv3TimelineTooltip')
    };
    if (!elements.list || !elements.detail) return;

    const initialParams = new URLSearchParams(window.location.search);
    const initialLevel = Number(initialParams.get('level')) || null;
    const pendingDeepLink = parseDeepLink(window.__deepLinkId || '');
    window.__deepLinkId = null;
    root.dataset.moduleId = MODULE_ID;
    root.dataset.moduleTitle = MODULE_TITLE;

    const state = {
        rawManifest: [],
        manifest: [],
        tables: null,
        directory: [],
        skillIndex: new Map(),
        expandedCharacters: new Set(),
        expandedGroups: new Set(),
        query: '',
        activeSkillId: '',
        activeOwner: null,
        level: pendingDeepLink.level || initialLevel,
        currentItem: null,
        currentData: null,
        currentPatch: null,
        analysis: emptyAnalysis(),
        analysisSource: null,
        activeTab: 'timeline',
        showPerformance: false,
        timelineEvents: [],
        skillCache: new Map(),
        loadToken: 0,
        detailToken: 0,
        pendingDeepId: pendingDeepLink.id
    };

    const GROUP_TYPE_LABELS = {
        0: '普通攻击',
        1: '战技',
        2: '终结技',
        3: '连携技'
    };
    const ATTACK_ATTRIBUTE_LABELS = {
        physical: '物理伤害',
        real: '真实伤害',
        fire: '灼热伤害',
        pulse: '电磁伤害',
        cryst: '寒冷伤害',
        crystal: '寒冷伤害',
        lifedrain: '吸血伤害',
        natural: '自然伤害',
        ether: '超域伤害'
    };
    const ENEMY_RARITY_BY_DISPLAY_TYPE = { 0: 2, 3: 3, 1: 4, 4: 5, 2: 6 };
    const BASIC_LABELS = {
        durationFrame: '动作总时长', durationFrames: '动作总时长', totalFrames: '动作总时长',
        exclusiveFrame: '排他期', exclusiveFrames: '排他期', offsetRecordFrame: '续段记录帧',
        offsetFrame: '续段记录帧', offsetTime: '续段保留时间', startupFrame: '起手', startupFrames: '起手',
        firstHitFrame: '首段命中', lastHitFrame: '末段命中', recoveryFrame: '收招', recoveryFrames: '收招',
        cancelFrame: '可取消时点', cancelFrames: '可取消时点', cooldown: '冷却', cooldownTime: '冷却',
        hitCount: '命中段数', totalDamage: '总伤害倍率', damage: '伤害倍率', poiseDamage: '破韧',
        toughnessDamage: '破韧', atb: '失衡值', atbValue: '失衡值', superArmor: '抗打断',
        antiInterrupt: '抗打断', moveDistance: '位移距离', displacement: '位移距离',
        invulnerableFrame: '无敌时间', invulnerableFrames: '无敌时间'
    };
    const WINDOW_LABELS = {
        damage: '命中', superArmor: '抗打断', buffSuperArmor: '霸体 Buff', damageImmune: '无敌',
        allowNextSkill: '允许接续', comboCache: '输入缓存', canInterrupt: '可取消', canDash: '可闪避取消',
        blockMoveInterrupt: '禁止移动打断', hitStop: '顿帧', timeDilation: '时间膨胀', movement: '位移',
        exclusive: '排他期', offsetRecord: '续段记录帧', costCommit: '资源提交帧'
    };
    const ACTION_LABELS = {
        DamageAction: '伤害结算', SetSuperArmorAction: '设置抗打断', AllowNextSkillAction: '开放接续',
        ComboCacheAction: '输入缓存', MarkCanInterruptAction: '开放取消', MarkCanDashAction: '开放闪避取消',
        BlockMoveInterruptAction: '阻止移动打断', HitStopAction: '顿帧', TimeDilationAction: '时间膨胀',
        CreateBuffAction: '创建 Buff', LaunchProjectileAction: '发射投射物', CastSkillAction: '触发子技能',
        InterruptAction: '打断控制', CrushAction: '压倒', FractureAction: '碎甲', SpellInflictionAction: '元素附着'
    };

    function emptyAnalysis() {
        return { basic: {}, windows: [], hits: [], events: [], links: [], blackboard: {}, warnings: [] };
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[char]);
    }

    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function isPresent(value) {
        return value !== undefined && value !== null && value !== '';
    }

    function gameText(ref, fallback) {
        return window.AKEV3.text(ref, fallback || '');
    }

    function safeJson(value) {
        const seen = new WeakSet();
        try {
            return JSON.stringify(value, (key, child) => {
                if (child && typeof child === 'object') {
                    if (seen.has(child)) return '[Circular]';
                    seen.add(child);
                }
                return child;
            }, 2);
        } catch (error) {
            return String(value ?? error.message);
        }
    }

    function collection(value) {
        if (Array.isArray(value)) return value.filter(item => item !== undefined && item !== null);
        if (!isObject(value)) return isPresent(value) ? [value] : [];
        return Object.entries(value).map(([key, item]) => isObject(item) ? { __key: key, ...item } : { key, value: item });
    }

    function formatValue(value) {
        if (!isPresent(value)) return '--';
        if (typeof value === 'boolean') return value ? '是' : '否';
        if (typeof value === 'number') return Number.isInteger(value)
            ? String(value)
            : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value);
        if (typeof value === 'string') return value;
        if (isObject(value) && isPresent(value.text)) return String(value.text);
        if (Array.isArray(value) && value.every(item => ['string', 'number', 'boolean'].includes(typeof item))) return value.join(' / ');
        return safeJson(value);
    }

    function resolvedScalar(value) {
        if (!isObject(value)) return value;
        if (Object.prototype.hasOwnProperty.call(value, 'value')) return value.value;
        return value;
    }

    function hasNonZeroValue(value) {
        const scalar = resolvedScalar(value);
        if (!isPresent(scalar)) return false;
        const numeric = Number(scalar);
        return Number.isFinite(numeric) ? numeric !== 0 : true;
    }

    function costTypeLabel(value) {
        const scalar = resolvedScalar(value);
        if (!isPresent(scalar)) return undefined;
        const normalized = String(scalar).toLowerCase();
        if (normalized === '0' || normalized === 'ultimatesp' || normalized === 'usp') return '终结技能量';
        if (normalized === '1' || normalized === 'atb') return '技力';
        return formatValue(scalar);
    }

    function attackAttributeLabel(value) {
        const scalar = resolvedScalar(value);
        if (!isPresent(scalar)) return undefined;
        const normalized = String(scalar).trim().split('.').pop().toLowerCase();
        return ATTACK_ATTRIBUTE_LABELS[normalized] || formatValue(scalar);
    }

    function readPath(source, path) {
        return String(path).split('.').reduce((value, key) => value?.[key], source);
    }

    function firstValue(source, paths) {
        for (const path of paths) {
            const value = readPath(source, path);
            if (isPresent(value)) return value;
        }
        return undefined;
    }

    function parseDeepLink(value) {
        const text = String(value || '');
        const match = text.match(/^(.*?)(?:@|~L)(\d+)$/i);
        return match ? { id: match[1], level: Number(match[2]) } : { id: text, level: null };
    }

    function showHidden() {
        return window.akeData?.getConfig?.().showHidden === true;
    }

    function isSuppressedEntity(id) {
        return HIDDEN_ENTITY_PATTERN.test(String(id || ''));
    }

    function groupKey(characterId, groupId) {
        return `${characterId}::${groupId}`;
    }

    function characterOwnerKey(id) {
        const match = String(id || '').match(/^chr_(\d+)_([^_]+)/i);
        return match ? `${Number(match[1])}:${match[2].toLowerCase()}` : '';
    }

    function normalizedCharacterSkillId(id) {
        return String(id || '').replace(/^chr_(\d+)_([^_]+)/i,
            (all, number, name) => `chr_${Number(number)}_${name.toLowerCase()}`).toLowerCase();
    }

    function skillSuffix(skillId, entityId) {
        const value = String(skillId || '');
        if (entityId && value.startsWith(`${entityId}_`)) return value.slice(String(entityId).length + 1);
        if (characterOwnerKey(value) && characterOwnerKey(value) === characterOwnerKey(entityId)) {
            const owner = value.match(/^chr_\d+_[^_]+/i)?.[0] || '';
            return value.slice(owner.length + Number(value[owner.length] === '_'));
        }
        return value;
    }

    function skillDisplayName(item, characterId) {
        const suffix = skillSuffix(item.id, item.ownerPrefix || characterId);
        return suffix || item.id;
    }

    function skillIconPath(iconId) {
        const value = String(iconId || '');
        if (!value) return '';
        if (value.startsWith('/')) return value;
        return `/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/skillicon/${value}.png`;
    }

    function groupDisplayName(group) {
        return gameText(group.name, GROUP_TYPE_LABELS[group.skillGroupType] || group.fallbackName || group.skillGroupId);
    }

    function itemSearchText(item, character, group) {
        return [item.id, item.name, skillDisplayName(item, character.id), character.name, character.engName,
            group.displayName, group.skillGroupId].filter(Boolean).join(' ').toLowerCase();
    }

    function otherGroup(id) {
        if (/^(eny_|race_)/i.test(id)) return ['other_enemy', '未映射怪物与召唤物', 0];
        if (/^(int_|abilityentity_)/i.test(id)) return ['other_interaction', '交互与场景实体', 1];
        if (/^(wpn_|passive_)/i.test(id)) return ['other_equipment', '装备与被动', 2];
        if (/^(common_|sk_|skill_|rpg_|cc_|potential_)/i.test(id)) return ['other_system', '系统与通用逻辑', 3];
        return ['other_misc', '其他', 4];
    }

    function inferCharacterGroup(character, skillId) {
        const normalizedId = normalizedCharacterSkillId(skillId);
        if (/_plunging_attack_start(?:_|$)/i.test(normalizedId)) {
            const normalAttackGroup = character.groups.find(group => Number(group.skillGroupType) === 0);
            if (normalAttackGroup) return normalAttackGroup;
        }
        let winner = null;
        let winnerLength = -1;
        character.groups.forEach(group => {
            (group.skillIdList || []).forEach(rootId => {
                const normalizedRoot = normalizedCharacterSkillId(rootId);
                if ((normalizedId === normalizedRoot || normalizedId.startsWith(`${normalizedRoot}_`))
                    && normalizedRoot.length > winnerLength) {
                    winner = group;
                    winnerLength = normalizedRoot.length;
                }
            });
        });
        return winner;
    }

    function buildDirectory(manifest, characters, growth, enemyDisplay, enemies) {
        const manifestMap = new Map(manifest.map(item => [item.id, item]));
        const assigned = new Set();
        const records = new Map();
        const characterAliases = new Map();

        Object.keys(characters || {}).forEach((charId, sourceOrder) => {
            if (isSuppressedEntity(charId)) return;
            const char = characters[charId] || {};
            const grow = growth?.[charId] || {};
            records.set(charId, {
                id: charId,
                entityKind: 'character',
                sectionId: 'characters',
                sectionName: '角色',
                sectionOrder: 0,
                name: gameText(char.name, gameText(grow.name, grow.engName || charId)),
                engName: grow.engName || '',
                rarity: Number(char.rarity ?? grow.rarity ?? 0),
                sourceOrder: Number(char.sortOrder ?? sourceOrder),
                icon: `/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/charremoteicon/icon_${charId}.png`,
                config: char,
                growth: grow,
                groups: []
            });
            const alias = characterOwnerKey(charId);
            if (alias) characterAliases.set(alias, charId);
        });

        records.forEach(character => {
            Object.values(character.growth.skillGroupMap || {}).forEach((rawGroup, groupOrder) => {
                const skills = (rawGroup.skillIdList || []).map(id => manifestMap.get(id)).filter(Boolean);
                skills.forEach(item => assigned.add(item.id));
                if (!skills.length) return;
                character.groups.push({
                    ...rawGroup,
                    id: rawGroup.skillGroupId || `group_${groupOrder}`,
                    skillGroupId: rawGroup.skillGroupId || `group_${groupOrder}`,
                    order: Number(rawGroup.skillGroupType ?? 99),
                    displayName: groupDisplayName(rawGroup),
                    skills
                });
            });
        });

        const prefixes = [...records.keys()].sort((a, b) => b.length - a.length);
        manifest.forEach(item => {
            if (assigned.has(item.id)) return;
            const charId = prefixes.find(prefix => item.id.startsWith(`${prefix}_`))
                || characterAliases.get(characterOwnerKey(item.id));
            if (!charId) return;
            const character = records.get(charId);
            let group = inferCharacterGroup(character, item.id);
            if (!group) group = character.groups.find(entry => entry.id === `${charId}__other_actions`);
            if (!group) {
                group = { id: `${charId}__other_actions`, skillGroupId: `${charId}__other_actions`, order: 90,
                    displayName: '其他战斗动作', fallbackName: '其他战斗动作', skills: [] };
                character.groups.push(group);
            }
            group.skills.push(item);
            assigned.add(item.id);
        });

        const enemyRecords = new Map();
        const enemyOwners = Object.entries(enemies || {}).sort(([left], [right]) => right.length - left.length);
        const enemyDisplayOrder = new Map(Object.keys(enemyDisplay || {}).map((id, index) => [id, index]));
        manifest.forEach(item => {
            if (assigned.has(item.id) || !/^eny_/i.test(item.id)) return;
            const ownerEntry = enemyOwners.find(([enemyId]) => item.id === enemyId || item.id.startsWith(`${enemyId}_`));
            const enemyId = ownerEntry?.[0];
            const templateId = ownerEntry?.[1]?.templateId;
            const display = enemyDisplay?.[templateId];
            if (!enemyId || !templateId || !display) return;
            const displayType = Number(display.displayType);
            let enemy = enemyRecords.get(templateId);
            if (!enemy) {
                enemy = {
                    id: templateId,
                    entityKind: 'enemy',
                    sectionId: 'enemies',
                    sectionName: '怪物',
                    sectionOrder: 10,
                    name: gameText(display.name, templateId),
                    engName: gameText(display.nickname, ''),
                    rarity: ENEMY_RARITY_BY_DISPLAY_TYPE[displayType] || 1,
                    sourceOrder: enemyDisplayOrder.get(templateId) ?? Number.MAX_SAFE_INTEGER,
                    icon: `/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites/monstericonbig/${templateId}.png`,
                    config: display,
                    growth: {},
                    groups: [{
                        id: `${templateId}__combat_actions`,
                        skillGroupId: `${templateId}__combat_actions`,
                        order: 0,
                        displayName: '怪物技能',
                        fallbackName: '怪物技能',
                        skills: []
                    }]
                };
                enemyRecords.set(templateId, enemy);
            }
            enemy.groups[0].skills.push({ ...item, ownerPrefix: enemyId });
            assigned.add(item.id);
        });

        const buckets = new Map();
        manifest.forEach(item => {
            if (assigned.has(item.id)) return;
            const [id, name, order] = otherGroup(item.id);
            if (!buckets.has(id)) buckets.set(id, { id, skillGroupId: id, order, displayName: name, skills: [] });
            buckets.get(id).skills.push(item);
        });
        const other = {
            id: OTHER_ID, name: '其他战斗实体', engName: '', rarity: -1,
            entityKind: 'other', sectionId: 'other', sectionName: '其他', sectionOrder: 1000,
            sourceOrder: Number.MAX_SAFE_INTEGER, config: {}, growth: {}, groups: [...buckets.values()], isOther: true
        };

        const directory = [...records.values(), ...enemyRecords.values()]
            .filter(character => character.groups.some(group => group.skills.length));
        if (other.groups.length) directory.push(other);
        directory.sort((a, b) => a.sectionOrder - b.sectionOrder
            || (a.entityKind === 'character' && b.entityKind === 'character' ? b.rarity - a.rarity : 0)
            || a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id));
        directory.forEach(character => {
            character.groups.sort((a, b) => a.order - b.order || a.skillGroupId.localeCompare(b.skillGroupId));
            character.groups.forEach(group => {
                group.skills.sort((a, b) => Number(a.priority ?? 999999) - Number(b.priority ?? 999999) || a.id.localeCompare(b.id));
                group.skills = group.skills.map(item => ({ ...item, displayName: skillDisplayName(item, character.id) }));
                group.searchText = `${group.displayName} ${group.skillGroupId}`.toLowerCase();
                group.skills.forEach(item => { item.searchText = itemSearchText(item, character, group); });
            });
            character.searchText = `${character.id} ${character.name} ${character.engName}`.toLowerCase();
        });
        return directory;
    }

    function rebuildSkillIndex() {
        state.skillIndex = new Map();
        state.directory.forEach(character => character.groups.forEach(group => group.skills.forEach(item => {
            const owner = { item, character, group };
            if (!state.skillIndex.has(item.id)) state.skillIndex.set(item.id, []);
            state.skillIndex.get(item.id).push(owner);
        })));
    }

    function filteredDirectory() {
        const term = state.query;
        if (!term) return state.directory;
        return state.directory.map(character => {
            const characterMatch = !character.isOther && character.searchText.includes(term);
            const groups = character.groups.map(group => {
                const directSkills = group.skills.filter(item => item.searchText.includes(term));
                const skills = character.isOther ? directSkills
                    : (characterMatch || group.searchText.includes(term) ? group.skills : directSkills);
                return { ...group, skills };
            }).filter(group => group.skills.length);
            return { ...character, groups };
        }).filter(character => character.groups.length);
    }

    function renderDirectoryNode(target, directory) {
        if (!target) return;
        if (!directory.length) {
            target.innerHTML = '<div class="combatv3-empty-inline">没有匹配的战斗数据</div>';
            return;
        }
        const sectionCounts = directory.reduce((counts, entity) => {
            counts.set(entity.sectionId, (counts.get(entity.sectionId) || 0) + 1);
            return counts;
        }, new Map());
        let previousSectionId = '';
        target.innerHTML = directory.map(character => {
            const sectionHeading = character.sectionId !== previousSectionId
                ? `<div class="combatv3-directory-heading"><span>${escapeHtml(character.sectionName)}</span><span>${escapeHtml(sectionCounts.get(character.sectionId))} 个</span></div>`
                : '';
            previousSectionId = character.sectionId;
            const characterOpen = Boolean(state.query) || state.expandedCharacters.has(character.id);
            const total = character.groups.reduce((sum, group) => sum + group.skills.length, 0);
            const renderSkillItems = group => group.skills.map(item => `
                <button type="button" class="combatv3-skill-item${item.id === state.activeSkillId ? ' is-active' : ''}"
                    data-combatv3-action="select-skill" data-skill-id="${escapeHtml(item.id)}"
                    data-character-id="${escapeHtml(character.id)}" data-group-id="${escapeHtml(group.id)}"
                    aria-current="${item.id === state.activeSkillId ? 'true' : 'false'}" title="${escapeHtml(item.id)}">
                    <span class="combatv3-skill-name">${escapeHtml(item.displayName)}</span>
                    <span class="combatv3-skill-kind">SkillData</span>
                </button>`).join('');
            const groups = characterOpen ? (character.entityKind === 'enemy'
                ? character.groups.map(renderSkillItems).join('')
                : character.groups.map(group => {
                const key = groupKey(character.id, group.id);
                const groupOpen = Boolean(state.query) || state.expandedGroups.has(key);
                const skills = groupOpen ? renderSkillItems(group) : '';
                return `<section class="combatv3-character-group${groupOpen ? ' is-open' : ''}">
                    <button type="button" class="combatv3-character-toggle" data-combatv3-action="toggle-group"
                        data-character-id="${escapeHtml(character.id)}" data-group-id="${escapeHtml(group.id)}"
                        aria-expanded="${groupOpen ? 'true' : 'false'}">
                        <span class="combatv3-character-name">${group.icon ? `<img class="combatv3-group-icon" src="${escapeHtml(skillIconPath(group.icon))}" alt="" onerror="this.hidden=true">` : ''}<span>${escapeHtml(group.displayName)}</span></span>
                        <span class="combatv3-character-count">${escapeHtml(group.skills.length)}</span>
                    </button>
                    <div class="combatv3-skill-list">${skills}</div>
                </section>`;
            }).join('')) : '';
            return `${sectionHeading}<section class="combatv3-character-group${characterOpen ? ' is-open' : ''}">
                <button type="button" class="combatv3-character-toggle" data-combatv3-action="toggle-character"
                    data-character-id="${escapeHtml(character.id)}" aria-expanded="${characterOpen ? 'true' : 'false'}">
                    <span class="combatv3-character-name">${character.icon ? `<img class="combatv3-character-icon" src="${escapeHtml(character.icon)}" alt="" onerror="this.hidden=true">` : ''}<span>${escapeHtml(character.name)}</span></span>
                    <span class="combatv3-character-count">${escapeHtml(total)}</span>
                </button>
                <div class="combatv3-skill-list">${groups}</div>
            </section>`;
        }).join('');
    }

    function renderDirectories() {
        const directory = filteredDirectory();
        renderDirectoryNode(elements.list, directory);
        renderDirectoryNode(elements.mobileList, directory);
        const count = new Set(directory.flatMap(character => character.groups.flatMap(group => group.skills.map(item => item.id)))).size;
        const characterCount = directory.filter(entity => entity.entityKind === 'character').length;
        const enemyCount = directory.filter(entity => entity.entityKind === 'enemy').length;
        if (elements.meta) elements.meta.textContent = `${characterCount} 个角色 · ${enemyCount} 个怪物 · ${count} 条 SkillData`;
    }

    function openMobileList() {
        if (!elements.mobileOverlay) return;
        elements.mobileOverlay.classList.add('is-open');
        elements.mobileOverlay.setAttribute('aria-hidden', 'false');
        elements.mobileButton?.setAttribute('aria-expanded', 'true');
        window.setTimeout(() => elements.mobileSearch?.focus(), 0);
    }

    function closeMobileList() {
        if (!elements.mobileOverlay) return;
        elements.mobileOverlay.classList.remove('is-open');
        elements.mobileOverlay.setAttribute('aria-hidden', 'true');
        elements.mobileButton?.setAttribute('aria-expanded', 'false');
    }

    function ownerFor(skillId, characterId, groupId) {
        const owners = state.skillIndex.get(skillId) || [];
        return owners.find(owner => owner.character.id === characterId && owner.group.id === groupId) || owners[0] || null;
    }

    function patchesFor(skillId) {
        const bundle = state.tables?.patches?.[skillId]?.SkillPatchDataBundle;
        return Array.isArray(bundle) ? bundle.filter(patch => Number.isFinite(Number(patch?.level))) : [];
    }

    function selectLevel(patches, requested, rawLevel) {
        const levels = [...new Set(patches.map(patch => Number(patch.level)))].sort((a, b) => a - b);
        const wanted = Number(requested);
        if (levels.includes(wanted)) return wanted;
        if (levels.length) return levels[levels.length - 1];
        return Number(rawLevel) || wanted || 1;
    }

    function selectedPatch(skillId, level) {
        return patchesFor(skillId).find(patch => Number(patch.level) === Number(level)) || null;
    }

    function loadingHtml(title, message) {
        return `<div class="combatv3-state combatv3-state--loading"><span class="combatv3-spinner" aria-hidden="true"></span><div>
            <h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div></div>`;
    }

    function errorHtml(title, message) {
        return `<div class="combatv3-state combatv3-state--error"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div></div>`;
    }

    async function fetchSkill(item) {
        if (state.skillCache.has(item.id)) return state.skillCache.get(item.id);
        const promise = (async () => {
            const path = item.contentFile || `/public/Json/SkillData/${encodeURIComponent(item.id)}.json`;
            const response = await (window.akeFetch || fetch)(path);
            if (!response.ok) throw new Error(`无法读取 ${item.id}`);
            return response.json();
        })().catch(error => {
            state.skillCache.delete(item.id);
            throw error;
        });
        state.skillCache.set(item.id, promise);
        return promise;
    }

    function normalizeAnalysis(result) {
        const source = isObject(result) ? result : {};
        return {
            basic: isObject(source.basic) ? source.basic : {},
            windows: collection(source.windows),
            hits: collection(source.hits),
            events: collection(source.events),
            links: collection(source.links),
            blackboard: source.blackboard ?? {},
            warnings: collection(source.warnings).map(warning => typeof warning === 'string' ? warning : formatValue(warning))
        };
    }

    async function analyzeCurrent(token) {
        const owner = state.activeOwner;
        const analyzer = window.AKEV3SkillData?.analyzeSkill;
        const entity = owner?.character || {};
        const isCharacter = entity.entityKind === 'character';
        const isEnemy = entity.entityKind === 'enemy';
        const context = {
            level: state.level,
            manifestItem: state.currentItem,
            entity,
            character: isCharacter ? entity : {},
            enemy: isEnemy ? entity : {},
            characterGrowth: isCharacter ? entity.growth || {} : {},
            characterInfo: isCharacter ? entity : {},
            group: owner?.group || {},
            characterConfig: isCharacter ? entity.config || {} : {},
            enemyConfig: isEnemy ? entity.config || {} : {},
            tables: state.tables
        };
        let result;
        if (typeof analyzer !== 'function') {
            result = { warnings: ['战斗分析器尚未加载，当前仅展示原始基础字段。'] };
        } else {
            try {
                result = await analyzer(state.currentData, state.currentPatch, context);
            } catch (error) {
                result = { warnings: [`分析失败：${error.message || error}`] };
            }
        }
        if (token !== state.detailToken) return;
        state.analysisSource = result;
        state.analysis = normalizeAnalysis(result);
        renderDetail();
    }

    async function selectSkill(skillId, options) {
        const settings = options || {};
        const owner = ownerFor(skillId, settings.characterId, settings.groupId);
        if (!owner) return false;
        state.activeSkillId = skillId;
        state.activeOwner = owner;
        state.currentItem = owner.item;
        state.currentData = null;
        state.currentPatch = null;
        state.analysis = emptyAnalysis();
        state.analysisSource = null;
        state.activeTab = 'timeline';
        state.showPerformance = false;
        state.expandedCharacters.add(owner.character.id);
        state.expandedGroups.add(groupKey(owner.character.id, owner.group.id));
        state.level = selectLevel(patchesFor(skillId), isPresent(settings.level) ? settings.level : undefined);
        state.currentPatch = selectedPatch(skillId, state.level);
        renderDirectories();
        closeMobileList();
        elements.detail.innerHTML = loadingHtml(owner.item.displayName, '正在分析战斗数据');
        const token = ++state.detailToken;
        if (settings.updateUrl !== false) updateDeepLink();
        try {
            const raw = await fetchSkill(owner.item);
            if (token !== state.detailToken) return true;
            state.currentData = raw;
            state.level = selectLevel(patchesFor(skillId), state.level, raw?.level);
            state.currentPatch = selectedPatch(skillId, state.level);
            if (settings.updateUrl !== false) updateDeepLink();
            await analyzeCurrent(token);
        } catch (error) {
            if (token === state.detailToken) elements.detail.innerHTML = errorHtml('技能读取失败', error.message || error);
        }
        return true;
    }

    function updateDeepLink() {
        window.__akeRouter?.updateUrl?.(MODULE_ID, state.activeSkillId);
        const url = new URL(window.location.href);
        if (url.searchParams.get('plugin') !== MODULE_ID) return;
        url.searchParams.set('level', String(state.level));
        const historyState = isObject(history.state) ? history.state : {};
        history.replaceState(historyState, '', `${url.pathname}?${url.searchParams.toString()}`);
    }

    function metricValue(key, value) {
        if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'displayValue')) {
            return {
                value: formatValue(value.displayValue),
                unit: isPresent(value.displayUnit) ? formatValue(value.displayUnit) : ''
            };
        }
        value = resolvedScalar(value);
        const lower = String(key).toLowerCase();
        if (lower === 'attackrangetype') {
            const rangeLabel = { melee: '近战', ranged: '远程' }[String(value).toLowerCase()];
            if (rangeLabel) return { value: rangeLabel, unit: '' };
        }
        if (typeof value === 'number' && lower.includes('frame')) {
            return { value: formatValue(value), unit: `帧，约${formatValue(value / 30)}秒` };
        }
        if (typeof value === 'number' && (lower.includes('time') || lower.includes('cooldown'))) return { value: formatValue(value), unit: '秒' };
        return { value: formatValue(value), unit: '' };
    }

    function groupedHits() {
        const groups = new Map();
        state.analysis.hits.forEach((hit, index) => {
            const key = isPresent(hit.eventIndex) ? `event:${hit.eventIndex}` : `${hit.path || 'hit'}:${hit.startFrame ?? index}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    startFrame: hit.startFrame,
                    endFrame: hit.endFrame,
                    damageTypes: new Set(),
                    hp: [],
                    poise: [],
                    other: [],
                    resources: [],
                    effects: [],
                    targetGroupKey: hit.targetGroupKey || '',
                    groupIndex: hit.groupIndex,
                    branchPath: Array.isArray(hit.branchPath) ? hit.branchPath : []
                });
            }
            const group = groups.get(key);
            if (hit.damageType) group.damageTypes.add(hit.damageType);
            if (hit.kind === 'hp') group.hp.push(hit);
            else if (hit.kind === 'poise') group.poise.push(hit);
            else group.other.push(hit);
            (hit.costDataList || []).forEach(cost => group.resources.push(cost));
        });
        groups.forEach(group => {
            group.effects = state.analysis.events.filter(event => ['control', 'buff'].includes(event.category)
                && ((isPresent(group.groupIndex) && event.groupIndex === group.groupIndex)
                    || (event.startFrame === group.startFrame && event.endFrame === group.endFrame)))
                .map((event, index) => eventLabel(event, index));
        });
        return [...groups.values()];
    }

    function numericPoiseSummary(groups) {
        const values = groups.flatMap(group => group.poise.map(hit => Number(resolvedScalar(hit.poiseValue))))
            .filter(Number.isFinite);
        const conditional = groups.some(group => group.branchPath.length > 0);
        return values.length && !conditional ? values.reduce((sum, value) => sum + value, 0) : undefined;
    }

    function superArmorSummary() {
        const windows = state.analysis.windows.filter(item => ['superArmor', 'buffSuperArmor'].includes(item.kind));
        if (!windows.length) return undefined;
        const summaries = windows.map(item => {
            const buffArmor = isObject(item.values)
                ? Object.entries(item.values).find(([key]) => /super.?armor/i.test(key))?.[1]
                : undefined;
            const value = resolvedScalar(item.superArmorValue ?? buffArmor);
            const impact = resolvedScalar(item.impactResistance);
            const range = isPresent(item.startFrame)
                ? `${formatValue(item.startFrame)}${item.endFrame !== item.startFrame ? `–${formatValue(item.endFrame)}` : ''}帧`
                : '';
            return {
                value: [isPresent(value) ? value : item.buffId || 'Buff', isPresent(impact) ? `冲击抗性 ${impact}` : '']
                    .filter(Boolean).join(' · '),
                range
            };
        });
        return {
            displayValue: summaries.map(item => item.value).join(' / '),
            displayUnit: summaries.map(item => item.range).filter(Boolean).join(' / ')
        };
    }

    function coreMetrics() {
        const basic = state.analysis.basic;
        const raw = state.currentData || {};
        const hitGroups = groupedHits();
        const hitFrames = hitGroups.map(hit => Number(hit.startFrame)).filter(Number.isFinite);
        const runtimeCast = basic.runtimeCast || {};
        const targeting = basic.targeting || {};
        const mobility = basic.mobility || {};
        const patch = state.currentPatch || {};
        const runtimeCooldown = runtimeCast.cooldownTime ?? raw.castData?.cooldownTime;
        const definitions = [
            ['durationFrame', '动作总时长', firstValue(basic, ['durationFrame', 'durationFrames', 'totalFrames']) ?? raw.durationFrame, true],
            ['exclusiveFrame', '排他期', firstValue(basic, ['exclusiveFrame', 'exclusiveFrames']) ?? raw.exclusiveFrame, true],
            ['offsetRecordFrame', '续段记录帧', Number(firstValue(basic, ['offsetRecordFrame', 'offsetFrame']) ?? raw.offsetRecordFrame) > 0
                ? firstValue(basic, ['offsetRecordFrame', 'offsetFrame']) ?? raw.offsetRecordFrame : undefined, true],
            ['firstHitFrame', '首段命中', firstValue(basic, ['firstHitFrame', 'startupFrame', 'startupFrames']) ?? (hitFrames.length ? Math.min(...hitFrames) : undefined), true],
            ['lastHitFrame', '末段命中', firstValue(basic, ['lastHitFrame']) ?? (hitFrames.length ? Math.max(...hitFrames) : undefined), false],
            ['hitCount', '命中段数', firstValue(basic, ['hitCount']) ?? hitGroups.length, true],
            ['cooldownTime', '运行时冷却', hasNonZeroValue(runtimeCooldown) ? runtimeCooldown : undefined, false],
            ['startCdFrame', '资源提交帧', runtimeCast.startCdFrame ?? raw.castData?.startCdFrame, false],
            ['attackRangeType', '攻击距离类型', targeting.attackRangeType, false],
            ['castDistance', '施放距离', targeting.castDistance ?? raw.castData?.castDistance, false],
            ['poiseDamage', '确定路径总削韧', numericPoiseSummary(hitGroups), false],
            ['patchCost', '等级配置消耗', hasNonZeroValue(patch.costValue) ? `${costTypeLabel(patch.costType)} ${formatValue(patch.costValue)}` : undefined, false],
            ['runtimeCost', '运行时消耗', hasNonZeroValue(runtimeCast.costValue) ? `${costTypeLabel(runtimeCast.costType)} ${formatValue(resolvedScalar(runtimeCast.costValue))}` : undefined, false],
            ['superArmor', '技能抗打断', superArmorSummary(), true],
            ['canMove', '可移动施放', mobility.canMove === true ? true : undefined, false],
            ['canCastInAir', '可空中施放', mobility.canCastInAir === true ? true : undefined, false],
            ['dontInterruptCombo', '保持连段标记', raw.dontInterruptCombo === true ? true : undefined, false]
        ];
        return definitions.filter(row => isPresent(row[2]));
    }

    function patchMetrics() {
        const patch = state.currentPatch || {};
        const hasCost = hasNonZeroValue(patch.costValue);
        return [
            ['level', '等级', patch.level],
            ['cooldownTime', '冷却', hasNonZeroValue(patch.coolDown) ? patch.coolDown : undefined],
            ['costType', '消耗类型', hasCost ? costTypeLabel(patch.costType) : undefined],
            ['costValue', '消耗值', hasCost ? patch.costValue : undefined]
        ].filter(row => isPresent(row[2]));
    }

    function renderIdentity() {
        const owner = state.activeOwner;
        const raw = state.currentData || {};
        const basic = state.analysis.basic;
        const patch = state.currentPatch || {};
        const icon = skillIconPath(patch.iconId || owner.group.icon) || owner.character.icon || '';
        const entityLabel = owner.character.entityKind === 'enemy' ? '怪物'
            : (owner.character.entityKind === 'character' ? '角色' : '归类');
        const isEnemy = owner.character.entityKind === 'enemy';
        const title = gameText(patch.skillName,
            firstValue(basic, ['name', 'skillName', 'title']) || raw.skillName || owner.item.displayName);
        const levels = [...new Set(patchesFor(owner.item.id).map(item => Number(item.level)))].sort((a, b) => a - b);
        const options = (levels.length ? levels : [state.level]).map(level =>
            `<option value="${escapeHtml(level)}"${Number(level) === Number(state.level) ? ' selected' : ''}>等级 ${escapeHtml(level)}</option>`).join('');
        const tags = [raw.castType, raw.skillSpecification, raw.passiveSkillType].filter(Boolean);
        return `<header class="combatv3-detail-header">
            <div class="combatv3-detail-heading${icon ? '' : ' without-icon'}">${icon ? `<img class="combatv3-detail-icon" src="${escapeHtml(icon)}" alt="" onerror="this.remove();this.parentElement.classList.add('without-icon')">` : ''}<div class="combatv3-detail-copy">
                <div class="combatv3-eyebrow">${escapeHtml(owner.character.name)}${isEnemy ? '' : ` · ${escapeHtml(owner.group.displayName)}`}</div>
                <h1 class="combatv3-detail-title">${escapeHtml(title)}</h1>
                <p class="combatv3-detail-subtitle">${escapeHtml(raw.skillId || owner.item.id)}</p></div></div>
            <code class="combatv3-detail-id" title="${escapeHtml(owner.item.id)}">${escapeHtml(owner.item.id)}</code>
        </header>
        <div class="combatv3-context-row">
            <label class="combatv3-context-item"><span>等级</span><select id="combatv3LevelSelect"${levels.length <= 1 ? ' disabled' : ''}>${options}</select></label>
            <span class="combatv3-context-item"><span>${escapeHtml(entityLabel)}</span><strong>${escapeHtml(owner.character.name)}</strong></span>
            ${isEnemy ? '' : `<span class="combatv3-context-item"><span>技能组</span><strong>${escapeHtml(owner.group.displayName)}</strong></span>`}
        </div>
        ${tags.length ? `<div class="combatv3-tag-row">${tags.map((tag, index) => `<span class="combatv3-tag${index === 0 ? ' combatv3-tag--accent' : ''}">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}`;
    }

    function renderCore() {
        const metrics = coreMetrics();
        const metricHtml = metrics.length ? metrics.map(([key, label, rawValue, important]) => {
            const value = metricValue(key, rawValue);
            return `<div class="combatv3-metric${important ? ' is-important' : ''}"><span class="combatv3-metric-label">${escapeHtml(label)}</span>
                <strong class="combatv3-metric-value">${escapeHtml(value.value)}</strong>${value.unit ? `<span class="combatv3-metric-unit">${escapeHtml(value.unit)}</span>` : ''}</div>`;
        }).join('') : '<div class="combatv3-empty-inline">分析器未返回核心指标</div>';
        const patches = patchMetrics();
        const patchHtml = patches.length ? `<section class="combatv3-section">
            <header class="combatv3-section-header"><h3 class="combatv3-section-title">技能等级配置</h3></header>
            <div class="combatv3-metric-grid">${patches.map(([key, label, rawValue]) => {
                const value = metricValue(key, rawValue);
                return `<div class="combatv3-metric"><span class="combatv3-metric-label">${escapeHtml(label)}</span>
                    <strong class="combatv3-metric-value">${escapeHtml(value.value)}</strong>${value.unit ? `<span class="combatv3-metric-unit">${escapeHtml(value.unit)}</span>` : ''}</div>`;
            }).join('')}</div></section>` : '';
        return `${patchHtml}<section class="combatv3-section"><header class="combatv3-section-header"><h2 class="combatv3-section-title">核心指标</h2>
            <span class="combatv3-section-note">关键战斗字段</span></header><div class="combatv3-metric-grid">${metricHtml}</div></section>`;
    }

    function frameOf(item, names) {
        const value = Number(firstValue(item, names));
        return Number.isFinite(value) ? value : null;
    }

    function timelineMax() {
        const values = [Number(state.currentData?.durationFrame), Number(firstValue(state.analysis.basic, ['durationFrame', 'durationFrames', 'totalFrames']))];
        [...state.analysis.windows, ...state.analysis.hits, ...state.analysis.events].forEach(item => {
            values.push(frameOf(item, ['frame', 'startFrame', 'start', 'from']), frameOf(item, ['endFrame', 'end', 'to']));
        });
        return Math.max(1, ...values.filter(Number.isFinite));
    }

    function windowKind(item) {
        const text = `${item.kind || ''} ${item.type || ''} ${item.category || ''} ${item.label || ''}`.toLowerCase();
        if (/hit|damage|命中|伤害/.test(text)) return 'hit';
        if (/invul|dodge|无敌|闪避/.test(text)) return 'invulnerable';
        if (/cancel|interrupt|allownext|combocache|candash|取消|接续|缓存/.test(text)) return 'cancel';
        if (/offset|exclusive|续段|排他/.test(text)) return 'offset';
        if (/resource|cost|sp|资源|消耗/.test(text)) return 'resource';
        return 'default';
    }

    function windowLabel(item, index) {
        const kind = firstValue(item, ['kind']);
        return firstValue(item, ['label', 'name', 'title']) || WINDOW_LABELS[kind] || ACTION_LABELS[item.type]
            || firstValue(item, ['type', '__key']) || `窗口 ${index + 1}`;
    }

    function resolvedLabel(value) {
        if (!isObject(value)) return formatValue(value);
        const scalar = resolvedScalar(value);
        const suffix = value.usesBlackboard && value.blackboardKey ? ` (${value.blackboardKey})` : '';
        return `${formatValue(scalar)}${suffix}`;
    }

    function windowDetail(item) {
        if (item.kind === 'superArmor') {
            return `抗打断 ${resolvedLabel(item.superArmorValue)} · 冲击抗性 ${resolvedLabel(item.impactResistance)}`;
        }
        if (item.kind === 'buffSuperArmor' || item.kind === 'damageImmune') return item.buffId || '';
        if (item.kind === 'allowNextSkill') return (item.allowedSkillIds || []).join(' / ');
        if (item.kind === 'comboCache') return (item.mappings || []).map(mapping => `${mapping.command || '输入'} → ${mapping.skillId}`).join(' / ');
        if (item.kind === 'hitStop' || item.kind === 'timeDilation') return `持续 ${resolvedLabel(item.duration)}`;
        if (item.kind === 'movement') return formatValue(item.values);
        if (item.kind === 'damage') return `${item.unitCount || 0} 个结算单元${item.targetGroupKey ? ` · ${item.targetGroupKey}` : ''}`;
        return formatValue(firstValue(item, ['detail', 'details', 'description', 'note', 'condition']));
    }

    function renderWindowStage(rows, emptyText) {
        if (!rows.length) return `<div class="combatv3-empty-inline">${escapeHtml(emptyText)}</div>`;
        const max = timelineMax();
        const ruler = [0, 20, 40, 60, 80, 100].map(percent => `<span>${escapeHtml(Math.round(max * percent / 100))}</span>`).join('');
        const lanes = rows.map((item, index) => {
            const start = frameOf(item, ['startFrame', 'frame', 'start', 'from']) ?? 0;
            const end = frameOf(item, ['endFrame', 'end', 'to']) ?? start;
            const left = Math.max(0, Math.min(100, start / max * 100));
            const width = Math.max(0.35, Math.min(100 - left, Math.max(0, end - start) / max * 100));
            const label = windowLabel(item, index);
            const detail = windowDetail(item);
            const tooltip = `${label} · ${start === end ? `${start} 帧` : `${start}–${end} 帧`}${isPresent(detail) ? ` · ${formatValue(detail)}` : ''}`;
            const kind = windowKind(item);
            const blockClass = start === end ? 'combatv3-window-point' : `combatv3-window combatv3-window--${kind}`;
            return `<div class="combatv3-window-lane"><span class="combatv3-lane-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
                <div class="combatv3-lane-track"><span class="${blockClass}" style="left:${escapeHtml(left)}%;width:${escapeHtml(width)}%;"
                    data-combatv3-tooltip="${escapeHtml(tooltip)}">${start === end ? '' : `<span>${escapeHtml(label)}</span>`}</span></div></div>`;
        }).join('');
        return `<div class="combatv3-window-scroll"><div class="combatv3-window-stage"><div class="combatv3-window-ruler">
            <span class="combatv3-lane-label">帧</span><div class="combatv3-ruler-track">${ruler}</div></div>${lanes}</div></div>`;
    }

    function renderWindows() {
        return `<section class="combatv3-section"><header class="combatv3-section-header"><h2 class="combatv3-section-title">关键窗口</h2>
            <span class="combatv3-section-count">${escapeHtml(state.analysis.windows.length)} 项</span></header>
            ${renderWindowStage(state.analysis.windows, '未识别到命中、取消、抗打断、无敌或续段窗口')}</section>`;
    }

    function hitCell(hit, paths) {
        return formatValue(firstValue(hit, paths));
    }

    function hitScale(hit) {
        const value = resolvedScalar(hit.atkScale);
        if (typeof value === 'number') return `${formatValue(value * 100)}% ATK`;
        return resolvedLabel(hit.atkScale);
    }

    function hitPoise(hit) {
        return resolvedLabel(hit.poiseValue);
    }

    function hitResources(group) {
        return group.resources.filter(cost => hasNonZeroValue(cost.costValue))
            .map(cost => `${costTypeLabel(cost.costType) || '资源'} ${resolvedLabel(cost.costValue)}`)
            .concat(group.effects).join(' / ');
    }

    function renderHits() {
        const hits = groupedHits();
        const body = hits.map((hit, index) => `<tr><td>${escapeHtml(index + 1)}</td>
            <td>${escapeHtml(`F${hit.startFrame ?? '--'}${hit.endFrame !== hit.startFrame ? `–${hit.endFrame}` : ''}`)}</td>
            <td>${escapeHtml([...hit.damageTypes].map(attackAttributeLabel).join(' / ') || '--')}</td>
            <td>${escapeHtml(hit.hp.map(hitScale).join(' / ') || '--')}</td>
            <td>${escapeHtml(hit.poise.map(hitPoise).join(' / ') || '--')}</td>
            <td data-column="logic">${escapeHtml(hitResources(hit) || '--')}</td>
            <td data-column="note">${escapeHtml([hit.branchPath.join(' → '), hit.targetGroupKey].filter(Boolean).join(' · ') || '--')}</td></tr>`).join('');
        return `<section class="combatv3-section"><header class="combatv3-section-header"><h2 class="combatv3-section-title">命中账本</h2>
            <span class="combatv3-section-count">${escapeHtml(hits.length)} 段</span></header>
            ${hits.length ? `<div class="combatv3-ledger-scroll"><table class="combatv3-ledger"><thead><tr><th>#</th><th>时点</th><th>类型</th><th>倍率/伤害</th><th>破韧/失衡</th><th>资源/异常</th><th>条件/目标</th></tr></thead><tbody>${body}</tbody></table></div>`
                : '<div class="combatv3-empty-inline">未识别到命中结算</div>'}</section>`;
    }

    function isPerformanceEvent(event) {
        if (event.isCombat === true || event.combat === true) return false;
        if (event.isCombat === false || event.combat === false || event.presentation === true) return true;
        const text = `${event.class || ''} ${event.category || ''} ${event.kind || ''} ${event.type || ''}`.toLowerCase();
        return /presentation|performance|visual|vfx|effect|audio|sound|camera|ui|animation/.test(text);
    }

    function eventLabel(event, index) {
        return firstValue(event, ['label', 'name', 'title']) || ACTION_LABELS[event.type]
            || firstValue(event, ['action', 'type', 'kind', '__key']) || `事件 ${index + 1}`;
    }

    function renderTimeline() {
        const events = state.showPerformance ? state.analysis.events : state.analysis.events.filter(event => !isPerformanceEvent(event));
        state.timelineEvents = events;
        const rows = events.map((event, index) => ({ ...event, label: eventLabel(event, index) }));
        return `<div class="combatv3-context-row"><button type="button" class="combatv3-segment-tab" data-combatv3-action="toggle-performance"
            aria-pressed="${state.showPerformance ? 'true' : 'false'}">${state.showPerformance ? '含表现事件' : '仅战斗事件'}</button>
            <span class="combatv3-section-note">${escapeHtml(events.length)} / ${escapeHtml(state.analysis.events.length)} 项</span></div>
            ${renderWindowStage(rows, '分析器未返回战斗时间轴事件')}`;
    }

    function linkClass(link) {
        const text = `${link.kind || ''} ${link.type || ''} ${link.result || ''}`.toLowerCase();
        if (/condition|check|条件/.test(text)) return 'is-condition';
        if (/fail|failure|失败/.test(text)) return 'is-failure';
        if (/result|success|结果/.test(text)) return 'is-result';
        return 'is-event';
    }

    function renderLogic() {
        const links = state.analysis.links;
        const branchEvents = state.analysis.events.filter(event => Array.isArray(event.branchPath) && event.branchPath.length);
        if (!links.length && !branchEvents.length) return '<div class="combatv3-empty-inline">未识别到条件、跳转或后继动作</div>';
        const nodes = links.map((link, index) => {
            const title = firstValue(link, ['label', 'name', 'title', 'to', 'targetId', 'id', '__key']) || `逻辑 ${index + 1}`;
            const kicker = firstValue(link, ['kind', 'type', 'category']) || 'Link';
            const detail = firstValue(link, ['condition', 'detail', 'description', 'from', 'sourceId', 'path']);
            return `<article class="combatv3-logic-node ${linkClass(link)}"><div class="combatv3-logic-kicker">${escapeHtml(kicker)}</div>
                <div class="combatv3-logic-title">${escapeHtml(title)}</div>${isPresent(detail) ? `<div class="combatv3-logic-detail">${escapeHtml(formatValue(detail))}</div>` : ''}</article>`;
        });
        branchEvents.forEach((event, index) => {
            nodes.push(`<article class="combatv3-logic-node is-condition"><div class="combatv3-logic-kicker">条件分支</div>
                <div class="combatv3-logic-title">${escapeHtml(event.branchPath.join(' → '))}</div>
                <div class="combatv3-logic-detail">${escapeHtml(eventLabel(event, index))} · F${escapeHtml(event.startFrame ?? '--')}</div></article>`);
        });
        return `<div class="combatv3-logic-node"><div class="combatv3-logic-kicker">根技能</div>
            <div class="combatv3-logic-title">${escapeHtml(state.activeSkillId)}</div></div>
            <div class="combatv3-logic-branches">${nodes.join('')}</div>`;
    }

    function blackboardRows() {
        const value = state.analysis.blackboard;
        if (Array.isArray(value?.entries)) return value.entries.map((row, index) => [row?.key ?? index,
            `${formatValue(row?.value)} · ${row?.source === 'patch' ? `SkillPatch Lv.${row?.level ?? '?'}` : 'SkillData 默认值'}`]);
        if (Array.isArray(value)) return value.map((row, index) => [row?.key ?? row?.name ?? index, row?.resolvedValue ?? row?.value ?? row]);
        if (isObject(value)) return Object.entries(value);
        return isPresent(value) ? [['value', value]] : [];
    }

    function renderDebug() {
        const warnings = state.analysis.warnings;
        const boards = blackboardRows();
        const warningHtml = warnings.length ? warnings.map(warning => `<div class="combatv3-note is-warning">${escapeHtml(warning)}</div>`).join('') : '';
        const boardHtml = boards.length ? `<dl class="combatv3-definition-list">${boards.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatValue(value))}</dd>`).join('')}</dl>`
            : '<div class="combatv3-empty-inline">没有解析后的黑板值</div>';
        const events = state.analysis.events;
        const eventTable = events.length ? `<div class="combatv3-ledger-scroll"><table class="combatv3-data-table"><thead><tr><th>#</th><th>分类</th><th>时点</th><th>事件</th><th>详情</th></tr></thead><tbody>
            ${events.map((event, index) => `<tr><td>${escapeHtml(index + 1)}</td><td>${escapeHtml(isPerformanceEvent(event) ? '表现' : '战斗')}</td>
                <td>${escapeHtml(formatValue(firstValue(event, ['frame', 'startFrame', 'time'])))}</td><td>${escapeHtml(eventLabel(event, index))}</td>
                <td data-column="note">${escapeHtml(formatValue(firstValue(event, ['detail', 'details', 'description', 'note', 'condition'])))}</td></tr>`).join('')}</tbody></table></div>` : '';
        return `${warningHtml}<section class="combatv3-section"><header class="combatv3-section-header"><h3 class="combatv3-section-title">黑板解析</h3></header>${boardHtml}</section>
            <section class="combatv3-section"><header class="combatv3-section-header"><h3 class="combatv3-section-title">全部事件</h3><span class="combatv3-section-count">${escapeHtml(events.length)} 项</span></header>${eventTable || '<div class="combatv3-empty-inline">没有事件</div>'}</section>
            <section class="combatv3-section"><details class="combatv3-raw"><summary>分析器输出</summary><pre>${escapeHtml(safeJson(state.analysisSource))}</pre></details>
            <details class="combatv3-raw"><summary>当前等级 SkillPatch</summary><pre>${escapeHtml(safeJson(state.currentPatch))}</pre></details>
            <details class="combatv3-raw"><summary>原始 SkillData</summary><pre>${escapeHtml(safeJson(state.currentData))}</pre></details></section>`;
    }

    function renderTabs() {
        const tabs = [['timeline', '战斗时间轴'], ['logic', '逻辑链'], ['debug', '调试数据']];
        const content = state.activeTab === 'logic' ? renderLogic() : (state.activeTab === 'debug' ? renderDebug() : renderTimeline());
        return `<section class="combatv3-section"><div class="combatv3-segment-tabs" role="tablist">${tabs.map(([id, label]) =>
            `<button type="button" class="combatv3-segment-tab${state.activeTab === id ? ' is-active' : ''}" role="tab" data-combatv3-tab="${escapeHtml(id)}"
                aria-selected="${state.activeTab === id ? 'true' : 'false'}">${escapeHtml(label)}</button>`).join('')}</div>
            <div class="combatv3-section" role="tabpanel">${content}</div></section>`;
    }

    function renderSourceWarning() {
        const dataState = window.akeDataSource?.getState?.();
        if (!dataState || dataState.selection === 'latest') return '';
        return '<div class="combatv3-note is-warning">当前 SkillData 使用共享最新数据，角色与等级表使用所选历史版本；跨版本字段仅供对照。</div>';
    }

    function renderDetail() {
        if (!state.currentData || !state.activeOwner) return;
        elements.detail.innerHTML = `${renderIdentity()}${renderSourceWarning()}${renderCore()}${renderWindows()}${renderHits()}${renderTabs()}`;
    }

    function setQuery(value) {
        state.query = String(value || '').trim().toLowerCase();
        if (elements.search && elements.search.value !== value) elements.search.value = value;
        if (elements.mobileSearch && elements.mobileSearch.value !== value) elements.mobileSearch.value = value;
        renderDirectories();
    }

    function onDirectoryClick(event) {
        const button = event.target.closest('[data-combatv3-action]');
        if (!button) return;
        const action = button.dataset.combatv3Action;
        const characterId = button.dataset.characterId;
        const groupId = button.dataset.groupId;
        if (action === 'toggle-character') {
            if (state.expandedCharacters.has(characterId)) state.expandedCharacters.delete(characterId);
            else state.expandedCharacters.add(characterId);
            renderDirectories();
        } else if (action === 'toggle-group') {
            const key = groupKey(characterId, groupId);
            if (state.expandedGroups.has(key)) state.expandedGroups.delete(key);
            else state.expandedGroups.add(key);
            renderDirectories();
        } else if (action === 'select-skill') {
            selectSkill(button.dataset.skillId, { characterId, groupId, updateUrl: true });
        }
    }

    function onDetailClick(event) {
        const tab = event.target.closest('[data-combatv3-tab]');
        if (tab) {
            state.activeTab = tab.dataset.combatv3Tab;
            renderDetail();
            return;
        }
        const action = event.target.closest('[data-combatv3-action]')?.dataset.combatv3Action;
        if (action === 'toggle-performance') {
            state.showPerformance = !state.showPerformance;
            renderDetail();
        }
    }

    function onDetailChange(event) {
        if (event.target.id !== 'combatv3LevelSelect') return;
        state.level = Number(event.target.value);
        state.currentPatch = selectedPatch(state.activeSkillId, state.level);
        updateDeepLink();
        const token = ++state.detailToken;
        elements.detail.innerHTML = loadingHtml(state.currentItem?.displayName || state.activeSkillId, '正在切换技能等级');
        analyzeCurrent(token);
    }

    function showTooltip(target, event) {
        if (!elements.tooltip || !target?.dataset.combatv3Tooltip) return;
        elements.tooltip.textContent = target.dataset.combatv3Tooltip;
        elements.tooltip.classList.add('is-visible');
        elements.tooltip.setAttribute('aria-hidden', 'false');
        moveTooltip(event);
    }

    function moveTooltip(event) {
        if (!elements.tooltip?.classList.contains('is-visible')) return;
        elements.tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 14)}px`;
        elements.tooltip.style.top = `${Math.min(window.innerHeight - 100, event.clientY + 14)}px`;
    }

    function hideTooltip() {
        if (!elements.tooltip) return;
        elements.tooltip.classList.remove('is-visible');
        elements.tooltip.setAttribute('aria-hidden', 'true');
    }

    function onPointerOver(event) {
        const target = event.target.closest('[data-combatv3-tooltip]');
        if (target) showTooltip(target, event);
    }

    function onOverlayClick(event) {
        if (event.target === elements.mobileOverlay) closeMobileList();
    }

    function onKeyDown(event) {
        if (event.key === 'Escape') closeMobileList();
    }

    async function fetchManifest() {
        const response = await (window.akeFetch || fetch)('/public/Json/SkillData/manifest.json');
        if (!response.ok) throw new Error('无法加载 SkillData 清单');
        const data = await response.json();
        return Array.isArray(data) ? data : Object.values(data || {});
    }

    async function load(options) {
        const preserve = options?.preserve === true;
        const token = ++state.loadToken;
        if (!preserve) elements.detail.innerHTML = loadingHtml(MODULE_TITLE, '正在建立角色与技能目录');
        try {
            if (window.configLoaded) await window.configLoaded;
            const [manifest, characters, growth, patches, enemyDisplay, enemies] = await Promise.all([
                fetchManifest(),
                window.AKEV3.table('CharacterTable'),
                window.AKEV3.table('CharGrowthTable'),
                window.AKEV3.table('SkillPatchTable'),
                window.AKEV3.table('EnemyTemplateDisplayInfoTable'),
                window.AKEV3.table('EnemyTable')
            ]);
            if (token !== state.loadToken) return;
            const previousId = preserve ? state.activeSkillId : '';
            const previousLevel = preserve ? state.level : null;
            state.rawManifest = manifest;
            state.manifest = manifest.filter(item => !isSuppressedEntity(item.id) && (showHidden() || !item.hidden))
                .sort((a, b) => Number(a.priority ?? 999999) - Number(b.priority ?? 999999) || String(a.id).localeCompare(String(b.id)));
            state.tables = { characters, growth, patches, enemyDisplay, enemies };
            state.skillCache.clear();
            state.directory = buildDirectory(state.manifest, characters, growth, enemyDisplay, enemies);
            rebuildSkillIndex();
            renderDirectories();

            const deepId = state.pendingDeepId;
            state.pendingDeepId = '';
            const wantedId = deepId || previousId;
            if (wantedId && state.skillIndex.has(wantedId)) {
                await selectSkill(wantedId, { level: deepId ? state.level : previousLevel, updateUrl: !deepId });
                return;
            }
            if (deepId) {
                const existsButHidden = state.rawManifest.some(item => item.id === deepId);
                window.__akeRouter?.onDeepLinkNotFound?.(deepId, existsButHidden);
            }
            const firstCharacter = state.directory.find(character => !character.isOther) || state.directory[0];
            const firstOwner = firstCharacter && firstCharacter.groups[0]?.skills[0];
            if (firstOwner) await selectSkill(firstOwner.id, { level: state.level, updateUrl: true });
            else elements.detail.innerHTML = errorHtml('没有可展示的数据', 'SkillData 清单为空');
        } catch (error) {
            if (token !== state.loadToken) return;
            if (elements.meta) elements.meta.textContent = '读取失败';
            elements.list.innerHTML = '';
            if (elements.mobileList) elements.mobileList.innerHTML = '';
            elements.detail.innerHTML = errorHtml('战斗数据读取失败', error.message || error);
        }
    }

    function onGlobalConfigChanged() {
        if (!document.body.contains(root)) return;
        load({ preserve: true });
    }

    function bind() {
        elements.list.addEventListener('click', onDirectoryClick);
        elements.mobileList?.addEventListener('click', onDirectoryClick);
        elements.search?.addEventListener('input', onSearchInput);
        elements.mobileSearch?.addEventListener('input', onSearchInput);
        elements.mobileButton?.addEventListener('click', openMobileList);
        elements.mobileClose?.addEventListener('click', closeMobileList);
        elements.mobileOverlay?.addEventListener('click', onOverlayClick);
        elements.detail.addEventListener('click', onDetailClick);
        elements.detail.addEventListener('change', onDetailChange);
        elements.detail.addEventListener('pointerover', onPointerOver);
        elements.detail.addEventListener('pointermove', moveTooltip);
        elements.detail.addEventListener('pointerout', hideTooltip);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('globalConfigChanged', onGlobalConfigChanged);
    }

    function onSearchInput(event) {
        setQuery(event.target.value);
    }

    function destroy() {
        state.loadToken += 1;
        state.detailToken += 1;
        elements.list.removeEventListener('click', onDirectoryClick);
        elements.mobileList?.removeEventListener('click', onDirectoryClick);
        elements.search?.removeEventListener('input', onSearchInput);
        elements.mobileSearch?.removeEventListener('input', onSearchInput);
        elements.mobileButton?.removeEventListener('click', openMobileList);
        elements.mobileClose?.removeEventListener('click', closeMobileList);
        elements.mobileOverlay?.removeEventListener('click', onOverlayClick);
        elements.detail.removeEventListener('click', onDetailClick);
        elements.detail.removeEventListener('change', onDetailChange);
        elements.detail.removeEventListener('pointerover', onPointerOver);
        elements.detail.removeEventListener('pointermove', moveTooltip);
        elements.detail.removeEventListener('pointerout', hideTooltip);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('globalConfigChanged', onGlobalConfigChanged);
        hideTooltip();
    }

    bind();
    window.__akeV3SkillController = {
        id: MODULE_ID,
        title: MODULE_TITLE,
        refresh: () => load({ preserve: true }),
        selectSkill: (skillId, level) => selectSkill(skillId, { level, updateUrl: true }),
        destroy
    };
    window.AKEV3Skill = window.__akeV3SkillController;
    load();
})();
