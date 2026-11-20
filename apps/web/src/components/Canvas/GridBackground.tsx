import React from 'react';

interface GridBackgroundProps {
  zoom: number;
  pan: { x: number; y: number };
}

export const GridBackground: React.FC<GridBackgroundProps> = ({ zoom, pan }) => {
  const scaledGridSize = 24 * zoom;
  const offsetX = pan.x % scaledGridSize;
  const offsetY = pan.y % scaledGridSize;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundPosition: `${offsetX}px ${offsetY}px`,
        backgroundSize: `${scaledGridSize}px ${scaledGridSize}px`,
        backgroundImage: `
          radial-gradient(circle, rgba(255, 255, 255, ${Math.min(0.12, 0.05 * zoom)}) 1px, transparent 1px)
        `,
      }}
    />
  );
};
