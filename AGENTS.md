# Agent Instructions (Reviewer Models)

## Purpose

This file contains instructions for AI models tasked with reviewing whiteboard designs (the `.board.json` files) created using the Doodleback application.

If you are an AI model assigned to write code for the Doodleback repository itself, please read `DEVELOPMENT.md` instead.

## `boardctl` usage for reviewer models

Reviewer models must use `boardctl` instead of loading the entire board file into context.

Start a review with:

```bash
node bin/boardctl.js validate path/to/design.board.json
node bin/boardctl.js pending path/to/design.board.json
```

If discovery is needed:

```bash
node bin/boardctl.js overview path/to/design.board.json
node bin/boardctl.js search path/to/design.board.json "authentication"
```

Load focused context using one or more space-separated node IDs:

```bash
node bin/boardctl.js context path/to/design.board.json n1
node bin/boardctl.js context path/to/design.board.json n1 n2 n7
```

Add a review comment:

```bash
node bin/boardctl.js comment add path/to/design.board.json n1 --text "Clarify token expiry behavior."
```

For multiline or shell-sensitive content, use a text file:

```bash
node bin/boardctl.js comment add path/to/design.board.json n1 --text-file path/to/comment.txt
```

Change comment state:

```bash
node bin/boardctl.js comment state path/to/design.board.json n1 ACCEPTED
```

After every pending item has been reviewed, advance the cursor using the exact `throughRevision` returned by `pending`:

```bash
node bin/boardctl.js review complete path/to/design.board.json --through 27
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

## Remote Review Workflow (for Reviewer Models)

When a human asks you to review a whiteboard design but you do not have local access to the `boardctl` tooling or the `.board.json` file, you MUST follow this exact manual sync workflow:

1. **Request Approval for Tooling Download**: Inform the user that you need to download the standalone `boardctl.js` executable from the [Doodleback GitHub repository](https://raw.githubusercontent.com/sutharanand17/doodleback/main/bin/boardctl.js) to interact with their whiteboard file. Ask for their explicit approval to proceed.
2. **Download the CLI Tool**: Once approved, use `curl` or a similar terminal command to download the executable: `curl -O https://raw.githubusercontent.com/sutharanand17/doodleback/main/bin/boardctl.js`.
3. **Request the Board File**: Ask the user to upload their local `design.board.json` file into the chat.
4. **Perform the Review**: Run the downloaded script via `node boardctl.js` to review the uploaded file (`validate`, `pending`, `comment add`, `comment state`, etc.) according to the restrictions listed above.
5. **Final Handoff**: When the review is complete, provide the modified `.board.json` file back to the user (or confirm it has been saved if in a shared workspace). You MUST explicitly instruct the user to "click Reload in your Doodleback web app" to see the new comments.
