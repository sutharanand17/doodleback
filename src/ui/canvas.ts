import { BoardDocument } from '../core/types.js';
import { getBoundaryIntersection } from '../core/geometry.js';
import { addNode, updateNode, addConnector, markConnectorDeleted } from '../core/operations.js';

const MIN_WIDTH = 160;
const MIN_HEIGHT = 80;

type CanvasChangeCallback = (dirtyNodes: Set<string>, dirtyConnectors: Set<string>) => void;
type SelectionCallback = (nodeId: string | null) => void;
type NodeDoubleClickCallback = (nodeId: string) => void;
type OpenCommentsCallback = (nodeId: string) => void;

let svg: SVGSVGElement;
let board: BoardDocument | null = null;
let onChange: CanvasChangeCallback = () => {};
let onSelect: SelectionCallback = () => {};
let onDoubleClickNode: NodeDoubleClickCallback = () => {};
let onOpenComments: OpenCommentsCallback = () => {};

let dirtyNodes = new Set<string>();
let dirtyConnectors = new Set<string>();

let selectedNodeId: string | null = null;
let selectedConnectorId: string | null = null;
let hoveredNodeId: string | null = null;

let panX = 0;
let panY = 0;
let zoom = 1;

// Interaction state
let interactionMode: 'none' | 'pan' | 'drag-node' | 'resize-node' | 'draw-connector' = 'none';
let interactionStart = { x: 0, y: 0 };
let interactionOffset = { x: 0, y: 0 };
let connectorStartNodeId: string | null = null;
let tempConnectorLine: SVGLineElement | null = null;

export function initCanvas(containerId: string, doc: BoardDocument, callbacks: {
  onChange: CanvasChangeCallback;
  onSelect: SelectionCallback;
  onDoubleClickNode: NodeDoubleClickCallback;
  onOpenComments: OpenCommentsCallback;
}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  board = doc;
  onChange = callbacks.onChange;
  onSelect = callbacks.onSelect;
  onDoubleClickNode = callbacks.onDoubleClickNode;
  onOpenComments = callbacks.onOpenComments;

  // Setup SVG
  container.innerHTML = '';
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  container.appendChild(svg);

  // Global events
  svg.addEventListener('pointerdown', handlePointerDown);
  svg.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp); // window to catch outside release
  svg.addEventListener('dblclick', handleDoubleClick);
  container.addEventListener('wheel', handleWheel, { passive: false });
  document.addEventListener('keydown', handleKeyDown);

  render();
}

export function updateBoard(newBoard: BoardDocument) {
  board = newBoard;
  dirtyNodes.clear();
  dirtyConnectors.clear();
  render();
}

export function getSelectedNodeId() {
  return selectedNodeId;
}

export function startTextEdit(nodeId: string) {
  if (!board || !board.nodes[nodeId]) return;
  const node = board.nodes[nodeId];
  
  const container = svg.parentElement;
  if (!container) return;
  
  const textarea = document.createElement('textarea');
  textarea.className = 'text-edit-overlay';
  textarea.value = node.text;
  
  // Convert world to screen coords for textarea placement
  const screenX = node.x * zoom + panX;
  const screenY = node.y * zoom + panY;
  const screenW = node.width * zoom;
  const screenH = node.height * zoom;
  
  // Padding matches the SVG node rect
  textarea.style.left = `${screenX + 12 * zoom}px`;
  textarea.style.top = `${screenY + 12 * zoom}px`;
  textarea.style.width = `${screenW - 24 * zoom}px`;
  textarea.style.height = `${screenH - 24 * zoom}px`;
  textarea.style.fontSize = `${14 * zoom}px`;
  
  container.appendChild(textarea);
  textarea.focus();
  // Place cursor at end
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  
  const commitEdit = () => {
    const newText = textarea.value;
    if (newText !== node.text) {
      updateNode(board!, nodeId, { text: newText });
      dirtyNodes.add(nodeId);
      onChange(dirtyNodes, dirtyConnectors);
    }
    textarea.remove();
    render();
  };
  
  textarea.addEventListener('blur', commitEdit);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      textarea.value = node.text; // cancel
      textarea.blur();
    }
    // Note: Allow enter for multiline
  });
}

function handlePointerDown(e: PointerEvent) {
  if (!board || e.button !== 0) return; // Only left click
  
  const target = e.target as SVGElement;
  const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);

  if (target.classList.contains('resize-handle')) {
    interactionMode = 'resize-node';
    interactionStart = { x: wX, y: wY };
    e.stopPropagation();
    return;
  }
  
  if (target.classList.contains('connect-handle')) {
    interactionMode = 'draw-connector';
    connectorStartNodeId = selectedNodeId;
    
    tempConnectorLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tempConnectorLine.classList.add('connector-line');
    
    // Position start at handle center (right edge center)
    const node = board.nodes[connectorStartNodeId!];
    const startX = node.x + node.width;
    const startY = node.y + node.height / 2;
    
    tempConnectorLine.setAttribute('x1', String(startX));
    tempConnectorLine.setAttribute('y1', String(startY));
    tempConnectorLine.setAttribute('x2', String(startX));
    tempConnectorLine.setAttribute('y2', String(startY));
    const gTransform = svg.querySelector('g#world-transform') || svg;
    gTransform.appendChild(tempConnectorLine);
    
    e.stopPropagation();
    return;
  }
  
  if (target.classList.contains('comment-badge') || target.classList.contains('comment-badge-text')) {
    const g = target.closest('g.node-group') as SVGGElement;
    if (g && g.dataset.id) {
      onOpenComments(g.dataset.id);
    }
    e.stopPropagation();
    return;
  }

  const nodeGroup = target.closest('g.node-group') as SVGGElement;
  if (nodeGroup && nodeGroup.dataset.id) {
    const id = nodeGroup.dataset.id;
    const wasSelected = selectedNodeId === id;
    selectedNodeId = id;
    selectedConnectorId = null;
    if (!wasSelected) onSelect(id);
    
    // Raise zIndex
    const node = board.nodes[id];
    let maxZ = 0;
    for (const n of Object.values(board.nodes)) {
      if (!n.deleted && n.zIndex > maxZ) maxZ = n.zIndex;
    }
    
    let needsRender = !wasSelected;
    if (node.zIndex < maxZ) {
      updateNode(board, id, { zIndex: maxZ + 1 });
      dirtyNodes.add(id);
      needsRender = true;
    }
    
    interactionMode = 'drag-node';
    interactionOffset = { x: node.x - wX, y: node.y - wY };
    if (needsRender) render();
    e.stopPropagation();
    return;
  }
  
  const connectorGroup = target.closest('g.connector-group') as SVGGElement;
  if (connectorGroup && connectorGroup.dataset.id) {
    const id = connectorGroup.dataset.id;
    const wasSelected = selectedConnectorId === id;
    selectedConnectorId = id;
    selectedNodeId = null;
    if (!wasSelected) {
      onSelect(null);
      render();
    }
    e.stopPropagation();
    return;
  }

  // Clicked empty space
  const wasEmpty = selectedNodeId === null && selectedConnectorId === null;
  selectedNodeId = null;
  selectedConnectorId = null;
  if (!wasEmpty) {
    onSelect(null);
    render();
  }
  
  interactionMode = 'pan';
  interactionStart = { x: e.clientX, y: e.clientY };
}

function handlePointerMove(e: PointerEvent) {
  if (interactionMode === 'pan') {
    const dx = e.clientX - interactionStart.x;
    const dy = e.clientY - interactionStart.y;
    panX += dx;
    panY += dy;
    interactionStart = { x: e.clientX, y: e.clientY };
    render();
  } else if (interactionMode === 'drag-node' && selectedNodeId && board) {
    const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);
    const node = board.nodes[selectedNodeId];
    node.x = wX + interactionOffset.x;
    node.y = wY + interactionOffset.y;
    render();
  } else if (interactionMode === 'resize-node' && selectedNodeId && board) {
    const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);
    const node = board.nodes[selectedNodeId];
    
    const newWidth = Math.max(MIN_WIDTH, wX - node.x);
    const newHeight = Math.max(MIN_HEIGHT, wY - node.y);
    
    node.width = newWidth;
    node.height = newHeight;
    render();
  } else if (interactionMode === 'draw-connector' && tempConnectorLine && board) {
    const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);
    tempConnectorLine.setAttribute('x2', String(wX));
    tempConnectorLine.setAttribute('y2', String(wY));
    
    let target: string | null = null;
    const activeNodes = Object.entries(board.nodes)
      .filter(([_, n]) => !n.deleted)
      .sort((a, b) => b[1].zIndex - a[1].zIndex);
      
    for (const [id, node] of activeNodes) {
      if (wX >= node.x && wX <= node.x + node.width && wY >= node.y && wY <= node.y + node.height) {
        target = id;
        break;
      }
    }
    
    if (hoveredNodeId !== target) {
      hoveredNodeId = target;
      render();
    }
  }
}

function handlePointerUp(e: PointerEvent) {
  if (interactionMode === 'drag-node' || interactionMode === 'resize-node') {
    if (selectedNodeId) {
      dirtyNodes.add(selectedNodeId);
      onChange(dirtyNodes, dirtyConnectors);
    }
  } else if (interactionMode === 'draw-connector' && board && connectorStartNodeId) {
    if (tempConnectorLine) {
      tempConnectorLine.remove();
      tempConnectorLine = null;
    }
    
    if (hoveredNodeId && hoveredNodeId !== connectorStartNodeId) {
      try {
        const newId = addConnector(board, connectorStartNodeId, hoveredNodeId);
        dirtyConnectors.add(newId);
        onChange(dirtyNodes, dirtyConnectors);
      } catch (err) {
        // e.g. duplicate connector
      }
    }
    hoveredNodeId = null;
    render();
  }
  
  interactionMode = 'none';
}

function handleDoubleClick(e: MouseEvent) {
  if (!board) return;
  const target = e.target as SVGElement;
  
  const nodeGroup = target.closest('g.node-group') as SVGGElement;
  if (nodeGroup && nodeGroup.dataset.id) {
    onDoubleClickNode(nodeGroup.dataset.id);
    return;
  }
  
  // Double click empty space to create node
  const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);
  
  // default zIndex
  let maxZ = 0;
  for (const n of Object.values(board.nodes)) {
    if (!n.deleted && n.zIndex > maxZ) maxZ = n.zIndex;
  }
  
  const newId = addNode(board, {
    type: 'rectangle',
    x: wX,
    y: wY,
    width: 240,
    height: 120,
    zIndex: maxZ + 1,
    text: '',
    deleted: false
  });
  
  dirtyNodes.add(newId);
  selectedNodeId = newId;
  selectedConnectorId = null;
  onSelect(newId);
  onChange(dirtyNodes, dirtyConnectors);
  render();
  
  // enter text edit mode immediately
  startTextEdit(newId);
}

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  
  // Pinch zoom usually emits wheel with ctrlKey on mac/trackpad
  // Normal scroll pans
  
  if (e.ctrlKey) {
    // Zoom around pointer
    const zoomFactor = 1.05;
    let newZoom = zoom;
    if (e.deltaY < 0) {
      newZoom *= zoomFactor;
    } else {
      newZoom /= zoomFactor;
    }
    
    newZoom = Math.max(0.1, Math.min(4.0, newZoom));
    
    // Adjust pan so the pointer world coordinate stays the same
    const rect = svg.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    
    // (cx - panX) / zoom = worldX => panX = cx - worldX * zoom
    const wX = (cx - panX) / zoom;
    const wY = (cy - panY) / zoom;
    
    zoom = newZoom;
    panX = cx - wX * zoom;
    panY = cy - wY * zoom;
    
  } else {
    // Pan
    panX -= e.deltaX;
    panY -= e.deltaY;
  }
  render();
}

function handleKeyDown(e: KeyboardEvent) {
  // Ignore if editing text
  if (document.querySelector('.text-edit-overlay')) return;
  
  if (e.key === 'Enter' && selectedNodeId) {
    startTextEdit(selectedNodeId);
    e.preventDefault();
    return;
  }
  
  if (e.key === 'Escape') {
    if (interactionMode !== 'none') {
      // cancel interaction (MVP: just stop)
      interactionMode = 'none';
      if (tempConnectorLine) tempConnectorLine.remove();
    }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedNodeId && board && !board.nodes[selectedNodeId].deleted) {
      updateNode(board, selectedNodeId, { deleted: true });
      dirtyNodes.add(selectedNodeId);
      
      // Tombstone incident connectors
      for (const [eId, conn] of Object.entries(board.connectors)) {
        if (!conn.deleted && (conn.sourceNodeId === selectedNodeId || conn.targetNodeId === selectedNodeId)) {
          markConnectorDeleted(board, eId);
          dirtyConnectors.add(eId);
        }
      }
      
      selectedNodeId = null;
      onSelect(null);
      onChange(dirtyNodes, dirtyConnectors);
      render();
    } else if (selectedConnectorId && board && !board.connectors[selectedConnectorId].deleted) {
      markConnectorDeleted(board, selectedConnectorId);
      dirtyConnectors.add(selectedConnectorId);
      selectedConnectorId = null;
      onChange(dirtyNodes, dirtyConnectors);
      render();
    }
  }
}

export function fitView() {
  if (!board) return;
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  let hasNodes = false;
  for (const node of Object.values(board.nodes)) {
    if (!node.deleted) {
      hasNodes = true;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
  }
  
  const container = svg.parentElement;
  if (!container) return;
  
  if (!hasNodes) {
    zoom = 1;
    panX = container.clientWidth / 2;
    panY = container.clientHeight / 2;
    render();
    return;
  }
  
  const padding = 64;
  const boardW = maxX - minX;
  const boardH = maxY - minY;
  
  const viewW = container.clientWidth - padding * 2;
  const viewH = container.clientHeight - padding * 2;
  
  zoom = Math.min(viewW / boardW, viewH / boardH);
  zoom = Math.max(0.1, Math.min(4.0, zoom));
  
  panX = -minX * zoom + padding + (viewW - boardW * zoom) / 2;
  panY = -minY * zoom + padding + (viewH - boardH * zoom) / 2;
  
  render();
}

function screenToWorld(clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (clientX - rect.left - panX) / zoom,
    y: (clientY - rect.top - panY) / zoom
  };
}

function render() {
  if (!board || !svg) return;
  
  // Set zoom label
  const zoomLabel = document.getElementById('zoom-level');
  if (zoomLabel) {
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
  
  // Create a transform group
  let gTransform = svg.querySelector('g#world-transform') as SVGGElement;
  if (!gTransform) {
    gTransform = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gTransform.id = 'world-transform';
    svg.appendChild(gTransform);
  }
  
  gTransform.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
  gTransform.innerHTML = ''; // Rebuild all for MVP simplicity

  // Connectors (rendered behind)
  for (const [id, conn] of Object.entries(board.connectors)) {
    if (conn.deleted) continue;
    
    const nodeA = board.nodes[conn.sourceNodeId];
    const nodeB = board.nodes[conn.targetNodeId];
    if (!nodeA || !nodeB || nodeA.deleted || nodeB.deleted) continue;
    
    const p1 = getBoundaryIntersection(nodeA, nodeB);
    const p2 = getBoundaryIntersection(nodeB, nodeA);
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('connector-group');
    g.dataset.id = id;
    
    // hit target (thicker invisible line)
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hit.setAttribute('x1', String(p1.x));
    hit.setAttribute('y1', String(p1.y));
    hit.setAttribute('x2', String(p2.x));
    hit.setAttribute('y2', String(p2.y));
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '16');
    hit.style.cursor = 'pointer';
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.classList.add('connector-line');
    if (id === selectedConnectorId) line.classList.add('selected');
    line.setAttribute('x1', String(p1.x));
    line.setAttribute('y1', String(p1.y));
    line.setAttribute('x2', String(p2.x));
    line.setAttribute('y2', String(p2.y));
    
    g.appendChild(hit);
    g.appendChild(line);
    gTransform.appendChild(g);
  }

  // Nodes (sorted by zIndex)
  const activeNodes = Object.entries(board.nodes)
    .filter(([_, n]) => !n.deleted)
    .sort((a, b) => a[1].zIndex - b[1].zIndex);
    
  for (const [id, node] of activeNodes) {
    const isSelected = id === selectedNodeId;
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('node-group');
    g.dataset.id = id;
    g.setAttribute('transform', `translate(${node.x}, ${node.y})`);
    
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('node-rect');
    if (isSelected) rect.classList.add('selected');
    if (id === hoveredNodeId && interactionMode === 'draw-connector' && id !== connectorStartNodeId) rect.classList.add('hover-target');
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    
    // Text rendering (centered multi-line SVG text)
    const textG = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textG.classList.add('node-text');
    textG.setAttribute('x', String(node.width / 2));
    textG.setAttribute('y', String(node.height / 2));
    textG.setAttribute('text-anchor', 'middle');
    textG.setAttribute('dominant-baseline', 'central');
    
    const lines = node.text.split('\n');
    const startDy = -((lines.length - 1) / 2) * 1.2;
    for (let i = 0; i < lines.length; i++) {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', String(node.width / 2));
      tspan.setAttribute('dy', i === 0 ? `${startDy}em` : '1.2em');
      tspan.textContent = lines[i];
      textG.appendChild(tspan);
    }
    
    g.appendChild(rect);
    g.appendChild(textG);
    
    // Comment badge
    let openCount = 0;
    for (const c of Object.values(board.comments)) {
      if (c.nodeId === id && c.state === 'OPEN') openCount++;
    }
    
    if (openCount > 0 || isSelected) {
      const badgeX = node.width - 12;
      const badgeY = 12;
      
      const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      
      const badgeBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      badgeBg.classList.add('comment-badge');
      badgeBg.setAttribute('cx', String(badgeX));
      badgeBg.setAttribute('cy', String(badgeY));
      badgeBg.setAttribute('r', '10');
      // If no open comments but selected, make it a faint affordance
      if (openCount === 0) {
        badgeBg.style.fill = '#cbd5e1';
      }
      
      const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badgeText.classList.add('comment-badge-text');
      badgeText.setAttribute('x', String(badgeX));
      badgeText.setAttribute('y', String(badgeY));
      badgeText.textContent = openCount > 0 ? String(openCount) : '+';
      
      badgeG.appendChild(badgeBg);
      badgeG.appendChild(badgeText);
      g.appendChild(badgeG);
    }
    
    // Selection handles
    if (isSelected) {
      // Connect handle (right center)
      const cHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      cHandle.classList.add('connect-handle');
      cHandle.setAttribute('cx', String(node.width));
      cHandle.setAttribute('cy', String(node.height / 2));
      cHandle.setAttribute('r', '6');
      g.appendChild(cHandle);
      
      // Resize handle (bottom right)
      const rHandle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rHandle.classList.add('resize-handle');
      rHandle.setAttribute('x', String(node.width - 5));
      rHandle.setAttribute('y', String(node.height - 5));
      rHandle.setAttribute('width', '10');
      rHandle.setAttribute('height', '10');
      g.appendChild(rHandle);
    }
    
    gTransform.appendChild(g);
  }
  
  if (tempConnectorLine && interactionMode === 'draw-connector') {
    gTransform.appendChild(tempConnectorLine);
  }
}
