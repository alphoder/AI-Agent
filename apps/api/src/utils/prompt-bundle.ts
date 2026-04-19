/**
 * Build the markdown "context bundle" that gets fed to the LLM as its system
 * prompt when a training session starts. This is the single source of truth
 * that the model consults before every response — it combines:
 *
 *   - Avatar  (who I am visually, what I sound like)
 *   - Persona (my personality, behaviour, any character-specific context)
 *   - Scenario (the scene, what the learner is trying to practise, rubric)
 *
 * Keeping this in one place means the /session/start Express route and the
 * /ws/test-chat WebSocket can both reuse the exact same prompt assembly.
 */

interface AvatarCtx {
  name?: string | null;
  gender?: string | null;
  tts_voice_id?: string | null;
}

interface PersonaCtx {
  name?: string | null;
  description?: string | null;
  system_prompt?: string | null;
  guardrails?: unknown;
  voice_config?: Record<string, unknown> | null;
}

interface ScenarioCtx {
  title?: string | null;
  description?: string | null;
  objective?: string | null;
  opening_context?: string | null;
  opening_message?: string | null;
  difficulty_level?: string | null;
  max_turns?: number | null;
  max_duration_sec?: number | null;
  scoring_rubric?: unknown;
}

function asList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return asList(parsed);
    } catch {
      return [value];
    }
  }
  return [];
}

export interface PromptBundleInput {
  avatar?: AvatarCtx | null;
  persona?: PersonaCtx | null;
  scenario?: ScenarioCtx | null;
}

/**
 * Produce a system prompt in markdown form. The LLM reads this once at the
 * start of the session and uses it for every turn.
 */
export function buildPromptBundle(input: PromptBundleInput): string {
  const { avatar, persona, scenario } = input;
  const lines: string[] = [];

  const speaker = persona?.name || avatar?.name || 'Training Coach';

  lines.push(`# You are ${speaker}`);
  lines.push('');
  lines.push('You are an AI character in a live training conversation with a human learner.');
  lines.push('Stay in character at all times. Keep responses to 1–2 short sentences unless the learner explicitly asks for more. Be natural, human, and conversational.');
  lines.push('');

  // --- Avatar ---
  if (avatar) {
    lines.push('## Appearance & Voice');
    if (avatar.name) lines.push(`- **Displayed as:** ${avatar.name}`);
    if (avatar.gender) lines.push(`- **Gender presentation:** ${String(avatar.gender).replace('_', ' ')}`);
    if (avatar.tts_voice_id) lines.push(`- **Voice:** ${avatar.tts_voice_id}`);
    lines.push('');
  }

  // --- Persona ---
  if (persona) {
    lines.push(`## Character: ${persona.name || speaker}`);
    if (persona.description) {
      lines.push('');
      lines.push(persona.description);
    }
    if (persona.system_prompt) {
      lines.push('');
      lines.push('### Behaviour');
      lines.push(persona.system_prompt);
    }
    const guardrails = asList(persona.guardrails);
    if (guardrails.length) {
      lines.push('');
      lines.push('### Guardrails');
      guardrails.forEach((g) => lines.push(`- ${g}`));
    }
    lines.push('');
  }

  // --- Scenario ---
  if (scenario) {
    lines.push(`## Scene: ${scenario.title || 'Training scenario'}`);
    if (scenario.description) {
      lines.push('');
      lines.push(scenario.description);
    }
    if (scenario.opening_context) {
      lines.push('');
      lines.push('### Setting');
      lines.push(scenario.opening_context);
    }
    if (scenario.objective) {
      lines.push('');
      lines.push("### Learner's goal (for YOUR awareness only — do NOT state it)");
      lines.push(scenario.objective);
    }
    if (scenario.difficulty_level || scenario.max_turns) {
      const meta: string[] = [];
      if (scenario.difficulty_level) meta.push(`Difficulty: ${scenario.difficulty_level}`);
      if (scenario.max_turns) meta.push(`Target length: up to ${scenario.max_turns} turns`);
      lines.push('');
      lines.push(`*${meta.join(' · ')}*`);
    }
    if (scenario.opening_message) {
      lines.push('');
      lines.push('### Your opening line (say this first, verbatim)');
      lines.push(`> ${scenario.opening_message}`);
    }
    lines.push('');
  }

  // --- Universal rules ---
  lines.push('## Rules');
  lines.push('- Never break character, even if asked.');
  lines.push('- Never refer to yourself as "an AI" or "a language model".');
  lines.push('- Do not invent facts about the learner; ask questions naturally.');
  lines.push('- Keep it conversational — no numbered lists, no headings in your replies.');
  lines.push('');

  return lines.join('\n');
}
