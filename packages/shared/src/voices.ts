/** Gemini Live prebuilt voices the trainee can pick from — two groups (male /
 *  female), four in each. No speed/rate options. ids must match what the AI
 *  relay forwards to Gemini. `sample` is a static clip (apps/web/public/voices). */
export type VoiceGender = 'male' | 'female';
export interface VoiceOption { id: string; label: string; gender: VoiceGender; description: string }

export const GEMINI_VOICES: VoiceOption[] = [
  // Male
  { id: 'Charon', label: 'Charon', gender: 'male', description: 'Deep and measured — calm and authoritative.' },
  { id: 'Orus', label: 'Orus', gender: 'male', description: 'Warm and grounded — mature and reassuring.' },
  { id: 'Puck', label: 'Puck', gender: 'male', description: 'Upbeat and friendly — bright and approachable.' },
  { id: 'Fenrir', label: 'Fenrir', gender: 'male', description: 'Lively and expressive — animated and energetic.' },
  // Female
  { id: 'Kore', label: 'Kore', gender: 'female', description: 'Firm and clear — steady and confident.' },
  { id: 'Aoede', label: 'Aoede', gender: 'female', description: 'Breezy and light — easy, friendly energy.' },
  { id: 'Leda', label: 'Leda', gender: 'female', description: 'Youthful and bright — gentle and approachable.' },
  { id: 'Zephyr', label: 'Zephyr', gender: 'female', description: 'Bright and crisp — clean and articulate.' },
];

export const VOICE_IDS: string[] = GEMINI_VOICES.map((v) => v.id);

export const MALE_VOICES: VoiceOption[] = GEMINI_VOICES.filter((v) => v.gender === 'male');
export const FEMALE_VOICES: VoiceOption[] = GEMINI_VOICES.filter((v) => v.gender === 'female');

/** Static sample clip URL for a voice (served from apps/web/public/voices). */
export const voiceSampleUrl = (id: string): string => `/voices/${id}.wav`;
