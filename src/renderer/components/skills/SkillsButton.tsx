import React, { useRef, useState } from 'react';
import { PuzzlePieceIcon } from '@heroicons/react/24/outline';
import SkillsPopover from './SkillsPopover';
import { Skill } from '../../types/skill';

interface SkillsButtonProps {
  onSelectSkill: (skill: Skill) => void;
  onManageSkills: () => void;
  className?: string;
}

const SkillsButton: React.FC<SkillsButtonProps> = ({
  onSelectSkill,
  onManageSkills,
  className = '',
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleButtonClick = () => {
    setIsPopoverOpen(prev => !prev);
  };

  const handleClosePopover = () => {
    setIsPopoverOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        className={`p-2 rounded-xl bg-claude-surface text-claude-textSecondary hover:text-claude-accent hover:bg-claude-surfaceHover transition-colors ${className}`}
        title="Skills"
      >
        <PuzzlePieceIcon className="h-5 w-5" />
      </button>
      <SkillsPopover
        isOpen={isPopoverOpen}
        onClose={handleClosePopover}
        onSelectSkill={onSelectSkill}
        onManageSkills={onManageSkills}
        anchorRef={buttonRef}
      />
    </div>
  );
};

export default SkillsButton;
