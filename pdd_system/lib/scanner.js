// ============================================================
// PDD - Scanner (Graph Builder)
// ============================================================

const fs = require('fs');
const path = require('path');
const { FAMILIES, C_FAMILY_EXTS, DATA_EXTS, ALL_CODE_EXTS, SYSTEM_HEADERS } = require('./config');
const {
    shouldSkipDir, shouldSkipFile, detectFamily, isCFamily,
    stripCommentsAndStrings, resolveLocalImport, extractTouches
} = require('./utils');

// Parser imports
const { extractIncludes, extractGlobalVarsC, extractFunctionsC } = require('./parsers/c');
const { extractBraceFunctions, extractGlobalsJS, extractGlobalsGo, extractGlobalsRust } = require('./parsers/brace');
const { extractFunctionsPython, extractGlobalsPython } = require('./parsers/python');
const { extractFunctionsRuby } = require('./parsers/ruby');
const { extractDeps, extractPathsFromDataFile, findDataFileRefsInCode } = require('./parsers/deps');

// ============================================================
// Parser Registry
// ============================================================

const PARSERS = {
    c_family: {
        strip: t => stripCommentsAndStrings(t, 'c_family'),
        extractFunctions: (text, rel) => extractFunctionsC(text, rel),
        extractGlobals: (text, rel, ranges) => extractGlobalVarsC(text, rel, ranges)
    },
    js_family: {
        strip: t => stripCommentsAndStrings(t, 'js_family'),
        extractFunctions: (text, rel) => extractBraceFunctions(text, rel, 'js_family'),
        extractGlobals: (text, rel, ranges) => extractGlobalsJS(text, rel, ranges)
    },
    py_family: {
        strip: t => stripCommentsAndStrings(t, 'py_family'),
        extractFunctions: (text, rel) => extractFunctionsPython(text, rel),
        extractGlobals: (text, rel, ranges) => extractGlobalsPython(text, rel, ranges)
    },
    go_family: {
        strip: t => stripCommentsAndStrings(t, 'go_family'),
        extractFunctions: (text, rel) => extractBraceFunctions(text, rel, 'go_family'),
        extractGlobals: (text, rel, ranges) => extractGlobalsGo(text, rel, ranges)
    },
    java_family: {
        strip: t => stripCommentsAndStrings(t, 'java_family'),
        extractFunctions: (text, rel) => extractBraceFunctions(text, rel, 'java_family'),
        extractGlobals: null
    },
    cs_family: {
        strip: t => stripCommentsAndStrings(t, 'cs_family'),
        extractFunctions: (text, rel) => extractBraceFunctions(text, rel, 'cs_family'),
        extractGlobals: null
    },
    rust_family: {
        strip: t => stripCommentsAndStrings(t, 'rust_family'),
        extractFunctions: (text, rel) => extractBraceFunctions(text, rel, 'rust_family'),
        extractGlobals: (text, rel, ranges) => extractGlobalsRust(text, rel, ranges)
    },
    rb_family: {
        strip: t => stripCommentsAndStrings(t, 'rb_family'),
        extractFunctions: (text, rel) => extractFunctionsRuby(text, rel),
        extractGlobals: null
    },
    php_family: {
        strip: t => stripCommentsAndStrings(t, 'php_family'),
        extractFunctions: (text, rel) => extractBraceFunctions(text, rel, 'php_family'),
        extractGlobals: null
    },
    swift_family: {
        strip: t => stripCommentsAndStrings(t, 'swift_family'),
        extractFunctions: (text, rel) => extractBraceFunctions(text, rel, 'swift_family'),
        extractGlobals: null
    }
};

// ============================================================
// Scan
// ============================================================

function scan(rootPath) {
    const absRoot = path.resolve(rootPath).replace(/\\/g, '/');
    const graph = {
        generated: new Date().toISOString(),
        root: absRoot,
        files: {},
        functions: {},
        calls: [],
        includes: [],
        globals: [],
        touches: []
    };

    const allFiles = [];
    const dataFileMap = new Map();

    function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                if (!shouldSkipDir(ent.name)) walk(full);
            } else if (!shouldSkipFile(ent.name)) {
                allFiles.push(full);
            }
        }
    }
    walk(absRoot);

    // --- Pass 1: Parse all files ---
    for (const full of allFiles) {
        const rel = path.relative(absRoot, full).replace(/\\/g, '/');
        const ext = path.extname(full).toLowerCase();

        // Data files
        if (DATA_EXTS.has(ext) && !ALL_CODE_EXTS.has(ext)) {
            const refs = extractPathsFromDataFile(full);
            graph.files[rel] = { family: 'data', dependencies: refs, meta: refs.map(r => ({ raw: r, type: 'data_reference' })) };
            dataFileMap.set(path.basename(rel).toLowerCase(), rel);
            const noExt = path.basename(rel, ext).toLowerCase();
            if (noExt.length >= 4) dataFileMap.set(noExt, rel);
            dataFileMap.set(rel.toLowerCase(), rel);
            continue;
        }

        const family = detectFamily(full);
        if (!family) continue;
        const parser = PARSERS[family];

        if (parser && parser.extractFunctions) {
            let text;
            try {
                text = fs.readFileSync(full, 'utf-8');
            } catch (e) {
                continue;
            }
            const clean = parser.strip(text);
            const funcs = parser.extractFunctions(text, rel);
            const ranges = funcs.map(f => [f.bodyStart, f.bodyEnd]);
            const vars = parser.extractGlobals ? parser.extractGlobals(clean, rel, ranges) : [];
            const deps = extractDeps(full, family, absRoot);

            graph.files[rel] = { family, dependencies: deps.strings, meta: deps.details };

            // C-specific includes with line numbers
            if (family === 'c_family') {
                const incs = extractIncludes(text, rel);
                for (const inc of incs) {
                    const resolved = resolveLocalImport(rel, inc.to, absRoot);
                    const dep = resolved || inc.to;
                    if (!graph.files[rel].dependencies.includes(dep)) {
                        graph.files[rel].dependencies.push(dep);
                        graph.files[rel].meta.push({
                            raw: inc.to,
                            type: resolved ? 'internal' : (SYSTEM_HEADERS.has(inc.to) ? 'system' : 'external'),
                            resolved
                        });
                    }
                    graph.includes.push({
                        from: inc.from, to: inc.to, line: inc.line,
                        type: resolved ? 'internal' : (SYSTEM_HEADERS.has(inc.to) ? 'system' : 'external')
                    });
                }
            } else {
                for (const d of deps.details) {
                    if (d.resolved) graph.includes.push({ from: rel, to: d.raw, line: 0, type: 'internal' });
                }
            }

            // Functions & calls
            for (const f of funcs) {
                if (!graph.functions[f.name]) {
                    graph.functions[f.name] = { name: f.name, definitions: [], isStatic: f.isStatic };
                }
                graph.functions[f.name].definitions.push({
                    file: f.file, line: f.lineStart, lineEnd: f.lineEnd, isStatic: f.isStatic
                });
                for (const call of f.calls) {
                    const isInternal = !!graph.functions[call.name];
                    graph.calls.push({
                        from: f.name, to: call.name, file: f.file,
                        line: call.line, type: isInternal ? 'internal' : 'external'
                    });
                }
            }

            // Globals
            for (const v of vars) graph.globals.push(v);
            graph.files[rel]._funcs = funcs;
            graph.files[rel]._text = text;
        } else {
            const { strings, details } = extractDeps(full, family, absRoot);
            graph.files[rel] = { family, dependencies: strings, meta: details };
            for (const d of details) {
                if (d.resolved) graph.includes.push({ from: rel, to: d.raw, line: 0, type: 'internal' });
            }
        }
    }

    // --- Pass 2: Touches (cross-language) ---
    const globalNames = new Set(graph.globals.map(g => g.name));
    for (const [rel, fdata] of Object.entries(graph.files)) {
        if (!fdata._funcs || !globalNames.size) continue;
        for (const f of fdata._funcs) {
            const touches = extractTouches(f.bodyText, f.bodyStart, fdata._text, globalNames, f.name, rel);
            graph.touches.push(...touches);
        }
        delete fdata._funcs;
        delete fdata._text;
    }

    // --- Pass 3: Data file references in code ---
    for (const [rel, fdata] of Object.entries(graph.files)) {
        if (fdata.family === 'data') continue;
        const full = path.join(absRoot, rel);
        let text;
        try { text = fs.readFileSync(full, 'utf-8'); } catch (e) { continue; }
        const refs = findDataFileRefsInCode(text, dataFileMap);
        for (const r of refs) {
            if (!fdata.dependencies.includes(r)) {
                fdata.dependencies.push(r);
                fdata.meta.push({ raw: r, type: 'data_access' });
            }
        }
    }

    return graph;
}

module.exports = { scan };
