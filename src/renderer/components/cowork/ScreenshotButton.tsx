import React, { useState, useRef, useCallback, useEffect } from 'react';
import ScissorsIcon from '../icons/ScissorsIcon';
import { i18nService } from '../../services/i18n';

interface ScreenshotButtonProps {
  onScreenshotCaptured: (filePath: string, imageInfo: { isImage: boolean; dataUrl: string }) => void;
  disabled?: boolean;
  workingDirectory?: string;
}

const ScreenshotButton: React.FC<ScreenshotButtonProps> = ({
  onScreenshotCaptured,
  disabled = false,
  workingDirectory,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const doCapture = useCallback(async (hideWindow: boolean) => {
    if (isCapturing || disabled) return;
    setIsCapturing(true);
    setShowMenu(false);

    try {
      const result = await window.electron.screenshot.capture({
        hideWindow,
        cwd: workingDirectory,
      });

      if (result.success && result.filePath && result.dataUrl) {
        onScreenshotCaptured(result.filePath, {
          isImage: true,
          dataUrl: result.dataUrl,
        });
      } else if (result.error === 'screen_permission_denied') {
        // macOS screen recording permission not granted
        window.electron.shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
        );
      }
    } catch (error) {
      console.error('[ScreenshotButton] capture failed:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, disabled, workingDirectory, onScreenshotCaptured]);

  const handleClick = useCallback(() => {
    // Clear hover timer to prevent menu from showing after click
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    doCapture(false);
  }, [doCapture]);

  const handleHideWindowCapture = useCallback(() => {
    doCapture(true);
  }, [doCapture]);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (!showMenu && !isCapturing) {
      hoverTimerRef.current = setTimeout(() => {
        setShowMenu(true);
      }, 300);
    }
  }, [showMenu, isCapturing]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    leaveTimerRef.current = setTimeout(() => {
      setShowMenu(false);
    }, 200);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center justify-center p-1.5 rounded-lg text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover dark:hover:text-claude-darkText hover:text-claude-text transition-colors"
        title={i18nService.t('coworkScreenshot')}
        aria-label={i18nService.t('coworkScreenshot')}
        disabled={disabled || isCapturing}
      >
        <ScissorsIcon className="h-4 w-4" />
      </button>

      {showMenu && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50">
          <div className="rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-lg">
            <button
              type="button"
              onClick={handleHideWindowCapture}
              className="flex items-center whitespace-nowrap px-3 py-2 text-xs dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-lg transition-colors"
            >
              {i18nService.t('coworkScreenshotHideWindow')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenshotButton;
