import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-2.5 rounded-xl border border-amber-500/40 bg-[#171E2E] px-4 py-2.5 text-xs font-medium text-amber-200 shadow-xl md:bottom-5 md:left-auto md:right-5"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
      <span>Offline režim — zobrazují se uložená data v mezipaměti.</span>
    </div>
  );
};
