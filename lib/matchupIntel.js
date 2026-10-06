const ESPN_LEAGUE_ID =
  process.env.ESPN_LEAGUE_ID;

const ESPN_SEASON =
  Number(
    process.env.ESPN_SEASON ||
      2026
  );

const ESPN_S2 =
  process.env.ESPN_S2;

const ESPN_SWID =
  process.env.ESPN_SWID;


const POSITION_NAMES = {
  0: "QB",
  1: "TQB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP",
  8: "DT",
  9: "DE",
  10: "LB",
  11: "DL",
  12: "CB",
  13: "S",
  14: "DB",
  15: "DP",
  16: "D/ST",
  17: "K",
  18: "P",
  19: "HC",
};


const NON_STARTER_SLOTS =
  new Set([
    20,
    21,
  ]);


function num(value) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}


function round1(value) {
  return (
    Math.round(
      num(value) * 10
    ) / 10
  );
}


function getCookieHeader() {
  if (
    !ESPN_S2 ||
    !ESPN_SWID
  ) {
    throw new Error(
      "Missing ESPN_S2 or ESPN_SWID."
    );
  }

  return (
    `espn_s2=${ESPN_S2}; ` +
    `SWID=${ESPN_SWID}`
  );
}


async function getFantasyLeague(
  week
) {
  if (!ESPN_LEAGUE_ID) {
    throw new Error(
      "Missing ESPN_LEAGUE_ID."
    );
  }

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${ESPN_SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}` +
    `?view=mRoster` +
    `&view=mTeam` +
    `&view=kona_player_info` +
    `&scoringPeriodId=${week}`;

  const response =
    await fetch(url, {
      cache: "no-store",

      headers: {
        Cookie:
          getCookieHeader(),

        "User-Agent":
          "Mozilla/5.0",
      },
    });

  if (!response.ok) {
    throw new Error(
      `ESPN roster request failed (${response.status}).`
    );
  }

  return response.json();
}


async function getNflWeek(
  week
) {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
    `?dates=${ESPN_SEASON}` +
    `&seasontype=2` +
    `&week=${week}` +
    `&limit=100`;

  const response =
    await fetch(url, {
      cache: "no-store",
    });

  if (!response.ok) {
    return [];
  }

  const data =
    await response.json();

  return (
    data.events ||
    []
  );
}


function getWeekStatus(
  events
) {
  const states =
    events.map(
      (event) =>
        event
          ?.status
          ?.type
          ?.state ||
        "pre"
    );


  const weekStarted =
    states.some(
      (state) =>
        state === "in" ||
        state === "post"
    );


  const hasLiveGames =
    states.some(
      (state) =>
        state === "in"
    );


  const nflWeekFinal =
    events.length > 0 &&
    states.every(
      (state) =>
        state === "post"
    );


  const kickoffDates =
    events
      .map(
        (event) =>
          new Date(
            event.date
          ).getTime()
      )
      .filter(
        Number.isFinite
      );


  const firstKickoff =
    kickoffDates.length
      ? new Date(
          Math.min(
            ...kickoffDates
          )
        ).toISOString()
      : null;


  return {
    weekStarted,
    hasLiveGames,
    nflWeekFinal,
    firstKickoff,
  };
}


function buildOpponentMap(
  events
) {
  const map =
    new Map();


  for (
    const event of
    events
  ) {
    const competition =
      event
        ?.competitions?.[0];

    if (!competition) {
      continue;
    }


    const competitors =
      competition.competitors ||
      [];


    for (
      const team of
      competitors
    ) {
      const opponent =
        competitors.find(
          (candidate) =>
            candidate.id !==
            team.id
        );


      if (!opponent) {
        continue;
      }


      const odds =
        competition
          ?.odds?.[0] ||
        null;


      map.set(
        Number(
          team.id
        ),
        {
          opponent:
            opponent.team
              ?.abbreviation ||
            opponent.team
              ?.shortDisplayName ||
            "TBD",

          opponentName:
            opponent.team
              ?.displayName ||
            opponent.team
              ?.shortDisplayName ||
            "TBD",

          homeAway:
            team.homeAway,

          nflGame:
            event.name ||
            null,

          nflOverUnder:
            odds?.overUnder
              ? num(
                  odds.overUnder
                )
              : null,

          nflLine:
            odds?.details ||
            null,

          eventState:
            event
              ?.status
              ?.type
              ?.state ||
            "pre",
        }
      );
    }
  }


  return map;
}


function getProjection(
  player,
  week
) {
  const stats =
    player?.stats ||
    [];


  const exact =
    stats.find(
      (stat) =>
        Number(
          stat.statSourceId
        ) === 1 &&
        Number(
          stat.scoringPeriodId
        ) ===
          Number(week)
    );


  return num(
    exact?.appliedTotal
  );
}


function getSeasonAverage(
  player,
  week
) {
  const stats =
    player?.stats ||
    [];


  const aggregate =
    stats.find(
      (stat) =>
        Number(
          stat.statSourceId
        ) === 0 &&
        num(
          stat.appliedAverage
        ) > 0
    );


  if (aggregate) {
    return num(
      aggregate.appliedAverage
    );
  }


  const weekly =
    stats.filter(
      (stat) =>
        Number(
          stat.statSourceId
        ) === 0 &&
        Number(
          stat.scoringPeriodId
        ) > 0 &&
        Number(
          stat.scoringPeriodId
        ) <
          Number(week) &&
        Number.isFinite(
          Number(
            stat.appliedTotal
          )
        )
    );


  if (!weekly.length) {
    return 0;
  }


  const total =
    weekly.reduce(
      (sum, stat) =>
        sum +
        num(
          stat.appliedTotal
        ),
      0
    );


  return (
    total /
    weekly.length
  );
}


function getMatchupGrade(
  projection,
  average
) {
  const projected =
    num(projection);

  const avg =
    num(average);


  if (
    projected <= 0
  ) {
    return {
      grade: "UNKNOWN",
      label: "No Projection",
    };
  }


  if (avg > 0) {
    const ratio =
      projected /
      avg;


    if (
      ratio >= 1.12
    ) {
      return {
        grade: "GOOD",
        label: "Favorable",
      };
    }


    if (
      ratio <= 0.88
    ) {
      return {
        grade: "TOUGH",
        label: "Tough",
      };
    }
  }


  return {
    grade: "NEUTRAL",
    label: "Neutral",
  };
}


function buildPlayer(
  entry,
  week,
  opponentMap
) {
  const player =
    entry
      ?.playerPoolEntry
      ?.player;


  if (!player) {
    return null;
  }


  const projection =
    getProjection(
      player,
      week
    );


  const average =
    getSeasonAverage(
      player,
      week
    );


  const matchup =
    getMatchupGrade(
      projection,
      average
    );


  const nfl =
    opponentMap.get(
      Number(
        player.proTeamId
      )
    ) ||
    null;


  return {
    playerId:
      player.id,

    name:
      player.fullName ||
      "Unknown Player",

    position:
      POSITION_NAMES[
        Number(
          player.defaultPositionId
        )
      ] ||
      "FLEX",

    proTeamId:
      Number(
        player.proTeamId
      ),

    lineupSlotId:
      Number(
        entry.lineupSlotId
      ),

    starter:
      !NON_STARTER_SLOTS.has(
        Number(
          entry.lineupSlotId
        )
      ),

    projection:
      round1(
        projection
      ),

    seasonAverage:
      round1(
        average
      ),

    matchupGrade:
      matchup.grade,

    matchupLabel:
      matchup.label,

    opponent:
      nfl?.opponent ||
      "TBD",

    opponentName:
      nfl?.opponentName ||
      null,

    nflLine:
      nfl?.nflLine ||
      null,

    nflOverUnder:
      nfl?.nflOverUnder ||
      null,

    nflGameState:
      nfl?.eventState ||
      "pre",
  };
}


function buildTeam(
  team,
  week,
  opponentMap
) {
  const entries =
    team
      ?.roster?.entries ||
    [];


  const players =
    entries
      .map(
        (entry) =>
          buildPlayer(
            entry,
            week,
            opponentMap
          )
      )
      .filter(Boolean);


  const starters =
    players.filter(
      (player) =>
        player.starter
    );


  const projectedPoints =
    starters.reduce(
      (sum, player) =>
        sum +
        num(
          player.projection
        ),
      0
    );


  const impactPlayers =
    [...starters]
      .filter(
        (player) =>
          player.position !==
            "D/ST" &&
          player.position !==
            "K"
      )
      .sort(
        (a, b) =>
          b.projection -
          a.projection
      )
      .slice(
        0,
        5
      );


  return {
    espnTeamId:
      Number(
        team.id
      ),

    projectedPoints:
      round1(
        projectedPoints
      ),

    players,
    starters,
    impactPlayers,
  };
}


export async function getMatchupIntel(
  week
) {
  const [
    league,
    nflEvents,
  ] =
    await Promise.all([
      getFantasyLeague(
        week
      ),

      getNflWeek(
        week
      ),
    ]);


  const opponentMap =
    buildOpponentMap(
      nflEvents
    );


  const weekStatus =
    getWeekStatus(
      nflEvents
    );


  const teams =
    (
      league.teams ||
      []
    ).map(
      (team) =>
        buildTeam(
          team,
          week,
          opponentMap
        )
    );


  const teamMap =
    new Map(
      teams.map(
        (team) => [
          team.espnTeamId,
          team,
        ]
      )
    );


  return {
    week:
      Number(week),

    teams,
    teamMap,

    ...weekStatus,
  };
}
