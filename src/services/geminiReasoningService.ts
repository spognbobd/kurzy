import { TicketLeg } from '../types/betting';

const LOCAL_STORAGE_REASONS_KEY = 'betedge_gemini_match_reasons_v1';
const GEMINI_TIMEOUT_MS = 6000;

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
  tippedIsAway: boolean;
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
    return {
      tippedTeam: cleanAway || leg.awayTeam,
      opponentTeam: cleanHome || leg.homeTeam,
      tippedIsAway: true,
    };
  }
  return {
    tippedTeam: cleanHome || leg.homeTeam,
    opponentTeam: cleanAway || leg.awayTeam,
    tippedIsAway: false,
  };
}

function formatCzPercent(value: number, withSign = false): string {
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1).replace('.', ',')} %`;
}

export function buildStatisticalMatchReasoning(leg: TicketLeg): string {
  const betanoOddsNum = leg.betanoOdds;
  const marketAvgNum = leg.marketAvgOdds ?? leg.betanoOdds;
  const betanoOdds = betanoOddsNum.toFixed(2);
  const marketAvg = marketAvgNum.toFixed(2);

  const oddsDiffPct = marketAvgNum > 0 ? ((betanoOddsNum - marketAvgNum) / marketAvgNum) * 100 : 0;
  const impliedProb = betanoOddsNum > 0 ? (1 / betanoOddsNum) * 100 : 0;
  const realProb = leg.aiProbability;
  const probEdge = realProb - impliedProb;

  const oddsDiffLabel =
    Math.abs(oddsDiffPct) < 0.05
      ? 'shodný s průměrem trhu'
      : oddsDiffPct > 0
      ? `o ${formatCzPercent(oddsDiffPct)} vyšší než průměr trhu`
      : `o ${formatCzPercent(Math.abs(oddsDiffPct))} nižší než průměr trhu`;

  return [
    `Kurzy a trh: Betano vypisuje na tip „${leg.recommendedPick}“ kurz ${betanoOdds}, zatímco průměr trhu je ${marketAvg} (kurz je ${oddsDiffLabel}).`,
    ``,
    `Implikovaná vs. reálná šance: Kurz Betana implikuje pravděpodobnost ${formatCzPercent(impliedProb)}, odhadovaná reálná šance zápasu činí ${formatCzPercent(realProb)} (rozdíl ${formatCzPercent(probEdge, true)}).`,
    ``,
    `Verdikt k tiketu: Výsledná matematická hodnota kurzu činí Value ${formatCzPercent(leg.valueScore, true)}.`,
  ].join('\n');
}

interface GeminiRestResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export interface SingleMatchAnalysisResult {
  text: string;
  source: 'gemini' | 'stats';
  apiStatus?: string;
}

async function extractGeminiErrorStatus(response: Response): Promise<string> {
  try {
    const raw = await response.text();
    if (!raw) {
      return `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    }
    try {
      const parsed = JSON.parse(raw) as GeminiRestResponse;
      const errMsg = parsed.error?.message?.trim();
      const errStatus = parsed.error?.status?.trim();
      if (errMsg) {
        return `HTTP ${response.status}${errStatus ? ` (${errStatus})` : ''}: ${errMsg}`;
      }
    } catch {
      // Fallback to raw text below
    }
    return `HTTP ${response.status}: ${raw.slice(0, 200).trim()}`;
  } catch {
    return `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
  }
}

export async function fetchSingleMatchReasoning(
  leg: TicketLeg,
  geminiApiKey: string
): Promise<SingleMatchAnalysisResult> {
  const apiKey = geminiApiKey.trim().replace(/\s+/g, '');
  if (!apiKey) {
    return {
      text: buildStatisticalMatchReasoning(leg),
      source: 'stats',
      apiStatus: 'API klíč není zadaný',
    };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const { tippedTeam, opponentTeam } = resolveTippedAndOpponent(leg);
  const impliedPct = leg.betanoOdds > 0 ? Number(((1 / leg.betanoOdds) * 100).toFixed(1)) : 0;

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
    implikovanaSancePct: impliedPct,
    realnaSancePct: leg.aiProbability,
    valuePct: leg.valueScore,
  };

  const prompt = [
    `Jsi precizní sportovní analytik. Píšeš výhradně česky, stručně, věcně a bez klišé. Dnešní datum: ${todayIso}.`,
    `Na základě dodaných dat zápasu a tvých znalostí o týmech/hráčích, jejich herním stylu, výhodě domácího prostředí a vzájemné síle napiš stručné, věcné české zdůvodnění přesně v této tříodstavcové struktuře (čistý text bez markdown hvězdiček a nadpisů):`,
    ``,
    `Aktuální forma / herní styl ${tippedTeam}: zhodnoť herní styl, klíčové přednosti nebo výhodu domácího prostředí/povrchu.`,
    ``,
    `Síla soupeře ${opponentTeam}: vysvětli, proč má soupeř takový kurz, jaké má slabiny nebo jaká je vzájemná síla.`,
    ``,
    `Verdikt k tiketu: 1–2 věty, proč má nabízený kurz Betana (${leg.betanoOdds.toFixed(2)}) reálnou hodnotu (Value ${leg.valueScore.toFixed(1)} %) oproti průměru trhu (${(leg.marketAvgOdds ?? leg.betanoOdds).toFixed(2)}) a odhadované pravděpodobnosti (${leg.aiProbability.toFixed(1)} %).`,
    ``,
    `Data zápasu: ${JSON.stringify(matchContext)}`,
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const apiStatus = await extractGeminiErrorStatus(response);
      return {
        text: buildStatisticalMatchReasoning(leg),
        source: 'stats',
        apiStatus,
      };
    }

    const payload = (await response.json()) as GeminiRestResponse;
    const rawText =
      payload.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('\n')
        .replace(/\*\*/g, '')
        .trim() ?? '';

    if (!rawText) {
      const reason =
        payload.promptFeedback?.blockReason ??
        payload.candidates?.[0]?.finishReason ??
        'prázdná odpověď bez textu';
      return {
        text: buildStatisticalMatchReasoning(leg),
        source: 'stats',
        apiStatus: `HTTP ${response.status}: Model nevrátil text (${reason})`,
      };
    }

    return { text: rawText, source: 'gemini' };
  } catch (err) {
    const isTimeout =
      controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
    const apiStatus = isTimeout
      ? 'Timeout 6s'
      : `Síťová chyba: ${err instanceof Error ? err.message : 'Failed to fetch'}`;

    return {
      text: buildStatisticalMatchReasoning(leg),
      source: 'stats',
      apiStatus,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
