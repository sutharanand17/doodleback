import { BoardDocument, CommentState, Actor } from './types.js';

const NODE_ID_RE = /^n[1-9][0-9]*$/;
const CONNECTOR_ID_RE = /^e[1-9][0-9]*$/;
const COMMENT_ID_RE = /^c[1-9][0-9]*$/;

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean';
}

function isActor(val: unknown): val is Actor {
  return val === 'human' || val === 'model';
}

function isCommentState(val: unknown): val is CommentState {
  return ['OPEN', 'ACCEPTED', 'APPLIED', 'CLOSED', 'REJECTED', 'DEFERRED'].includes(val as string);
}

function extractIdNumber(id: string): number {
  return parseInt(id.slice(1), 10);
}

export function validateBoard(data: unknown): BoardDocument {
  if (!isObject(data)) {
    throw new Error('Board must be a JSON object');
  }

  if (data.schemaVersion !== 1) {
    throw new Error('Unsupported schemaVersion. Must be 1');
  }

  if (!isString(data.documentId)) throw new Error('Invalid documentId');
  if (!isNumber(data.revision) || data.revision < 0) throw new Error('Invalid revision');
  if (!isString(data.modifiedAt)) throw new Error('Invalid modifiedAt');
  if (!isActor(data.modifiedBy)) throw new Error('Invalid modifiedBy');
  if (!isNumber(data.lastReviewedRevision) || data.lastReviewedRevision < 0 || data.lastReviewedRevision > data.revision) {
    throw new Error('Invalid lastReviewedRevision');
  }

  if (!isObject(data.nextIds)) throw new Error('Invalid nextIds');
  const nextIds = data.nextIds as any;
  if (!isNumber(nextIds.node) || nextIds.node < 1) throw new Error('Invalid nextIds.node');
  if (!isNumber(nextIds.connector) || nextIds.connector < 1) throw new Error('Invalid nextIds.connector');
  if (!isNumber(nextIds.comment) || nextIds.comment < 1) throw new Error('Invalid nextIds.comment');

  if (!isObject(data.nodes)) throw new Error('Invalid nodes collection');
  if (!isObject(data.connectors)) throw new Error('Invalid connectors collection');
  if (!isObject(data.comments)) throw new Error('Invalid comments collection');

  const nodes = data.nodes as Record<string, any>;
  const connectors = data.connectors as Record<string, any>;
  const comments = data.comments as Record<string, any>;

  let maxNodeId = 0;
  let maxConnectorId = 0;
  let maxCommentId = 0;

  for (const [id, node] of Object.entries(nodes)) {
    if (!NODE_ID_RE.test(id)) throw new Error(`Invalid node ID: ${id}`);
    maxNodeId = Math.max(maxNodeId, extractIdNumber(id));

    if (!isObject(node)) throw new Error(`Node ${id} is not an object`);
    if (typeof node.text !== 'string') throw new Error('Node text must be string');
    if (node.commentState !== undefined && !['OPEN', 'ACCEPTED', 'APPLIED', 'CLOSED', 'REJECTED', 'DEFERRED'].includes(node.commentState)) {
      throw new Error('Invalid node commentState');
    }
    if (typeof node.deleted !== 'boolean') throw new Error('Node deleted must be boolean');
    if (node.type !== 'rectangle') throw new Error(`Node ${id} invalid type`);
    if (!isNumber(node.x) || !isNumber(node.y)) throw new Error(`Node ${id} invalid coordinates`);
    if (!isNumber(node.width) || node.width <= 0) throw new Error(`Node ${id} invalid width`);
    if (!isNumber(node.height) || node.height <= 0) throw new Error(`Node ${id} invalid height`);
    if (!isNumber(node.zIndex)) throw new Error(`Node ${id} invalid zIndex`);

    validateRevision(node, data.revision, `Node ${id}`);
  }

  for (const [id, connector] of Object.entries(connectors)) {
    if (!CONNECTOR_ID_RE.test(id)) throw new Error(`Invalid connector ID: ${id}`);
    maxConnectorId = Math.max(maxConnectorId, extractIdNumber(id));

    if (!isObject(connector)) throw new Error(`Connector ${id} is not an object`);
    if (!isString(connector.sourceNodeId) || !nodes[connector.sourceNodeId]) {
      throw new Error(`Connector ${id} references unknown sourceNodeId`);
    }
    if (!isString(connector.targetNodeId) || !nodes[connector.targetNodeId]) {
      throw new Error(`Connector ${id} references unknown targetNodeId`);
    }
    if (connector.sourceNodeId === connector.targetNodeId) {
      throw new Error(`Connector ${id} is a self-connector`);
    }
    if (!isBoolean(connector.deleted)) throw new Error(`Connector ${id} invalid deleted flag`);

    validateRevision(connector, data.revision, `Connector ${id}`);
  }

  for (const [id, comment] of Object.entries(comments)) {
    if (!COMMENT_ID_RE.test(id)) throw new Error(`Invalid comment ID: ${id}`);
    maxCommentId = Math.max(maxCommentId, extractIdNumber(id));

    if (!isObject(comment)) throw new Error(`Comment ${id} is not an object`);
    if (!isString(comment.nodeId) || !nodes[comment.nodeId]) {
      throw new Error(`Comment ${id} references unknown nodeId`);
    }
    if (typeof comment.author !== 'string') throw new Error('Comment author must be string');
    if (typeof comment.text !== 'string') throw new Error('Comment text must be string');
    if (typeof comment.createdAt !== 'string') throw new Error('Comment createdAt must be string');
    if (!isString(comment.updatedAt)) throw new Error(`Comment ${id} invalid updatedAt`);

    validateRevision(comment, data.revision, `Comment ${id}`);
  }

  if (nextIds.node <= maxNodeId) throw new Error('nextIds.node is too small');
  if (nextIds.connector <= maxConnectorId) throw new Error('nextIds.connector is too small');
  if (nextIds.comment <= maxCommentId) throw new Error('nextIds.comment is too small');

  return data as unknown as BoardDocument;
}

function validateRevision(record: any, documentRevision: number, prefix: string) {
  if (!isNumber(record.createdRevision) || record.createdRevision < 0) {
    throw new Error(`${prefix} invalid createdRevision`);
  }
  if (!isNumber(record.updatedRevision) || record.updatedRevision < 0) {
    throw new Error(`${prefix} invalid updatedRevision`);
  }
  if (!isActor(record.updatedBy)) {
    throw new Error(`${prefix} invalid updatedBy`);
  }
  if (record.createdRevision > record.updatedRevision) {
    throw new Error(`${prefix} createdRevision > updatedRevision`);
  }
  if (record.updatedRevision > documentRevision) {
    throw new Error(`${prefix} updatedRevision > document.revision`);
  }
}
