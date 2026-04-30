// ============================================================
// PDD - Generic Brace-Based Parser (JS, Go, Java, C#, Rust, PHP, Swift)
// + Language-specific globals extractors
// ============================================================

const { KEYWORDS } = require('../config');
const { lineNumber, insideRanges, getKeywords, stripCommentsAndStrings, extractCalls } = require('../utils');

function isIdChar(ch, allowDollar = false) {
    return /[A-Za-z0-9_]/.test(ch) || (allowDollar && ch === '$');
}

function extractBraceFunctions(originalText, rel, family) {
    const clean = stripCommentsAndStrings(originalText, family);
    const kws = getKeywords(family);
    const funcs = [];
    let i = 0;

    while (i < clean.length) {
        if (clean[i] !== '{') { i++; continue; }
        const braceIdx = i;

        let j = braceIdx - 1;
        while (j >= 0 && /\s/.test(clean[j])) j--;
        if (j < 0 || clean[j] !== ')') { i++; continue; }

        let parenOpen = -1, depth = 1;
        for (let k = j - 1; k >= 0; k--) {
            if (clean[k] === ')') depth++;
            else if (clean[k] === '(') { depth--; if (depth === 0) { parenOpen = k; break; } }
        }
        if (parenOpen === -1) { i++; continue; }

        const between = clean.slice(parenOpen, braceIdx);
        const isArrow = /=>/.test(between);

        let name = null;
        let nameStart = -1;
        let isStatic = false;
        let isExport = false;

        if (isArrow) {
            let eq = clean.lastIndexOf('=', parenOpen);
            if (eq !== -1) {
                let b = eq - 1;
                while (b >= 0 && /\s/.test(clean[b])) b--;
                let ne = b;
                while (b >= 0 && isIdChar(clean[b], true)) b--;
                name = clean.slice(b + 1, ne + 1);
                let decl = clean.slice(Math.max(0, b - 20), b + 1);
                if (/(?:const|let|var)\s+$/.test(decl)) {
                    nameStart = b + 1;
                    let ctx = clean.slice(Math.max(0, b - 100), b + 1);
                    isExport = /\bexport\b/.test(ctx);
                } else {
                    name = null;
                }
            }
        } else {
            let b = parenOpen - 1;
            while (b >= 0 && /\s/.test(clean[b])) b--;
            let ne = b;
            while (b >= 0 && isIdChar(clean[b], family === 'js_family' || family === 'php_family')) b--;
            name = clean.slice(b + 1, ne + 1);
            nameStart = b + 1;

            const before = clean.slice(Math.max(0, b - 30), b + 1);
            const hasFuncKw = /\b(function|func|fn)\b/.test(before);

            if (family === 'go_family' && !hasFuncKw) { name = null; }
            else if (family === 'rust_family' && !hasFuncKw) { name = null; }
            else if (family === 'swift_family' && !hasFuncKw) { name = null; }
        }

        if (!name || kws.has(name)) { i++; continue; }
        if (['if', 'while', 'for', 'switch', 'catch', 'else'].includes(name)) { i++; continue; }

        // Determine static/export from context
        const ctx = clean.slice(Math.max(0, nameStart - 120), nameStart);

        if (family === 'go_family') {
            isExport = name[0] === name[0].toUpperCase() && /[A-Z]/.test(name[0]);
            isStatic = !isExport;
        } else if (family === 'rust_family') {
            isExport = /\bpub\b/.test(ctx);
            isStatic = !isExport;
        } else if (family === 'java_family' || family === 'cs_family') {
            isExport = /\bpublic\b/.test(ctx);
            isStatic = /\b(private|protected)\b/.test(ctx);
        } else if (family === 'swift_family') {
            isExport = /\b(public|open)\b/.test(ctx);
            isStatic = /\b(private|fileprivate)\b/.test(ctx);
        } else if (family === 'php_family') {
            isExport = /\bpublic\b/.test(ctx) || !/\b(private|protected)\b/.test(ctx);
            isStatic = /\b(private|protected)\b/.test(ctx);
        } else if (family === 'js_family') {
            // BUG 5 FIX: Only mark as export if `export` keyword is present
            isExport = /\bexport\b/.test(ctx);
            isStatic = !isExport && (name.startsWith('_') || /\bstatic\b/.test(ctx));
        }

        // Extract body
        let bodyStart = braceIdx + 1, braceDepth = 1, bodyEnd = bodyStart;
        for (let p = bodyStart; p < clean.length; p++) {
            if (clean[p] === '{') braceDepth++;
            else if (clean[p] === '}') { braceDepth--; if (braceDepth === 0) { bodyEnd = p; break; } }
        }

        const bodyText = clean.slice(bodyStart, bodyEnd);
        const calls = extractCalls(bodyText, bodyStart, originalText, family);

        funcs.push({
            name, isStatic, file: rel,
            lineStart: lineNumber(originalText, nameStart > 0 ? nameStart : braceIdx),
            lineEnd: lineNumber(originalText, bodyEnd),
            bodyStart, bodyEnd, bodyText, calls,
            isExport
        });
        i = bodyEnd + 1;
    }
    return funcs;
}

// --- JS Globals ---
function extractGlobalsJS(clean, rel, funcRanges) {
    const vars = [];
    const re = /^[ \t]*(const|let|var)\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)\s*(?:=[^;]*)?;/gm;
    let m;
    while ((m = re.exec(clean)) !== null) {
        if (insideRanges(m.index, funcRanges)) continue;
        const line = lineNumber(clean, m.index);
        const names = m[2].split(',').map(s => s.trim()).filter(Boolean);
        for (const n of names) {
            if (KEYWORDS.js_family.has(n)) continue;
            vars.push({ name: n, file: rel, line });
        }
    }
    return vars;
}

// --- Go Globals ---
function extractGlobalsGo(clean, rel, funcRanges) {
    const vars = [];
    const re = /\b(var|const)\s+([A-Za-z_]\w*)/gm;
    let m;
    while ((m = re.exec(clean)) !== null) {
        if (insideRanges(m.index, funcRanges)) continue;
        vars.push({ name: m[2], file: rel, line: lineNumber(clean, m.index) });
    }
    return vars;
}

// --- Rust Globals ---
function extractGlobalsRust(clean, rel, funcRanges) {
    const vars = [];
    const re = /^[ \t]*(static|const)\s+(?:mut\s+)?([A-Za-z_]\w*)/gm;
    let m;
    while ((m = re.exec(clean)) !== null) {
        if (insideRanges(m.index, funcRanges)) continue;
        vars.push({ name: m[2], file: rel, line: lineNumber(clean, m.index) });
    }
    return vars;
}

module.exports = {
    extractBraceFunctions,
    extractGlobalsJS, extractGlobalsGo, extractGlobalsRust
};
