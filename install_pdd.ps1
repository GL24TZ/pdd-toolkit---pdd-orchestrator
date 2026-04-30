# PDD System Installer for Gentle-AI / OpenCode
# Deploys orchestrator, sub-agents, skills, and PDD Toolkit MCP server.
# ROBUST VERSION: Handles missing config, invalid mcpServers key, and corrupt JSON.

$ErrorActionPreference = "Stop"

# Helper: loads or creates a valid opencode config object
function Initialize-OpencodeConfig($filePath) {
    $config = $null
    
    if (Test-Path $filePath) {
        # Always backup first
        $backupPath = "$filePath.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Copy-Item -Path $filePath -Destination $backupPath -Force
        Write-Host "  Backup creado: $backupPath" -ForegroundColor DarkGray
        
        try {
            $raw = Get-Content $filePath -Raw -ErrorAction Stop
            $config = $raw | ConvertFrom-Json -ErrorAction Stop
            
            # REPAIR: Remove invalid 'mcpServers' key (from Claude/Cursor configs)
            if ($config.PSObject.Properties['mcpServers']) {
                Write-Host "  [REPAIR] Eliminando clave inválida 'mcpServers'..." -ForegroundColor Yellow
                $config.PSObject.Properties.Remove('mcpServers')
            }
        }
        catch {
            Write-Host "  [WARNING] opencode.json corrupto o ilegible. Se creará estructura nueva..." -ForegroundColor Yellow
            $config = [PSCustomObject]@{}
        }
    }
    else {
        $config = [PSCustomObject]@{}
    }

    # Ensure base structure exists
    if (-not $config.PSObject.Properties['agent']) {
        $config | Add-Member -MemberType NoteProperty -Name 'agent' -Value ([PSCustomObject]@{}) -Force
    }
    if (-not $config.PSObject.Properties['mcp']) {
        $config | Add-Member -MemberType NoteProperty -Name 'mcp' -Value ([PSCustomObject]@{}) -Force
    }

    return $config
}

try {
    $USER_HOME = $env:USERPROFILE
    $OPENCODE_ROOT = "$USER_HOME\.config\opencode"
    $PROJECT_PROMPTS_DIR = "$PSScriptRoot\pdd_system\prompts"
    $PROJECT_SKILLS_DIR = "$PSScriptRoot\pdd_system\skills"
    $PROJECT_TOOLKIT_DIR = "$PSScriptRoot\pdd_system"
    $TARGET_PROMPTS_DIR = "$OPENCODE_ROOT\prompts\pdd"
    $COMMANDS_DIR = "$OPENCODE_ROOT\commands"
    $SKILLS_ROOT = "$OPENCODE_ROOT\skills"
    $PDD_TOOLKIT_DIR = "$OPENCODE_ROOT\pdd-toolkit"

    Write-Host "`n[1/6] Cleaning previous PDD installation..." -ForegroundColor Cyan
    Remove-Item -Path "$COMMANDS_DIR\pdd*.md" -Force -ErrorAction SilentlyContinue
    if (Test-Path $TARGET_PROMPTS_DIR) {
        Remove-Item -Path $TARGET_PROMPTS_DIR -Recurse -Force -ErrorAction SilentlyContinue
    }
    Get-ChildItem -Path $SKILLS_ROOT -Filter "pdd-*" -Directory -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $PDD_TOOLKIT_DIR) {
        Remove-Item -Path $PDD_TOOLKIT_DIR -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host "[2/6] Ensuring directories..." -ForegroundColor Cyan
    foreach ($dir in @($OPENCODE_ROOT, $TARGET_PROMPTS_DIR, $COMMANDS_DIR, $SKILLS_ROOT, $PDD_TOOLKIT_DIR)) {
        if (!(Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }

    Write-Host "[3/6] Deploying PDD Toolkit (MCP server)..." -ForegroundColor Cyan
    Copy-Item -Path "$PROJECT_TOOLKIT_DIR\mcp-server.js" -Destination $PDD_TOOLKIT_DIR -Force
    Copy-Item -Path "$PROJECT_TOOLKIT_DIR\pdd.js" -Destination $PDD_TOOLKIT_DIR -Force
    Copy-Item -Path "$PROJECT_TOOLKIT_DIR\package.json" -Destination $PDD_TOOLKIT_DIR -Force
    
    $targetLib = "$PDD_TOOLKIT_DIR\lib"
    if (!(Test-Path $targetLib)) {
        New-Item -ItemType Directory -Path $targetLib -Force | Out-Null
    }
    Copy-Item -Path "$PROJECT_TOOLKIT_DIR\lib\*.js" -Destination $targetLib -Force
    
    $targetParsers = "$PDD_TOOLKIT_DIR\lib\parsers"
    if (!(Test-Path $targetParsers)) {
        New-Item -ItemType Directory -Path $targetParsers -Force | Out-Null
    }
    Copy-Item -Path "$PROJECT_TOOLKIT_DIR\lib\parsers\*.js" -Destination $targetParsers -Force

    Write-Host "[4/6] Deploying prompts and skills..." -ForegroundColor Cyan
    if (Test-Path $PROJECT_PROMPTS_DIR) {
        Get-ChildItem -Path $PROJECT_PROMPTS_DIR -Filter "pdd-*.md" | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $TARGET_PROMPTS_DIR -Force
        }
    }

    if (Test-Path $PROJECT_SKILLS_DIR) {
        Get-ChildItem -Path $PROJECT_SKILLS_DIR -Directory | ForEach-Object {
            $targetSkillDir = "$SKILLS_ROOT\$($_.Name)"
            if (!(Test-Path $targetSkillDir)) {
                New-Item -ItemType Directory -Path $targetSkillDir -Force | Out-Null
            }
            Copy-Item -Path "$($_.FullName)\*" -Destination $targetSkillDir -Recurse -Force
        }
    }

    Write-Host "[5/6] Registering PDD commands..." -ForegroundColor Cyan
    $Commands = @{
        'pdd-init.md' = @"
---
description: Inicializa entorno PDD y valida estructura de investigaciones.
agent: pdd-orchestrator
---
Actua como orquestador PDD.
1. Asegura que exista `.pdd/investigations/` en la raiz del proyecto.
2. Ejecuta `pdd_scan` con projectRoot `.` para construir el grafo del proyecto.
3. Crea o actualiza estado inicial de investigacion sin duplicar carpetas (idempotente, sin error si ya existe).
4. Responde con estado operativo listo.
"@
        'pdd.md' = @"
---
description: Inicia auditoria PDD para descubrir y formalizar bugs sin proponer fixes.
agent: pdd-orchestrator
---
Inicia pipeline PDD para el siguiente objetivo:

<target>
`$ARGUMENTS
</target>

Modo:
- Si el request es solo ruta/target, usar modo ``auto`` (discovery completo).
- Si el usuario pide revision por fase, usar modo ``interactive``.

Reglas:
1. Ejecutar ``pdd_scan`` con projectRoot ``.`` ANTES de cualquier fase.
2. Crear o reutilizar investigacion activa de forma idempotente.
3. Ejecutar fases en orden: Scope -> Analysis -> Diagnosis -> Validation -> Formalization.
4. Mantener estado de fase y artefactos en INVESTIGATION_STATE.json.
5. No proponer soluciones.
6. En modo auto, NO pausar entre fases: continuar hasta PDD_FINAL_REPORT.md o gate failure duro.
"@
        'pdd-status.md' = @"
---
description: Muestra fase actual y artefactos de la investigacion PDD activa.
agent: pdd-orchestrator
---
Lee INVESTIGATION_STATE.json de la investigacion activa y reporta:
- target
- fase actual
- artefactos disponibles
- siguiente fase valida
- riesgos/gates pendientes
"@
        'pdd-continue.md' = @"
---
description: Avanza exactamente una fase valida del pipeline PDD.
agent: pdd-orchestrator
---
Avanza una sola fase segun INVESTIGATION_STATE.json.
No saltes fases.
Si falta artefacto requerido, devuelve gate failure con ruta exacta faltante.
"@
        'pdd-verify.md' = @"
---
description: Audita consistencia de artefactos y gates de la investigacion PDD activa.
agent: pdd-orchestrator
---
Audita la fase actual y verifica:
- prerequisitos de fase
- artefactos requeridos
- ausencia de propuestas de solucion
- consistencia del estado persistido
"@
    }

    foreach ($cmdName in $Commands.Keys) {
        Set-Content -Path "$COMMANDS_DIR\$cmdName" -Value $Commands[$cmdName] -Encoding UTF8
    }

    Write-Host "[5.5] Registering PDD summary skill..." -ForegroundColor Cyan
    $PDD_SKILL_DIR = "$SKILLS_ROOT\pdd-forensics"
    if (!(Test-Path $PDD_SKILL_DIR)) {
        New-Item -ItemType Directory -Path $PDD_SKILL_DIR -Force | Out-Null
    }
    $PDD_SKILL_CONTENT = @"
# Skill: PDD (Problem-Driven Development) Forensics
## Description
PDD es la contraparte forense de SDD para encontrar, demostrar y formalizar defectos sin proponer soluciones.
## Workflow
1. Scope -> 2. Analysis -> 3. Diagnosis -> 4. Validation -> 5. Formalization.
## PDD Toolkit (MCP)
The ``pdd-toolkit`` MCP server provides forensic code analysis. Available tools:
- ``pdd_scan``: Build project graph (run once at start)
- ``pdd_inspect``: File context (exports, blast radius, critical paths)
- ``pdd_inspect`` with ``focus``: Single function context (~30 lines)
- ``pdd_query``: Function neighborhood (callers, callees, sinks)
- ``pdd_trace``: Execution path between functions
- ``pdd_var``: Global variable traceability
"@
    Set-Content -Path "$PDD_SKILL_DIR\SKILL.md" -Value $PDD_SKILL_CONTENT -Encoding UTF8

    Write-Host "[6/6] Injecting PDD agents + MCP into opencode.json..." -ForegroundColor Cyan
    
    # Tools with MCP access
    $mcpTools = @{ bash = $true; read = $true; write = $true; edit = $true; mcp = $true }
    # Tools without MCP
    $noMcpTools = @{ bash = $true; read = $true; write = $true; edit = $true }

    $SubAgents = @{
        "pdd-scope"         = @{ desc = "PDD Scope Architect"; skills = @("pdd-scoping"); useMcp = $true }
        "pdd-analyst"       = @{ desc = "PDD Forensic Analyst"; skills = @("pdd-code-auditing"); useMcp = $true }
        "pdd-diagnostician" = @{ desc = "PDD Software Pathologist"; skills = @("pdd-root-cause"); useMcp = $true }
        "pdd-validator"     = @{ desc = "PDD Evidence Forge"; skills = @("pdd-adversarial-testing"); useMcp = $false }
        # OPCIÓN 1 (Recomendada): Reporte 100% automático (usa la CLI de GitHub 'gh' sin preguntar).
        "pdd-formalizer"    = @{ desc = "PDD Technical Specifier"; skills = @("pdd-defect-reporting"); useMcp = $false }
        # OPCIÓN 2 (Cautelosa): Requiere que el usuario apruebe manualmente antes de crear el issue en GitHub.
        # Descomenta esta línea y comenta la de arriba si prefieres este modo:
        # "pdd-formalizer"    = @{ desc = "PDD Technical Specifier"; skills = @("pdd-defect-reporting", "github-repo-management"); useMcp = $false }
    }

    $mcpServerPath = "$PDD_TOOLKIT_DIR\mcp-server.js" -replace '\\', '/'

    # Find existing configs or define a default path to create one
    $ConfigFiles = Get-ChildItem -Path $OPENCODE_ROOT -Filter "opencode.json" -Recurse -ErrorAction SilentlyContinue
    if (-not $ConfigFiles) {
        $defaultConfigPath = "$OPENCODE_ROOT\opencode.json"
        Write-Host "  No se encontró opencode.json. Se creará: $defaultConfigPath" -ForegroundColor DarkYellow
        $ConfigFiles = @( [PSCustomObject]@{ FullName = $defaultConfigPath } )
    }

    foreach ($file in $ConfigFiles) {
        Write-Host "  Procesando: $($file.FullName)" -ForegroundColor Gray
        
        # Use robust loader that repairs mcpServers and corrupt JSON
        $json = Initialize-OpencodeConfig -filePath $file.FullName

        # Register MCP server
        $json.mcp | Add-Member -MemberType NoteProperty -Name "pdd-toolkit" -Value @{
            command = @("node", $mcpServerPath)
            enabled = $true
            type = "local"
        } -Force

        # Orchestrator
        $orchValue = @{
            description = "PDD Orchestrator"
            mode = "primary"
            model = "google/gemma-4-31b-it"
            prompt = "{file:./prompts/pdd/pdd-orchestrator.md}"
            tools = @{ bash = $true; delegate = $true; delegation_list = $true; delegation_read = $true; edit = $true; read = $true; write = $true; task = $true; mcp = $true }
            skills = @("pdd-governance")
        }
        $json.agent | Add-Member -MemberType NoteProperty -Name "pdd-orchestrator" -Value $orchValue -Force

        # Sub-agents
        foreach ($agentName in $SubAgents.Keys) {
            $phaseName = $agentName.Replace("pdd-", "")
            $mainSkill = $SubAgents[$agentName].skills[0]
            $inlinePrompt = "You are a PDD executor for the $phaseName phase, not the orchestrator. Do this phase work directly. Do NOT launch sub-agents. Your phase rules are injected in this prompt via your skill. Follow them exactly."

            $agentTools = if ($SubAgents[$agentName].useMcp) { $mcpTools } else { $noMcpTools }

            $subValue = @{
                description = $SubAgents[$agentName].desc
                hidden = $true
                mode = "subagent"
                model = "google/gemma-4-31b-it"
                prompt = $inlinePrompt
                tools = $agentTools
                skills = $SubAgents[$agentName].skills
            }
            $json.agent | Add-Member -MemberType NoteProperty -Name $agentName -Value $subValue -Force
        }

        # Save with UTF8 BOM for maximum compatibility with Windows editors
        $json | ConvertTo-Json -Depth 100 | Set-Content $file.FullName -Encoding UTF8
    }

    Write-Host "`n[SUCCESS] PDD system installed with MCP server." -ForegroundColor Green
    Write-Host "  Toolkit: $PDD_TOOLKIT_DIR" -ForegroundColor Gray
    Write-Host "  MCP: pdd-toolkit (5 tools)" -ForegroundColor Gray
}
catch {
    Write-Host "`n[FATAL ERROR] Installation failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
}
finally {
    Write-Host "`n--------------------------------------------------" -ForegroundColor Gray
    Read-Host "Installation process finished. Press Enter to exit"
}