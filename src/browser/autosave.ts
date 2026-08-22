import { BoardDocument } from '../core/types.js';
import { saveFile, hasActiveFile } from './file-store.js';

type SaveCallback = () => void;
type ErrorCallback = (err: any) => void;

let autosaveEnabled = true;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isSaving = false;
let pendingSave = false;
let boardRef: BoardDocument | null = null;

let onSaveStart: SaveCallback = () => {};
let onSaveSuccess: SaveCallback = () => {};
let onSaveError: ErrorCallback = () => {};
let onRequiresFirstSave: SaveCallback = () => {};

export function setAutosaveEnabled(enabled: boolean) {
  autosaveEnabled = enabled;
  localStorage.setItem('doodleback_autosave', enabled ? '1' : '0');
}

export function isAutosaveEnabled() {
  const saved = localStorage.getItem('doodleback_autosave');
  if (saved !== null) {
    autosaveEnabled = saved === '1';
  }
  return autosaveEnabled;
}

export function initAutosave(callbacks: { start: SaveCallback, success: SaveCallback, error: ErrorCallback, requiresFirstSave: SaveCallback }) {
  onSaveStart = callbacks.start;
  onSaveSuccess = callbacks.success;
  onSaveError = callbacks.error;
  onRequiresFirstSave = callbacks.requiresFirstSave;
  isAutosaveEnabled(); // initialize from local storage
}

export function scheduleAutosave(board: BoardDocument) {
  if (!autosaveEnabled) return;
  boardRef = board;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    executeSave();
  }, 750);
}

async function executeSave() {
  if (isSaving) {
    // If a save is already in progress, schedule another one after it completes
    pendingSave = true;
    return;
  }

  if (!boardRef) return;
  
  if (!(await hasActiveFile())) {
    onRequiresFirstSave();
    return;
  }
  
  isSaving = true;
  onSaveStart();
  
  try {
    await saveFile(boardRef);
    onSaveSuccess();
  } catch (err: any) {
    onSaveError(err);
    if (err.message === 'CONFLICT') {
      // pause autosave on conflict
      autosaveEnabled = false; 
    }
  } finally {
    isSaving = false;
    if (pendingSave) {
      pendingSave = false;
      executeSave();
    }
  }
}
