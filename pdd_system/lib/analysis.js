// ============================================================
// PDD - Graph Analysis Functions
// ============================================================

function findPaths(graph, from, to, maxDepth = 25) {
    const paths = [];
    const visited = new Set();
    function dfs(current, path) {
        if (path.length > maxDepth) return;
        if (current === to) { paths.push([...path]); return; }
        const edges = graph.calls.filter(c => c.from === current);
        const seen = new Set();
        for (const e of edges) {
            if (seen.has(e.to) || visited.has(e.to)) continue;
            seen.add(e.to); visited.add(e.to);
            path.push(e.to); dfs(e.to, path); path.pop();
            visited.delete(e.to);
        }
    }
    if (!graph.functions[from]) return [];
    visited.add(from); dfs(from, [from]);
    return paths;
}

function findCallers(graph, funcName) {
    const callers = new Map();
    for (const c of graph.calls) {
        if (c.to === funcName) {
            if (!callers.has(c.from)) callers.set(c.from, []);
            callers.get(c.from).push({ file: c.file, line: c.line });
        }
    }
    return callers;
}

function findCallees(graph, funcName) {
    const callees = new Map();
    for (const c of graph.calls) {
        if (c.from === funcName) {
            if (!callees.has(c.to)) callees.set(c.to, []);
            callees.get(c.to).push({ file: c.file, line: c.line });
        }
    }
    return callees;
}

function buildFileRelations(graph) {
    const rev = new Map();
    for (const inc of graph.includes) {
        if (!rev.has(inc.to)) rev.set(inc.to, new Set());
        rev.get(inc.to).add(inc.from);
    }
    const relations = [];
    for (const [incFile, includers] of rev) {
        const arr = Array.from(includers);
        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                relations.push({ a: arr[i], b: arr[j], via: incFile, type: 'sibling' });
            }
        }
    }
    for (const inc of graph.includes) {
        relations.push({ a: inc.from, b: inc.to, via: null, type: 'include' });
    }
    return relations;
}

function findVarTrace(graph, varName) {
    const touches = graph.touches.filter(t => t.var === varName);
    const funcsInvolved = new Set(touches.map(t => t.func));
    const routes = [];
    const funcArr = Array.from(funcsInvolved);
    for (let i = 0; i < funcArr.length; i++) {
        for (let j = 0; j < funcArr.length; j++) {
            if (i === j) continue;
            const paths = findPaths(graph, funcArr[i], funcArr[j], 10);
            if (paths.length) routes.push({ from: funcArr[i], to: funcArr[j], paths });
        }
    }
    return { varName, touches, funcsInvolved: funcArr, routes };
}

module.exports = { findPaths, findCallers, findCallees, buildFileRelations, findVarTrace };
