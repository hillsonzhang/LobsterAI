import { getSidecarBaseUrl } from './pageindexSidecar';

async function sidecarFetch(path: string, options?: RequestInit): Promise<any> {
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
  return res.json();
}

export async function uploadDocument(filePath: string, type: string): Promise<any> {
  return sidecarFetch('/index', {
    method: 'POST',
    body: JSON.stringify({ path: filePath, type }),
  });
}

export async function listDocuments(limit = 50, offset = 0): Promise<any> {
  return sidecarFetch(`/documents?limit=${limit}&offset=${offset}`);
}

export async function deleteDocument(docId: string): Promise<any> {
  return sidecarFetch(`/documents/${docId}`, { method: 'DELETE' });
}

export async function getDocumentStatus(docId: string): Promise<any> {
  return sidecarFetch(`/index/${docId}/status`);
}

export async function searchDocuments(query: string, docIds?: string[]): Promise<any> {
  return sidecarFetch('/search', {
    method: 'POST',
    body: JSON.stringify({ query, doc_ids: docIds }),
  });
}
