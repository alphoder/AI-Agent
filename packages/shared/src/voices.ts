/** Gemini Live prebuilt voices the user can pick from. ids must match what the
 *  AI relay forwards to Gemini (see apps/api scenario VOICES + ai-service).
 *  `sample` is a static clip of the real Gemini voice (apps/web/public/voices). */
export interface VoiceOption { id: string; label: string; description: string }

export const GEMINI_VOICES: VoiceOption[] = [
  { id: 'Aoede', label: 'Aoede', description: 'Breezy and light — easy, friendly energy.' },
  { id: 'Puck', label: 'Puck', description: 'Upbeat and playful — bright and spirited.' },
  { id: 'Charon', label: 'Charon', description: 'Deep and measured — calm and authoritative.' },
  { id: 'Kore', label: 'Kore', description: 'Firm and clear — steady and confident.' },
  { id: 'Fenrir', label: 'Fenrir', description: 'Lively and expressive — animated and warm.' },
  { id: 'Leda', label: 'Leda', description: 'Youthful and bright — gentle and approachable.' },
  { id: 'Orus', label: 'Orus', description: 'Warm and grounded — mature and reassuring.' },
  { id: 'Zephyr', label: 'Zephyr', description: 'Bright and crisp — clean and articulate.' },
];

export const VOICE_IDS: string[] = GEMINI_VOICES.map((v) => v.id);

/** Static sample clip URL for a voice (served from apps/web/public/voices). */
export const voiceSampleUrl = (id: string): string => `/voices/${id}.wav`;
