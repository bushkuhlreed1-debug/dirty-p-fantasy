import { supabase } from "./supabase";
import { getEspnLeague } from "./espn";

const CURRENT_SEASON =
  Number(
    process.env.ESPN_SEASON ||
      2026
  );

// =========================================================
// HELPERS
// =========================================================

function num(value) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function normalizeName(
  value = ""
) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(
      /[^a-z0-9]/g,
      ""
    );
}

// =========================================================
// OWNER LOOKUP
//
// ESPN knows owners by ESPN member IDs.
// Supabase knows owners by our permanent owner IDs.
//
// We match them by owner name.
// =========================================================

function buildOwnerLookup(
  owners
) {
  const lookup =
    new Map();

  for (
    const owner of
    owners
  ) {
    lookup.set(
      normalizeName(
        owner.name
      ),
      owner
    );
  }

  return lookup;
}

function findSupabaseOwner(
  ownerLookup,
  espnOwnerName
) {
  if (!espnOwnerName) {
    return null;
  }

  const normalized =
    normalizeName(
      espnOwnerName
    );

  return (
    ownerLookup.get(
      normalized
    ) ||
    null
  );
}

// =========================================================
// CURRENT SEASON PLAYOFF INFORMATION
// =========================================================

function getCurrentSeasonPostseason(
  espnLeague,
  mappedMatchups
) {
  const playoffOwnerIds =
    new Set();

  const championshipOwnerIds =
    new Set();

  let championOwnerId =
    null;

  for (
    const matchup of
    mappedMatchups
  ) {
    if (
      matchup.is_playoff &&
      !matchup.is_consolation
    ) {
      if (
        matchup.home_owner_id
      ) {
        playoffOwnerIds.add(
          matchup.home_owner_id
        );
      }

      if (
        matchup.away_owner_id
      ) {
        playoffOwnerIds.add(
          matchup.away_owner_id
        );
      }
    }

    if (
      matchup.is_championship
    ) {
      if (
        matchup.home_owner_id
      ) {
        championshipOwnerIds.add(
          matchup.home_owner_id
        );
      }

      if (
        matchup.away_owner_id
      ) {
        championshipOwnerIds.add(
          matchup.away_owner_id
        );
      }

      if (
        matchup.completed
      ) {
        if (
          matchup.winner ===
          "HOME"
        ) {
          championOwnerId =
            matchup.home_owner_id;
        }

        if (
          matchup.winner ===
          "AWAY"
        ) {
          championOwnerId =
            matchup.away_owner_id;
        }
      }
    }
  }

  return {
    playoffOwnerIds,
    championshipOwnerIds,
    championOwnerId,
  };
}

// =========================================================
// MAIN SHARED LEAGUE DATA
// =========================================================

export async function getLeagueData() {
  // =======================================================
  // LOAD HISTORICAL DATABASE + LIVE ESPN
  // =======================================================

  const [
    ownersResult,
    historicalMatchupsResult,
    historicalSeasonResultsResult,
    espnLeague,
  ] =
    await Promise.all([
      supabase
        .from("owners")
        .select(
          "id, name"
        ),

      supabase
        .from("matchups")
        .select("*")
        .lt(
          "season_year",
          CURRENT_SEASON
        )
        .order(
          "season_year",
          {
            ascending:
              true,
          }
        )
        .order(
          "matchup_period",
          {
            ascending:
              true,
          }
        ),

      supabase
        .from(
          "season_results"
        )
        .select("*")
        .lt(
          "season_year",
          CURRENT_SEASON
        )
        .order(
          "season_year",
          {
            ascending:
              true,
          }
        ),

      getEspnLeague(),
    ]);

  // =======================================================
  // DATABASE ERRORS
  // =======================================================

  if (
    ownersResult.error
  ) {
    throw new Error(
      `Owners database error: ${ownersResult.error.message}`
    );
  }

  if (
    historicalMatchupsResult.error
  ) {
    throw new Error(
      `Matchups database error: ${historicalMatchupsResult.error.message}`
    );
  }

  if (
    historicalSeasonResultsResult.error
  ) {
    throw new Error(
      `Season results database error: ${historicalSeasonResultsResult.error.message}`
    );
  }

  const owners =
    ownersResult.data ||
    [];

  const historicalMatchups =
    historicalMatchupsResult.data ||
    [];

  const historicalSeasonResults =
    historicalSeasonResultsResult.data ||
    [];

  // =======================================================
  // MATCH ESPN OWNERS TO SUPABASE OWNERS
  // =======================================================

  const ownerLookup =
    buildOwnerLookup(
      owners
    );

  const espnTeamOwnerMap =
    new Map();

  for (
    const team of
    espnLeague.teams
  ) {
    const owner =
      findSupabaseOwner(
        ownerLookup,
        team.ownerName
      );

    espnTeamOwnerMap.set(
      Number(
        team.espnTeamId
      ),
      owner || null
    );
  }

  // =======================================================
  // NORMALIZE CURRENT ESPN MATCHUPS
  //
  // These get converted into the same shape our old
  // Supabase matchups already use.
  // =======================================================

  const currentSeasonMatchups =
    espnLeague.matchups
      .map(
        (matchup) => {
          const homeOwner =
            espnTeamOwnerMap.get(
              Number(
                matchup.homeEspnTeamId
              )
            );

          const awayOwner =
            espnTeamOwnerMap.get(
              Number(
                matchup.awayEspnTeamId
              )
            );

          if (
            !homeOwner ||
            !awayOwner
          ) {
            return null;
          }

          let matchupType =
            "regular";

          if (
            matchup.isConsolation
          ) {
            matchupType =
              "consolation";
          } else if (
            matchup.isPlayoff
          ) {
            matchupType =
              "playoff";
          }

          return {
            id:
              `espn-${CURRENT_SEASON}-${matchup.espnMatchupId}`,

            season_year:
              CURRENT_SEASON,

            matchup_period:
              Number(
                matchup.matchupPeriod
              ),

            home_owner_id:
              Number(
                homeOwner.id
              ),

            away_owner_id:
              Number(
                awayOwner.id
              ),

            home_team_name:
              matchup.homeTeamName,

            away_team_name:
              matchup.awayTeamName,

            home_score:
              num(
                matchup.homeScore
              ),

            away_score:
              num(
                matchup.awayScore
              ),

            winner:
              matchup.winner,

            matchup_type:
              matchupType,

            playoff_tier:
              matchup.playoffTierType,

            is_playoff:
              Boolean(
                matchup.isPlayoff
              ),

            is_consolation:
              Boolean(
                matchup.isConsolation
              ),

            is_championship:
              Boolean(
                matchup.possibleChampionship
              ),

            completed:
              Boolean(
                matchup.completed
              ),

            source:
              "espn",
          };
        }
      )
      .filter(Boolean);

  // =======================================================
  // ONLY COMPLETED CURRENT GAMES ENTER LEAGUE HISTORY
  //
  // This prevents Sunday afternoon live scores from
  // becoming records or changing head-to-head history.
  // =======================================================

  const completedCurrentMatchups =
    currentSeasonMatchups.filter(
      (matchup) =>
        matchup.completed
    );

  // =======================================================
  // BUILD COMPLETE MATCHUP HISTORY
  //
  // 2014–2025 = Supabase
  // 2026       = ESPN
  // =======================================================

  const matchups = [
    ...historicalMatchups,

    ...completedCurrentMatchups,
  ].sort(
    (a, b) =>
      Number(
        a.season_year
      ) -
        Number(
          b.season_year
        ) ||
      Number(
        a.matchup_period
      ) -
        Number(
          b.matchup_period
        )
  );

  // =======================================================
  // CURRENT-SEASON POSTSEASON FLAGS
  // =======================================================

  const postseason =
    getCurrentSeasonPostseason(
      espnLeague,
      currentSeasonMatchups
    );

  // =======================================================
  // CURRENT-SEASON RESULTS
  //
  // ESPN standings become a temporary 2026 season_results
  // row for each owner.
  //
  // We DO NOT need to manually write these to Supabase.
  // =======================================================

  const currentSeasonResults =
    espnLeague.teams
      .map(
        (team) => {
          const owner =
            espnTeamOwnerMap.get(
              Number(
                team.espnTeamId
              )
            );

          if (!owner) {
            return null;
          }

          const ownerId =
            Number(
              owner.id
            );

          return {
            season_year:
              CURRENT_SEASON,

            owner_id:
              ownerId,

            wins:
              num(
                team.wins
              ),

            losses:
              num(
                team.losses
              ),

            ties:
              num(
                team.ties
              ),

            points_for:
              num(
                team.pointsFor
              ),

            points_against:
              num(
                team.pointsAgainst
              ),

            playoff_appearance:
              postseason
                .playoffOwnerIds
                .has(
                  ownerId
                ),

            championship_appearance:
              postseason
                .championshipOwnerIds
                .has(
                  ownerId
                ),

            champion:
              postseason
                .championOwnerId ===
              ownerId,

            source:
              "espn",
          };
        }
      )
      .filter(Boolean);

  // =======================================================
  // COMPLETE SEASON RESULTS HISTORY
  //
  // 2014–2025 Supabase
  // 2026 ESPN
  // =======================================================

  const seasonResults = [
    ...historicalSeasonResults,

    ...currentSeasonResults,
  ].sort(
    (a, b) =>
      Number(
        a.season_year
      ) -
      Number(
        b.season_year
      )
  );

  // =======================================================
  // CURRENT TEAMS
  // =======================================================

  const currentTeams =
    espnLeague.teams
      .map(
        (team) => {
          const owner =
            espnTeamOwnerMap.get(
              Number(
                team.espnTeamId
              )
            );

          if (!owner) {
            return null;
          }

          return {
            owner_id:
              Number(
                owner.id
              ),

            owner_name:
              owner.name,

            team_name:
              team.teamName,

            espn_team_id:
              team.espnTeamId,

            wins:
              team.wins,

            losses:
              team.losses,

            ties:
              team.ties,

            points_for:
              team.pointsFor,

            points_against:
              team.pointsAgainst,

            playoff_seed:
              team.playoffSeed,

            division_id:
              team.divisionId,

            division_name:
              team.divisionName,
          };
        }
      )
      .filter(Boolean);

  // =======================================================
  // ESPN OWNER MATCH CHECK
  //
  // Useful while we are setting this up.
  // If someone does not match Supabase, they appear here.
  // =======================================================

  const unmatchedEspnOwners =
    espnLeague.teams
      .filter(
        (team) => {
          const owner =
            espnTeamOwnerMap.get(
              Number(
                team.espnTeamId
              )
            );

          return !owner;
        }
      )
      .map(
        (team) => ({
          espnTeamId:
            team.espnTeamId,

          ownerName:
            team.ownerName,

          teamName:
            team.teamName,
        })
      );

  // =======================================================
  // RETURN EVERYTHING
  // =======================================================

  return {
    leagueName:
      espnLeague.leagueName,

    currentSeason:
      CURRENT_SEASON,

    currentWeek:
      espnLeague.currentWeek,

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
