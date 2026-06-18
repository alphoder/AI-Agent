'use client';

import { ReactNode, useRef } from 'react';

/** Subtle 3D tilt toward the cursor, with a depth shadow. */
export function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${px * 8}deg) rotateX(${-py * 8}deg) translateY(-4px)`;
  }
  function onLeave() {
    const el = ref.current;
    if (el) el.style.transform = 'perspective(900px) rotateY(0) rotateX(0) translateY(0)';
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ transformStyle: 'preserve-3d', transition: 'transform 200ms cubic-bezier(0.22,1,0.36,1)' }}
    >
      {children}
    </div>
  );
}
