export async function getEspnLeague() {
  const leagueId =
    process.env.ESPN_LEAGUE_ID;

  const season =
    Number(
      process.env.ESPN_SEASON ||
        2026
    );

  const espnS2 =
    process.env.ESPN_S2;

  const swid =
    process.env.ESPN_SWID;

  // =========================================================
  // CHECK ENVIRONMENT VARIABLES
  // =========================================================

  if (!leagueId) {
    throw new Error(
      "Missing ESPN_LEAGUE_ID"
    );
  }

  if (!espnS2) {
    throw new Error(
      "Missing ESPN_S2"
    );
  }

  if (!swid) {
    throw new Error(
      "Missing ESPN_SWID"
    );
  }

  // =========================================================
  // ESPN PRIVATE FANTASY ENDPOINT
  //
  // mTeam          = teams / records
  // mStandings     = standings
  // mSettings      = league / playoff settings
  // mStatus        = current week
  // mMatchupScore  = schedule + matchup scores
  // =========================================================

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}` +
    `?view=mTeam` +
    `&view=mStandings` +
    `&view=mSettings` +
    `&view=mStatus` +
    `&view=mMatchupScore`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          Cookie:
            `espn_s2=${espnS2}; SWID=${swid}`,

          "User-Agent":
            "Mozilla/5.0",
        },

        cache:
          "no-store",
      }
    );

  // =========================================================
  // ESPN ERROR
  // =========================================================

  if (!response.ok) {
    const body =
      await response.text();

    console.error(
      "ESPN request failed:",
      response.status,
      body
    );

    if (
      response.status ===
        401 ||
      response.status ===
        403
    ) {
      throw new Error(
        "ESPN authentication failed. ESPN_S2 or ESPN_SWID may need to be refreshed."
      );
    }

    throw new Error(
      `ESPN request failed with status ${response.status}`
    );
  }

  const data =
    await response.json();

  // =========================================================
  // OWNER LOOKUP
  //
  // Prefer first + last name because we eventually need to
  // match ESPN owners to the owner names in Supabase.
  // =========================================================

  const memberMap =
    new Map();

  for (
    const member of
    data.members || []
  ) {
    const fullName =
      [
        member.firstName,
        member.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    const name =
      fullName ||
      member.displayName ||
      "Unknown Owner";

    memberMap.set(
      member.id,
      {
        espnOwnerId:
          member.id,

        ownerName:
          name,

        displayName:
          member.displayName ||
          name,
      }
    );
  }

  // =========================================================
  // DIVISION LOOKUP
  // =========================================================

  const divisionMap =
    new Map();

  const divisions =
    data.settings
      ?.scheduleSettings
      ?.divisions || [];

  for (
    const division of
    divisions
  ) {
    divisionMap.set(
      Number(
        division.id
      ),
      division.name
    );
  }

  // =========================================================
  // LEAGUE SETTINGS
  // =========================================================

  const scheduleSettings =
    data.settings
      ?.scheduleSettings ||
    {};

  const playoffTeamCount =
    Number(
      scheduleSettings
        .playoffTeamCount
    ) || 4;

  const regularSeasonMatchupCount =
    Number(
      scheduleSettings
        .matchupPeriodCount
    ) || 14;

  const playoffMatchupPeriodLength =
    Number(
      scheduleSettings
        .playoffMatchupPeriodLength
    ) || 1;

  // =========================================================
  // CURRENT WEEK / PERIOD
  // =========================================================

  const currentWeek =
    Number(
      data.status
        ?.currentMatchupPeriod ??
        data.scoringPeriodId ??
        1
    );

  const currentScoringPeriod =
    Number(
      data.status
        ?.currentScoringPeriod ??
        data.scoringPeriodId ??
        currentWeek
    );

  const latestScoringPeriod =
    Number(
      data.status
        ?.latestScoringPeriod ??
        currentScoringPeriod
    );

  const finalScoringPeriod =
    Number(
      data.status
        ?.finalScoringPeriod ??
        18
    );

  // =========================================================
  // NORMALIZE TEAMS
  // =========================================================

  const teams =
    (
      data.teams || []
    ).map(
      (team) => {
        const espnOwnerId =
          team.primaryOwner ||
          team.owners?.[0] ||
          team.ownerId ||
          null;

        const member =
          memberMap.get(
            espnOwnerId
          );

        const record =
          team.record?.overall ||
          {};

        const teamName =
          team.name ||
          [
            team.location,
            team.nickname,
          ]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          team.abbrev ||
          `Team ${team.id}`;

        return {
          espnTeamId:
            Number(
              team.id
            ),

          espnOwnerId,

          ownerName:
            member?.ownerName ||
            "Unknown Owner",

          ownerDisplayName:
            member
              ?.displayName ||
            "Unknown Owner",

          teamName,

          abbreviation:
            team.abbrev ||
            null,

          wins:
            Number(
              record.wins ||
                0
            ),

          losses:
            Number(
              record.losses ||
                0
            ),

          ties:
            Number(
              record.ties ||
                0
            ),

          pointsFor:
            Number(
              record.pointsFor ??
                team.points ??
                0
            ),

          pointsAgainst:
            Number(
              record.pointsAgainst ??
                team.pointsAgainst ??
                0
            ),

          playoffSeed:
            Number(
              team.playoffSeed ||
                0
            ),

          finalRank:
            Number(
              team.rankCalculatedFinal ||
                0
            ),

          divisionId:
            team.divisionId !=
            null
              ? Number(
                  team.divisionId
                )
              : null,

          divisionName:
            divisionMap.get(
              Number(
                team.divisionId
              )
            ) ||
            null,
        };
      }
    );

  // =========================================================
  // TEAM LOOKUP
  // =========================================================

  const teamMap =
    new Map();

  for (
    const team of teams
  ) {
    teamMap.set(
      team.espnTeamId,
      team
    );
  }

  // =========================================================
  // SORT STANDINGS
  // =========================================================

  teams.sort(
    (a, b) => {
      if (
        a.playoffSeed > 0 &&
        b.playoffSeed > 0 &&
        a.playoffSeed !==
          b.playoffSeed
      ) {
        return (
          a.playoffSeed -
          b.playoffSeed
        );
      }

      if (
        b.wins !==
        a.wins
      ) {
        return (
          b.wins -
          a.wins
        );
      }

      if (
        b.ties !==
        a.ties
      ) {
        return (
          b.ties -
          a.ties
        );
      }

      return (
        b.pointsFor -
        a.pointsFor
      );
    }
  );

  // =========================================================
  // RAW ESPN SCHEDULE
  // =========================================================

  const rawSchedule =
    Array.isArray(
      data.schedule
    )
      ? data.schedule
      : [];

  const matchupPeriods =
    rawSchedule
      .map(
        (matchup) =>
          Number(
            matchup
              .matchupPeriodId
          )
      )
      .filter(
        (period) =>
          Number.isFinite(
            period
          ) &&
          period > 0
      );

  const finalMatchupPeriod =
    matchupPeriods.length
      ? Math.max(
          ...matchupPeriods
        )
      : regularSeasonMatchupCount;

  // =========================================================
  // NORMALIZE MATCHUPS
  // =========================================================

  const matchups =
    rawSchedule
      .map(
        (matchup) => {
          const homeTeamId =
            Number(
              matchup.home
                ?.teamId
            );

          const awayTeamId =
            Number(
              matchup.away
                ?.teamId
            );

          const homeTeam =
            teamMap.get(
              homeTeamId
            );

          const awayTeam =
            teamMap.get(
              awayTeamId
            );

          const matchupPeriod =
            Number(
              matchup
                .matchupPeriodId ||
                0
            );

          const homeScore =
            Number(
              matchup.home
                ?.totalPoints ??
                0
            );

          const awayScore =
            Number(
              matchup.away
                ?.totalPoints ??
                0
            );

          const winner =
            String(
              matchup.winner ||
                "UNDECIDED"
            ).toUpperCase();

          const playoffTierType =
            String(
              matchup
                .playoffTierType ||
                "NONE"
            ).toUpperCase();

          const isPlayoff =
            matchupPeriod >
              regularSeasonMatchupCount ||
            playoffTierType ===
              "WINNERS_BRACKET" ||
            playoffTierType ===
              "LOSERS_BRACKET" ||
            playoffTierType.includes(
              "CONSOLATION"
            );

          const isConsolation =
            playoffTierType.includes(
              "LOSER"
            ) ||
            playoffTierType.includes(
              "CONSOLATION"
            );

          const isWinnersBracket =
            playoffTierType ===
            "WINNERS_BRACKET";

          // ---------------------------------------------------
          // ESPN tells us the winner once the matchup is final.
          // Only these games should affect historical stats.
          // ---------------------------------------------------

          const completed =
            winner === "HOME" ||
            winner === "AWAY" ||
            winner === "TIE";

          const hasBothTeams =
            Number.isFinite(
              homeTeamId
            ) &&
            homeTeamId > 0 &&
            Number.isFinite(
              awayTeamId
            ) &&
            awayTeamId > 0;

          return {
            espnMatchupId:
              matchup.id,

            season,

            matchupPeriod,

            homeEspnTeamId:
              homeTeamId,

            awayEspnTeamId:
              awayTeamId,

            homeEspnOwnerId:
              homeTeam
                ?.espnOwnerId ||
              null,

            awayEspnOwnerId:
              awayTeam
                ?.espnOwnerId ||
              null,

            homeOwnerName:
              homeTeam
                ?.ownerName ||
              "Unknown Owner",

            awayOwnerName:
              awayTeam
                ?.ownerName ||
              "Unknown Owner",

            homeTeamName:
              homeTeam
                ?.teamName ||
              `Team ${homeTeamId}`,

            awayTeamName:
              awayTeam
                ?.teamName ||
              `Team ${awayTeamId}`,

            homeScore,

            awayScore,

            winner,

            playoffTierType,

            isPlayoff,

            isConsolation,

            isWinnersBracket,

            completed:
              completed &&
              hasBothTeams,

            // We will make championship detection
            // more precise in leagueData.js.
            possibleChampionship:
              isWinnersBracket &&
              matchupPeriod ===
                finalMatchupPeriod,
          };
        }
      )
      .filter(
        (matchup) =>
          Number.isFinite(
            matchup.matchupPeriod
          ) &&
          matchup.matchupPeriod >
            0
      );

  // =========================================================
  // COMPLETED MATCHUPS
  //
  // THESE are what Records / Head-to-Head / GOAT will use.
  // A live unfinished game does NOT get counted.
  // =========================================================

  const completedMatchups =
    matchups.filter(
      (matchup) =>
        matchup.completed
    );

  // =========================================================
  // COMPLETED REGULAR-SEASON MATCHUPS
  // =========================================================

  const completedRegularSeasonMatchups =
    completedMatchups.filter(
      (matchup) =>
        !matchup.isPlayoff
    );

  // =========================================================
  // COMPLETED PLAYOFF MATCHUPS
  // =========================================================

  const completedPlayoffMatchups =
    completedMatchups.filter(
      (matchup) =>
        matchup.isPlayoff &&
        !matchup.isConsolation
    );

  // =========================================================
  // RETURN CLEAN DATA
  // =========================================================

  return {
    leagueName:
      data.settings?.name ||
      "Dirty P Fantasy Football",

    season,

    currentWeek,

    currentScoringPeriod,

    latestScoringPeriod,

    finalScoringPeriod,

    playoffTeamCount,

    regularSeasonMatchupCount,

    playoffMatchupPeriodLength,

    finalMatchupPeriod,

    teams,

    matchups,

    completedMatchups,

    completedRegularSeasonMatchups,

    completedPlayoffMatchups,
  };
}
