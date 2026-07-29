'use client';

import { useEffect, useState } from 'react';
import { Award, Check, Loader2, Flame, Zap, Phone, Trophy } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import {
  INTAKE_ROLES, INTAKE_INDUSTRIES, INDIAN_STATES, JOURNEY, labelFor,
} from '@avatar-platform/shared';

interface Profile {
  id: string; email: string; name: string | null; picture: string | null; memberSince: string;
  profile: { org: string; city: string; state: string; role: string; industry: string };
  stats: { calls: number; minutes: number; best: number | null; streak: number; xp: number };
  certificates: { unit_key: string; issued_at: string }[];
}

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/20';

export default function ProfilePage() {
  const setUser = useAuth((s) => s.setUser);
  const [data, setData] = useState<Profile | null>(null);
  const [form, setForm] = useState<Profile['profile'] & { name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setFailed(false);
    try {
      const { data: res } = await apiClient.get('/profile');
      setData(res.data);
      setForm({ name: res.data.name ?? '', ...res.data.profile });
    } catch {
      setFailed(true);
    }
  }

  const dirty = !!form && !!data && (
    form.name !== (data.name ?? '') ||
    (['org', 'city', 'state', 'role', 'industry'] as const).some((k) => form[k] !== data.profile[k])
  );

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch('/profile', form);
      await load();
      // The sidebar reads the name from the auth store, so refresh it too.
      try { const me = await apiClient.get('/auth/me'); setUser(me.data.data); } catch { /* cosmetic only */ }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (failed) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">We could not load your profile.</p>
        <button onClick={load} className="press mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Try again</button>
      </div>
    );
  }
  if (!data || !form) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-card" />
        <div className="h-64 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  const initial = (data.name || data.email || '?').charAt(0).toUpperCase();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your name and where you practise from are what other people see on the competition boards.
        </p>
      </div>

      {/* Identity + lifetime numbers */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          {data.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-xl font-bold">{initial}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{data.name || 'Learner'}</p>
            <p className="truncate text-sm text-muted-foreground">{data.email}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Practising since {new Date(data.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
          <Stat icon={<Phone className="h-4 w-4" />} value={data.stats.calls} label={data.stats.calls === 1 ? 'call' : 'calls'} />
          <Stat icon={<Trophy className="h-4 w-4" />} value={data.stats.best ?? '—'} label="best score" />
          <Stat icon={<Flame className="h-4 w-4" />} value={data.stats.streak} label="day streak" />
          <Stat icon={<Zap className="h-4 w-4" />} value={data.stats.xp} label="XP" />
        </div>
      </div>

      {/* Editable */}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">How you appear</h2>
        <Field label="Display name" hint="Shown on competition boards.">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 40) })}
            maxLength={40} className={inputClass} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What you do">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputClass}>
              <option value="">Prefer not to say</option>
              {INTAKE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Field">
            <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className={inputClass}>
              <option value="">Prefer not to say</option>
              {INTAKE_INDUSTRIES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
        </div>

        <h2 className="pt-2 text-sm font-semibold">Where you practise from</h2>
        <p className="-mt-2 text-xs text-muted-foreground">These decide which competition boards you appear on. Leave any of them blank.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Company, school or college">
            <input value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value.slice(0, 60) })} placeholder="Optional" className={inputClass} />
          </Field>
          <Field label="City">
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value.slice(0, 60) })} placeholder="Optional" className={inputClass} />
          </Field>
          <Field label="State">
            <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputClass}>
              <option value="">Prefer not to say</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button onClick={save} disabled={!dirty || saving || !form.name.trim()}
            className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Saved' : 'Save changes'}
          </button>
          {dirty && !saving && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </div>

      {/* Certificates */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Certificates</h2>
        {data.certificates.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Reach silver on every scenario in a module to earn its certificate.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.certificates.map((c) => {
              const unit = JOURNEY.find((u) => u.key === c.unit_key);
              return (
                <li key={c.unit_key} className="flex items-center gap-3 rounded-xl border border-border p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Award className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{unit?.title ?? c.unit_key}</span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(c.issued_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">{icon}</span>
      <span>
        <span className="block text-lg font-bold leading-none tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}
