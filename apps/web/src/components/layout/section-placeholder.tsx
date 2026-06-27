import { type LucideIcon, Sparkles, Lock } from 'lucide-react';

/**
 * A premium "coming soon" section. Shows what the area will do (so the platform
 * reads as broad and intentional) rather than an empty stub.
 */
export function SectionPlaceholder({
  icon: Icon,
  title,
  description,
  features,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  features: { title: string; body: string }[];
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> In development
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold leading-snug">{f.title}</h3>
              <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          This section is being built. Your practice data already powers it behind the scenes — it&apos;ll light up here soon.
        </p>
      </div>
    </div>
  );
}
