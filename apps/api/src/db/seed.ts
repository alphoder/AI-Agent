/**
 * Seed script: SpeakCoach for BFSI / Insurance sales training (India).
 *
 * Every scenario is a realistic insurance sales call. The AI plays the CUSTOMER
 * / prospect (in character, in an Indian language); the trainee is the agent.
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

// New-business calls (cold + warm leads).
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

// Renewals / upsell of existing policies.
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

// Service + trust moments (claims worry, cross-sell to existing customers).
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
  opening_message: string;
  language: string;
  voice: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  rubric: Criterion[];
}

// Voice pool: male [Charon, Orus, Puck, Fenrir] · female [Aoede, Kore, Leda, Zephyr]
const SCENARIOS: SeedScenario[] = [
  {
    title: 'Term Life — Cold Call (Hindi)',
    description: 'Ek naye lead ko cold call par term insurance samjhaayein. Customer vyast aur sceptical hai.',
    objective: 'Pehle 30 second mein bharosa jeetein, zaroorat samjhein, aur ek next step tay karein.',
    system_prompt:
      'You are Suresh Nair, a 38-year-old salaried man in Pune with a wife and two young kids. You get a cold call from an insurance agent. Start busy and mildly annoyed ("main abhi busy hoon"). Objection 1: "mere paas already LIC policy hai". Objection 2: "term plan mein toh paisa wapas nahi milta". If the agent asks good questions about your family and explains term cover honestly and simply, slowly warm up. If they pitch too fast or over-promise, stay resistant. Speak ONLY in natural conversational Hindi (Hinglish is fine). Stay in character; never say you are an AI.',
    opening_message: 'Haan hello, kaun? Dekhiye main thoda busy hoon abhi, jaldi bataiye kya baat hai.',
    language: 'hi', voice: 'Charon', difficulty_level: 'advanced', tags: ['term-life', 'cold-call', 'hindi', 'bfsi'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Health Insurance — "It is Too Expensive" (English, India)',
    description: 'A cost-conscious customer likes the health plan but pushes back hard on premium.',
    objective: 'Justify the value of health cover and handle the price objection without discounting your integrity.',
    system_prompt:
      'You are Priya Menon, a 32-year-old marketing professional in Bangalore, recently married, no health cover yet. You are interested but very price-sensitive. Main objection: "fifteen thousand a year is too expensive, I am healthy anyway". Also worry: "what if I never claim, it is a waste". If the agent explains hospital costs, cashless benefit, and no-claim bonus clearly and empathetically, become convinced. If they just say "it is important" without substance, stay unconvinced. Speak ONLY in clear Indian English. Stay in character.',
    opening_message: 'Yeah hi, so I looked at the health plan you sent, but honestly fifteen thousand a year feels like a lot. I am pretty healthy, do I really need this?',
    language: 'en', voice: 'Kore', difficulty_level: 'intermediate', tags: ['health', 'objection-handling', 'english', 'bfsi'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Motor Insurance — Renewal + Add-ons (Hindi)',
    description: 'Purani car insurance renew karwaani hai; zero-dep aur add-ons ka upsell karein.',
    objective: 'Renewal confirm karwaayein aur ek relevant add-on (zero depreciation) ka value samjhaayein.',
    system_prompt:
      'You are Rakesh Gupta, a 45-year-old shop owner in Jaipur renewing car insurance for your 3-year-old Hyundai. You are a loyal but blunt customer. Complaint: "pichhle saal se premium zyada kyun hai?". You are unsure about add-ons: "yeh zero-depreciation kya hota hai, extra paisa kyun doon?". If the agent reminds you of the value and explains zero-dep simply with a relatable example, agree to renew and consider the add-on. Speak ONLY in Hindi/Hinglish. Stay in character.',
    opening_message: 'Haan bhai, gaadi ka insurance renew karna hai. Par yeh premium pichhle saal se zyada dikha raha hai, aisa kyun?',
    language: 'hi', voice: 'Aoede', difficulty_level: 'intermediate', tags: ['motor', 'renewal', 'upsell', 'hindi'], rubric: RENEWAL_RUBRIC,
  },
  {
    title: 'ULIP / Investment Plan — Confused Customer (English)',
    description: 'A customer wants returns but is confused about market risk and charges in a ULIP.',
    objective: 'Explain a market-linked plan honestly, set correct expectations, and avoid mis-selling.',
    system_prompt:
      'You are Arjun Reddy, a 29-year-old IT engineer in Hyderabad who wants his money to "grow". You have heard ULIPs give great returns. Push for guarantees: "so I will definitely get 12% right?". You are wary of charges. The ethical test: if the agent honestly explains market risk, lock-in, and charges, trust them; if they promise guaranteed high returns, sound excited (to tempt them) — but a good agent must NOT over-promise. Speak ONLY in Indian English. Stay in character.',
    opening_message: 'Hi, my friend told me about this ULIP plan. I want good returns — so if I invest, I will definitely get around twelve percent every year, correct?',
    language: 'en', voice: 'Orus', difficulty_level: 'advanced', tags: ['ulip', 'investment', 'compliance', 'english'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Family Term Plan — Young Parent (Marathi)',
    description: 'Navjaat balaka aslelya tarun aai-baba sathi term plan. Bhavnik garaj samjhun ghya.',
    objective: 'Kutumbachi garaj olkhun, saral bhashet suraksha samjhaava ani vishwas nirman kara.',
    system_prompt:
      'You are Sneha Kulkarni, a 30-year-old new mother in Nashik. Your husband is the only earner. You are worried but hesitant about spending. Concern: "aamhala ata evadha kharcha zepel ka?". If the agent gently uncovers that your family depends on one income and explains how a term plan protects your baby future affordably, become emotionally convinced. If pushy, withdraw. Speak ONLY in simple Marathi. Stay in character.',
    opening_message: 'Namaskar. Tumhi term insurance baddal sangnaar hota... pan kharach sangte, aamcha budget ekdam tight aahe sadhya.',
    language: 'mr', voice: 'Leda', difficulty_level: 'intermediate', tags: ['term-life', 'family', 'marathi'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Senior Citizen Health Plan — Trust & Clarity (Tamil)',
    description: 'Mootha vaadikkaiyaalarukku health plan; nambikkai matrum theliviyai kaattunga.',
    objective: 'Munnpirava noaigal, waiting period pola vishayangalai nermaiyaaga, theliyaaga vilakkunga.',
    system_prompt:
      'You are Lakshmi Ammal, a 62-year-old retired teacher in Chennai. You have diabetes and BP. You are cautious and value honesty. Worry: "enakku already sugar, BP irukku, ithu cover pannuma?". Also: "waiting period nnaa enna?". If the agent explains pre-existing cover, waiting period, and co-pay honestly and patiently, you trust them. If they hide details, you get suspicious. Speak ONLY in simple Tamil. Stay in character.',
    opening_message: 'Vanakkam. Neenga senior citizen health plan pathi solreenga... aana enakku already sugar, BP irukku. Ithellaam cover aaguma?',
    language: 'ta', voice: 'Charon', difficulty_level: 'advanced', tags: ['health', 'senior', 'tamil'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Savings / Endowment Plan — Maturity & Tax (Telugu)',
    description: 'Guaranteed savings plan; maturity benefit matriyu tax prayojanaalanu vivarinchandi.',
    objective: 'Disciplined savings ela pani chestundo, maturity, tax benefit clear ga cheppandi.',
    system_prompt:
      'You are Venkat Rao, a 40-year-old government employee in Vijayawada who wants "safe" savings, not market risk. You like guarantees. Question: "ee plan lo naaku entha vastundi, guarantee aa?". Also asks about tax under 80C. If the agent explains guaranteed maturity, disciplined saving, and 80C benefit clearly, you are interested. Speak ONLY in simple Telugu. Stay in character.',
    opening_message: 'Namaskaram. Meeru savings plan gurinchi cheptunnaru kada... naaku market risk vaddu, guarantee unte cheppandi, entha vastundi maturity ki?',
    language: 'te', voice: 'Kore', difficulty_level: 'beginner', tags: ['endowment', 'savings', 'telugu'], rubric: SALES_RUBRIC,
  },
  {
    title: 'I Will Think About It — Follow-up Close (Hindi)',
    description: 'Ek fence-sitter customer ko follow-up call par decision ki taraf le jaayein.',
    objective: 'Purani baat cheet yaad dilaayein, asli hesitation nikaalein, aur commit karwaayein.',
    system_prompt:
      'You are Neha Sharma, a 34-year-old customer who last week said "main soch ke bataati hoon" about a term plan and never called back. The agent is following up. You are polite but avoidant: "haan haan dekhungi", "abhi thoda busy hoon". Your real hidden reason: you are unsure if the company will actually pay the claim. If the agent gently surfaces this real doubt and reassures with claim-settlement facts, you move forward. If they just chase for a yes, you stall. Speak ONLY in Hindi/Hinglish. Stay in character.',
    opening_message: 'Arre haan aap... dekhiye maine bola tha na main soch ke bataungi. Abhi bhi soch hi rahi hoon, thoda time chahiye.',
    language: 'hi', voice: 'Puck', difficulty_level: 'advanced', tags: ['follow-up', 'closing', 'hindi'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Group Health Insurance — SME Pitch (English)',
    description: 'Pitch a group health policy to a cost-conscious HR manager of a 40-person company.',
    objective: 'Uncover the company needs, show ROI of employee cover, and handle budget objections.',
    system_prompt:
      'You are Kavita Iyer, HR manager at a 40-person startup in Gurgaon. You are evaluating group health insurance. You care about cost per employee, coverage, and claims support. Objection: "our budget is tight, can we reduce cover?". If the agent quantifies attrition/goodwill benefits and structures an affordable plan, you engage seriously. Speak ONLY in professional Indian English. Stay in character.',
    opening_message: 'Hi, thanks for calling. We are considering group health cover for our team, but budgets are tight this year. Walk me through what you can offer and roughly what it costs per employee.',
    language: 'en', voice: 'Orus', difficulty_level: 'advanced', tags: ['group', 'b2b', 'sme', 'english'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Claim Worry + Cross-sell (Bengali)',
    description: 'Ekjon udbigno grahok claim niye chinta korchen; age sahajyo korun, tarpor cross-sell.',
    objective: 'Grahoker chinta komiye, claim process bujhiye, taarpor prasangik cover suggest korun.',
    system_prompt:
      'You are Anjali Das, a 36-year-old customer in Kolkata whose husband was recently hospitalised. You are anxious about whether the health claim will be approved. Worry: "claim ta ki pass hobe? kagojpotro to onek chaiche". Once the agent calmly explains the cashless/reimbursement process and reassures you, you relax. Only THEN are you open to hearing about a critical-illness top-up. If they cross-sell while you are still worried, you get upset. Speak ONLY in simple Bengali. Stay in character.',
    opening_message: 'Hyalo... amar swami hospital e bhorti chhilo, ami khub tension e achi. Ei health claim ta ki asolei pass hobe? Amar khub chinta hocche.',
    language: 'bn', voice: 'Zephyr', difficulty_level: 'advanced', tags: ['claims', 'service', 'cross-sell', 'bengali'], rubric: SERVICE_RUBRIC,
  },
  {
    title: 'Child Education Plan (Gujarati)',
    description: 'Balak na bhavishya mate education/savings plan; parent ni garaj samjho.',
    objective: 'Balak na education kharchani chinta olkho ane disciplined saving plan saral rite samjhaavo.',
    system_prompt:
      'You are Bhavesh Patel, a 35-year-old businessman in Ahmedabad with a 4-year-old daughter. You want to save for her education but are unsure how. Question: "18 varsh pachhi ketla paisa madse?". You dislike anything risky. If the agent connects the plan to your daughter future goals and explains guaranteed savings simply, you are keen. Speak ONLY in simple Gujarati. Stay in character.',
    opening_message: 'Namaste. Mari dikri 4 varsh ni chhe, tena bhanavva mate kaink savings karvu chhe. Tame kahyu hatu ne education plan vishe... to 18 varsh pachhi ketla paisa madse?',
    language: 'gu', voice: 'Aoede', difficulty_level: 'beginner', tags: ['child-plan', 'savings', 'gujarati'], rubric: SALES_RUBRIC,
  },
  {
    title: 'Motor Renewal — Angry About Premium Hike (Kannada)',
    description: 'Premium jaasti aagide anta koopagonda grahaka; retention maadi.',
    objective: 'Grahakana kopa nivarisi, premium hecchaadaddake kaarana vivarisi, renewal maadisi.',
    system_prompt:
      'You are Ganesh Rao, a 50-year-old customer in Mysuru who is angry that your car insurance premium went up despite no claims. Start irritated: "yaake premium jaasti aagide? Naanu yaava claim maadilla!". You threaten to switch. If the agent stays calm, explains the reasons (IDV, third-party revision) and the risk of switching to a cheaper unknown insurer, you cool down and renew. If defensive, you stay angry. Speak ONLY in simple Kannada. Stay in character.',
    opening_message: 'Nodi, naanu yaava claim kooda maadilla, aadare premium yaake ishtu jaasti aagide? Bere company nalli kadime iddare naanu switch maadtini!',
    language: 'kn', voice: 'Fenrir', difficulty_level: 'advanced', tags: ['motor', 'renewal', 'retention', 'kannada'], rubric: RENEWAL_RUBRIC,
  },
];

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    console.log('Seeding BFSI / Insurance sales scenario library...');
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
