import React from 'react';
import type { Collaborator } from '../../lib/yjs/useYjsRoom';
import { Users, Wifi, WifiOff } from 'lucide-react';

interface PeerBadgesProps {
  peers: Collaborator[];
  currentUser: { name: string; color: string };
  isOnline: boolean;
  onToggleOnline: () => void;
}

export const PeerBadges: React.FC<PeerBadgesProps> = ({
  peers,
  currentUser,
  isOnline,
  onToggleOnline,
}) => {
  return (
    <div className="flex items-center gap-2">
      {/* Network Online / Offline Simulation Toggle */}
      <button
        onClick={onToggleOnline}
        title={isOnline ? 'Click to simulate network disconnection' : 'Click to reconnect and sync changes'}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
          isOnline
            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60'
            : 'bg-rose-950/80 border-rose-800 text-rose-300 hover:bg-rose-900/80 animate-pulse'
        }`}
      >
        {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
        <span>{isOnline ? 'Multiplayer Live' : 'Offline Mode (Local-First)'}</span>
      </button>

      {/* Collaborator Avatars */}
      <div className="flex items-center -space-x-1.5">
        {/* Local user badge */}
        <div
          style={{ backgroundColor: currentUser.color }}
          title={`You (${currentUser.name})`}
          className="w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-950 shadow-md ring-1 ring-slate-800"
        >
          {currentUser.name.charAt(0)}
        </div>

        {/* Remote peer badges */}
        {peers.map((peer) => (
          <div
            key={peer.id}
            style={{ backgroundColor: peer.color }}
            title={`Collaborator: ${peer.name}`}
            className="w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-950 shadow-md ring-1 ring-slate-800 animate-in fade-in zoom-in duration-200"
          >
            {peer.name.charAt(0)}
          </div>
        ))}
      </div>
    </div>
  );
};
