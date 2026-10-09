
import { supabase } from "./supabase";
import { getEspnLeague } from "./espn";

const CURRENT_SEASON = Number(
  process.env.ESPN_SEASON || 2026
);

// ======================================================
// BASIC HELPERS
// ======================================================

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validScore(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function nullableScore(value) {
  return validScore(value) ? Number(value) : null;
}

// ======================================================
// OWNER LOOKUP
// ======================================================

function buildOwnerLookup(owners) {
  const lookup = new Map();

  for (const owner of owners) {
    const key = normalizeName(owner.name);

    if (key) {
      lookup.set(key, owner);
    }
  }

  return lookup;
}

function findSupabaseOwner(ownerLookup, espnOwnerName) {
  if (!espnOwnerName) return null;

  return (
    ownerLookup.get(normalizeName(espnOwnerName)) ||
    null
  );
}

// ======================================================
// GAME CLASSIFICATION
//
// Consolation always takes priority.
// Championship-bracket games are separate from
// consolation and regular-season matchups.
// ======================================================

function getGameType(matchup) {
  const matchupType = normalizeText(
    matchup.matchup_type
  );

  const playoffTier = normalizeText(
    matchup.playoff_tier
  );

  const isConsolation =
    matchup.is_consolation === true ||
    matchupType.includes("consolation") ||
    matchupType.includes("loser") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("loser") ||
    playoffTier.includes("toilet");

  if (isConsolation) {
    return "consolation";
  }

  const isPlayoff =
    matchup.is_playoff === true ||
    matchup.is_championship === true ||
    matchup.is_third_place === true ||
    matchupType.includes("playoff") ||
    matchupType.includes("championship") ||
    matchupType.includes("third_place") ||
    playoffTier.includes("winner") ||
    playoffTier.includes("championship");

  if (isPlayoff) {
    return "playoff";
  }

  return "regular";
}

// ======================================================
// NORMALIZE HISTORICAL MATCHUPS
//
// Retain original matchups and IDs.
// Add consistent game-type fields without changing
// stored scores, winners or source data.
// ======================================================

function normalizeHistoricalMatchup(matchup) {
  const gameType = getGameType(matchup);

  return {
    ...matchup,

    matchup_type: gameType,

    is_playoff: gameType === "playoff",

    is_consolation: gameType === "consolation",

    is_championship:
      gameType === "playoff" &&
      matchup.is_championship === true,

    is_third_place:
      gameType === "playoff" &&
      matchup.is_third_place === true,

    source: matchup.source || "supabase",
  };
}

// ======================================================
// ESPN GAME COMPLETION
// ======================================================

function isEspnGameCompleted(matchup) {
  // ESPN's completed flag is the authority here.
  // Live scores must not be recorded as final games.

  if (matchup.completed !== true) {
    return false;
  }

  return (
    validScore(matchup.homeScore) &&
    validScore(matchup.awayScore)
  );
}

// ======================================================
// NORMALIZE ESPN MATCHUPS
// ======================================================

function normalizeEspnMatchup(
  matchup,
  espnTeamOwnerMap
) {
  const homeOwner = espnTeamOwnerMap.get(
    Number(matchup.homeEspnTeamId)
  );

  const awayOwner = espnTeamOwnerMap.get(
    Number(matchup.awayEspnTeamId)
  );

  // Don't create records with unmapped owners.
  if (!homeOwner || !awayOwner) {
    return null;
  }

  const isConsolation =
    matchup.isConsolation === true ||
    normalizeText(matchup.playoffTierType).includes(
      "consolation"
    ) ||
    normalizeText(matchup.playoffTierType).includes(
      "loser"
    );

  const isPlayoff =
    !isConsolation &&
    (
      matchup.isPlayoff === true ||
      matchup.possibleChampionship === true
    );

  const matchupType = isConsolation
    ? "consolation"
    : isPlayoff
      ? "playoff"
      : "regular";

  const completed = isEspnGameCompleted(matchup);

  const winner = completed
    ? normalizeText(matchup.winner).toUpperCase()
    : "";

  const homeScore = nullableScore(matchup.homeScore);
  const awayScore = nullableScore(matchup.awayScore);

  return {
    id:
      `espn-${CURRENT_SEASON}-${matchup.espnMatchupId}`,

    season_year: CURRENT_SEASON,

    matchup_period: Number(matchup.matchupPeriod),

    home_owner_id: Number(homeOwner.id),

    away_owner_id: Number(awayOwner.id),

    home_team_name:
      matchup.homeTeamName || "Unknown Team",

    away_team_name:
      matchup.awayTeamName || "Unknown Team",

    home_score: homeScore,

    away_score: awayScore,

    winner,

    matchup_type: matchupType,

    playoff_tier:
      matchup.playoffTierType || null,

    is_playoff: isPlayoff,

    is_consolation: isConsolation,

    is_championship:
      isPlayoff &&
      matchup.possibleChampionship === true,

    is_third_place:
      isPlayoff &&
      matchup.isThirdPlace === true,

    completed,

    is_final: completed,

    status: completed ? "FINAL" : "SCHEDULED",

    source: "espn",
  };
}

// ======================================================
// CURRENT-SEASON POSTSEASON RESULTS
//
// Only completed playoff games can establish:
// - Playoff participation
// - Championship appearance
// - A champion
//
// Future scheduled matchups never award GOAT points.
// ======================================================

function getCurrentSeasonPostseason(
  completedCurrentMatchups
) {
  const playoffOwnerIds = new Set();

  const championshipOwnerIds = new Set();

  let championOwnerId = null;

  for (const matchup of completedCurrentMatchups) {
    const gameType = getGameType(matchup);

    if (gameType !== "playoff") {
      continue;
    }

    const homeOwnerId = Number(
      matchup.home_owner_id
    );

    const awayOwnerId = Number(
      matchup.away_owner_id
    );

    if (homeOwnerId > 0) {
      playoffOwnerIds.add(homeOwnerId);
    }

    if (awayOwnerId > 0) {
      playoffOwnerIds.add(awayOwnerId);
    }

    if (matchup.is_championship !== true) {
      continue;
    }

    if (homeOwnerId > 0) {
      championshipOwnerIds.add(homeOwnerId);
    }

    if (awayOwnerId > 0) {
      championshipOwnerIds.add(awayOwnerId);
    }

    const winner = String(
      matchup.winner || ""
    ).toUpperCase();

    if (winner === "HOME") {
      championOwnerId = homeOwnerId;
    }

    if (winner === "AWAY") {
      championOwnerId = awayOwnerId;
    }
  }

  return {
    playoffOwnerIds,
    championshipOwnerIds,
    championOwnerId,
  };
}

// ======================================================
// MAIN SHARED LEAGUE DATA
// ======================================================

export async function getLeagueData() {
  // ====================================================
  // LOAD SUPABASE HISTORY AND CURRENT ESPN LEAGUE
  // ====================================================

  const [
    ownersResult,
    historicalMatchupsResult,
    historicalSeasonResultsResult,
    espnLeague,
  ] = await Promise.all([
    supabase
      .from("owners")
      .select("id, name"),

    supabase
      .from("matchups")
      .select("*")
      .lt("season_year", CURRENT_SEASON)
      .order("season_year", { ascending: true })
      .order("matchup_period", { ascending: true }),

    supabase
      .from("season_results")
      .select("*")
      .lt("season_year", CURRENT_SEASON)
      .order("season_year", { ascending: true }),

    getEspnLeague(),
  ]);

  // ====================================================
  // DATABASE ERRORS
  // ====================================================

  if (ownersResult.error) {
    throw new Error(
      `Owners database error: ${ownersResult.error.message}`
    );
  }

  if (historicalMatchupsResult.error) {
    throw new Error(
      `Matchups database error: ${historicalMatchupsResult.error.message}`
    );
  }

  if (historicalSeasonResultsResult.error) {
    throw new Error(
      `Season results database error: ${historicalSeasonResultsResult.error.message}`
    );
  }

  // ====================================================
  // HISTORICAL DATA
  // ====================================================

  const owners = ownersResult.data || [];

  const historicalMatchups = (
    historicalMatchupsResult.data || []
  ).map(normalizeHistoricalMatchup);

  const historicalSeasonResults =
    historicalSeasonResultsResult.data || [];

  // ====================================================
  // ESPN OWNER MATCHING
  // ====================================================

  const ownerLookup = buildOwnerLookup(owners);

  const espnTeamOwnerMap = new Map();

  for (const team of espnLeague.teams || []) {
    const owner = findSupabaseOwner(
      ownerLookup,
      team.ownerName
    );

    espnTeamOwnerMap.set(
      Number(team.espnTeamId),
      owner || null
    );
  }

  // ====================================================
  // CURRENT ESPN MATCHUPS
  // ====================================================

  const currentSeasonMatchups = (
    espnLeague.matchups || []
  )
    .map((matchup) =>
      normalizeEspnMatchup(
        matchup,
        espnTeamOwnerMap
      )
    )
    .filter(Boolean);

  // ====================================================
  // COMPLETED CURRENT-SEASON MATCHUPS
  //
  // Live games and future games remain excluded
  // from permanent league matchup history.
  // ====================================================

  const completedCurrentMatchups =
    currentSeasonMatchups.filter(
      (matchup) => matchup.completed === true
    );

  // ====================================================
  // COMBINED MATCHUP HISTORY
  // ====================================================

  const matchups = [
    ...historicalMatchups,
    ...completedCurrentMatchups,
  ].sort((a, b) => {
    const seasonDifference =
      Number(a.season_year) -
      Number(b.season_year);

    if (seasonDifference !== 0) {
      return seasonDifference;
    }

    return (
      Number(a.matchup_period) -
      Number(b.matchup_period)
    );
  });

  // ====================================================
  // CURRENT POSTSEASON
  // ====================================================

  const postseason = getCurrentSeasonPostseason(
    completedCurrentMatchups
  );

  // ====================================================
  // CURRENT-SEASON RESULTS
  //
  // Uses ESPN standings directly.
  // No Supabase update is required.
  // ====================================================

  const currentSeasonResults = (
    espnLeague.teams || []
  )
    .map((team) => {
      const owner = espnTeamOwnerMap.get(
        Number(team.espnTeamId)
      );

      if (!owner) {
        return null;
      }

      const ownerId = Number(owner.id);

      return {
        season_year: CURRENT_SEASON,

        owner_id: ownerId,

        wins: num(team.wins),

        losses: num(team.losses),

        ties: num(team.ties),

        points_for: num(team.pointsFor),

        points_against: num(team.pointsAgainst),

        playoff_appearance:
          postseason.playoffOwnerIds.has(ownerId),

        championship_appearance:
          postseason.championshipOwnerIds.has(ownerId),

        champion:
          postseason.championOwnerId === ownerId,

        source: "espn",
      };
    })
    .filter(Boolean);

  // ====================================================
  // COMPLETE SEASON RESULTS
  // ====================================================

  const seasonResults = [
    ...historicalSeasonResults,
    ...currentSeasonResults,
  ].sort(
    (a, b) =>
      Number(a.season_year) -
      Number(b.season_year)
  );

  // ====================================================
  // CURRENT ESPN TEAMS
  //
  // Includes division information for the homepage.
  // ====================================================

  const currentTeams = (
    espnLeague.teams || []
  )
    .map((team) => {
      const owner = espnTeamOwnerMap.get(
        Number(team.espnTeamId)
      );

      if (!owner) {
        return null;
      }

      return {
        owner_id: Number(owner.id),

        owner_name: owner.name,

        team_name: team.teamName,

        espn_team_id: team.espnTeamId,

        wins: num(team.wins),

        losses: num(team.losses),

        ties: num(team.ties),

        points_for: num(team.pointsFor),

        points_against: num(team.pointsAgainst),

        playoff_seed: num(team.playoffSeed),

        division_id: team.divisionId ?? null,

        division_name: team.divisionName ?? null,
      };
    })
    .filter(Boolean);

  // ====================================================
  // UNMATCHED ESPN OWNERS
  // ====================================================

  const unmatchedEspnOwners = (
    espnLeague.teams || []
  )
    .filter((team) => {
      const owner = espnTeamOwnerMap.get(
        Number(team.espnTeamId)
      );

      return !owner;
    })
    .map((team) => ({
      espnTeamId: team.espnTeamId,

      ownerName: team.ownerName,

      teamName: team.teamName,
    }));

  // ====================================================
  // RETURN ALL SHARED DATA
  //
  // Preserve names expected by existing pages.
  // ====================================================

  return {
    leagueName: espnLeague.leagueName,

    currentSeason: CURRENT_SEASON,

    currentWeek: espnLeague.currentWeek,

    currentScoringPeriod:
      espnLeague.currentScoringPeriod,

    playoffTeamCount:
      espnLeague.playoffTeamCount,

    owners,

    currentTeams,

    historicalMatchups,

    currentSeasonMatchups,

    completedCurrentMatchups,

    matchups,

    historicalSeasonResults,

    currentSeasonResults,

    seasonResults,

    unmatchedEspnOwners,
  };
}
