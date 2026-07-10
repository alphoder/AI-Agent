/** Accent = the BCP-47 regional variant the Gemini Live `language_code` accepts.
 *  Verified working against the live model. English has several; most languages
 *  have a single regional variant (so the accent step auto-resolves). */
export interface AccentOption { code: string; label: string }

export const ACCENTS: Record<string, AccentOption[]> = {
  en: [
    { code: 'en-IN', label: 'Indian' },
    { code: 'en-US', label: 'American' },
    { code: 'en-GB', label: 'British' },
    { code: 'en-AU', label: 'Australian' },
    { code: 'en-IE', label: 'Irish' },
  ],
  es: [
    { code: 'es-US', label: 'Latin American' },
    { code: 'es-ES', label: 'European (Spain)' },
  ],
  fr: [
    { code: 'fr-FR', label: 'France' },
    { code: 'fr-CA', label: 'Canadian' },
  ],
  pt: [
    { code: 'pt-BR', label: 'Brazilian' },
    { code: 'pt-PT', label: 'European (Portugal)' },
  ],
  hi: [{ code: 'hi-IN', label: 'Indian' }],
  ta: [{ code: 'ta-IN', label: 'Indian' }],
  te: [{ code: 'te-IN', label: 'Indian' }],
  mr: [{ code: 'mr-IN', label: 'Indian' }],
  bn: [{ code: 'bn-IN', label: 'Indian' }],
  gu: [{ code: 'gu-IN', label: 'Indian' }],
  kn: [{ code: 'kn-IN', label: 'Indian' }],
  ml: [{ code: 'ml-IN', label: 'Indian' }],
  pa: [{ code: 'pa-IN', label: 'Indian' }],
  ur: [{ code: 'ur-IN', label: 'Indian' }],
  de: [{ code: 'de-DE', label: 'German' }],
  ar: [{ code: 'ar-XA', label: 'Standard Arabic' }],
};

/** Accent options for a 2-letter language code (empty if we have no variants). */
export function accentsForLanguage(lang: string): AccentOption[] {
  return ACCENTS[lang] ?? [];
}

/** Human label for a BCP-47 accent code (e.g. 'en-IN' -> 'Indian'). */
export function accentLabel(code: string): string {
  for (const opts of Object.values(ACCENTS)) {
    const hit = opts.find((o) => o.code === code);
    if (hit) return hit.label;
  }
  return code;
}
