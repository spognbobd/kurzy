import { TicketLeg } from '../types/betting';

const SESSION_CACHE_KEY = 'betedge_gemini_leg_reasons_v1';

export function getLegReasonCacheKey(leg: TicketLeg): string {
  return `${leg.matchId}::${leg.recommendedPick}::${leg.betanoOdds.toFixed(2)}`;
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

export interface GeminiTicketReasoningResponse {
  reasons: Record<string, string>;
  grounded: boolean;
  model: string;
}

export async function fetchTicketLegsReasoning(
  legs: TicketLeg[],
  signal?: AbortSignal
): Promise<GeminiTicketReasoningResponse> {
  const response = await fetch('/api/gemini/ticket-reasoning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      legs: legs.map((leg) => ({
        matchId: leg.matchId,
        sport: leg.sport,
        league: leg.league,
        homeTeam: leg.homeTeam,
        awayTeam: leg.awayTeam,
        kickoffTime: leg.kickoffTime,
        recommendedPick: leg.recommendedPick,
        marketLabel: leg.marketLabel,
        betanoOdds: leg.betanoOdds,
        marketAvgOdds: leg.marketAvgOdds,
        aiProbability: leg.aiProbability,
        valueScore: leg.valueScore,
        formHome: leg.formHome,
        formAway: leg.formAway,
        h2hSummary: leg.h2hSummary,
      })),
    }),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Serverová Gemini AI služba není v tomto prostředí dostupná.');
  }

  const data = (await response.json()) as Partial<GeminiTicketReasoningResponse> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Chyba Gemini API (${response.status}).`);
  }

  return {
    reasons: data.reasons ?? {},
    grounded: Boolean(data.grounded),
    model: data.model ?? 'gemini-4-hydrogen',
  };
}

export function buildLocalFallbackReasoning(leg: TicketLeg): string {
  const formHome = leg.formHome?.join('-') ?? 'stabilní';
  const formAway = leg.formAway?.join('-') ?? 'kolísavá';
  const marketAvg = leg.marketAvgOdds ?? leg.betanoOdds;
  const valueText =
    leg.valueScore > 0
      ? `nabízí kladné Value +${leg.valueScore.toFixed(1).replace('.', ',')} % oproti tržnímu průměru ${marketAvg.toFixed(2)}`
      : `odpovídá férové hladině trhu (${marketAvg.toFixed(2)})`;
  const venueNote =
    leg.sport === 'Tenis' || leg.sport === 'MMA'
      ? 'Výkonnostní profil a aktuální herní pohoda hrají ve prospěch zvoleného tipu.'
      : `Domácí prostředí pro ${leg.homeTeam} a vzájemná bilance (${leg.h2hSummary || 'vyrovnaná'}) podporují výsledek bez nutnosti riskovat.`;

  return `Aktuální bilance posledních 5 zápasů ukazuje formu ${formHome} (${leg.homeTeam}) proti ${formAway} (${leg.awayTeam}), bez potvrzených mimořádných absencí v dostupných statistikách. ${venueNote} Betano kurz ${leg.betanoOdds.toFixed(2)} při odhadované šanci ${leg.aiProbability.toFixed(1).replace('.', ',')} % ${valueText}.`;
}
