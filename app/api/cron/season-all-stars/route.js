import { revalidateTag } from "next/cache";
import { getEspnLeague } from "../../../../lib/espn";
import { getEspnLiveScoreMap } from "../../../../lib/espnLiveScore";
import { buildOwnerLookup, findSupabaseOwner } from "../../../../lib/leagueData";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const season = now.getUTCFullYear() - Number(now.getUTCMonth() === 0);
  const key = `regular-season-all-stars:${season}`;
  const saved = await supabaseAdmin.from("notification_state").select("state_key").eq("state_key", key).maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data) return Response.json({ season, status: "published" });

  const league = await getEspnLeague(season);
  const weeks = [];
  for (let period = 1; period <= league.regularSeasonMatchupCount; period++) {
    const games = league.matchups.filter(game => !game.isPlayoff && game.matchupPeriod === period);
    if (!games.length || games.some(game => !game.completed)) {
      return Response.json({ season, status: "regular season in progress" });
    }
    const teamIds = games.flatMap(game => [game.homeEspnTeamId, game.awayEspnTeamId]);
    for (const week of league.scoringPeriodsByMatchup[period] ?? [period]) weeks.push({ week, period, teamIds });
  }

  const owners = await supabaseAdmin.from("owners").select("id,name");
  if (owners.error) throw owners.error;
  const lookup = buildOwnerLookup(owners.data);
  const teams = new Map(league.teams.map(team => [team.espnTeamId, team]));
  const totals = new Map();
  // Build every week before writing so an unavailable lineup cannot publish a partial season.
  for (let i = 0; i < weeks.length; i += 3) {
    const batch = weeks.slice(i, i + 3);
    const maps = await Promise.all(batch.map(({ week, period }) =>
      getEspnLiveScoreMap(season, week, { matchupRostersOnly: true, matchupPeriod: period })));
    for (const [index, { week, teamIds }] of batch.entries()) {
      for (const id of teamIds) {
        const team = teams.get(id);
        const owner = findSupabaseOwner(lookup, team?.ownerName);
        const starters = maps[index].get(id)?.starters;
        if (!owner || !starters?.length || starters.every(player => player.actualPoints == null)) {
          throw new Error(`Incomplete Week ${week} data for team ${id}`);
        }
        for (const player of starters) {
          if (!player.playerId) throw new Error("Missing ESPN player ID");
          const playerKey = `${owner.id}:${player.playerId}`;
          const row = totals.get(playerKey) ?? {
            season_year: season, owner_id: owner.id, espn_player_id: player.playerId,
            player_name: player.name, position: player.position, dirty_p_team_name: team.teamName,
            started_points: 0, games_started: 0, best_week: null, best_week_points: null,
          };
          const points = player.actualPoints ?? 0;
          row.started_points = Math.round((row.started_points + points) * 100) / 100;
          row.games_started++;
          if (row.best_week_points === null || points > row.best_week_points) {
            row.best_week_points = points;
            row.best_week = week;
          }
          totals.set(playerKey, row);
        }
      }
    }
  }
  const write = await supabaseAdmin.from("player_seasons").upsert([...totals.values()], {
    onConflict: "season_year,owner_id,espn_player_id",
  });
  if (write.error) throw write.error;
  revalidateTag("season-all-stars");
  const mark = await supabaseAdmin.from("notification_state").upsert({
    state_key: key, state_value: { weeks: weeks.length }, updated_at: now.toISOString(),
  }, { onConflict: "state_key" });
  if (mark.error) throw mark.error;
  return Response.json({ season, status: "published", weeks: weeks.length });
}
