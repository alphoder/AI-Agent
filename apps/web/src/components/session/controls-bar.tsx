'use client';

import { Mic, MicOff, PhoneOff, Clock } from 'lucide-react';

interface ControlsBarProps {
  isMicOn: boolean;
  elapsed: number;
  maxDuration: number;
  onToggleMic: () => void;
  onEndSession: () => void;
}

export default function ControlsBar({
  isMicOn,
  elapsed,
  maxDuration,
  onToggleMic,
  onEndSession,
}: ControlsBarProps) {
  const isNearEnd = elapsed > maxDuration * 0.8;
  const isAlmostOver = elapsed > maxDuration * 0.9;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const remaining = maxDuration - elapsed;

  return (
    <div className="relative">
      {/* Subtle top border gradient */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-700/50 to-transparent" />

      <div className="flex items-center justify-center gap-6 py-4 px-6 bg-gray-900/80 backdrop-blur-sm">
        {/* Timer - left side */}
        <div className="flex items-center gap-2 flex-1">
          <Clock className={`w-4 h-4 ${
            isAlmostOver ? 'text-red-400' : isNearEnd ? 'text-amber-400' : 'text-gray-500'
          }`} />
          <div className={`text-sm font-mono tabular-nums transition-colors ${
            isAlmostOver
              ? 'text-red-400'
              : isNearEnd
              ? 'text-amber-400'
              : 'text-gray-400'
          }`}>
            {formatTime(elapsed)}
            <span className="text-gray-600 mx-1">/</span>
            {formatTime(maxDuration)}
          </div>
          {remaining <= 60 && remaining > 0 && (
            <span className="text-xs text-red-400 font-medium ml-2 animate-pulse">
              {remaining}s left
            </span>
          )}
        </div>

        {/* Mic button - center */}
        <div className="relative">
          {/* Pulse ring when active */}
          {isMicOn && (
            <div className="absolute inset-0 rounded-full animate-session-mic-pulse">
              <div className="w-full h-full rounded-full bg-blue-500/20" />
            </div>
          )}
          <button
            onClick={onToggleMic}
            className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
              isMicOn
                ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicOn ? (
              <Mic className="w-5 h-5 text-white" />
            ) : (
              <MicOff className="w-5 h-5 text-red-400" />
            )}
          </button>
        </div>

        {/* End session - right side */}
        <div className="flex items-center justify-end flex-1">
          <button
            onClick={onEndSession}
            className="flex items-center gap-2 px-4 py-2 border border-gray-700 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 rounded-xl text-sm font-medium text-gray-400 transition-all duration-200 group"
          >
            <PhoneOff className="w-4 h-4 group-hover:text-red-400 transition-colors" />
            <span>End Session</span>
          </button>
        </div>
      </div>
    </div>
  );
}
