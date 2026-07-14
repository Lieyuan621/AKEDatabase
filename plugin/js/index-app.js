(function() {
            const storage = window.akeStorage || {
                get(key, fallback = null) {
                    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
                },
                set(key, value) {
                    try { localStorage.setItem(key, String(value)); return true; } catch { return false; }
                },
                remove(key) {
                    try { localStorage.removeItem(key); return true; } catch { return false; }
                }
            };
            const moduleHtmlCache = new Map();
            const scriptSourceCache = new Map();
            const stylesheetCache = new Map();
            const moduleStyleKeys = new Map();
            let mountedModuleId = null;
            let moduleLoadGeneration = 0;

            const HOME_CONTENT = `
                <div class="welcome-home">
                    <img src="/public/images/index/main.jpg" 
                         alt="起始页图片" 
                         class="home-image" 
                         onerror="this.onerror=null; this.src='';"
                         style="max-width: 80%; height: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <p style="margin-top: 20px; color: var(--text-color, #1e2b3c); font-size: 1.2rem;">AKEData · 《明日方舟：终末地》数据库</p>
                    <div id="homeVersionInfo" style="margin-top:8px;color:#7f8c9f;font-size:.9rem;">正在读取版本信息...</div>
                    <div style="margin-top: 30px; color:#a3b6cc; font-size:1rem;">
                        游戏中所有数值通常情况下都不是整数，但是在游戏中只显示整数部分，本数据库中所有数据均比游戏内更精确一位以方便查阅计算。<br>
                        免责声明：本网站为同好爱好者项目，与鹰角网络和Gryphline官方无关。所有商标权利均归属其各自所有者。<br>
                        左下角 ⚙️ 按钮可打开全局设置
                    </div>
                </div>
            `;

            function showHomePage() {
                stashMountedModule();
                moduleLoadGeneration++;
                activateModuleStyles(null);
                setContent(HOME_CONTENT);
                renderVersionInfo();
                document.querySelectorAll('.module-item').forEach(item => item.classList.remove('active'));
                activeModuleId = null;
                if (window.__akeRouter) window.__akeRouter.clearUrl();
            }

            function show404Page(isHidden) {
                stashMountedModule();
                moduleLoadGeneration++;
                activateModuleStyles(null);
                const hiddenHint = isHidden ? `
                    <div class="not-found-hint">
                        <p>🔒 该内容可能为隐藏内容。</p>
                        <p>您可以通过点击左下角 <strong>⚙️ 全局设置</strong> 按钮，开启「<strong>显示隐藏模块</strong>」来访问隐藏内容。</p>
                    </div>
                ` : '';
                contentArea.innerHTML = `
                    <div class="not-found-page">
                        <div class="not-found-code">404</div>
                        <div class="not-found-title">页面未找到</div>
                        <div class="not-found-desc">您访问的模块或条目不存在</div>
                        ${hiddenHint}
                        <button class="not-found-home-btn" id="notFoundHomeBtn">返回首页</button>
                    </div>
                `;
                document.querySelectorAll('.module-item').forEach(item => item.classList.remove('active'));
                activeModuleId = null;
                const btn = document.getElementById('notFoundHomeBtn');
                if (btn) btn.addEventListener('click', showHomePage);
                if (window.__akeRouter) window.__akeRouter.clearUrl();
            }

            let config = {
                theme: 'light',
                showHidden: false,
                showExportButton: false,
                levelSettings: {
                    enabled: true,
                    characterLevels: '1,20,40,60,80,90',
                    weaponLevels: '1,20,40,60,80,90',
                    enemyLevels: '1,20,40,60,80,90',
                    skillLevels: [true, false, false, false, false, false, false, false, true, true, true, true]
                },
                keepUrlSync: true,
                unlockedTokens: []
            };

            let allModules = [];
            let activeModuleId = null;

            const moduleListEl = document.getElementById('moduleListContainer');
            const contentArea = document.getElementById('contentArea');
            const brandHome = document.getElementById('brandHome');
            const themeLink = document.getElementById('theme-style');
            const settingsButton = document.getElementById('settingsButton');
            const settingsModal = document.getElementById('settingsModal');
            const closeSettings = document.getElementById('closeSettings');
            const modalThemeSelect = document.getElementById('modalThemeSelect');
            const modalShowHiddenCheck = document.getElementById('modalShowHiddenCheck');
            const modalLevelsEnabled = document.getElementById('modalLevelsEnabled');
            const modalCharacterLevels = document.getElementById('modalCharacterLevels');
            const modalWeaponLevels = document.getElementById('modalWeaponLevels');
            const modalEnemyLevels = document.getElementById('modalEnemyLevels');
            const tooltip1 = document.getElementById('hyperlink-tooltip-1');
            const tooltip2 = document.getElementById('hyperlink-tooltip-2');

            // 移动端模块菜单
            const mobileMenuButton = document.getElementById('mobileMenuButton');
            const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
            const mobileMenuList = document.getElementById('mobileMenuList');

            function buildMobileMenu() {
                const visibleModules = filterModules(allModules);
                const sorted = sortModulesByPriority(visibleModules);
                mobileMenuList.innerHTML = '';
                sorted.forEach(mod => {
                    const item = document.createElement('div');
                    item.className = 'mobile-menu-item';
                    item.innerHTML = `
                        <div class="title">${mod.icon || '📦'} ${mod.title}</div>
                        <div class="desc">${mod.description || ''}</div>
                    `;
                    item.addEventListener('click', async () => {
                        closeMobileMenu();
                        const module = allModules.find(m => m.id === mod.id);
                        if (module) {
                            const loaded = await loadModuleContent(module);
                            if (!loaded) return;
                            activeModuleId = mod.id;
                            document.querySelectorAll('.module-item').forEach(el => el.classList.remove('active'));
                            const sidebarItem = document.querySelector(`.module-item[data-id="${mod.id}"]`);
                            if (sidebarItem) sidebarItem.classList.add('active');
                            if (window.__akeRouter) window.__akeRouter.updateUrl(mod.id);
                        }
                    });
                    mobileMenuList.appendChild(item);
                });
            }

            function openMobileMenu() {
                buildMobileMenu();
                mobileMenuOverlay.style.display = 'flex';
            }

            function closeMobileMenu() {
                mobileMenuOverlay.style.display = 'none';
            }

            mobileMenuButton.addEventListener('click', openMobileMenu);
            mobileMenuOverlay.addEventListener('click', (e) => {
                if (e.target === mobileMenuOverlay) closeMobileMenu();
            });

            // 移动端底部栏按钮
            const mobileMenuBtn = document.getElementById('mobileMenuBtn');
            const mobileSettingsBtn = document.getElementById('mobileSettingsBtn');
            const mobileExportBtn = document.getElementById('mobileExportBtn');

            if (mobileMenuBtn) {
                mobileMenuBtn.addEventListener('click', openMobileMenu);
            }
            if (mobileSettingsBtn) {
                mobileSettingsBtn.addEventListener('click', openSettings);
            }
            if (mobileExportBtn) {
                mobileExportBtn.addEventListener('click', async () => {
                    // 复制桌面端导出按钮的点击逻辑
                    // 或者直接触发桌面端导出按钮的 click 事件
                    document.getElementById('exportButton')?.click();
                });
            }

            // ---------- 工具函数 ----------
            function setContent(html) {
                contentArea.innerHTML = html;
            }

            function stashMountedModule() {
                mountedModuleId = null;
            }

            function activateModuleStyles(moduleId) {
                const activeKeys = moduleId ? moduleStyleKeys.get(moduleId) || new Set() : new Set();
                stylesheetCache.forEach((promise, key) => {
                    promise.then(link => { link.disabled = !activeKeys.has(key); }).catch(() => {});
                });
            }

            function formatUpdatedAt(value) {
                const date = new Date(value);
                return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
            }

            function renderVersionInfo() {
                const version = window.akeVersion;
                const box = document.getElementById('appVersionInfo');
                const home = document.getElementById('homeVersionInfo');
                if (!version) {
                    if (box) box.textContent = '版本信息暂不可用';
                    if (home) home.textContent = '版本信息暂不可用';
                    return;
                }
                if (box) {
                    box.replaceChildren();
                    [
                        `AKEData · 版本 ${version.appversion}`,
                        `游戏版本 ${version.gameversion}`,
                        `Hotfix 版本 ${version.hotfixversion}`,
                        `最后更新于：${formatUpdatedAt(version.updatedAt)}${version.updatedBy ? ` (${version.updatedBy})` : ''}`
                    ].forEach(line => {
                        const p = document.createElement('p');
                        p.textContent = line;
                        box.appendChild(p);
                    });
                }
                if (home) home.textContent = `AKEData ${version.appversion} · ${version.gameversion}`;
            }

            function canonicalResourceUrl(resource) {
                const url = new URL(resource, window.location.href);
                url.searchParams.delete('t');
                url.searchParams.delete('v');
                return url.href;
            }

            async function ensureStylesheet(href) {
                const key = canonicalResourceUrl(href);
                if (stylesheetCache.has(key)) return stylesheetCache.get(key);
                const promise = (async () => {
                    const version = await window.akeVersionReady;
                    const url = new URL(href, window.location.href);
                    if (version && url.origin === window.location.origin) url.searchParams.set('v', version.appversion);
                    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                        .find(link => canonicalResourceUrl(link.href) === key);
                    if (existing) {
                        existing.disabled = false;
                        return existing;
                    }
                    return new Promise((resolve, reject) => {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = url.href;
                        link.dataset.akeModuleStyle = 'true';
                        link.onload = () => resolve(link);
                        link.onerror = () => reject(new Error(`无法加载样式：${href}`));
                        document.head.appendChild(link);
                    });
                })();
                stylesheetCache.set(key, promise);
                try {
                    return await promise;
                } catch (error) {
                    stylesheetCache.delete(key);
                    throw error;
                }
            }

            function getScriptSource(src) {
                const key = canonicalResourceUrl(src);
                if (!scriptSourceCache.has(key)) {
                    const promise = (window.akeFetch || fetch)(src).then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.text();
                    }).catch(error => {
                        scriptSourceCache.delete(key);
                        throw error;
                    });
                    scriptSourceCache.set(key, promise);
                }
                return scriptSourceCache.get(key);
            }

            async function executeModuleScript(sourceScript) {
                const script = document.createElement('script');
                Array.from(sourceScript.attributes).forEach(attr => {
                    if (attr.name !== 'src') script.setAttribute(attr.name, attr.value);
                });
                if (sourceScript.src) {
                    const source = await getScriptSource(sourceScript.src);
                    script.textContent = `${source}\n//# sourceURL=${canonicalResourceUrl(sourceScript.src)}`;
                } else {
                    script.textContent = sourceScript.textContent;
                }
                sourceScript.parentNode.replaceChild(script, sourceScript);
            }

            async function loadModuleContent(module) {
                const generation = ++moduleLoadGeneration;
                if (module?.disabled === true) {
                    show404Page(false);
                    return false;
                }
                if (!module || !module.contentFile) {
                    setContent(`<div class="error-message">模块内容文件未指定</div>`);
                    return false;
                }
                if (module.token && !isModuleUnlocked(module)) {
                    show404Page(false);
                    return false;
                }
                if (mountedModuleId === module.id) return true;
                if (mountedModuleId !== module.id) stashMountedModule();
                setContent(`<div class="loader">⏳ 加载模块内容...</div>`);
                try {
                    if (!moduleHtmlCache.has(module.contentFile)) {
                        moduleHtmlCache.set(module.contentFile, (window.akeFetch || fetch)(module.contentFile).then(response => {
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            return response.text();
                        }).catch(error => {
                            moduleHtmlCache.delete(module.contentFile);
                            throw error;
                        }));
                    }
                    const html = await moduleHtmlCache.get(module.contentFile);
                    if (generation !== moduleLoadGeneration) return false;
                    const template = document.createElement('template');
                    template.innerHTML = html;
                    const styles = Array.from(template.content.querySelectorAll('link[rel="stylesheet"][href]'));
                    const styleKeys = new Set(styles.map(link => canonicalResourceUrl(link.getAttribute('href'))));
                    moduleStyleKeys.set(module.id, styleKeys);
                    styles.forEach(link => link.remove());
                    await Promise.all(styles.map(link => ensureStylesheet(link.getAttribute('href'))));
                    if (generation !== moduleLoadGeneration) return false;
                    activateModuleStyles(module.id);
                    contentArea.replaceChildren(template.content.cloneNode(true));
                    const scripts = Array.from(contentArea.querySelectorAll('script'));
                    for (const oldScript of scripts) {
                        if (generation !== moduleLoadGeneration) return false;
                        await executeModuleScript(oldScript);
                    }
                    if (generation !== moduleLoadGeneration) return false;
                    mountedModuleId = module.id;
                    return true;
                } catch (err) {
                    if (generation !== moduleLoadGeneration) return false;
                    setContent(`<div class="error-message">❌ 无法加载模块内容：${err.message}</div>`);
                    return false;
                }
            }

            function sortModulesByPriority(modulesArray) {
                return modulesArray.sort((a, b) => {
                    const pa = a.priority !== undefined ? Number(a.priority) : 999;
                    const pb = b.priority !== undefined ? Number(b.priority) : 999;
                    return pa - pb;
                });
            }

            function filterModules(modules) {
                let filtered = modules.filter(m => m.id !== 'settings');
                if (!config.showHidden) {
                    filtered = filtered.filter(m => !m.hidden);
                }
                filtered = filtered.filter(m => !m.token || isModuleUnlocked(m));
                return filtered;
            }

            function applyFilterAndRender() {
                const visibleModules = filterModules(allModules);
                renderModuleList(visibleModules);
                if (activeModuleId) {
                    const stillVisible = visibleModules.some(m => m.id === activeModuleId);
                    if (!stillVisible) {
                        showHomePage();
                    } else {
                        const activeItem = document.querySelector(`.module-item[data-id="${activeModuleId}"]`);
                        if (activeItem) activeItem.classList.add('active');
                    }
                }
            }

            function renderModuleList(modulesArray) {
                if (!modulesArray || modulesArray.length === 0) {
                    moduleListEl.innerHTML = `<div style="padding:20px; color:#999; text-align:center;">📭 暂无可见模块</div>`;
                    return;
                }
                const sorted = sortModulesByPriority(modulesArray);
                let html = '';
                sorted.forEach(mod => {
                    const icon = mod.icon || '📦';
                    const desc = mod.description || '无描述';
                    const hiddenMarker = mod.hidden ? '🔒' : '';
                    html += `
                        <div class="module-item" data-id="${mod.id}">
                            <div class="module-title">
                                <span>${icon}</span> ${mod.title} ${hiddenMarker}
                            </div>
                            <div class="module-desc">${desc}</div>
                        </div>
                    `;
                });
                moduleListEl.innerHTML = html;
                document.querySelectorAll('.module-item').forEach(item => {
                    item.addEventListener('click', async (e) => {
                        const id = item.dataset.id;
                        const module = allModules.find(m => m.id === id);
                        if (!module) return;
                        const loaded = await loadModuleContent(module);
                        if (!loaded) return;
                        document.querySelectorAll('.module-item').forEach(el => el.classList.remove('active'));
                        item.classList.add('active');
                        activeModuleId = id;
                        if (window.__akeRouter) window.__akeRouter.updateUrl(id);
                    });
                });
                if (activeModuleId) {
                    const activeItem = document.querySelector(`.module-item[data-id="${activeModuleId}"]`);
                    if (activeItem) activeItem.classList.add('active');
                }
            }

            function setTheme(themeName) {
                const requestedTheme = String(themeName || '').toLowerCase();
                const lowerTheme = ['light', 'yellow', 'dark'].includes(requestedTheme) ? requestedTheme : 'light';
                config.theme = lowerTheme;
                const themeUrl = new URL(`theme/${lowerTheme}.css`, window.location.href);
                if (window.akeVersion) themeUrl.searchParams.set('v', window.akeVersion.appversion);
                themeLink.href = themeUrl.href;
                storage.set('akedata-theme', lowerTheme);
                if (modalThemeSelect) modalThemeSelect.value = lowerTheme;
            }

            function initTheme() {
                const savedTheme = storage.get('akedata-theme', 'light');
                setTheme(savedTheme);
            }

            // 等级输入校验
            function validateLevelInput(input, defaultValue, maxLevel = 90) {
                if (!input || input.trim() === '') return defaultValue;
                const parts = input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= maxLevel);
                if (parts.length === 0) return defaultValue;
                const uniqueSorted = [...new Set(parts)].sort((a,b) => a-b);
                return uniqueSorted.join(',');
            }

            function updateTokenStatus() {
                const statusEl = document.getElementById('tokenStatus');
                if (!statusEl) return;
                const tokenCount = config.unlockedTokens.length;
                if (tokenCount === 0) {
                    statusEl.textContent = '尚未输入任何令牌';
                } else {
                    statusEl.textContent = '已输入 ' + tokenCount + ' 个令牌';
                }
            }

            function openSettings() {
                modalThemeSelect.value = config.theme;
                modalShowHiddenCheck.checked = config.showHidden;
                const modalShowExportCheck = document.getElementById('modalShowExportCheck');
                if (modalShowExportCheck) modalShowExportCheck.checked = config.showExportButton;
                const modalKeepUrlSync = document.getElementById('modalKeepUrlSync');
                if (modalKeepUrlSync) modalKeepUrlSync.checked = config.keepUrlSync;
                modalLevelsEnabled.checked = config.levelSettings.enabled;
                modalCharacterLevels.value = config.levelSettings.characterLevels;
                modalWeaponLevels.value = config.levelSettings.weaponLevels;
                modalEnemyLevels.value = config.levelSettings.enemyLevels;

                const modalSkillLevels = document.getElementById('modalSkillLevels');
                if (modalSkillLevels) {
                    const arr = config.levelSettings.skillLevels;
                    const levels = [];
                    if (Array.isArray(arr)) {
                        arr.forEach((checked, idx) => { if (checked) levels.push(idx + 1); });
                    }
                    modalSkillLevels.value = levels.join(',');
                }

                const modalTokenInput = document.getElementById('modalTokenInput');
                if (modalTokenInput) {
                    modalTokenInput.value = '';
                }
                updateTokenStatus();

                settingsModal.style.display = 'flex';
            }

            function closeSettingsModal() {
                const enabled = modalLevelsEnabled.checked;
                let charLevels = modalCharacterLevels.value;
                let weaponLevels = modalWeaponLevels.value;
                let enemyLevels = modalEnemyLevels.value;

                // 校验
                charLevels = validateLevelInput(charLevels, '1,20,40,60,80,90', 90);
                weaponLevels = validateLevelInput(weaponLevels, '1,20,40,60,80,90', 90);
                enemyLevels = validateLevelInput(enemyLevels, '1,20,40,60,80,90', 100); // 敌人最大等级假设100

                config.levelSettings.enabled = enabled;
                config.levelSettings.characterLevels = charLevels;
                config.levelSettings.weaponLevels = weaponLevels;
                config.levelSettings.enemyLevels = enemyLevels;

                const modalSkillLevels = document.getElementById('modalSkillLevels');
                let skillLevelsStr = modalSkillLevels ? modalSkillLevels.value : '1,9,10,11,12';
                skillLevelsStr = validateLevelInput(skillLevelsStr, '1,9,10,11,12', 12);
                const skillLevelNums = skillLevelsStr.split(',').map(s => parseInt(s.trim(), 10));
                config.levelSettings.skillLevels = Array.from({ length: 12 }, (_, i) => skillLevelNums.includes(i + 1));

                storage.set('akedata-levelSettings', JSON.stringify(config.levelSettings));

                const modalShowExportCheck = document.getElementById('modalShowExportCheck');
                if (modalShowExportCheck) {
                    config.showExportButton = modalShowExportCheck.checked;
                    storage.set('akedata-showExportButton', config.showExportButton);
                }

                const modalKeepUrlSync = document.getElementById('modalKeepUrlSync');
                if (modalKeepUrlSync) {
                    const wasSync = config.keepUrlSync;
                    config.keepUrlSync = modalKeepUrlSync.checked;
                    storage.set('akedata-keepUrlSync', config.keepUrlSync);
                    if (wasSync !== config.keepUrlSync) {
                        settingsModal.style.display = 'none';
                        location.reload();
                        return;
                    }
                }
                
                // 主题
                const theme = modalThemeSelect.value;
                if (theme !== config.theme) {
                    setTheme(theme);
                }

                // 隐藏模块
                const showHidden = modalShowHiddenCheck.checked;
                if (showHidden !== config.showHidden) {
                    config.showHidden = showHidden;
                    applyFilterAndRender();
                    storage.set('akedata-showHidden', showHidden);
                }

                window.dispatchEvent(new CustomEvent('globalConfigChanged', { detail: { config } }));
                settingsModal.style.display = 'none';
            }

            async function loadModulesFromManifest() {
                try {
                    const response = await (window.akeFetch || fetch)('plugin/manifest.json');
                    if (!response.ok) return [];
                    const manifest = await response.json();
                    if (!Array.isArray(manifest)) return [];
                    return manifest
                        .filter(m => m.id && m.title && m.contentFile)
                        .map(m => ({
                            ...m,
                            priority: m.priority !== undefined ? m.priority : 999,
                            hidden: m.hidden === true,
                            disabled: m.disabled === true,
                            token: m.token || null
                        }))
                        .filter(m => !m.disabled);
                } catch (err) {
                    moduleListEl.innerHTML = `<div style="color:#b0003a; padding:20px; text-align:center;">❌ 无法读取模块清单。<br>请通过本地服务器访问。</div>`;
                    return [];
                }
            }

            function isModuleUnlocked(module) {
                if (!module.token) return true;
                return config.unlockedTokens.includes(module.token);
            }

            window.hyperlinkConfig = {};
            window.textstyleConfig = {};

            window.__akeRouter = {
                updateUrl(plugin, id) {
                    if (!config.keepUrlSync) return;
                    const params = new URLSearchParams();
                    if (plugin) params.set('plugin', plugin);
                    if (id) params.set('id', id);
                    const qs = params.toString();
                    const newUrl = window.location.pathname + (qs ? '?' + qs : '');
                    history.replaceState(null, '', newUrl);
                },
                clearUrl() {
                    if (!config.keepUrlSync) return;
                    history.replaceState(null, '', window.location.pathname);
                },
                stripUrl() {
                    history.replaceState(null, '', window.location.pathname);
                }
            };
            window.configLoaded = Promise.all([
                (window.akeFetch || fetch)('/theme/hyperlink.json').then(r => r.json()).then(cfg => window.hyperlinkConfig = cfg).catch(() => {}),
                (window.akeFetch || fetch)('/theme/textstyle.json').then(r => r.json()).then(cfg => window.textstyleConfig = cfg).catch(() => {})
            ]);

            window.renderRawValueTip = function(displayValue, rawValue, variableName) {
                const showHidden = window.akeData?.getConfig().showHidden ?? false;
                if (!showHidden || rawValue === undefined || rawValue === null || rawValue === '') return String(displayValue);
                const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const rawText = typeof rawValue === 'number' ? String(rawValue) : String(rawValue);
                const title = variableName ? `${variableName}: ${rawText}` : `原始值: ${rawText}`;
                return `<span class="raw-value-tip" title="${escape(title)}">${displayValue}</span>`;
            };

            window.parseText = function(text, baseImagePath = '/public/images/', depth = 0) {
                if (!text) return '';
                let result = '';
                let i = 0;
                const len = text.length;
                const hyperlinkCfg = window.hyperlinkConfig || {};
                const textstyleCfg = window.textstyleConfig || {};

                while (i < len) {
                    if (text[i] === '<') {
                        if (text.substr(i, 6) === '<image') {
                            const endIdx = text.indexOf('>', i);
                            if (endIdx === -1) { result += text[i]; i++; continue; }
                            const tagContent = text.substring(i + 1, endIdx);
                            const imgMatch = tagContent.match(/image="([^"]+)"\s*scale=([0-9.]+)/);
                            if (imgMatch) {
                                let path = imgMatch[1];
                                const scale = imgMatch[2];
                                if (!path.includes('.')) path += '.png';
                                result += `<img src="${baseImagePath}${path}" style="transform: scale(${scale}); width: auto; height: 1em; display: inline-block; vertical-align: middle;" class="inline-icon" onerror="this.onerror=null; this.src='';">`;
                            }
                            i = endIdx + 1;
                            continue;
                        }
                        else if (text[i+1] === '@' || text[i+1] === '#') {
                            const prefix = text[i+1];
                            const tagNameEnd = text.indexOf('>', i);
                            if (tagNameEnd === -1) { result += text[i]; i++; continue; }
                            const tagName = text.substring(i+2, tagNameEnd);
                            let depthCounter = 1;
                            let pos = tagNameEnd + 1;
                            while (pos < len) {
                                if (text[pos] === '<') {
                                    if (text.substr(pos, 3) === '</>') {
                                        depthCounter--;
                                        if (depthCounter === 0) {
                                            const innerContent = text.substring(tagNameEnd + 1, pos);
                                            const renderedInner = window.parseText(innerContent, baseImagePath, depth + 1);
                                            let tagResult = '';
                                            if (prefix === '@') {
                                                const styleDef = textstyleCfg?.[tagName];
                                                if (!styleDef) {
                                                    tagResult = tagName.includes('info') ? `<span style="color: #999999;">${renderedInner}</span>` : renderedInner;
                                                } else {
                                                    const color = styleDef.color?.[1] ?? styleDef.color?.[0] ?? null;
                                                    const image = styleDef.image?.[1] ?? styleDef.image?.[0] ?? null;
                                                    const scale = styleDef.scale?.[1] ?? styleDef.scale?.[0] ?? 1;
                                                    if (image) {
                                                        tagResult = `<span class="textstyle-icon-text"><img src="/${image}" style="transform: scale(${scale});" alt="" onerror="this.onerror=null; this.src='';"><span style="${color ? `color: ${color};` : ''}">${renderedInner}</span></span>`;
                                                    } else {
                                                        tagResult = color ? `<span style="color: ${color};">${renderedInner}</span>` : renderedInner;
                                                    }
                                                }
                                            } else {
                                                if (depth >= 2) {
                                                    tagResult = renderedInner;
                                                } else {
                                                    const hyperDef = hyperlinkCfg?.[tagName];
                                                    if (hyperDef) {
                                                        const styleid = hyperDef.styleid;
                                                        if (styleid && textstyleCfg?.[styleid]) {
                                                            const styleDef = textstyleCfg[styleid];
                                                            const color = styleDef.color?.[1] ?? styleDef.color?.[0] ?? null;
                                                            const image = styleDef.image?.[1] ?? styleDef.image?.[0] ?? null;
                                                            const scale = styleDef.scale?.[1] ?? styleDef.scale?.[0] ?? 1;
                                                            if (image) {
                                                                tagResult = `<span class="textstyle-icon-text">
                                                                    <img src="/${image}" style="transform: scale(${scale});" alt="" onerror="this.onerror=null; this.src='';">
                                                                    <span class="tag-hyperlink" data-tag-id="${tagName}" style="${color ? `color: ${color};` : ''}">${renderedInner}</span>
                                                                </span>`;
                                                            } else if (color) {
                                                                tagResult = `<span class="tag-hyperlink" data-tag-id="${tagName}" style="color: ${color};">${renderedInner}</span>`;
                                                            } else {
                                                                tagResult = `<span class="tag-hyperlink" data-tag-id="${tagName}">${renderedInner}</span>`;
                                                            }
                                                        } else {
                                                            tagResult = `<span class="tag-hyperlink" data-tag-id="${tagName}">${renderedInner}</span>`;
                                                        }
                                                    } else {
                                                        tagResult = renderedInner;
                                                    }
                                                }
                                            }
                                            result += tagResult;
                                            i = pos + 3;
                                            break;
                                        }
                                        pos += 3;
                                    } else if (text[pos+1] === '@' || text[pos+1] === '#' || text.substr(pos, 6) === '<image') {
                                        depthCounter++;
                                        pos++;
                                    } else {
                                        pos++;
                                    }
                                } else {
                                    pos++;
                                }
                            }
                            if (pos >= len) {
                                result += text.substring(i, tagNameEnd + 1);
                                i = tagNameEnd + 1;
                            }
                            continue;
                        } else {
                            result += text[i];
                            i++;
                        }
                    } else {
                        result += text[i];
                        i++;
                    }
                }
                return result;
            };

            // 双层浮窗管理
            let activeTooltipLevel = 0;
            let anchor1 = null;
            let anchor2 = null;

            function closeTooltip(level) {
                if (level === 1) {
                    tooltip1.style.display = 'none';
                    anchor1 = null;
                    if (activeTooltipLevel === 1) {
                        activeTooltipLevel = 0;
                    } else if (activeTooltipLevel === 2) {
                        tooltip2.style.display = 'none';
                        anchor2 = null;
                        activeTooltipLevel = 0;
                    }
                } else if (level === 2) {
                    tooltip2.style.display = 'none';
                    anchor2 = null;
                    if (activeTooltipLevel === 2) {
                        activeTooltipLevel = 1;
                    }
                }
            }

            function closeAllTooltips() {
                tooltip1.style.display = 'none';
                tooltip2.style.display = 'none';
                anchor1 = null;
                anchor2 = null;
                activeTooltipLevel = 0;
            }

            function showTooltip(level, anchorElement, hyperDef) {
                if (!hyperDef) return;
                const name = hyperDef.name || '';
                let desc = hyperDef.desc || '';
                desc = window.parseText(desc, '/public/images/');
                let iconHtml = '';
                if (hyperDef.iconPath) {
                    const iconFullPath = hyperDef.iconPath.includes('.') ? hyperDef.iconPath : hyperDef.iconPath + '.png';
                    iconHtml = `<img src="/${iconFullPath}" style="width: 1.2em; height: 1.2em; vertical-align: middle; margin-right: 4px;" onerror="this.onerror=null; this.src='';">`;
                }
                const content = `
                    <div class="tooltip-name">${iconHtml}${name}</div>
                    <div class="tooltip-desc">${desc}</div>
                `;
                const tooltip = level === 1 ? tooltip1 : tooltip2;
                tooltip.innerHTML = content;
                const rect = anchorElement.getBoundingClientRect();
                const scrollX = window.scrollX || window.pageXOffset;
                const scrollY = window.scrollY || window.pageYOffset;
                tooltip.style.left = (rect.left + scrollX) + 'px';
                tooltip.style.top = (rect.bottom + scrollY + 5) + 'px';
                tooltip.style.display = 'block';
                if (level === 1) {
                    anchor1 = anchorElement;
                    activeTooltipLevel = 1;
                } else {
                    anchor2 = anchorElement;
                    activeTooltipLevel = 2;
                }
            }

            document.addEventListener('click', (e) => {
                const target = e.target;
                const hyperlink = target.closest('.tag-hyperlink');
                const inTooltip1 = tooltip1.contains(target);
                const inTooltip2 = tooltip2.contains(target);
                if (!hyperlink && (inTooltip1 || inTooltip2)) return;
                if (hyperlink) {
                    e.preventDefault();
                    const tagId = hyperlink.dataset.tagId;
                    if (!tagId) return;
                    const hyperDef = window.hyperlinkConfig?.[tagId];
                    if (!hyperDef) return;
                    if (inTooltip2) {
                        showTooltip(2, hyperlink, hyperDef);
                    } else if (inTooltip1) {
                        showTooltip(2, hyperlink, hyperDef);
                    } else {
                        closeAllTooltips();
                        showTooltip(1, hyperlink, hyperDef);
                    }
                    return;
                }
                if (inTooltip2) return;
                if (inTooltip1) {
                    if (activeTooltipLevel === 2) closeTooltip(2);
                    return;
                }
                closeAllTooltips();
            });

            tooltip2.addEventListener('click', (e) => e.stopPropagation());

            function updateExportButtonVisibility() {
                const exportBtn = document.getElementById('exportButton');
                if (exportBtn) {
                    exportBtn.style.display = config.showExportButton ? 'flex' : 'none';
                }
            }

            async function initApp() {
                const urlParams = new URLSearchParams(window.location.search);
                const deepPlugin = urlParams.get('plugin');
                const deepId = urlParams.get('id');

                showHomePage();
                await window.akeVersionReady;
                renderVersionInfo();
                initTheme();

                const savedLevelSettings = storage.get('akedata-levelSettings');
                if (savedLevelSettings) {
                    try {
                        const parsed = JSON.parse(savedLevelSettings);
                        config.levelSettings = parsed;
                        if (!config.levelSettings.skillLevels || config.levelSettings.skillLevels.length !== 12) {
                            config.levelSettings.skillLevels = Array(12).fill(true);
                        }
                    } catch (e) {}
                }

                const savedTokens = storage.get('akedata-unlockedTokens');
                if (savedTokens) {
                    try {
                        const parsed = JSON.parse(savedTokens);
                        if (Array.isArray(parsed)) {
                            config.unlockedTokens = parsed;
                        }
                    } catch (e) {}
                }

                allModules = await loadModulesFromManifest();
                applyFilterAndRender();

                const savedKeepUrlSync = storage.get('akedata-keepUrlSync');
                if (savedKeepUrlSync !== null) {
                    config.keepUrlSync = savedKeepUrlSync === 'true';
                }

                if (!config.keepUrlSync && (deepPlugin || deepId)) {
                    window.__akeRouter.stripUrl();
                }

                if (deepPlugin) {
                    const module = allModules.find(m => m.id === deepPlugin);
                    if (module) {
                        if ((module.hidden && !config.showHidden) || (module.token && !isModuleUnlocked(module))) {
                            show404Page(false);
                        } else {
                            window.__deepLinkId = deepId || null;
                            if (deepId) {
                                window.__akeRouter.onDeepLinkNotFound = function(notFoundId, isHidden) {
                                    show404Page(isHidden);
                                };
                            }
                            const loaded = await loadModuleContent(module);
                            if (!loaded) return;
                            activeModuleId = deepPlugin;
                            document.querySelectorAll('.module-item').forEach(el => el.classList.remove('active'));
                            const sidebarItem = document.querySelector(`.module-item[data-id="${deepPlugin}"]`);
                            if (sidebarItem) sidebarItem.classList.add('active');
                            if (config.keepUrlSync) {
                                window.__akeRouter.updateUrl(deepPlugin, deepId);
                            }
                        }
                    } else {
                        show404Page(false);
                    }
                }

                settingsButton.addEventListener('click', openSettings);
                closeSettings.addEventListener('click', closeSettingsModal);
                window.addEventListener('click', (e) => {
                    if (e.target === settingsModal) closeSettingsModal();
                });

                // 重置按钮
                const resetBtn = document.getElementById('resetSettingsBtn');
                if (resetBtn) {
                    resetBtn.addEventListener('click', () => {
                        document.getElementById('modalLevelsEnabled').checked = true;
                        document.getElementById('modalCharacterLevels').value = '1,20,40,60,80,90';
                        document.getElementById('modalWeaponLevels').value = '1,20,40,60,80,90';
                        document.getElementById('modalEnemyLevels').value = '1,20,40,60,80,90';
                        document.getElementById('modalSkillLevels').value = '1,9,10,11,12';
                        document.getElementById('modalThemeSelect').value = 'light';
                        document.getElementById('modalShowHiddenCheck').checked = false;
                        document.getElementById('modalKeepUrlSync').checked = true;
                        const resetTokenInput = document.getElementById('modalTokenInput');
                        if (resetTokenInput) resetTokenInput.value = '';
                        config.unlockedTokens = [];
                        storage.remove('akedata-unlockedTokens');
                        updateTokenStatus();
                        closeSettingsModal(); // 立即应用
                    });
                }

                // 令牌提交按钮
                const tokenSubmitBtn = document.getElementById('tokenSubmitBtn');
                if (tokenSubmitBtn) {
                    tokenSubmitBtn.addEventListener('click', () => {
                        const input = document.getElementById('modalTokenInput');
                        if (!input) return;
                        const raw = input.value.trim();
                        if (!raw) {
                            showToast('请输入令牌', 'warning');
                            return;
                        }
                        const newTokens = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        const uniqueNew = [...new Set(newTokens)];
                        const existingSet = new Set(config.unlockedTokens);
                        let addedCount = 0;
                        uniqueNew.forEach(t => {
                            if (!existingSet.has(t)) {
                                config.unlockedTokens.push(t);
                                existingSet.add(t);
                                addedCount++;
                            }
                        });
                        if (addedCount > 0) {
                            storage.set('akedata-unlockedTokens', JSON.stringify(config.unlockedTokens));
                            applyFilterAndRender();
                            window.dispatchEvent(new CustomEvent('globalConfigChanged', { detail: { config } }));
                            showToast('已添加 ' + addedCount + ' 个令牌', 'info');
                        } else {
                            showToast('这些令牌已存在', 'warning');
                        }
                        input.value = '';
                        updateTokenStatus();
                    });
                }

                // 令牌清除按钮
                const tokenClearAllBtn = document.getElementById('tokenClearAllBtn');
                if (tokenClearAllBtn) {
                    tokenClearAllBtn.addEventListener('click', () => {
                        if (config.unlockedTokens.length === 0) {
                            showToast('当前没有已保存的令牌', 'warning');
                            return;
                        }
                        const count = config.unlockedTokens.length;
                        config.unlockedTokens = [];
                        storage.remove('akedata-unlockedTokens');
                        applyFilterAndRender();
                        window.dispatchEvent(new CustomEvent('globalConfigChanged', { detail: { config } }));
                        showToast('已清除 ' + count + ' 个令牌', 'info');
                        updateTokenStatus();
                    });
                }

                modalThemeSelect.addEventListener('change', (e) => setTheme(e.target.value));
                modalShowHiddenCheck.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        const confirmed = confirm('是否确认开启隐藏内容？隐藏内容中包含开发中内容，可能存在bug（我们建议您不要在直播或其他公开场合开启/阅读隐藏内容）');
                        if (!confirmed) {
                            e.target.checked = false;
                            return;
                        }
                    }
                    config.showHidden = e.target.checked;
                    applyFilterAndRender();
                    storage.set('akedata-showHidden', config.showHidden);
                    window.dispatchEvent(new CustomEvent('globalConfigChanged', { detail: { showHidden: config.showHidden } }));
                });

                document.getElementById('exportButton').addEventListener('click', async () => {
                    const contentArea = document.getElementById('contentArea');
                    if (!contentArea) return;

                    // 获取文件名（优先使用详情标题）
                    let title = '起始页';
                    const possibleSelectors = [
                        '.detail-title', '.detail-name', '.suit-name',
                        '.category-title', '.series-title', '.dungeon-name',
                        '.weapon-detail .detail-title', '.character-detail .detail-name',
                        '.enemy-detail .detail-name', '.equip-detail .suit-name',
                        '.achievement-detail .category-title', '.dungeon-detail .series-title',
                        '.v2e-name', '.v2d-series-title', '.v2cc-title'
                    ];
                    for (const sel of possibleSelectors) {
                        const el = contentArea.querySelector(sel);
                        if (el && el.textContent.trim()) {
                            title = el.textContent.trim();
                            break;
                        }
                    }
                    if (title === '起始页' && activeModuleId) {
                        const mod = allModules.find(m => m.id === activeModuleId);
                        if (mod?.title) title = mod.title;
                    }
                    title = title.replace(/[/?<>\\:*|"]/g, '_');
                
                    try {
                        const canvas = await html2canvas(contentArea, {
                            scale: 2,
                            useCORS: true,
                            logging: false,
                            allowTaint: false,
                            scrollY: 0,
                            onclone: (clonedDoc, element) => {
                                // 移除左侧栏和内部列
                                const globalSidebar = clonedDoc.querySelector('.sidebar');
                                if (globalSidebar) globalSidebar.remove();
                                const leftColumns = clonedDoc.querySelectorAll('.left-column, .v2e-left, .v2d-left, .v2cc-left');
                                leftColumns.forEach(col => col.remove());
                                const mobileBtns = clonedDoc.querySelectorAll('.v2cc-mobile-btn');
                                mobileBtns.forEach(btn => btn.remove());
                                const weaponList = clonedDoc.querySelector('.weapon-list');
                                if (weaponList) weaponList.remove();
                            
                                // 调整布局
                                const app = clonedDoc.querySelector('.app');
                                if (app) {
                                    app.style.display = 'block';
                                    app.style.height = 'auto';
                                    app.style.overflow = 'visible';
                                }
                                const mainContent = clonedDoc.querySelector('.main-content');
                                if (mainContent) {
                                    mainContent.style.height = 'auto';
                                    mainContent.style.overflow = 'visible';
                                    mainContent.style.padding = '0';
                                }
                                const v2Modules = clonedDoc.querySelectorAll('.v2e-module, .v2d-module, .dungeon-module, .v2cc-module');
                                v2Modules.forEach(m => { m.style.display = 'block'; });
                            
                                element.style.margin = '0';
                                element.style.padding = '0';
                                element.style.overflow = 'visible';
                                element.style.height = 'auto';
                            
                                const allElements = clonedDoc.querySelectorAll('*');
                                allElements.forEach(el => {
                                    el.style.overflow = 'visible';
                                    el.style.maxHeight = 'none';
                                    el.style.height = 'auto';
                                    el.style.minHeight = 'auto';
                                });
                            
                                clonedDoc.body.style.margin = '0';
                                clonedDoc.body.style.padding = '0';
                            }
                        });
                    
                        // ========== 添加覆盖水印（30% 透明度） ==========
                        const ctx = canvas.getContext('2d');
                        ctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
                        ctx.fillStyle = 'rgba(150, 150, 150, 0.1)'; // 30% 不透明度
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                    
                        const stepX = 800;  // 水平间距
                        const stepY = 600;  // 垂直间距
                        const angle = -0.5; // 旋转角度（弧度）
                    
                        for (let y = 50; y < canvas.height; y += stepY) {
                            for (let x = 50; x < canvas.width; x += stepX) {
                                ctx.save();
                                ctx.translate(x, y);
                                ctx.rotate(angle);
                                ctx.fillText('AKEData.top', 0, 0);
                                ctx.restore();
                            }
                        }
                    
                        const link = document.createElement('a');
                        link.download = title + '.png';
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                    } catch (err) {
                        alert('截图失败：' + err.message);
                    }
                });

                const savedShowExport = storage.get('akedata-showExportButton');
                if (savedShowExport !== null) {
                    config.showExportButton = savedShowExport === 'true';
                }
                updateExportButtonVisibility();

                window.addEventListener('globalConfigChanged', (e) => {
                    updateExportButtonVisibility();
                });

                const savedShowHidden = storage.get('akedata-showHidden');
                if (savedShowHidden !== null) {
                    config.showHidden = savedShowHidden === 'true';
                    applyFilterAndRender();
                }
            }

            brandHome.addEventListener('click', showHomePage);
            initApp();

            window.akeData = {
                setTheme,
                toggleShowHidden: (val) => {
                    config.showHidden = val;
                    applyFilterAndRender();
                    storage.set('akedata-showHidden', val);
                    if (modalShowHiddenCheck) modalShowHiddenCheck.checked = val;
                },
                getConfig: () => ({ ...config }),
                getLevelSettings: () => ({ ...config.levelSettings }),
                showHomePage,
                isTokenUnlocked: (token) => {
                    if (!token) return true;
                    return config.unlockedTokens.includes(token);
                },
                getUnlockedTokens: () => [...config.unlockedTokens]
            };
        })();

        var _hmt = _hmt || [];
        (function () {
            var hm = document.createElement("script");
            hm.src = "https://hm.baidu.com/hm.js?d4e7ab5e1c4546176ca165a6dd69fada";
            var s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(hm, s);
        })();
