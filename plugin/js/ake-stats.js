(function() {
    const FORMULA_TO_MODTYPE = {
        Addition: 0,
        Multiplier: 1,
        FinalAddition: 3,
        FinalMultiplier: 4,
        BaseAddition: 5,
        BaseMultiplier: 6,
        BaseFinalAddition: 7,
        BaseFinalMultiplier: 8
    };

    const DEFAULT_ATTR_DISPLAY_ORDER = [0, 1, 2, 3, 20, 21, 27, 12, 8, 9, 10, 11, 15];
    const MULTIPLIER_MODIFIER_TYPES = new Set([1, 4, 6, 8]);

    function computeAttrWithModifiers(baseValue, modifiers, attrType) {
        let addition = 0;
        let multiplier = 1;
        let finalAddition = 0;
        let finalMultiplier = 1;
        let baseAddition = 0;
        let baseMultiplier = 1;
        let baseFinalAddition = 0;
        let baseFinalMultiplier = 1;

        (modifiers || []).forEach(modifier => {
            if (modifier.attrType !== attrType) return;
            const value = modifier.attrValue;
            switch (modifier.modifierType) {
                case 0: addition += value; break;
                case 1: multiplier *= (1 + value); break;
                case 3: finalAddition += value; break;
                case 4: finalMultiplier *= value; break;
                case 5: baseAddition += value; break;
                case 6: baseMultiplier *= (1 + value); break;
                case 7: baseFinalAddition += value; break;
                case 8: baseFinalMultiplier *= value; break;
            }
        });

        return ((((baseValue + baseAddition) * baseMultiplier + baseFinalAddition) * baseFinalMultiplier + finalAddition) * finalMultiplier + addition) * multiplier;
    }

    function pickLevelAttributes(levelDependentAttributes, enemyLevel) {
        const levelRows = levelDependentAttributes || [];
        for (const row of levelRows) {
            const attrs = row.attrs || [];
            const level = attrs.find(attr => attr.attrType === 0)?.attrValue || 0;
            if (level === enemyLevel) return attrs;
        }

        if (!levelRows.length) return [];
        const closestLevel = levelRows.reduce((best, row) => {
            const level = (row.attrs || []).find(attr => attr.attrType === 0)?.attrValue || 0;
            return Math.abs(level - enemyLevel) < Math.abs(best - enemyLevel) ? level : best;
        }, levelRows[0]?.attrs?.find(attr => attr.attrType === 0)?.attrValue || 0);

        return (levelRows.find(row => ((row.attrs || []).find(attr => attr.attrType === 0)?.attrValue || 0) === closestLevel)?.attrs) || [];
    }

    function getEnemyStatsAtLevel(attrTemplateData, enemyLevel, modifiers, options) {
        if (!attrTemplateData) return null;
        const opts = options || {};
        const displayOrder = opts.displayOrder || DEFAULT_ATTR_DISPLAY_ORDER;
        const getAttrName = opts.getAttrName || (attrType => window.akeI18n.t('modules.character.attributeFallback', { name: attrType }));
        const baseAttrs = {};

        pickLevelAttributes(attrTemplateData.levelDependentAttributes || [], enemyLevel).forEach(attr => {
            baseAttrs[attr.attrType] = attr.attrValue;
        });

        (attrTemplateData.levelIndependentAttributes?.attrs || []).forEach(attr => {
            if (baseAttrs[attr.attrType] === undefined) baseAttrs[attr.attrType] = attr.attrValue;
        });

        if (modifiers && modifiers.length > 0) {
            Object.keys(baseAttrs).forEach(key => {
                const attrType = parseInt(key, 10);
                baseAttrs[attrType] = computeAttrWithModifiers(baseAttrs[attrType], modifiers, attrType);
            });

            if (opts.includeModifierOnlyAttrs) {
                new Set(modifiers.map(modifier => modifier.attrType)).forEach(attrType => {
                    if (baseAttrs[attrType] !== undefined) return;
                    const attrModifiers = modifiers.filter(modifier => modifier.attrType === attrType);
                    const baseValue = attrModifiers.every(modifier => MULTIPLIER_MODIFIER_TYPES.has(modifier.modifierType)) ? 1 : 0;
                    baseAttrs[attrType] = computeAttrWithModifiers(baseValue, modifiers, attrType);
                });
            }
        }

        const result = {};
        displayOrder.forEach(attrType => {
            if (baseAttrs[attrType] !== undefined) result[getAttrName(attrType)] = baseAttrs[attrType];
        });
        Object.keys(baseAttrs).forEach(key => {
            const attrType = parseInt(key, 10);
            if (!displayOrder.includes(attrType) && attrType >= 4) result[getAttrName(attrType)] = baseAttrs[attrType];
        });
        return result;
    }

    window.AKEStats = {
        FORMULA_TO_MODTYPE,
        DEFAULT_ATTR_DISPLAY_ORDER,
        computeAttrWithModifiers,
        getEnemyStatsAtLevel
    };
})();
