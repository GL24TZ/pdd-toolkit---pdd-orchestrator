# PDD (Problem-Driven Development)

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)

**PDD (Problem-Driven Development)** es un sistema avanzado de análisis y diagnóstico de código diseñado **específicamente para integrarse en OpenCode** (el editor de IA local impulsado por la comunidad). En lugar de depender de la lectura heurística y la intuición de la IA, PDD dota a los agentes de OpenCode de herramientas deterministas basadas en grafos para descubrir, aislar y documentar defectos de software.

Esta arquitectura está construida para operar dentro del ecosistema y los principios de diseño de **[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)**, creado por Alan (Gentleman Programming), compartiendo su filosofía de flujos de trabajo autónomos, modulares y responsables.

---

## 🏛️ Arquitectura y Filosofía

A diferencia de los flujos de desarrollo tradicionales impulsados por IA (donde la IA salta inmediatamente a proponer código), PDD impone una metodología de diagnóstico estricta: **Cero propuestas de implementación o refactorización hasta que el defecto esté matemáticamente aislado y reproducido empíricamente.**

El sistema se divide en dos componentes principales:

1. **PDD Toolkit (Servidor MCP):** Un motor de análisis estático multi-lenguaje (con soporte para C, JS, Python, Go, Rust, Java, entre otros) sin dependencias externas. Se encarga de parsear el código fuente, construir el Árbol de Sintaxis Abstracta (AST) y generar un grafo de llamadas (Callgraph) y de dependencias.
2. **PDD Orchestrator:** Un sistema multi-agente compuesto por 5 sub-agentes especializados (Scope, Analyst, Diagnostician, Validator, Formalizer) integrados nativamente en el entorno.

---

## 🧠 ¿Cómo funciona el Sistema?

La sinergia entre las herramientas analíticas (Toolkit) y la Inteligencia Artificial (Orchestrator) permite una auditoría profunda sin sufrir los típicos problemas de alucinaciones o desbordamiento de contexto (context bloat).

### 🔍 PDD Toolkit (El Motor Analítico)
Es una aplicación JavaScript pura (Zero-Dependencies) que funciona como un **servidor MCP (Model Context Protocol)**. 
- **Escaneo Aislado:** Analiza todo el repositorio y construye un grafo topológico (archivos, funciones, llamadas, variables globales).
- **Caché Inteligente:** El grafo se guarda en `.pdd/cache/project-graph.json`, lo que permite consultas instantáneas sin tener que re-escanear el proyecto en cada mensaje de la IA.
- **Consultas Focalizadas:** En lugar de enviar un archivo de 2000 líneas a la IA, el Toolkit extrae únicamente el contexto necesario (ej. `pdd_inspect --focus` extrae solo una función, sus callers y dependencias directas, reduciéndolo a unas pocas líneas).

### 🤖 PDD Orchestrator (El Director de Auditoría)
Es el Agente Principal de OpenCode encargado de hacer cumplir la disciplina PDD. Su funcionamiento interno se basa en:
- **Gestión de Estado (Idempotencia):** Al iniciar una investigación, crea una "Arena" aislada en `.pdd/investigations/` y guarda el progreso en `INVESTIGATION_STATE.json`. Si el proceso se interrumpe, puede retomarlo exactamente donde se quedó.
- **Anti-Context Bloat:** El orquestador **nunca** lee el código fuente. Su única tarea es delegar las rutas de los archivos a los Subagentes para que estos consulten al MCP.
- **Pipeline de Diagnóstico Estricto:** Ejecuta 5 fases inflexibles utilizando agentes especializados (Subagentes ocultos):
  1. **`pdd-scope`:** Usa el Toolkit para trazar las fronteras del código (qué se va a investigar y qué se descarta).
  2. **`pdd-analyst`:** Usa el Toolkit para examinar la memoria, variables e hilos de ejecución en el área de alcance, buscando contradicciones.
  3. **`pdd-diagnostician`:** Usa `pdd_trace` y `pdd_var` para encontrar el "Paciente Cero" y la ruta de causalidad del fallo.
  4. **`pdd-validator`:** Un agente sin acceso a herramientas de análisis; su único objetivo es compilar y crear un test (`test_fail.*`) que demuestre empíricamente el fallo diagnosticado.
  5. **`pdd-formalizer`:** Toma las evidencias irrefutables y redacta/publica un issue técnico formal.
- **Gate Checks (Barreras de Control):** Entre cada fase, el orquestador valida que el subagente NO haya propuesto código como solución. Si lo hace, rechaza el progreso y le ordena rehacer su trabajo manteniéndose puramente enfocado en el diagnóstico.

---

## 🚀 Instalación y Vínculo con OpenCode

Para desplegar el sistema en su entorno local, clone el repositorio y ejecute el script de aprovisionamiento en PowerShell. 

¿Qué hace exactamente el instalador?
1. **Inyecta el MCP:** Copia el servidor `pdd-toolkit` a la carpeta `.config/opencode` y lo registra automáticamente en tu archivo `opencode.json` bajo la sección `"mcp"`.
2. **Crea al Orquestador:** Genera el agente principal "PDD Orchestrator" en OpenCode, dotándolo de herramientas delegativas y acceso exclusivo al servidor MCP.
3. **Despliega las Skills:** Instala las habilidades forenses (prompts) en la carpeta de `skills` de OpenCode para que los subagentes sepan cómo operar.

```powershell
# Nota: La carpeta del repositorio se llamará pdd-toolkit---pdd-orchestrator
git clone https://github.com/GL24TZ/pdd-toolkit---pdd-orchestrator.git
cd pdd-toolkit---pdd-orchestrator
.\install_pdd.ps1
```

---

## 🛠️ Uso y Comandos

Una vez instalado, el orquestador se expone a través de comandos integrados. Deben ejecutarse desde el directorio raíz del proyecto que se desea auditar.

### Comandos Principales
- `/pdd-init`: Inicializa el estado de la investigación y ejecuta el escaneo base para construir el caché del grafo del proyecto de manera idempotente.
- `/pdd <target>`: Inicia el pipeline de diagnóstico completo sobre un archivo, módulo o síntoma específico. El sistema ejecutará las 5 fases de forma secuencial hasta generar un reporte formal y un caso de prueba reproducible (`test_fail`).

### Gestión del Ciclo de Vida (Modo Interactivo)
- `/pdd-status`: Retorna el estado actual de la máquina de estados de la investigación activa y los artefactos generados.
- `/pdd-continue`: Avanza la ejecución de manera estricta hacia la siguiente fase válida del pipeline.
- `/pdd-verify`: Audita la integridad de los artefactos generados en la fase actual para asegurar el estricto cumplimiento de las restricciones (ej. ausencia de código resolutivo).

---

## ⚙️ Especificación de Herramientas (MCP Toolkit)

El servidor MCP expone las siguientes herramientas analíticas al orquestador, dotándolo de capacidades de análisis profundo deterministas:

| Herramienta | Descripción |
| :--- | :--- |
| `pdd_scan` | Construye y cachea el grafo topológico del proyecto. Se ejecuta una vez al inicio del pipeline. |
| `pdd_inspect` | Extrae el contexto estructural de un archivo (API pública, dependencias, radio de impacto). |
| `pdd_inspect --focus` | Aísla el contexto de ejecución de una única función, reduciendo el ruido y previniendo el desbordamiento de tokens del LLM. |
| `pdd_query` | Recupera el vecindario topológico de una función (callers, callees, sinks peligrosos). |
| `pdd_trace` | Computa los caminos de ejecución (execution paths) entre dos nodos/funciones del grafo. |
| `pdd_var` | Traza las mutaciones y el flujo de datos de variables globales compartidas. |

---

## 🙏 Agradecimientos

Este proyecto fue desarrollado como una especialización de diagnóstico de los flujos de trabajo propuestos en **[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)**. Un agradecimiento especial a Alan por su enorme contribución a la comunidad y por fomentar el desarrollo de arquitecturas modulares y responsables para la Inteligencia Artificial.

---

## 📄 Licencia

Distribuido bajo la licencia MIT. Consulte el archivo `LICENSE` para más información.
