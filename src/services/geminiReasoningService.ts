import { TicketLeg } from '../types/betting';

const LOCAL_STORAGE_REASONS_KEY = 'betedge_gemini_match_reasons_v1';

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
  const trimmedKey = geminiApiKey.trim();
  if (!trimmedKey) {
    throw new Error('Chybí Gemini API klíč.');
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const { tippedTeam, opponentTeam } = resolveTippedAndOpponent(leg);

  const matchContext = {
    sport: leg.sport,
    soutez: leg.league,
    zapas: `${leg.homeTeam} vs. ${leg.awayTeam}`,
    tipovanyTymHrac: tippedTeam,
    souper: opponentTeam,
    doporucenyTip: leg.recommendedPick,
    casVykonu: leg.kickoffTime,
    kurzBetano: leg.betanoOdds,
    prumernyKurzTrhu: leg.marketAvgOdds ?? leg.betanoOdds,
    aiPravdepodobnostPct: leg.aiProbability,
    valuePct: leg.valueScore,
    formaDomaci: leg.formHome?.join('-') ?? 'neuvedena',
    formaHoste: leg.formAway?.join('-') ?? 'neuvedena',
    vzajemnaBilance: leg.h2hSummary ?? 'neuvedena',
  };

  const prompt = [
    `Dnešní datum: ${todayIso}. Použij Google Search (google_search) k ověření aktuálních zpráv o posledních zápasech, sériích, zraněních a absencích obou soupeřů.`,
    `Napiš česky stručné a věcné odůvodnění pro tento konkrétní zápas přesně v této tříodstavcové struktuře (bez markdown hvězdiček a nadpisů):`,
    ``,
    `Aktuální forma ${tippedTeam}: konkrétní poslední výsledky, série, klíčové absence/zranění nebo herní výhoda.`,
    ``,
    `Síla soupeře ${opponentTeam}: proč má soupeř takový kurz, jeho poslední výsledek, absence nebo vzájemná bilance.`,
    ``,
    `Verdikt k tiketu: 1–2 věty, proč má nabízený kurz Betana (${leg.betanoOdds.toFixed(2)}) reálnou hodnotu (Value ${leg.valueScore.toFixed(1)} %) oproti průměru trhu (${(leg.marketAvgOdds ?? leg.betanoOdds).toFixed(2)}).`,
    ``,
    `Data zápasu: ${JSON.stringify(matchContext)}`,
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(
    trimmedKey
  )}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: 'Jsi precizní sportovní analytik. Píšeš výhradně česky, stručně, věcně a bez klišé. Vždy přesně dodrž tříodstavcovou šablonu (Aktuální forma ..., Síla soupeře ..., Verdikt k tiketu:) jako čistý text bez markdownu.',
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      tools: [{ google_search: {} }],
    }),
  });

  const payload = (await response.json()) as GeminiRestResponse;

  if (!response.ok) {
    const errMsg = payload.error?.message || `HTTP ${response.status}`;
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error(`Neplatný nebo zamítnutý Gemini API klíč (${errMsg}). Zkontrolujte ho v Nastavení.`);
    }
    if (response.status === 429) {
      throw new Error('Překročen limit požadavků Gemini API (429). Počkejte prosím chvíli a zkuste to znovu.');
    }
    throw new Error(`Gemini REST API chyba: ${errMsg}`);
  }

  const rawText =
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('\n')
      .replace(/\*\*/g, '')
      .trim() ?? '';

  if (!rawText) {
    throw new Error('Gemini API nevrátilo žádný text analýzy.');
  }

  return rawText;
}
