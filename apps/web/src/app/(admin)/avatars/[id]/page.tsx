'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface AvatarDetail {
  id: string;
  name: string;
  provider: string;
  provider_avatar_id: string | null;
  source_image_url: string;
  thumbnail_url: string | null;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  processing: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
};

export default function AvatarDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [avatar, setAvatar] = useState<AvatarDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchAvatar();
  }, [params.id]);

  // Poll if processing
  useEffect(() => {
    if (avatar?.status !== 'processing') return;
    const interval = setInterval(fetchAvatar, 10000);
    return () => clearInterval(interval);
  }, [avatar?.status]);

  async function fetchAvatar() {
    try {
      const { data } = await apiClient.get(`/avatars/${params.id}`);
      setAvatar(data.data);
      setEditName(data.data.name);
    } catch {
      router.push('/avatars');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      await apiClient.patch(`/avatars/${params.id}`, { name: editName });
      setEditing(false);
      fetchAvatar();
    } catch (err) {
      console.error('Update failed:', err);
    }
  }

  async function handleRegenerate() {
    try {
      await apiClient.post(`/avatars/${params.id}/regenerate`);
      fetchAvatar();
    } catch (err) {
      console.error('Regenerate failed:', err);
    }
  }

  async function handleDelete() {
    try {
      await apiClient.delete(`/avatars/${params.id}`);
      router.push('/avatars');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Delete failed');
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!avatar) return null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button
        onClick={() => router.push('/avatars')}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
      >
        &larr; Back to Avatars
      </button>

      <div className="border rounded-lg p-6">
        <div className="flex items-start gap-6">
          <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
            {avatar.thumbnail_url ? (
              <img src={avatar.thumbnail_url} alt={avatar.name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-6xl text-muted-foreground">{avatar.name.charAt(0)}</div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-1 text-lg font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button onClick={handleSave} className="text-sm text-primary hover:underline">Save</button>
                  <button onClick={() => setEditing(false)} className="text-sm text-muted-foreground hover:underline">Cancel</button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold">{avatar.name}</h1>
                  <button onClick={() => setEditing(true)} className="text-sm text-primary hover:underline">Edit</button>
                </>
              )}
            </div>

            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[avatar.status]}`}>
              {avatar.status}
            </span>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-24">Provider:</dt>
                <dd className="capitalize">{avatar.provider}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-24">Provider ID:</dt>
                <dd>{avatar.provider_avatar_id || 'N/A'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-24">Created:</dt>
                <dd>{new Date(avatar.created_at).toLocaleString()}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-24">Updated:</dt>
                <dd>{new Date(avatar.updated_at).toLocaleString()}</dd>
              </div>
            </dl>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleRegenerate}
                disabled={avatar.status === 'processing'}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Regenerate
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold mb-2">Delete Avatar</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete &ldquo;{avatar.name}&rdquo;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
