import { EstimatedRiskBadge, RiskLevel, SportFilter, TimeWindow } from '../types/betting';
import { AppLanguage } from './LanguageContext';

const SPORT_LABELS_EN: Record<SportFilter, string> = {
  Vše: 'All',
  Fotbal: 'Football',
  Hokej: 'Hockey',
  Tenis: 'Tennis',
  MMA: 'MMA',
  Basketbal: 'Basketball',
  'Ping-pong': 'Table Tennis',
  Šipky: 'Darts',
  Ostatní: 'Other',
};

const TIME_WINDOW_LABELS_EN: Record<TimeWindow | 'Vše', string> = {
  Vše: 'All',
  Dnes: 'Today',
  Zítra: 'Tomorrow',
  Víkend: 'Weekend',
};

const RISK_LEVEL_LABELS_EN: Record<RiskLevel | 'Vlastní', string> = {
  Konzervativní: 'Conservative',
  Vyvážený: 'Balanced',
  Odvážný: 'Bold',
  Vlastní: 'Custom',
};

const ESTIMATED_RISK_LABELS_EN: Record<EstimatedRiskBadge, string> = {
  Nízké: 'Low',
  Střední: 'Medium',
  Vyšší: 'Higher',
};

const MARKET_LABELS_EN: Record<string, string> = {
  'Výsledek zápasu': 'Match Result (1X2)',
  'Výsledek v zákl. době': 'Regulation Time (1X2)',
  'Výsledek v zákl. době (1X2)': 'Regulation Time (1X2)',
  'Počet gólů v zápase': 'Total Goals',
  'Vítěz zápasu (do rozhodnutí)': 'Moneyline (Incl. OT)',
  'Vítěz zápasu (H2H)': 'Moneyline / Match Winner',
  'Vítěz zápasu': 'Moneyline / Match Winner',
};

const DAY_PREFIX_EN: Record<string, string> = {
  Dnes: 'Today',
  Zítra: 'Tomorrow',
  Pondělí: 'Mon',
  Úterý: 'Tue',
  Středa: 'Wed',
  Čtvrtek: 'Thu',
  Pátek: 'Fri',
  Sobota: 'Sat',
  Neděle: 'Sun',
};

export function translateSport(sport: SportFilter, lang: AppLanguage): string {
  if (lang === 'cs') return sport;
  return SPORT_LABELS_EN[sport] ?? sport;
}

export function translateTimeWindow(win: TimeWindow | 'Vše', lang: AppLanguage): string {
  if (lang === 'cs') return win;
  return TIME_WINDOW_LABELS_EN[win] ?? win;
}

export function translateRiskLevel(level: RiskLevel | 'Vlastní', lang: AppLanguage): string {
  if (lang === 'cs') return level;
  return RISK_LEVEL_LABELS_EN[level] ?? level;
}

export function translateEstimatedRisk(risk: EstimatedRiskBadge, lang: AppLanguage): string {
  if (lang === 'cs') return risk;
  return ESTIMATED_RISK_LABELS_EN[risk] ?? risk;
}

export function translateMarketLabel(label: string, lang: AppLanguage): string {
  if (lang === 'cs') return label;
  return MARKET_LABELS_EN[label] ?? label;
}

export function translateRecommendedPick(pick: string, lang: AppLanguage): string {
  if (lang === 'cs') return pick;
  let out = pick.trim();
  if (/^Výhra\s+/i.test(out)) {
    out = out.replace(/^Výhra\s+/i, 'Win ');
  }
  if (/^Nad\s+/i.test(out)) {
    out = out
      .replace(/^Nad\s+/i, 'Over ')
      .replace(/\s+gólů$/i, ' Goals')
      .replace(/\s+gólu$/i, ' Goals');
  }
  out = out.replace(/\(do rozhodnutí\)/gi, '(Incl. OT)');
  return out;
}

export function localizeKickoffTime(kickoffTime: string, lang: AppLanguage): string {
  if (lang === 'cs') return kickoffTime;
  const trimmed = kickoffTime.trim();
  if (trimmed === 'Vlastní · Dnes') return 'Custom · Today';

  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] in DAY_PREFIX_EN) {
    return `${DAY_PREFIX_EN[parts[0]]} ${parts.slice(1).join(' ')}`;
  }
  return trimmed;
}

export function translateTicketLabel(label: string, lang: AppLanguage): string {
  if (lang === 'cs') return label;
  return label
    .replace(/^Konzervativní double/i, 'Conservative Double')
    .replace(/^Vyvážený mix/i, 'Balanced Mix')
    .replace(/^Konzervativní Value AKO/i, 'Conservative Value Combo')
    .replace(/^Vyvážený Value Bet tiket/i, 'Balanced Value Bet Ticket')
    .replace(/^Jistota \(Konzervativní\)/i, 'Safe (Conservative)')
    .replace(/^Vyvážený \(Smart Value\)/i, 'Balanced (Smart Value)')
    .replace(/^Odvážný \(Vyšší kurz\)/i, 'Bold (High Odds)')
    .replace(/^Vlastní tiket/i, 'Custom Ticket')
    .replace(/Fotbal \+ Hokej/gi, 'Football + Hockey')
    .replace(/Liga mistrů & ATP/gi, 'Champions League & ATP')
    .replace(/(\d+)\s+(zápas|zápasy|zápasů)/gi, (_, n: string) =>
      Number(n) === 1 ? `${n} match` : `${n} matches`
    );
}

export function formatMatchCountLabel(count: number, lang: AppLanguage): string {
  if (lang === 'en') {
    return count === 1 ? '1 match' : `${count} matches`;
  }
  if (count === 1) return '1 zápas';
  if (count >= 2 && count <= 4) return `${count} zápasy`;
  return `${count} zápasů`;
}
