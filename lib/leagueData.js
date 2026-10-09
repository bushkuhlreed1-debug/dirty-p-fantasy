import { supabase } from "./supabase";
import { getEspnLeague } from "./espn";

const CURRENT_SEASON = Number(
  process.env.ESPN_SEASON || 2026
);

// =====================================================
// HELPERS
// =====================================================

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function buildOwnerLookup(owners) {
  return new Map(
    owners.map((owner) => [
      normalizeName(owner.name),
      owner,
    ])
  );
}

function findSupabaseOwner(lookup, name) {
  if (!name) return null;
  return lookup.get(normalizeName(name)) || null;
}

// =====================================================
// CURRENT SEASON POSTSEASON
// =====================================================

function getCurrentSeasonPostseason(
  espnLeague,
  mappedMatchups,
  espnTeamOwnerMap
) {
  const playoffOwnerIds = new Set();
  const championshipOwnerIds = new Set();

  let championOwnerId = null;

  for (const matchup of mappedMatchups) {
    if (
      matchup.is_playoff &&
      !matchup.is_consolation
    ) {
      playoffOwnerIds.add(matchup.home_owner_id);
      playoffOwnerIds.add(matchup.away_owner_id);
    }

    if (matchup.is_championship) {
      championshipOwnerIds.add(
        matchup.home_owner_id
      );

      championshipOwnerIds.add(
        matchup.away_owner_id
      );

      if (matchup.completed) {
        const winner = String(
          matchup.winner || ""
        ).toUpperCase();

        if (winner === "HOME") {
          championOwnerId = matchup.home_owner_id;
        }

        if (winner === "AWAY") {
          championOwnerId = matchup.away_owner_id;
        }
      }
    }
  }

  // Semifinal winners qualify for the championship
  // even before the championship matchup is completed.

  for (
    const espnTeamId of
    espnLeague.championshipFinalistTeamIds || []
  ) {
    const owner = espnTeamOwnerMap.get(
      Number(espnTeamId)
    );

    if (owner) {
      championshipOwnerIds.add(Number(owner.id));
      playoffOwnerIds.add(Number(owner.id));
    }
  }

  return {
    playoffOwnerIds,
    championshipOwnerIds,
    championOwnerId,
  };
}

// =====================================================
// MAIN LEAGUE DATA
// =====================================================

export async function getLeagueData() {
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

  const owners = ownersResult.data || [];

  const historicalMatchups =
    historicalMatchupsResult.data || [];

  const historicalSeasonResults =
    historicalSeasonResultsResult.data || [];

  // ===================================================
  // ESPN TO SUPABASE OWNER MAPPING
  // ===================================================

  const ownerLookup = buildOwnerLookup(owners);

  const espnTeamOwnerMap = new Map();

  for (const team of espnLeague.teams || []) {
    const owner = findSupabaseOwner(
      ownerLookup,
      team.ownerName
    );

    espnTeamOwnerMap.set(
      Number(team.espnTeamId),
      owner
    );
  }

  // ===================================================
  // NORMALIZE ESPN MATCHUPS
  // ===================================================

  const currentSeasonMatchups = (
    espnLeague.matchups || []
  )
    .map((matchup) => {
      const homeOwner = espnTeamOwnerMap.get(
        Number(matchup.homeEspnTeamId)
      );

      const awayOwner = espnTeamOwnerMap.get(
        Number(matchup.awayEspnTeamId)
      );

      if (!homeOwner || !awayOwner) {
        return null;
      }

      const isConsolation = Boolean(
        matchup.isConsolation
      );

      const isPlayoff = Boolean(
        matchup.isPlayoff
      );

      const matchupType = isConsolation
        ? "consolation"
        : isPlayoff
        ? "playoff"
        : "regular";

      return {
        id: `espn-${CURRENT_SEASON}-${matchup.espnMatchupId}`,

        season_year: CURRENT_SEASON,

        matchup_period: num(
          matchup.matchupPeriod
        ),

        home_owner_id: Number(homeOwner.id),
        away_owner_id: Number(awayOwner.id),

        home_team_name: matchup.homeTeamName,
        away_team_name: matchup.awayTeamName,

        home_score:
          matchup.homeScore == null
            ? null
            : num(matchup.homeScore),

        away_score:
          matchup.awayScore == null
            ? null
            : num(matchup.awayScore),

        winner: matchup.winner,

        matchup_type: matchupType,
        playoff_tier: matchup.playoffTierType,

        is_playoff: isPlayoff,
        is_consolation: isConsolation,

        is_championship: Boolean(
          matchup.possibleChampionship
        ),

        is_third_place: Boolean(
          matchup.isThirdPlace
        ),

        completed: Boolean(
          matchup.completed
        ),

        source: "espn",
      };
    })
    .filter(Boolean);

  // Only finalized ESPN games count toward records.

  const completedCurrentMatchups =
    currentSeasonMatchups.filter(
      (game) => game.completed
    );

  // ===================================================
  // COMBINED LEAGUE MATCHUP HISTORY
  // ===================================================

  const matchups = [
    ...historicalMatchups,
    ...completedCurrentMatchups,
  ].sort(
    (a, b) =>
      num(a.season_year) - num(b.season_year) ||
      num(a.matchup_period) - num(b.matchup_period)
  );

  // ===================================================
  // CURRENT POSTSEASON STATUS
  // ===================================================

  const postseason = getCurrentSeasonPostseason(
    espnLeague,
    currentSeasonMatchups,
    espnTeamOwnerMap
  );

  // ===================================================
  // CURRENT SEASON RESULTS
  // ===================================================

  const currentSeasonResults = (
    espnLeague.teams || []
  )
    .map((team) => {
      const owner = espnTeamOwnerMap.get(
        Number(team.espnTeamId)
      );

      if (!owner) return null;

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

  // ===================================================
  // COMBINED SEASON RESULTS
  // ===================================================

  const seasonResults = [
    ...historicalSeasonResults,
    ...currentSeasonResults,
  ].sort(
    (a, b) =>
      num(a.season_year) - num(b.season_year)
  );

  // ===================================================
  // CURRENT ESPN TEAMS
  // ===================================================

  const currentTeams = (
    espnLeague.teams || []
  )
    .map((team) => {
      const owner = espnTeamOwnerMap.get(
        Number(team.espnTeamId)
      );

      if (!owner) return null;

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

        division_id: team.divisionId,
        division_name: team.divisionName,
      };
    })
    .filter(Boolean);

  // ===================================================
  // UNMATCHED ESPN OWNERS
  // ===================================================

  const unmatchedEspnOwners = (
    espnLeague.teams || []
  )
    .filter((team) => {
      return !espnTeamOwnerMap.get(
        Number(team.espnTeamId)
      );
    })
    .map((team) => ({
      espnTeamId: team.espnTeamId,
      ownerName: team.ownerName,
      teamName: team.teamName,
    }));

  // ===================================================
  // RETURN ALL LEAGUE DATA
  // ===================================================

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
