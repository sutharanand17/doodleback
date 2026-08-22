import { BoardDocument, BoardNode } from './types.js';

export function getLabel(node: BoardNode): string {
  if (!node.text || node.text.trim().length === 0) return '(empty)';
  const firstLine = node.text.split('\n')[0].trim();
  return firstLine.length > 100 ? firstLine.slice(0, 100) : firstLine;
}

export function getPendingChanges(board: BoardDocument) {
  const changes: any[] = [];
  
  const isPending = (record: any) => 
    record.updatedBy === 'human' && record.updatedRevision > board.lastReviewedRevision;
    
  const getChangeKind = (record: any) => {
    if (record.deleted) return 'deleted';
    if (record.createdRevision === record.updatedRevision) return 'created';
    return 'updated';
  };

  for (const [id, node] of Object.entries(board.nodes)) {
    if (isPending(node)) {
      changes.push({
        kind: 'node', id, change: getChangeKind(node), label: getLabel(node), updatedRevision: node.updatedRevision
      });
    }
  }

  for (const [id, conn] of Object.entries(board.connectors)) {
    if (isPending(conn)) {
      changes.push({
        kind: 'connector', id, change: getChangeKind(conn), sourceNodeId: conn.sourceNodeId, targetNodeId: conn.targetNodeId, updatedRevision: conn.updatedRevision
      });
    }
  }

  for (const [id, comm] of Object.entries(board.comments)) {
    if (isPending(comm)) {
      changes.push({
        kind: 'comment', id, change: getChangeKind(comm), nodeId: comm.nodeId, state: comm.state, updatedRevision: comm.updatedRevision
      });
    }
  }

  // Sort by updatedRevision, then kind, then natural ID
  const kindRank: Record<string, number> = { node: 1, connector: 2, comment: 3 };
  changes.sort((a, b) => {
    if (a.updatedRevision !== b.updatedRevision) return a.updatedRevision - b.updatedRevision;
    if (kindRank[a.kind] !== kindRank[b.kind]) return kindRank[a.kind] - kindRank[b.kind];
    return parseInt(a.id.slice(1)) - parseInt(b.id.slice(1));
  });

  return changes;
}

export function getOverview(board: BoardDocument) {
  let nodesCount = 0;
  let connectorsCount = 0;
  let openCommentsCount = 0;

  const nodesDesc: any[] = [];
  
  for (const comm of Object.values(board.comments)) {
    if (comm.state === 'OPEN') openCommentsCount++;
  }

  for (const conn of Object.values(board.connectors)) {
    if (!conn.deleted) connectorsCount++;
  }

  for (const [id, node] of Object.entries(board.nodes)) {
    if (!node.deleted) {
      nodesCount++;
      const connected = new Set<string>();
      for (const conn of Object.values(board.connectors)) {
        if (!conn.deleted) {
          if (conn.sourceNodeId === id) connected.add(conn.targetNodeId);
          if (conn.targetNodeId === id) connected.add(conn.sourceNodeId);
        }
      }
      let nodeOpenComments = 0;
      for (const comm of Object.values(board.comments)) {
        if (comm.nodeId === id && comm.state === 'OPEN') nodeOpenComments++;
      }
      nodesDesc.push({
        id,
        label: getLabel(node),
        connectedNodeIds: Array.from(connected),
        openCommentCount: nodeOpenComments
      });
    }
  }

  return {
    documentId: board.documentId,
    revision: board.revision,
    lastReviewedRevision: board.lastReviewedRevision,
    counts: { nodes: nodesCount, connectors: connectorsCount, openComments: openCommentsCount },
    nodes: nodesDesc
  };
}

export function getContext(board: BoardDocument, nodeIds: string[]) {
  for (const id of nodeIds) {
    if (!board.nodes[id]) throw new Error(`Unknown node ID: ${id}`);
  }

  const selectedNodeIds = new Set(nodeIds);
  const nodes: Record<string, any> = {};
  const connectors: Record<string, any> = {};
  const comments: Record<string, any> = {};
  const adjacentNodes: Record<string, any> = {};

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

  // Sort comments chronologically (or by ID as proxy since IDs are sequential and never deleted)
  const sortedComments = Object.entries(comments)
    .sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)))
    .map(e => ({ id: e[0], ...e[1] }));

  return {
    nodes: Object.entries(nodes).map(e => ({ id: e[0], ...e[1] })),
    connectors: Object.entries(connectors).map(e => ({ id: e[0], ...e[1] })),
    comments: sortedComments,
    adjacentNodes: Object.values(adjacentNodes)
  };
}

export function searchNodes(board: BoardDocument, query: string) {
  const lowerQuery = query.toLowerCase();
  const results: any[] = [];
  
  for (const [id, node] of Object.entries(board.nodes)) {
    if (!node.deleted && node.text) {
      if (node.text.toLowerCase().includes(lowerQuery)) {
        // create a short excerpt
        const idx = node.text.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, idx - 20);
        const end = Math.min(node.text.length, idx + query.length + 20);
        let excerpt = node.text.substring(start, end).replace(/\n/g, ' ');
        if (start > 0) excerpt = '...' + excerpt;
        if (end < node.text.length) excerpt = excerpt + '...';
        
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
