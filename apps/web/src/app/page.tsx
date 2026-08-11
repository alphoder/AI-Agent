'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Mic, Video, Languages, BarChart3, Sparkles, FileText, ArrowRight, ArrowUpRight, Check, X, Minus } from 'lucide-react';
import { Reveal } from '@/components/landing/reveal';
import { TiltCard } from '@/components/landing/tilt-card';
import { AssistantOrb } from '@/components/assistant/assistant-orb';
import { SessionDemo } from '@/components/landing/session-demo';
import { warmBackend } from '@/lib/warm-backend';

const FEATURES = [
  { icon: FileText, title: 'You get the file first', body: 'Before you dial you read who they are: their family, their loan, what is pressing on them this week. What it never tells you is how to sell to them. That part is yours.' },
  { icon: Mic, title: 'A customer who pushes back', body: 'They object, stall, mishear you and lose patience. Push too hard and they hang up, which is a lesson too.' },
  { icon: Languages, title: 'In their language', body: 'Hindi, Tamil, Telugu, Marathi, English and 70+ more. Pick the language and the customer stays in it.' },
  { icon: BarChart3, title: 'Measured, not guessed', body: 'Talk-to-listen ratio, questions asked, filler words, and a flag if you over-promised. Anything we did not measure, we say so.' },
  { icon: Video, title: 'Body language, if you want it', body: 'Turn the camera on to score posture and presence. Off by default, and no frame is ever stored.' },
  { icon: Sparkles, title: 'Bixy finds the right call', body: 'Say “I keep losing them on price” and Bixy picks the call that fixes it, then hands it to you to start.' },
];

const STEPS = [
  { title: 'Tell us where it breaks', body: 'A few questions about your work and the moment you dread. You get a plan of days built around that, not a generic course.' },
  { title: 'Read the client file', body: 'Who you are calling, how they live, what is on their mind. The same intel a good agent already has before dialling.' },
  { title: 'Take the call, get the read', body: 'Five minutes out loud. Then a scorecard with your talk-to-listen ratio, the objection you fumbled, and where you stand against everyone else practising.' },
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
    body: 'Risk profiling, suitability, and the call you have to make the morning after a market drop.',
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

// The band under the hero. Long enough that the loop is not obvious.
const BAND = [
  'Term life cold call', 'Price objection', 'Policy renewal', 'Angry customer', 'ULIP pitch',
  'Claim rejection', 'Bancassurance counter', 'Health top-up', 'Motor renewal', 'Sceptical CFO',
  'Salary negotiation', 'Technical screen', 'Escalation', 'Cancellation save', 'Quarterly review',
];

// High-stakes calls an agent only gets one shot at.
const MOMENTS = ['cold call', 'price objection', 'policy renewal', 'angry customer', 'ULIP pitch', 'claim call', 'quarterly review', 'tough close'];

/** The one scale the whole app grades on (packages/shared/src/journey.ts). */
const GRADES = [
  { icon: Check, label: 'Completed', range: '70 and above', tone: 'text-emerald-600', ring: 'border-emerald-200 bg-emerald-50',
    body: 'It moves off your list and into Completed. You handled the objection and you closed like you meant it.' },
  { icon: Minus, label: 'Attempted', range: '50 to 69', tone: 'text-amber-600', ring: 'border-amber-200 bg-amber-50',
    body: 'Finished, but under the mark. It waits in To improve with the exact criterion that cost you the points.' },
  { icon: X, label: 'Failed', range: 'Below 50', tone: 'text-rose-600', ring: 'border-rose-200 bg-rose-50',
    body: 'Stays in Scenarios, because the only useful thing to do with it is run it again.' },
];

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

/** Section heading — one shape, used everywhere, so the rhythm never wobbles. */
function Heading({ eyebrow, title, lede, className = '' }: { eyebrow: string; title: React.ReactNode; lede?: string; className?: string }) {
  return (
    <Reveal className={className}>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] lp-accent">{eyebrow}</p>
      <h2 className="mx-auto mt-4 max-w-3xl text-center font-display text-4xl leading-[1.06] tracking-tight sm:text-5xl">{title}</h2>
      {lede && <p className="mx-auto mt-5 max-w-2xl text-center leading-relaxed text-[color:var(--ink-soft)]">{lede}</p>}
    </Reveal>
  );
}

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
    <div className="lp relative min-h-screen overflow-x-clip">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[color:var(--cream)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[color:var(--indigo-deep)] to-[color:var(--peri-light)]">
              <Mic className="h-4 w-4 text-white" />
            </span>
            SpeakCoach
          </div>
          <nav className="hidden items-center gap-8 text-sm text-[color:var(--ink-soft)] md:flex">
            <a href="#how" className="transition-colors hover:text-[color:var(--ink)]">How it works</a>
            <a href="#features" className="transition-colors hover:text-[color:var(--ink)]">Features</a>
            <a href="#industries" className="transition-colors hover:text-[color:var(--ink)]">Industries</a>
            <a href="#scoring" className="transition-colors hover:text-[color:var(--ink)]">Scoring</a>
          </nav>
          <Link href={dest} className="lp-cta rounded-full px-4 py-2 text-sm font-medium text-white">Start free</Link>
        </div>
      </header>

      {/* Hero — the video is the whole frame; the page cream matches its field, so
          the two meet with no visible seam. */}
      <section className="relative isolate flex min-h-[80vh] items-center overflow-hidden sm:min-h-[92vh]">
        {/* The poster is the video's own first frame, so the still that paints first
            and the motion that follows are the same picture. It is also what anyone
            who asked for less motion keeps looking at, since the effect above pauses.
            muted + playsInline are what make autoplay legal on iOS and Chrome. */}
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
        {/* Short fade so the clip does not end on a hard edge against the cream. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[color:var(--cream)] to-transparent" />

        <div className="absolute inset-x-0 bottom-0 z-10 pb-12 sm:pb-16">
          <div className="mx-auto w-full max-w-6xl px-6">
            <div className="lp-ring max-w-lg rounded-3xl bg-white/70 px-6 py-6 shadow-[0_30px_80px_-40px_rgba(20,22,28,0.5)] backdrop-blur-xl sm:px-8 sm:py-7">
              <Reveal>
                <h1 className="font-display text-3xl leading-[1.06] tracking-tight sm:text-[2.75rem]">
                  Your{' '}
                  <span key={moment} className="word-swap lp-accent inline-block italic">{MOMENTS[moment]}</span>,
                  <br />
                  rehearsed.
                </h1>
              </Reveal>
              <Reveal delay={140}>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-[color:var(--ink-soft)] sm:text-base">
                  Practise the calls your job depends on, out loud, against an AI who behaves like a real
                  customer — then get scored on how you actually sounded.
                </p>
              </Reveal>
              <Reveal delay={220}>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href={dest} className="lp-cta group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white">
                    Start practising <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a href="#how" className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-6 py-3 text-sm font-medium backdrop-blur transition-colors hover:bg-white">
                    How it works
                  </a>
                </div>
              </Reveal>
              <Reveal delay={300}>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[color:var(--ink-soft)]">
                  <span>Free while in beta</span>
                  <span className="hidden sm:inline">Built for BFSI teams in India</span>
                  <span>Five minutes a call</span>
                  <span className="hidden sm:inline">70+ languages</span>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* The band — what is actually in the library, moving past. */}
      <section aria-hidden className="relative border-y border-black/5 bg-[color:var(--cream-deep)]/60 py-4">
        <div className="lp-marquee gap-3">
          {[...BAND, ...BAND].map((b, i) => (
            <span key={`${b}-${i}`} className="whitespace-nowrap rounded-full border border-black/10 bg-white/70 px-4 py-1.5 text-sm text-[color:var(--ink-soft)]">
              {b}
            </span>
          ))}
        </div>
      </section>

      {/* Why it works */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="lp-field opacity-60" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <Heading
            eyebrow="The problem"
            title={<>Nobody ever got better at calls <span className="lp-accent">by reading about calls.</span></>}
            lede="Product training tells people what to say. It cannot tell them what happens when the customer interrupts on the second sentence."
          />
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {[
              { k: 'Role-play does not scale', v: 'One manager, twenty reps, once a quarter — and everyone performs for the person who writes their review.' },
              { k: 'Real calls are the training', v: 'Which means the customer pays for the learning curve, and you only find out from the ones who did not call back.' },
              { k: 'Nobody has a number', v: 'Ask a manager why a rep is missing target and you get an opinion. There is no measurement of the thing itself.' },
            ].map((c, i) => (
              <Reveal key={c.k} delay={i * 90}>
                <div className="lp-card lp-ring h-full rounded-2xl bg-white/70 p-7 backdrop-blur">
                  <p className="font-display text-xl tracking-tight">{c.k}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-soft)]">{c.v}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Inside a session — a real, self-playing preview of the product */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <Heading
          eyebrow="The product"
          title="This is what a practice call looks like."
          lede="Five minutes with a customer who has somewhere else to be. No slides, no role-play with your manager."
        />
        <Reveal delay={120}>
          <div className="mt-14"><SessionDemo /></div>
        </Reveal>
      </section>

      {/* The client file — the thing nobody else gives you */}
      <section className="relative overflow-hidden border-y border-black/5 bg-[color:var(--cream-deep)]/50">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <Reveal>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] lp-accent">The client file</p>
                <h2 className="mt-4 font-display text-4xl leading-[1.06] tracking-tight sm:text-5xl">You never call a stranger.</h2>
                <p className="mt-6 leading-relaxed text-[color:var(--ink-soft)]">
                  Every scenario opens with the file a good agent would already have: who they are, how they live,
                  what is pressing on them this month.
                </p>
                <p className="mt-4 leading-relaxed text-[color:var(--ink-soft)]">
                  What the file will never do is tell you how to sell to them. No opener, no line to use, no technique.
                  Two people can read the same file and run completely different calls, which is the entire point.
                </p>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <TiltCard className="lp-ring rounded-3xl bg-white p-7 shadow-[0_30px_80px_-40px_rgba(20,22,28,0.4)]">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">Client file</p>
                <p className="mt-2 font-display text-2xl tracking-tight">{FILE.name}</p>
                <p className="text-sm text-[color:var(--ink-soft)]">{FILE.headline}</p>

                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-[color:var(--cream-deep)]/70 p-4">
                  {FILE.facts.map((f) => (
                    <div key={f.label}>
                      <dt className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--ink-soft)]">{f.label}</dt>
                      <dd className="mt-0.5 text-sm">{f.value}</dd>
                    </div>
                  ))}
                </dl>

                <p className="mt-5 text-sm leading-relaxed text-[color:var(--ink-soft)]">{FILE.life}</p>

                <div className="mt-5 rounded-2xl border border-dashed border-black/15 p-4">
                  <p className="text-sm font-semibold">Not on file</p>
                  <ul className="mt-2 space-y-1 text-sm text-[color:var(--ink-soft)]">
                    {FILE.unknowns.map((u) => <li key={u}>{u}</li>)}
                  </ul>
                  <p className="mt-3 text-xs text-[color:var(--ink-soft)]">You only find this out by asking well on the call.</p>
                </div>
              </TiltCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative mx-auto max-w-6xl px-6 py-24">
        <Heading eyebrow="How it works" title="Three steps, and the first call is inside a minute." />
        <div className="relative mt-16 grid gap-x-8 gap-y-12 md:grid-cols-3">
          <div aria-hidden className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-gradient-to-r from-[color:var(--indigo-deep)]/20 via-[color:var(--peri)]/60 to-[color:var(--peri-light)]/20 md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 100}>
              <div className="relative flex flex-col items-center text-center">
                <div className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[color:var(--indigo-deep)] to-[color:var(--peri-light)] font-display text-xl text-white shadow-lg shadow-indigo-500/25 ring-8 ring-[color:var(--cream)]">
                  {i + 1}
                </div>
                <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 max-w-xs leading-relaxed text-[color:var(--ink-soft)]">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative overflow-hidden">
        <div aria-hidden className="lp-field opacity-50" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <Heading eyebrow="Features" title={<>Built to close more, <span className="lp-accent">mis-sell less.</span></>} />
          <div className="mt-16 grid gap-4 md:grid-cols-2">
            {FEATURES.map((f, i) => {
              const wide = i === 0 || i === FEATURES.length - 1; // first + last span the row
              const filled = i === 0;                            // hero feature, gradient fill
              const bixyTile = i === FEATURES.length - 1;        // tinted tile with a live Bixy
              return (
                <Reveal key={f.title} delay={(i % 2) * 90} className={wide ? 'md:col-span-2' : ''}>
                  <TiltCard className={`lp-card h-full rounded-2xl p-7 ${
                    filled
                      ? 'bg-gradient-to-br from-[color:var(--indigo-deep)] via-[color:var(--peri)] to-[color:var(--peri-light)] text-white shadow-xl shadow-indigo-500/20'
                      : bixyTile
                        ? 'lp-ring bg-white/80 backdrop-blur'
                        : 'lp-ring bg-white/70 backdrop-blur'
                  }`}>
                    <div className={wide ? 'flex items-center gap-6' : ''}>
                      {bixyTile ? (
                        <div className="shrink-0"><AssistantOrb state="asleep" size={76} /></div>
                      ) : (
                        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                          filled ? 'bg-white/20 text-white' : 'bg-gradient-to-br from-[color:var(--indigo-deep)]/10 to-[color:var(--peri-light)]/10 text-[color:var(--peri)]'
                        }`}>
                          <f.icon className="h-5 w-5" />
                        </div>
                      )}
                      <div>
                        <h3 className={`font-semibold ${wide ? 'text-xl' : 'mt-5'}`}>{f.title}</h3>
                        <p className={`mt-1.5 text-sm leading-relaxed ${filled ? 'text-white/85' : 'text-[color:var(--ink-soft)]'}`}>{f.body}</p>
                      </div>
                    </div>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Scoring — the part that makes it training rather than a chatbot */}
      <section id="scoring" className="relative border-y border-black/5 bg-[color:var(--cream-deep)]/50">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Heading
            eyebrow="Scoring"
            title={<>Every call ends in a grade, <span className="lp-accent">not a vibe.</span></>}
            lede="The rubric ships with the scenario and its weights are enforced in code, so two runs of the same call are judged on the same scale. Anything we could not measure is reported as unmeasured rather than guessed."
          />
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {GRADES.map((g, i) => (
              <Reveal key={g.label} delay={i * 90}>
                <div className="lp-card h-full rounded-2xl border border-black/5 bg-white p-7">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${g.ring} ${g.tone}`}>
                    <g.icon className="h-3.5 w-3.5" /> {g.label}
                  </div>
                  <p className="mt-4 font-display text-3xl tracking-tight">{g.range}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-soft)]">{g.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {[
                { src: '/landing/session.png', alt: 'A scored practice call report' },
                { src: '/landing/scenarios.png', alt: 'Browse practice scenarios' },
              ].map((im) => (
                <TiltCard key={im.src} className="lp-card overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_30px_80px_-40px_rgba(20,22,28,0.4)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.src} alt={im.alt} className="w-full" />
                </TiltCard>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Industries — who this is for, and what changes for each */}
      <section id="industries" className="relative overflow-hidden">
        <div aria-hidden className="lp-field opacity-40" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <Heading
            eyebrow="Industries"
            title={<>Built for insurance. <span className="lp-accent">Useful anywhere the call is hard.</span></>}
            lede="It is one skill underneath: hold a high-stakes conversation with someone who has their own agenda, usually not in English, and be judged on how it went."
          />

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {INDUSTRIES.map((ind, i) => (
              <Reveal key={ind.name} delay={(i % 4) * 80}>
                <TiltCard className={`lp-card flex h-full flex-col rounded-2xl p-6 ${
                  ind.core ? 'lp-ring bg-white shadow-sm' : 'border border-black/5 bg-white/60 backdrop-blur'
                }`}>
                  {ind.core && (
                    <span className="mb-3 self-start rounded-full bg-gradient-to-r from-[color:var(--indigo-deep)]/10 to-[color:var(--peri-light)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--peri)]">
                      Built for this
                    </span>
                  )}
                  <h3 className="text-base font-semibold leading-snug">{ind.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[color:var(--ink-soft)]">{ind.body}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {ind.tracks.map((t) => (
                      <span key={t} className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] text-[color:var(--ink-soft)]">{t}</span>
                    ))}
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <div className="mt-12 rounded-3xl border border-dashed border-black/15 p-8 text-center">
              <p className="text-sm font-semibold">Also in use for</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {ALSO_FITS.map((a) => (
                  <span key={a} className="rounded-full border border-black/10 bg-white/70 px-3.5 py-1.5 text-sm text-[color:var(--ink-soft)]">{a}</span>
                ))}
              </div>
              <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed text-[color:var(--ink-soft)]">
                Nothing here is a different product. If your call is not in the library, tell Bixy what it is
                and she writes it — with your objection, your customer, your language.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Bixy */}
      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="lp-ring flex flex-col items-center gap-8 rounded-3xl bg-white/70 p-10 backdrop-blur md:flex-row">
            <div className="relative shrink-0">
              <div aria-hidden className="bixy-halo absolute inset-0 m-auto h-32 w-32" />
              <AssistantOrb state="listening" size={140} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] lp-accent">Your co-pilot</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight">Meet Bixy.</h2>
              <p className="mt-3 max-w-xl leading-relaxed text-[color:var(--ink-soft)]">
                Tap the orb anywhere and simply talk: “show my scenarios”, “open my reports”, “I keep losing them on price”.
                Bixy finds the call that fixes it and hands it to you, ready to start — or writes a new one from your own product.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-[#0a0e24] text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/Brand_atmostphere.png" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_100%,rgba(108,120,240,0.55),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0a0e24] via-[#0a0e24]/80 to-[#0a0e24]/40" />
        <div className="relative mx-auto max-w-6xl px-6 py-28 text-center">
          <Reveal>
            <h2 className="font-display text-5xl tracking-tight sm:text-6xl">
              Your next call, <span className="text-[color:var(--haze)]">rehearsed.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-white/60">
              Built for insurance teams in India. Free while we are in beta, and you are on a call within a minute.
            </p>
            <Link href={dest} className="lp-cta mt-10 inline-flex items-center gap-2 rounded-full px-8 py-4 text-lg font-medium text-white">
              Start practising <ArrowUpRight className="h-5 w-5" />
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="relative border-t border-black/5 py-10 text-center text-sm text-[color:var(--ink-soft)]">
        <div className="mb-2 flex items-center justify-center gap-2 font-medium text-[color:var(--ink)]">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-[color:var(--indigo-deep)] to-[color:var(--peri-light)]">
            <Mic className="h-3.5 w-3.5 text-white" />
          </span>
          SpeakCoach
        </div>
        © {new Date().getFullYear()} SpeakCoach · Sales-call training with AI
      </footer>
    </div>
  );
}
