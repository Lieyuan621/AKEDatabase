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
        const ownerName = qualifiedName.split('+')[0].trim();
        const parts = ownerName.split('.').filter(Boolean);
        let typeName = parts.pop() || ownerName;

        // Older exports encode nested Data classes with dots instead of '+'.
        if (typeName === 'Data') {
            typeName = parts.pop() || typeName;
        } else if (/ActionData$/i.test(typeName)) {
            const parentName = parts[parts.length - 1];
            typeName = parentName && /Action$/i.test(parentName)
                ? parentName
                : typeName.replace(/Data$/i, '');
        }
        return typeName.trim() || 'UnknownAction';
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
        if (/^(check|compare)/.test(normalized)
            || normalized.includes('effectfindtarget')
            || normalized.includes('raycasteffect')) return false;
        return normalized.includes('animation')
            || normalized.includes('animator')
            || normalized.includes('animevent')
            || normalized.includes('hurtanim')
            || normalized.includes('dashanim')
            || normalized.includes('dodgeanim')
            || normalized.includes('playanim')
            || normalized.includes('effect')
            || normalized.includes('playsound')
            || normalized.includes('voice')
            || normalized.includes('camera')
            || normalized.includes('warningaction')
            || normalized.includes('showhideactor')
            || normalized.includes('weaponvisible')
            || normalized.includes('weaponanimation')
            || normalized.includes('weaponmountpoint')
            || normalized.includes('hideui')
            || normalized.includes('showcomboskillui')
            || normalized.includes('forcehideheadbar')
            || normalized.includes('ultimateshow')
            || normalized.includes('togglemesh')
            || normalized.includes('debugprint')
            || normalized === 'logaction';
    }

    function isMovementType(type) {
        const normalized = String(type || '');
        if (/^JumpToAction$/i.test(normalized)) return false;
        return /^(Move|RootMotion|Teleport|JumpToTarget|SnapTo|SelfRotate|Pull|PushBack|SkillAIMove)/i.test(normalized)
            || /Move(To|Input|Direction|Location|Target|Slot)/i.test(normalized)
            || /RootMotion|Teleport/i.test(normalized);
    }

    function isActionNode(value) {
        return isObject(value) && !!value.$type
            && hasOwn(value, 'isEnable')
            && hasOwn(value, 'priorityLevel')
            && hasOwn(value, 'priorityOffset')
            && hasOwn(value, 'serverActionIndex');
    }

    function isNestedActionKey(key) {
        const normalized = String(key || '').toLowerCase();
        return normalized === 'action'
            || normalized === 'actiondata'
            || normalized === '_sequenceactiondata'
            || normalized === 'sequenceactiondata'
            || normalized === 'actionontick'
            || normalized === 'actioninaura'
            || normalized === 'actionwhenexitaura'
            || normalized === 'abilityactionmap'
            || normalized === 'actiononevent'
            || normalized === 'onendaction'
            || normalized === 'condition'
            || normalized === 'conditionlist'
            || normalized === 'options'
            || normalized === 'actions'
            || normalized.endsWith('actions')
            || normalized.includes('conditionaction')
            || normalized.includes('succeedaction')
            || normalized.includes('successaction')
            || normalized.includes('failaction')
            || normalized.includes('thenaction')
            || normalized.includes('elseaction');
    }

    function classifyAction(type) {
        const normalized = String(type || '').toLowerCase();
        if (isPresentationType(type)) return 'presentation';
        if (normalized.includes('damageaction') || normalized === 'waterdronehitaction') return 'damage';
        if (normalized.includes('heal') || normalized.includes('recoverpoise')) return 'recovery';
        if (normalized.includes('superarmor') || normalized.includes('armor')) return 'defense';
        if (normalized.includes('allownextskill') || normalized.includes('combocache')
            || normalized.includes('markcaninterrupt') || normalized.includes('markcandash')
            || normalized.includes('blockmoveinterrupt')) return 'cancel';
        if (normalized.includes('hitstop') || normalized.includes('timedilation')
            || normalized.includes('channeling') || normalized.includes('tickinterval')
            || normalized === 'jumptoaction' || normalized.includes('pausecomboskilltime')) return 'timing';
        if (normalized.includes('buff') || normalized.includes('aura') || normalized.includes('weakness')
            || normalized.includes('tagaction') || normalized.includes('dispel')) return 'buff';
        if (normalized.includes('projectile') || normalized.includes('castskill')
            || normalized.includes('spawnabilityentity') || normalized.includes('spawnenemy')) return 'spawn';
        if (normalized.includes('cost') || normalized.includes('atb') || normalized.includes('usp')
            || normalized.includes('resource')) return 'resource';
        if (normalized === 'interruptaction' || normalized.includes('crushaction')
            || normalized.includes('fractureaction') || normalized.includes('spellinfliction')
            || normalized.includes('blowoff') || normalized.includes('airborne')
            || normalized.includes('knockdown') || normalized.includes('takedown')
            || normalized.includes('launchupward') || normalized.includes('slowaction')) return 'control';
        if (isMovementType(type)) return 'movement';
        if (normalized.includes('condition') || normalized.includes('ifelse')
            || normalized.startsWith('check') || normalized.startsWith('compare')
            || normalized.includes('blackboard') || normalized.includes('calcbb')
            || normalized.startsWith('save') || normalized.startsWith('store')
            || normalized.includes('probablity') || normalized.includes('random')
            || normalized.includes('switchaction') || normalized.includes('foreach')
            || normalized.includes('repeataction') || normalized.includes('doonce')) return 'logic';
        if (normalized.includes('findtarget') || normalized.includes('picktarget')
            || normalized.includes('mergetarget') || normalized.includes('targetpostprocessor')
            || normalized.includes('converttotarget')) return 'targeting';
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

        const summaryMetaKeys = new Set([
            '$type', 'isEnable', 'priorityLevel', 'priorityOffset', 'serverActionIndex'
        ]);
        const summaryPriority = [
            'skillId', 'castSkillId', 'targetSkillId', 'projectileId', 'abilityEntityId', 'enemyId',
            'buffId', 'buffIds', 'markerId', 'signalId', 'key', 'blackboardKey', 'bbKey', 'contextKey',
            'operation', 'operationType', 'calculateType', 'compare', 'compareType', 'value', 'valueA',
            'valueB', 'costType', 'costValue', 'coefficient', 'damageType', 'damageAttributeType',
            'healType', 'superArmorValue', 'impactResistance', 'overrideSuperArmorLimit', 'duration',
            'totalTime', 'triggerInterval', 'tickInterval', 'distance', 'moveDistance', 'horizontalSpeed',
            'verticalSpeed', 'height', 'targetGroupKey', 'targetSource', 'source', 'target', 'owner'
        ];
        const summaryPriorityIndex = new Map(summaryPriority.map((key, index) => [key.toLowerCase(), index]));
        const summaryFieldLimit = 32;

        const isBlackboardReference = value => isObject(value)
            && hasOwn(value, 'useBlackboardKey')
            && hasOwn(value, 'blackboardKey')
            && hasOwn(value, 'value');

        const countActionNodes = (value, depth) => {
            const currentDepth = Number(depth) || 0;
            if (!value || currentDepth > 24) return 0;
            if (Array.isArray(value)) {
                return value.reduce((total, child) => total + countActionNodes(child, currentDepth + 1), 0);
            }
            if (!isObject(value)) return 0;
            const ownCount = isActionNode(value) ? 1 : 0;
            return ownCount + Object.keys(value).reduce((total, key) => (
                total + countActionNodes(value[key], currentDepth + 1)
            ), 0);
        };

        const buildActionSummary = (action, path) => {
            const fields = [];
            let truncated = false;

            const append = (key, value, fieldPath) => {
                if (fields.length >= summaryFieldLimit) {
                    truncated = true;
                    return;
                }
                if (value === undefined || value === null || value === '') return;
                fields.push({ key: String(key || 'value').replace(/^_+/, ''), value, path: fieldPath });
            };

            const appendBlackboardPairs = (value, fieldPath) => {
                const consumed = new Set();
                Object.keys(value).forEach(flagKey => {
                    const match = /^use(.+)BlackboardKey$/i.exec(flagKey);
                    if (!match || value[flagKey] !== true) return;
                    const baseKey = `${match[1][0].toLowerCase()}${match[1].slice(1)}`;
                    const blackboardKeyField = `${baseKey}BlackboardKey`;
                    if (!hasOwn(value, baseKey) || !hasOwn(value, blackboardKeyField)) return;
                    append(baseKey, resolveField({
                        useBlackboardKey: true,
                        value: value[baseKey],
                        blackboardKey: value[blackboardKeyField]
                    }, `${fieldPath}.${baseKey}`), `${fieldPath}.${baseKey}`);
                    consumed.add(flagKey);
                    consumed.add(baseKey);
                    consumed.add(blackboardKeyField);
                });
                if (value.readIdFromBlackboard === true && value.buffIdKey && hasOwn(value, 'buffId')) {
                    append('buffId', resolveField({
                        useBlackboardKey: true,
                        value: value.buffId,
                        blackboardKey: value.buffIdKey
                    }, `${fieldPath}.buffId`), `${fieldPath}.buffId`);
                    consumed.add('readIdFromBlackboard');
                    consumed.add('buffId');
                    consumed.add('buffIdKey');
                }
                return consumed;
            };

            const orderedKeys = value => Object.keys(value)
                .filter(key => !summaryMetaKeys.has(key))
                .sort((left, right) => {
                    const leftRank = summaryPriorityIndex.get(left.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
                    const rightRank = summaryPriorityIndex.get(right.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
                    return leftRank - rightRank;
                });

            const visit = (value, key, fieldPath, depth) => {
                if (fields.length >= summaryFieldLimit) {
                    truncated = true;
                    return;
                }
                if (value === undefined || value === null || value === '') return;
                if (isBlackboardReference(value)) {
                    append(key, resolveField(value, fieldPath), fieldPath);
                    return;
                }
                if (Array.isArray(value)) {
                    if (!value.length) return;
                    if (value.every(child => !isObject(child) && !Array.isArray(child))) {
                        append(key, value, fieldPath);
                        return;
                    }
                    value.slice(0, 8).forEach((child, index) => (
                        visit(child, key, `${fieldPath}[${index}]`, depth + 1)
                    ));
                    if (value.length > 8) append(`${key}RemainingCount`, value.length - 8, fieldPath);
                    return;
                }
                if (!isObject(value)) {
                    append(key, value, fieldPath);
                    return;
                }
                if (isActionNode(value)) return;
                if (hasOwn(value, 'inputValueKey') && value.inputValueKey && value.useDirectValue !== true) {
                    const assignmentKey = value.targetKey || value.inputValueKey || key;
                    append(assignmentKey, resolveField({
                        useBlackboardKey: true,
                        value: value.numericValue ?? value.stringValue ?? null,
                        blackboardKey: value.inputValueKey
                    }, fieldPath), fieldPath);
                    return;
                }
                if (value.useDirectValue === true && (hasOwn(value, 'numericValue') || hasOwn(value, 'stringValue'))) {
                    append(value.targetKey || key, value.directValueType === 'String' ? value.stringValue : value.numericValue, fieldPath);
                    return;
                }
                if (depth >= 5) {
                    truncated = true;
                    return;
                }
                if (value.$type) {
                    append(`${key}Type`, formatActionType(value.$type), `${fieldPath}.$type`);
                }
                const consumedKeys = appendBlackboardPairs(value, fieldPath);
                orderedKeys(value).forEach(childKey => {
                    if (childKey === '$type' || consumedKeys.has(childKey)) return;
                    const child = value[childKey];
                    const nestedCount = isNestedActionKey(childKey) ? countActionNodes(child) : 0;
                    if (nestedCount) {
                        append(`${childKey}Count`, nestedCount, `${fieldPath}.${childKey}`);
                        return;
                    }
                    visit(child, childKey, `${fieldPath}.${childKey}`, depth + 1);
                });
            };

            const consumedKeys = appendBlackboardPairs(action, path);
            orderedKeys(action).forEach(key => {
                if (consumedKeys.has(key)) return;
                const value = action[key];
                const nestedCount = isNestedActionKey(key) ? countActionNodes(value) : 0;
                if (nestedCount) {
                    append(`${key}Count`, nestedCount, `${path}.${key}`);
                    return;
                }
                visit(value, key, `${path}.${key}`, 0);
            });
            return { fields, truncated };
        };

        const handleAction = (action, event) => {
            const type = event.type;
            const normalized = type.toLowerCase();
            const path = event.path;

            if (normalized === 'damageaction' || normalized === 'channelingdamageaction') {
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

            if ((normalized === 'createbuffaction' || normalized === 'addbuffaction') && Array.isArray(action.buffs)) {
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
                    ['projectileSkillId', 'projectileHit', 'castSkillOnHit'],
                    ['skillIdOnBlock', 'projectileBlock', 'castSkillOnBlock'],
                    ['skillIdOnReach', 'projectileReach', 'castSkillOnReach'],
                    ['skillIdOnFinish', 'projectileFinish', 'castSkillOnFinish']
                ];
                const linkedSkills = {};
                skillFields.forEach(([key, relation, gateKey]) => {
                    if (!hasOwn(action, key)) return;
                    const resolvedId = resolveField(action[key], `${path}.${key}`);
                    linkedSkills[key] = resolvedId;
                    if (!hasOwn(action, gateKey) || action[gateKey] !== false) {
                        addLink('skill', resolvedId.value, relation, event, { resolvedId, gate: gateKey });
                    }
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

            if (normalized === 'spawnabilityentity') {
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

            if (normalized === 'interruptaction' || normalized === 'crushaction'
                || normalized === 'fractureaction' || normalized === 'spellinfliction'
                || normalized === 'spellinflictiononchar' || normalized === 'inversespellinfliction') {
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

        const branchName = key => String(key || 'actions')
            .replace(/ActionData$/i, '')
            .replace(/Actions?$/i, '')
            || 'actions';

        const branchRelation = key => {
            const normalized = String(key || '').toLowerCase();
            if (normalized.includes('condition')) return 'condition';
            if (normalized.includes('succeed') || normalized.includes('success') || normalized.includes('then')) return 'success';
            if (normalized.includes('fail') || normalized.includes('else')) return 'failure';
            if (normalized.includes('tick')) return 'tick';
            if (normalized === 'actioninaura') return 'aura-enter';
            if (normalized === 'actionwhenexitaura') return 'aura-exit';
            if (normalized.includes('end')) return 'on-end';
            if (normalized === 'options') return 'switch-case';
            if (normalized === 'abilityactionmap' || normalized === 'actiononevent') return 'ability-event';
            return branchName(key);
        };

        const walkedObjects = new WeakSet();
        let walkedNodeCount = 0;

        const walkContainer = (container, inherited, path, depth) => {
            if (depth > 64) {
                addWarning('ACTION_DEPTH_LIMIT', 'Nested action traversal stopped at depth 64.', { path });
                return;
            }
            if (Array.isArray(container)) {
                container.forEach((item, index) => walkContainer(item, inherited, `${path}[${index}]`, depth + 1));
                return;
            }
            if (!isObject(container)) return;
            if (walkedObjects.has(container)) return;
            walkedObjects.add(container);
            walkedNodeCount += 1;
            if (walkedNodeCount > 200000) {
                addWarning('ACTION_NODE_LIMIT', 'Action traversal stopped after 200000 structured nodes.', { path });
                return;
            }

            let parentEventIndex = inherited.parentEventIndex ?? null;
            if (isActionNode(container)) {
                const type = formatActionType(container.$type);
                const summary = buildActionSummary(container, path);
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
                    parentEventIndex,
                    relation: inherited.relation || '',
                    summaryFields: summary.fields,
                    summaryTruncated: summary.truncated,
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
                parentEventIndex = event.index;
            }

            Object.keys(container).forEach(key => {
                const child = container[key];
                if (!child || typeof child !== 'object') return;
                const isBranch = isNestedActionKey(key);
                walkContainer(child, Object.assign({}, inherited, {
                    parentEventIndex,
                    relation: isBranch ? branchRelation(key) : inherited.relation,
                    branchPath: isBranch ? inherited.branchPath.concat(branchName(key)) : inherited.branchPath
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
            walkContainer(groupItem, {
                source: 'timeline',
                abilityEvent: null,
                groupIndex,
                sequenceIndex: 0,
                startFrame: groupItem?._startFrame,
                endFrame: groupItem?._endFrame,
                parentEventIndex: null,
                relation: '',
                branchPath: []
            }, `actionGroupData.timelineActions[${groupIndex}]`, 0);
        });

        const passiveEventActions = Array.isArray(actionGroupData.passiveEventActions)
            ? actionGroupData.passiveEventActions
            : (Array.isArray(data.passiveEventActions) ? data.passiveEventActions : []);
        passiveEventActions.forEach((passiveEvent, eventIndex) => {
            walkContainer(passiveEvent, {
                source: 'passive',
                abilityEvent: passiveEvent?.abilityEvent ?? '',
                groupIndex: eventIndex,
                sequenceIndex: 0,
                startFrame: null,
                endFrame: null,
                parentEventIndex: null,
                relation: '',
                branchPath: []
            }, `actionGroupData.passiveEventActions[${eventIndex}]`, 0);
        });

        Object.keys(actionGroupData).forEach(key => {
            if (key === 'timelineActions' || key === 'passiveEventActions') return;
            walkContainer(actionGroupData[key], {
                source: 'config', abilityEvent: null, groupIndex: null, sequenceIndex: null,
                startFrame: null, endFrame: null, parentEventIndex: null, relation: branchRelation(key), branchPath: [branchName(key)]
            }, `actionGroupData.${key}`, 0);
        });

        Object.keys(data).forEach(key => {
            if (key === 'actionGroupData' || key === 'timelineActions' || key === 'passiveEventActions') return;
            const source = /highlight/i.test(key) ? 'highlight' : (/switch.*condition/i.test(key) ? 'switch-condition' : 'config');
            walkContainer(data[key], {
                source, abilityEvent: null, groupIndex: null, sequenceIndex: null,
                startFrame: null, endFrame: null, parentEventIndex: null, relation: branchRelation(key), branchPath: [branchName(key)]
            }, key, 0);
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
