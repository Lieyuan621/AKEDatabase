(function () {
    'use strict';

    const MODULE_ID = 'guide_image_generator';
    const IMAGE_ROOT = '/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites';
    const PROFESSION_NAMES = { 0: '近卫', 2: '重装', 4: '辅助', 5: '术师', 7: '先锋', 8: '突击' };
    const ELEMENT_NAMES = { 0: '物理', 1: '灼热', 2: '寒冷', 3: '自然', 4: '电磁', 5: '物理', Pulse: '电磁', Fire: '灼热', Cold: '寒冷', Natural: '自然', Physical: '物理', Cryst: '寒冷' };
    const SKILL_NAMES = ['普通攻击', '战技', '连携技', '终结技'];
    const COLORS = ['#f4b400', '#f28c28', '#70a94b', '#d86b53', '#7b6bc7', '#4f92c6'];
    const DEFAULT_LAYOUTS = {
        horizontal: {
            portrait: { x: 30, y: 20, w: 300, h: 340, label: '角色立绘' },
            skills: { x: 340, y: 20, w: 610, h: 340, label: '技能加点' },
            potential: { x: 966, y: 20, w: 924, h: 504, label: '潜能收益' },
            weapons: { x: 30, y: 372, w: 320, h: 504, label: '武器建议' },
            equips: { x: 366, y: 372, w: 588, h: 504, label: '装备建议' },
            ratio: { x: 966, y: 540, w: 462, h: 338, label: '倍率分布' },
            damage: { x: 1444, y: 540, w: 446, h: 338, label: '伤害分布' }
        },
        vertical: {
            header: { x: 35, y: 115, w: 1850, h: 220, label: '干员信息' },
            recommendations: { x: 35, y: 359, w: 1850, h: 420, label: '技能与推荐' },
            equipments: { x: 35, y: 803, w: 1850, h: 600, label: '武器与装备推荐' },
            timeline: { x: 35, y: 1427, w: 1850, h: 210, label: '排轴展示' },
            potential: { x: 35, y: 1671, w: 1850, h: 592, label: '潜能收益' },
            team: { x: 35, y: 2287, w: 1850, h: 680, label: '队伍配装' }
        }
    };
    const root = document.querySelector('[data-misc-module="guide_image_generator"]');
    if (!root) return;

    const $ = selector => root.querySelector(selector);
    const canvas = $('#guideImageCanvas');
    const ctx = canvas?.getContext('2d');
    const status = $('#guideImageGeneratorStatus');
    const dimensions = $('#guideImageDimensions');
    const imageCache = new Map();
    let disposed = false;
    let characters = [];
    let characterTable = {};
    let growthTable = {};
    let skillPatchTable = {};
    let itemTable = {};
    let weaponTable = {};
    let equipTable = {};
    let attributeNames = {};
    let state = {
        mode: 'horizontal', title: '', background: '#212121', characterId: '', characterName: '', description: '',
        skills: SKILL_NAMES.map(name => ({ name, rank: '9' })), weapons: Array.from({ length: 4 }, () => ({ id: '', note: '' })),
        equips: Array.from({ length: 8 }, () => ({ id: '', note: '' })), team: Array.from({ length: 4 }, () => ''),
        potentialLabels: '0潜,1潜,2潜,3潜,4潜,5潜,5+6潜', potentialValues: '100,110,115,115,119,134,163',
        potentialNote: '数值可按实际攻略内容修改', teamNote: '可在这里补充队伍循环、装备选择和使用说明。',
        ratio: '大招:0,战技:54.3,连携:16.55,普攻:29.15', damage: '大招:0,战技:65.87,连携:13.2,普攻:20.93',
        layout: { horizontal: {}, vertical: {} }, layoutMode: false
    };

    function layoutRect(mode, id) {
        const fallback = DEFAULT_LAYOUTS[mode][id];
        const custom = state.layout?.[mode]?.[id] || {};
        return { ...fallback, ...custom };
    }

    function layoutSize(mode) {
        if (mode === 'horizontal') return { width: 1920, height: 1080 };
        const last = layoutRect('vertical', 'team');
        return { width: 1920, height: Math.max(2967, last.y + last.h + 35) };
    }

    function setStatus(message, kind) {
        if (!status) return;
        status.textContent = message || '';
        status.dataset.state = kind || '';
    }

    function text(value, fallback) {
        return context.text(value, fallback) || fallback || '';
    }

    function assetUrl(path) {
        return context.dataResourceUrl(`${IMAGE_ROOT}/${path}`);
    }

    function characterName(id, row) {
        const fallback = id === 'chr_0002_endminm' ? '管理员（男）' : id === 'chr_0003_endminf' ? '管理员（女）' : id;
        return text(row?.name, fallback);
    }

    function itemName(id) {
        return text(itemTable[id]?.name, id);
    }

    function image(path) {
        if (!path) return Promise.resolve(null);
        const url = assetUrl(path);
        if (imageCache.has(url)) return imageCache.get(url);
        const request = new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
        imageCache.set(url, request);
        return request;
    }

    function characterImage(id) { return image(`charroundicon/icon_round_${id}.png`); }
    function portraitImage(id) { return image(`charicon/icon_${id}.png`); }
    function skillImage(icon) { return image(`skillicon/${icon}.png`); }
    function itemImage(id) { return image(`itemiconbig/${itemTable[id]?.iconId || id}.png`); }

    function buildAttributeNames(filters, shows) {
        attributeNames = {};
        Object.entries(shows || {}).forEach(([attrType, group]) => (group.list || []).forEach(entry => {
            if (entry.name) attributeNames[`${entry.attributeModifier}:${attrType}:`] = text(entry.name, '');
        }));
        Object.values(filters || {}).forEach(group => (group.list || []).forEach(entry => {
            const name = text(entry.name, '');
            if (!name) return;
            const key = `${entry.attributeModifier}:${entry.attributeType}:${entry.compositeAttr || ''}`;
            attributeNames[key] = name;
            if (entry.compositeAttr) attributeNames[entry.compositeAttr] = name;
        }));
    }

    function autoEntryLabels(id, kind) {
        if (kind === 'weapon') {
            const row = weaponTable[id] || {};
            return (row.weaponSkillList || []).map(skillId => {
                const bundle = skillPatchTable[skillId]?.SkillPatchDataBundle || [];
                const skill = bundle[bundle.length - 1] || {};
                return text(skill.skillName, '') || text(skill.description, '') || skillId;
            }).filter(Boolean).slice(0, 3);
        }
        const row = equipTable[id] || {};
        return (row.displayAttrModifiers || []).map(modifier => {
            const key = `${modifier.modifierType}:${modifier.attrType}:${modifier.compositeAttr || ''}`;
            return attributeNames[key] || attributeNames[modifier.compositeAttr] || `属性 ${modifier.attrType}`;
        }).filter(Boolean).slice(0, 3);
    }

    function syncAutoEntry(entry, kind) {
        entry.note = autoEntryLabels(entry.id, kind).join(',');
    }

    function normalizeNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function splitList(value, fallback) {
        const result = String(value || '').split(/[,，]/).map(item => item.trim()).filter(Boolean);
        return result.length ? result : fallback;
    }

    function option(value, label) {
        const element = document.createElement('option');
        element.value = value;
        element.textContent = label;
        return element;
    }

    function populateSelect(select, values, selected) {
        select.replaceChildren(...values.map(item => option(item.value, item.label)));
        if (selected != null) select.value = selected;
    }

    function createRow(label, control) {
        const row = document.createElement('div');
        row.className = 'ake-ui-form-row';
        const title = document.createElement('label');
        title.textContent = label;
        row.append(title, control);
        return row;
    }

    function createSelect(values, selected, label) {
        const select = document.createElement('select');
        select.className = 'ake-ui-control ake-ui-control--select';
        select.setAttribute('aria-label', label);
        populateSelect(select, values, selected);
        return select;
    }

    function createAssetPicker(values, selected, label, onChange) {
        const wrapper = document.createElement('div');
        wrapper.className = 'guide-image-picker';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'guide-image-picker__button';
        button.setAttribute('aria-label', label);
        const buttonImage = document.createElement('img');
        buttonImage.alt = '';
        const buttonText = document.createElement('span');
        button.append(buttonImage, buttonText);
        const panel = document.createElement('div');
        panel.className = 'guide-image-picker__panel';
        panel.hidden = true;
        const search = createInput('', `${label}搜索`);
        search.classList.add('guide-image-picker__search');
        panel.append(search);
        const grid = document.createElement('div');
        grid.className = 'guide-image-picker__grid';
        panel.append(grid);
        const renderButton = value => {
            buttonText.textContent = value ? value.label : '不显示';
            buttonImage.hidden = !value;
            if (value) {
                buttonImage.src = assetUrl(`itemiconbig/${itemTable[value.value]?.iconId || value.value}.png`);
            }
        };
        const renderGrid = () => {
            const query = search.value.trim().toLowerCase();
            grid.replaceChildren();
            values.filter(value => !query || value.label.toLowerCase().includes(query)).forEach(value => {
                const optionButton = document.createElement('button');
                optionButton.type = 'button';
                optionButton.className = 'guide-image-picker__option';
                const imageElement = document.createElement('img');
                imageElement.src = assetUrl(`itemiconbig/${itemTable[value.value]?.iconId || value.value}.png`);
                imageElement.alt = '';
                const name = document.createElement('span');
                name.textContent = value.label;
                optionButton.append(imageElement, name);
                optionButton.addEventListener('click', () => {
                    onChange(value.value);
                    renderButton(value);
                    panel.hidden = true;
                });
                grid.append(optionButton);
            });
        };
        const selectedValue = values.find(value => value.value === selected);
        renderButton(selectedValue);
        button.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) renderGrid(); });
        search.addEventListener('input', renderGrid);
        wrapper.append(button, panel);
        return wrapper;
    }

    function createInput(value, label, type = 'text') {
        const input = document.createElement('input');
        input.className = 'ake-ui-control';
        input.type = type;
        input.value = value ?? '';
        input.maxLength = 160;
        input.setAttribute('aria-label', label);
        return input;
    }

    function renderCharacterOptions() {
        const select = $('#guideImageCharacter');
        const values = characters.map(row => ({ value: row.id, label: row.name }));
        populateSelect(select, values, state.characterId || values[0]?.value);
    }

    function characterSkillOptions(characterId) {
        const groups = Object.values(growthTable[characterId]?.skillGroupMap || {});
        return SKILL_NAMES.map((label, index) => {
            const group = groups.find(item => Number(item.skillGroupType) === index) || groups[index] || {};
            const skillId = Array.isArray(group.skillIdList) ? group.skillIdList[0] : '';
            const patch = skillPatchTable[skillId]?.SkillPatchDataBundle?.[0] || {};
            return { label, group, skillId, icon: patch.iconId || group.icon || 'icon_attack_sword' };
        });
    }

    function renderDynamicControls() {
        const skills = $('#guideImageSkills');
        skills.replaceChildren();
        characterSkillOptions(state.characterId).forEach((skill, index) => {
            const name = createInput(state.skills[index]?.name || skill.label, `${skill.label}名称`);
            const rank = createInput(state.skills[index]?.rank || '9', `${skill.label}等级`);
            name.addEventListener('input', () => { state.skills[index].name = name.value; render(); });
            rank.addEventListener('input', () => { state.skills[index].rank = rank.value; render(); });
            skills.append(createRow(`${skill.label}名称`, name), createRow('等级', rank));
        });

        const weaponValues = Object.entries(weaponTable).map(([id]) => ({ value: id, label: itemName(id) }));
        const weapons = $('#guideImageWeapons');
        weapons.replaceChildren();
        state.weapons.forEach((entry, index) => {
            const picker = createAssetPicker(weaponValues, entry.id, `武器${index + 1}`, id => {
                entry.id = id;
                syncAutoEntry(entry, 'weapon');
                render();
            });
            const tags = document.createElement('div');
            tags.className = 'guide-image-picker__tags';
            tags.textContent = entry.note || '选择武器后自动填充词条';
            weapons.append(createRow(`武器${index + 1}`, picker), tags);
        });

        const equipValues = Object.entries(equipTable).map(([id]) => ({ value: id, label: itemName(id) }));
        const equips = $('#guideImageEquips');
        equips.replaceChildren();
        state.equips.forEach((entry, index) => {
            const picker = createAssetPicker(equipValues, entry.id, `装备${index + 1}`, id => {
                entry.id = id;
                syncAutoEntry(entry, 'equip');
                render();
            });
            const tags = document.createElement('div');
            tags.className = 'guide-image-picker__tags';
            tags.textContent = entry.note || '选择装备后自动填充词条';
            equips.append(createRow(`装备${index + 1}`, picker), tags);
        });

        const team = $('#guideImageTeam');
        team.replaceChildren();
        const teamValues = [{ value: '', label: '不显示' }, ...characters.map(row => ({ value: row.id, label: row.name }))];
        state.team.forEach((id, index) => {
            const select = createSelect(teamValues, id, `队伍干员${index + 1}`);
            select.addEventListener('change', () => { state.team[index] = select.value; render(); });
            team.append(createRow(`干员${index + 1}`, select));
        });

        renderLayoutFields();
    }

    function renderLayoutFields() {
        const host = $('#guideImageLayoutFields');
        if (!host) return;
        host.replaceChildren();
        const title = document.createElement('div');
        title.className = 'guide-image-layout-fields-title';
        title.textContent = '当前版式模块位置 / 大小（X、Y、宽、高）';
        host.append(title);
        layoutModulesForMode(state.mode).forEach(module => {
            const rect = layoutRect(state.mode, module.id);
            const row = document.createElement('div');
            row.className = 'guide-image-layout-grid';
            ['x', 'y', 'w', 'h'].forEach(axis => {
                const input = createInput(rect[axis], `${module.label}${axis}`, 'number');
                input.min = '0';
                input.placeholder = axis.toUpperCase();
                input.addEventListener('input', () => {
                    if (!state.layout[state.mode]) state.layout[state.mode] = {};
                    state.layout[state.mode][module.id] = { ...layoutRect(state.mode, module.id), [axis]: normalizeNumber(input.value, rect[axis]) };
                    void render();
                });
                row.append(input);
            });
            const label = document.createElement('div');
            label.textContent = module.label;
            label.className = 'guide-image-layout-fields-title';
            host.append(label, row);
        });
    }

    function layoutModulesForMode(mode) {
        return Object.entries(DEFAULT_LAYOUTS[mode] || {}).map(([id, value]) => ({ id, ...value }));
    }

    function syncBaseControls() {
        $('#guideImageMode').value = state.mode;
        $('#guideImageTitle').value = state.title;
        $('#guideImageBackground').value = state.background;
        $('#guideImageCharacter').value = state.characterId;
        $('#guideImageCharacterName').value = state.characterName;
        $('#guideImageDescription').value = state.description;
        $('#guideImagePotentialLabels').value = state.potentialLabels;
        $('#guideImagePotentialValues').value = state.potentialValues;
        $('#guideImagePotentialNote').value = state.potentialNote;
        $('#guideImageTeamNote').value = state.teamNote;
        $('#guideImageRatio').value = state.ratio;
        $('#guideImageDamage').value = state.damage;
    }

    function selectCharacter(id) {
        const row = characterTable[id] || {};
        state.characterId = id;
        state.characterName = characterName(id, row);
        const skills = characterSkillOptions(id);
        state.skills = skills.map((skill, index) => ({ name: text(skill.group.name, skill.label), rank: state.skills[index]?.rank || '9' }));
        renderDynamicControls();
        syncBaseControls();
        render();
    }

    function roundRect(context, x, y, w, h, radius, fill, stroke) {
        const r = Math.min(radius, w / 2, h / 2);
        context.beginPath();
        context.moveTo(x + r, y);
        context.arcTo(x + w, y, x + w, y + h, r);
        context.arcTo(x + w, y + h, x, y + h, r);
        context.arcTo(x, y + h, x, y, r);
        context.arcTo(x, y, x + w, y, r);
        context.closePath();
        if (fill) { context.fillStyle = fill; context.fill(); }
        if (stroke) { context.strokeStyle = stroke; context.stroke(); }
    }

    function fitText(value, maxWidth, size) {
        let result = String(value || '');
        ctx.font = `700 ${size}px "Microsoft YaHei", sans-serif`;
        while (result.length > 1 && ctx.measureText(result).width > maxWidth) result = `${result.slice(0, -2)}…`;
        return result;
    }

    function drawText(value, x, y, size, color = '#222', align = 'left', weight = 600) {
        ctx.font = `${weight} ${size}px "Microsoft YaHei", sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.fillText(String(value || ''), x, y);
    }

    function drawImageCover(img, x, y, w, h) {
        if (!img) return;
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }

    function drawImageContain(img, x, y, w, h) {
        if (!img) return;
        const scale = Math.min(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }

    function drawPanel(x, y, w, h, title, dark = true, headerH = 54) {
        roundRect(ctx, x, y, w, h, 10, dark ? '#282828' : '#f4f4f4', dark ? '#3e3e3e' : '#c2c2c2');
        ctx.save();
        roundRect(ctx, x, y, w, headerH, 10, dark ? '#383838' : '#333', null);
        ctx.fillStyle = dark ? '#383838' : '#333';
        ctx.fillRect(x, y + headerH - 6, w, 6);
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(x + 8, y + headerH - 1, w - 16, 1);
        ctx.fillStyle = '#ffb228';
        roundRect(ctx, x + 16, y + (headerH - 18) / 2, 5, 18, 2, '#ffb228', null);
        ctx.restore();
        drawText(title, x + 32, y + headerH / 2, 27, '#fff', 'left', 700);
    }

    function drawBarChart(x, y, w, h) {
        const labels = splitList(state.potentialLabels, ['0潜', '1潜', '2潜', '3潜', '4潜', '5潜', '5+6潜']);
        const values = splitList(state.potentialValues, labels.map(() => '100')).map(value => normalizeNumber(value, 0));
        const max = Math.max(...values, 1);
        const gap = w / Math.max(1, labels.length);
        const plotH = h - 68;
        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        for (let line = 1; line <= 4; line += 1) {
            const gy = y + 34 + plotH * (1 - line / 4);
            ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke();
        }
        values.forEach((value, index) => {
            const barH = Math.max(6, (value / max) * plotH);
            const bx = x + gap * index + gap * 0.25;
            const bw = Math.min(52, gap * 0.55);
            const barX = x + gap * index + gap / 2 - bw / 2;
            const barY = y + 34 + plotH - barH;
            const gradient = ctx.createLinearGradient(barX, barY, barX, barY + barH);
            gradient.addColorStop(0, '#ffd873');
            gradient.addColorStop(1, '#ffb228');
            roundRect(ctx, barX, barY, bw, barH, Math.min(6, bw / 2), gradient, 'rgba(255,255,255,.18)');
            const valueText = `${value.toFixed(1)}%`;
            roundRect(ctx, barX + bw / 2 - 31, barY - 28, 62, 24, 5, 'rgba(20,16,4,.85)', null);
            drawText(valueText, barX + bw / 2, barY - 16, 17, '#ffd873', 'center', 700);
            drawText(labels[index] || '', barX + bw / 2, y + h - 8, 19, '#e8e8e8', 'center', 600);
        });
    }

    function segmentList(value) {
        return String(value || '').split(/[,，]/).map(item => {
            const parts = item.split(/[:：]/);
            return { label: parts[0]?.trim() || '', value: normalizeNumber(parts[1], 0) };
        }).filter(item => item.label);
    }

    function drawDonut(x, y, radius, value) {
        const segments = segmentList(value);
        const total = segments.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
        let angle = -Math.PI / 2;
        segments.forEach((item, index) => {
            const next = angle + Math.PI * 2 * Math.max(0, item.value) / total;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, radius, angle, next);
            ctx.closePath();
            ctx.fillStyle = COLORS[index % COLORS.length];
            ctx.fill();
            angle = next;
        });
        segments.forEach((item, index) => {
            const ly = y - (Math.min(segments.length, 5) - 1) * 20 + index * 40;
            if (index >= 5) return;
            ctx.fillStyle = COLORS[index % COLORS.length];
            roundRect(ctx, x + radius + 28, ly - 7, 28, 14, 4, COLORS[index % COLORS.length], null);
            drawText(item.label, x + radius + 66, ly, 19, '#d0d0d0');
            drawText(`${item.value.toFixed(2)}%`, x + radius + 66 + 125, ly, 20, '#fff', 'right', 700);
        });
    }

    function drawSkillIconFrame(icon, x, y, size, rank) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,178,40,.35)';
        ctx.shadowBlur = 14;
        roundRect(ctx, x, y, size, size, 12, '#262626', '#d8d8d8');
        ctx.restore();
        drawImageContain(icon, x + 6, y + 6, size - 12, size - 12);
        ctx.strokeStyle = '#ffb228';
        ctx.lineWidth = 5;
        roundRect(ctx, x, y, size, size, 12, null, '#ffb228');
        roundRect(ctx, x + 8, y + 8, 34, 28, 5, 'rgba(20,16,4,.85)', null);
        drawText(`Lv.${rank}`, x + 25, y + 22, 13, '#ffd873', 'center', 800);
    }

    function drawFooterLogo(width, height) {
        const baseY = height - 58;
        ctx.fillStyle = '#181818';
        ctx.fillRect(0, baseY, width, 58);
        ctx.fillStyle = '#ffb228';
        ctx.beginPath();
        ctx.moveTo(42, baseY + 43); ctx.lineTo(42, baseY + 19);
        ctx.lineTo(52, baseY + 28); ctx.lineTo(62, baseY + 19);
        ctx.lineTo(62, baseY + 43); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(52, baseY + 34, 7, 0, Math.PI * 2); ctx.fill();
        drawText('兔头攻略', 78, baseY + 30, 25, '#fff', 'left', 800);
        drawText('Endfield Guide', 78, baseY + 48, 13, '#ffb228', 'left', 600);
    }

    async function renderHorizontal() {
        const W = 1920, H = 1080;
        canvas.width = W; canvas.height = H;
        ctx.fillStyle = state.background; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#252525'; ctx.fillRect(0, 0, W, 70);
        const char = characterTable[state.characterId] || {};
        const portrait = await portraitImage(state.characterId);
        const p = layoutRect('horizontal', 'portrait');
        const cardW = 250, cardH = 340;
        const cardX = p.x + (p.w - cardW) / 2;
        roundRect(ctx, cardX, p.y, cardW, cardH, 6, '#d9d9d9', '#c2c2c2');
        ctx.save();
        roundRect(ctx, cardX, p.y, cardW, cardH, 6, null, null);
        ctx.clip();
        drawImageCover(portrait, cardX, p.y, cardW, cardH);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.fillRect(cardX, p.y + cardH - 50, cardW, 50);
        roundRect(ctx, cardX + 6, p.y + 4, 34, 34, 5, '#3a3a3a', 'rgba(255,255,255,.75)');
        roundRect(ctx, cardX + 6, p.y + 44, 34, 34, 5, '#3a3a3a', 'rgba(255,255,255,.75)');
        drawText(PROFESSION_NAMES[char.profession] || '?', cardX + 23, p.y + 21, 11, '#fff', 'center', 700);
        drawText(ELEMENT_NAMES[char.mainAttrType] || ELEMENT_NAMES[char.subAttrType] || '?', cardX + 23, p.y + 61, 10, '#fff', 'center', 700);
        drawText(fitText(state.characterName, cardW - 55, 32), cardX + 14, p.y + 310, 32, '#1a1a1a', 'left', 700);
        ctx.fillStyle = '#ffcc00'; ctx.fillRect(cardX, p.y + cardH - 5, cardW, 5);

        const s = layoutRect('horizontal', 'skills');
        drawPanel(s.x, s.y, s.w, s.h, '技能加点', true);
        const skillRows = characterSkillOptions(state.characterId);
        await Promise.all(skillRows.map(async (skill, index) => {
            const icon = await skillImage(skill.icon);
            const slotW = s.w / skillRows.length;
            const x = s.x + slotW * index + slotW / 2;
            const size = Math.min(105, slotW - 28, s.h - 150);
            drawSkillIconFrame(icon, x - size / 2, s.y + 70, size, state.skills[index]?.rank || '9');
            drawText(fitText(state.skills[index]?.name || skill.label, slotW - 20, 18), x, s.y + s.h - 40, 18, '#fff', 'center', 700);
        }));

        const pot = layoutRect('horizontal', 'potential');
        drawPanel(pot.x, pot.y, pot.w, pot.h, '潜能收益', true);
        drawBarChart(pot.x + 35, pot.y + 70, pot.w - 70, pot.h - 135);
        drawText(state.potentialNote, pot.x + 35, pot.y + pot.h - 25, 18, '#8c6500');

        const weapons = layoutRect('horizontal', 'weapons');
        drawPanel(weapons.x, weapons.y, weapons.w, weapons.h, '武器建议', true);
        await Promise.all(state.weapons.map(async (entry, index) => {
            if (!entry.id) return;
            const colW = weapons.w / 2;
            const x = weapons.x + colW * (index % 2) + (colW - 115) / 2;
            const y = weapons.y + 65 + Math.floor(index / 2) * Math.max(160, (weapons.h - 85) / 2);
            roundRect(ctx, x, y, 115, 115, 10, '#262626', 'rgba(255,255,255,.26)');
            drawImageContain(await itemImage(entry.id), x + 4, y + 4, 107, 107);
            ctx.fillStyle = '#ffcc00'; ctx.fillRect(x, y + 110, 115, 5);
            drawText(fitText(itemName(entry.id), colW - 12, 17), x + 57, y + 140, 17, '#fff', 'center', 700);
            const stats = String(entry.note || '').split(/[,，]/).map(item => item.trim()).filter(Boolean).slice(0, 3);
            stats.forEach((stat, statIndex) => {
                roundRect(ctx, x + 57 - 61, y + 152 + statIndex * 28, 122, 24, 12, '#3a3a3a', 'rgba(255,255,255,.12)');
                drawText(stat, x + 57, y + 164 + statIndex * 28, 15, '#e8e8e8', 'center', 600);
            });
        }));

        const equips = layoutRect('horizontal', 'equips');
        drawPanel(equips.x, equips.y, equips.w, equips.h, '装备建议', true);
        await Promise.all(state.equips.map(async (entry, index) => {
            if (!entry.id) return;
            const colW = equips.w / 4;
            const x = equips.x + colW * (index % 4) + (colW - 100) / 2;
            const y = equips.y + 65 + Math.floor(index / 4) * Math.max(160, (equips.h - 85) / 2);
            roundRect(ctx, x, y, 100, 100, 10, '#262626', 'rgba(255,255,255,.26)');
            drawImageContain(await itemImage(entry.id), x + 4, y + 4, 92, 92);
            ctx.fillStyle = '#ffcc00'; ctx.fillRect(x, y + 95, 100, 5);
            drawText(fitText(itemName(entry.id), colW - 8, 14), x + 50, y + 123, 14, '#fff', 'center', 700);
            String(entry.note || '').split(/[,，]/).map(item => item.trim()).filter(Boolean).slice(0, 2).forEach((stat, statIndex) => {
                roundRect(ctx, x + 50 - 50, y + 134 + statIndex * 25, 100, 21, 10, '#3a3a3a', 'rgba(255,255,255,.12)');
                drawText(stat, x + 50, y + 144 + statIndex * 25, 12, '#e8e8e8', 'center', 600);
            });
        }));
        const ratio = layoutRect('horizontal', 'ratio');
        drawPanel(ratio.x, ratio.y, ratio.w, ratio.h, '倍率分布', true);
        drawDonut(ratio.x + ratio.w * .30, ratio.y + 54 + (ratio.h - 54) / 2, Math.min(92, ratio.w * .22), state.ratio);
        const damage = layoutRect('horizontal', 'damage');
        drawPanel(damage.x, damage.y, damage.w, damage.h, '伤害分布', true);
        drawDonut(damage.x + damage.w * .30, damage.y + 54 + (damage.h - 54) / 2, Math.min(92, damage.w * .22), state.damage);
        drawFooterLogo(W, H);
        dimensions.textContent = `${W} × ${H}`;
    }

    async function renderVertical() {
        const W = 1920, H = layoutSize('vertical').height;
        canvas.width = W; canvas.height = H;
        ctx.fillStyle = state.background; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#252525'; ctx.fillRect(0, 0, W, 86);
        drawText(state.title, 40, 43, 34, '#fff', 'left', 800);
        const portrait = await portraitImage(state.characterId);
        const header = layoutRect('vertical', 'header');
        drawPanel(header.x, header.y, header.w, header.h, '干员信息', true);
        drawImageContain(portrait, header.x + 35, header.y + 20, 170, Math.max(80, header.h - 50));
        drawText(state.characterName, header.x + 245, header.y + 70, 38, '#fff', 'left', 800);
        drawText(state.description, header.x + 245, header.y + 125, 23, '#eee');
        drawText('可编辑的攻略正文区域', header.x + 245, header.y + 177, 18, '#ffca28');

        const recommendations = layoutRect('vertical', 'recommendations');
        drawPanel(recommendations.x, recommendations.y, recommendations.w, recommendations.h, '技能与推荐', false);
        const skills = characterSkillOptions(state.characterId);
        await Promise.all(skills.map(async (skill, index) => {
            const slotW = recommendations.w / 4;
            const x = recommendations.x + slotW * index + (slotW - 140) / 2;
            drawImageContain(await skillImage(skill.icon), x, recommendations.y + 78, 140, 140);
            drawText(state.skills[index]?.name || skill.label, x + 70, recommendations.y + 245, 22, '#222', 'center', 800);
            drawText(`等级 ${state.skills[index]?.rank || '9'}`, x + 70, recommendations.y + 285, 20, '#9a6500', 'center', 700);
        }));
        drawText('武器 / 装备推荐可由下方选择并自动填充图标与名称。', recommendations.x + 50, recommendations.y + recommendations.h - 55, 20, '#555');

        const equipments = layoutRect('vertical', 'equipments');
        drawPanel(equipments.x, equipments.y, equipments.w, equipments.h, '武器与装备推荐', false);
        await Promise.all([...state.weapons, ...state.equips].map(async (entry, index) => {
            if (!entry.id) return;
            const colW = equipments.w / 8;
            const x = equipments.x + colW * (index % 8) + (colW - 150) / 2;
            const iy = equipments.y + 78 + Math.floor(index / 8) * 235;
            drawImageContain(await itemImage(entry.id), x, iy, 150, 150);
            drawText(fitText(itemName(entry.id), colW - 12, 18), x + 75, iy + 180, 18, '#222', 'center', 700);
            drawText(fitText(entry.note, colW - 12, 16), x + 75, iy + 211, 16, '#666', 'center');
        }));

        const timeline = layoutRect('vertical', 'timeline');
        drawPanel(timeline.x, timeline.y, timeline.w, timeline.h, '排轴展示（后续补充）', true);
        drawText('本版本先保留排轴区域，后续将接入节点、连线和多角色轴编辑。', timeline.x + 50, timeline.y + timeline.h / 2, 25, '#fff');

        const potential = layoutRect('vertical', 'potential');
        drawPanel(potential.x, potential.y, potential.w, potential.h, '潜能收益', false);
        drawBarChart(potential.x + 75, potential.y + 75, potential.w - 150, potential.h - 115);
        drawText(state.potentialNote, potential.x + 75, potential.y + potential.h - 24, 20, '#8c6500');

        const team = layoutRect('vertical', 'team');
        drawPanel(team.x, team.y, team.w, team.h, '队伍配装', false);
        await Promise.all(state.team.map(async (id, index) => {
            if (!id) return;
            const colW = team.w / 4;
            const x = team.x + colW * index + 55;
            drawImageContain(await characterImage(id), x, team.y + 75, 130, 130);
            drawText(characterName(id, characterTable[id]), x + 160, team.y + 110, 25, '#222', 'left', 800);
            drawText('技能、装备与循环说明', x + 160, team.y + 155, 19, '#666');
        }));
        drawText(state.teamNote, team.x + 55, team.y + team.h - 100, 22, '#444');
        dimensions.textContent = `${W} × ${canvas.height}`;
    }

    function layoutModules() {
        return layoutModulesForMode(state.mode);
    }

    function updateLayoutOverlay() {
        const overlay = $('#guideImageLayoutOverlay');
        if (!overlay) return;
        overlay.hidden = !state.layoutMode;
        overlay.replaceChildren();
        if (!state.layoutMode) return;
        const size = layoutSize(state.mode);
        layoutModules().forEach(module => {
            const rect = layoutRect(state.mode, module.id);
            const element = document.createElement('div');
            element.className = 'guide-image-layout-module';
            element.dataset.layoutId = module.id;
            element.style.left = `${rect.x / size.width * 100}%`;
            element.style.top = `${rect.y / size.height * 100}%`;
            element.style.width = `${rect.w / size.width * 100}%`;
            element.style.height = `${rect.h / size.height * 100}%`;
            const label = document.createElement('span');
            label.className = 'guide-image-layout-label';
            label.textContent = module.label;
            const handle = document.createElement('span');
            handle.className = 'guide-image-layout-handle';
            element.append(label, handle);
            element.addEventListener('pointerdown', event => startLayoutDrag(event, module.id, 'move'));
            handle.addEventListener('pointerdown', event => {
                event.stopPropagation();
                startLayoutDrag(event, module.id, 'resize');
            });
            overlay.append(element);
        });
    }

    let layoutDrag = null;
    function startLayoutDrag(event, id, mode) {
        if (!state.layoutMode) return;
        event.preventDefault();
        const rect = layoutRect(state.mode, id);
        layoutDrag = { id, mode, startX: event.clientX, startY: event.clientY, original: { ...rect }, size: layoutSize(state.mode) };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        document.body.style.userSelect = 'none';
    }

    function moveLayoutDrag(event) {
        if (!layoutDrag) return;
        const preview = $('.guide-image-preview-wrap');
        const bounds = preview.getBoundingClientRect();
        const scaleX = layoutDrag.size.width / bounds.width;
        const scaleY = layoutDrag.size.height / bounds.height;
        const dx = (event.clientX - layoutDrag.startX) * scaleX;
        const dy = (event.clientY - layoutDrag.startY) * scaleY;
        const original = layoutDrag.original;
        let x = original.x, y = original.y, w = original.w, h = original.h;
        if (layoutDrag.mode === 'move') {
            x = Math.max(0, Math.min(layoutDrag.size.width - w, original.x + dx));
            y = Math.max(0, Math.min(layoutDrag.size.height - h, original.y + dy));
        } else {
            w = Math.max(140, Math.min(layoutDrag.size.width - original.x, original.w + dx));
            h = Math.max(120, Math.min(layoutDrag.size.height - original.y, original.h + dy));
        }
        if (!state.layout[ state.mode ]) state.layout[state.mode] = {};
        state.layout[state.mode][layoutDrag.id] = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
        void render();
    }

    function finishLayoutDrag() {
        if (!layoutDrag) return;
        layoutDrag = null;
        document.body.style.userSelect = '';
        renderLayoutFields();
        updateLayoutOverlay();
    }

    let renderToken = 0;
    async function render() {
        const token = ++renderToken;
        if (disposed || !ctx) return;
        setStatus('正在生成预览…', 'loading');
        try {
            if (state.mode === 'vertical') await renderVertical(); else await renderHorizontal();
            // During a pointer drag the reference project keeps the same overlay
            // nodes alive. Replacing them here loses pointer capture and makes
            // the module appear to stop dragging after the first frame.
            if (!layoutDrag) updateLayoutOverlay();
            if (token === renderToken) setStatus('预览已更新', '');
        } catch (error) {
            if (token === renderToken) setStatus(`生成失败：${error.message}`, 'error');
        }
    }

    function bindBaseControls() {
        $('#guideImageMode').addEventListener('change', event => { state.mode = event.target.value; renderDynamicControls(); render(); });
        $('#guideImageLayoutToggle').addEventListener('click', event => {
            state.layoutMode = !state.layoutMode;
            event.currentTarget.textContent = state.layoutMode ? '退出布局模式' : '布局模式';
            updateLayoutOverlay();
        });
        $('#guideImageLayoutReset').addEventListener('click', () => {
            state.layout[state.mode] = {};
            renderLayoutFields();
            void render();
        });
        context.on(document, 'pointermove', moveLayoutDrag);
        context.on(document, 'pointerup', finishLayoutDrag);
        context.on(document, 'pointercancel', finishLayoutDrag);
        $('#guideImageTitle').addEventListener('input', event => { state.title = event.target.value; render(); });
        $('#guideImageBackground').addEventListener('input', event => { state.background = event.target.value; render(); });
        $('#guideImageCharacter').addEventListener('change', event => selectCharacter(event.target.value));
        $('#guideImageCharacterName').addEventListener('input', event => { state.characterName = event.target.value; render(); });
        $('#guideImageDescription').addEventListener('input', event => { state.description = event.target.value; render(); });
        $('#guideImagePotentialLabels').addEventListener('input', event => { state.potentialLabels = event.target.value; render(); });
        $('#guideImagePotentialValues').addEventListener('input', event => { state.potentialValues = event.target.value; render(); });
        $('#guideImagePotentialNote').addEventListener('input', event => { state.potentialNote = event.target.value; render(); });
        $('#guideImageTeamNote').addEventListener('input', event => { state.teamNote = event.target.value; render(); });
        $('#guideImageRatio').addEventListener('input', event => { state.ratio = event.target.value; render(); });
        $('#guideImageDamage').addEventListener('input', event => { state.damage = event.target.value; render(); });
        $('#guideImageExport').addEventListener('click', exportPng);
        $('#guideImageSave').addEventListener('click', saveConfig);
        $('#guideImageLoad').addEventListener('click', () => $('#guideImageConfigInput').click());
        $('#guideImageConfigInput').addEventListener('change', loadConfig);
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function safeName(value) { return String(value || 'guide').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80); }

    async function exportPng() {
        try {
            await render();
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('浏览器未生成 PNG 数据');
            downloadBlob(blob, `${safeName(state.characterName || state.title || '兔头攻略')}-${state.mode}.png`);
            setStatus('PNG 已导出', '');
        } catch (error) {
            setStatus(`PNG 导出失败：${error.message}`, 'error');
        }
    }

    function saveConfig() {
        downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `${safeName(state.characterName || 'guide')}-攻略图配置.json`);
    }

    function loadConfig(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                state = { ...state, ...parsed };
                renderCharacterOptions();
                renderDynamicControls();
                syncBaseControls();
                render();
            } catch (error) { setStatus(`配置导入失败：${error.message}`, 'error'); }
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    let context;
    async function initialize(scopeContext) {
        context = {
            ...scopeContext,
            dataResourceUrl: path => window.akeDataSource?.resolveUrl?.(path) || path
        };
        setStatus('正在读取 TableCfg…', 'loading');
        const [chars, growth, skills, items, weapons, equips, attributeFilters, attributeShows] = await Promise.all([
            context.table('CharacterTable'), context.table('CharGrowthTable'), context.table('SkillPatchTable'),
            context.table('ItemTable'), context.table('WeaponBasicTable'), context.table('EquipTable'),
            context.table('AttributeFilterTable'), context.table('AttributeShowConfigTable')
        ]);
        if (context.signal.aborted) return {};
        characterTable = chars || {}; growthTable = growth || {}; skillPatchTable = skills || {};
        itemTable = items || {}; weaponTable = weapons || {}; equipTable = equips || {};
        buildAttributeNames(attributeFilters, attributeShows);
        state.weapons.forEach(entry => { if (entry.id) syncAutoEntry(entry, 'weapon'); });
        state.equips.forEach(entry => { if (entry.id) syncAutoEntry(entry, 'equip'); });
        characters = Object.entries(characterTable).map(([id, row]) => ({ id, name: characterName(id, row), order: Number(row.sortOrder || 9999) }))
            .filter(row => growthTable[row.id]).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
        if (!characters.length) throw new Error('没有可用干员数据');
        state.characterId = characters.some(row => row.id === state.characterId) ? state.characterId : characters[0].id;
        if (!state.characterName) state.characterName = characterName(state.characterId, characterTable[state.characterId]);
        renderCharacterOptions();
        bindBaseControls();
        renderDynamicControls();
        syncBaseControls();
        await render();
        return {
            destroy() { disposed = true; imageCache.clear(); canvas.width = 0; canvas.height = 0; }
        };
    }

    window.AKEMisc?.register?.(MODULE_ID, initialize);
})();
