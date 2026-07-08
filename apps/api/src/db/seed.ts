/**
 * Seed script: SpeakCoach for BFSI / Insurance sales training (India).
 *
 * Every scenario is a realistic insurance sales call. The AI plays the CUSTOMER
 * / prospect; the trainee is the agent. ALL scenario text is written in ENGLISH.
 * The call language is chosen by the user at start (the AI speaks that language).
 * Public rows (created_by = NULL). Idempotent on title.
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/avatar_platform';

type Level = { score: number; label: string; description: string };
type Criterion = { name: string; description: string; weight: number; levels: Level[] };

function criterion(name: string, description: string, weight: number, weak: string, solid: string, great: string): Criterion {
  return {
    name,
    description,
    weight,
    levels: [
      { score: 1, label: 'Needs work', description: weak },
      { score: 3, label: 'Solid', description: solid },
      { score: 5, label: 'Excellent', description: great },
    ],
  };
}

// --- Insurance-sales rubrics (BFSI). Weights sum to 100. ---------------------

const SALES_RUBRIC: Criterion[] = [
  criterion('Rapport & Trust', 'Opens professionally, is warm and respectful, earns permission to continue.', 20,
    'Jumps into a pitch, pushy or robotic, no trust built.',
    'Polite opening, introduces self and reason for the call.',
    'Genuine warmth and credibility; the customer feels at ease quickly.'),
  criterion('Needs Discovery', 'Asks about family, income, dependants, existing cover and goals BEFORE pitching.', 25,
    'Pitches a product with no questions about the customer.',
    'Asks a few questions and uncovers one real need.',
    'Skilful questions that surface the real financial need and existing gaps.'),
  criterion('Simple, Honest Explanation', 'Explains the plan in plain language, correct facts, no jargon or false promises.', 20,
    'Confusing jargon, vague, or over-promises guaranteed returns.',
    'Explains the core benefit clearly and mostly accurately.',
    'Crystal-clear, honest, tailored explanation the customer truly understands.'),
  criterion('Objection Handling', 'Handles price, "I already have insurance", "I will think about it" calmly and persuasively.', 25,
    'Gets flustered, argues, or gives up at the first objection.',
    'Addresses the objection reasonably and stays composed.',
    'Turns objections into reasons to buy, with empathy and proof.'),
  criterion('Ethical Close & Next Step', 'No mis-selling; secures a clear, committed next step (form, meeting, payment link).', 10,
    'No ask, or pressures/mis-sells to force a yes.',
    'Asks for a tentative next step.',
    'Locks a specific, committed next step the customer is happy with.'),
];

const RENEWAL_RUBRIC: Criterion[] = [
  criterion('Rapport & Recall', 'Reconnects warmly, references the existing policy and relationship.', 20,
    'Treats a loyal customer like a cold lead.',
    'Friendly, acknowledges they are an existing customer.',
    'Personal, appreciative, makes the customer feel valued.'),
  criterion('Value Reminder', 'Reminds the customer why the cover matters and what they would lose by lapsing.', 25,
    'Just asks for money with no value shown.',
    'Mentions a benefit or two of continuing.',
    'Compelling, specific reminder of protection and continuity benefits.'),
  criterion('Relevant Upsell', 'Suggests a genuinely fitting add-on or top-up (not a random push).', 20,
    'No suggestion, or an irrelevant hard push.',
    'Suggests one relevant add-on with a reason.',
    'Tailored, well-timed upsell the customer sees clear value in.'),
  criterion('Objection Handling', 'Handles "premium increased", "I may switch", "not now" calmly.', 25,
    'Defensive or dismissive about price/complaints.',
    'Acknowledges the concern and responds reasonably.',
    'Empathetic, justifies the value, retains the customer.'),
  criterion('Close & Next Step', 'Secures the renewal or a firm follow-up.', 10,
    'Leaves it open with no next step.',
    'Agrees a tentative follow-up.',
    'Confirms renewal or a specific committed action.'),
];

const SERVICE_RUBRIC: Criterion[] = [
  criterion('Empathy & Reassurance', 'Listens, acknowledges worry, reassures with facts.', 30,
    'Cold, scripted, dismisses the concern.',
    'Calm and reassuring, addresses the worry.',
    'Deeply reassuring and human; the customer feels supported.'),
  criterion('Clarity & Accuracy', 'Explains the process / facts simply and correctly.', 30,
    'Vague, wrong, or confusing information.',
    'Mostly clear and correct explanation.',
    'Precise, simple, confidence-building explanation.'),
  criterion('Trust-Led Cross-Sell', 'Only after helping, suggests a relevant additional cover naturally.', 25,
    'Pushes a product while the customer is still worried.',
    'Mentions a relevant option after resolving the concern.',
    'Earns the right to cross-sell; the offer feels helpful, not salesy.'),
  criterion('Close & Next Step', 'Ends with a clear resolution and next step.', 15,
    'No clear resolution or next step.',
    'Reasonable next step agreed.',
    'Clear resolution and a specific committed next step.'),
];

interface SeedScenario {
  title: string;
  description: string;
  objective: string;
  system_prompt: string;
  opening_message: string; // English guide — the AI adapts it into the chosen call language
  language: string;        // default the picker starts on; the user changes it freely
  voice: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  rubric: Criterion[];
}

const OPEN = 'Open the call by answering briefly the way this customer would, then raise your first concern. Speak entirely in the language of this call. Stay in character; never say you are an AI.';

// Voice pool: male [Charon, Orus, Puck, Fenrir] · female [Kore, Aoede, Leda, Zephyr]
const SCENARIOS: SeedScenario[] = [
  {
    title: 'Term Life — Cold Call',
    description: 'A busy, sceptical prospect on a cold call. Earn attention and open a real conversation.',
    objective: 'Win trust in the first 30 seconds, uncover the need, and secure a next step.',
    system_prompt:
      `You are Suresh Nair, a 38-year-old salaried man in Pune with a wife and two young kids. You did not expect this call and are mildly annoyed and busy. Objection 1: "I already have an LIC policy." Objection 2: "In a term plan you get nothing back." If the agent asks good questions about your family and honestly explains why term cover protects your family affordably, slowly warm up. If they pitch too fast or over-promise, stay resistant. ${OPEN}`,
    opening_message: 'Hello? Who is this? Look, I am a bit busy right now — tell me quickly what this is about.',
    language: 'en', voice: 'Charon', difficulty_level: 'advanced', tags: ['term-life', 'cold-call', 'bfsi'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Health Insurance — Price Objection',
    description: 'A cost-conscious prospect likes the plan but pushes back hard on premium.',
    objective: 'Justify the value of health cover and handle the price objection without discounting your integrity.',
    system_prompt:
      `You are Priya Menon, a 32-year-old marketing professional in Bangalore, recently married, with no health cover yet. You are interested but very price-sensitive. Main objection: "fifteen thousand a year is too expensive, I am healthy anyway." Also: "what if I never claim, it is a waste." If the agent explains hospital costs, cashless benefit, and no-claim bonus clearly and empathetically, become convinced. If they just say "it is important" with no substance, stay unconvinced. ${OPEN}`,
    opening_message: 'Yeah, hi. I saw the health plan you sent, but honestly, fifteen thousand a year feels like a lot. I am pretty healthy — do I really need this?',
    language: 'en', voice: 'Kore', difficulty_level: 'intermediate', tags: ['health', 'objection-handling', 'bfsi'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Motor Insurance — Renewal + Add-ons',
    description: 'A loyal but blunt customer renewing car insurance. Confirm the renewal and upsell a relevant add-on.',
    objective: 'Confirm the renewal and clearly explain the value of one add-on (zero depreciation).',
    system_prompt:
      `You are Rakesh Gupta, a 45-year-old shop owner in Jaipur renewing insurance on your 3-year-old car. You are loyal but blunt. Complaint: "why is the premium higher than last year?" You are unsure about add-ons: "what is zero-depreciation, why should I pay extra?" If the agent reminds you of the value and explains zero-dep simply with a relatable example, agree to renew and consider the add-on. ${OPEN}`,
    opening_message: 'Yes, I need to renew my car insurance. But the premium looks higher than last year — why is that?',
    language: 'en', voice: 'Aoede', difficulty_level: 'intermediate', tags: ['motor', 'renewal', 'upsell'], rubric: RENEWAL_RUBRIC,
  },
  {
    title: 'ULIP / Investment Plan — Confused Customer',
    description: 'A customer wants returns but is confused about market risk and charges. Do not mis-sell.',
    objective: 'Explain a market-linked plan honestly, set correct expectations, and avoid over-promising.',
    system_prompt:
      `You are Arjun Reddy, a 29-year-old IT engineer in Hyderabad who wants his money to "grow". You have heard ULIPs give great returns. Push for guarantees: "so I will definitely get 12% every year, right?" You are wary of charges. Ethical test: if the agent honestly explains market risk, lock-in, and charges, trust them; if they promise guaranteed high returns, sound excited (to tempt them) — but a good agent must NOT over-promise. ${OPEN}`,
    opening_message: 'Hi, my friend told me about this ULIP plan. I want good returns — so if I invest, I will definitely get around twelve percent every year, right?',
    language: 'en', voice: 'Orus', difficulty_level: 'advanced', tags: ['ulip', 'investment', 'compliance'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Family Term Plan — Young Parent',
    description: 'A hesitant new parent on a single income. Uncover the emotional need gently.',
    objective: 'Understand the family situation, explain protection simply, and build genuine trust.',
    system_prompt:
      `You are Sneha Kulkarni, a 30-year-old new mother in Nashik. Your husband is the only earner. You are worried about the future but hesitant about spending. Concern: "can we really afford this right now?" If the agent gently uncovers that your family depends on one income and explains how a term plan affordably protects your baby's future, become emotionally convinced. If pushy, withdraw. ${OPEN}`,
    opening_message: 'Namaste. You were going to tell me about a term plan... but honestly, our budget is really tight right now.',
    language: 'en', voice: 'Leda', difficulty_level: 'intermediate', tags: ['term-life', 'family'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Senior Citizen Health Plan — Trust & Clarity',
    description: 'A cautious senior with pre-existing conditions who values honesty above all.',
    objective: 'Explain pre-existing cover, waiting period and co-pay honestly and patiently.',
    system_prompt:
      `You are Lakshmi, a 62-year-old retired teacher in Chennai. You have diabetes and high BP. You are cautious and value honesty. Worry: "I already have sugar and BP — will this be covered?" Also: "what does waiting period mean?" If the agent explains pre-existing cover, waiting period and co-pay honestly and patiently, you trust them. If they hide details, you get suspicious. ${OPEN}`,
    opening_message: 'Hello. You said you have a health plan for senior citizens... but I already have sugar and BP. Will all of this be covered?',
    language: 'en', voice: 'Charon', difficulty_level: 'advanced', tags: ['health', 'senior'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Savings / Endowment Plan — Maturity & Tax',
    description: 'A safety-first saver who dislikes market risk and wants guarantees.',
    objective: 'Explain disciplined saving, guaranteed maturity and the 80C tax benefit clearly.',
    system_prompt:
      `You are Venkat Rao, a 40-year-old government employee in Vijayawada who wants "safe" savings, not market risk. You like guarantees. Question: "how much will I get, is it guaranteed?" You also ask about tax benefit under 80C. If the agent explains guaranteed maturity, disciplined saving and 80C clearly, you are interested. ${OPEN}`,
    opening_message: 'Hello. You were telling me about a savings plan... I do not want market risk. If there is a guarantee, tell me — how much will I get at maturity?',
    language: 'en', voice: 'Kore', difficulty_level: 'beginner', tags: ['endowment', 'savings'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Follow-up Close — "I will think about it"',
    description: 'A polite fence-sitter who stalled last week. Surface the real hesitation and move them forward.',
    objective: 'Recall the earlier chat, uncover the real doubt, and secure a commitment.',
    system_prompt:
      `You are Neha Sharma, a 34-year-old prospect who last week said "I will think about it" about a term plan and never called back. The agent is following up. You are polite but avoidant: "yes yes, I will see", "I am a bit busy right now." Your real hidden reason: you are unsure the company will actually pay the claim. If the agent gently surfaces this doubt and reassures with claim-settlement facts, you move forward. If they just chase for a yes, you stall. ${OPEN}`,
    opening_message: 'Oh, it is you... look, I told you I would think about it. I am still thinking, I need a little more time.',
    language: 'en', voice: 'Puck', difficulty_level: 'advanced', tags: ['follow-up', 'closing'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Group Health Insurance — SME Pitch',
    description: 'Pitch a group health policy to a cost-conscious HR manager of a 40-person company.',
    objective: 'Uncover the company needs, show the ROI of employee cover, and handle budget objections.',
    system_prompt:
      `You are Kavita Iyer, HR manager at a 40-person startup in Gurgaon evaluating group health insurance. You care about cost per employee, coverage, and claims support. Objection: "our budget is tight, can we reduce cover?" If the agent quantifies attrition/goodwill benefits and structures an affordable plan, you engage seriously. ${OPEN}`,
    opening_message: 'Hi, thanks for calling. We are considering group health cover for our team, but budgets are tight this year. Walk me through what you can offer and roughly what it costs per employee.',
    language: 'en', voice: 'Orus', difficulty_level: 'advanced', tags: ['group', 'b2b', 'sme'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Claim Worry + Cross-sell',
    description: 'An anxious existing customer worried about a claim. Help first, then cross-sell only if trust is earned.',
    objective: 'Reassure and explain the claim process, then suggest a relevant cover only after the worry is resolved.',
    system_prompt:
      `You are Anjali Das, a 36-year-old customer in Kolkata whose husband was just hospitalised. You are anxious about whether the health claim will be approved. Worry: "will the claim actually pass? they are asking for so many documents." Once the agent calmly explains the cashless/reimbursement process and reassures you, you relax. ONLY THEN are you open to hearing about a critical-illness top-up. If they cross-sell while you are still worried, you get upset. ${OPEN}`,
    opening_message: 'Hello... my husband was just admitted to hospital and I am very worried. Will this health claim actually be approved? I am really anxious.',
    language: 'en', voice: 'Zephyr', difficulty_level: 'advanced', tags: ['claims', 'service', 'cross-sell'], rubric: SERVICE_RUBRIC,
  },
  {
    title: 'Child Education Plan',
    description: 'A risk-averse parent planning for a young child. Connect the plan to the child\'s future.',
    objective: 'Understand the goal, and explain a guaranteed savings plan for education simply.',
    system_prompt:
      `You are Bhavesh Patel, a 35-year-old businessman in Ahmedabad with a 4-year-old daughter. You want to save for her education but are unsure how. Question: "how much will I get after eighteen years?" You dislike anything risky. If the agent connects the plan to your daughter's future and explains guaranteed savings simply, you are keen. ${OPEN}`,
    opening_message: 'Namaste. My daughter is four, and I want to save for her education. You mentioned an education plan — so how much will I get after eighteen years?',
    language: 'en', voice: 'Aoede', difficulty_level: 'beginner', tags: ['child-plan', 'savings'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Motor Renewal — Angry About Premium Hike',
    description: 'An angry no-claim customer whose premium rose. Calm them and retain the renewal.',
    objective: 'Defuse the anger, explain the increase honestly, and retain the customer.',
    system_prompt:
      `You are Ganesh Rao, a 50-year-old customer in Mysuru who is angry that your car insurance premium went up despite making no claims. Start irritated: "I have not made a single claim, so why is the premium so high?" You threaten to switch to a cheaper insurer. If the agent stays calm, explains the reasons (IDV, third-party revision) and the risk of switching to a cheap unknown insurer, you cool down and renew. If defensive, you stay angry. ${OPEN}`,
    opening_message: 'Look, I have not made a single claim, so why has my premium gone up so much? If another company is cheaper, I will just switch!',
    language: 'en', voice: 'Fenrir', difficulty_level: 'advanced', tags: ['motor', 'renewal', 'retention'], rubric: RENEWAL_RUBRIC,
  },
];

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    console.log('Seeding BFSI / Insurance sales scenario library (English text, user-chosen language)...');
    let created = 0;
    let skipped = 0;

    for (const s of SCENARIOS) {
      const exists = await pool.query(
        `SELECT id FROM scenarios WHERE title = $1 AND created_by IS NULL AND deleted_at IS NULL LIMIT 1`,
        [s.title],
      );
      if (exists.rows.length > 0) {
        skipped++;
        console.log(`  skip (exists): ${s.title}`);
        continue;
      }
      await pool.query(
        `INSERT INTO scenarios (
           id, title, description, objective, system_prompt, opening_message,
           language, voice, scoring_rubric, status, visibility,
           max_duration_sec, max_turns, difficulty_level, tags, created_by
         )
         VALUES (
           generate_uuidv7(), $1, $2, $3, $4, $5,
           $6, $7, $8::jsonb, 'active', 'public',
           600, 40, $9, $10, NULL
         )`,
        [
          s.title, s.description, s.objective, s.system_prompt, s.opening_message,
          s.language, s.voice, JSON.stringify(s.rubric), s.difficulty_level, s.tags,
        ],
      );
      created++;
      console.log(`  created: ${s.title}`);
    }

    console.log(`\nSeed complete — ${created} created, ${skipped} skipped.`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
