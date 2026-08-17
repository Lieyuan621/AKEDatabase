(function () {
    'use strict';

    const MODULE_ID = 'character_icon_generator';
    const IMAGE_ROOT = '/public/images/assets/beyond/dynamicassets/gameplay/ui/sprites';
    const UI_ASSET_ROOT = '/public/misc';
    const SKILL_TYPES = [0, 1, 2, 3];
    const VALID_OUTPUT_SIZES = new Set([192, 256, 384, 512]);
    const SUPER_SAMPLE = 4;
    const NATIVE_FIRST_HINT_SCALE = 1.365;
    const NATIVE_PORTRAIT_MASK_DIAMETER = 93 * 0.7326;
    const NATIVE_PORTRAIT_TEXTURE_DIAMETER = 104 * 0.7326;
    const NATIVE_PORTRAIT_RING_DIAMETER = 77.36256;
    const NATIVE_SKILL_RING_DIAMETER = 36;
    const NATIVE_SKILL_ICON_DIAMETER = 30;
    const NATIVE_SKILL_OFFSET = [25, 23.7];
    const NATIVE_DECORATION_SIZE = 42;
    const NATIVE_DECORATION_OFFSET = [-1.575, 78.1375];
    const SMALL_UI_SCALE = 54 / NATIVE_PORTRAIT_RING_DIAMETER;
    const SKILL_INNER_FILL = '#171a1e';
    const UI_ASSETS = {
        decoration: { path: `${UI_ASSET_ROOT}/icon_combos_01.png`, width: 64, height: 64 },
        portraitRing: { path: `${UI_ASSET_ROOT}/deco_combo_skill_progress.png`, width: 136, height: 136 },
        skillRing: { path: `${UI_ASSET_ROOT}/bg_combo_skill_icon.png`, width: 60, height: 60 }
    };

    window.AKEMisc.register(MODULE_ID, async function (context) {
        const root = context.root;
        const canvas = root.querySelector('#miscIconCanvas');
        const canvasContext = canvas?.getContext('2d');
        const characterList = root.querySelector('#miscIconCharacterList');
        const characterCount = root.querySelector('#miscIconCharacterCount');
        const characterSearch = root.querySelector('#miscIconCharacterSearch');
        const skillList = root.querySelector('#miscIconSkillList');
        const layoutOptions = root.querySelector('#miscIconLayoutOptions');
        const sizeOptions = root.querySelector('#miscIconSizeOptions');
        const skillBackgroundOptions = root.querySelector('#miscIconSkillBackgroundOptions');
        const transparentInput = root.querySelector('#miscIconTransparent');
        const selectionLabel = root.querySelector('#miscIconSelection');
        const status = root.querySelector('#miscIconGeneratorStatus');
        const downloadButton = root.querySelector('#miscIconDownload');
        const imagePromises = new Map();
        const loadedImages = new Set();
        const downloadUrls = new Set();
        let characters = [];
        let selectedCharacterId = '';
        let selectedSkillType = 0;
        let layout = 'character';
        let outputSize = 256;
        let renderGeneration = 0;
        let renderReady = false;
        let downloading = false;
        let disposed = false;

        const t = (key, params, fallback) => window.akeI18n?.t(
            `modules.misc.characterIconGenerator.${key}`,
            params,
            fallback
        ) || fallback || key;
        const localizedText = (value, fallback) => context.text(value, fallback) || fallback || '';

        function setStatus(key, fallback, state, params) {
            status.textContent = t(key, params, fallback);
            status.dataset.state = state || '';
        }

        function avatarPath(characterId) {
            return `${IMAGE_ROOT}/charroundicon/icon_round_${characterId}.png`;
        }

        function skillPath(iconId) {
            return `${IMAGE_ROOT}/skillicon/${iconId}.png`;
        }

        function skillTypeLabel(type) {
            return t({
                0: 'skillTypes.normalAttack',
                1: 'skillTypes.normalSkill',
                2: 'skillTypes.ultimate',
                3: 'skillTypes.comboSkill'
            }[type], null, {
                0: '普通攻击',
                1: '战技',
                2: '终结技',
                3: '连携技'
            }[type]);
        }

        function selectedCharacter() {
            return characters.find(character => character.id === selectedCharacterId) || characters[0] || null;
        }

        function selectedSkill() {
            return selectedCharacter()?.groups.get(selectedSkillType) || null;
        }

        function normalizeSearch(value) {
            return String(value || '').trim().toLocaleLowerCase();
        }

        function updateSegmentedControl(container, dataName, value) {
            container.querySelectorAll(`[data-${dataName}]`).forEach(button => {
                const active = String(button.dataset[dataName]) === String(value);
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-checked', String(active));
            });
        }

        function createCharacterButton(character) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'misc-icon-generator__character';
            button.dataset.characterId = character.id;
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', String(character.id === selectedCharacterId));
            button.title = character.name;

            const image = document.createElement('img');
            image.src = avatarPath(character.id);
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            const name = document.createElement('span');
            name.textContent = character.name;
            button.append(image, name);
            return button;
        }

        function renderCharacterList() {
            const query = normalizeSearch(characterSearch.value);
            const visible = characters.filter(character => !query || character.searchText.includes(query));
            characterList.replaceChildren(...visible.map(createCharacterButton));
            characterCount.textContent = `${visible.length}/${characters.length}`;
            if (!visible.length) {
                const empty = document.createElement('div');
                empty.className = 'misc-icon-generator__empty';
                empty.textContent = t('noCharacters', null, '没有匹配的角色');
                characterList.append(empty);
            }
        }

        function renderSkillList() {
            const character = selectedCharacter();
            skillList.replaceChildren();
            if (!character) return;
            SKILL_TYPES.forEach(type => {
                const group = character.groups.get(type);
                if (!group) return;
                const button = document.createElement('button');
                const active = type === selectedSkillType;
                button.type = 'button';
                button.className = `misc-icon-generator__skill${active ? ' is-active' : ''}`;
                button.dataset.skillType = String(type);
                button.setAttribute('role', 'radio');
                button.setAttribute('aria-checked', String(active));

                const image = document.createElement('img');
                image.src = skillPath(group.icon);
                image.alt = '';
                image.decoding = 'async';
                const copy = document.createElement('span');
                const typeName = document.createElement('small');
                const skillName = document.createElement('strong');
                typeName.textContent = skillTypeLabel(type);
                skillName.textContent = group.name;
                copy.append(typeName, skillName);
                button.append(image, copy);
                skillList.append(button);
            });
        }

        function updateSelectionLabel() {
            const character = selectedCharacter();
            const group = selectedSkill();
            selectionLabel.textContent = character && group ? `${character.name} · ${group.name}` : '';
            canvas.setAttribute('aria-label', selectionLabel.textContent || t('preview', null, '预览'));
        }

        function updateSkillBackgroundControl() {
            skillBackgroundOptions.hidden = layout !== 'skill';
        }

        async function decodeBlob(blob) {
            if (typeof window.createImageBitmap === 'function') return window.createImageBitmap(blob);
            const objectUrl = URL.createObjectURL(blob);
            try {
                return await new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => resolve(image);
                    image.onerror = () => reject(new Error(t('renderFailed', null, '图标生成失败')));
                    image.src = objectUrl;
                });
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        }

        function loadImage(url) {
            if (!imagePromises.has(url)) {
                const promise = (async () => {
                    const response = await (window.akeFetch || fetch)(url, {
                        signal: context.signal,
                        akeProgress: false
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const image = await decodeBlob(await response.blob());
                    loadedImages.add(image);
                    return image;
                })().catch(error => {
                    imagePromises.delete(url);
                    throw error;
                });
                imagePromises.set(url, promise);
            }
            return imagePromises.get(url);
        }

        async function loadUiAsset(spec) {
            const image = await loadImage(spec.path);
            const dimensions = imageDimensions(image);
            if (dimensions.width !== spec.width || dimensions.height !== spec.height) {
                throw new Error(`Invalid UI asset dimensions: ${spec.path}`);
            }
            return image;
        }

        function roundLikePython(value) {
            const lower = Math.floor(value);
            const fraction = value - lower;
            if (fraction < 0.5) return lower;
            if (fraction > 0.5) return lower + 1;
            return lower % 2 === 0 ? lower : lower + 1;
        }

        function centeredBox(center, diameter) {
            const radius = diameter / 2;
            return [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius];
        }

        function scaleBox(box, scale) {
            return box.map(value => roundLikePython(value * scale));
        }

        function layoutForOutput() {
            const large = outputSize === 256 || outputSize === 512;
            const outputScale = outputSize > 256 ? 2 : 1;
            const contentScale = large ? NATIVE_FIRST_HINT_SCALE : 1;
            const mainCenter = large ? [128, 156] : [96, 117];
            const baseCanvas = large ? [256, 256] : [192, 192];
            const scale = SMALL_UI_SCALE * contentScale;
            const skillCenter = [
                mainCenter[0] + NATIVE_SKILL_OFFSET[0] * scale,
                mainCenter[1] + NATIVE_SKILL_OFFSET[1] * scale
            ];
            const decorationCenter = [
                mainCenter[0] + NATIVE_DECORATION_OFFSET[0] * SMALL_UI_SCALE,
                mainCenter[1] - NATIVE_DECORATION_OFFSET[1] * SMALL_UI_SCALE
            ];
            return {
                outputScale,
                canvas: baseCanvas.map(value => value * outputScale),
                portraitBox: centeredBox(mainCenter, NATIVE_PORTRAIT_RING_DIAMETER * scale),
                portraitMaskBox: centeredBox(mainCenter, NATIVE_PORTRAIT_MASK_DIAMETER * scale),
                portraitTextureBox: centeredBox(mainCenter, NATIVE_PORTRAIT_TEXTURE_DIAMETER * scale),
                skillBox: centeredBox(skillCenter, NATIVE_SKILL_RING_DIAMETER * scale),
                skillIconBox: centeredBox(skillCenter, NATIVE_SKILL_ICON_DIAMETER * scale),
                decorationBox: large ? centeredBox(decorationCenter, NATIVE_DECORATION_SIZE * SMALL_UI_SCALE) : null
            };
        }

        function imageDimensions(image) {
            return {
                width: image.naturalWidth || image.width || 1,
                height: image.naturalHeight || image.height || 1
            };
        }

        function drawFittedCover(ctx, image, box, scale) {
            const [left, top, right, bottom] = scaleBox(box, scale);
            const width = right - left;
            const height = bottom - top;
            const source = imageDimensions(image);
            const fitScale = Math.max(width / source.width, height / source.height);
            const sourceWidth = width / fitScale;
            const sourceHeight = height / fitScale;
            ctx.drawImage(
                image,
                (source.width - sourceWidth) / 2,
                (source.height - sourceHeight) / 2,
                sourceWidth,
                sourceHeight,
                left,
                top,
                width,
                height
            );
        }

        function drawCentered(ctx, image, box, scale) {
            const [left, top, right, bottom] = scaleBox(box, scale);
            ctx.drawImage(image, left, top, right - left, bottom - top);
        }

        function drawMaskedCircle(ctx, image, sourceBox, maskBox, scale) {
            const [left, top, right, bottom] = scaleBox(maskBox, scale);
            ctx.save();
            ctx.beginPath();
            ctx.ellipse((left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2, 0, 0, Math.PI * 2);
            ctx.clip();
            drawFittedCover(ctx, image, sourceBox, scale);
            ctx.restore();
        }

        function drawCircleFill(ctx, box, scale) {
            const [left, top, right, bottom] = scaleBox(box, scale);
            ctx.fillStyle = SKILL_INNER_FILL;
            ctx.beginPath();
            ctx.ellipse((left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawComposite(portrait, skill, uiAssets) {
            const layoutData = layoutForOutput();
            const workingScale = SUPER_SAMPLE * layoutData.outputScale;
            const working = document.createElement('canvas');
            working.width = layoutData.canvas[0] * SUPER_SAMPLE;
            working.height = layoutData.canvas[1] * SUPER_SAMPLE;
            const ctx = working.getContext('2d');
            if (!ctx) throw new Error('Canvas 2D is unavailable');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.clearRect(0, 0, working.width, working.height);

            if (layoutData.decorationBox) drawCentered(ctx, uiAssets.decoration, layoutData.decorationBox, workingScale);
            const mainSource = layout === 'skill' ? skill : portrait;
            const badgeSource = layout === 'skill' ? portrait : skill;
            if (layout === 'skill' && !transparentInput.checked) drawCircleFill(ctx, layoutData.portraitMaskBox, workingScale);
            drawMaskedCircle(ctx, mainSource, layoutData.portraitTextureBox, layoutData.portraitMaskBox, workingScale);
            drawCentered(ctx, uiAssets.portraitRing, layoutData.portraitBox, workingScale);
            drawCentered(ctx, uiAssets.skillRing, layoutData.skillBox, workingScale);
            drawMaskedCircle(ctx, badgeSource, layoutData.skillIconBox, layoutData.skillIconBox, workingScale);

            canvas.width = layoutData.canvas[0];
            canvas.height = layoutData.canvas[1];
            canvasContext.setTransform(1, 0, 0, 1, 0, 0);
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            canvasContext.imageSmoothingEnabled = true;
            canvasContext.imageSmoothingQuality = 'high';
            canvasContext.drawImage(working, 0, 0, canvas.width, canvas.height);
            working.width = 0;
            working.height = 0;
        }

        async function renderPreview() {
            const generation = ++renderGeneration;
            const character = selectedCharacter();
            const group = selectedSkill();
            renderReady = false;
            downloadButton.disabled = true;
            updateSelectionLabel();
            if (!character || !group || !canvasContext) {
                setStatus('renderFailed', '图标生成失败', 'error');
                return;
            }
            setStatus('rendering', '正在生成', 'loading');
            try {
                const [portrait, skill, decoration, portraitRing, skillRing] = await Promise.all([
                    loadImage(avatarPath(character.id)),
                    loadImage(skillPath(group.icon)),
                    loadUiAsset(UI_ASSETS.decoration),
                    loadUiAsset(UI_ASSETS.portraitRing),
                    loadUiAsset(UI_ASSETS.skillRing)
                ]);
                if (disposed || context.signal.aborted || generation !== renderGeneration) return;
                drawComposite(portrait, skill, { decoration, portraitRing, skillRing });
                renderReady = true;
                downloadButton.disabled = false;
                setStatus('ready', '已就绪', 'ready');
            } catch (error) {
                if (disposed || context.signal.aborted || generation !== renderGeneration) return;
                console.warn('角色图标生成失败', error);
                setStatus('renderFailed', '图标生成失败', 'error');
            }
        }

        function selectCharacter(characterId, updateRoute) {
            if (!characters.some(character => character.id === characterId)) return;
            selectedCharacterId = characterId;
            const character = selectedCharacter();
            if (!character.groups.has(selectedSkillType)) selectedSkillType = SKILL_TYPES.find(type => character.groups.has(type)) || 0;
            renderCharacterList();
            renderSkillList();
            updateSelectionLabel();
            if (updateRoute) context.navigate(characterId);
            void renderPreview();
        }

        function selectSkillType(type) {
            const parsed = Number(type);
            if (!selectedCharacter()?.groups.has(parsed)) return;
            selectedSkillType = parsed;
            renderSkillList();
            updateSelectionLabel();
            void renderPreview();
        }

        function safeFilename(value) {
            const cleaned = String(value || '')
                .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
                .replace(/[. ]+$/g, '')
                .trim()
                .slice(0, 96);
            return cleaned || 'AKEData-icon';
        }

        async function downloadPng() {
            if (!renderReady || downloading || disposed) return;
            const character = selectedCharacter();
            const group = selectedSkill();
            if (!character || !group) return;
            const exportLayout = layout;
            const exportSize = outputSize;
            const exportSkillType = selectedSkillType;
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = canvas.width;
            exportCanvas.height = canvas.height;
            exportCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
            downloading = true;
            downloadButton.disabled = true;
            downloadButton.setAttribute('aria-busy', 'true');
            try {
                const blob = await new Promise((resolve, reject) => {
                    exportCanvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG export failed')), 'image/png');
                });
                if (disposed || context.signal.aborted) return;
                const url = URL.createObjectURL(blob);
                downloadUrls.add(url);
                const anchor = document.createElement('a');
                const layoutName = exportLayout === 'skill'
                    ? t('skillFocus', null, '技能主图')
                    : t('characterFocus', null, '角色主图');
                anchor.download = `${safeFilename(`${character.name}-${skillTypeLabel(exportSkillType)}-${layoutName}-${exportSize}`)}.png`;
                anchor.href = url;
                anchor.rel = 'noopener';
                anchor.style.display = 'none';
                document.body.append(anchor);
                anchor.click();
                anchor.remove();
                context.setTimeout(() => {
                    URL.revokeObjectURL(url);
                    downloadUrls.delete(url);
                }, 30000);
                setStatus('ready', '已就绪', 'ready');
            } catch (error) {
                if (!disposed) {
                    console.warn('PNG 下载失败', error);
                    setStatus('downloadFailed', `下载失败：${error.message}`, 'error', { message: error.message });
                }
            } finally {
                downloading = false;
                if (!disposed) {
                    downloadButton.removeAttribute('aria-busy');
                    downloadButton.disabled = !renderReady;
                }
            }
        }

        if (!canvasContext) {
            setStatus('renderFailed', '图标生成失败', 'error');
            return {};
        }

        try {
            setStatus('rendering', '正在生成', 'loading');
            const [characterTable, growthTable] = await Promise.all([
                context.table('CharacterTable'),
                context.table('CharGrowthTable')
            ]);
            if (context.signal.aborted) return {};
            characters = Object.entries(characterTable || {})
                .filter(([id]) => id !== 'chr_9000_endmin')
                .map(([id, row]) => {
                    const groups = new Map();
                    Object.values(growthTable?.[id]?.skillGroupMap || {}).forEach(group => {
                        const type = Number(group.skillGroupType);
                        if (!SKILL_TYPES.includes(type) || !group.icon) return;
                        groups.set(type, {
                            type,
                            icon: String(group.icon),
                            name: localizedText(group.name, skillTypeLabel(type))
                        });
                    });
                    const defaultName = localizedText(row.name, id);
                    const name = id === 'chr_0002_endminm'
                        ? t('administratorMale', null, '管理员（男）')
                        : id === 'chr_0003_endminf'
                            ? t('administratorFemale', null, '管理员（女）')
                            : defaultName;
                    return {
                        id,
                        name,
                        groups,
                        order: Number(row.sortOrder ?? growthTable?.[id]?.sortOrder ?? 9999),
                        searchText: normalizeSearch(`${name} ${id}`)
                    };
                })
                .filter(character => SKILL_TYPES.every(type => character.groups.has(type)))
                .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
            if (!characters.length) throw new Error('No character skill groups');

            const routeCharacter = characters.find(character => character.id === context.routeId)?.id;
            selectedCharacterId = routeCharacter || characters[0].id;
            renderCharacterList();
            renderSkillList();
            updateSegmentedControl(layoutOptions, 'layout', layout);
            updateSegmentedControl(sizeOptions, 'size', outputSize);
            updateSelectionLabel();
            updateSkillBackgroundControl();

            context.on(characterSearch, 'input', renderCharacterList);
            context.on(characterList, 'click', event => {
                const button = event.target.closest('[data-character-id]');
                if (button) selectCharacter(button.dataset.characterId, true);
            });
            context.on(skillList, 'click', event => {
                const button = event.target.closest('[data-skill-type]');
                if (button) selectSkillType(button.dataset.skillType);
            });
            context.on(layoutOptions, 'click', event => {
                const button = event.target.closest('[data-layout]');
                if (!button || !['character', 'skill'].includes(button.dataset.layout)) return;
                layout = button.dataset.layout;
                updateSegmentedControl(layoutOptions, 'layout', layout);
                updateSkillBackgroundControl();
                void renderPreview();
            });
            context.on(sizeOptions, 'click', event => {
                const button = event.target.closest('[data-size]');
                const size = Number(button?.dataset.size);
                if (!VALID_OUTPUT_SIZES.has(size)) return;
                outputSize = size;
                updateSegmentedControl(sizeOptions, 'size', outputSize);
                void renderPreview();
            });
            context.on(transparentInput, 'change', () => void renderPreview());
            context.on(downloadButton, 'click', () => void downloadPng());
            await renderPreview();
        } catch (error) {
            if (!context.signal.aborted) {
                console.error('角色图标生成器加载失败', error);
                setStatus('loadFailed', `读取失败：${error.message}`, 'error', { message: error.message });
                const empty = document.createElement('div');
                empty.className = 'misc-icon-generator__empty';
                empty.textContent = t('loadFailed', null, '读取角色数据失败');
                characterList.replaceChildren(empty);
            }
        }

        return {
            destroy() {
                disposed = true;
                renderGeneration += 1;
                downloadUrls.forEach(url => URL.revokeObjectURL(url));
                downloadUrls.clear();
                loadedImages.forEach(image => image.close?.());
                loadedImages.clear();
                imagePromises.clear();
                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                }
            }
        };
    });
})();
