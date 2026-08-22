# Agent Instructions

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
npm run boardctl -- --help
```

Before declaring completion, run at least:

```bash
npm test
npm run build
```

Report the actual results. Do not claim success from inspection alone.

## `boardctl` usage for reviewer models

Reviewer models must use `boardctl` instead of loading the entire board file into context.

Start a review with:

```bash
npm run boardctl -- validate path/to/design.board.json
npm run boardctl -- pending path/to/design.board.json
```

If discovery is needed:

```bash
npm run boardctl -- overview path/to/design.board.json
npm run boardctl -- search path/to/design.board.json "authentication"
```

Load focused context using one or more space-separated node IDs:

```bash
npm run boardctl -- context path/to/design.board.json n1
npm run boardctl -- context path/to/design.board.json n1 n2 n7
```

Add a review comment:

```bash
npm run boardctl -- comment add path/to/design.board.json n1 --text "Clarify token expiry behavior."
```

For multiline or shell-sensitive content, use a text file:

```bash
npm run boardctl -- comment add path/to/design.board.json n1 --text-file path/to/comment.txt
```

Change comment state:

```bash
npm run boardctl -- comment state path/to/design.board.json c4 ACCEPTED
```

After every pending item has been reviewed, advance the cursor using the exact `throughRevision` returned by `pending`:

```bash
npm run boardctl -- review complete path/to/design.board.json --through 27
```

Add `--pretty` to read commands when human-readable output is useful. Compact JSON is the default.

## Reviewer-model restrictions

- Do not read the entire `board.json` unless `boardctl validate` or another command cannot parse it.
- Do not edit `board.json` directly when `boardctl` is available.
- Do not add, delete, move, resize, or reconnect nodes through the CLI.
- Structural changes must be recommendations in comments; the human applies them in the PWA.
- The CLI may add comments, change comment states, and advance the review cursor only.
- Do not call `review complete` until all changes returned by `pending` have been reviewed.
- Preserve comment history. Closing a comment changes its state; it does not delete it.
- Do not infer meaning from node coordinates alone. Use node text and explicit connector relationships.

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
