import React, { useEffect, useState } from 'react';
import { BookmarkCheck, ExternalLink, Trash2, X } from 'lucide-react';
import { MatchAnalysis, Ticket } from '../types/betting';
import {
  BETANO_HOME_URL,
  calculateSafeStake,
  formatCZK,
  formatOdds,
  formatPercent,
} from '../utils/analyticsEngine';

interface TicketSlipDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMatches: MatchAnalysis[];
  currentBankroll: number;
  onRemoveMatch: (matchId: string) => void;
  onClearSlip: () => void;
  onSaveTicket: (ticket: Ticket) => void;
  onOpenBetano: (homeTeam: string, awayTeam: string, recommendedPick?: string) => void;
}

export const TicketSlipDrawer: React.FC<TicketSlipDrawerProps> = ({
  isOpen,
  onClose,
  selectedMatches,
  currentBankroll,
  onRemoveMatch,
  onClearSlip,
  onSaveTicket,
  onOpenBetano,
}) => {
  const totalOdds = Number(
    selectedMatches.reduce((acc, m) => acc * m.odds.betano, 1).toFixed(2)
  );
  const jointProb = Number(
    (selectedMatches.reduce((acc, m) => acc * (m.aiProbability / 100), 1) * 100).toFixed(1)
  );
  const recommendedStake =
    selectedMatches.length > 0
      ? calculateSafeStake(currentBankroll, totalOdds, jointProb, 'Vlastní')
      : 0;

  const [stake, setStake] = useState<number>(recommendedStake || 200);

  useEffect(() => {
    if (recommendedStake > 0) {
      setStake(recommendedStake);
    }
  }, [recommendedStake]);

  if (!isOpen) return null;

  const potentialWin = Math.round(Math.max(5, stake || 5) * totalOdds);

  const handleSave = () => {
    if (selectedMatches.length === 0) return;
    const actualStake = Math.max(5, Math.round(stake || 5));
    const ticket: Ticket = {
      id: `tkt-manual-${Date.now()}`,
      createdAt: new Date().toISOString(),
      label: `Vlastní tiket (${selectedMatches.length} ${
        selectedMatches.length === 1 ? 'zápas' : selectedMatches.length < 5 ? 'zápasy' : 'zápasů'
      })`,
      riskLevel: 'Vlastní',
      legs: selectedMatches.map((m) => ({
        matchId: m.id,
        sport: m.sport,
        league: m.league,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoffTime: m.kickoffTime,
        recommendedPick: m.recommendedPick,
        marketLabel: m.marketLabel,
        betanoOdds: m.odds.betano,
        aiProbability: m.aiProbability,
        valueScore: m.valueScore,
      })),
      totalOdds,
      totalProbability: jointProb,
      recommendedStake,
      actualStake,
      potentialWin: Math.round(actualStake * totalOdds),
      status: 'pending',
      profit: 0,
      source: 'manual',
    };
    onSaveTicket(ticket);
    onClearSlip();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/65 backdrop-blur-sm sm:items-stretch"
      role="dialog"
      aria-modal="true"
      aria-label="Aktuální tiket"
    >
      <div className="flex max-h-[90vh] w-full flex-col rounded-t-3xl border-t border-slate-800 bg-[#0F1623] shadow-2xl sm:max-h-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0">
        {/* Mobile grab handle */}
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-slate-700 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-50">
              Váš tiket ({selectedMatches.length})
            </h2>
            <p className="text-xs text-slate-400">Ruční výběr zápasů ke kontrole a uložení</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
            aria-label="Zavřít tiket"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {selectedMatches.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-display text-base font-semibold text-slate-200">
                Tiket je zatím prázdný
              </p>
              <p className="mt-1.5 text-xs text-slate-400">
                Klikněte na tlačítko Přidat na tiket u libovolného zápasu v přehledu.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedMatches.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-800/90 bg-[#111827] p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-[11px] text-slate-400">
                        {m.sport} · {m.league}
                      </span>
                      <p className="mt-0.5 truncate font-display text-sm font-bold text-slate-100">
                        {m.homeTeam} vs. {m.awayTeam}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-emerald-300">
                        {m.recommendedPick}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveMatch(m.id)}
                      className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-400"
                      aria-label={`Odebrat ${m.homeTeam} vs. ${m.awayTeam}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/70 pt-2.5 text-xs">
                    <div className="flex items-center gap-3 font-mono tabular-nums">
                      <span className="font-bold text-slate-100">
                        Kurz {formatOdds(m.odds.betano)}
                      </span>
                      <span className="text-slate-400">AI {formatPercent(m.aiProbability)}</span>
                    </div>
                    <a
                      href={BETANO_HOME_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onOpenBetano(m.homeTeam, m.awayTeam, m.recommendedPick)}
                      className="inline-flex items-center gap-1 font-medium text-emerald-400 hover:text-emerald-300"
                    >
                      <span>Betano</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedMatches.length > 0 && (
          <div className="border-t border-slate-800 bg-[#0B101B] p-5 pb-safe">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-slate-800/80 bg-[#111827] p-2.5">
                <span className="block text-[11px] text-slate-400">Celkový kurz</span>
                <span className="font-mono text-base font-bold tabular-nums text-emerald-400">
                  {formatOdds(totalOdds)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-[#111827] p-2.5">
                <span className="block text-[11px] text-slate-400">Šance AI</span>
                <span className="font-mono text-base font-bold tabular-nums text-slate-100">
                  {formatPercent(jointProb)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-[#111827] p-2.5">
                <span className="block text-[11px] text-slate-400">Výhra</span>
                <span className="font-mono text-base font-bold tabular-nums text-emerald-300">
                  {formatCZK(potentialWin)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <label htmlFor="slip-stake" className="block text-[11px] text-slate-400">
                  Vklad v Kč (doporučeno {formatCZK(recommendedStake)})
                </label>
                <input
                  id="slip-stake"
                  type="number"
                  min={5}
                  step={5}
                  value={stake}
                  onChange={(e) => setStake(Number(e.target.value))}
                  onBlur={() => setStake((s) => Math.max(5, Math.round(s || 5)))}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3 font-mono text-sm font-bold tabular-nums text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={onClearSlip}
                className="mt-5 min-h-[42px] rounded-xl border border-slate-700 px-3.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Vymazat
              </button>
            </div>

            <button
              type="button"
              onClick={handleSave}
              className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              <BookmarkCheck className="h-4 w-4" />
              <span>Uložit tiket do Bankrollu</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
