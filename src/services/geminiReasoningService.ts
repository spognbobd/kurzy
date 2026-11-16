import { TicketLeg } from '../types/betting';

const SESSION_CACHE_KEY = 'betedge_gemini_leg_reasons_v2';

function getKeyFingerprint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return '';
  return `${trimmed.slice(0, 6)}:${trimmed.length}`;
}

export function getLegReasonCacheKey(leg: TicketLeg, apiKey: string): string {
  return `${getKeyFingerprint(apiKey)}::${leg.matchId}::${leg.recommendedPick}::${leg.betanoOdds.toFixed(2)}`;
}

export function loadCachedLegReasons(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveCachedLegReasons(reasons: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(reasons));
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

interface ParsedReasonItem {
  matchId?: string;
  reasoning?: string;
}

function extractJsonReasons(rawText: string): Record<string, string> {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const tryParse = (text: string): Record<string, string> => {
    const parsed = JSON.parse(text) as {
      reasons?: ParsedReasonItem[] | Record<string, string>;
    };
    const out: Record<string, string> = {};
    if (parsed && Array.isArray(parsed.reasons)) {
      for (const item of parsed.reasons) {
        if (
          item &&
          typeof item.matchId === 'string' &&
          typeof item.reasoning === 'string' &&
          item.reasoning.trim()
        ) {
          out[item.matchId] = item.reasoning.trim();
        }
      }
    } else if (parsed && parsed.reasons && typeof parsed.reasons === 'object') {
      for (const [k, v] of Object.entries(parsed.reasons)) {
        if (typeof v === 'string' && v.trim()) {
          out[k] = v.trim();
        }
      }
    }
    return out;
  };

  try {
    return tryParse(cleaned);
  } catch {
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx >= 0 && endIdx > startIdx) {
      try {
        return tryParse(cleaned.slice(startIdx, endIdx + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

export async function fetchTicketLegsReasoning(
  legs: TicketLeg[],
  geminiApiKey: string,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const trimmedKey = geminiApiKey.trim();
  if (!trimmedKey || legs.length === 0) return {};

  const todayIso = new Date().toISOString().slice(0, 10);
  const legDescriptors = legs.map((leg) => {
    const { tippedTeam, opponentTeam } = resolveTippedAndOpponent(leg);
    return {
      matchId: leg.matchId,
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
  });

  const prompt = [
    `Dnešní datum: ${todayIso}. Použij Google Search (google_search) k ověření aktuálních zpráv o posledních zápasech, sériích, zraněních a absencích obou soupeřů.`,
    `Pro KAŽDÝ zápas ze seznamu níže napiš česky stručné a věcné odůvodnění přesně v této struktuře se třemi odstavci:`,
    `Aktuální forma [tipovanyTymHrac]: konkrétní poslední výsledky, série, klíčové absence/zranění nebo herní výhoda.`,
    ``,
    `Síla soupeře [souper]: proč má soupeř takový kurz, jeho poslední výsledek, absence nebo vzájemná bilance.`,
    ``,
    `Verdikt k tiketu: 1–2 věty, proč má nabízený kurz Betana reálnou hodnotu (Value) oproti průměru trhu a šanci.`,
    `Nahraď [tipovanyTymHrac] a [souper] konkrétními jmény z dat zápasu (bez hranatých závorek). Nepiš žádnou obecnou omáčku ani markdown nadpisy.`,
    `Vrať VÝHRADNĚ čistý JSON objekt bez markdown bloků ve tvaru: {"reasons":[{"matchId":"...","reasoning":"Aktuální forma ...:\\n\\nSíla soupeře ...:\\n\\nVerdikt k tiketu: ..."}]}`,
    `Zápasy: ${JSON.stringify(legDescriptors)}`,
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
            text: 'Jsi precizní sportovní analytik. Píšeš výhradně česky, věcně a bez klišé. Vždy dodržuješ přesně zadanou tříodstavcovou šablonu (Aktuální forma ..., Síla soupeře ..., Verdikt k tiketu:) a vracíš validní JSON.',
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
      throw new Error('Dočasně vyčerpána kvóta Gemini API (429). Zkuste to za chvíli znovu.');
    }
    throw new Error(`Gemini REST API chyba: ${errMsg}`);
  }

  const rawText =
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('\n')
      .trim() ?? '';

  const parsed = extractJsonReasons(rawText);
  if (Object.keys(parsed).length === 0) {
    throw new Error('Gemini API nevrátilo čitelné zdůvodnění zápasů.');
  }
  return parsed;
}
