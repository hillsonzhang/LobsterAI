import React, { useEffect, useState } from 'react';
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
  const { documents, sidecarStatus, loading, embeddingConfig, llmConfig, rerankerConfig } = useSelector((state: RootState) => state.rag);

  const [embedExpanded, setEmbedExpanded] = useState(false);
  const [embedApiBase, setEmbedApiBase] = useState('');
  const [embedApiKey, setEmbedApiKey] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [embedDim, setEmbedDim] = useState(1536);
  const [embedTesting, setEmbedTesting] = useState(false);
  const [embedTestResult, setEmbedTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [embedSaving, setEmbedSaving] = useState(false);
  const [embedSaved, setEmbedSaved] = useState(false);

  // LLM config state
  const [llmExpanded, setLlmExpanded] = useState(false);
  const [llmApiBase, setLlmApiBase] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmSaved, setLlmSaved] = useState(false);

  // Reranker config state
  const [rerankerExpanded, setRerankerExpanded] = useState(false);
  const [rerankerEnabled, setRerankerEnabled] = useState(false);
  const [rerankerApiBase, setRerankerApiBase] = useState('');
  const [rerankerApiKey, setRerankerApiKey] = useState('');
  const [rerankerModel, setRerankerModel] = useState('');
  const [rerankerSaving, setRerankerSaving] = useState(false);
  const [rerankerSaved, setRerankerSaved] = useState(false);

  // Sidecar restart state
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    knowledgeBaseService.checkSidecarStatus();
    knowledgeBaseService.loadDocuments();
    knowledgeBaseService.loadEmbeddingConfig();
    knowledgeBaseService.loadLlmConfig();
    knowledgeBaseService.loadRerankerConfig();
    return () => knowledgeBaseService.cleanup();
  }, []);

  useEffect(() => {
    if (embeddingConfig) {
      setEmbedApiBase(embeddingConfig.apiBase || '');
      setEmbedApiKey(embeddingConfig.apiKey || '');
      setEmbedModel(embeddingConfig.model || '');
      setEmbedDim(embeddingConfig.dim || 1536);
    }
  }, [embeddingConfig]);

  useEffect(() => {
    if (llmConfig) {
      setLlmApiBase(llmConfig.apiBase || '');
      setLlmApiKey(llmConfig.apiKey || '');
      setLlmModel(llmConfig.model || '');
    }
  }, [llmConfig]);

  useEffect(() => {
    if (rerankerConfig) {
      setRerankerEnabled(rerankerConfig.enabled || false);
      setRerankerApiBase(rerankerConfig.apiBase || '');
      setRerankerApiKey(rerankerConfig.apiKey || '');
      setRerankerModel(rerankerConfig.model || '');
    }
  }, [rerankerConfig]);

  const handleTestEmbedding = async () => {
    setEmbedTesting(true);
    setEmbedTestResult(null);
    try {
      // Save first so sidecar has the latest config
      await knowledgeBaseService.saveEmbeddingConfig({
        apiBase: embedApiBase,
        apiKey: embedApiKey,
        model: embedModel || 'text-embedding-3-small',
        dim: embedDim || 1536,
      });
      // Wait for sidecar to restart
      await new Promise(r => setTimeout(r, 3000));
      const result = await knowledgeBaseService.testEmbedding();
      setEmbedTestResult(result);
    } catch (e: any) {
      setEmbedTestResult({ success: false, error: e.message || String(e) });
    } finally {
      setEmbedTesting(false);
    }
  };

  const handleSaveEmbedding = async () => {
    setEmbedSaving(true);
    setEmbedSaved(false);
    try {
      await knowledgeBaseService.saveEmbeddingConfig({
        apiBase: embedApiBase,
        apiKey: embedApiKey,
        model: embedModel || 'text-embedding-3-small',
        dim: embedDim || 1536,
      });
      setEmbedSaved(true);
      setTimeout(() => setEmbedSaved(false), 2000);
      // Refresh sidecar status after restart
      setTimeout(() => knowledgeBaseService.checkSidecarStatus(), 3000);
    } finally {
      setEmbedSaving(false);
    }
  };

  const handleTestLlm = async () => {
    setLlmTesting(true);
    setLlmTestResult(null);
    try {
      await knowledgeBaseService.saveLlmConfig({
        apiBase: llmApiBase,
        apiKey: llmApiKey,
        model: llmModel || 'gpt-4o-mini',
      });
      await new Promise(r => setTimeout(r, 3000));
      const result = await knowledgeBaseService.testLlm();
      setLlmTestResult(result);
    } catch (e: any) {
      setLlmTestResult({ success: false, error: e.message || String(e) });
    } finally {
      setLlmTesting(false);
    }
  };

  const handleSaveLlm = async () => {
    setLlmSaving(true);
    setLlmSaved(false);
    try {
      await knowledgeBaseService.saveLlmConfig({
        apiBase: llmApiBase,
        apiKey: llmApiKey,
        model: llmModel || 'gpt-4o-mini',
      });
      setLlmSaved(true);
      setTimeout(() => setLlmSaved(false), 2000);
      setTimeout(() => knowledgeBaseService.checkSidecarStatus(), 3000);
    } finally {
      setLlmSaving(false);
    }
  };

  const handleSaveReranker = async () => {
    setRerankerSaving(true);
    setRerankerSaved(false);
    try {
      await knowledgeBaseService.saveRerankerConfig({
        enabled: rerankerEnabled,
        apiBase: rerankerApiBase,
        apiKey: rerankerApiKey,
        model: rerankerModel,
      });
      setRerankerSaved(true);
      setTimeout(() => setRerankerSaved(false), 2000);
      setTimeout(() => knowledgeBaseService.checkSidecarStatus(), 3000);
    } finally {
      setRerankerSaving(false);
    }
  };

  const handleRestartSidecar = async () => {
    setRestarting(true);
    try {
      await knowledgeBaseService.restartSidecar();
    } finally {
      setRestarting(false);
    }
  };

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
          <button
            type="button"
            onClick={handleRestartSidecar}
            disabled={restarting || sidecarStatus === 'starting'}
            className="non-draggable px-2 py-1 text-xs rounded border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={i18nService.t('knowledgeBaseSidecarRestart')}
          >
            {restarting || sidecarStatus === 'starting'
              ? i18nService.t('knowledgeBaseSidecarRestarting')
              : i18nService.t('knowledgeBaseSidecarRestart')}
          </button>
          <WindowTitleBar inline />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Embedding Config Section */}
          <div className="rounded-lg border dark:border-claude-darkBorder border-claude-border overflow-hidden">
            <button
              type="button"
              onClick={() => setEmbedExpanded(!embedExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 dark:bg-claude-darkSurface bg-claude-surface hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
            >
              <span className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                {i18nService.t('knowledgeBaseEmbedConfig')}
              </span>
              <svg
                className={`w-4 h-4 dark:text-claude-darkTextSecondary text-claude-textSecondary transition-transform ${embedExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {embedExpanded && (
              <div className="px-4 py-4 space-y-4 dark:bg-claude-darkBg bg-claude-bg">
                {/* API Base URL */}
                <div>
                  <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                    {i18nService.t('knowledgeBaseEmbedApiBase')}
                  </label>
                  <input
                    type="text"
                    value={embedApiBase}
                    onChange={(e) => setEmbedApiBase(e.target.value)}
                    placeholder={i18nService.t('knowledgeBaseEmbedApiBasePlaceholder')}
                    className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {/* API Key */}
                <div>
                  <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                    {i18nService.t('knowledgeBaseEmbedApiKey')}
                  </label>
                  <input
                    type="password"
                    value={embedApiKey}
                    onChange={(e) => setEmbedApiKey(e.target.value)}
                    placeholder={i18nService.t('knowledgeBaseEmbedApiKeyPlaceholder')}
                    className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {/* Model & Dim */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                      {i18nService.t('knowledgeBaseEmbedModel')}
                    </label>
                    <input
                      type="text"
                      value={embedModel}
                      onChange={(e) => setEmbedModel(e.target.value)}
                      placeholder={i18nService.t('knowledgeBaseEmbedModelPlaceholder')}
                      className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                      {i18nService.t('knowledgeBaseEmbedDim')}
                    </label>
                    <input
                      type="number"
                      value={embedDim}
                      onChange={(e) => setEmbedDim(Number(e.target.value) || 1536)}
                      className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {/* Test result */}
                {embedTestResult && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${embedTestResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                    {embedTestResult.success
                      ? i18nService.t('knowledgeBaseEmbedTestSuccess')
                      : `${i18nService.t('knowledgeBaseEmbedTestFail')}: ${embedTestResult.error || ''}`}
                  </div>
                )}
                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleTestEmbedding}
                    disabled={embedTesting || !embedApiKey}
                    className="px-4 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {embedTesting ? i18nService.t('knowledgeBaseEmbedTesting') : i18nService.t('knowledgeBaseEmbedTest')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEmbedding}
                    disabled={embedSaving || !embedApiKey}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {embedSaving
                      ? i18nService.t('knowledgeBaseEmbedSaving')
                      : embedSaved
                        ? i18nService.t('knowledgeBaseEmbedSaved')
                        : i18nService.t('knowledgeBaseEmbedSave')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* LLM Config Section */}
          <div className="rounded-lg border dark:border-claude-darkBorder border-claude-border overflow-hidden">
            <button
              type="button"
              onClick={() => setLlmExpanded(!llmExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 dark:bg-claude-darkSurface bg-claude-surface hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
            >
              <span className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                {i18nService.t('knowledgeBaseLlmConfig')}
              </span>
              <svg
                className={`w-4 h-4 dark:text-claude-darkTextSecondary text-claude-textSecondary transition-transform ${llmExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {llmExpanded && (
              <div className="px-4 py-4 space-y-4 dark:bg-claude-darkBg bg-claude-bg">
                {/* Warning if not configured */}
                {!llmApiKey && (
                  <div className="text-xs px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400">
                    {i18nService.t('knowledgeBaseLlmRequired')}
                  </div>
                )}
                {/* API Base URL */}
                <div>
                  <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                    {i18nService.t('knowledgeBaseLlmApiBase')}
                  </label>
                  <input
                    type="text"
                    value={llmApiBase}
                    onChange={(e) => setLlmApiBase(e.target.value)}
                    placeholder={i18nService.t('knowledgeBaseLlmApiBasePlaceholder')}
                    className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {/* API Key */}
                <div>
                  <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                    {i18nService.t('knowledgeBaseLlmApiKey')}
                  </label>
                  <input
                    type="password"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder={i18nService.t('knowledgeBaseLlmApiKeyPlaceholder')}
                    className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {/* Model */}
                <div>
                  <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                    {i18nService.t('knowledgeBaseLlmModel')}
                  </label>
                  <input
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder={i18nService.t('knowledgeBaseLlmModelPlaceholder')}
                    className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {/* Test result */}
                {llmTestResult && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${llmTestResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                    {llmTestResult.success
                      ? i18nService.t('knowledgeBaseLlmTestSuccess')
                      : `${i18nService.t('knowledgeBaseLlmTestFail')}: ${llmTestResult.error || ''}`}
                  </div>
                )}
                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleTestLlm}
                    disabled={llmTesting || !llmApiKey}
                    className="px-4 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {llmTesting ? i18nService.t('knowledgeBaseLlmTesting') : i18nService.t('knowledgeBaseLlmTest')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLlm}
                    disabled={llmSaving || !llmApiKey}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {llmSaving
                      ? i18nService.t('knowledgeBaseLlmSaving')
                      : llmSaved
                        ? i18nService.t('knowledgeBaseLlmSaved')
                        : i18nService.t('knowledgeBaseLlmSave')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reranker Config Section */}
          <div className="rounded-lg border dark:border-claude-darkBorder border-claude-border overflow-hidden">
            <button
              type="button"
              onClick={() => setRerankerExpanded(!rerankerExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 dark:bg-claude-darkSurface bg-claude-surface hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
            >
              <span className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                {i18nService.t('knowledgeBaseRerankerConfig')}
              </span>
              <svg
                className={`w-4 h-4 dark:text-claude-darkTextSecondary text-claude-textSecondary transition-transform ${rerankerExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {rerankerExpanded && (
              <div className="px-4 py-4 space-y-4 dark:bg-claude-darkBg bg-claude-bg">
                {/* Enable toggle */}
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rerankerEnabled}
                      onChange={(e) => setRerankerEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                  <span className="text-sm dark:text-claude-darkText text-claude-text">
                    {i18nService.t('knowledgeBaseRerankerEnabled')}
                  </span>
                </div>
                {rerankerEnabled && (
                  <>
                    {/* API Base URL */}
                    <div>
                      <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                        {i18nService.t('knowledgeBaseRerankerApiBase')}
                      </label>
                      <input
                        type="text"
                        value={rerankerApiBase}
                        onChange={(e) => setRerankerApiBase(e.target.value)}
                        placeholder={i18nService.t('knowledgeBaseRerankerApiBasePlaceholder')}
                        className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    {/* API Key */}
                    <div>
                      <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                        {i18nService.t('knowledgeBaseRerankerApiKey')}
                      </label>
                      <input
                        type="password"
                        value={rerankerApiKey}
                        onChange={(e) => setRerankerApiKey(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    {/* Model */}
                    <div>
                      <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                        {i18nService.t('knowledgeBaseRerankerModel')}
                      </label>
                      <input
                        type="text"
                        value={rerankerModel}
                        onChange={(e) => setRerankerModel(e.target.value)}
                        placeholder={i18nService.t('knowledgeBaseRerankerModelPlaceholder')}
                        className="w-full px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text placeholder:dark:text-claude-darkTextTertiary placeholder:text-claude-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
                {/* Save button */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSaveReranker}
                    disabled={rerankerSaving}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {rerankerSaving
                      ? i18nService.t('knowledgeBaseRerankerSaving')
                      : rerankerSaved
                        ? i18nService.t('knowledgeBaseRerankerSaved')
                        : i18nService.t('knowledgeBaseRerankerSave')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <KnowledgeBaseUpload
            onUpload={async (filePath) => {
              try {
                await knowledgeBaseService.uploadDocument(filePath);
              } catch (e: any) {
                console.error('[KnowledgeBase] Upload failed:', e);
              }
            }}
            disabled={sidecarStatus !== 'running'}
          />
          <KnowledgeBaseDocList
            documents={documents}
            loading={loading}
            onDelete={(docId) => knowledgeBaseService.deleteDocument(docId)}
            onRetry={(docId) => knowledgeBaseService.retryIndex(docId)}
          />
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseView;
