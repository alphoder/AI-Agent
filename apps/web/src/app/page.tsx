'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mic, Video, Languages, BarChart3, Sparkles, FileText, ArrowRight, ArrowUpRight } from 'lucide-react';
import { FrequencyField } from '@/components/landing/frequency-field';
import { Reveal } from '@/components/landing/reveal';
import { TiltCard } from '@/components/landing/tilt-card';
import { AssistantOrb } from '@/components/assistant/assistant-orb';
import { SessionDemo } from '@/components/landing/session-demo';

const FEATURES = [
  { icon: Mic, title: 'Real-time voice', body: 'Speak out loud; the coach replies instantly in a natural voice. No typing, no scripts.' },
  { icon: Video, title: 'Body-language read', body: 'Your webcam is analysed live for posture, eye contact and presence, never recorded.' },
  { icon: Languages, title: 'Seventy languages', body: 'Rehearse in the language you need. The coach stays in it from first word to last.' },
  { icon: BarChart3, title: 'Honest scoring', body: 'A clear rubric grades what you said and how you carried yourself, with no vague praise.' },
  { icon: FileText, title: 'A report to keep', body: 'Leave with a clean PDF: strengths, fixes, and notes you can act on before the real thing.' },
  { icon: Sparkles, title: 'Bixy runs it for you', body: 'Just say “start a sales call in Spanish.” Your concierge handles the rest.' },
];

const STEPS = [
  { n: '01', title: 'Choose a moment', body: 'An interview, a hard conversation, a pitch. Pick a ready scenario or write your own.' },
  { n: '02', title: 'Have the conversation', body: 'Mic and camera on, you simply talk, like the room is real, because soon it will be.' },
  { n: '03', title: 'Learn what to change', body: 'See exactly where you shone and where you slipped, in words and in body language.' },
];

const CATEGORIES = ['Job interviews', 'Sales & cold calls', 'Negotiation', 'Public speaking', 'Leadership', 'Healthcare', 'Difficult conversations', 'Networking', 'Academic'];

// Real-world, high-stakes conversations people everywhere only get one shot at.
const MOMENTS = ['interview', 'sales pitch', 'cold call', 'first date', 'big speech', 'salary talk', 'hard talk', 'visa call'];

export default function Landing() {
  const [dest, setDest] = useState('/login');
  const [moment, setMoment] = useState(0);

  useEffect(() => {
    try { if (localStorage.getItem('access_token')) setDest('/home'); } catch { /* ignore */ }
  }, []);

  // Cycle the headline scenario (paused when the visitor prefers reduced motion).
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setMoment((i) => (i + 1) % MOMENTS.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative min-h-screen bg-white text-zinc-900">
      <FrequencyField />

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/70 border-b border-zinc-200/70">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold tracking-tight"><Mic className="h-5 w-5 text-blue-600" /> SpeakCoach</div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-500">
            <a href="#how" className="hover:text-zinc-900 transition-colors">How it works</a>
            <a href="#features" className="hover:text-zinc-900 transition-colors">Features</a>
            <a href="#scenarios" className="hover:text-zinc-900 transition-colors">Scenarios</a>
          </nav>
          <Link href={dest} className="rounded-full bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 text-sm font-medium transition-colors">
            Start free
          </Link>
        </div>
      </header>

      {/* Hero — Bixy image as the full-bleed background, brand text overlaid */}
      <section className="relative isolate flex min-h-[90vh] items-center overflow-hidden bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/hero-full.png" alt="Bixy, your AI speaking coach, listening in 70+ languages"
          className="absolute inset-0 -z-20 h-full w-full object-cover" />
        {/* Legibility scrim: bright on the left for the text, clear over Bixy on the right */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,white,white_26%,rgba(255,255,255,0.5)_50%,transparent_66%)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-white to-transparent" />

        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="max-w-2xl">
            <Reveal>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.02] tracking-tight text-zinc-900">
                Your{' '}
                <span key={moment} className="word-swap inline-block italic text-blue-600">{MOMENTS[moment]}</span>,
                <br />
                rehearsed.
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-6 max-w-lg text-lg text-zinc-600 leading-relaxed">
                Every life turns on a handful of conversations you only get once. Practise yours out loud with an AI coach, in 70+ languages, until the real thing feels easy.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={dest} className="group inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 font-medium shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5">
                  Start practicing <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <a href="#how" className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white/70 backdrop-blur px-6 py-3 font-medium text-zinc-700 hover:bg-white transition-colors">
                  How it works
                </a>
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-zinc-500">
                <span>Free to use</span>
                <span>70+ languages</span>
                <span>Your video never leaves your device</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Inside a session — a real, self-playing preview of the product */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <Reveal>
          <h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">This is what practice looks like.</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-zinc-500 leading-relaxed">A real spoken conversation, scored as you talk. No slides, no theory, just the reps.</p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-12">
            <SessionDemo />
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how" className="relative bg-zinc-50 border-y border-zinc-200/70">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal><h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">How it works</h2></Reveal>
          <div className="relative mt-16 grid md:grid-cols-3 gap-x-8 gap-y-12">
            {/* hairline connector behind the step markers */}
            <div aria-hidden className="hidden md:block absolute top-7 left-[16.6%] right-[16.6%] h-px bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200" />
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 grid h-14 w-14 place-items-center rounded-full bg-blue-600 font-display text-xl text-white shadow-lg shadow-blue-600/30 ring-8 ring-zinc-50">{i + 1}</div>
                  <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 max-w-xs text-zinc-500 leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative mx-auto max-w-6xl px-6 py-24">
        <Reveal><h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">Built to make you better in the room</h2></Reveal>
        <div className="mt-16 grid md:grid-cols-2 gap-4">
          {FEATURES.map((f, i) => {
            const wide = i === 0 || i === FEATURES.length - 1; // first + last span the row
            const filled = i === 0;                            // hero feature, blue fill
            const bixyTile = i === FEATURES.length - 1;        // tinted tile with a live Bixy
            const tone = filled
              ? 'border-transparent bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : bixyTile
                ? 'border-blue-100 bg-blue-50'
                : 'border-zinc-200 bg-white shadow-sm';
            return (
              <Reveal key={f.title} delay={(i % 2) * 90} className={wide ? 'md:col-span-2' : ''}>
                <TiltCard className={`h-full rounded-2xl border p-7 ${tone}`}>
                  <div className={wide ? 'flex items-center gap-6' : ''}>
                    {bixyTile ? (
                      <div className="shrink-0"><AssistantOrb state="asleep" size={76} /></div>
                    ) : (
                      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${filled ? 'bg-white/15 text-white' : 'bg-blue-50 text-blue-600'}`}>
                        <f.icon className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <h3 className={`font-semibold ${wide ? 'text-xl' : 'mt-5'}`}>{f.title}</h3>
                      <p className={`mt-1.5 text-sm leading-relaxed ${filled ? 'text-blue-50' : 'text-zinc-500'}`}>{f.body}</p>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Real moments */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <Reveal><h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">Real moments, rehearsed first.</h2></Reveal>
        <div className="mt-16 grid md:grid-cols-2 gap-6">
          {[
            { src: '/landing/Interview_Rehersal.png', title: 'Interview rehearsal', body: 'Talk through your answers and see tone, flow and posture read back in real time.' },
            { src: '/landing/Sales_Cold_Call_Practice.png', title: 'Sales & cold calls', body: 'Pitch in any language and watch your confidence score climb call after call.' },
          ].map((m, i) => (
            <Reveal key={m.title} delay={i * 100}>
              <TiltCard className="group overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.src} alt={m.title}
                  className="w-full aspect-[3/2] object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                <div className="p-6">
                  <h3 className="font-semibold text-lg">{m.title}</h3>
                  <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">{m.body}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Scenarios */}
      <section id="scenarios" className="relative bg-zinc-50 border-y border-zinc-200/70">
        <div className="mx-auto max-w-6xl px-6 py-24 grid lg:grid-cols-2 gap-14 items-center">
          <Reveal>
            <div>
              <h2 className="font-display text-4xl sm:text-5xl tracking-tight leading-tight">A scenario for every moment that matters.</h2>
              <p className="mt-5 text-zinc-500 leading-relaxed">From your next interview to a conversation you’ve been dreading, start from a ready-made scenario, or ask Bixy to write one in seconds.</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <span key={c} className="rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm text-zinc-600">{c}</span>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <TiltCard>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/scenarios.png" alt="Browse practice scenarios"
                className="w-full rounded-3xl border border-zinc-200 shadow-[0_30px_80px_-30px_rgba(24,24,27,0.35)]" />
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* Bixy */}
      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="rounded-3xl border border-zinc-200 bg-white p-10 flex flex-col md:flex-row items-center gap-8 shadow-sm">
            <div className="relative shrink-0">
              <div aria-hidden className="bixy-halo absolute inset-0 m-auto h-32 w-32" />
              <AssistantOrb state="listening" size={140} />
            </div>
            <div>
              <h2 className="font-display text-4xl tracking-tight">Meet Bixy.</h2>
              <p className="mt-3 text-zinc-500 max-w-xl leading-relaxed">Tap the orb anywhere and simply talk: “show my scenarios”, “start a job interview in Hindi”, “open my history”. Bixy navigates, searches, and sets things up so you can just practise.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="relative bg-zinc-900 text-white overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/Brand_atmostphere.png" alt="" aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/70 to-zinc-900/40" />
        <div className="relative mx-auto max-w-6xl px-6 py-28 text-center">
          <Reveal>
            <h2 className="font-display text-5xl sm:text-6xl tracking-tight">Your next conversation, rehearsed.</h2>
            <p className="mt-6 text-zinc-400 max-w-lg mx-auto">Private, free, and ready in seconds.</p>
            <Link href={dest} className="mt-10 inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg font-medium transition-all hover:-translate-y-0.5">
              Start practicing <ArrowUpRight className="h-5 w-5" />
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="relative border-t border-zinc-200 py-10 text-center text-sm text-zinc-400">
        <div className="flex items-center justify-center gap-2 mb-2 text-zinc-600"><Mic className="h-4 w-4 text-blue-600" /> SpeakCoach</div>
        © {new Date().getFullYear()} SpeakCoach · Practice speaking &amp; body language with AI
      </footer>
    </div>
  );
}
