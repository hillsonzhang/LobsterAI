import { store } from '../store';
import {
  setDocuments,
  addDocument,
  updateDocumentStatus,
  removeDocument,
  setSidecarStatus,
  setUploading,
  setLoading,
} from '../store/slices/ragSlice';
import type { RagDocument } from '../store/slices/ragSlice';

class KnowledgeBaseService {
  private pollingTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  async loadDocuments(): Promise<void> {
    store.dispatch(setLoading(true));
    try {
      const result = await window.electron?.rag?.listDocuments();
      if (result?.documents) {
        store.dispatch(setDocuments(result.documents));
        // Start polling for any processing documents
        for (const doc of result.documents) {
          if (doc.status === 'pending' || doc.status === 'processing') {
            this.startPollingStatus(doc.id);
          }
        }
      }
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  async checkSidecarStatus(): Promise<void> {
    try {
      const status = await window.electron?.rag?.getSidecarStatus();
      store.dispatch(setSidecarStatus(status?.running ? 'running' : 'stopped'));
    } catch {
      store.dispatch(setSidecarStatus('error'));
    }
  }

  async uploadDocument(filePath: string): Promise<void> {
    store.dispatch(setUploading(true));
    try {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const type = ext === 'md' ? 'md' : 'pdf';
      const result = await window.electron?.rag?.uploadDocument(filePath, type);
      if (result?.doc_id) {
        const doc: RagDocument = {
          id: result.doc_id,
          name: filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown',
          file_path: filePath,
          type,
          status: 'processing',
          nodes_count: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        store.dispatch(addDocument(doc));
        this.startPollingStatus(result.doc_id);
      }
    } finally {
      store.dispatch(setUploading(false));
    }
  }

  async deleteDocument(docId: string): Promise<void> {
    await window.electron?.rag?.deleteDocument(docId);
    this.stopPollingStatus(docId);
    store.dispatch(removeDocument(docId));
  }

  private startPollingStatus(docId: string): void {
    if (this.pollingTimers.has(docId)) return;
    const timer = setInterval(async () => {
      try {
        const status = await window.electron?.rag?.getDocumentStatus(docId);
        if (status) {
          store.dispatch(updateDocumentStatus({
            id: docId,
            status: status.status,
            nodes_count: status.nodes_count,
            error_message: status.error_message,
          }));
          if (status.status === 'completed' || status.status === 'failed') {
            this.stopPollingStatus(docId);
          }
        }
      } catch {
        this.stopPollingStatus(docId);
      }
    }, 2000);
    this.pollingTimers.set(docId, timer);
  }

  private stopPollingStatus(docId: string): void {
    const timer = this.pollingTimers.get(docId);
    if (timer) {
      clearInterval(timer);
      this.pollingTimers.delete(docId);
    }
  }

  cleanup(): void {
    for (const timer of this.pollingTimers.values()) {
      clearInterval(timer);
    }
    this.pollingTimers.clear();
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
