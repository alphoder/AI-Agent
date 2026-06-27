'use client';

import { useState } from 'react';
import { LifeBuoy, Search, HelpCircle, ChevronDown, ChevronUp, Mail, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Accent } from '@/components/ui/accent';

interface FAQ {
  question: string;
  answer: string;
  category: 'scoring' | 'voice' | 'privacy' | 'general';
}

const FAQS: FAQ[] = [
  {
    category: 'scoring',
    question: 'How does SpeakCoach score my speaking session?',
    answer: 'At the end of each session, SpeakCoach evaluates your conversation transcript against the specific scenario rubric (such as Clarity, Persuasion, or Engagement). Gemini AI evaluates your arguments, vocabulary, and relevance, yielding a score out of 100. If your webcam is enabled, we also evaluate posture, pacing, and eye contact for a separate body language score.',
  },
  {
    category: 'privacy',
    question: 'Does SpeakCoach store or record my webcam video?',
    answer: 'Absolutely not. Webcam video is processed locally in your browser. We extract abstract features (e.g. eye alignment, posture shifts, talking pacing) and send textual notes to the AI model. No raw video or audio files are ever stored or uploaded to our servers, keeping your practice private and safe.',
  },
  {
    category: 'voice',
    question: 'Bixy or the coach is not responding. How do I fix this?',
    answer: 'First, make sure you have allowed microphone permissions in your browser. If you are using voice mode, SpeakCoach requires standard Web Speech Recognition API support, which works best on Google Chrome, Microsoft Edge, and Safari. Check that you do not have another app blocking your audio input device.',
  },
  {
    category: 'general',
    question: 'What is the "Adaptive Journey"?',
    answer: 'The Adaptive Journey is a day-by-day learning path generated based on the goals you select during onboarding (like Public Speaking or English Fluency). As you complete sessions and improve your scores, subsequent scenarios will automatically adjust in difficulty to keep you challenged and growing.',
  },
  {
    category: 'privacy',
    question: 'Can I opt out of webcam analysis completely?',
    answer: 'Yes! Webcam body language analysis is completely optional. You can turn off your camera at any point during a session using the camera toggle in the live room, or disable it permanently in your account Settings. You will still receive full verbal feedback on your speech.',
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFAQ, setActiveFAQ] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'scoring' | 'voice' | 'privacy' | 'general'>('all');
  
  // Contact form state
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    // Simulate sending support ticket
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setEmail('');
      setSubject('');
      setMessage('');
      setTimeout(() => setSent(false), 5000);
    }, 1500);
  }

  const filteredFAQs = FAQS.filter(
    (faq) =>
      (activeCategory === 'all' || faq.category === activeCategory) &&
      (faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Help & Support</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Find answers, read troubleshooting guides or reach out to our team.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* FAQs */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="font-semibold text-base">Frequently Asked Questions</h2>
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary/20 pl-9 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap gap-2">
              {['all', 'scoring', 'voice', 'privacy', 'general'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat as any);
                    setActiveFAQ(null);
                  }}
                  className={`press px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all border ${
                    activeCategory === cat
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border-transparent'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="divide-y divide-border pt-2">
              {filteredFAQs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No questions match your query. Try a different query.
                </p>
              ) : (
                filteredFAQs.map((faq, index) => {
                  const isOpen = activeFAQ === index;
                  return (
                    <div key={index} className="py-4">
                      <button
                        onClick={() => setActiveFAQ(isOpen ? null : index)}
                        className="flex w-full items-center justify-between font-medium text-sm text-left hover:text-primary transition-colors"
                      >
                        <span>{faq.question}</span>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 ml-4" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-4" />}
                      </button>
                      {isOpen && (
                        <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed animate-fade-in">
                          {faq.answer}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Troubleshooting tips */}
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold text-base flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-4 w-4" /> Browser Permissions Troubleshooting
            </h2>
            <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
              <p>
                To calibrate microphone or camera access, please click the lock/settings icon in your browser address bar (to the left of <code className="bg-secondary px-1 py-0.5 rounded text-xs text-foreground">localhost:3000</code> or your deployment URL).
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs">
                <li>**Chrome/Edge:** Select &quot;Site Settings&quot; and toggle microphone & camera access to **Allow**.</li>
                <li>**Safari:** Go to Preferences &gt; Websites &gt; Microphone/Camera, select SpeakCoach and toggle to **Allow**.</li>
                <li>**Firefox:** Click the camera/microphone crossed-out icons in the URL bar and select **Allow Access**.</li>
              </ul>
            </div>
          </Card>
        </div>

        {/* Contact Form */}
        <div className="md:col-span-1">
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="h-4 w-4" /> Contact Support
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Stuck or found a bug? Drop a message to our support staff directly. We typically reply within 24 hours.
            </p>

            {sent ? (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center animate-pop-in">
                <p className="text-sm font-bold text-emerald-500">Ticket Submitted!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  We have received your request and will reach out via email shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Your Email</label>
                  <input
                    type="email"
                    required
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Subject</label>
                  <input
                    type="text"
                    required
                    placeholder="Issue with mic/scores/etc."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Message</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe your question or issue in detail..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={sending}
                  className="w-full rounded-full mt-2 flex items-center justify-center gap-1.5"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {sending ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
