import React from 'react';
import type { Collaborator } from '../../lib/yjs/useYjsRoom';

interface PresenceCursorsProps {
  peers: Collaborator[];
  pan: { x: number; y: number };
  zoom: number;
}

export const PresenceCursors: React.FC<PresenceCursorsProps> = ({ peers, pan, zoom }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {peers.map((peer) => {
        if (!peer.cursor) return null;

        // Convert world coordinates to screen space
        const screenX = peer.cursor.x * zoom + pan.x;
        const screenY = peer.cursor.y * zoom + pan.y;

        return (
          <div
            key={peer.id}
            style={{
              transform: `translate(${screenX}px, ${screenY}px)`,
              transition: 'transform 80ms ease-out',
            }}
            className="absolute top-0 left-0 flex items-start gap-1 select-none pointer-events-none"
          >
            {/* SVG Cursor Pointer */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-lg"
            >
              <path
                d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
                fill={peer.color}
                stroke="#0B0F19"
                strokeWidth="1.2"
              />
            </svg>

            {/* Peer User Name Tag */}
            <div
              style={{ backgroundColor: peer.color }}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-950 shadow-md whitespace-nowrap"
            >
              {peer.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};
