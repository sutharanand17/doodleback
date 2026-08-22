import { describe, it, expect } from 'vitest';
import { validateBoard } from '../../src/core/schema.js';
import { createEmptyBoard } from '../../src/core/operations.js';

describe('schema validation', () => {
  it('accepts a valid empty board', () => {
    const board = createEmptyBoard();
    expect(() => validateBoard(board)).not.toThrow();
  });

  it('rejects unsupported schemaVersion', () => {
    const board = createEmptyBoard() as any;
    board.schemaVersion = 2;
    expect(() => validateBoard(board)).toThrow(/Unsupported schemaVersion/);
  });

  it('rejects invalid node types', () => {
    const board = createEmptyBoard();
    board.nodes['n1'] = {
      type: 'circle' as any,
      x: 0, y: 0, width: 100, height: 100, zIndex: 1, text: '', deleted: false,
      createdRevision: 0, updatedRevision: 0, updatedBy: 'human'
    };
    expect(() => validateBoard(board)).toThrow(/invalid type/);
  });

  it('rejects negative dimensions', () => {
    const board = createEmptyBoard();
    board.nodes['n1'] = {
      type: 'rectangle',
      x: 0, y: 0, width: -100, height: 100, zIndex: 1, text: '', deleted: false,
      createdRevision: 0, updatedRevision: 0, updatedBy: 'human'
    };
    expect(() => validateBoard(board)).toThrow(/invalid width/);
  });

  it('rejects self connectors', () => {
    const board = createEmptyBoard();
    board.nodes['n1'] = {
      type: 'rectangle',
      x: 0, y: 0, width: 100, height: 100, zIndex: 1, text: '', deleted: false,
      createdRevision: 0, updatedRevision: 0, updatedBy: 'human'
    };
    board.connectors['e1'] = {
      sourceNodeId: 'n1', targetNodeId: 'n1', deleted: false,
      createdRevision: 0, updatedRevision: 0, updatedBy: 'human'
    };
    expect(() => validateBoard(board)).toThrow(/self-connector/);
  });

  it('rejects nextIds too small', () => {
    const board = createEmptyBoard();
    board.nodes['n2'] = {
      type: 'rectangle',
      x: 0, y: 0, width: 100, height: 100, zIndex: 1, text: '', deleted: false,
      createdRevision: 0, updatedRevision: 0, updatedBy: 'human'
    };
    // nextIds.node is 1, but we have n2
    expect(() => validateBoard(board)).toThrow(/nextIds.node is too small/);
  });
});
