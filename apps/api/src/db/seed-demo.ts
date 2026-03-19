/**
 * Demo Seed Script: Populates the AI Avatar Training Platform with realistic
 * test data that exercises ALL features — avatars, personas, scenarios,
 * assignments, sessions, transcripts, and scores.
 *
 * Expects the base seed (seed.ts) to have run first so the "acme" tenant,
 * admin user, and learner user already exist.
 *
 * Usage:  pnpm seed:demo
 */
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/avatar_platform';

async function seedDemo() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('=== Demo Seed: Starting ===\n');

    // ------------------------------------------------------------------
    // 0.  Resolve existing tenant + users
    // ------------------------------------------------------------------
    const tenantRow = await pool.query(
      `SELECT id FROM tenants WHERE slug = 'acme' LIMIT 1`,
    );
    if (tenantRow.rows.length === 0) {
      throw new Error('Tenant "acme" not found. Run the base seed first (pnpm seed).');
    }
    const tenantId = tenantRow.rows[0].id;
    console.log(`  Tenant (acme): ${tenantId}`);

    // Set RLS context
    await pool.query('SELECT set_config($1, $2, false)', [
      'app.current_tenant_id',
      tenantId,
    ]);

    const adminRow = await pool.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = 'admin' LIMIT 1`,
      [tenantId],
    );
    if (adminRow.rows.length === 0) {
      throw new Error('Admin user not found for acme tenant.');
    }
    const adminId = adminRow.rows[0].id;
    console.log(`  Admin:         ${adminId}`);

    const learnerRow = await pool.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = 'learner' LIMIT 1`,
      [tenantId],
    );
    if (learnerRow.rows.length === 0) {
      throw new Error('Learner user not found for acme tenant.');
    }
    const learnerId = learnerRow.rows[0].id;
    console.log(`  Learner:       ${learnerId}`);

    // ------------------------------------------------------------------
    // 1.  Clean up previous demo data (keep tenant + users)
    //     Cascade handles transcripts, scores automatically.
    // ------------------------------------------------------------------
    console.log('\n  Cleaning previous demo data...');
    await pool.query(`DELETE FROM sessions WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM scenario_assignments WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM scenarios WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM personas WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM avatars WHERE tenant_id = $1`, [tenantId]);
    console.log('  Done.');

    // ------------------------------------------------------------------
    // 2.  Avatars (3)
    // ------------------------------------------------------------------
    console.log('\n  Creating avatars...');

    const avatarSarah = (
      await pool.query(
        `INSERT INTO avatars (tenant_id, name, provider, source_image_url, thumbnail_url, status, created_by)
         VALUES ($1, 'Sarah', 'simli', 'https://placeholder.com/avatars/sarah.jpg', 'https://placeholder.com/avatars/sarah_thumb.jpg', 'active', $2)
         RETURNING id`,
        [tenantId, adminId],
      )
    ).rows[0].id;
    console.log(`    Sarah  (simli):  ${avatarSarah}`);

    const avatarJames = (
      await pool.query(
        `INSERT INTO avatars (tenant_id, name, provider, source_image_url, thumbnail_url, status, created_by)
         VALUES ($1, 'James', 'heygen', 'https://placeholder.com/avatars/james.jpg', 'https://placeholder.com/avatars/james_thumb.jpg', 'active', $2)
         RETURNING id`,
        [tenantId, adminId],
      )
    ).rows[0].id;
    console.log(`    James  (heygen): ${avatarJames}`);

    const avatarChen = (
      await pool.query(
        `INSERT INTO avatars (tenant_id, name, provider, source_image_url, thumbnail_url, status, created_by)
         VALUES ($1, 'Dr. Chen', 'simli', 'https://placeholder.com/avatars/chen.jpg', 'https://placeholder.com/avatars/chen_thumb.jpg', 'active', $2)
         RETURNING id`,
        [tenantId, adminId],
      )
    ).rows[0].id;
    console.log(`    Dr. Chen (simli): ${avatarChen}`);

    // ------------------------------------------------------------------
    // 3.  Personas (3)
    // ------------------------------------------------------------------
    console.log('\n  Creating personas...');

    const personaSarah = (
      await pool.query(
        `INSERT INTO personas (
           tenant_id, name, description, avatar_id, system_prompt,
           guardrails, rag_enabled, temperature, created_by
         ) VALUES (
           $1,
           'Sales Coach Sarah',
           'An experienced enterprise sales coach specializing in cold calling, objection handling, and closing techniques. Sarah has 15 years of B2B SaaS sales experience.',
           $2,
           'You are Sarah, a senior sales coach with 15 years of enterprise software sales experience. You role-play as a prospect (VP of Engineering, CTO, etc.) for cold-call practice. Stay in character. Be realistic — present common objections like budget constraints, existing solutions, and timeline issues. Gradually increase difficulty as the learner improves. Never break character or discuss being an AI. Provide subtle verbal cues when the learner is on the right track.',
           '{"allowed_topics": ["sales", "cold calling", "objection handling", "closing techniques", "b2b", "enterprise software"], "blocked_topics": ["politics", "religion", "personal finance advice"], "escalation_triggers": ["harassment", "threats", "profanity"], "max_response_tokens": 256, "follow_up_question_frequency": 3}',
           true, 0.70, $3
         ) RETURNING id`,
        [tenantId, avatarSarah, adminId],
      )
    ).rows[0].id;
    console.log(`    Sales Coach Sarah:          ${personaSarah}`);

    const personaJames = (
      await pool.query(
        `INSERT INTO personas (
           tenant_id, name, description, avatar_id, system_prompt,
           guardrails, rag_enabled, temperature, created_by
         ) VALUES (
           $1,
           'Interview Coach James',
           'A seasoned hiring manager and interview coach who helps candidates prepare for behavioral and technical interviews at top tech companies.',
           $2,
           'You are James, a hiring manager at a Fortune 500 tech company with 12 years of interviewing experience. You conduct realistic mock interviews. For behavioral interviews, use the STAR method to evaluate responses. For technical interviews, probe system design thinking. Be professional but friendly. Ask follow-up questions to push the candidate deeper. Give non-verbal feedback through tone. Never break character or discuss being an AI.',
           '{"allowed_topics": ["interviews", "behavioral questions", "system design", "career development", "leadership", "teamwork"], "blocked_topics": ["politics", "religion", "salary negotiation specifics"], "escalation_triggers": ["harassment", "threats"], "max_response_tokens": 256, "follow_up_question_frequency": 2}',
           false, 0.65, $3
         ) RETURNING id`,
        [tenantId, avatarJames, adminId],
      )
    ).rows[0].id;
    console.log(`    Interview Coach James:      ${personaJames}`);

    const personaChen = (
      await pool.query(
        `INSERT INTO personas (
           tenant_id, name, description, avatar_id, system_prompt,
           guardrails, rag_enabled, temperature, created_by
         ) VALUES (
           $1,
           'Medical Trainer Dr. Chen',
           'A board-certified physician and medical educator specializing in patient consultation training for medical students and residents.',
           $2,
           'You are Dr. Chen, a patient presenting symptoms during a medical consultation. You have a specific set of symptoms, medical history, and concerns. Answer questions naturally — do not volunteer information unless asked. Show appropriate emotional responses (anxiety, confusion, relief). If the learner fails to ask about allergies or medication interactions, do not bring them up. Use layperson language. Never break character or discuss being an AI.',
           '{"allowed_topics": ["medical consultation", "patient history", "symptoms", "diagnosis", "treatment plans", "bedside manner"], "blocked_topics": ["politics", "religion", "actual medical advice for real conditions"], "escalation_triggers": ["malpractice", "threats", "harassment"], "max_response_tokens": 256, "follow_up_question_frequency": 4}',
           true, 0.75, $3
         ) RETURNING id`,
        [tenantId, avatarChen, adminId],
      )
    ).rows[0].id;
    console.log(`    Medical Trainer Dr. Chen:   ${personaChen}`);

    // ------------------------------------------------------------------
    // 4.  Scenarios (5) with scoring rubrics
    // ------------------------------------------------------------------
    console.log('\n  Creating scenarios...');

    // --- Scenario 1: Cold Call ---
    const rubricColdCall = JSON.stringify([
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

    const scenarioColdCall = (
      await pool.query(
        `INSERT INTO scenarios (
           tenant_id, persona_id, title, description, objective,
           opening_context, opening_message, scoring_rubric, status,
           max_duration_sec, max_turns, difficulty_level, tags, created_by
         ) VALUES (
           $1, $2,
           'Cold Call: Enterprise Software Demo',
           'Practice cold calling a VP of Engineering to schedule a product demo for your enterprise analytics platform.',
           'Successfully schedule a product demo meeting with the prospect by handling objections and demonstrating value.',
           'You are calling the VP of Engineering at TechCorp, a mid-size company with 500 engineers. They currently use a competitor product and have expressed no interest in switching. Your goal is to schedule a 30-minute demo.',
           'Hello? This is Sarah from TechCorp, who am I speaking with?',
           $3::jsonb, 'active', 900, 50, 'intermediate',
           ARRAY['sales', 'cold-calling', 'b2b', 'enterprise'], $4
         ) RETURNING id`,
        [tenantId, personaSarah, rubricColdCall, adminId],
      )
    ).rows[0].id;
    console.log(`    Cold Call:           ${scenarioColdCall}`);

    // --- Scenario 2: Objection Handling ---
    const rubricObjection = JSON.stringify([
      {
        name: 'Acknowledgment',
        description: 'How well the learner acknowledges and validates the objection',
        weight: 25,
        levels: [
          { score: 1, label: 'Poor', description: 'Dismisses or ignores the objection entirely' },
          { score: 2, label: 'Below Average', description: 'Partially acknowledges but moves past too quickly' },
          { score: 3, label: 'Adequate', description: 'Acknowledges the objection clearly' },
          { score: 4, label: 'Good', description: 'Validates and empathizes with the objection' },
          { score: 5, label: 'Excellent', description: 'Turns acknowledgment into a trust-building moment' },
        ],
      },
      {
        name: 'Reframing',
        description: 'Ability to reframe the objection as an opportunity',
        weight: 35,
        levels: [
          { score: 1, label: 'Poor', description: 'Cannot reframe, simply repeats the pitch' },
          { score: 2, label: 'Below Average', description: 'Attempts reframing but unconvincing' },
          { score: 3, label: 'Adequate', description: 'Reasonable reframe with some supporting evidence' },
          { score: 4, label: 'Good', description: 'Strong reframe backed by data or case studies' },
          { score: 5, label: 'Excellent', description: 'Masterful reframe that shifts perspective completely' },
        ],
      },
      {
        name: 'Value Articulation',
        description: 'Clarity and persuasiveness of the value proposition presented',
        weight: 40,
        levels: [
          { score: 1, label: 'Poor', description: 'No clear value proposition communicated' },
          { score: 2, label: 'Below Average', description: 'Generic value proposition not tailored to prospect' },
          { score: 3, label: 'Adequate', description: 'Clear value proposition with some customization' },
          { score: 4, label: 'Good', description: 'Tailored value proposition addressing specific pain points' },
          { score: 5, label: 'Excellent', description: 'Compelling, quantified value proposition with ROI estimates' },
        ],
      },
    ]);

    const scenarioObjection = (
      await pool.query(
        `INSERT INTO scenarios (
           tenant_id, persona_id, title, description, objective,
           opening_context, opening_message, scoring_rubric, status,
           max_duration_sec, max_turns, difficulty_level, tags, created_by
         ) VALUES (
           $1, $2,
           'Objection Handling: Price Negotiation',
           'Practice handling price objections from a CFO who thinks the product is too expensive. Advanced difficulty with multiple layered objections.',
           'Successfully defend pricing while demonstrating ROI and securing commitment to move forward.',
           'You are in a follow-up call with the CFO of MegaCorp. They liked the demo but are pushing back hard on price, claiming your competitor offered 40% less.',
           'Thanks for calling back. Look, I''ll be frank — your product looks great but we got a quote from CompetitorX that''s significantly cheaper. Why should we pay more?',
           $3::jsonb, 'active', 1200, 40, 'advanced',
           ARRAY['sales', 'objection-handling', 'pricing', 'negotiation'], $4
         ) RETURNING id`,
        [tenantId, personaSarah, rubricObjection, adminId],
      )
    ).rows[0].id;
    console.log(`    Objection Handling:  ${scenarioObjection}`);

    // --- Scenario 3: Behavioral Interview ---
    const rubricBehavioral = JSON.stringify([
      {
        name: 'STAR Structure',
        description: 'Use of Situation-Task-Action-Result framework in responses',
        weight: 30,
        levels: [
          { score: 1, label: 'Poor', description: 'No structure, rambling answers' },
          { score: 2, label: 'Below Average', description: 'Some structure but missing key STAR elements' },
          { score: 3, label: 'Adequate', description: 'Uses STAR framework with minor gaps' },
          { score: 4, label: 'Good', description: 'Clear STAR structure with strong examples' },
          { score: 5, label: 'Excellent', description: 'Masterful STAR responses with quantified results' },
        ],
      },
      {
        name: 'Leadership Examples',
        description: 'Quality and relevance of leadership examples provided',
        weight: 35,
        levels: [
          { score: 1, label: 'Poor', description: 'No relevant leadership examples' },
          { score: 2, label: 'Below Average', description: 'Vague examples that do not demonstrate leadership' },
          { score: 3, label: 'Adequate', description: 'Decent examples showing some leadership qualities' },
          { score: 4, label: 'Good', description: 'Strong examples demonstrating clear leadership impact' },
          { score: 5, label: 'Excellent', description: 'Compelling examples with measurable outcomes and team impact' },
        ],
      },
      {
        name: 'Communication Clarity',
        description: 'Overall clarity, conciseness, and professionalism of communication',
        weight: 35,
        levels: [
          { score: 1, label: 'Poor', description: 'Unclear, unfocused responses with filler words' },
          { score: 2, label: 'Below Average', description: 'Somewhat clear but overly verbose' },
          { score: 3, label: 'Adequate', description: 'Clear and professional communication' },
          { score: 4, label: 'Good', description: 'Articulate and concise with confident delivery' },
          { score: 5, label: 'Excellent', description: 'Exceptionally clear, engaging, and persuasive communication' },
        ],
      },
    ]);

    const scenarioBehavioral = (
      await pool.query(
        `INSERT INTO scenarios (
           tenant_id, persona_id, title, description, objective,
           opening_context, opening_message, scoring_rubric, status,
           max_duration_sec, max_turns, difficulty_level, tags, created_by
         ) VALUES (
           $1, $2,
           'Behavioral Interview: Leadership',
           'Practice answering behavioral interview questions focused on leadership experiences for senior engineering roles.',
           'Demonstrate strong leadership skills through well-structured STAR responses that showcase measurable impact.',
           'You are interviewing for a Senior Engineering Manager position at a Fortune 500 tech company. The interviewer (James) will ask behavioral questions focused on leadership, conflict resolution, and team management.',
           'Welcome! Thanks for coming in today. I''m James, the VP of Engineering here. Let''s start with a question — tell me about a time you had to lead a team through a significant technical challenge.',
           $3::jsonb, 'active', 1500, 60, 'intermediate',
           ARRAY['interview', 'behavioral', 'leadership', 'career'], $4
         ) RETURNING id`,
        [tenantId, personaJames, rubricBehavioral, adminId],
      )
    ).rows[0].id;
    console.log(`    Behavioral Interview: ${scenarioBehavioral}`);

    // --- Scenario 4: Technical Interview ---
    const rubricTechnical = JSON.stringify([
      {
        name: 'Requirements Gathering',
        description: 'Ability to clarify requirements and constraints before designing',
        weight: 25,
        levels: [
          { score: 1, label: 'Poor', description: 'Jumps straight to design without asking questions' },
          { score: 2, label: 'Below Average', description: 'Asks few questions, misses key constraints' },
          { score: 3, label: 'Adequate', description: 'Asks reasonable questions about scale and requirements' },
          { score: 4, label: 'Good', description: 'Thorough requirements gathering with edge case consideration' },
          { score: 5, label: 'Excellent', description: 'Comprehensive requirements analysis that shapes the entire design' },
        ],
      },
      {
        name: 'System Architecture',
        description: 'Quality and scalability of the proposed system design',
        weight: 40,
        levels: [
          { score: 1, label: 'Poor', description: 'No coherent architecture proposed' },
          { score: 2, label: 'Below Average', description: 'Basic architecture with significant scalability issues' },
          { score: 3, label: 'Adequate', description: 'Reasonable architecture that handles basic requirements' },
          { score: 4, label: 'Good', description: 'Well-designed architecture with appropriate trade-offs discussed' },
          { score: 5, label: 'Excellent', description: 'Elegant architecture addressing scale, reliability, and maintainability' },
        ],
      },
      {
        name: 'Trade-off Analysis',
        description: 'Ability to identify, articulate, and justify design trade-offs',
        weight: 35,
        levels: [
          { score: 1, label: 'Poor', description: 'No awareness of trade-offs' },
          { score: 2, label: 'Below Average', description: 'Identifies some trade-offs but cannot justify choices' },
          { score: 3, label: 'Adequate', description: 'Discusses trade-offs with reasonable justifications' },
          { score: 4, label: 'Good', description: 'Deep trade-off analysis with data-driven justifications' },
          { score: 5, label: 'Excellent', description: 'Nuanced trade-off analysis considering business context and technical debt' },
        ],
      },
    ]);

    const scenarioTechnical = (
      await pool.query(
        `INSERT INTO scenarios (
           tenant_id, persona_id, title, description, objective,
           opening_context, opening_message, scoring_rubric, status,
           max_duration_sec, max_turns, difficulty_level, tags, created_by
         ) VALUES (
           $1, $2,
           'Technical Interview: System Design',
           'Practice a system design interview for a distributed URL shortening service similar to Bitly, targeting Staff Engineer roles.',
           'Design a scalable, reliable URL shortening service while clearly communicating trade-offs and architectural decisions.',
           'You are in a system design interview round for a Staff Engineer position. The interviewer will present a design problem and expect you to drive the discussion, ask clarifying questions, and propose a complete architecture.',
           'Great, let''s dive into the technical portion. I''d like you to design a URL shortening service, similar to bit.ly. It needs to handle about 100 million new URLs per day. Where would you like to start?',
           $3::jsonb, 'active', 1800, 50, 'advanced',
           ARRAY['interview', 'system-design', 'technical', 'architecture'], $4
         ) RETURNING id`,
        [tenantId, personaJames, rubricTechnical, adminId],
      )
    ).rows[0].id;
    console.log(`    Technical Interview: ${scenarioTechnical}`);

    // --- Scenario 5: Patient Consultation ---
    const rubricPatient = JSON.stringify([
      {
        name: 'History Taking',
        description: 'Thoroughness and methodology of patient history collection',
        weight: 35,
        levels: [
          { score: 1, label: 'Poor', description: 'Fails to ask about key symptoms or medical history' },
          { score: 2, label: 'Below Average', description: 'Asks some questions but misses critical areas' },
          { score: 3, label: 'Adequate', description: 'Covers main history areas with some gaps' },
          { score: 4, label: 'Good', description: 'Thorough history taking including medications and allergies' },
          { score: 5, label: 'Excellent', description: 'Comprehensive history with systematic approach and follow-ups' },
        ],
      },
      {
        name: 'Bedside Manner',
        description: 'Empathy, communication, and patient comfort during consultation',
        weight: 30,
        levels: [
          { score: 1, label: 'Poor', description: 'Cold, clinical approach with no empathy shown' },
          { score: 2, label: 'Below Average', description: 'Minimal empathy, overly clinical language' },
          { score: 3, label: 'Adequate', description: 'Professional manner with some empathy' },
          { score: 4, label: 'Good', description: 'Warm, empathetic approach that puts patient at ease' },
          { score: 5, label: 'Excellent', description: 'Outstanding bedside manner with active listening and emotional support' },
        ],
      },
      {
        name: 'Clinical Reasoning',
        description: 'Quality of differential diagnosis and treatment plan formulation',
        weight: 35,
        levels: [
          { score: 1, label: 'Poor', description: 'No differential diagnosis attempted' },
          { score: 2, label: 'Below Average', description: 'Single diagnosis without considering alternatives' },
          { score: 3, label: 'Adequate', description: 'Basic differential diagnosis with appropriate next steps' },
          { score: 4, label: 'Good', description: 'Well-reasoned differential with ordered investigations' },
          { score: 5, label: 'Excellent', description: 'Comprehensive differential with evidence-based treatment plan' },
        ],
      },
    ]);

    const scenarioPatient = (
      await pool.query(
        `INSERT INTO scenarios (
           tenant_id, persona_id, title, description, objective,
           opening_context, opening_message, scoring_rubric, status,
           max_duration_sec, max_turns, difficulty_level, tags, created_by
         ) VALUES (
           $1, $2,
           'Patient Consultation: Diagnosis',
           'Practice a patient consultation where you must take a thorough history, demonstrate good bedside manner, and arrive at a reasonable differential diagnosis.',
           'Conduct a thorough patient consultation, gather relevant history, demonstrate empathy, and formulate an appropriate differential diagnosis with next steps.',
           'You are a third-year medical resident seeing a new patient in the outpatient clinic. The patient (Dr. Chen role-playing as a 45-year-old office worker) presents with persistent headaches and fatigue over the past 3 weeks.',
           'Hi doctor, thanks for seeing me. I''ve been having these terrible headaches for about three weeks now and I''m exhausted all the time. I''m starting to get worried.',
           $3::jsonb, 'active', 900, 40, 'beginner',
           ARRAY['medical', 'consultation', 'diagnosis', 'patient-care'], $4
         ) RETURNING id`,
        [tenantId, personaChen, rubricPatient, adminId],
      )
    ).rows[0].id;
    console.log(`    Patient Consultation: ${scenarioPatient}`);

    // ------------------------------------------------------------------
    // 5.  Assignments (5 for the learner)
    // ------------------------------------------------------------------
    console.log('\n  Creating assignments...');

    // Cold Call — assigned, due in 7 days
    const assignColdCall = (
      await pool.query(
        `INSERT INTO scenario_assignments (tenant_id, scenario_id, user_id, assigned_by, status, due_date)
         VALUES ($1, $2, $3, $4, 'assigned', NOW() + INTERVAL '7 days')
         RETURNING id`,
        [tenantId, scenarioColdCall, learnerId, adminId],
      )
    ).rows[0].id;
    console.log(`    Cold Call (assigned):        ${assignColdCall}`);

    // Objection Handling — in_progress, due in 3 days
    const assignObjection = (
      await pool.query(
        `INSERT INTO scenario_assignments (tenant_id, scenario_id, user_id, assigned_by, status, due_date)
         VALUES ($1, $2, $3, $4, 'in_progress', NOW() + INTERVAL '3 days')
         RETURNING id`,
        [tenantId, scenarioObjection, learnerId, adminId],
      )
    ).rows[0].id;
    console.log(`    Objection Handling (in_progress): ${assignObjection}`);

    // Behavioral Interview — completed
    const assignBehavioral = (
      await pool.query(
        `INSERT INTO scenario_assignments (tenant_id, scenario_id, user_id, assigned_by, status, due_date)
         VALUES ($1, $2, $3, $4, 'completed', NOW() - INTERVAL '2 days')
         RETURNING id`,
        [tenantId, scenarioBehavioral, learnerId, adminId],
      )
    ).rows[0].id;
    console.log(`    Behavioral Interview (completed): ${assignBehavioral}`);

    // Technical Interview — assigned, due in 14 days
    const assignTechnical = (
      await pool.query(
        `INSERT INTO scenario_assignments (tenant_id, scenario_id, user_id, assigned_by, status, due_date)
         VALUES ($1, $2, $3, $4, 'assigned', NOW() + INTERVAL '14 days')
         RETURNING id`,
        [tenantId, scenarioTechnical, learnerId, adminId],
      )
    ).rows[0].id;
    console.log(`    Technical Interview (assigned):   ${assignTechnical}`);

    // Patient Consultation — completed
    const assignPatient = (
      await pool.query(
        `INSERT INTO scenario_assignments (tenant_id, scenario_id, user_id, assigned_by, status, due_date)
         VALUES ($1, $2, $3, $4, 'completed', NOW() - INTERVAL '5 days')
         RETURNING id`,
        [tenantId, scenarioPatient, learnerId, adminId],
      )
    ).rows[0].id;
    console.log(`    Patient Consultation (completed): ${assignPatient}`);

    // ------------------------------------------------------------------
    // 6.  Completed Sessions (2)
    // ------------------------------------------------------------------
    console.log('\n  Creating completed sessions...');

    // --- Session 1: Behavioral Interview ---
    const sessionBehavioral = (
      await pool.query(
        `INSERT INTO sessions (
           tenant_id, assignment_id, user_id, scenario_id,
           livekit_room_id, status,
           started_at, ended_at, duration_sec, total_turns,
           learner_token_count, avatar_token_count, avg_latency_ms
         ) VALUES (
           $1, $2, $3, $4,
           'session-behavioral-demo-001', 'completed',
           NOW() - INTERVAL '2 days 1 hour',
           NOW() - INTERVAL '2 days 35 minutes',
           1500, 18,
           2450, 3200, 245.50
         ) RETURNING id`,
        [tenantId, assignBehavioral, learnerId, scenarioBehavioral],
      )
    ).rows[0].id;
    console.log(`    Behavioral Session: ${sessionBehavioral}`);

    // --- Session 2: Patient Consultation ---
    const sessionPatient = (
      await pool.query(
        `INSERT INTO sessions (
           tenant_id, assignment_id, user_id, scenario_id,
           livekit_room_id, status,
           started_at, ended_at, duration_sec, total_turns,
           learner_token_count, avatar_token_count, avg_latency_ms
         ) VALUES (
           $1, $2, $3, $4,
           'session-patient-demo-001', 'completed',
           NOW() - INTERVAL '5 days 2 hours',
           NOW() - INTERVAL '5 days 1 hour 48 minutes',
           720, 14,
           1800, 2100, 198.30
         ) RETURNING id`,
        [tenantId, assignPatient, learnerId, scenarioPatient],
      )
    ).rows[0].id;
    console.log(`    Patient Session:    ${sessionPatient}`);

    // ------------------------------------------------------------------
    // 7.  Session Transcripts
    // ------------------------------------------------------------------
    console.log('\n  Creating session transcripts...');

    // --- Behavioral Interview Transcript ---
    const behavioralTranscript = [
      { turn: 1, role: 'avatar', content: "Welcome! Thanks for coming in today. I'm James, the VP of Engineering here. Let's start with a question — tell me about a time you had to lead a team through a significant technical challenge." },
      { turn: 2, role: 'learner', content: "Thank you, James. I'd love to share an experience from my last role at DataStream Inc. We were migrating our monolithic payment processing system to a microservices architecture while maintaining 99.99% uptime." },
      { turn: 3, role: 'avatar', content: "That sounds like a complex undertaking. Can you walk me through the specific challenge your team faced and your role in leading the effort?" },
      { turn: 4, role: 'learner', content: "The situation was that our monolith was handling 50,000 transactions per second and any downtime would cost the company roughly $100K per minute. My task was to lead a team of 8 engineers to decompose the system into microservices with zero downtime." },
      { turn: 5, role: 'avatar', content: "Impressive scope. How did you approach the decomposition? What was your strategy for maintaining uptime during the migration?" },
      { turn: 6, role: 'learner', content: "I implemented a strangler fig pattern. We identified bounded contexts and started by extracting the notification service first as it was the least risky. I created a detailed migration playbook and we used feature flags to gradually shift traffic." },
      { turn: 7, role: 'avatar', content: "Good approach. Tell me about a time during this project when things didn't go as planned. How did you handle it?" },
      { turn: 8, role: 'learner', content: "During the payment gateway extraction, we discovered a hidden dependency that caused a 2-minute degradation in service. I immediately assembled the team, we rolled back using our feature flag, and I led a blameless post-mortem within 24 hours." },
      { turn: 9, role: 'avatar', content: "How did you keep the team motivated through the setback? I imagine that was stressful." },
      { turn: 10, role: 'learner', content: "I was transparent with the team about the impact but framed it as a learning opportunity. I publicly praised the engineer who caught the issue fastest and we added new integration tests. I also advocated for the team with leadership, explaining this was expected complexity." },
      { turn: 11, role: 'avatar', content: "What was the final outcome of the migration?" },
      { turn: 12, role: 'learner', content: "We completed the full migration in 4 months, 2 weeks ahead of schedule. We achieved 99.995% uptime during migration, reduced deployment time from 4 hours to 15 minutes, and the team's velocity increased by 40% post-migration." },
      { turn: 13, role: 'avatar', content: "Now let me shift gears. Tell me about a time you had to deal with a team conflict or a difficult team member." },
      { turn: 14, role: 'learner', content: "In the same project, two senior engineers had fundamentally different views on the database strategy — one wanted event sourcing, the other wanted traditional CRUD with CDC. The debate was becoming personal and blocking progress." },
      { turn: 15, role: 'avatar', content: "How did you navigate that disagreement?" },
      { turn: 16, role: 'learner', content: "I organized a structured design review where each engineer presented their approach with pros, cons, and a proof-of-concept. I invited a principal engineer as a neutral advisor. We ultimately went with a hybrid approach that incorporated the best elements of both proposals." },
      { turn: 17, role: 'avatar', content: "That's a mature approach. Thank you for sharing these experiences. Do you have any questions for me?" },
      { turn: 18, role: 'learner', content: "Yes, I'd love to learn more about the team's current technical challenges and how the engineering culture approaches architectural decisions at scale." },
    ];

    for (const entry of behavioralTranscript) {
      await pool.query(
        `INSERT INTO session_transcripts (session_id, turn_number, role, content, tokens_used, latency_ms, stt_confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sessionBehavioral,
          entry.turn,
          entry.role,
          entry.content,
          Math.floor(entry.content.split(' ').length * 1.3),
          entry.role === 'avatar' ? 180 + Math.random() * 150 : null,
          entry.role === 'learner' ? 0.92 + Math.random() * 0.07 : null,
        ],
      );
    }
    console.log(`    Behavioral transcript: ${behavioralTranscript.length} turns`);

    // --- Patient Consultation Transcript ---
    const patientTranscript = [
      { turn: 1, role: 'avatar', content: "Hi doctor, thanks for seeing me. I've been having these terrible headaches for about three weeks now and I'm exhausted all the time. I'm starting to get worried." },
      { turn: 2, role: 'learner', content: "Hello, I'm glad you came in. I want to make sure we figure out what's going on. Can you tell me more about the headaches? Where exactly do you feel the pain, and how would you describe it?" },
      { turn: 3, role: 'avatar', content: "It's mostly behind my eyes and sometimes wraps around to the back of my head. It feels like a constant pressure, not throbbing. It's worse in the afternoon." },
      { turn: 4, role: 'learner', content: "I see. On a scale of 1 to 10, how severe is the pain typically? And has anything seemed to make it better or worse?" },
      { turn: 5, role: 'avatar', content: "I'd say about a 6 or 7 most days. Resting in a dark room helps a bit. Oddly, it seems worse after I've been at my computer all day. Over-the-counter painkillers barely touch it." },
      { turn: 6, role: 'learner', content: "Thank you. Let me ask about the fatigue — is it constant throughout the day, or does it fluctuate? How's your sleep been?" },
      { turn: 7, role: 'avatar', content: "I'm sleeping about 8 hours but I wake up feeling like I haven't slept at all. The fatigue is constant but gets worse after lunch. I've been drinking more coffee than usual just to get through the day." },
      { turn: 8, role: 'learner', content: "Have you noticed any changes in your vision, any nausea, or sensitivity to light?" },
      { turn: 9, role: 'avatar', content: "Now that you mention it, my vision does get a bit blurry by the end of the day. No nausea though, and light doesn't bother me more than usual." },
      { turn: 10, role: 'learner', content: "Let me ask about your medical history. Do you have any chronic conditions? Are you taking any medications or supplements regularly?" },
      { turn: 11, role: 'avatar', content: "I was diagnosed with high blood pressure about a year ago. My doctor put me on lisinopril. I also take a daily multivitamin. Oh, and I started a new anxiety medication about a month ago — sertraline, I think?" },
      { turn: 12, role: 'learner', content: "That's very helpful information. The timing with the sertraline is interesting. Have you had your blood pressure checked recently? And any significant stress changes at work or home?" },
      { turn: 13, role: 'avatar', content: "I haven't checked my blood pressure in a couple months honestly. And yes, work has been incredibly stressful — we had layoffs and I took on two extra people's responsibilities." },
      { turn: 14, role: 'learner', content: "Based on what you've told me, I'd like to check your blood pressure today, order some blood work including a CBC, thyroid panel, and metabolic panel, and I'd also like to refer you for an eye exam. The combination of headaches, fatigue, and blurry vision alongside your medication changes and stress warrants a thorough workup." },
    ];

    for (const entry of patientTranscript) {
      await pool.query(
        `INSERT INTO session_transcripts (session_id, turn_number, role, content, tokens_used, latency_ms, stt_confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sessionPatient,
          entry.turn,
          entry.role,
          entry.content,
          Math.floor(entry.content.split(' ').length * 1.3),
          entry.role === 'avatar' ? 160 + Math.random() * 120 : null,
          entry.role === 'learner' ? 0.90 + Math.random() * 0.09 : null,
        ],
      );
    }
    console.log(`    Patient transcript:    ${patientTranscript.length} turns`);

    // ------------------------------------------------------------------
    // 8.  Session Scores
    // ------------------------------------------------------------------
    console.log('\n  Creating session scores...');

    // --- Behavioral Interview Score ---
    const behavioralCriteriaScores = JSON.stringify([
      {
        criterion_name: 'STAR Structure',
        score: 4,
        weight: 30,
        justification: 'The candidate consistently used the STAR framework. The migration example had clear Situation, Task, Action, and Results with quantified outcomes. Minor gap in the conflict resolution example where the Result could have been more specific.',
      },
      {
        criterion_name: 'Leadership Examples',
        score: 4,
        weight: 35,
        justification: 'Strong leadership examples demonstrating both technical leadership and people management. The strangler fig migration showed strategic thinking. The conflict resolution example showed emotional intelligence. Could have provided more examples of developing team members.',
      },
      {
        criterion_name: 'Communication Clarity',
        score: 5,
        weight: 35,
        justification: 'Exceptional communication throughout. Answers were well-structured, concise, and engaging. Technical concepts were explained clearly without unnecessary jargon. Confident delivery with natural transitions between topics.',
      },
    ]);

    await pool.query(
      `INSERT INTO session_scores (
         session_id, overall_score, criteria_scores,
         strengths, improvements, narrative_feedback, scored_by_model
       ) VALUES (
         $1, 82.50, $2::jsonb,
         $3::text[], $4::text[],
         $5, 'gpt-4o-2024-05-13'
       )`,
      [
        sessionBehavioral,
        behavioralCriteriaScores,
        [
          'Excellent use of quantified results in STAR responses',
          'Strong demonstration of both technical and people leadership',
          'Clear, confident communication style with professional tone',
          'Good self-awareness and ability to frame setbacks positively',
        ],
        [
          'Could provide more examples of mentoring and developing junior team members',
          'Consider preparing more diverse examples beyond the single migration project',
          'The conflict resolution answer could include more detail on the final outcome and relationship impact',
        ],
        'Overall, this was a strong behavioral interview performance. The candidate demonstrated clear leadership capabilities through a well-chosen primary example of leading a complex microservices migration. The STAR structure was consistently applied, with the migration narrative being particularly compelling due to its quantified outcomes (99.995% uptime, 40% velocity increase). Communication was the strongest area, with the candidate presenting complex technical concepts in an accessible way while maintaining executive-level poise. The main area for growth is diversifying examples beyond a single project and providing more evidence of team development and mentorship activities.',
      ],
    );
    console.log(`    Behavioral score: 82.50`);

    // --- Patient Consultation Score ---
    const patientCriteriaScores = JSON.stringify([
      {
        criterion_name: 'History Taking',
        score: 4,
        weight: 35,
        justification: 'Thorough history taking that covered headache characterization, associated symptoms, medications, and psychosocial factors. Correctly identified the sertraline timing correlation. Minor gap: did not ask about family history or dietary changes.',
      },
      {
        criterion_name: 'Bedside Manner',
        score: 3,
        weight: 30,
        justification: 'Professional and respectful approach. Good active listening demonstrated by referencing patient statements. However, could have shown more empathy regarding the work stress situation and the patient concern about symptoms.',
      },
      {
        criterion_name: 'Clinical Reasoning',
        score: 4,
        weight: 35,
        justification: 'Appropriate differential diagnosis consideration with ordered investigations (BP check, blood work, eye exam). Correctly connected the medication change, blood pressure history, and screen time to the symptom complex. Could have discussed the differential more explicitly with the patient.',
      },
    ]);

    await pool.query(
      `INSERT INTO session_scores (
         session_id, overall_score, criteria_scores,
         strengths, improvements, narrative_feedback, scored_by_model
       ) VALUES (
         $1, 73.25, $2::jsonb,
         $3::text[], $4::text[],
         $5, 'gpt-4o-2024-05-13'
       )`,
      [
        sessionPatient,
        patientCriteriaScores,
        [
          'Systematic approach to headache characterization with appropriate questions',
          'Correctly identified the medication timing correlation with symptom onset',
          'Appropriate ordering of investigations including BP, bloodwork, and ophthalmology referral',
        ],
        [
          'Should ask about family history, especially for hypertension and migraines',
          'More empathetic responses needed when patient expresses worry or stress',
          'Discuss the differential diagnosis more transparently with the patient to build trust',
          'Ask about allergies before ordering any new investigations or medications',
        ],
        'This was a competent patient consultation demonstrating solid clinical skills. The resident took a systematic approach to history taking, correctly identifying key features of the headache and making an important connection between the sertraline initiation and symptom onset. The investigation plan was appropriate and well-prioritized. The main areas for improvement are in bedside manner (showing more empathy, especially when the patient mentioned work stress and worry) and in being more thorough with family history and allergy inquiries. Discussing the differential diagnosis with the patient would also help build trust and shared decision-making.',
      ],
    );
    console.log(`    Patient score:    73.25`);

    // ------------------------------------------------------------------
    // Done
    // ------------------------------------------------------------------
    console.log('\n=== Demo Seed: Complete! ===');
    console.log('\nSummary:');
    console.log('  Avatars:      3 (Sarah, James, Dr. Chen)');
    console.log('  Personas:     3 (Sales Coach, Interview Coach, Medical Trainer)');
    console.log('  Scenarios:    5 (Cold Call, Objection, Behavioral, Technical, Patient)');
    console.log('  Assignments:  5 (2 assigned, 1 in_progress, 2 completed)');
    console.log('  Sessions:     2 completed (Behavioral, Patient)');
    console.log('  Transcripts:  32 turns total');
    console.log('  Scores:       2 (82.50, 73.25)');
    console.log(`\nLearner login: learner@acme.com`);
    console.log(`Admin login:   admin@acme.com`);
  } catch (err) {
    console.error('\nDemo seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDemo();
