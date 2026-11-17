import { AppLanguage } from '../i18n/LanguageContext';
import { translateMarketLabel, translateRecommendedPick, translateSport } from '../i18n/translations';
import { TicketLeg } from '../types/betting';

const LOCAL_STORAGE_REASONS_KEY = 'betedge_gemini_match_reasons_v1';
const GEMINI_PER_MODEL_TIMEOUT_MS = 12000;
const GEMINI_MODEL_PRIORITY = [
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
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

export function getCachedReasonForLang(
  reasons: Record<string, string>,
  matchId: string,
  lang: AppLanguage
): string | undefined {
  const scoped = reasons[`${lang}:${matchId}`];
  if (scoped) return scoped;
  if (lang === 'cs') {
    return reasons[matchId];
  }
  return undefined;
}

export function setCachedReasonForLang(
  reasons: Record<string, string>,
  matchId: string,
  lang: AppLanguage,
  text: string
): Record<string, string> {
  return {
    ...reasons,
    [`${lang}:${matchId}`]: text,
  };
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
    .replace(/^(výhra|win)\s+/i, '')
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

function formatLocalizedPercent(value: number, withSign = false, lang: AppLanguage = 'cs'): string {
  const sign = withSign && value > 0 ? '+' : '';
  if (lang === 'en') {
    return `${sign}${value.toFixed(1)}%`;
  }
  return `${sign}${value.toFixed(1).replace('.', ',')} %`;
}

export function buildStatisticalMatchReasoning(
  leg: TicketLeg,
  language: AppLanguage = 'cs'
): string {
  const betanoOddsNum = leg.betanoOdds;
  const marketAvgNum = leg.marketAvgOdds ?? leg.betanoOdds;
  const betanoOdds = betanoOddsNum.toFixed(2);
  const marketAvg = marketAvgNum.toFixed(2);

  const oddsDiffPct = marketAvgNum > 0 ? ((betanoOddsNum - marketAvgNum) / marketAvgNum) * 100 : 0;
  const impliedProb = betanoOddsNum > 0 ? (1 / betanoOddsNum) * 100 : 0;
  const realProb = leg.aiProbability;
  const probEdge = realProb - impliedProb;

  if (language === 'en') {
    const localizedPick = translateRecommendedPick(leg.recommendedPick, 'en');
    const oddsDiffLabel =
      Math.abs(oddsDiffPct) < 0.05
        ? 'in line with the market average'
        : oddsDiffPct > 0
        ? `${formatLocalizedPercent(oddsDiffPct, false, 'en')} higher than the market average`
        : `${formatLocalizedPercent(Math.abs(oddsDiffPct), false, 'en')} lower than the market average`;

    return [
      `Odds & Market: Betano offers ${betanoOdds} on "${localizedPick}", while the market average is ${marketAvg} (${oddsDiffLabel}).`,
      ``,
      `Implied vs. Real Probability: Betano's odds imply a ${formatLocalizedPercent(impliedProb, false, 'en')} chance, while the estimated win probability is ${formatLocalizedPercent(realProb, false, 'en')} (${formatLocalizedPercent(probEdge, true, 'en')} edge).`,
      ``,
      `Ticket Verdict: The resulting mathematical edge is Value ${formatLocalizedPercent(leg.valueScore, true, 'en')}.`,
    ].join('\n');
  }

  const oddsDiffLabel =
    Math.abs(oddsDiffPct) < 0.05
      ? 'shodný s průměrem trhu'
      : oddsDiffPct > 0
      ? `o ${formatLocalizedPercent(oddsDiffPct, false, 'cs')} vyšší než průměr trhu`
      : `o ${formatLocalizedPercent(Math.abs(oddsDiffPct), false, 'cs')} nižší než průměr trhu`;

  return [
    `Kurzy a trh: Betano vypisuje na tip „${leg.recommendedPick}“ kurz ${betanoOdds}, zatímco průměr trhu je ${marketAvg} (kurz je ${oddsDiffLabel}).`,
    ``,
    `Implikovaná vs. reálná šance: Kurz Betana implikuje pravděpodobnost ${formatLocalizedPercent(impliedProb, false, 'cs')}, odhadovaná reálná šance zápasu činí ${formatLocalizedPercent(realProb, false, 'cs')} (rozdíl ${formatLocalizedPercent(probEdge, true, 'cs')}).`,
    ``,
    `Verdikt k tiketu: Výsledná matematická hodnota kurzu činí Value ${formatLocalizedPercent(leg.valueScore, true, 'cs')}.`,
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
  modelUsed?: string;
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
  geminiApiKey: string,
  language: AppLanguage = 'cs'
): Promise<SingleMatchAnalysisResult> {
  const apiKey = geminiApiKey.trim().replace(/\s+/g, '');
  if (!apiKey) {
    return {
      text: buildStatisticalMatchReasoning(leg, language),
      source: 'stats',
      apiStatus: language === 'en' ? 'API key is not set' : 'API klíč není zadaný',
    };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const { tippedTeam, opponentTeam } = resolveTippedAndOpponent(leg);
  const impliedPct = leg.betanoOdds > 0 ? Number(((1 / leg.betanoOdds) * 100).toFixed(1)) : 0;

  const prompt =
    language === 'en'
      ? [
          `You are a precise sports betting analyst. Write strictly in natural English — concise, factual, and free of clichés. Today's date: ${todayIso}.`,
          `Based on the match data provided and your knowledge of the teams/players, their playing style, home/surface advantage, and relative strength, write a concise 3-paragraph English analysis using this exact plain-text structure (no markdown asterisks or headings):`,
          ``,
          `Current form / playing style ${tippedTeam}: evaluate playing style, key strengths, or home/surface advantage.`,
          ``,
          `Opponent strength ${opponentTeam}: explain why the opponent is priced at these odds, their weaknesses, and the matchup balance.`,
          ``,
          `Ticket Verdict: 1-2 sentences explaining why Betano's odds (${leg.betanoOdds.toFixed(2)}) provide real value (Value ${leg.valueScore.toFixed(1)}%) against the market average (${(leg.marketAvgOdds ?? leg.betanoOdds).toFixed(2)}) and estimated probability (${leg.aiProbability.toFixed(1)}%).`,
          ``,
          `Match data: ${JSON.stringify({
            sport: translateSport(leg.sport, 'en'),
            league: leg.league,
            match: `${leg.homeTeam} vs. ${leg.awayTeam}`,
            home: leg.homeTeam,
            away: leg.awayTeam,
            tippedSide: tippedTeam,
            opponent: opponentTeam,
            recommendedPick: translateRecommendedPick(leg.recommendedPick, 'en'),
            market: translateMarketLabel(leg.marketLabel, 'en'),
            kickoff: leg.kickoffTime,
            betanoOdds: leg.betanoOdds,
            marketAvgOdds: leg.marketAvgOdds ?? leg.betanoOdds,
            impliedProbPct: impliedPct,
            estimatedProbPct: leg.aiProbability,
            valuePct: leg.valueScore,
          })}`,
        ].join('\n')
      : [
          `Jsi precizní sportovní analytik. Píšeš výhradně česky, stručně, věcně a bez klišé. Dnešní datum: ${todayIso}.`,
          `Na základě dodaných dat zápasu a tvých znalostí o týmech/hráčích, jejich herním stylu, výhodě domácího prostředí a vzájemné síle napiš stručné, věcné české zdůvodnění přesně v této tříodstavcové struktuře (čistý text bez markdown hvězdiček a nadpisů):`,
          ``,
          `Aktuální forma / herní styl ${tippedTeam}: zhodnoť herní styl, klíčové přednosti nebo výhodu domácího prostředí/povrchu.`,
          ``,
          `Síla soupeře ${opponentTeam}: vysvětli, proč má soupeř takový kurz, jaké má slabiny nebo jaká je vzájemná síla.`,
          ``,
          `Verdikt k tiketu: 1–2 věty, proč má nabízený kurz Betana (${leg.betanoOdds.toFixed(2)}) reálnou hodnotu (Value ${leg.valueScore.toFixed(1)} %) oproti průměru trhu (${(leg.marketAvgOdds ?? leg.betanoOdds).toFixed(2)}) a odhadované pravděpodobnosti (${leg.aiProbability.toFixed(1)} %).`,
          ``,
          `Data zápasu: ${JSON.stringify({
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
          })}`,
        ].join('\n');

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  });

  let lastErrorStatus = language === 'en' ? 'Unknown API error' : 'Neznámá chyba API';

  for (const model of GEMINI_MODEL_PRIORITY) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_PER_MODEL_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: requestBody,
      });

      if (!response.ok) {
        const errDetail = await extractGeminiErrorStatus(response);
        lastErrorStatus = `${model}: ${errDetail}`;
        continue;
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
          (language === 'en' ? 'empty response without text' : 'prázdná odpověď bez textu');
        lastErrorStatus =
          language === 'en'
            ? `${model}: HTTP ${response.status} — Model returned no text (${reason})`
            : `${model}: HTTP ${response.status} — Model nevrátil text (${reason})`;
        continue;
      }

      return { text: rawText, source: 'gemini', modelUsed: model };
    } catch (err) {
      const isTimeout =
        controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
      lastErrorStatus = isTimeout
        ? `${model}: Timeout 12s`
        : language === 'en'
        ? `${model}: Network error (${err instanceof Error ? err.message : 'Failed to fetch'})`
        : `${model}: Síťová chyba (${err instanceof Error ? err.message : 'Failed to fetch'})`;
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    text: buildStatisticalMatchReasoning(leg, language),
    source: 'stats',
    apiStatus: lastErrorStatus,
  };
}
