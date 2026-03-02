import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { i18nService } from '../../services/i18n';
import { knowledgeBaseService } from '../../services/knowledgeBase';
import KnowledgeBaseUpload from './KnowledgeBaseUpload';
import KnowledgeBaseDocList from './KnowledgeBaseDocList';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import ComposeIcon from '../icons/ComposeIcon';
import WindowTitleBar from '../window/WindowTitleBar';

interface KnowledgeBaseViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  onBack?: () => void;
  updateBadge?: React.ReactNode;
}

const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  // onBack reserved for future navigation
  updateBadge,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const { documents, sidecarStatus, loading } = useSelector((state: RootState) => state.rag);

  useEffect(() => {
    knowledgeBaseService.checkSidecarStatus();
    knowledgeBaseService.loadDocuments();
    return () => knowledgeBaseService.cleanup();
  }, []);

  const sidecarStatusText = {
    starting: i18nService.t('knowledgeBaseSidecarStarting'),
    running: i18nService.t('knowledgeBaseSidecarRunning'),
    stopped: i18nService.t('knowledgeBaseSidecarStopped'),
    error: i18nService.t('knowledgeBaseSidecarError'),
  }[sidecarStatus];

  const sidecarDotColor = {
    starting: 'bg-yellow-400',
    running: 'bg-green-400',
    stopped: 'bg-gray-400',
    error: 'bg-red-400',
  }[sidecarStatus];

  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-claude-bg h-full">
      {/* Header */}
      <div className="draggable flex h-12 items-center justify-between px-4 border-b dark:border-claude-darkBorder border-claude-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          <h1 className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
            {i18nService.t('knowledgeBaseTitle')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${sidecarDotColor}`} />
          <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {sidecarStatusText}
          </span>
          <WindowTitleBar inline />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          <KnowledgeBaseUpload
            onUpload={(filePath) => knowledgeBaseService.uploadDocument(filePath)}
            disabled={sidecarStatus !== 'running'}
          />
          <KnowledgeBaseDocList
            documents={documents}
            loading={loading}
            onDelete={(docId) => knowledgeBaseService.deleteDocument(docId)}
          />
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseView;
