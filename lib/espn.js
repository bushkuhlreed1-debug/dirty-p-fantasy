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
  // =========================================================

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}` +
    `?view=mTeam` +
    `&view=mStandings` +
    `&view=mSettings` +
    `&view=mStatus`;

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
      response.status === 401 ||
      response.status === 403
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
  // =========================================================

  const memberMap =
    new Map();

  for (
    const member of
    data.members || []
  ) {
    const name =
      member.displayName ||
      [
        member.firstName,
        member.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      "Unknown Owner";

    memberMap.set(
      member.id,
      name
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
    const division of divisions
  ) {
    divisionMap.set(
      Number(division.id),
      division.name
    );
  }

  // =========================================================
  // PLAYOFF SETTINGS
  // =========================================================

  const playoffTeamCount =
    Number(
      data.settings
        ?.scheduleSettings
        ?.playoffTeamCount
    ) || 4;

  // =========================================================
  // CURRENT WEEK
  // =========================================================

  const currentWeek =
    Number(
      data.status
        ?.currentMatchupPeriod ??
        data.scoringPeriodId ??
        1
    );

  // =========================================================
  // NORMALIZE TEAMS
  // =========================================================

  const teams =
    (data.teams || []).map(
      (team) => {
        const ownerId =
          team.primaryOwner ||
          team.owners?.[0] ||
          team.ownerId ||
          null;

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
            Number(team.id),

          ownerId,

          ownerName:
            memberMap.get(
              ownerId
            ) ||
            "Unknown Owner",

          teamName,

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
            ) || null,
        };
      }
    );

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
  // RETURN CLEAN DATA
  // =========================================================

  return {
    leagueName:
      data.settings?.name ||
      "Dirty P Fantasy Football",

    season,

    currentWeek,

    playoffTeamCount,

    teams,
  };
}
