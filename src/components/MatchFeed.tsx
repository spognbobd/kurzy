import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import {
  FormResult,
  MatchAnalysis,
  SportFilter,
  TimeWindow,
} from '../types/betting';
import {
  BETANO_HOME_URL,
  formatOdds,
  formatPercent,
} from '../utils/analyticsEngine';
import { PWAInstallButton } from './PWAInstallButton';

interface MatchFeedProps {
  matches: MatchAnalysis[];
  selectedMatchIds: string[];
  onToggleMatchOnSlip: (match: MatchAnalysis) => void;
  onOpenBetano: (homeTeam: string, awayTeam: string) => void;
  isDemoMode: boolean;
  isLoadingLive: boolean;
  liveError: string | null;
  onRefreshLive: () => void;
  onOpenSettings: () => void;
}

const SPORT_FILTERS: SportFilter[] = ['Vše', 'Fotbal', 'Hokej', 'Tenis', 'MMA'];
const TIME_WINDOWS: (TimeWindow | 'Vše')[] = ['Dnes', 'Zítra', 'Víkend', 'Vše'];

function FormSequence({ label, form }: { label: string; form: FormResult[] }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate text-slate-400">{label}</span>
      <div className="flex items-center gap-1 font-mono tabular-nums shrink-0" aria-label={`Forma ${form.join(' ')}`}>
        {form.map((res, idx) => (
          <span
            key={idx}
            className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${
              res === 'V'
                ? 'bg-emerald-500/15 text-emerald-300'
                : res === 'R'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {res}
          </span>
        ))}
      </div>
    </div>
  );
}

export const MatchFeed: React.FC<MatchFeedProps> = ({
  matches,
  selectedMatchIds,
  onToggleMatchOnSlip,
  onOpenBetano,
  isDemoMode,
  isLoadingLive,
  liveError,
  onRefreshLive,
  onOpenSettings,
}) => {
  const [sportFilter, setSportFilter] = useState<SportFilter>('Vše');
  const [timeWindow, setTimeWindow] = useState<TimeWindow | 'Vše'>('Dnes');
  const [onlyValueBets, setOnlyValueBets] = useState(false);
  const [sortByValue, setSortByValue] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const summaryStats = useMemo(() => {
    const positive = matches.filter((m) => m.valueScore > 0);
    const maxVal = positive.length > 0 ? Math.max(...positive.map((m) => m.valueScore)) : 0;
    const avgVal =
      positive.length > 0
        ? positive.reduce((sum, m) => sum + m.valueScore, 0) / positive.length
        : 0;
    return {
      totalMatches: matches.length,
      valueCount: positive.length,
      maxVal,
      avgVal,
    };
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = matches.filter((m) => {
      if (sportFilter !== 'Vše' && m.sport !== sportFilter) return false;
      if (timeWindow !== 'Vše' && m.timeWindow !== timeWindow) return false;
      if (onlyValueBets && m.valueScore <= 0) return false;
      if (q) {
        const hay = `${m.homeTeam} ${m.awayTeam} ${m.league} ${m.recommendedPick}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortByValue) {
      return [...list].sort((a, b) => b.valueScore - a.valueScore);
    }
    return [...list].sort((a, b) => a.kickoffIso.localeCompare(b.kickoffIso));
  }, [matches, sportFilter, timeWindow, onlyValueBets, sortByValue, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Workspace Header & KPI Summary Row */}
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{isDemoMode ? 'Demo režim s ukázkovými daty' : 'Živá data The Odds API'}</span>
            <span aria-hidden="true">·</span>
            <span>Porovnání Betano, Tipsport a průměru trhu</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl text-balance">
            Vyhledávač hodnotných sázek
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PWAInstallButton variant="compact" />
          {!isDemoMode ? (
            <button
              type="button"
              onClick={onRefreshLive}
              disabled={isLoadingLive}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-4 w-4 text-emerald-400 ${isLoadingLive ? 'animate-spin' : ''}`} />
              <span>{isLoadingLive ? 'Načítám kurzy...' : 'Obnovit kurzy'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-700/90 bg-slate-900/90 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
              <span>Připojit API klíče</span>
            </button>
          )}
        </div>
      </section>

      {liveError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{liveError}</span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs font-semibold text-amber-300 underline hover:text-amber-100 whitespace-nowrap self-start sm:self-auto"
          >
            Zkontrolovat nastavení API
          </button>
        </div>
      )}

      {/* 3-Metric Analytical Summary Strip */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] px-5 py-4">
          <p className="text-xs font-medium text-slate-400">Nalezené Value Bety</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-400">
            {summaryStats.valueCount}{' '}
            <span className="text-sm font-normal text-slate-400">z {summaryStats.totalMatches} zápasů</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] px-5 py-4">
          <p className="text-xs font-medium text-slate-400">Nejvyšší dnešní Value skóre</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
            {formatPercent(summaryStats.maxVal, true)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] px-5 py-4">
          <p className="text-xs font-medium text-slate-400">Průměrná matematická výhoda (+EV)</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
            {formatPercent(summaryStats.avgVal, true)}
          </p>
        </div>
      </section>

      {/* Filter Toolbar */}
      <section className="space-y-3 rounded-2xl border border-slate-800/90 bg-[#111827] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Sport Filters */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0"
            role="tablist"
            aria-label="Filtr sportů"
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
                  className={`min-h-[40px] rounded-xl px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  {sport}
                </button>
              );
            })}
          </div>

          {/* Time Window Switcher */}
          <div
            className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-[#0B101B] p-1 self-start lg:self-auto"
            role="tablist"
            aria-label="Časové okno"
          >
            {TIME_WINDOWS.map((win) => {
              const active = timeWindow === win;
              const label = win === 'Vše' ? 'Všechny dny' : win;
              return (
                <button
                  key={win}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTimeWindow(win)}
                  className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
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

        {/* Search & Secondary Controls */}
        <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat tým, hráče nebo ligu..."
              className="min-h-[42px] w-full rounded-xl border border-slate-800 bg-[#090D16] pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setOnlyValueBets((v) => !v)}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                onlyValueBets
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-800 bg-[#090D16] text-slate-300 hover:border-slate-700'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Jen pozitivní Value (+EV)</span>
            </button>

            <button
              type="button"
              onClick={() => setSortByValue((s) => !s)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-800 bg-[#090D16] px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-slate-100 whitespace-nowrap shrink-0"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <span>{sortByValue ? 'Řazeno: Nejvyšší Value' : 'Řazeno: Čas výkopu'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Match Cards Grid */}
      {isLoadingLive ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-72 animate-pulse rounded-2xl border border-slate-800/80 bg-[#111827] p-5"
            />
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-8 text-center">
          <p className="font-display text-lg font-semibold text-slate-200">
            {matches.length === 0 && !isDemoMode
              ? 'Živé zápasy z API se nepodařilo načíst'
              : 'Pro vybrané filtry nebyly nalezeny žádné zápasy'}
          </p>
          <p className="mt-1.5 text-sm text-slate-400">
            {matches.length === 0 && !isDemoMode
              ? 'Demo režim je vypnutý. Zkontrolujte chybu výše, upravte API klíč v Nastavení nebo zkuste kurzy načíst znovu.'
              : 'Zkuste přepnout časové okno na Všechny dny nebo zrušit filtr pozitivního Value.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {matches.length === 0 && !isDemoMode ? (
              <>
                <button
                  type="button"
                  onClick={onRefreshLive}
                  className="min-h-[44px] rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  Zkusit načíst znovu
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                >
                  Otevřít Nastavení
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
                className="min-h-[44px] rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                Zobrazit všechny zápasy
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredMatches.map((match) => {
            const isPositiveValue = match.valueScore > 0;
            const isSelected = selectedMatchIds.includes(match.id);

            return (
              <article
                key={match.id}
                className={`flex flex-col justify-between rounded-2xl border bg-[#111827] p-5 transition-colors ${
                  isPositiveValue
                    ? 'border-emerald-500/40 hover:border-emerald-500/60'
                    : 'border-slate-800/90 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Clean Unboxed Metadata Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="font-medium text-slate-300">{match.sport}</span>
                      <span aria-hidden="true">·</span>
                      <span>{match.league}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{match.kickoffTime}</span>
                    </div>

                    <div
                      className={`font-mono text-xs font-bold tabular-nums ${
                        isPositiveValue ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {isPositiveValue ? 'Value Bet ' : 'Bez výhody '}
                      {formatPercent(match.valueScore, true)}
                    </div>
                  </div>

                  {/* Teams & Recommended Pick */}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold tracking-tight text-slate-50">
                        {match.homeTeam} <span className="font-normal text-slate-500">vs.</span>{' '}
                        {match.awayTeam}
                      </h2>
                      <p className="mt-1 text-sm text-slate-300">
                        <span className="text-slate-400">{match.marketLabel}:</span>{' '}
                        <span className="font-semibold text-emerald-300">{match.recommendedPick}</span>
                      </p>
                    </div>
                  </div>

                  {/* Odds Comparison Table */}
                  <div className="mt-4 grid grid-cols-3 divide-x divide-slate-800/80 rounded-xl border border-slate-800/80 bg-[#0B101B] py-2.5">
                    <div className="px-3 text-center">
                      <span className="block text-[11px] text-slate-400">Betano</span>
                      <span
                        className={`mt-0.5 block font-mono text-base font-bold tabular-nums ${
                          match.odds.betano >= match.odds.tipsport && match.odds.betano > match.odds.marketAvg
                            ? 'text-emerald-400'
                            : 'text-slate-100'
                        }`}
                      >
                        {formatOdds(match.odds.betano)}
                      </span>
                    </div>
                    <div className="px-3 text-center">
                      <span className="block text-[11px] text-slate-400">Tipsport</span>
                      <span className="mt-0.5 block font-mono text-base font-semibold tabular-nums text-slate-200">
                        {formatOdds(match.odds.tipsport)}
                      </span>
                    </div>
                    <div className="px-3 text-center">
                      <span className="block text-[11px] text-slate-400">Průměr trhu</span>
                      <span className="mt-0.5 block font-mono text-base font-medium tabular-nums text-slate-400">
                        {formatOdds(match.odds.marketAvg)}
                      </span>
                    </div>
                  </div>

                  {/* AI Probability vs Implied Odds Bar */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        AI pravděpodobnost:{' '}
                        <strong className="font-mono tabular-nums text-slate-100">
                          {formatPercent(match.aiProbability)}
                        </strong>
                      </span>
                      <span className="text-slate-400">
                        Implikováno kurzem:{' '}
                        <span className="font-mono tabular-nums text-slate-300">
                          {formatPercent(match.impliedProbability)}
                        </span>
                      </span>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isPositiveValue ? 'bg-emerald-500' : 'bg-slate-500'
                        }`}
                        style={{ width: `${Math.min(100, match.aiProbability)}%` }}
                      />
                    </div>
                  </div>

                  {/* Form (Last 5) & H2H Summary */}
                  <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-800/70 pt-3 sm:grid-cols-2 sm:gap-4">
                    <div className="space-y-1.5">
                      <FormSequence label={match.homeTeam} form={match.formHome} />
                      <FormSequence label={match.awayTeam} form={match.formAway} />
                    </div>
                    <div className="flex flex-col justify-center text-xs sm:border-l sm:border-slate-800/70 sm:pl-4">
                      <span className="text-slate-400">Vzájemná bilance (H2H)</span>
                      <span className="mt-0.5 font-medium text-slate-200">{match.h2hSummary}</span>
                    </div>
                  </div>

                  {/* Czech Analytical Reasoning */}
                  <p className="mt-3 text-xs leading-relaxed text-slate-300">{match.reasoning}</p>
                </div>

                {/* Actions Row */}
                <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-800/70 pt-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => onToggleMatchOnSlip(match)}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-4 w-4 shrink-0" />
                        <span>Na tiketu</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 shrink-0" />
                        <span>Přidat na tiket</span>
                      </>
                    )}
                  </button>

                  <a
                    href={BETANO_HOME_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onOpenBetano(match.homeTeam, match.awayTeam)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white whitespace-nowrap shrink-0"
                  >
                    <span>Najít na Betanu</span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
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
