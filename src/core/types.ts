export type Actor = "human" | "model";

export type CommentState =
  | "OPEN"
  | "ACCEPTED"
  | "APPLIED"
  | "CLOSED"
  | "REJECTED"
  | "DEFERRED";

export interface BoardDocument {
  schemaVersion: 1;
  documentId: string;
  revision: number;
  modifiedAt: string;
  modifiedBy: Actor;
  lastReviewedRevision: number;
  nextIds: {
    node: number;
    connector: number;
    comment: number;
  };
  nodes: Record<string, BoardNode>;
  connectors: Record<string, BoardConnector>;
  comments: Record<string, BoardComment>;
}

export interface RevisionedRecord {
  createdRevision: number;
  updatedRevision: number;
  updatedBy: Actor;
}

export interface BoardNode extends RevisionedRecord {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  text: string;
  commentState?: CommentState;
  deleted: boolean;
}

export interface BoardConnector extends RevisionedRecord {
  sourceNodeId: string;
  targetNodeId: string;
  deleted: boolean;
}

export interface BoardComment extends RevisionedRecord {
  nodeId: string;
  author: Actor;
  text: string;
  createdAt: string;
  updatedAt: string;
}
