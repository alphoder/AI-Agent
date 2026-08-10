/** Topics for the one-minute speaking drill (JAM — "Just A Minute").
 *
 *  Chosen so nobody needs prior knowledge: every one can be argued from ordinary
 *  life. That is the point — the drill trains structure and quick thinking, not
 *  recall. A topic that rewards research would just measure who already knew it.
 */
export interface SpeakTopic { text: string; kind: 'opinion' | 'abstract' | 'scenario' }

export const SPEAK_TOPICS: SpeakTopic[] = [
  // Opinion — take a side and defend it
  { text: 'Homework should be abolished', kind: 'opinion' },
  { text: 'Social media does more harm than good', kind: 'opinion' },
  { text: 'Failure teaches more than success', kind: 'opinion' },
  { text: 'Every student should learn to code', kind: 'opinion' },
  { text: 'Cities are better places to grow up than villages', kind: 'opinion' },
  { text: 'Talent is overrated', kind: 'opinion' },
  { text: 'Money cannot buy happiness', kind: 'opinion' },
  { text: 'Exams are a poor measure of intelligence', kind: 'opinion' },
  { text: 'It is better to be respected than liked', kind: 'opinion' },
  { text: 'Working from home is worse for young careers', kind: 'opinion' },
  { text: 'Public transport should be free', kind: 'opinion' },
  { text: 'Reading fiction is more useful than reading non-fiction', kind: 'opinion' },
  { text: 'Ambition is a form of dissatisfaction', kind: 'opinion' },
  { text: 'Honesty is not always the best policy', kind: 'opinion' },
  { text: 'Competition brings out the worst in people', kind: 'opinion' },
  { text: 'A four-day work week would make us more productive', kind: 'opinion' },

  // Abstract — no obvious side, forces you to build a frame
  { text: 'The colour of patience', kind: 'abstract' },
  { text: 'What silence sounds like', kind: 'abstract' },
  { text: 'The last thing I would give up', kind: 'abstract' },
  { text: 'Something everyone believes that is wrong', kind: 'abstract' },
  { text: 'A door I have not opened', kind: 'abstract' },
  { text: 'The cost of being right', kind: 'abstract' },
  { text: 'What I would put in a time capsule', kind: 'abstract' },
  { text: 'The difference between being alone and being lonely', kind: 'abstract' },
  { text: 'A rule worth breaking', kind: 'abstract' },
  { text: 'What I have changed my mind about', kind: 'abstract' },
  { text: 'The most underrated skill', kind: 'abstract' },
  { text: 'Why we remember some days and not others', kind: 'abstract' },
  { text: 'Something small that changed everything', kind: 'abstract' },
  { text: 'The shape of a good conversation', kind: 'abstract' },
  { text: 'What luck actually is', kind: 'abstract' },
  { text: 'A question I cannot answer', kind: 'abstract' },

  // Scenario — think on your feet under a constraint
  { text: 'You have one minute to convince a friend to change career', kind: 'scenario' },
  { text: 'Explain the internet to someone from 1900', kind: 'scenario' },
  { text: 'You must cut one subject from every school. Defend your choice', kind: 'scenario' },
  { text: 'Pitch your city to someone deciding where to move', kind: 'scenario' },
  { text: 'You are given ten crore rupees but must spend it in a week', kind: 'scenario' },
  { text: 'Convince a sceptic that your favourite film is worth watching', kind: 'scenario' },
  { text: 'You can send one message to everyone on earth. What is it?', kind: 'scenario' },
  { text: 'Talk a nervous friend through their first day at work', kind: 'scenario' },
  { text: 'Argue for a law that does not exist yet', kind: 'scenario' },
  { text: 'You have to apologise without using the word sorry', kind: 'scenario' },
  { text: 'Explain your job to a ten-year-old', kind: 'scenario' },
  { text: 'Persuade a company to hire someone with no experience', kind: 'scenario' },
];

/**
 * A topic the speaker has not just had. `exclude` is the previous topic's text;
 * pass it so "next topic" never hands back the same one twice in a row.
 * Self-check: npx tsx packages/shared/src/topics.test.ts
 */
export function randomTopic(exclude?: string): SpeakTopic {
  const pool = SPEAK_TOPICS.filter((t) => t.text !== exclude);
  // Only possible if the list ever shrinks to one entry; returning it beats throwing.
  const list = pool.length > 0 ? pool : SPEAK_TOPICS;
  return list[Math.floor(Math.random() * list.length)];
}
