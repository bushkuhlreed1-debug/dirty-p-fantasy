import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "./supabaseAdmin";

const starterSlots = [
  ["QB", "QB"],
  ["RB1", "RB"],
  ["RB2", "RB"],
  ["WR1", "WR"],
  ["WR2", "WR"],
  ["TE", "TE"],
  ["FLEX", "RB", "WR", "TE"],
  ["K", "K"],
  ["D/ST", "D/ST"],
];

const getCachedTeams = unstable_cache(async () => {
  const seasons = new Map();
  const selectionCounts = {};
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("player_seasons")
      .select("season_year,owner_id,espn_player_id,player_name,position,started_points,dirty_p_team_name")
      .not("espn_player_id", "is", null)
      .not("started_points", "is", null)
      .in("position", ["QB", "RB", "WR", "TE", "K", "D/ST"])
      .order("season_year", { ascending: false })
      .order("started_points", { ascending: false })
      .order("player_name")
      .order("espn_player_id")
      .order("owner_id")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    for (const player of data) {
      const year = player.season_year;
      if (!seasons.has(year)) seasons.set(year, new Map());
      const players = seasons.get(year);
      if (!players.has(player.espn_player_id)) players.set(player.espn_player_id, player);
    }

    if (data.length < pageSize) break;
  }

  const lineups = [...seasons].map(([year, players]) => {
    const remaining = [...players.values()];
    const lineup = starterSlots.map(([slot, ...positions]) => {
      const index = remaining.findIndex(player => positions.includes(player.position));
      if (index < 0) return { slot, player: null };
      const [player] = remaining.splice(index, 1);
      const ownerId = Number(player.owner_id);
      if (ownerId > 0) selectionCounts[ownerId] = (selectionCounts[ownerId] ?? 0) + 1;
      return { slot, player };
    });
    return { year, lineup };
  });

  return { seasons: lineups, selectionCounts };
}, ["dirty-p-season-all-stars-v4"], { revalidate: 21600 });

export async function getSeasonAllStars() {
  try {
    return await getCachedTeams();
  } catch (error) {
    console.error("Season All-Star Teams unavailable:", error.message);
    return null;
  }
}
