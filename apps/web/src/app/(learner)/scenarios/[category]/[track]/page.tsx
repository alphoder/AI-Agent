import { Mic } from 'lucide-react';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';

// Shell. Section 2 replaces this with the searchable, sortable scenario list.
export default function TrackPage() {
  return (
    <SectionPlaceholder
      icon={Mic}
      title="Track"
      description="Every scenario in this track, searchable and sortable."
      features={[
        { title: 'Search and sort', body: 'Find by name or persona; order by difficulty, alphabet or how recently it was added.' },
        { title: 'Filters', body: 'Narrow by difficulty and by the language you want to practise in.' },
        { title: 'Surprise me', body: 'One tap picks a scenario at random from whatever you have filtered to.' },
      ]}
    />
  );
}
