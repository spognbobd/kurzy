import { TicketLeg } from '../types/betting';

const LOCAL_STORAGE_REASONS_KEY = 'betedge_gemini_match_reasons_v1';

const GEMINI_MODEL_FALLBACK_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
] as const;

export function loadCachedMatchReasons(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_REASONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveCachedMatchReasons(reasons: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_REASONS_KEY, JSON.stringify(reasons));
  } catch {
    // Ignore storage quota errors
  }
}

export function resolveTippedAndOpponent(leg: TicketLeg): {
  tippedTeam: string;
  opponentTeam: string;
} {
  const cleanHome = leg.homeTeam.replace(/\(.*?\)/g, '').trim();
  const cleanAway = leg.awayTeam.replace(/\(.*?\)/g, '').trim();
  const pick = leg.recommendedPick.trim();
  const stripped = pick
    .replace(/^výhra\s+/i, '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .toLowerCase();

  const isAway =
    /\(2\)/.test(pick) ||
    (Boolean(cleanAway) &&
      Boolean(stripped) &&
      (cleanAway.toLowerCase() === stripped || cleanAway.toLowerCase().includes(stripped)));

  if (isAway) {
    return { tippedTeam: cleanAway || leg.awayTeam, opponentTeam: cleanHome || leg.homeTeam };
  }
  return { tippedTeam: cleanHome || leg.homeTeam, opponentTeam: cleanAway || leg.awayTeam };
}

interface GeminiRestResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function fetchSingleMatchReasoning(
  leg: TicketLeg,
  geminiApiKey: string,
  signal?: AbortSignal
): Promise<string> {
  // Always trim and strip stray whitespace/newlines from keys loaded out of localStorage
  const apiKey = geminiApiKey.trim().replace(/\s+/g, '');
  if (!apiKey) {
    throw new Error('Chybí Gemini API klíč.');
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const { tippedTeam, opponentTeam } = resolveTippedAndOpponent(leg);

  const matchContext = {
    sport: leg.sport,
    soutez: leg.league,
    zapas: `${leg.homeTeam} vs. ${leg.awayTeam}`,
    domaci: leg.homeTeam,
    hoste: leg.awayTeam,
    tipovanyTymHrac: tippedTeam,
    souper: opponentTeam,
    doporucenyTip: leg.recommendedPick,
    trh: leg.marketLabel,
    casZapasu: leg.kickoffTime,
    kurzBetano: leg.betanoOdds,
    prumernyKurzTrhu: leg.marketAvgOdds ?? leg.betanoOdds,
    aiPravdepodobnostPct: leg.aiProbability,
    valuePct: leg.valueScore,
    formaDomaciPoslednich5: leg.formHome?.join('-') ?? 'neuvedena',
    formaHostePoslednich5: leg.formAway?.join('-') ?? 'neuvedena',
    vzajemnaBilance: leg.h2hSummary ?? 'neuvedena',
  };

  const prompt = [
    `Jsi precizní sportovní analytik. Píšeš výhradně česky, stručně, věcně a bez klišé. Dnešní datum: ${todayIso}.`,
    `Na základě dodaných dat zápasu a tvých znalostí o týmech/hráčích, jejich herním stylu, výhodě domácího prostředí a vzájemné síle napiš stručné, věcné české zdůvodnění přesně v této tříodstavcové struktuře (čistý text bez markdown hvězdiček a nadpisů):`,
    ``,
    `Aktuální forma / herní styl ${tippedTeam}: zhodnoť dodanou bilanci, herní styl, klíčové přednosti nebo výhodu domácího prostředí/povrchu.`,
    ``,
    `Síla soupeře ${opponentTeam}: vysvětli, proč má soupeř takový kurz, jaké má slabiny nebo jaká je vzájemná bilance a poměr sil.`,
    ``,
    `Verdikt k tiketu: 1–2 věty, proč má nabízený kurz Betana (${leg.betanoOdds.toFixed(2)}) reálnou hodnotu (Value ${leg.valueScore.toFixed(1)} %) oproti průměru trhu (${(leg.marketAvgOdds ?? leg.betanoOdds).toFixed(2)}) a odhadované pravděpodobnosti (${leg.aiProbability.toFixed(1)} %).`,
    ``,
    `Data zápasu: ${JSON.stringify(matchContext)}`,
  ].join('\n');

  // Standard clean REST body with only `contents`
  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  });

  let lastErrorMessage = 'Nepodařilo se spojit s Gemini REST API.';

  for (let i = 0; i < GEMINI_MODEL_FALLBACK_CHAIN.length; i++) {
    const model = GEMINI_MODEL_FALLBACK_CHAIN[i];
    const hasNextFallback = i < GEMINI_MODEL_FALLBACK_CHAIN.length - 1;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: requestBody,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      lastErrorMessage = `Síťová chyba při volání ${model} (${msg}). Zkontrolujte připojení nebo blokování požadavků v prohlížeči.`;
      if (hasNextFallback) continue;
      throw new Error(lastErrorMessage);
    }

    let payload: GeminiRestResponse = {};
    try {
      payload = (await response.json()) as GeminiRestResponse;
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const errMsg = payload.error?.message || `HTTP ${response.status}`;

      if (response.status === 429) {
        throw new Error(
          'Překročen limit požadavků Gemini API (429). Počkejte prosím chvíli a zkuste to znovu.'
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Neplatný nebo zamítnutý Gemini API klíč (${errMsg}). Zkontrolujte ho v Nastavení.`
        );
      }

      lastErrorMessage = `Gemini API (${model}) vrátilo chybu ${response.status}: ${errMsg}`;
      if ((response.status === 404 || response.status === 400) && hasNextFallback) {
        continue;
      }

      if (response.status === 400 && /api key/i.test(errMsg)) {
        throw new Error(`Neplatný Gemini API klíč (${errMsg}). Zkontrolujte ho v Nastavení.`);
      }
      throw new Error(lastErrorMessage);
    }

    const rawText =
      payload.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('\n')
        .replace(/\*\*/g, '')
        .trim() ?? '';

    if (rawText) {
      return rawText;
    }

    lastErrorMessage = `Model ${model} nevrátil žádný text analýzy.`;
    if (hasNextFallback) continue;
  }

  throw new Error(lastErrorMessage);
}
