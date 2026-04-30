#!/usr/bin/env node
// ============================================================
// PDD Toolkit - MCP Server (Zero Dependencies)
// Protocol: JSON-RPC 2.0 over stdio (MCP standard)
// ============================================================

const fs = require('fs');
const path = require('path');
const { scan } = require('./lib/scanner');
const { findPaths, findVarTrace } = require('./lib/analysis');
const { inspectFile, inspectFileFocused } = require('./lib/inspect');
const { toGroupedFunc } = require('./lib/output');

// ============================================================
// Tool Definitions
// ============================================================

const TOOLS = [
    {
        name: 'pdd_scan',
        description: 'Scan a project directory and build the code analysis graph. Use this first, or when the project code has changed.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: { type: 'string', description: 'Absolute path to the source code directory to scan (e.g. "C:/project/src")' }
            },
            required: ['projectRoot']
        }
    },
    {
        name: 'pdd_inspect',
        description: 'Get full forensic context of a source file: exports, blast radius, siblings, critical paths. Use --focus for a single function (~30 lines vs ~200).',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: { type: 'string', description: 'Absolute path to the source code directory' },
                file: { type: 'string', description: 'Relative path to the file within projectRoot (e.g. "midi_banks/midi_banks.c")' },
                focus: { type: 'string', description: 'Optional: function name to focus on. Reduces output from ~200 to ~30 lines.' }
            },
            required: ['projectRoot', 'file']
        }
    },
    {
        name: 'pdd_query',
        description: 'Get the neighborhood of a function: callers, callees, global touches, and paths to dangerous sinks (malloc, free, mutex).',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: { type: 'string', description: 'Absolute path to the source code directory' },
                func: { type: 'string', description: 'Name of the function to query' }
            },
            required: ['projectRoot', 'func']
        }
    },
    {
        name: 'pdd_trace',
        description: 'Find execution paths between two functions. Use to verify if function A can reach function B (e.g. "can init reach free?").',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: { type: 'string', description: 'Absolute path to the source code directory' },
                from: { type: 'string', description: 'Source function name' },
                to: { type: 'string', description: 'Target function name' },
                maxDepth: { type: 'number', description: 'Max search depth (default: 25)' }
            },
            required: ['projectRoot', 'from', 'to']
        }
    },
    {
        name: 'pdd_var',
        description: 'Trace a global variable: where it is declared, which functions touch it, and data flow paths between those functions.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRoot: { type: 'string', description: 'Absolute path to the source code directory' },
                name: { type: 'string', description: 'Name of the global variable to trace' }
            },
            required: ['projectRoot', 'name']
        }
    }
];

// ============================================================
// Graph Cache
// ============================================================

const graphCache = new Map(); // projectRoot -> graph

function getOrBuildGraph(projectRoot, forceRebuild) {
    const normalized = path.resolve(projectRoot).replace(/\\/g, '/');

    if (!forceRebuild && graphCache.has(normalized)) {
        return graphCache.get(normalized);
    }

    // Try loading from disk cache
    const cacheFile = path.join(normalized, '.pdd', 'cache', 'project-graph.json');
    if (!forceRebuild && fs.existsSync(cacheFile)) {
        try {
            const raw = fs.readFileSync(cacheFile, 'utf-8').replace(/^\uFEFF/, '');
            const graph = JSON.parse(raw);
            graphCache.set(normalized, graph);
            return graph;
        } catch (e) {
            // Cache corrupted, rebuild
        }
    }

    // Build fresh
    const graph = scan(normalized);
    try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(graph, null, 2), 'utf-8');
    } catch (e) {
        // Non-fatal: cache write failed
    }
    graphCache.set(normalized, graph);
    return graph;
}

// ============================================================
// Tool Handlers
// ============================================================

function handleToolCall(name, args) {
    const projectRoot = (args.projectRoot || '').replace(/\\/g, '/');

    if (!projectRoot) {
        return 'ERROR: projectRoot is required.';
    }

    if (!fs.existsSync(projectRoot)) {
        return `ERROR: projectRoot "${projectRoot}" does not exist.`;
    }

    switch (name) {
        case 'pdd_scan': {
            const graph = getOrBuildGraph(projectRoot, true);
            const fileCount = Object.keys(graph.files).length;
            const funcCount = Object.keys(graph.functions).length;
            const callCount = graph.calls.length;
            return `SCAN_COMPLETE: ${fileCount} files, ${funcCount} functions, ${callCount} calls.\nGraph cached at: ${projectRoot}/.pdd/cache/project-graph.json`;
        }

        case 'pdd_inspect': {
            const file = (args.file || '').replace(/\\/g, '/');
            const focus = args.focus || null;
            if (!file) return 'ERROR: file is required.';
            const graph = getOrBuildGraph(projectRoot, false);
            if (focus) {
                return inspectFileFocused(graph, file, focus);
            } else {
                return inspectFile(graph, file);
            }
        }

        case 'pdd_query': {
            const func = args.func || '';
            if (!func) return 'ERROR: func is required.';
            const graph = getOrBuildGraph(projectRoot, false);
            return toGroupedFunc(graph, func);
        }

        case 'pdd_trace': {
            const from = args.from || '';
            const to = args.to || '';
            const maxDepth = args.maxDepth || 25;
            if (!from || !to) return 'ERROR: from and to are required.';
            const graph = getOrBuildGraph(projectRoot, false);
            const paths = findPaths(graph, from, to, maxDepth);
            if (!paths.length) return `NO_PATH: ${from} -> ${to}`;
            const lines = [`=== TRACE: ${from} -> ${to} ===`];
            paths.forEach((p, i) => lines.push(`[${i + 1}] ${p.join(' > ')}`));
            lines.push('=== END ===');
            return lines.join('\n');
        }

        case 'pdd_var': {
            const varName = args.name || '';
            if (!varName) return 'ERROR: name is required.';
            const graph = getOrBuildGraph(projectRoot, false);
            const vt = findVarTrace(graph, varName);
            if (!vt.touches.length) return `NO_TOUCHES: ${varName}`;
            const lines = [`=== VAR: ${varName} ===`];
            const g = graph.globals.find(x => x.name === varName);
            if (g) lines.push(`DECLARE: ${g.file}:${g.line}`);
            lines.push(`TOUCHES (${vt.touches.length}):`);
            for (const t of vt.touches) lines.push(`- ${t.func} @ ${t.file}:${t.line}`);
            if (vt.routes.length) {
                lines.push('FLOW_PATHS:');
                for (const r of vt.routes.slice(0, 3)) {
                    lines.push(`- ${r.from} -> ${r.to} via ${r.paths[0].join(' > ')}`);
                }
            }
            lines.push('=== END ===');
            return lines.join('\n');
        }

        default:
            return `ERROR: Unknown tool "${name}".`;
    }
}

// ============================================================
// JSON-RPC 2.0 Transport (stdio)
// ============================================================

function jsonRpcResponse(id, result) {
    return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(id, code, message) {
    return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

function handleMessage(msg) {
    const { id, method, params } = msg;

    switch (method) {
        case 'initialize':
            return jsonRpcResponse(id, {
                protocolVersion: '2025-03-26',
                capabilities: { tools: {} },
                serverInfo: { name: 'pdd-toolkit', version: '1.0.0' }
            });

        case 'notifications/initialized':
            return null; // No response for notifications

        case 'tools/list':
            return jsonRpcResponse(id, { tools: TOOLS });

        case 'tools/call': {
            const toolName = params && params.name;
            const toolArgs = (params && params.arguments) || {};

            if (!toolName) {
                return jsonRpcError(id, -32602, 'Missing tool name');
            }

            if (!TOOLS.find(t => t.name === toolName)) {
                return jsonRpcError(id, -32602, `Unknown tool: ${toolName}`);
            }

            try {
                const result = handleToolCall(toolName, toolArgs);
                return jsonRpcResponse(id, {
                    content: [{ type: 'text', text: result }]
                });
            } catch (error) {
                return jsonRpcResponse(id, {
                    content: [{ type: 'text', text: `ERROR PDD: ${error.message}` }],
                    isError: true
                });
            }
        }

        case 'ping':
            return jsonRpcResponse(id, {});

        default:
            if (id !== undefined) {
                return jsonRpcError(id, -32601, `Method not found: ${method}`);
            }
            return null; // Ignore unknown notifications
    }
}

// ============================================================
// stdin/stdout Line Reader
// ============================================================

let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;

        try {
            const msg = JSON.parse(line);
            const response = handleMessage(msg);
            if (response) {
                process.stdout.write(response + '\n');
            }
        } catch (e) {
            const errResp = jsonRpcError(null, -32700, `Parse error: ${e.message}`);
            process.stdout.write(errResp + '\n');
        }
    }
});

process.stdin.on('end', () => {
    process.exit(0);
});

// All logging goes to stderr (never stdout)
console.error('[pdd-mcp] Server ready (stdio)');
