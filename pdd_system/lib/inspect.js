// ============================================================
// PDD - File Inspector (The Star Command)
// ============================================================

const { SINK_HINTS, SYSTEM_HEADERS } = require('./config');
const { findPaths, findCallers, buildFileRelations } = require('./analysis');

function inspectFile(graph, targetFile) {
    const fdata = graph.files[targetFile];
    if (!fdata) return `ERROR: File '${targetFile}' not found.`;

    const rels = buildFileRelations(graph);
    const incs = rels.filter(r => r.type === 'include' && r.a === targetFile);
    const allSiblings = rels.filter(r => r.type === 'sibling' && (r.a === targetFile || r.b === targetFile));
    const parents = rels.filter(r => r.type === 'include' && r.b === targetFile);

    // Only siblings via LOCAL headers matter (not via stdlib.h, string.h, etc.)
    const localSiblings = allSiblings.filter(s => !SYSTEM_HEADERS.has(s.via));
    // Deduplicate siblings (same file can appear multiple times via different headers)
    const siblingMap = new Map();
    for (const s of localSiblings) {
        const other = s.a === targetFile ? s.b : s.a;
        if (!siblingMap.has(other)) siblingMap.set(other, []);
        siblingMap.get(other).push(s.via);
    }

    const exports = [], internals = [];
    for (const [name, data] of Object.entries(graph.functions)) {
        for (const d of data.definitions) {
            if (d.file === targetFile) {
                if (d.isStatic) internals.push({ name, line: d.line, end: d.lineEnd });
                else exports.push({ name, line: d.line, end: d.lineEnd });
            }
        }
    }

    const callersOfExports = new Map();
    for (const exp of exports) {
        const c = findCallers(graph, exp.name);
        for (const [caller, sites] of c) {
            if (!callersOfExports.has(caller)) callersOfExports.set(caller, []);
            for (const s of sites) {
                callersOfExports.get(caller).push({ func: exp.name, file: s.file, line: s.line });
            }
        }
    }

    const unresolved = (fdata.meta || []).filter(m => m.type === 'unresolved').map(m => m.raw);
    const dataAccesses = (fdata.meta || []).filter(m => m.type === 'data_access').map(m => m.raw);
    const dataCoupled = new Map();
    for (const df of dataAccesses) {
        const others = [];
        for (const [f, d] of Object.entries(graph.files)) {
            if (f === targetFile) continue;
            if ((d.dependencies || []).includes(df)) others.push(f);
        }
        if (others.length) dataCoupled.set(df, others);
    }

    const dataConsumers = [];
    if (fdata.family === 'data') {
        for (const [f, d] of Object.entries(graph.files)) {
            if (f === targetFile) continue;
            if ((d.dependencies || []).includes(targetFile)) dataConsumers.push(f);
        }
    }

    // Metrics
    const metrics = [];
    metrics.push(`fan-in:${parents.length}`);
    metrics.push(`fan-out:${incs.length}`);
    if (exports.length) metrics.push(`exports:${exports.length}`);
    if (internals.length) metrics.push(`internals:${internals.length}`);
    if (dataCoupled.size) metrics.push(`data-coupled:${dataCoupled.size}`);
    if (unresolved.length) metrics.push(`broken-deps:${unresolved.length}`);

    const lines = [];
    lines.push(`=== INSPECT: ${targetFile} ===`);
    lines.push(`ROLE: ${fdata.family === 'data' ? 'DATA_FILE' : 'CODE_FILE'}`);
    lines.push(`LANGUAGE: ${fdata.family}`);
    lines.push(`METRICS: ${metrics.join(' | ')}`);
    lines.push('');

    if (unresolved.length) {
        lines.push(`UNRESOLVED (${unresolved.length}) - BROKEN DEPENDENCIES:`);
        for (const u of unresolved) lines.push(`- ${u}`);
        lines.push(`  ACTION: Fix these paths before modifying this file.`);
        lines.push('');
    }

    // INCLUDES — compact: just list them grouped
    const localIncs = incs.filter(i => graph.files[i.b] && !SYSTEM_HEADERS.has(i.b));
    const sysIncs = incs.filter(i => SYSTEM_HEADERS.has(i.b));
    const extIncs = incs.filter(i => !graph.files[i.b] && !SYSTEM_HEADERS.has(i.b) && !i.b.startsWith('.'));

    if (incs.length) {
        lines.push(`INCLUDES (${incs.length}):`);
        if (localIncs.length) lines.push(`  Internal: ${localIncs.map(c => c.b).join(', ')}`);
        if (sysIncs.length) lines.push(`  System: ${sysIncs.map(c => c.b).join(', ')}`);
        if (extIncs.length) lines.push(`  External: ${extIncs.map(c => c.b).join(', ')}`);
        lines.push('');
    }

    if (parents.length) {
        lines.push(`PARENTS (${parents.length}): ${parents.map(p => p.a).join(', ')}`);
        lines.push('');
    }

    // SIBLINGS — only via local headers, deduplicated, compact
    if (siblingMap.size) {
        lines.push(`SIBLINGS (${siblingMap.size}) - Share LOCAL headers:`);
        for (const [other, vias] of siblingMap) {
            lines.push(`- ${other} via ${vias.join(', ')}`);
        }
        lines.push(`  RULE: If I change a shared header, siblings break.`);
        lines.push('');
    }

    if (exports.length) {
        lines.push(`EXPORTS (${exports.length}) - PUBLIC API:`);
        for (const e of exports) lines.push(`- ${e.name} @ ${e.line}-${e.end}`);
        lines.push(`  RULE: DO NOT change signatures. Bodies are safe.`);
        lines.push('');
    }

    if (internals.length) {
        lines.push(`INTERNALS (${internals.length}) - STATIC/PRIVATE:`);
        for (const i of internals) lines.push(`- ${i.name} @ ${i.line}-${i.end}`);
        lines.push(`  Safe to modify.`);
        lines.push('');
    }

    if (callersOfExports.size) {
        lines.push(`BLAST_RADIUS (${callersOfExports.size} callers):`);
        for (const [caller, sites] of callersOfExports) {
            const funcs = [...new Set(sites.map(s => s.func))].join(', ');
            lines.push(`- ${caller} -> [${funcs}]`);
        }
        lines.push(`  WARNING: Changing EXPORT signatures breaks these.`);
        lines.push('');
    }

    // GLOBALS — compact: just names and which functions, no line numbers
    const fileGlobals = graph.globals.filter(g => g.file === targetFile);
    if (fileGlobals.length) {
        lines.push(`GLOBALS_DEFINED (${fileGlobals.length}): ${fileGlobals.map(g => g.name).join(', ')}`);
        lines.push('');
    }

    const fileTouches = graph.touches.filter(t => t.file === targetFile);
    if (fileTouches.length) {
        const touchedVars = [...new Set(fileTouches.map(t => t.var))];
        lines.push(`GLOBALS_TOUCHED (${touchedVars.length}):`);
        for (const v of touchedVars) {
            const funcs = [...new Set(fileTouches.filter(t => t.var === v).map(t => t.func))];
            lines.push(`- ${v}: ${funcs.join(', ')}`);
        }
        lines.push('');
    }

    if (dataCoupled.size) {
        lines.push(`DATA_COUPLING:`);
        for (const [dataFile, codeFiles] of dataCoupled) {
            lines.push(`- ${dataFile} also used by: ${codeFiles.join(', ')}`);
        }
        lines.push(`  WARNING: Check coupled files before changing data schemas.`);
        lines.push('');
    }

    if (dataConsumers.length) {
        lines.push(`DATA_CONSUMERS (${dataConsumers.length}): ${dataConsumers.join(', ')}`);
        lines.push('');
    }

    // Critical paths — compact: deduplicate sinks
    const criticalFound = [];
    for (const exp of exports) {
        for (const sink of SINK_HINTS) {
            const paths = findPaths(graph, exp.name, sink, 10);
            if (paths.length) criticalFound.push({ from: exp.name, sink, route: paths[0] });
        }
    }
    if (criticalFound.length) {
        lines.push(`CRITICAL_PATHS:`);
        for (const cf of criticalFound) {
            lines.push(`- ${cf.route.join(' > ')}`);
        }
        lines.push('');
    }

    // Action summary
    lines.push(`ACTION_REQUIRED:`);
    if (unresolved.length) lines.push(`- FIX unresolved dependencies first.`);
    if (callersOfExports.size) lines.push(`- Check BLAST_RADIUS before changing EXPORT signatures.`);
    if (siblingMap.size) lines.push(`- Check SIBLINGS if modifying shared headers.`);
    if (dataCoupled.size) lines.push(`- Verify DATA_COUPLING files before changing data schemas.`);
    if (!unresolved.length && !callersOfExports.size && !siblingMap.size && !dataCoupled.size) {
        lines.push(`- No external blockers. Safe to modify.`);
    }

    lines.push(`=== END_INSPECT ===`);
    return lines.join('\n');
}

// ============================================================
// Focused Inspect — single function within file context
// ============================================================

function inspectFileFocused(graph, targetFile, funcName) {
    const fdata = graph.files[targetFile];
    if (!fdata) return `ERROR: File '${targetFile}' not found.`;

    // Helper: suggest similar function names in this file
    function suggestFuncs(name) {
        const lower = name.toLowerCase();
        const inFile = [];
        for (const [fn, data] of Object.entries(graph.functions)) {
            if (data.definitions.some(d => d.file === targetFile)) inFile.push(fn);
        }
        const matches = inFile.filter(fn => fn.toLowerCase().includes(lower) || lower.includes(fn.toLowerCase()));
        return matches.length ? `\nDid you mean: ${matches.slice(0, 5).join(', ')}?` : `\nFunctions in file: ${inFile.slice(0, 10).join(', ')}${inFile.length > 10 ? '...' : ''}`;
    }

    // Find the function definition
    const funcData = graph.functions[funcName];
    if (!funcData) return `ERROR: Function '${funcName}' not found in graph.${suggestFuncs(funcName)}`;
    const def = funcData.definitions.find(d => d.file === targetFile);
    if (!def) return `ERROR: Function '${funcName}' not found in '${targetFile}'.${suggestFuncs(funcName)}`;

    const scope = def.isStatic ? 'INTERNAL' : 'EXPORT';

    // Callers of this function (grouped by module prefix)
    const callerMap = new Map();
    for (const c of graph.calls) {
        if (c.to === funcName) {
            const prefix = c.file.split('/')[0];
            if (!callerMap.has(prefix)) callerMap.set(prefix, []);
            const names = callerMap.get(prefix);
            if (!names.includes(c.from)) names.push(c.from);
        }
    }

    // Callees (what this function calls)
    const calleeSet = new Set();
    for (const c of graph.calls) {
        if (c.from === funcName) calleeSet.add(c.to);
    }
    const internalCallees = [], externalCallees = [];
    for (const name of calleeSet) {
        if (graph.functions[name]) internalCallees.push(name);
        else externalCallees.push(name);
    }

    // Globals this function touches
    const funcTouches = graph.touches.filter(t => t.func === funcName);
    const touchedVars = [...new Set(funcTouches.map(t => t.var))];

    // Critical paths FROM this function
    const critPaths = [];
    for (const sink of SINK_HINTS) {
        if (sink === funcName) continue;
        const paths = findPaths(graph, funcName, sink, 10);
        if (paths.length) critPaths.push(paths[0]);
    }

    // Siblings via local headers only
    const rels = buildFileRelations(graph);
    const localSiblings = rels.filter(r =>
        r.type === 'sibling' && (r.a === targetFile || r.b === targetFile) && !SYSTEM_HEADERS.has(r.via)
    );
    const siblingMap = new Map();
    for (const s of localSiblings) {
        const other = s.a === targetFile ? s.b : s.a;
        if (!siblingMap.has(other)) siblingMap.set(other, []);
        siblingMap.get(other).push(s.via);
    }

    // --- Build output ---
    const lines = [];
    lines.push(`=== INSPECT: ${targetFile} (focus: ${funcName}) ===`);
    lines.push(`FOCUS: ${funcName} @ ${def.line}-${def.lineEnd} [${scope}]`);
    if (scope === 'EXPORT') {
        lines.push(`RULE: Signature frozen. Body is safe to modify.`);
    } else {
        lines.push(`RULE: Internal/static. Safe to modify freely.`);
    }
    lines.push('');

    // Callers grouped by module
    const totalCallers = Array.from(callerMap.values()).reduce((s, a) => s + a.length, 0);
    if (totalCallers) {
        lines.push(`CALLERS (${totalCallers}):`);
        for (const [prefix, names] of callerMap) {
            if (names.length <= 3) {
                lines.push(`- ${prefix}/: ${names.join(', ')}`);
            } else {
                lines.push(`- ${prefix}/: ${names.slice(0, 3).join(', ')}... (+${names.length - 3} more)`);
            }
        }
        lines.push('');
    }

    // Callees
    if (internalCallees.length || externalCallees.length) {
        lines.push(`CALLS:`);
        if (internalCallees.length) lines.push(`  Internal: ${internalCallees.join(', ')}`);
        if (externalCallees.length) lines.push(`  External: ${externalCallees.join(', ')}`);
        lines.push('');
    }

    // Globals touched by this function
    if (touchedVars.length) {
        lines.push(`GLOBALS_TOUCHED (${touchedVars.length}): ${touchedVars.join(', ')}`);
        lines.push('');
    }

    // Critical paths
    if (critPaths.length) {
        lines.push(`CRITICAL_PATHS:`);
        for (const p of critPaths) lines.push(`- ${p.join(' > ')}`);
        lines.push('');
    }

    // Siblings (compact)
    if (siblingMap.size) {
        lines.push(`SIBLINGS (${siblingMap.size}):`);
        for (const [other, vias] of siblingMap) {
            lines.push(`- ${other} via ${vias.join(', ')}`);
        }
        lines.push('');
    }

    // Action
    lines.push(`ACTION:`);
    if (scope === 'EXPORT' && totalCallers) {
        lines.push(`- ${totalCallers} callers depend on signature. Do NOT change params/return.`);
    }
    if (critPaths.length) {
        const sinks = [...new Set(critPaths.map(p => p[p.length - 1]))];
        lines.push(`- Memory/sync risk: ${sinks.join(', ')}`);
    }
    if (!totalCallers && !critPaths.length) {
        lines.push(`- No external constraints. Safe to modify.`);
    }

    lines.push(`=== END_INSPECT ===`);
    return lines.join('\n');
}

module.exports = { inspectFile, inspectFileFocused };
