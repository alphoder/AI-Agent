/**
 * Format seconds into "m:ss" display string.
 * Example: formatTime(125) => "2:05"
 */
export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
