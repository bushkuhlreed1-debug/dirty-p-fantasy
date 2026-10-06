const ESPN_REFRESH_SECONDS = 300;

export async function getEspnLeague() {
  const leagueId = process.env.ESPN_LEAGUE_ID;
  const season = Number(
    process.env.ESPN_SEASON || 2026
  );

  const espnS2 = process.env.ESPN_S2;
  const swid = process.env.ESPN_SWID;

  if (!leagueId) {
    throw new Error(
      "Missing ESPN_LEAGUE_ID environment variable."
    );
  }

  if (!espnS2 || !swid) {
    throw new Error(
      "Missing ESPN_S2 or ESPN_SWID environment variable."
    );
  }

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}` +
    `?view=mTeam` +
    `&view=mStandings` +
    `&view=mSettings` +
    `&view=mStatus`;

  const response = await fetch(url, {
    headers: {
      Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
      Accept: "application/json",
    },

    next: {
      revalidate: ESPN_REFRESH_SECONDS,
    },
  });

  if (!response.ok) {
    const body = await response.text();

    console.error(
      "ESPN fantasy request failed:",
      response.status,
      body
    );

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        "ESPN authentication failed. Your ESPN_S2 or SWID may need to be refreshed."
      );
    }

    throw new Error(
      `ESPN request failed with status ${response.status}.`
    );
  }

  const data = await response.json();

  return normalizeEspnLeague(data, season);
}

function normalizeEspnLeague(data, season) {
  const members = data.members || [];
  const teams = data.teams || [];

  const memberMap = new Map();

  members.forEach((member) => {
    const name =
      member.displayName ||
      [
        member.firstName,
        member.lastName,
      ]
        .filter(Boolean)
        .join(" ") ||
      "Unknown Owner";

    memberMap.set(
      member.id,
      name
    );
  });

  const normalizedTeams = teams.map(
    (team) => {
      const ownerId =
        team.primaryOwner ||
        team.owners?.[0] ||
        null;

      const record =
        team.record?.overall || {};

      const teamName =
        team.name ||
        [
          team.location,
          team.nickname,
        ]
          .filter(Boolean)
          .join(" ") ||
        team.abbrev ||
        `Team ${team.id}`;

      return {
        id: team.id,

        teamName,

        ownerId,

        ownerName:
          memberMap.get(ownerId) ||
          "Unknown Owner",

        wins:
          Number(
            record.wins || 0
          ),

        losses:
          Number(
            record.losses || 0
          ),

        ties:
          Number(
            record.ties || 0
          ),

        winPercentage:
          Number(
            record.percentage || 0
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
            team.playoffSeed || 0
          ),

        divisionId:
          team.divisionId,

        logo:
          team.logo || null,

        streakType:
          record.streakType || null,

        streakLength:
          Number(
            record.streakLength || 0
          ),
      };
    }
  );

  // ESPN supplies playoffSeed as the current league standing.
  // Fall back to W-L / points if it is missing.
  normalizedTeams.sort(
    (a, b) => {
      if (
        a.playoffSeed > 0 &&
        b.playoffSeed > 0
      ) {
        return (
          a.playoffSeed -
          b.playoffSeed
        );
      }

      if (
        b.winPercentage !==
        a.winPercentage
      ) {
        return (
          b.winPercentage -
          a.winPercentage
        );
      }

      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      return (
        b.pointsFor -
        a.pointsFor
      );
    }
  );

  const playoffTeamCount =
    Number(
      data.settings
        ?.scheduleSettings
        ?.playoffTeamCount
    ) || 4;

  const currentWeek =
    Number(
      data.status
        ?.currentMatchupPeriod ??
        data.scoringPeriodId ??
        1
    );

  return {
    season,

    currentWeek,

    playoffTeamCount,

    teams:
      normalizedTeams,
  };
}
