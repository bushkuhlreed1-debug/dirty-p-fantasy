function firstEnv(...names) {
  for (const name of names) {
    const value =
      process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

export async function getEspnPlayoffSettings(
  season
) {
  const leagueId =
    firstEnv(
      "ESPN_LEAGUE_ID"
    );

  if (!leagueId) {
    throw new Error(
      "Missing ESPN_LEAGUE_ID"
    );
  }

  const fullCookie =
    firstEnv(
      "ESPN_COOKIE",
      "ESPN_COOKIES"
    );

  const espnS2 =
    firstEnv(
      "ESPN_S2",
      "ESPN_S2_COOKIE",
      "ESPN_COOKIE_S2"
    );

  const swid =
    firstEnv(
      "ESPN_SWID",
      "ESPN_SWID_COOKIE",
      "ESPN_COOKIE_SWID",
      "SWID"
    );

  let cookie = fullCookie;

  if (!cookie) {
    const parts = [];

    if (espnS2) {
      parts.push(
        `espn_s2=${espnS2}`
      );
    }

    if (swid) {
      parts.push(
        `SWID=${swid}`
      );
    }

    cookie =
      parts.join("; ");
  }

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/` +
    `seasons/${season}/segments/0/leagues/${leagueId}` +
    `?view=mSettings&view=mTeam`;

  const response =
    await fetch(
      url,
      {
        cache:
          "no-store",

        headers:
          cookie
            ? {
                Cookie:
                  cookie,
              }
            : {},
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `ESPN settings returned ${response.status}`
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

  const teamDivisionByEspnId =
    {};

  for (
    const team of
    data?.teams || []
  ) {
    teamDivisionByEspnId[
      Number(
        team.id
      )
    ] =
      Number(
        team.divisionId
      );
  }

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

    matchupTieRule:
      String(
        scoring
          ?.matchupTieRule ||
          ""
      ),

    matchupTieRuleBy:
      scoring
        ?.matchupTieRuleBy,

    playoffReseed:
      Boolean(
        schedule
          ?.playoffReseed
      ),

    divisions,

    divisionNameById,

    teamDivisionByEspnId,
  };
}
