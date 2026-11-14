import {
  EstimatedRiskBadge,
  FormResult,
  MatchAnalysis,
  RiskLevel,
  SportCategory,
  TicketLeg,
  TicketStyle,
} from '../types/betting';

export function formatCZK(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatOdds(value: number): string {
  return value.toFixed(2);
}

export function formatPercent(value: number, showSign = false): string {
  const formatted = value.toFixed(1).replace('.', ',');
  if (showSign && value > 0) return `+${formatted} %`;
  return `${formatted} %`;
}

export function formatUpdateTimeLabel(timestampMs: number | null): string | null {
  if (!timestampMs || !Number.isFinite(timestampMs)) return null;
  const dt = new Date(timestampMs);
  const timeStr = dt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const isToday = dt.toDateString() === new Date().toDateString();
  if (isToday) {
    return `Kurzy aktualizovány v ${timeStr}`;
  }
  const dateStr = dt.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
  return `Kurzy aktualizovány ${dateStr} v ${timeStr}`;
}

export const BETANO_HOME_URL = 'https://www.betano.cz/';

export function copyMatchForBetano(
  homeTeam: string,
  awayTeam: string,
  recommendedPick?: string
): string {
  const cleanHome = homeTeam.replace(/\(.*?\)/g, '').trim();
  const cleanAway = awayTeam.replace(/\(.*?\)/g, '').trim();

  let textToCopy = cleanHome || cleanAway;

  if (recommendedPick) {
    const trimmedPick = recommendedPick.trim();
    const isWinPick = /^výhra\s+/i.test(trimmedPick);
    const strippedName = trimmedPick
      .replace(/^výhra\s+/i, '')
      .replace(/\(.*?\)/g, '')
      .trim();
    const lowerStripped = strippedName.toLowerCase();
    const lowerHome = cleanHome.toLowerCase();
    const lowerAway = cleanAway.toLowerCase();

    if (/\(2\)/.test(trimmedPick) && cleanAway) {
      textToCopy = cleanAway;
    } else if (/\(1\)/.test(trimmedPick) && cleanHome) {
      textToCopy = cleanHome;
    } else if (isWinPick && strippedName) {
      if (lowerAway && (lowerAway === lowerStripped || lowerAway.includes(lowerStripped))) {
        textToCopy = cleanAway;
      } else if (lowerHome && (lowerHome === lowerStripped || lowerHome.includes(lowerStripped))) {
        textToCopy = cleanHome;
      } else {
        textToCopy = strippedName;
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(textToCopy).catch(() => {
      fallbackCopyText(textToCopy);
    });
  } else {
    fallbackCopyText(textToCopy);
  }
  return textToCopy;
}

function fallbackCopyText(text: string) {
  if (typeof document === 'undefined') return;
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  } catch {
    // Ignore clipboard fallback errors
  }
}

/**
 * Calculates weighted form score (0..1) from last 5 matches (most recent last).
 */
export function computeFormStrength(form: FormResult[]): number {
  const weights = [0.12, 0.16, 0.2, 0.24, 0.28];
  let score = 0;
  let weightSum = 0;
  form.forEach((res, idx) => {
    const w = weights[idx] ?? 0.2;
    const pts = res === 'V' ? 1 : res === 'R' ? 0.42 : 0;
    score += pts * w;
    weightSum += w;
  });
  return weightSum > 0 ? score / weightSum : 0.5;
}

/**
 * Computes AI probability (%) and Value Score (%) transparently from
 * last-5 form, H2H record, and market consensus vs bookmaker odds.
 */
export function evaluateMatchModel(params: {
  betanoOdds: number;
  marketAvgOdds: number;
  formHome: FormResult[];
  formAway: FormResult[];
  h2hHomeWins: number;
  h2hDraws: number;
  h2hAwayWins: number;
  pickSide: 'home' | 'away' | 'over';
  baseCalibrationOffset?: number;
}): { aiProbability: number; impliedProbability: number; valueScore: number } {
  const {
    betanoOdds,
    marketAvgOdds,
    formHome,
    formAway,
    h2hHomeWins,
    h2hDraws,
    h2hAwayWins,
    pickSide,
    baseCalibrationOffset = 0,
  } = params;

  const impliedProbability = Number(((1 / betanoOdds) * 100).toFixed(1));
  const marketConsensusProb = (1 / marketAvgOdds) * 100 * 0.945; // remove ~5.5% market overround

  const homeForm = computeFormStrength(formHome);
  const awayForm = computeFormStrength(formAway);
  const formDiff = homeForm - awayForm;

  const h2hTotal = Math.max(1, h2hHomeWins + h2hDraws + h2hAwayWins);
  const h2hEdge = (h2hHomeWins - h2hAwayWins) / h2hTotal;

  let rawAiProb = marketConsensusProb;
  if (pickSide === 'home') {
    rawAiProb = marketConsensusProb + formDiff * 8.5 + h2hEdge * 4.5 + baseCalibrationOffset;
  } else if (pickSide === 'away') {
    rawAiProb = marketConsensusProb - formDiff * 8.5 - h2hEdge * 4.5 + baseCalibrationOffset;
  } else {
    // Totals/Over market scales with combined offensive form activity
    const combinedTempo = (homeForm + awayForm) / 2;
    rawAiProb = marketConsensusProb + (combinedTempo - 0.5) * 9.0 + baseCalibrationOffset;
  }

  const aiProbability = Number(Math.min(89, Math.max(18, rawAiProb)).toFixed(1));
  const valueScore = Number((((aiProbability / 100) * betanoOdds - 1) * 100).toFixed(1));

  return {
    aiProbability,
    impliedProbability,
    valueScore,
  };
}

export interface CustomMatchMetrics {
  fairProbHome: number;
  fairProbDraw: number | null;
  fairProbAway: number;
  bookmakerMarginPct: number;
  favoriteSide: 'home' | 'away';
  favoriteOdds: number;
  favoriteFairProb: number;
  favoriteImpliedProb: number;
  valueScore: number;
  marketAvgOdds: number;
}

/**
 * Strips bookmaker margin from 2-way or 3-way odds and computes fair probabilities,
 * margin %, and optional Value % against a comparison bookmaker's favorite odds.
 */
export function calculateCustomMatchMetrics(params: {
  oddsHome: number;
  oddsDraw?: number | null;
  oddsAway: number;
  comparisonFavoriteOdds?: number | null;
}): CustomMatchMetrics | null {
  const { oddsHome, oddsDraw, oddsAway, comparisonFavoriteOdds } = params;
  if (!(oddsHome > 1.01) || !(oddsAway > 1.01)) return null;

  const hasDraw = typeof oddsDraw === 'number' && Number.isFinite(oddsDraw) && oddsDraw > 1.01;
  const rawHome = 1 / oddsHome;
  const rawDraw = hasDraw ? 1 / (oddsDraw as number) : 0;
  const rawAway = 1 / oddsAway;
  const overround = rawHome + rawDraw + rawAway;

  if (!(overround > 0)) return null;

  const bookmakerMarginPct = Number(((overround - 1) * 100).toFixed(1));
  const fairProbHome = Number(((rawHome / overround) * 100).toFixed(1));
  const fairProbAway = Number(((rawAway / overround) * 100).toFixed(1));
  const fairProbDraw = hasDraw ? Number(((rawDraw / overround) * 100).toFixed(1)) : null;

  const favoriteSide: 'home' | 'away' = fairProbHome >= fairProbAway ? 'home' : 'away';
  const favoriteOdds = Number((favoriteSide === 'home' ? oddsHome : oddsAway).toFixed(2));
  const favoriteFairProb = Number(
    Math.min(95, Math.max(5, favoriteSide === 'home' ? fairProbHome : fairProbAway)).toFixed(1)
  );
  const favoriteImpliedProb = Number(((1 / favoriteOdds) * 100).toFixed(1));

  const hasComparison =
    typeof comparisonFavoriteOdds === 'number' &&
    Number.isFinite(comparisonFavoriteOdds) &&
    comparisonFavoriteOdds > 1.01;

  const valueScore = hasComparison
    ? Number((((favoriteOdds / (comparisonFavoriteOdds as number)) - 1) * 100).toFixed(1))
    : 0;

  const marketAvgOdds = hasComparison
    ? Number((comparisonFavoriteOdds as number).toFixed(2))
    : favoriteOdds;

  return {
    fairProbHome,
    fairProbDraw,
    fairProbAway,
    bookmakerMarginPct,
    favoriteSide,
    favoriteOdds,
    favoriteFairProb,
    favoriteImpliedProb,
    valueScore,
    marketAvgOdds,
  };
}

export const RISK_PROFILES: Record<
  RiskLevel,
  {
    label: RiskLevel;
    subtitle: string;
    minLegs: number;
    maxLegs: number;
    minOdds: number;
    maxOdds: number;
    maxBankrollPct: number;
    kellyFraction: number;
  }
> = {
  Konzervativní: {
    label: 'Konzervativní',
    subtitle: '2–3 zápasy s vysokou pravděpodobností · celkový kurz 2.0–3.0',
    minLegs: 2,
    maxLegs: 3,
    minOdds: 2.0,
    maxOdds: 3.05,
    maxBankrollPct: 0.05,
    kellyFraction: 0.25,
  },
  Vyvážený: {
    label: 'Vyvážený',
    subtitle: '3–4 zápasy s optimálním poměrem rizika · celkový kurz 3.5–6.0',
    minLegs: 3,
    maxLegs: 4,
    minOdds: 3.5,
    maxOdds: 6.0,
    maxBankrollPct: 0.03,
    kellyFraction: 0.2,
  },
  Odvážný: {
    label: 'Odvážný',
    subtitle: '4–6 zápasů s vysokým potenciálem · celkový kurz nad 8.0',
    minLegs: 4,
    maxLegs: 6,
    minOdds: 8.0,
    maxOdds: 28.0,
    maxBankrollPct: 0.015,
    kellyFraction: 0.12,
  },
};

export function calculateSafeStake(
  budget: number,
  totalOdds: number,
  jointProbabilityPct: number,
  riskLevel: RiskLevel | 'Vlastní'
): number {
  const safeBudget = Math.max(5, budget);
  const p = jointProbabilityPct / 100;
  const b = Math.max(0.1, totalOdds - 1);
  const kelly = Math.max(0, (b * p - (1 - p)) / b);

  const profile = riskLevel === 'Vlastní' ? RISK_PROFILES.Vyvážený : RISK_PROFILES[riskLevel];
  const fractionalKelly = kelly * profile.kellyFraction;
  const baselinePct =
    riskLevel === 'Konzervativní' ? 0.03 : riskLevel === 'Vyvážený' ? 0.02 : 0.01;

  const pct = Math.min(profile.maxBankrollPct, Math.max(baselinePct * 0.6, fractionalKelly || baselinePct));
  const rawStake = safeBudget * pct;
  if (rawStake < 50) {
    return Math.max(5, Math.round(rawStake));
  }
  return Math.max(5, Math.round(rawStake / 10) * 10);
}

export function calculateModeStake(budget: number, style: TicketStyle): number {
  const safeBudget = Math.max(5, Math.round(budget || 5));
  const pct = style === 'safe' ? 0.1 : style === 'smart_value' ? 0.07 : 0.05;
  const modeMin = style === 'bold' ? 5 : safeBudget >= 10 ? 10 : 5;
  const computed = Math.round(safeBudget * pct);
  return Math.max(5, Math.min(safeBudget, Math.max(modeMin, computed)));
}

export interface GeneratedTicketResult {
  legs: TicketLeg[];
  totalOdds: number;
  totalProbability: number;
  estimatedRisk: EstimatedRiskBadge;
  style: TicketStyle;
  minMatchProbability: number;
  recommendedStake: number;
  potentialWin: number;
  availableCombosCount: number;
  note: string;
}

export function computeEstimatedRisk(totalProbabilityPct: number): EstimatedRiskBadge {
  if (totalProbabilityPct >= 30) return 'Nízké';
  if (totalProbabilityPct >= 15) return 'Střední';
  return 'Vyšší';
}

function toLeg(m: MatchAnalysis): TicketLeg {
  return {
    matchId: m.id,
    sport: m.sport,
    league: m.league,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    kickoffTime: m.kickoffTime,
    recommendedPick: m.recommendedPick,
    marketLabel: m.marketLabel,
    betanoOdds: m.odds.betano,
    aiProbability: m.aiProbability,
    valueScore: m.valueScore,
  };
}

export interface GenerateTicketOptions {
  ticketStyle?: TicketStyle;
  minMatchProbability?: number;
}

/**
 * Generates an optimal ticket matching one of the 3 unified generator modes:
 * - 'safe' (Jistota): 1-2 highest-probability matches, ~10% budget (min 10 Kč)
 * - 'smart_value' (Vyvážený): 2-3 balanced +EV matches, ~7% budget (min 10 Kč)
 * - 'bold' (Odvážný): 3-4 highest-odds & highest Value % matches, ~5% budget (min 5 Kč)
 */
export function generateOptimalTicket(
  matches: MatchAnalysis[],
  selectedSports: SportCategory[],
  ticketStyle: TicketStyle,
  budget: number,
  variationIndex = 0,
  options: GenerateTicketOptions = {}
): GeneratedTicketResult | null {
  const minMatchProbability = Math.min(85, Math.max(25, options.minMatchProbability ?? 55));

  const sportPool = matches.filter((m) => selectedSports.includes(m.sport));
  const eligible = sportPool.filter((m) => m.aiProbability >= minMatchProbability);
  if (eligible.length === 0) return null;

  const isLowProbCapped = ticketStyle === 'smart_value' && minMatchProbability < 45;

  let candidatePool: MatchAnalysis[];
  let minLegs: number;
  let maxLegs: number;

  if (ticketStyle === 'safe') {
    // Jistota (Konzervativní): 1-2 matches with highest win probability
    candidatePool = [...eligible].sort((a, b) => {
      const marketEdgeA = ((a.odds.betano - a.odds.marketAvg) / Math.max(1, a.odds.marketAvg)) * 100;
      const marketEdgeB = ((b.odds.betano - b.odds.marketAvg) / Math.max(1, b.odds.marketAvg)) * 100;
      const scoreA = a.aiProbability * 3.0 + marketEdgeA * 1.2 + Math.max(0, a.valueScore) * 0.6;
      const scoreB = b.aiProbability * 3.0 + marketEdgeB * 1.2 + Math.max(0, b.valueScore) * 0.6;
      return scoreB - scoreA;
    });
    minLegs = 1;
    maxLegs = Math.min(2, candidatePool.length);
  } else if (ticketStyle === 'smart_value') {
    // Vyvážený (Smart Value): 2-3 matches combining good probability and positive Value %
    const positiveEligible = eligible.filter((m) => m.valueScore > 0);
    const basePool = positiveEligible.length >= 2 ? positiveEligible : eligible;

    candidatePool = [...basePool].sort((a, b) => {
      const marketEdgeA = ((a.odds.betano - a.odds.marketAvg) / Math.max(1, a.odds.marketAvg)) * 100;
      const marketEdgeB = ((b.odds.betano - b.odds.marketAvg) / Math.max(1, b.odds.marketAvg)) * 100;
      const scoreA = a.valueScore * 3.0 + a.aiProbability * 0.9 + marketEdgeA * 1.2;
      const scoreB = b.valueScore * 3.0 + b.aiProbability * 0.9 + marketEdgeB * 1.2;
      return scoreB - scoreA;
    });

    minLegs = isLowProbCapped ? 1 : Math.min(2, candidatePool.length);
    maxLegs = Math.min(isLowProbCapped ? 2 : 3, candidatePool.length);
  } else {
    // Odvážný (Vyšší kurz): 3-4 matches with highest total odds and highest Value %
    candidatePool = [...eligible].sort((a, b) => {
      const scoreA = a.odds.betano * 15 + a.valueScore * 3.2 - a.aiProbability * 0.12;
      const scoreB = b.odds.betano * 15 + b.valueScore * 3.2 - b.aiProbability * 0.12;
      return scoreB - scoreA;
    });
    minLegs = Math.min(3, candidatePool.length);
    maxLegs = Math.min(4, candidatePool.length);
  }

  const candidates = candidatePool.slice(0, 14);
  const validCombos: { legs: MatchAnalysis[]; totalOdds: number; jointProb: number; score: number }[] = [];

  function backtrack(start: number, current: MatchAnalysis[], currentOdds: number) {
    if (current.length >= minLegs && current.length <= maxLegs) {
      const jointProb = current.reduce((acc, m) => acc * (m.aiProbability / 100), 1) * 100;
      const avgProb = current.reduce((acc, m) => acc + m.aiProbability, 0) / current.length;
      const avgValue = current.reduce((acc, m) => acc + m.valueScore, 0) / current.length;
      const avgMarketDiff =
        current.reduce(
          (acc, m) => acc + ((m.odds.betano - m.odds.marketAvg) / Math.max(1, m.odds.marketAvg)) * 100,
          0
        ) / current.length;

      let comboScore: number;
      if (ticketStyle === 'safe') {
        // Favor 2 safe legs when both are solid, while keeping 1-leg solo options in variations
        const twoLegBonus = current.length === 2 && minMatchProbability >= 45 ? 16 : 0;
        comboScore = avgProb * 2.2 + jointProb * 0.7 + avgMarketDiff * 1.0 + Math.max(0, avgValue) * 0.6 + twoLegBonus;
      } else if (ticketStyle === 'smart_value') {
        const threeLegBonus = current.length === 3 && !isLowProbCapped ? 6 : 0;
        comboScore = avgValue * 3.4 + avgMarketDiff * 1.3 + jointProb * 0.85 + threeLegBonus;
      } else {
        const legBonus = current.length === 4 ? 14 : current.length === 3 ? 8 : 0;
        comboScore = Math.log(Math.max(1.1, currentOdds)) * 42 + avgValue * 3.0 + legBonus;
      }

      validCombos.push({
        legs: [...current],
        totalOdds: Number(currentOdds.toFixed(2)),
        jointProb: Number(jointProb.toFixed(1)),
        score: comboScore,
      });
    }

    if (current.length === maxLegs || validCombos.length > 260) return;

    for (let i = start; i < candidates.length; i++) {
      const next = candidates[i];
      current.push(next);
      backtrack(i + 1, current, currentOdds * next.odds.betano);
      current.pop();
    }
  }

  backtrack(0, [], 1);

  validCombos.sort((a, b) => b.score - a.score);
  const rotationLimit = Math.min(validCombos.length, 12);
  const chosen =
    validCombos.length > 0
      ? validCombos[variationIndex % rotationLimit]
      : {
          legs: candidates.slice(0, Math.max(1, minLegs)),
          totalOdds: Number(
            candidates
              .slice(0, Math.max(1, minLegs))
              .reduce((acc, m) => acc * m.odds.betano, 1)
              .toFixed(2)
          ),
          jointProb: Number(
            (
              candidates
                .slice(0, Math.max(1, minLegs))
                .reduce((acc, m) => acc * (m.aiProbability / 100), 1) * 100
            ).toFixed(1)
          ),
          score: 0,
        };

  const legs = chosen.legs.map(toLeg);
  const recommendedStake = calculateModeStake(budget, ticketStyle);
  const estimatedRisk = computeEstimatedRisk(chosen.jointProb);
  const avgValue = legs.reduce((s, l) => s + l.valueScore, 0) / legs.length;

  let note: string;
  if (ticketStyle === 'safe') {
    note = `Režim Jistota (Konzervativní): ${legs.length} ${
      legs.length === 1 ? 'nejbezpečnější zápas' : 'nejbezpečnější zápasy'
    } s nejvyšší šancí na výhru nad ${minMatchProbability} %.`;
  } else if (ticketStyle === 'smart_value') {
    note = isLowProbCapped
      ? `Režim Vyvážený (Smart Value) omezen na ${
          legs.length === 1 ? 'sólo (1 zápas)' : 'double (2 zápasy)'
        } kvůli limitu pod 45 % (Value ${formatPercent(avgValue, true)}).`
      : `Režim Vyvážený (Smart Value): ${legs.length} ${
          legs.length <= 4 ? 'zápasy' : 'zápasů'
        } kombinující šanci nad ${minMatchProbability} % a průměrné Value ${formatPercent(avgValue, true)}.`;
  } else {
    note = `Režim Odvážný (Vyšší kurz): ${legs.length} ${
      legs.length <= 4 ? 'zápasy' : 'zápasů'
    } s nejvyšším kurzem a odchylkou Value ${formatPercent(avgValue, true)}.`;
  }

  return {
    legs,
    totalOdds: chosen.totalOdds,
    totalProbability: chosen.jointProb,
    estimatedRisk,
    style: ticketStyle,
    minMatchProbability,
    recommendedStake,
    potentialWin: Math.round(recommendedStake * chosen.totalOdds),
    availableCombosCount: rotationLimit,
    note,
  };
}
