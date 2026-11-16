import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Flame,
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
  parseAmountInput,
  sanitizeIntegerInput,
} from '../utils/analyticsEngine';
import {
  fetchSingleMatchReasoning,
  loadCachedMatchReasons,
  saveCachedMatchReasons,
} from '../services/geminiReasoningService';

interface TicketGeneratorProps {
  matches: MatchAnalysis[];
  currentBankroll: number;
  geminiApiKey: string;
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

const LEG_COUNT_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Auto' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

const TICKET_MODES: {
  id: TicketStyle;
  shortTitle: string;
  title: string;
  summary: string;
  riskLabel: RiskLevel;
  icon: typeof ShieldCheck;
}[] = [
  {
    id: 'safe',
    shortTitle: 'Jistota',
    title: 'Jistota (Konzervativní)',
    summary: '1–2 nejbezpečnější zápasy · doporučený vklad cca 10 % (min. 10 Kč)',
    riskLabel: 'Konzervativní',
    icon: ShieldCheck,
  },
  {
    id: 'smart_value',
    shortTitle: 'Vyvážený',
    title: 'Vyvážený (Smart Value)',
    summary: '2–3 zápasy s dobrou šancí a +EV · vklad cca 7 % (min. 10 Kč)',
    riskLabel: 'Vyvážený',
    icon: TrendingUp,
  },
  {
    id: 'bold',
    shortTitle: 'Odvážný',
    title: 'Odvážný (Vyšší kurz)',
    summary: '3–4 zápasy s nejvyšším kurzem a Value % · vklad cca 5 % (min. 5 Kč)',
    riskLabel: 'Odvážný',
    icon: Flame,
  },
];

const RISK_TEXT_STYLES: Record<EstimatedRiskBadge, string> = {
  Nízké: 'font-semibold text-emerald-300',
  Střední: 'font-semibold text-amber-300',
  Vyšší: 'font-semibold text-rose-300',
};

function renderFormattedGeminiReasoning(text: string) {
  const paragraphs = text
    .replace(/\*\*/g, '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-300">
      {paragraphs.map((para, idx) => {
        const colonIdx = para.indexOf(':');
        const hasKnownPrefix =
          colonIdx > 0 &&
          /^(Aktuální forma|Síla soupeře|Kurzy a trh|Implikovaná vs\. reálná šance|Verdikt k tiketu)/i.test(
            para.slice(0, colonIdx)
          );

        if (!hasKnownPrefix) {
          return <p key={idx}>{para}</p>;
        }

        const label = para.slice(0, colonIdx + 1);
        const body = para.slice(colonIdx + 1).trim();
        const isVerdict = /^Verdikt k tiketu/i.test(label);

        return (
          <p key={idx}>
            <span className={`font-semibold ${isVerdict ? 'text-emerald-300' : 'text-slate-100'}`}>
              {label}
            </span>{' '}
            <span>{body}</span>
          </p>
        );
      })}
    </div>
  );
}

export const TicketGenerator: React.FC<TicketGeneratorProps> = ({
  matches,
  currentBankroll,
  geminiApiKey,
  onSaveTicket,
  onOpenBetano,
  onOpenCustomMatchModal,
  onDeleteCustomMatch,
}) => {
  const recommendedMinProb = useMemo(() => {
    const validValueMatches = matches.filter((m) => m.valueScore >= 0);
    if (validValueMatches.length === 0) return 55;
    const sorted = [...validValueMatches].sort((a, b) => b.aiProbability - a.aiProbability);
    const refIndex = Math.min(2, sorted.length - 1);
    const refProb = sorted[refIndex].aiProbability;
    if (refProb < 55) {
      return Math.max(25, Math.min(85, Math.floor(refProb)));
    }
    return 55;
  }, [matches]);

  const matchesSignature = useMemo(
    () => matches.map((m) => `${m.id}:${m.aiProbability}:${m.valueScore}`).join('|'),
    [matches]
  );

  const [budgetInput, setBudgetInput] = useState<string>(() =>
    String(Math.max(5, Math.round(currentBankroll)))
  );
  const [ticketStyle, setTicketStyle] = useState<TicketStyle>('safe');
  const [exactLegsCount, setExactLegsCount] = useState<number | null>(null);
  const [minMatchProbability, setMinMatchProbability] = useState<number>(() => recommendedMinProb);
  const [selectedSports, setSelectedSports] = useState<SportCategory[]>(ALL_SPORTS);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [variationIndex, setVariationIndex] = useState(0);
  const [customStakeInput, setCustomStakeInput] = useState<string>('5');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [aiReasons, setAiReasons] = useState<Record<string, string>>(() => loadCachedMatchReasons());
  const [aiModels, setAiModels] = useState<Record<string, string>>({});
  const [statFallbackReasons, setStatFallbackReasons] = useState<
    Record<string, { text: string; apiStatus?: string }>
  >({});
  const [expandedMatchIds, setExpandedMatchIds] = useState<Record<string, boolean>>({});
  const [loadingMatchIds, setLoadingMatchIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMinMatchProbability(recommendedMinProb);
    setVariationIndex(0);
    setSavedFeedback(false);
  }, [matchesSignature, recommendedMinProb]);

  const trimmedGeminiKey = geminiApiKey.trim();

  useEffect(() => {
    setStatFallbackReasons({});
  }, [trimmedGeminiKey]);

  const safeBudget = parseAmountInput(budgetInput, currentBankroll, 5);

  const generated = useMemo(
    () =>
      generateOptimalTicket(matches, selectedSports, ticketStyle, safeBudget, variationIndex, {
        minMatchProbability,
        exactLegsCount,
      }),
    [
      matches,
      selectedSports,
      ticketStyle,
      safeBudget,
      variationIndex,
      minMatchProbability,
      exactLegsCount,
    ]
  );

  useEffect(() => {
    if (generated) {
      setCustomStakeInput(String(generated.recommendedStake));
    }
  }, [generated]);

  const { availableSports, sportCounts } = useMemo(() => {
    const counts = new Map<SportCategory, { totalNonNeg: number; eligible: number }>();
    for (const s of ALL_SPORTS) {
      counts.set(s, { totalNonNeg: 0, eligible: 0 });
    }
    for (const m of matches) {
      if (m.valueScore < 0) continue;
      const entry = counts.get(m.sport);
      if (!entry) continue;
      entry.totalNonNeg += 1;
      if (m.aiProbability >= minMatchProbability) {
        entry.eligible += 1;
      }
    }

    const withMatches = ALL_SPORTS.filter((s) => (counts.get(s)?.totalNonNeg ?? 0) > 0);
    return { availableSports: withMatches, sportCounts: counts };
  }, [matches, minMatchProbability]);

  const handleOpenOrFetchAnalysis = async (leg: Ticket['legs'][number]) => {
    if (loadingMatchIds[leg.matchId]) return;

    const cachedText = aiReasons[leg.matchId] ?? statFallbackReasons[leg.matchId]?.text;
    if (cachedText) {
      setExpandedMatchIds((prev) => ({ ...prev, [leg.matchId]: true }));
      return;
    }

    setLoadingMatchIds((prev) => ({ ...prev, [leg.matchId]: true }));

    try {
      const result = await fetchSingleMatchReasoning(leg, trimmedGeminiKey);
      if (result.source === 'gemini') {
        setAiReasons((prev) => {
          const next = { ...prev, [leg.matchId]: result.text };
          saveCachedMatchReasons(next);
          return next;
        });
        if (result.modelUsed) {
          setAiModels((prev) => ({ ...prev, [leg.matchId]: result.modelUsed! }));
        }
      } else {
        setStatFallbackReasons((prev) => ({
          ...prev,
          [leg.matchId]: { text: result.text, apiStatus: result.apiStatus },
        }));
      }
      setExpandedMatchIds((prev) => ({ ...prev, [leg.matchId]: true }));
    } finally {
      setLoadingMatchIds((prev) => {
        const next = { ...prev };
        delete next[leg.matchId];
        return next;
      });
    }
  };

  const handleCollapseAnalysis = (matchId: string) => {
    setExpandedMatchIds((prev) => ({ ...prev, [matchId]: false }));
  };

  const eligibleMatchesCount = useMemo(
    () =>
      matches.filter(
        (m) =>
          selectedSports.includes(m.sport) &&
          m.aiProbability >= minMatchProbability &&
          m.valueScore >= 0
      ).length,
    [matches, selectedSports, minMatchProbability]
  );

  const nonNegativeSportMatchesCount = useMemo(
    () => matches.filter((m) => selectedSports.includes(m.sport) && m.valueScore >= 0).length,
    [matches, selectedSports]
  );

  const toggleSport = (sport: SportCategory) => {
    setSelectedSports((prev) => {
      if (prev.includes(sport)) {
        const activeAvailableCount = prev.filter((s) => availableSports.includes(s)).length;
        if (activeAvailableCount <= 1) return prev;
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

  const handleSelectLegsCount = (count: number | null) => {
    setExactLegsCount(count);
    setVariationIndex(0);
    setSavedFeedback(false);
  };

  const handlePrevVariation = () => {
    if (!generated || generated.availableCombosCount <= 1) return;
    const count = generated.availableCombosCount;
    setVariationIndex((prev) => (prev - 1 + count) % count);
    setSavedFeedback(false);
  };

  const handleNextVariation = () => {
    if (!generated || generated.availableCombosCount <= 1) return;
    const count = generated.availableCombosCount;
    setVariationIndex((prev) => (prev + 1) % count);
    setSavedFeedback(false);
  };

  const handleSave = () => {
    if (!generated) return;
    const stake = parseAmountInput(customStakeInput, generated.recommendedStake, 5);
    setCustomStakeInput(String(stake));
    const activeMode = TICKET_MODES.find((m) => m.id === generated.style) ?? TICKET_MODES[0];
    const ticket: Ticket = {
      id: `tkt-${Date.now()}`,
      createdAt: new Date().toISOString(),
      label: `${activeMode.title} (${generated.legs.length} ${
        generated.legs.length === 1 ? 'zápas' : generated.legs.length <= 4 ? 'zápasy' : 'zápasů'
      })`,
      riskLevel: activeMode.riskLabel,
      legs: generated.legs.map((leg) => ({
        ...leg,
        reasoning:
          aiReasons[leg.matchId] ?? statFallbackReasons[leg.matchId]?.text ?? leg.reasoning,
      })),
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
  const parsedCustomStake = Number(customStakeInput);
  const activeStake =
    customStakeInput === '' || !Number.isFinite(parsedCustomStake)
      ? 0
      : Math.round(parsedCustomStake);
  const calculatedWin = generated ? Math.round(activeStake * generated.totalOdds) : 0;
  const isLowProbCapped =
    exactLegsCount === null && ticketStyle === 'smart_value' && minMatchProbability < 45;
  const riskTextClass = generated ? RISK_TEXT_STYLES[generated.estimatedRisk] : '';
  const customMatches = useMemo(() => matches.filter((m) => m.isCustom), [matches]);
  const currentComboPosition =
    generated && generated.availableCombosCount > 1
      ? (variationIndex % generated.availableCombosCount) + 1
      : 1;

  const legsSummaryLabel =
    exactLegsCount === null
      ? 'Auto'
      : exactLegsCount === 1
      ? '1 zápas'
      : `${exactLegsCount} zápasy`;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
            Generátor tiketu
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Živý automatický přepočet strategie, počtu zápasů a Value filtrů
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCustomMatchModal}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <PlusCircle className="h-4 w-4 shrink-0" />
          <span>Vlastní zápas</span>
        </button>
      </div>

      <div
        className={
          filtersCollapsed
            ? 'grid grid-cols-1 gap-4'
            : 'grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5'
        }
      >
        {/* Collapsible Unified Strategy + Filters Card */}
        <section
          aria-label="Nastavení tiketu a filtrů"
          className={`rounded-2xl border border-slate-800/90 bg-[#111827] ${
            filtersCollapsed ? 'px-4 py-2.5' : 'space-y-4 p-4 sm:p-5 lg:col-span-5'
          }`}
        >
          <button
            type="button"
            onClick={() => setFiltersCollapsed((prev) => !prev)}
            aria-expanded={!filtersCollapsed}
            className="flex min-h-[40px] w-full items-center justify-between gap-3 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="truncate font-mono text-xs font-semibold tabular-nums text-slate-200">
                Filtry: {activeMode.shortTitle} · {legsSummaryLabel} · Min. {minMatchProbability} %
              </span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-800 bg-[#090D16] px-2.5 py-1 text-[11px] font-medium text-slate-300">
              <span>{filtersCollapsed ? 'Rozbalit' : 'Sbalit'}</span>
              {filtersCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </span>
          </button>

          {!filtersCollapsed && (
            <div className="space-y-4 border-t border-slate-800/80 pt-3.5">
          {/* 1. Compact Horizontal Strategy Switcher */}
          <div>
            <span className="block text-xs font-semibold text-slate-300">Strategie tiketu</span>
            <div
              role="group"
              aria-label="Výběr strategie tiketu"
              className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-[#090D16] p-1"
            >
              {TICKET_MODES.map((mode) => {
                const Icon = mode.icon;
                const active = ticketStyle === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleSelectStyle(mode.id)}
                    aria-pressed={active}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{mode.shortTitle}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{activeMode.summary}</p>
          </div>

          {/* 2. Exact Leg Count Selector */}
          <div className="border-t border-slate-800/80 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-300">Počet zápasů na tiket</span>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                {exactLegsCount === null ? 'Dle strategie' : `Přesně ${exactLegsCount}`}
              </span>
            </div>
            <div
              role="group"
              aria-label="Počet zápasů na tiket"
              className="mt-1.5 grid grid-cols-5 gap-1.5"
            >
              {LEG_COUNT_OPTIONS.map((opt) => {
                const active = exactLegsCount === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleSelectLegsCount(opt.value)}
                    aria-pressed={active}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border font-mono text-xs font-semibold tabular-nums transition-colors whitespace-nowrap ${
                      active
                        ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-800 bg-[#090D16] text-slate-300 hover:border-slate-700 hover:text-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3A. Minimum Match Probability Slider */}
          <div className="border-t border-slate-800/80 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="min-prob-slider"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
                <span>Minimální pravděpodobnost (%)</span>
              </label>
              <span className="font-mono text-sm font-bold tabular-nums text-emerald-300">
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
              className="mt-2.5 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-400"
            />

            <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-slate-500">
              <span>25 %</span>
              <button
                type="button"
                onClick={() => {
                  setMinMatchProbability(recommendedMinProb);
                  setVariationIndex(0);
                  setSavedFeedback(false);
                }}
                className={`transition-colors hover:text-emerald-300 ${
                  minMatchProbability === recommendedMinProb
                    ? 'font-semibold text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                Auto {recommendedMinProb} %
              </button>
              <span
                className={`font-semibold ${
                  eligibleMatchesCount > 0 ? 'text-slate-300' : 'text-rose-400'
                }`}
              >
                {eligibleMatchesCount}/{nonNegativeSportMatchesCount} zápasů
              </span>
              <span>85 %</span>
            </div>

            {isLowProbCapped && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>
                  Limit pod 45 %: režim Vyvážený v režimu Auto omezuje tiket na max. 1–2 zápasy.
                </span>
              </div>
            )}
          </div>

          {/* 3B. Compact Single-Row Budget + Bankroll Button */}
          <div className="border-t border-slate-800/80 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="generator-budget" className="text-xs font-semibold text-slate-300">
                Rozpočet (Kč)
              </label>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                Bankroll: {formatCZK(currentBankroll)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="generator-budget"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={budgetInput}
                onChange={(e) => {
                  setBudgetInput(sanitizeIntegerInput(e.target.value));
                  setSavedFeedback(false);
                }}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-base font-bold tabular-nums text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setBudgetInput(String(Math.max(5, Math.round(currentBankroll))));
                  setSavedFeedback(false);
                }}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-[#090D16] px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-slate-800/70 whitespace-nowrap"
              >
                Použít bankroll
              </button>
            </div>
          </div>

          {/* 3C. Available Sports Filter (strictly sports with >= 1 match) */}
          <div className="border-t border-slate-800/80 pt-3.5">
            <span className="block text-xs font-semibold text-slate-300">Zahrnuté sporty</span>

            {availableSports.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                Momentálně nejsou dostupné žádné zápasy pro generování tiketu.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {availableSports.map((sport) => {
                  const active = selectedSports.includes(sport);
                  const count = sportCounts.get(sport)?.eligible ?? 0;
                  return (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => toggleSport(sport)}
                      className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                          : 'border-slate-800 bg-[#0B101B] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="truncate">{sport}</span>
                      <span className="font-mono text-[11px] tabular-nums opacity-80">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {customMatches.length > 0 && (
            <div className="space-y-2 border-t border-slate-800/80 pt-3.5">
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
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#090D16] text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
            </div>
          )}
        </section>

        {/* Right Generated Ticket Result */}
        <section className={filtersCollapsed ? 'space-y-4' : 'space-y-4 lg:col-span-7'}>
          {!generated ? (
            <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-6 text-center sm:p-8">
              <p className="font-display text-lg font-semibold text-slate-200">
                {nonNegativeSportMatchesCount === 0
                  ? 'Žádný zápas ve vybraných sportech nemá nezáporné Value (≥ 0,0 %)'
                  : `Žádný zápas s nezáporným Value (≥ 0,0 %) nesplňuje limit ${minMatchProbability} %`}
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                {nonNegativeSportMatchesCount === 0
                  ? 'Zápasy se záporným Value (pod 0,0 %) generátor nezařazuje. Zapněte více sportů, aktualizujte kurzy nebo přidejte vlastní zápas.'
                  : 'Snižte posuvník minimální pravděpodobnosti nebo zapněte více sportů pro sestavení tiketu.'}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMinMatchProbability(recommendedMinProb);
                    setVariationIndex(0);
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Doporučený limit ({recommendedMinProb} %)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSports(ALL_SPORTS);
                    setVariationIndex(0);
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Vybrat všechny sporty
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/40 bg-[#111827] p-4 sm:p-5">
              {/* Ticket Header & Combination Stepper */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800/80 pb-3.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-semibold text-emerald-400">{activeMode.shortTitle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Limit ≥ {generated.minMatchProbability} %
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={riskTextClass}>
                      Riziko: {generated.estimatedRisk}
                    </span>
                  </div>
                  <h2 className="mt-1 font-display text-lg font-bold text-slate-50 sm:text-xl">
                    Sestavený tiket ({generated.legs.length}{' '}
                    {generated.legs.length === 1
                      ? 'zápas'
                      : generated.legs.length <= 4
                      ? 'zápasy'
                      : 'zápasů'}
                    )
                  </h2>
                </div>

                {generated.availableCombosCount <= 1 ? (
                  <span className="inline-flex min-h-[36px] items-center self-start rounded-xl border border-slate-800 bg-[#090D16] px-3 py-1.5 text-xs font-medium text-slate-500 sm:self-auto">
                    Jediná dostupná kombinace
                  </span>
                ) : (
                  <div
                    role="group"
                    aria-label="Listování kombinacemi tiketu"
                    className="inline-flex items-center self-start overflow-hidden rounded-xl border border-slate-700 bg-slate-900 sm:self-auto"
                  >
                    <button
                      type="button"
                      onClick={handlePrevVariation}
                      aria-label="Předchozí kombinace"
                      title="Předchozí kombinace"
                      className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center border-r border-slate-700/80 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <span className="px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-slate-200 whitespace-nowrap">
                      Kombinace {currentComboPosition} / {generated.availableCombosCount}
                    </span>

                    <button
                      type="button"
                      onClick={handleNextVariation}
                      aria-label="Další kombinace"
                      title="Další kombinace"
                      className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center border-l border-slate-700/80 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Compact 2x2 Ticket Overview Grid */}
              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3">
                  <span className="block text-[11px] text-slate-400">Šance na výhru</span>
                  <span className="mt-0.5 block font-mono text-lg font-bold tabular-nums text-slate-50 sm:text-xl">
                    {formatPercent(generated.totalProbability)}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3">
                  <span className="block text-[11px] text-slate-400">Celkový kurz</span>
                  <span className="mt-0.5 block font-mono text-lg font-bold tabular-nums text-emerald-400 sm:text-xl">
                    {formatOdds(generated.totalOdds)}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3">
                  <span className="block text-[11px] text-slate-400">Doporučený vklad</span>
                  <span className="mt-0.5 block font-mono text-lg font-bold tabular-nums text-slate-100 sm:text-xl">
                    {formatCZK(generated.recommendedStake)}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-[#0B101B] p-3">
                  <span className="block text-[11px] text-slate-400">Potenciální výhra</span>
                  <span className="mt-0.5 block font-mono text-lg font-bold tabular-nums text-emerald-300 sm:text-xl">
                    {formatCZK(calculatedWin)}
                  </span>
                </div>
              </div>

              {/* Compact Probability & Note Summary */}
              <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
                {generated.note} Vklad{' '}
                <span className="font-mono font-semibold tabular-nums text-slate-200">
                  {((generated.recommendedStake / safeBudget) * 100).toFixed(1)} %
                </span>{' '}
                rozpočtu.
              </p>

              {/* Legs List */}
              <div className="mt-4 divide-y divide-slate-800/80 rounded-xl border border-slate-800/80 bg-[#0B101B]">
                {generated.legs.map((leg, idx) => {
                  const geminiReason = aiReasons[leg.matchId];
                  const statFallback = statFallbackReasons[leg.matchId];
                  const activeReason = geminiReason || statFallback?.text;
                  const isExpanded = Boolean(expandedMatchIds[leg.matchId] && activeReason);
                  const isLoadingReason = Boolean(loadingMatchIds[leg.matchId]);

                  return (
                    <div key={leg.matchId} className="flex flex-col gap-2.5 p-3.5 sm:p-4">
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
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
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="font-semibold text-emerald-300">{leg.recommendedPick}</span>
                            <span className="font-mono tabular-nums text-slate-300">
                              Šance {formatPercent(leg.aiProbability)}
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

                        <div className="flex items-center justify-between gap-3 shrink-0 sm:justify-end">
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

                      {/* On-Demand Collapsible AI Analysis */}
                      {isExpanded && activeReason ? (
                        <div>
                          <div className="rounded-xl border border-slate-800/80 bg-[#090D16] px-3.5 py-2.5">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                                <Sparkles className="h-3 w-3 shrink-0" />
                                <span>
                                  {geminiReason
                                    ? `${aiModels[leg.matchId] ?? 'gemini-3-flash-preview'} · AI analýza`
                                    : 'Statistický rozbor zápasu'}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCollapseAnalysis(leg.matchId)}
                                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
                              >
                                <span>Sbalit</span>
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {renderFormattedGeminiReasoning(activeReason)}
                          </div>
                          {!geminiReason && statFallback?.apiStatus && (
                            <p className="mt-1.5 px-1 font-mono text-[11px] leading-snug text-slate-500">
                              Stav API: {statFallback.apiStatus}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={isLoadingReason}
                              onClick={() => void handleOpenOrFetchAnalysis(leg)}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              {isLoadingReason ? (
                                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>
                                {isLoadingReason
                                  ? 'Načítám analýzu...'
                                  : activeReason
                                  ? 'Zobrazit AI analýzu (uloženo)'
                                  : 'Zobrazit AI analýzu'}
                              </span>
                            </button>
                          </div>
                          {isLoadingReason && (
                            <div className="rounded-xl border border-slate-800/80 bg-[#090D16] px-3.5 py-2.5">
                              <div className="space-y-1.5" aria-busy="true">
                                <div className="h-3 w-full animate-pulse rounded bg-slate-800" />
                                <div className="h-3 w-4/5 animate-pulse rounded bg-slate-800" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Stake Adjustment & 1-Click Save to Bankroll */}
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:w-44">
                  <label htmlFor="actual-stake-input" className="block text-xs font-medium text-slate-400">
                    Vklad pro uložení (Kč)
                  </label>
                  <input
                    id="actual-stake-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={customStakeInput}
                    onChange={(e) => {
                      setCustomStakeInput(sanitizeIntegerInput(e.target.value));
                      setSavedFeedback(false);
                    }}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-base font-bold tabular-nums text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
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
