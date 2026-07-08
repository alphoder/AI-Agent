/**
 * Build the system prompt the Gemini Live coach uses for a session. Persona is
 * folded into the scenario now, so this is assembled purely from scenario fields.
 * The browser passes the returned string to the AI service WS `config` message.
 */

export interface ScenarioCtx {
  title?: string | null;
  description?: string | null;
  objective?: string | null;
  system_prompt?: string | null;
  opening_message?: string | null;
  difficulty_level?: string | null;
  max_turns?: number | null;
  language?: string | null;
  language_name?: string | null;
}

export function buildSystemPrompt(scenario: ScenarioCtx): string {
  const lines: string[] = [];
  const langLabel = scenario.language_name || scenario.language || 'en';

  // STRICT language directive at the very top — governs every turn.
  if (scenario.language) {
    lines.push(
      `LANGUAGE (NON-NEGOTIABLE): You MUST speak ONLY in ${langLabel} (code "${scenario.language}") for the entire conversation. ` +
        `Every single response, including the opening line, must be in ${langLabel}. ` +
        `Even if the learner speaks another language, you reply in ${langLabel}. Never switch languages under any circumstances.`,
    );
    lines.push('');
  }

  lines.push('You are a character in a live, spoken role-play with a human who is practising a real-world conversation.');
  lines.push('Speak naturally and concisely (1–2 sentences per turn unless asked for more). Never break character or mention being an AI.');
  lines.push('');

  if (scenario.system_prompt) {
    lines.push('## Your character & how to behave');
    lines.push(scenario.system_prompt);
    lines.push('');
  }

  if (scenario.title || scenario.description) {
    lines.push(`## Scene: ${scenario.title || 'Practice scenario'}`);
    if (scenario.description) lines.push(scenario.description);
    lines.push('');
  }

  if (scenario.objective) {
    lines.push("## The learner's goal (for your awareness only — never state it aloud)");
    lines.push(scenario.objective);
    lines.push('');
  }

  if (scenario.opening_message) {
    // The opening is a GUIDE, not a script — always spoken in the call's language,
    // even if this text is written in English. Never read it out verbatim.
    lines.push(`## How to open (speak first, in ${langLabel})`);
    lines.push(`Answer the call the way this customer naturally would, in the spirit of: "${scenario.opening_message}". Translate/adapt it into ${langLabel}; never say it in another language.`);
    lines.push('');
  }

  lines.push('## Rules');
  lines.push('- Stay fully in character; react believably to what the learner says.');
  lines.push('- Keep it conversational: no lists, no headings, no narration of your actions.');
  lines.push('- Do not invent facts about the learner; ask naturally instead.');
  if (scenario.language) {
    lines.push(`- Reminder: respond ONLY in ${langLabel}. Do not switch languages, ever.`);
  }

  return lines.join('\n');
}
