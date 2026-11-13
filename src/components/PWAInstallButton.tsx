import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return variant === 'full' ? (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
        Aplikace BetEdge AI je již nainstalována jako samostatná aplikace.
      </div>
    ) : null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 focus-visible:outline-2 focus-visible:outline-emerald-400 whitespace-nowrap shrink-0 ${
          variant === 'full' ? 'w-full sm:w-auto' : ''
        }`}
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>Nainstalovat aplikaci (PWA)</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 ${
            variant === 'full' ? 'w-full sm:w-auto' : ''
          }`}
        >
          <Share className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Přidat na plochu (iOS)</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#111827] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <h3 id="ios-install-title" className="text-lg font-bold text-slate-100">
                  Instalace na iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  aria-label="Zavřít návod"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-slate-300">
                <li>1. Klepněte na ikonu <strong>Sdílet</strong> ve spodní liště Safari.</li>
                <li>2. Posuňte nabídku níže a vyberte <strong>Přidat na plochu</strong>.</li>
                <li>3. Potvrďte tlačítkem <strong>Přidat</strong> v pravém horním rohu.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 min-h-[44px] w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Rozumím
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (variant === 'full') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs leading-relaxed text-slate-400">
        V mobilním prohlížeči Chrome otevřete menu prohlížeče (tři tečky) a zvolte{' '}
        <span className="font-semibold text-slate-200">Přidat na plochu</span> nebo{' '}
        <span className="font-semibold text-slate-200">Nainstalovat aplikaci</span>.
      </div>
    );
  }

  return null;
};
