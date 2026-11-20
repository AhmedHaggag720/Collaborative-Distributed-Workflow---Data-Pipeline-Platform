export interface Point {
  x: number;
  y: number;
}

export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface ConnectionDraft {
  sourceNodeId: string;
  sourcePortId: string;
  sourcePos: Point;
  currentPos: Point;
}

export interface DragItem {
  id: string;
  startX: number;
  startY: number;
  nodeStartX: number;
  nodeStartY: number;
}
