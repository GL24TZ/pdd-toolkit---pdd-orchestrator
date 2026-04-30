// ============================================================
// PDD - C Language Parser
// ============================================================

const { KEYWORDS } = require('../config');
const { lineNumber, insideRanges, stripCommentsAndStrings, extractCalls } = require('../utils');

function extractIncludes(cleanText, filename) {
    const incs = [];
    const re = /^[ \t]*#[ \t]*include[ \t]+["<]([^">]+)[">]/gm;
    let m;
    while ((m = re.exec(cleanText)) !== null) {
        incs.push({ from: filename, to: m[1], line: lineNumber(cleanText, m.index) });
    }
    return incs;
}

function extractGlobalVarsC(cleanText, filename, funcRanges) {
    const vars = [];
    const re = /^[ \t]*([A-Za-z_][A-Za-z0-9_\s\*]*?)\s+([A-Za-z_]\w*(?:\s*,\s*\*?\s*[A-Za-z_]\w*)*)\s*(?:=[^;]*)?;/gm;
    let m;
    while ((m = re.exec(cleanText)) !== null) {
        if (insideRanges(m.index, funcRanges)) continue;
        const line = lineNumber(cleanText, m.index);
        const names = m[2].split(',').map(s => s.replace(/^\s*\*?\s*/, '').trim()).filter(Boolean);
        for (const n of names) {
            if (KEYWORDS.c_family.has(n)) continue;
            vars.push({ name: n, file: filename, line });
        }
    }
    return vars;
}

function extractFunctionsC(originalText, filename) {
    const clean = stripCommentsAndStrings(originalText, 'c_family');
    const funcs = [];
    let i = 0;

    while (i < clean.length) {
        if (clean[i] !== '{') { i++; continue; }
        const braceIdx = i;
        let j = braceIdx - 1;
        while (j >= 0 && /\s/.test(clean[j])) j--;

        let scan = true;
        while (scan && j >= 0) {
            let k = j;
            while (k >= 0 && /[A-Za-z0-9_]/.test(clean[k])) k--;
            const word = clean.slice(k + 1, j + 1);
            if (['const', 'volatile', 'restrict'].includes(word)) {
                j = k; while (j >= 0 && /\s/.test(clean[j])) j--;
            } else scan = false;
        }

        if (j < 0 || clean[j] !== ')') { i++; continue; }

        let parenOpen = -1, depth = 1;
        for (let k = j - 1; k >= 0; k--) {
            if (clean[k] === ')') depth++;
            else if (clean[k] === '(') { depth--; if (depth === 0) { parenOpen = k; break; } }
        }
        if (parenOpen === -1) { i++; continue; }

        let k = parenOpen - 1;
        while (k >= 0 && /\s/.test(clean[k])) k--;
        if (k < 0) { i++; continue; }
        let nameEnd = k;
        while (k >= 0 && /[A-Za-z0-9_]/.test(clean[k])) k--;
        let nameStart = k + 1;
        let name = clean.slice(nameStart, nameEnd + 1);

        if (!name || KEYWORDS.c_family.has(name)) { i++; continue; }

        const snippet = clean.slice(nameStart, braceIdx);
        if (/=/.test(snippet)) { i++; continue; }

        const before = clean.slice(Math.max(0, nameStart - 50), nameStart);
        const isStatic = /\bstatic\b/.test(before);

        let bodyStart = braceIdx + 1, braceDepth = 1, bodyEnd = bodyStart;
        for (let p = bodyStart; p < clean.length; p++) {
            if (clean[p] === '{') braceDepth++;
            else if (clean[p] === '}') { braceDepth--; if (braceDepth === 0) { bodyEnd = p; break; } }
        }

        const bodyText = clean.slice(bodyStart, bodyEnd);
        const calls = extractCalls(bodyText, bodyStart, originalText, 'c_family');

        funcs.push({
            name, isStatic, file: filename,
            lineStart: lineNumber(originalText, nameStart),
            lineEnd: lineNumber(originalText, bodyEnd),
            bodyStart, bodyEnd, bodyText, calls,
            isExport: !isStatic
        });
        i = bodyEnd + 1;
    }
    return funcs;
}

module.exports = { extractIncludes, extractGlobalVarsC, extractFunctionsC };
