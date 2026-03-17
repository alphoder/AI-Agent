import { create } from 'zustand';
import type { Session, SessionTranscript } from '@avatar-platform/shared';

interface SessionState {
  session: Session | null;
  transcripts: SessionTranscript[];
  isConnected: boolean;
  isMicOn: boolean;
  setSession: (session: Session | null) => void;
  addTranscript: (transcript: SessionTranscript) => void;
  setConnected: (connected: boolean) => void;
  toggleMic: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  transcripts: [],
  isConnected: false,
  isMicOn: false,
  setSession: (session) => set({ session }),
  addTranscript: (transcript) =>
    set((state) => ({ transcripts: [...state.transcripts, transcript] })),
  setConnected: (isConnected) => set({ isConnected }),
  toggleMic: () => set((state) => ({ isMicOn: !state.isMicOn })),
  reset: () => set({ session: null, transcripts: [], isConnected: false, isMicOn: false }),
}));
