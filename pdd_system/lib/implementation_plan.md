# PDD Toolkit → MCP Server

Convertir PDD Toolkit en un servidor MCP (Model Context Protocol) para que orquestadores y sub-agentes puedan usarlo como herramienta programática, manteniendo el CLI intacto.

## Arquitectura

```
pdd_system/
├── pdd.js              ← CLI (NO SE TOCA)
├── mcp-server.js       ← [NEW] Entry point MCP (stdio)
├── package.json        ← [MODIFY] Agregar dependencias MCP + script
├── lib/                ← Capa compartida (NO CAMBIA)
│   ├── config.js
│   ├── utils.js
│   ├── scanner.js      ← scan()
│   ├── analysis.js     ← findPaths(), findVarTrace()
│   ├── inspect.js      ← inspectFile(), inspectFileFocused()
│   ├── output.js       ← toGroupedFunc()
│   └── parsers/
└── .pdd/cache/         ← Cache de grafos (compartido CLI y MCP)
```

> [!IMPORTANT]
> `pdd.js` (CLI) NO se modifica. `mcp-server.js` es un nuevo entry point que importa la misma `lib/`. Ambos coexisten.

## Principio de Diseño (Filosofía Gentle-AI)

La filosofía de gentle-ai aplicada al MCP:
1. **Cada herramienta hace UNA cosa** — no hay un mega-tool que haga todo
2. **El orquestador decide el flujo** — el MCP solo expone datos, no toma decisiones
3. **Cero estado mutable** — cada llamada es independiente (stateless)
4. **El grafo se cachea en disco** — evitar re-escanear en cada tool call
5. **Output optimizado para IA** — texto estructurado, no JSON pesado

## Dependencias

```bash
npm install @modelcontextprotocol/sdk zod
```

Solo 2 dependencias. `zod` es requerido por el SDK para validar schemas de entrada.

## Proposed Changes

---

### MCP Server

#### [NEW] mcp-server.js

Entry point del servidor MCP. Comunicación via **stdio** (JSON-RPC 2.0).

**Responsabilidades:**
- Inicializar `McpServer` con nombre `pdd-toolkit` y versión `1.0.0`
- Registrar 5 tools (ver schemas abajo)
- Conectar con `StdioServerTransport`
- Todo logging va a `stderr` (nunca `stdout`, que es para JSON-RPC)

**Graph caching strategy:**
- El grafo se guarda en `<projectRoot>/.pdd/cache/project-graph.json`
- Cada tool recibe `projectRoot` como parámetro obligatorio
- Si el grafo existe en cache, se usa. Si no, se genera con `scan()`
- Tool `pdd_scan` siempre fuerza re-generación

---

### 5 Tools MCP

#### Tool 1: `pdd_scan`

Escanea un directorio y genera/actualiza el grafo.

```
Input:
  projectRoot: string (obligatorio) — Ruta al directorio de código fuente
  
Output:
  text — Confirmación con métricas (archivos, funciones, calls, tamaño KB)
```

#### Tool 2: `pdd_inspect`

Contexto completo de un archivo o foco en una función.

```
Input:
  projectRoot: string (obligatorio)
  file: string (obligatorio) — Ruta relativa al archivo (ej: "src/midi_banks/midi_banks.c")
  focus: string (opcional) — Nombre de función para modo focalizado

Output:
  text — Output de inspectFile() o inspectFileFocused()
```

#### Tool 3: `pdd_query`

Vecindario global de una función (callers, callees, sinks).

```
Input:
  projectRoot: string (obligatorio)
  func: string (obligatorio) — Nombre de la función

Output:
  text — Output de toGroupedFunc()
```

#### Tool 4: `pdd_trace`

Camino de ejecución entre dos funciones.

```
Input:
  projectRoot: string (obligatorio)
  from: string (obligatorio) — Función origen
  to: string (obligatorio) — Función destino
  maxDepth: number (opcional, default 25)

Output:
  text — Rutas encontradas o NO_PATH
```

#### Tool 5: `pdd_var`

Trazabilidad de una variable global.

```
Input:
  projectRoot: string (obligatorio)
  name: string (obligatorio) — Nombre de la variable

Output:
  text — Declaración, touches y flow paths
```

---

### Package.json

#### [MODIFY] package.json

```json
{
  "name": "pdd-toolkit",
  "version": "1.0.0",
  "description": "Multi-language code analysis toolkit for AI agents",
  "main": "pdd.js",
  "type": "commonjs",
  "scripts": {
    "start": "node pdd.js",
    "mcp": "node mcp-server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  }
}
```

---

### Configuración del Cliente MCP

Para que un IDE/agente use el MCP, se configura así:

```json
{
  "mcpServers": {
    "pdd-toolkit": {
      "command": "node",
      "args": ["C:/ruta/a/pdd_system/mcp-server.js"]
    }
  }
}
```

No requiere parámetros de conexión — usa stdio.

## Verification Plan

### Automated Tests

1. **Verificar que el MCP server arranca sin error:**
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node mcp-server.js
   ```

2. **Verificar que lista las 5 tools:**
   ```bash
   npx @modelcontextprotocol/inspector node mcp-server.js
   ```

3. **Verificar que `pdd_inspect` con `--focus` funciona via MCP:**
   - Llamar `pdd_scan` con projectRoot del motor
   - Llamar `pdd_inspect` con file + focus
   - Verificar que el output es idéntico al CLI

4. **Verificar que el CLI sigue funcionando:**
   ```bash
   node pdd.js inspect src/chord_engine/chord_engine.c --focus chord_engine_create
   ```

### Manual Verification
- Configurar el MCP en un IDE (Cursor/Claude/Gemini) y verificar que las tools aparecen y se pueden invocar
