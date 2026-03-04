import { store } from '../store';
import {
  setDocuments,
  addDocument,
  updateDocumentStatus,
  removeDocument,
  setSidecarStatus,
  setUploading,
  setLoading,
  setEmbeddingConfig,
  setLlmConfig,
  setRerankerConfig,
} from '../store/slices/ragSlice';
import type { RagDocument, EmbeddingConfig, LlmConfig, RerankerConfig } from '../store/slices/ragSlice';

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
          if (doc.status === 'processing') {
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
      const type = ext === 'md' ? 'md' : ext === 'txt' ? 'txt' : 'pdf';
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

  async retryIndex(docId: string): Promise<void> {
    try {
      await window.electron?.rag?.retryIndex(docId);
      store.dispatch(updateDocumentStatus({ id: docId, status: 'processing' }));
      this.startPollingStatus(docId);
    } catch (e: any) {
      console.error('[KnowledgeBase] retryIndex failed:', e);
      throw e;
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

  async loadEmbeddingConfig(): Promise<void> {
    try {
      const config = await window.electron?.rag?.getEmbeddingConfig();
      store.dispatch(setEmbeddingConfig(config || null));
    } catch {
      // ignore
    }
  }

  async saveEmbeddingConfig(config: EmbeddingConfig): Promise<void> {
    await window.electron?.rag?.setEmbeddingConfig(config);
    store.dispatch(setEmbeddingConfig(config));
  }

  async testEmbedding(): Promise<{ success: boolean; error?: string }> {
    try {
      return await window.electron?.rag?.testEmbedding() || { success: false, error: 'IPC unavailable' };
    } catch (e: any) {
      return { success: false, error: e.message || String(e) };
    }
  }

  async loadLlmConfig(): Promise<void> {
    try {
      const config = await window.electron?.rag?.getLlmConfig();
      store.dispatch(setLlmConfig(config || null));
    } catch {
      // ignore
    }
  }

  async saveLlmConfig(config: LlmConfig): Promise<void> {
    await window.electron?.rag?.setLlmConfig(config);
    store.dispatch(setLlmConfig(config));
  }

  async testLlm(): Promise<{ success: boolean; error?: string }> {
    try {
      return await window.electron?.rag?.testLlm() || { success: false, error: 'IPC unavailable' };
    } catch (e: any) {
      return { success: false, error: e.message || String(e) };
    }
  }

  async loadRerankerConfig(): Promise<void> {
    try {
      const config = await window.electron?.rag?.getRerankerConfig();
      store.dispatch(setRerankerConfig(config || null));
    } catch {
      // ignore
    }
  }

  async saveRerankerConfig(config: RerankerConfig): Promise<void> {
    await window.electron?.rag?.setRerankerConfig(config);
    store.dispatch(setRerankerConfig(config));
  }

  async restartSidecar(): Promise<void> {
    store.dispatch(setSidecarStatus('starting'));
    try {
      await window.electron?.rag?.restartSidecar();
      // Wait a moment for sidecar to start, then check status
      await new Promise(r => setTimeout(r, 2000));
      await this.checkSidecarStatus();
    } catch {
      store.dispatch(setSidecarStatus('error'));
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
