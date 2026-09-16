const { createClient } = require("@supabase/supabase-js");

// ============================================================
// DIRTY P FANTASY FOOTBALL
// Historical Player Importer
// Seasons: 2014-2025
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("Missing SUPABASE_SECRET_KEY");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY
);

const LEAGUE_ID = 332679;

const START_YEAR = 2014;
const END_YEAR = 2025;

// ESPN lineup slots
const LINEUP_SLOTS = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  16: "D/ST",
  17: "K",
  20: "BENCH",
  21: "IR",
  23: "FLEX",
};

// ESPN default player positions
const PLAYER_POSITIONS = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

// These slots do NOT count toward an owner's actual
// starting fantasy points.
const NON_STARTER_SLOTS = new Set([
  20, // Bench
  21, // IR
]);

function isStarter(lineupSlotId) {
  return !NON_STARTER_SLOTS.has(Number(lineupSlotId));
}

function getPosition(player, lineupSlotId) {
  const defaultPositionId =
    player?.defaultPositionId;

  if (PLAYER_POSITIONS[defaultPositionId]) {
    return PLAYER_POSITIONS[defaultPositionId];
  }

  const slotPosition =
    LINEUP_SLOTS[Number(lineupSlotId)];

  if (
    slotPosition &&
    slotPosition !== "BENCH" &&
    slotPosition !== "IR" &&
    slotPosition !== "FLEX"
  ) {
    return slotPosition;
  }

  return "UNKNOWN";
}

function getActualWeeklyPoints(
  player,
  seasonYear,
  scoringPeriod
) {
  const stats = player?.stats || [];

  const actualWeek = stats.find((stat) => {
    return (
      Number(stat.seasonId) === Number(seasonYear) &&
      Number(stat.scoringPeriodId) ===
        Number(scoringPeriod) &&
      Number(stat.statSourceId) === 0 &&
      Number(stat.statSplitTypeId) === 1
    );
  });

  if (!actualWeek) {
    return 0;
  }

  return Number(actualWeek.appliedTotal || 0);
}

function buildEspnUrl(year, week) {
  if (year <= 2017) {
    return (
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}` +
      `?seasonId=${year}` +
      `&scoringPeriodId=${week}` +
      `&view=mRoster` +
      `&view=mTeam`
    );
  }

  return (
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}` +
    `/segments/0/leagues/${LEAGUE_ID}` +
    `?scoringPeriodId=${week}` +
    `&view=mRoster` +
    `&view=mTeam`
  );
}

async function fetchEspnWeek(year, week) {
  const url = buildEspnUrl(year, week);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Dirty-P-Fantasy-History/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `ESPN ${year} Week ${week}: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // leagueHistory endpoints return an array.
  if (Array.isArray(data)) {
    return data[0];
  }

  return data;
}

async function getOwners() {
  const { data, error } = await supabase
    .from("owners")
    .select("id, name");

  if (error) {
    throw error;
  }

  return data || [];
}

async function getTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select(
      "id, season_year, espn_team_id, owner_id, team_name"
    )
    .gte("season_year", START_YEAR)
    .lte("season_year", END_YEAR);

  if (error) {
    throw error;
  }

  return data || [];
}

function findDatabaseTeam(
  databaseTeams,
  seasonYear,
  espnTeamId
) {
  return databaseTeams.find(
    (team) =>
      Number(team.season_year) ===
        Number(seasonYear) &&
      Number(team.espn_team_id) ===
        Number(espnTeamId)
  );
}

async function deleteExistingPlayerHistory() {
  console.log(
    "Clearing existing 2014-2025 player history..."
  );

  const { error: weekError } = await supabase
    .from("player_weeks")
    .delete()
    .gte("season_year", START_YEAR)
    .lte("season_year", END_YEAR);

  if (weekError) {
    throw weekError;
  }

  const { error: seasonError } = await supabase
    .from("player_seasons")
    .delete()
    .gte("season_year", START_YEAR)
    .lte("season_year", END_YEAR);

  if (seasonError) {
    throw seasonError;
  }
}

async function insertPlayerWeeks(rows) {
  if (!rows.length) {
    return;
  }

  const CHUNK_SIZE = 500;

  for (
    let i = 0;
    i < rows.length;
    i += CHUNK_SIZE
  ) {
    const chunk = rows.slice(
      i,
      i + CHUNK_SIZE
    );

    const { error } = await supabase
      .from("player_weeks")
      .upsert(chunk, {
        onConflict:
          "season_year,scoring_period,owner_id,espn_player_id",
      });

    if (error) {
      throw error;
    }
  }
}

async function importSeason(
  year,
  databaseTeams
) {
  console.log("");
  console.log("============================");
  console.log(`IMPORTING ${year}`);
  console.log("============================");

  // Fantasy seasons can extend through Week 18.
  // If ESPN returns no usable teams for later weeks,
  // we simply continue.
  for (let week = 1; week <= 18; week++) {
    console.log(`${year} Week ${week}...`);

    let league;

    try {
      league = await fetchEspnWeek(
        year,
        week
      );
    } catch (error) {
      console.log(
        `Skipping ${year} Week ${week}: ${error.message}`
      );
      continue;
    }

    const espnTeams = league?.teams || [];

    if (!espnTeams.length) {
      console.log(
        `No teams found for ${year} Week ${week}`
      );
      continue;
    }

    const rows = [];

    for (const espnTeam of espnTeams) {
      const databaseTeam =
        findDatabaseTeam(
          databaseTeams,
          year,
          espnTeam.id
        );

      if (!databaseTeam) {
        console.log(
          `No database team match: ${year}, ESPN team ${espnTeam.id}`
        );
        continue;
      }

      const ownerId =
        databaseTeam.owner_id;

      if (!ownerId) {
        continue;
      }

      const rosterEntries =
        espnTeam?.roster?.entries || [];

      for (const entry of rosterEntries) {
        const poolEntry =
          entry?.playerPoolEntry;

        const player =
          poolEntry?.player;

        if (!player) {
          continue;
        }

        const espnPlayerId =
          Number(
            player.id ||
              poolEntry.id ||
              entry.playerId
          );

        if (!espnPlayerId) {
          continue;
        }

        const lineupSlotId =
          Number(entry.lineupSlotId);

        const started =
          isStarter(lineupSlotId);

        const fantasyPoints =
          getActualWeeklyPoints(
            player,
            year,
            week
          );

        const position =
          getPosition(
            player,
            lineupSlotId
          );

        rows.push({
          season_year: year,
          scoring_period: week,

          owner_id: ownerId,
          team_id: databaseTeam.id,

          espn_player_id:
            espnPlayerId,

          player_name:
            player.fullName ||
            player.name ||
            `Player ${espnPlayerId}`,

          position,

          dirty_p_team_name:
            databaseTeam.team_name,

          lineup_slot_id:
            lineupSlotId,

          started,

          fantasy_points:
            fantasyPoints,
        });
      }
    }

    await insertPlayerWeeks(rows);

    console.log(
      `Saved ${rows.length} player rows`
    );
  }
}

async function buildPlayerSeasons() {
  console.log("");
  console.log(
    "Building player season totals..."
  );

  const { data: weeks, error } =
    await supabase
      .from("player_weeks")
      .select(
        `
        season_year,
        scoring_period,
        owner_id,
        team_id,
        espn_player_id,
        player_name,
        position,
        dirty_p_team_name,
        started,
        fantasy_points
        `
      )
      .gte("season_year", START_YEAR)
      .lte("season_year", END_YEAR)
      .order("season_year", {
        ascending: true,
      })
      .order("scoring_period", {
        ascending: true,
      });

  if (error) {
    throw error;
  }

  const playerMap = new Map();

  for (const row of weeks || []) {
    // All-Franchise Team is based on points
    // actually contributed as a starter.
    if (!row.started) {
      continue;
    }

    const key = [
      row.season_year,
      row.owner_id,
      row.espn_player_id,
    ].join("-");

    if (!playerMap.has(key)) {
      playerMap.set(key, {
        season_year:
          row.season_year,

        owner_id:
          row.owner_id,

        team_id:
          row.team_id,

        espn_player_id:
          row.espn_player_id,

        player_name:
          row.player_name,

        position:
          row.position,

        dirty_p_team_name:
          row.dirty_p_team_name,

        started_points: 0,
        games_started: 0,

        best_week_points: null,
        best_week: null,
      });
    }

    const playerSeason =
      playerMap.get(key);

    const points =
      Number(row.fantasy_points || 0);

    playerSeason.started_points +=
      points;

    playerSeason.games_started += 1;

    if (
      playerSeason.best_week_points ===
        null ||
      points >
        playerSeason.best_week_points
    ) {
      playerSeason.best_week_points =
        points;

      playerSeason.best_week =
        row.scoring_period;
    }
  }

  const rows = Array.from(
    playerMap.values()
  ).map((row) => ({
    ...row,

    started_points:
      Number(
        row.started_points.toFixed(2)
      ),

    best_week_points:
      row.best_week_points === null
        ? null
        : Number(
            row.best_week_points.toFixed(
              2
            )
          ),
  }));

  const CHUNK_SIZE = 500;

  for (
    let i = 0;
    i < rows.length;
    i += CHUNK_SIZE
  ) {
    const chunk = rows.slice(
      i,
      i + CHUNK_SIZE
    );

    const { error } = await supabase
      .from("player_seasons")
      .upsert(chunk, {
        onConflict:
          "season_year,owner_id,espn_player_id",
      });

    if (error) {
      throw error;
    }
  }

  console.log(
    `Created ${rows.length} player-season records`
  );
}

async function showSummary() {
  const { count: weekCount } =
    await supabase
      .from("player_weeks")
      .select("*", {
        count: "exact",
        head: true,
      });

  const { count: seasonCount } =
    await supabase
      .from("player_seasons")
      .select("*", {
        count: "exact",
        head: true,
      });

  console.log("");
  console.log("============================");
  console.log("DIRTY P IMPORT COMPLETE");
  console.log("============================");
  console.log(
    `Player-week rows: ${weekCount}`
  );
  console.log(
    `Player-season rows: ${seasonCount}`
  );
}

async function main() {
  console.log(
    "Dirty P player-history import starting..."
  );

  const owners = await getOwners();

  console.log(
    `Found ${owners.length} Dirty P owners`
  );

  const databaseTeams =
    await getTeams();

  console.log(
    `Found ${databaseTeams.length} historical team seasons`
  );

  await deleteExistingPlayerHistory();

  for (
    let year = START_YEAR;
    year <= END_YEAR;
    year++
  ) {
    await importSeason(
      year,
      databaseTeams
    );
  }

  await buildPlayerSeasons();

  await showSummary();
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("");
    console.error("IMPORT FAILED");
    console.error(error);
    process.exit(1);
  });
