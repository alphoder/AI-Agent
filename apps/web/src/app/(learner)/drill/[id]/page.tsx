'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Send, Sparkles, Phone, ArrowLeft, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api-client';

interface Msg { role: 'user' | 'customer'; text: string; tip?: string }

/** FREE text drill — the same customer, in chat, with a one-line coach.
 *  Runs on flash-lite: never metered, practise all day. */
export default function DrillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiClient.get(`/scenarios/${id}`).then(({ data }) => {
      setTitle(data.data.title);
      // The customer opens, like on a real call.
      setMsgs([{ role: 'customer', text: data.data.opening_message || 'Hello?' }]);
    }).catch(() => router.push('/home'));
  }, [id, router]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || done) return;
    setInput('');
    const next: Msg[] = [...msgs, { role: 'user', text }];
    setMsgs(next);
    setBusy(true);
    try {
      const { data } = await apiClient.post('/journey/drill', {
        scenario_id: id,
        messages: next.map((m) => ({ role: m.role, text: m.text })),
      });
      const { reply, tip, done: d } = data.data;
      setMsgs((cur) => {
        const withTip = [...cur];
        withTip[withTip.length - 1] = { ...withTip[withTip.length - 1], tip };
        return [...withTip, { role: 'customer', text: reply }];
      });
      if (d) setDone(true);
    } catch {
      setMsgs((cur) => [...cur, { role: 'customer', text: '(connection hiccup — say that again?)' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col">
      <div className="flex items-center gap-3 pb-3">
        <button onClick={() => router.back()} className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">{title || 'Text drill'}</h1>
          <p className="text-xs text-muted-foreground">Free text practice — type your side of the call, get coached every turn.</p>
        </div>
        <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">FREE</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-card p-4">
        {msgs.map((m, i) => (
          <div key={i}>
            <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                m.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted'}`}>
                {m.text}
              </div>
            </div>
            {m.tip && (
              <p className="mt-1 flex items-start gap-1 pl-1 text-xs text-primary">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0" /> {m.tip}
              </p>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> typing…</div>}
        {done && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-sm">
            <p className="font-semibold text-success">Technique landed. 🎉</p>
            <p className="mt-1 text-muted-foreground">You handled that in text — now do it with a live voice on the line.</p>
            <button onClick={() => router.push('/home')}
              className="press mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
              <Phone className="h-3.5 w-3.5" /> Take the live call
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={done ? 'Drill complete — take the live call!' : 'Type what you would say on the call…'}
          disabled={done}
          className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        />
        <button onClick={send} disabled={busy || done || !input.trim()}
          className="press grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
