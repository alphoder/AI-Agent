/**
 * Seed script: the SpeakCoach public scenario library.
 *
 * The scenarios themselves live in ./scenarios/<category>.ts — one file per browse
 * category (see packages/shared/src/catalog.ts). This file only knows how to write
 * them to Postgres.
 *
 * The AI always plays the OTHER person (customer, interviewer, client, report); the
 * trainee is the professional. ALL scenario text is written in ENGLISH — the call
 * language is chosen by the user at start and the AI speaks that language.
 * Public rows (created_by = NULL). Idempotent on title — re-running UPDATES the
 * persona/fields of existing rows (so tuned personas actually take effect).
 *
 * Personas are written as real people with a backstory and a HIDDEN need — NOT as
 * scripted "if the agent says X, warm up" logic. The conviction bar, brush-off/hook,
 * progressive disclosure and voice-follows-state all live in buildSystemPrompt
 * (apps/api/src/utils/prompt-bundle.ts) and do the judging, so each persona only
 * supplies who they are and what they really care about.
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { SCENARIO_BRIEFS } from '@avatar-platform/shared';
import type { SeedScenario } from './scenarios/kit';
import { SALES_SCENARIOS } from './scenarios/sales';
import { CLIENT_GROWTH_SCENARIOS } from './scenarios/client-growth';
import { INTERVIEW_SCENARIOS } from './scenarios/interview';
import { SUPPORT_SCENARIOS } from './scenarios/support';
import { NEGOTIATION_SCENARIOS } from './scenarios/negotiation';
import { LEADERSHIP_SCENARIOS } from './scenarios/leadership';
import { SPEAKING_SCENARIOS } from './scenarios/speaking';
import { CONFIDENCE_SCENARIOS } from './scenarios/confidence';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/avatar_platform';

/** The committed client dossier for a title, or null if none was generated. */
function briefJson(title: string): string | null {
  const b = SCENARIO_BRIEFS[title];
  return b ? JSON.stringify(b) : null;
}

const SCENARIOS: SeedScenario[] = [
  ...SALES_SCENARIOS,
  ...CLIENT_GROWTH_SCENARIOS,
  ...INTERVIEW_SCENARIOS,
  ...SUPPORT_SCENARIOS,
  ...NEGOTIATION_SCENARIOS,
  ...LEADERSHIP_SCENARIOS,
  ...SPEAKING_SCENARIOS,
  ...CONFIDENCE_SCENARIOS,
];

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    console.log('Seeding BFSI / Insurance sales scenario library (English text, user-chosen language)...');
    let created = 0;
    let updated = 0;

    for (const s of SCENARIOS) {
      const exists = await pool.query(
        `SELECT id FROM scenarios WHERE title = $1 AND created_by IS NULL AND deleted_at IS NULL LIMIT 1`,
        [s.title],
      );
      if (exists.rows.length > 0) {
        // Refresh the tuned persona + fields on the existing public row.
        await pool.query(
          `UPDATE scenarios SET
             description = $2, objective = $3, system_prompt = $4, opening_message = $5,
             language = $6, voice = $7, scoring_rubric = $8::jsonb, difficulty_level = $9,
             tags = $10, client_brief = COALESCE($11::jsonb, client_brief), updated_at = NOW()
           WHERE id = $1`,
          [
            exists.rows[0].id, s.description, s.objective, s.system_prompt, s.opening_message,
            s.language, s.voice, JSON.stringify(s.rubric), s.difficulty_level, s.tags,
            briefJson(s.title),
          ],
        );
        updated++;
        console.log(`  updated: ${s.title}`);
        continue;
      }
      await pool.query(
        `INSERT INTO scenarios (
           id, title, description, objective, system_prompt, opening_message,
           language, voice, scoring_rubric, status, visibility,
           max_duration_sec, max_turns, difficulty_level, tags, created_by, client_brief
         )
         VALUES (
           generate_uuidv7(), $1, $2, $3, $4, $5,
           $6, $7, $8::jsonb, 'active', 'public',
           600, 40, $9, $10, NULL, $11::jsonb
         )`,
        [
          s.title, s.description, s.objective, s.system_prompt, s.opening_message,
          s.language, s.voice, JSON.stringify(s.rubric), s.difficulty_level, s.tags,
          briefJson(s.title),
        ],
      );
      created++;
      console.log(`  created: ${s.title}`);
    }

    console.log(`\nSeed complete — ${created} created, ${updated} updated.`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
