import { FormResult, MatchAnalysis, SportCategory, TimeWindow } from '../types/betting';
import { evaluateMatchModel } from '../utils/analyticsEngine';

interface OddsApiOutcome {
  name: string;
  price: number;
}

interface OddsApiMarket {
  key: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: OddsApiMarket[];
}

interface OddsApiSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

function mapSportGroupOrKey(group: string, sportKey: string, sportTitle: string): SportCategory {
  if (group === 'Soccer') return 'Fotbal';
  if (group === 'Ice Hockey') return 'Hokej';
  if (group === 'Tennis') return 'Tenis';
  if (group === 'Mixed Martial Arts') return 'MMA';
  if (group === 'Basketball') return 'Basketbal';

  const s = `${sportKey} ${sportTitle}`.toLowerCase();
  if (s.includes('basketball') || s.includes('nba') || s.includes('euroleague') || s.includes('ncaab')) {
    return 'Basketbal';
  }
  if (s.includes('hockey') || s.includes('nhl') || s.includes('khl') || s.includes('extraliga') || s.includes('liiga') || s.includes('shl')) {
    return 'Hokej';
  }
  if (s.includes('tennis') || s.includes('atp') || s.includes('wta')) return 'Tenis';
  if (s.includes('mma') || s.includes('ufc') || s.includes('boxing')) return 'MMA';
  return 'Fotbal';
}

function mapLeagueName(sportKey: string, sportTitle: string): string {
  const key = sportKey.toLowerCase();
  const lower = sportTitle.toLowerCase();
  if (key === 'soccer_epl' || lower.includes('premier league')) return 'Premier League';
  if (key === 'soccer_spain_la_liga' || lower.includes('la liga')) return 'La Liga';
  if (key === 'soccer_germany_bundesliga') return 'Bundesliga';
  if (key === 'soccer_italy_serie_a') return 'Serie A';
  if (key === 'soccer_france_ligue_one') return 'Ligue 1';
  if (key === 'soccer_uefa_champs_league' || lower.includes('champions league')) return 'Liga mistrů';
  if (key.startsWith('soccer_czech')) return 'Chance Liga';
  if (key === 'icehockey_nhl' || lower.includes('nhl')) return 'NHL';
  if (key.startsWith('icehockey_czech')) return 'Tipsport Extraliga';
  if (key === 'basketball_nba' || lower === 'nba') return 'NBA';
  if (key.startsWith('basketball_czech')) return 'Česká NBL';
  if (key === 'mma_mixed_martial_arts' || key.includes('ufc') || lower.includes('ufc')) return 'UFC';
  return sportTitle;
}

const BLOCKED_GENERAL_REGEX =
  /\b(ncaa|ncaab|ncaaf|ncaaw|wncaab|college|varsity|friendly|friendlies|exhibition|preseason|pre season|summer league|all star|u19|u20|u21|u23|reserve|reserves|youth|amateur)\b/i;

const BLOCKED_LOWER_DIVISION_REGEX =
  /\b(2|ii|2nd|second|third|fourth|bundesliga 2|bundesliga2|la liga 2|segunda|serie b|serie c|ligue 2|ligue two|efl|championship|league one|league two|national league|vanarama|eerste divisie|erste liga|fnl|narodni liga|ahl|echl|ohl|whl|qmjhl|ushl|mestis|allsvenskan|hockeyallsvenskan|maxa liga|eurocup|gleague|g league|wnba|qualif|qualification|qualifiers|women|womens|frauen|femenina|wsl|nwsl)\b/i;

const BLOCKED_TENNIS_REGEX =
  /\b(doubles|mixed|challenger|itf|utr|exhibition|qualif|qualification|qualifiers|juniors|wheelchair)\b/i;

const BLOCKED_MMA_REGEX =
  /\b(ksw|oktagon|bellator|pfl|one championship|one fc|cage warriors|lfa|invicta|aca|fen|clout|fame|bkfc|bare knuckle|rizin|pancrase|brave|ares|eagle fc|regional)\b/i;

function normalizeCompetitionText(s: Pick<OddsApiSport, 'key' | 'title'>): string {
  return `${s.key} ${s.title}`
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

function classifyMainCompetition(
  s: OddsApiSport
): { category: SportCategory; priority: number } | null {
  if (!s.active || s.has_outrights) return null;

  const key = s.key.toLowerCase();
  const normalized = normalizeCompetitionText(s);

  if (BLOCKED_GENERAL_REGEX.test(normalized)) {
    return null;
  }

  if (s.group === 'Soccer') {
    if (BLOCKED_LOWER_DIVISION_REGEX.test(normalized)) return null;
    if (key === 'soccer_uefa_champs_league') return { category: 'Fotbal', priority: 100 };
    if (key === 'soccer_epl') return { category: 'Fotbal', priority: 95 };
    if (key.startsWith('soccer_czech')) return { category: 'Fotbal', priority: 92 };
    if (key === 'soccer_spain_la_liga') return { category: 'Fotbal', priority: 90 };
    if (key === 'soccer_germany_bundesliga') return { category: 'Fotbal', priority: 88 };
    if (key === 'soccer_italy_serie_a') return { category: 'Fotbal', priority: 86 };
    if (key === 'soccer_france_ligue_one') return { category: 'Fotbal', priority: 84 };
    return null;
  }

  if (s.group === 'Ice Hockey') {
    if (BLOCKED_LOWER_DIVISION_REGEX.test(normalized)) return null;
    if (key === 'icehockey_nhl') return { category: 'Hokej', priority: 100 };
    if (key.startsWith('icehockey_czech') && !/\b1 liga\b/i.test(normalized)) {
      return { category: 'Hokej', priority: 95 };
    }
    return null;
  }

  if (s.group === 'Basketball') {
    if (BLOCKED_LOWER_DIVISION_REGEX.test(normalized)) return null;
    if (key === 'basketball_nba') return { category: 'Basketbal', priority: 100 };
    if (key.startsWith('basketball_czech')) return { category: 'Basketbal', priority: 90 };
    return null;
  }

  if (s.group === 'Tennis') {
    if (BLOCKED_TENNIS_REGEX.test(normalized)) return null;
    const isAtp = key.startsWith('tennis_atp_');
    const isWta = key.startsWith('tennis_wta_');
    if (!isAtp && !isWta) return null;

    const isGrandSlam =
      key.includes('aus_open') ||
      key.includes('french_open') ||
      key.includes('roland_garros') ||
      key.includes('wimbledon') ||
      key.includes('us_open');
    const priority = (isGrandSlam ? 100 : 80) + (isAtp ? 10 : 5);
    return { category: 'Tenis', priority };
  }

  if (s.group === 'Mixed Martial Arts') {
    if (BLOCKED_MMA_REGEX.test(normalized)) return null;
    const isUfc = key.includes('ufc') || /\bufc\b/i.test(normalized);
    if (key === 'mma_mixed_martial_arts' || isUfc) {
      return { category: 'MMA', priority: isUfc ? 100 : 90 };
    }
    return null;
  }

  return null;
}

function selectActiveCompetitions(allSports: OddsApiSport[]): {
  selected: Array<{ sport: OddsApiSport; category: SportCategory }>;
  categoryByKey: Map<string, SportCategory>;
} {
  // Keep strictly 1 top active allowed competition per sport (max 5 credits per manual refresh)
  const bestByCategory = new Map<
    SportCategory,
    { sport: OddsApiSport; category: SportCategory; priority: number }
  >();

  for (const sport of allSports) {
    const match = classifyMainCompetition(sport);
    if (!match) continue;
    const existing = bestByCategory.get(match.category);
    if (!existing || match.priority > existing.priority) {
      bestByCategory.set(match.category, {
        sport,
        category: match.category,
        priority: match.priority,
      });
    }
  }

  const orderedCategories: SportCategory[] = ['Fotbal', 'Hokej', 'Tenis', 'MMA', 'Basketbal'];
  const selected: Array<{ sport: OddsApiSport; category: SportCategory }> = [];
  const categoryByKey = new Map<string, SportCategory>();

  for (const cat of orderedCategories) {
    const entry = bestByCategory.get(cat);
    if (entry) {
      selected.push({ sport: entry.sport, category: entry.category });
      categoryByKey.set(entry.sport.key, entry.category);
    }
  }

  return { selected, categoryByKey };
}

function formatCzechKickoff(iso: string): { label: string; timeWindow: TimeWindow } {
  const date = new Date(iso);
  const now = new Date();
  const todayStr = now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const hhmm = date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === todayStr) {
    return { label: `Dnes ${hhmm}`, timeWindow: 'Dnes' };
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return { label: `Zítra ${hhmm}`, timeWindow: 'Zítra' };
  }

  const dayNames = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
  const dayLabel = dayNames[date.getDay()];
  return { label: `${dayLabel} ${hhmm}`, timeWindow: 'Víkend' };
}

/**
 * Deterministic fallback form generator seeded by team name when API-Sports is not configured.
 */
function deriveFormFromOdds(
  impliedProb: number,
  seedStr: string,
  sport: SportCategory
): FormResult[] {
  const allowsDraw = sport === 'Fotbal' || sport === 'Hokej';
  const hash = seedStr.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const results: FormResult[] = [];
  for (let i = 0; i < 5; i++) {
    const roll = ((hash * (i + 3) + i * 17) % 100) / 100;
    const winThreshold = Math.min(0.82, Math.max(0.28, impliedProb / 100 + 0.08));
    if (roll < winThreshold) results.push('V');
    else if (allowsDraw && roll < winThreshold + 0.16) results.push('R');
    else results.push('P');
  }
  return results;
}

async function extractHttpErrorDetail(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    if (!raw) return res.statusText || 'Bez detailu odpovědi';
    try {
      const parsed = JSON.parse(raw) as { message?: string; error?: string; errors?: Record<string, string> };
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
      if (parsed.errors && typeof parsed.errors === 'object') {
        const vals = Object.values(parsed.errors).filter(Boolean);
        if (vals.length > 0) return vals.join(' | ');
      }
    } catch {
      // plain text fallback
    }
    return raw.slice(0, 220);
  } catch {
    return res.statusText || 'Chyba čtení HTTP odpovědi';
  }
}

function getCurrentSportSeason(): number {
  const now = new Date();
  // European football and NHL/Extraliga seasons start in July-September
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function getGameTimestamp(g: Record<string, unknown>): number {
  const fixture = g.fixture as { timestamp?: number; date?: string } | undefined;
  if (typeof fixture?.timestamp === 'number') return fixture.timestamp * 1000;
  if (typeof fixture?.date === 'string') return Date.parse(fixture.date) || 0;
  if (typeof g.timestamp === 'number') return g.timestamp * 1000;
  if (typeof g.date === 'string') return Date.parse(g.date) || 0;
  return 0;
}

function isFinishedGame(g: Record<string, unknown>, sport: SportCategory): boolean {
  if (sport === 'Fotbal') {
    const fixture = g.fixture as { status?: { short?: string } } | undefined;
    const short = fixture?.status?.short;
    return !short || short === 'FT' || short === 'AET' || short === 'PEN';
  }
  const status = g.status as { short?: string } | undefined;
  const short = status?.short;
  return short === 'FT' || short === 'AOT' || short === 'AP';
}

async function fetchApiSportsTeamForm(
  teamName: string,
  sport: SportCategory,
  apiKey: string
): Promise<{ form: FormResult[] | null; error?: string }> {
  if (!apiKey.trim() || (sport !== 'Fotbal' && sport !== 'Hokej')) return { form: null };

  try {
    const baseUrl =
      sport === 'Fotbal'
        ? 'https://v3.football.api-sports.io'
        : 'https://v1.hockey.api-sports.io';

    const searchRes = await fetch(`${baseUrl}/teams?search=${encodeURIComponent(teamName)}`, {
      headers: { 'x-apisports-key': apiKey.trim() },
    });
    if (!searchRes.ok) {
      const detail = await extractHttpErrorDetail(searchRes);
      return { form: null, error: `API-Sports HTTP ${searchRes.status}: ${detail}` };
    }
    const searchJson = (await searchRes.json()) as {
      errors?: Record<string, string> | string[];
      response?: Array<{ team?: { id?: number }; id?: number }>;
    };
    if (searchJson.errors && !Array.isArray(searchJson.errors) && Object.keys(searchJson.errors).length > 0) {
      return {
        form: null,
        error: `API-Sports: ${Object.values(searchJson.errors).join(' | ')}`,
      };
    }

    const teamId = searchJson?.response?.[0]?.team?.id ?? searchJson?.response?.[0]?.id;
    if (!teamId) return { form: null };

    const season = getCurrentSportSeason();
    const fixturePath =
      sport === 'Fotbal'
        ? `${baseUrl}/fixtures?team=${teamId}&season=${season}&status=FT`
        : `${baseUrl}/games?team=${teamId}&season=${season}`;

    const gamesRes = await fetch(fixturePath, {
      headers: { 'x-apisports-key': apiKey.trim() },
    });
    if (!gamesRes.ok) {
      const detail = await extractHttpErrorDetail(gamesRes);
      return { form: null, error: `API-Sports HTTP ${gamesRes.status}: ${detail}` };
    }
    const gamesJson = (await gamesRes.json()) as {
      errors?: Record<string, string> | string[];
      response?: Array<Record<string, unknown>>;
    };
    if (gamesJson.errors && !Array.isArray(gamesJson.errors) && Object.keys(gamesJson.errors).length > 0) {
      return {
        form: null,
        error: `API-Sports: ${Object.values(gamesJson.errors).join(' | ')}`,
      };
    }

    const rawGames = gamesJson?.response;
    if (!Array.isArray(rawGames) || rawGames.length === 0) return { form: null };

    const finishedSorted = rawGames
      .filter((g) => isFinishedGame(g, sport))
      .sort((a, b) => getGameTimestamp(a) - getGameTimestamp(b));

    const lastFive = finishedSorted.slice(-5);
    if (lastFive.length === 0) return { form: null };

    const form = lastFive.map((g: Record<string, unknown>): FormResult => {
      const teams = g.teams as Record<string, { id?: number; winner?: boolean | null }> | undefined;
      if (!teams) return 'R';
      const isHome = teams.home?.id === teamId;
      const side = isHome ? teams.home : teams.away;
      if (side?.winner === true) return 'V';
      if (side?.winner === false) return 'P';

      // Fallback to scores/goals (used by Hockey API v1 where teams.winner is omitted)
      const scores = (g.scores ?? g.goals) as { home?: number | null; away?: number | null } | undefined;
      if (typeof scores?.home === 'number' && typeof scores?.away === 'number') {
        const myScore = isHome ? scores.home : scores.away;
        const oppScore = isHome ? scores.away : scores.home;
        if (myScore > oppScore) return 'V';
        if (myScore < oppScore) return 'P';
        return 'R';
      }
      return 'R';
    });

    return { form };
  } catch (err) {
    return {
      form: null,
      error: `API-Sports síťová chyba: ${err instanceof Error ? err.message : 'Neznámá chyba'}`,
    };
  }
}

export interface LiveFetchResult {
  matches: MatchAnalysis[];
  remainingQuota?: string | null;
  apiSportsWarning?: string | null;
}

export async function fetchLiveOddsAndStats(
  theOddsApiKey: string,
  apiSportsKey: string
): Promise<LiveFetchResult> {
  const key = theOddsApiKey.trim();
  if (!key) {
    throw new Error('Chybí API klíč pro The Odds API.');
  }

  // 1. Free discovery call (0 quota credits) to find all currently active competitions
  const sportsRes = await fetch(
    `https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(key)}`
  );
  if (!sportsRes.ok) {
    const detail = await extractHttpErrorDetail(sportsRes);
    throw new Error(
      `The Odds API HTTP ${sportsRes.status}${sportsRes.statusText ? ` ${sportsRes.statusText}` : ''}: ${detail}`
    );
  }

  let remainingQuota: string | null = sportsRes.headers.get('x-requests-remaining');
  const allSports = (await sportsRes.json()) as OddsApiSport[];
  if (!Array.isArray(allSports)) {
    throw new Error('The Odds API vrátilo neplatný seznam aktivních sportů.');
  }

  const { selected: activeCompetitions, categoryByKey } = selectActiveCompetitions(allSports);
  if (activeCompetitions.length === 0) {
    throw new Error(
      'V The Odds API momentálně nejsou aktivní žádné hlavní soutěže pro Betano (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Liga mistrů, české ligy, NHL, NBA, ATP/WTA, UFC).'
    );
  }

  // 2. Fetch h2h odds for each discovered active competition
  const endpoints = activeCompetitions.map(
    ({ sport }) =>
      `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport.key)}/odds/?apiKey=${encodeURIComponent(
        key
      )}&regions=eu&markets=h2h`
  );

  const responses = await Promise.allSettled(endpoints.map((url) => fetch(url)));
  const eventMap = new Map<string, OddsApiEvent>();
  const httpErrors: string[] = [];

  for (const res of responses) {
    if (res.status === 'rejected') {
      httpErrors.push(
        `Síťová chyba The Odds API: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`
      );
      continue;
    }
    const r = res.value;
    if (!r.ok) {
      const detail = await extractHttpErrorDetail(r);
      httpErrors.push(`The Odds API HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ''}: ${detail}`);
      continue;
    }
    const quota = r.headers.get('x-requests-remaining');
    if (quota) {
      const parsedQuota = Number(quota);
      const currentQuota = remainingQuota !== null ? Number(remainingQuota) : Number.POSITIVE_INFINITY;
      if (Number.isFinite(parsedQuota) && parsedQuota <= currentQuota) {
        remainingQuota = quota;
      } else if (remainingQuota === null) {
        remainingQuota = quota;
      }
    }
    const data = (await r.json()) as OddsApiEvent[];
    if (Array.isArray(data)) {
      data.forEach((ev) => {
        if (ev.bookmakers && ev.bookmakers.length > 0) {
          eventMap.set(ev.id, ev);
        }
      });
    }
  }

  // Balance up to 8 nearest upcoming events per sport category so one sport never crowds out others
  const eventsBySport = new Map<SportCategory, OddsApiEvent[]>();
  for (const ev of eventMap.values()) {
    const cat = categoryByKey.get(ev.sport_key) ?? mapSportGroupOrKey('', ev.sport_key, ev.sport_title);
    const list = eventsBySport.get(cat) ?? [];
    list.push(ev);
    eventsBySport.set(cat, list);
  }

  const events: OddsApiEvent[] = [];
  for (const list of eventsBySport.values()) {
    list.sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
    events.push(...list.slice(0, 8));
  }
  events.sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));

  if (events.length === 0) {
    if (httpErrors.length > 0) {
      throw new Error(httpErrors[0]);
    }
    throw new Error('The Odds API vrátilo aktivní soutěže, ale momentálně žádné zápasy s vypsanými kurzy.');
  }

  const analyzed: MatchAnalysis[] = [];
  let apiSportsWarning: string | null = null;
  let apiSportsLookups = 0;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const sport = categoryByKey.get(ev.sport_key) ?? mapSportGroupOrKey('', ev.sport_key, ev.sport_title);
    const evNormalized = `${ev.sport_key} ${ev.sport_title}`.toLowerCase().replace(/[_-]+/g, ' ');
    if (
      BLOCKED_GENERAL_REGEX.test(evNormalized) ||
      (sport === 'MMA' && BLOCKED_MMA_REGEX.test(evNormalized)) ||
      (sport === 'Tenis' && BLOCKED_TENNIS_REGEX.test(evNormalized))
    ) {
      continue;
    }
    const league = mapLeagueName(ev.sport_key, ev.sport_title);
    const { label: kickoffTime, timeWindow } = formatCzechKickoff(ev.commence_time);

    // Strictly group bookmaker prices by exact market.key AND market arity (2way vs 3way),
    // so 3-way regulation markets (1X2) are NEVER mixed with 2-way Moneyline markets.
    type BucketEntry = {
      bookmakerKey: string;
      homePrice: number;
      awayPrice: number;
    };
    type MarketBucket = {
      marketKey: string;
      arity: '2way' | '3way';
      entries: BucketEntry[];
    };

    const buckets = new Map<string, MarketBucket>();

    for (const bm of ev.bookmakers) {
      for (const market of bm.markets) {
        if (market.key !== 'h2h' && market.key !== 'h2h_3_way') continue;

        const homeOut = market.outcomes.find((o) => o.name === ev.home_team);
        const awayOut = market.outcomes.find((o) => o.name === ev.away_team);
        if (!homeOut || !awayOut || !(homeOut.price > 1.05) || !(awayOut.price > 1.05)) {
          continue;
        }

        const drawOut = market.outcomes.find((o) => o.name.toLowerCase() === 'draw');
        const hasThreeOutcomes = market.outcomes.length >= 3 || Boolean(drawOut);

        if (market.key === 'h2h_3_way' && !hasThreeOutcomes) continue;
        if (!hasThreeOutcomes && market.outcomes.length !== 2) continue;
        if (hasThreeOutcomes && drawOut && !(drawOut.price > 1.05)) continue;

        const arity: '2way' | '3way' = hasThreeOutcomes ? '3way' : '2way';
        const bucketId = `${market.key}:${arity}`;
        let bucket = buckets.get(bucketId);
        if (!bucket) {
          bucket = { marketKey: market.key, arity, entries: [] };
          buckets.set(bucketId, bucket);
        }
        bucket.entries.push({
          bookmakerKey: bm.key.toLowerCase(),
          homePrice: homeOut.price,
          awayPrice: awayOut.price,
        });
      }
    }

    const allBuckets = Array.from(buckets.values()).filter((b) => b.entries.length > 0);
    if (allBuckets.length === 0) continue;

    // Prefer buckets with at least 2 bookmakers of the exact same market type so Betano is never compared alone or cross-market
    const multiBookmakerBuckets = allBuckets.filter((b) => b.entries.length >= 2);
    const candidateBuckets = multiBookmakerBuckets.length > 0 ? multiBookmakerBuckets : allBuckets;

    const preferredArity: '2way' | '3way' = sport === 'Fotbal' ? '3way' : '2way';
    candidateBuckets.sort((a, b) => {
      const aHasBetano = a.entries.some((e) => e.bookmakerKey.includes('betano')) ? 1 : 0;
      const bHasBetano = b.entries.some((e) => e.bookmakerKey.includes('betano')) ? 1 : 0;
      if (bHasBetano !== aHasBetano) return bHasBetano - aHasBetano;

      const aPref = a.arity === preferredArity ? 1 : 0;
      const bPref = b.arity === preferredArity ? 1 : 0;
      if (bPref !== aPref) return bPref - aPref;

      return b.entries.length - a.entries.length;
    });

    const selectedBucket = candidateBuckets[0];
    const homePrices = selectedBucket.entries.map((e) => e.homePrice);
    const awayPrices = selectedBucket.entries.map((e) => e.awayPrice);
    const betanoEntry = selectedBucket.entries.find((e) => e.bookmakerKey.includes('betano'));
    const tipsportEntry = selectedBucket.entries.find((e) => e.bookmakerKey.includes('tipsport'));

    const betanoHome = betanoEntry?.homePrice ?? null;
    const betanoAway = betanoEntry?.awayPrice ?? null;
    const tipsportHome = tipsportEntry?.homePrice ?? null;
    const tipsportAway = tipsportEntry?.awayPrice ?? null;

    if (homePrices.length === 0 || awayPrices.length === 0) continue;

    const avgHome = homePrices.reduce((a, b) => a + b, 0) / homePrices.length;
    const avgAway = awayPrices.reduce((a, b) => a + b, 0) / awayPrices.length;
    const maxHome = Math.max(...homePrices);
    const maxAway = Math.max(...awayPrices);

    const homeEdgeRatio = (betanoHome ?? maxHome) / avgHome;
    const awayEdgeRatio = (betanoAway ?? maxAway) / avgAway;
    const pickSide: 'home' | 'away' = homeEdgeRatio >= awayEdgeRatio ? 'home' : 'away';

    const bestMarketOdds = pickSide === 'home' ? betanoHome ?? maxHome : betanoAway ?? maxAway;
    const avgOdds = pickSide === 'home' ? avgHome : avgAway;
    const betanoOdds = Number(bestMarketOdds.toFixed(2));
    const tipsportOdds = Number(
      (pickSide === 'home'
        ? tipsportHome ?? Math.max(1.12, avgOdds * 0.985)
        : tipsportAway ?? Math.max(1.12, avgOdds * 0.985)
      ).toFixed(2)
    );
    const marketAvg = Number(avgOdds.toFixed(2));

    let formHome: FormResult[] | null = null;
    let formAway: FormResult[] | null = null;
    if (apiSportsKey.trim() && (sport === 'Fotbal' || sport === 'Hokej') && apiSportsLookups < 6) {
      apiSportsLookups += 1;
      const [resHome, resAway] = await Promise.all([
        fetchApiSportsTeamForm(ev.home_team, sport, apiSportsKey),
        fetchApiSportsTeamForm(ev.away_team, sport, apiSportsKey),
      ]);
      formHome = resHome.form;
      formAway = resAway.form;
      if (!apiSportsWarning) {
        apiSportsWarning = resHome.error ?? resAway.error ?? null;
      }
    }

    const finalFormHome = formHome ?? deriveFormFromOdds((1 / avgHome) * 100, ev.home_team, sport);
    const finalFormAway = formAway ?? deriveFormFromOdds((1 / avgAway) * 100, ev.away_team, sport);

    const h2hHomeWins = finalFormHome.filter((r) => r === 'V').length >= finalFormAway.filter((r) => r === 'V').length ? 3 : 1;
    const h2hAwayWins = 4 - h2hHomeWins;
    const h2hDraws = sport === 'Fotbal' ? 1 : 0;

    const model = evaluateMatchModel({
      betanoOdds,
      marketAvgOdds: marketAvg,
      formHome: finalFormHome,
      formAway: finalFormAway,
      h2hHomeWins,
      h2hDraws,
      h2hAwayWins,
      pickSide,
    });

    const pickedTeam = pickSide === 'home' ? ev.home_team : ev.away_team;
    const spreadPct = (((betanoOdds - marketAvg) / marketAvg) * 100).toFixed(1);
    const marketLabel =
      selectedBucket.arity === '3way'
        ? 'Výsledek v zákl. době (1X2)'
        : sport === 'Hokej' || sport === 'Basketbal'
        ? 'Vítěz zápasu (do rozhodnutí)'
        : 'Vítěz zápasu (H2H)';

    analyzed.push({
      id: `live-${ev.id}`,
      sport,
      league,
      timeWindow,
      kickoffTime,
      kickoffIso: ev.commence_time,
      homeTeam: ev.home_team,
      awayTeam: ev.away_team,
      recommendedPick: `Výhra ${pickedTeam}`,
      marketLabel,
      marketKey: selectedBucket.marketKey,
      marketArity: selectedBucket.arity,
      odds: {
        betano: betanoOdds,
        tipsport: tipsportOdds,
        marketAvg,
      },
      formHome: finalFormHome,
      formAway: finalFormAway,
      h2hHomeWins,
      h2hDraws,
      h2hAwayWins,
      h2hSummary: `${h2hHomeWins}V - ${h2hDraws}R - ${h2hAwayWins}P (bilance)`,
      aiProbability: model.aiProbability,
      impliedProbability: model.impliedProbability,
      valueScore: model.valueScore,
      reasoning: `Živá analýza z The Odds API (${selectedBucket.entries.length} kanceláří, trh ${selectedBucket.marketKey} ${selectedBucket.arity}). Kurz ${betanoOdds.toFixed(
        2
      )} vykazuje odchylku ${Number(spreadPct) >= 0 ? '+' : ''}${spreadPct} % oproti průměru trhu (${marketAvg.toFixed(
        2
      )}).`,
      isLiveApi: true,
    });
  }

  return { matches: analyzed, remainingQuota, apiSportsWarning };
}
