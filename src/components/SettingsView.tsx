import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  Clock,
  Database,
  Globe,
  KeyRound,
  RefreshCw,
  Shield,
  Smartphone,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { AppSettings, NotificationLeadMinutes } from '../types/betting';
import {
  formatUpdateTimeLabel,
  parseAmountInput,
  sanitizeIntegerInput,
} from '../utils/analyticsEngine';
import {
  BrowserNotificationPermission,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from '../services/ticketNotificationService';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onFetchLiveData: (oddsKey: string, sportsKey: string, force?: boolean) => Promise<void>;
  isLoadingLive: boolean;
  liveStatusMessage: string | null;
  liveError: string | null;
  lastUpdatedAt: number | null;
  remainingQuota: string | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onFetchLiveData,
  isLoadingLive,
  liveStatusMessage,
  liveError,
  lastUpdatedAt,
  remainingQuota,
}) => {
  const { language, setLanguage } = useLanguage();
  const isEn = language === 'en';

  const [oddsKey, setOddsKey] = useState(settings.theOddsApiKey);
  const [sportsKey, setSportsKey] = useState(settings.apiSportsKey);
  const [geminiKey, setGeminiKey] = useState((settings.geminiApiKey ?? '').trim());
  const [bankrollInput, setBankrollInput] = useState<string>(() =>
    String(Math.max(5, Math.round(settings.initialBankroll)))
  );
  const [demoMode, setDemoMode] = useState(settings.demoMode);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    Boolean(settings.notificationsEnabled)
  );
  const [notificationLeadMinutes, setNotificationLeadMinutes] = useState<NotificationLeadMinutes>(
    settings.notificationLeadMinutes === 0 ? 0 : 15
  );
  const [permissionState, setPermissionState] = useState<BrowserNotificationPermission>(() =>
    getBrowserNotificationPermission()
  );
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setOddsKey(settings.theOddsApiKey);
    setSportsKey(settings.apiSportsKey);
    setGeminiKey((settings.geminiApiKey ?? '').trim());
    setBankrollInput(String(Math.max(5, Math.round(settings.initialBankroll))));
    setDemoMode(settings.demoMode);
    setNotificationsEnabled(Boolean(settings.notificationsEnabled));
    setNotificationLeadMinutes(settings.notificationLeadMinutes === 0 ? 0 : 15);
    setPermissionState(getBrowserNotificationPermission());
  }, [settings]);

  const buildCurrentSettings = (overrides: Partial<AppSettings> = {}): AppSettings => {
    const safeBankroll = parseAmountInput(bankrollInput, settings.initialBankroll, 5);
    return {
      theOddsApiKey: oddsKey.trim(),
      apiSportsKey: sportsKey.trim(),
      geminiApiKey: geminiKey.trim(),
      demoMode,
      initialBankroll: safeBankroll,
      notificationsEnabled,
      notificationLeadMinutes,
      ...overrides,
    };
  };

  const handleToggleNotifications = async () => {
    const nextEnabled = !notificationsEnabled;
    if (nextEnabled) {
      const perm = await requestBrowserNotificationPermission();
      setPermissionState(perm);
      if (perm === 'denied' || perm === 'unsupported') {
        setNotificationsEnabled(false);
        onUpdateSettings(buildCurrentSettings({ notificationsEnabled: false }));
        return;
      }
      setNotificationsEnabled(true);
      onUpdateSettings(buildCurrentSettings({ notificationsEnabled: true }));
      return;
    }

    setNotificationsEnabled(false);
    onUpdateSettings(buildCurrentSettings({ notificationsEnabled: false }));
  };

  const handleSelectLeadMinutes = (lead: NotificationLeadMinutes) => {
    setNotificationLeadMinutes(lead);
    onUpdateSettings(buildCurrentSettings({ notificationLeadMinutes: lead }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = buildCurrentSettings();
    setBankrollInput(String(next.initialBankroll));
    onUpdateSettings(next);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);

    if (!next.demoMode && next.theOddsApiKey !== settings.theOddsApiKey.trim()) {
      await onFetchLiveData(next.theOddsApiKey, next.apiSportsKey, false);
    }
  };

  const handleTestAndLoad = async () => {
    setDemoMode(false);
    const next = buildCurrentSettings({ demoMode: false });
    setBankrollInput(String(next.initialBankroll));
    onUpdateSettings(next);
    await onFetchLiveData(next.theOddsApiKey, next.apiSportsKey, true);
  };

  const parsedQuota = remainingQuota !== null ? Number(remainingQuota) : null;
  const quotaTone =
    parsedQuota === null || !Number.isFinite(parsedQuota)
      ? 'border-slate-700 bg-[#090D16] text-slate-300'
      : parsedQuota < 20
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
      : parsedQuota < 80
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  const lastUpdateLabel = formatUpdateTimeLabel(lastUpdatedAt, language);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-400">
          {isEn
            ? 'Local browser storage for API keys (localStorage), bankroll setup, language & PWA install'
            : 'Lokální uložení API klíčů v prohlížeči (localStorage), konfigurace bankrollu a instalace PWA'}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
          {isEn ? 'Settings & Data Sources' : 'Nastavení a zdroje dat'}
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
                  {isEn ? 'API Integrations & Demo Mode' : 'API integrace a Demo režim'}
                </h2>
                <p className="text-xs text-slate-400">
                  {isEn
                    ? 'Your keys stay strictly in your browser (localStorage).'
                    : 'Klíče zůstávají výhradně ve vašem prohlížeči (localStorage).'}
                </p>
              </div>
            </div>
          </div>

          {/* App Language Switcher */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-[#0B101B] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#090D16] text-emerald-400">
                <Globe className="h-4 w-4" />
              </div>
              <div>
                <span className="block text-sm font-semibold text-slate-100">
                  {isEn ? 'App Language' : 'Jazyk aplikace'}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {isEn
                    ? 'Applies to UI, AI reasoning, currency/number formatting, and notifications.'
                    : 'Přepíná celé rozhraní, AI rozbory, formátování čísel i oznámení.'}
                </span>
              </div>
            </div>

            <div
              role="radiogroup"
              aria-label={isEn ? 'App Language' : 'Jazyk aplikace'}
              className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-800 bg-[#090D16] p-1 shrink-0"
            >
              <button
                type="button"
                role="radio"
                aria-checked={language === 'cs'}
                onClick={() => setLanguage('cs')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  language === 'cs'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Čeština (CZ)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={language === 'en'}
                onClick={() => setLanguage('en')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  language === 'en'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                English (EN)
              </button>
            </div>
          </div>

          {/* Demo Mode Toggle */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/80 bg-[#0B101B] p-4">
            <div>
              <span className="block text-sm font-semibold text-slate-100">
                {isEn ? 'Demo Mode' : 'Demo režim'}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                {isEn
                  ? 'Use realistic sample data for Premier League, Champions League, Czech league, NHL, Extraliga, ATP/WTA & UFC.'
                  : 'Použít realistická ukázková data pro Premier League, Ligu mistrů, Chance Ligu, NHL, Extraligu, ATP/WTA a UFC/Oktagon.'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={demoMode}
              onClick={() => {
                const next = !demoMode;
                setDemoMode(next);
                onUpdateSettings(buildCurrentSettings({ demoMode: next }));
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

          {/* Browser Notifications Toggle & Lead Time */}
          <div className="space-y-3 rounded-xl border border-slate-800/80 bg-[#0B101B] p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#090D16] text-emerald-400">
                  {permissionState === 'denied' || permissionState === 'unsupported' ? (
                    <BellOff className="h-4 w-4 text-rose-400" />
                  ) : notificationsEnabled && permissionState === 'granted' ? (
                    <BellRing className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Bell className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <div>
                  <span className="block text-sm font-semibold text-slate-100">
                    {isEn
                      ? 'Notifications (match start & wins)'
                      : 'Oznámení (začátek zápasu a výhry)'}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {isEn
                      ? 'Browser alerts only for saved active tickets and wins (completely silent on loss).'
                      : 'Systémové upozornění pouze pro uložené aktivní tikety a výhry (při prohře úplné ticho).'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled && permissionState === 'granted'}
                aria-label={
                  isEn
                    ? 'Notifications (match start & wins)'
                    : 'Oznámení (začátek zápasu a výhry)'
                }
                onClick={() => void handleToggleNotifications()}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                  notificationsEnabled && permissionState === 'granted'
                    ? 'border-emerald-500 bg-emerald-500'
                    : 'border-slate-700 bg-slate-800'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    notificationsEnabled && permissionState === 'granted'
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3">
              <span className="text-xs font-medium text-slate-300">
                {isEn ? 'Notify before kickoff:' : 'Kdy upozornit před zápasem:'}
              </span>
              <div
                role="radiogroup"
                aria-label={
                  isEn ? 'Lead time before kickoff' : 'Čas upozornění před začátkem'
                }
                className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-[#090D16] p-1"
              >
                {(
                  [
                    { value: 15, label: isEn ? '15 min before' : '15 min předem' },
                    { value: 0, label: isEn ? 'At kickoff' : 'Přesně při začátku' },
                  ] as const
                ).map((opt) => {
                  const selected = notificationLeadMinutes === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => handleSelectLeadMinutes(opt.value)}
                      className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        selected
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {permissionState === 'denied' && (
              <p className="text-xs text-rose-300">
                {isEn
                  ? 'Notifications are blocked in your browser. Please enable them in site permissions.'
                  : 'Oprávnění k oznámením je v prohlížeči zablokováno. Povolte notifikace v nastavení stránky.'}
              </p>
            )}
            {permissionState === 'unsupported' && (
              <p className="text-xs text-amber-300">
                {isEn
                  ? 'This browser or environment does not support the Web Notifications API.'
                  : 'Tento prohlížeč nebo prostředí nepodporuje Web Notifications API.'}
              </p>
            )}
          </div>

          {/* The Odds API Key */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="odds-api-key" className="block text-sm font-semibold text-slate-100">
                {isEn ? 'The Odds API Key (live odds)' : 'The Odds API klíč (aktuální kurzy)'}
              </label>
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${quotaTone}`}
              >
                {remainingQuota !== null
                  ? isEn
                    ? `Credits left: ${remainingQuota}`
                    : `Zbývá kreditů: ${remainingQuota}`
                  : isEn
                  ? 'Credits left: —'
                  : 'Zbývá kreditů: —'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {isEn
                ? 'Fetches major Betano competitions only (regions=eu, h2h market, max 5 credits per manual refresh). Cached for 60 minutes.'
                : 'Stahuje výhradně hlavní soutěže dostupné na Betanu (regions=eu, trh h2h, max. 5 kreditů na ruční aktualizaci). Mezipaměť platí 60 minut.'}
            </p>
            <input
              id="odds-api-key"
              type="password"
              autoComplete="off"
              value={oddsKey}
              onChange={(e) => setOddsKey(e.target.value)}
              placeholder={
                isEn ? 'Enter your The Odds API key...' : 'Zadejte váš The Odds API klíč...'
              }
              className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {/* API-Sports Key */}
          <div>
            <label htmlFor="apisports-key" className="block text-sm font-semibold text-slate-100">
              {isEn
                ? 'API-Sports Key (optional form & H2H stats)'
                : 'API-Sports klíč (volitelné statistiky forem & H2H)'}
            </label>
            <p className="mt-0.5 text-xs text-slate-400">
              {isEn
                ? 'Enriches football and hockey matches with real last-5 results.'
                : 'Obohacuje fotbalové a hokejové zápasy o skutečnou bilanci posledních 5 utkání.'}
            </p>
            <input
              id="apisports-key"
              type="password"
              autoComplete="off"
              value={sportsKey}
              onChange={(e) => setSportsKey(e.target.value)}
              placeholder={isEn ? 'Optional x-apisports-key...' : 'Volitelný x-apisports-key...'}
              className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {/* Gemini AI Key */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="gemini-api-key" className="block text-sm font-semibold text-slate-100">
                {isEn
                  ? 'Gemini API Key (optional AI match reasoning)'
                  : 'Gemini API klíč (volitelné AI zdůvodnění tiketů)'}
              </label>
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 font-mono text-xs font-semibold ${
                  geminiKey.trim()
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 bg-[#090D16] text-slate-400'
                }`}
              >
                {geminiKey.trim()
                  ? isEn
                    ? 'Active (Gemini 3.8 Flash)'
                    : 'Aktivní (Gemini 3.8 Flash)'
                  : isEn
                  ? 'Optional (disabled)'
                  : 'Volitelné (vypnuto)'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {isEn
                ? 'Enter a Google AI Studio key to unlock "Show AI Analysis" (Gemini 3.8 Flash) on matches and ticket legs. Without a key, a pure statistical breakdown is shown.'
                : 'Pokud zadáte vlastní klíč z Google AI Studio, zobrazí se u zápasů na tiketu tlačítko „Zobrazit AI analýzu“ (Gemini 3.8 Flash). Bez klíče se zobrazí čistý statistický přehled.'}
            </p>
            <input
              id="gemini-api-key"
              type="password"
              autoComplete="off"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder={
                isEn
                  ? 'Optional Gemini API key (AIza...)...'
                  : 'Volitelný Gemini API klíč (AIza...)...'
              }
              className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {/* Initial Bankroll */}
          <div>
            <label htmlFor="initial-bankroll" className="block text-sm font-semibold text-slate-100">
              {isEn ? 'Initial Capital / Bankroll (CZK)' : 'Počáteční kapitál / Bankroll (Kč)'}
            </label>
            <input
              id="initial-bankroll"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={bankrollInput}
              onChange={(e) => setBankrollInput(sanitizeIntegerInput(e.target.value))}
              className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#090D16] px-4 font-mono text-base font-bold tabular-nums text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {lastUpdateLabel && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-[#0B101B] px-4 py-2.5 text-xs text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-mono tabular-nums">{lastUpdateLabel}</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {isEn ? 'Cache 60 min (0 credits on reload)' : 'Cache 60 min (0 kreditů při obnovení)'}
              </span>
            </div>
          )}

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
                  <span>{isEn ? 'Settings Saved' : 'Nastavení uloženo'}</span>
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  <span>{isEn ? 'Save Settings' : 'Uložit nastavení'}</span>
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
              <span>
                {isLoadingLive
                  ? isEn
                    ? 'Fetching odds...'
                    : 'Stahuji kurzy...'
                  : isEn
                  ? 'Fetch Live Odds'
                  : 'Aktualizovat kurzy z API'}
              </span>
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
                  {isEn ? 'Android App (APK & PWA)' : 'Android aplikace (APK & PWA)'}
                </h2>
                <p className="text-xs text-slate-400">
                  {isEn
                    ? 'Ready for Android Studio (Capacitor) and direct Chrome install'
                    : 'Připraveno pro Android Studio (Capacitor) i přímou instalaci v Chromu'}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate-300">
              {isEn ? (
                <>
                  The project includes a native Android wrapper{' '}
                  <span className="font-mono text-slate-200">cz.betedge.ai</span> in{' '}
                  <span className="font-mono text-slate-200">android/</span> for building{' '}
                  <span className="font-mono text-slate-200">.apk</span> /{' '}
                  <span className="font-mono text-slate-200">.aab</span> bundles in Android Studio,
                  and supports instant WebAPK installation directly in mobile Chrome.
                </>
              ) : (
                <>
                  Projekt obsahuje nativní Android obal{' '}
                  <span className="font-mono text-slate-200">cz.betedge.ai</span> ve složce{' '}
                  <span className="font-mono text-slate-200">android/</span> pro sestavení souboru{' '}
                  <span className="font-mono text-slate-200">.apk</span> /{' '}
                  <span className="font-mono text-slate-200">.aab</span> v Android Studiu, a zároveň
                  podporuje okamžitou instalaci jako WebAPK přímo v mobilním prohlížeči Chrome.
                </>
              )}
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
                  {isEn ? 'Analytical Tool, Not Auto-Betting' : 'Analytický nástroj, ne automat'}
                </h2>
                <p className="text-xs text-slate-400">
                  {isEn
                    ? 'Responsible approach to sports analytics'
                    : 'Zodpovědný přístup ke sportovní analýze'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              {isEn
                ? 'BetEdge AI is designed strictly for mathematical probability evaluation, odds comparison, and bankroll tracking. No bets are placed automatically — you always review and place your ticket manually on Betano or Tipsport.'
                : 'BetEdge AI slouží výhradně k matematickému vyhodnocení pravděpodobností, porovnání kurzů a správě vlastního bankrollu. Žádné sázky nejsou podávány automaticky — vybraný tiket si vždy ručně zkontrolujete a vsadíte na Betano nebo Tipsport.'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
