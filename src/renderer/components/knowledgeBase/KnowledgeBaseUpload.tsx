import React, { useCallback, useRef, useState } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { i18nService } from '../../services/i18n';

interface KnowledgeBaseUploadProps {
  onUpload: (filePath: string) => void;
  disabled?: boolean;
}

const KnowledgeBaseUpload: React.FC<KnowledgeBaseUploadProps> = ({ onUpload, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf' || ext === 'md') {
        onUpload((file as any).path || file.name);
      }
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) fileInputRef.current?.click();
  }, [disabled]);

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
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.md"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
};

export default KnowledgeBaseUpload;
