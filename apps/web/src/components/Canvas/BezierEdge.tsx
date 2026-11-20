import React from 'react';
import type { Edge, Node } from '@flowmesh/schema';
import { X } from 'lucide-react';

interface BezierEdgeProps {
  edge: Edge;
  sourceNode?: Node;
  targetNode?: Node;
  isActive?: boolean;
  onDelete?: (edgeId: string) => void;
}

export const BezierEdge: React.FC<BezierEdgeProps> = ({
  edge,
  sourceNode,
  targetNode,
  isActive = false,
  onDelete,
}) => {
  if (!sourceNode || !targetNode) return null;

  const sourceWidth = sourceNode.width || 240;
  const startX = sourceNode.position.x + sourceWidth;
  const startY = sourceNode.position.y + 60;

  const endX = targetNode.position.x;
  const endY = targetNode.position.y + 60;

  const dx = Math.max(40, Math.abs(endX - startX) * 0.5);
  const path = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  return (
    <g className="group pointer-events-auto cursor-pointer">
      {/* Invisible wider hit-target for hover & click */}
      <path
        d={path}
        stroke="transparent"
        strokeWidth="20"
        fill="none"
        onClick={() => onDelete?.(edge.id)}
      />

      {/* Shadow / Glow line */}
      <path
        d={path}
        stroke={isActive ? '#10B981' : '#1E293B'}
        strokeWidth={isActive ? '6' : '4'}
        strokeOpacity={isActive ? '0.4' : '0.8'}
        fill="none"
      />

      {/* Main Bézier Curve */}
      <path
        d={path}
        stroke={isActive ? '#10B981' : '#6366F1'}
        strokeWidth="2.5"
        strokeDasharray={edge.animated ? '8,4' : 'none'}
        className={edge.animated ? 'animate-[dash_1s_linear_infinite]' : ''}
        fill="none"
      />

      {/* Edge Hover Action (Delete) */}
      <g
        transform={`translate(${midX}, ${midY})`}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(edge.id);
        }}
      >
        <circle r="12" fill="#1E293B" stroke="#EF4444" strokeWidth="1.5" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </g>
  );
};
