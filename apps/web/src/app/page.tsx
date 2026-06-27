'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mic, Video, Languages, BarChart3, Sparkles, FileText, ArrowRight, ArrowUpRight } from 'lucide-react';
import { FrequencyField } from '@/components/landing/frequency-field';
import { Reveal } from '@/components/landing/reveal';
import { TiltCard } from '@/components/landing/tilt-card';
import { AssistantOrb } from '@/components/assistant/assistant-orb';

const FEATURES = [
  { icon: Mic, title: 'Real-time voice', body: 'Speak out loud; the coach replies instantly in a natural voice. No typing, no scripts.' },
  { icon: Video, title: 'Body-language read', body: 'Your webcam is analysed live for posture, eye contact and presence — never recorded.' },
  { icon: Languages, title: 'Seventy languages', body: 'Rehearse in the language you need. The coach stays in it from first word to last.' },
  { icon: BarChart3, title: 'Honest scoring', body: 'A clear rubric grades what you said and how you carried yourself — no vague praise.' },
  { icon: FileText, title: 'A report to keep', body: 'Leave with a clean PDF: strengths, fixes, and notes you can act on before the real thing.' },
  { icon: Sparkles, title: 'Bixy runs it for you', body: 'Just say “start a sales call in Spanish.” Your concierge handles the rest.' },
];

const STEPS = [
  { n: '01', title: 'Choose a moment', body: 'An interview, a hard conversation, a pitch. Pick a ready scenario or write your own.' },
  { n: '02', title: 'Have the conversation', body: 'Mic and camera on, you simply talk — like the room is real, because soon it will be.' },
  { n: '03', title: 'Learn what to change', body: 'See exactly where you shone and where you slipped, in words and in body language.' },
];

const CATEGORIES = ['Job interviews', 'Sales & cold calls', 'Negotiation', 'Public speaking', 'Leadership', 'Healthcare', 'Difficult conversations', 'Networking', 'Academic'];

export default function Landing() {
  const [dest, setDest] = useState('/login');
  useEffect(() => {
    try { if (localStorage.getItem('access_token')) setDest('/home'); } catch { /* ignore */ }
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

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pt-24 pb-28 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7">
          <Reveal>
            <h1 className="font-display text-6xl sm:text-7xl leading-[0.98] tracking-tight text-zinc-900 text-balance">
              Practice speaking.<br />
              <span className="italic text-blue-600">Out loud.</span>
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-7 text-lg text-zinc-500 max-w-md leading-relaxed">
              Have a real spoken conversation with a coach that hears your words and watches how you hold yourself — then tells you the truth about both. Build a streak, and watch your confidence climb.
            </p>
          </Reveal>
          <Reveal delay={220}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={dest} className="group inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 font-medium shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5">
                Start practicing <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-6 py-3 font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                How it works
              </a>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <p className="mt-8 text-sm text-zinc-400">Free to use · 70+ languages · your video never leaves your device</p>
          </Reveal>
        </div>

        {/* Hero visual — just Bixy, big */}
        <div className="lg:col-span-5 flex items-center justify-center">
          <Reveal delay={200}>
            <div className="relative grid place-items-center">
              <div aria-hidden className="absolute h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
              <AssistantOrb state="speaking" size={340} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Product showcase */}
      <section className="relative mx-auto max-w-5xl px-6 pb-12">
        <Reveal>
          <TiltCard>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/session.png" alt="A live SpeakCoach session with voice and body-language feedback"
              className="w-full rounded-3xl border border-zinc-200 shadow-[0_30px_80px_-30px_rgba(24,24,27,0.35)]" />
          </TiltCard>
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how" className="relative bg-zinc-50 border-y border-zinc-200/70">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal><h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">How it works</h2></Reveal>
          <div className="mt-16 grid md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div className="h-full rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
                  <div className="font-display text-3xl text-blue-600">{s.n}</div>
                  <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-zinc-500 leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative mx-auto max-w-6xl px-6 py-24">
        <Reveal><h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">Built to make you better in the room</h2></Reveal>
        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <TiltCard className="h-full rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
                <div className="grid place-items-center h-11 w-11 rounded-xl bg-blue-50 text-blue-600">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">{f.body}</p>
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
              <p className="mt-5 text-zinc-500 leading-relaxed">From your next interview to a conversation you’ve been dreading — start from a ready-made scenario, or ask Bixy to write one in seconds.</p>
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
              <p className="mt-3 text-zinc-500 max-w-xl leading-relaxed">Tap the orb anywhere and simply talk — “show my scenarios”, “start a job interview in Hindi”, “open my history”. Bixy navigates, searches, and sets things up so you can just practise.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="relative bg-zinc-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-28 text-center">
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
