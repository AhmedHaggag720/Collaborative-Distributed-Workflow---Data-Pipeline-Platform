import React from 'react';
import type { ConnectionDraft } from '../../types/canvas';

interface ConnectionDraftEdgeProps {
  draft: ConnectionDraft;
}

export const ConnectionDraftEdge: React.FC<ConnectionDraftEdgeProps> = ({ draft }) => {
  const startX = draft.sourcePos.x;
  const startY = draft.sourcePos.y;
  const endX = draft.currentPos.x;
  const endY = draft.currentPos.y;

  const dx = Math.max(40, Math.abs(endX - startX) * 0.5);
  const path = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

  return (
    <g className="pointer-events-none">
      <path
        d={path}
        stroke="#818CF8"
        strokeWidth="3"
        strokeDasharray="6,4"
        className="animate-[dash_0.5s_linear_infinite]"
        fill="none"
      />
      <circle cx={endX} cy={endY} r="5" fill="#818CF8" />
    </g>
  );
};
