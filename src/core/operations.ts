import { BoardDocument, BoardNode, Actor } from './types.js';

export function createEmptyBoard(): BoardDocument {
  return {
    schemaVersion: 1,
    documentId: crypto.randomUUID(),
    revision: 0,
    modifiedAt: new Date().toISOString(),
    modifiedBy: 'human',
    lastReviewedRevision: 0,
    nextIds: { node: 1, connector: 1, comment: 1 },
    nodes: {},
    connectors: {},
    comments: {},
  };
}

export function bumpRevision(board: BoardDocument, actor: Actor): number {
  board.revision += 1;
  board.modifiedAt = new Date().toISOString();
  board.modifiedBy = actor;
  return board.revision;
}

// -----------------------------------------------------------------------------
// Human Batch Mutations (PWA)
// -----------------------------------------------------------------------------

export function addNode(board: BoardDocument, node: Omit<BoardNode, 'createdRevision' | 'updatedRevision' | 'updatedBy'>): string {
  const id = `n${board.nextIds.node++}`;
  board.nodes[id] = {
    ...node,
    createdRevision: -1, // placeholder, replaced on commit
    updatedRevision: -1,
    updatedBy: 'human',
  };
  return id;
}

export function updateNode(board: BoardDocument, id: string, updates: Partial<Pick<BoardNode, 'x' | 'y' | 'width' | 'height' | 'zIndex' | 'text' | 'deleted' | 'commentState' | 'type'>>) {
  if (!board.nodes[id]) throw new Error(`Node ${id} not found`);
  Object.assign(board.nodes[id], updates);
}

export function addConnector(board: BoardDocument, sourceNodeId: string, targetNodeId: string): string {
  if (!board.nodes[sourceNodeId] || !board.nodes[targetNodeId]) throw new Error('Unknown nodes');
  if (sourceNodeId === targetNodeId) throw new Error('Self connector');
  
  // check for existing active connector
  for (const conn of Object.values(board.connectors)) {
    if (!conn.deleted && 
        ((conn.sourceNodeId === sourceNodeId && conn.targetNodeId === targetNodeId) ||
         (conn.sourceNodeId === targetNodeId && conn.targetNodeId === sourceNodeId))) {
      throw new Error('Duplicate connector');
    }
  }

  const id = `e${board.nextIds.connector++}`;
  board.connectors[id] = {
    sourceNodeId,
    targetNodeId,
    deleted: false,
    createdRevision: -1,
    updatedRevision: -1,
    updatedBy: 'human',
  };
  return id;
}

export function markConnectorDeleted(board: BoardDocument, id: string) {
  if (board.connectors[id]) {
    board.connectors[id].deleted = true;
  }
}

// Applies uncommitted human changes to a new revision
export function commitHumanChanges(board: BoardDocument, dirtyRecordIds: { nodes: Set<string>, connectors: Set<string>, comments: Set<string> }): boolean {
  if (dirtyRecordIds.nodes.size === 0 && dirtyRecordIds.connectors.size === 0 && dirtyRecordIds.comments.size === 0) {
    return false; // No changes
  }

  const nextRevision = board.revision + 1;
  board.revision = nextRevision;
  board.modifiedBy = 'human';
  board.modifiedAt = new Date().toISOString();

  const processRecord = (record: any) => {
    if (record.createdRevision === -1) {
      record.createdRevision = nextRevision;
    }
    record.updatedRevision = nextRevision;
    record.updatedBy = 'human';
  };

  for (const id of dirtyRecordIds.nodes) {
    if (board.nodes[id]) processRecord(board.nodes[id]);
  }
  for (const id of dirtyRecordIds.connectors) {
    if (board.connectors[id]) processRecord(board.connectors[id]);
  }
  for (const id of dirtyRecordIds.comments) {
    if (board.comments[id]) processRecord(board.comments[id]);
  }

  return true;
}


// -----------------------------------------------------------------------------
// Shared/CLI Mutations (Immediate Revision Increment)
// -----------------------------------------------------------------------------

export function addComment(board: BoardDocument, nodeId: string, text: string, author: Actor): string {
  if (!board.nodes[nodeId]) throw new Error(`Node ${nodeId} not found`);
  const id = `c${board.nextIds.comment++}`;
  const now = new Date().toISOString();
  
  board.comments[id] = {
    nodeId,
    author,
    text,
    createdAt: now,
    updatedAt: now,
    createdRevision: board.revision,
    updatedRevision: board.revision,
    updatedBy: author,
  };
  board.revision++;
  return id;
}

export function completeReview(board: BoardDocument, throughRevision: number) {
  if (throughRevision < board.lastReviewedRevision) throw new Error('Cannot review backwards');
  if (throughRevision > board.revision) throw new Error('Cannot review future revisions');
  bumpRevision(board, 'model');
  board.lastReviewedRevision = throughRevision;
}
