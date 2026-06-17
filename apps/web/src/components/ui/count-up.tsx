'use client';

import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  end: number;
  durationMs?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}

/**
 * Animated number that counts from 0 → end on mount.
 * Uses requestAnimationFrame with ease-out-cubic for a smooth finish.
 */
export function CountUp({ end, durationMs = 900, decimals = 0, suffix = '', className }: CountUpProps) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const targetRef = useRef(end);
  targetRef.current = end;

  useEffect(() => {
    if (end === 0) {
      setValue(0);
      return;
    }
    const step = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(targetRef.current * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setValue(targetRef.current);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      startRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end]);

  const rendered = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
  return <span className={className}>{rendered}{suffix}</span>;
}
