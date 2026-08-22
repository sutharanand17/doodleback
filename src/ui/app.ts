import { createEmptyBoard, commitHumanChanges } from '../core/operations.js';
import { BoardDocument } from '../core/types.js';
import { initCanvas, updateBoard, getSelectedNodeId, startTextEdit, fitView } from './canvas.js';
import { initCommentsPanel, openPanelForNode, closePanel, isPanelOpen, refreshPanelIfOpen } from './comments-panel.js';
import { hasActiveFile, openFile, reloadActiveFile, saveFile } from '../browser/file-store.js';
import { initAutosave, scheduleAutosave, isAutosaveEnabled, setAutosaveEnabled } from '../browser/autosave.js';
import { showConflictDialog } from './conflict-dialog.js';

let board: BoardDocument;
let dirtyNodes = new Set<string>();
let dirtyConnectors = new Set<string>();
// Comments mutated are tracked separately and trigger autosave directly.

export function initApp() {
  board = createEmptyBoard();
  
  initCanvas('canvas-container', board, {
    onChange: handleCanvasChange,
    onSelect: handleSelection,
    onDoubleClickNode: handleDoubleClickNode,
    onOpenComments: handleOpenComments,
  });
  
  initCommentsPanel(board, handleCommentsChange);
  
  initAutosave({
    start: () => updateStatus('Saving…'),
    success: () => updateStatus('Saved', 'success'),
    error: (err) => {
      if (err.message === 'CONFLICT') {
        updateStatus('Conflict', 'error');
        showConflictDialog(handleReload, handleSaveCopy);
      } else {
        updateStatus('Save failed', 'error');
        console.error(err);
      }
    }
  });

  setupToolbar();
  updateStatus('Unsaved');
}

function handleCanvasChange(nodes: Set<string>, connectors: Set<string>) {
  for (const id of nodes) dirtyNodes.add(id);
  for (const id of connectors) dirtyConnectors.add(id);
  
  updateStatus('Unsaved');
  
  if (dirtyNodes.size > 0 || dirtyConnectors.size > 0) {
    if (commitHumanChanges(board, { nodes: dirtyNodes, connectors: dirtyConnectors, comments: new Set() })) {
      dirtyNodes.clear();
      dirtyConnectors.clear();
      scheduleAutosave(board);
    }
  }
}

function handleSelection(nodeId: string | null) {
  if (isPanelOpen()) {
    if (nodeId) {
      openPanelForNode(nodeId, board.nodes[nodeId]);
    } else {
      closePanel();
    }
  }
}

function handleDoubleClickNode(nodeId: string) {
  startTextEdit(nodeId);
}

function handleOpenComments(nodeId: string) {
  if (isPanelOpen() && getSelectedNodeId() === nodeId) {
    closePanel();
  } else {
    openPanelForNode(nodeId, board.nodes[nodeId]);
  }
}

function handleCommentsChange() {
  // Comments bump revision immediately in operations.ts for the CLI, but in the PWA we still want to save the file.
  updateStatus('Unsaved');
  scheduleAutosave(board);
}

function updateStatus(text: string, type: 'normal' | 'success' | 'error' = 'normal') {
  const status = document.getElementById('status-indicator');
  if (status) {
    status.textContent = text;
    status.className = 'status-indicator';
    if (type !== 'normal') status.classList.add(type);
  }
}

async function handleReload() {
  try {
    const newBoard = await reloadActiveFile();
    if (newBoard) {
      board = newBoard;
      updateBoard(board);
      initCommentsPanel(board, handleCommentsChange); // re-bind new board
      refreshPanelIfOpen();
      updateStatus('Saved', 'success');
    }
  } catch (err: any) {
    console.error('Reload failed', err);
    alert('Failed to reload: ' + err.message);
  }
}

async function handleSaveCopy() {
  try {
    await saveFile(board, true);
    updateStatus('Saved', 'success');
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      alert('Save as copy failed: ' + err.message);
    }
  }
}

function setupToolbar() {
  document.getElementById('btn-new')?.addEventListener('click', () => {
    if (dirtyNodes.size > 0 || dirtyConnectors.size > 0) {
      if (!confirm('Discard unsaved changes?')) return;
    }
    board = createEmptyBoard();
    updateBoard(board);
    initCommentsPanel(board, handleCommentsChange);
    closePanel();
    updateStatus('Unsaved');
  });

  document.getElementById('btn-open')?.addEventListener('click', async () => {
    try {
      const { board: newBoard, filename } = await openFile();
      board = newBoard;
      updateBoard(board);
      initCommentsPanel(board, handleCommentsChange);
      closePanel();
      updateStatus('Loaded ' + filename, 'success');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert('Failed to open file: ' + err.message);
      }
    }
  });

  document.getElementById('btn-save')?.addEventListener('click', async () => {
    try {
      updateStatus('Saving…');
      await saveFile(board, false);
      updateStatus('Saved', 'success');
    } catch (err: any) {
      if (err.message === 'CONFLICT') {
        updateStatus('Conflict', 'error');
        showConflictDialog(handleReload, handleSaveCopy);
      } else if (err.name !== 'AbortError') {
        updateStatus('Save failed', 'error');
        alert('Failed to save: ' + err.message);
      }
    }
  });

  document.getElementById('btn-save-copy')?.addEventListener('click', handleSaveCopy);

  document.getElementById('btn-reload')?.addEventListener('click', async () => {
    if (await hasActiveFile()) {
      if (dirtyNodes.size > 0 || dirtyConnectors.size > 0) {
        if (!confirm('Discard unsaved changes?')) return;
      }
      handleReload();
    } else {
      alert('No active file to reload.');
    }
  });

  const toggleAutosave = document.getElementById('toggle-autosave') as HTMLInputElement;
  if (toggleAutosave) {
    toggleAutosave.checked = isAutosaveEnabled();
    toggleAutosave.addEventListener('change', (e) => {
      setAutosaveEnabled((e.target as HTMLInputElement).checked);
      if (!isAutosaveEnabled()) {
        updateStatus('Autosave paused');
      } else {
        updateStatus('Autosave enabled');
      }
    });
  }

  document.getElementById('btn-fit')?.addEventListener('click', fitView);
}
