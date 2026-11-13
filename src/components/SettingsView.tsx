import React, { useEffect, useState } from 'react';
import {
  Check,
  Database,
  KeyRound,
  RefreshCw,
  Shield,
  Smartphone,
} from 'lucide-react';
import { AppSettings } from '../types/betting';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onFetchLiveData: (oddsKey: string, sportsKey: string) => Promise<void>;
  isLoadingLive: boolean;
  liveStatusMessage: string | null;
  liveError: string | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onFetchLiveData,
  isLoadingLive,
  liveStatusMessage,
  liveError,
}) => {
  const [oddsKey, setOddsKey] = useState(settings.theOddsApiKey);
  const [sportsKey, setSportsKey] = useState(settings.apiSportsKey);
  const [bankroll, setBankroll] = useState<number>(settings.initialBankroll);
  const [demoMode, setDemoMode] = useState(settings.demoMode);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setOddsKey(settings.theOddsApiKey);
    setSportsKey(settings.apiSportsKey);
    setBankroll(settings.initialBankroll);
    setDemoMode(settings.demoMode);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedOdds = oddsKey.trim();
    const trimmedSports = sportsKey.trim();
    const safeBankroll = Math.max(5, Math.round(bankroll || 5));
    setBankroll(safeBankroll);

    onUpdateSettings({
      theOddsApiKey: trimmedOdds,
      apiSportsKey: trimmedSports,
      demoMode,
      initialBankroll: safeBankroll,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);

    if (!demoMode) {
      await onFetchLiveData(trimmedOdds, trimmedSports);
    }
  };

  const handleTestAndLoad = async () => {
    const trimmedOdds = oddsKey.trim();
    const trimmedSports = sportsKey.trim();
    const safeBankroll = Math.max(5, Math.round(bankroll || 5));
    setBankroll(safeBankroll);
    setDemoMode(false);
    onUpdateSettings({
      theOddsApiKey: trimmedOdds,
      apiSportsKey: trimmedSports,
      demoMode: false,
      initialBankroll: safeBankroll,
    });
    await onFetchLiveData(trimmedOdds, trimmedSports);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-400">
          Lokální uložení API klíčů v prohlížeči (localStorage), konfigurace bankrollu a instalace PWA
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
          Nastavení a zdroje dat
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* API Keys & Demo Mode Form */}
        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-2xl border border-slate-800/90 bg-[#111827] p-5 sm:p-6 lg:col-span-7"
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-[#0B101B] text-emerald-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-slate-100">
                  API integrace a Demo režim
                </h2>
                <p className="text-xs text-slate-400">
                  Klíče zůstávají výhradně ve vašem prohlížeči (localStorage).
                </p>
              </div>
            </div>
          </div>

          {/* Demo Mode Toggle */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/80 bg-[#0B101B] p-4">
            <div>
              <span className="block text-sm font-semibold text-slate-100">Demo režim</span>
              <span className="mt-0.5 block text-xs text-slate-400">
                Použít realistická ukázková data pro Premier League, Ligu mistrů, Chance Ligu, NHL, Extraligu, ATP/WTA a UFC/Oktagon.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={demoMode}
              onClick={() => {
                const next = !demoMode;
                setDemoMode(next);
                onUpdateSettings({
                  theOddsApiKey: oddsKey.trim(),
                  apiSportsKey: sportsKey.trim(),
                  demoMode: next,
                  initialBankroll: Math.max(5, Math.round(bankroll || 5)),
                });
              }}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                demoMode
                  ? 'border-emerald-500 bg-emerald-500'
                  : 'border-slate-700 bg-slate-800'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  demoMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* The Odds API Key */}
          <div>
            <label htmlFor="odds-api-key" className="block text-sm font-semibold text-slate-100">
              The Odds API klíč (aktuální kurzy)
            </label>
            <p className="mt-0.5 text-xs text-slate-400">
              Slouží ke stahování živých kurzů evropských a světových sázkových kanceláří.
            </p>
            <input
              id="odds-api-key"
              type="password"
              autoComplete="off"
              value={oddsKey}
              onChange={(e) => setOddsKey(e.target.value)}
              placeholder="Zadejte váš The Odds API klíč..."
              className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {/* API-Sports Key */}
          <div>
            <label htmlFor="apisports-key" className="block text-sm font-semibold text-slate-100">
              API-Sports klíč (volitelné statistiky forem & H2H)
            </label>
            <p className="mt-0.5 text-xs text-slate-400">
              Obohacuje fotbalové a hokejové zápasy o skutečnou bilanci posledních 5 utkání.
            </p>
            <input
              id="apisports-key"
              type="password"
              autoComplete="off"
              value={sportsKey}
              onChange={(e) => setSportsKey(e.target.value)}
              placeholder="Volitelný x-apisports-key..."
              className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {/* Initial Bankroll */}
          <div>
            <label htmlFor="initial-bankroll" className="block text-sm font-semibold text-slate-100">
              Počáteční kapitál / Bankroll (Kč)
            </label>
            <input
              id="initial-bankroll"
              type="number"
              min={5}
              step={5}
              value={bankroll}
              onChange={(e) => setBankroll(Number(e.target.value))}
              onBlur={() => setBankroll((b) => Math.max(5, Math.round(b || 5)))}
              className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-base font-bold tabular-nums text-slate-100 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {liveError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              {liveError}
            </div>
          )}

          {liveStatusMessage && !liveError && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
              {liveStatusMessage}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-4 sm:flex-row">
            <button
              type="submit"
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              {savedNotice ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Nastavení uloženo</span>
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  <span>Uložit nastavení</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleTestAndLoad}
              disabled={!oddsKey.trim() || isLoadingLive}
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw className={`h-4 w-4 text-emerald-400 ${isLoadingLive ? 'animate-spin' : ''}`} />
              <span>{isLoadingLive ? 'Stahuji kurzy...' : 'Načíst živé kurzy z API'}</span>
            </button>
          </div>
        </form>

        {/* Right Info & PWA Card */}
        <div className="space-y-4 lg:col-span-5">
          <section className="rounded-2xl border border-slate-800/90 bg-[#111827] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-[#0B101B] text-emerald-400">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-slate-100">
                  Android aplikace (APK & PWA)
                </h2>
                <p className="text-xs text-slate-400">
                  Připraveno pro Android Studio (Capacitor) i přímou instalaci v Chromu
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate-300">
              Projekt obsahuje nativní Android obal <span className="font-mono text-slate-200">cz.betedge.ai</span> ve složce{' '}
              <span className="font-mono text-slate-200">android/</span> pro sestavení souboru <span className="font-mono text-slate-200">.apk</span> /{' '}
              <span className="font-mono text-slate-200">.aab</span> v Android Studiu, a zároveň podporuje okamžitou instalaci jako WebAPK přímo v mobilním prohlížeči Chrome.
            </p>

            <div className="mt-4">
              <PWAInstallButton variant="full" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800/90 bg-[#111827] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-[#0B101B] text-slate-300">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-slate-100">
                  Analytický nástroj, ne automat
                </h2>
                <p className="text-xs text-slate-400">Zodpovědný přístup ke sportovní analýze</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              BetEdge AI slouží výhradně k matematickému vyhodnocení pravděpodobností, porovnání kurzů a správě vlastního bankrollu. Žádné sázky nejsou podávány automaticky — vybraný tiket si vždy ručně zkontrolujete a vsadíte na Betano nebo Tipsport.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
