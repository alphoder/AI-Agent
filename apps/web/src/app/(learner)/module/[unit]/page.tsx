'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface Lesson { scenarioId: string | null }
interface Unit { key: string; lessons: Lesson[] }

/**
 * Legacy route. The module experience is per-scenario now
 * (/scenarios/module/[scenarioId]); old links land on the unit's first scenario.
 * Client-side because unit → scenario needs the journey payload (titles are keys).
 */
export default function UnitRedirect() {
  const { unit: unitKey } = useParams<{ unit: string }>();
  const router = useRouter();
  const [dead, setDead] = useState(false);

  useEffect(() => {
    apiClient.get('/journey/curriculum').then(({ data }) => {
      const unit = (data.data.units as Unit[]).find((u) => u.key === unitKey);
      const sid = unit?.lessons.find((l) => l.scenarioId)?.scenarioId;
      if (sid) router.replace(`/scenarios/module/${sid}`);
      else setDead(true);
    }).catch(() => setDead(true));
  }, [unitKey, router]);

  if (dead) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Module not found. <Link href="/journey" className="text-primary underline">Back to journey</Link>
      </div>
    );
  }
  return <div className="h-[70vh] animate-pulse rounded-2xl border border-border bg-card" />;
}
