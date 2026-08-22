# Agent Instructions (Codebase Development)

## Purpose

This repository builds an offline, file-backed whiteboard for asynchronous human–model design review.

Read these files before changing code:

1. `PROMT.md` — controlling product, design, implementation, and acceptance contract. The filename is intentionally spelled `PROMT.md`.
2. `README.md` — user-facing behavior and workflows.
3. Existing source and tests — implementation details that already satisfy the contract.

If these files disagree, follow `PROMT.md`. Do not invent missing product behavior. Ask one focused question only when a contradiction would materially change the result.

## Implementation behavior

- Build the complete MVP described in `PROMT.md`; do not stop after scaffolding.
- Begin by inspecting the repository and writing a short implementation plan.
- Proceed through the plan without waiting for routine confirmation.
- Keep changes inside the defined MVP scope.
- Prefer web-platform APIs, TypeScript, SVG, and small focused modules.
- Do not add React, a backend, a database, cloud storage, authentication, analytics, network calls, Mermaid, image processing, or embedded AI inference.
- Preserve the single-file `board.json` contract.
- Do not silently change the schema or CLI command syntax.
- Treat data-loss and stale-write prevention as correctness requirements, not optional polish.
- Update `README.md` if implementation details change, but do not weaken requirements to match incomplete code.

## Required project commands

The completed repository must provide:

```bash
npm run dev
npm run build
npm test
node bin/boardctl.js --help
```

Before declaring completion, run at least:

```bash
npm test
npm run build
```

Report the actual results. Do not claim success from inspection alone.

## Code quality rules

- Keep the platform-neutral board model separate from browser file APIs and UI code.
- Use stable IDs and deterministic JSON serialization.
- Validate every loaded document and every CLI mutation.
- Unit-test pure board operations and queries.
- Integration-test CLI reads, mutations, validation failures, and conflict failures.
- Test failure states: malformed JSON, unsupported schema, unknown IDs, invalid comment states, revoked file permission, and external file changes.
- Render connectors behind nodes and derive their endpoints from current rectangle geometry.
- Keep pan and zoom state outside `board.json`.
- Never overwrite a disk file after detecting a content-hash mismatch.

## Scope guardrail

The MVP is complete only when all acceptance criteria in `PROMT.md` pass. Work beyond those criteria requires explicit user approval.
