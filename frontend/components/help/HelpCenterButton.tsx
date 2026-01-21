'use client';

import { CircleHelp } from 'lucide-react';
import { useHelpCenterStore } from '@/lib/stores/helpCenterStore';

export default function HelpCenterButton() {
  const { toggleModal } = useHelpCenterStore();

  return (
    <button
      onClick={toggleModal}
      className="p-2 rounded-lg hover:bg-muted transition-all duration-200 hover:scale-105 active:scale-95 text-muted-foreground hover:text-foreground"
      title="Help Center"
      data-tour="help-center"
    >
      <CircleHelp className="w-5 h-5" />
    </button>
  );
}
