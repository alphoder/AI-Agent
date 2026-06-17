/**
 * Seed script: public scenario library for the free voice-only product.
 *
 * No tenants, users, avatars or personas — just a handful of ready-to-practice
 * public scenarios (created_by = NULL) that every signed-in user can start.
 * Idempotent on title for the public (owner-less) rows.
 */
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/avatar_platform';

type Level = { score: number; label: string; description: string };
type Criterion = { name: string; description: string; weight: number; levels: Level[] };

/** Compact 3-level rubric builder (1 = weak, 3 = solid, 5 = excellent). */
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

// Reusable rubric templates (read-only; shared across scenarios).
const INTERVIEW_RUBRIC: Criterion[] = [
  criterion('Clarity & Structure', 'Answers are organised and easy to follow (e.g. STAR).', 35,
    'Rambling, no structure.', 'Mostly structured with a clear point.', 'Crisp, well-structured, compelling.'),
  criterion('Specificity & Evidence', 'Backs claims with concrete examples and outcomes.', 35,
    'Vague generalities.', 'Some concrete examples.', 'Rich, quantified examples that prove impact.'),
  criterion('Engagement & Curiosity', 'Listens, builds rapport, asks good questions.', 30,
    'Passive, no questions.', 'Polite, asks a relevant question.', 'Genuinely curious with insightful questions.'),
];

const PERSUASION_RUBRIC: Criterion[] = [
  criterion('Opening & Rapport', 'Earns attention and sets a positive frame.', 30,
    'Weak or abrupt opening.', 'Clear, courteous opening.', 'Sharp hook that earns genuine interest.'),
  criterion('Argument & Objection Handling', 'Makes the case and addresses pushback.', 40,
    'Caves or argues poorly.', 'Handles basic objections.', 'Turns objections into opportunities.'),
  criterion('Close & Next Step', 'Secures a concrete, committed next step.', 30,
    'No clear ask or close.', 'Agrees a tentative next step.', 'Locks a specific, committed outcome.'),
];

const EMPATHY_RUBRIC: Criterion[] = [
  criterion('Empathy & Tone', 'Stays calm, warm and respectful.', 30,
    'Cold, harsh or dismissive.', 'Generally respectful and calm.', 'Warm, steady, psychologically safe.'),
  criterion('Ownership & Honesty', 'Is direct and takes responsibility appropriately.', 30,
    'Evasive or blaming.', 'Honest and accountable.', 'Fully owns it and rebuilds trust.'),
  criterion('Resolution', 'Drives to a clear, mutual way forward.', 40,
    'No resolution.', 'Reasonable next steps.', 'Clear, mutually owned plan.'),
];

const DELIVERY_RUBRIC: Criterion[] = [
  criterion('Hook & Clarity', 'Grabs attention and is instantly understandable.', 40,
    'Confusing or buried lead.', 'Clear core message.', 'Memorable hook, crystal-clear message.'),
  criterion('Confidence & Delivery', 'Calm, paced and present.', 30,
    'Rushed, hesitant or monotone.', 'Steady and clear.', 'Commanding, natural, engaging.'),
  criterion('Handling Questions', 'Answers follow-ups with poise.', 30,
    'Thrown off, vague answers.', 'Reasonable, on-topic answers.', 'Confident, sharp, persuasive answers.'),
];

const CONVERSATION_RUBRIC: Criterion[] = [
  criterion('Listening & Rapport', 'Listens, reflects and connects.', 40,
    'Talks over, no rapport.', 'Polite and attentive.', 'Warm, curious, builds real rapport.'),
  criterion('Clarity & Relevance', 'Stays clear and on-topic.', 30,
    'Off-topic or muddled.', 'Mostly clear and relevant.', 'Sharp, relevant and easy to follow.'),
  criterion('Confidence & Warmth', 'Comes across confident and likeable.', 30,
    'Flat or anxious.', 'Comfortable and pleasant.', 'Confident, warm and engaging.'),
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

const SCENARIOS: SeedScenario[] = [
  {
    title: 'Job Interview: Software Engineer',
    description: 'Practice a behavioural tech interview with a friendly but probing hiring manager.',
    objective: 'Communicate your experience clearly, answer behavioural questions with structure, and ask thoughtful questions.',
    system_prompt:
      'You are Maya, a senior engineering manager interviewing the user for a software engineer role. Ask one question at a time: start with "tell me about yourself", then dig into a past project, a conflict, and how they handle failure. Be warm but probe for specifics. Stay in character; never mention being an AI.',
    opening_message: "Thanks for joining today! To start, can you tell me a little about yourself and what drew you to this role?",
    language: 'en',
    voice: 'Aoede',
    difficulty_level: 'intermediate',
    tags: ['interview', 'career', 'behavioural'],
    rubric: [
      criterion('Clarity & Structure', 'Answers are organised and easy to follow (e.g. STAR).', 35,
        'Rambling, no structure, hard to follow.',
        'Mostly structured with a clear point.',
        'Crisp, well-structured, compelling answers throughout.'),
      criterion('Specificity & Evidence', 'Backs claims with concrete examples and outcomes.', 35,
        'Vague generalities, no examples.',
        'Some concrete examples with results.',
        'Rich, quantified examples that prove impact.'),
      criterion('Engagement & Curiosity', 'Listens, builds rapport, asks good questions.', 30,
        'Passive, no questions, low energy.',
        'Polite, asks at least one relevant question.',
        'Genuinely curious, strong rapport, insightful questions.'),
    ],
  },
  {
    title: 'Sales: Cold Call Discovery',
    description: 'Open a cold call with a busy VP and earn a discovery conversation.',
    objective: 'Earn attention in the first 20 seconds, uncover a pain point, and secure a next step.',
    system_prompt:
      'You are Daniel, a busy VP of Operations who did not expect this call. Start slightly impatient. If the user opens well and asks good questions, warm up and share a real operational pain. If they pitch too early, push back with objections. Stay in character.',
    opening_message: "Hello, this is Daniel. I've got about two minutes before my next meeting — what's this about?",
    language: 'en',
    voice: 'Charon',
    difficulty_level: 'advanced',
    tags: ['sales', 'cold-calling', 'b2b'],
    rubric: [
      criterion('Opening & Permission', 'Earns attention and permission to continue.', 30,
        'Generic pitch, no hook, ignores their time.',
        'Clear reason for the call, asks for a moment.',
        'Sharp, relevant hook that earns genuine interest.'),
      criterion('Discovery', 'Asks open questions to uncover real needs.', 40,
        'No questions, talks at the prospect.',
        'Asks a few questions, surfaces one need.',
        'Skilful questioning that uncovers a real pain.'),
      criterion('Next Step', 'Secures a concrete, committed next step.', 30,
        'No next step or vague "I\'ll send info".',
        'Agrees a tentative follow-up.',
        'Locks a specific, committed next meeting.'),
    ],
  },
  {
    title: 'Difficult Conversation: Giving Feedback',
    description: 'Deliver tough performance feedback to a defensive teammate with empathy.',
    objective: 'Give honest, specific feedback while keeping the relationship intact and agreeing on next steps.',
    system_prompt:
      'You are Sam, a talented but defensive teammate. You missed a deadline that affected the team. React defensively at first ("I had a lot on"). If the user is specific, fair and empathetic, gradually open up and take ownership. If they are vague or harsh, stay defensive. Stay in character.',
    opening_message: "Hey — you wanted to chat? Is everything okay?",
    language: 'en',
    voice: 'Kore',
    difficulty_level: 'advanced',
    tags: ['leadership', 'feedback', 'communication'],
    rubric: [
      criterion('Empathy & Tone', 'Stays calm, respectful and human.', 30,
        'Harsh, blaming, or cold.',
        'Generally respectful and calm.',
        'Warm, steady, psychologically safe throughout.'),
      criterion('Specificity', 'Names concrete behaviours and impact, not character.', 40,
        'Vague or attacks the person.',
        'Some specific examples of behaviour and impact.',
        'Precise, behaviour-focused, impact-driven feedback.'),
      criterion('Path Forward', 'Agrees clear, mutual next steps.', 30,
        'No resolution or one-sided demands.',
        'Some agreement on what changes.',
        'Clear, mutually owned action plan.'),
    ],
  },
  {
    title: 'Public Speaking: Elevator Pitch',
    description: 'Pitch yourself or your idea compellingly in under two minutes.',
    objective: 'Deliver a clear, confident, memorable pitch and handle a follow-up question.',
    system_prompt:
      'You are an interested but time-pressed investor at a networking event. Let the user pitch. Then ask one sharp follow-up question (e.g. "who is this for?" or "why you?"). Be encouraging but keep them concise. Stay in character.',
    opening_message: "Hi there! We've only got a minute before the next session — so, tell me what you're working on.",
    language: 'en',
    voice: 'Puck',
    difficulty_level: 'beginner',
    tags: ['public-speaking', 'pitch', 'confidence'],
    rubric: [
      criterion('Hook & Clarity', 'Grabs attention and is instantly understandable.', 40,
        'Confusing or buried lead.',
        'Clear core message.',
        'Memorable hook, crystal-clear message.'),
      criterion('Confidence & Delivery', 'Calm, paced, present.', 30,
        'Rushed, hesitant, or monotone.',
        'Steady and clear.',
        'Commanding, natural, engaging delivery.'),
      criterion('Handling the Question', 'Answers the follow-up with poise.', 30,
        'Thrown off, vague answer.',
        'Reasonable, on-topic answer.',
        'Confident, sharp, persuasive answer.'),
    ],
  },
  {
    title: 'Entrevista de Trabajo (Español)',
    description: 'Practica una entrevista de trabajo en español con una gerente cordial.',
    objective: 'Presentarte con claridad, responder preguntas de comportamiento y mostrar interés genuino.',
    system_prompt:
      'Eres Lucía, gerente de recursos humanos. Entrevistas a la persona para un puesto profesional. Haz una pregunta a la vez, comenzando por "háblame de ti". Sé amable pero pide ejemplos concretos. Mantente en personaje y responde siempre en español.',
    opening_message: '¡Gracias por venir! Para empezar, ¿podrías hablarme un poco de ti?',
    language: 'es',
    voice: 'Aoede',
    difficulty_level: 'intermediate',
    tags: ['entrevista', 'carrera', 'español'],
    rubric: [
      criterion('Claridad', 'Respuestas organizadas y fáciles de seguir.', 40,
        'Respuestas confusas y sin estructura.',
        'Respuestas claras con una idea principal.',
        'Respuestas nítidas y muy bien estructuradas.'),
      criterion('Ejemplos Concretos', 'Respalda lo que dice con ejemplos reales.', 30,
        'Generalidades sin ejemplos.',
        'Algunos ejemplos concretos.',
        'Ejemplos ricos y con resultados medibles.'),
      criterion('Conexión', 'Escucha, genera empatía y hace preguntas.', 30,
        'Pasivo, sin preguntas.',
        'Cordial y hace alguna pregunta.',
        'Muy interesado, gran conexión y buenas preguntas.'),
    ],
  },
  {
    title: 'Customer Support: Calming an Upset Customer',
    description: 'De-escalate an angry customer and resolve their issue with empathy.',
    objective: 'Acknowledge the frustration, take ownership, and drive to a concrete resolution.',
    system_prompt:
      'You are Robin, a customer whose order arrived broken for the second time. You start angry and want a refund immediately. If the user listens, apologises sincerely and offers a clear fix, calm down. If they are robotic or defensive, stay frustrated. Stay in character.',
    opening_message: "This is the second time this has happened. I am honestly furious — what are you going to do about it?",
    language: 'en',
    voice: 'Leda',
    difficulty_level: 'intermediate',
    tags: ['support', 'de-escalation', 'empathy'],
    rubric: [
      criterion('Acknowledgement', 'Validates the emotion before fixing.', 30,
        'Ignores feelings, jumps to policy.',
        'Acknowledges the frustration.',
        'Genuinely empathetic, defuses tension fast.'),
      criterion('Ownership', 'Takes responsibility without blaming.', 30,
        'Blames the customer or systems.',
        'Accepts responsibility.',
        'Owns it fully and rebuilds trust.'),
      criterion('Resolution', 'Drives to a clear, satisfying fix.', 40,
        'No real resolution.',
        'Offers a reasonable fix.',
        'Proactive, generous, fully resolved.'),
    ],
  },

  // ---- Negotiation & career ----
  {
    title: 'Salary Negotiation',
    description: 'Negotiate a higher offer with a firm but fair hiring manager.',
    objective: 'Make a confident, evidence-backed case for more, and reach a number you’re happy with.',
    system_prompt:
      'You are Devin, a hiring manager who has extended an offer and now handles the salary negotiation. Start by restating the offer and asking if it works. Be firm and budget-conscious, push back once or twice, but if the user justifies their ask with market data or value, meet them partway. Stay in character.',
    opening_message: "So, we’re really excited to have you. The offer is on the table — how are you feeling about the numbers?",
    language: 'en', voice: 'Charon', difficulty_level: 'advanced', tags: ['negotiation', 'career', 'salary'], rubric: PERSUASION_RUBRIC,
  },
  {
    title: 'Asking for a Promotion',
    description: 'Make the case to your manager that you’re ready for the next level.',
    objective: 'Clearly demonstrate impact and readiness, and agree on a concrete path to the promotion.',
    system_prompt:
      'You are Priya, a supportive but rigorous manager. The user wants a promotion. Ask them to walk you through their impact, gently challenge whether they’re operating at the next level yet, and only commit to a plan if they make a strong case. Stay in character.',
    opening_message: "Thanks for setting this up — you said you wanted to talk about your growth here. What’s on your mind?",
    language: 'en', voice: 'Aoede', difficulty_level: 'intermediate', tags: ['career', 'promotion', 'persuasion'], rubric: PERSUASION_RUBRIC,
  },
  {
    title: 'Exit Interview',
    description: 'Resign gracefully and give honest, constructive feedback.',
    objective: 'Leave on good terms while being honest about your reasons.',
    system_prompt:
      'You are an HR partner conducting an exit interview after the user resigned. Be warm and curious. Ask why they’re leaving, what could have been better, and whether anything would change their mind — without pressuring. Stay in character.',
    opening_message: "I’m sorry to see you go! I’d love to understand your experience — what led to your decision?",
    language: 'en', voice: 'Leda', difficulty_level: 'beginner', tags: ['career', 'feedback', 'workplace'], rubric: CONVERSATION_RUBRIC,
  },

  // ---- Leadership & management ----
  {
    title: 'Performance Review: Receiving Feedback',
    description: 'Take critical feedback from your manager with composure.',
    objective: 'Listen openly, avoid defensiveness, and turn feedback into a plan.',
    system_prompt:
      'You are Marcus, a direct but fair manager giving the user their annual review. Lead with one genuine strength, then raise two areas needing improvement with specific examples. If they get defensive, stay calm and repeat the point. If they engage well, collaborate on next steps. Stay in character.',
    opening_message: "Let’s dig into your review. Overall a strong year — but there are a couple of things I want us to work on. Ready?",
    language: 'en', voice: 'Charon', difficulty_level: 'intermediate', tags: ['leadership', 'feedback', 'workplace'], rubric: CONVERSATION_RUBRIC,
  },
  {
    title: 'Delegating a Big Task',
    description: 'Hand off an important project to a hesitant team member.',
    objective: 'Delegate clearly, build their confidence, and confirm shared understanding.',
    system_prompt:
      'You are Sam, a capable but slightly overwhelmed team member. The user (your manager) is delegating an important project. Express some doubt about your capacity at first; if they clarify expectations, offer support and check understanding, become motivated. Stay in character.',
    opening_message: "You wanted to talk about a new project for me? Okay… I’ll be honest, my plate’s already pretty full.",
    language: 'en', voice: 'Puck', difficulty_level: 'intermediate', tags: ['leadership', 'delegation', 'management'], rubric: EMPATHY_RUBRIC,
  },
  {
    title: 'Resolving a Conflict with a Coworker',
    description: 'Address tension with a colleague after a disagreement.',
    objective: 'Repair the relationship and agree how to work together going forward.',
    system_prompt:
      'You are Jordan, a coworker who felt undermined when the user overruled you in a meeting. Start guarded and a little cold. If the user listens, acknowledges your perspective and proposes a fair way forward, gradually warm up. Stay in character.',
    opening_message: "You wanted to talk? Sure. I’ve got a few minutes.",
    language: 'en', voice: 'Kore', difficulty_level: 'advanced', tags: ['conflict', 'workplace', 'communication'], rubric: EMPATHY_RUBRIC,
  },

  // ---- Sales & business ----
  {
    title: 'Investor Pitch',
    description: 'Pitch your startup to a sharp, skeptical investor.',
    objective: 'Sell the vision, defend the numbers, and earn a follow-up meeting.',
    system_prompt:
      'You are Alex, a seasoned VC. Let the user pitch, then probe hard on market size, traction and why-now. Be skeptical but fair; if they handle the tough questions well, express interest in a follow-up. Stay in character.',
    opening_message: "Great to meet you. You’ve got my attention for a few minutes — tell me what you’re building and why it matters.",
    language: 'en', voice: 'Charon', difficulty_level: 'advanced', tags: ['startup', 'pitch', 'fundraising'], rubric: PERSUASION_RUBRIC,
  },
  {
    title: 'Customer Discovery Interview',
    description: 'Interview a potential user to learn their real problems.',
    objective: 'Ask open questions, avoid pitching, and uncover genuine pain points.',
    system_prompt:
      'You are Taylor, a busy professional who agreed to a product research chat. Answer the user’s questions naturally about your workflow and frustrations, but only open up if they ask good open-ended questions. If they start pitching instead of listening, get a bit disengaged. Stay in character.',
    opening_message: "Hey! Happy to help with your research. So… what did you want to ask me about?",
    language: 'en', voice: 'Aoede', difficulty_level: 'intermediate', tags: ['product', 'research', 'discovery'], rubric: CONVERSATION_RUBRIC,
  },
  {
    title: 'Real Estate: Showing a Home',
    description: 'Guide a cautious buyer through a property and toward an offer.',
    objective: 'Build trust, address concerns, and move the buyer toward next steps.',
    system_prompt:
      'You are a prospective home-buyer touring a property with the user (the agent). You like the home but worry about price and a few repairs. Raise objections; if the agent listens and reframes value well, warm toward making an offer. Stay in character.',
    opening_message: "It’s a lovely place… but honestly it’s at the top of our budget, and that kitchen needs work. What do you think?",
    language: 'en', voice: 'Leda', difficulty_level: 'intermediate', tags: ['sales', 'real-estate', 'objection-handling'], rubric: PERSUASION_RUBRIC,
  },

  // ---- Healthcare ----
  {
    title: 'Doctor: Breaking Difficult News',
    description: 'Deliver a serious diagnosis to a patient with clarity and compassion.',
    objective: 'Be clear and honest while staying warm, and support the patient’s next steps.',
    system_prompt:
      'You are Mr. Bennett, a patient receiving worrying test results from the user (the doctor). React with worry and questions ("is it serious?", "what now?"). If the doctor is clear, compassionate and gives a plan, feel reassured; if they’re cold or vague, get anxious. Stay in character.',
    opening_message: "Doctor… you said the results were back. I’ve been really nervous. What did they find?",
    language: 'en', voice: 'Kore', difficulty_level: 'advanced', tags: ['healthcare', 'empathy', 'communication'], rubric: EMPATHY_RUBRIC,
  },
  {
    title: 'Patient: Describing Your Symptoms',
    description: 'Explain your symptoms clearly to a doctor to get the right help.',
    objective: 'Communicate symptoms, timeline and concerns clearly, and ask the right questions.',
    system_prompt:
      'You are Dr. Rao, a thorough GP. The user is your patient. Ask about their symptoms, when they started, severity and history, one question at a time. Reward clear, specific answers with a helpful direction. Stay in character.',
    opening_message: "Hello, come on in. So, what brings you in today?",
    language: 'en', voice: 'Aoede', difficulty_level: 'beginner', tags: ['healthcare', 'self-advocacy', 'clarity'], rubric: CONVERSATION_RUBRIC,
  },

  // ---- Public speaking & media ----
  {
    title: 'Press Interview: Tough Questions',
    description: 'Face a probing journalist and stay on message under pressure.',
    objective: 'Answer hard questions calmly, stay on message, and avoid traps.',
    system_prompt:
      'You are Robin, a sharp journalist interviewing the user (a company spokesperson) after a product issue. Ask pointed, slightly adversarial questions and follow up on vague answers. Stay professional but persistent. Stay in character.',
    opening_message: "Thanks for joining me. Let’s get right to it — a lot of your customers feel let down. What happened?",
    language: 'en', voice: 'Charon', difficulty_level: 'advanced', tags: ['media', 'pr', 'public-speaking'], rubric: DELIVERY_RUBRIC,
  },
  {
    title: 'Wedding Toast',
    description: 'Deliver a warm, memorable toast to a room full of guests.',
    objective: 'Be heartfelt, well-paced and engaging without rambling.',
    system_prompt:
      'You are the warm, encouraging emcee at a wedding handing the user the mic for a toast. Invite them to speak, react warmly as they go, and gently prompt if they freeze. Keep it light and supportive. Stay in character.',
    opening_message: "And now — the moment we’ve all been waiting for! Please raise your glass and say a few words. The floor is yours!",
    language: 'en', voice: 'Puck', difficulty_level: 'beginner', tags: ['public-speaking', 'social', 'confidence'], rubric: DELIVERY_RUBRIC,
  },
  {
    title: 'Conference Talk Q&A',
    description: 'Handle audience questions after giving a technical talk.',
    objective: 'Field questions clearly and confidently, including a skeptical one.',
    system_prompt:
      'You are an audience member at a conference asking the user (the speaker) questions after their talk. Ask one thoughtful question, then one skeptical/challenging one. Be respectful but probing. Stay in character.',
    opening_message: "Great talk! I’ve got a question — how does your approach actually hold up at real-world scale?",
    language: 'en', voice: 'Kore', difficulty_level: 'intermediate', tags: ['public-speaking', 'q-and-a', 'tech'], rubric: DELIVERY_RUBRIC,
  },

  // ---- Education ----
  {
    title: 'Parent–Teacher Conference',
    description: 'Discuss a struggling student with a concerned parent.',
    objective: 'Share honest feedback with empathy and agree a plan to help the child.',
    system_prompt:
      'You are Mrs. Alvarez, a parent worried and a little defensive about your child’s recent struggles. The user is the teacher. Start protective; if the teacher is warm, specific and solution-focused, become a partner. Stay in character.',
    opening_message: "Thanks for meeting me. I’ll be honest — I’m worried, and I don’t love what I’m hearing about how things are going.",
    language: 'en', voice: 'Leda', difficulty_level: 'intermediate', tags: ['education', 'empathy', 'communication'], rubric: EMPATHY_RUBRIC,
  },

  // ---- Social & networking ----
  {
    title: 'Networking: Breaking the Ice',
    description: 'Start a natural conversation with a stranger at an event.',
    objective: 'Open warmly, find common ground, and exchange a next step.',
    system_prompt:
      'You are Casey, a friendly but slightly reserved professional at a networking mixer. Respond naturally to the user’s small talk; open up more if they’re warm and curious. If they’re awkward or only talk about themselves, stay polite but brief. Stay in character.',
    opening_message: "Oh — hi! Busy event, huh? I don’t think we’ve met.",
    language: 'en', voice: 'Aoede', difficulty_level: 'beginner', tags: ['networking', 'small-talk', 'social'], rubric: CONVERSATION_RUBRIC,
  },
  {
    title: 'First Date Conversation',
    description: 'Keep a first-date conversation flowing and genuine.',
    objective: 'Be warm, curious and authentic, and keep the conversation balanced.',
    system_prompt:
      'You are Jamie, on a first date with the user at a café. Be friendly and a little nervous. Respond warmly to good questions and openness; if the user dominates or interviews you robotically, the energy dips. Stay in character.',
    opening_message: "Hi! Sorry, I think I’m a little nervous — but it’s really nice to finally meet you in person!",
    language: 'en', voice: 'Leda', difficulty_level: 'beginner', tags: ['social', 'dating', 'confidence'], rubric: CONVERSATION_RUBRIC,
  },

  // ---- Hospitality & support ----
  {
    title: 'Hotel Front Desk: Handling a Complaint',
    description: 'Calm an unhappy guest and make their stay right.',
    objective: 'De-escalate, take ownership and offer a satisfying fix.',
    system_prompt:
      'You are a tired, frustrated hotel guest whose room wasn’t ready and is now double-charged. The user is the front-desk agent. Start annoyed; if they’re calm, apologetic and fix it generously, soften. Stay in character.',
    opening_message: "I’ve been traveling for twelve hours, my room isn’t ready, and now I’ve been charged twice. This is ridiculous.",
    language: 'en', voice: 'Kore', difficulty_level: 'intermediate', tags: ['hospitality', 'de-escalation', 'service'], rubric: EMPATHY_RUBRIC,
  },

  // ---- Academic ----
  {
    title: 'Thesis Defense',
    description: 'Defend your research before a probing examiner.',
    objective: 'Explain your work clearly and defend your choices under scrutiny.',
    system_prompt:
      'You are Professor Lin, an examiner at the user’s thesis defense. Ask them to summarise their contribution, then probe their methodology and limitations. Be rigorous but fair; acknowledge strong, well-reasoned answers. Stay in character.',
    opening_message: "Welcome. To begin, please summarise your central contribution in your own words.",
    language: 'en', voice: 'Charon', difficulty_level: 'advanced', tags: ['academic', 'defense', 'clarity'], rubric: INTERVIEW_RUBRIC,
  },

  // ---- Multilingual ----
  {
    title: 'Entrevista de Ventas en Frío (Español)',
    description: 'Practica una llamada de ventas en frío en español con un prospecto ocupado.',
    objective: 'Captar la atención, descubrir una necesidad y conseguir una próxima reunión.',
    system_prompt:
      'Eres Daniel, un gerente ocupado que no esperaba esta llamada. Empieza algo impaciente; si la persona abre bien y hace buenas preguntas, comparte un problema real. Si vende demasiado pronto, pon objeciones. Mantente en personaje y responde siempre en español.',
    opening_message: "¿Diga? Soy Daniel. Tengo un par de minutos antes de mi reunión… ¿de qué se trata?",
    language: 'es', voice: 'Charon', difficulty_level: 'advanced', tags: ['ventas', 'español', 'negociación'], rubric: PERSUASION_RUBRIC,
  },
  {
    title: 'नौकरी का इंटरव्यू (हिन्दी)',
    description: 'एक मित्रवत प्रबंधक के साथ हिंदी में नौकरी के इंटरव्यू का अभ्यास करें।',
    objective: 'अपने अनुभव को स्पष्ट रूप से बताएं और सवालों के संरचित उत्तर दें।',
    system_prompt:
      'आप मीरा हैं, एक मानव संसाधन प्रबंधक, जो उपयोगकर्ता का इंटरव्यू ले रही हैं। एक बार में एक प्रश्न पूछें, "अपने बारे में बताइए" से शुरू करें। मित्रवत रहें लेकिन ठोस उदाहरण मांगें। हमेशा हिंदी में बात करें और किरदार में बने रहें।',
    opening_message: "नमस्ते! आने के लिए धन्यवाद। शुरू करते हैं — कृपया अपने बारे में थोड़ा बताइए।",
    language: 'hi', voice: 'Aoede', difficulty_level: 'intermediate', tags: ['इंटरव्यू', 'करियर', 'हिन्दी'], rubric: INTERVIEW_RUBRIC,
  },
  {
    title: "Entretien d'Embauche (Français)",
    description: 'Entraînez-vous à un entretien d’embauche en français avec une recruteuse bienveillante.',
    objective: 'Présentez votre parcours clairement et répondez aux questions de façon structurée.',
    system_prompt:
      'Vous êtes Camille, une recruteuse. Vous interviewez l’utilisateur pour un poste. Posez une question à la fois, en commençant par « parlez-moi de vous ». Soyez chaleureuse mais demandez des exemples concrets. Restez dans le personnage et répondez toujours en français.',
    opening_message: "Bonjour et merci d’être venu ! Pour commencer, pouvez-vous vous présenter en quelques mots ?",
    language: 'fr', voice: 'Aoede', difficulty_level: 'intermediate', tags: ['entretien', 'carrière', 'français'], rubric: INTERVIEW_RUBRIC,
  },
];

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    console.log('Seeding public scenario library...');
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
