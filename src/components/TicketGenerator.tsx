import React, { useEffect, useState } from 'react';
import {
  BookmarkCheck,
  Check,
  ExternalLink,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  MatchAnalysis,
  RiskLevel,
  SportCategory,
  Ticket,
} from '../types/betting';
import {
  BETANO_HOME_URL,
  formatCZK,
  formatOdds,
  formatPercent,
  generateOptimalTicket,
  GeneratedTicketResult,
  RISK_PROFILES,
} from '../utils/analyticsEngine';

interface TicketGeneratorProps {
  matches: MatchAnalysis[];
  currentBankroll: number;
  onSaveTicket: (ticket: Ticket) => void;
  onOpenBetano: (homeTeam: string, awayTeam: string) => void;
}

const ALL_SPORTS: SportCategory[] = ['Fotbal', 'Hokej', 'Tenis', 'MMA'];
const RISK_LEVELS: RiskLevel[] = ['Konzervativní', 'Vyvážený', 'Odvážný'];
const BUDGET_PRESETS = [5, 50, 200, 1000, 5000];

export const TicketGenerator: React.FC<TicketGeneratorProps> = ({
  matches,
  currentBankroll,
  onSaveTicket,
  onOpenBetano,
}) => {
  const [budget, setBudget] = useState<number>(Math.max(5, Math.round(currentBankroll)));
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Vyvážený');
  const [selectedSports, setSelectedSports] = useState<SportCategory[]>(['Fotbal', 'Hokej', 'Tenis', 'MMA']);
  const [variationIndex, setVariationIndex] = useState(0);
  const [generated, setGenerated] = useState<GeneratedTicketResult | null>(null);
  const [customStake, setCustomStake] = useState<number>(5);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    // Generate an initial preview on mount or when parameters change smoothly only on click
    if (!generated && matches.length >= 2) {
      const initial = generateOptimalTicket(matches, selectedSports, riskLevel, budget, 0);
      if (initial) {
        setGenerated(initial);
        setCustomStake(initial.recommendedStake);
      }
    }
  }, [matches, generated, selectedSports, riskLevel, budget]);

  const toggleSport = (sport: SportCategory) => {
    setSelectedSports((prev) => {
      if (prev.includes(sport)) {
        if (prev.length === 1) return prev; // keep at least one sport selected
        return prev.filter((s) => s !== sport);
      }
      return [...prev, sport];
    });
  };

  const handleGenerate = (nextVariation = 0) => {
    const safeBudget = Math.max(5, budget || 5);
    const res = generateOptimalTicket(matches, selectedSports, riskLevel, safeBudget, nextVariation);
    setVariationIndex(nextVariation);
    setGenerated(res);
    setSavedFeedback(false);
    if (res) {
      setCustomStake(res.recommendedStake);
    }
  };

  const handleSave = () => {
    if (!generated) return;
    const stake = Math.max(5, Math.round(customStake || generated.recommendedStake));
    const ticket: Ticket = {
      id: `tkt-${Date.now()}`,
      createdAt: new Date().toISOString(),
      label: `${riskLevel} AI tiket (${generated.legs.length} zápasy)`,
      riskLevel,
      legs: generated.legs,
      totalOdds: generated.totalOdds,
      totalProbability: generated.totalProbability,
      recommendedStake: generated.recommendedStake,
      actualStake: stake,
      potentialWin: Math.round(stake * generated.totalOdds),
      status: 'pending',
      profit: 0,
      source: 'generator',
    };
    onSaveTicket(ticket);
    setSavedFeedback(true);
  };

  const activeStake = Math.max(5, customStake || (generated?.recommendedStake ?? 5));
  const calculatedWin = generated ? Math.round(activeStake * generated.totalOdds) : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-400">
          Algoritmický výběr podle Value skóre, AI pravděpodobnosti a bezpečného bankroll managementu
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
          Generátor optimálního tiketu
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left Configurator Panel */}
        <section className="space-y-5 rounded-2xl border border-slate-800/90 bg-[#111827] p-5 lg:col-span-5">
          {/* Budget Input */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="generator-budget" className="text-sm font-semibold text-slate-100">
                Váš rozpočet (Kč)
              </label>
              <button
                type="button"
                onClick={() => setBudget(Math.max(5, Math.round(currentBankroll)))}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
              >
                Použít bankroll ({formatCZK(currentBankroll)})
              </button>
            </div>
            <input
              id="generator-budget"
              type="number"
              min={5}
              step={5}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              onBlur={() => setBudget((b) => Math.max(5, Math.round(b || 5)))}
              className="mt-2 min-h-[46px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-lg font-bold tabular-nums text-slate-100 focus:border-emerald-500/60 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBudget(preset)}
                  className={`min-h-[34px] rounded-lg border px-2.5 py-1 font-mono text-xs tabular-nums transition-colors ${
                    budget === preset
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-800 bg-[#090D16] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {formatCZK(preset)}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Level Selection */}
          <div className="border-t border-slate-800/80 pt-5">
            <span className="block text-sm font-semibold text-slate-100">Úroveň rizika</span>
            <div className="mt-2.5 space-y-2.5">
              {RISK_LEVELS.map((level) => {
                const profile = RISK_PROFILES[level];
                const active = riskLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setRiskLevel(level)}
                    className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                      active
                        ? 'border-emerald-500/60 bg-emerald-500/10'
                        : 'border-slate-800 bg-[#0B101B] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-display text-sm font-bold ${
                          active ? 'text-emerald-300' : 'text-slate-100'
                        }`}
                      >
                        {profile.label}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-400">
                        {level === 'Konzervativní'
                          ? 'Kurz 2.0–3.0'
                          : level === 'Vyvážený'
                          ? 'Kurz 3.5–6.0'
                          : 'Kurz 8.0+'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{profile.subtitle}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sport Multi-select */}
          <div className="border-t border-slate-800/80 pt-5">
            <span className="block text-sm font-semibold text-slate-100">Zahrnuté sporty</span>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {ALL_SPORTS.map((sport) => {
                const active = selectedSports.includes(sport);
                const count = matches.filter((m) => m.sport === sport).length;
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => toggleSport(sport)}
                    className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                        : 'border-slate-800 bg-[#0B101B] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{sport}</span>
                    <span className="font-mono text-xs tabular-nums opacity-75">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Generate Button */}
          <button
            type="button"
            onClick={() => handleGenerate(0)}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            <Layers className="h-4 w-4 shrink-0" />
            <span>Vygenerovat tiket</span>
          </button>
        </section>

        {/* Right Generated Ticket Result */}
        <section className="space-y-4 lg:col-span-7">
          {!generated ? (
            <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-8 text-center">
              <p className="font-display text-lg font-semibold text-slate-200">
                Nedostatek zápasů pro vybrané sporty
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Zaškrtněte alespoň dva sporty s dostupnými zápasy pro sestavení tiketu.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/40 bg-[#111827] p-5 sm:p-6">
              {/* Ticket Header & Regenerate */}
              <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="font-semibold">Optimální AI návrh · {riskLevel}</span>
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold text-slate-50">
                    Sestavený tiket ({generated.legs.length} příležitostí)
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => handleGenerate(variationIndex + 1)}
                  className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Jiná kombinace</span>
                </button>
              </div>

              {/* 4 Key Ticket KPIs */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5">
                  <span className="block text-xs text-slate-400">Celkový kurz</span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums text-emerald-400">
                    {formatOdds(generated.totalOdds)}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5">
                  <span className="block text-xs text-slate-400">Pravděpodobnost</span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums text-slate-100">
                    {formatPercent(generated.totalProbability)}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5">
                  <span className="block text-xs text-slate-400">Doporučený vklad</span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums text-slate-100">
                    {formatCZK(generated.recommendedStake)}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5">
                  <span className="block text-xs text-slate-400">Potenciální výhra</span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums text-emerald-300">
                    {formatCZK(calculatedWin)}
                  </span>
                </div>
              </div>

              {/* Bankroll Safety Note */}
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-slate-800/80 bg-[#090D16] px-3.5 py-2.5 text-xs text-slate-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  {generated.note} Bezpečný vklad tvoří{' '}
                  <strong className="font-mono tabular-nums text-slate-100">
                    {((generated.recommendedStake / Math.max(1, budget)) * 100).toFixed(1)} %
                  </strong>{' '}
                  zadaného rozpočtu.
                </span>
              </div>

              {/* Legs List */}
              <div className="mt-5 divide-y divide-slate-800/80 rounded-xl border border-slate-800/80 bg-[#0B101B]">
                {generated.legs.map((leg, idx) => (
                  <div
                    key={leg.matchId}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono text-slate-500">#{idx + 1}</span>
                        <span>{leg.sport}</span>
                        <span aria-hidden="true">·</span>
                        <span>{leg.league}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{leg.kickoffTime}</span>
                      </div>
                      <p className="font-display text-sm font-bold text-slate-100 sm:text-base">
                        {leg.homeTeam} vs. {leg.awayTeam}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="font-semibold text-emerald-300">{leg.recommendedPick}</span>
                        <span className="font-mono tabular-nums text-slate-400">
                          AI: {formatPercent(leg.aiProbability)}
                        </span>
                        <span
                          className={`font-mono tabular-nums ${
                            leg.valueScore > 0 ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          Value {formatPercent(leg.valueScore, true)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end shrink-0">
                      <div className="text-left sm:text-right">
                        <span className="block text-[11px] text-slate-400">Betano kurz</span>
                        <span className="font-mono text-base font-bold tabular-nums text-slate-100">
                          {formatOdds(leg.betanoOdds)}
                        </span>
                      </div>

                      <a
                        href={BETANO_HOME_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onOpenBetano(leg.homeTeam, leg.awayTeam)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white whitespace-nowrap shrink-0"
                      >
                        <span>Otevřít na Betanu</span>
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stake Adjustment & 1-Click Save to Bankroll */}
              <div className="mt-5 flex flex-col gap-3 border-t border-slate-800/80 pt-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:w-48">
                  <label htmlFor="actual-stake-input" className="block text-xs font-medium text-slate-400">
                    Vklad pro uložení (Kč)
                  </label>
                  <input
                    id="actual-stake-input"
                    type="number"
                    min={5}
                    step={5}
                    value={customStake}
                    onChange={(e) => {
                      setCustomStake(Number(e.target.value));
                      setSavedFeedback(false);
                    }}
                    onBlur={() => setCustomStake((s) => Math.max(5, Math.round(s || 5)))}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-base font-bold tabular-nums text-slate-100 focus:border-emerald-500/60 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={savedFeedback}
                  className={`inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-colors whitespace-nowrap ${
                    savedFeedback
                      ? 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  }`}
                >
                  {savedFeedback ? (
                    <>
                      <Check className="h-4 w-4 shrink-0" />
                      <span>Uloženo do Bankrollu</span>
                    </>
                  ) : (
                    <>
                      <BookmarkCheck className="h-4 w-4 shrink-0" />
                      <span>Uložit tiket do Bankrollu</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
