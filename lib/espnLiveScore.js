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
    `?view=mScoreboard` +
    `&view=mMatchupScore` +
    `&view=mLiveScoring` +
    `&scoringPeriodId=${week}` +
    `&matchupPeriodId=${week}`;

  try {
    const response =
      await fetch(
        url,
        {
          cache: "no-store",

          headers:
            cookies.length > 0
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

    for (
      const matchup of
      data?.schedule || []
    ) {
      if (
        Number(
          matchup?.matchupPeriodId
        ) !==
        Number(week)
      ) {
        continue;
      }

      for (
        const sideName of
        ["away", "home"]
      ) {
        const side =
          matchup?.[sideName];

        const teamId =
          Number(
            side?.teamId
          );

        if (!teamId) {
          continue;
        }

        const currentPoints =
          numberOrNull(
            side?.totalPointsLive,
            side?.totalPoints
          );

        const liveProjectedPoints =
          numberOrNull(
            side?.totalProjectedPointsLive
          );

        result.set(
          teamId,
          {
            currentPoints,
            liveProjectedPoints,
          }
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
