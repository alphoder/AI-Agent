import { CheckCircle2 } from 'lucide-react';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';

export default function CompletedPage() {
  return (
    <SectionPlaceholder
      icon={CheckCircle2}
      title="Completed"
      description="Every scenario you have finished, with your best score and mastery on each."
      features={[
        { title: 'Best score per scenario', body: 'One card per scenario you have practised, with your highest score as a ring.' },
        { title: 'Mastery crowns', body: 'Bronze, silver and gold, earned by score. See at a glance what is still short.' },
        { title: 'Jump back in', body: 'Open any card to re-read its report or run the call again.' },
      ]}
    />
  );
}
