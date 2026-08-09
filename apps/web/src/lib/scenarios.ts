import apiClient from '@/lib/api-client';
import type { Scenario } from '@/components/scenarios/scenario-card';

const PAGE_SIZE = 60;   // the API's maximum
const MAX_PAGES = 10;   // 600 scenarios; a runaway guard, not a real ceiling

/**
 * Every scenario visible to me.
 *
 * The browse pages count and group client-side, so a partial list is not a
 * smaller list, it is *wrong numbers*. `GET /scenarios` defaults to 30 per page,
 * which silently under-counted a 36-scenario library. Page until the API says
 * there is nothing left.
 */
/** My grade on each scenario I have attempted, keyed by scenario id. */
export async function fetchMyGrades(): Promise<Map<string, { best: number | null; attempts: number }>> {
  // ponytail: /analytics/completed already returns every attempted scenario with its
  // best score, so browse reuses it rather than adding a second progress endpoint.
  try {
    const { data } = await apiClient.get('/analytics/completed');
    const rows = (data.data ?? []) as { scenarioId: string; best: number | null; attempts: number }[];
    return new Map(rows.map((r) => [r.scenarioId, { best: r.best, attempts: r.attempts }]));
  } catch {
    return new Map();   // browse still works, just without badges
  }
}

export async function fetchAllScenarios(): Promise<Scenario[]> {
  const out: Scenario[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await apiClient.get(`/scenarios?page=${page}&limit=${PAGE_SIZE}`);
    out.push(...(data.data ?? []));
    const totalPages = data.meta?.total_pages ?? 1;
    if (page >= totalPages) break;
  }
  return out;
}
