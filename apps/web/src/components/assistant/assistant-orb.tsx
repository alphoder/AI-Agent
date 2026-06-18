'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Bixy — a cute round ball of energy with a living face. His eyes follow your
 * cursor (he's always focused on you), he blinks, and occasionally beams a happy
 * smile. While listening he's a calm ball with drifting particles; while speaking
 * his face animates and talks.
 */
export type OrbState = 'asleep' | 'listening' | 'speaking' | 'loading';

const PARTICLES = Array.from({ length: 7 }, (_, i) => {
  const a = (i / 7) * Math.PI * 2;
  return {
    cx: 60 + 42 * Math.cos(a),
    cy: 60 + 42 * Math.sin(a),
    r: 1.4 + (i % 2),
    fill: ['#bfdbfe', '#93c5fd', '#e2e8f0'][i % 3],
    delay: (i % 3) * 0.4,
  };
});

// Mostly tracks the cursor; occasionally beams happy.
const IDLE_FACES = ['normal', 'normal', 'normal', 'happy'] as const;
type Face = (typeof IDLE_FACES)[number] | 'attentive' | 'talk' | 'loading';

const EYE_L = 48;
const EYE_R = 72;
const EYE_Y = 57;

function Eyes({ face, look }: { face: Face; look: { dx: number; dy: number } }) {
  // Confused / dizzy — pupils spiral around their eye centers.
  if (face === 'loading') {
    return (
      <g>
        {[EYE_L, EYE_R].map((cx) => (
          <g key={cx}>
            <ellipse cx={cx} cy={EYE_Y} rx="7" ry="7.5" fill="#ffffff" />
            <g className="orb-spin orb-vb" style={{ transformOrigin: `${cx}px ${EYE_Y}px`, animationDuration: '1.1s' }}>
              <circle cx={cx} cy={EYE_Y - 2.8} r="2.6" fill="#0b1220" />
            </g>
          </g>
        ))}
      </g>
    );
  }
  if (face === 'happy') {
    return (
      <g stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d={`M ${EYE_L - 6} ${EYE_Y + 1} Q ${EYE_L} ${EYE_Y - 6} ${EYE_L + 6} ${EYE_Y + 1}`} />
        <path d={`M ${EYE_R - 6} ${EYE_Y + 1} Q ${EYE_R} ${EYE_Y - 6} ${EYE_R + 6} ${EYE_Y + 1}`} />
      </g>
    );
  }
  const ry = face === 'attentive' ? 9.2 : 8.5;
  return (
    <g className="eye-blink orb-tb">
      {[EYE_L, EYE_R].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={EYE_Y} rx="7.5" ry={ry} fill="#ffffff" />
          <circle cx={cx + look.dx} cy={EYE_Y + 1 + look.dy} r="4.4" fill="#0b1220" style={{ transition: 'cx 90ms linear, cy 90ms linear' }} />
          <circle cx={cx + look.dx - 1.4} cy={EYE_Y + look.dy - 0.8} r="1.5" fill="#ffffff" style={{ transition: 'cx 90ms linear, cy 90ms linear' }} />
        </g>
      ))}
    </g>
  );
}

export function AssistantOrb({ state = 'asleep', size = 88 }: { state?: OrbState; size?: number }) {
  const [idle, setIdle] = useState(0);
  const [look, setLook] = useState({ dx: 0, dy: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (state !== 'asleep') return;
    const t = setInterval(() => setIdle((i) => (i + 1) % IDLE_FACES.length), 3000);
    return () => clearInterval(t);
  }, [state]);

  // Eyes follow the cursor — Bixy stays focused on you.
  useEffect(() => {
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = svgRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const ox = r.left + r.width / 2;
        const oy = r.top + r.height / 2;
        const ang = Math.atan2(e.clientY - oy, e.clientX - ox);
        setLook({ dx: Math.cos(ang) * 2.8, dy: Math.sin(ang) * 2.2 });
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const loading = state === 'loading';
  const face: Face = loading ? 'loading' : state === 'speaking' ? 'talk' : state === 'listening' ? 'attentive' : IDLE_FACES[idle];
  const talking = state === 'speaking';

  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 120 120" className="orb-float select-none">
      <defs>
        <radialGradient id="bixyBall" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="38%" stopColor="#60a5fa" />
          <stop offset="72%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </radialGradient>
        <radialGradient id="bixyHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="60" cy="60" r="52" fill="url(#bixyHalo)" className="orb-glow orb-tb" />

      {/* Loading spinner ring around Bixy */}
      {loading && (
        <circle cx="60" cy="60" r="50" fill="none" stroke="#2563eb" strokeWidth="4.5" strokeLinecap="round"
          strokeDasharray="55 240" className="orb-spin orb-tb" style={{ animationDuration: '0.9s' }} />
      )}

      <g className={state === 'listening' ? 'orb-spin-rev orb-tb' : 'orb-spin orb-tb'}>
        {PARTICLES.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill} className="orb-twinkle orb-tb" style={{ animationDelay: `${p.delay}s` }} />
        ))}
      </g>

      <g className={talking ? 'orb-pulse orb-tb' : 'orb-tb'}>
        <circle cx="60" cy="60" r="32" fill="url(#bixyBall)" />
        <ellipse cx="49" cy="46" rx="12" ry="8" fill="#ffffff" opacity="0.26" />
        <circle cx="44" cy="42" r="2.4" fill="#ffffff" opacity="0.6" />

        <Eyes face={face} look={look} />

        {(face === 'happy' || talking) && (
          <g fill="#93c5fd" opacity="0.55">
            <ellipse cx={EYE_L - 2} cy={EYE_Y + 11} rx="3.2" ry="2" />
            <ellipse cx={EYE_R + 2} cy={EYE_Y + 11} rx="3.2" ry="2" />
          </g>
        )}

        {loading ? (
          <path d="M 54 75 q 2 -2.5 4 0 q 2 2.5 4 0 q 2 -2.5 4 0" stroke="#ffffff" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.85" />
        ) : talking ? (
          <g className="mouth-talk orb-tb">
            <ellipse cx="60" cy="75" rx="5" ry="4.5" fill="#0b1220" />
          </g>
        ) : face === 'happy' ? (
          <path d="M 55 73 Q 60 78 65 73" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M 56 74 Q 60 77 64 74" stroke="#ffffff" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.85" />
        )}
      </g>
    </svg>
  );
}
