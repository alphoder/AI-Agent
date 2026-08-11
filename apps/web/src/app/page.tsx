'use client';

import { useEffect, useRef, useState } from 'react';
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

/**
 * Who this is for. `tracks` are the scenario categories that already serve each
 * one (see packages/shared/src/catalog.ts) — the claim is only made where the
 * library can back it. `core` marks the three the seeded library was built for.
 * Full version, including the feature-by-feature benefits, lives in
 * docs/BROCHURE.md.
 */
const INDUSTRIES = [
  { name: 'Life, health & general insurance', core: true,
    body: 'Cold calls, price objections, renewals, claims and the ULIP pitch — against a named customer with a file, in the language they actually speak.',
    tracks: ['Cold calls', 'Objections', 'Renewals', 'Compliance'] },
  { name: 'Banking & NBFC', core: true,
    body: 'They came in for banking, not insurance. Rehearse the counter cross-sell, the relationship review and the recovery call before they cost you a customer.',
    tracks: ['Bancassurance', 'Collections', 'Grievance'] },
  { name: 'Wealth, mutual funds & broking', core: true,
    body: 'Risk profiling, suitability and the call you have to make the morning after a market drop.',
    tracks: ['Suitability', 'Pricing', 'Compliance'] },
  { name: 'IT, SaaS & B2B technology',
    body: 'Discovery that is not an interrogation, a demo that does not narrate itself, and the CFO who has heard every pitch before.',
    tracks: ['Client growth', 'The pitch', 'Negotiation'] },
  { name: 'BPO & customer support',
    body: 'Take the heat and keep the customer. Angry callers, escalations already one level up, and the save when they have a foot out of the door.',
    tracks: ['Angry customers', 'Escalations', 'Saves'] },
  { name: 'Staffing, recruitment & HR',
    body: 'Both sides of the table: screening calls and offer conversations, plus the performance review most managers keep postponing.',
    tracks: ['Interview', 'Salary', 'Feedback'] },
  { name: 'Education, EdTech & placement cells',
    body: 'Turn enquiries into admissions, and get students through the screen, the viva and the question they did not prepare for.',
    tracks: ['Interview', 'Q&A', 'Confidence'] },
  { name: 'Healthcare & pharma',
    body: 'Counselling a worried patient, detailing to a doctor with four minutes, and a front desk on the wrong end of a bad day.',
    tracks: ['Support', 'Client growth', 'De-escalation'] },
];

/** Same skills, different vocabulary — listed, not oversold. */
const ALSO_FITS = [
  'Real estate & housing finance', 'Telecom & broadband', 'Automotive & consumer durables',
  'Travel & hospitality', 'Logistics & distribution', 'Microfinance & co-operative banks',
  'Utilities', 'Consulting, legal & accounting',
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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try { if (localStorage.getItem('access_token')) setDest('/journey'); } catch { /* ignore */ }
    warmBackend(); // wake the backend now, while the visitor reads the page
  }, []);

  // Cycle the headline scenario, and hold the hero on its poster frame — both
  // paused when the visitor prefers reduced motion. Pausing beats hiding the
  // video: hiding it left the hero blank now that nothing sits behind it.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      videoRef.current?.pause();
      return;
    }
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
            <a href="#industries" className="hover:text-zinc-900 transition-colors">Industries</a>
            <a href="#scenarios" className="hover:text-zinc-900 transition-colors">Scenarios</a>
          </nav>
          <Link href={dest} className="rounded-full bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 text-sm font-medium transition-colors">
            Start free
          </Link>
        </div>
      </header>

      {/* Hero — Bixy video as the full-bleed background, brand text overlaid */}
      {/* Shorter on phones: a 16:9 clip in a portrait viewport is already cropped hard,
          and a full-height hero left the panel covering most of what survived. */}
      <section className="relative isolate flex min-h-[78vh] items-center overflow-hidden bg-white sm:min-h-[90vh]">
        {/* The video is the whole hero. The poster is its own first frame, so the
            still that paints first and the motion that follows are the same picture —
            there is no second image underneath to notice. It is also what anyone who
            asked for less motion keeps looking at, since the effect above pauses. */}
        {/* muted + playsInline are what make autoplay legal on iOS and Chrome; without
            both, the hero is a frozen first frame. */}
        <video
          ref={videoRef}
          src="/landing/video.mp4"
          poster="/landing/hero-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        {/* The old scrim washed flat white across 84% of the frame, which is why the
            video read as barely there. Nothing covers it now except the small panel
            the copy sits on; this is only a short fade so the video does not end on a
            hard edge against the white section below. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-white to-transparent" />

        {/* Anchored to the bottom and to the same max-w-6xl gutter as the header, so
            the copy lines up with the nav above it rather than floating. */}
        <div className="absolute inset-x-0 bottom-0 z-10 pb-12 sm:pb-14">
          <div className="mx-auto w-full max-w-6xl px-6">
            {/* A contained frosted panel, not a full-width wash: the copy stays legible
                over the busiest part of the frame while the rest of the video, Bixy
                included, is left completely alone. */}
            <div className="max-w-md rounded-2xl border border-white/70 bg-white/75 px-5 py-4 shadow-[0_18px_50px_-24px_rgba(24,24,27,0.45)] backdrop-blur-md sm:px-6 sm:py-5">
              <Reveal>
                <h1 className="font-display text-3xl sm:text-4xl leading-[1.08] tracking-tight text-zinc-900">
                  Your{' '}
                  <span key={moment} className="word-swap inline-block italic text-blue-600">{MOMENTS[moment]}</span>,
                  <br />
                  rehearsed.
                </h1>
              </Reveal>
              <Reveal delay={140}>
                <p className="mt-3 max-w-md text-sm text-zinc-600 leading-relaxed">
                  Practise real sales and interview calls out loud with an AI who pushes back, then get scored on how you actually sounded.
                </p>
              </Reveal>
              <Reveal delay={220}>
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <Link href={dest} className="group inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-medium shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5">
                    Start practicing <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <a href="#how" className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white/80 backdrop-blur px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-white transition-colors">
                    How it works
                  </a>
                </div>
              </Reveal>
              <Reveal delay={300}>
                {/* Two on a phone, four from sm up: four wrapped to three lines and made
                    the panel tall enough to bury the video behind it. */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-zinc-500 sm:mt-5">
                  <span>Free while in beta</span>
                  <span className="hidden sm:inline">Built for BFSI teams in India</span>
                  <span>Five minutes a call</span>
                  <span className="hidden sm:inline">Hindi, Tamil, Telugu &amp; 70+ more</span>
                </div>
              </Reveal>
            </div>
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

      {/* Industries — who this is for, and what changes for each */}
      <section id="industries" className="relative bg-zinc-50 border-y border-zinc-200/70">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight text-center">Built for insurance. Useful anywhere the call is hard.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-500 leading-relaxed">
              It is one skill underneath: hold a high-stakes conversation with someone who has their own agenda,
              usually not in English, and be judged on how it went.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {INDUSTRIES.map((ind, i) => (
              <Reveal key={ind.name} delay={(i % 4) * 80}>
                <TiltCard className={`flex h-full flex-col rounded-2xl border p-6 ${
                  ind.core ? 'border-blue-200 bg-white shadow-sm' : 'border-zinc-200 bg-white/60'
                }`}>
                  {ind.core && (
                    <span className="mb-3 self-start rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                      Built for this
                    </span>
                  )}
                  <h3 className="text-base font-semibold leading-snug">{ind.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-500">{ind.body}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {ind.tracks.map((t) => (
                      <span key={t} className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-500">{t}</span>
                    ))}
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="mt-12 rounded-2xl border border-dashed border-zinc-300 p-7 text-center">
              <p className="text-sm font-semibold text-zinc-700">Also in use for</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {ALSO_FITS.map((a) => (
                  <span key={a} className="rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm text-zinc-600">{a}</span>
                ))}
              </div>
              <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-zinc-500">
                Nothing here is a different product. If your call is not in the library, tell Bixy what it is
                and she writes it — with your objection, your customer, your language.
              </p>
            </div>
          </Reveal>
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
