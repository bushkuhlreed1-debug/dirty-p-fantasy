export const HIGH_SCORE_FIRST_SEASON = 2025;
export const HIGH_SCORE_PRIZE = 30;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatHighScoreMoney(amount) {
  return currency.format(amount);
}

function isRegularSeason(game) {
  const type = String(game.matchup_type ?? "").toLowerCase();
  const tier = String(game.playoff_tier ?? "").toLowerCase();
  return !game.is_playoff && !game.is_championship &&
    !game.is_third_place && !game.is_consolation &&
    !/playoff|championship|semi.?final|third.?place|3rd.?place|consolation|loser|toilet/.test(type) &&
    !/winner|championship|consolation|loser|toilet/.test(tier);
}

function score(value) {
  if (value == null || String(value).trim() === "") return null;
  const points = Number(value);
  return Number.isFinite(points) ? Math.round(points * 100) : null;
}

export function buildWeeklyHighScores({
  currentSeason,
  currentTeams = [],
  unmatchedEspnOwners = [],
  historicalMatchups = [],
  currentSeasonMatchups = [],
}) {
  const seasonNow = Number(currentSeason);
  const gamesByWeek = new Map();
  for (const game of [...historicalMatchups, ...currentSeasonMatchups]) {
    const year = Number(game.season_year);
    const period = Number(game.matchup_period);
    const home = Number(game.home_owner_id);
    const away = Number(game.away_owner_id);
    if (!Number.isInteger(year) || year < HIGH_SCORE_FIRST_SEASON || year > seasonNow ||
      !Number.isInteger(period) || period < 1 || home <= 0 || away <= 0 ||
      !Number.isInteger(home) || !Number.isInteger(away) || home === away || !isRegularSeason(game)) continue;

    const key = `${year}:${period}`;
    if (!gamesByWeek.has(key)) gamesByWeek.set(key, { year, period, games: new Map(), owners: new Set() });
    const week = gamesByWeek.get(key);
    week.owners.add(home);
    week.owners.add(away);
    week.games.set(`${Math.min(home, away)}:${Math.max(home, away)}`, game);
  }

  const seasonSizes = new Map();
  for (const { year, owners } of gamesByWeek.values()) {
    seasonSizes.set(year, Math.max(seasonSizes.get(year) ?? 0, owners.size));
  }

  const currentSize = new Set(currentTeams.map(team => Number(team.owner_id)).filter(id => id > 0)).size;
  const totals = new Map();
  const includeOwner = id => {
    if (Number.isInteger(id) && id > 0 && !totals.has(id)) totals.set(id, { wins: 0, earnings: 0 });
  };
  for (const team of currentTeams) includeOwner(Number(team.owner_id));

  for (const { year, games, owners } of gamesByWeek.values()) {
    for (const id of owners) includeOwner(id);
    const current = year === seasonNow;
    if ((current && unmatchedEspnOwners.length > 0) ||
      owners.size !== Math.max(seasonSizes.get(year), current ? currentSize : 0)) continue;

    const scores = [];
    for (const game of games.values()) {
      const homeScore = score(game.home_score);
      const awayScore = score(game.away_score);
      // Archived weeks may lack a final flag. Live-season games must be marked completed by ESPN.
      if ((current && game.completed !== true) || homeScore === null || awayScore === null ||
        (homeScore === 0 && awayScore === 0)) break;
      scores.push({ id: Number(game.home_owner_id), points: homeScore });
      scores.push({ id: Number(game.away_owner_id), points: awayScore });
    }
    if (scores.length !== games.size * 2 || scores.length !== owners.size) continue;

    const high = Math.max(...scores.map(team => team.points));
    const winnerIds = scores.filter(team => team.points === high).map(team => team.id);
    // An exact tie stays pending until the league decides how to award it.
    if (winnerIds.length === 1) {
      const total = totals.get(winnerIds[0]);
      total.wins += 1;
      total.earnings += HIGH_SCORE_PRIZE;
    }
  }

  return { totals };
}
