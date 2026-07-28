import { UserRound } from 'lucide-react';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';

export default function ProfilePage() {
  return (
    <SectionPlaceholder
      icon={UserRound}
      title="My Profile"
      description="Your display name, where you practise from, your certificates and your lifetime numbers."
      features={[
        { title: 'How you appear', body: 'The display name shown on competition boards, plus your role and industry.' },
        { title: 'Where you practise', body: 'Your organisation, city and state. These decide which boards you appear on.' },
        { title: 'Certificates and totals', body: 'Every certificate you have earned, with calls, minutes, best score and longest streak.' },
      ]}
    />
  );
}
