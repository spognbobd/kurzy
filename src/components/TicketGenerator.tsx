import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  Check,
  ExternalLink,
  Flame,
  Layers,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  EstimatedRiskBadge,
  MatchAnalysis,
  RiskLevel,
  SportCategory,
  Ticket,
  TicketStyle,
} from '../types/betting';
import {
  BETANO_HOME_URL,
  formatCZK,
  formatOdds,
  formatPercent,
  generateOptimalTicket,
} from '../utils/analyticsEngine';

interface TicketGeneratorProps {
  matches: MatchAnalysis[];
  currentBankroll: number;
  onSaveTicket: (ticket: Ticket) => void;
  onOpenBetano: (homeTeam: string, awayTeam: string, recommendedPick?: string) => void;
  onOpenCustomMatchModal: () => void;
  onDeleteCustomMatch: (matchId: string) => void;
}

const ALL_SPORTS: SportCategory[] = [
  'Fotbal',
  'Hokej',
  'Tenis',
  'MMA',
  'Basketbal',
  'Ping-pong',
  'Šipky',
  'Ostatní',
];
const BUDGET_PRESETS = [5, 50, 200, 1000, 5000];

const TICKET_MODES: {
  id: TicketStyle;
  title: string;
  legsLabel: string;
  stakeHint: string;
  description: string;
  riskLabel: RiskLevel;
  icon: typeof ShieldCheck;
}[] = [
  {
    id: 'safe',
    title: 'Jistota (Konzervativní)',
    legsLabel: '1–2 zápasy',
    stakeHint: 'Vklad cca 10 % (min. 10 Kč)',
    description:
      'Vybere 1 až 2 zápasy s nejvyšší pravděpodobností výhry a nejnižším rizikem prohry.',
    riskLabel: 'Konzervativní',
    icon: ShieldCheck,
  },
  {
    id: 'smart_value',
    title: 'Vyvážený (Smart Value)',
    legsLabel: '2–3 zápasy',
    stakeHint: 'Vklad cca 7 % (min. 10 Kč)',
    description:
      'Kombinuje dobrou pravděpodobnost nad zvolený limit s kladnou hodnotou kurzu (+EV).',
    riskLabel: 'Vyvážený',
    icon: TrendingUp,
  },
  {
    id: 'bold',
    title: 'Odvážný (Vyšší kurz)',
    legsLabel: '3–4 zápasy',
    stakeHint: 'Vklad cca 5 % (min. 5 Kč)',
    description:
      'Vybere 3 až 4 zápasy s nejvyšším celkovým kurzem a nejvyšší odchylkou Value %.',
    riskLabel: 'Odvážný',
    icon: Flame,
  },
];

const RISK_BADGE_STYLES: Record<EstimatedRiskBadge, { container: string; text: string; dot: string }> = {
  Nízké: {
    container: 'border-emerald-500/40 bg-emerald-500/10',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
  },
  Střední: {
    container: 'border-amber-500/40 bg-amber-500/10',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
  },
  Vyšší: {
    container: 'border-rose-500/40 bg-rose-500/10',
    text: 'text-rose-300',
    dot: 'bg-rose-400',
  },
};

export const TicketGenerator: React.FC<TicketGeneratorProps> = ({
  matches,
  currentBankroll,
  onSaveTicket,
  onOpenBetano,
  onOpenCustomMatchModal,
  onDeleteCustomMatch,
}) => {
  const recommendedMinProb = useMemo(() => {
    if (matches.length === 0) return 55;
    const sorted = [...matches].sort((a, b) => b.aiProbability - a.aiProbability);
    const refIndex = Math.min(2, sorted.length - 1);
    const refProb = sorted[refIndex].aiProbability;
    if (refProb < 55) {
      return Math.max(25, Math.min(85, Math.floor(refProb)));
    }
    return 55;
  }, [matches]);

  const matchesSignature = useMemo(
    () => matches.map((m) => `${m.id}:${m.aiProbability}`).join('|'),
    [matches]
  );

  const [budget, setBudget] = useState<number>(Math.max(5, Math.round(currentBankroll)));
  const [ticketStyle, setTicketStyle] = useState<TicketStyle>('safe');
  const [minMatchProbability, setMinMatchProbability] = useState<number>(() => recommendedMinProb);
  const [selectedSports, setSelectedSports] = useState<SportCategory[]>(ALL_SPORTS);
  const [variationIndex, setVariationIndex] = useState(0);
  const [customStake, setCustomStake] = useState<number>(5);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    setMinMatchProbability(recommendedMinProb);
    setVariationIndex(0);
    setSavedFeedback(false);
  }, [matchesSignature, recommendedMinProb]);

  const safeBudget = Math.max(5, Math.round(budget || 5));

  const generated = useMemo(
    () =>
      generateOptimalTicket(matches, selectedSports, ticketStyle, safeBudget, variationIndex, {
        minMatchProbability,
      }),
    [matches, selectedSports, ticketStyle, safeBudget, variationIndex, minMatchProbability]
  );

  useEffect(() => {
    if (generated) {
      setCustomStake(generated.recommendedStake);
    }
  }, [generated]);

  const eligibleMatchesCount = useMemo(
    () =>
      matches.filter(
        (m) => selectedSports.includes(m.sport) && m.aiProbability >= minMatchProbability
      ).length,
    [matches, selectedSports, minMatchProbability]
  );

  const toggleSport = (sport: SportCategory) => {
    setSelectedSports((prev) => {
      if (prev.includes(sport)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== sport);
      }
      return [...prev, sport];
    });
    setVariationIndex(0);
    setSavedFeedback(false);
  };

  const handleSelectStyle = (nextStyle: TicketStyle) => {
    setTicketStyle(nextStyle);
    setVariationIndex(0);
    setSavedFeedback(false);
  };

  const handleGenerateClick = () => {
    const normalizedBudget = Math.max(5, Math.round(budget || 5));
    setBudget(normalizedBudget);
    setVariationIndex(0);
    setSavedFeedback(false);
    const fresh = generateOptimalTicket(matches, selectedSports, ticketStyle, normalizedBudget, 0, {
      minMatchProbability,
    });
    if (fresh) {
      setCustomStake(fresh.recommendedStake);
    }
  };

  const handleNextVariation = () => {
    setVariationIndex((prev) => prev + 1);
    setSavedFeedback(false);
  };

  const handleSave = () => {
    if (!generated) return;
    const stake = Math.max(5, Math.round(customStake || generated.recommendedStake));
    const activeMode = TICKET_MODES.find((m) => m.id === generated.style) ?? TICKET_MODES[0];
    const ticket: Ticket = {
      id: `tkt-${Date.now()}`,
      createdAt: new Date().toISOString(),
      label: `${activeMode.title} (${generated.legs.length} ${
        generated.legs.length === 1 ? 'zápas' : generated.legs.length <= 4 ? 'zápasy' : 'zápasů'
      })`,
      riskLevel: activeMode.riskLabel,
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

  const activeMode = TICKET_MODES.find((m) => m.id === ticketStyle) ?? TICKET_MODES[0];
  const activeStake = Math.max(5, Math.round(customStake || (generated?.recommendedStake ?? 5)));
  const calculatedWin = generated ? Math.round(activeStake * generated.totalOdds) : 0;
  const isLowProbCapped = ticketStyle === 'smart_value' && minMatchProbability < 45;
  const riskBadgeStyle = generated ? RISK_BADGE_STYLES[generated.estimatedRisk] : null;
  const customMatches = useMemo(() => matches.filter((m) => m.isCustom), [matches]);
  const comboIndexLabel =
    generated && generated.availableCombosCount > 1
      ? ` (${(variationIndex % generated.availableCombosCount) + 1}/${generated.availableCombosCount})`
      : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-400">
            Optimalizace tiketu pro minimální riziko prohry a matematickou výhodu (Value Bet)
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
            Generátor optimálního tiketu
          </h1>
        </div>

        <button
          type="button"
          onClick={onOpenCustomMatchModal}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <PlusCircle className="h-4 w-4 shrink-0" />
          <span>+ Vlastní zápas (Ping-pong / ostatní)</span>
        </button>
      </div>

      {/* Unified 3-Card Mode Selector (3 karty vedle sebe) */}
      <section aria-label="Výběr stylu tiketu" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {TICKET_MODES.map((mode) => {
          const Icon = mode.icon;
          const active = ticketStyle === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleSelectStyle(mode.id)}
              aria-pressed={active}
              className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
                active
                  ? 'border-emerald-500/70 bg-emerald-500/12 shadow-lg shadow-emerald-950/20'
                  : 'border-slate-800/90 bg-[#111827] hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-2 font-display text-sm font-bold ${
                      active ? 'text-emerald-300' : 'text-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{mode.title}</span>
                  </span>
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-300">
                    {mode.legsLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{mode.description}</p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-[11px]">
                <span className="font-mono font-medium tabular-nums text-slate-300">
                  {mode.stakeHint}
                </span>
                {active && <span className="font-semibold text-emerald-400">Aktivní režim</span>}
              </div>
            </button>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left Configurator Panel */}
        <section className="space-y-5 rounded-2xl border border-slate-800/90 bg-[#111827] p-5 lg:col-span-5">
          {/* Minimum Match Probability Slider */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="min-prob-slider"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100"
              >
                <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
                <span>Minimální pravděpodobnost zápasu</span>
              </label>
              <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-sm font-bold tabular-nums text-emerald-300">
                {minMatchProbability} %
              </span>
            </div>

            <input
              id="min-prob-slider"
              type="range"
              min={25}
              max={85}
              step={1}
              value={minMatchProbability}
              onChange={(e) => {
                setMinMatchProbability(Number(e.target.value));
                setVariationIndex(0);
                setSavedFeedback(false);
              }}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-400"
            />

            <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-slate-500">
              <span>25 %</span>
              <span className={minMatchProbability < 45 ? 'text-amber-400' : ''}>45 %</span>
              <button
                type="button"
                onClick={() => {
                  setMinMatchProbability(recommendedMinProb);
                  setVariationIndex(0);
                  setSavedFeedback(false);
                }}
                className={`transition-colors hover:text-emerald-300 ${
                  minMatchProbability === recommendedMinProb
                    ? 'text-emerald-400 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                Auto: {recommendedMinProb} % (min. 3 zápasy)
              </button>
              <span>85 %</span>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
              <span>Zápasy splňující limit:</span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  eligibleMatchesCount > 0 ? 'text-emerald-300' : 'text-rose-400'
                }`}
              >
                {eligibleMatchesCount} z {matches.filter((m) => selectedSports.includes(m.sport)).length}
              </span>
            </div>

            {isLowProbCapped && (
              <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>
                  Limit je pod 45 %: režim Vyvážený automaticky omezuje počet zápasů na max. 1–2 (sólo/double).
                </span>
              </div>
            )}
          </div>

          {/* Budget Input */}
          <div className="border-t border-slate-800/80 pt-5">
            <div className="flex items-center justify-between">
              <label htmlFor="generator-budget" className="text-sm font-semibold text-slate-100">
                Váš rozpočet (Kč)
              </label>
              <button
                type="button"
                onClick={() => {
                  setBudget(Math.max(5, Math.round(currentBankroll)));
                  setSavedFeedback(false);
                }}
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
              onChange={(e) => {
                setBudget(Number(e.target.value));
                setSavedFeedback(false);
              }}
              onBlur={() => setBudget((b) => Math.max(5, Math.round(b || 5)))}
              className="mt-2 min-h-[46px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-lg font-bold tabular-nums text-slate-100 focus:border-emerald-500/60 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setBudget(preset);
                    setSavedFeedback(false);
                  }}
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

          {/* Sport Multi-select */}
          <div className="border-t border-slate-800/80 pt-5">
            <span className="block text-sm font-semibold text-slate-100">Zahrnuté sporty</span>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {ALL_SPORTS.map((sport) => {
                const active = selectedSports.includes(sport);
                const count = matches.filter(
                  (m) => m.sport === sport && m.aiProbability >= minMatchProbability
                ).length;
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
            onClick={handleGenerateClick}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            <Layers className="h-4 w-4 shrink-0" />
            <span>Vygenerovat tiket</span>
          </button>

          {customMatches.length > 0 && (
            <div className="border-t border-slate-800/80 pt-4 space-y-2">
              <span className="block text-xs font-semibold text-slate-300">
                Uložené vlastní zápasy ({customMatches.length})
              </span>
              <div className="space-y-1.5">
                {customMatches.map((cm) => (
                  <div
                    key={cm.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#0B101B] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-200">
                        {cm.homeTeam} vs. {cm.awayTeam}
                      </p>
                      <p className="font-mono text-[11px] tabular-nums text-slate-400">
                        {cm.sport} · Kurz {formatOdds(cm.odds.betano)} · {formatPercent(cm.aiProbability)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteCustomMatch(cm.id)}
                      aria-label={`Smazat vlastní zápas ${cm.homeTeam} vs. ${cm.awayTeam}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#090D16] text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Generated Ticket Result */}
        <section className="space-y-4 lg:col-span-7">
          {!generated ? (
            <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-8 text-center">
              <p className="font-display text-lg font-semibold text-slate-200">
                Žádný zápas nesplňuje minimální pravděpodobnost {minMatchProbability} %
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Snižte posuvník minimální pravděpodobnosti nebo zapněte více sportů pro sestavení tiketu.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMinMatchProbability(recommendedMinProb);
                    setVariationIndex(0);
                  }}
                  className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Nastavit doporučený limit ({recommendedMinProb} %)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSports(ALL_SPORTS);
                    setVariationIndex(0);
                  }}
                  className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Vybrat všechny sporty
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/40 bg-[#111827] p-5 sm:p-6">
              {/* Ticket Header & Regenerate */}
              <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="font-semibold">{activeMode.title}</span>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-slate-400">
                      Limit ≥ {generated.minMatchProbability} %
                    </span>
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold text-slate-50">
                    Sestavený tiket ({generated.legs.length}{' '}
                    {generated.legs.length === 1
                      ? 'zápas'
                      : generated.legs.length <= 4
                      ? 'zápasy'
                      : 'zápasů'}
                    )
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {riskBadgeStyle && (
                    <div
                      className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${riskBadgeStyle.container} ${riskBadgeStyle.text}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${riskBadgeStyle.dot}`} />
                      <span>Riziko: {generated.estimatedRisk}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleNextVariation}
                    disabled={generated.availableCombosCount <= 1}
                    title={
                      generated.availableCombosCount <= 1
                        ? 'Pro tento filtr není dostupná jiná kombinace'
                        : 'Vybrat jinou kombinaci zápasů'
                    }
                    className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Jiná kombinace{comboIndexLabel}</span>
                  </button>
                </div>
              </div>

              {/* Key Ticket KPIs */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5">
                  <span className="block text-[11px] text-slate-400">Celková šance na výhru</span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums text-slate-50">
                    {formatPercent(generated.totalProbability)}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5">
                  <span className="block text-[11px] text-slate-400">Celkový kurz</span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums text-emerald-400">
                    {formatOdds(generated.totalOdds)}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5">
                  <span className="block text-[11px] text-slate-400">Úroveň rizika</span>
                  <span
                    className={`mt-1 block font-display text-lg font-bold ${
                      riskBadgeStyle ? riskBadgeStyle.text : 'text-slate-100'
                    }`}
                  >
                    {generated.estimatedRisk}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5">
                  <span className="block text-[11px] text-slate-400">Doporučený vklad</span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums text-slate-100">
                    {formatCZK(generated.recommendedStake)}
                  </span>
                </div>

                <div className="col-span-2 rounded-xl border border-slate-800/80 bg-[#0B101B] p-3.5 sm:col-span-1">
                  <span className="block text-[11px] text-slate-400">Potenciální výhra</span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums text-emerald-300">
                    {formatCZK(calculatedWin)}
                  </span>
                </div>
              </div>

              {/* Probability Product & Bankroll Safety Note */}
              <div className="mt-3 space-y-2 rounded-xl border border-slate-800/80 bg-[#090D16] px-3.5 py-2.5 text-xs text-slate-300">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    {generated.note} Doporučený vklad tvoří{' '}
                    <strong className="font-mono tabular-nums text-slate-100">
                      {((generated.recommendedStake / safeBudget) * 100).toFixed(1)} %
                    </strong>{' '}
                    rozpočtu.
                  </span>
                </div>
                <div className="border-t border-slate-800/70 pt-2 font-mono text-[11px] tabular-nums text-slate-400">
                  Výpočet šance tiketu (součin):{' '}
                  {generated.legs.map((l) => formatPercent(l.aiProbability)).join(' × ')} ={' '}
                  <span className="font-semibold text-slate-200">
                    {formatPercent(generated.totalProbability)}
                  </span>
                </div>
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
                        <span className="font-mono tabular-nums text-slate-300">
                          Šance: {formatPercent(leg.aiProbability)}
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
                        onClick={() => onOpenBetano(leg.homeTeam, leg.awayTeam, leg.recommendedPick)}
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
