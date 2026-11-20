import React from 'react';
import type { Node } from '@flowmesh/schema';

interface MiniMapProps {
  nodes: Node[];
  pan: { x: number; y: number };
  zoom: number;
}

export const MiniMap: React.FC<MiniMapProps> = ({ nodes, pan, zoom }) => {
  if (nodes.length === 0) return null;

  const minX = Math.min(...nodes.map((n) => n.position.x), 0);
  const maxX = Math.max(...nodes.map((n) => n.position.x + (n.width || 240)), 1200);
  const minY = Math.min(...nodes.map((n) => n.position.y), 0);
  const maxY = Math.max(...nodes.map((n) => n.position.y + (n.height || 140)), 800);

  const worldWidth = maxX - minX;
  const worldHeight = maxY - minY;

  const mapWidth = 140;
  const mapHeight = 90;

  const scaleX = mapWidth / (worldWidth || 1);
  const scaleY = mapHeight / (worldHeight || 1);
  const scale = Math.min(scaleX, scaleY);

  return (
    <div className="absolute bottom-4 right-4 z-20 w-[140px] h-[90px] bg-slate-950/80 border border-slate-800 rounded-lg backdrop-blur-md overflow-hidden shadow-2xl pointer-events-none">
      <div className="relative w-full h-full">
        {nodes.map((node) => (
          <div
            key={node.id}
            style={{
              left: `${(node.position.x - minX) * scale}px`,
              top: `${(node.position.y - minY) * scale}px`,
              width: `${(node.width || 240) * scale}px`,
              height: `${(node.height || 140) * scale}px`,
            }}
            className="absolute rounded-[2px] bg-indigo-500/60 border border-indigo-400"
          />
        ))}

        {/* Viewport Frame */}
        <div
          style={{
            left: `${(-pan.x - minX) * scale}px`,
            top: `${(-pan.y - minY) * scale}px`,
            width: `${(window.innerWidth / zoom) * scale}px`,
            height: `${(window.innerHeight / zoom) * scale}px`,
          }}
          className="absolute border border-emerald-400/80 bg-emerald-400/10 pointer-events-none"
        />
      </div>
    </div>
  );
};
