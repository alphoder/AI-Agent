'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface PersonaDetail {
  id: string;
  name: string;
  description: string | null;
  avatar_id: string;
  avatar_name: string;
  avatar_thumbnail_url: string | null;
  system_prompt: string;
  system_prompt_version: number;
  guardrails: any;
  rag_enabled: boolean;
  rag_top_k: number;
  rag_similarity_threshold: number;
  temperature: number;
  created_at: string;
  updated_at: string;
}

interface Document {
  id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  chunk_count: number | null;
  total_tokens: number | null;
  embedding_status: string;
  embedding_error: string | null;
  created_at: string;
}

const DOC_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  processing: 'bg-yellow-100 text-yellow-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

type Tab = 'info' | 'documents' | 'test';

export default function PersonaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tab, setTab] = useState<Tab>('info');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPersona();
    fetchDocuments();
  }, [params.id]);

  async function fetchPersona() {
    try {
      const { data } = await apiClient.get(`/personas/${params.id}`);
      setPersona(data.data);
    } catch {
      router.push('/personas');
    } finally {
      setLoading(false);
    }
  }

  async function fetchDocuments() {
    try {
      const { data } = await apiClient.get(`/personas/${params.id}/documents`);
      setDocuments(data.data);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      await apiClient.post(`/personas/${params.id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      fetchDocuments();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm('Delete this document and its embeddings?')) return;
    try {
      await apiClient.delete(`/personas/${params.id}/documents/${docId}`);
      fetchDocuments();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function handleReprocess(docId: string) {
    try {
      await apiClient.post(`/personas/${params.id}/documents/${docId}/reprocess`);
      fetchDocuments();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Reprocess failed');
    }
  }

  if (loading || !persona) {
    return (
      <div className="max-w-4xl mx-auto p-6 animate-pulse">
        <div className="h-4 w-28 rounded bg-muted mb-4" />
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
        </div>
        <div className="flex gap-4 border-b mb-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-20 rounded bg-muted mb-2" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-32 w-full rounded-lg bg-muted" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-28 rounded-lg bg-muted" />
            <div className="h-28 rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => router.push('/personas')} className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
        &larr; Back to Personas
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
          {persona.avatar_thumbnail_url ? (
            <img src={persona.avatar_thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-medium text-muted-foreground">{persona.name.charAt(0)}</span>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{persona.name}</h1>
          <p className="text-sm text-muted-foreground">{persona.description || 'No description'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b mb-6">
        {(['info', 'documents', 'test'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t === 'documents' ? `Documents (${documents.length})` : t}
          </button>
        ))}
      </div>

      {/* Info Tab */}
      {tab === 'info' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">System Prompt (v{persona.system_prompt_version})</h3>
            <pre className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap font-mono">{persona.system_prompt}</pre>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">Guardrails</h3>
              <dl className="space-y-1 text-sm">
                <div><dt className="text-muted-foreground inline">Allowed Topics:</dt> <dd className="inline">{persona.guardrails?.allowed_topics?.join(', ') || 'None'}</dd></div>
                <div><dt className="text-muted-foreground inline">Blocked Topics:</dt> <dd className="inline">{persona.guardrails?.blocked_topics?.join(', ') || 'None'}</dd></div>
                <div><dt className="text-muted-foreground inline">Max Tokens:</dt> <dd className="inline">{persona.guardrails?.max_response_tokens}</dd></div>
              </dl>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">Settings</h3>
              <dl className="space-y-1 text-sm">
                <div><dt className="text-muted-foreground inline">Temperature:</dt> <dd className="inline">{persona.temperature}</dd></div>
                <div><dt className="text-muted-foreground inline">RAG Enabled:</dt> <dd className="inline">{persona.rag_enabled ? 'Yes' : 'No'}</dd></div>
                {persona.rag_enabled && (
                  <>
                    <div><dt className="text-muted-foreground inline">Top K:</dt> <dd className="inline">{persona.rag_top_k}</dd></div>
                    <div><dt className="text-muted-foreground inline">Threshold:</dt> <dd className="inline">{persona.rag_similarity_threshold}</dd></div>
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {tab === 'documents' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Knowledge Base Documents</h3>
            <div>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={handleUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
            </div>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <p>No documents uploaded yet</p>
              <p className="text-sm mt-1">Upload PDF, DOCX, TXT, or MD files (max 50MB)</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 border rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{doc.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {(doc.file_size_bytes / 1024).toFixed(0)} KB
                      {doc.chunk_count != null && ` · ${doc.chunk_count} chunks`}
                      {doc.total_tokens != null && ` · ${doc.total_tokens} tokens`}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${DOC_STATUS_COLORS[doc.embedding_status]}`}>
                    {doc.embedding_status}
                  </span>
                  <div className="flex gap-2">
                    {doc.embedding_status === 'failed' && (
                      <button onClick={() => handleReprocess(doc.id)}
                        className="text-xs text-primary hover:underline">Reprocess</button>
                    )}
                    <button onClick={() => handleDeleteDoc(doc.id)}
                      className="text-xs text-destructive hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test Tab - Coming Soon */}
      {tab === 'test' && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 px-6">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1">Test Chat Coming Soon</h3>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            An interactive chat interface to test this persona will be available in a future update.
          </p>
        </div>
      )}
    </div>
  );
}
