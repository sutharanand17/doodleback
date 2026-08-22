import { BoardDocument } from '../core/types.js';
import { validateBoard } from '../core/schema.js';
import { serializeBoard } from '../core/serialize.js';

let activeHandle: FileSystemFileHandle | null = null;
let baseHash: string | null = null;

async function computeHash(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hasActiveFile() {
  return activeHandle !== null;
}

export async function openFile(): Promise<{ board: BoardDocument; filename: string }> {
  // @ts-ignore
  const [fileHandle] = await window.showOpenFilePicker({
    types: [{
      description: 'Board JSON',
      accept: { 'application/json': ['.json', '.board.json'] }
    }]
  });
  
  const file = await fileHandle.getFile();
  const text = await file.text();
  const hash = await computeHash(text);
  
  const data = JSON.parse(text);
  const board = validateBoard(data);
  
  activeHandle = fileHandle;
  baseHash = hash;
  
  return { board, filename: file.name };
}

export async function reloadActiveFile(): Promise<BoardDocument | null> {
  if (!activeHandle) return null;
  const file = await activeHandle.getFile();
  const text = await file.text();
  baseHash = await computeHash(text);
  const data = JSON.parse(text);
  return validateBoard(data);
}

export async function saveFile(board: BoardDocument, saveAsCopy = false): Promise<string> {
  if (!activeHandle || saveAsCopy) {
    // @ts-ignore
    activeHandle = await window.showSaveFilePicker({
      suggestedName: saveAsCopy ? 'copy.board.json' : 'new.board.json',
      types: [{
        description: 'Board JSON',
        accept: { 'application/json': ['.board.json', '.json'] }
      }]
    });
    // First explicit write to a newly selected destination establishes that destination’s baseHash
    // It does not compare against the previously active file.
    const newBoardStr = serializeBoard(board);
    // @ts-ignore
    const writable = await activeHandle.createWritable({ mode: "exclusive" });
    await writable.write(newBoardStr);
    await writable.close();
    baseHash = await computeHash(newBoardStr);
    return activeHandle!.name;
  }
  
  // existing handle, need to check hash
  const currentFile = await activeHandle.getFile();
  const currentText = await currentFile.text();
  const currentHash = await computeHash(currentText);
  
  if (currentHash !== baseHash) {
    throw new Error('CONFLICT');
  }
  
  const newBoardStr = serializeBoard(board);
  // @ts-ignore
  const writable = await activeHandle.createWritable({ mode: "exclusive" });
  await writable.write(newBoardStr);
  await writable.close();
  
  baseHash = await computeHash(newBoardStr);
  return activeHandle.name;
}
