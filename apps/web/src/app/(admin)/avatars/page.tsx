'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { RichEmptyState } from '@/components/ui/rich-empty-state';

interface Avatar {
  id: string;
  name: string;
  provider: string;
  thumbnail_url: string | null;
  source_image_url: string;
  image_url: string | null;
  status: 'active' | 'inactive' | 'processing' | 'failed';
  gender?: string | null;
  tts_voice_id?: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { bg: string; dot: string; text: string; label: string }> = {
  active:     { bg: 'bg-emerald-50',  dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Active' },
  inactive:   { bg: 'bg-slate-100',   dot: 'bg-slate-400',   text: 'text-slate-600',   label: 'Inactive' },
  processing: { bg: 'bg-amber-50',    dot: 'bg-amber-500',   text: 'text-amber-700',   label: 'Processing' },
  failed:     { bg: 'bg-rose-50',     dot: 'bg-rose-500',    text: 'text-rose-700',    label: 'Failed' },
};

const GENDER_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  female:     { bg: 'bg-pink-50',   text: 'text-pink-700',   label: 'Female' },
  male:       { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Male' },
  non_binary: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Non-binary' },
  other:      { bg: 'bg-slate-100', text: 'text-slate-600',  label: 'Other' },
};

const STATUS_TABS = ['all', 'active', 'processing', 'failed', 'inactive'] as const;

/* ── Skeleton ── */
function AvatarCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="aspect-[3/4] shimmer-bg" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-2/3 rounded shimmer-bg" />
        <div className="flex items-center justify-between">
          <div className="h-5 w-20 rounded-full shimmer-bg" />
          <div className="h-3 w-16 rounded shimmer-bg" />
        </div>
      </div>
    </div>
  );
}

/* ── Status Badge ── */
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      {status === 'processing' ? (
        <span className="h-2 w-2 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      )}
      {cfg.label}
    </span>
  );
}

function GenderBadge({ gender }: { gender: string }) {
  const cfg = GENDER_CONFIG[gender] ?? GENDER_CONFIG.other;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

export default function AvatarsPage() {
  const router = useRouter();
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });

  const fetchAvatars = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(pagination.page), limit: '20' };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await apiClient.get('/avatars', { params });
      setAvatars(data.data);
      setPagination((prev) => ({ ...prev, ...data.meta }));
    } catch (err) {
      console.error('Failed to fetch avatars:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, pagination.page]);

  useEffect(() => {
    fetchAvatars();
  }, [fetchAvatars]);

  // Poll for processing avatars
  useEffect(() => {
    const hasProcessing = avatars.some((a) => a.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(fetchAvatars, 10000);
    return () => clearInterval(interval);
  }, [avatars, fetchAvatars]);

  const processingCount = avatars.filter((a) => a.status === 'processing').length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        accent="avatars"
        title="Avatars"
        subtitle="Digital trainers you can assign to scenarios."
        actions={
          <Link
            href="/avatars/create"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create avatar
          </Link>
        }
      />

      {/* Processing banner */}
      {processingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 animate-fade-in">
          <RefreshCw className="w-4 h-4 text-amber-600 animate-spin flex-shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-medium">{processingCount} avatar{processingCount > 1 ? 's' : ''}</span>{' '}
            processing — auto-refreshing every 10s.
          </p>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setStatusFilter(tab);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium capitalize transition-all duration-150 ${
              statusFilter === tab
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-card border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <AvatarCardSkeleton key={i} />
          ))}
        </div>
      ) : avatars.length === 0 ? (
        <RichEmptyState
          icon={Users}
          accent="avatars"
          title="No avatars yet"
          description="Upload a portrait and assign a voice to create your first avatar."
          action={{ label: 'Create avatar', href: '/avatars/create' }}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
          {avatars.map((avatar) => (
            <div
              key={avatar.id}
              onClick={() => router.push(`/avatars/${avatar.id}`)}
              className="card-interactive group rounded-2xl border border-border/50 bg-card overflow-hidden cursor-pointer"
            >
              {/* Image */}
              <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                {(avatar.image_url || avatar.thumbnail_url) ? (
                  <img
                    src={avatar.image_url || avatar.thumbnail_url || ''}
                    alt={avatar.name}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-grad-avatars">
                    <span className="text-5xl font-bold text-white/90">
                      {avatar.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                {/* Status overlay pill */}
                <div className="absolute top-2.5 right-2.5">
                  <StatusBadge status={avatar.status} />
                </div>
              </div>

              {/* Info */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm truncate text-foreground group-hover:text-primary transition-colors">
                    {avatar.name}
                  </h3>
                  {avatar.gender && <GenderBadge gender={avatar.gender} />}
                </div>
                <div className="flex items-center justify-between gap-2">
                  {avatar.tts_voice_id ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-muted text-muted-foreground truncate max-w-[160px]">
                      {avatar.tts_voice_id}
                    </span>
                  ) : <span />}
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(avatar.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.total_pages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              disabled={pagination.page <= 1}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Previous
            </button>
            <button
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              disabled={pagination.page >= pagination.total_pages}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
