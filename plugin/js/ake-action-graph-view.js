(function (global) {
    'use strict';

    // Presentation-only subgraph merging. Compare every native field, including
    // unknown fields; never equate blackboard reads by value. An action's own
    // serverActionIndex identifies its occurrence, not its displayed structure.
    // Ignore only that declaration (not index references); raw data and each
    // occurrence's inspector retain the original serverActionIndex unchanged.
    // Conditions and individual output ports remain, even when their bodies match.
    function equivalentSubgraphs(graph) {
        const aliases = new Map();
        if (graph.truncated) return aliases;
        const nodes = Object.values(graph.nodes);
        const stable = value => {
            if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
            if (value && typeof value === 'object') return `{${Object.keys(value)
                .filter(key => !(key === 'serverActionIndex' && typeof value.$type === 'string'
                    && Object.prototype.hasOwnProperty.call(value, 'isEnable'))).sort()
                .map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
            return JSON.stringify(value);
        };
        const signatures = new Map();
        const signature = node => {
            if (!signatures.has(node.id)) signatures.set(node.id, stable(node.raw));
            return signatures.get(node.id);
        };
        const timelineEntries = new Set(graph.entries.filter(entry => entry.kind === 'timeline').map(entry => entry.id));
        const timelineCandidates = graph.entries.filter(entry => entry.kind === 'timeline').map(entry => entry.target);
        const groups = [];
        for (const owner of nodes) {
            const ports = owner.type === 'IfElseAction' ? ['success', 'failure']
                : owner.type === 'PhysicsCastAction' ? ['hit', 'miss']
                : owner.type === 'SwitchAction' ? ['case'] : [];
            const targets = owner.ports.filter(port => ports.includes(port.relation)).map(port => port.target);
            if (timelineEntries.has(owner.entryId)) timelineCandidates.push(...targets);
            else groups.push(targets);
        }
        groups.push([...new Set(timelineCandidates)]);
        for (const targets of groups) {
            const representatives = new Map();
            for (const target of targets) {
                const root = graph.nodes[target];
                if (!root || root.next || aliases.has(root.id)) continue;
                const key = signature(root);
                const first = representatives.get(key);
                if (!first) { representatives.set(key, root); continue; }
                const members = nodes.filter(node => node.path === root.path
                    || node.path.startsWith(`${root.path}.`) || node.path.startsWith(`${root.path}[`));
                const pairs = members.map(node => [node, graph.nodes[graph.nodeByPath.get(
                    first.path + node.path.slice(root.path.length))]]);
                // Resolved inputs must also agree: identical raw syntax alone must
                // not conceal different initial blackboard bindings in the viewer.
                if (!pairs.every(([node, other]) => other && node.kind === other.kind
                    && node.enabled === other.enabled
                    && stable(node.inputs.map(({ path, ...input }) => input))
                        === stable(other.inputs.map(({ path, ...input }) => input)))) continue;
                for (const [node, other] of pairs) aliases.set(node.id, other.id);
            }
        }
        return aliases;
    }

    // Endaxis-style projection: LR Dagre layout, distinct output ports and cubic
    // curves. Selection, layout and camera never change the native action data.
    function create(options) {
        const t = global.akeI18n?.scope?.('actionGraph') || ((key, params, fallback) => fallback || key);
        const text = (key, params) => t(key, params);
        const escape = options.escape;
        const HEADER = 58;
        const PORT = 28;
        // Visual groups consume the analyzer's categories; unknown actions stay visible.
        const tones = { damage: 'damage', recovery: 'support', defense: 'support', logic: 'logic', control: 'logic',
            cancel: 'timing', timing: 'timing', movement: 'movement', targeting: 'movement', buff: 'resource',
            resource: 'resource', spawn: 'reference', presentation: 'presentation' };
        const categories = ['entry', 'damage', 'support', 'logic', 'timing', 'movement', 'resource', 'reference', 'data', 'presentation', 'other'];
        const selectedCategories = new Set(categories);
        const nativeTone = item => item.enabled === false ? 'other'
            : item.kind === 'sequence' ? 'entry' : tones[item.category] || 'other';

        function pruneGraph(source) {
            if (selectedCategories.size === categories.length || source.truncated) return source;
            // Work backwards from selected nodes. Any predecessor needed to reach
            // one stays, including sequence/condition wrappers and configured next.
            const parents = new Map();
            const conditions = new Map();
            const conditionMembers = new Set();
            const gates = new Set();
            for (const node of Object.values(source.nodes)) {
                if (!['IfElseAction', 'SwitchAction'].includes(node.type)) continue;
                gates.add(node.id);
                const members = [];
                for (const port of node.ports.filter(port => port.relation === 'condition')) {
                    const root = source.nodes[port.target];
                    if (!root) continue;
                    for (const child of Object.values(source.nodes)) {
                        if (child.path === root.path || child.path.startsWith(`${root.path}.`) || child.path.startsWith(`${root.path}[`)) {
                            members.push(child.id);
                            conditionMembers.add(child.id);
                        }
                    }
                }
                conditions.set(node.id, members);
            }
            source.edges.forEach(edge => {
                if (gates.has(edge.from) && edge.relation === 'condition') return;
                if (!parents.has(edge.to)) parents.set(edge.to, []);
                parents.get(edge.to).push(edge.from);
            });
            const retained = new Set();
            // Reads and resource links decorate retained actions; they are not
            // independent roots that keep an otherwise hidden action alive.
            // Branch gates and their predicates likewise follow their consumers,
            // rather than surviving merely because the logic category is selected.
            const pending = Object.values(source.nodes).filter(node => !gates.has(node.id)
                && !conditionMembers.has(node.id) && node.kind !== 'sequence'
                && selectedCategories.has(nativeTone(node))).map(node => node.id);
            while (pending.length) {
                const id = pending.pop();
                if (retained.has(id)) continue;
                retained.add(id);
                pending.push(...(parents.get(id) || []));
                pending.push(...(conditions.get(id) || []));
            }
            // Keep raw objects untouched. Only the comparison projection omits
            // pruned actions; the inspector continues to read source.nodes.
            const omit = Symbol('pruned');
            const projectRaw = (value, path) => {
                const id = source.nodeByPath.get(path);
                if (id && !retained.has(id)) return omit;
                if (Array.isArray(value)) return value.map((child, index) => projectRaw(child, `${path}[${index}]`)).filter(child => child !== omit);
                if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
                    .map(([key, child]) => [key, projectRaw(child, `${path}.${key}`)]).filter(([, child]) => child !== omit));
                return value;
            };
            const nodes = Object.create(null);
            Object.values(source.nodes).filter(node => retained.has(node.id)).forEach(node => {
                nodes[node.id] = { ...node, raw: projectRaw(node.raw, node.path),
                    children: node.children.filter(id => retained.has(id)),
                    ports: node.ports.map(port => ({ ...port, target: retained.has(port.target) ? port.target : null })),
                    next: retained.has(node.next) ? node.next : null };
            });
            return { ...source, nodes,
                edges: source.edges.filter(edge => retained.has(edge.from) && retained.has(edge.to)),
                entries: source.entries.filter(entry => retained.has(entry.target)) };
        }
        const toneFor = item => item.enabled === false ? 'other'
            : ['entry', 'sequence'].includes(item.kind) ? 'entry'
            : item.kind === 'data' ? 'data' : item.kind === 'reference' ? 'reference'
            : tones[rawNode(item.sourceId)?.category] || 'other';
        let graph = null;
        let scene = { nodes: [], edges: [], byId: new Map(), aliases: new Map() };
        let selectedId = null;
        let selectedSource = null;
        let inspectorOpen = false;
        let events = new Map();
        let panel = null;
        let svg = null;
        let world = null;
        let observer = null;
        let gesture = null;
        let suppressClick = false;
        let frameRequest = 0;
        let pendingFocus = false;
        let positioned = false;
        let layoutFailed = false;
        const camera = { x: 0, y: 0, zoom: 1, width: 1000, height: 640 };
        const rawNode = id => graph?.nodes[id];
        const button = (action, label, id, disabled) => `<button type="button" class="ake-ui-segmented__button"
            data-action-graph="${action}"${id ? ` data-graph-id="${escape(id)}"` : ''}${disabled ? ' disabled' : ''}>${escape(label)}</button>`;
        const title = item => item.kind === 'action' ? options.actionLabel(item.type)
            : text(item.kind === 'sequence' ? 'sequence' : 'unknown');
        const time = item => item.startFrame === null || item.startFrame === undefined ? text('eventTime')
            : text('frames', { start: item.startFrame, end: item.endFrame ?? item.startFrame });
        const scalar = value => value === undefined || value === null ? '—'
            : typeof value === 'boolean' ? text(value ? 'yes' : 'no') : String(value);
        const portLabel = port => text(`relations.${port.relation}`)
            + (port.index !== undefined ? ` ${port.index + 1}` : '')
            + (port.caseValue ? ` · ${port.caseValue.key ? text('blackboard') : safeValue(port.caseValue.value, 'value')}` : '');
        const resourceLabel = kind => {
            const label = text(`resources.${kind}`);
            return label === `actionGraph.resources.${kind}` ? kind : label;
        };
        function safeValue(value, key) {
            if (!options.showHidden() && (/(?:ids?|keys?|path|index|idlist|keylist)$/i.test(key)
                || (typeof value === 'string' && /(?:^|\/)(?:chr_|eny_|buff_|skill_|abilityentity_|projectile_)/i.test(value)))) return text('hiddenIdentifier');
            return scalar(value);
        }
        function shorten(value, width, fontSize) {
            let length = 0;
            let result = '';
            for (const char of String(value)) {
                length += char.codePointAt(0) > 0x2ff ? fontSize : fontSize * .6;
                if (length > width - fontSize) return `${result}…`;
                result += char;
            }
            return result;
        }
        function buildScene() {
            const result = { nodes: [], edges: [], byId: new Map(), aliases: new Map(), mergedSources: new Map() };
            if (!graph) return result;
            const displayGraph = pruneGraph(graph);
            const displayNode = id => displayGraph.nodes[id];
            const merged = equivalentSubgraphs(displayGraph);
            const canonical = id => {
                while (merged.has(id)) id = merged.get(id);
                return id;
            };
            for (const id of merged.keys()) {
                const target = canonical(id);
                if (!result.mergedSources.has(target)) result.mergedSources.set(target, [target]);
                result.mergedSources.get(target).push(id);
            }
            const add = data => {
                const item = { id: `n${result.nodes.length}`, width: 320, height: 100, x: 0, y: 0, outputs: [], inputs: [], ...data };
                result.nodes.push(item);
                result.byId.set(item.id, item);
                return item;
            };
            const transparent = item => item?.kind === 'sequence' && item.children.length > 0
                && !item.ports.length && item.gates?.mainCharacter === false && item.gates?.guard === false;
            const resolve = id => {
                id = canonical(id);
                const visited = new Set();
                while (transparent(displayNode(id)) && !visited.has(id)) {
                    visited.add(id);
                    id = canonical(displayNode(id).children[0]);
                }
                return id;
            };
            // Only omit wrappers with explicitly disabled gates and no extra ports.
            // Empty sequences, unknown structures and all actions remain visible.
            Object.values(displayGraph.nodes).forEach(item => {
                if (merged.has(item.id) || transparent(item)) return;
                const view = add({ kind: item.kind, sourceId: item.id, title: title(item), subtitle: time(item), enabled: item.enabled });
                result.aliases.set(item.id, view.id);
            });
            Object.values(displayGraph.nodes).forEach(item => result.aliases.set(item.id, result.aliases.get(resolve(item.id))));
            const connect = (from, to, label, relation, sourceId) => {
                const target = result.byId.get(to);
                const source = result.byId.get(from);
                if (!target || !source) return;
                const isInput = ['data', 'condition', 'anyCondition'].includes(relation);
                const edge = { id: `e${result.edges.length}`, from, to, label, relation, sourceId,
                    outputIndex: source.outputs.length, inputIndex: isInput ? target.inputs.length : -1 };
                source.outputs.push(edge);
                if (isInput) target.inputs.push(edge);
                result.edges.push(edge);
            };
            displayGraph.edges.forEach(edge => {
                const source = displayNode(edge.from);
                if (merged.has(edge.from) || transparent(source)) return;
                const port = source?.ports.find(item => item.target === edge.to && item.relation === edge.relation);
                // Native ports point to the predicate they invoke. The canvas
                // presents that predicate as an input, without changing raw edges.
                const isCondition = ['condition', 'anyCondition'].includes(edge.relation);
                connect(result.aliases.get(isCondition ? edge.to : edge.from), result.aliases.get(isCondition ? edge.from : edge.to),
                    port ? portLabel(port) : text(edge.relation === 'next' ? 'configuredNext' : 'sequenceStart'), edge.relation, edge.from);
            });
            Object.values(displayGraph.nodes).forEach(item => {
                if (merged.has(item.id)) return;
                const from = result.aliases.get(item.id);
                (selectedCategories.has('reference') ? item.references : []).forEach(reference => {
                    const ref = add({ kind: 'reference', sourceId: item.id, reference, title: resourceLabel(reference.kind),
                        subtitle: text(reference.resolved ? 'resourceReference' : 'dynamicReference'), width: 260, enabled: item.enabled });
                    connect(from, ref.id, resourceLabel(reference.kind), 'resource', item.id);
                });
                // Reads stay at their own consumption sites; identical keys do not
                // imply shared runtime state or cached values across actions.
                item.inputs.filter(input => selectedCategories.has('data') && input.key).forEach(input => {
                    const read = add({ kind: 'data', sourceId: item.id, input, title: text('blackboard'), width: 230,
                        subtitle: options.showHidden() ? input.key : options.fieldLabel(input.path.split('.').pop()), enabled: item.enabled });
                    connect(read.id, from, options.fieldLabel(input.path.split('.').pop()), 'data', item.id);
                });
            });
            const groups = new Map();
            displayGraph.entries.forEach((entry, index) => {
                const key = entry.kind === 'passive' ? `${entry.kind}:${String(entry.abilityEvent)}` : entry.kind;
                if (!groups.has(key)) groups.set(key, add({ kind: 'entry', width: 390, entries: [],
                    title: text(`entries.${entry.kind}`), subtitle: entry.kind === 'passive' ? options.enumLabel(entry.abilityEvent ?? '?') : text('allEntries'), enabled: true }));
                const group = groups.get(key);
                group.entries.push(entry);
                connect(group.id, result.aliases.get(entry.target), `${index + 1}. ${time(entry)}`, 'entry', entry.target);
            });
            result.nodes.forEach(item => { item.height = HEADER + Math.max(1, item.outputs.length, item.inputs.length + 1) * PORT + 14; });
            arrange(result);
            return result;
        }
        function arrange(result) {
            layoutFailed = false;
            try {
                const layout = new global.dagre.graphlib.Graph();
                layout.setGraph({ rankdir: 'LR', ranksep: 110, nodesep: 48, marginx: 40, marginy: 40 });
                layout.setDefaultEdgeLabel(() => ({}));
                result.nodes.forEach(item => layout.setNode(item.id, { width: item.width, height: item.height }));
                result.edges.forEach(edge => layout.setEdge(edge.from, edge.to));
                global.dagre.layout(layout);
                // Mirror node positions, not node contents: output pins retain
                // their configured top-to-bottom order. Graph height includes margins.
                const graphHeight = layout.graph().height;
                result.nodes.forEach(item => {
                    const placed = layout.node(item.id);
                    item.x = placed.x - item.width / 2;
                    item.y = graphHeight - placed.y - item.height / 2;
                });
            } catch (error) {
                layoutFailed = true;
                let y = 40;
                result.nodes.forEach((item, index) => {
                    item.x = 40 + (index % 3) * 510;
                    item.y = y;
                    if (index % 3 === 2) y += Math.max(...result.nodes.slice(index - 2, index + 1).map(row => row.height)) + 48;
                });
                console.warn('[AKEActionGraph] Automatic layout unavailable', error);
            }
        }
        function curve(edge) {
            const source = scene.byId.get(edge.from);
            const target = scene.byId.get(edge.to);
            const x1 = source.x + source.width;
            const y1 = source.y + HEADER + PORT * (edge.outputIndex + .5);
            const x2 = target.x;
            const y2 = target.y + HEADER + PORT * (edge.inputIndex < 0 ? .5 : edge.inputIndex + 1.5);
            const bend = Math.max(70, Math.abs(x2 - x1) * .46);
            return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
        }
        const wireColor = edge => ['condition', 'anyCondition'].includes(edge.relation) ? 'var(--combatv3-node-logic)'
            : edge.relation === 'data' ? 'var(--combatv3-offset)' : 'var(--combatv3-border-strong)';
        function renderWire(edge) {
            const description = `${scene.byId.get(edge.from).title} → ${scene.byId.get(edge.to).title} · ${edge.label}`;
            return `<path data-graph-edge="${edge.id}" d="${curve(edge)}" fill="none" stroke="${wireColor(edge)}" stroke-width="2"
                ${['data', 'resource', 'contains', 'tick', 'invalidTarget'].includes(edge.relation) ? 'stroke-dasharray="6 4"' : ''}><title>${escape(description)}</title></path>`;
        }
        function renderNode(item) {
            const isEntry = item.kind === 'entry';
            const accent = `var(--combatv3-node-${toneFor(item)})`;
            const pin = (x, y, label) => `<circle cx="${x}" cy="${y}" r="5" fill="var(--combatv3-surface)" stroke="${accent}" stroke-width="2"><title>${escape(label)}</title></circle>`;
            const outputRows = item.outputs.map(edge => {
                const y = HEADER + PORT * (edge.outputIndex + .5);
                return `${pin(item.width, y, edge.label)}<text x="${item.width - 14}" y="${y + 4}" text-anchor="end" fill="var(--combatv3-text)" font-size="12">${escape(shorten(edge.label, item.inputs.length ? item.width / 2 - 24 : item.width - 40, 12))}</text>`;
            }).join('');
            const inputRows = item.inputs.map(edge => {
                const y = HEADER + PORT * (edge.inputIndex + 1.5);
                return pin(0, y, edge.label) + (['condition', 'anyCondition'].includes(edge.relation)
                    ? `<text x="14" y="${y + 4}" fill="var(--combatv3-text)" font-size="12">${escape(shorten(edge.label, item.width / 2 - 24, 12))}</text>` : '');
            }).join('');
            return `<g data-graph-node="${item.id}" data-action-graph="select" data-graph-id="${item.id}" transform="translate(${item.x} ${item.y})"
                role="button" tabindex="0" aria-label="${escape(item.title)}" aria-pressed="false">
                <title>${escape(`${item.title} · ${item.subtitle}`)}</title>
                <rect data-graph-border="${item.id}" width="${item.width}" height="${item.height}" rx="6" fill="var(--combatv3-surface)"
                    stroke="${accent}" stroke-width="1.5"${item.enabled === false ? ' stroke-dasharray="5 4"' : ''}/>
                <rect width="${item.width}" height="${HEADER}" rx="6" fill="${accent}" fill-opacity=".18" pointer-events="none"/>
                <path d="M 0 ${HEADER} H ${item.width}" stroke="var(--combatv3-border)"/>
                <text x="14" y="25" fill="var(--combatv3-text)" font-size="15" font-weight="600">${escape(shorten(item.title, item.width - 28, 15))}</text>
                <text x="14" y="46" fill="var(--combatv3-muted)" font-size="11">${escape(shorten(item.enabled === false ? text('disabled') : item.subtitle, item.width - 28, 11))}</text>
                ${isEntry || item.kind === 'data' ? '' : pin(0, HEADER + PORT / 2, text('input'))}${inputRows}${outputRows}
                ${!item.outputs.length ? `<text x="14" y="${HEADER + 20}" fill="var(--combatv3-muted)" font-size="12">${escape(text(item.kind === 'sequence' ? 'portEmpty' : item.kind === 'reference' ? 'resourceReference' : 'noSuccessor'))}</text>` : ''}
                </g>`;
        }
        function renderField(value, key, path, depth) {
            if (!options.showHidden() && /(?:ids?|keys?|path|index|idlist|keylist)$/i.test(key)) return escape(text('hiddenIdentifier'));
            const child = graph.nodeByPath.get(path);
            if (depth > 0 && child && child !== selectedSource) return button('focusRaw', title(rawNode(child)), child);
            if (!value || typeof value !== 'object') return escape(safeValue(value, key));
            if (depth > 48) return escape(text('diagnostic.depthLimit'));
            const fields = Object.entries(value);
            if (!fields.length) return Array.isArray(value) ? '[]' : '{}';
            return `<details${depth === 0 ? ' open' : ''}><summary>${escape(text('fieldCount', { count: fields.length }))}</summary>
                <dl class="combatv3-definition-list">${fields.map(([name, item]) => `<dt>${escape(Array.isArray(value) ? Number(name) + 1 : options.fieldLabel(name))}</dt>
                    <dd>${renderField(item, name, Array.isArray(value) ? `${path}[${name}]` : `${path}.${name}`, depth + 1)}</dd>`).join('')}</dl></details>`;
        }
        function renderReference(reference) {
            const target = reference.resolved ? options.resourceLink(reference) : null;
            return `<p>${escape(resourceLabel(reference.kind))} · ${escape(text(reference.resolved ? 'resourceReference' : 'dynamicReference'))}
                ${target ? `<a class="ake-ui-link" href="${escape(target.href)}" data-ake-entry-plugin="${escape(target.plugin)}" data-ake-entry-id="${escape(target.id)}">${escape(target.label)}</a>` : ''}
                ${options.showHidden() && reference.id ? `<code>${escape(reference.id)}</code>` : ''}</p>`;
        }
        function renderInspector() {
            const visual = scene.byId.get(selectedId);
            const item = rawNode(selectedSource);
            if (!visual) return `<p class="ake-ui-section__meta">${escape(text('selectHint'))}</p>`;
            if (visual.kind === 'entry' && !item) return `<h3>${escape(visual.title)}</h3><div class="combatv3-context-row">${visual.entries.map(entry => button('focusRaw', time(entry), entry.target)).join('')}</div>`;
            if (!item) return '';
            const sources = scene.mergedSources?.get(visual.sourceId);
            const sourceChoices = sources?.length > 1
                ? `<p>${escape(global.akeI18n.t('actionGraphMerging.notice', { count: sources.length }))}</p>
                    <div class="combatv3-context-row">${sources.map((id, index) => button('focusRaw',
                        options.showHidden() ? rawNode(id).path
                            : global.akeI18n.t('actionGraphMerging.location', { index: index + 1 }), id)).join('')}</div>` : '';
            const inputRows = item.inputs.map(input => `<tr><td>${escape(options.fieldLabel(input.path.split('.').pop()))}
                ${options.showHidden() && input.key ? `<code>${escape(input.key)}</code>` : ''}</td>
                <td>${escape(input.resolved ? safeValue(input.value, input.path.split('.').pop()) : text('unresolved'))}</td><td>${escape(text(input.key ? 'blackboard' : 'literal'))}</td></tr>`).join('');
            return `<section class="ake-ui-section"><header class="ake-ui-section__header"><h3 class="ake-ui-section__title">${escape(title(item))}</h3>
                ${button('focus', text('focusSelected'))}${events.has(item.eventIndex) ? button('timeline', text('locateTimeline'), item.id) : ''}</header>
                <p>${escape(time(item))} · ${escape(text(item.enabled ? `status.${item.status}` : 'disabled'))}</p>
                ${visual.reference ? renderReference(visual.reference) : item.references.map(renderReference).join('')}
                ${item.inputs.length ? `<p class="ake-ui-section__meta">${escape(text('initialValues'))}</p><div class="ake-ui-table-shell"><table class="ake-ui-table"><thead><tr>
                    <th>${escape(text('parameter'))}</th><th>${escape(text('value'))}</th><th>${escape(text('sourceLabel'))}</th></tr></thead><tbody>${inputRows}</tbody></table></div>` : ''}
                ${sourceChoices}
                <h4>${escape(text('parameters'))}</h4>${renderField(item.raw, '', item.path, 0)}
                ${options.showHidden() ? `<details><summary>${escape(text('source'))}</summary><p>${escape(graph.resource.file)} · ${escape(item.path)}</p><pre>${escape(JSON.stringify(item.raw, null, 2))}</pre></details>` : ''}</section>`;
        }
        function render() {
            if (!graph) return `<div class="ake-ui-state" data-state="empty">${escape(text('empty'))}</div>`;
            const count = Object.values(graph.nodes).filter(item => item.kind === 'action').length;
            return `<div class="combatv3-context-row combatv3-editor__toolbar"><strong>${escape(text('total', { count, entries: graph.entries.length }))}</strong>
                ${button('zoomOut', '−')}<span data-graph-zoom>100%</span>${button('zoomIn', '+')}${button('fit', text('fit'))}
                ${button('focus', text('focusSelected'), null, !selectedId)}${button('arrange', text('arrange'))}</div>
                <div class="ake-ui-table-shell combatv3-editor__canvas"><svg data-graph-canvas xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"
                    viewBox="0 0 1000 640" role="group" tabindex="0" aria-label="${escape(text('canvas'))}">
                    <defs><pattern id="akeActionGraphGrid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--combatv3-border)"/></pattern></defs>
                    <rect width="100%" height="100%" fill="var(--combatv3-surface-muted)"/>
                    <rect width="100%" height="100%" fill="url(#akeActionGraphGrid)"/>
                    <g data-graph-world>${scene.edges.map(renderWire).join('')}${scene.nodes.map(renderNode).join('')}</g>
                    </svg><div class="combatv3-node-legend" role="group" aria-label="${escape(global.akeI18n.t('actionGraphMerging.filter'))}">
                    ${categories.map(tone => tone === 'entry'
                        ? `<span data-node-tone="${tone}">${escape(text(`nodeColors.${tone}`))}</span>`
                        : `<button type="button" data-node-tone="${tone}" data-action-graph="category" data-graph-category="${tone}" aria-pressed="${selectedCategories.has(tone)}">${escape(text(`nodeColors.${tone}`))}</button>`).join('')}</div></div>
                <div class="combatv3-editor__notes">
                ${graph.truncated ? `<div class="ake-ui-state" data-state="error">${escape(text('incomplete'))}</div>` : ''}
                ${layoutFailed ? `<div class="ake-ui-state" data-state="error">${escape(text('layoutFailed'))}</div>` : ''}
                <details><summary>${escape(text('graphNotes'))}</summary>
                    <p>${escape(text('canvasHelp'))}</p><p>${escape(text('fullNotice'))}</p><p>${escape(text('returnPolicy'))}</p>
                    <p>${escape(text('diagnostics', { opaque: Object.values(graph.nodes).filter(item => item.status === 'opaque').length, count: graph.diagnostics.length }))}</p>
                    ${graph.diagnostics.map(item => `<p>${escape(text(`diagnostic.${item.code}`))}${options.showHidden() ? ` · ${escape(item.path)}` : ''}</p>`).join('')}</details></div>`;
        }
        function paintCamera() {
            if (!world) return;
            world.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
            const label = panel.querySelector('[data-graph-zoom]');
            if (label) label.textContent = `${Number((camera.zoom * 100).toFixed(2))}%`;
        }
        function paintSelection() {
            if (!panel) return;
            panel.querySelectorAll('[data-graph-node]').forEach(element => {
                const selected = element.dataset.graphNode === selectedId;
                element.setAttribute('aria-pressed', String(selected));
                element.querySelector('[data-graph-border]').setAttribute('stroke-width', selected ? '3.5' : '1.5');
            });
            panel.querySelectorAll('[data-graph-edge]').forEach(element => {
                const edge = scene.edges[Number(element.dataset.graphEdge.slice(1))];
                const active = edge.from === selectedId || edge.to === selectedId;
                element.setAttribute('stroke', active ? 'var(--combatv3-accent)' : wireColor(edge));
                element.setAttribute('stroke-width', active ? '3' : '2');
                element.setAttribute('opacity', !selectedId || active ? '1' : '.4');
            });
            const inspector = panel.querySelector('#combatv3GraphInspector');
            const sidebar = panel.querySelector('#combatv3InspectorPanel');
            panel.classList.toggle('is-inspecting', inspectorOpen);
            if (sidebar) sidebar.hidden = !inspectorOpen;
            if (inspector && inspectorOpen) inspector.innerHTML = renderInspector();
            panel.querySelectorAll('[data-action-graph="focus"]').forEach(button => { button.disabled = !selectedId; });
            options.onSelect?.(rawNode(selectedSource)?.eventIndex);
        }
        function fit() {
            if (!scene.nodes.length) return;
            const bounds = scene.nodes.reduce((box, item) => ({ left: Math.min(box.left, item.x - 40), top: Math.min(box.top, item.y - 40),
                right: Math.max(box.right, item.x + item.width + 40), bottom: Math.max(box.bottom, item.y + item.height + 40) }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
            const width = bounds.right - bounds.left;
            const height = bounds.bottom - bounds.top;
            camera.zoom = Math.min(1, Math.max(1, camera.width - 32) / width, Math.max(1, camera.height - 32) / height);
            camera.x = (camera.width - width * camera.zoom) / 2 - bounds.left * camera.zoom;
            camera.y = (camera.height - height * camera.zoom) / 2 - bounds.top * camera.zoom;
            positioned = true;
            paintCamera();
        }
        function focus() {
            const item = scene.byId.get(selectedId);
            if (!item) return;
            camera.zoom = Math.min(1, Math.max(1, camera.width - 80) / item.width, Math.max(1, camera.height - 80) / item.height);
            camera.x = camera.width / 2 - (item.x + item.width / 2) * camera.zoom;
            camera.y = camera.height / 2 - (item.y + item.height / 2) * camera.zoom;
            positioned = true;
            paintCamera();
        }
        function zoomAt(factor, x = camera.width / 2, y = camera.height / 2) {
            const next = Math.max(.00001, Math.min(2, camera.zoom * factor));
            const ratio = next / camera.zoom;
            camera.x = x - (x - camera.x) * ratio;
            camera.y = y - (y - camera.y) * ratio;
            camera.zoom = next;
            positioned = true;
            paintCamera();
        }
        function selectRaw(id, moveCamera) {
            if (!rawNode(id)) return false;
            selectedSource = id;
            selectedId = scene.aliases.get(id);
            inspectorOpen = true;
            pendingFocus = moveCamera;
            if (svg) {
                paintSelection();
                if (pendingFocus) { focus(); pendingFocus = false; }
            }
            return true;
        }
        function point(event) {
            const rect = svg.getBoundingClientRect();
            return { x: (event.clientX - rect.left) * camera.width / Math.max(1, rect.width),
                y: (event.clientY - rect.top) * camera.height / Math.max(1, rect.height) };
        }
        function pointerDown(event) {
            if (event.button !== 0 && event.button !== 1) return;
            const item = event.button === 0 ? scene.byId.get(event.target.closest('[data-graph-node]')?.dataset.graphNode) : null;
            gesture = { pointerId: event.pointerId, start: point(event), x: item ? item.x : camera.x, y: item ? item.y : camera.y, item, moved: false };
            suppressClick = false;
            svg.setPointerCapture(event.pointerId);
            svg.focus({ preventScroll: true });
            event.preventDefault();
        }
        function repaintGeometry() {
            frameRequest = 0;
            if (!svg) return;
            svg.querySelectorAll('[data-graph-node]').forEach(element => {
                const item = scene.byId.get(element.dataset.graphNode);
                element.setAttribute('transform', `translate(${item.x} ${item.y})`);
            });
            svg.querySelectorAll('[data-graph-edge]').forEach(element => element.setAttribute('d', curve(scene.edges[Number(element.dataset.graphEdge.slice(1))])));
        }
        function pointerMove(event) {
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            const at = point(event);
            const dx = at.x - gesture.start.x;
            const dy = at.y - gesture.start.y;
            if (Math.hypot(dx, dy) > 4) gesture.moved = true;
            if (!gesture.moved) return;
            positioned = true;
            if (gesture.item) {
                gesture.item.x = gesture.x + dx / camera.zoom;
                gesture.item.y = gesture.y + dy / camera.zoom;
                if (!frameRequest) frameRequest = requestAnimationFrame(repaintGeometry);
            } else { camera.x = gesture.x + dx; camera.y = gesture.y + dy; paintCamera(); }
        }
        function pointerUp(event) {
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            const previous = gesture;
            gesture = null;
            suppressClick = previous.moved;
            if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
            if (!previous.moved && previous.item && event.type === 'pointerup') {
                selectedId = previous.item.id;
                selectedSource = previous.item.sourceId || null;
                inspectorOpen = true;
                paintSelection();
            }
        }
        function wheel(event) {
            event.preventDefault();
            const at = point(event);
            zoomAt(Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * .002), at.x, at.y);
        }
        function keyDown(event) {
            if (event.target !== svg) return;
            const moves = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] };
            if (Object.prototype.hasOwnProperty.call(moves, event.key)) {
                event.preventDefault(); camera.x += moves[event.key][0]; camera.y += moves[event.key][1]; paintCamera();
            } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(1.2); }
            else if (event.key === '-') { event.preventDefault(); zoomAt(1 / 1.2); }
            else if (event.key === 'Home') { event.preventDefault(); fit(); }
        }
        function unmount() {
            observer?.disconnect(); observer = null;
            if (frameRequest) cancelAnimationFrame(frameRequest);
            frameRequest = 0;
            if (svg) {
                if (gesture && svg.hasPointerCapture(gesture.pointerId)) svg.releasePointerCapture(gesture.pointerId);
                [['pointerdown', pointerDown], ['pointermove', pointerMove], ['pointerup', pointerUp], ['pointercancel', pointerUp],
                    ['lostpointercapture', pointerUp], ['wheel', wheel], ['keydown', keyDown]].forEach(([name, listener]) => svg.removeEventListener(name, listener));
            }
            gesture = null; svg = null; world = null; panel = null;
        }
        function mount(root) {
            unmount();
            panel = root;
            svg = panel?.querySelector('[data-graph-canvas]');
            world = svg?.querySelector('[data-graph-world]');
            if (!svg) return;
            const resize = () => {
                if (!svg || svg.clientWidth < 100) return;
                const width = svg.clientWidth;
                const height = Math.max(1, svg.parentElement.clientHeight);
                camera.x += (width - camera.width) / 2;
                camera.y += (height - camera.height) / 2;
                camera.width = width; camera.height = height;
                svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
                if (pendingFocus) { focus(); pendingFocus = false; }
                else if (!positioned) fit();
                else paintCamera();
            };
            [['pointerdown', pointerDown], ['pointermove', pointerMove], ['pointerup', pointerUp], ['pointercancel', pointerUp],
                ['lostpointercapture', pointerUp], ['keydown', keyDown]].forEach(([name, listener]) => svg.addEventListener(name, listener));
            svg.addEventListener('wheel', wheel, { passive: false });
            observer = new ResizeObserver(resize);
            observer.observe(svg.parentElement);
            paintSelection(); resize();
        }
        return {
            setGraph(value, analysis) {
                unmount();
                const same = graph?.resource.id === value?.resource.id;
                graph = value;
                events = new Map((analysis?.events || []).map(event => [event.index, event]));
                scene = buildScene();
                if (!same) { selectedId = null; selectedSource = null; inspectorOpen = false; positioned = false; pendingFocus = false; }
                else { selectedId = scene.aliases.get(selectedSource) || null; positioned = false; }
            },
            selectPath(path) { return selectRaw(graph?.nodeByPath.get(path), true); },
            refreshSelection: paintSelection,
            closeInspector() {
                if (!inspectorOpen) return false;
                inspectorOpen = false;
                paintSelection();
                svg?.focus({ preventScroll: true });
                return true;
            },
            render, mount, unmount,
            destroy() { unmount(); graph = null; scene.nodes = []; scene.edges = []; scene.byId.clear(); scene.aliases.clear(); events.clear(); },
            click(target) {
                const control = target.closest('[data-action-graph]');
                if (!control || control.disabled) return false;
                if (suppressClick && control.closest('svg')) { suppressClick = false; return true; }
                const action = control.dataset.actionGraph;
                const id = control.dataset.graphId;
                if (action === 'category') return toggleCategory(control);
                if (action === 'select') {
                    const item = scene.byId.get(id);
                    if (item) { selectedId = id; selectedSource = item.sourceId || null; inspectorOpen = true; paintSelection(); }
                } else if (action === 'closeInspector') {
                    inspectorOpen = false; paintSelection(); svg?.focus({ preventScroll: true });
                } else if (action === 'focusRaw') selectRaw(id, true);
                else if (action === 'focus') focus();
                else if (action === 'fit') fit();
                else if (action === 'zoomIn') zoomAt(1.2);
                else if (action === 'zoomOut') zoomAt(1 / 1.2);
                else if (action === 'timeline') options.locateTimeline(rawNode(id)?.eventIndex);
                else if (action === 'arrange') { arrange(scene); repaintGeometry(); fit(); }
                return true;
            },
            change() { return false; }
        };
        function toggleCategory(target) {
                const category = target.dataset?.graphCategory;
                if (!categories.includes(category) || category === 'entry') return false;
                if (selectedCategories.has(category)) selectedCategories.delete(category);
                else selectedCategories.add(category);
                target.setAttribute('aria-pressed', String(selectedCategories.has(category)));
                scene = buildScene();
                selectedId = scene.aliases.get(selectedSource) || null;
                if (!selectedId) { selectedSource = null; inspectorOpen = false; }
                if (frameRequest) { cancelAnimationFrame(frameRequest); frameRequest = 0; }
                gesture = null;
                if (world) world.innerHTML = scene.edges.map(renderWire).join('') + scene.nodes.map(renderNode).join('');
                paintSelection();
                fit();
                return true;
        }
    }
    global.AKEActionGraphView = Object.freeze({ create });
})(window);
