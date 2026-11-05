export const LEAGUES = {
  nba: {
    id: 'nba',
    name: 'NBA',
    fullName: 'National Basketball Association',
    icon: '🏀',
    sport: 'basketball',
    league: 'nba',
    accent: '#f59e0b',
    defaultDates: ['20261102', '20261101', '20261104']
  },
  nfl: {
    id: 'nfl',
    name: 'NFL',
    fullName: 'National Football League',
    icon: '🏈',
    sport: 'football',
    league: 'nfl',
    accent: '#3b82f6',
    defaultDates: ['20261102', '20261101', '20261029']
  },
  nhl: {
    id: 'nhl',
    name: 'NHL',
    fullName: 'National Hockey League',
    icon: '🏒',
    sport: 'hockey',
    league: 'nhl',
    accent: '#06b6d4',
    defaultDates: ['20261103', '20261102', '20261101']
  },
  cfb: {
    id: 'cfb',
    name: 'CFB',
    fullName: 'NCAA College Football',
    icon: '🎓',
    sport: 'football',
    league: 'college-football',
    accent: '#ef4444',
    defaultDates: ['20261031', '20261024']
  }
};

const scoreboardCache = new Map();
const summaryCache = new Map();
const standingsCache = new Map();

function extractMp4FromVideoObj(v) {
  if (!v || !v.links) return null;
  return (
    v.links?.source?.HD?.href ||
    v.links?.source?.full?.href ||
    v.links?.source?.href ||
    v.links?.mobile?.source?.href ||
    null
  );
}

export function normalizeEvent(ev, leagueKey) {
  const cfg = LEAGUES[leagueKey];
  const comp = ev.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0] || {};
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1] || {};

  const highlights = (comp.highlights || [])
    .map((h) => {
      const mp4 = extractMp4FromVideoObj(h);
      if (!mp4) return null;
      return {
        id: String(h.id || mp4),
        headline: h.headline || `${away.team?.abbreviation} vs ${home.team?.abbreviation} Highlights`,
        description: h.description || '',
        duration: h.duration || 75,
        mp4Url: mp4,
        tag: 'GAME RECAP'
      };
    })
    .filter(Boolean);

  const statusType = ev.status?.type || {};
  const isCompleted = Boolean(statusType.completed);
  const statusDetail = statusType.shortDetail || statusType.detail || 'Scheduled';

  const formatTeam = (c) => ({
    id: String(c.team?.id || c.id || ''),
    uid: `${leagueKey}:${c.team?.abbreviation || ''}`,
    abbr: c.team?.abbreviation || 'TM',
    name: c.team?.shortDisplayName || c.team?.name || 'Team',
    displayName: c.team?.displayName || 'Team',
    color: c.team?.color ? `#${c.team.color}` : cfg.accent,
    logo: c.team?.logo || (c.team?.logos?.[0]?.href ?? ''),
    score: c.score ?? '0',
    winner: Boolean(c.winner),
    rank: c.curatedRank?.current && c.curatedRank.current <= 25 ? c.curatedRank.current : null,
    record: c.records?.[0]?.summary || '',
    linescores: (c.linescores || []).map((ls) => ls.displayValue ?? ls.value ?? '-')
  });

  // Extract notable leaders from competition if present
  const quickLeaders = [];
  (comp.leaders || []).slice(0, 3).forEach((cat) => {
    const top = cat.leaders?.[0];
    if (top?.athlete) {
      quickLeaders.push({
        category: cat.shortDisplayName || cat.displayName,
        name: top.athlete.shortName || top.athlete.displayName,
        value: top.displayValue
      });
    }
  });

  return {
    id: String(ev.id),
    leagueKey,
    leagueName: cfg.name,
    leagueIcon: cfg.icon,
    sport: cfg.sport,
    leagueSlug: cfg.league,
    dateIso: ev.date,
    dateLabel: new Date(ev.date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }),
    name: ev.name || '',
    shortName: ev.shortName || '',
    statusDetail,
    isCompleted,
    venue: comp.venue?.fullName
      ? `${comp.venue.fullName}${comp.venue.address?.city ? ' • ' + comp.venue.address.city : ''}`
      : '',
    broadcast: comp.broadcasts?.[0]?.names?.[0] || '',
    away: formatTeam(away),
    home: formatTeam(home),
    highlights,
    quickLeaders
  };
}

export async function fetchLeagueGames(leagueKey, customDate = '') {
  const cfg = LEAGUES[leagueKey];
  const datesToFetch = customDate ? [customDate.replace(/-/g, '')] : cfg.defaultDates;
  const cacheKey = `${leagueKey}:${datesToFetch.join(',')}`;

  if (scoreboardCache.has(cacheKey)) {
    return scoreboardCache.get(cacheKey);
  }

  const allEvents = [];
  const seenIds = new Set();

  await Promise.all(
    datesToFetch.map(async (dt) => {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.league}/scoreboard?dates=${dt}&limit=50`;
        const res = await fetch(url);
        const data = await res.json();
        (data.events || []).forEach((ev) => {
          if (!seenIds.has(ev.id)) {
            seenIds.add(ev.id);
            allEvents.push(normalizeEvent(ev, leagueKey));
          }
        });
      } catch (err) {
        console.warn(`Failed fetching ${leagueKey} for ${dt}:`, err);
      }
    })
  );

  // Sort completed games with highlights and recent timestamps first
  allEvents.sort((a, b) => {
    if (a.highlights.length !== b.highlights.length) {
      return b.highlights.length - a.highlights.length;
    }
    return new Date(b.dateIso) - new Date(a.dateIso);
  });

  scoreboardCache.set(cacheKey, allEvents);
  return allEvents;
}

export async function fetchAllLeaguesRecent() {
  const keys = Object.keys(LEAGUES);
  const results = await Promise.all(keys.map((k) => fetchLeagueGames(k)));
  const map = {};
  keys.forEach((k, idx) => {
    map[k] = results[idx];
  });
  return map;
}

export async function fetchGameSummary(game, leagueGamesPool = []) {
  const cacheKey = `${game.leagueKey}:${game.id}`;
  if (summaryCache.has(cacheKey)) {
    return summaryCache.get(cacheKey);
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/${game.sport}/${game.leagueSlug}/summary?event=${game.id}`;
  let raw = {};
  try {
    const res = await fetch(url);
    raw = await res.json();
  } catch (err) {
    console.warn('Error fetching game summary:', err);
  }

  // 1. Build Extended ~7-Minute Continuous Game Reel
  const reelClips = [];
  const seenUrls = new Set();

  const pushClip = (clip) => {
    if (!clip || !clip.mp4Url || seenUrls.has(clip.mp4Url)) return;
    seenUrls.add(clip.mp4Url);
    reelClips.push(clip);
  };

  // Start with the game's main recap highlight if present
  (game.highlights || []).forEach((h) => pushClip(h));

  // Add all play-by-play / postgame clips from summary.videos
  (raw.videos || []).forEach((v) => {
    const mp4 = extractMp4FromVideoObj(v);
    if (mp4) {
      pushClip({
        id: String(v.id || mp4),
        headline: v.headline || 'Key Game Play',
        description: v.description || '',
        duration: v.duration || 35,
        mp4Url: mp4,
        tag: 'THIS GAME'
      });
    }
  });

  // If this game's clips total under 420 seconds (~7 mins), top up the reel with
  // "Around the League" highlights from the same sport so the broadcast runs ~7+ minutes!
  let currentTotalSec = reelClips.reduce((acc, c) => acc + (c.duration || 45), 0);

  if (currentTotalSec < 420 && leagueGamesPool.length > 0) {
    for (const otherGame of leagueGamesPool) {
      if (otherGame.id === game.id) continue;
      for (const hl of otherGame.highlights || []) {
        if (currentTotalSec >= 480) break;
        pushClip({
          ...hl,
          headline: `[${otherGame.away.abbr} @ ${otherGame.home.abbr}] ${hl.headline}`,
          tag: `AROUND THE ${game.leagueName}`
        });
        currentTotalSec += hl.duration || 70;
      }
      if (currentTotalSec >= 480) break;
    }
  }

  // For NFL where Sunday scoreboard clips expire faster than MNF, if still under 420s, fetch MNF summary clips
  if (game.leagueKey === 'nfl' && currentTotalSec < 400 && game.id !== '401873036') {
    try {
      const mnfRes = await fetch(
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401873036'
      );
      const mnfData = await mnfRes.json();
      (mnfData.videos || []).forEach((v) => {
        if (currentTotalSec >= 520) return;
        const mp4 = extractMp4FromVideoObj(v);
        if (mp4) {
          pushClip({
            id: String(v.id || mp4),
            headline: `[NFL Reel] ${v.headline || 'NFL Highlight'}`,
            description: v.description || '',
            duration: v.duration || 40,
            mp4Url: mp4,
            tag: 'AROUND THE NFL'
          });
          currentTotalSec += v.duration || 40;
        }
      });
    } catch (_) {}
  }

  // 2. Parse Line Scores from header if missing on scoreboard
  const headerComp = raw.header?.competitions?.[0];
  let awayLines = game.away.linescores;
  let homeLines = game.home.linescores;
  if (headerComp?.competitors) {
    const ha = headerComp.competitors.find((c) => c.homeAway === 'away');
    const hh = headerComp.competitors.find((c) => c.homeAway === 'home');
    if (ha?.linescores?.length) awayLines = ha.linescores.map((l) => l.displayValue ?? '-');
    if (hh?.linescores?.length) homeLines = hh.linescores.map((l) => l.displayValue ?? '-');
  }

  // 3. Parse Team Statistics Comparison
  const boxTeams = raw.boxscore?.teams || [];
  const teamStats = [];
  if (boxTeams.length === 2) {
    const t0Stats = boxTeams[0].statistics || [];
    const t1Stats = boxTeams[1].statistics || [];
    const t1Map = new Map(t1Stats.map((s) => [s.name, s]));

    t0Stats.forEach((s0) => {
      const s1 = t1Map.get(s0.name);
      if (s1) {
        teamStats.push({
          label: s0.label || s0.abbreviation || s0.name,
          awayVal: s0.displayValue,
          homeVal: s1.displayValue
        });
      }
    });
  }

  // 4. Parse Player Box Scores
  const playerGroups = (raw.boxscore?.players || []).map((teamBlock) => ({
    teamAbbr: teamBlock.team?.abbreviation || 'TEAM',
    teamName: teamBlock.team?.displayName || 'Team',
    teamLogo: teamBlock.team?.logo || '',
    categories: (teamBlock.statistics || []).map((cat) => ({
      name: cat.name || cat.type || 'Stats',
      title: (cat.text || cat.name || 'Player Stats').toUpperCase(),
      labels: cat.labels || [],
      athletes: (cat.athletes || [])
        .filter((a) => !a.didNotPlay && a.stats?.length)
        .map((a) => ({
          name: a.athlete?.displayName || a.athlete?.shortName || 'Player',
          pos: a.athlete?.position?.abbreviation || '',
          starter: Boolean(a.starter),
          stats: a.stats || []
        }))
    }))
  }));

  // 5. Parse Scoring Plays & Recap Article
  const scoringPlays = (raw.scoringPlays || []).map((sp) => ({
    period: sp.period?.number ? `P${sp.period.number}` : '',
    clock: sp.clock?.displayValue || '',
    team: sp.team?.abbreviation || '',
    text: sp.text || '',
    awayScore: sp.awayScore ?? '',
    homeScore: sp.homeScore ?? ''
  }));

  const article = raw.article
    ? {
        headline: raw.article.headline || '',
        story: raw.article.story || raw.article.description || ''
      }
    : null;

  const summary = {
    reelClips,
    totalReelSeconds: reelClips.reduce((acc, c) => acc + (c.duration || 45), 0),
    awayLines,
    homeLines,
    teamStats,
    playerGroups,
    scoringPlays,
    article
  };

  summaryCache.set(cacheKey, summary);
  return summary;
}

export async function fetchStandingsOrRankings(leagueKey) {
  if (standingsCache.has(leagueKey)) {
    return standingsCache.get(leagueKey);
  }

  const cfg = LEAGUES[leagueKey];
  try {
    if (leagueKey === 'cfb') {
      const res = await fetch(
        'https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings'
      );
      const data = await res.json();
      const poll = data.rankings?.[0];
      const result = {
        type: 'rankings',
        title: poll?.name || 'College Football Top 25 Rankings',
        ranks: (poll?.ranks || []).map((r) => ({
          rank: r.current,
          teamAbbr: r.team?.abbreviation || '',
          teamName: `${r.team?.location || ''} ${r.team?.name || ''}`.trim(),
          logo: r.team?.logos?.[0]?.href || '',
          record: r.recordSummary || '',
          points: r.points || ''
        }))
      };
      standingsCache.set(leagueKey, result);
      return result;
    } else {
      const res = await fetch(
        `https://site.api.espn.com/apis/v2/sports/${cfg.sport}/${cfg.league}/standings`
      );
      const data = await res.json();
      const groups = (data.children || []).map((child) => {
        const entries = child.standings?.entries || [];
        return {
          name: child.name || 'Conference',
          teams: entries.map((e) => {
            const statMap = {};
            (e.stats || []).forEach((s) => {
              if (s.abbreviation) statMap[s.abbreviation] = s.displayValue;
              if (s.name) statMap[s.name] = s.displayValue;
            });
            return {
              teamAbbr: e.team?.abbreviation || '',
              teamName: e.team?.displayName || '',
              logo: e.team?.logos?.[0]?.href || '',
              w: statMap.W ?? '-',
              l: statMap.L ?? '-',
              pct: statMap.PCT ?? statMap.PTS ?? '-',
              strk: statMap.STRK ?? '-'
            };
          })
        };
      });
      const result = {
        type: 'standings',
        title: `${cfg.fullName} Standings`,
        groups
      };
      standingsCache.set(leagueKey, result);
      return result;
    }
  } catch (err) {
    console.warn('Failed loading standings/rankings:', err);
    return null;
  }
}
