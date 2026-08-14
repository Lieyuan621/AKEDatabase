(function() {
    const t = window.akeI18n.scope('modules.about');
    const sponsorGrid = document.getElementById('sponsorGrid');
    if (!sponsorGrid) return;

    document.querySelectorAll('[data-ake-module="about"] [data-i18n-alt]').forEach(image => {
        const key = image.dataset.i18nAlt.replace(/^modules\.about\./, '');
        image.alt = t(key, null, image.alt);
    });

    async function loadSponsors() {
        try {
            const res = await (window.akeFetch || fetch)('/public/CH/about/sponsors.json');
            if (!res.ok) throw new Error('无法加载赞助数据');
            let sponsors = await res.json();
            if (!Array.isArray(sponsors) || sponsors.length === 0) {
                sponsorGrid.innerHTML = `<div class="ake-ui-state" data-state="empty">${t('sponsor.empty')}</div>`;
                return;
            }
            // 排序：priority 升序，priority 相同则按时间倒序（新在前）
            sponsors.sort((a, b) => {
                const pa = a.priority ?? Infinity;
                const pb = b.priority ?? Infinity;
                if (pa !== pb) return pa - pb;
                // 时间倒序
                return (b.time || '').localeCompare(a.time || '');
            });
            renderSponsors(sponsors);
        } catch (err) {
            console.error('加载赞助列表失败:', err);
            sponsorGrid.innerHTML = `<div class="ake-ui-state" data-state="error">${t('sponsor.loadFailed')}</div>`;
        }
    }

    function renderSponsors(sponsors) {
        sponsorGrid.innerHTML = '';
        sponsors.forEach(s => {
            const card = document.createElement('div');
            card.className = 'ake-ui-card';
            card.dataset.cardKind = 'sponsor';
            const rarityClass = `rarity-${s.rarity || 1}`;
            card.innerHTML = `
                <div class="sponsor-name">${escapeHtml(s.name)}</div>
                <div class="sponsor-money ${rarityClass}">${escapeHtml(s.money)}</div>
                <div class="sponsor-time">${escapeHtml(s.time)}</div>
                <div class="sponsor-content">${escapeHtml(s.content || t('sponsor.noRemarks'))}</div>
            `;
            sponsorGrid.appendChild(card);
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
            return c;
        });
    }

    loadSponsors();
})();
