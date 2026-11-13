import React from 'react';
import { BarChart3, Layers, Receipt, Settings, TrendingUp } from 'lucide-react';

export type AppTab = 'matches' | 'generator' | 'bankroll' | 'settings';

interface NavbarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  slipCount: number;
  onOpenSlip: () => void;
}

const NAV_ITEMS: { id: AppTab; label: string; mobileLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'matches', label: 'Value Bety', mobileLabel: 'Přehled', icon: TrendingUp },
  { id: 'generator', label: 'Generátor tiketu', mobileLabel: 'Generátor', icon: Layers },
  { id: 'bankroll', label: 'Bankroll a statistiky', mobileLabel: 'Bankroll', icon: BarChart3 },
  { id: 'settings', label: 'Nastavení', mobileLabel: 'Nastavení', icon: Settings },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  slipCount,
  onOpenSlip,
}) => {
  return (
    <>
      {/* Top Bar strictly following 3-zone contract */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#090D16]/90 backdrop-blur-md pt-safe-header">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 md:h-16">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('matches')}
            className="font-display text-lg font-extrabold tracking-tight text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            BetEdge <span className="text-emerald-400">AI</span>
          </button>

          {/* Zone 2: 4 clean single-line navigation links */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Hlavní navigace">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                    isActive
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenSlip}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 focus-visible:outline-2 focus-visible:outline-emerald-400 whitespace-nowrap shrink-0 sm:px-4 sm:text-sm"
            >
              <Receipt className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Tiket</span>
              <span className="font-mono tabular-nums text-emerald-200">({slipCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Tab Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-[#0B101B]/95 backdrop-blur-md md:hidden pb-safe"
        aria-label="Mobilní navigace"
      >
        <div className="grid h-16 grid-cols-4 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
