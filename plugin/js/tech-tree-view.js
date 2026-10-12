(function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const W = 112, H = 108, DX = 172, DY = 170, LEFT = 170, TOP = 76;
    const t = (key, params) => window.akeI18n.t(`modules.tech_tree.${key}`, params);
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const pos = (row, axis) => finite(row.uiPos?.[axis]) ? row.uiPos[axis] : null;
    const ids = value => Array.isArray(value) ? [...new Set(value.map(String))] : [];
    const svgElement = (tag, attrs = {}, text) => {
        const element = document.createElementNS(NS, tag);
        for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
        if (text !== undefined) element.textContent = text;
        return element;
    };

    // Coordinates suggest ordering only. Category/layer bands grow from actual records;
    // duplicate cells receive extra columns instead of overlapping or excluding records.
    function layout(rows, c, planId) {
        let hasIssues = false;
        const report = c.issue;
        c = { ...c, issue(...args) { hasIssues = true; report(...args); } };
        const T = c.tables;
        const all = new Map(rows.filter(row => row.kind === 'node').map(row => [row.key, row]));
        const nodes = new Map(rows.filter(row => row.kind === 'node' && String(row.raw.groupId || '') === planId)
            .map(row => [row.key, { ...row }]));
        const queue = [...nodes.values()];
        const edges = [];
        for (let i = 0; i < queue.length; i++) {
            const target = queue[i];
            if (target.raw.preNode != null && !Array.isArray(target.raw.preNode)) c.issue('invalid-prerequisites', 'FacSTTNodeTable', target.key);
            for (const key of ids(target.raw.preNode)) {
                if (!nodes.has(key)) {
                    const row = all.get(key);
                    const source = row ? { ...row, external: true } : {
                        key, id: null, name: c.hidden() ? key : t('missingNode'), raw: {}, missing: true, external: true
                    };
                    nodes.set(key, source);
                    if (row) queue.push(source);
                    else c.issue('missing-reference', 'FacSTTNodeTable', key, target.key);
                }
                edges.push({ from: key, to: target.key });
            }
        }
        const categories = new Map(), layers = new Map();
        const band = (map, key, raw, label, missing = false) => {
            if (!map.has(key)) map.set(key, { key, raw: raw || {}, name: label, missing, nodes: [] });
            return map.get(key);
        };
        const group = T.FacSTTGroupTable[planId] || {};
        // Explicit lists are not inclusion filters. Report stale references separately.
        for (const [field, source] of [['techIds', 'FacSTTNodeTable'], ['categoryIds', 'FacSTTCategoryTable'], ['layerIds', 'FacSTTLayerTable']]) {
            for (const key of ids(group[field])) {
                if (!T[source][key]) c.issue('missing-reference', source, key, planId);
                else if (String(T[source][key].groupId || '') !== planId) c.issue('conflicting-group', source, key, planId);
            }
        }
        for (const [key, row] of c.entries(T.FacSTTCategoryTable)) {
            if (String(row.groupId || '') === planId) band(categories, key, row, c.name(row.name, key));
        }
        for (const [key, row] of c.entries(T.FacSTTLayerTable)) {
            if (String(row.groupId || '') === planId) {
                band(layers, key, row, c.name(row.name, key));
                if (row.preLayer && !T.FacSTTLayerTable[row.preLayer]) c.issue('missing-reference', 'FacSTTLayerTable', row.preLayer, key);
            }
        }
        for (const node of nodes.values()) {
            const r = node.raw;
            // Related-plan ancestors occupy a separate band and retain their true links.
            const categoryKey = node.external ? '\0external' : String(r.category || '');
            const layerKey = node.external ? '\0external' : String(r.layer || '');
            const category = T.FacSTTCategoryTable[categoryKey];
            const layer = T.FacSTTLayerTable[layerKey];
            if (!node.external) {
                if (!category) c.issue('missing-reference', 'FacSTTCategoryTable', categoryKey, node.key);
                if (!layer) c.issue('missing-reference', 'FacSTTLayerTable', layerKey, node.key);
                if (category && String(category.groupId || '') !== planId) c.issue('conflicting-group', 'FacSTTCategoryTable', categoryKey, node.key);
                if (layer && String(layer.groupId || '') !== planId) c.issue('conflicting-group', 'FacSTTLayerTable', layerKey, node.key);
                if (pos(r, 0) === null || pos(r, 1) === null) c.issue('missing-position', 'FacSTTNodeTable', node.key);
            }
            node.categoryKey = categoryKey; node.layerKey = layerKey;
            band(categories, categoryKey, category, node.external ? t('relatedPlans') : c.name(category?.name, categoryKey), !category).nodes.push(node);
            band(layers, layerKey, layer, node.external ? t('relatedPlans') : c.name(layer?.name, layerKey), !layer).nodes.push(node);
        }
        const ordered = (map, start) => [...map.values()].sort((a, b) =>
            Number(a.missing) - Number(b.missing) || (a.raw.order ?? Infinity) - (b.raw.order ?? Infinity) ||
            (a.raw[start] ?? Infinity) - (b.raw[start] ?? Infinity) || a.key.localeCompare(b.key));
        const categoryBands = ordered(categories, 'startPosX'), layerBands = ordered(layers, 'startPosY');
        let y = TOP;
        for (const layer of layerBands) {
            const ys = [...new Set(layer.nodes.map(node => pos(node.raw, 1)).filter(value => value !== null))].sort((a, b) => a - b);
            let fallback = ys.length;
            layer.y = y;
            for (const node of layer.nodes) {
                const value = pos(node.raw, 1);
                node.rowIndex = value === null ? fallback++ : ys.indexOf(value);
                node.y = y + node.rowIndex * DY + 30;
            }
            layer.height = Math.max(1, fallback) * DY + 32;
            y += layer.height;
        }
        let x = LEFT;
        for (const category of categoryBands) {
            const xs = [...new Set(category.nodes.map(node => pos(node.raw, 0)).filter(value => value !== null))].sort((a, b) => a - b);
            const occupied = new Set();
            let columns = Math.max(1, xs.length);
            category.x = x;
            for (const node of category.nodes.sort((a, b) => (a.raw.sortId ?? Infinity) - (b.raw.sortId ?? Infinity) || a.key.localeCompare(b.key))) {
                const value = pos(node.raw, 0);
                let column = value === null ? 0 : xs.indexOf(value);
                const cell = col => JSON.stringify([node.layerKey, node.rowIndex, col]);
                if (occupied.has(cell(column))) c.issue('overlapping-position', 'FacSTTNodeTable', node.key);
                while (occupied.has(cell(column))) column++;
                occupied.add(cell(column)); columns = Math.max(columns, column + 1);
                node.x = x + column * DX + 22;
            }
            category.width = columns * DX + 22;
            x += category.width;
        }
        // Kahn traversal diagnoses cycles without recursive traversal or hiding cyclic nodes.
        const incoming = new Map([...nodes.keys()].map(key => [key, 0])), next = new Map();
        for (const edge of edges) {
            incoming.set(edge.to, incoming.get(edge.to) + 1);
            if (!next.has(edge.from)) next.set(edge.from, []);
            next.get(edge.from).push(edge.to);
        }
        const ready = [...incoming.keys()].filter(key => incoming.get(key) === 0);
        for (let i = 0; i < ready.length; i++) for (const key of next.get(ready[i]) || []) {
            incoming.set(key, incoming.get(key) - 1);
            if (incoming.get(key) === 0) ready.push(key);
        }
        if (ready.length !== nodes.size) c.issue('cycle-or-cycle-dependent', 'FacSTTNodeTable', planId,
            [...incoming].filter(([, count]) => count > 0).map(([key]) => key));
        return { nodes, edges, categories: categoryBands, layers: layerBands, hasIssues, width: Math.max(x + 20, 500), height: Math.max(y + 20, 360) };
    }

    function create({ root, select, reload }) {
        const abort = new AbortController();
        const on = (element, event, fn, options = {}) => element.addEventListener(event, fn, { ...options, signal: abort.signal });
        const viewport = root.querySelector('[data-tech-viewport]'), svg = root.querySelector('[data-tech-svg]');
        const drawer = root.querySelector('[data-tech-drawer]'), planSelect = root.querySelector('[data-tech-plan]');
        const search = root.querySelector('[data-tech-search]'), statusLine = root.querySelector('[data-tech-status]');
        let rows = [], ctx, activeId = null, planId = null, graph, state = 'loading', disposed = false;
        let camera = { x: 0, y: 0, zoom: 1 }, pendingFit = true, frame = 0, iconGeneration = 0;
        let pendingNode = null, pendingLayer = null, restoringFocus = false;
        let iconIndex = null, iconLoading = false, iconFailed = false, iconMissing = false, lastFocus = null;
        const cameras = new Map(), nodeElements = new Map(), edgeElements = [];
        let matches = [], matchIndex = -1, searchQuery = '', composing = false;
        const pointers = new Map();
        let gesture = null, dragged = false, suppressClickUntil = 0;

        function drawCamera() {
            const width = viewport.clientWidth, height = viewport.clientHeight;
            if (!width || !height || !graph) return;
            svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${width / camera.zoom} ${height / camera.zoom}`);
            root.querySelector('[data-tech-zoom]').textContent = `${Math.round(camera.zoom * 100)}%`;
            if (planId !== null) cameras.set(planId, { ...camera });
        }
        function fit() {
            if (!graph || !viewport.clientWidth || !viewport.clientHeight) { pendingFit = true; return; }
            pendingNode = null; pendingLayer = null;
            camera.zoom = Math.min(1, viewport.clientWidth / graph.width, viewport.clientHeight / graph.height) * .95;
            camera.x = -(viewport.clientWidth / camera.zoom - graph.width) / 2;
            camera.y = -(viewport.clientHeight / camera.zoom - graph.height) / 2;
            pendingFit = false; drawCamera();
        }
        function scheduleCamera() {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                if (disposed || !viewport.clientWidth || !viewport.clientHeight) return;
                if (pendingNode) { const key = pendingNode; pendingNode = null; locate(key); }
                else if (pendingLayer) {
                    const layer = graph?.layers.find(value => value.key === pendingLayer);
                    pendingLayer = null;
                    if (layer) { camera.y = layer.y - 20; pendingFit = false; }
                    drawCamera();
                } else if (pendingFit) fit();
                else drawCamera();
            });
        }
        function zoom(factor, clientX, clientY) {
            if (!graph) return;
            const rect = viewport.getBoundingClientRect();
            const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
            const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
            const minimum = Math.min(.15, viewport.clientWidth / graph.width, viewport.clientHeight / graph.height) * .8;
            const value = Math.min(3, Math.max(minimum, camera.zoom * factor));
            camera.x += px / camera.zoom - px / value;
            camera.y += py / camera.zoom - py / value;
            camera.zoom = value; pendingFit = false; drawCamera();
        }
        function locate(key, focus = false) {
            const node = graph?.nodes.get(key);
            if (!node) return;
            camera.zoom = Math.max(.8, camera.zoom);
            camera.x = node.x + W / 2 - viewport.clientWidth / camera.zoom / 2;
            camera.y = node.y + H / 2 - viewport.clientHeight / camera.zoom / 2;
            pendingFit = false; drawCamera();
            if (focus) nodeElements.get(key)?.focus({ preventScroll: true });
        }
        function announce() {
            if (!ctx || state !== 'ready') return;
            statusLine.replaceChildren(document.createTextNode(searchQuery ? t('matches', { count: matches.length }) :
                t('nodeCount', { count: [...(graph?.nodes.values() || [])].filter(node => !node.external).length })));
            if (graph?.hasIssues) statusLine.append(' ', t('dataIssues'));
            if (iconMissing) statusLine.append(' ', t('missingIcons'));
            if (iconFailed) {
                const button = document.createElement('button'); button.type = 'button'; button.className = 'ake-ui-button';
                button.dataset.techAction = 'icons'; button.textContent = t('retryIcons'); statusLine.append(' ', button);
            }
        }
        function highlight() {
            const selected = rows.find(row => row.id === activeId);
            const key = selected?.kind === 'node' ? selected.key : null;
            const adjacent = new Set();
            for (const edge of graph?.edges || []) if (edge.from === key || edge.to === key) { adjacent.add(edge.from); adjacent.add(edge.to); }
            const found = new Set(matches.map(row => row.key));
            for (const [id, element] of nodeElements) {
                element.classList.toggle('is-selected', id === key);
                element.classList.toggle('is-related', adjacent.has(id));
                element.classList.toggle('is-match', Boolean(searchQuery) && found.has(id));
                element.setAttribute('aria-pressed', String(id === key));
            }
            for (const { edge, element } of edgeElements) element.classList.toggle('is-selected', edge.from === key || edge.to === key);
        }
        function updateSearch() {
            const query = search.value.trim().toLocaleLowerCase();
            if (searchQuery !== query) matchIndex = -1;
            searchQuery = query;
            matches = query ? rows.filter(row => row.kind === 'node' &&
                `${row.name} ${row.group} ${row.search || ''} ${ctx?.hidden() ? row.key : ''}`.toLocaleLowerCase().includes(query)) : [];
            highlight(); announce();
        }
        function label(parent, text, x, y, className, max = 13) {
            const chars = Array.from(text);
            const lines = chars.length > max ? [chars.slice(0, max).join(''), chars.slice(max, max * 2).join('') + (chars.length > max * 2 ? '…' : '')] : [text];
            const element = svgElement('text', { x, y, class: className, 'text-anchor': 'middle' });
            lines.forEach((line, index) => element.append(svgElement('tspan', { x, dy: index ? 16 : 0 }, line)));
            parent.append(element);
        }
        function activateBand(element, id) {
            element.setAttribute('role', 'button'); element.setAttribute('tabindex', '0');
            element.dataset.techEntry = id;
        }
        function renderGraph() {
            if (!ctx) return;
            graph = layout(rows, ctx, planId);
            svg.replaceChildren(); nodeElements.clear(); edgeElements.length = 0;
            const defs = svgElement('defs'), marker = svgElement('marker', { id: 'ake-tech-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
            marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' })); defs.append(marker); svg.append(defs);
            for (const [index, layer] of graph.layers.entries()) {
                svg.append(svgElement('rect', { x: 0, y: layer.y, width: graph.width, height: layer.height, class: `ake-ui-tech-tree__band${index % 2 ? ' is-alternate' : ''}` }));
                const heading = svgElement('g', { class: 'ake-ui-tech-tree__heading' });
                heading.append(svgElement('title', {}, layer.name));
                label(heading, layer.name, LEFT / 2, layer.y + 54, 'ake-ui-tech-tree__label', 10);
                if (rows.some(row => row.id === `layer:${layer.key}`)) activateBand(heading, `layer:${layer.key}`);
                svg.append(heading);
            }
            for (const category of graph.categories) {
                svg.append(svgElement('line', { x1: category.x, y1: 0, x2: category.x, y2: graph.height, class: 'ake-ui-tech-tree__divider' }));
                const heading = svgElement('g'); heading.append(svgElement('title', {}, category.name));
                label(heading, category.name, category.x + category.width / 2, 30, 'ake-ui-tech-tree__label', 18); svg.append(heading);
            }
            for (const [index, edge] of graph.edges.entries()) {
                const a = graph.nodes.get(edge.from), b = graph.nodes.get(edge.to);
                const ax = a.x + W / 2, ay = a.y + H, bx = b.x + W / 2, by = b.y;
                const clear = ax === bx && ay < by && ![...graph.nodes.values()].some(node => node !== a && node !== b && node.x === a.x && node.y > a.y && node.y < b.y);
                // Horizontal channels are between rows; the side channel stays outside cards.
                const offset = (index % 5) * 3;
                const lane = a.x + W + 16 + offset;
                const d = clear ? `M ${ax} ${ay} V ${by}` : `M ${ax} ${ay} V ${ay + 16 + offset} H ${lane} V ${by - 14 - offset} H ${bx} V ${by}`;
                const element = svgElement('path', { d, class: 'ake-ui-tech-tree__edge', 'marker-end': 'url(#ake-tech-arrow)' });
                element.append(svgElement('title', {}, `${a.name} → ${b.name}`)); svg.append(element); edgeElements.push({ edge, element });
            }
            for (const node of graph.nodes.values()) {
                const element = svgElement('g', { transform: `translate(${node.x} ${node.y})`, class: `ake-ui-tech-tree__node${node.external ? ' is-external' : ''}`, 'aria-label': node.name });
                element.append(svgElement('title', {}, node.name), svgElement('rect', { width: W, height: H, rx: 5 }),
                    svgElement('text', { x: W / 2, y: 49, class: 'ake-ui-tech-tree__placeholder', 'text-anchor': 'middle' }, '◇'));
                label(element, node.name, W / 2, 80, 'ake-ui-tech-tree__node-label', 10);
                if (node.id) { activateBand(element, node.id); element.setAttribute('aria-pressed', 'false'); }
                nodeElements.set(node.key, element); svg.append(element);
            }
            updateSearch(); scheduleCamera(); void loadIcons();
        }
        async function loadIcons(refresh = false) {
            if (!ctx || !graph || iconLoading) return;
            const token = ++iconGeneration;
            iconLoading = true; iconFailed = false; iconMissing = false;
            try {
                if (refresh) iconIndex = null;
                if (!iconIndex) {
                    const index = await window.akeAssetIndex.load();
                    if (disposed || token !== iconGeneration) return;
                    const exact = new Map(), basename = new Map();
                    for (const path of Object.keys(index.datasets.images?.files || {})) {
                        const key = path.replace(/\.[^./]+$/, '').toLocaleLowerCase();
                        for (const [map, name] of [[exact, key], [basename, key.split('/').pop()]]) {
                            if (!map.has(name)) map.set(name, []);
                            map.get(name).push(path);
                        }
                    }
                    iconIndex = { exact, basename };
                }
                for (const node of graph.nodes.values()) {
                    const target = nodeElements.get(node.key);
                    target.querySelector('image')?.remove();
                    const needle = String(node.raw.icon || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.[^./]+$/, '').toLocaleLowerCase();
                    const paths = iconIndex.exact.get(needle) || iconIndex.basename.get(needle.split('/').pop()) || [];
                    if (!needle || paths.length !== 1) {
                        if (!node.missing) {
                            iconMissing = true;
                            ctx.issue('unresolved-icon', 'FacSTTNodeTable', node.key, { icon: node.raw.icon, matches: paths.length });
                        }
                        continue;
                    }
                    const path = '/public/images/' + paths[0].split('/').map(encodeURIComponent).join('/');
                    const image = svgElement('image', { x: 32, y: 10, width: 48, height: 48, href: window.akeDataSource.resolveUrl(path) });
                    on(image, 'error', () => {
                        if (disposed || nodeElements.get(node.key) !== target) return;
                        image.remove(); iconFailed = true; announce();
                        ctx.issue('icon-load-failed', 'FacSTTNodeTable', node.key, paths[0]);
                    }, { once: true });
                    target.append(image);
                }
            } catch (error) {
                if (disposed) return;
                iconFailed = true; ctx.issue('asset-index-failed', 'asset-index', 'images', error.message);
            } finally {
                iconLoading = false;
                if (!disposed) announce();
            }
        }
        function switchPlan(id) {
            pendingNode = null; pendingLayer = null;
            if (planId !== null && graph) cameras.set(planId, { ...camera });
            planId = id; planSelect.value = id; window.AKEUI.refreshSelect?.(planSelect);
            root.querySelector('[data-tech-action="plan"]').disabled = !rows.some(row => row.id === `plan:${id}`);
            camera = { ...(cameras.get(id) || { x: 0, y: 0, zoom: 1 }) }; pendingFit = !cameras.has(id);
            renderGraph();
        }
        function closeDrawer() {
            select(null);
            restoringFocus = true;
            if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
            else viewport.focus({ preventScroll: true });
            restoringFocus = false;
        }
        on(planSelect, 'change', () => { if (state === 'ready') { switchPlan(planSelect.value); select(null); } });
        on(search, 'compositionstart', () => { composing = true; });
        on(search, 'compositionend', () => { composing = false; updateSearch(); });
        on(search, 'input', () => { if (!composing) updateSearch(); });
        on(root.querySelector('[data-tech-search-form]'), 'submit', event => {
            event.preventDefault(); if (composing || state !== 'ready') return;
            updateSearch(); if (!matches.length) return;
            matchIndex = (matchIndex + 1) % matches.length;
            const match = matches[matchIndex]; select(match.id); locate(match.key, true);
        });
        on(root, 'click', event => {
            const action = event.target.closest('[data-tech-action]')?.dataset.techAction;
            if (action === 'retry') { reload(); return; }
            if (state !== 'ready') return;
            if (action === 'close') closeDrawer();
            if (action === 'fit') fit();
            if (action === 'in') zoom(1.25);
            if (action === 'out') zoom(.8);
            if (action === 'icons') void loadIcons(true);
            if (action === 'plan') select(`plan:${planId}`);
            const target = event.target.closest('[data-tech-entry]');
            if (target && performance.now() > suppressClickUntil) { lastFocus = target; select(target.dataset.techEntry); }
        });
        on(root, 'keydown', event => {
            if (event.key === 'Escape' && !drawer.hidden) { event.preventDefault(); closeDrawer(); return; }
            const node = event.target.closest('[data-tech-entry]');
            if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); lastFocus = node; select(node.dataset.techEntry); return; }
            if (!viewport.contains(event.target) || state !== 'ready') return;
            const moves = { ArrowLeft: [-70, 0], ArrowRight: [70, 0], ArrowUp: [0, -70], ArrowDown: [0, 70] };
            if (moves[event.key]) { event.preventDefault(); camera.x += moves[event.key][0] / camera.zoom; camera.y += moves[event.key][1] / camera.zoom; drawCamera(); }
            if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25); }
            if (event.key === '-') { event.preventDefault(); zoom(.8); }
            if (event.key === 'Home') { event.preventDefault(); fit(); }
        });
        on(svg, 'focusin', event => {
            const target = event.target.closest('[data-tech-entry]');
            // Mouse focus must not move the hit target before its click is delivered.
            if (restoringFocus || !target?.matches(':focus-visible')) return;
            const entry = rows.find(row => row.id === target.dataset.techEntry);
            if (entry?.kind === 'node') locate(entry.key);
            if (entry?.kind === 'layer') { pendingLayer = entry.key; pendingNode = null; scheduleCamera(); }
        });
        on(viewport, 'wheel', event => { if (state !== 'ready') return; event.preventDefault(); zoom(Math.exp(-event.deltaY * .0015), event.clientX, event.clientY); }, { passive: false });
        function pointerGeometry() {
            const points = [...pointers.values()].slice(0, 2);
            const a = points[0], b = points[1] || a;
            return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
        }
        on(viewport, 'pointerdown', event => {
            if (event.button !== 0 || state !== 'ready') return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 1) dragged = false;
            gesture = pointerGeometry();
        });
        on(window, 'pointermove', event => {
            if (!pointers.has(event.pointerId)) return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const next = pointerGeometry();
            if (!dragged && Math.hypot(next.x - gesture.x, next.y - gesture.y) < 5 && pointers.size < 2) return;
            dragged = true; viewport.classList.add('is-dragging');
            camera.x -= (next.x - gesture.x) / camera.zoom; camera.y -= (next.y - gesture.y) / camera.zoom;
            if (pointers.size > 1 && gesture.distance > 0) zoom(next.distance / gesture.distance, next.x, next.y);
            gesture = next; pendingFit = false; drawCamera();
        });
        const release = event => {
            if (!pointers.has(event.pointerId)) return;
            pointers.delete(event.pointerId);
            if (dragged) suppressClickUntil = performance.now() + 300;
            gesture = pointers.size ? pointerGeometry() : null;
            if (!pointers.size) viewport.classList.remove('is-dragging');
        };
        on(window, 'pointerup', release); on(window, 'pointercancel', release);
        const resetPointers = () => { pointers.clear(); gesture = null; viewport.classList.remove('is-dragging'); };
        on(window, 'blur', resetPointers);
        on(window, 'ake:module-deactivate', event => { if (event.detail?.moduleId === 'tech_tree') resetPointers(); });
        on(window, 'ake:module-activate', event => { if (event.detail?.moduleId === 'tech_tree') scheduleCamera(); });
        const resize = new ResizeObserver(scheduleCamera); resize.observe(viewport);
        return {
            update(data) {
                const rebuilt = rows !== data.rows;
                const previous = activeId;
                rows = data.rows; ctx = data.ctx; activeId = data.activeId; state = 'ready';
                viewport.removeAttribute('aria-busy'); svg.removeAttribute('hidden');
                const selected = rows.find(row => row.id === activeId);
                if (rebuilt) {
                    const plans = new Map(rows.filter(row => row.kind === 'plan').map(row => [row.key, row.name]));
                    for (const row of rows) if (row.kind !== 'plan' && !plans.has(String(row.raw.groupId || ''))) plans.set(String(row.raw.groupId || ''), row.group || t('unassigned'));
                    planSelect.replaceChildren(...[...plans].map(([key, name]) => new Option(name, key)));
                    if (!plans.has(planId)) planId = plans.keys().next().value ?? '';
                }
                const owner = selected ? String(selected.kind === 'plan' ? selected.key : selected.raw.groupId || '') : planId;
                drawer.hidden = !selected;
                root.classList.toggle('has-detail', Boolean(selected));
                if (rebuilt || !graph || owner !== planId) switchPlan(owner);
                else highlight();
                if (selected?.kind === 'node' && previous !== activeId) {
                    pendingNode = selected.key; pendingLayer = null; scheduleCamera();
                }
                if (selected?.kind === 'layer' && previous !== activeId) {
                    pendingLayer = selected.key; pendingNode = null; scheduleCamera();
                }
                if (selected && document.activeElement?.closest('[data-tech-entry]')) root.querySelector('[data-tech-action="close"]').focus({ preventScroll: true });
                announce();
            },
            status(value) {
                state = value; drawer.hidden = true; root.classList.remove('has-detail');
                viewport.setAttribute('aria-busy', String(value === 'loading')); svg.setAttribute('hidden', '');
                statusLine.replaceChildren(document.createTextNode(ctx?.t(value === 'error' ? 'loadFailed' : 'loading') || window.akeI18n.t(`modules.catalog.${value === 'error' ? 'loadFailed' : 'loading'}`)));
                if (value === 'error') {
                    const button = document.createElement('button'); button.type = 'button'; button.className = 'ake-ui-button';
                    button.dataset.techAction = 'retry'; button.textContent = window.akeI18n.t('modules.catalog.retry'); statusLine.append(' ', button);
                }
            },
            destroy() { disposed = true; iconGeneration++; abort.abort(); resize.disconnect(); cancelAnimationFrame(frame); }
        };
    }
    window.AKETechTreeView = { create };
})();
