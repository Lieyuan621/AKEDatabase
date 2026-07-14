console.log('🔴 settings.html 脚本开始执行');
    (function() {
        // 脚本开始标记
        console.log('🚀 Settings script loaded');

        // 确保全局 API 存在
        if (!window.akeData) {
            console.error('❌ akeData 未定义，请检查主页面');
            return;
        }

        // 等待 DOM 完全加载（因为脚本可能在 HTML 末尾执行，但为了保险）
        function init() {
            console.log('🔄 初始化设置模块...');

            window.akeData.translateDOM?.(document);

            const config = window.akeData.getConfig();
            console.log('📋 当前配置:', config);

            const themeSelect = document.getElementById('themeSelect');
            const showHiddenCheck = document.getElementById('showHiddenCheck');

            if (!themeSelect) {
                console.error('❌ 未找到 themeSelect 元素');
            } else {
                console.log('✅ themeSelect 已找到，当前值:', themeSelect.value);
                themeSelect.value = config.theme; // config.theme 应为小写
                themeSelect.addEventListener('change', (e) => {
                    console.log('🎨 主题切换为:', e.target.value);
                    window.akeData.setTheme(e.target.value);
                });
            }

            if (!showHiddenCheck) {
                console.error('❌ 未找到 showHiddenCheck 元素');
            } else {
                console.log('✅ showHiddenCheck 已找到，当前值:', showHiddenCheck.checked);
                showHiddenCheck.checked = config.showHidden;
                showHiddenCheck.addEventListener('change', (e) => {
                    console.log('👁️ 隐藏模块开关:', e.target.checked);
                    window.akeData.toggleShowHidden(e.target.checked);
                });
            }
        }

        // 如果 DOM 已就绪则立即执行，否则等待
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();
