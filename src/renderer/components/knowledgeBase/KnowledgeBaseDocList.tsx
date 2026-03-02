import React, { useState } from 'react';
import { TrashIcon, DocumentTextIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { i18nService } from '../../services/i18n';
import type { RagDocument } from '../../store/slices/ragSlice';

interface KnowledgeBaseDocListProps {
  documents: RagDocument[];
  loading: boolean;
  onDelete: (docId: string) => void;
}

const statusColors: Record<string, string> = {
  pending: 'text-yellow-500',
  processing: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
};

const statusKeys: Record<string, string> = {
  pending: 'knowledgeBaseStatusPending',
  processing: 'knowledgeBaseStatusProcessing',
  completed: 'knowledgeBaseStatusCompleted',
  failed: 'knowledgeBaseStatusFailed',
};

const KnowledgeBaseDocList: React.FC<KnowledgeBaseDocListProps> = ({ documents, loading, onDelete }) => {
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
                  <span className={`text-xs ${statusColors[doc.status] || ''}`}>
                    {i18nService.t(statusKeys[doc.status] || '')}
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
                <button
                  type="button"
                  onClick={() => setConfirmingId(doc.id)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-red-500 hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KnowledgeBaseDocList;
