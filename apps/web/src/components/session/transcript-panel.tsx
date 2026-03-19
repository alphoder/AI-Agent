'use client';

import { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';

interface TranscriptEntry {
  role: 'learner' | 'avatar';
  content: string;
  turn_number: number;
  timestamp: number;
}

interface TranscriptPanelProps {
  transcripts: TranscriptEntry[];
  interimText?: string;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TranscriptPanel({ transcripts, interimText }: TranscriptPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, interimText]);

  if (transcripts.length === 0 && !interimText) {
    return (
      <div className="w-full max-w-2xl mt-2">
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-gray-500">
          <MessageSquare className="w-5 h-5 text-gray-600" />
          <p className="text-sm font-medium">Start speaking to begin the conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full max-w-2xl mt-2 max-h-52 overflow-y-auto scroll-smooth scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent"
    >
      <div className="space-y-3 px-1 py-2">
        {transcripts.map((t, i) => {
          const isLearner = t.role === 'learner';
          return (
            <div
              key={i}
              className={`flex flex-col ${isLearner ? 'items-end' : 'items-start'} animate-session-msg-in`}
              style={{ animationDelay: '0ms' }}
            >
              {/* Sender label + timestamp */}
              <div className={`flex items-center gap-2 mb-1 ${isLearner ? 'flex-row-reverse' : ''}`}>
                <span className="text-[11px] font-medium text-gray-500">
                  {isLearner ? 'You' : 'Avatar'}
                </span>
                {t.timestamp > 0 && (
                  <span className="text-[10px] text-gray-600">
                    {formatTimestamp(t.timestamp)}
                  </span>
                )}
              </div>

              {/* Message bubble */}
              <div
                className={`text-sm px-4 py-2.5 max-w-[80%] leading-relaxed ${
                  isLearner
                    ? 'bg-blue-600/20 text-blue-100 rounded-2xl rounded-br-md border border-blue-500/10'
                    : 'bg-gray-800/60 text-gray-200 rounded-2xl rounded-bl-md border border-gray-700/30'
                }`}
              >
                {t.content}
              </div>
            </div>
          );
        })}

        {/* Interim (typing) indicator */}
        {interimText && (
          <div className="flex flex-col items-end animate-session-msg-in">
            <div className="flex items-center gap-2 mb-1 flex-row-reverse">
              <span className="text-[11px] font-medium text-gray-500">You</span>
            </div>
            <div className="text-sm px-4 py-2.5 max-w-[80%] rounded-2xl rounded-br-md bg-blue-600/10 text-blue-300/60 border border-blue-500/5">
              <span className="animate-pulse">{interimText}...</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
