import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface RagDocument {
  id: string;
  name: string;
  file_path: string;
  type: 'pdf' | 'md';
  status: 'pending' | 'processing' | 'completed' | 'failed';
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
}

const initialState: RagState = {
  documents: [],
  sidecarStatus: 'stopped',
  uploading: false,
  loading: false,
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
} = ragSlice.actions;

export default ragSlice.reducer;
