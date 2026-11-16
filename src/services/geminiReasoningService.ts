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

export function buildStatisticalMatchReasoning(leg: TicketLeg): string {
  const { tippedTeam, opponentTeam, tippedIsAway } = resolveTippedAndOpponent(leg);
  const betanoOdds = leg.betanoOdds.toFixed(2);
  const marketAvgNum = leg.marketAvgOdds ?? leg.betanoOdds;
  const marketAvg = marketAvgNum.toFixed(2);
  const probStr = `${leg.aiProbability.toFixed(1).replace('.', ',')} %`;
  const impliedStr = `${((1 / leg.betanoOdds) * 100).toFixed(1).replace('.', ',')} %`;
  const valueStr = `${leg.valueScore > 0 ? '+' : ''}${leg.valueScore.toFixed(1).replace('.', ',')} %`;

  const tippedForm = (tippedIsAway ? leg.formAway : leg.formHome)?.join('-') ?? 'vyrovnaná';
  const oppForm = (tippedIsAway ? leg.formHome : leg.formAway)?.join('-') ?? 'vyrovnaná';
  const h2hNote = leg.h2hSummary ? ` (${leg.h2hSummary})` : '';

  const verdictLine =
    leg.betanoOdds > marketAvgNum
      ? `Verdikt k tiketu: Kurz Betana ${betanoOdds} leží nad průměrem trhu (${marketAvg}) a při odhadované pravděpodobnosti výhry ${probStr} generuje hodnotu Value ${valueStr}.`
      : `Verdikt k tiketu: Nabízený kurz Betana ${betanoOdds} (průměr trhu ${marketAvg}) odpovídá pravděpodobnosti výhry ${probStr} s výslednou hodnotou Value ${valueStr}.`;

  return [
    `Aktuální forma / herní styl ${tippedTeam}: V soutěži ${leg.league} drží bilanci posledních 5 utkání ${tippedForm}, což pro tip „${leg.recommendedPick}“ znamená modelovou pravděpodobnost výhry ${probStr} oproti implikované šanci kurzu ${impliedStr}.`,
    ``,
    `Síla soupeře ${opponentTeam}: Soupeř vstupuje do zápasu s formou ${oppForm}${h2hNote}, na základě čehož trh oceňuje zápas průměrným kurzem ${marketAvg}.`,
    ``,
    verdictLine,
  ].join('\n');
}

interface GeminiRestResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export interface SingleMatchAnalysisResult {
  text: string;
  source: 'gemini' | 'stats';
}

export async function fetchSingleMatchReasoning(
  leg: TicketLeg,
  geminiApiKey: string
): Promise<SingleMatchAnalysisResult> {
  const apiKey = geminiApiKey.trim().replace(/\s+/g, '');
  if (!apiKey) {
    return { text: buildStatisticalMatchReasoning(leg), source: 'stats' };
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
      return { text: buildStatisticalMatchReasoning(leg), source: 'stats' };
    }

    const payload = (await response.json()) as GeminiRestResponse;
    const rawText =
      payload.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('\n')
        .replace(/\*\*/g, '')
        .trim() ?? '';

    if (!rawText) {
      return { text: buildStatisticalMatchReasoning(leg), source: 'stats' };
    }

    return { text: rawText, source: 'gemini' };
  } catch {
    // On 6s timeout or any network/CORS error, immediately return clean statistical analysis
    return { text: buildStatisticalMatchReasoning(leg), source: 'stats' };
  } finally {
    clearTimeout(timeoutId);
  }
}
