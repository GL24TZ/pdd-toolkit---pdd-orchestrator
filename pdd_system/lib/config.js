// ============================================================
// PDD - Configuration & Constants
// ============================================================

const FAMILIES = {
    c_family: {
        exts: new Set(['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx']),
        patterns: [/#[ \t]*include[ \t]+["<]([^">]+)[">]/g]
    },
    js_family: {
        exts: new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']),
        patterns: [
            /(?:import|export)\s+(?:.*?from\s+)?["']([^"']+)["']/g,
            /require\s*\(\s*["']([^"']+)["']\s*\)/g
        ]
    },
    py_family: {
        exts: new Set(['.py', '.pyw', '.pyi']),
        patterns: [
            /^\s*import\s+([^\s#]+)/gm,
            /^\s*from\s+([^\s#]+)\s+import/gm
        ]
    },
    go_family: {
        exts: new Set(['.go']),
        patterns: [/import\s+["']([^"']+)["']/g]
    },
    java_family: {
        exts: new Set(['.java']),
        patterns: [/import\s+([^\s;]+)/g]
    },
    cs_family: {
        exts: new Set(['.cs']),
        patterns: [/using\s+([^\s;]+)/g]
    },
    rust_family: {
        exts: new Set(['.rs']),
        patterns: [/use\s+([^\s;]+)/g, /extern\s+crate\s+([^\s;]+)/g]
    },
    rb_family: {
        exts: new Set(['.rb', '.gemspec']),
        patterns: [/require\s+["']([^"']+)["']/g, /require_relative\s+["']([^"']+)["']/g]
    },
    php_family: {
        exts: new Set(['.php']),
        patterns: [/(?:include|require)(?:_once)?\s*\(?\s*["']([^"']+)["']/g, /use\s+([^\s;]+)/g]
    },
    swift_family: {
        exts: new Set(['.swift']),
        patterns: [/import\s+([^\s]+)/g]
    }
};

const C_FAMILY_EXTS = new Set(['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx']);

const DATA_EXTS = new Set([
    '.json', '.yaml', '.yml', '.toml', '.xml', '.csv', '.env',
    '.ini', '.cfg', '.conf', '.properties', '.sql', '.sqlite', '.db'
]);

const ALL_CODE_EXTS = new Set();
for (const cfg of Object.values(FAMILIES)) {
    for (const e of cfg.exts) ALL_CODE_EXTS.add(e);
}

const KEYWORDS = {
    c_family: new Set([
        'if', 'while', 'for', 'switch', 'return', 'sizeof', 'typeof', 'alignof',
        'struct', 'union', 'enum', 'typedef', 'static', 'extern', 'inline', 'const',
        'volatile', 'register', 'restrict', 'signed', 'unsigned', 'void', 'char',
        'short', 'int', 'long', 'float', 'double', '_Bool', '_Complex', '_Imaginary',
        'auto', 'break', 'case', 'continue', 'default', 'do', 'else', 'goto', 'offsetof'
    ]),
    js_family: new Set([
        'if', 'while', 'for', 'switch', 'return', 'catch', 'function', 'class',
        'const', 'let', 'var', 'new', 'this', 'throw', 'try', 'typeof',
        'instanceof', 'yield', 'await', 'default', 'export', 'import', 'from',
        'async', 'delete', 'in', 'of', 'void'
    ]),
    py_family: new Set([
        'if', 'while', 'for', 'return', 'def', 'class', 'import', 'from',
        'raise', 'try', 'except', 'finally', 'with', 'as', 'pass', 'lambda',
        'yield', 'await', 'async', 'elif', 'else', 'break', 'continue',
        'global', 'nonlocal', 'assert', 'del'
    ]),
    go_family: new Set([
        'if', 'for', 'return', 'func', 'package', 'import', 'var', 'const',
        'type', 'struct', 'interface', 'map', 'range', 'go', 'defer', 'select',
        'switch', 'case', 'default', 'else', 'break', 'continue', 'fallthrough', 'goto'
    ]),
    java_family: new Set([
        'if', 'while', 'for', 'return', 'public', 'private', 'protected', 'static',
        'final', 'class', 'interface', 'extends', 'implements', 'import', 'package',
        'new', 'this', 'throw', 'try', 'catch', 'finally', 'synchronized', 'abstract',
        'native', 'transient', 'volatile', 'enum', 'assert', 'instanceof', 'super'
    ]),
    cs_family: new Set([
        'if', 'while', 'for', 'return', 'public', 'private', 'protected', 'static',
        'readonly', 'const', 'class', 'interface', 'struct', 'enum', 'namespace',
        'using', 'new', 'this', 'throw', 'try', 'catch', 'finally', 'async', 'await',
        'yield', 'partial', 'virtual', 'override', 'abstract', 'sealed', 'in', 'out',
        'where', 'get', 'set', 'event', 'delegate', 'typeof', 'nameof', 'is', 'as'
    ]),
    rust_family: new Set([
        'if', 'while', 'for', 'return', 'fn', 'let', 'mut', 'const', 'static',
        'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'pub', 'unsafe', 'match',
        'move', 'ref', 'type', 'where', 'async', 'await', 'loop', 'continue', 'break',
        'else', 'self', 'Self', 'super', 'crate', 'dyn', 'typeof'
    ]),
    rb_family: new Set([
        'if', 'unless', 'while', 'until', 'for', 'return', 'def', 'class', 'module',
        'begin', 'rescue', 'ensure', 'end', 'yield', 'raise', 'require',
        'require_relative', 'include', 'extend', 'then', 'elsif', 'else', 'when',
        'case', 'break', 'next', 'do', 'and', 'or', 'not', 'nil', 'true', 'false',
        'self', 'super'
    ]),
    php_family: new Set([
        'if', 'while', 'for', 'foreach', 'return', 'function', 'class', 'interface',
        'trait', 'namespace', 'use', 'public', 'private', 'protected', 'static',
        'final', 'abstract', 'new', 'this', 'throw', 'try', 'catch', 'finally',
        'echo', 'print', 'var', 'const', 'global', 'instanceof', 'array', 'null',
        'true', 'false', 'include', 'include_once', 'require', 'require_once'
    ]),
    swift_family: new Set([
        'if', 'while', 'for', 'return', 'func', 'let', 'var', 'class', 'struct',
        'enum', 'protocol', 'extension', 'import', 'public', 'private', 'fileprivate',
        'internal', 'open', 'static', 'final', 'override', 'init', 'deinit', 'guard',
        'defer', 'do', 'catch', 'throw', 'try', 'await', 'async', 'switch', 'case',
        'default', 'where', 'self', 'Self', 'true', 'false', 'nil', 'is', 'as'
    ])
};

const SINK_HINTS = [
    'platform_mutex_lock', 'mutex_lock', 'pthread_mutex_lock', 'EnterCriticalSection',
    'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'strcpy', 'sprintf',
    'platform_assert', 'ASSERT', 'panic', 'error_handler'
];

const SYSTEM_HEADERS = new Set([
    'assert.h', 'complex.h', 'ctype.h', 'errno.h', 'fenv.h', 'float.h', 'inttypes.h',
    'iso646.h', 'limits.h', 'locale.h', 'math.h', 'setjmp.h', 'signal.h', 'stdalign.h',
    'stdarg.h', 'stdatomic.h', 'stdbool.h', 'stddef.h', 'stdint.h', 'stdio.h', 'stdlib.h',
    'stdnoreturn.h', 'string.h', 'tgmath.h', 'threads.h', 'time.h', 'uchar.h', 'wchar.h',
    'wctype.h', 'windows.h', 'process.h', 'io.h', 'direct.h', 'unistd.h', 'pthread.h',
    'sys/types.h', 'sys/stat.h', 'sys/time.h', 'sys/wait.h', 'dlfcn.h', 'malloc.h',
    'memory.h', 'alloca.h', 'getopt.h', 'fcntl.h', 'sys/mman.h'
]);

module.exports = {
    FAMILIES, C_FAMILY_EXTS, DATA_EXTS, ALL_CODE_EXTS,
    KEYWORDS, SINK_HINTS, SYSTEM_HEADERS
};
