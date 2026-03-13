import React from 'react';
import { XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

interface ToastProps {
  message: string;
  onClose?: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-claude-border/60 bg-white/95 text-claude-text px-6 py-4 shadow-xl backdrop-blur-md animate-scale-in">
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-full bg-claude-accent/10 p-2.5">
            <InformationCircleIcon className="h-5 w-5 text-claude-accent" />
          </div>
          <div className="flex-1 text-base font-semibold leading-none">
            {message}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 text-claude-textSecondary hover:text-claude-text rounded-full p-1 hover:bg-claude-surfaceHover transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toast;
