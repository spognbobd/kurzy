import { FormResult, MatchAnalysis, RiskLevel, SportCategory, TicketLeg } from '../types/betting';

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

export const BETANO_HOME_URL = 'https://www.betano.cz/';

export function copyMatchForBetano(homeTeam: string, awayTeam: string): string {
  const cleanHome = homeTeam.replace(/\(.*?\)/g, '').trim();
  const cleanAway = awayTeam.replace(/\(.*?\)/g, '').trim();
  const textToCopy = cleanHome || cleanAway;

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

export interface GeneratedTicketResult {
  legs: TicketLeg[];
  totalOdds: number;
  totalProbability: number;
  recommendedStake: number;
  potentialWin: number;
  note: string;
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

/**
 * Generates an optimal ticket matching the selected risk profile & sports.
 * Supports variationIndex to rotate through top valid combinations.
 */
export function generateOptimalTicket(
  matches: MatchAnalysis[],
  selectedSports: SportCategory[],
  riskLevel: RiskLevel,
  budget: number,
  variationIndex = 0
): GeneratedTicketResult | null {
  const pool = matches.filter((m) => selectedSports.includes(m.sport));
  const profile = RISK_PROFILES[riskLevel];
  if (pool.length < 2) return null;

  // Score candidates according to risk preference
  const sortedPool = [...pool].sort((a, b) => {
    if (riskLevel === 'Konzervativní') {
      const scoreA = a.aiProbability * 1.4 + a.valueScore * 2.5 - Math.abs(a.odds.betano - 1.5) * 10;
      const scoreB = b.aiProbability * 1.4 + b.valueScore * 2.5 - Math.abs(b.odds.betano - 1.5) * 10;
      return scoreB - scoreA;
    }
    if (riskLevel === 'Vyvážený') {
      const scoreA = a.valueScore * 3.0 + a.aiProbability * 0.8;
      const scoreB = b.valueScore * 3.0 + b.aiProbability * 0.8;
      return scoreB - scoreA;
    }
    const scoreA = a.valueScore * 2.5 + a.odds.betano * 6 + a.aiProbability * 0.35;
    const scoreB = b.valueScore * 2.5 + b.odds.betano * 6 + b.aiProbability * 0.35;
    return scoreB - scoreA;
  });

  // Cap search pool to top 14 candidates for instant deterministic combination search
  const candidates = sortedPool.slice(0, 14);
  const validCombos: { legs: MatchAnalysis[]; totalOdds: number; jointProb: number; score: number }[] = [];

  const targetMid = (profile.minOdds + profile.maxOdds) / 2;

  function backtrack(start: number, current: MatchAnalysis[], currentOdds: number) {
    if (current.length >= profile.minLegs && current.length <= profile.maxLegs) {
      const inRange =
        riskLevel === 'Odvážný'
          ? currentOdds >= profile.minOdds
          : currentOdds >= profile.minOdds && currentOdds <= profile.maxOdds;

      if (inRange) {
        const jointProb = current.reduce((acc, m) => acc * (m.aiProbability / 100), 1) * 100;
        const avgValue = current.reduce((acc, m) => acc + m.valueScore, 0) / current.length;
        const distPenalty =
          riskLevel === 'Odvážný'
            ? Math.max(0, currentOdds - 22) * 0.5
            : Math.abs(currentOdds - targetMid) * 4;
        const comboScore = avgValue * 3 + jointProb * 0.9 - distPenalty;
        validCombos.push({
          legs: [...current],
          totalOdds: Number(currentOdds.toFixed(2)),
          jointProb: Number(jointProb.toFixed(1)),
          score: comboScore,
        });
      }
    }

    if (current.length === profile.maxLegs || validCombos.length > 220) return;

    for (let i = start; i < candidates.length; i++) {
      const next = candidates[i];
      const nextOdds = currentOdds * next.odds.betano;
      if (riskLevel !== 'Odvážný' && nextOdds > profile.maxOdds * 1.15) continue;
      current.push(next);
      backtrack(i + 1, current, nextOdds);
      current.pop();
    }
  }

  backtrack(0, [], 1);

  if (validCombos.length > 0) {
    validCombos.sort((a, b) => b.score - a.score);
    const chosen = validCombos[variationIndex % Math.min(validCombos.length, 6)];
    const legs = chosen.legs.map(toLeg);
    const recommendedStake = calculateSafeStake(budget, chosen.totalOdds, chosen.jointProb, riskLevel);
    return {
      legs,
      totalOdds: chosen.totalOdds,
      totalProbability: chosen.jointProb,
      recommendedStake,
      potentialWin: Math.round(recommendedStake * chosen.totalOdds),
      note: `Optimální kombinace ${legs.length} zápasů pro profil ${riskLevel} s průměrným Value skóre +${(
        legs.reduce((s, l) => s + l.valueScore, 0) / legs.length
      ).toFixed(1)} %.`,
    };
  }

  // Fallback greedy builder if selected sports subset has fewer tight odds matches
  const desiredCount = Math.min(candidates.length, Math.max(2, profile.minLegs));
  const offset = variationIndex % Math.max(1, candidates.length - desiredCount + 1);
  const picked = candidates.slice(offset, offset + desiredCount);
  let totalOdds = picked.reduce((acc, m) => acc * m.odds.betano, 1);

  for (let i = 0; i < candidates.length && picked.length < profile.maxLegs; i++) {
    const c = candidates[i];
    if (picked.some((p) => p.id === c.id)) continue;
    if (totalOdds < profile.minOdds) {
      picked.push(c);
      totalOdds *= c.odds.betano;
    }
  }

  const finalOdds = Number(totalOdds.toFixed(2));
  const jointProb = Number((picked.reduce((acc, m) => acc * (m.aiProbability / 100), 1) * 100).toFixed(1));
  const recommendedStake = calculateSafeStake(budget, finalOdds, jointProb, riskLevel);

  return {
    legs: picked.map(toLeg),
    totalOdds: finalOdds,
    totalProbability: jointProb,
    recommendedStake,
    potentialWin: Math.round(recommendedStake * finalOdds),
    note: `Nejlepší dostupná kombinace ${picked.length} zápasů pro vybrané sporty (${selectedSports.join(', ')}).`,
  };
}
