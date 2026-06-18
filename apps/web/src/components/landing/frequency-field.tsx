'use client';

import { useEffect, useRef } from 'react';

/**
 * A premium, flowing "voice-frequency" field rendered on a fixed canvas behind
 * the landing content. Layered waveform ribbons drift continuously and react to
 * scroll (they flow up/along the page as you move), giving a classy 3D feel.
 */
export function FrequencyField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onScroll = () => { scrollRef.current = window.scrollY; };
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Depth layers — back layers fainter & slower (3D parallax).
    const LAYERS = 6;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = (time: number) => {
      const t = time / 1000;
      const scroll = scrollRef.current;
      ctx.clearRect(0, 0, w, h);

      for (let l = 0; l < LAYERS; l++) {
        const depth = l / (LAYERS - 1);           // 0 = back, 1 = front
        const speed = reduced ? 0 : 0.25 + depth * 0.8;
        const amp = (h * 0.04) * (0.4 + depth * 1.1);
        const freq = 0.004 + depth * 0.006;
        // ribbon flows along the page as you scroll
        const baseY = h * (0.18 + depth * 0.62) - scroll * (0.06 + depth * 0.12);
        const phase = t * speed + scroll * 0.0015;

        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 8) {
          const y =
            baseY +
            Math.sin(x * freq + phase) * amp +
            Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35 +
            Math.sin(x * freq * 0.5 - phase * 0.6) * amp * 0.5;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        // Greyscale ribbons on light — subtle texture, with a faint blue on the
        // front-most layer only (blue stays an accent, not the theme).
        const alpha = 0.03 + depth * 0.07;
        const isFront = l >= LAYERS - 2;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        if (isFront) {
          grad.addColorStop(0, `rgba(148, 163, 184, ${alpha})`);
          grad.addColorStop(0.6, `rgba(37, 99, 235, ${alpha * 1.3})`);
          grad.addColorStop(1, `rgba(148, 163, 184, ${alpha})`);
        } else {
          grad.addColorStop(0, `rgba(100, 116, 139, ${alpha})`);
          grad.addColorStop(1, `rgba(148, 163, 184, ${alpha})`);
        }
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1 + depth * 1.2;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />;
}
