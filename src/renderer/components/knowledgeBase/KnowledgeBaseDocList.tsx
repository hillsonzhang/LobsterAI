import React, { useState } from 'react';
import { TrashIcon, DocumentTextIcon, DocumentIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { i18nService } from '../../services/i18n';
import type { RagDocument } from '../../store/slices/ragSlice';

interface KnowledgeBaseDocListProps {
  documents: RagDocument[];
  loading: boolean;
  onDelete: (docId: string) => void;
  onRetry?: (docId: string) => void;
}

const statusColors: Record<string, string> = {
  processing: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
};

const statusKeys: Record<string, string> = {
  processing: 'knowledgeBaseStatusProcessing',
  completed: 'knowledgeBaseStatusCompleted',
  failed: 'knowledgeBaseStatusFailed',
};

const KnowledgeBaseDocList: React.FC<KnowledgeBaseDocListProps> = ({ documents, loading, onDelete, onRetry }) => {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="text-center py-8 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
        Loading...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
        {i18nService.t('knowledgeBaseEmpty')}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium dark:text-claude-darkText text-claude-text">
          {i18nService.t('knowledgeBaseDocList')}
        </h2>
        <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {i18nService.t('knowledgeBaseDocCount').replace('{count}', String(documents.length))}
        </span>
      </div>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between px-4 py-3 rounded-lg dark:bg-claude-darkSurface bg-claude-surface border dark:border-claude-darkBorder border-claude-border"
          >
            <div className="flex items-center gap-3 min-w-0">
              {doc.type === 'pdf' ? (
                <DocumentIcon className="h-5 w-5 shrink-0 text-red-400" />
              ) : (
                <DocumentTextIcon className="h-5 w-5 shrink-0 text-blue-400" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate">
                  {doc.name}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${statusColors[doc.status] || 'text-gray-500'}`}>
                    {statusKeys[doc.status] ? i18nService.t(statusKeys[doc.status]) : doc.status}
                  </span>
                  {doc.status === 'completed' && doc.nodes_count > 0 && (
                    <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {i18nService.t('knowledgeBaseNodes').replace('{count}', String(doc.nodes_count))}
                    </span>
                  )}
                  {doc.status === 'failed' && doc.error_message && (
                    <span className="text-xs text-red-400 truncate max-w-[200px]" title={doc.error_message}>
                      {doc.error_message}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {confirmingId === doc.id ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { onDelete(doc.id); setConfirmingId(null); }}
                    className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                  >
                    {i18nService.t('knowledgeBaseDelete')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="text-xs px-2 py-1 rounded dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {i18nService.t('cancel')}
                  </button>
                </div>
              ) : (
                <>
                  {doc.status === 'failed' && onRetry && (
                    <button
                      type="button"
                      onClick={async () => {
                        setRetryingId(doc.id);
                        try { await onRetry(doc.id); } catch { /* handled by service */ }
                        setRetryingId(null);
                      }}
                      disabled={retryingId === doc.id}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-blue-500 hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50"
                      title={i18nService.t('knowledgeBaseRetryIndex')}
                    >
                      <ArrowPathIcon className={`h-4 w-4 ${retryingId === doc.id ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmingId(doc.id)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-red-500 hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KnowledgeBaseDocList;
