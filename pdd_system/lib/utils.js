// ============================================================
// PDD - Utility Functions
// ============================================================

const fs = require('fs');
const path = require('path');
const { FAMILIES, C_FAMILY_EXTS, KEYWORDS, SYSTEM_HEADERS } = require('./config');

function shouldSkipDir(d) {
    if (d.startsWith('.')) return true;
    const lower = d.toLowerCase();
    const SKIP = new Set([
        'node_modules', 'vendor', '__pycache__', 'build', 'dist', 'out',
        'archive', 'temp', 'tmp', 'target', 'backup', 'backups',
        'cmake-build-debug', 'cmake-build-release', 'cmakefiles',
        'release', 'debug', 'bin', 'obj', 'packages',
        'coverage', 'test_results', 'test_data', 'test_assets',
        'deps', 'third_party', 'thirdparty', 'external', 'externals',
        'logs', 'log', 'cache', '__snapshots__'
    ]);
    if (SKIP.has(lower)) return true;
    // Skip directories that look like build outputs or backups
    if (lower.startsWith('build_') || lower.startsWith('backup_')) return true;
    return false;
}

function shouldSkipFile(name) {
    return name.endsWith('-graph.json') || [
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
    ].includes(name);
}

function detectFamily(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    for (const [family, cfg] of Object.entries(FAMILIES)) {
        if (cfg.exts.has(ext)) return family;
    }
    return null;
}

function isCFamily(filepath) {
    return C_FAMILY_EXTS.has(path.extname(filepath).toLowerCase());
}

function lineNumber(text, index) {
    let ln = 1;
    for (let i = 0; i < index && i < text.length; i++) {
        if (text[i] === '\n') ln++;
    }
    return ln;
}

function insideRanges(idx, ranges) {
    for (const [s, e] of ranges) {
        if (idx >= s && idx <= e) return true;
    }
    return false;
}

function getKeywords(family) {
    return KEYWORDS[family] || KEYWORDS.c_family;
}

function resolveLocalImport(baseFile, rawDep, rootPath) {
    const baseDir = path.dirname(baseFile);
    const abs = path.resolve(rootPath, baseDir, rawDep);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return path.relative(rootPath, abs).replace(/\\/g, '/');
    }
    const IMPLICIT = {
        c_family: ['.h', '.hpp', '.c', '.cpp'],
        js_family: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
        py_family: ['.py'],
        rb_family: ['.rb'],
        php_family: ['.php'],
        swift_family: ['.swift']
    };
    const family = detectFamily(baseFile) || 'c_family';
    const exts = IMPLICIT[family] || [];
    for (const ext of exts) {
        const p = abs + ext;
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            return path.relative(rootPath, p).replace(/\\/g, '/');
        }
    }
    const INDEXES = { js_family: ['index.js', 'index.ts'], py_family: ['__init__.py'] };
    const idxs = INDEXES[family] || [];
    for (const idx of idxs) {
        const p = path.join(abs, idx);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            return path.relative(rootPath, p).replace(/\\/g, '/');
        }
    }
    return null;
}

function classifyDep(rawDep, family, resolved) {
    if (resolved) return 'internal';
    if (rawDep.startsWith('.')) return 'unresolved';
    if (family === 'c_family' && SYSTEM_HEADERS.has(rawDep)) return 'system';
    return 'external';
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// Multi-language comment/string stripper
// ============================================================

function stripCommentsAndStrings(text, family = 'c_family') {
    const useHash = ['py_family', 'rb_family'].includes(family);
    const useTripleQuotes = family === 'py_family';
    const useBacktick = ['js_family', 'go_family', 'swift_family'].includes(family);

    let out = '';
    let i = 0;
    while (i < text.length) {
        // Python triple quotes
        if (useTripleQuotes && (text.substr(i, 3) === '"""' || text.substr(i, 3) === "'''")) {
            const q = text.substr(i, 3);
            out += '   '; i += 3;
            while (i < text.length && text.substr(i, 3) !== q) {
                out += (text[i] === '\n' ? '\n' : ' ');
                i++;
            }
            if (i < text.length) { out += '   '; i += 3; }
            continue;
        }
        // Line comments //
        if (text[i] === '/' && text[i + 1] === '/') {
            out += '  '; i += 2;
            while (i < text.length && text[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        // Block comments /* */
        if (text[i] === '/' && text[i + 1] === '*') {
            out += '  '; i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
                out += (text[i] === '\n' ? '\n' : ' ');
                i++;
            }
            if (i < text.length) { out += '  '; i += 2; }
            continue;
        }
        // Hash comments (Python, Ruby)
        if (useHash && text[i] === '#') {
            out += ' '; i++;
            while (i < text.length && text[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        // BUG 3 FIX: Template literals with ${} interpolation support
        if (useBacktick && text[i] === '`') {
            out += '`'; i++;
            while (i < text.length && text[i] !== '`') {
                if (text[i] === '\\') {
                    out += '  '; i += 2;
                } else if (text[i] === '$' && i + 1 < text.length && text[i + 1] === '{') {
                    // Preserve ${...} interpolation content (it's executable code)
                    out += '${'; i += 2;
                    let depth = 1;
                    while (i < text.length && depth > 0) {
                        if (text[i] === '{') depth++;
                        else if (text[i] === '}') { depth--; if (depth === 0) break; }
                        out += text[i]; i++;
                    }
                    if (i < text.length) { out += '}'; i++; }
                } else {
                    out += ' '; i++;
                }
            }
            if (i < text.length) { out += '`'; i++; }
            continue;
        }
        // Regular strings
        if (text[i] === '"' || text[i] === "'") {
            const quote = text[i];
            out += quote; i++;
            while (i < text.length && text[i] !== quote) {
                if (text[i] === '\\') { out += '  '; i += 2; }
                else { out += ' '; i++; }
            }
            if (i < text.length) { out += quote; i++; }
            continue;
        }
        out += text[i]; i++;
    }
    return out;
}

// ============================================================
// BUG 1 FIX: extractCalls now filters keywords per-language
// ============================================================

function extractCalls(bodyText, bodyOffset, originalText, family = 'c_family') {
    const calls = [];
    const kws = getKeywords(family);
    const re = /\b([A-Za-z_]\w*)\s*\(/g;
    let m;
    while ((m = re.exec(bodyText)) !== null) {
        if (kws.has(m[1])) continue;
        calls.push({ name: m[1], line: lineNumber(originalText, bodyOffset + m.index) });
    }
    return calls;
}

function extractTouches(bodyText, bodyOffset, originalText, globalNames, funcName, filename) {
    const touches = [];
    const re = /\b([A-Za-z_]\w*)\b/g;
    let m;
    while ((m = re.exec(bodyText)) !== null) {
        const id = m[1];
        if (!globalNames.has(id)) continue;
        let k = m.index + m[0].length;
        while (k < bodyText.length && /\s/.test(bodyText[k])) k++;
        if (k < bodyText.length && bodyText[k] === '(') continue;
        touches.push({
            var: id, func: funcName, file: filename,
            line: lineNumber(originalText, bodyOffset + m.index)
        });
    }
    return touches;
}

module.exports = {
    shouldSkipDir, shouldSkipFile, detectFamily, isCFamily,
    lineNumber, insideRanges, getKeywords,
    resolveLocalImport, classifyDep, escapeRegExp,
    stripCommentsAndStrings, extractCalls, extractTouches
};
