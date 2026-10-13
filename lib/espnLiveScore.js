// ======================================================
// DIRTY P — ESPN LIVE FANTASY SCORING
//
// Returns:
// - Actual fantasy team totals
// - Live projected team totals
// - Starting lineup
// - Actual player fantasy points
// - Player names, positions, and NFL teams
//
// Bench and IR players are excluded.
//
// Important:
// This uses the lineup returned by ESPN for the
// requested matchup, not a guessed roster.
// ======================================================

function numberOrNull(...values) {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return null;
}

// ======================================================
// ESPN LINEUP SLOT NAMES
// ======================================================

const SLOT_NAMES = {
  0: "QB",
  1: "TQB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP",
  16: "D/ST",
  17: "K",
  18: "P",
  19: "HC",
  20: "BE",
  21: "IR",
  22: "FLEX",
  23: "FLEX",
  24: "FLEX",
  25: "Rookie",
};

const BENCH_SLOTS = new Set([
  20,
  21,
]);

// ======================================================
// ESPN PLAYER POSITION NAMES
// ======================================================

const POSITION_NAMES = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

// ======================================================
// NFL TEAM ABBREVIATIONS
// ======================================================

const NFL_TEAMS = {
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WAS",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};

// ======================================================
// GET ROSTER ENTRIES FROM MATCHUP
// ======================================================

function getRosterEntries(side) {
  const possibleRosters = [
    side?.rosterForCurrentScoringPeriod?.entries,
    side?.rosterForMatchupPeriod?.entries,
    side?.roster?.entries,
    side?.rosterEntries,
  ];

  for (const roster of possibleRosters) {
    if (Array.isArray(roster)) {
      return roster;
    }
  }

  return [];
}

// ======================================================
// GET ESPN PLAYER
// ======================================================

function getPlayer(entry) {
  return (
    entry?.playerPoolEntry?.player ||
    entry?.player ||
    null
  );
}

// ======================================================
// GET PLAYER NAME
// ======================================================

function getPlayerName(entry) {
  const player = getPlayer(entry);

  if (!player) {
    return null;
  }

  if (player.fullName) {
    return player.fullName;
  }

  if (player.name) {
    return player.name;
  }

  const firstName =
    player.firstName || "";

  const lastName =
    player.lastName || "";

  return (
    `${firstName} ${lastName}`.trim() ||
    null
  );
}

// ======================================================
// GET PLAYER LINEUP SLOT
// ======================================================

function getLineupSlotId(entry) {
  return numberOrNull(
    entry?.lineupSlotId,
    entry?.lineup_slot_id
  );
}

function getLineupSlot(entry) {
  const id = getLineupSlotId(entry);

  if (id === null) {
    return null;
  }

  return SLOT_NAMES[id] || `SLOT ${id}`;
}

// ======================================================
// DETERMINE IF PLAYER IS STARTING
// ======================================================

function isStartingPlayer(entry) {
  const slotId = getLineupSlotId(entry);

  if (slotId === null) {
    return false;
  }

  if (BENCH_SLOTS.has(slotId)) {
    return false;
  }

  return true;
}

// ======================================================
// GET NFL POSITION
// ======================================================

function getPosition(player) {
  const positionId =
    numberOrNull(
      player?.defaultPositionId
    );

  if (positionId !== null) {
    return (
      POSITION_NAMES[positionId] ||
      "PLAYER"
    );
  }

  return (
    player?.position ||
    "PLAYER"
  );
}

// ======================================================
// GET NFL TEAM
// ======================================================

function getNFLTeam(player) {
  if (!player) {
    return null;
  }

  if (player.proTeamAbbreviation) {
    return player.proTeamAbbreviation;
  }

  const proTeamId =
    numberOrNull(player.proTeamId);

  if (proTeamId !== null) {
    return (
      NFL_TEAMS[proTeamId] ||
      null
    );
  }

  return null;
}

// ======================================================
// GET ACTUAL PLAYER FANTASY POINTS
//
// IMPORTANT:
//
// Only use actual statistics.
// Never substitute projected fantasy points.
//
// ESPN player stats typically use:
// statSourceId = 0 for actual statistics
// statSourceId = 1 for projections
//
// Prefer statistics matching the requested
// scoring period.
//
// If ESPN has no actual score, return null.
// ======================================================

function getActualPlayerPoints(entry, week) {
  const player = getPlayer(entry);

  if (!player) {
    return null;
  }

  const stats = Array.isArray(player.stats)
    ? player.stats
    : [];

  const currentPeriodStats = stats.filter(
    (stat) =>
      Number(stat?.scoringPeriodId) ===
        Number(week) &&
      Number(stat?.statSourceId) === 0
  );

  // Prefer the current week's actual
  // fantasy points reported by ESPN.

  for (const stat of currentPeriodStats) {
    const points =
      numberOrNull(
        stat?.appliedTotal
      );

    if (points !== null) {
      return points;
    }
  }

  // Some ESPN matchup responses include the
  // applied score directly on the roster entry.
  //
  // Only use that if ESPN actually provided it.

  const directPoints =
    numberOrNull(
      entry?.appliedStatTotal,
      entry?.actualPoints,
      entry?.currentPoints,
      entry?.playerPoolEntry?.appliedStatTotal
    );

  if (directPoints !== null) {
    return directPoints;
  }

  return null;
}

// ======================================================
// BUILD A TEAM'S STARTING LINEUP
// ======================================================

function buildStartingLineup(side, week) {
  const entries = getRosterEntries(side);

  const starters = [];

  for (const entry of entries) {
    if (!isStartingPlayer(entry)) {
      continue;
    }

    const player = getPlayer(entry);

    if (!player) {
      continue;
    }

    const name = getPlayerName(entry);

    if (!name) {
      continue;
    }

    const playerId =
      numberOrNull(
        player.id,
        entry.playerId
      );

    const slot =
      getLineupSlot(entry);

    const position =
      getPosition(player);

    const nflTeam =
      getNFLTeam(player);

    const currentPoints =
      getActualPlayerPoints(
        entry,
        week
      );

    starters.push({
      id: playerId || name,
      playerId,

      name,
      fullName: name,

      slot,
      lineupSlot: slot,

      position,
      nflTeam,

      currentPoints,
      actualPoints: currentPoints,
      livePoints: currentPoints,

      isStarter: true,
    });
  }

  // Preserve ESPN lineup order.
  return starters;
}

// ======================================================
// EXTRACT TEAM SCORING
// ======================================================

function getTeamLiveData(side, week) {
  const currentPoints =
    numberOrNull(
      side?.totalPointsLive,
      side?.totalPoints
    );

  const liveProjectedPoints =
    numberOrNull(
      side?.totalProjectedPointsLive
    );

  const startingLineup =
    buildStartingLineup(
      side,
      week
    );

  return {
    currentPoints,

    liveProjectedPoints,

    // Both keys are supplied for compatibility
    // with the homepage lineup component.

    startingLineup,
    starters: startingLineup,
  };
}

// ======================================================
// FETCH ESPN LIVE SCOREBOARD
// ======================================================

export async function getEspnLiveScoreMap(
  season,
  week
) {
  const leagueId =
    process.env.ESPN_LEAGUE_ID?.trim();

  const espnS2 =
    process.env.ESPN_S2?.trim();

  const espnSwid =
    process.env.ESPN_SWID?.trim();

  if (!leagueId) {
    console.error(
      "Missing ESPN_LEAGUE_ID"
    );

    return new Map();
  }

  // ----------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------

  const cookies = [];

  if (espnS2) {
    cookies.push(
      `espn_s2=${espnS2}`
    );
  }

  if (espnSwid) {
    cookies.push(
      `SWID=${espnSwid}`
    );
  }

  // ----------------------------------------------
  // ESPN API
  //
  // Keep the existing scoreboard views.
  //
  // Add roster-related views so ESPN can
  // include matchup roster entries.
  // ----------------------------------------------

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/` +
    `seasons/${season}/segments/0/leagues/${leagueId}` +
    `?view=mScoreboard` +
    `&view=mMatchupScore` +
    `&view=mLiveScoring` +
    `&view=mRoster` +
    `&scoringPeriodId=${week}` +
    `&matchupPeriodId=${week}`;

  try {
    const response = await fetch(
      url,
      {
        cache: "no-store",

        headers:
          cookies.length > 0
            ? {
                Cookie:
                  cookies.join("; "),
              }
            : {},
      }
    );

    if (!response.ok) {
      throw new Error(
        `ESPN live scoreboard returned ${response.status}`
      );
    }

    const raw =
      await response.json();

    const data =
      Array.isArray(raw)
        ? raw[0]
        : raw;

    const result =
      new Map();

    // ----------------------------------------------
    // READ THE REQUESTED MATCHUP WEEK
    // ----------------------------------------------

    const schedule =
      Array.isArray(data?.schedule)
        ? data.schedule
        : [];

    for (const matchup of schedule) {
      if (
        Number(
          matchup?.matchupPeriodId
        ) !== Number(week)
      ) {
        continue;
      }

      // --------------------------------------------
      // PROCESS HOME AND AWAY FANTASY TEAMS
      // --------------------------------------------

      for (const sideName of [
        "away",
        "home",
      ]) {
        const side =
          matchup?.[sideName];

        const teamId =
          numberOrNull(
            side?.teamId
          );

        if (!teamId) {
          continue;
        }

        const teamData =
          getTeamLiveData(
            side,
            week
          );

        result.set(
          teamId,
          teamData
        );
      }
    }

    return result;

  } catch (error) {
    console.error(
      "ESPN live scoring error:",
      error
    );

    return new Map();
  }
}
