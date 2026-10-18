(function () {
    'use strict';

    const t = window.akeI18n?.scope?.('modules.modelViewer') || ((key, params, fallback) => fallback ?? key);
    let rendererScriptPromise = null;

    function rendererScript() {
        if (customElements.get('endfield-viewer')) return Promise.resolve();
        if (rendererScriptPromise) return rendererScriptPromise;
        rendererScriptPromise = (async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        const url = new URL('/plugin/js/ake-renderer.js', location.href);
                        url.searchParams.set('v', window.__akeBootstrapVersion?.appversion || '1');
                        script.src = url.href;
                        script.onload = resolve;
                        script.onerror = () => {
                            script.remove();
                            reject(new Error(t('loadFailed', null, '加载失败')));
                        };
                        document.head.appendChild(script);
                    });
                    return;
                } catch (error) {
                    if (attempt === 2) throw error;
                    await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
                }
            }
        })().catch(error => {
            rendererScriptPromise = null;
            throw error;
        });
        return rendererScriptPromise;
    }

    function controls() {
        return `
            <div class="model-viewer" id="characterModelViewer">
                <header class="ake-ui-section model-viewer__header">
                    <div class="model-viewer__title-row">
                        <button class="ake-ui-button ake-ui-button--primary model-viewer__load" id="modelViewerLoad" type="button">${t('load', null, '加载')}</button>
                        <label class="model-viewer__field"><span class="model-viewer__label">${t('category', null, '动画分类')}</span><select class="ake-ui-control model-viewer__select" id="modelViewerCategory"><option value="">${t('allAnimations', null, '全部动画')}</option></select></label>
                        <label class="model-viewer__field model-viewer__field--wide"><span class="model-viewer__label">${t('animation', null, '动画')}</span><select class="ake-ui-control model-viewer__select" id="modelViewerAnimation"><option value="">${t('defaultPose', null, '默认姿态')}</option></select></label>
                        <label class="model-viewer__field"><span class="model-viewer__label">${t('state', null, '动画状态')}</span><select class="ake-ui-control model-viewer__select" id="modelViewerState" disabled><option value="">${t('selectState', null, '选择状态')}</option></select></label>
                        <label class="model-viewer__field model-viewer__field--switch" id="modelViewerPotentialLabel" hidden><span class="model-viewer__label">${t('maxPotential', null, '满潜特效')}</span><input class="ake-ui-switch" type="checkbox" id="modelViewerPotential"></label>
                    </div>
                    <div class="model-viewer__toolbar">
                        <button class="ake-ui-button ake-ui-button--primary" id="modelViewerPlay" type="button" disabled>${t('play', null, '播放')}</button>
                        <button class="ake-ui-button ake-ui-button--secondary" id="modelViewerPause" type="button" disabled>${t('pause', null, '暂停')}</button>
                        <label class="model-viewer__timeline"><span class="model-viewer__label">${t('timeline', null, '进度')}</span><input id="modelViewerTimeline" type="range" min="0" max="1" step="0.001" value="0" disabled></label>
                        <output class="model-viewer__time" id="modelViewerTime">0.00 / 0.00</output>
                    </div>
                </header>
                <section class="ake-ui-section model-viewer__stage">
                    <div class="model-viewer__progress" id="modelViewerProgress" data-state="loading" role="progressbar" aria-valuemin="0" aria-valuemax="100" hidden>
                        <div class="model-viewer__progress-head"><strong class="model-viewer__progress-title" id="modelViewerProgressTitle">${t('loadingModel', null, '正在加载模型...')}</strong><span class="model-viewer__progress-value" id="modelViewerProgressValue">0%</span></div>
                        <div class="model-viewer__progress-track"><div class="model-viewer__progress-bar" id="modelViewerProgressBar"></div></div>
                        <div class="model-viewer__progress-detail" id="modelViewerProgressDetail"></div>
                    </div>
                    <div class="ake-ui-state" id="modelViewerStatus" data-state="loading" role="status"><strong class="ake-ui-state__title">${t('loadingModel', null, '正在加载模型...')}</strong><p class="ake-ui-state__message"></p></div>
                </section>
            </div>
        `;
    }

    window.akeMountCharacterModelViewer = function (slot, characterId) {
        let disposed = false;
        let cleanup = null;
        const button = slot.querySelector('[data-load-character-model]');
        const onLoad = async () => {
            button.disabled = true;
            button.textContent = t('loadingModel', null, '正在加载模型...');
            try {
                await rendererScript();
                if (disposed || !slot.isConnected) return;
                slot.innerHTML = controls();
                const root = slot.querySelector('#characterModelViewer');
                const stage = root.querySelector('.model-viewer__stage');
                const viewer = document.createElement('endfield-viewer');
                viewer.id = 'modelViewerViewport';
                const base = window.akeDataSource?.getState?.()?.defaultBaseUrl ||
                    window.__akeBootstrapVersion?.dataBaseUrl || 'https://data.akedata.wiki';
                const bucket = new URL('/endfield-bundles/', new URL(base, location.href));
                bucket.searchParams.set('v', window.__akeBootstrapVersion?.appversion || '1');
                viewer.setAttribute('bucket', bucket.href);
                stage.prepend(viewer);
                cleanup = window.akeInitModelViewer(root, {characterId});
            } catch (error) {
                if (disposed || !slot.isConnected) return;
                button.disabled = false;
                button.textContent = t('load', null, '加载');
                slot.querySelector('[data-model-error]').textContent = error.message;
            }
        };
        button.addEventListener('click', onLoad);
        return () => {
            disposed = true;
            button.removeEventListener('click', onLoad);
            cleanup?.();
        };
    };
})();
