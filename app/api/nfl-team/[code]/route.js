import { NFL_TEAMS } from "../../../../lib/espnLiveScore";

async function nextGame(teamId, season) {
  for (const seasonType of [2, 3]) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${season}&seasontype=${seasonType}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error("Schedule unavailable");
    const data = await res.json();
    const events = (data.events ?? []).filter(event => Date.parse(event.date) > Date.now())
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    for (const event of events) {
      const game = event.competitions?.[0];
      const opponent = game?.competitors?.find(side => String(side.team?.id) !== teamId);
      if (!opponent || game.status?.type?.state !== "pre" || /cancel/i.test(game.status?.type?.name)) continue;
      return { opponent: opponent.team.displayName, home: opponent.homeAway === "away", date: event.date, timeTBD: game.timeValid === false };
    }
  }
  return null;
}

async function roster(teamId, season) {
  const league = process.env.ESPN_LEAGUE_ID;
  const cookie = [["espn_s2", process.env.ESPN_S2], ["SWID", process.env.ESPN_SWID]]
    .filter(([, value]) => value).map(([name, value]) => `${name}=${value}`).join("; ");
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${league}?view=mRoster`;
  const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : {}, next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Rosters unavailable");
  const data = await res.json();
  if (!data.teams?.length || data.teams.some(team => !Array.isArray(team.roster?.entries))) throw new Error("Incomplete rosters");
  return data.teams.flatMap(team => {
    const players = team.roster.entries.map(entry => entry.playerPoolEntry?.player ?? entry.player)
      .filter(player => String(player?.proTeamId) === teamId).map(player => player.fullName).filter(Boolean).sort();
    return players.length ? [{ teamId: team.id, players }] : [];
  });
}

export async function GET(request, { params }) {
  const { code } = await params;
  const id = Object.keys(NFL_TEAMS).find(key => NFL_TEAMS[key] === code);
  if (!id) return Response.json({}, { status: 404 });
  const now = new Date();
  const season = now.getUTCFullYear() - Number(now.getUTCMonth() < 2);
  const [game, owners] = await Promise.allSettled([nextGame(id, season), roster(id, season)]);
  return Response.json({ game: game.value ?? null, scheduleAvailable: game.status === "fulfilled", owners: owners.value ?? null });
}
