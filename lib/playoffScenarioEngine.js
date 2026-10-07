const MAX_FIELD_BRANCHES =
  10000;

// =========================================================
// BASIC HELPERS
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

function getGameWinner(
  game
) {
  const winner =
    String(
      game?.winner || ""
    ).toUpperCase();

  const awayId =
    Number(
      game
        ?.away_owner_id
    );

  const homeId =
    Number(
      game
        ?.home_owner_id
    );

  if (
    winner === "AWAY"
  ) {
    return awayId;
  }

  if (
    winner === "HOME"
  ) {
    return homeId;
  }

  const awayScore =
    Number(
      game?.away_score
    );

  const homeScore =
    Number(
      game?.home_score
    );

  if (
    Number.isFinite(
      awayScore
    ) &&
    Number.isFinite(
      homeScore
    )
  ) {
    if (
      awayScore >
      homeScore
    ) {
      return awayId;
    }

    if (
      homeScore >
      awayScore
    ) {
      return homeId;
    }
  }

  return null;
}

// =========================================================
// ESPN PLAYOFF TIEBREAK ORDER
// =========================================================

export function getTiebreakCriteria(
  rule
) {
  const value =
    String(
      rule || ""
    ).toUpperCase();

  if (
    value.includes(
      "H2H"
    )
  ) {
    return [
      "H2H",
      "PF",
      "DIV",
      "PA",
      "COIN",
    ];
  }

  if (
    value.includes(
      "TOTAL_POINTS_SCORED"
    ) ||
    value.includes(
      "POINTS_FOR"
    )
  ) {
    return [
      "PF",
      "H2H",
      "DIV",
      "PA",
      "COIN",
    ];
  }

  if (
    value.includes(
      "INTRA"
    ) ||
    value.includes(
      "DIVISION"
    )
  ) {
    return [
      "DIV",
      "H2H",
      "PF",
      "PA",
      "COIN",
    ];
  }

  if (
    value.includes(
      "AGAINST"
    )
  ) {
    return [
      "PA",
      "H2H",
      "PF",
      "DIV",
      "COIN",
    ];
  }

  return [
    "H2H",
    "PF",
    "DIV",
    "PA",
    "COIN",
  ];
}

export function getTiebreakLabel(
  rule
) {
  return getTiebreakCriteria(
    rule
  )
    .map(
      (criterion) => {
        if (
          criterion ===
          "H2H"
        ) {
          return "H2H";
        }

        if (
          criterion ===
          "PF"
        ) {
          return "PF";
        }

        if (
          criterion ===
          "DIV"
        ) {
          return "DIV";
        }

        if (
          criterion ===
          "PA"
        ) {
          return "PA";
        }

        return "COIN";
      }
    )
    .join(" → ");
}

// =========================================================
// COMPARISON HELPERS
// =========================================================

function ratio(
  numerator,
  denominator
) {
  if (
    denominator <= 0
  ) {
    return 0;
  }

  return (
    numerator /
    denominator
  );
}

function keepBestRatio(
  indices,
  numeratorFn,
  denominatorFn
) {
  let best =
    -Infinity;

  const winners =
    [];

  for (
    const index of
    indices
  ) {
    const value =
      ratio(
        numeratorFn(
          index
        ),
        denominatorFn(
          index
        )
      );

    if (
      value >
      best +
        0.0000001
    ) {
      best =
        value;

      winners.length =
        0;

      winners.push(
        index
      );

    } else if (
      Math.abs(
        value -
        best
      ) <
      0.0000001
    ) {
      winners.push(
        index
      );
    }
  }

  return winners;
}

function keepBestNumber(
  indices,
  valueFn
) {
  let best =
    -Infinity;

  const winners =
    [];

  for (
    const index of
    indices
  ) {
    const value =
      Number(
        valueFn(
          index
        )
      );

    if (
      value >
      best +
        0.0000001
    ) {
      best =
        value;

      winners.length =
        0;

      winners.push(
        index
      );

    } else if (
      Math.abs(
        value -
        best
      ) <
      0.0000001
    ) {
      winners.push(
        index
      );
    }
  }

  return winners;
}

// =========================================================
// TOP RECORD GROUP
// =========================================================

function topRecordGroup(
  indices,
  wins,
  ties
) {
  let best =
    -Infinity;

  const group =
    [];

  for (
    const index of
    indices
  ) {
    const recordValue =
      wins[index] *
        2 +
      ties[index];

    if (
      recordValue >
      best
    ) {
      best =
        recordValue;

      group.length =
        0;

      group.push(
        index
      );

    } else if (
      recordValue ===
      best
    ) {
      group.push(
        index
      );
    }
  }

  return group;
}

// =========================================================
// ESPN TIEBREAKER
//
// H2H is valid for a multi-team tie only when each tied
// team has played the same number of games against the
// tied group.
//
// Future PF/PA cannot be known today. If ESPN reaches one
// of those steps, all still-tied teams remain possible and
// the scenario is labeled tiebreak-dependent.
// =========================================================

function resolveTieCandidates(
  indices,
  context
) {
  let group =
    [
      ...indices,
    ];

  const traces =
    [];

  for (
    const criterion of
    context.criteria
  ) {
    if (
      group.length <=
      1
    ) {
      break;
    }

    // =====================================================
    // HEAD TO HEAD
    // =====================================================

    if (
      criterion ===
      "H2H"
    ) {
      const gameTotals =
        new Map();

      const pointTotals =
        new Map();

      let expectedGames =
        null;

      let valid =
        true;

      for (
        const teamIndex of
        group
      ) {
        let games =
          0;

        let points =
          0;

        for (
          const opponentIndex of
          group
        ) {
          if (
            teamIndex ===
            opponentIndex
          ) {
            continue;
          }

          const matrixIndex =
            teamIndex *
              context.teamCount +
            opponentIndex;

          games +=
            context
              .h2hGames[
              matrixIndex
            ];

          points +=
            context
              .h2hScore[
              matrixIndex
            ];
        }

        gameTotals.set(
          teamIndex,
          games
        );

        pointTotals.set(
          teamIndex,
          points
        );

        if (
          expectedGames ===
          null
        ) {
          expectedGames =
            games;

        } else if (
          games !==
          expectedGames
        ) {
          valid =
            false;
        }
      }

      // ESPN skips multi-team H2H
      // when games played are unequal.
      if (
        !valid
      ) {
        continue;
      }

      group =
        keepBestRatio(
          group,

          (index) =>
            pointTotals.get(
              index
            ) || 0,

          (index) =>
            (
              gameTotals.get(
                index
              ) || 0
            ) * 2
        );

      continue;
    }

    // =====================================================
    // POINTS FOR
    // =====================================================

    if (
      criterion ===
      "PF"
    ) {
      if (
        !context.pointsFinal
      ) {
        traces.push({
          criterion:
            "PF",

          members: [
            ...group,
          ],
        });

        break;
      }

      group =
        keepBestNumber(
          group,

          (index) =>
            context
              .pointsFor[
              index
            ]
        );

      continue;
    }

    // =====================================================
    // DIVISION RECORD
    // =====================================================

    if (
      criterion ===
      "DIV"
    ) {
      group =
        keepBestRatio(
          group,

          (index) =>
            context
              .divisionScore[
              index
            ],

          (index) =>
            context
              .divisionGames[
              index
            ] * 2
        );

      continue;
    }

    // =====================================================
    // POINTS AGAINST
    // =====================================================

    if (
      criterion ===
      "PA"
    ) {
      if (
        !context.pointsFinal
      ) {
        traces.push({
          criterion:
            "PA",

          members: [
            ...group,
          ],
        });

        break;
      }

      group =
        keepBestNumber(
          group,

          (index) =>
            context
              .pointsAgainst[
              index
            ]
        );

      continue;
    }

    // =====================================================
    // COIN FLIP
    // =====================================================

    if (
      criterion ===
      "COIN"
    ) {
      traces.push({
        criterion:
          "COIN",

        members: [
          ...group,
        ],
      });

      break;
    }
  }

  return {
    candidates:
      group,

    traces,
  };
}

// =========================================================
// TRACE HELPERS
// =========================================================

function traceKey(
  trace
) {
  return (
    `${trace.criterion}:` +
    [
      ...trace.members,
    ]
      .sort(
        (a, b) =>
          a - b
      )
      .join(",")
  );
}

function mergeTraces(
  target,
  traces
) {
  for (
    const trace of
    traces
  ) {
    target.set(
      traceKey(
        trace
      ),
      trace
    );
  }
}

// =========================================================
// POSSIBLE RANKINGS
//
// IMPORTANT:
// After ESPN awards one seed, it starts the tiebreak
// sequence over for the next seed.
// =========================================================

function rankPossible(
  indices,
  spots,
  context
) {
  const results =
    [];

  const traceMap =
    new Map();

  let truncated =
    false;

  function walk(
    pool,
    spotsLeft,
    prefix
  ) {
    if (
      truncated
    ) {
      return;
    }

    if (
      results.length >=
      MAX_FIELD_BRANCHES
    ) {
      truncated =
        true;

      return;
    }

    if (
      spotsLeft <= 0 ||
      pool.length === 0
    ) {
      results.push(
        prefix
      );

      return;
    }

    const recordGroup =
      topRecordGroup(
        pool,
        context.wins,
        context.ties
      );

    const resolved =
      resolveTieCandidates(
        recordGroup,
        context
      );

    mergeTraces(
      traceMap,
      resolved.traces
    );

    for (
      const candidate of
      resolved.candidates
    ) {
      const remaining =
        pool.filter(
          (index) =>
            index !==
            candidate
        );

      walk(
        remaining,
        spotsLeft - 1,
        [
          ...prefix,
          candidate,
        ]
      );

      if (
        truncated
      ) {
        return;
      }
    }
  }

  walk(
    indices,
    spots,
    []
  );

  return {
    results,

    traces: [
      ...traceMap.values(),
    ],

    truncated,
  };
}

// =========================================================
// POSSIBLE PLAYOFF FIELDS
//
// 1. Determine every possible division champion.
// 2. Rank division champions for the top seeds.
// 3. Remove them.
// 4. Rank remaining teams for wild-card spots.
// =========================================================

function possiblePlayoffFields({
  divisionGroups,
  playoffTeamCount,
  teamCount,
  context,
}) {
  const fieldMap =
    new Map();

  const traceMap =
    new Map();

  let truncated =
    false;

  const divisionOptions =
    [];

  for (
    const divisionTeams of
    divisionGroups
  ) {
    const ranking =
      rankPossible(
        divisionTeams,
        1,
        context
      );

    mergeTraces(
      traceMap,
      ranking.traces
    );

    if (
      ranking.truncated
    ) {
      truncated =
        true;

      break;
    }

    divisionOptions.push(
      [
        ...new Set(
          ranking.results.map(
            (result) =>
              result[0]
          )
        ),
      ]
    );
  }

  if (
    truncated
  ) {
    return {
      fields: [],
      traces: [
        ...traceMap.values(),
      ],
      truncated:
        true,
    };
  }

  function addField(
    field
  ) {
    const trimmed =
      field.slice(
        0,
        playoffTeamCount
      );

    const key =
      trimmed.join("-");

    if (
      !fieldMap.has(
        key
      )
    ) {
      fieldMap.set(
        key,
        trimmed
      );
    }

    if (
      fieldMap.size >=
      MAX_FIELD_BRANCHES
    ) {
      truncated =
        true;
    }
  }

  function processChampions(
    champions
  ) {
    if (
      truncated
    ) {
      return;
    }

    const championRanking =
      rankPossible(
        champions,
        champions.length,
        context
      );

    mergeTraces(
      traceMap,
      championRanking.traces
    );

    if (
      championRanking.truncated
    ) {
      truncated =
        true;

      return;
    }

    const championSet =
      new Set(
        champions
      );

    const remaining =
      [];

    for (
      let index = 0;
      index <
      teamCount;
      index += 1
    ) {
      if (
        !championSet.has(
          index
        )
      ) {
        remaining.push(
          index
        );
      }
    }

    const wildCardSpots =
      Math.max(
        0,

        playoffTeamCount -
          champions.length
      );

    const wildCardRanking =
      rankPossible(
        remaining,
        wildCardSpots,
        context
      );

    mergeTraces(
      traceMap,
      wildCardRanking.traces
    );

    if (
      wildCardRanking.truncated
    ) {
      truncated =
        true;

      return;
    }

    for (
      const championOrder of
      championRanking.results
    ) {
      for (
        const wildCardOrder of
        wildCardRanking.results
      ) {
        addField([
          ...championOrder,
          ...wildCardOrder,
        ]);

        if (
          truncated
        ) {
          return;
        }
      }
    }
  }

  function chooseDivisionChampions(
    divisionIndex,
    champions
  ) {
    if (
      truncated
    ) {
      return;
    }

    if (
      divisionIndex >=
      divisionOptions.length
    ) {
      processChampions(
        champions
      );

      return;
    }

    for (
      const champion of
      divisionOptions[
        divisionIndex
      ]
    ) {
      chooseDivisionChampions(
        divisionIndex + 1,
        [
          ...champions,
          champion,
        ]
      );

      if (
        truncated
      ) {
        return;
      }
    }
  }

  chooseDivisionChampions(
    0,
    []
  );

  return {
    fields: [
      ...fieldMap.values(),
    ],

    traces: [
      ...traceMap.values(),
    ],

    truncated,
  };
}

// =========================================================
// PATTERN HELPERS
// =========================================================

function getPatternCode(
  scenarioMask,
  games
) {
  let code =
    0;

  for (
    const game of
    games
  ) {
    const awayWon =
      (
        scenarioMask &
        (
          1 <<
          game.bit
        )
      ) !== 0;

    const ownerWon =
      game.isAway
        ? awayWon
        : !awayWon;

    code =
      (
        code << 1
      ) |
      (
        ownerWon
          ? 1
          : 0
      );
  }

  return code;
}

function decodePattern({
  code,
  games,
  teams,
}) {
  const results =
    [];

  let wins =
    0;

  for (
    let position = 0;
    position <
    games.length;
    position += 1
  ) {
    const shift =
      games.length -
      1 -
      position;

    const won =
      (
        (
          code >>
          shift
        ) &
        1
      ) === 1;

    if (
      won
    ) {
      wins += 1;
    }

    const game =
      games[
        position
      ];

    results.push({
      week:
        game.week,

      result:
        won
          ? "W"
          : "L",

      opponentOwnerId:
        teams[
          game.opponent
        ].ownerId,

      opponentName:
        teams[
          game.opponent
        ].ownerName,
    });
  }

  return {
    wins,

    losses:
      games.length -
      wins,

    results,
  };
}

// =========================================================
// CREATE BUCKET
// =========================================================

function createPatternBucket({
  code,
  fullMask,
  teamCount,
}) {
  const maxFutureWins =
    new Int16Array(
      teamCount
    );

  maxFutureWins.fill(
    -1
  );

  return {
    code,

    total:
      0,

    guaranteedIn:
      0,

    guaranteedOut:
      0,

    tiebreakDependent:
      0,

    alive:
      0,

    seedMask:
      0,

    aliveAndMask:
      fullMask,

    aliveOrMask:
      0,

    maxFutureWins,

    tiebreakReasons:
      new Set(),

    pfCompetitors:
      new Set(),
  };
}

// =========================================================
// MAIN SCENARIO ENGINE
// =========================================================

export function simulatePlayoffScenarios({
  teams,
  completedGames,
  remainingGames,
  playoffTeamCount,
  playoffSeedingRule,
}) {
  const teamCount =
    teams.length;

  const teamIndexByOwner =
    new Map(
      teams.map(
        (
          team,
          index
        ) => [
          team.ownerId,
          index,
        ]
      )
    );

  const futureGames =
    remainingGames
      .map(
        (game) => {
          const away =
            teamIndexByOwner.get(
              Number(
                game
                  .away_owner_id
              )
            );

          const home =
            teamIndexByOwner.get(
              Number(
                game
                  .home_owner_id
              )
            );

          return {
            raw:
              game,

            away,

            home,

            week:
              Number(
                game
                  .matchup_period
              ),
          };
        }
      )
      .filter(
        (game) =>
          Number.isInteger(
            game.away
          ) &&
          Number.isInteger(
            game.home
          )
      );

  const gameCount =
    futureGames.length;

  if (
    gameCount > 20
  ) {
    return null;
  }

  const criteria =
    getTiebreakCriteria(
      playoffSeedingRule
    );

  // =======================================================
  // FINAL RECORD STATE
  // =======================================================

  const wins =
    Int16Array.from(
      teams.map(
        (team) =>
          num(
            team.wins
          )
      )
    );

  const ties =
    Int16Array.from(
      teams.map(
        (team) =>
          num(
            team.ties
          )
      )
    );

  const pointsFor =
    Float64Array.from(
      teams.map(
        (team) =>
          num(
            team.pointsFor
          )
      )
    );

  const pointsAgainst =
    Float64Array.from(
      teams.map(
        (team) =>
          num(
            team.pointsAgainst
          )
      )
    );

  const futureWins =
    new Int16Array(
      teamCount
    );

  // =======================================================
  // H2H MATRICES
  // =======================================================

  const h2hGames =
    new Uint8Array(
      teamCount *
        teamCount
    );

  // 2 = win
  // 1 = tie
  // 0 = loss
  const h2hScore =
    new Int16Array(
      teamCount *
        teamCount
    );

  const divisionGames =
    new Uint8Array(
      teamCount
    );

  const divisionScore =
    new Int16Array(
      teamCount
    );

  const divisionId =
    teams.map(
      (team) =>
        team.divisionId
    );

  // =======================================================
  // COMPLETED GAMES
  // =======================================================

  for (
    const game of
    completedGames
  ) {
    const away =
      teamIndexByOwner.get(
        Number(
          game
            .away_owner_id
        )
      );

    const home =
      teamIndexByOwner.get(
        Number(
          game
            .home_owner_id
        )
      );

    if (
      !Number.isInteger(
        away
      ) ||
      !Number.isInteger(
        home
      )
    ) {
      continue;
    }

    const awayVsHome =
      away *
        teamCount +
      home;

    const homeVsAway =
      home *
        teamCount +
      away;

    h2hGames[
      awayVsHome
    ] += 1;

    h2hGames[
      homeVsAway
    ] += 1;

    const winner =
      getGameWinner(
        game
      );

    if (
      winner ===
      teams[away]
        .ownerId
    ) {
      h2hScore[
        awayVsHome
      ] += 2;

    } else if (
      winner ===
      teams[home]
        .ownerId
    ) {
      h2hScore[
        homeVsAway
      ] += 2;

    } else {
      h2hScore[
        awayVsHome
      ] += 1;

      h2hScore[
        homeVsAway
      ] += 1;
    }

    if (
      divisionId[
        away
      ] ===
      divisionId[
        home
      ]
    ) {
      divisionGames[
        away
      ] += 1;

      divisionGames[
        home
      ] += 1;

      if (
        winner ===
        teams[away]
          .ownerId
      ) {
        divisionScore[
          away
        ] += 2;

      } else if (
        winner ===
        teams[home]
          .ownerId
      ) {
        divisionScore[
          home
        ] += 2;

      } else {
        divisionScore[
          away
        ] += 1;

        divisionScore[
          home
        ] += 1;
      }
    }
  }

  // =======================================================
  // DIVISION GROUPS
  // =======================================================

  const divisionMap =
    new Map();

  teams.forEach(
    (
      team,
      index
    ) => {
      const key =
        String(
          team.divisionId
        );

      if (
        !divisionMap.has(
          key
        )
      ) {
        divisionMap.set(
          key,
          []
        );
      }

      divisionMap
        .get(key)
        .push(
          index
        );
    }
  );

  const divisionGroups =
    [
      ...divisionMap.values(),
    ];

  // =======================================================
  // OWNER SCHEDULE BITS
  // =======================================================

  const teamGameBits =
    Array.from(
      {
        length:
          teamCount,
      },

      () => []
    );

  futureGames.forEach(
    (
      game,
      bit
    ) => {
      game.bit =
        bit;

      teamGameBits[
        game.away
      ].push({
        bit,

        week:
          game.week,

        opponent:
          game.home,

        isAway:
          true,
      });

      teamGameBits[
        game.home
      ].push({
        bit,

        week:
          game.week,

        opponent:
          game.away,

        isAway:
          false,
      });
    }
  );

  // =======================================================
  // INITIAL FUTURE STATE
  //
  // Gray code begins at 00000...
  // 0 means home team wins.
  // =======================================================

  for (
    const game of
    futureGames
  ) {
    const away =
      game.away;

    const home =
      game.home;

    wins[
      home
    ] += 1;

    futureWins[
      home
    ] += 1;

    const awayVsHome =
      away *
        teamCount +
      home;

    const homeVsAway =
      home *
        teamCount +
      away;

    h2hGames[
      awayVsHome
    ] += 1;

    h2hGames[
      homeVsAway
    ] += 1;

    h2hScore[
      homeVsAway
    ] += 2;

    if (
      divisionId[
        away
      ] ===
      divisionId[
        home
      ]
    ) {
      divisionGames[
        away
      ] += 1;

      divisionGames[
        home
      ] += 1;

      divisionScore[
        home
      ] += 2;
    }
  }

  // =======================================================
  // GLOBAL TEAM STATS
  // =======================================================

  const globalIn =
    new Uint32Array(
      teamCount
    );

  const globalOut =
    new Uint32Array(
      teamCount
    );

  const globalTiebreak =
    new Uint32Array(
      teamCount
    );

  const globalSeedMask =
    new Uint8Array(
      teamCount
    );

  const patternMaps =
    Array.from(
      {
        length:
          teamCount,
      },

      () =>
        new Map()
    );

  const appearanceCount =
    new Uint16Array(
      teamCount
    );

  const scenarioSeedMask =
    new Uint8Array(
      teamCount
    );

  const totalScenarios =
    2 ** gameCount;

  const fullMask =
    gameCount === 0
      ? 0
      : (
          1 <<
          gameCount
        ) - 1;

  let previousGray =
    0;

  let truncatedScenarios =
    0;

  // =======================================================
  // LOOP THROUGH EVERY W/L COMBINATION
  // =======================================================

  for (
    let scenario = 0;
    scenario <
    totalScenarios;
    scenario += 1
  ) {
    const gray =
      scenario ^
      (
        scenario >> 1
      );

    // =====================================================
    // GRAY-CODE RESULT FLIP
    //
    // Only ONE future game changes from the prior scenario.
    // =====================================================

    if (
      scenario > 0
    ) {
      const changed =
        gray ^
        previousGray;

      const bit =
        31 -
        Math.clz32(
          changed
        );

      const mask =
        1 << bit;

      const awayNowWins =
        (
          gray &
          mask
        ) !== 0;

      const game =
        futureGames[
          bit
        ];

      const away =
        game.away;

      const home =
        game.home;

      const awayVsHome =
        away *
          teamCount +
        home;

      const homeVsAway =
        home *
          teamCount +
        away;

      if (
        awayNowWins
      ) {
        wins[
          home
        ] -= 1;

        wins[
          away
        ] += 1;

        futureWins[
          home
        ] -= 1;

        futureWins[
          away
        ] += 1;

        h2hScore[
          homeVsAway
        ] -= 2;

        h2hScore[
          awayVsHome
        ] += 2;

        if (
          divisionId[
            away
          ] ===
          divisionId[
            home
          ]
        ) {
          divisionScore[
            home
          ] -= 2;

          divisionScore[
            away
          ] += 2;
        }

      } else {
        wins[
          away
        ] -= 1;

        wins[
          home
        ] += 1;

        futureWins[
          away
        ] -= 1;

        futureWins[
          home
        ] += 1;

        h2hScore[
          awayVsHome
        ] -= 2;

        h2hScore[
          homeVsAway
        ] += 2;

        if (
          divisionId[
            away
          ] ===
          divisionId[
            home
          ]
        ) {
          divisionScore[
            away
          ] -= 2;

          divisionScore[
            home
          ] += 2;
        }
      }
    }

    previousGray =
      gray;

    const context = {
      teamCount,

      wins,

      ties,

      pointsFor,

      pointsAgainst,

      h2hGames,

      h2hScore,

      divisionGames,

      divisionScore,

      // Once there are no games left,
      // ESPN's real PF/PA totals are final.
      pointsFinal:
        gameCount === 0,

      criteria,
    };

    const outcome =
      possiblePlayoffFields({
        divisionGroups,

        playoffTeamCount,

        teamCount,

        context,
      });

    appearanceCount.fill(
      0
    );

    scenarioSeedMask.fill(
      0
    );

    if (
      outcome.truncated ||
      outcome.fields.length ===
        0
    ) {
      truncatedScenarios +=
        1;
    }

    if (
      !outcome.truncated
    ) {
      for (
        const field of
        outcome.fields
      ) {
        field.forEach(
          (
            teamIndex,
            seedIndex
          ) => {
            appearanceCount[
              teamIndex
            ] += 1;

            scenarioSeedMask[
              teamIndex
            ] |=
              1 <<
              (
                seedIndex +
                1
              );
          }
        );
      }
    }

    // =====================================================
    // TEAM-BY-TEAM CLASSIFICATION
    // =====================================================

    for (
      let teamIndex = 0;
      teamIndex <
      teamCount;
      teamIndex += 1
    ) {
      let status =
        "TB";

      if (
        !outcome.truncated &&
        outcome.fields.length >
          0
      ) {
        if (
          appearanceCount[
            teamIndex
          ] ===
          outcome.fields.length
        ) {
          status =
            "IN";

        } else if (
          appearanceCount[
            teamIndex
          ] === 0
        ) {
          status =
            "OUT";
        }
      }

      if (
        status ===
        "IN"
      ) {
        globalIn[
          teamIndex
        ] += 1;

      } else if (
        status ===
        "OUT"
      ) {
        globalOut[
          teamIndex
        ] += 1;

      } else {
        globalTiebreak[
          teamIndex
        ] += 1;
      }

      globalSeedMask[
        teamIndex
      ] |=
        scenarioSeedMask[
          teamIndex
        ];

      // ===================================================
      // OWNER'S OWN RESULT PATTERN
      // ===================================================

      const patternCode =
        getPatternCode(
          gray,
          teamGameBits[
            teamIndex
          ]
        );

      let bucket =
        patternMaps[
          teamIndex
        ].get(
          patternCode
        );

      if (
        !bucket
      ) {
        bucket =
          createPatternBucket({
            code:
              patternCode,

            fullMask,

            teamCount,
          });

        patternMaps[
          teamIndex
        ].set(
          patternCode,
          bucket
        );
      }

      bucket.total +=
        1;

      bucket.seedMask |=
        scenarioSeedMask[
          teamIndex
        ];

      if (
        status ===
        "IN"
      ) {
        bucket
          .guaranteedIn +=
          1;

      } else if (
        status ===
        "OUT"
      ) {
        bucket
          .guaranteedOut +=
          1;

      } else {
        bucket
          .tiebreakDependent +=
          1;
      }

      // ===================================================
      // A surviving path = guaranteed in OR still alive
      // through a future tiebreak.
      // ===================================================

      if (
        status !==
        "OUT"
      ) {
        bucket.alive +=
          1;

        bucket
          .aliveAndMask &=
          gray;

        bucket
          .aliveOrMask |=
          gray;

        // Maximum wins each OTHER team can have
        // while this owner's path is still alive.
        for (
          let other = 0;
          other <
          teamCount;
          other += 1
        ) {
          if (
            other ===
            teamIndex
          ) {
            continue;
          }

          if (
            futureWins[
              other
            ] >
            bucket
              .maxFutureWins[
              other
            ]
          ) {
            bucket
              .maxFutureWins[
              other
            ] =
              futureWins[
                other
              ];
          }
        }

        // Which tiebreaks could affect this owner?
        for (
          const trace of
          outcome.traces
        ) {
          if (
            !trace.members.includes(
              teamIndex
            )
          ) {
            continue;
          }

          bucket
            .tiebreakReasons
            .add(
              trace.criterion
            );

          if (
            trace.criterion ===
            "PF"
          ) {
            for (
              const member of
              trace.members
            ) {
              if (
                member !==
                teamIndex
              ) {
                bucket
                  .pfCompetitors
                  .add(
                    member
                  );
              }
            }
          }
        }
      }
    }
  }

  // =======================================================
  // FINALIZE DATA FOR THE PAGE
  // =======================================================

  const teamStats =
    new Map();

  for (
    let teamIndex = 0;
    teamIndex <
    teamCount;
    teamIndex += 1
  ) {
    const team =
      teams[
        teamIndex
      ];

    const possibleSeeds =
      [];

    for (
      let seed = 1;
      seed <=
      playoffTeamCount;
      seed += 1
    ) {
      if (
        globalSeedMask[
          teamIndex
        ] &
        (
          1 <<
          seed
        )
      ) {
        possibleSeeds.push(
          seed
        );
      }
    }

    const patterns =
      [];

    for (
      const bucket of
      patternMaps[
        teamIndex
      ].values()
    ) {
      const decoded =
        decodePattern({
          code:
            bucket.code,

          games:
            teamGameBits[
              teamIndex
            ],

          teams,
        });

      // ===================================================
      // EXACT INDIVIDUAL GAME RESULTS THAT MUST HAPPEN
      // IN EVERY SURVIVING PATH FOR THIS PATTERN.
      // ===================================================

      const mustResults =
        [];

      if (
        bucket.alive >
        0
      ) {
        futureGames.forEach(
          (
            game,
            bit
          ) => {
            if (
              game.away ===
                teamIndex ||
              game.home ===
                teamIndex
            ) {
              return;
            }

            const bitMask =
              1 << bit;

            const alwaysAway =
              (
                bucket
                  .aliveAndMask &
                bitMask
              ) !== 0;

            const everAway =
              (
                bucket
                  .aliveOrMask &
                bitMask
              ) !== 0;

            if (
              alwaysAway
            ) {
              mustResults.push({
                week:
                  game.week,

                winnerOwnerId:
                  teams[
                    game.away
                  ].ownerId,

                winnerName:
                  teams[
                    game.away
                  ].ownerName,

                loserOwnerId:
                  teams[
                    game.home
                  ].ownerId,

                loserName:
                  teams[
                    game.home
                  ].ownerName,
              });

            } else if (
              !everAway
            ) {
              mustResults.push({
                week:
                  game.week,

                winnerOwnerId:
                  teams[
                    game.home
                  ].ownerId,

                winnerName:
                  teams[
                    game.home
                  ].ownerName,

                loserOwnerId:
                  teams[
                    game.away
                  ].ownerId,

                loserName:
                  teams[
                    game.away
                  ].ownerName,
              });
            }
          }
        );
      }

      // ===================================================
      // TEAM RECORD CAPS
      //
      // Example:
      // Cody must lose at least 2 of his last 4.
      // ===================================================

      const teamCaps =
        [];

      if (
        bucket.alive >
        0
      ) {
        for (
          let other = 0;
          other <
          teamCount;
          other += 1
        ) {
          if (
            other ===
            teamIndex
          ) {
            continue;
          }

          const gamesLeft =
            teamGameBits[
              other
            ].length;

          const maxWins =
            bucket
              .maxFutureWins[
              other
            ];

          if (
            maxWins < 0 ||
            maxWins >=
              gamesLeft
          ) {
            continue;
          }

          teamCaps.push({
            ownerId:
              teams[
                other
              ].ownerId,

            ownerName:
              teams[
                other
              ].ownerName,

            gamesLeft,

            maxFutureWins:
              maxWins,

            minimumLosses:
              gamesLeft -
              maxWins,

            maxFinalWins:
              teams[
                other
              ].wins +
              maxWins,
          });
        }
      }

      const pfCompetitors =
        [
          ...bucket
            .pfCompetitors,
        ].map(
          (other) => ({
            ownerId:
              teams[
                other
              ].ownerId,

            ownerName:
              teams[
                other
              ].ownerName,

            pointsFor:
              teams[
                other
              ].pointsFor,

            currentGap:
              teams[
                other
              ].pointsFor -
              team.pointsFor,
          })
        );

      const patternSeeds =
        [];

      for (
        let seed = 1;
        seed <=
        playoffTeamCount;
        seed += 1
      ) {
        if (
          bucket.seedMask &
          (
            1 <<
            seed
          )
        ) {
          patternSeeds.push(
            seed
          );
        }
      }

      let status =
        "MIXED";

      if (
        bucket.guaranteedIn ===
        bucket.total
      ) {
        status =
          "CLINCHED";

      } else if (
        bucket.guaranteedOut ===
        bucket.total
      ) {
        status =
          "ELIMINATED";

      } else if (
        bucket.alive ===
        bucket.total
      ) {
        status =
          "ALIVE";

      } else if (
        bucket.alive >
        0
      ) {
        status =
          "NEEDS HELP";
      }

      patterns.push({
        code:
          bucket.code,

        ownWins:
          decoded.wins,

        ownLosses:
          decoded.losses,

        results:
          decoded.results,

        finalRecord: {
          wins:
            team.wins +
            decoded.wins,

          losses:
            team.losses +
            decoded.losses,

          ties:
            team.ties,
        },

        total:
          bucket.total,

        guaranteedIn:
          bucket.guaranteedIn,

        guaranteedOut:
          bucket.guaranteedOut,

        tiebreakDependent:
          bucket.tiebreakDependent,

        alive:
          bucket.alive,

        status,

        possibleSeeds:
          patternSeeds,

        mustResults,

        teamCaps,

        tiebreakReasons: [
          ...bucket
            .tiebreakReasons,
        ],

        pfCompetitors,
      });
    }

    patterns.sort(
      (a, b) => {
        if (
          b.ownWins !==
          a.ownWins
        ) {
          return (
            b.ownWins -
            a.ownWins
          );
        }

        return (
          b.code -
          a.code
        );
      }
    );

    teamStats.set(
      team.ownerId,
      {
        guaranteedIn:
          globalIn[
            teamIndex
          ],

        guaranteedOut:
          globalOut[
            teamIndex
          ],

        tiebreakDependent:
          globalTiebreak[
            teamIndex
          ],

        clinched:
          globalIn[
            teamIndex
          ] ===
          totalScenarios,

        eliminated:
          globalOut[
            teamIndex
          ] ===
          totalScenarios,

        possibleSeeds,

        patterns,
      }
    );
  }

  return {
    totalScenarios,

    gameCount,

    criteria,

    teamStats,

    truncatedScenarios,
  };
}
