import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { validateBoard } from '../src/core/schema.js';
import { serializeBoard } from '../src/core/serialize.js';
import { getOverview, getPendingChanges, getContext, searchNodes } from '../src/core/queries.js';
import { addComment, completeReview } from '../src/core/operations.js';
import { CommentState } from '../src/core/types.js';

function printHelp() {
  console.log(`
Usage: node boardctl.js COMMAND FILE [ARGS] [--pretty]

Commands:
  validate FILE                       Validate the board JSON.
  overview FILE                       Print root counts and active nodes.
  pending FILE                        Print pending human-authored changes.
  context FILE NODE_ID [NODE_ID ...]  Print full selected nodes and anchored data.
  search FILE QUERY                   Search active node text.
  comment add FILE NODE_ID --text "T" Add a comment to a node.
  comment add FILE NODE_ID --text-file P Add a comment from a file.
  comment state FILE NODE_ID STATE Change node comment state.
  review complete FILE --through N    Advance the review cursor to revision N.
  `);
}

function computeHash(content: string) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function loadAndValidate(file: string) {
  const content = await fs.promises.readFile(file, 'utf-8');
  const baseHash = computeHash(content);
  const data = JSON.parse(content);
  const board = validateBoard(data);
  return { board, baseHash, content };
}

async function writeSafely(file: string, baseHash: string, newBoardStr: string) {
  const currentContent = await fs.promises.readFile(file, 'utf-8');
  if (computeHash(currentContent) !== baseHash) {
    throw new Error('Conflict: File was modified externally.');
  }

  const dir = path.dirname(file);
  const tempFile = path.join(dir, `.tmp-${crypto.randomUUID()}`);
  
  try {
    await fs.promises.writeFile(tempFile, newBoardStr, 'utf-8');
    await fs.promises.rename(tempFile, file);
  } catch (err) {
    if (fs.existsSync(tempFile)) {
      await fs.promises.unlink(tempFile);
    }
    throw err;
  }
}

function output(data: any, pretty: boolean) {
  if (pretty) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data));
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const pretty = args.includes('--pretty');
  const cleanArgs = args.filter((a: string) => a !== '--pretty');
  
  const cmd = cleanArgs[0];

  try {
    if (cmd === 'validate') {
      const file = cleanArgs[1];
      if (!file) throw new Error('Missing file argument');
      const { board } = await loadAndValidate(file);
      output({ valid: true, documentId: board.documentId, revision: board.revision }, pretty);

    } else if (cmd === 'overview') {
      const file = cleanArgs[1];
      if (!file) throw new Error('Missing file argument');
      const { board } = await loadAndValidate(file);
      output(getOverview(board), pretty);

    } else if (cmd === 'pending') {
      const file = cleanArgs[1];
      if (!file) throw new Error('Missing file argument');
      const { board } = await loadAndValidate(file);
      const changes = getPendingChanges(board);
      output({
        fromRevision: board.lastReviewedRevision,
        throughRevision: board.revision,
        changes
      }, pretty);

    } else if (cmd === 'context') {
      const file = cleanArgs[1];
      const nodeIds = cleanArgs.slice(2);
      if (!file || nodeIds.length === 0) throw new Error('Missing file or NODE_ID arguments');
      const { board } = await loadAndValidate(file);
      output(getContext(board, nodeIds), pretty);

    } else if (cmd === 'search') {
      const file = cleanArgs[1];
      const query = cleanArgs[2];
      if (!file || !query) throw new Error('Missing file or QUERY arguments');
      const { board } = await loadAndValidate(file);
      output(searchNodes(board, query), pretty);

    } else if (cmd === 'comment') {
      const subCmd = cleanArgs[1];
      const file = cleanArgs[2];
      
      if (subCmd === 'add') {
        const nodeId = cleanArgs[3];
        const textFlagIdx = cleanArgs.findIndex((a: string) => a === '--text');
        const fileFlagIdx = cleanArgs.findIndex((a: string) => a === '--text-file');
        
        let text = '';
        if (textFlagIdx !== -1) {
          text = cleanArgs[textFlagIdx + 1];
        } else if (fileFlagIdx !== -1) {
          const txtFile = cleanArgs[fileFlagIdx + 1];
          text = await fs.promises.readFile(txtFile, 'utf-8');
        } else {
          throw new Error('Missing --text or --text-file');
        }
        
        const { board, baseHash } = await loadAndValidate(file);
        const commentId = addComment(board, nodeId, text, 'model');
        const newBoardStr = serializeBoard(board);
        // validate again
        validateBoard(JSON.parse(newBoardStr));
        await writeSafely(file, baseHash, newBoardStr);
        output({ commentId, revision: board.revision }, pretty);
        
      } else if (subCmd === 'state') {
        const nodeId = cleanArgs[3];
        const state = cleanArgs[4] as CommentState;
        if (!nodeId || !state) throw new Error('Missing NODE_ID or STATE');
        
        const { board, baseHash } = await loadAndValidate(file);
        if (!board.nodes[nodeId]) throw new Error('Node not found');
        
        board.revision++;
        board.modifiedAt = new Date().toISOString();
        board.modifiedBy = 'model';
        
        board.nodes[nodeId].commentState = state;
        board.nodes[nodeId].updatedRevision = board.revision;
        board.nodes[nodeId].updatedBy = 'model';
        
        const newBoardStr = serializeBoard(board);
        validateBoard(JSON.parse(newBoardStr));
        await writeSafely(file, baseHash, newBoardStr);
        output({ nodeId, revision: board.revision }, pretty);
        
      } else {
        throw new Error(`Unknown comment sub-command: ${subCmd}`);
      }

    } else if (cmd === 'review') {
      const subCmd = cleanArgs[1];
      if (subCmd !== 'complete') throw new Error(`Unknown review sub-command: ${subCmd}`);
      
      const file = cleanArgs[2];
      const throughIdx = cleanArgs.findIndex((a: string) => a === '--through');
      if (throughIdx === -1) throw new Error('Missing --through');
      const through = parseInt(cleanArgs[throughIdx + 1], 10);
      
      const { board, baseHash } = await loadAndValidate(file);
      const oldLast = board.lastReviewedRevision;
      completeReview(board, through);
      const newBoardStr = serializeBoard(board);
      validateBoard(JSON.parse(newBoardStr));
      await writeSafely(file, baseHash, newBoardStr);
      output({ oldCursor: oldLast, newCursor: board.lastReviewedRevision, revision: board.revision }, pretty);
      
    } else {
      throw new Error(`Unknown command: ${cmd}`);
    }
    
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
