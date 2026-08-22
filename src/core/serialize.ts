import { BoardDocument, BoardNode, BoardConnector, BoardComment } from './types.js';

function extractIdNumber(id: string): number {
  return parseInt(id.slice(1), 10);
}

function sortKeysByNaturalId<T>(obj: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  const keys = Object.keys(obj).sort((a, b) => {
    return extractIdNumber(a) - extractIdNumber(b);
  });
  for (const k of keys) {
    sorted[k] = obj[k];
  }
  return sorted;
}

const nodeKeys = ['type', 'x', 'y', 'width', 'height', 'zIndex', 'text', 'commentState', 'deleted', 'createdRevision', 'updatedRevision', 'updatedBy'];
const connectorKeys = ['sourceNodeId', 'targetNodeId', 'deleted', 'createdRevision', 'updatedRevision', 'updatedBy'];
const commentKeys = ['nodeId', 'author', 'text', 'createdAt', 'updatedAt', 'createdRevision', 'updatedRevision', 'updatedBy'];

function serializeNode(node: BoardNode): Record<string, any> {
  return {
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    zIndex: node.zIndex,
    text: node.text,
    commentState: node.commentState,
    deleted: node.deleted,
    createdRevision: node.createdRevision,
    updatedRevision: node.updatedRevision,
    updatedBy: node.updatedBy,
  };
}

function serializeConnector(connector: BoardConnector): Record<string, any> {
  return {
    sourceNodeId: connector.sourceNodeId,
    targetNodeId: connector.targetNodeId,
    deleted: connector.deleted,
    createdRevision: connector.createdRevision,
    updatedRevision: connector.updatedRevision,
    updatedBy: connector.updatedBy,
  };
}

function serializeComment(comment: BoardComment): Record<string, any> {
  return {
    nodeId: comment.nodeId,
    author: comment.author,
    text: comment.text,
    state: comment.state,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    createdRevision: comment.createdRevision,
    updatedRevision: comment.updatedRevision,
    updatedBy: comment.updatedBy,
  };
}

export function serializeBoard(board: BoardDocument): string {
  const nodes = sortKeysByNaturalId(board.nodes);
  const connectors = sortKeysByNaturalId(board.connectors);
  const comments = sortKeysByNaturalId(board.comments);

  const orderedNodes: Record<string, any> = {};
  for (const [id, node] of Object.entries(nodes)) {
    orderedNodes[id] = serializeNode(node);
  }

  const orderedConnectors: Record<string, any> = {};
  for (const [id, conn] of Object.entries(connectors)) {
    orderedConnectors[id] = serializeConnector(conn);
  }

  const orderedComments: Record<string, any> = {};
  for (const [id, comm] of Object.entries(comments)) {
    orderedComments[id] = serializeComment(comm);
  }

  const orderedBoard = {
    schemaVersion: board.schemaVersion,
    documentId: board.documentId,
    revision: board.revision,
    modifiedAt: board.modifiedAt,
    modifiedBy: board.modifiedBy,
    lastReviewedRevision: board.lastReviewedRevision,
    nextIds: {
      node: board.nextIds.node,
      connector: board.nextIds.connector,
      comment: board.nextIds.comment,
    },
    nodes: orderedNodes,
    connectors: orderedConnectors,
    comments: orderedComments,
  };

  return JSON.stringify(orderedBoard, null, 2) + '\n';
}
