(function (global) {
    'use strict';

    const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function firstDefined() {
        for (let index = 0; index < arguments.length; index += 1) {
            const value = arguments[index];
            if (value !== undefined && value !== null) return value;
        }
        return null;
    }

    function finiteNumber(value) {
        if (value === '' || value === null || value === undefined) return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function formatActionType(type) {
        if (!type) return 'UnknownAction';
        const qualifiedName = String(type).split(',')[0].trim();
        const typeName = qualifiedName.split('.').pop() || qualifiedName;
        return (typeName.split('+')[0] || typeName).trim() || 'UnknownAction';
    }

    function blackboardScalar(entry) {
        if (!isObject(entry)) return entry;
        if (hasOwn(entry, 'valueStr') && entry.valueStr !== '') return entry.valueStr;
        if (hasOwn(entry, 'valueDouble')) return entry.valueDouble;
        if (hasOwn(entry, 'value')) return entry.value;
        return entry;
    }

    function normalizePatchInput(skillData, patchInput, warnings) {
        if (patchInput === undefined || patchInput === null) return null;

        let patches = [];
        if (Array.isArray(patchInput)) {
            patches = patchInput;
        } else if (isObject(patchInput)) {
            if (Array.isArray(patchInput.SkillPatchDataBundle)) {
                patches = patchInput.SkillPatchDataBundle;
            } else if (Array.isArray(patchInput.skillPatchDataBundle)) {
                patches = patchInput.skillPatchDataBundle;
            } else if (Array.isArray(patchInput.blackboard) || hasOwn(patchInput, 'level')) {
                patches = [patchInput];
            }
        }

        patches = patches.filter(isObject);
        if (!patches.length) {
            warnings.push({
                code: 'INVALID_PATCH_BUNDLE',
                message: 'SkillPatch input does not contain a usable level patch.'
            });
            return null;
        }

        const requestedLevel = finiteNumber(skillData?.level);
        let selected = requestedLevel === null
            ? null
            : patches.find(patch => finiteNumber(patch.level) === requestedLevel);

        if (!selected) {
            selected = patches[0];
            if (patches.length > 1 || (requestedLevel !== null && finiteNumber(selected.level) !== requestedLevel)) {
                warnings.push({
                    code: 'PATCH_LEVEL_FALLBACK',
                    message: requestedLevel === null
                        ? `No requested level was supplied; using patch level ${selected.level ?? '?'}.`
                        : `Patch level ${requestedLevel} was not found; using level ${selected.level ?? '?'}.`,
                    requestedLevel,
                    selectedLevel: finiteNumber(selected.level)
                });
            }
        }

        return selected;
    }

    function buildBlackboard(skillData, patchBundle) {
        const data = isObject(skillData) ? skillData : {};
        const warnings = [];
        const byKey = Object.create(null);

        const appendEntries = (items, source, level) => {
            if (!Array.isArray(items)) return;
            items.forEach((item, index) => {
                if (!isObject(item) || item.key === undefined || item.key === null || item.key === '') return;
                const key = String(item.key);
                const value = blackboardScalar(item);
                const previous = byKey[key];
                const history = previous ? previous.history.slice() : [];
                history.push({ source, level, value });

                if (previous && previous.source === source) {
                    warnings.push({
                        code: 'DUPLICATE_BLACKBOARD_KEY',
                        message: `Blackboard key "${key}" occurs more than once in ${source}.`,
                        key,
                        source,
                        index
                    });
                }

                byKey[key] = {
                    key,
                    value,
                    valueStr: item.valueStr ?? '',
                    isDynamic: !!item.isDynamic,
                    source,
                    level,
                    overridden: history.length > 1,
                    defaultValue: history[0]?.value,
                    history
                };
            });
        };

        appendEntries(data.blackboard, 'skill', finiteNumber(data.level));
        const selectedPatch = normalizePatchInput(data, patchBundle, warnings);
        if (selectedPatch) {
            appendEntries(selectedPatch.blackboard, 'patch', finiteNumber(selectedPatch.level));
        }

        const patch = selectedPatch ? {
            skillId: selectedPatch.skillId ?? '',
            level: finiteNumber(selectedPatch.level),
            coolDown: selectedPatch.coolDown ?? null,
            costType: selectedPatch.costType ?? null,
            costValue: selectedPatch.costValue ?? null,
            maxChargeTime: selectedPatch.maxChargeTime ?? null,
            iconId: selectedPatch.iconId ?? ''
        } : null;

        return {
            entries: Object.keys(byKey).map(key => byKey[key]),
            byKey,
            requestedLevel: finiteNumber(data.level),
            level: patch?.level ?? finiteNumber(data.level),
            patch,
            warnings
        };
    }

    function findBlackboardEntry(blackboard, key) {
        if (!blackboard || !key) return undefined;
        if (blackboard instanceof Map) return blackboard.get(key);
        if (Array.isArray(blackboard)) {
            return blackboard.find(entry => String(entry?.key ?? '') === key);
        }
        if (isObject(blackboard.byKey) && hasOwn(blackboard.byKey, key)) {
            return blackboard.byKey[key];
        }
        if (hasOwn(blackboard, key)) return blackboard[key];
        return undefined;
    }

    function resolveValue(value, blackboard) {
        const isReference = isObject(value)
            && hasOwn(value, 'useBlackboardKey')
            && hasOwn(value, 'blackboardKey')
            && hasOwn(value, 'value');

        if (!isReference) {
            return {
                value,
                usesBlackboard: false,
                blackboardKey: null,
                resolved: true,
                source: 'literal',
                fallbackValue: value
            };
        }

        const fallbackValue = value.value;
        const key = value.blackboardKey ? String(value.blackboardKey) : '';
        if (!value.useBlackboardKey || !key) {
            return {
                value: fallbackValue,
                usesBlackboard: false,
                blackboardKey: key || null,
                resolved: true,
                source: 'literal',
                fallbackValue
            };
        }

        const entry = findBlackboardEntry(blackboard, key);
        if (entry !== undefined) {
            return {
                value: blackboardScalar(entry),
                usesBlackboard: true,
                blackboardKey: key,
                resolved: true,
                source: entry?.source || 'blackboard',
                fallbackValue
            };
        }

        return {
            value: fallbackValue,
            usesBlackboard: true,
            blackboardKey: key,
            resolved: false,
            source: 'fallback',
            fallbackValue
        };
    }

    function isPresentationType(type) {
        const normalized = String(type || '').toLowerCase();
        return normalized.includes('animation')
            || normalized.includes('animator')
            || normalized.includes('playanim')
            || normalized.includes('hurtanim')
            || normalized.includes('effectaction')
            || normalized.includes('playsound')
            || normalized.includes('voice')
            || normalized.includes('camera')
            || normalized.includes('showhideactor')
            || normalized.includes('weaponvisible');
    }

    function isMovementType(type) {
        return /^(Move|RootMotion|Teleport|Jump|SnapTo|Rotate|Pull|Pushback|Knockback)/i.test(type)
            || /Move(To|Input|Direction|Location|Target|Slot)/i.test(type)
            || /RootMotion|Teleport/i.test(type);
    }

    function classifyAction(type) {
        const normalized = String(type || '').toLowerCase();
        if (isPresentationType(type)) return 'presentation';
        if (normalized === 'damageaction') return 'damage';
        if (normalized.includes('superarmor')) return 'defense';
        if (normalized.includes('allownextskill') || normalized.includes('combocache')
            || normalized.includes('markcaninterrupt') || normalized.includes('markcandash')
            || normalized.includes('blockmoveinterrupt')) return 'cancel';
        if (normalized.includes('hitstop') || normalized.includes('timedilation')) return 'timing';
        if (normalized.includes('createbuff') || normalized.includes('addbuff')) return 'buff';
        if (normalized.includes('projectile') || normalized.includes('castskill')
            || normalized.includes('abilityentity')) return 'spawn';
        if (normalized === 'interruptaction' || normalized.includes('crushaction')
            || normalized.includes('fractureaction') || normalized.includes('spellinfliction')) return 'control';
        if (isMovementType(type)) return 'movement';
        if (normalized.includes('condition') || normalized.includes('ifelse')
            || normalized.startsWith('check') || normalized.startsWith('compare')) return 'logic';
        return 'other';
    }

    function frameInfo(startFrame, endFrame) {
        const start = finiteNumber(startFrame);
        const end = finiteNumber(endFrame);
        return {
            startFrame: start,
            endFrame: end,
            durationFrames: start !== null && end !== null && end >= start ? end - start : null
        };
    }

    function analyzeSkill(skillData, patchBundle, context) {
        const data = isObject(skillData) ? skillData : {};
        const metaContext = isObject(context) ? context : {};
        const requestedLevel = firstDefined(metaContext.level, metaContext.skillLevel, data.level);
        const blackboardData = buildBlackboard(
            requestedLevel === data.level ? data : Object.assign({}, data, { level: requestedLevel }),
            patchBundle
        );
        const warnings = blackboardData.warnings.slice();
        const warningKeys = new Set(warnings.map(item => `${item.code}|${item.key || ''}|${item.message || ''}`));
        const windows = [];
        const hits = [];
        const events = [];
        const links = [];
        const linkKeys = new Set();

        const addWarning = (code, message, details) => {
            const key = `${code}|${details?.path || ''}|${details?.key || ''}|${message}`;
            if (warningKeys.has(key)) return;
            warningKeys.add(key);
            warnings.push(Object.assign({ code, message }, details || {}));
        };

        const resolveField = (value, path) => {
            const resolved = resolveValue(value, blackboardData);
            if (resolved.usesBlackboard && !resolved.resolved) {
                addWarning(
                    'UNRESOLVED_BLACKBOARD_KEY',
                    `Blackboard key "${resolved.blackboardKey}" was not found; the embedded fallback is used.`,
                    { key: resolved.blackboardKey, path }
                );
            }
            return resolved;
        };

        const character = isObject(metaContext.character) ? metaContext.character : {};
        const group = isObject(metaContext.group) ? metaContext.group : {};
        const variant = isObject(metaContext.variant) ? metaContext.variant : {};
        const castData = isObject(data.castData) ? data.castData : {};
        const runtimeCost = isObject(castData.costData) ? castData.costData : {};
        const durationFrame = finiteNumber(data.durationFrame);

        const basic = {
            skillId: data.skillId ?? '',
            skillName: data.skillName ?? '',
            level: firstDefined(requestedLevel, blackboardData.level),
            runtimeLevel: finiteNumber(data.level),
            characterId: firstDefined(metaContext.characterId, metaContext.charId, character.id, character.charId),
            characterName: firstDefined(metaContext.characterName, character.name),
            skillGroupId: firstDefined(metaContext.skillGroupId, metaContext.groupId, group.id, group.skillGroupId),
            skillGroupName: firstDefined(metaContext.skillGroupName, metaContext.groupName, group.name),
            skillGroupType: firstDefined(metaContext.skillGroupType, metaContext.groupType, group.type, group.skillGroupType),
            variantId: firstDefined(metaContext.variantId, variant.id, data.skillId),
            variantName: firstDefined(metaContext.variantName, variant.name, data.skillName),
            castType: data.castType ?? '',
            skillSpecification: data.skillSpecification ?? '',
            durationFrame,
            durationSeconds: null,
            exclusiveFrame: finiteNumber(data.exclusiveFrame),
            offsetRecordFrame: finiteNumber(data.offsetRecordFrame),
            useAIExclusiveFrame: !!data.useAIExclusiveFrame,
            aiExclusiveFrame: finiteNumber(data.aiExclusiveFrame),
            dontInterruptCombo: !!data.dontInterruptCombo,
            timeBasis: {
                durationFrame: null,
                exclusiveFrame: null,
                actionGroupFrame: null,
                startCdFrame: 30
            },
            targeting: {
                attackRangeType: data.attackRangeType ?? '',
                selectStrategy: data.selectStrategy ?? '',
                smartTargetSelectStrategy: data.smartTargetSelectStrategy ?? '',
                checkCastDistanceType: castData.checkCastDistanceType ?? '',
                useCustomCastDistance: !!castData.useCustomCastDistance,
                castDistance: resolveField(castData.castDistance, 'castData.castDistance'),
                checkHeightDiff: !!castData.checkHeightDiff,
                heightDiffLimit: resolveField(castData.heightDiffLimit, 'castData.heightDiffLimit'),
                rotateType: castData.rotateType ?? '',
                castAngle: castData.castAngle ?? null
            },
            mobility: {
                canMove: !!data.canMove,
                canCastInAir: !!data.canCastInAir,
                canDummyCast: !!data.canDummyCast,
                rootMotionCliffCheck: !!data.rootMotionCliffCheck,
                characterReturnToIdle: !!data.characterReturnToIdle,
                dummyPositionOffset: data.dummyPositionOffset ?? null
            },
            runtimeCast: {
                cooldownTime: castData.cooldownTime ?? null,
                startCdFrame: finiteNumber(castData.startCdFrame),
                maxChargeTime: castData.maxChargeTime ?? null,
                costType: runtimeCost.costType ?? null,
                costValue: resolveField(runtimeCost.costValue, 'castData.costData.costValue'),
                atbValueThreshold: resolveField(runtimeCost.atbValueThreshold, 'castData.costData.atbValueThreshold')
            },
            patch: blackboardData.patch
        };

        const eventReference = event => ({
            eventIndex: event.index,
            type: event.type,
            source: event.source,
            abilityEvent: event.abilityEvent,
            groupIndex: event.groupIndex,
            startFrame: event.startFrame,
            endFrame: event.endFrame,
            durationFrames: event.durationFrames,
            branchPath: event.branchPath.slice(),
            path: event.path
        });

        const addWindow = (kind, event, details) => {
            windows.push(Object.assign({ kind }, eventReference(event), details || {}));
        };

        const addSkillWindow = (kind, startFrame, endFrame, details) => {
            const range = frameInfo(startFrame, endFrame);
            windows.push(Object.assign({
                kind,
                type: 'Skill',
                source: 'skill',
                abilityEvent: null,
                groupIndex: null,
                eventIndex: null,
                branchPath: [],
                path: kind
            }, range, details || {}));
        };

        if (basic.exclusiveFrame !== null && basic.exclusiveFrame > 0) {
            addSkillWindow('exclusive', 0, basic.exclusiveFrame);
        }
        if (basic.offsetRecordFrame !== null && basic.offsetRecordFrame > 0) {
            addSkillWindow('offsetRecord', basic.offsetRecordFrame, basic.offsetRecordFrame);
        }
        if (basic.runtimeCast.startCdFrame !== null && basic.runtimeCast.startCdFrame >= 0) {
            addSkillWindow('costCommit', basic.runtimeCast.startCdFrame, basic.runtimeCast.startCdFrame);
        }

        const addLink = (kind, id, relation, event, details) => {
            if (id === undefined || id === null || id === '') return;
            const normalizedId = String(id);
            const dedupeKey = `${kind}|${normalizedId}|${relation}|${event.path}`;
            if (linkKeys.has(dedupeKey)) return;
            linkKeys.add(dedupeKey);
            links.push(Object.assign({ kind, id: normalizedId, relation }, eventReference(event), details || {}));
        };

        const addResolvedLink = (kind, rawId, relation, event, path, details) => {
            const resolved = resolveField(rawId, path);
            addLink(kind, resolved.value, relation, event, Object.assign({ resolvedId: resolved }, details || {}));
            return resolved;
        };

        const resolvedFields = (action, keys, path) => {
            const result = {};
            keys.forEach(key => {
                if (hasOwn(action, key)) result[key] = resolveField(action[key], `${path}.${key}`);
            });
            return result;
        };

        const normalizeCostList = (list, path) => (Array.isArray(list) ? list : []).map((cost, index) => ({
            costType: cost?.costType ?? null,
            costValue: resolveField(cost?.costValue, `${path}[${index}].costValue`),
            atbValueThreshold: resolveField(cost?.atbValueThreshold, `${path}[${index}].atbValueThreshold`)
        }));

        const normalizeBuff = (buff, index, event, path) => {
            const values = Object.create(null);
            (Array.isArray(buff?.assignItems) ? buff.assignItems : []).forEach((item, itemIndex) => {
                const key = String(item?.targetKey ?? item?.inputValueKey ?? `value${itemIndex + 1}`);
                let rawValue;
                if (item?.useDirectValue) {
                    rawValue = item.directValueType === 'String' ? item.stringValue : item.numericValue;
                } else if (item?.inputValueKey) {
                    rawValue = {
                        useBlackboardKey: true,
                        value: item.numericValue ?? item.stringValue ?? null,
                        blackboardKey: item.inputValueKey
                    };
                } else {
                    rawValue = item?.numericValue ?? item?.stringValue ?? null;
                }
                values[key] = resolveField(rawValue, `${path}.assignItems[${itemIndex}]`);
            });

            let buffId = buff?.buffId ?? '';
            if (buff?.readIdFromBlackboard && buff?.buffIdKey) {
                buffId = resolveField({
                    useBlackboardKey: true,
                    value: buffId,
                    blackboardKey: buff.buffIdKey
                }, `${path}.buffIdKey`).value;
            }
            addLink('buff', buffId, 'createBuff', event, { buffIndex: index });
            return { buffId, values, raw: buff };
        };

        const handleAction = (action, event) => {
            const type = event.type;
            const normalized = type.toLowerCase();
            const path = event.path;

            if (normalized === 'damageaction') {
                const units = Array.isArray(action.damageUnits) ? action.damageUnits : [];
                event.details = { unitCount: units.length, targetGroupKey: action.targetSettings?.targetGroupKey ?? '' };
                addWindow('damage', event, event.details);
                if (!units.length) {
                    addWarning('EMPTY_DAMAGE_ACTION', 'DamageAction has no damageUnits.', { path });
                }
                units.forEach((unit, unitIndex) => {
                    const attribute = String(unit?.damageAttributeType ?? 'Unknown');
                    const hitKind = attribute.toLowerCase() === 'hp'
                        ? 'hp'
                        : (attribute.toLowerCase() === 'poise' ? 'poise' : 'other');
                    const atkCalculation = isObject(unit?.atkCalculation) ? unit.atkCalculation : null;
                    const effectiveAtkScale = !unit?.simpleCalculation && atkCalculation?.atkScale !== undefined
                        ? atkCalculation.atkScale
                        : unit?.atkScale;
                    const poiseValue = unit?.poiseCalculation?.value ?? unit?.poiseCalculation ?? null;
                    hits.push(Object.assign({
                        kind: hitKind,
                        unitIndex,
                        damageType: unit?.damageType ?? '',
                        damageAttributeType: attribute,
                        atkScale: resolveField(effectiveAtkScale, `${path}.damageUnits[${unitIndex}].${!unit?.simpleCalculation && atkCalculation?.atkScale !== undefined ? 'atkCalculation.atkScale' : 'atkScale'}`),
                        atkCalculationType: atkCalculation ? formatActionType(atkCalculation.$type) : '',
                        poiseValue: resolveField(poiseValue, `${path}.damageUnits[${unitIndex}].poiseCalculation.value`),
                        simpleCalculation: !!unit?.simpleCalculation,
                        ignoreDamageImmuneLevel: unit?.ignoreDamageImmuneLevel ?? null,
                        ignorePoiseImmune: !!unit?.ignorePoiseImmune,
                        reduceDamageForGuard: !!unit?.reduceDamageForGuard,
                        reduceDamageForGuardRatio: unit?.reduceDamageForGuardRatio ?? null,
                        gainCost: !!unit?.gainCost,
                        costDataList: normalizeCostList(unit?.costDataList, `${path}.damageUnits[${unitIndex}].costDataList`),
                        targetGroupKey: action.targetSettings?.targetGroupKey ?? '',
                        raw: unit
                    }, eventReference(event)));
                });
                return;
            }

            if (normalized.includes('setsuperarmor')) {
                const details = {
                    superArmorValue: resolveField(action.superArmorValue, `${path}.superArmorValue`),
                    impactResistance: resolveField(action.impactResistance, `${path}.impactResistance`),
                    targetGroupKey: action.targetSettings?.targetGroupKey ?? ''
                };
                event.details = details;
                addWindow('superArmor', event, details);
                return;
            }

            if (normalized.includes('allownextskill')) {
                const allowedSkillIds = Array.isArray(action.allowedSkillIdList) ? action.allowedSkillIdList.filter(Boolean) : [];
                event.details = { allowedSkillIds };
                addWindow('allowNextSkill', event, { allowedSkillIds });
                allowedSkillIds.forEach(skillId => addLink('skill', skillId, 'allowNextSkill', event));
                return;
            }

            if (normalized.includes('combocache')) {
                const mappings = (Array.isArray(action.mappingDataList) ? action.mappingDataList : []).map((mapping, index) => {
                    const skillId = mapping?.skillId ?? '';
                    addLink('skill', skillId, 'comboCache', event, { command: mapping?.cmdType ?? '', mappingIndex: index });
                    return {
                        command: mapping?.cmdType ?? '',
                        skillId,
                        cacheEndByAction: !!mapping?.cacheEndByAction,
                        overrideCacheTime: !!mapping?.overrideCacheTime,
                        cacheTime: resolveField(mapping?.cacheTime, `${path}.mappingDataList[${index}].cacheTime`)
                    };
                });
                event.details = { mappings };
                addWindow('comboCache', event, { mappings });
                return;
            }

            if (normalized.includes('markcaninterrupt')) {
                addWindow('canInterrupt', event);
                return;
            }
            if (normalized.includes('markcandash')) {
                addWindow('canDash', event);
                return;
            }
            if (normalized.includes('blockmoveinterrupt')) {
                addWindow('blockMoveInterrupt', event);
                return;
            }

            if (normalized.includes('hitstop')) {
                const details = {
                    affectType: action.affectType ?? '',
                    duration: resolveField(action.duration, `${path}.duration`),
                    curveKey: action.curveKey ?? '',
                    useDirectCurve: !!action.useDirectCurve
                };
                event.details = details;
                addWindow('hitStop', event, details);
                return;
            }

            if (normalized.includes('timedilation')) {
                const details = {
                    layer: action.layer ?? '',
                    duration: resolveField(action.duration, `${path}.duration`),
                    curveKey: action.curveKey ?? '',
                    useCurveKey: !!action.useCurveKey,
                    finishByAction: !!action.finishByAction
                };
                event.details = details;
                addWindow('timeDilation', event, details);
                return;
            }

            if (normalized.includes('createbuff') || normalized.includes('addbuff')) {
                const buffs = (Array.isArray(action.buffs) ? action.buffs : []).map((buff, index) => (
                    normalizeBuff(buff, index, event, `${path}.buffs[${index}]`)
                ));
                event.details = {
                    count: resolveField(action.count, `${path}.count`),
                    buffs
                };
                buffs.forEach(buff => {
                    const buffId = String(buff.buffId || '').toLowerCase();
                    if (buffId.includes('superarmor')) {
                        addWindow('buffSuperArmor', event, { buffId: buff.buffId, values: buff.values });
                    }
                    if (buffId.includes('damage_immune') || buffId.includes('damageimmune')) {
                        addWindow('damageImmune', event, { buffId: buff.buffId, values: buff.values });
                    }
                });
                return;
            }

            if (normalized.includes('launchprojectile')) {
                const projectileId = addResolvedLink('projectile', action.projectileId, 'launch', event, `${path}.projectileId`);
                const skillFields = [
                    ['projectileSkillId', 'projectileHit'],
                    ['skillIdOnBlock', 'projectileBlock'],
                    ['skillIdOnReach', 'projectileReach'],
                    ['skillIdOnFinish', 'projectileFinish']
                ];
                const linkedSkills = {};
                skillFields.forEach(([key, relation]) => {
                    if (!hasOwn(action, key)) return;
                    linkedSkills[key] = addResolvedLink('skill', action[key], relation, event, `${path}.${key}`);
                });
                event.details = { projectileId, linkedSkills };
                return;
            }

            if (normalized.includes('castskill')) {
                const skillId = addResolvedLink('skill', action.skillId ?? action.castSkillId, 'castSkill', event, `${path}.skillId`);
                event.details = {
                    skillId,
                    skipApplyCost: !!action.skipApplyCost,
                    inheritSourceSkillCastId: !!action.inheritSourceSkillCastId
                };
                return;
            }

            if (normalized.includes('abilityentity')) {
                const abilityEntityId = addResolvedLink(
                    'abilityEntity',
                    action.abilityEntityId ?? action.entityId,
                    normalized.includes('spawn') ? 'spawn' : 'abilityEntity',
                    event,
                    `${path}.abilityEntityId`
                );
                const abilityEntitySkillId = addResolvedLink(
                    'skill',
                    action.abilityEntitySkillId,
                    'abilityEntitySkill',
                    event,
                    `${path}.abilityEntitySkillId`
                );
                event.details = {
                    abilityEntityId,
                    abilityEntitySkillId,
                    duration: hasOwn(action, 'duration') ? resolveField(action.duration, `${path}.duration`) : null,
                    overrideDuration: !!action.overrideDuration
                };
                return;
            }

            if (normalized === 'interruptaction' || normalized.includes('crushaction')
                || normalized.includes('fractureaction') || normalized.includes('spellinfliction')) {
                event.details = resolvedFields(action, [
                    'overrideSuperArmorLimit', 'immobilizedTime', 'blowOffDistance', 'distanceRandomRange',
                    'blowOffHeight', 'totalTime', 'damageMultiplier', 'duration', 'value'
                ], path);
                event.details.controlType = normalized === 'interruptaction'
                    ? 'interrupt'
                    : (normalized.includes('crush') ? 'crush' : (normalized.includes('fracture') ? 'fracture' : 'spellInfliction'));
                return;
            }

            if (isMovementType(type)) {
                event.details = resolvedFields(action, [
                    'distance', 'moveDistance', 'speed', 'duration', 'totalTime', 'height',
                    'destFrame', 'blowOffDistance', 'blowOffHeight'
                ], path);
                addWindow('movement', event, { movementType: type, values: event.details });
            }
        };

        const isNestedActionKey = key => {
            const normalized = String(key || '').toLowerCase();
            return normalized === 'actiondata'
                || normalized === 'actions'
                || normalized.endsWith('actions')
                || normalized.includes('conditionaction')
                || normalized.includes('succeedaction')
                || normalized.includes('successaction')
                || normalized.includes('failaction')
                || normalized.includes('thenaction')
                || normalized.includes('elseaction');
        };

        const branchName = key => String(key || 'actions')
            .replace(/ActionData$/i, '')
            .replace(/Actions?$/i, '')
            || 'actions';

        const walkContainer = (container, inherited, path, depth) => {
            if (depth > 48) {
                addWarning('ACTION_DEPTH_LIMIT', 'Nested action traversal stopped at depth 48.', { path });
                return;
            }
            if (Array.isArray(container)) {
                container.forEach((item, index) => walkContainer(item, inherited, `${path}[${index}]`, depth));
                return;
            }
            if (!isObject(container)) return;

            if (!container.$type) {
                if (container._sequenceActionData) {
                    walkContainer(container._sequenceActionData, inherited, `${path}._sequenceActionData`, depth + 1);
                }
                if (container.actionData) {
                    walkContainer(container.actionData, inherited, `${path}.actionData`, depth + 1);
                }
                if (container.actions) {
                    walkContainer(container.actions, inherited, `${path}.actions`, depth + 1);
                }
                return;
            }

            const type = formatActionType(container.$type);
            const event = Object.assign({
                index: events.length,
                type,
                rawType: container.$type,
                category: classifyAction(type),
                presentation: isPresentationType(type),
                enabled: container.isEnable !== false,
                serverActionIndex: container.serverActionIndex ?? null,
                priorityLevel: container.priorityLevel ?? null,
                priorityOffset: container.priorityOffset ?? null,
                branchPath: inherited.branchPath.slice(),
                path,
                raw: container
            }, frameInfo(inherited.startFrame, inherited.endFrame), {
                source: inherited.source,
                abilityEvent: inherited.abilityEvent,
                groupIndex: inherited.groupIndex,
                sequenceIndex: inherited.sequenceIndex
            });
            events.push(event);
            handleAction(container, event);

            Object.keys(container).forEach(key => {
                if (!isNestedActionKey(key)) return;
                const child = container[key];
                if (!child || typeof child !== 'object') return;
                walkContainer(child, Object.assign({}, inherited, {
                    branchPath: inherited.branchPath.concat(branchName(key))
                }), `${path}.${key}`, depth + 1);
            });
        };

        const actionGroupData = isObject(data.actionGroupData) ? data.actionGroupData : {};
        const timelineActions = Array.isArray(actionGroupData.timelineActions)
            ? actionGroupData.timelineActions
            : (Array.isArray(data.timelineActions) ? data.timelineActions : []);
        timelineActions.forEach((groupItem, groupIndex) => {
            const range = frameInfo(groupItem?._startFrame, groupItem?._endFrame);
            if (range.startFrame !== null && range.endFrame !== null && range.endFrame < range.startFrame) {
                addWarning('REVERSED_ACTION_GROUP', 'ActionGroup end frame is earlier than its start frame.', {
                    path: `actionGroupData.timelineActions[${groupIndex}]`,
                    startFrame: range.startFrame,
                    endFrame: range.endFrame
                });
            }
            const sequence = groupItem?._sequenceActionData ?? groupItem?.sequenceActionData ?? groupItem?.actionData ?? [];
            walkContainer(sequence, {
                source: 'timeline',
                abilityEvent: null,
                groupIndex,
                sequenceIndex: 0,
                startFrame: groupItem?._startFrame,
                endFrame: groupItem?._endFrame,
                branchPath: []
            }, `actionGroupData.timelineActions[${groupIndex}]`, 0);
        });

        const passiveEventActions = Array.isArray(actionGroupData.passiveEventActions)
            ? actionGroupData.passiveEventActions
            : (Array.isArray(data.passiveEventActions) ? data.passiveEventActions : []);
        passiveEventActions.forEach((passiveEvent, eventIndex) => {
            const wrappers = Array.isArray(passiveEvent?.actions)
                ? passiveEvent.actions
                : (passiveEvent?.actions ? [passiveEvent.actions] : []);
            wrappers.forEach((wrapper, sequenceIndex) => {
                walkContainer(wrapper, {
                    source: 'passive',
                    abilityEvent: passiveEvent?.abilityEvent ?? '',
                    groupIndex: eventIndex,
                    sequenceIndex,
                    startFrame: null,
                    endFrame: null,
                    branchPath: []
                }, `actionGroupData.passiveEventActions[${eventIndex}].actions[${sequenceIndex}]`, 0);
            });
        });

        return {
            basic,
            windows,
            hits,
            events,
            links,
            blackboard: blackboardData,
            warnings
        };
    }

    global.AKEV3SkillData = Object.freeze({
        analyzeSkill,
        formatActionType,
        resolveValue,
        buildBlackboard
    });
})(window);
