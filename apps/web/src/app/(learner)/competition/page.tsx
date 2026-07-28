import { Trophy } from 'lucide-react';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';

export default function CompetitionPage() {
  return (
    <SectionPlaceholder
      icon={Trophy}
      title="Competition"
      description="See where you stand: your team, your organisation, your city, your state, and all of India."
      features={[
        { title: 'Five scopes', body: 'Team, organisation, city, state and national boards from the same practice data.' },
        { title: 'Your row is pinned', body: 'You always see your own rank, even when you are far outside the top of the board.' },
        { title: 'Two ways to rank', body: 'By minutes practised or by average score, over this week or all time.' },
      ]}
    />
  );
}
