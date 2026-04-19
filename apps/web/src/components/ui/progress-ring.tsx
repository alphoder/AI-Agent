'use client';

import { useEffect, useState } from 'react';

interface ProgressRingProps {
  value: number;       // 0..100
  size?: number;       // px
  stroke?: number;     // px
  color?: string;      // hex or css var
  trackColor?: string;
  label?: React.ReactNode;
  animate?: boolean;
}

/**
 * Animated SVG progress ring. On mount, the stroke grows from 0 → value.
 */
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  color,
  trackColor = 'rgba(148,163,184,0.18)',
  label,
  animate = true,
}: ProgressRingProps) {
  const [displayed, setDisplayed] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setDisplayed(value), 50);
    return () => clearTimeout(t);
  }, [value, animate]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, displayed)) / 100);

  const autoColor =
    color ??
    (value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : value > 0 ? '#f43f5e' : '#cbd5e1');

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={autoColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      {label != null && (
        <div className="absolute inset-0 flex items-center justify-center">
          {label}
        </div>
      )}
    </div>
  );
}
