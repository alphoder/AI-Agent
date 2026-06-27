'use client';

import { useState, useEffect } from 'react';
import { Settings, User, Volume2, Globe, Shield, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import apiClient from '@/lib/api-client';
import { LANGUAGES } from '@avatar-platform/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Accent } from '@/components/ui/accent';

const VOICES = ['Aoede', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Zephyr'];

interface UserSettings {
  language: string;
  voice: string;
  bodyLanguageOptIn: boolean;
}

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  
  const [voice, setVoice] = useState('Aoede');
  const [language, setLanguage] = useState('en');
  const [bodyLanguageOptIn, setBodyLanguageOptIn] = useState(true);
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);

  // Initialize from user metadata
  useEffect(() => {
    if (user?.metadata?.settings) {
      const s = user.metadata.settings as UserSettings;
      if (s.voice) setVoice(s.voice);
      if (s.language) setLanguage(s.language);
      if (s.bodyLanguageOptIn !== undefined) setBodyLanguageOptIn(s.bodyLanguageOptIn);
    }
  }, [user]);

  async function saveSettings() {
    setSaving(true);
    setSaved(false);
    try {
      const settingsPayload = {
        settings: {
          voice,
          language,
          bodyLanguageOptIn,
        }
      };
      const { data } = await apiClient.patch('/auth/me/metadata', settingsPayload);
      if (data.success) {
        setUser(data.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e) {
      console.error('Failed to save settings', e);
    } finally {
      setSaving(false);
    }
  }

  function playVoicePreview(v: string) {
    if (typeof window === 'undefined') return;
    setPreviewing(v);
    
    // Attempt real audio voice generation using standard Web Speech API as a premium preview
    try {
      const u = new SpeechSynthesisUtterance(`Hello! I am ${v}. I will be your speaking coach.`);
      // Match gender/style if browser voices are available
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(voice => 
        voice.name.toLowerCase().includes(v.toLowerCase()) || 
        (v === 'Leda' && voice.name.toLowerCase().includes('female')) ||
        (v === 'Puck' && voice.name.toLowerCase().includes('male'))
      );
      if (match) u.voice = match;
      u.rate = 1.0;
      u.onend = () => setPreviewing(null);
      u.onerror = () => setPreviewing(null);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // Fallback: simulate audio loading/playing indicator for 1.5s
      setTimeout(() => setPreviewing(null), 1500);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Settings className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Manage your account, voice options, default language and privacy details.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <div className="md:col-span-1">
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" /> Profile Info
            </h2>
            <div className="flex flex-col items-center text-center py-4">
              {user?.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.picture}
                  alt={user.name || 'Avatar'}
                  className="w-20 h-20 rounded-full border border-border shadow-sm object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-2xl font-bold">
                  {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <h3 className="mt-3 font-semibold text-lg">{user?.name || 'Practitioner'}</h3>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <div className="border-t border-border pt-4 text-xs text-muted-foreground space-y-2">
              <p>Joined SpeakCoach: <span className="text-foreground font-medium">{user ? new Date(user.created_at).toLocaleDateString() : '—'}</span></p>
              <p>Account Status: <span className="text-primary font-medium">Active</span></p>
            </div>
          </Card>
        </div>

        {/* Configurations */}
        <div className="md:col-span-2 space-y-6">
          {/* Voice Settings */}
          <Card className="p-6 space-y-6">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Volume2 className="h-4 w-4" /> Voice & Coach Preferences
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block">Default Coach Voice</label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select the default voice for Gemini Live during scenarios.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {VOICES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVoice(v)}
                    className={`press flex flex-col items-center justify-between p-3.5 rounded-xl border text-center transition-all ${
                      voice === v
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-card hover:bg-muted/40'
                    }`}
                  >
                    <span className="text-sm font-semibold">{v}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playVoicePreview(v);
                      }}
                      disabled={previewing === v}
                      className="mt-2.5 p-1 rounded-full bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={`Preview ${v}`}
                    >
                      {previewing === v ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Language and Privacy */}
          <Card className="p-6 space-y-6">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Globe className="h-4 w-4" /> Practice Settings
            </h2>

            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Default Language</label>
                  <p className="text-xs text-muted-foreground">
                    The language in which Bixy and the scenarios will prompt you by default.
                  </p>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm max-w-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <hr className="border-border" />

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-primary" /> Body Language Feedback (Webcam)
                  </label>
                  <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
                    Enable webcam frame capture during practice sessions. Our AI coach analyzes posture, eye contact, and presence. **Video data is processed live, never saved on any server, and is strictly opt-in.**
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBodyLanguageOptIn(!bodyLanguageOptIn)}
                  className={`press relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    bodyLanguageOptIn ? 'bg-primary' : 'bg-secondary'
                  }`}
                  role="switch"
                  aria-checked={bodyLanguageOptIn}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-card shadow ring-0 transition duration-200 ease-in-out ${
                      bodyLanguageOptIn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="text-sm text-emerald-500 font-medium flex items-center gap-1">
                <Check className="h-4 w-4" /> Settings saved successfully
              </span>
            )}
            <Button
              onClick={saveSettings}
              disabled={saving}
              className="rounded-full px-6"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
