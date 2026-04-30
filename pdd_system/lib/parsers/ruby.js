// ============================================================
// PDD - Ruby Parser
// ============================================================

const { lineNumber, stripCommentsAndStrings, extractCalls } = require('../utils');

function extractFunctionsRuby(originalText, rel) {
    const clean = stripCommentsAndStrings(originalText, 'rb_family');
    const funcs = [];
    const re = /^\s*def\s+(?:([A-Za-z_]\w*)\.)?([A-Za-z_]\w*[!?]?)/gm;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const classMethod = !!m[1];
        const name = m[2];
        const defLine = lineNumber(clean, m.index);
        let start = clean.indexOf('\n', m.index);
        if (start === -1) start = clean.length; else start++;
        let end = start;
        let depth = 1;
        let i = start;

        while (i < clean.length) {
            const nextLineEnd = clean.indexOf('\n', i);
            const line = clean.slice(i, nextLineEnd === -1 ? clean.length : nextLineEnd);
            const opens = (line.match(/\b(class|module|def|if|unless|while|until|for|begin|case|do)\b/g) || []).length;
            const closes = (line.match(/\bend\b/g) || []).length;
            depth += opens - closes;
            i = nextLineEnd === -1 ? clean.length : nextLineEnd + 1;
            if (depth <= 0) { end = i; break; }
        }

        const bodyText = clean.slice(start, end);
        const calls = extractCalls(bodyText, start, originalText, 'rb_family');

        funcs.push({
            name, isStatic: classMethod, file: rel,
            lineStart: defLine,
            lineEnd: lineNumber(originalText, end),
            bodyStart: start, bodyEnd: end, bodyText, calls,
            isExport: !name.startsWith('_')
        });
    }
    return funcs;
}

module.exports = { extractFunctionsRuby };
