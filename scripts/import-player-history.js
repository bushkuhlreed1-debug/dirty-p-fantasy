const { createClient } = require("@supabase/supabase-js");

// ============================================================
// DIRTY P FANTASY FOOTBALL
// HISTORICAL PLAYER IMPORTER
// 2014-2025
// ============================================================

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).trim();

const SUPABASE_SECRET_KEY = (
  process.env.SUPABASE_SECRET_KEY || ""
).trim();

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("Missing SUPABASE_SECRET_KEY");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

const LEAGUE_ID = 332679;

const START_YEAR = 2014;
const END_YEAR = 2025;

const MAX_WEEK = 18;

// ============================================================
// ESPN POSITION IDS
// ============================================================

const PLAYER_POSITIONS = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

// ============================================================
// ESPN LINEUP SLOT IDS
// ============================================================

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

const NON_STARTER_SLOTS = new Set([
  20, // Bench
  21, // IR
]);

function isStarter(lineupSlotId) {
  return !NON_STARTER_SLOTS.has(
    Number(lineupSlotId)
  );
}

// ============================================================
// PLAYER POSITION
// ============================================================

function getPosition(player, lineupSlotId) {
  const defaultPositionId =
    Number(player?.defaultPositionId);

  if (PLAYER_POSITIONS[defaultPositionId]) {
    return PLAYER_POSITIONS[defaultPositionId];
  }

  const lineupPosition =
    LINEUP_SLOTS[Number(lineupSlotId)];

  if (
    lineupPosition &&
    lineupPosition !== "BENCH" &&
    lineupPosition !== "IR" &&
    lineupPosition !== "FLEX"
  ) {
    return lineupPosition;
  }

  return "UNKNOWN";
}

// ============================================================
// ACTUAL WEEKLY FANTASY POINTS
// statSourceId 0 = ACTUAL
// statSplitTypeId 1 = WEEK
// ============================================================

function getActualWeeklyPoints(
  player,
  seasonYear,
  scoringPeriod
) {
  const stats = Array.isArray(player?.stats)
    ? player.stats
    : [];

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

// ============================================================
// ESPN URLS
//
// ESPN has used more than one host/path for historical
// league data. Instead of assuming one works for every year,
// try the available historical formats.
// ============================================================

function getEspnUrls(year, week) {
  const query =
    `scoringPeriodId=${week}` +
    `&view=mRoster` +
    `&view=mTeam`;

  if (year <= 2017) {
    return [
      // Historical lm-api endpoint
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}?seasonId=${year}&${query}`,

      // Historical fantasy.espn.com endpoint
      `https://fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}?seasonId=${year}&${query}`,

      // Modern-format fallback
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${LEAGUE_ID}?${query}`,

      // Modern-format alternate host
      `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${LEAGUE_ID}?${query}`,
    ];
  }

  return [
    // Modern lm-api endpoint
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${LEAGUE_ID}?${query}`,

    // Alternate ESPN host
    `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${LEAGUE_ID}?${query}`,

    // Historical fallback
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}?seasonId=${year}&${query}`,
  ];
}

// ============================================================
// FETCH ESPN WEEK
// ============================================================

async function fetchEspnWeek(year, week) {
  const urls = getEspnUrls(year, week);

  const errors = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        errors.push(
          `${response.status} ${response.statusText}`
        );

        continue;
      }

      const json = await response.json();

      const league = Array.isArray(json)
        ? json[0]
        : json;

      if (
        league &&
        Array.isArray(league.teams) &&
        league.teams.length > 0
      ) {
        return league;
      }

      errors.push("Response contained no teams");
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(
    `All ESPN endpoints failed: ${errors.join(" | ")}`
  );
}

// ============================================================
// SUPABASE OWNERS
// ============================================================

async function getOwners() {
  const { data, error } = await supabase
    .from("owners")
    .select("id, name");

  if (error) {
    throw error;
  }

  return data || [];
}

// ============================================================
// SUPABASE TEAMS
// ============================================================

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

// ============================================================
// FIND DIRTY P TEAM
// ============================================================

function findDatabaseTeam(
  databaseTeams,
  seasonYear,
  espnTeamId
) {
  return databaseTeams.find((team) => {
    return (
      Number(team.season_year) ===
        Number(seasonYear) &&
      Number(team.espn_team_id) ===
        Number(espnTeamId)
    );
  });
}

// ============================================================
// CLEAR PREVIOUS IMPORT
// ============================================================

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

// ============================================================
// INSERT PLAYER WEEKS
// ============================================================

async function insertPlayerWeeks(rows) {
  if (!rows.length) {
    return 0;
  }

  const CHUNK_SIZE = 500;

  let inserted = 0;

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

    inserted += chunk.length;
  }

  return inserted;
}

// ============================================================
// IMPORT ONE SEASON
// ============================================================

async function importSeason(
  year,
  databaseTeams
) {
  console.log("");
  console.log("============================");
  console.log(`IMPORTING ${year}`);
  console.log("============================");

  let seasonRows = 0;

  for (
    let week = 1;
    week <= MAX_WEEK;
    week++
  ) {
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

    console.log(
      `ESPN returned ${espnTeams.length} teams`
    );

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
          `No Dirty P team match: ${year} ESPN team ID ${espnTeam.id}`
        );

        continue;
      }

      if (!databaseTeam.owner_id) {
        console.log(
          `No owner for ${year} ${databaseTeam.team_name}`
        );

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

        const espnPlayerId = Number(
          player.id ||
            poolEntry.id ||
            entry.playerId
        );

        if (!espnPlayerId) {
          continue;
        }

        const lineupSlotId = Number(
          entry.lineupSlotId
        );

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

          owner_id:
            databaseTeam.owner_id,

          team_id:
            databaseTeam.id,

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
            Number(
              fantasyPoints.toFixed(2)
            ),
        });
      }
    }

    const saved =
      await insertPlayerWeeks(rows);

    seasonRows += saved;

    console.log(
      `Saved ${saved} player rows`
    );
  }

  console.log(
    `${year} COMPLETE: ${seasonRows} player-week rows`
  );

  return seasonRows;
}

// ============================================================
// READ ALL PLAYER WEEKS
//
// Supabase limits large selects, so retrieve them in pages.
// ============================================================

async function getAllPlayerWeeks() {
  const PAGE_SIZE = 1000;

  let from = 0;

  const allRows = [];

  while (true) {
    const to =
      from + PAGE_SIZE - 1;

    const { data, error } =
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
        .gte(
          "season_year",
          START_YEAR
        )
        .lte(
          "season_year",
          END_YEAR
        )
        .order(
          "season_year",
          { ascending: true }
        )
        .order(
          "scoring_period",
          { ascending: true }
        )
        .range(from, to);

    if (error) {
      throw error;
    }

    const rows = data || [];

    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return allRows;
}

// ============================================================
// BUILD PLAYER-SEASON TOTALS
//
// ONLY STARTING LINEUP POINTS COUNT.
// ============================================================

async function buildPlayerSeasons() {
  console.log("");
  console.log(
    "Building player-season totals..."
  );

  const weeks =
    await getAllPlayerWeeks();

  console.log(
    `Loaded ${weeks.length} player-week rows for aggregation`
  );

  const playerMap =
    new Map();

  for (const row of weeks) {
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
      Number(
        row.fantasy_points || 0
      );

    playerSeason.started_points +=
      points;

    playerSeason.games_started +=
      1;

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
            row.best_week_points.toFixed(2)
          ),
  }));

  console.log(
    `Calculated ${rows.length} player-season records`
  );

  const CHUNK_SIZE = 500;

  for (
    let i = 0;
    i < rows.length;
    i += CHUNK_SIZE
  ) {
    const chunk =
      rows.slice(
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
    `Saved ${rows.length} player-season records`
  );
}

// ============================================================
// TRUE DATABASE COUNTS
// ============================================================

async function showSummary() {
  const {
    count: weekCount,
    error: weekError,
  } = await supabase
    .from("player_weeks")
    .select("id", {
      count: "exact",
      head: true,
    });

  if (weekError) {
    throw weekError;
  }

  const {
    count: seasonCount,
    error: seasonError,
  } = await supabase
    .from("player_seasons")
    .select("id", {
      count: "exact",
      head: true,
    });

  if (seasonError) {
    throw seasonError;
  }

  console.log("");
  console.log("============================");
  console.log("DIRTY P IMPORT COMPLETE");
  console.log("============================");

  console.log(
    `PLAYER_WEEK_COUNT=${weekCount}`
  );

  console.log(
    `PLAYER_SEASON_COUNT=${seasonCount}`
  );
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(
    "Dirty P player-history import starting..."
  );

  const owners =
    await getOwners();

  console.log(
    `Found ${owners.length} Dirty P owners`
  );

  const databaseTeams =
    await getTeams();

  console.log(
    `Found ${databaseTeams.length} historical team seasons`
  );

  await deleteExistingPlayerHistory();

  let totalImported = 0;

  for (
    let year = START_YEAR;
    year <= END_YEAR;
    year++
  ) {
    totalImported +=
      await importSeason(
        year,
        databaseTeams
      );
  }

  console.log("");
  console.log(
    `Total imported player-week rows: ${totalImported}`
  );

  if (totalImported === 0) {
    throw new Error(
      "ESPN import completed with ZERO player rows. Player-season totals were not built."
    );
  }

  await buildPlayerSeasons();

  await showSummary();
}

main()
  .then(() => {
    console.log("");
    console.log("DONE.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("");
    console.error("IMPORT FAILED");
    console.error(error);
    process.exit(1);
  });
