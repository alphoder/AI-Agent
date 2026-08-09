import { renderToFile } from '@react-pdf/renderer';
import React from 'react';
import { ReportPDF, type ReportData } from '../src/components/report-pdf';

const data: ReportData = {
  scenarioTitle: 'Home Insurance — Post-Disaster Call',
  language: 'en',
  date: new Date(2026, 7, 9).toLocaleString(),
  overall_score: 78,
  criteria_scores: [
    { criterion_name: 'Discovery', score: 3, weight: 30, justification: 'Few open questions before the pitch at [01:12]; you asked about cover but not about dependants.' },
    { criterion_name: 'Closing', score: 3, weight: 20, justification: 'Vague next step at [04:02] — no date agreed.' },
    { criterion_name: 'Opening & Rapport', score: 4, weight: 25, justification: 'Warm open at [00:12], acknowledged their time.' },
    { criterion_name: 'Objection Handling', score: 5, weight: 25, justification: 'Strong at [02:40]: reframed price against the claim they had just made.' },
  ],
  strengths: ['Opened without a script and earned the first minute [00:12]', 'Reframed the price objection against their own claim [02:40]', 'Stayed calm when they pushed back twice [03:10]'],
  improvements: ['Ask for a dated next step, not "I will call you" [04:02]', 'Ask about dependants before quoting a premium [01:12]', 'Cut the filler in the middle stretch [02:00-03:00]'],
  narrative_feedback: 'Solid opening, soft close. You earned the conversation early and handled the price objection well, but the discovery was thin: you quoted before you understood the household. Next time, two more questions before any number.',
  body_language_score: 72,
  body_language_feedback: 'Upright and steady, good eye contact in the first half; posture dropped as the call ran long.',
  talkRatio: 52,
  questions: 5,
  fillers: 9,
  durationSec: 240,
  passMark: 70,
};

renderToFile(React.createElement(ReportPDF, { data }), '/tmp/report-sample.pdf')
  .then(() => console.log('PDF WRITTEN'))
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
