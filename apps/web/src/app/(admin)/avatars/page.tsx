'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface Avatar {
  id: string;
  name: string;
  provider: string;
  thumbnail_url: string | null;
  source_image_url: string;
  image_url: string | null;
  status: 'active' | 'inactive' | 'processing' | 'failed';
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  processing: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
};

const STATUS_TABS = ['all', 'active', 'processing', 'failed', 'inactive'] as const;

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Avatars</h1>
        <button
          onClick={() => router.push('/avatars/create')}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create Avatar
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setStatusFilter(tab);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              statusFilter === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border rounded-lg overflow-hidden">
              <div className="aspect-square bg-muted" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="flex items-center justify-between">
                  <div className="h-5 w-16 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : avatars.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No avatars found</p>
          <p className="text-sm mt-1">Create your first avatar to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {avatars.map((avatar) => (
            <div
              key={avatar.id}
              onClick={() => router.push(`/avatars/${avatar.id}`)}
              className="border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="aspect-[4/5] bg-muted flex items-center justify-center">
                {(avatar.image_url || avatar.thumbnail_url) ? (
                  <img
                    src={avatar.image_url || avatar.thumbnail_url || ''}
                    alt={avatar.name}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="text-4xl text-muted-foreground">
                    {avatar.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-medium truncate">{avatar.name}</h3>
                <div className="flex items-center justify-between mt-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[avatar.status]}`}
                  >
                    {avatar.status === 'processing' && (
                      <span className="animate-spin mr-1 h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                    )}
                    {avatar.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(avatar.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            disabled={pagination.page <= 1}
            className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <button
            onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            disabled={pagination.page >= pagination.total_pages}
            className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
