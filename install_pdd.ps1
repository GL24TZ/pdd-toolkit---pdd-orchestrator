# PDD System Installer for Gentle-AI / OpenCode
# INLINE VERSION: Prompts read from .md files and injected into JSON for 100% agent obedience
#Requires -Version 5.1

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$script:McpToolValue = $true

#region Helper Functions

function Confirm-SafePath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "SafePath check failed: path is null or empty."
    }
    $resolved = Resolve-Path $Path -ErrorAction SilentlyContinue
    $normalized = if ($resolved) { $resolved.Path } else { $Path }
    if ($normalized -eq $env:USERPROFILE -or $normalized -eq ($env:USERPROFILE + '\')) {
        throw "SafePath check failed: refusing to operate directly on USERPROFILE root."
    }
    return $Path
}

function Set-OpencodeProperty {
    param([object]$Parent, [string]$Name,[object]$Value)
    if ($Parent.PSObject.Properties.Match($Name).Count -gt 0) {
        $Parent.PSObject.Properties.Remove($Name)
    }
    $Parent | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
}

function Initialize-OpencodeConfig {
    param([string]$FilePath)
    $config = $null
    if (Test-Path $FilePath) {
        $backupPath = "$FilePath.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Copy-Item -Path $FilePath -Destination $backupPath -Force
        Write-Host "  Backup created: $backupPath" -ForegroundColor DarkGray
        try {
            $raw = [System.IO.File]::ReadAllText($FilePath)
            $config = $raw | ConvertFrom-Json -ErrorAction Stop
            if ($config.PSObject.Properties['mcpServers']) {
                $config.PSObject.Properties.Remove('mcpServers')
            }
        }
        catch {
            Write-Host "  [WARNING] Corrupted opencode.json. Creating fresh structure..." -ForegroundColor Yellow
            $config = [PSCustomObject]@{}
        }
    }
    else {
        $config = [PSCustomObject]@{}
    }
    if (-not $config.PSObject.Properties['agent']) {
        $config | Add-Member -MemberType NoteProperty -Name 'agent' -Value ([PSCustomObject]@{}) -Force
    }
    if (-not $config.PSObject.Properties['mcp']) {
        $config | Add-Member -MemberType NoteProperty -Name 'mcp' -Value ([PSCustomObject]@{}) -Force
    }
    return $config
}

function Save-OpencodeConfig {
    param([string]$FilePath, [object]$Config)
    $json = $Config | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText($FilePath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Copy-SourceFiles {
    param([string]$Source, [string]$Destination, [string]$Filter = "*")
    if (-not (Test-Path $Source)) { return }
    $items = Get-ChildItem -Path $Source -Filter $Filter -ErrorAction SilentlyContinue
    if (-not $items) { return }
    Copy-Item -Path "$Source\$Filter" -Destination $Destination -Force
}

#endregion

try {
    # --- Prerequisites ---
    if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
        throw "Prerequisite missing: 'node' is not in PATH."
    }

    $ghPath = Get-Command "gh" -ErrorAction SilentlyContinue
    if ($ghPath) {
        Write-Host "  GitHub CLI (gh) found: $($ghPath.Source)" -ForegroundColor Green
    }
    else {
        Write-Host "  [WARNING] GitHub CLI 'gh' not found. pdd-formalizer won't create issues automatically." -ForegroundColor Yellow
    }

    # --- Paths ---
    $USER_HOME = $env:USERPROFILE
    $OPENCODE_ROOT = Confirm-SafePath "$USER_HOME\.config\opencode"
    $PROJECT_PROMPTS_DIR = "$PSScriptRoot\pdd_system\prompts"
    $PROJECT_SKILLS_DIR = "$PSScriptRoot\pdd_system\skills"
    $PROJECT_TOOLKIT_DIR = "$PSScriptRoot\pdd_system"
    $TARGET_PROMPTS_DIR = "$OPENCODE_ROOT\prompts\pdd"
    $COMMANDS_DIR = "$OPENCODE_ROOT\commands"
    $SKILLS_ROOT = "$OPENCODE_ROOT\skills"
    $PDD_TOOLKIT_DIR = "$OPENCODE_ROOT\pdd-toolkit"

    # --- 1. Clean ---
    Write-Host "`n[1/7] Cleaning previous PDD installation..." -ForegroundColor Cyan
    $cleanPatterns = @("$COMMANDS_DIR\pdd*.md", $TARGET_PROMPTS_DIR, "$SKILLS_ROOT\pdd-*", $PDD_TOOLKIT_DIR)
    foreach ($pat in $cleanPatterns) {
        $resolved = Resolve-Path $pat -ErrorAction SilentlyContinue
        if ($resolved) {
            foreach ($r in $resolved) {
                $safe = Confirm-SafePath $r.Path
                Remove-Item -Path $safe -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    # --- 2. Ensure dirs ---
    Write-Host "[2/7] Ensuring directories..." -ForegroundColor Cyan
    @($OPENCODE_ROOT, $TARGET_PROMPTS_DIR, $COMMANDS_DIR, $SKILLS_ROOT, $PDD_TOOLKIT_DIR,
      "$PDD_TOOLKIT_DIR\lib", "$PDD_TOOLKIT_DIR\lib\parsers") |
        ForEach-Object { if (!(Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null } }

    # --- 3. Deploy Toolkit ---
    Write-Host "[3/7] Deploying PDD Toolkit (MCP server)..." -ForegroundColor Cyan
    foreach ($f in @("mcp-server.js", "pdd.js", "package.json")) {
        $src = Join-Path $PROJECT_TOOLKIT_DIR $f
        if (-not (Test-Path $src)) { throw "Required toolkit file missing: $src" }
        Copy-Item -Path $src -Destination $PDD_TOOLKIT_DIR -Force
    }
    Copy-SourceFiles -Source "$PROJECT_TOOLKIT_DIR\lib" -Destination "$PDD_TOOLKIT_DIR\lib" -Filter "*.js"
    Copy-SourceFiles -Source "$PROJECT_TOOLKIT_DIR\lib\parsers" -Destination "$PDD_TOOLKIT_DIR\lib\parsers" -Filter "*.js"

    $mcpServerPath = "$PDD_TOOLKIT_DIR\mcp-server.js" -replace '\\', '/'

    # --- 4. Prompts & Skills ---
    Write-Host "[4/7] Deploying prompts and skills..." -ForegroundColor Cyan
    if (Test-Path $PROJECT_PROMPTS_DIR) {
        Get-ChildItem -Path $PROJECT_PROMPTS_DIR -Filter "pdd-*.md" | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $TARGET_PROMPTS_DIR -Force
        }
    }
    if (Test-Path $PROJECT_SKILLS_DIR) {
        Get-ChildItem -Path $PROJECT_SKILLS_DIR -Directory | ForEach-Object {
            $targetSkillDir = "$SKILLS_ROOT\$($_.Name)"
            if (!(Test-Path $targetSkillDir)) { New-Item -ItemType Directory -Path $targetSkillDir -Force | Out-Null }
            Copy-Item -Path "$($_.FullName)\*" -Destination $targetSkillDir -Recurse -Force
        }
    }

    # --- 5. Commands ---
    Write-Host "[5/7] Registering PDD commands..." -ForegroundColor Cyan
    $Commands = @{
        'pdd-init.md' = "--`ndescription: Inicializa entorno PDD y valida estructura de investigaciones.`nagent: pdd-orchestrator`n---`nActua como orquestador PDD.`n1. Asegura que exista `.pdd/investigations/` en la raiz del proyecto.`n2. Ejecuta `pdd_scan` con projectRoot `.` para construir el grafo del proyecto.`n3. Crea o actualiza estado inicial de investigacion sin duplicar carpetas.`n4. Responde con estado operativo listo."
        'pdd.md' = "--`ndescription: Inicia auditoria PDD para descubrir y formalizar bugs sin proponer fixes.`nagent: pdd-orchestrator`n---`nInicia pipeline PDD para el siguiente objetivo:`n`n<target>`n`$ARGUMENTS`n</target>`n`nModo:`n- Si el request es solo ruta/target, usar modo `auto`.`n- Si el usuario pide revision por fase, usar modo `interactive`.`n`nReglas:`n1. Ejecutar `pdd_scan` con projectRoot `.` ANTES de cualquier fase.`n2. Crear o reutilizar investigacion activa de forma idempotente.`n3. Ejecutar fases en orden: Scope -> Analysis -> Diagnosis -> Validation -> Formalization.`n4. Mantener estado de fase y artefactos en INVESTIGATION_STATE.json.`n5. No proponer soluciones.`n6. En modo auto, NO pausar entre fases."
        'pdd-status.md' = "--`ndescription: Muestra fase actual y artefactos de la investigacion PDD activa.`nagent: pdd-orchestrator`n---`nLee INVESTIGATION_STATE.json de la investigacion activa y reporta:`n- target`n- fase actual`n- artefactos disponibles`n- siguiente fase valida`n- riesgos/gates pendientes"
        'pdd-continue.md' = "--`ndescription: Avanza exactamente una fase valida del pipeline PDD.`nagent: pdd-orchestrator`n---`nAvanza una sola fase segun INVESTIGATION_STATE.json.`nNo saltes fases.`nSi falta artefacto requerido, devuelve gate failure con ruta exacta faltante."
        'pdd-verify.md' = "--`ndescription: Audita consistencia de artefactos y gates de la investigacion PDD activa.`nagent: pdd-orchestrator`n---`nAudita la fase actual y verifica:`n- prerequisitos de fase`n- artefactos requeridos`n- ausencia de propuestas de solucion`n- consistencia del estado persistido"
        'pdd-retry-validation.md' = "--`ndescription: Relanza un validador de reemplazo tras un fallo de infraestructura en modo strict.`nagent: pdd-orchestrator`n---`nSolo usar si la fase de validacion esta en estado stalled_infra.`n1. Delega un nuevo validador (ej. Validator C) aislado.`n2. Evalua si logra completar el par requerido para avanzar.`n3. Si lo logra, actualiza confianza a dual-proven y avanza."
        'pdd-degrade.md' = "--`ndescription: Fuerza el avance de una investigacion strict estancada degradando la confianza.`nagent: pdd-orchestrator`n---`nSolo usar si la fase de validacion esta en estado stalled_infra.`n1. Fuerza el avance a la Formalizacion usando la unica evidencia valida.`n2. Actualiza JSON a mode=strict-degraded y confidence=single-source.`n3. No inicia nuevos validadores."
    }
    foreach ($cmdName in $Commands.Keys) {
        Set-Content -Path "$COMMANDS_DIR\$cmdName" -Value $Commands[$cmdName] -Encoding UTF8
    }

    # --- 5.5 Skill ---
    Write-Host "[5.5/7] Registering PDD summary skill..." -ForegroundColor Cyan
    $PDD_SKILL_DIR = "$SKILLS_ROOT\pdd-forensics"
    if (!(Test-Path $PDD_SKILL_DIR)) { New-Item -ItemType Directory -Path $PDD_SKILL_DIR -Force | Out-Null }
    $PDD_SKILL_CONTENT = "# Skill: PDD (Problem-Driven Development) Forensics`n## Description`nPDD es la contraparte forense de SDD para encontrar, demostrar y formalizar defectos sin proponer soluciones.`n## Workflow`n1. Scope -> 2. Analysis -> 3. Diagnosis -> 4. Validation -> 5. Formalization.`n## PDD Toolkit (MCP)`nThe `pdd-toolkit` MCP server provides forensic code analysis. Available tools:`n- `pdd_scan`: Build project graph`n- `pdd_inspect`: File context`n- `pdd_query`: Function neighborhood`n- `pdd_trace`: Execution path`n- `pdd_var`: Global variable traceability"
    Set-Content -Path "$PDD_SKILL_DIR\SKILL.md" -Value $PDD_SKILL_CONTENT -Encoding UTF8

    # --- 6. Config injection ---
    Write-Host "[6/7] Injecting PDD agents + MCP into opencode.json..." -ForegroundColor Cyan

    $mcpTools = @{ bash = $true; read = $true; write = $true; edit = $true; mcp = $script:McpToolValue }
    $noMcpTools = @{ bash = $true; read = $true; write = $true; edit = $true }

    $SubAgents = @(
        @{ Name = "pdd-scope";         Desc = "PDD Scope Architect";       UseMcp = $true  },
        @{ Name = "pdd-analyst";       Desc = "PDD Forensic Analyst";      UseMcp = $true  },
        @{ Name = "pdd-diagnostician"; Desc = "PDD Technical Pathologist"; UseMcp = $true  },
        @{ Name = "pdd-validator";     Desc = "PDD Adversarial Validator"; UseMcp = $false },
        @{ Name = "pdd-formalizer";    Desc = "PDD Defect Formalizer";     UseMcp = $false }
    )

    foreach ($def in $SubAgents) {
        $promptFile = Join-Path $PROJECT_PROMPTS_DIR "$($def['Name']).md"
        if (-not (Test-Path $promptFile)) { throw "Falta el archivo de prompt: $promptFile" }
    }
    $orchPromptFile = Join-Path $PROJECT_PROMPTS_DIR "pdd-orchestrator.md"
    if (-not (Test-Path $orchPromptFile)) { throw "Falta el archivo de prompt: $orchPromptFile" }

    $configPath = "$OPENCODE_ROOT\opencode.json"
    $json = Initialize-OpencodeConfig -FilePath $configPath

    # Register MCP server
    Set-OpencodeProperty -Parent $json.mcp -Name "pdd-toolkit" -Value @{
        command = @("node", $mcpServerPath)
        enabled = $true
        type = "local"
    }

    $orchPromptText = [System.IO.File]::ReadAllText($orchPromptFile)

    # ====================================================================
    # ORQUESTADOR: SOLO DELEGATE, SIN TASK, SIN PERMISSION BLOCK
    # ====================================================================
    Set-OpencodeProperty -Parent $json.agent -Name "pdd-orchestrator" -Value @{
        description = "PDD Orchestrator"
        mode = "primary"
        model = "google/gemma-4-31b-it"
        prompt = $orchPromptText
        tools = @{ 
            bash = $true
            delegate = $true
            delegation_list = $true
            delegation_read = $true
            read = $true
            write = $true
            mcp = $script:McpToolValue
        }
        skills = @("pdd-governance")
    }

    # Register subagents with INLINE prompts read from disk
    foreach ($def in $SubAgents) {
        $promptFile = Join-Path $PROJECT_PROMPTS_DIR "$($def['Name']).md"
        $promptText = [System.IO.File]::ReadAllText($promptFile)
        
        $agentTools = if ($def['UseMcp']) { $mcpTools } else { $noMcpTools }
        
        Set-OpencodeProperty -Parent $json.agent -Name $def['Name'] -Value @{
            description = $def['Desc']
            hidden = $true
            mode = "subagent"
            model = "google/gemma-4-31b-it"
            prompt = $promptText
            tools = $agentTools
        }
    }

    Save-OpencodeConfig -FilePath $configPath -Config $json

    Write-Host "`n[SUCCESS] PDD system installed successfully." -ForegroundColor Green
}
catch {
    Write-Host "`n[FATAL ERROR] Installation failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    Write-Host "`n--------------------------------------------------" -ForegroundColor Gray
    if ([Environment]::UserInteractive -and -not $env:CI -and -not $env:GITHUB_ACTIONS) {
        Read-Host "Installation process finished. Press Enter to exit"
    }
}