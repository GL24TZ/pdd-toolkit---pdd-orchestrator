# Skill: PDD Governance & Flow

## Supreme Rules
1. Absolute ban on solutions.
2. Investigation isolation under `.pdd/investigations/<active-folder>/`.
3. Strict order: Scope -> Analysis -> Diagnosis -> Validation -> Formalization.
4. No phase skipping.

## Execution Modes
- `auto`: full discovery and verification pipeline without manual pauses.
- `interactive`: pause after each phase and wait for user confirmation.

Mode defaults:
- Path/target-only requests -> `auto`.
- Symptom-driven guided requests -> `interactive` unless user asks `auto`.

## Deterministic PDD Chain
1. PDD-SCOPE -> `SCOPE.md`
2. PDD-ANALYST -> `ANALYSIS.md`
3. PDD-DIAGNOSTICIAN -> `DIAGNOSIS.md`
4. PDD-VALIDATOR -> `test_fail.*`
5. PDD-FORMALIZER -> `PDD_FINAL_REPORT.md`

## Gate Policy
- Missing required input artifact -> block immediately with explicit missing path.
- Any fix proposal in artifacts -> reject output and fail gate.

## Discovery Policy
When no explicit symptom is provided:
- Scope phase must derive candidate risks from code/architecture/logs/platform assumptions.
- Include functional, design, and cross-platform risk hypotheses.

## State Policy
Maintain `.pdd/investigations/<active-folder>/INVESTIGATION_STATE.json` with:
- target
- mode
- current phase
- artifact map
- phase status

Use this state for `/pdd-status` and `/pdd-continue`.
