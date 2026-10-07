export async function getEspnPlayoffSettings(season) {
  const leagueId =
    process.env.ESPN_LEAGUE_ID?.trim();

  const espnS2 =
    process.env.ESPN_S2?.trim();

  const espnSwid =
    process.env.ESPN_SWID?.trim();

  if (!leagueId) {
    throw new Error(
      "Missing ESPN_LEAGUE_ID"
    );
  }

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

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/` +
    `seasons/${season}/segments/0/leagues/${leagueId}` +
    `?view=mSettings&view=mTeam&view=mStandings`;

  const response =
    await fetch(
      url,
      {
        cache: "no-store",

        headers:
          cookies.length
            ? {
                Cookie:
                  cookies.join(
                    "; "
                  ),
              }
            : {},
      }
    );

  if (!response.ok) {
    throw new Error(
      `ESPN settings request returned ${response.status}`
    );
  }

  const raw =
    await response.json();

  const data =
    Array.isArray(raw)
      ? raw[0]
      : raw;

  const settings =
    data?.settings || {};

  const schedule =
    settings
      ?.scheduleSettings ||
    {};

  const scoring =
    settings
      ?.scoringSettings ||
    {};

  const divisions =
    schedule
      ?.divisions || [];

  const divisionNameById =
    {};

  for (
    const division of
    divisions
  ) {
    divisionNameById[
      Number(
        division.id
      )
    ] =
      division.name;
  }

  const teams =
    (
      data?.teams || []
    ).map(
      (team) => ({
        id:
          Number(
            team.id
          ),

        name:
          team.name || "",

        abbreviation:
          team.abbrev || "",

        divisionId:
          Number(
            team.divisionId
          ),

        playoffSeed:
          Number(
            team.playoffSeed ||
              0
          ),

        wins:
          Number(
            team.record
              ?.overall
              ?.wins ||
              0
          ),

        losses:
          Number(
            team.record
              ?.overall
              ?.losses ||
              0
          ),

        ties:
          Number(
            team.record
              ?.overall
              ?.ties ||
              0
          ),

        pointsFor:
          Number(
            team.record
              ?.overall
              ?.pointsFor ??
              team.points ??
              0
          ),

        pointsAgainst:
          Number(
            team.record
              ?.overall
              ?.pointsAgainst ||
              0
          ),
      })
    );

  return {
    leagueId:
      Number(
        leagueId
      ),

    playoffTeamCount:
      Number(
        schedule
          ?.playoffTeamCount ||
          4
      ),

    regularSeasonWeeks:
      Number(
        schedule
          ?.matchupPeriodCount ||
          14
      ),

    playoffSeedingRule:
      String(
        schedule
          ?.playoffSeedingRule ||
          ""
      ),

    playoffSeedingRuleBy:
      schedule
        ?.playoffSeedingRuleBy,

    playoffReseed:
      Boolean(
        schedule
          ?.playoffReseed
      ),

    matchupTieRule:
      String(
        scoring
          ?.matchupTieRule ||
          ""
      ),

    matchupTieRuleBy:
      scoring
        ?.matchupTieRuleBy,

    divisions,

    divisionNameById,

    teams,
  };
}
