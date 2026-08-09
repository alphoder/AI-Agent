'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mic, Video, Languages, BarChart3, Sparkles, FileText, ArrowRight, ArrowUpRight } from 'lucide-react';
import { FrequencyField } from '@/components/landing/frequency-field';
import { Reveal } from '@/components/landing/reveal';
import { TiltCard } from '@/components/landing/tilt-card';
import { AssistantOrb } from '@/components/assistant/assistant-orb';
import { SessionDemo } from '@/components/landing/session-demo';
import { warmBackend } from '@/lib/warm-backend';

const FEATURES = [
  { icon: FileText, title: 'You get the file first', body: 'Before you dial you read who they are: their family, their loan, what is pressing on them this week. What it never tells you is how to sell to them. That part is yours.' },
  { icon: Mic, title: 'A customer who pushes back', body: 'They object, stall, mishear you and lose patience. Push too hard and they hang up, which is a lesson too.' },
  { icon: Languages, title: 'In their language', body: 'Hindi, Tamil, Telugu, Marathi, English and 70+ more. Pick the language and the customer stays in it.' },
  { icon: BarChart3, title: 'Scoring that is measured, not guessed', body: 'Talk-to-listen ratio, questions asked, filler words, and a flag if you over-promised. Anything we did not measure, we say so.' },
  { icon: Video, title: 'Body language, if you want it', body: 'Turn the camera on to score posture and presence. Off by default, and no frame is ever stored.' },
  { icon: Sparkles, title: 'Bixy finds the right call', body: 'Say “I keep losing them on price” and Bixy picks the call that fixes it, then hands it to you to start.' },
];

const STEPS = [
  { n: '01', title: 'Tell us where it breaks', body: 'A few questions about your work and the moment you dread. You get a plan of days built around that, not a generic course.' },
  { n: '02', title: 'Read the client file', body: 'Who you are calling, how they live, what is on their mind. The same intel a good agent already has before dialling.' },
  { n: '03', title: 'Take the call, get the read', body: 'Five minutes out loud. Then a scorecard with your talk-to-listen ratio, the objection you fumbled, and where you stand against everyone else practising.' },
];

const CATEGORIES = [
  'Cold calls', 'Price objections', 'Renewals & retention', 'Claims & service',
  'Term life', 'Health', 'Motor', 'ULIP & savings', 'Group / SME',
  'Neuro selling', 'Whitespace mapping', 'Meaningful conversations',
];

// High-stakes insurance calls an agent only gets one shot at.
const MOMENTS = ['cold call', 'price objection', 'policy renewal', 'angry customer', 'ULIP pitch', 'claim call', 'quarterly review', 'tough close'];

// A real extract from the file that ships with "Term Life — Cold Call". Not a mockup.
const FILE = {
  name: 'Suresh Nair, 38',
  headline: 'IT Team Lead, Pune',
  facts: [
    { label: 'Employer', value: 'Global Tech Solutions' },
    { label: 'Home', value: '3BHK in Hinjewadi' },
    { label: 'Family', value: 'Wife Meena, two kids (8, 5)' },
    { label: 'Debt', value: 'Home loan, 3 years in' },
  ],
  life: 'Suresh wakes at 6:00 AM to help get the kids ready for school. He commutes 45 minutes to the IT park, spends his day managing a team of twelve, and usually returns home by 7:30 PM.',
  unknowns: [
    'The specific coverage amount of his existing endowment policy.',
    'His actual level of concern regarding his long-term debt obligations.',
  ],
};

export default function Landing() {
  const [dest, setDest] = useState('/login');
  const [moment, setMoment] = useState(0);

  useEffect(() => {
    try { if (localStorage.getItem('access_token')) setDest('/journey'); } catch { /* ignore */ }
    warmBackend(); // wake the backend now, while the visitor reads the page
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

      {/* Hero — Bixy video as the full-bleed background, brand text overlaid */}
      <section className="relative isolate flex min-h-[90vh] items-center overflow-hidden bg-white">
        {/* The still stays underneath: it paints immediately, it is what shows if the
            video cannot play, and it is the whole hero for anyone who asked for less
            motion. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/hero-full.png" alt="Bixy, your AI speaking coach, listening in 70+ languages"
          className="absolute inset-0 -z-20 h-full w-full object-cover" />
        {/* muted + playsInline are what make autoplay legal on iOS and Chrome; without
            both, the hero is a frozen first frame. */}
        <video
          src="/landing/video.mp4"
          poster="/landing/hero-full.png"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
          className="absolute inset-0 -z-20 h-full w-full object-cover motion-reduce:hidden"
        />
        {/* Legibility scrim: bright on the left for the text, clear over Bixy on the right */}
        {/* Legibility scrim. It has to clear the LONGEST rotating word, not the
            shortest, or "price objection" lands on the busy artwork. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,white,white_32%,rgba(255,255,255,0.78)_56%,rgba(255,255,255,0.25)_72%,transparent_84%)]" />
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
                You get one shot at a real customer. Here you get as many as you need. Read the client&apos;s file, call them, and find out where it falls apart, while it still costs nothing.
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
                <span>Free while in beta</span>
                <span>Built for BFSI teams in India</span>
                <span>Five minutes a call</span>
                <span>Hindi, Tamil, Telugu &amp; 70+ more</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Inside a session — a real, self-playing preview of the product */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <Reveal>
          <h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">This is what a practice call looks like.</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-zinc-500 leading-relaxed">Five minutes with a customer who has somewhere else to be. No slides, no role-play with your manager.</p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-12">
            <SessionDemo />
          </div>
        </Reveal>
      </section>

      {/* The client file — the thing nobody else gives you */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <div>
              <h2 className="font-display text-4xl sm:text-5xl tracking-tight leading-tight">You never call a stranger.</h2>
              <p className="mt-5 text-zinc-500 leading-relaxed">
                Every scenario opens with the file a good agent would already have: who they are, how they live,
                what is pressing on them this month.
              </p>
              <p className="mt-4 text-zinc-500 leading-relaxed">
                What the file will never do is tell you how to sell to them. No opener, no line to use, no technique.
                Two people can read the same file and run completely different calls, which is the entire point.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-[0_30px_80px_-40px_rgba(24,24,27,0.35)]">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Client file</p>
              <p className="mt-2 font-display text-2xl tracking-tight">{FILE.name}</p>
              <p className="text-sm text-zinc-500">{FILE.headline}</p>

              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-zinc-50 p-4">
                {FILE.facts.map((f) => (
                  <div key={f.label}>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{f.label}</dt>
                    <dd className="mt-0.5 text-sm text-zinc-700">{f.value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 text-sm leading-relaxed text-zinc-600">{FILE.life}</p>

              <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-4">
                <p className="text-sm font-semibold text-zinc-700">Not on file</p>
                <ul className="mt-2 space-y-1 text-sm text-zinc-500">
                  {FILE.unknowns.map((u) => <li key={u}>{u}</li>)}
                </ul>
                <p className="mt-3 text-xs text-zinc-400">You only find this out by asking well on the call.</p>
              </div>
            </div>
          </Reveal>
        </div>
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
        <Reveal><h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">Built to close more, mis-sell less</h2></Reveal>
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
        <Reveal><h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">Real calls, rehearsed first.</h2></Reveal>
        <div className="mt-16 grid md:grid-cols-2 gap-6">
          {[
            { src: '/landing/Interview_Rehersal.png', title: 'A plan, not a playlist', body: 'Answer a few questions once and get a day-by-day path built around the moment you actually dread. It rebuilds when you do.' },
            { src: '/landing/Sales_Cold_Call_Practice.png', title: 'Objections, handled', body: 'Face price pushback and “I already have a policy” in any language, and watch your score climb call after call.' },
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
              <h2 className="font-display text-4xl sm:text-5xl tracking-tight leading-tight">Thirty-six people to call.</h2>
              <p className="mt-5 text-zinc-500 leading-relaxed">A term-life cold call, a copay dispute, a CFO who has heard it all before. Every one is a named person with a file, sorted by what you are trying to fix. Browse them, or let the dice pick.</p>
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
              <p className="mt-3 text-zinc-500 max-w-xl leading-relaxed">Tap the orb anywhere and simply talk: “show my scenarios”, “open my reports”, “I keep losing them on price”. Bixy finds the call that fixes it and hands it to you, ready to start.</p>
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
            <h2 className="font-display text-5xl sm:text-6xl tracking-tight">Your next sales call, rehearsed.</h2>
            <p className="mt-6 text-zinc-400 max-w-lg mx-auto">Built for insurance teams in India. Free while we are in beta, and you are on a call within a minute.</p>
            <Link href={dest} className="mt-10 inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg font-medium transition-all hover:-translate-y-0.5">
              Start practicing <ArrowUpRight className="h-5 w-5" />
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="relative border-t border-zinc-200 py-10 text-center text-sm text-zinc-400">
        <div className="flex items-center justify-center gap-2 mb-2 text-zinc-600"><Mic className="h-4 w-4 text-blue-600" /> SpeakCoach</div>
        © {new Date().getFullYear()} SpeakCoach · Insurance sales-call training with AI
      </footer>
    </div>
  );
}
