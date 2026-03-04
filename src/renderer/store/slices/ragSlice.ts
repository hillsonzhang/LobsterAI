import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface EmbeddingConfig {
  apiBase: string;
  apiKey: string;
  model: string;
  dim: number;
}

export interface LlmConfig {
  apiBase: string;
  apiKey: string;
  model: string;
}

export interface RerankerConfig {
  enabled: boolean;
  apiBase: string;
  apiKey: string;
  model: string;
}

export interface RagDocument {
  id: string;
  name: string;
  file_path: string;
  type: 'pdf' | 'md' | 'txt';
  status: 'processing' | 'completed' | 'failed';
  nodes_count: number;
  error_message?: string;
  created_at: number;
  updated_at: number;
}

interface RagState {
  documents: RagDocument[];
  sidecarStatus: 'starting' | 'running' | 'stopped' | 'error';
  uploading: boolean;
  loading: boolean;
  embeddingConfig: EmbeddingConfig | null;
  llmConfig: LlmConfig | null;
  rerankerConfig: RerankerConfig | null;
}

const initialState: RagState = {
  documents: [],
  sidecarStatus: 'stopped',
  uploading: false,
  loading: false,
  embeddingConfig: null,
  llmConfig: null,
  rerankerConfig: null,
};

const ragSlice = createSlice({
  name: 'rag',
  initialState,
  reducers: {
    setDocuments: (state, action: PayloadAction<RagDocument[]>) => {
      state.documents = action.payload;
    },
    addDocument: (state, action: PayloadAction<RagDocument>) => {
      state.documents.unshift(action.payload);
    },
    updateDocumentStatus: (state, action: PayloadAction<{ id: string; status: RagDocument['status']; nodes_count?: number; error_message?: string }>) => {
      const doc = state.documents.find(d => d.id === action.payload.id);
      if (doc) {
        doc.status = action.payload.status;
        if (action.payload.nodes_count !== undefined) doc.nodes_count = action.payload.nodes_count;
        if (action.payload.error_message !== undefined) doc.error_message = action.payload.error_message;
      }
    },
    removeDocument: (state, action: PayloadAction<string>) => {
      state.documents = state.documents.filter(d => d.id !== action.payload);
    },
    setSidecarStatus: (state, action: PayloadAction<RagState['sidecarStatus']>) => {
      state.sidecarStatus = action.payload;
    },
    setUploading: (state, action: PayloadAction<boolean>) => {
      state.uploading = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setEmbeddingConfig: (state, action: PayloadAction<EmbeddingConfig | null>) => {
      state.embeddingConfig = action.payload;
    },
    setLlmConfig: (state, action: PayloadAction<LlmConfig | null>) => {
      state.llmConfig = action.payload;
    },
    setRerankerConfig: (state, action: PayloadAction<RerankerConfig | null>) => {
      state.rerankerConfig = action.payload;
    },
  },
});

export const {
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
} = ragSlice.actions;

export default ragSlice.reducer;
