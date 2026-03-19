'use client';

import { useEffect, useRef } from 'react';
import { User, Loader2, WifiOff } from 'lucide-react';

interface VideoPanelProps {
  videoTrack?: MediaStreamTrack | null;
  avatarSpeaking?: boolean;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
}

export default function VideoPanel({ videoTrack, avatarSpeaking, connectionStatus }: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && videoTrack) {
      const stream = new MediaStream([videoTrack]);
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [videoTrack]);

  return (
    <div className="w-full max-w-2xl relative group">
      {/* Glow ring when speaking */}
      {avatarSpeaking && (
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-blue-500/20 rounded-[20px] blur-md animate-pulse" />
      )}

      <div
        className={`relative w-full aspect-video rounded-2xl overflow-hidden transition-all duration-300 ${
          avatarSpeaking
            ? 'ring-2 ring-blue-500/40 ring-offset-2 ring-offset-gray-950'
            : 'ring-1 ring-gray-800'
        }`}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900" />

        {videoTrack ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={false}
            className="relative w-full h-full object-cover"
          />
        ) : (
          <div className="relative inset-0 flex flex-col items-center justify-center w-full h-full gap-3">
            {connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? (
              <>
                <div className="w-20 h-20 rounded-full bg-gray-700/50 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
                <p className="text-sm text-gray-400 font-medium">
                  {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connecting to avatar...'}
                </p>
              </>
            ) : connectionStatus === 'disconnected' ? (
              <>
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                  <WifiOff className="w-8 h-8 text-red-400/60" />
                </div>
                <p className="text-sm text-red-400 font-medium">Connection Lost</p>
                <p className="text-xs text-gray-500">Please check your network</p>
              </>
            ) : (
              <>
                {/* Avatar placeholder */}
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-gray-700/50 flex items-center justify-center">
                  <User className="w-10 h-10 text-gray-500" />
                </div>
                <p className="text-xs text-gray-500">Avatar video will appear here</p>
              </>
            )}
          </div>
        )}

        {/* Speaking indicator */}
        {avatarSpeaking && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
            <div className="flex items-end gap-[3px] h-3.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-[3px] bg-blue-400 rounded-full animate-session-eq-bar"
                  style={{
                    animationDelay: `${i * 120}ms`,
                    animationDuration: '0.8s',
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-blue-300 font-medium">Speaking</span>
          </div>
        )}

        {/* Subtle vignette overlay */}
        <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)',
        }} />
      </div>
    </div>
  );
}
