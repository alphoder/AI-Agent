'use client';

import { useEffect, useState, ReactNode } from 'react';
import { Mic, Library, Languages, Video, BarChart3, Sparkles } from 'lucide-react';
import { AssistantOrb } from '@/components/assistant/assistant-orb';

const KEY = 'speakcoach_tour_done_v1';

interface Step { icon: ReactNode; title: string; body: string; visual?: ReactNode }

const STEPS: Step[] = [
  {
    icon: <Mic className="h-6 w-6" />,
    title: 'Welcome to SpeakCoach',
    body: 'Practice real conversations out loud with an AI coach that listens to what you say and watches how you carry yourself — then scores both.',
  },
  {
    icon: <Library className="h-6 w-6" />,
    title: 'The Practice library',
    body: 'On the Practice page you’ll find ready-made scenarios (interviews, sales, tough conversations). Hit “Practice” on any card to begin — or “Create scenario” to make your own.',
  },
  {
    icon: <Languages className="h-6 w-6" />,
    title: 'Pick any language',
    body: 'Before a session you choose a language from a searchable list. The coach will speak only that language for the whole conversation.',
  },
  {
    icon: <Video className="h-6 w-6" />,
    title: 'In a session',
    body: 'Allow your mic and camera, then just talk. You’ll see your own webcam, hear the coach reply, and your body language is read live (the video is never stored).',
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: 'Your reports',
    body: 'After each session, the “History” tab shows your verbal score, a body-language score, strengths, improvements — and a polished PDF you can download.',
  },
  {
    icon: <Sparkles className="h-6 w-6" />,
    title: 'Meet Bixy',
    body: 'See the cute glowing buddy at the bottom-right? That’s Bixy. Tap him and just say what you want — “show my scenarios”, “start a job interview in Hindi”, “create a scenario to practice saying no”. He’ll do it for you.',
    visual: <AssistantOrb state="speaking" size={96} />,
  },
];

export function TutorialTour() {
  const [show, setShow] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setShow(true); } catch { /* ignore */ }
  }, []);

  function finish() {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-card shadow-2xl overflow-hidden animate-pop-in">
        <div className="flex flex-col items-center text-center px-8 pt-8 pb-6">
          {step.visual ? (
            <div className="mb-4">{step.visual}</div>
          ) : (
            <div className="mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-grad-learner-hero text-white">{step.icon}</div>
          )}
          <h2 className="text-xl font-bold tracking-tight">{step.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.body}</p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pb-5">
          {STEPS.map((_, idx) => (
            <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-indigo-600' : 'w-1.5 bg-indigo-200'}`} />
          ))}
        </div>

        <div className="flex items-center justify-between px-6 pb-6">
          <button onClick={finish} className="text-sm text-muted-foreground hover:text-foreground">Skip</button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Back</button>
            )}
            <button
              onClick={() => (last ? finish() : setI(i + 1))}
              className="rounded-full bg-indigo-600 text-white px-5 py-2 text-sm font-medium hover:bg-indigo-700"
            >
              {last ? 'Let’s go' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
