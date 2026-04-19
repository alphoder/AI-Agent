'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, Clock, Database, KeyRound, Loader2, Monitor, Save, Settings, Shield, Users } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { HelpHint } from '@/components/ui/help-hint';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';

interface SSOConfig {
  role_mapping?: {
    source_field: string;
    admin_values: string[];
  };
}

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  sso_provider: string;
  sso_metadata_url: string | null;
  sso_client_id: string | null;
  sso_config: SSOConfig;
  avatar_provider: string;
  max_concurrent_sessions: number;
  session_duration_limit_sec: number;
  idle_timeout_sec: number;
  data_retention_days: number;
}

interface ValidationErrors {
  max_concurrent_sessions?: string;
  session_duration_limit_sec?: string;
  idle_timeout_sec?: string;
  data_retention_days?: string;
}

function validate(settings: TenantSettings): ValidationErrors {
  const errors: ValidationErrors = {};

  if (settings.max_concurrent_sessions < 1 || settings.max_concurrent_sessions > 500) {
    errors.max_concurrent_sessions = 'Must be between 1 and 500';
  }
  if (settings.session_duration_limit_sec < 60 || settings.session_duration_limit_sec > 3600) {
    errors.session_duration_limit_sec = 'Must be between 60 and 3600 seconds';
  }
  if (settings.idle_timeout_sec < 15 || settings.idle_timeout_sec > 300) {
    errors.idle_timeout_sec = 'Must be between 15 and 300 seconds';
  }
  if (settings.data_retention_days < 30 || settings.data_retention_days > 730) {
    errors.data_retention_days = 'Must be between 30 and 730 days';
  }

  return errors;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ssoSecret, setSsoSecret] = useState('');
  const [adminGroupsInput, setAdminGroupsInput] = useState('');

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data } = await apiClient.get('/auth/me');
      // API returns snake_case from Postgres; accept both shapes for safety
      const tenantId = data.data?.tenant_id ?? data.data?.tenantId;
      if (tenantId) {
        const res = await apiClient.get(`/tenants/${tenantId}/settings`);
        const data = res.data.data;
        setSettings(data);
        // Populate admin groups from sso_config
        const adminVals = data.sso_config?.role_mapping?.admin_values || [];
        setAdminGroupsInput(adminVals.join(', '));
      }
    } catch {
      setToast({ type: 'error', text: 'Failed to load settings. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  const updateField = useCallback(
    (field: keyof TenantSettings, value: number | string) => {
      if (!settings) return;
      const updated = { ...settings, [field]: value };
      setSettings(updated);
      // Clear validation error for this field on change
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof ValidationErrors];
        return next;
      });
    },
    [settings],
  );

  async function handleSave() {
    if (!settings) return;

    const validationErrors = validate(settings);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setToast({ type: 'error', text: 'Please fix the validation errors before saving.' });
      return;
    }

    setSaving(true);
    setToast(null);
    try {
      // Build SSO config from admin groups input
      const adminValues = adminGroupsInput
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      const ssoConfig: SSOConfig = {
        role_mapping: {
          source_field: settings.sso_config?.role_mapping?.source_field || 'groups',
          admin_values: adminValues,
        },
      };

      const payload: Record<string, unknown> = {
        max_concurrent_sessions: settings.max_concurrent_sessions,
        session_duration_limit_sec: settings.session_duration_limit_sec,
        idle_timeout_sec: settings.idle_timeout_sec,
        data_retention_days: settings.data_retention_days,
        avatar_provider: settings.avatar_provider,
        sso_provider: settings.sso_provider,
        sso_metadata_url: settings.sso_metadata_url,
        sso_client_id: settings.sso_client_id,
        sso_config: ssoConfig,
      };

      // Only send secret if changed
      if (ssoSecret) {
        payload.sso_client_secret = ssoSecret;
      }

      await apiClient.patch(`/tenants/${settings.id}/settings`, payload);
      setToast({ type: 'success', text: 'Settings saved successfully.' });
    } catch {
      setToast({ type: 'error', text: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <div className="h-8 w-40 rounded shimmer-bg" />
          <div className="h-4 w-64 rounded shimmer-bg mt-2" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <div className="h-5 w-48 rounded shimmer-bg mb-4" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 rounded shimmer-bg" />
              <div className="h-10 rounded shimmer-bg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Database className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Unable to load settings.</p>
        <button
          onClick={loadSettings}
          className="text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all animate-in slide-in-from-top-2 fade-in duration-300 ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
          role="status"
        >
          {toast.text}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 rounded p-0.5 hover:bg-white/20 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 01.708 0L7 6.293l1.646-1.647a.5.5 0 01.708.708L7.707 7l1.647 1.646a.5.5 0 01-.708.708L7 7.707l-1.646 1.647a.5.5 0 01-.708-.708L6.293 7 4.646 5.354a.5.5 0 010-.708z" />
            </svg>
          </button>
        </div>
      )}

      {/* Page header */}
      <PageHeader
        icon={Settings}
        accent="settings"
        title="Settings"
        subtitle="Manage tenant configuration, SSO, and session limits."
      />

      {/* Tenant Information */}
      <SectionCard
        icon={Building2}
        iconTint="text-slate-600"
        title="Tenant Information"
        subtitle="Read-only details about your organization."
      >
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <p className="text-sm font-medium text-foreground mt-0.5">{settings.name}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Slug</label>
              <p className="text-sm font-medium text-foreground mt-0.5">{settings.slug}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">SSO Provider</label>
              <p className="text-sm font-medium text-foreground mt-0.5 uppercase">{settings.sso_provider}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* SSO Configuration */}
      <SectionCard
        icon={Shield}
        iconTint="text-violet-600"
        title="Single Sign-On (SSO)"
        subtitle="Connect your Identity Provider so admins and learners log in with their org credentials."
      >
        <div className="px-6 py-4 space-y-5">
          <HelpHint variant="info" dismissible dismissKey="sso-setup-tip" title="How SSO works">
            Configure your Identity Provider (Google, Okta, Azure AD) here. All users from your organization log in with the same SSO — admins and learners are distinguished by their IdP group membership via the Role Mapping below.
          </HelpHint>
          {/* Provider type */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">Protocol</label>
            <div className="flex gap-3">
              {(['oidc', 'saml'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateField('sso_provider', p)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    settings.sso_provider === p
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {p === 'oidc' ? 'OpenID Connect (OIDC)' : 'SAML 2.0'}
                </button>
              ))}
            </div>
          </div>

          {/* Metadata / Discovery URL */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">
              {settings.sso_provider === 'oidc' ? 'Discovery URL' : 'Metadata URL'}
            </label>
            <input
              type="url"
              value={settings.sso_metadata_url || ''}
              onChange={(e) => updateField('sso_metadata_url', e.target.value)}
              placeholder={
                settings.sso_provider === 'oidc'
                  ? 'https://accounts.google.com/.well-known/openid-configuration'
                  : 'https://idp.yourcompany.com/saml/metadata'
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {settings.sso_provider === 'oidc'
                ? 'Your IdP\'s OpenID Connect discovery endpoint (e.g. Google, Okta, Azure AD)'
                : 'Your SAML IdP metadata URL (e.g. Okta, OneLogin, ADFS)'}
            </p>
          </div>

          {/* Client ID (OIDC only) */}
          {settings.sso_provider === 'oidc' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Client ID</label>
                <input
                  type="text"
                  value={settings.sso_client_id || ''}
                  onChange={(e) => updateField('sso_client_id', e.target.value)}
                  placeholder="your-client-id.apps.googleusercontent.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Client Secret
                  <span className="text-muted-foreground font-normal ml-1">(leave blank to keep current)</span>
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  <input
                    type="password"
                    value={ssoSecret}
                    onChange={(e) => setSsoSecret(e.target.value)}
                    placeholder="********"
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Role Mapping */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Role Mapping</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Users whose IdP groups match the admin values below get the <strong>Admin</strong> role.
              Everyone else is a <strong>Learner</strong>. Both share the same tenant.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Group Attribute Field
                </label>
                <input
                  type="text"
                  value={settings.sso_config?.role_mapping?.source_field || 'groups'}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                            ...s,
                            sso_config: {
                              ...s.sso_config,
                              role_mapping: {
                                source_field: e.target.value,
                                admin_values: s.sso_config?.role_mapping?.admin_values || [],
                              },
                            },
                          }
                        : s,
                    )
                  }
                  placeholder="groups"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The claim/attribute name your IdP sends (usually &quot;groups&quot; or &quot;roles&quot;)
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Admin Group Names
                </label>
                <input
                  type="text"
                  value={adminGroupsInput}
                  onChange={(e) => setAdminGroupsInput(e.target.value)}
                  placeholder="Instructors, TrainingAdmins, Admins"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated group names that grant admin access
                </p>
              </div>
            </div>
          </div>

          {/* SSO Test Info */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-xs text-blue-700">
              <strong>Callback URL:</strong>{' '}
              <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">
                {typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':4000') : ''}/api/auth/sso/callback
              </code>
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Add this URL to your IdP&apos;s allowed redirect/callback URIs.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Session Limits */}
      <SectionCard
        icon={Clock}
        iconTint="text-indigo-600"
        title="Session Limits"
        subtitle="Control session concurrency, duration, and idle timeouts."
      >
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Max Concurrent Sessions */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Max Concurrent Sessions
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={settings.max_concurrent_sessions}
                  onChange={(e) => updateField('max_concurrent_sessions', parseInt(e.target.value) || 1)}
                  className={`w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                    errors.max_concurrent_sessions ? 'border-red-500 focus:ring-red-200 focus:border-red-500' : 'border-border'
                  }`}
                />
              </div>
              {errors.max_concurrent_sessions && (
                <p className="text-xs text-red-500 mt-1">{errors.max_concurrent_sessions}</p>
              )}
            </div>

            {/* Session Duration */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Session Duration Limit
              </label>
              <input
                type="number"
                min={60}
                max={3600}
                step={60}
                value={settings.session_duration_limit_sec}
                onChange={(e) => updateField('session_duration_limit_sec', parseInt(e.target.value) || 600)}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                  errors.session_duration_limit_sec ? 'border-red-500 focus:ring-red-200 focus:border-red-500' : 'border-border'
                }`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round(settings.session_duration_limit_sec / 60)} minutes ({settings.session_duration_limit_sec}s)
              </p>
              {errors.session_duration_limit_sec && (
                <p className="text-xs text-red-500 mt-0.5">{errors.session_duration_limit_sec}</p>
              )}
            </div>

            {/* Idle Timeout */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Idle Timeout
              </label>
              <input
                type="number"
                min={15}
                max={300}
                value={settings.idle_timeout_sec}
                onChange={(e) => updateField('idle_timeout_sec', parseInt(e.target.value) || 60)}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                  errors.idle_timeout_sec ? 'border-red-500 focus:ring-red-200 focus:border-red-500' : 'border-border'
                }`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {settings.idle_timeout_sec} seconds
              </p>
              {errors.idle_timeout_sec && (
                <p className="text-xs text-red-500 mt-0.5">{errors.idle_timeout_sec}</p>
              )}
            </div>

          </div>
        </div>
      </SectionCard>

      {/* Avatar Provider */}
      <SectionCard
        icon={Monitor}
        iconTint="text-blue-600"
        title="Avatar Provider"
        subtitle="Select the video avatar rendering provider for training sessions."
      >
        <div className="px-6 py-4">
          <select
            value={settings.avatar_provider}
            onChange={(e) => updateField('avatar_provider', e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="simli">Simli</option>
            <option value="heygen">HeyGen</option>
          </select>
        </div>
      </SectionCard>

      {/* Data Retention */}
      <SectionCard
        icon={Database}
        iconTint="text-slate-600"
        title="Data Retention"
        subtitle="How long session transcripts and recordings are kept before automatic deletion."
      >
        <div className="px-6 py-4">
          <div className="max-w-sm">
            <label className="text-xs font-medium text-foreground block mb-1.5">
              Retention Window
            </label>
            <input
              type="number"
              min={30}
              max={730}
              value={settings.data_retention_days}
              onChange={(e) => updateField('data_retention_days', parseInt(e.target.value) || 365)}
              className={`w-full rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                errors.data_retention_days ? 'border-red-500 focus:ring-red-200 focus:border-red-500' : 'border-border'
              }`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {settings.data_retention_days} days ({Math.round(settings.data_retention_days / 30)} months)
            </p>
            {errors.data_retention_days && (
              <p className="text-xs text-red-500 mt-0.5">{errors.data_retention_days}</p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Save button */}
      <div className="flex items-center justify-end pt-2 pb-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
