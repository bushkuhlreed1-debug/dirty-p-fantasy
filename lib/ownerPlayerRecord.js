import { unstable_cache } from "next/cache";
import { getEspnLiveScoreMap } from "./espnLiveScore";
import { supabaseAdmin } from "./supabaseAdmin";

const getCompletedLineups = unstable_cache(
  async (season, week) => {
    const teams = await getEspnLiveScoreMap(season, week, { matchupRostersOnly: true });
    const lineups = [...teams].map(([id, team]) => [id, team.startingLineup]);
    if (!lineups.some(([, lineup]) => lineup.length)) {
      throw new Error("ESPN matchup lineups unavailable");
    }
    return lineups;
  },
  ["owner-record-completed-lineups-v1"],
  { revalidate: 21600 }
);

async function getArchivedRecord(ownerId) {
  let query = supabaseAdmin
    .from("player_weeks")
    .select("season_year,scoring_period,player_name,position,fantasy_points,dirty_p_team_name,owner_id")
    .eq("started", true)
    .not("fantasy_points", "is", null)
    .order("fantasy_points", { ascending: false })
    .order("season_year", { ascending: true })
    .order("scoring_period", { ascending: true })
    .order("espn_player_id", { ascending: true })
    .limit(1);
  if (ownerId != null) query = query.eq("owner_id", ownerId);
  const { data, error } = await query.maybeSingle();

  if (error) console.error("Archived player record unavailable:", error.message);
  return data;
}

async function getCompletedWeekRecord(game, { ownerId, season, espnTeamId, loadLineups = getCompletedLineups }) {
  const week = Number(game.matchup_period);
  const lineups = new Map(await loadLineups(Number(season), week));
  const starters = (lineups.get(Number(espnTeamId)) ?? [])
    .filter(player => Number.isFinite(player.actualPoints));
  const home = Number(game.home_owner_id) === ownerId;
  const lineupTotal = starters.reduce((total, player) => total + player.actualPoints, 0);
  const teamScore = Number(home ? game.home_score : game.away_score);

  // A roster from another scoring period can contain valid players but the wrong lineup.
  if (!starters.length || Math.abs(lineupTotal - teamScore) > 0.05) return null;

  const best = starters.reduce((top, player) => player.actualPoints > top.actualPoints ? player : top);
  return {
    season_year: season,
    scoring_period: week,
    player_name: best.name,
    position: best.position,
    fantasy_points: best.actualPoints,
  };
}

export async function getOwnerPlayerRecord({ ownerId, season, espnTeamId, games }) {
  const [archived, ...current] = await Promise.allSettled([
    getArchivedRecord(ownerId),
    ...(espnTeamId ? games.map(game => getCompletedWeekRecord(game, { ownerId, season, espnTeamId })) : []),
  ]);

  let best = archived.status === "fulfilled" ? archived.value : null;
  for (const result of current) {
    if (result.status !== "fulfilled" || !result.value) continue;
    if (!best || Number(result.value.fantasy_points) > Number(best.fantasy_points)) best = result.value;
  }
  return best;
}

export async function getLeaguePlayerRecord({ currentSeason, currentTeams, completedCurrentMatchups }) {
  const teams = new Map(currentTeams.map(team => [Number(team.owner_id), team]));
  const weeks = new Map();
  function loadLineups(season, week) {
    if (!weeks.has(week)) weeks.set(week, getCompletedLineups(season, week));
    return weeks.get(week);
  }

  const [archived, seasonBest, ...current] = await Promise.allSettled([
    getArchivedRecord(),
    supabaseAdmin.from("player_seasons")
      .select("season_year,best_week,player_name,position,best_week_points,dirty_p_team_name,owner_id")
      .not("best_week_points", "is", null).not("best_week", "is", null)
      .order("best_week_points", { ascending: false }).order("season_year").order("best_week")
      .order("espn_player_id").order("owner_id").limit(1).maybeSingle(),
    ...completedCurrentMatchups.flatMap(game =>
      [game.home_owner_id, game.away_owner_id].map(async id => {
        const ownerId = Number(id);
        const team = teams.get(ownerId);
        if (!team?.espn_team_id) return null;
        const record = await getCompletedWeekRecord(game, {
          season: currentSeason, ownerId, espnTeamId: team.espn_team_id, loadLineups,
        });
        if (!record) return null;
        const teamName = Number(game.home_owner_id) === ownerId ? game.home_team_name : game.away_team_name;
        return { ...record, owner_id: ownerId, dirty_p_team_name: teamName || team.team_name };
      })),
  ]);
  const bestSeason = seasonBest.value?.data;
  const candidates = [
    archived.value,
    bestSeason && { ...bestSeason, scoring_period: bestSeason.best_week, fantasy_points: bestSeason.best_week_points },
    ...current.map(result => result.value),
  ].filter(Boolean);
  return candidates.sort((a, b) => Number(b.fantasy_points) - Number(a.fantasy_points) ||
    a.season_year - b.season_year || a.scoring_period - b.scoring_period ||
    a.player_name.localeCompare(b.player_name))[0] ?? null;
}
