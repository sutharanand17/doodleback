// tools/boardctl.ts
import * as fs from "fs";
import * as path from "path";
import * as crypto2 from "crypto";

// src/core/schema.ts
var NODE_ID_RE = /^n[1-9][0-9]*$/;
var CONNECTOR_ID_RE = /^e[1-9][0-9]*$/;
var COMMENT_ID_RE = /^c[1-9][0-9]*$/;
function isObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
function isNumber(val) {
  return typeof val === "number" && Number.isFinite(val);
}
function isString(val) {
  return typeof val === "string";
}
function isBoolean(val) {
  return typeof val === "boolean";
}
function isActor(val) {
  return val === "human" || val === "model";
}
function extractIdNumber(id) {
  return parseInt(id.slice(1), 10);
}
function validateBoard(data) {
  if (!isObject(data)) {
    throw new Error("Board must be a JSON object");
  }
  if (data.schemaVersion !== 1) {
    throw new Error("Unsupported schemaVersion. Must be 1");
  }
  if (!isString(data.documentId)) throw new Error("Invalid documentId");
  if (!isNumber(data.revision) || data.revision < 0) throw new Error("Invalid revision");
  if (!isString(data.modifiedAt)) throw new Error("Invalid modifiedAt");
  if (!isActor(data.modifiedBy)) throw new Error("Invalid modifiedBy");
  if (!isNumber(data.lastReviewedRevision) || data.lastReviewedRevision < 0 || data.lastReviewedRevision > data.revision) {
    throw new Error("Invalid lastReviewedRevision");
  }
  if (!isObject(data.nextIds)) throw new Error("Invalid nextIds");
  const nextIds = data.nextIds;
  if (!isNumber(nextIds.node) || nextIds.node < 1) throw new Error("Invalid nextIds.node");
  if (!isNumber(nextIds.connector) || nextIds.connector < 1) throw new Error("Invalid nextIds.connector");
  if (!isNumber(nextIds.comment) || nextIds.comment < 1) throw new Error("Invalid nextIds.comment");
  if (!isObject(data.nodes)) throw new Error("Invalid nodes collection");
  if (!isObject(data.connectors)) throw new Error("Invalid connectors collection");
  if (!isObject(data.comments)) throw new Error("Invalid comments collection");
  const nodes = data.nodes;
  const connectors = data.connectors;
  const comments = data.comments;
  let maxNodeId = 0;
  let maxConnectorId = 0;
  let maxCommentId = 0;
  for (const [id, node] of Object.entries(nodes)) {
    if (!NODE_ID_RE.test(id)) throw new Error(`Invalid node ID: ${id}`);
    maxNodeId = Math.max(maxNodeId, extractIdNumber(id));
    if (!isObject(node)) throw new Error(`Node ${id} is not an object`);
    if (typeof node.text !== "string") throw new Error("Node text must be string");
    if (node.commentState !== void 0 && !["OPEN", "ACCEPTED", "APPLIED", "CLOSED", "REJECTED", "DEFERRED"].includes(node.commentState)) {
      throw new Error("Invalid node commentState");
    }
    if (typeof node.deleted !== "boolean") throw new Error("Node deleted must be boolean");
    if (node.type !== "rectangle" && node.type !== "text") throw new Error(`Node ${id} invalid type`);
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
    if (typeof comment.author !== "string") throw new Error("Comment author must be string");
    if (typeof comment.text !== "string") throw new Error("Comment text must be string");
    if (typeof comment.createdAt !== "string") throw new Error("Comment createdAt must be string");
    if (!isString(comment.updatedAt)) throw new Error(`Comment ${id} invalid updatedAt`);
    validateRevision(comment, data.revision, `Comment ${id}`);
  }
  if (nextIds.node <= maxNodeId) throw new Error("nextIds.node is too small");
  if (nextIds.connector <= maxConnectorId) throw new Error("nextIds.connector is too small");
  if (nextIds.comment <= maxCommentId) throw new Error("nextIds.comment is too small");
  return data;
}
function validateRevision(record, documentRevision, prefix) {
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

// src/core/serialize.ts
function extractIdNumber2(id) {
  return parseInt(id.slice(1), 10);
}
function sortKeysByNaturalId(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort((a, b) => {
    return extractIdNumber2(a) - extractIdNumber2(b);
  });
  for (const k of keys) {
    sorted[k] = obj[k];
  }
  return sorted;
}
function serializeNode(node) {
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
    updatedBy: node.updatedBy
  };
}
function serializeConnector(connector) {
  return {
    sourceNodeId: connector.sourceNodeId,
    targetNodeId: connector.targetNodeId,
    deleted: connector.deleted,
    createdRevision: connector.createdRevision,
    updatedRevision: connector.updatedRevision,
    updatedBy: connector.updatedBy
  };
}
function serializeComment(comment) {
  return {
    nodeId: comment.nodeId,
    author: comment.author,
    text: comment.text,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    createdRevision: comment.createdRevision,
    updatedRevision: comment.updatedRevision,
    updatedBy: comment.updatedBy
  };
}
function serializeBoard(board) {
  const nodes = sortKeysByNaturalId(board.nodes);
  const connectors = sortKeysByNaturalId(board.connectors);
  const comments = sortKeysByNaturalId(board.comments);
  const orderedNodes = {};
  for (const [id, node] of Object.entries(nodes)) {
    orderedNodes[id] = serializeNode(node);
  }
  const orderedConnectors = {};
  for (const [id, conn] of Object.entries(connectors)) {
    orderedConnectors[id] = serializeConnector(conn);
  }
  const orderedComments = {};
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
      comment: board.nextIds.comment
    },
    nodes: orderedNodes,
    connectors: orderedConnectors,
    comments: orderedComments
  };
  return JSON.stringify(orderedBoard, null, 2) + "\n";
}

// src/core/queries.ts
function getLabel(node) {
  if (!node.text || node.text.trim().length === 0) return "(empty)";
  const firstLine = node.text.split("\n")[0].trim();
  return firstLine.length > 100 ? firstLine.slice(0, 100) : firstLine;
}
function getPendingChanges(board) {
  const changes = [];
  const isPending = (record) => record.updatedBy === "human" && record.updatedRevision > board.lastReviewedRevision;
  const getChangeKind = (record) => {
    if (record.deleted) return "deleted";
    if (record.createdRevision === record.updatedRevision) return "created";
    return "updated";
  };
  for (const [id, node] of Object.entries(board.nodes)) {
    if (isPending(node)) {
      changes.push({
        kind: "node",
        id,
        change: getChangeKind(node),
        label: getLabel(node),
        updatedRevision: node.updatedRevision
      });
    }
  }
  for (const [id, conn] of Object.entries(board.connectors)) {
    if (isPending(conn)) {
      changes.push({
        kind: "connector",
        id,
        change: getChangeKind(conn),
        sourceNodeId: conn.sourceNodeId,
        targetNodeId: conn.targetNodeId,
        updatedRevision: conn.updatedRevision
      });
    }
  }
  for (const [id, comm] of Object.entries(board.comments)) {
    if (isPending(comm)) {
      changes.push({
        kind: "comment",
        id,
        change: getChangeKind(comm),
        nodeId: comm.nodeId,
        updatedRevision: comm.updatedRevision
      });
    }
  }
  const kindRank = { node: 1, connector: 2, comment: 3 };
  changes.sort((a, b) => {
    if (a.updatedRevision !== b.updatedRevision) return a.updatedRevision - b.updatedRevision;
    if (kindRank[a.kind] !== kindRank[b.kind]) return kindRank[a.kind] - kindRank[b.kind];
    return parseInt(a.id.slice(1)) - parseInt(b.id.slice(1));
  });
  return changes;
}
function getOverview(board) {
  let nodesCount = 0;
  let connectorsCount = 0;
  let openThreadsCount = 0;
  const nodesDesc = [];
  for (const conn of Object.values(board.connectors)) {
    if (!conn.deleted) connectorsCount++;
  }
  for (const [id, node] of Object.entries(board.nodes)) {
    if (!node.deleted) {
      nodesCount++;
      const connected = /* @__PURE__ */ new Set();
      for (const conn of Object.values(board.connectors)) {
        if (!conn.deleted) {
          if (conn.sourceNodeId === id) connected.add(conn.targetNodeId);
          if (conn.targetNodeId === id) connected.add(conn.sourceNodeId);
        }
      }
      let nodeHasComments = false;
      for (const comm of Object.values(board.comments)) {
        if (comm.nodeId === id) {
          nodeHasComments = true;
          break;
        }
      }
      const isOpen = nodeHasComments && (node.commentState === "OPEN" || !node.commentState);
      if (isOpen) openThreadsCount++;
      nodesDesc.push({
        id,
        label: getLabel(node),
        connectedNodeIds: Array.from(connected),
        hasOpenThread: isOpen
      });
    }
  }
  return {
    documentId: board.documentId,
    revision: board.revision,
    lastReviewedRevision: board.lastReviewedRevision,
    counts: { nodes: nodesCount, connectors: connectorsCount, openThreads: openThreadsCount },
    nodes: nodesDesc
  };
}
function getContext(board, nodeIds) {
  for (const id of nodeIds) {
    if (!board.nodes[id]) throw new Error(`Unknown node ID: ${id}`);
  }
  const selectedNodeIds = new Set(nodeIds);
  const nodes = {};
  const connectors = {};
  const comments = {};
  const adjacentNodes = {};
  for (const id of selectedNodeIds) {
    nodes[id] = board.nodes[id];
    for (const [cId, comm] of Object.entries(board.comments)) {
      if (comm.nodeId === id) {
        comments[cId] = comm;
      }
    }
    for (const [eId, conn] of Object.entries(board.connectors)) {
      if (conn.sourceNodeId === id || conn.targetNodeId === id) {
        connectors[eId] = conn;
        const otherId = conn.sourceNodeId === id ? conn.targetNodeId : conn.sourceNodeId;
        if (!selectedNodeIds.has(otherId) && board.nodes[otherId]) {
          adjacentNodes[otherId] = {
            id: otherId,
            label: getLabel(board.nodes[otherId]),
            deleted: board.nodes[otherId].deleted
          };
        }
      }
    }
  }
  const sortedComments = Object.entries(comments).sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1))).map((e) => ({ id: e[0], ...e[1] }));
  return {
    nodes: Object.entries(nodes).map((e) => ({ id: e[0], ...e[1] })),
    connectors: Object.entries(connectors).map((e) => ({ id: e[0], ...e[1] })),
    comments: sortedComments,
    adjacentNodes: Object.values(adjacentNodes)
  };
}
function searchNodes(board, query) {
  const lowerQuery = query.toLowerCase();
  const results = [];
  for (const [id, node] of Object.entries(board.nodes)) {
    if (!node.deleted && node.text) {
      if (node.text.toLowerCase().includes(lowerQuery)) {
        const idx = node.text.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, idx - 20);
        const end = Math.min(node.text.length, idx + query.length + 20);
        let excerpt = node.text.substring(start, end).replace(/\n/g, " ");
        if (start > 0) excerpt = "..." + excerpt;
        if (end < node.text.length) excerpt = excerpt + "...";
        results.push({
          id,
          label: getLabel(node),
          excerpt
        });
      }
    }
  }
  return results;
}

// src/core/operations.ts
function bumpRevision(board, actor) {
  board.revision += 1;
  board.modifiedAt = (/* @__PURE__ */ new Date()).toISOString();
  board.modifiedBy = actor;
  return board.revision;
}
function addComment(board, nodeId, text, author) {
  if (!board.nodes[nodeId]) throw new Error(`Node ${nodeId} not found`);
  const id = `c${board.nextIds.comment++}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  board.comments[id] = {
    nodeId,
    author,
    text,
    createdAt: now,
    updatedAt: now,
    createdRevision: board.revision,
    updatedRevision: board.revision,
    updatedBy: author
  };
  board.revision++;
  return id;
}
function completeReview(board, throughRevision) {
  if (throughRevision < board.lastReviewedRevision) throw new Error("Cannot review backwards");
  if (throughRevision > board.revision) throw new Error("Cannot review future revisions");
  bumpRevision(board, "model");
  board.lastReviewedRevision = throughRevision;
}

// tools/boardctl.ts
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
function computeHash(content) {
  return crypto2.createHash("sha256").update(content).digest("hex");
}
async function loadAndValidate(file) {
  const content = await fs.promises.readFile(file, "utf-8");
  const baseHash = computeHash(content);
  const data = JSON.parse(content);
  const board = validateBoard(data);
  return { board, baseHash, content };
}
async function writeSafely(file, baseHash, newBoardStr) {
  const currentContent = await fs.promises.readFile(file, "utf-8");
  if (computeHash(currentContent) !== baseHash) {
    throw new Error("Conflict: File was modified externally.");
  }
  const dir = path.dirname(file);
  const tempFile = path.join(dir, `.tmp-${crypto2.randomUUID()}`);
  try {
    await fs.promises.writeFile(tempFile, newBoardStr, "utf-8");
    await fs.promises.rename(tempFile, file);
  } catch (err) {
    if (fs.existsSync(tempFile)) {
      await fs.promises.unlink(tempFile);
    }
    throw err;
  }
}
function output(data, pretty) {
  if (pretty) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data));
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const pretty = args.includes("--pretty");
  const cleanArgs = args.filter((a) => a !== "--pretty");
  const cmd = cleanArgs[0];
  try {
    if (cmd === "validate") {
      const file = cleanArgs[1];
      if (!file) throw new Error("Missing file argument");
      const { board } = await loadAndValidate(file);
      output({ valid: true, documentId: board.documentId, revision: board.revision }, pretty);
    } else if (cmd === "overview") {
      const file = cleanArgs[1];
      if (!file) throw new Error("Missing file argument");
      const { board } = await loadAndValidate(file);
      output(getOverview(board), pretty);
    } else if (cmd === "pending") {
      const file = cleanArgs[1];
      if (!file) throw new Error("Missing file argument");
      const { board } = await loadAndValidate(file);
      const changes = getPendingChanges(board);
      output({
        fromRevision: board.lastReviewedRevision,
        throughRevision: board.revision,
        changes
      }, pretty);
    } else if (cmd === "context") {
      const file = cleanArgs[1];
      const nodeIds = cleanArgs.slice(2);
      if (!file || nodeIds.length === 0) throw new Error("Missing file or NODE_ID arguments");
      const { board } = await loadAndValidate(file);
      output(getContext(board, nodeIds), pretty);
    } else if (cmd === "search") {
      const file = cleanArgs[1];
      const query = cleanArgs[2];
      if (!file || !query) throw new Error("Missing file or QUERY arguments");
      const { board } = await loadAndValidate(file);
      output(searchNodes(board, query), pretty);
    } else if (cmd === "comment") {
      const subCmd = cleanArgs[1];
      const file = cleanArgs[2];
      if (subCmd === "add") {
        const nodeId = cleanArgs[3];
        const textFlagIdx = cleanArgs.findIndex((a) => a === "--text");
        const fileFlagIdx = cleanArgs.findIndex((a) => a === "--text-file");
        let text = "";
        if (textFlagIdx !== -1) {
          text = cleanArgs[textFlagIdx + 1];
        } else if (fileFlagIdx !== -1) {
          const txtFile = cleanArgs[fileFlagIdx + 1];
          text = await fs.promises.readFile(txtFile, "utf-8");
        } else {
          throw new Error("Missing --text or --text-file");
        }
        const { board, baseHash } = await loadAndValidate(file);
        const commentId = addComment(board, nodeId, text, "model");
        const newBoardStr = serializeBoard(board);
        validateBoard(JSON.parse(newBoardStr));
        await writeSafely(file, baseHash, newBoardStr);
        output({ commentId, revision: board.revision }, pretty);
      } else if (subCmd === "state") {
        const nodeId = cleanArgs[3];
        const state = cleanArgs[4];
        if (!nodeId || !state) throw new Error("Missing NODE_ID or STATE");
        const { board, baseHash } = await loadAndValidate(file);
        if (!board.nodes[nodeId]) throw new Error("Node not found");
        board.revision++;
        board.modifiedAt = (/* @__PURE__ */ new Date()).toISOString();
        board.modifiedBy = "model";
        board.nodes[nodeId].commentState = state;
        board.nodes[nodeId].updatedRevision = board.revision;
        board.nodes[nodeId].updatedBy = "model";
        const newBoardStr = serializeBoard(board);
        validateBoard(JSON.parse(newBoardStr));
        await writeSafely(file, baseHash, newBoardStr);
        output({ nodeId, revision: board.revision }, pretty);
      } else {
        throw new Error(`Unknown comment sub-command: ${subCmd}`);
      }
    } else if (cmd === "review") {
      const subCmd = cleanArgs[1];
      if (subCmd !== "complete") throw new Error(`Unknown review sub-command: ${subCmd}`);
      const file = cleanArgs[2];
      const throughIdx = cleanArgs.findIndex((a) => a === "--through");
      if (throughIdx === -1) throw new Error("Missing --through");
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
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
main();
