(function (global) {
    'use strict';

    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
    // Native field contracts, cross-checked against Endaxis source/controlFlow.ts.
    // These describe configured control flow, not a combat execution policy.
    const controls = {
        IfElseAction: [['conditionAction', 'condition'], ['succeedActions', 'success'], ['failActions', 'failure']],
        PhysicsCastAction: [['succeedActions', 'hit'], ['failActions', 'miss']],
        DoOnceAction: [['sequenceActionData', 'once']],
        ForEachAction: [['action', 'eachTarget']],
        ChannelingAction: [['actionOnTick', 'tick']],
        ChannelingActionV2: [['actionOnTick', 'tick']],
        TickIntervalAction: [['actionOnTick', 'tick']],
        TickIntervalActionV2: [['actionOnTick', 'tick']],
        ExecuteIntervalAction: [['actionOnExecuting', 'tick']],
        JumpToAction: [['conditionAction', 'condition']],
        TogglableAction: [['condition', 'condition'], ['action', 'whileTrue']]
    };

    function buildSkillGraph(data, options) {
        const settings = options || {};
        const formatType = settings.formatType || (type => String(type || '').split(',')[0].split('+')[0].split('.').pop());
        const resource = { kind: 'skill', id: String(data?.skillId || ''), file: settings.sourceFile || '' };
        const nodes = Object.create(null);
        const entries = [];
        const edges = [];
        const diagnostics = [];
        const eventByPath = new Map((settings.events || []).map(event => [event.path, event]));
        const linksByPath = new Map();
        (settings.links || []).forEach(link => {
            if (!linksByPath.has(link.path)) linksByPath.set(link.path, []);
            linksByPath.get(link.path).push(link);
        });
        const nodeByPath = new Map();
        const scanned = new WeakSet();
        const maxNodes = 20000;
        let budgetReported = false;
        let nodeCount = 0;
        const diagnosticKeys = new Set();
        const diagnostic = (code, path) => {
            const key = `${code}:${path}`;
            if (!diagnosticKeys.has(key)) { diagnosticKeys.add(key); diagnostics.push({ code, path }); }
        };
        const sequence = value => object(value) && Array.isArray(value.actionData) && !value.$type;
        const action = value => object(value) && !!value.$type
            && (own(value, 'isEnable') || own(value, 'serverActionIndex') || /Action(?:\+|[.,]|$)/.test(value.$type));
        const keyFor = path => `${resource.kind}:${resource.id}:${path}`;
        const create = (kind, raw, path, context) => {
            if (nodeByPath.has(path)) return nodes[nodeByPath.get(path)];
            if (nodeCount >= maxNodes) {
                if (!budgetReported) diagnostic('nodeLimit', path);
                budgetReported = true;
                return null;
            }
            const event = eventByPath.get(path);
            const node = {
                id: keyFor(path), kind, path, raw, resource, entryId: context.entryId,
                startFrame: context.startFrame ?? null, endFrame: context.endFrame ?? null,
                eventIndex: event?.index ?? null, parentId: context.parentId || null,
                enabled: context.enabled !== false && raw?.isEnable !== false,
                type: kind === 'action' ? formatType(raw.$type) : kind,
                category: event?.category || 'other', presentation: event?.presentation === true,
                children: [], ports: [], inputs: [], references: [], next: null,
                status: kind === 'action' || kind === 'unknown' ? 'opaque' : 'structural'
            };
            nodes[node.id] = node;
            nodeCount += 1;
            nodeByPath.set(path, node.id);
            return node;
        };
        const connect = (from, to, relation, extra) => {
            if (from && to) edges.push({ from, to, relation, ...extra });
        };
        const readInput = (value, path) => {
            const reference = object(value) && value.useBlackboardKey === true;
            const resolution = settings.resolveValue?.(value, settings.blackboard);
            return {
                path, raw: value, key: reference ? String(value.blackboardKey || '') : null,
                value: resolution?.value ?? (reference ? null : value),
                resolved: resolution ? resolution.resolved : !reference,
                source: resolution?.source || (reference ? 'unknown' : 'literal')
            };
        };
        const collectInputs = (value, path, node, depth) => {
            if (!value || typeof value !== 'object') return;
            if (depth > 48) { diagnostic('depthLimit', path); return; }
            if (path !== node.path && (sequence(value) || action(value))) return;
            if (own(value, 'useBlackboardKey') && own(value, 'blackboardKey') && own(value, 'value')) {
                node.inputs.push(readInput(value, path));
                return;
            }
            Object.entries(value).forEach(([key, child]) => collectInputs(child,
                Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, node, depth + 1));
        };
        const reference = (node, kind, rawId, path, relation, dynamic) => {
            if (rawId === undefined || rawId === null || rawId === '') return;
            const input = readInput(rawId, path);
            // Dynamic IDs may be modified before the call. Do not turn their initial
            // or fallback values into an authoritative navigation destination.
            const resolved = !dynamic && !input.key && input.resolved && typeof input.value === 'string' && !!input.value;
            node.references.push({ kind, id: resolved ? input.value : null, relation, path, input, resolved });
        };
        const collectReferences = node => {
            const raw = node.raw;
            if (['CreateBuffAction', 'AddBuffAction'].includes(node.type)) {
                (Array.isArray(raw.buffs) ? raw.buffs : []).forEach((buff, index) => reference(node, 'buff',
                    buff?.readIdFromBlackboard ? { useBlackboardKey: true, blackboardKey: buff.buffIdKey, value: buff.buffId } : buff?.buffId,
                    `${node.path}.buffs[${index}].buffId`, 'buff', buff?.readIdFromBlackboard === true));
            }
            if (node.type === 'SpawnAbilityEntity') {
                reference(node, 'abilityEntity', raw.abilityEntityId, `${node.path}.abilityEntityId`, 'spawn');
                reference(node, 'skill', raw.abilityEntitySkillId, `${node.path}.abilityEntitySkillId`, 'childSkill');
            }
            // Existing semantic adapters supply further links, preserving the call site.
            (linksByPath.get(node.path) || []).forEach(link => {
                if (node.references.some(item => item.kind === link.kind && item.id === link.id)) return;
                if (['CreateBuffAction', 'AddBuffAction'].includes(node.type) && link.kind === 'buff') return;
                if (node.type === 'SpawnAbilityEntity' && ['abilityEntity', 'skill'].includes(link.kind)) return;
                reference(node, link.kind, link.resolvedId?.usesBlackboard
                    ? { useBlackboardKey: true, blackboardKey: link.resolvedId.blackboardKey, value: link.id }
                    : link.id, node.path, link.relation, link.resolvedId?.resolved === false);
            });
        };
        let parse;
        const childPort = (node, raw, path, relation, context, depth, extra) => {
            const child = parse(raw, path, { ...context, parentId: node.id, enabled: node.enabled }, depth + 1);
            node.ports.push({ relation, target: child?.id ?? null, missing: raw === undefined, ...extra });
            connect(node.id, child?.id, relation);
            if (raw === undefined) diagnostic('missingPort', path);
        };
        const scan = (value, path, context, depth, owner) => {
            if (!value || typeof value !== 'object' || budgetReported) return;
            if (depth > 64) { diagnostic('depthLimit', path); return; }
            if (sequence(value) || action(value)) {
                const child = parse(value, path, owner ? { ...context, parentId: owner.id, enabled: owner.enabled } : context, depth + 1);
                if (child && owner) {
                    owner.ports.push({ relation: 'contains', target: child.id });
                    connect(owner.id, child.id, 'contains');
                    diagnostic('unknownStructure', path);
                } else if (child) {
                    entries.push({ id: child.id, target: child.id, kind: 'config', path, startFrame: null, endFrame: null });
                    child.entryId = child.id;
                }
                return;
            }
            if (scanned.has(value)) return;
            scanned.add(value);
            Object.entries(value).forEach(([key, child]) => scan(child,
                Array.isArray(value) ? `${path}[${key}]` : (path ? `${path}.${key}` : key), context, depth + 1, owner));
        };
        parse = (raw, path, context, depth) => {
            if (depth > 64) { diagnostic('depthLimit', path); return null; }
            if (nodeByPath.has(path)) return nodes[nodeByPath.get(path)];
            if (!sequence(raw) && !action(raw)) {
                const node = create('unknown', raw, path, context);
                if (node) { diagnostic('unknownStructure', path); scan(raw, path, context, depth + 1, node); }
                return node;
            }
            const node = create(sequence(raw) ? 'sequence' : 'action', raw, path, context);
            if (!node) return null;
            if (node.kind === 'sequence') {
                node.gates = {
                    mainCharacter: raw.onlyExecuteWhenSourceIsMainChar,
                    guard: raw.onlyExecuteWhenSourceIsGuard
                };
                raw.actionData.forEach((item, index) => {
                    const child = parse(item, `${path}.actionData[${index}]`,
                        { ...context, parentId: node.id, enabled: node.enabled }, depth + 1);
                    if (child) {
                        const previous = nodes[node.children[node.children.length - 1]];
                        if (previous) {
                            previous.next = child.id;
                            connect(previous.id, child.id, 'next', { configuredOrder: true });
                        } else connect(node.id, child.id, 'entry');
                        node.children.push(child.id);
                    }
                });
                Object.entries(raw).forEach(([key, value]) => {
                    if (!['actionData', 'onlyExecuteWhenSourceIsMainChar', 'onlyExecuteWhenSourceIsGuard'].includes(key)) {
                        scan(value, `${path}.${key}`, context, depth + 1, node);
                    }
                });
                return node;
            }
            collectInputs(raw, path, node, 0);
            collectReferences(node);
            node.metadata = {
                priorityLevel: raw.priorityLevel, priorityOffset: raw.priorityOffset,
                serverActionIndex: raw.serverActionIndex, alwaysNext: raw.alwaysNext,
                destinationFrame: raw.destFrame
            };
            const used = new Set();
            const ports = own(controls, node.type) ? controls[node.type] : [];
            node.status = ports.length || ['SwitchAction', 'OrConditionAction'].includes(node.type)
                ? 'control' : (eventByPath.get(path)?.category && node.category !== 'other' ? 'described' : 'opaque');
            ports.forEach(([key, relation]) => {
                used.add(key);
                childPort(node, raw[key], `${path}.${key}`, relation, context, depth);
            });
            if (node.type === 'SwitchAction') {
                used.add('options');
                if (!Array.isArray(raw.options)) diagnostic('missingPort', `${path}.options`);
                (Array.isArray(raw.options) ? raw.options : []).forEach((option, index) => {
                    childPort(node, option?.actionData, `${path}.options[${index}].actionData`, 'case', context, depth,
                        { caseValue: readInput(option?.value, `${path}.options[${index}].value`), index });
                    Object.entries(option || {}).forEach(([key, value]) => {
                        if (key !== 'actionData') scan(value, `${path}.options[${index}].${key}`, context, depth + 1, node);
                    });
                });
            }
            if (node.type === 'OrConditionAction') {
                used.add('conditionList');
                if (!Array.isArray(raw.conditionList)) diagnostic('missingPort', `${path}.conditionList`);
                (Array.isArray(raw.conditionList) ? raw.conditionList : []).forEach((condition, index) => childPort(node,
                    condition, `${path}.conditionList[${index}]`, 'anyCondition', context, depth, { index }));
            }
            if (node.type === 'TeleportAction' && own(raw, 'actionOnTargetPointInvalid')) {
                used.add('actionOnTargetPointInvalid');
                childPort(node, raw.actionOnTargetPointInvalid, `${path}.actionOnTargetPointInvalid`, 'invalidTarget', context, depth);
            }
            Object.entries(raw).forEach(([key, value]) => {
                if (!used.has(key)) scan(value, `${path}.${key}`, { ...context, parentId: node.id, enabled: node.enabled }, depth + 1, node);
            });
            return node;
        };
        const addEntry = (raw, path, kind, info) => {
            const id = keyFor(path);
            const context = { ...info, entryId: id, enabled: true };
            const node = parse(raw, path, context, 0);
            if (node) entries.push({ id, target: node.id, kind, path, ...info });
        };
        const group = object(data?.actionGroupData) ? data.actionGroupData : data || {};
        const prefix = group === data ? '' : 'actionGroupData.';
        (Array.isArray(group.timelineActions) ? group.timelineActions : []).forEach((row, index) => addEntry(
            row?._sequenceActionData, `${prefix}timelineActions[${index}]._sequenceActionData`, 'timeline',
            { groupIndex: index, startFrame: row?._startFrame ?? null, endFrame: row?._endFrame ?? null }));
        (Array.isArray(group.passiveEventActions) ? group.passiveEventActions : []).forEach((row, index) => {
            const actions = Array.isArray(row?.actions) ? row.actions : [row?.actions];
            actions.forEach((item, sequenceIndex) => addEntry(item,
                `${prefix}passiveEventActions[${index}].actions[${sequenceIndex}]`, 'passive',
                { groupIndex: index, sequenceIndex, abilityEvent: row?.abilityEvent, startFrame: null, endFrame: null }));
        });
        // Find every remaining native sequence/action, including new root structures.
        // Already parsed paths are not registered again as independent entries.
        const findRemaining = (value, path, depth) => {
            if (!value || typeof value !== 'object' || budgetReported || nodeByPath.has(path)) return;
            if (depth > 64) { diagnostic('depthLimit', path); return; }
            if (sequence(value) || action(value)) {
                addEntry(value, path, 'config', { startFrame: null, endFrame: null });
                return;
            }
            Object.entries(value).forEach(([key, child]) => findRemaining(child,
                Array.isArray(value) ? `${path}[${key}]` : (path ? `${path}.${key}` : key), depth + 1));
        };
        findRemaining(data, '', 0);
        return { resource, nodes, entries, edges, diagnostics, nodeByPath,
            truncated: budgetReported || diagnostics.some(item => item.code === 'depthLimit') };
    }

    global.AKEActionGraph = Object.freeze({ buildSkillGraph });
})(window);
