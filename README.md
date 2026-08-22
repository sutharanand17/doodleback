# Doodleback

Doodleback is a minimal, local-first canvas for drafting system ideas and reviewing them asynchronously with an external AI model. Humans work visually; the model reads focused text through a local CLI. Both operate on one portable JSON file.

## Why it exists

Long Markdown design documents are token-efficient for models but cumbersome for free-form thinking. Image-based whiteboards are pleasant for humans but require repeated image interpretation. This tool keeps a visual whiteboard and a compact semantic representation together without screenshots, cloud services, or a model-specific integration.

## MVP capabilities

- Create, move, resize, edit, and soft-delete rectangular nodes.
- Add straight connectors that remain attached when nodes move.
- Add chat-style Markdown comments with thread-level lifecycle states.
- Show the number of comments in a color-coded node badge (Blue = Open, Green = Resolved, Grey = Muted).
- Pan, zoom, and fit large diagrams to the viewport.
- Open, save, reload, and save copies of `.board.json` files.
- Optionally autosave after a short debounce.
- Detect external edits before writing and prevent stale overwrites.
- Run completely offline after installation and dependency setup.
- Let an external model inspect focused context and add comments through `boardctl`.

## Deliberate limitations

The MVP does not include freehand drawing, images, rich text, colors or shape palettes, arrowheads, elbow connectors, connector labels, auto-layout, real-time collaboration, automatic conflict merging, cloud storage, user accounts, a backend, or direct model invocation.

## User workflow

1. Open or create a board in the installed PWA.
2. Double-click empty canvas space to create a rectangle and type its text.
3. Move or resize rectangles as needed.
4. Select a rectangle and drag its connector handle onto another rectangle.
5. Click a comment badge to open the comment panel.
6. Save manually or enable debounced autosave.
7. Allow an external model to review the saved file through `boardctl`.
8. Reload the board to see the model’s comments.
9. Apply accepted recommendations visually and repeat.

## Model-review workflow

The external model does not need to scan the full file. `boardctl` reads it locally and returns compact JSON.

```bash
node bin/boardctl.js pending design.board.json
node bin/boardctl.js context design.board.json n1 n4
node bin/boardctl.js comment add design.board.json n1 --text "Clarify the failure path."
node bin/boardctl.js review complete design.board.json --through 12
```

Use `overview` when the model does not yet know node IDs:

```bash
node bin/boardctl.js overview design.board.json --pretty
```

The first line of node text is its short label in CLI summaries.

## Thread states

Comments are organized into chat-style threads attached to nodes. The overall state belongs to the *node thread* (not individual comments) and can be one of the following:

- `OPEN` — awaiting a decision or action.
- `ACCEPTED` — recommendation approved.
- `APPLIED` — approved change has been made.
- `CLOSED` — outcome verified and complete.
- `REJECTED` — recommendation declined.
- `DEFERRED` — intentionally postponed.

State-transition rules are not enforced in the MVP.

## File safety

When a file is loaded, the PWA stores a SHA-256 hash of its exact contents in memory. Before every save it reads the disk file again and compares hashes.

- If the hash matches, the PWA increments the document revision and writes.
- If the hash differs, autosave pauses and the app offers only **Reload from disk** or **Save as Copy**.
- No automatic merge is attempted.

The file modification time may be used as a quick hint, but the content hash is authoritative. Browser writes are completed only after the writable stream closes.

## Offline boundary

The PWA, board files, and `boardctl` operate locally and make no network calls. Development dependencies must be installed once. After the production PWA is installed and cached, visual editing works offline. The external reviewing model must itself be available locally if the entire review workflow must remain disconnected.

## Browser support

The target is current desktop Google Chrome. Microsoft Edge may work because it supports the same File System Access API, but it is not an MVP acceptance target. Unsupported browsers must show a clear message instead of silently falling back to downloads.

## Development

The implementation uses TypeScript, SVG, Vite, and no UI framework.

```bash
npm install
npm run dev
npm test
npm run build
```

Run the model-facing CLI with:

```bash
node bin/boardctl.js --help
```

The complete product, architecture, schema, UI reference, CLI contract, and acceptance criteria are specified in [`PROMT.md`](./PROMT.md). Reviewer-agent rules are in [`AGENTS.md`](./AGENTS.md), while codebase development rules are in [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## Privacy

- Board content remains in user-selected local files.
- The PWA does not transmit board content.
- No analytics or telemetry are permitted.
- A model sees only the content returned by explicitly run `boardctl` commands.
