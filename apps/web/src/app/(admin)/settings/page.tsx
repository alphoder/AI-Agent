'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  sso_provider: string;
  avatar_provider: string;
  max_concurrent_sessions: number;
  session_duration_limit_sec: number;
  idle_timeout_sec: number;
  data_retention_days: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data } = await apiClient.get('/auth/me');
      const tenantId = data.data?.tenantId;
      if (tenantId) {
        const res = await apiClient.get(`/tenants/${tenantId}/settings`);
        setSettings(res.data.data);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.patch(`/tenants/${settings.id}/settings`, {
        max_concurrent_sessions: settings.max_concurrent_sessions,
        session_duration_limit_sec: settings.session_duration_limit_sec,
        idle_timeout_sec: settings.idle_timeout_sec,
        data_retention_days: settings.data_retention_days,
        avatar_provider: settings.avatar_provider,
      });
      setMessage({ type: 'success', text: 'Settings saved' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!settings) {
    return <p className="text-sm text-muted-foreground">Unable to load settings.</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your tenant configuration</p>
      </div>

      {message && (
        <div className={`p-3 rounded text-sm ${
          message.type === 'success'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tenant Info (read-only) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tenant Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <p className="text-sm font-medium">{settings.name}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Slug</label>
            <p className="text-sm font-medium">{settings.slug}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">SSO Provider</label>
            <p className="text-sm font-medium uppercase">{settings.sso_provider}</p>
          </div>
        </div>
      </section>

      {/* Session Limits */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Session Configuration</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Max Concurrent Sessions</label>
            <input
              type="number"
              min={1}
              max={500}
              value={settings.max_concurrent_sessions}
              onChange={(e) => setSettings({ ...settings, max_concurrent_sessions: parseInt(e.target.value) || 1 })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Session Duration Limit (seconds)</label>
            <input
              type="number"
              min={60}
              max={3600}
              step={60}
              value={settings.session_duration_limit_sec}
              onChange={(e) => setSettings({ ...settings, session_duration_limit_sec: parseInt(e.target.value) || 600 })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">{Math.round(settings.session_duration_limit_sec / 60)} minutes</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Idle Timeout (seconds)</label>
            <input
              type="number"
              min={15}
              max={300}
              value={settings.idle_timeout_sec}
              onChange={(e) => setSettings({ ...settings, idle_timeout_sec: parseInt(e.target.value) || 60 })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Data Retention (days)</label>
            <input
              type="number"
              min={30}
              max={730}
              value={settings.data_retention_days}
              onChange={(e) => setSettings({ ...settings, data_retention_days: parseInt(e.target.value) || 365 })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Avatar Provider */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Avatar Provider</h2>
        <select
          value={settings.avatar_provider}
          onChange={(e) => setSettings({ ...settings, avatar_provider: e.target.value })}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="simli">Simli</option>
          <option value="heygen">HeyGen</option>
        </select>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
