(function () {
    if (window.AKEAdvancedLinks) return;

    // These are explicit foreign keys in PotentialTalentEffectTable.dataList.
    function effectTargets(effect) {
        return (effect?.dataList || []).flatMap(item => [
            { plugin: 'v3_skill', id: item.attachSkill?.skillId },
            { plugin: 'v3_buff', id: item.attachBuff?.buffId },
            { plugin: 'v3_skill', id: item.skillBbModifier?.skillId },
            { plugin: 'v3_skill', id: item.skillParamModifier?.skillId }
        ]);
    }

    function html(targets = []) {
        const target = targets.find(item => item?.id && item.plugin);
        if (!target) return '';
        const t = window.akeI18n.scope('common');
        return window.AKEUI.entryLinkHtml({
            plugin: target.plugin,
            id: target.id,
            label: t('viewAdvancedData'),
            className: 'ake-ui-disclosure-button v2e-toggle-btn'
        });
    }

    window.AKEAdvancedLinks = Object.freeze({ effectTargets, html });
})();
