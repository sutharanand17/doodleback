import { BoardDocument, BoardNode, CommentState } from '../core/types.js';
import { addComment, updateNode } from '../core/operations.js';
import { markdownToHtml } from '../core/markdown.js';

type StateChangeCallback = () => void;

let currentBoard: BoardDocument | null = null;
let currentNodeId: string | null = null;
let onChange: StateChangeCallback = () => {};

export function initCommentsPanel(board: BoardDocument, changeCallback: StateChangeCallback) {
  currentBoard = board;
  onChange = changeCallback;

  const btnClose = document.getElementById('btn-close-comments');
  const btnAdd = document.getElementById('btn-add-comment');
  
  btnClose?.addEventListener('click', closePanel);
  btnAdd?.addEventListener('click', handleAddComment);
  
  const threadSelect = document.getElementById('thread-state-select') as HTMLSelectElement;
  if (threadSelect) {
    const states: CommentState[] = ['OPEN', 'ACCEPTED', 'APPLIED', 'CLOSED', 'REJECTED', 'DEFERRED'];
    for (const s of states) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      threadSelect.appendChild(opt);
    }
    
    threadSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (currentBoard && currentNodeId) {
        updateNode(currentBoard, currentNodeId, { commentState: target.value as CommentState });
        onChange();
      }
    });
  }
  
  const input = document.getElementById('comment-input') as HTMLTextAreaElement;
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddComment();
    }
  });
}

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function openPanelForNode(nodeId: string, node: BoardNode) {
  currentNodeId = nodeId;
  const panel = document.getElementById('comments-panel');
  const label = document.getElementById('comments-node-label');
  
  if (panel) panel.classList.remove('closed');
  if (label) {
    const text = node.text || '(empty)';
    const firstLine = text.split('\n')[0].trim();
    label.textContent = firstLine.length > 100 ? firstLine.slice(0, 100) : firstLine;
  }
  
  const threadSelect = document.getElementById('thread-state-select') as HTMLSelectElement;
  if (threadSelect) {
    threadSelect.value = node.commentState || 'OPEN';
  }
  
  renderComments();
  
  const input = document.getElementById('comment-input') as HTMLTextAreaElement;
  if (input) input.focus();
}

export function closePanel() {
  currentNodeId = null;
  const panel = document.getElementById('comments-panel');
  if (panel) panel.classList.add('closed');
}

export function isPanelOpen() {
  return !document.getElementById('comments-panel')?.classList.contains('closed');
}

function renderComments() {
  const list = document.getElementById('comments-list');
  if (!list || !currentBoard || !currentNodeId) return;

  list.innerHTML = '';
  
  // Sort comments chronologically
  const comments = Object.entries(currentBoard.comments)
    .filter(([_, c]) => c.nodeId === currentNodeId)
    .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime());

  if (comments.length === 0) {
    list.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px;">No comments yet.</div>';
    return;
  }

  for (const [_id, c] of comments) {
    const item = document.createElement('div');
    item.className = 'comment-item comment-item-' + c.author;
    
    const meta = document.createElement('div');
    meta.className = 'comment-meta';
    
    const authorSpan = document.createElement('span');
    authorSpan.textContent = c.author === 'human' ? 'You' : 'Model';
    authorSpan.style.fontWeight = '600';
    
    const timeSpan = document.createElement('span');
    timeSpan.textContent = formatTimeAgo(c.createdAt);
    
    meta.appendChild(authorSpan);
    meta.appendChild(timeSpan);
    
    const text = document.createElement('div');
    text.className = 'comment-text';
    text.innerHTML = markdownToHtml(c.text);
    
    item.appendChild(meta);
    item.appendChild(text);
    
    list.appendChild(item);
  }
}

function handleAddComment() {
  const input = document.getElementById('comment-input') as HTMLTextAreaElement;
  if (!input || !currentBoard || !currentNodeId) return;
  
  const text = input.value.trim();
  if (text.length === 0) return;
  
  addComment(currentBoard, currentNodeId, text, 'human');
  input.value = '';
  
  renderComments();
  onChange();
}

export function refreshPanelIfOpen() {
  if (isPanelOpen()) {
    renderComments();
  }
}
