/**
 * Seed script: Creates initial development data
 * - 1 tenant (Acme Corp)
 * - 2 users (admin + learner)
 * - 1 avatar
 * - 1 persona
 * - 1 scenario with 3-criteria rubric
 * - 1 assignment
 */
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/avatar_platform';

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('Seeding database...');

    // Disable RLS for seeding (we're the superuser)
    await pool.query("SET app.current_tenant_id = '00000000-0000-0000-0000-000000000000'");

    // 1. Create tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (id, name, slug, sso_provider, sso_config, avatar_provider)
       VALUES (
         generate_uuidv7(),
         'Acme Corporation',
         'acme',
         'oidc',
         '{"role_mapping": {"source_field": "groups", "admin_values": ["platform-admins"]}}',
         'simli'
       )
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const tenantId = tenantResult.rows[0].id;
    console.log(`  Tenant created: ${tenantId}`);

    // Set tenant context for RLS
    await pool.query('SELECT set_config($1, $2, false)', ['app.current_tenant_id', tenantId]);

    // 2. Create admin user
    const adminResult = await pool.query(
      `INSERT INTO users (id, tenant_id, email, display_name, role, external_id)
       VALUES (generate_uuidv7(), $1, 'admin@acme.com', 'Admin User', 'admin', 'admin-ext-001')
       ON CONFLICT (tenant_id, email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [tenantId],
    );
    const adminId = adminResult.rows[0].id;
    console.log(`  Admin user created: ${adminId}`);

    // 3. Create learner user
    const learnerResult = await pool.query(
      `INSERT INTO users (id, tenant_id, email, display_name, role, external_id)
       VALUES (generate_uuidv7(), $1, 'learner@acme.com', 'Jane Learner', 'learner', 'learner-ext-001')
       ON CONFLICT (tenant_id, email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [tenantId],
    );
    const learnerId = learnerResult.rows[0].id;
    console.log(`  Learner user created: ${learnerId}`);

    // 4. Create avatar
    const avatarResult = await pool.query(
      `INSERT INTO avatars (id, tenant_id, name, provider, source_image_url, status, created_by)
       VALUES (generate_uuidv7(), $1, 'Professional Coach', 'simli', 'https://placeholder.com/avatar.jpg', 'active', $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [tenantId, adminId],
    );
    const avatarId = avatarResult.rows[0]?.id;
    if (!avatarId) {
      console.log('  Avatar already exists, skipping...');
      await pool.end();
      return;
    }
    console.log(`  Avatar created: ${avatarId}`);

    // 5. Create persona
    const personaResult = await pool.query(
      `INSERT INTO personas (
         id, tenant_id, name, description, avatar_id, system_prompt,
         guardrails, rag_enabled, temperature, created_by
       )
       VALUES (
         generate_uuidv7(), $1, 'Sales Coach Sarah',
         'An experienced sales coach who helps learners practice cold calling techniques.',
         $2,
         'You are Sarah, a senior sales coach with 15 years of experience. You are conducting a cold calling role-play exercise. Stay in character. Be supportive but challenge the learner. Provide realistic objections. Never break character or discuss being an AI.',
         '{"allowed_topics": ["sales", "cold calling", "objection handling", "closing techniques"], "blocked_topics": ["politics", "religion", "personal finance advice"], "escalation_triggers": ["harassment", "threats"], "max_response_tokens": 256, "follow_up_question_frequency": 3}',
         false, 0.70, $3
       )
       RETURNING id`,
      [tenantId, avatarId, adminId],
    );
    const personaId = personaResult.rows[0].id;
    console.log(`  Persona created: ${personaId}`);

    // 6. Create scenario with 3-criteria rubric
    const scoringRubric = JSON.stringify([
      {
        name: 'Opening & Rapport',
        description: 'How effectively the learner opens the call and builds initial rapport',
        weight: 30,
        levels: [
          { score: 1, label: 'Poor', description: 'No greeting or rapport building, jumps straight to pitch' },
          { score: 2, label: 'Below Average', description: 'Basic greeting but no attempt at rapport' },
          { score: 3, label: 'Adequate', description: 'Professional greeting with some rapport building' },
          { score: 4, label: 'Good', description: 'Strong opening with personalized rapport building' },
          { score: 5, label: 'Excellent', description: 'Exceptional opening that naturally leads into conversation' },
        ],
      },
      {
        name: 'Objection Handling',
        description: 'Ability to address and overcome prospect objections',
        weight: 40,
        levels: [
          { score: 1, label: 'Poor', description: 'Cannot handle objections, gives up immediately' },
          { score: 2, label: 'Below Average', description: 'Acknowledges objections but cannot overcome them' },
          { score: 3, label: 'Adequate', description: 'Handles basic objections with standard responses' },
          { score: 4, label: 'Good', description: 'Effectively addresses objections with tailored responses' },
          { score: 5, label: 'Excellent', description: 'Anticipates objections and turns them into opportunities' },
        ],
      },
      {
        name: 'Closing Technique',
        description: 'Effectiveness of the close and next steps',
        weight: 30,
        levels: [
          { score: 1, label: 'Poor', description: 'No attempt to close or set next steps' },
          { score: 2, label: 'Below Average', description: 'Weak close with vague next steps' },
          { score: 3, label: 'Adequate', description: 'Standard close with defined next steps' },
          { score: 4, label: 'Good', description: 'Confident close with specific next steps and timeline' },
          { score: 5, label: 'Excellent', description: 'Natural close that secures commitment with clear action items' },
        ],
      },
    ]);

    const scenarioResult = await pool.query(
      `INSERT INTO scenarios (
         id, tenant_id, persona_id, title, description, objective,
         opening_context, opening_message, scoring_rubric, status,
         max_duration_sec, max_turns, difficulty_level, tags, created_by
       )
       VALUES (
         generate_uuidv7(), $1, $2,
         'Cold Call: Enterprise Software Demo',
         'Practice cold calling a VP of Engineering to schedule a product demo.',
         'Successfully schedule a product demo meeting with the prospect by handling objections and demonstrating value.',
         'You are calling the VP of Engineering at TechCorp. They have 500 engineers and are currently using a competitor product. Your goal is to schedule a 30-minute demo.',
         'Hello? This is Sarah from TechCorp, who am I speaking with?',
         $3::jsonb, 'active', 900, 50, 'intermediate',
         ARRAY['sales', 'cold-calling', 'b2b'], $4
       )
       RETURNING id`,
      [tenantId, personaId, scoringRubric, adminId],
    );
    const scenarioId = scenarioResult.rows[0].id;
    console.log(`  Scenario created: ${scenarioId}`);

    // 7. Create assignment
    const assignmentResult = await pool.query(
      `INSERT INTO scenario_assignments (id, tenant_id, scenario_id, user_id, assigned_by, due_date)
       VALUES (
         generate_uuidv7(), $1, $2, $3, $4,
         NOW() + INTERVAL '7 days'
       )
       ON CONFLICT (scenario_id, user_id) DO NOTHING
       RETURNING id`,
      [tenantId, scenarioId, learnerId, adminId],
    );
    const assignmentId = assignmentResult.rows[0]?.id;
    console.log(`  Assignment created: ${assignmentId}`);

    console.log('\nSeed completed successfully!');
    console.log(`\nTenant: ${tenantId}`);
    console.log(`Admin:  ${adminId} (admin@acme.com)`);
    console.log(`Learner: ${learnerId} (learner@acme.com)`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
