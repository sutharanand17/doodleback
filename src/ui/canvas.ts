import { BoardDocument } from '../core/types.js';
import { getBoundaryIntersection } from '../core/geometry.js';
import { addNode, updateNode, addConnector, markConnectorDeleted } from '../core/operations.js';

const MIN_WIDTH = 160;
const MIN_HEIGHT = 80;
const GRID_SIZE = 20;

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

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

let selectedNodeIds = new Set<string>();
let selectedConnectorId: string | null = null;
let hoveredNodeId: string | null = null;

let panX = 0;
let panY = 0;
let zoom = 1;

// Interaction state
let interactionMode: 'none' | 'pan' | 'drag-node' | 'resize-node' | 'draw-connector' | 'marquee' = 'none';
let interactionStart = { x: 0, y: 0 };
let dragOffsets = new Map<string, { x: number, y: number }>();
let connectorStartNodeId: string | null = null;
let marqueeRect: SVGRectElement | null = null;
let marqueeInitialSelection = new Set<string>();
let tempConnectorLine: SVGLineElement | null = null;
let isCommentsPanelActive = false;

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
  
  document.addEventListener('pointerdown', (e) => {
    isCommentsPanelActive = !!(e.target as Element)?.closest?.('.comments-panel');
  });

  // Floating toolbar events
  const btnToggleType = document.getElementById('btn-toggle-type');
  btnToggleType?.addEventListener('click', () => {
    if (selectedNodeIds.size === 1) {
      const id = Array.from(selectedNodeIds)[0];
      if (board?.nodes[id]) {
        const node = board.nodes[id];
        const newType = node.type === 'rectangle' ? 'text' : 'rectangle';
        updateNode(board, id, { type: newType });
        dirtyNodes.add(id);
      onChange(dirtyNodes, dirtyConnectors);
        render();
      }
    }
  });

  render();
}

export function updateBoard(newBoard: BoardDocument) {
  board = newBoard;
  dirtyNodes.clear();
  dirtyConnectors.clear();
  render();
}

export function getSelectedNodeId() {
  return selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
}

export function startTextEdit(nodeId: string) {
  if (!board || !board.nodes[nodeId]) return;
  const node = board.nodes[nodeId];
  
  const container = svg.parentElement;
  if (!container) return;
  
  const editor = document.createElement('div');
  editor.className = 'text-edit-overlay';
  editor.contentEditable = 'true';
  editor.innerText = node.text;
  
  const screenX = node.x * zoom + panX;
  const screenY = node.y * zoom + panY;
  const screenW = node.width * zoom;
  const screenH = node.height * zoom;
  
  editor.style.left = `${screenX}px`;
  editor.style.top = `${screenY}px`;
  editor.style.width = `${screenW}px`;
  editor.style.height = `${screenH}px`;
  editor.style.fontSize = `${14 * zoom}px`;
  
  const nodeGroup = svg.querySelector(`g.node-group[data-id="${nodeId}"]`);
  if (nodeGroup) nodeGroup.classList.add('editing');
  
  container.appendChild(editor);
  
  // Focus and place cursor at end
  editor.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false); // false means to the end
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  
  const commitEdit = () => {
    const newText = editor.innerText;
    if (newText !== node.text) {
      updateNode(board!, nodeId, { text: newText });
      dirtyNodes.add(nodeId);
      onChange(dirtyNodes, dirtyConnectors);
    }
    if (nodeGroup) nodeGroup.classList.remove('editing');
    editor.remove();
    render();
  };
  
  editor.addEventListener('blur', commitEdit);
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      editor.innerText = node.text; // cancel
      editor.blur();
    }
    // Allow enter for multiline
  });
}

function handlePointerDown(e: PointerEvent) {
  if (!board || e.button !== 0) return; // Only left click
  
  const target = e.target as SVGElement;
  const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);

  if (target.classList.contains('resize-handle')) {
    interactionMode = 'resize-node';
    interactionStart = { x: wX, y: wY };
    marqueeInitialSelection = new Set(selectedNodeIds);
    e.stopPropagation();
    return;
  }
  
  if (target.classList.contains('connect-handle')) {
    interactionMode = 'draw-connector';
    connectorStartNodeId = Array.from(selectedNodeIds)[0];
    
    tempConnectorLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tempConnectorLine.classList.add('connector-line');
    tempConnectorLine.setAttribute('marker-end', 'url(#arrowhead)');
    
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
    let needsRender = false;
    let isDeselecting = false;

    if (e.shiftKey) {
      if (selectedNodeIds.has(id)) {
        selectedNodeIds.delete(id);
        isDeselecting = true;
        if (selectedNodeIds.size === 1) onSelect(Array.from(selectedNodeIds)[0]);
        else onSelect(null);
      } else {
        selectedNodeIds.add(id);
        selectedConnectorId = null;
        if (selectedNodeIds.size === 1) onSelect(id);
        else onSelect(null);
      }
      needsRender = true;
    } else {
      if (!selectedNodeIds.has(id)) {
        selectedNodeIds.clear();
        selectedNodeIds.add(id);
        selectedConnectorId = null;
        onSelect(id);
        needsRender = true;
      }
    }
    
    if (!isDeselecting) {
      // Raise zIndex
      const node = board.nodes[id];
      let maxZ = 0;
      for (const n of Object.values(board.nodes)) {
        if (!n.deleted && n.zIndex > maxZ) maxZ = n.zIndex;
      }

      if (node.zIndex < maxZ) {
        updateNode(board, id, { zIndex: maxZ + 1 });
        dirtyNodes.add(id);
        needsRender = true;
      }

      interactionMode = 'drag-node';

      dragOffsets.clear();
      for (const sId of selectedNodeIds) {
        const sNode = board.nodes[sId];
        if (sNode) {
          dragOffsets.set(sId, { x: sNode.x - wX, y: sNode.y - wY });
        }
      }
    } else {
      interactionMode = 'none'; // Prevent drag when deselecting
    }
    
    if (needsRender) render();
    e.stopPropagation();
    return;
  }
  
  const connectorGroup = target.closest('g.connector-group') as SVGGElement;
  if (connectorGroup && connectorGroup.dataset.id) {
    const id = connectorGroup.dataset.id;
    const wasSelected = selectedConnectorId === id;
    selectedConnectorId = id;
    selectedNodeIds.clear();
    if (!wasSelected) {
      onSelect(null);
      render();
    }
    e.stopPropagation();
    return;
  }

  // Clicked empty space
  const wasEmpty = selectedNodeIds.size === 0 && selectedConnectorId === null;

  if (!e.shiftKey) {
    selectedNodeIds.clear();
    selectedConnectorId = null;
    if (!wasEmpty) {
      onSelect(null);
      render();
    }
  }
  
  if (e.shiftKey) {
    interactionMode = 'marquee';
    interactionStart = { x: wX, y: wY };
    marqueeInitialSelection = new Set(selectedNodeIds);
    marqueeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    marqueeRect.classList.add('marquee-rect');
    marqueeRect.setAttribute('fill', 'rgba(59, 130, 246, 0.1)');
    marqueeRect.setAttribute('stroke', 'rgba(59, 130, 246, 0.5)');
    marqueeRect.setAttribute('stroke-width', '1');
    const gTransform = svg.querySelector('g#world-transform') || svg;
    gTransform.appendChild(marqueeRect);
  } else {
    interactionMode = 'pan';
    interactionStart = { x: e.clientX, y: e.clientY };
  }
}

function handlePointerMove(e: PointerEvent) {
  if (interactionMode === 'pan') {
    const dx = e.clientX - interactionStart.x;
    const dy = e.clientY - interactionStart.y;
    panX += dx;
    panY += dy;
    interactionStart = { x: e.clientX, y: e.clientY };
    render();
  } else if (interactionMode === 'marquee' && marqueeRect && board) {
    const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);
    const x = Math.min(interactionStart.x, wX);
    const y = Math.min(interactionStart.y, wY);
    const width = Math.abs(wX - interactionStart.x);
    const height = Math.abs(wY - interactionStart.y);

    marqueeRect.setAttribute('x', String(x));
    marqueeRect.setAttribute('y', String(y));
    marqueeRect.setAttribute('width', String(width));
    marqueeRect.setAttribute('height', String(height));

    selectedNodeIds.clear();
    for (const id of marqueeInitialSelection) {
      selectedNodeIds.add(id);
    }

    for (const [id, node] of Object.entries(board.nodes)) {
      if (!node.deleted) {
        if (node.x < x + width && node.x + node.width > x &&
            node.y < y + height && node.y + node.height > y) {
          selectedNodeIds.add(id);
        }
      }
    }

    if (selectedNodeIds.size === 1) onSelect(Array.from(selectedNodeIds)[0]);
    else onSelect(null);

    render();
  } else if (interactionMode === 'drag-node' && selectedNodeIds.size > 0 && board) {
    const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);
    for (const id of selectedNodeIds) {
      const node = board.nodes[id];
      const offset = dragOffsets.get(id);
      if (node && offset) {
        node.x = snap(wX + offset.x);
        node.y = snap(wY + offset.y);
      }
    }
    render();
  } else if (interactionMode === 'resize-node' && selectedNodeIds.size === 1 && board) {
    const { x: wX, y: wY } = screenToWorld(e.clientX, e.clientY);
    const id = Array.from(selectedNodeIds)[0];
    const node = board.nodes[id];
    const newWidth = snap(Math.max(MIN_WIDTH, wX - node.x));
    const newHeight = snap(Math.max(MIN_HEIGHT, wY - node.y));
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

function handlePointerUp(_e: PointerEvent) {
  if (interactionMode === 'drag-node' || interactionMode === 'resize-node') {
    for (const id of selectedNodeIds) {
      dirtyNodes.add(id);
    }
    if (selectedNodeIds.size > 0) onChange(dirtyNodes, dirtyConnectors);
  } else if (interactionMode === 'marquee') {
    if (marqueeRect) {
      marqueeRect.remove();
      marqueeRect = null;
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
    x: snap(wX),
    y: snap(wY),
    width: snap(240),
    height: snap(120),
    zIndex: maxZ + 1,
    text: '',
    deleted: false
  });
  
  dirtyNodes.add(newId);
  selectedNodeIds.clear();
  selectedNodeIds.add(newId);
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
  // Ignore if editing text, interacting with UI inputs, or if comments panel was last clicked
  if (
    document.querySelector('.text-edit-overlay') ||
    document.activeElement?.tagName === 'INPUT' ||
    document.activeElement?.tagName === 'TEXTAREA' ||
    (document.activeElement as HTMLElement)?.isContentEditable ||
    isCommentsPanelActive
  ) {
    return;
  }
  
  if (e.key === 'Enter' && selectedNodeIds.size === 1) {
    startTextEdit(Array.from(selectedNodeIds)[0]);
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
    if (selectedNodeIds.size > 0 && board) {
      for (const id of selectedNodeIds) {
        if (!board.nodes[id].deleted) {
          updateNode(board, id, { deleted: true });
          dirtyNodes.add(id);

          for (const [eId, conn] of Object.entries(board.connectors)) {
            if (!conn.deleted && (conn.sourceNodeId === id || conn.targetNodeId === id)) {
              markConnectorDeleted(board, eId);
              dirtyConnectors.add(eId);
            }
          }
        }
      }
      selectedNodeIds.clear();
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
  
  // Sync background to pan and zoom
  if (svg.parentElement) {
    svg.parentElement.style.backgroundPosition = `${panX}px ${panY}px`;
    svg.parentElement.style.backgroundSize = `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`;
  }

  // Defs for markers
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.id = 'arrowhead';
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    // inherit fill from the line's stroke
    polygon.style.fill = 'var(--node-border)';

    marker.appendChild(polygon);
    defs.appendChild(marker);

    const markerSelected = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    markerSelected.id = 'arrowhead-selected';
    markerSelected.setAttribute('markerWidth', '10');
    markerSelected.setAttribute('markerHeight', '7');
    markerSelected.setAttribute('refX', '9');
    markerSelected.setAttribute('refY', '3.5');
    markerSelected.setAttribute('orient', 'auto');

    const polygonSelected = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygonSelected.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygonSelected.style.fill = 'var(--node-selected)';

    markerSelected.appendChild(polygonSelected);
    defs.appendChild(markerSelected);
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
    if (id === selectedConnectorId) {
      line.classList.add('selected');
      line.setAttribute('marker-end', 'url(#arrowhead-selected)');
    } else {
      line.setAttribute('marker-end', 'url(#arrowhead)');
    }

    line.setAttribute('x1', String(p1.x));
    line.setAttribute('y1', String(p1.y));
    line.setAttribute('x2', String(p2.x));
    line.setAttribute('y2', String(p2.y));
    
    g.appendChild(hit);
    g.appendChild(line);
    gTransform.appendChild(g);
  }

  // ⚡ Bolt Optimization: Pre-compute comment counts to avoid O(N*C) render loop
  const commentCounts = new Map<string, number>();
  for (const c of Object.values(board.comments)) {
    commentCounts.set(c.nodeId, (commentCounts.get(c.nodeId) || 0) + 1);
  }

  // Nodes (sorted by zIndex)
  const activeNodes = Object.entries(board.nodes)
    .filter(([_, n]) => !n.deleted)
    .sort((a, b) => a[1].zIndex - b[1].zIndex);
    
  for (const [id, node] of activeNodes) {
    const isSelected = selectedNodeIds.has(id);
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('node-group');
    g.dataset.id = id;
    g.setAttribute('transform', `translate(${node.x}, ${node.y})`);
    
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('node-rect');
    if (node.type === 'text') rect.classList.add('node-type-text');
    if (isSelected) rect.classList.add('selected');
    if (id === hoveredNodeId && interactionMode === 'draw-connector' && id !== connectorStartNodeId) rect.classList.add('hover-target');
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    
    // Text rendering via foreignObject for wrapping
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreign.classList.add('node-text-container');
    const maxH = 2000;
    foreign.setAttribute('x', '0');
    foreign.setAttribute('y', String((node.height - maxH) / 2));
    foreign.setAttribute('width', String(node.width));
    foreign.setAttribute('height', String(maxH));
    foreign.setAttribute('overflow', 'visible');
    
    const div = document.createElement('div');
    div.classList.add('node-text');
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.textAlign = 'center';
    div.style.padding = '8px';
    div.style.boxSizing = 'border-box';
    div.style.wordWrap = 'break-word';
    div.style.whiteSpace = 'pre-wrap';
    div.style.color = 'var(--text-primary)';
    div.style.margin = '0';
    div.textContent = node.text;
    
    foreign.appendChild(div);
    
    g.appendChild(rect);
    g.appendChild(foreign);
    
    // Comment badge
    const totalComments = commentCounts.get(id) || 0;
    const hasComments = totalComments > 0;
    
    const isOpen = node.commentState === 'OPEN' || (!node.commentState && hasComments);
    
    if ((hasComments && isOpen) || isSelected) {
      const badgeX = node.width - 12;
      const badgeY = 12;
      
      const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      
      const badgeBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      badgeBg.classList.add('comment-badge');
      badgeBg.setAttribute('cx', String(badgeX));
      badgeBg.setAttribute('cy', String(badgeY));
      badgeBg.setAttribute('r', '10');
      
      // Determine badge color based on state
      if (totalComments === 0) {
        badgeBg.style.fill = '#cbd5e1'; // Faint affordance
      } else if (node.commentState === 'ACCEPTED' || node.commentState === 'APPLIED') {
        badgeBg.style.fill = '#16a34a'; // Green
      } else if (node.commentState === 'CLOSED' || node.commentState === 'REJECTED' || node.commentState === 'DEFERRED') {
        badgeBg.style.fill = '#94a3b8'; // Muted Grey
      }
      
      const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badgeText.classList.add('comment-badge-text');
      badgeText.setAttribute('x', String(badgeX));
      badgeText.setAttribute('y', String(badgeY));
      badgeText.textContent = totalComments > 0 ? String(totalComments) : '+';
      
      badgeG.appendChild(badgeBg);
      badgeG.appendChild(badgeText);
      g.appendChild(badgeG);
    }
    
    // Selection handles (only if exactly 1 is selected)
    if (isSelected && selectedNodeIds.size === 1) {
      // Connect handle (right center)
      const cHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      cHandle.classList.add('connect-handle');
      cHandle.setAttribute('cx', String(node.width));
      cHandle.setAttribute('cy', String(node.height / 2));
      cHandle.setAttribute('r', '5'); // slightly smaller for a refined look
      g.appendChild(cHandle);
      
      // Resize handle (bottom right)
      const rHandle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rHandle.classList.add('resize-handle');
      rHandle.setAttribute('x', String(node.width - 6)); // offset by 6
      rHandle.setAttribute('y', String(node.height - 6));
      rHandle.setAttribute('width', '12'); // slightly larger but centered on corner
      rHandle.setAttribute('height', '12');
      rHandle.setAttribute('rx', '2'); // rounded corners in case CSS doesn't apply cleanly here
      g.appendChild(rHandle);
    }
    
    gTransform.appendChild(g);
  }
  
  // Update floating toolbar
  const floatingToolbar = document.getElementById('node-floating-toolbar');
  if (floatingToolbar) {
    if (selectedNodeIds.size === 1) {
      const id = Array.from(selectedNodeIds)[0];
      if (board.nodes[id] && !board.nodes[id].deleted) {
        const node = board.nodes[id];
        const screenX = node.x * zoom + panX;
        const screenY = node.y * zoom + panY;
        floatingToolbar.style.left = `${screenX}px`;
        floatingToolbar.style.top = `${screenY - 34}px`;
        floatingToolbar.classList.remove('hidden');
      } else {
        floatingToolbar.classList.add('hidden');
      }
    } else {
      floatingToolbar.classList.add('hidden');
    }
  }
  
  if (tempConnectorLine && interactionMode === 'draw-connector') {
    gTransform.appendChild(tempConnectorLine);
  }
}
