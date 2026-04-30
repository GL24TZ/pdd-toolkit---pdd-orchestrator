# PDD (Problem-Driven Development)

*[Lee este documento en Español](README_ES.md)*

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)

**PDD (Problem-Driven Development)** is an advanced code analysis and diagnostic system specifically designed to integrate into **OpenCode** (the community-driven local AI editor). Instead of relying on heuristic reading and AI intuition, PDD equips OpenCode agents with deterministic, graph-based tools to discover, isolate, and document software defects.

This architecture is built to operate within the ecosystem and design principles of **[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)**, created by Alan (Gentleman Programming), sharing its philosophy of autonomous, modular, and responsible workflows.

---

## 🏛️ Architecture & Philosophy

Unlike traditional AI-driven development flows (where the AI immediately jumps to proposing code), PDD enforces a strict diagnostic methodology: **Zero implementation or refactoring proposals until the defect is mathematically isolated and empirically reproduced.**

The system is divided into two main components:

1. **PDD Toolkit (MCP Server):** A multi-language static analysis engine (supporting C, JS, Python, Go, Rust, Java, and more) with zero external dependencies. It parses source code, builds the Abstract Syntax Tree (AST), and generates a Callgraph and dependency graph.
2. **PDD Orchestrator:** A multi-agent system composed of 5 specialized sub-agents (Scope, Analyst, Diagnostician, Validator, Formalizer) natively integrated into the environment.

---

## 🧠 How Does the System Work?

The synergy between analytical tools (Toolkit) and Artificial Intelligence (Orchestrator) allows for deep auditing without suffering from typical AI hallucinations or context bloat.

### 🔍 PDD Toolkit (The Analytical Engine)
A pure JavaScript (Zero-Dependencies) application acting as an **MCP (Model Context Protocol) server**.
- **Isolated Scanning:** Analyzes the entire repository and builds a topological graph (files, functions, calls, global variables).
- **Smart Caching:** The graph is saved in `.pdd/cache/project-graph.json`, allowing instant queries without re-scanning the project on every AI prompt.
- **Focused Queries:** Instead of sending a 2000-line file to the AI, the Toolkit extracts only the necessary context (e.g., `pdd_inspect --focus` extracts a single function, its callers, and direct dependencies, reducing it to a few lines).

### 🤖 PDD Orchestrator (The Diagnostic Director)
The Primary OpenCode Agent in charge of enforcing PDD discipline. Its internal workflow relies on:
- **State Management (Idempotency):** Upon starting an investigation, it creates an isolated "Arena" in `.pdd/investigations/` and saves the progress in `INVESTIGATION_STATE.json`. If interrupted, it can resume exactly where it left off.
- **Anti-Context Bloat:** The orchestrator **never** reads the source code. Its only task is delegating file paths to Sub-agents so they can query the MCP.
- **Strict Diagnostic Pipeline:** It executes 5 inflexible phases using specialized agents (Hidden Sub-agents):
  1. **`pdd-scope`:** Uses the Toolkit to map the code boundaries (what to investigate and what to discard).
  2. **`pdd-analyst`:** Uses the Toolkit to examine memory, variables, and execution threads in the scoped area, looking for contradictions.
  3. **`pdd-diagnostician`:** Uses `pdd_trace` y `pdd_var` to find "Patient Zero" and the causality path of the failure.
  4. **`pdd-validator`:** An agent without analysis tools; its only goal is to compile and create a test (`test_fail.*`) that empirically proves the diagnosed failure.
  5. **`pdd-formalizer`:** Takes the irrefutable evidence and drafts/publishes a formal technical issue.
- **Gate Checks:** Between each phase, the orchestrator validates that the sub-agent has NOT proposed code as a solution. If it has, it rejects the progress and orders the sub-agent to redo the work, remaining purely focused on diagnosis.

---

## 🚀 Installation & OpenCode Integration

To deploy the system in your local environment, clone the repository and run the provisioning script in PowerShell.

What exactly does the installer do?
1. **Injects the MCP:** Copies the `pdd-toolkit` server to the `.config/opencode` folder and automatically registers it in your `opencode.json` file under the `"mcp"` section.
2. **Creates the Orchestrator:** Generates the main "PDD Orchestrator" agent in OpenCode, equipping it with delegative tools and exclusive access to the MCP server.
3. **Deploys the Skills:** Installs the skills (prompts) in the OpenCode `skills` folder so the sub-agents know how to operate sequentially.

```powershell
# Note: The repository folder will be named pdd-toolkit---pdd-orchestrator
git clone https://github.com/GL24TZ/pdd-toolkit---pdd-orchestrator.git
cd pdd-toolkit---pdd-orchestrator
.\install_pdd.ps1
```

---

## 🛠️ Usage & Commands

Once installed, the orchestrator is exposed via built-in commands. These must be executed from the root directory of the project you wish to audit.

### Main Commands
- `/pdd-init`: Initializes the investigation state and runs the baseline scan to build the project graph cache idempotently.
- `/pdd <target>`: Starts the full diagnostic pipeline on a specific file, module, or symptom. The system will sequentially execute the 5 phases until it generates a formal report and a reproducible test case (`test_fail`).

### Lifecycle Management (Interactive Mode)
- `/pdd-status`: Returns the current state machine status of the active investigation and generated artifacts.
- `/pdd-continue`: Strictly advances the execution to the next valid pipeline phase.
- `/pdd-verify`: Audits the integrity of the artifacts generated in the current phase to ensure strict compliance with the framework's constraints (e.g., absence of resolving code).

---

## ⚙️ Tool Specification (MCP Toolkit)

The MCP server exposes the following analytical tools to the orchestrator, equipping it with deterministic deep-analysis capabilities:

| Tool | Description |
| :--- | :--- |
| `pdd_scan` | Builds and caches the topological graph of the project. Executed once at the start of the pipeline. |
| `pdd_inspect` | Extracts the structural context of a file (public API, dependencies, blast radius). |
| `pdd_inspect --focus` | Isolates the execution context of a single function, reducing noise and preventing LLM token bloat. |
| `pdd_query` | Retrieves the topological neighborhood of a function (callers, callees, dangerous sinks). |
| `pdd_trace` | Computes execution paths between two nodes/functions in the graph. |
| `pdd_var` | Traces mutations and data flow of shared global variables. |

---

## 🙏 Acknowledgments

This project was developed as a diagnostic specialization of the workflows proposed in **[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)**. Special thanks to Alan for his enormous contribution to the community and for encouraging the development of modular and responsible architectures for Artificial Intelligence.

---

## 📄 License

Distributed under the MIT License. See the `LICENSE` file for more information.
