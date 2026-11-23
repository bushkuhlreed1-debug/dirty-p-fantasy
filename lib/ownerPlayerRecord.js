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
  const { data, error } = await supabaseAdmin
    .from("player_weeks")
    .select("season_year,scoring_period,player_name,position,fantasy_points,dirty_p_team_name")
    .eq("owner_id", ownerId)
    .eq("started", true)
    .not("fantasy_points", "is", null)
    .order("fantasy_points", { ascending: false })
    .order("season_year", { ascending: true })
    .order("scoring_period", { ascending: true })
    .order("espn_player_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) console.error("Archived player record unavailable:", error.message);
  return data;
}

async function getCompletedWeekRecord(game, { ownerId, season, espnTeamId }) {
  const week = Number(game.matchup_period);
  const lineups = new Map(await getCompletedLineups(Number(season), week));
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
