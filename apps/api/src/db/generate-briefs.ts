/**
 * Generate the client dossier (and a refined persona) for every public scenario.
 *
 *   npx tsx src/db/generate-briefs.ts             # all scenarios missing a brief
 *   npx tsx src/db/generate-briefs.ts --force     # regenerate everything
 *   npx tsx src/db/generate-briefs.ts --only "Term Life"   # one, by title match
 *   npx tsx src/db/generate-briefs.ts --dry       # print, write nothing
 *
 * Writes the brief to scenarios.client_brief AND emits
 * packages/shared/src/briefs.ts so a re-seed can restore it. The refined personas
 * are written to a review file rather than applied: they are hand-tuned, so a
 * human decides what lands in seed.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../config/database';
import { callAIService } from '../utils/ai-service-client';
import { ALL_SEED_SCENARIOS } from './scenarios/all';

const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
/**
 * Read the catalogue from the seed source instead of the database, and write only
 * briefs.ts. The committed file IS the source of truth (seed.ts writes it into
 * scenarios.client_brief), so this fills in every scenario without needing a
 * database at all, and without touching production.
 */
const FROM_SOURCE = process.argv.includes('--from-source');
const jobsIdx = process.argv.indexOf('--jobs');
/** Sequential would be hours at ~250 scenarios. Modest, because it is one API key. */
const JOBS = Math.max(1, Math.min(8, Number(process.argv[jobsIdx + 1]) || 2));

interface Row {
  id: string; title: string; description: string | null; objective: string | null;
  system_prompt: string; difficulty_level: string; language: string; client_brief: unknown;
}

/** The same shape the DB query returns, built from the committed seed scenarios. */
function rowsFromSource(existing: Record<string, unknown>): Row[] {
  return ALL_SEED_SCENARIOS
    .filter((s) => FORCE || !existing[s.title])
    .filter((s) => !ONLY || s.title.toLowerCase().includes(ONLY.toLowerCase()))
    .map((s) => ({
      id: s.title,               // no DB row to update; the title is the key
      title: s.title,
      description: s.description,
      objective: s.objective,
      system_prompt: s.system_prompt,
      difficulty_level: s.difficulty_level,
      language: s.language,
      client_brief: null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function main() {
  const sharedPath = path.resolve(__dirname, '../../../../packages/shared/src/briefs.ts');
  const existing = fs.existsSync(sharedPath) ? readExisting(sharedPath) : {};

  let rows: Row[];
  if (FROM_SOURCE) {
    rows = rowsFromSource(existing);
  } else {
    const where = ["deleted_at IS NULL", "visibility = 'public'", 'created_by IS NULL'];
    const params: unknown[] = [];
    if (!FORCE) where.push('client_brief IS NULL');
    if (ONLY) { params.push(`%${ONLY}%`); where.push(`title ILIKE $${params.length}`); }

    const res = await db.query(
      `SELECT id, title, description, objective, system_prompt, difficulty_level, language, client_brief
         FROM scenarios WHERE ${where.join(' AND ')} ORDER BY title`,
      params,
    );
    rows = res.rows as Row[];
  }

  console.log(
    `${rows.length} scenario(s) to process${DRY ? ' (dry run)' : ''}` +
    `${FROM_SOURCE ? ` from source, ${Object.keys(existing).length} already written, ${JOBS} at a time` : ''}\n`,
  );
  if (rows.length === 0) return;

  const briefs: Record<string, unknown> = {};
  const personas: { title: string; before: string; after: string; factDrift: string[] }[] = [];
  const failed: string[] = [];
  let leaks = 0;
  let drifted = 0;
  let done = 0;

  async function processOne(r: Row) {
    try {
      const aiRes = await callAIService({
        path: '/brief/generate',
        timeoutMs: 420_000,   // the AI service now waits out 429s; give it room
        body: {
          title: r.title,
          description: r.description ?? '',
          objective: r.objective ?? '',
          persona: r.system_prompt,
          difficulty: r.difficulty_level,
          language: r.language,
        },
      });
      const out = await aiRes.json() as {
        brief: Record<string, unknown>; quiz: unknown; exchange: unknown;
        refined_prompt?: string; coaching_leak?: string[]; fact_drift?: string[];
      };

      const payload = { brief: out.brief, quiz: out.quiz, exchange: out.exchange };
      briefs[r.title] = payload;
      if (out.refined_prompt) {
        personas.push({ title: r.title, before: r.system_prompt, after: out.refined_prompt, factDrift: out.fact_drift ?? [] });
      }

      const notes: string[] = [];
      if (out.coaching_leak?.length) { leaks++; notes.push(`coaching: ${out.coaching_leak.join(', ')}`); }
      if (out.fact_drift?.length) { drifted++; notes.push(`persona facts changed: ${out.fact_drift.join(' ')}`); }
      console.log(`[${++done}/${rows.length}] ${r.title} … ${notes.length ? `ok  ⚠ ${notes.join(' | ')}` : 'ok'}`);

      // No DB row to update in source mode: briefs.ts is the artefact, and the seed
      // writes it into scenarios.client_brief.
      if (!DRY && !FROM_SOURCE) {
        await db.query('UPDATE scenarios SET client_brief = $2::jsonb, updated_at = NOW() WHERE id = $1',
          [r.id, JSON.stringify(payload)]);
      }
    } catch (err) {
      failed.push(r.title);
      console.log(`[${++done}/${rows.length}] ${r.title} … FAILED: ${(err as Error).message}`);
    }
  }

  // A fixed pool of workers pulling off one shared queue, so a slow scenario does not
  // hold up a whole batch. Progress is flushed as it goes: this run is long enough
  // that losing it all to one crash at the end would be painful.
  const queue = [...rows];
  let sinceFlush = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await processOne(next);
      if (!DRY && ++sinceFlush >= 10) { sinceFlush = 0; writeBriefs(sharedPath, existing, briefs); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, rows.length) }, worker));

  if (failed.length) {
    console.log(`\n⚠ ${failed.length} failed and have NO brief. Re-run to pick them up:\n  ${failed.slice(0, 10).join('\n  ')}`);
    if (failed.length > 10) console.log(`  … and ${failed.length - 10} more`);
  }

  if (DRY) {
    console.log('\n--- sample ---');
    console.log(JSON.stringify(Object.values(briefs)[0], null, 2).slice(0, 2500));
    return;
  }

  // Commit the briefs so a re-seed restores them.
  const total = writeBriefs(sharedPath, existing, briefs);
  console.log(`\nwrote ${total} briefs -> packages/shared/src/briefs.ts`);

  // Refined personas go to a review file: seed.ts is hand-tuned, a human merges.
  // Merged by title, not overwritten: a re-run that picks up two stragglers must not
  // throw away the other two hundred entries waiting to be reviewed.
  if (personas.length) {
    const reviewPath = path.resolve(__dirname, 'refined-personas.review.json');
    let prior: typeof personas = [];
    try {
      if (fs.existsSync(reviewPath)) prior = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
    } catch { /* unreadable or hand-edited; start from what we just generated */ }
    const byTitle = new Map(prior.map((p) => [p.title, p]));
    for (const p of personas) byTitle.set(p.title, p);
    const all = [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title));
    fs.writeFileSync(reviewPath, JSON.stringify(all, null, 2), 'utf-8');
    console.log(`wrote ${all.length} refined personas (${personas.length} new) -> ${path.basename(reviewPath)} (review before merging into seed.ts)`);
  }
  if (leaks) console.log(`\n⚠ ${leaks} brief(s) still contain coaching language. Re-run --force --only "<title>" or fix by hand.`);
  if (drifted) console.log(`⚠ ${drifted} refined persona(s) changed a number the original stated. They are NOT applied; review the file before merging any into seed.ts.`);
}

/** Merge new briefs over what is already committed and write the file. Returns the count. */
function writeBriefs(file: string, existing: Record<string, unknown>, fresh: Record<string, unknown>): number {
  // Sorted so a regeneration produces a readable diff instead of a reshuffle.
  const merged = { ...existing, ...fresh };
  const ordered = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
  fs.writeFileSync(file,
    `/**\n * Client dossiers, keyed by scenario title.\n *\n * GENERATED by apps/api/src/db/generate-briefs.ts. Edit by regenerating, or by\n * hand if you are fixing one line. The seed writes these into scenarios.client_brief,\n * so re-seeding never loses them.\n */\nimport type { ScenarioBrief } from './brief';\n\nexport const SCENARIO_BRIEFS: Record<string, ScenarioBrief> = ${JSON.stringify(ordered, null, 2)} as unknown as Record<string, ScenarioBrief>;\n`,
    'utf-8');
  return Object.keys(ordered).length;
}

function readExisting(file: string): Record<string, unknown> {
  const src = fs.readFileSync(file, 'utf-8');
  const start = src.indexOf('= {');
  const end = src.lastIndexOf('} as unknown');
  if (start === -1 || end === -1) return {};
  try { return JSON.parse(src.slice(start + 2, end + 1)); } catch { return {}; }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
