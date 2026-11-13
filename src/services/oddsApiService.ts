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

function mapLeagueName(sportTitle: string): string {
  const lower = sportTitle.toLowerCase();
  if (lower.includes('epl') || lower.includes('premier league')) return 'Premier League';
  if (lower.includes('champions league')) return 'Liga mistrů';
  if (lower.includes('europa league')) return 'Evropská liga';
  if (lower.includes('nhl')) return 'NHL';
  if (lower.includes('nba')) return 'NBA';
  if (lower.includes('euroleague')) return 'Euroliga';
  if (lower.includes('ufc') || lower.includes('mma')) return 'UFC / MMA';
  return sportTitle;
}

function scoreSoccerLeague(s: OddsApiSport): number {
  const text = `${s.key} ${s.title} ${s.description}`.toLowerCase();
  if (
    text.includes('world_cup') ||
    text.includes('nations_league') ||
    text.includes('euro') ||
    text.includes('qualif') ||
    text.includes('friendly') ||
    text.includes('conmebol') ||
    text.includes('concacaf') ||
    text.includes('afcon') ||
    text.includes('copa_america')
  ) {
    return 100;
  }
  if (
    text.includes('uefa_champs') ||
    text.includes('uefa_europa') ||
    text.includes('soccer_epl') ||
    text.includes('spain_la_liga') ||
    text.includes('germany_bundesliga') ||
    text.includes('italy_serie_a') ||
    text.includes('france_ligue_one') ||
    text.includes('czech')
  ) {
    return 90;
  }
  if (
    text.includes('efl_champ') ||
    text.includes('bundesliga2') ||
    text.includes('segunda') ||
    text.includes('serie_b') ||
    text.includes('ligue_two') ||
    text.includes('eredivisie') ||
    text.includes('primeira') ||
    text.includes('poland') ||
    text.includes('austria') ||
    text.includes('switzerland') ||
    text.includes('spl')
  ) {
    return 70;
  }
  return 40;
}

function scoreHockeyLeague(s: OddsApiSport): number {
  const text = `${s.key} ${s.title}`.toLowerCase();
  if (text.includes('nhl') || text.includes('czech') || text.includes('extraliga')) return 100;
  if (text.includes('liiga') || text.includes('shl') || text.includes('sweden') || text.includes('finland')) {
    return 85;
  }
  if (text.includes('ahl') || text.includes('mestis') || text.includes('allsvenskan') || text.includes('khl')) {
    return 70;
  }
  return 45;
}

function scoreBasketballLeague(s: OddsApiSport): number {
  const text = `${s.key} ${s.title}`.toLowerCase();
  if (text.includes('basketball_nba') || s.title.toUpperCase() === 'NBA') return 100;
  if (text.includes('euroleague')) return 95;
  if (text.includes('eurocup')) return 75;
  if (text.includes('acb') || text.includes('ncaab') || text.includes('wnba') || text.includes('nbl')) return 60;
  return 40;
}

function selectActiveCompetitions(allSports: OddsApiSport[]): {
  selected: Array<{ sport: OddsApiSport; category: SportCategory }>;
  categoryByKey: Map<string, SportCategory>;
} {
  const activeMatchSports = allSports.filter((s) => s.active && !s.has_outrights);

  const soccer = activeMatchSports
    .filter((s) => s.group === 'Soccer')
    .sort((a, b) => scoreSoccerLeague(b) - scoreSoccerLeague(a))
    .slice(0, 5);

  const hockey = activeMatchSports
    .filter((s) => s.group === 'Ice Hockey')
    .sort((a, b) => scoreHockeyLeague(b) - scoreHockeyLeague(a));

  const allTennis = activeMatchSports.filter((s) => s.group === 'Tennis');
  const atpWtaTennis = allTennis.filter((s) => {
    const text = `${s.key} ${s.title}`.toLowerCase();
    return text.includes('atp') || text.includes('wta');
  });
  const tennis = atpWtaTennis.length > 0 ? atpWtaTennis : allTennis;

  const mma = activeMatchSports.filter((s) => s.group === 'Mixed Martial Arts');

  const basketball = activeMatchSports
    .filter((s) => s.group === 'Basketball')
    .sort((a, b) => scoreBasketballLeague(b) - scoreBasketballLeague(a))
    .slice(0, 4);

  const selected: Array<{ sport: OddsApiSport; category: SportCategory }> = [
    ...soccer.map((sport) => ({ sport, category: 'Fotbal' as const })),
    ...hockey.map((sport) => ({ sport, category: 'Hokej' as const })),
    ...tennis.map((sport) => ({ sport, category: 'Tenis' as const })),
    ...mma.map((sport) => ({ sport, category: 'MMA' as const })),
    ...basketball.map((sport) => ({ sport, category: 'Basketbal' as const })),
  ];

  const categoryByKey = new Map<string, SportCategory>();
  selected.forEach(({ sport, category }) => {
    categoryByKey.set(sport.key, category);
  });

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
function deriveFormFromOdds(impliedProb: number, seedStr: string): FormResult[] {
  const hash = seedStr.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const results: FormResult[] = [];
  for (let i = 0; i < 5; i++) {
    const roll = ((hash * (i + 3) + i * 17) % 100) / 100;
    const winThreshold = Math.min(0.82, Math.max(0.28, impliedProb / 100 + 0.08));
    if (roll < winThreshold) results.push('V');
    else if (roll < winThreshold + 0.16) results.push('R');
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
      'V The Odds API momentálně nejsou aktivní žádné soutěže pro Fotbal, Hokej, Tenis, MMA ani Basketbal.'
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
    if (quota) remainingQuota = quota;
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
    const league = mapLeagueName(ev.sport_title);
    const { label: kickoffTime, timeWindow } = formatCzechKickoff(ev.commence_time);

    // Collect home and away odds across bookmakers
    const homePrices: number[] = [];
    const awayPrices: number[] = [];
    let betanoHome: number | null = null;
    let tipsportHome: number | null = null;
    let betanoAway: number | null = null;
    let tipsportAway: number | null = null;

    for (const bm of ev.bookmakers) {
      const h2h = bm.markets.find((m) => m.key === 'h2h');
      if (!h2h) continue;
      const homeOut = h2h.outcomes.find((o) => o.name === ev.home_team);
      const awayOut = h2h.outcomes.find((o) => o.name === ev.away_team);
      if (homeOut && homeOut.price > 1.05) {
        homePrices.push(homeOut.price);
        if (bm.key.includes('betano')) betanoHome = homeOut.price;
        if (bm.key.includes('tipsport')) tipsportHome = homeOut.price;
      }
      if (awayOut && awayOut.price > 1.05) {
        awayPrices.push(awayOut.price);
        if (bm.key.includes('betano')) betanoAway = awayOut.price;
        if (bm.key.includes('tipsport')) tipsportAway = awayOut.price;
      }
    }

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

    const finalFormHome = formHome ?? deriveFormFromOdds((1 / avgHome) * 100, ev.home_team);
    const finalFormAway = formAway ?? deriveFormFromOdds((1 / avgAway) * 100, ev.away_team);

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
      marketLabel: 'Vítěz zápasu (H2H)',
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
      reasoning: `Živá analýza z The Odds API (${ev.bookmakers.length} kanceláří). Kurz ${betanoOdds.toFixed(
        2
      )} vykazuje odchylku ${Number(spreadPct) >= 0 ? '+' : ''}${spreadPct} % oproti průměru trhu (${marketAvg.toFixed(
        2
      )}) při formě ${finalFormHome.join('-')} vs. ${finalFormAway.join('-')}.`,
      isLiveApi: true,
    });
  }

  return { matches: analyzed, remainingQuota, apiSportsWarning };
}
