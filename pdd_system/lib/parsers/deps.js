// ============================================================
// PDD - Dependency Extraction (Multi-language)
// ============================================================

const fs = require('fs');
const path = require('path');
const { FAMILIES, ALL_CODE_EXTS, DATA_EXTS } = require('../config');
const { resolveLocalImport, classifyDep, escapeRegExp, stripCommentsAndStrings } = require('../utils');

function extractDeps(filepath, family, rootPath) {
    const cfg = FAMILIES[family];
    let text;
    try { text = fs.readFileSync(filepath, 'utf-8'); } catch (e) { return { strings: [], details: [] }; }
    text = stripCommentsAndStrings(text, family);
    const strings = new Set();
    const details = [];
    for (const pat of cfg.patterns) {
        let m;
        while ((m = pat.exec(text)) !== null) {
            let dep = m[1].trim();
            if (!dep) continue;
            const resolved = dep.startsWith('.') ? resolveLocalImport(filepath, dep, rootPath) : null;
            const type = classifyDep(dep, family, resolved);
            if (resolved) strings.add(resolved); else strings.add(dep);
            details.push({ raw: dep, type, resolved });
        }
    }
    return { strings: Array.from(strings).sort(), details };
}

function extractPathsFromDataFile(filepath) {
    let text;
    try { text = fs.readFileSync(filepath, 'utf-8'); } catch (e) { return []; }
    const found = new Set();
    const re = /["'`]([^"'`]+)["'`]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const val = m[1].trim();
        if (val.length < 3 || val.length > 260) continue;
        if (val.startsWith('http://') || val.startsWith('https://')) continue;
        if (val.startsWith('npm:') || val.startsWith('node:')) continue;
        const ext = path.extname(val).toLowerCase();
        if (ALL_CODE_EXTS.has(ext) || DATA_EXTS.has(ext)) found.add(val.replace(/\\/g, '/'));
    }
    return Array.from(found).sort();
}

function findDataFileRefsInCode(text, dataFileMap) {
    const refs = new Set();
    for (const [identifier, dataRelPath] of dataFileMap) {
        if (identifier.length < 4) continue;
        const escaped = escapeRegExp(identifier);
        const re = new RegExp(`["'\`][^"'\`]*${escaped}["'\`]`, 'gi');
        if (re.test(text)) refs.add(dataRelPath);
    }
    return Array.from(refs);
}

module.exports = { extractDeps, extractPathsFromDataFile, findDataFileRefsInCode };
