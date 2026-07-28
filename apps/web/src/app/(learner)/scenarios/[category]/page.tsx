import { Mic } from 'lucide-react';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';

// Shell. Section 2 replaces this with the category hero + track cards.
export default function CategoryPage() {
  return (
    <SectionPlaceholder
      icon={Mic}
      title="Category"
      description="The tracks inside this category, each with its own set of scenarios."
      features={[
        { title: 'Tracks', body: 'Every track in this category, with how many scenarios each one holds.' },
        { title: 'Difficulty at a glance', body: 'Beginner, intermediate and advanced counts before you commit to one.' },
        { title: 'Coming soon, visibly', body: 'Tracks without scenarios yet stay listed so you can see what is on the way.' },
      ]}
    />
  );
}
