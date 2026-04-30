// ============================================================
// PDD - Python Parser
// ============================================================

const { lineNumber, insideRanges, stripCommentsAndStrings, extractCalls } = require('../utils');

function extractFunctionsPython(originalText, rel) {
    const clean = stripCommentsAndStrings(originalText, 'py_family');
    const funcs = [];
    const re = /^( *)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const indent = m[1].length;
        const name = m[2];
        const defLine = lineNumber(clean, m.index);
        const lineEnd = clean.indexOf('\n', m.index + m[0].length);
        let start = lineEnd === -1 ? clean.length : lineEnd + 1;
        let end = start;

        for (let i = start; i < clean.length;) {
            const nextLineEnd = clean.indexOf('\n', i);
            const line = clean.slice(i, nextLineEnd === -1 ? clean.length : nextLineEnd);
            if (line.trim().length === 0) {
                i = nextLineEnd === -1 ? clean.length : nextLineEnd + 1;
                end = i;
                continue;
            }
            const lineIndent = line.match(/^(\s*)/)[1].length;
            if (lineIndent <= indent) {
                end = i;
                break;
            }
            i = nextLineEnd === -1 ? clean.length : nextLineEnd + 1;
            end = i;
        }

        const bodyText = clean.slice(start, end);
        const calls = extractCalls(bodyText, start, originalText, 'py_family');
        const isStatic = name.startsWith('_') && !name.startsWith('__');

        funcs.push({
            name, isStatic, file: rel,
            lineStart: defLine,
            lineEnd: lineNumber(originalText, end),
            bodyStart: start, bodyEnd: end, bodyText, calls,
            isExport: !isStatic
        });
    }
    return funcs;
}

function extractGlobalsPython(clean, rel, funcRanges) {
    const vars = [];
    const re = /^([A-Za-z_]\w*)\s*=[^=]/gm;
    let m;
    while ((m = re.exec(clean)) !== null) {
        if (insideRanges(m.index, funcRanges)) continue;
        const lineStart = clean.lastIndexOf('\n', m.index) + 1;
        if (/^[ \t]/.test(clean.slice(lineStart, m.index))) continue;
        vars.push({ name: m[1], file: rel, line: lineNumber(clean, m.index) });
    }
    return vars;
}

module.exports = { extractFunctionsPython, extractGlobalsPython };
