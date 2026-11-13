import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_MATCHES, INITIAL_DEMO_TICKETS } from './data/demoMatches';
import { useLocalStorage } from './hooks/useLocalStorage';
import { fetchLiveOddsAndStats } from './services/oddsApiService';
import { AppSettings, MatchAnalysis, Ticket } from './types/betting';
import { copyMatchForBetano, formatCZK } from './utils/analyticsEngine';
import { AppTab, Navbar } from './components/Navbar';
import { MatchFeed } from './components/MatchFeed';
import { TicketGenerator } from './components/TicketGenerator';
import { BankrollStats } from './components/BankrollStats';
import { SettingsView } from './components/SettingsView';
import { TicketSlipDrawer } from './components/TicketSlipDrawer';
import { OfflineIndicator } from './components/OfflineIndicator';
import { CustomMatchModal } from './components/CustomMatchModal';

const DEFAULT_SETTINGS: AppSettings = {
  theOddsApiKey: '',
  apiSportsKey: '',
  demoMode: false,
  initialBankroll: 10000,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('matches');
  const [settings, setSettings] = useLocalStorage<AppSettings>('betedge_settings_v1', DEFAULT_SETTINGS);
  const [tickets, setTickets] = useLocalStorage<Ticket[]>('betedge_tickets_v1', INITIAL_DEMO_TICKETS);
  const [slipMatchIds, setSlipMatchIds] = useLocalStorage<string[]>('betedge_slip_v1', []);
  const [customMatches, setCustomMatches] = useLocalStorage<MatchAnalysis[]>('betedge_custom_matches_v1', []);

  const [liveMatches, setLiveMatches] = useState<MatchAnalysis[] | null>(null);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveStatusMessage, setLiveStatusMessage] = useState<string | null>(null);

  const [isSlipOpen, setIsSlipOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const lastAttemptedKeyRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const handleOpenBetano = useCallback(
    (homeTeam: string, awayTeam: string, recommendedPick?: string) => {
      const copiedName = copyMatchForBetano(homeTeam, awayTeam, recommendedPick);
      showToast(`Zkopírováno „${copiedName}“, vlož v Betanu do vyhledávání`);
    },
    [showToast]
  );

  const handleFetchLiveData = useCallback(async (oddsKey: string, sportsKey: string) => {
    const trimmedOdds = oddsKey.trim();
    const trimmedSports = sportsKey.trim();
    lastAttemptedKeyRef.current = `${trimmedOdds}::${trimmedSports}`;

    if (!trimmedOdds) {
      setLiveMatches(null);
      setLiveStatusMessage(null);
      setLiveError('Chybí API klíč pro The Odds API. Zadejte klíč v Nastavení nebo zapněte Demo režim.');
      return;
    }

    setIsLoadingLive(true);
    setLiveError(null);
    setLiveStatusMessage(null);
    try {
      const result = await fetchLiveOddsAndStats(trimmedOdds, trimmedSports);
      setLiveMatches(result.matches);
      const quotaNote = result.remainingQuota ? ` · zbývá ${result.remainingQuota} dotazů` : '';
      setLiveStatusMessage(`Načteno ${result.matches.length} aktuálních zápasů z The Odds API${quotaNote}.`);
      if (result.apiSportsWarning) {
        setLiveError(`Poznámka z API-Sports: ${result.apiSportsWarning}`);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Nepodařilo se stáhnout kurzy z The Odds API.';
      setLiveMatches(null);
      setLiveError(message);
    } finally {
      setIsLoadingLive(false);
    }
  }, []);

  useEffect(() => {
    if (settings.demoMode) {
      lastAttemptedKeyRef.current = null;
      return;
    }
    const configKey = `${settings.theOddsApiKey.trim()}::${settings.apiSportsKey.trim()}`;
    if (lastAttemptedKeyRef.current !== configKey) {
      void handleFetchLiveData(settings.theOddsApiKey, settings.apiSportsKey);
    }
  }, [settings.demoMode, settings.theOddsApiKey, settings.apiSportsKey, handleFetchLiveData]);

  const activeMatches = useMemo(() => {
    const baseMatches = settings.demoMode ? DEMO_MATCHES : liveMatches ?? [];
    return [...customMatches, ...baseMatches];
  }, [customMatches, settings.demoMode, liveMatches]);

  const selectedSlipMatches = useMemo(() => {
    return activeMatches.filter((m) => slipMatchIds.includes(m.id));
  }, [activeMatches, slipMatchIds]);

  const currentBankroll = useMemo(() => {
    const settledProfit = tickets
      .filter((t) => t.status === 'won' || t.status === 'lost')
      .reduce((sum, t) => sum + t.profit, 0);
    return settings.initialBankroll + settledProfit;
  }, [tickets, settings.initialBankroll]);

  const handleToggleMatchOnSlip = (match: MatchAnalysis) => {
    setSlipMatchIds((prev) => {
      if (prev.includes(match.id)) {
        return prev.filter((id) => id !== match.id);
      }
      showToast(`Zápas ${match.homeTeam} vs. ${match.awayTeam} přidán na tiket.`);
      return [...prev, match.id];
    });
  };

  const handleSaveTicket = (ticket: Ticket) => {
    setTickets((prev) => [ticket, ...prev]);
    showToast('Tiket byl uložen do Bankrollu a statistik.');
  };

  const handleSettleTicket = (ticketId: string, status: 'won' | 'lost') => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== ticketId) return t;
        const profit = status === 'won' ? t.potentialWin - t.actualStake : -t.actualStake;
        return { ...t, status, profit };
      })
    );
    showToast(status === 'won' ? 'Tiket označen jako Výhra.' : 'Tiket označen jako Prohra.');
  };

  const handleDeleteTicket = (ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
  };

  const handleResetDemoHistory = () => {
    setTickets(INITIAL_DEMO_TICKETS);
    showToast('Ukázková historie bankrollu byla obnovena.');
  };

  const handleStartFromScratch = () => {
    setTickets([]);
    showToast(`Demo tikety smazány. Počáteční kapitál je ${formatCZK(settings.initialBankroll)}.`);
  };

  const handleAddCustomMatch = (match: MatchAnalysis) => {
    setCustomMatches((prev) => [match, ...prev]);
    showToast(`Vlastní zápas ${match.homeTeam} vs. ${match.awayTeam} byl přidán.`);
  };

  const handleDeleteCustomMatch = (matchId: string) => {
    setCustomMatches((prev) => prev.filter((m) => m.id !== matchId));
    setSlipMatchIds((prev) => prev.filter((id) => id !== matchId));
    showToast('Vlastní zápas byl odstraněn.');
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        slipCount={selectedSlipMatches.length}
        onOpenSlip={() => setIsSlipOpen(true)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-12">
        {activeTab === 'matches' && (
          <MatchFeed
            matches={activeMatches}
            selectedMatchIds={slipMatchIds}
            onToggleMatchOnSlip={handleToggleMatchOnSlip}
            onOpenBetano={handleOpenBetano}
            isDemoMode={settings.demoMode}
            isLoadingLive={isLoadingLive}
            liveError={liveError}
            onRefreshLive={() => handleFetchLiveData(settings.theOddsApiKey, settings.apiSportsKey)}
            onOpenSettings={() => setActiveTab('settings')}
            onOpenCustomMatchModal={() => setIsCustomModalOpen(true)}
            onDeleteCustomMatch={handleDeleteCustomMatch}
          />
        )}

        {activeTab === 'generator' && (
          <TicketGenerator
            matches={activeMatches}
            currentBankroll={currentBankroll}
            onSaveTicket={handleSaveTicket}
            onOpenBetano={handleOpenBetano}
            onOpenCustomMatchModal={() => setIsCustomModalOpen(true)}
            onDeleteCustomMatch={handleDeleteCustomMatch}
          />
        )}

        {activeTab === 'bankroll' && (
          <BankrollStats
            tickets={tickets}
            initialBankroll={settings.initialBankroll}
            onSettleTicket={handleSettleTicket}
            onDeleteTicket={handleDeleteTicket}
            onResetDemoHistory={handleResetDemoHistory}
            onStartFromScratch={handleStartFromScratch}
            onOpenBetano={handleOpenBetano}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={(next) => {
              setSettings(next);
              if (next.demoMode) {
                setLiveError(null);
                setLiveStatusMessage(null);
              }
            }}
            onFetchLiveData={handleFetchLiveData}
            isLoadingLive={isLoadingLive}
            liveStatusMessage={liveStatusMessage}
            liveError={liveError}
          />
        )}
      </main>

      <footer className="hidden border-t border-slate-800/70 bg-[#090D16] py-5 md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 text-xs text-slate-500">
          <span>BetEdge AI · Sportovní analytik a správa bankrollu</span>
          <span>Analytická platforma bez automatického podávání sázek · Hrajte zodpovědně (18+)</span>
        </div>
      </footer>

      <TicketSlipDrawer
        isOpen={isSlipOpen}
        onClose={() => setIsSlipOpen(false)}
        selectedMatches={selectedSlipMatches}
        currentBankroll={currentBankroll}
        onRemoveMatch={(id) => setSlipMatchIds((prev) => prev.filter((x) => x !== id))}
        onClearSlip={() => setSlipMatchIds([])}
        onSaveTicket={handleSaveTicket}
        onOpenBetano={handleOpenBetano}
      />

      <CustomMatchModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onAddMatch={handleAddCustomMatch}
      />

      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-emerald-500/40 bg-[#111827] px-4 py-3 text-center text-xs font-semibold text-emerald-300 shadow-2xl md:bottom-6 md:left-auto md:right-6 md:text-left"
        >
          {toastMessage}
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
