export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuadtreeItem<T = unknown> {
  id: string;
  bounds: Rect;
  data: T;
}

/**
 * High-performance 2D Quadtree spatial index for viewport culling and collision detection.
 * Enables 60 FPS rendering on canvases with 1,000+ nodes by querying only visible items in O(log N).
 */
export class Quadtree<T = unknown> {
  private maxItems: number;
  private maxDepth: number;
  private depth: number;
  private bounds: Rect;
  private items: QuadtreeItem<T>[] = [];
  private nodes: Quadtree<T>[] = [];

  constructor(bounds: Rect, maxItems = 10, maxDepth = 6, depth = 0) {
    this.bounds = bounds;
    this.maxItems = maxItems;
    this.maxDepth = maxDepth;
    this.depth = depth;
  }

  public clear(): void {
    this.items = [];
    for (const node of this.nodes) {
      node.clear();
    }
    this.nodes = [];
  }

  private subdivide(): void {
    const halfW = this.bounds.width / 2;
    const halfH = this.bounds.height / 2;
    const x = this.bounds.x;
    const y = this.bounds.y;

    // Top-left, top-right, bottom-left, bottom-right
    this.nodes = [
      new Quadtree({ x, y, width: halfW, height: halfH }, this.maxItems, this.maxDepth, this.depth + 1),
      new Quadtree({ x: x + halfW, y, width: halfW, height: halfH }, this.maxItems, this.maxDepth, this.depth + 1),
      new Quadtree({ x, y: y + halfH, width: halfW, height: halfH }, this.maxItems, this.maxDepth, this.depth + 1),
      new Quadtree({ x: x + halfW, y: y + halfH, width: halfW, height: halfH }, this.maxItems, this.maxDepth, this.depth + 1),
    ];
  }

  private intersects(r1: Rect, r2: Rect): boolean {
    return !(
      r2.x > r1.x + r1.width ||
      r2.x + r2.width < r1.x ||
      r2.y > r1.y + r1.height ||
      r2.y + r2.height < r1.y
    );
  }

  public insert(item: QuadtreeItem<T>): void {
    if (!this.intersects(this.bounds, item.bounds)) {
      return;
    }

    if (this.nodes.length > 0) {
      for (const node of this.nodes) {
        node.insert(item);
      }
      return;
    }

    this.items.push(item);

    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this.subdivide();
      for (const it of this.items) {
        for (const node of this.nodes) {
          node.insert(it);
        }
      }
      this.items = [];
    }
  }

  public query(viewport: Rect, results = new Set<QuadtreeItem<T>>()): QuadtreeItem<T>[] {
    if (!this.intersects(this.bounds, viewport)) {
      return Array.from(results);
    }

    for (const item of this.items) {
      if (this.intersects(item.bounds, viewport)) {
        results.add(item);
      }
    }

    if (this.nodes.length > 0) {
      for (const node of this.nodes) {
        node.query(viewport, results);
      }
    }

    return Array.from(results);
  }
}
