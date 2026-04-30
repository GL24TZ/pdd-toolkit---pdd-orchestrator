#!/usr/bin/env node
// ============================================================
// PDD Toolkit - Multi-language code analysis for AI agents
// ============================================================

const fs = require('fs');
const path = require('path');
const { scan } = require('./lib/scanner');
const { findPaths, findVarTrace } = require('./lib/analysis');
const { inspectFile, inspectFileFocused } = require('./lib/inspect');
const { toGroupedFunc } = require('./lib/output');

const args = process.argv.slice(2);

// --- Help ---
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
PDD Toolkit - Multi-language code analysis for AI agents

Usage:
  node pdd.js scan <dir> [--output graph.json]
  node pdd.js inspect <file> [graph.json]              <-- full file context
  node pdd.js inspect <file> --focus <func> [graph.json] <-- focused on 1 function
  node pdd.js query <func> <graph.json>
  node pdd.js trace <from> <to> <graph.json> [--max-depth N]
  node pdd.js var <name> <graph.json>

Commands:
  scan    Build the graph JSON from project source.
  inspect Full file context (or --focus for a single function).
  query   Function neighborhood (callers, callees, sinks).
  trace   Execution path A -> B.
  var     Global variable trace.

Languages: C, C++, JavaScript, TypeScript, Python, Go, Java,
           C#, Rust, Ruby, PHP, Swift

All outputs use GROUPED format (structured facts for AI agents).
`);
    process.exit(0);
}

// --- Arg parsing ---
const cmd = args[0];
const outputIdx = args.indexOf('--output');
const maxDepthIdx = args.indexOf('--max-depth');
const maxDepth = maxDepthIdx !== -1 ? parseInt(args[maxDepthIdx + 1], 10) || 25 : 25;
const focusIdx = args.indexOf('--focus');
const focusFunc = focusIdx !== -1 ? args[focusIdx + 1] : null;

function loadGraph(argPath) {
    if (!argPath || !fs.existsSync(argPath)) return null;
    const raw = fs.readFileSync(argPath, 'utf-8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
}

function findProjectRoot(startDir) {
    let current = path.resolve(startDir);
    const MARKERS = [
        'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml',
        'Makefile', 'CMakeLists.txt', 'pom.xml', 'build.gradle',
        'composer.json', 'Gemfile', 'setup.py', 'setup.cfg'
    ];
    while (true) {
        try {
            const files = fs.readdirSync(current);
            if (files.some(f => MARKERS.includes(f) || f === '.git')) return current;
        } catch (e) { break; }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return process.cwd();
}

// --- SCAN ---
if (cmd === 'scan') {
    const root = args[1] || '.';
    const graph = scan(root);
    const result = JSON.stringify(graph, null, 2);
    if (outputIdx !== -1 && args[outputIdx + 1]) {
        const out = args[outputIdx + 1];
        fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
        fs.writeFileSync(out, result, 'utf-8');
        console.error(`[pdd] Graph: ${out} (${(result.length / 1024).toFixed(1)} KB)`);
    } else {
        console.log(result);
    }
    process.exit(0);
}

// --- INSPECT (with auto-scan) ---
if (cmd === 'inspect') {
    const target = (args[1] || '').replace(/\\/g, '/');
    // graphFile is the first arg after target that isn't a flag or flag value
    let graphFile = null;
    for (let i = 2; i < args.length; i++) {
        if (args[i] === '--focus' || args[i] === '--output' || args[i] === '--max-depth') { i++; continue; }
        if (args[i].startsWith('--')) continue;
        if (!graphFile) { graphFile = args[i]; break; }
    }
    if (!target) { console.error('ERROR: inspect <file> [graph.json] [--focus <func>]'); process.exit(1); }

    let graph = null;
    if (!graphFile || !fs.existsSync(graphFile)) {
        const root = findProjectRoot(path.dirname(path.resolve(target)) || '.');
        graphFile = graphFile || '.pdd/cache/project-graph.json';
        console.error(`[pdd] Graph not found. Auto-scanning: ${root}`);
        graph = scan(root);
        fs.mkdirSync(path.dirname(path.resolve(graphFile)), { recursive: true });
        fs.writeFileSync(graphFile, JSON.stringify(graph, null, 2), 'utf-8');
        console.error(`[pdd] Graph saved: ${graphFile}`);
    } else {
        graph = loadGraph(graphFile);
    }

    if (!graph) { console.error('ERROR: Could not load or generate graph.'); process.exit(1); }
    if (focusFunc) {
        console.log(inspectFileFocused(graph, target, focusFunc));
    } else {
        console.log(inspectFile(graph, target));
    }
    process.exit(0);
}

// --- QUERY ---
if (cmd === 'query') {
    const target = args[1];
    const graphFile = args[2];
    if (!target || !graphFile) { console.error('ERROR: query <func> <graph.json>'); process.exit(1); }
    const graph = loadGraph(graphFile);
    if (!graph) { console.error('ERROR: Graph not found.'); process.exit(1); }
    console.log(toGroupedFunc(graph, target));
    process.exit(0);
}

// --- TRACE ---
if (cmd === 'trace') {
    const from = args[1];
    const to = args[2];
    const graphFile = args[3];
    if (!from || !to || !graphFile) { console.error('ERROR: trace <from> <to> <graph.json>'); process.exit(1); }
    const graph = loadGraph(graphFile);
    if (!graph) { console.error('ERROR: Graph not found.'); process.exit(1); }
    const paths = findPaths(graph, from, to, maxDepth);
    if (!paths.length) {
        console.log(`NO_PATH: ${from} -> ${to}`);
    } else {
        console.log(`=== TRACE: ${from} -> ${to} ===`);
        paths.forEach((p, i) => console.log(`[${i + 1}] ${p.join(' > ')}`));
        console.log(`=== END ===`);
    }
    process.exit(0);
}

// --- VAR ---
if (cmd === 'var') {
    const varName = args[1];
    const graphFile = args[2];
    if (!varName || !graphFile) { console.error('ERROR: var <name> <graph.json>'); process.exit(1); }
    const graph = loadGraph(graphFile);
    if (!graph) { console.error('ERROR: Graph not found.'); process.exit(1); }
    const vt = findVarTrace(graph, varName);
    if (!vt.touches.length) {
        console.log(`NO_TOUCHES: ${varName}`);
    } else {
        console.log(`=== VAR: ${varName} ===`);
        if (graph.globals.find(g => g.name === varName)) {
            const g = graph.globals.find(x => x.name === varName);
            console.log(`DECLARE: ${g.file}:${g.line}`);
        }
        console.log(`TOUCHES (${vt.touches.length}):`);
        for (const t of vt.touches) console.log(`- ${t.func} @ ${t.file}:${t.line}`);
        if (vt.routes.length) {
            console.log(`FLOW_PATHS:`);
            for (const r of vt.routes.slice(0, 3)) {
                console.log(`- ${r.from} -> ${r.to} via ${r.paths[0].join(' > ')}`);
            }
        }
        console.log(`=== END ===`);
    }
    process.exit(0);
}

console.error('ERROR: Unknown command. Use --help.');
process.exit(1);