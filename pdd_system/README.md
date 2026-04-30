# PDD Toolkit

Herramienta de análisis de código multi-lenguaje para agentes de IA.  
Soporta: **C, C++, JS, TS, Python, Go, Java, C#, Rust, Ruby, PHP, Swift**

## Requisitos
- Node.js 16+
- No requiere dependencias externas

## Comandos

### 1. `scan` — Construir el grafo del proyecto
```bash
node pdd.js scan <directorio> --output graph.json
```
Escanea el proyecto y genera un JSON con funciones, dependencias, callgraph y globals.

> **Tip:** Apuntá al directorio de código fuente (`src/`) para evitar escanear backups o builds. Acepta barras `/` y `\`.

### 2. `inspect` — Contexto completo de un archivo
```bash
node pdd.js inspect <archivo> [graph.json]
```
Devuelve: EXPORTS, INTERNALS, BLAST_RADIUS, SIBLINGS, GLOBALS, CRITICAL_PATHS y ACTION_REQUIRED.

### 3. `inspect --focus` — Foco en una función ⭐
```bash
node pdd.js inspect <archivo> --focus <funcion> [graph.json]
```
Muestra solo el vecindario de UNA función dentro del archivo:
- Scope (EXPORT/INTERNAL) y regla asociada
- Callers agrupados por módulo
- Callees (internas y externas)
- Globals que toca esa función
- Critical paths desde esa función
- Siblings relevantes

> Reduce el contexto enviado a la IA de ~200 líneas a ~30 líneas, preservando restricciones críticas (signatures, mutexes, alloc/free).

> Si la función no existe, sugiere nombres similares dentro del archivo.

### 4. `query` — Vecindario global de una función
```bash
node pdd.js query <funcion> graph.json
```
Callers, callees, touches y paths a sinks. Vista topológica (grafo global).

### 5. `trace` — Camino de ejecución A → B
```bash
node pdd.js trace <desde> <hasta> graph.json [--max-depth N]
```

### 6. `var` — Trazabilidad de variable global
```bash
node pdd.js var <nombre> graph.json
```

> **Nota:** `query`, `trace` y `var` requieren un grafo existente (generado con `scan`). `inspect` puede auto-generarlo si no existe.

## ¿Cuándo usar cada comando?

| Situación | Comando |
|---|---|
| "Voy a trabajar en `mb_dispatch`" | `inspect --focus mb_dispatch` |
| "Necesito entender todo `midi_banks.c`" | `inspect` (sin --focus) |
| "¿Quién llama a `chord_engine_create`?" | `query chord_engine_create` |
| "¿Hay camino de `engine_init` a `free`?" | `trace engine_init free` |
| "¿Quién toca la variable `write_mutex`?" | `var write_mutex` |

## Ejemplo: `inspect --focus`

```
=== INSPECT: midi_banks/midi_banks.c (focus: mb_dispatch) ===
FOCUS: mb_dispatch @ 276-741 [EXPORT]
RULE: Signature frozen. Body is safe to modify.

CALLERS (34):
- engine/: sync_ports_thread_func, dispatch_action, engine_action_set_active_sub_bank... (+31 more)

CALLS:
  Internal: internal_register_port, internal_unregister_port, internal_silence_outputs...
  External: platform_mutex_lock, memcpy, strncpy...

GLOBALS_TOUCHED (58): feedback, action, result, write_mutex, active_state_idx...

CRITICAL_PATHS:
- mb_dispatch > platform_mutex_lock
- mb_dispatch > internal_prune_unused_ports > calloc
- mb_dispatch > internal_prune_unused_ports > free

ACTION:
- 34 callers depend on signature. Do NOT change params/return.
- Memory/sync risk: platform_mutex_lock, calloc, free, memcpy
=== END_INSPECT ===
```

## Estructura
```
pdd_system/
├── pdd.js              ← CLI
├── lib/
│   ├── config.js       ← Constantes
│   ├── utils.js        ← Utilidades compartidas
│   ├── scanner.js      ← scan() + parser registry
│   ├── analysis.js     ← Análisis de grafos
│   ├── inspect.js      ← inspectFile() + inspectFileFocused()
│   ├── output.js       ← Formateadores
│   └── parsers/
│       ├── c.js        ← C/C++
│       ├── brace.js    ← JS/Go/Java/C#/Rust/PHP/Swift
│       ├── python.js   ← Python
│       ├── ruby.js     ← Ruby
│       └── deps.js     ← Dependencias multi-lenguaje
```

## Agregar un lenguaje nuevo

1. Crear `lib/parsers/nuevo.js` exportando `extractFunctions` y opcionalmente `extractGlobals`
2. Agregar la familia en `lib/config.js` → `FAMILIES`
3. Registrar el parser en `lib/scanner.js` → `PARSERS`
