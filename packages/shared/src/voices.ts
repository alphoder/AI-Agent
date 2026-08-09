/** Gemini Live prebuilt voices the trainee can pick from — two groups (male /
 *  female), four in each. No speed/rate options. ids must match what the AI
 *  relay forwards to Gemini. `sample` is a static clip (apps/web/public/voices). */
export type VoiceGender = 'male' | 'female';
export interface VoiceOption { id: string; label: string; gender: VoiceGender; description: string }

// All 30 Gemini Live prebuilt voices (verified working with the live model).
// `description` is Google's published voice characteristic; `gender` is the
// commonly-perceived gender (used only for the optional male/female grouping).
export const GEMINI_VOICES: VoiceOption[] = [
  { id: 'Charon', label: 'Charon', gender: 'male', description: 'Informative — deep, calm and authoritative.' },
  { id: 'Orus', label: 'Orus', gender: 'male', description: 'Firm — mature and reassuring.' },
  { id: 'Puck', label: 'Puck', gender: 'male', description: 'Upbeat — bright and approachable.' },
  { id: 'Fenrir', label: 'Fenrir', gender: 'male', description: 'Excitable — animated and energetic.' },
  { id: 'Enceladus', label: 'Enceladus', gender: 'male', description: 'Breathy — soft and intimate.' },
  { id: 'Iapetus', label: 'Iapetus', gender: 'male', description: 'Clear — crisp and precise.' },
  { id: 'Umbriel', label: 'Umbriel', gender: 'male', description: 'Easy-going — relaxed and casual.' },
  { id: 'Algieba', label: 'Algieba', gender: 'male', description: 'Smooth — polished and even.' },
  { id: 'Algenib', label: 'Algenib', gender: 'male', description: 'Gravelly — textured and grounded.' },
  { id: 'Rasalgethi', label: 'Rasalgethi', gender: 'male', description: 'Informative — articulate and steady.' },
  { id: 'Alnilam', label: 'Alnilam', gender: 'male', description: 'Firm — confident and direct.' },
  { id: 'Schedar', label: 'Schedar', gender: 'male', description: 'Even — balanced and neutral.' },
  { id: 'Achird', label: 'Achird', gender: 'male', description: 'Friendly — warm and welcoming.' },
  { id: 'Zubenelgenubi', label: 'Zubenelgenubi', gender: 'male', description: 'Casual — conversational and laid-back.' },
  { id: 'Sadachbia', label: 'Sadachbia', gender: 'male', description: 'Lively — spirited and expressive.' },
  { id: 'Sadaltager', label: 'Sadaltager', gender: 'male', description: 'Knowledgeable — assured and clear.' },
  { id: 'Kore', label: 'Kore', gender: 'female', description: 'Firm — steady and confident.' },
  { id: 'Aoede', label: 'Aoede', gender: 'female', description: 'Breezy — easy, friendly energy.' },
  { id: 'Leda', label: 'Leda', gender: 'female', description: 'Youthful — gentle and approachable.' },
  { id: 'Zephyr', label: 'Zephyr', gender: 'female', description: 'Bright — clean and articulate.' },
  { id: 'Callirrhoe', label: 'Callirrhoe', gender: 'female', description: 'Easy-going — relaxed and warm.' },
  { id: 'Autonoe', label: 'Autonoe', gender: 'female', description: 'Bright — crisp and cheerful.' },
  { id: 'Despina', label: 'Despina', gender: 'female', description: 'Smooth — polished and calm.' },
  { id: 'Erinome', label: 'Erinome', gender: 'female', description: 'Clear — precise and articulate.' },
  { id: 'Laomedeia', label: 'Laomedeia', gender: 'female', description: 'Upbeat — bright and lively.' },
  { id: 'Achernar', label: 'Achernar', gender: 'female', description: 'Soft — gentle and soothing.' },
  { id: 'Gacrux', label: 'Gacrux', gender: 'female', description: 'Mature — grounded and assured.' },
  { id: 'Pulcherrima', label: 'Pulcherrima', gender: 'female', description: 'Forward — direct and expressive.' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix', gender: 'female', description: 'Gentle — calm and reassuring.' },
  { id: 'Sulafat', label: 'Sulafat', gender: 'female', description: 'Warm — friendly and inviting.' },
];

export const VOICE_IDS: string[] = GEMINI_VOICES.map((v) => v.id);

export const MALE_VOICES: VoiceOption[] = GEMINI_VOICES.filter((v) => v.gender === 'male');
export const FEMALE_VOICES: VoiceOption[] = GEMINI_VOICES.filter((v) => v.gender === 'female');

/** Static sample clip URL for a voice (served from apps/web/public/voices). */
export const voiceSampleUrl = (id: string): string => `/voices/${id}.wav`;

const FEMALE_HINTS =
  /\b(she|her|hers|herself|mrs|ms|smt|woman|women|lady|ladies|mother|mom|wife|daughter|sister|aunt|girl|female|housewife|homemaker)\b/gi;
const MALE_HINTS =
  /\b(he|him|his|himself|mr|shri|man|men|gentleman|father|dad|husband|son|brother|uncle|boy|male)\b/gi;

/**
 * Which gender the scenario's character is written as, read out of the persona
 * text. There is no gender column on `scenarios` — the character lives in
 * `system_prompt` as prose — so the text is the only honest source.
 *
 * Returns null when the writing does not commit to a gender, which is the
 * common case and MUST stay meaningful: null means "offer every voice", not
 * "guess". Never infer from `scenario.voice`; every row has one (the seed
 * defaults it), so that would claim a gender for scenarios that never stated
 * one and would silently hide half the catalogue.
 *
 * ponytail: word-count heuristic, no NLP. A tie or a blank reads as null.
 * Self-check: npx tsx packages/shared/src/voices.test.ts
 */
export function personaGenderOf(...parts: (string | null | undefined)[]): VoiceGender | null {
  const text = parts.filter(Boolean).join(' ');
  if (!text.trim()) return null;
  const female = (text.match(FEMALE_HINTS) || []).length;
  const male = (text.match(MALE_HINTS) || []).length;
  if (female === male) return null;
  return female > male ? 'female' : 'male';
}

/** Voices offerable for a persona — every voice when the gender is unstated. */
export function voicesForPersona(gender: VoiceGender | null): VoiceOption[] {
  if (gender === 'male') return MALE_VOICES;
  if (gender === 'female') return FEMALE_VOICES;
  return GEMINI_VOICES;
}
