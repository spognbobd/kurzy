import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { AppLanguage, useLanguage } from '../i18n/LanguageContext';
import {
  localizeKickoffTime,
  translateMarketLabel,
  translateRecommendedPick,
  translateSport,
  translateTimeWindow,
} from '../i18n/translations';
import { MatchAnalysis, SportFilter, TicketLeg, TimeWindow } from '../types/betting';
import {
  BETANO_HOME_URL,
  buildTipsportSearchUrl,
  formatOdds,
  formatPercent,
  isSuspiciousValueMatch,
} from '../utils/analyticsEngine';
import {
  fetchSingleMatchReasoning,
  getCachedReasonForLang,
  loadCachedMatchReasons,
  saveCachedMatchReasons,
  setCachedReasonForLang,
} from '../services/geminiReasoningService';

interface MatchFeedProps {
  matches: MatchAnalysis[];
  selectedMatchIds: string[];
  geminiApiKey: string;
  onToggleMatchOnSlip: (match: MatchAnalysis) => void;
  onOpenBetano: (homeTeam: string, awayTeam: string, recommendedPick?: string) => void;
  isDemoMode: boolean;
  isLoadingLive: boolean;
  liveError: string | null;
  lastUpdatedAt: number | null;
  onRefreshLive: () => void;
  onOpenSettings: () => void;
  onOpenCustomMatchModal: () => void;
  onDeleteCustomMatch: (matchId: string) => void;
}

const SPORT_FILTERS: SportFilter[] = [
  'Vše',
  'Fotbal',
  'Hokej',
  'Tenis',
  'MMA',
  'Basketbal',
  'Ping-pong',
  'Šipky',
  'Ostatní',
];
const TIME_WINDOWS: (TimeWindow | 'Vše')[] = ['Dnes', 'Zítra', 'Víkend', 'Vše'];

type SortMode = 'probability' | 'value' | 'kickoff' | 'lowest_odds';

function isMatchPositiveValue(m: MatchAnalysis): boolean {
  return m.valueScore > 0 && Number(m.valueScore.toFixed(1)) > 0 && !isSuspiciousValueMatch(m);
}

function getKickoffTimestamp(m: MatchAnalysis): number {
  const parsed = Date.parse(m.kickoffIso);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function formatCompactUpdatedTime(
  timestampMs: number | null,
  lang: AppLanguage
): string | null {
  if (!timestampMs || !Number.isFinite(timestampMs)) return null;
  const dt = new Date(timestampMs);
  const hhmm = dt.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const isToday = dt.toDateString() === new Date().toDateString();
  if (isToday) {
    return lang === 'en' ? `Updated ${hhmm}` : `Aktualizováno ${hhmm}`;
  }
  const dateStr = dt.toLocaleDateString(lang === 'en' ? 'en-GB' : 'cs-CZ', {
    day: '2-digit',
    month: '2-digit',
  });
  return lang === 'en' ? `Updated ${dateStr} ${hhmm}` : `Aktualizováno ${dateStr} ${hhmm}`;
}

function matchToTicketLeg(m: MatchAnalysis): TicketLeg {
  return {
    matchId: m.id,
    sport: m.sport,
    league: m.league,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    kickoffTime: m.kickoffTime,
    kickoffIso: m.kickoffIso,
    recommendedPick: m.recommendedPick,
    marketLabel: m.marketLabel,
    betanoOdds: m.odds.betano,
    aiProbability: m.aiProbability,
    valueScore: m.valueScore,
    marketAvgOdds: m.odds.marketAvg,
  };
}

function renderFormattedReasoning(text: string) {
  const paragraphs = text
    .replace(/\*\*/g, '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
      {paragraphs.map((para, idx) => {
        const colonIdx = para.indexOf(':');
        const hasKnownPrefix =
          colonIdx > 0 &&
          /^(Aktuální forma|Síla soupeře|Kurzy a trh|Implikovaná vs\. reálná šance|Verdikt k tiketu|Current form|Opponent strength|Odds & Market|Implied vs\. Real Probability|Ticket Verdict)/i.test(
            para.slice(0, colonIdx)
          );

        if (!hasKnownPrefix) {
          return <p key={idx}>{para}</p>;
        }

        const label = para.slice(0, colonIdx + 1);
        const body = para.slice(colonIdx + 1).trim();
        const isVerdict = /^(Verdikt k tiketu|Ticket Verdict)/i.test(label);

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

export const MatchFeed: React.FC<MatchFeedProps> = ({
  matches,
  selectedMatchIds,
  geminiApiKey,
  onToggleMatchOnSlip,
  onOpenBetano,
  isDemoMode,
  isLoadingLive,
  liveError,
  lastUpdatedAt,
  onRefreshLive,
  onOpenSettings,
  onOpenCustomMatchModal,
  onDeleteCustomMatch,
}) => {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [sportFilter, setSportFilter] = useState<SportFilter>('Vše');
  const [timeWindow, setTimeWindow] = useState<TimeWindow | 'Vše'>('Dnes');
  const [onlyValueBets, setOnlyValueBets] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('value');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiReasons, setAiReasons] = useState<Record<string, string>>(() => loadCachedMatchReasons());
  const [aiModels, setAiModels] = useState<Record<string, string>>({});
  const [statFallbackReasons, setStatFallbackReasons] = useState<
    Record<string, { text: string; apiStatus?: string; lang: AppLanguage }>
  >({});
  const [expandedMatchIds, setExpandedMatchIds] = useState<Record<string, boolean>>({});
  const [loadingMatchIds, setLoadingMatchIds] = useState<Record<string, boolean>>({});

  const trimmedGeminiKey = geminiApiKey.trim();

  useEffect(() => {
    setStatFallbackReasons({});
  }, [trimmedGeminiKey, language]);

  const sortOptions: { id: SortMode; label: string }[] = [
    { id: 'value', label: isEn ? 'Highest Value' : 'Nejvyšší Value' },
    { id: 'probability', label: isEn ? 'Highest Probability' : 'Nejvyšší pravděpodobnost' },
    { id: 'kickoff', label: isEn ? 'Kickoff Time' : 'Čas výkopu' },
    { id: 'lowest_odds', label: isEn ? 'Lowest Odds' : 'Nejnižší kurz' },
  ];

  const handleOpenOrFetchAnalysis = async (match: MatchAnalysis) => {
    if (loadingMatchIds[match.id]) return;

    const cachedGemini = getCachedReasonForLang(aiReasons, match.id, language);
    const statCached =
      statFallbackReasons[match.id]?.lang === language
        ? statFallbackReasons[match.id]?.text
        : undefined;
    const cachedText = cachedGemini ?? statCached;
    if (cachedText) {
      setExpandedMatchIds((prev) => ({ ...prev, [match.id]: true }));
      return;
    }

    setLoadingMatchIds((prev) => ({ ...prev, [match.id]: true }));
    try {
      const result = await fetchSingleMatchReasoning(
        matchToTicketLeg(match),
        trimmedGeminiKey,
        language
      );
      if (result.source === 'gemini') {
        setAiReasons((prev) => {
          const next = setCachedReasonForLang(prev, match.id, language, result.text);
          saveCachedMatchReasons(next);
          return next;
        });
        if (result.modelUsed) {
          setAiModels((prev) => ({ ...prev, [match.id]: result.modelUsed! }));
        }
      } else {
        setStatFallbackReasons((prev) => ({
          ...prev,
          [match.id]: { text: result.text, apiStatus: result.apiStatus, lang: language },
        }));
      }
      setExpandedMatchIds((prev) => ({ ...prev, [match.id]: true }));
    } finally {
      setLoadingMatchIds((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
    }
  };

  const summaryStats = useMemo(() => {
    const positiveCount = matches.filter(isMatchPositiveValue).length;
    return {
      totalMatches: matches.length,
      valueCount: positiveCount,
    };
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = matches.filter((m) => {
      if (sportFilter !== 'Vše' && m.sport !== sportFilter) return false;
      if (timeWindow !== 'Vše' && m.timeWindow !== timeWindow) return false;
      if (onlyValueBets && !isMatchPositiveValue(m)) return false;
      if (q) {
        const hay = `${m.homeTeam} ${m.awayTeam} ${m.league} ${m.recommendedPick}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    switch (sortMode) {
      case 'probability':
        sorted.sort(
          (a, b) =>
            Number(b.aiProbability) - Number(a.aiProbability) ||
            Number(b.valueScore) - Number(a.valueScore)
        );
        break;
      case 'value':
        sorted.sort(
          (a, b) =>
            Number(b.valueScore) - Number(a.valueScore) ||
            Number(b.aiProbability) - Number(a.aiProbability)
        );
        break;
      case 'lowest_odds':
        sorted.sort(
          (a, b) =>
            Number(a.odds.betano) - Number(b.odds.betano) ||
            Number(b.aiProbability) - Number(a.aiProbability)
        );
        break;
      case 'kickoff':
      default:
        sorted.sort(
          (a, b) =>
            getKickoffTimestamp(a) - getKickoffTimestamp(b) ||
            Number(b.valueScore) - Number(a.valueScore)
        );
        break;
    }
    return sorted;
  }, [matches, sportFilter, timeWindow, onlyValueBets, sortMode, searchQuery]);

  const compactTimeLabel = formatCompactUpdatedTime(lastUpdatedAt, language);
  const statusPrefix = isDemoMode
    ? isEn
      ? 'Demo Mode'
      : 'Demo režim'
    : compactTimeLabel ?? (isEn ? 'Live Data' : 'Živá data');

  return (
    <div className="space-y-3.5 sm:space-y-4">
      {/* Compact Single-Row Status & Action Bar */}
      <section
        aria-label={isEn ? 'Odds status and quick actions' : 'Stav kurzů a rychlé akce'}
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800/90 bg-[#111827] px-3.5 py-2.5 sm:px-4"
      >
        <div className="min-w-0 font-mono text-xs tabular-nums text-slate-300">
          <span className="font-semibold text-emerald-300">{statusPrefix}</span>
          <span className="mx-1.5 text-slate-600" aria-hidden="true">
            ·
          </span>
          {isEn ? (
            <span>
              <strong className="text-slate-100">{summaryStats.valueCount}</strong> Value Bets of{' '}
              {summaryStats.totalMatches}
            </span>
          ) : (
            <span>
              <strong className="text-slate-100">{summaryStats.valueCount}</strong> Value Betů z{' '}
              {summaryStats.totalMatches}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={isDemoMode ? onOpenSettings : onRefreshLive}
            disabled={!isDemoMode && isLoadingLive}
            aria-label={
              isDemoMode
                ? isEn
                  ? 'Connect API keys'
                  : 'Připojit API klíče'
                : isEn
                ? 'Refresh odds from API'
                : 'Aktualizovat kurzy z API'
            }
            title={
              isDemoMode
                ? isEn
                  ? 'Connect API keys in Settings'
                  : 'Připojit API klíče v Nastavení'
                : isEn
                ? 'Refresh odds from API'
                : 'Aktualizovat kurzy z API'
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-[#090D16] text-emerald-400 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            {isDemoMode ? (
              <SlidersHorizontal className="h-4 w-4" />
            ) : (
              <RefreshCw className={`h-4 w-4 ${isLoadingLive ? 'animate-spin' : ''}`} />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenCustomMatchModal}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap"
          >
            {isEn ? '+ Custom Match' : '+ Vlastní zápas'}
          </button>
        </div>
      </section>

      {liveError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{liveError}</span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="font-semibold text-amber-300 underline hover:text-amber-100 whitespace-nowrap self-start sm:self-auto"
          >
            {isEn ? 'Check API Settings' : 'Zkontrolovat nastavení API'}
          </button>
        </div>
      )}

      {/* Compact Filter Toolbar */}
      <section className="space-y-2.5 rounded-2xl border border-slate-800/90 bg-[#111827] p-3.5 sm:p-4">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Sport Filters */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 lg:pb-0"
            role="tablist"
            aria-label={isEn ? 'Sport filter' : 'Filtr sportů'}
          >
            {SPORT_FILTERS.map((sport) => {
              const active = sportFilter === sport;
              return (
                <button
                  key={sport}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSportFilter(sport)}
                  className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  {translateSport(sport, language)}
                </button>
              );
            })}
          </div>

          {/* Time Window Switcher */}
          <div
            className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-[#0B101B] p-1 self-start lg:self-auto"
            role="tablist"
            aria-label={isEn ? 'Time window' : 'Časové okno'}
          >
            {TIME_WINDOWS.map((win) => {
              const active = timeWindow === win;
              const label =
                win === 'Vše'
                  ? isEn
                    ? 'All Days'
                    : 'Všechny dny'
                  : translateTimeWindow(win, language);
              return (
                <button
                  key={win}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTimeWindow(win)}
                  className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-800 text-slate-50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search, +EV Toggle & Reliable Native Sort Selector */}
        <div className="flex flex-col gap-2.5 border-t border-slate-800/80 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isEn ? 'Search team, player, or league...' : 'Hledat tým, hráče nebo ligu...'
              }
              className="min-h-[40px] w-full rounded-xl border border-slate-800 bg-[#090D16] pl-9 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={onlyValueBets}
              onClick={() => setOnlyValueBets((v) => !v)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                onlyValueBets
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-800 bg-[#090D16] text-slate-300 hover:border-slate-700'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{isEn ? 'Positive Value (+EV) Only' : 'Jen pozitivní Value (+EV)'}</span>
            </button>

            <div className="relative flex-1 sm:flex-initial">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-400" />
              <select
                aria-label={isEn ? 'Sort matches by' : 'Seřadit zápasy podle'}
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="min-h-[40px] w-full appearance-none rounded-xl border border-slate-800 bg-[#090D16] pl-8 pr-8 text-xs font-medium text-slate-200 transition-colors hover:border-slate-700 focus:border-emerald-500/60 focus:outline-none"
              >
                {sortOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>
      </section>

      {/* Match Cards Grid */}
      {isLoadingLive ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-48 animate-pulse rounded-2xl border border-slate-800/80 bg-[#111827] p-4"
            />
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-7 text-center">
          <p className="font-display text-base font-semibold text-slate-200 sm:text-lg">
            {matches.length === 0 && !isDemoMode
              ? isEn
                ? 'Could not load live matches from API'
                : 'Živé zápasy z API se nepodařilo načíst'
              : isEn
              ? 'No matches found for selected filters'
              : 'Pro vybrané filtry nebyly nalezeny žádné zápasy'}
          </p>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            {matches.length === 0 && !isDemoMode
              ? isEn
                ? 'Demo mode is off. Check the error above, update your API key in Settings, or try reloading odds.'
                : 'Demo režim je vypnutý. Zkontrolujte chybu výše, upravte API klíč v Nastavení nebo zkuste kurzy načíst znovu.'
              : isEn
              ? 'Try switching the time window to All Days or disabling the Positive Value filter.'
              : 'Zkuste přepnout časové okno na Všechny dny nebo zrušit filtr pozitivního Value.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            {matches.length === 0 && !isDemoMode ? (
              <>
                <button
                  type="button"
                  onClick={onRefreshLive}
                  className="min-h-[42px] rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  {isEn ? 'Try Loading Again' : 'Zkusit načíst znovu'}
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="min-h-[42px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                >
                  {isEn ? 'Open Settings' : 'Otevřít Nastavení'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTimeWindow('Vše');
                  setOnlyValueBets(false);
                  setSportFilter('Vše');
                  setSearchQuery('');
                }}
                className="min-h-[42px] rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                {isEn ? 'Show All Matches' : 'Zobrazit všechny zápasy'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filteredMatches.map((match) => {
            const isSuspiciousValue = isSuspiciousValueMatch(match);
            const isPositiveValue = isMatchPositiveValue(match);
            const isSelected = selectedMatchIds.includes(match.id);

            return (
              <article
                key={match.id}
                className={`flex flex-col justify-between rounded-2xl border bg-[#111827] p-4 transition-colors ${
                  isSuspiciousValue
                    ? 'border-amber-500/55 hover:border-amber-400/75'
                    : isPositiveValue
                    ? 'border-emerald-500/40 hover:border-emerald-500/60'
                    : 'border-slate-800/90 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Clean Unboxed Metadata Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 text-slate-400">
                      <span className="font-medium text-slate-300">
                        {translateSport(match.sport, language)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{match.league}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {localizeKickoffTime(match.kickoffTime, language)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums ${
                          isSuspiciousValue
                            ? 'text-amber-300'
                            : isPositiveValue
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {isSuspiciousValue
                          ? isEn
                            ? 'Suspicious Variance '
                            : 'Podezřelá odchylka '
                          : isPositiveValue
                          ? 'Value Bet '
                          : match.isCustom && match.valueScore === 0
                          ? isEn
                            ? 'Custom · Value '
                            : 'Vlastní · Value '
                          : isEn
                          ? 'No Edge '
                          : 'Bez výhody '}
                        {formatPercent(match.valueScore, true, language)}
                      </span>
                      {match.isCustom && (
                        <button
                          type="button"
                          onClick={() => onDeleteCustomMatch(match.id)}
                          title={isEn ? 'Delete custom match' : 'Smazat vlastní zápas'}
                          aria-label={
                            isEn
                              ? `Delete custom match ${match.homeTeam} vs. ${match.awayTeam}`
                              : `Smazat vlastní zápas ${match.homeTeam} vs. ${match.awayTeam}`
                          }
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-[#090D16] text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Teams & Recommended Pick */}
                  <div className="mt-2">
                    <h2 className="font-display text-base font-bold tracking-tight text-slate-50 sm:text-lg">
                      {match.homeTeam} <span className="font-normal text-slate-500">vs.</span>{' '}
                      {match.awayTeam}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-300 sm:text-sm">
                      <span className="text-slate-400">
                        {translateMarketLabel(match.marketLabel, language)}:
                      </span>{' '}
                      <span className="font-semibold text-emerald-300">
                        {translateRecommendedPick(match.recommendedPick, language)}
                      </span>
                    </p>
                  </div>

                  {isSuspiciousValue && (
                    <div
                      role="alert"
                      className="mt-2.5 rounded-xl border border-amber-400/60 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200"
                    >
                      {isEn
                        ? '⚠️ Verify market type on Betano (regulation vs. incl. OT)'
                        : '⚠️ Ověř typ trhu na Betanu (zákl. doba vs. do rozhodnutí)'}
                    </div>
                  )}

                  {/* Factual Odds & Probability Strip (No simulated form or H2H) */}
                  <div className="mt-3 grid grid-cols-3 divide-x divide-slate-800/80 rounded-xl border border-slate-800/80 bg-[#0B101B] py-2">
                    <div className="px-2.5 text-center">
                      <span className="block text-[11px] text-slate-400">
                        {isEn ? 'Betano Odds' : 'Kurz Betano'}
                      </span>
                      <span
                        className={`mt-0.5 block font-mono text-sm font-bold tabular-nums sm:text-base ${
                          match.odds.betano > match.odds.marketAvg
                            ? 'text-emerald-400'
                            : 'text-slate-100'
                        }`}
                      >
                        {formatOdds(match.odds.betano)}
                      </span>
                    </div>
                    <div className="px-2.5 text-center">
                      <span className="block text-[11px] text-slate-400">
                        {isEn ? 'Market Avg' : 'Průměr trhu'}
                      </span>
                      <span className="mt-0.5 block font-mono text-sm font-semibold tabular-nums text-slate-300 sm:text-base">
                        {formatOdds(match.odds.marketAvg)}
                      </span>
                    </div>
                    <div className="px-2.5 text-center">
                      <span className="block text-[11px] text-slate-400">
                        {isEn ? 'Win Probability' : 'Šance na výhru'}
                      </span>
                      <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-slate-100 sm:text-base">
                        {formatPercent(match.aiProbability, false, language)}
                      </span>
                    </div>
                  </div>

                  {/* On-Click Collapsible AI Analysis */}
                  {(() => {
                    const geminiReason = getCachedReasonForLang(aiReasons, match.id, language);
                    const statEntry =
                      statFallbackReasons[match.id]?.lang === language
                        ? statFallbackReasons[match.id]
                        : undefined;
                    const activeReason = geminiReason || statEntry?.text;
                    const isExpanded = Boolean(expandedMatchIds[match.id] && activeReason);
                    const isLoadingReason = Boolean(loadingMatchIds[match.id]);

                    if (isExpanded && activeReason) {
                      return (
                        <div className="mt-2.5">
                          <div className="rounded-xl border border-slate-800/80 bg-[#090D16] px-3.5 py-2.5">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                                <Sparkles className="h-3 w-3 shrink-0" />
                                <span>
                                  {geminiReason
                                    ? `${aiModels[match.id] ?? 'gemini-3-flash-preview'} · ${
                                        isEn ? 'AI Analysis' : 'AI analýza'
                                      }`
                                    : isEn
                                    ? 'Statistical Match Breakdown'
                                    : 'Statistický rozbor zápasu'}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedMatchIds((prev) => ({ ...prev, [match.id]: false }))
                                }
                                className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
                              >
                                <span>{isEn ? 'Collapse' : 'Sbalit'}</span>
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {renderFormattedReasoning(activeReason)}
                          </div>
                          {!geminiReason && statEntry?.apiStatus && (
                            <p className="mt-1 px-1 font-mono text-[11px] leading-snug text-slate-500">
                              {isEn ? 'API status:' : 'Stav API:'} {statEntry.apiStatus}
                            </p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="mt-2.5">
                        <button
                          type="button"
                          disabled={isLoadingReason}
                          onClick={() => void handleOpenOrFetchAnalysis(match)}
                          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {isLoadingReason ? (
                            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>
                            {isLoadingReason
                              ? isEn
                                ? 'Loading AI analysis...'
                                : 'Načítám AI analýzu...'
                              : activeReason
                              ? isEn
                                ? 'Show AI Analysis (saved)'
                                : 'Zobrazit AI analýzu (uloženo)'
                              : isEn
                              ? 'Show AI Analysis'
                              : 'Zobrazit AI analýzu'}
                          </span>
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Single-Row Side-by-Side Actions */}
                <div className="mt-3 flex flex-row items-center gap-1.5 border-t border-slate-800/70 pt-3 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleMatchOnSlip(match)}
                    className={`inline-flex min-h-[42px] min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:px-3 sm:text-sm ${
                      isSelected
                        ? 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-4 w-4 shrink-0" />
                        <span>{isEn ? 'On Slip' : 'Na tiketu'}</span>
                      </>
                    ) : (
                      <span>{isEn ? '+ Add to Slip' : '+ Přidat na tiket'}</span>
                    )}
                  </button>

                  <a
                    href={BETANO_HOME_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onOpenBetano(match.homeTeam, match.awayTeam, match.recommendedPick)}
                    className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-900/90 px-2.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white whitespace-nowrap sm:px-3 sm:text-sm"
                  >
                    <span>Betano</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </a>

                  <a
                    href={buildTipsportSearchUrl(match.homeTeam, match.awayTeam)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={
                      isEn
                        ? `Search ${match.homeTeam} vs. ${match.awayTeam} on Tipsport`
                        : `Vyhledat ${match.homeTeam} vs. ${match.awayTeam} na Tipsportu`
                    }
                    className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-900/90 px-2.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white whitespace-nowrap sm:px-3 sm:text-sm"
                  >
                    <span>Tipsport</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
