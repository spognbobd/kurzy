export type SportCategory = 'Fotbal' | 'Hokej' | 'Tenis' | 'MMA';
export type SportFilter = 'Vše' | SportCategory;
export type TimeWindow = 'Dnes' | 'Zítra' | 'Víkend';
export type RiskLevel = 'Konzervativní' | 'Vyvážený' | 'Odvážný';
export type FormResult = 'V' | 'R' | 'P';
export type TicketStatus = 'pending' | 'won' | 'lost';

export interface BookmakerOdds {
  betano: number;
  tipsport: number;
  marketAvg: number;
}

export interface MatchAnalysis {
  id: string;
  sport: SportCategory;
  league: string;
  timeWindow: TimeWindow;
  kickoffTime: string;
  kickoffIso: string;
  homeTeam: string;
  awayTeam: string;
  recommendedPick: string;
  marketLabel: string;
  odds: BookmakerOdds;
  formHome: FormResult[];
  formAway: FormResult[];
  h2hHomeWins: number;
  h2hDraws: number;
  h2hAwayWins: number;
  h2hSummary: string;
  aiProbability: number; // 0 - 100
  impliedProbability: number; // 0 - 100 based on Betano odds
  valueScore: number; // percentage EV e.g. +8.4 or -2.1
  reasoning: string;
  isLiveApi?: boolean;
}

export interface TicketLeg {
  matchId: string;
  sport: SportCategory;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  recommendedPick: string;
  marketLabel: string;
  betanoOdds: number;
  aiProbability: number;
  valueScore: number;
}

export interface Ticket {
  id: string;
  createdAt: string;
  label: string;
  riskLevel: RiskLevel | 'Vlastní';
  legs: TicketLeg[];
  totalOdds: number;
  totalProbability: number;
  recommendedStake: number;
  actualStake: number;
  potentialWin: number;
  status: TicketStatus;
  profit: number;
  source: 'generator' | 'manual';
}

export interface AppSettings {
  theOddsApiKey: string;
  apiSportsKey: string;
  demoMode: boolean;
  initialBankroll: number;
}
