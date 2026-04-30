// ============================================================
// PDD - Output Formatters
// ============================================================

const { SINK_HINTS } = require('./config');
const { findPaths, findCallers, findCallees } = require('./analysis');

function toGroupedFunc(graph, targetFunc) {
    const f = graph.functions[targetFunc];
    if (!f) return `ERROR: Function '${targetFunc}' not found.`;

    const callers = findCallers(graph, targetFunc);
    const callees = findCallees(graph, targetFunc);
    const touches = graph.touches.filter(t => t.func === targetFunc);
    const lines = [];

    lines.push(`=== FUNCTION: ${targetFunc} ===`);
    for (const d of f.definitions) {
        const scope = d.isStatic ? 'INTERNAL' : 'EXPORT';
        lines.push(`DEFINE: ${d.file}:${d.line}-${d.lineEnd} [${scope}]`);
    }
    lines.push('');

    lines.push(`CALLERS (${callers.size}):`);
    if (callers.size) {
        for (const [name, sites] of callers) {
            const locs = sites.map(s => `${s.file}:${s.line}`).join(', ');
            lines.push(`- ${name} @ ${locs}`);
        }
    } else lines.push(`- none (entry point or unused)`);
    lines.push('');

    lines.push(`CALLEES (${callees.size}):`);
    const internal = [], external = [];
    for (const [name, sites] of callees) {
        const type = graph.functions[name] ? 'internal' : 'external';
        const locs = sites.map(s => `${s.file}:${s.line}`).join(', ');
        if (type === 'internal') internal.push(`- ${name} [${type}] @ ${locs}`);
        else external.push(`- ${name} [${type}] @ ${locs}`);
    }
    if (internal.length) for (const x of internal) lines.push(x);
    if (external.length) for (const x of external) lines.push(x);
    if (!internal.length && !external.length) lines.push(`- none (leaf)`);
    lines.push('');

    if (touches.length) {
        lines.push(`TOUCHES (${touches.length}):`);
        for (const t of touches) lines.push(`- ${t.var} @ ${t.file}:${t.line}`);
        lines.push('');
    }

    const criticalPaths = [];
    for (const sink of SINK_HINTS) {
        if (sink === targetFunc) continue;
        const paths = findPaths(graph, targetFunc, sink, 15);
        if (paths.length) criticalPaths.push({ sink, routes: paths.slice(0, 3) });
    }
    if (criticalPaths.length) {
        lines.push(`PATHS_TO_SINKS:`);
        for (const cp of criticalPaths) {
            lines.push(`- TO ${cp.sink}:`);
            for (const r of cp.routes) lines.push(`    via ${r.join(' > ')}`);
        }
        lines.push('');
    }

    lines.push(`=== END ===`);
    return lines.join('\n');
}

module.exports = { toGroupedFunc };
