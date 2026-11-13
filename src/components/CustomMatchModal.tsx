import React, { useMemo, useState } from 'react';
import { Calculator, PlusCircle, ShieldCheck, X } from 'lucide-react';
import { MatchAnalysis, SportCategory } from '../types/betting';
import {
  calculateCustomMatchMetrics,
  formatOdds,
  formatPercent,
} from '../utils/analyticsEngine';

interface CustomMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMatch: (match: MatchAnalysis) => void;
}

const SPORT_OPTIONS: { value: SportCategory; label: string; defaultLeague: string }[] = [
  { value: 'Ping-pong', label: 'Stolní tenis / Ping-pong', defaultLeague: 'Stolní tenis (Vlastní)' },
  { value: 'Tenis', label: 'Tenis', defaultLeague: 'Tenis (Vlastní)' },
  { value: 'Fotbal', label: 'Fotbal', defaultLeague: 'Fotbal (Vlastní)' },
  { value: 'Hokej', label: 'Hokej', defaultLeague: 'Hokej (Vlastní)' },
  { value: 'MMA', label: 'MMA', defaultLeague: 'MMA (Vlastní)' },
  { value: 'Basketbal', label: 'Basketbal', defaultLeague: 'Basketbal (Vlastní)' },
  { value: 'Šipky', label: 'Šipky', defaultLeague: 'Šipky (Vlastní)' },
  { value: 'Ostatní', label: 'Ostatní', defaultLeague: 'Vlastní turnaj' },
];

function parseDecimal(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export const CustomMatchModal: React.FC<CustomMatchModalProps> = ({
  isOpen,
  onClose,
  onAddMatch,
}) => {
  const [sport, setSport] = useState<SportCategory>('Ping-pong');
  const [leagueInput, setLeagueInput] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [oddsHomeRaw, setOddsHomeRaw] = useState('');
  const [oddsDrawRaw, setOddsDrawRaw] = useState('');
  const [oddsAwayRaw, setOddsAwayRaw] = useState('');
  const [comparisonOddsRaw, setComparisonOddsRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsedHome = parseDecimal(oddsHomeRaw);
  const parsedDraw = parseDecimal(oddsDrawRaw);
  const parsedAway = parseDecimal(oddsAwayRaw);
  const parsedComparison = parseDecimal(comparisonOddsRaw);

  const liveMetrics = useMemo(() => {
    if (!parsedHome || !parsedAway) return null;
    return calculateCustomMatchMetrics({
      oddsHome: parsedHome,
      oddsDraw: parsedDraw,
      oddsAway: parsedAway,
      comparisonFavoriteOdds: parsedComparison,
    });
  }, [parsedHome, parsedDraw, parsedAway, parsedComparison]);

  if (!isOpen) return null;

  const isTwoWaySport =
    sport === 'Ping-pong' || sport === 'Tenis' || sport === 'Šipky' || sport === 'MMA';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanHome = homeTeam.trim();
    const cleanAway = awayTeam.trim();

    if (!cleanHome || !cleanAway) {
      setError('Zadejte prosím oba účastníky (Hráč / Tým 1 i Hráč / Tým 2).');
      return;
    }

    if (!parsedHome || parsedHome <= 1.01 || !parsedAway || parsedAway <= 1.01) {
      setError('Zadejte platné kurzy vyšší než 1.01 pro oba hráče / týmy.');
      return;
    }

    if (oddsDrawRaw.trim() && (!parsedDraw || parsedDraw <= 1.01)) {
      setError('Volitelný kurz na remízu musí být vyšší než 1.01 nebo zůstat prázdný.');
      return;
    }

    if (comparisonOddsRaw.trim() && (!parsedComparison || parsedComparison <= 1.01)) {
      setError('Srovnávací kurz z jiné sázkovky musí být vyšší než 1.01 nebo zůstat prázdný.');
      return;
    }

    const metrics = calculateCustomMatchMetrics({
      oddsHome: parsedHome,
      oddsDraw: parsedDraw,
      oddsAway: parsedAway,
      comparisonFavoriteOdds: parsedComparison,
    });

    if (!metrics) {
      setError('Nepodařilo se vypočítat pravděpodobnost ze zadaných kurzů.');
      return;
    }

    const favName = metrics.favoriteSide === 'home' ? cleanHome : cleanAway;
    const sportMeta = SPORT_OPTIONS.find((o) => o.value === sport);
    const league = leagueInput.trim() || sportMeta?.defaultLeague || sport;
    const hasComparison = Boolean(parsedComparison && parsedComparison > 1.01);

    const newMatch: MatchAnalysis = {
      id: `custom-${Date.now()}`,
      sport,
      league,
      timeWindow: 'Dnes',
      kickoffTime: 'Vlastní · Dnes',
      kickoffIso: new Date().toISOString(),
      homeTeam: cleanHome,
      awayTeam: cleanAway,
      recommendedPick: `Výhra ${favName} (${metrics.favoriteSide === 'home' ? '1' : '2'})`,
      marketLabel: 'Vítěz zápasu',
      odds: {
        betano: metrics.favoriteOdds,
        tipsport: metrics.marketAvgOdds,
        marketAvg: metrics.marketAvgOdds,
      },
      formHome: ['V', 'V', 'P', 'V', 'V'],
      formAway: ['P', 'V', 'P', 'V', 'P'],
      h2hHomeWins: metrics.favoriteSide === 'home' ? 3 : 2,
      h2hDraws: parsedDraw ? 1 : 0,
      h2hAwayWins: metrics.favoriteSide === 'away' ? 3 : 2,
      h2hSummary: `Férové šance ${formatPercent(metrics.fairProbHome)} vs. ${formatPercent(
        metrics.fairProbAway
      )}`,
      aiProbability: metrics.favoriteFairProb,
      impliedProbability: metrics.favoriteImpliedProb,
      valueScore: metrics.valueScore,
      reasoning: `Vlastní zápas · marže sázkovky ${formatPercent(
        metrics.bookmakerMarginPct
      )}. Očištěná férová šance: ${cleanHome} ${formatPercent(
        metrics.fairProbHome
      )}${
        metrics.fairProbDraw !== null ? ` · Remíza ${formatPercent(metrics.fairProbDraw)}` : ''
      } · ${cleanAway} ${formatPercent(metrics.fairProbAway)}. ${
        hasComparison
          ? `Srovnávací kurz ${formatOdds(metrics.marketAvgOdds)} dává Value ${formatPercent(
              metrics.valueScore,
              true
            )}.`
          : 'Bez srovnávacího kurzu nastaveno neutrální Value 0 %.'
      }`,
      isLiveApi: false,
      isCustom: true,
      bookmakerMarginPct: metrics.bookmakerMarginPct,
    };

    onAddMatch(newMatch);
    setLeagueInput('');
    setHomeTeam('');
    setAwayTeam('');
    setOddsHomeRaw('');
    setOddsDrawRaw('');
    setOddsAwayRaw('');
    setComparisonOddsRaw('');
    setError(null);
    onClose();
  };

  const marginQuality =
    !liveMetrics
      ? null
      : liveMetrics.bookmakerMarginPct <= 5.5
      ? { label: 'Nízká marže (výhodný trh)', cls: 'text-emerald-400' }
      : liveMetrics.bookmakerMarginPct <= 8.5
      ? { label: 'Běžná marže sázkovky', cls: 'text-amber-300' }
      : { label: 'Vysoká marže (ošizený kurz)', cls: 'text-rose-400' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-match-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-slate-800 bg-[#111827] shadow-2xl sm:rounded-2xl">
        {/* Modal Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-[#111827] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <PlusCircle className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 id="custom-match-modal-title" className="font-display text-lg font-bold text-slate-50">
                Přidat vlastní zápas
              </h2>
              <p className="text-xs text-slate-400">
                Stolní tenis / ping-pong, šipky nebo lokální turnaje mimo API
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít formulář"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-[#090D16] text-slate-400 transition-colors hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* Sport & Tournament */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="custom-sport" className="block text-xs font-semibold text-slate-300">
                Sport
              </label>
              <select
                id="custom-sport"
                value={sport}
                onChange={(e) => {
                  const next = e.target.value as SportCategory;
                  setSport(next);
                  if (next === 'Ping-pong' || next === 'Tenis' || next === 'Šipky' || next === 'MMA') {
                    setOddsDrawRaw('');
                  }
                }}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 text-sm text-slate-100 focus:border-emerald-500/60 focus:outline-none"
              >
                {SPORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="custom-league" className="block text-xs font-semibold text-slate-300">
                Turnaj / liga (volitelné)
              </label>
              <input
                id="custom-league"
                type="text"
                value={leagueInput}
                onChange={(e) => setLeagueInput(e.target.value)}
                placeholder="např. TT Star Series / PDC"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Players / Teams */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="custom-home" className="block text-xs font-semibold text-slate-300">
                Hráč / Tým 1 (Domácí)
              </label>
              <input
                id="custom-home"
                type="text"
                value={homeTeam}
                onChange={(e) => setHomeTeam(e.target.value)}
                placeholder="např. Lubomír Jančařík"
                required
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="custom-away" className="block text-xs font-semibold text-slate-300">
                Hráč / Tým 2 (Hosté)
              </label>
              <input
                id="custom-away"
                type="text"
                value={awayTeam}
                onChange={(e) => setAwayTeam(e.target.value)}
                placeholder="např. Tomáš Tregler"
                required
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Bookmaker Odds */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="custom-odds-home" className="block text-xs font-semibold text-slate-300">
                Kurz Hráč/Tým 1
              </label>
              <input
                id="custom-odds-home"
                type="text"
                inputMode="decimal"
                value={oddsHomeRaw}
                onChange={(e) => setOddsHomeRaw(e.target.value)}
                placeholder="např. 1.65"
                required
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-sm font-semibold tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="custom-odds-draw" className="block text-xs font-semibold text-slate-300">
                Kurz Remíza (volitelné)
              </label>
              <input
                id="custom-odds-draw"
                type="text"
                inputMode="decimal"
                value={oddsDrawRaw}
                onChange={(e) => setOddsDrawRaw(e.target.value)}
                placeholder={isTwoWaySport ? 'Nechte prázdné' : 'např. 3.40'}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-sm font-semibold tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="custom-odds-away" className="block text-xs font-semibold text-slate-300">
                Kurz Hráč/Tým 2
              </label>
              <input
                id="custom-odds-away"
                type="text"
                inputMode="decimal"
                value={oddsAwayRaw}
                onChange={(e) => setOddsAwayRaw(e.target.value)}
                placeholder="např. 2.15"
                required
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-sm font-semibold tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Optional Comparison Odds */}
          <div>
            <label htmlFor="custom-comparison-odds" className="block text-xs font-semibold text-slate-300">
              Srovnávací / průměrný kurz na favorita z jiné sázkovky (volitelné)
            </label>
            <input
              id="custom-comparison-odds"
              type="text"
              inputMode="decimal"
              value={comparisonOddsRaw}
              onChange={(e) => setComparisonOddsRaw(e.target.value)}
              placeholder="např. 1.55 (pokud nevyplníte, Value bude 0 %)"
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-sm font-semibold tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {/* Live Fair Probability & Margin Preview */}
          <div className="rounded-xl border border-slate-800 bg-[#090D16] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Calculator className="h-4 w-4 text-emerald-400" />
                <span>Automatický výpočet bez marže</span>
              </span>
              {liveMetrics && marginQuality && (
                <span className={`font-mono text-xs font-semibold tabular-nums ${marginQuality.cls}`}>
                  Marže: {formatPercent(liveMetrics.bookmakerMarginPct)}
                </span>
              )}
            </div>

            {!liveMetrics ? (
              <p className="mt-2 text-xs text-slate-400">
                Zadejte kurzy pro oba hráče / týmy a kalkulačka ihned očistí kurzy od marže sázkovky.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2">
                    <span className="block truncate text-[11px] text-slate-400">
                      {homeTeam.trim() || 'Hráč / Tým 1'}
                    </span>
                    <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-slate-100">
                      {formatPercent(liveMetrics.fairProbHome)}
                    </span>
                  </div>

                  {liveMetrics.fairProbDraw !== null && (
                    <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2">
                      <span className="block text-[11px] text-slate-400">Remíza</span>
                      <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-slate-100">
                        {formatPercent(liveMetrics.fairProbDraw)}
                      </span>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2">
                    <span className="block truncate text-[11px] text-slate-400">
                      {awayTeam.trim() || 'Hráč / Tým 2'}
                    </span>
                    <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-slate-100">
                      {formatPercent(liveMetrics.fairProbAway)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs">
                  <span className={marginQuality?.cls}>{marginQuality?.label}</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    Favorit:{' '}
                    <strong className="text-emerald-300">
                      {liveMetrics.favoriteSide === 'home'
                        ? homeTeam.trim() || 'Hráč 1'
                        : awayTeam.trim() || 'Hráč 2'}
                    </strong>{' '}
                    · Value{' '}
                    <strong
                      className={
                        liveMetrics.valueScore > 0
                          ? 'text-emerald-400'
                          : liveMetrics.valueScore < 0
                          ? 'text-rose-400'
                          : 'text-slate-200'
                      }
                    >
                      {formatPercent(liveMetrics.valueScore, true)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300"
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
            >
              Zrušit
            </button>
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Uložit a přidat do analýzy</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
