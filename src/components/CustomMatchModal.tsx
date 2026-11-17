import React, { useMemo, useState } from 'react';
import { Calculator, PlusCircle, ShieldCheck, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { translateSport } from '../i18n/translations';
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

const SPORT_CATEGORIES: SportCategory[] = [
  'Ping-pong',
  'Tenis',
  'Fotbal',
  'Hokej',
  'MMA',
  'Basketbal',
  'Šipky',
  'Ostatní',
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
  const { language } = useLanguage();
  const isEn = language === 'en';

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

  const getDefaultLeague = (s: SportCategory): string => {
    if (isEn) {
      if (s === 'Ostatní') return 'Custom Tournament';
      return `${translateSport(s, 'en')} (Custom)`;
    }
    if (s === 'Ping-pong') return 'Stolní tenis (Vlastní)';
    if (s === 'Ostatní') return 'Vlastní turnaj';
    return `${s} (Vlastní)`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanHome = homeTeam.trim();
    const cleanAway = awayTeam.trim();

    if (!cleanHome || !cleanAway) {
      setError(
        isEn
          ? 'Please enter both participants (Player / Team 1 and Player / Team 2).'
          : 'Zadejte prosím oba účastníky (Hráč / Tým 1 i Hráč / Tým 2).'
      );
      return;
    }

    if (!parsedHome || parsedHome <= 1.01 || !parsedAway || parsedAway <= 1.01) {
      setError(
        isEn
          ? 'Please enter valid odds greater than 1.01 for both players / teams.'
          : 'Zadejte platné kurzy vyšší než 1.01 pro oba hráče / týmy.'
      );
      return;
    }

    if (oddsDrawRaw.trim() && (!parsedDraw || parsedDraw <= 1.01)) {
      setError(
        isEn
          ? 'Optional draw odds must be greater than 1.01 or left blank.'
          : 'Volitelný kurz na remízu musí být vyšší než 1.01 nebo zůstat prázdný.'
      );
      return;
    }

    if (comparisonOddsRaw.trim() && (!parsedComparison || parsedComparison <= 1.01)) {
      setError(
        isEn
          ? 'Comparison odds from another bookmaker must be greater than 1.01 or left blank.'
          : 'Srovnávací kurz z jiné sázkovky musí být vyšší než 1.01 nebo zůstat prázdný.'
      );
      return;
    }

    const metrics = calculateCustomMatchMetrics({
      oddsHome: parsedHome,
      oddsDraw: parsedDraw,
      oddsAway: parsedAway,
      comparisonFavoriteOdds: parsedComparison,
    });

    if (!metrics) {
      setError(
        isEn
          ? 'Could not calculate probabilities from the entered odds.'
          : 'Nepodařilo se vypočítat pravděpodobnost ze zadaných kurzů.'
      );
      return;
    }

    const favName = metrics.favoriteSide === 'home' ? cleanHome : cleanAway;
    const league = leagueInput.trim() || getDefaultLeague(sport);
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
      h2hSummary: `${formatPercent(metrics.fairProbHome, false, language)} vs. ${formatPercent(
        metrics.fairProbAway,
        false,
        language
      )}`,
      aiProbability: metrics.favoriteFairProb,
      impliedProbability: metrics.favoriteImpliedProb,
      valueScore: metrics.valueScore,
      reasoning: isEn
        ? `Custom match · bookmaker margin ${formatPercent(
            metrics.bookmakerMarginPct,
            false,
            'en'
          )}. Fair probabilities: ${cleanHome} ${formatPercent(
            metrics.fairProbHome,
            false,
            'en'
          )}${
            metrics.fairProbDraw !== null
              ? ` · Draw ${formatPercent(metrics.fairProbDraw, false, 'en')}`
              : ''
          } · ${cleanAway} ${formatPercent(metrics.fairProbAway, false, 'en')}. ${
            hasComparison
              ? `Comparison odds ${formatOdds(metrics.marketAvgOdds)} yield Value ${formatPercent(
                  metrics.valueScore,
                  true,
                  'en'
                )}.`
              : 'Without comparison odds, Value is set to 0%.'
          }`
        : `Vlastní zápas · marže sázkovky ${formatPercent(
            metrics.bookmakerMarginPct,
            false,
            'cs'
          )}. Očištěná férová šance: ${cleanHome} ${formatPercent(
            metrics.fairProbHome,
            false,
            'cs'
          )}${
            metrics.fairProbDraw !== null
              ? ` · Remíza ${formatPercent(metrics.fairProbDraw, false, 'cs')}`
              : ''
          } · ${cleanAway} ${formatPercent(metrics.fairProbAway, false, 'cs')}. ${
            hasComparison
              ? `Srovnávací kurz ${formatOdds(metrics.marketAvgOdds)} dává Value ${formatPercent(
                  metrics.valueScore,
                  true,
                  'cs'
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
      ? {
          label: isEn ? 'Low margin (favorable market)' : 'Nízká marže (výhodný trh)',
          cls: 'text-emerald-400',
        }
      : liveMetrics.bookmakerMarginPct <= 8.5
      ? {
          label: isEn ? 'Standard bookmaker margin' : 'Běžná marže sázkovky',
          cls: 'text-amber-300',
        }
      : {
          label: isEn ? 'High margin (heavy juice)' : 'Vysoká marže (ošizený kurz)',
          cls: 'text-rose-400',
        };

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
                {isEn ? 'Add Custom Match' : 'Přidat vlastní zápas'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEn
                  ? 'Table tennis, darts, or local tournaments outside the API'
                  : 'Stolní tenis / ping-pong, šipky nebo lokální turnaje mimo API'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close form' : 'Zavřít formulář'}
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
                {isEn ? 'Sport' : 'Sport'}
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
                {SPORT_CATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'Ping-pong' && !isEn
                      ? 'Stolní tenis / Ping-pong'
                      : translateSport(s, language)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="custom-league" className="block text-xs font-semibold text-slate-300">
                {isEn ? 'Tournament / League (optional)' : 'Turnaj / liga (volitelné)'}
              </label>
              <input
                id="custom-league"
                type="text"
                value={leagueInput}
                onChange={(e) => setLeagueInput(e.target.value)}
                placeholder={isEn ? 'e.g. TT Star Series / PDC' : 'např. TT Star Series / PDC'}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Players / Teams */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="custom-home" className="block text-xs font-semibold text-slate-300">
                {isEn ? 'Player / Team 1 (Home)' : 'Hráč / Tým 1 (Domácí)'}
              </label>
              <input
                id="custom-home"
                type="text"
                value={homeTeam}
                onChange={(e) => setHomeTeam(e.target.value)}
                placeholder={isEn ? 'e.g. Lubomír Jančařík' : 'např. Lubomír Jančařík'}
                required
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="custom-away" className="block text-xs font-semibold text-slate-300">
                {isEn ? 'Player / Team 2 (Away)' : 'Hráč / Tým 2 (Hosté)'}
              </label>
              <input
                id="custom-away"
                type="text"
                value={awayTeam}
                onChange={(e) => setAwayTeam(e.target.value)}
                placeholder={isEn ? 'e.g. Tomáš Tregler' : 'např. Tomáš Tregler'}
                required
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Bookmaker Odds */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="custom-odds-home" className="block text-xs font-semibold text-slate-300">
                {isEn ? 'Odds Player/Team 1' : 'Kurz Hráč/Tým 1'}
              </label>
              <input
                id="custom-odds-home"
                type="text"
                inputMode="decimal"
                value={oddsHomeRaw}
                onChange={(e) => setOddsHomeRaw(e.target.value)}
                placeholder={isEn ? 'e.g. 1.65' : 'např. 1.65'}
                required
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-sm font-semibold tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="custom-odds-draw" className="block text-xs font-semibold text-slate-300">
                {isEn ? 'Draw Odds (optional)' : 'Kurz Remíza (volitelné)'}
              </label>
              <input
                id="custom-odds-draw"
                type="text"
                inputMode="decimal"
                value={oddsDrawRaw}
                onChange={(e) => setOddsDrawRaw(e.target.value)}
                placeholder={
                  isTwoWaySport
                    ? isEn
                      ? 'Leave blank'
                      : 'Nechte prázdné'
                    : isEn
                    ? 'e.g. 3.40'
                    : 'např. 3.40'
                }
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-sm font-semibold tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="custom-odds-away" className="block text-xs font-semibold text-slate-300">
                {isEn ? 'Odds Player/Team 2' : 'Kurz Hráč/Tým 2'}
              </label>
              <input
                id="custom-odds-away"
                type="text"
                inputMode="decimal"
                value={oddsAwayRaw}
                onChange={(e) => setOddsAwayRaw(e.target.value)}
                placeholder={isEn ? 'e.g. 2.15' : 'např. 2.15'}
                required
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-sm font-semibold tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Optional Comparison Odds */}
          <div>
            <label htmlFor="custom-comparison-odds" className="block text-xs font-semibold text-slate-300">
              {isEn
                ? 'Comparison / market average odds on favorite (optional)'
                : 'Srovnávací / průměrný kurz na favorita z jiné sázkovky (volitelné)'}
            </label>
            <input
              id="custom-comparison-odds"
              type="text"
              inputMode="decimal"
              value={comparisonOddsRaw}
              onChange={(e) => setComparisonOddsRaw(e.target.value)}
              placeholder={
                isEn
                  ? 'e.g. 1.55 (if empty, Value will be 0%)'
                  : 'např. 1.55 (pokud nevyplníte, Value bude 0 %)'
              }
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-3.5 font-mono text-sm font-semibold tabular-nums text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {/* Live Fair Probability & Margin Preview */}
          <div className="rounded-xl border border-slate-800 bg-[#090D16] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Calculator className="h-4 w-4 text-emerald-400" />
                <span>
                  {isEn ? 'Automatic Fair Probability & Margin' : 'Automatický výpočet bez marže'}
                </span>
              </span>
              {liveMetrics && marginQuality && (
                <span className={`font-mono text-xs font-semibold tabular-nums ${marginQuality.cls}`}>
                  {isEn ? 'Margin' : 'Marže'}:{' '}
                  {formatPercent(liveMetrics.bookmakerMarginPct, false, language)}
                </span>
              )}
            </div>

            {!liveMetrics ? (
              <p className="mt-2 text-xs text-slate-400">
                {isEn
                  ? 'Enter odds for both players / teams and the calculator will automatically strip bookmaker margin.'
                  : 'Zadejte kurzy pro oba hráče / týmy a kalkulačka ihned očistí kurzy od marže sázkovky.'}
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2">
                    <span className="block truncate text-[11px] text-slate-400">
                      {homeTeam.trim() || (isEn ? 'Player / Team 1' : 'Hráč / Tým 1')}
                    </span>
                    <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-slate-100">
                      {formatPercent(liveMetrics.fairProbHome, false, language)}
                    </span>
                  </div>

                  {liveMetrics.fairProbDraw !== null && (
                    <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2">
                      <span className="block text-[11px] text-slate-400">
                        {isEn ? 'Draw' : 'Remíza'}
                      </span>
                      <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-slate-100">
                        {formatPercent(liveMetrics.fairProbDraw, false, language)}
                      </span>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-800/80 bg-[#111827] px-3 py-2">
                    <span className="block truncate text-[11px] text-slate-400">
                      {awayTeam.trim() || (isEn ? 'Player / Team 2' : 'Hráč / Tým 2')}
                    </span>
                    <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-slate-100">
                      {formatPercent(liveMetrics.fairProbAway, false, language)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs">
                  <span className={marginQuality?.cls}>{marginQuality?.label}</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {isEn ? 'Favorite:' : 'Favorit:'}{' '}
                    <strong className="text-emerald-300">
                      {liveMetrics.favoriteSide === 'home'
                        ? homeTeam.trim() || (isEn ? 'Player 1' : 'Hráč 1')
                        : awayTeam.trim() || (isEn ? 'Player 2' : 'Hráč 2')}
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
                      {formatPercent(liveMetrics.valueScore, true, language)}
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
              {isEn ? 'Cancel' : 'Zrušit'}
            </button>
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>{isEn ? 'Save & Add to Analysis' : 'Uložit a přidat do analýzy'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
