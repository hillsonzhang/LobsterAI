import { getSidecarBaseUrl } from './ragSidecar';

// --- Response types from sidecar API ---

export interface RagDocumentResult {
  doc_id: string;
  name?: string;
  status: string;
}

export interface RagDocumentListResult {
  documents: Array<{
    id: string;
    name: string;
    file_path: string;
    type: string;
    status: string;
    nodes_count: number;
    error_message: string | null;
    created_at: number;
    updated_at: number;
  }>;
  total: number;
}

export interface RagDocumentStatusResult {
  status: string;
  nodes_count: number;
  error_message: string | null;
}

export interface RagSearchResult {
  mode: string;
  result?: string;
  context?: string;
}

async function sidecarFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const base = getSidecarBaseUrl();
  if (!base) throw new Error('RAG sidecar is not running');
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sidecar error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadDocument(filePath: string, type: string): Promise<RagDocumentResult> {
  return sidecarFetch<RagDocumentResult>('/index', {
    method: 'POST',
    body: JSON.stringify({ path: filePath, type }),
  });
}

export async function listDocuments(limit = 50, offset = 0): Promise<RagDocumentListResult> {
  const base = getSidecarBaseUrl();
  if (!base) return { documents: [], total: 0 };
  return sidecarFetch<RagDocumentListResult>(`/documents?limit=${limit}&offset=${offset}`);
}

export async function retryIndex(docId: string): Promise<RagDocumentResult> {
  return sidecarFetch<RagDocumentResult>(`/index/${docId}/retry`, { method: 'POST' });
}

export async function deleteDocument(docId: string): Promise<{ success: boolean }> {
  return sidecarFetch<{ success: boolean }>(`/documents/${docId}`, { method: 'DELETE' });
}

export async function getDocumentStatus(docId: string): Promise<RagDocumentStatusResult> {
  return sidecarFetch<RagDocumentStatusResult>(`/index/${docId}/status`);
}

export async function searchDocuments(query: string, docIds?: string[]): Promise<RagSearchResult> {
  return sidecarFetch<RagSearchResult>('/search', {
    method: 'POST',
    body: JSON.stringify({ query, doc_ids: docIds }),
  });
}
