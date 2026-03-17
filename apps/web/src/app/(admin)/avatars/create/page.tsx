'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

type Step = 'upload' | 'configure' | 'review';

export default function CreateAvatarPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setError('Only JPEG and PNG files are allowed');
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setError('File must be under 5MB');
      return;
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      const fakeEvent = {
        target: { files: [dropped] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const handleSubmit = async () => {
    if (!file || !name.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('name', name.trim());

      await apiClient.post('/avatars', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      router.push('/avatars');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create avatar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create Avatar</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-4 mb-8">
        {(['upload', 'configure', 'review'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : i < ['upload', 'configure', 'review'].indexOf(step)
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </div>
            <span className="text-sm capitalize hidden sm:inline">{s}</span>
            {i < 2 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
          >
            {preview ? (
              <div className="space-y-4">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-48 h-48 object-cover rounded-lg mx-auto"
                />
                <p className="text-sm text-muted-foreground">{file?.name}</p>
                <p className="text-xs text-muted-foreground">Click or drag to replace</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-4xl text-muted-foreground">+</div>
                <p className="font-medium">Drop an image here or click to upload</p>
                <p className="text-sm text-muted-foreground">JPEG or PNG, max 5MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setStep('configure')}
              disabled={!file}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 'configure' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Avatar Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Professional Coach"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep('upload')}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Back
            </button>
            <button
              onClick={() => setStep('review')}
              disabled={!name.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div className="space-y-6">
          <div className="border rounded-lg p-6">
            <div className="flex items-start gap-6">
              {preview && (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-32 h-32 object-cover rounded-lg"
                />
              )}
              <div>
                <h3 className="font-medium text-lg">{name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  File: {file?.name} ({((file?.size || 0) / 1024).toFixed(0)} KB)
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep('configure')}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Avatar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
