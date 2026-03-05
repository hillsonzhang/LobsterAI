import React, { useCallback, useState } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { i18nService } from '../../services/i18n';

interface KnowledgeBaseUploadProps {
  onUpload: (filePath: string) => void;
  disabled?: boolean;
}

const KnowledgeBaseUpload: React.FC<KnowledgeBaseUploadProps> = ({ onUpload, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = useCallback(async () => {
    if (disabled) return;
    const result = await window.electron?.dialog?.selectFile({
      title: i18nService.t('knowledgeBaseUpload'),
      filters: [{ name: 'Documents', extensions: ['pdf', 'md', 'txt'] }],
    });
    if (result?.success && result.path) {
      onUpload(result.path);
    }
  }, [disabled, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf' || ext === 'md' || ext === 'txt') {
        // Electron exposes File.path for drag-and-drop even with sandbox enabled
        const filePath = (file as any).path as string | undefined;
        if (filePath) {
          onUpload(filePath);
        }
      }
    }
  }, [disabled, onUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={`
        border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${isDragging
          ? 'border-claude-accent bg-claude-accent/5'
          : 'dark:border-claude-darkBorder border-claude-border hover:border-claude-accent/50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <ArrowUpTrayIcon className="h-8 w-8 mx-auto mb-3 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
      <p className="text-sm font-medium dark:text-claude-darkText text-claude-text">
        {i18nService.t('knowledgeBaseUploadHint')}
      </p>
      <p className="text-xs mt-1 dark:text-claude-darkTextSecondary text-claude-textSecondary">
        {i18nService.t('knowledgeBaseUploadFormats')}
      </p>
    </div>
  );
};

export default KnowledgeBaseUpload;
