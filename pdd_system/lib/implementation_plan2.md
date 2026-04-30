# Integración PDD MCP en Orquestador + Sub-agentes

## Contexto

PDD Toolkit ya funciona como MCP server (`mcp-server.js`). Ahora hay que:
1. Que el instalador lo despliegue y registre como MCP en OpenCode
2. Que el orquestador y sub-agentes lo usen en vez de leer código manualmente

## Diagnóstico del Estado Actual

### Qué tiene el instalador (`install_pdd.ps1`)
- ✅ Copia prompts a `~/.config/opencode/prompts/pdd/`
- ✅ Copia skills a `~/.config/opencode/skills/pdd-*/`
- ✅ Registra comandos en `~/.config/opencode/commands/`
- ✅ Inyecta agentes en `opencode.json` (orquestador + 5 sub-agentes)
- ❌ **NO despliega `pdd_system/` en una ubicación fija**
- ❌ **NO registra MCP server en `opencode.json`**

### Qué hacen los sub-agentes actualmente
| Agente | Fase | Cómo obtiene contexto del código |
|---|---|---|
| `pdd-scope` | 1. Scope | Lee archivos directamente con `read` tool |
| `pdd-analyst` | 2. Analysis | Lee archivos directamente con `read` tool |
| `pdd-diagnostician` | 3. Diagnosis | Lee `ANALYSIS.md` |
| `pdd-validator` | 4. Validation | Crea tests en la carpeta de investigación |
| `pdd-formalizer` | 5. Formalization | Lee todos los artefactos previos |

> [!IMPORTANT]
> Los agentes de Scope y Analysis son los que MÁS se benefician del MCP — en vez de leer archivos de código a ciegas, usan `pdd_inspect` para obtener contexto forense compacto.

## Proposed Changes

---

### 1. Instalador

#### [MODIFY] install_pdd.ps1

**Cambios:**

**A) Desplegar `pdd_system/` en ubicación fija:**
```
$PDD_TOOLKIT_DIR = "$OPENCODE_ROOT\pdd-toolkit"
```
Copiar todo `pdd_system/` (excepto backups, `.pdd/cache/`) a esa ruta.

**B) Registrar MCP server en `opencode.json`:**
Inyectar en la sección `mcpServers`:
```json
{
  "mcpServers": {
    "pdd-toolkit": {
      "command": "node",
      "args": ["~/.config/opencode/pdd-toolkit/mcp-server.js"]
    }
  }
}
```

**C) Dar acceso MCP a los agentes que lo necesitan:**
Agregar `"mcp": true` al `tools` del orquestador y sub-agentes relevantes:
- `pdd-orchestrator`: `mcp: true` (para `pdd_scan`)
- `pdd-scope`: `mcp: true` (para `pdd_inspect`)
- `pdd-analyst`: `mcp: true` (para `pdd_inspect --focus`)
- `pdd-diagnostician`: `mcp: true` (para `pdd_query`, `pdd_trace`)
- `pdd-validator`: NO necesita MCP (crea tests, no analiza grafos)
- `pdd-formalizer`: NO necesita MCP (lee artefactos PDD)

---

### 2. Orquestador

#### [MODIFY] prompts/pdd-orchestrator.md

Agregar sección de integración MCP al prompt del orquestador:

```markdown
## PDD TOOLKIT INTEGRATION (MCP)
The MCP server `pdd-toolkit` provides forensic code analysis tools.
At pipeline start, run `pdd_scan` once to build the project graph.
Pass the graph-aware context to phase agents via investigation state.

Tool usage:
- `pdd_scan`: Run ONCE at pipeline start with the target's source root.
- `pdd_inspect`: Use in Scope phase to understand file structure.
- `pdd_inspect` with `focus`: Use in Analysis phase for function-level context.
- `pdd_query`: Use in Diagnosis phase to trace function relationships.
- `pdd_trace`: Use in Diagnosis phase to verify execution paths.
- `pdd_var`: Use in Diagnosis phase to trace variable flow.

RULE: Always scan BEFORE delegating to phase agents.
RULE: Pass `projectRoot` to sub-agents via investigation state so they can call MCP tools.
```

---

### 3. Sub-agente Skills

#### [MODIFY] skills/pdd-scoping/SKILL.md

Agregar instrucción MCP al scope specialist:

```markdown
## PDD TOOLKIT USAGE
Before defining boundaries, use MCP tools to understand the target:
1. `pdd_inspect` on the target file → understand exports, blast radius, siblings
2. Use EXPORTS list to identify critical public API functions
3. Use SIBLINGS to identify coupled files that should be in-scope
4. Use BLAST_RADIUS to define out-of-scope boundaries

This replaces manual file reading for initial reconnaissance.
```

#### [MODIFY] skills/pdd-code-auditing/SKILL.md

Agregar instrucción MCP al analyst:

```markdown
## PDD TOOLKIT USAGE
For each file/function in scope:
1. `pdd_inspect` with `focus` on suspect functions → get callers, callees, critical paths
2. Use CRITICAL_PATHS to identify memory/sync risks
3. Use GLOBALS_TOUCHED to identify shared state risks
4. Use CALLERS to understand blast radius of potential defects

This provides evidence-backed context without reading entire files.
```

#### [MODIFY] skills/pdd-root-cause/SKILL.md

Agregar instrucción MCP al diagnostician:

```markdown
## PDD TOOLKIT USAGE
To isolate root cause:
1. `pdd_trace` from suspect function to dangerous sinks (malloc, free, mutex_lock)
2. `pdd_var` on shared variables to find concurrent access patterns
3. `pdd_query` on Patient Zero candidate to see full neighborhood

This provides deterministic causality evidence.
```

---

### 4. NO se modifican

- `skills/pdd-adversarial-testing/SKILL.md` — Validator crea tests, no analiza grafos
- `skills/pdd-defect-reporting/SKILL.md` — Formalizer lee artefactos PDD, no código
- `skills/pdd-governance/SKILL.md` — Governance rules, no necesita tools
- `lib/` — Capa compartida intacta
- `pdd.js` — CLI intacto
- `mcp-server.js` — Ya implementado y testeado

## Open Questions

> [!IMPORTANT]
> **Ruta del toolkit**: El instalador copia `pdd_system/` a `~/.config/opencode/pdd-toolkit/`. ¿Preferís otra ubicación? ¿O que el MCP apunte al directorio original donde tenés el repo?

> [!IMPORTANT]
> **`projectRoot` en auto mode**: Cuando el orquestador recibe `/pdd src/midi_banks/midi_banks.c`, tiene que deducir el `projectRoot`. ¿Usamos la misma lógica de `findProjectRoot()` que ya tiene `pdd.js` (busca `CMakeLists.txt`, `package.json`, `.git`, etc.), o el orquestador debería pasar siempre la raíz explícita?

## Verification Plan

### Checklist de Verificación

```
[ ] 1. install_pdd.ps1 copia pdd_system/ a ~/.config/opencode/pdd-toolkit/
[ ] 2. install_pdd.ps1 registra mcpServers.pdd-toolkit en opencode.json
[ ] 3. install_pdd.ps1 agrega mcp:true a orquestador y sub-agentes relevantes
[ ] 4. pdd-orchestrator.md tiene sección de integración MCP
[ ] 5. pdd-scoping/SKILL.md instruye usar pdd_inspect
[ ] 6. pdd-code-auditing/SKILL.md instruye usar pdd_inspect --focus
[ ] 7. pdd-root-cause/SKILL.md instruye usar pdd_trace y pdd_var
[ ] 8. MCP server arranca sin error desde la ruta desplegada
[ ] 9. tools/list devuelve 5 tools
[ ] 10. pdd_scan funciona con un proyecto real
[ ] 11. pdd_inspect con focus devuelve output compacto
[ ] 12. CLI sigue funcionando sin cambios
[ ] 13. Validator y Formalizer NO tienen acceso MCP (no lo necesitan)
```

### Test End-to-End
1. Ejecutar `install_pdd.ps1` en máquina limpia
2. Verificar que `~/.config/opencode/pdd-toolkit/mcp-server.js` existe
3. Verificar que `opencode.json` tiene `mcpServers.pdd-toolkit`
4. Abrir OpenCode y ejecutar `/pdd src/chord_engine/chord_engine.c`
5. Verificar que el orquestador llama `pdd_scan` y luego delega a scope con contexto MCP
