import Link from "next/link";

import {
  getLeagueData,
} from "../../lib/leagueData";

import {
  getEspnPlayoffSettings,
} from "../../lib/espnPlayoffSettings";

import AutoRefresh from "../components/AutoRefresh";

export const dynamic =
  "force-dynamic";

const MAX_FIELD_BRANCHES =
  64;

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

function formatRecord(
  wins,
  losses,
  ties = 0
) {
  if (
    num(ties) > 0
  ) {
    return `${num(
      wins
    )}-${num(
      losses
    )}-${num(
      ties
    )}`;
  }

  return `${num(
    wins
  )}-${num(
    losses
  )}`;
}

function formatPercent(
  numerator,
  denominator
) {
  if (
    !denominator
  ) {
    return "—";
  }

  return (
    (
      numerator /
      denominator
    ) *
    100
  ).toFixed(1) + "%";
}

function gameKey(
  game
) {
  return [
    Number(
      game.matchup_period
    ),
    Number(
      game.away_owner_id
    ),
    Number(
      game.home_owner_id
    ),
  ].join("-");
}

// =========================================================
// ESPN TIEBREAK RULE
// =========================================================

function getTiebreakCriteria(
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

  // ESPN Points For / default
  return [
    "PF",
    "H2H",
    "DIV",
    "PA",
    "COIN",
  ];
}

function getTiebreakLabel(
  rule
) {
  return getTiebreakCriteria(
    rule
  )
    .map(
      (item) => {
        if (
          item ===
          "H2H"
        ) {
          return "H2H";
        }

        if (
          item ===
          "PF"
        ) {
          return "PF";
        }

        if (
          item ===
          "DIV"
        ) {
          return "DIV";
        }

        if (
          item ===
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
// CURRENT GAME RESULT
// =========================================================

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
// CURRENT ESPN ORDER
// =========================================================

function currentSeedSort(
  teams
) {
  return [
    ...teams,
  ].sort(
    (a, b) => {
      const seedA =
        a.currentSeed >
        0
          ? a.currentSeed
          : 999;

      const seedB =
        b.currentSeed >
        0
          ? b.currentSeed
          : 999;

      if (
        seedA !==
        seedB
      ) {
        return (
          seedA -
          seedB
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

      return (
        b.pointsFor -
        a.pointsFor
      );
    }
  );
}

// =========================================================
// RATIO HELPERS
// =========================================================

function ratioValue(
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

  const result =
    [];

  for (
    const index of
    indices
  ) {
    const value =
      ratioValue(
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

      result.length =
        0;

      result.push(
        index
      );

    } else if (
      Math.abs(
        value -
        best
      ) <
      0.0000001
    ) {
      result.push(
        index
      );
    }
  }

  return result;
}

function keepBestNumber(
  indices,
  valueFn
) {
  let best =
    -Infinity;

  const result =
    [];

  for (
    const index of
    indices
  ) {
    const value =
      Number(
        valueFn(index)
      );

    if (
      value >
      best +
        0.0000001
    ) {
      best =
        value;

      result.length =
        0;

      result.push(
        index
      );

    } else if (
      Math.abs(
        value -
        best
      ) <
      0.0000001
    ) {
      result.push(
        index
      );
    }
  }

  return result;
}

// =========================================================
// ESPN TIEBREAK EMULATION
//
// If we reach PF or PA while future games remain,
// we DO NOT fake the answer using today's point totals.
//
// Instead, every team still tied is kept as a possible
// winner and the result becomes tiebreak-dependent.
// =========================================================

function resolveTieCandidates(
  indices,
  context
) {
  let group =
    [
      ...indices,
    ];

  const {
    teamCount,
    h2hGames,
    h2hScore,
    divisionGames,
    divisionScore,
    pointsFor,
    pointsAgainst,
    pointsFinal,
    criteria,
  } = context;

  let unresolved =
    false;

  let unresolvedAt =
    null;

  for (
    const criterion of
    criteria
  ) {
    if (
      group.length <=
      1
    ) {
      break;
    }

    // ---------------------------------
    // HEAD TO HEAD
    // ---------------------------------

    if (
      criterion ===
      "H2H"
    ) {
      const gamesPlayed =
        new Map();

      const score =
        new Map();

      let requiredGames =
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
              teamCount +
            opponentIndex;

          games +=
            h2hGames[
              matrixIndex
            ];

          points +=
            h2hScore[
              matrixIndex
            ];
        }

        gamesPlayed.set(
          teamIndex,
          games
        );

        score.set(
          teamIndex,
          points
        );

        if (
          requiredGames ===
          null
        ) {
          requiredGames =
            games;

        } else if (
          games !==
          requiredGames
        ) {
          valid =
            false;
        }
      }

      // ESPN skips H2H in a multi-team tie if
      // tied teams did not play an equal number
      // of games against the tied group.
      if (
        !valid
      ) {
        continue;
      }

      group =
        keepBestRatio(
          group,

          (index) =>
            score.get(
              index
            ) || 0,

          (index) =>
            (
              gamesPlayed.get(
                index
              ) || 0
            ) * 2
        );

      continue;
    }

    // ---------------------------------
    // POINTS FOR
    // ---------------------------------

    if (
      criterion ===
      "PF"
    ) {
      if (
        !pointsFinal
      ) {
        unresolved =
          true;

        unresolvedAt =
          "PF";

        break;
      }

      group =
        keepBestNumber(
          group,
          (index) =>
            pointsFor[
              index
            ]
        );

      continue;
    }

    // ---------------------------------
    // INTRA-DIVISION RECORD
    // ---------------------------------

    if (
      criterion ===
      "DIV"
    ) {
      group =
        keepBestRatio(
          group,

          (index) =>
            divisionScore[
              index
            ],

          (index) =>
            divisionGames[
              index
            ] * 2
        );

      continue;
    }

    // ---------------------------------
    // POINTS AGAINST
    // ESPN awards higher PA.
    // ---------------------------------

    if (
      criterion ===
      "PA"
    ) {
      if (
        !pointsFinal
      ) {
        unresolved =
          true;

        unresolvedAt =
          "PA";

        break;
      }

      group =
        keepBestNumber(
          group,
          (index) =>
            pointsAgainst[
              index
            ]
        );

      continue;
    }

    // ---------------------------------
    // COIN FLIP
    // ---------------------------------

    if (
      criterion ===
      "COIN"
    ) {
      unresolved =
        true;

      unresolvedAt =
        "COIN";

      break;
    }
  }

  return {
    candidates:
      group,

    unresolved,

    unresolvedAt,
  };
}

// =========================================================
// GET BEST RECORD GROUP
// =========================================================

function getTopRecordGroup(
  indices,
  wins,
  ties
) {
  let best =
    -Infinity;

  const result =
    [];

  for (
    const index of
    indices
  ) {
    // 2 points per win,
    // 1 point per tie.
    const value =
      wins[index] *
        2 +
      ties[index];

    if (
      value > best
    ) {
      best =
        value;

      result.length =
        0;

      result.push(
        index
      );

    } else if (
      value ===
      best
    ) {
      result.push(
        index
      );
    }
  }

  return result;
}

// =========================================================
// POSSIBLE RANKINGS
//
// ESPN resets its tiebreak process after each seed is set.
// This recursion does exactly that.
// =========================================================

function rankPossible(
  indices,
  spots,
  context,
  limit =
    MAX_FIELD_BRANCHES
) {
  const results =
    [];

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
      limit
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

    const topRecord =
      getTopRecordGroup(
        pool,
        context.wins,
        context.ties
      );

    const resolved =
      resolveTieCandidates(
        topRecord,
        context
      );

    for (
      const candidate of
      resolved.candidates
    ) {
      const nextPool =
        pool.filter(
          (index) =>
            index !==
            candidate
        );

      walk(
        nextPool,
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
    truncated,
  };
}

// =========================================================
// POSSIBLE PLAYOFF FIELDS FOR ONE FINAL W/L SCENARIO
// =========================================================

function possiblePlayoffFields({
  divisionGroups,
  playoffTeamCount,
  teamCount,
  context,
}) {
  const fieldMap =
    new Map();

  let truncated =
    false;

  const divisionWinnerOptions =
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

    if (
      ranking.truncated
    ) {
      truncated =
        true;

      break;
    }

    divisionWinnerOptions.push(
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
      truncated:
        true,
    };
  }

  function addField(
    field
  ) {
    const key =
      field.join("-");

    if (
      !fieldMap.has(
        key
      )
    ) {
      fieldMap.set(
        key,
        field
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

    const champRanking =
      rankPossible(
        champions,
        champions.length,
        context
      );

    if (
      champRanking.truncated
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

    const wildcardRanking =
      rankPossible(
        remaining,
        wildCardSpots,
        context
      );

    if (
      wildcardRanking.truncated
    ) {
      truncated =
        true;

      return;
    }

    for (
      const champOrder of
      champRanking.results
    ) {
      for (
        const wildcardOrder of
        wildcardRanking.results
      ) {
        addField([
          ...champOrder,
          ...wildcardOrder,
        ]);

        if (
          truncated
        ) {
          return;
        }
      }
    }
  }

  function chooseDivisionWinners(
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
      divisionWinnerOptions.length
    ) {
      processChampions(
        champions
      );

      return;
    }

    for (
      const candidate of
      divisionWinnerOptions[
        divisionIndex
      ]
    ) {
      chooseDivisionWinners(
        divisionIndex + 1,
        [
          ...champions,
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

  chooseDivisionWinners(
    0,
    []
  );

  return {
    fields: [
      ...fieldMap.values(),
    ],

    truncated,
  };
}

// =========================================================
// FULL SCENARIO ENGINE
//
// Uses Gray-code iteration so only ONE future game changes
// between consecutive scenarios.
//
// This makes four weeks / 20 games much more manageable.
// =========================================================

function simulatePlayoffScenarios({
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
        (team, index) => [
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
                game.away_owner_id
              )
            );

          const home =
            teamIndexByOwner.get(
              Number(
                game.home_owner_id
              )
            );

          return {
            game,

            away,

            home,

            week:
              Number(
                game.matchup_period
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

  const h2hGames =
    new Uint8Array(
      teamCount *
        teamCount
    );

  // Two points = win,
  // one = tie,
  // zero = loss.
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
  // COMPLETED H2H / DIVISION RECORD
  // =======================================================

  for (
    const game of
    completedGames
  ) {
    const away =
      teamIndexByOwner.get(
        Number(
          game.away_owner_id
        )
      );

    const home =
      teamIndexByOwner.get(
        Number(
          game.home_owner_id
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

    const awayHomeIndex =
      away *
        teamCount +
      home;

    const homeAwayIndex =
      home *
        teamCount +
      away;

    h2hGames[
      awayHomeIndex
    ] += 1;

    h2hGames[
      homeAwayIndex
    ] += 1;

    const winner =
      getGameWinner(
        game
      );

    if (
      winner ===
      teams[away].ownerId
    ) {
      h2hScore[
        awayHomeIndex
      ] += 2;

    } else if (
      winner ===
      teams[home].ownerId
    ) {
      h2hScore[
        homeAwayIndex
      ] += 2;

    } else {
      h2hScore[
        awayHomeIndex
      ] += 1;

      h2hScore[
        homeAwayIndex
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
    (team, index) => {
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
        .push(index);
    }
  );

  const divisionGroups =
    [
      ...divisionMap.values(),
    ];

  // =======================================================
  // INITIAL FUTURE STATE:
  // Every remaining game begins as HOME WIN.
  //
  // H2H game counts don't change between scenarios,
  // only who won them.
  // =======================================================

  for (
    const futureGame of
    futureGames
  ) {
    const {
      away,
      home,
    } =
      futureGame;

    wins[
      home
    ] += 1;

    const awayHomeIndex =
      away *
        teamCount +
      home;

    const homeAwayIndex =
      home *
        teamCount +
      away;

    h2hGames[
      awayHomeIndex
    ] += 1;

    h2hGames[
      homeAwayIndex
    ] += 1;

    h2hScore[
      homeAwayIndex
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
  // NEXT GAME LOOKUP
  // =======================================================

  const nextGameBit =
    new Int16Array(
      teamCount
    );

  nextGameBit.fill(
    -1
  );

  const nextGameIsAway =
    new Uint8Array(
      teamCount
    );

  futureGames.forEach(
    (
      game,
      index
    ) => {
      if (
        nextGameBit[
          game.away
        ] === -1
      ) {
        nextGameBit[
          game.away
        ] =
          index;

        nextGameIsAway[
          game.away
        ] = 1;
      }

      if (
        nextGameBit[
          game.home
        ] === -1
      ) {
        nextGameBit[
          game.home
        ] =
          index;

        nextGameIsAway[
          game.home
        ] = 0;
      }
    }
  );

  // =======================================================
  // STATS
  // =======================================================

  const guaranteedIn =
    new Uint32Array(
      teamCount
    );

  const guaranteedOut =
    new Uint32Array(
      teamCount
    );

  const tiebreakDependent =
    new Uint32Array(
      teamCount
    );

  const seedMask =
    new Uint8Array(
      teamCount
    );

  const nextWinTotal =
    new Uint32Array(
      teamCount
    );

  const nextWinGuaranteed =
    new Uint32Array(
      teamCount
    );

  const nextLossTotal =
    new Uint32Array(
      teamCount
    );

  const nextLossGuaranteed =
    new Uint32Array(
      teamCount
    );

  const nextWinTiebreak =
    new Uint32Array(
      teamCount
    );

  const nextLossTiebreak =
    new Uint32Array(
      teamCount
    );

  const totalScenarios =
    2 ** gameCount;

  let truncatedScenarioCount =
    0;

  // PF and PA are only final once the
  // regular season is actually finished.
  const pointsFinal =
    gameCount === 0;

  let previousGray =
    0;

  // =======================================================
  // PROCESS EACH W/L COMBINATION
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

    // ---------------------------------
    // Only one future result changes.
    // ---------------------------------

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

      const bitMask =
        1 << bit;

      const nowAwayWins =
        (
          gray &
          bitMask
        ) !== 0;

      const game =
        futureGames[
          bit
        ];

      const {
        away,
        home,
      } =
        game;

      const awayHomeIndex =
        away *
          teamCount +
        home;

      const homeAwayIndex =
        home *
          teamCount +
        away;

      if (
        nowAwayWins
      ) {
        wins[
          home
        ] -= 1;

        wins[
          away
        ] += 1;

        h2hScore[
          homeAwayIndex
        ] -= 2;

        h2hScore[
          awayHomeIndex
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

        h2hScore[
          awayHomeIndex
        ] -= 2;

        h2hScore[
          homeAwayIndex
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
      pointsFinal,
      criteria,
    };

    const outcome =
      possiblePlayoffFields({
        divisionGroups,
        playoffTeamCount,
        teamCount,
        context,
      });

    // ---------------------------------
    // Extremely complex unresolved tie:
    // classify conservatively rather
    // than pretend we know the answer.
    // ---------------------------------

    if (
      outcome.truncated ||
      outcome.fields.length ===
        0
    ) {
      truncatedScenarioCount +=
        1;

      for (
        let teamIndex = 0;
        teamIndex <
        teamCount;
        teamIndex += 1
      ) {
        tiebreakDependent[
          teamIndex
        ] += 1;

        // Conservatively allow
        // every playoff seed.
        for (
          let seed = 1;
          seed <=
          playoffTeamCount;
          seed += 1
        ) {
          seedMask[
            teamIndex
          ] |=
            1 << seed;
        }

        const nextBit =
          nextGameBit[
            teamIndex
          ];

        if (
          nextBit < 0
        ) {
          continue;
        }

        const awayWon =
          (
            gray &
            (
              1 <<
              nextBit
            )
          ) !== 0;

        const ownerWon =
          nextGameIsAway[
            teamIndex
          ]
            ? awayWon
            : !awayWon;

        if (
          ownerWon
        ) {
          nextWinTotal[
            teamIndex
          ] += 1;

          nextWinTiebreak[
            teamIndex
          ] += 1;

        } else {
          nextLossTotal[
            teamIndex
          ] += 1;

          nextLossTiebreak[
            teamIndex
          ] += 1;
        }
      }

      continue;
    }

    // ---------------------------------
    // Count appearances across every
    // legal tiebreak resolution.
    // ---------------------------------

    const appearances =
      new Uint16Array(
        teamCount
      );

    for (
      const field of
      outcome.fields
    ) {
      field.forEach(
        (
          teamIndex,
          seedIndex
        ) => {
          appearances[
            teamIndex
          ] += 1;

          seedMask[
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

    for (
      let teamIndex = 0;
      teamIndex <
      teamCount;
      teamIndex += 1
    ) {
      let status;

      if (
        appearances[
          teamIndex
        ] ===
        outcome.fields.length
      ) {
        guaranteedIn[
          teamIndex
        ] += 1;

        status =
          "IN";

      } else if (
        appearances[
          teamIndex
        ] === 0
      ) {
        guaranteedOut[
          teamIndex
        ] += 1;

        status =
          "OUT";

      } else {
        tiebreakDependent[
          teamIndex
        ] += 1;

        status =
          "TB";
      }

      // ---------------------------------
      // NEXT GAME CONDITIONAL
      // ---------------------------------

      const nextBit =
        nextGameBit[
          teamIndex
        ];

      if (
        nextBit < 0
      ) {
        continue;
      }

      const awayWon =
        (
          gray &
          (
            1 <<
            nextBit
          )
        ) !== 0;

      const ownerWon =
        nextGameIsAway[
          teamIndex
        ]
          ? awayWon
          : !awayWon;

      if (
        ownerWon
      ) {
        nextWinTotal[
          teamIndex
        ] += 1;

        if (
          status ===
          "IN"
        ) {
          nextWinGuaranteed[
            teamIndex
          ] += 1;

        } else if (
          status ===
          "TB"
        ) {
          nextWinTiebreak[
            teamIndex
          ] += 1;
        }

      } else {
        nextLossTotal[
          teamIndex
        ] += 1;

        if (
          status ===
          "IN"
        ) {
          nextLossGuaranteed[
            teamIndex
          ] += 1;

        } else if (
          status ===
          "TB"
        ) {
          nextLossTiebreak[
            teamIndex
          ] += 1;
        }
      }
    }
  }

  // =======================================================
  // FINAL RESULT MAP
  // =======================================================

  const stats =
    new Map();

  teams.forEach(
    (
      team,
      index
    ) => {
      const possibleSeeds =
        [];

      for (
        let seed = 1;
        seed <=
        playoffTeamCount;
        seed += 1
      ) {
        if (
          seedMask[
            index
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

      stats.set(
        team.ownerId,
        {
          guaranteedIn:
            guaranteedIn[
              index
            ],

          guaranteedOut:
            guaranteedOut[
              index
            ],

          tiebreakDependent:
            tiebreakDependent[
              index
            ],

          possibleSeeds,

          nextWinTotal:
            nextWinTotal[
              index
            ],

          nextWinGuaranteed:
            nextWinGuaranteed[
              index
            ],

          nextWinTiebreak:
            nextWinTiebreak[
              index
            ],

          nextLossTotal:
            nextLossTotal[
              index
            ],

          nextLossGuaranteed:
            nextLossGuaranteed[
              index
            ],

          nextLossTiebreak:
            nextLossTiebreak[
              index
            ],
        }
      );
    }
  );

  return {
    totalScenarios,

    stats,

    truncatedScenarioCount,

    criteria,
  };
}

// =========================================================
// PAGE
// =========================================================

export default async function PlayoffScenariosPage() {
  let leagueData;
  let espnSettings;

  try {
    leagueData =
      await getLeagueData();

    espnSettings =
      await getEspnPlayoffSettings(
        leagueData
          .currentSeason
      );

  } catch (error) {
    return (
      <main className="page-shell">

        <header className="site-header">

          <div className="site-title">

            <Link href="/">
              <strong>
                DIRTY P FANTASY FOOTBALL
              </strong>
            </Link>

            <span>
              THE LEAGUE ARCHIVE · EST. 2014
            </span>

          </div>

        </header>

        <section className="owners-hero">

          <div>

            <p className="eyebrow">
              ESPN DATA ERROR
            </p>

            <h1>
              Playoff Scenarios
            </h1>

            <p>
              {error?.message ||
                "Unable to load ESPN playoff settings."}
            </p>

          </div>

        </section>

      </main>
    );
  }

  const {
    currentSeason,
    currentWeek,
    owners,
    currentTeams,
    currentSeasonResults,
    currentSeasonMatchups,
    completedCurrentMatchups,
  } =
    leagueData;

  const {
    playoffTeamCount,
    regularSeasonWeeks,
    playoffSeedingRule,
    matchupTieRule,
    divisionNameById,
    teamDivisionByEspnId,
  } =
    espnSettings;

  // =======================================================
  // OWNER / RESULT LOOKUPS
  // =======================================================

  const ownerMap =
    new Map(
      (
        owners || []
      ).map(
        (owner) => [
          Number(
            owner.id
          ),
          owner.name,
        ]
      )
    );

  const resultMap =
    new Map(
      (
        currentSeasonResults ||
        []
      ).map(
        (result) => [
          Number(
            result.owner_id
          ),
          result,
        ]
      )
    );

  // =======================================================
  // BUILD TEAM LIST USING ESPN'S DIVISIONS
  // =======================================================

  const teams =
    (
      currentTeams ||
      []
    )
      .map(
        (team) => {
          const ownerId =
            Number(
              team.owner_id ??
                team.ownerId ??
                0
            );

          const espnTeamId =
            Number(
              team.espnTeamId ??
                team.espn_team_id ??
                team.id ??
                0
            );

          const result =
            resultMap.get(
              ownerId
            );

          const divisionId =
            Number(
              teamDivisionByEspnId[
                espnTeamId
              ]
            );

          return {
            ownerId,

            espnTeamId,

            ownerName:
              ownerMap.get(
                ownerId
              ) ||
              team.ownerName ||
              "Unknown Owner",

            teamName:
              team.team_name ||
              team.teamName ||
              "Unknown Team",

            divisionId,

            divisionName:
              divisionNameById[
                divisionId
              ] ||
              `Division ${divisionId + 1}`,

            currentSeed:
              num(
                team.playoffSeed ??
                  team.playoff_seed ??
                  team.seed
              ),

            wins:
              num(
                team.wins ??
                  result?.wins
              ),

            losses:
              num(
                team.losses ??
                  result?.losses
              ),

            ties:
              num(
                team.ties ??
                  result?.ties
              ),

            pointsFor:
              num(
                team.pointsFor ??
                  team.points_for ??
                  result
                    ?.points_for
              ),

            pointsAgainst:
              num(
                team.pointsAgainst ??
                  team.points_against ??
                  result
                    ?.points_against
              ),
          };
        }
      )
      .filter(
        (team) =>
          team.ownerId >
            0 &&
          Number.isFinite(
            team.divisionId
          )
      );

  // =======================================================
  // REGULAR-SEASON GAMES ONLY
  // =======================================================

  const regularGames =
    (
      currentSeasonMatchups ||
      []
    )
      .filter(
        (game) =>
          Number(
            game.matchup_period
          ) <=
            regularSeasonWeeks &&
          game.is_playoff !==
            true &&
          game.is_consolation !==
            true
      );

  const completedRegularGames =
    (
      completedCurrentMatchups ||
      []
    )
      .filter(
        (game) =>
          Number(
            game.matchup_period
          ) <=
            regularSeasonWeeks &&
          game.is_playoff !==
            true &&
          game.is_consolation !==
            true
      );

  const completedKeys =
    new Set(
      completedRegularGames.map(
        gameKey
      )
    );

  const remainingGames =
    regularGames
      .filter(
        (game) =>
          !completedKeys.has(
            gameKey(
              game
            )
          )
      )
      .filter(
        (game) =>
          Number(
            game.away_owner_id
          ) > 0 &&
          Number(
            game.home_owner_id
          ) > 0
      )
      .sort(
        (a, b) =>
          Number(
            a.matchup_period
          ) -
          Number(
            b.matchup_period
          )
      );

  const remainingWeeks =
    [
      ...new Set(
        remainingGames.map(
          (game) =>
            Number(
              game.matchup_period
            )
        )
      ),
    ].sort(
      (a, b) =>
        a - b
    );

  // =======================================================
  // CURRENT DIVISION RACES
  //
  // Current ESPN playoffSeed is used as the source of truth
  // for today's order, so ESPN itself decides current ties.
  // =======================================================

  const divisionMap =
    new Map();

  for (
    const team of
    teams
  ) {
    if (
      !divisionMap.has(
        team.divisionId
      )
    ) {
      divisionMap.set(
        team.divisionId,
        []
      );
    }

    divisionMap
      .get(
        team.divisionId
      )
      .push(team);
  }

  for (
    const [
      divisionId,
      divisionTeams,
    ] of
    divisionMap.entries()
  ) {
    divisionMap.set(
      divisionId,
      currentSeedSort(
        divisionTeams
      )
    );
  }

  const divisions =
    [
      ...divisionMap.entries(),
    ].sort(
      (a, b) =>
        Number(a[0]) -
        Number(b[0])
    );

  const currentDivisionLeaders =
    divisions
      .map(
        ([, divisionTeams]) =>
          divisionTeams[0]
      )
      .filter(
        Boolean
      );

  const leaderOwnerIds =
    new Set(
      currentDivisionLeaders.map(
        (team) =>
          team.ownerId
      )
    );

  const wildcardRace =
    currentSeedSort(
      teams.filter(
        (team) =>
          !leaderOwnerIds.has(
            team.ownerId
          )
      )
    );

  // =======================================================
  // NEXT GAME BY OWNER
  // =======================================================

  const nextGameByOwner =
    new Map();

  for (
    const game of
    remainingGames
  ) {
    const awayId =
      Number(
        game.away_owner_id
      );

    const homeId =
      Number(
        game.home_owner_id
      );

    const week =
      Number(
        game.matchup_period
      );

    if (
      !nextGameByOwner.has(
        awayId
      )
    ) {
      nextGameByOwner.set(
        awayId,
        {
          week,

          opponentId:
            homeId,

          opponent:
            ownerMap.get(
              homeId
            ) ||
            "Unknown",
        }
      );
    }

    if (
      !nextGameByOwner.has(
        homeId
      )
    ) {
      nextGameByOwner.set(
        homeId,
        {
          week,

          opponentId:
            awayId,

          opponent:
            ownerMap.get(
              awayId
            ) ||
            "Unknown",
        }
      );
    }
  }

  // =======================================================
  // EXACT ENGINE ACTIVATION
  //
  // Weekly matchup ties must be broken by ESPN so that a
  // future matchup has two possible outcomes: W or L.
  // =======================================================

  const binaryWeeklyResults =
    Boolean(
      matchupTieRule
    ) &&
    String(
      matchupTieRule
    ).toUpperCase() !==
      "NONE";

  const scenarioEngineActive =
    remainingWeeks.length <=
      4 &&
    remainingGames.length <=
      20 &&
    binaryWeeklyResults;

  const scenarioEngine =
    scenarioEngineActive
      ? simulatePlayoffScenarios({
          teams,
          completedGames:
            completedRegularGames,
          remainingGames,
          playoffTeamCount,
          playoffSeedingRule,
        })
      : null;

  const refreshMs =
    scenarioEngine
      ? 300000
      : 30000;

  const tiebreakLabel =
    getTiebreakLabel(
      playoffSeedingRule
    );

  // =======================================================
  // CARD STATUS
  // =======================================================

  function getStatus(
    team
  ) {
    const stats =
      scenarioEngine
        ?.stats
        ?.get(
          team.ownerId
        );

    if (
      stats &&
      stats.guaranteedIn ===
        scenarioEngine
          .totalScenarios
    ) {
      return "PLAYOFF CLINCHED";
    }

    if (
      stats &&
      stats.guaranteedOut ===
        scenarioEngine
          .totalScenarios
    ) {
      return "ELIMINATED";
    }

    if (
      leaderOwnerIds.has(
        team.ownerId
      )
    ) {
      return "DIVISION LEADER";
    }

    if (
      team.currentSeed >
        0 &&
      team.currentSeed <=
        playoffTeamCount
    ) {
      return "WILD CARD";
    }

    return "IN THE HUNT";
  }

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <main className="page-shell">

      <AutoRefresh
        enabled={true}
        intervalMs={
          refreshMs
        }
      />

      {/* HEADER */}

      <header className="site-header">

        <div className="site-title">

          <Link href="/">
            <strong>
              DIRTY P FANTASY FOOTBALL
            </strong>
          </Link>

          <span>
            THE LEAGUE ARCHIVE · EST. 2014
          </span>

        </div>

      </header>

      {/* HERO */}

      <section className="owners-hero">

        <div>

          <p className="eyebrow">
            {currentSeason} POSTSEASON RACE
          </p>

          <h1>
            Playoff Scenarios
          </h1>

          <p>
            The live division and wild-card race,
            calculated using ESPN&apos;s actual league
            settings and playoff tiebreak rules.
          </p>

        </div>

        <div className="owners-count">

          <strong>
            {playoffTeamCount}
          </strong>

          <span>
            PLAYOFF TEAMS
          </span>

        </div>

      </section>

      {/* PAGE NAV */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          Week {currentWeek}
          {" · "}
          ESPN TB: {tiebreakLabel}
        </span>

      </nav>

      {/* =====================================================
          DIVISION RACES
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              AUTOMATIC BERTHS
            </p>

            <h2>
              Division Races
            </h2>

          </div>

          <span>
            Winners take the top seeds
          </span>

        </div>

        <div className="division-grid">

          {divisions.map(
            ([
              divisionId,
              divisionTeams,
            ]) => (

              <div
                className="division-card"
                key={
                  divisionId
                }
              >

                <div className="division-title">

                  <h3>
                    {divisionNameById[
                      divisionId
                    ] ||
                      `Division ${Number(divisionId) + 1}`}
                  </h3>

                </div>

                <div className="division-header">

                  <span>
                    RK
                  </span>

                  <span>
                    TEAM
                  </span>

                  <span>
                    W-L
                  </span>

                  <span>
                    SEED
                  </span>

                </div>

                {divisionTeams.map(
                  (
                    team,
                    index
                  ) => (

                    <div
                      className={`division-row ${
                        index === 0
                          ? "playoff-position"
                          : ""
                      }`}
                      key={
                        team.ownerId
                      }
                    >

                      <span className="standings-rank">
                        {index + 1}
                      </span>

                      <div className="standings-team">

                        <div className="team-name-line">

                          <strong>
                            {team.teamName}
                          </strong>

                          {index ===
                            0 && (
                            <span className="playoff-badge">
                              LEADER
                            </span>
                          )}

                        </div>

                        <span>
                          {team.ownerName}
                        </span>

                      </div>

                      <strong className="standings-record">

                        {formatRecord(
                          team.wins,
                          team.losses,
                          team.ties
                        )}

                      </strong>

                      <strong className="standings-pf">

                        #{team.currentSeed ||
                          "—"}

                      </strong>

                    </div>
                  )
                )}

              </div>

            )
          )}

        </div>

      </section>

      {/* =====================================================
          WILD CARD
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              REMAINING BERTHS
            </p>

            <h2>
              Wild Card Race
            </h2>

          </div>

          <span>
            Division leaders removed
          </span>

        </div>

        <div className="profile-table-wrap">

          <table className="profile-table">

            <thead>

              <tr>

                <th>
                  WC
                </th>

                <th>
                  OWNER
                </th>

                <th>
                  TEAM
                </th>

                <th>
                  RECORD
                </th>

                <th>
                  ESPN SEED
                </th>

                <th>
                  STATUS
                </th>

              </tr>

            </thead>

            <tbody>

              {wildcardRace.map(
                (
                  team,
                  index
                ) => {

                  const wildCardSpots =
                    Math.max(
                      0,
                      playoffTeamCount -
                        divisions.length
                    );

                  return (
                    <tr
                      key={
                        team.ownerId
                      }
                    >

                      <td>

                        <strong>
                          #{index + 1}
                        </strong>

                      </td>

                      <td>

                        <strong>
                          {team.ownerName}
                        </strong>

                      </td>

                      <td>
                        {team.teamName}
                      </td>

                      <td>

                        <strong>

                          {formatRecord(
                            team.wins,
                            team.losses,
                            team.ties
                          )}

                        </strong>

                      </td>

                      <td>
                        #{team.currentSeed ||
                          "—"}
                      </td>

                      <td>

                        {index <
                        wildCardSpots ? (

                          <span className="playoff-badge">
                            IN
                          </span>

                        ) : (

                          <span>
                            OUT
                          </span>

                        )}

                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        </div>

      </section>

      {/* =====================================================
          PLAYOFF SCENARIOS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              EVERY TEAM
            </p>

            <h2>
              Playoff Paths
            </h2>

          </div>

          <span>

            {scenarioEngine
              ? `${scenarioEngine.totalScenarios.toLocaleString()} W/L scenarios`
              : "Full scenarios activate with 4 weeks left"}

          </span>

        </div>

        <div className="owners-grid">

          {currentSeedSort(
            teams
          ).map(
            (team) => {

              const stats =
                scenarioEngine
                  ?.stats
                  ?.get(
                    team.ownerId
                  );

              const nextGame =
                nextGameByOwner.get(
                  team.ownerId
                );

              const status =
                getStatus(
                  team
                );

              const guaranteed =
                stats
                  ? formatPercent(
                      stats.guaranteedIn,
                      scenarioEngine
                        .totalScenarios
                    )
                  : "—";

              const tiebreak =
                stats
                  ? formatPercent(
                      stats.tiebreakDependent,
                      scenarioEngine
                        .totalScenarios
                    )
                  : "—";

              const winGuaranteed =
                stats
                  ? formatPercent(
                      stats.nextWinGuaranteed,
                      stats.nextWinTotal
                    )
                  : "—";

              const lossGuaranteed =
                stats
                  ? formatPercent(
                      stats.nextLossGuaranteed,
                      stats.nextLossTotal
                    )
                  : "—";

              const possibleSeeds =
                stats
                  ?.possibleSeeds
                  ?.length
                  ? stats.possibleSeeds
                      .map(
                        (seed) =>
                          `#${seed}`
                      )
                      .join("/")
                  : scenarioEngine
                    ? "NONE"
                    : "—";

              const gamesLeft =
                remainingGames.filter(
                  (game) =>
                    Number(
                      game.away_owner_id
                    ) ===
                      team.ownerId ||
                    Number(
                      game.home_owner_id
                    ) ===
                      team.ownerId
                ).length;

              return (
                <article
                  className="owner-card"
                  key={
                    team.ownerId
                  }
                >

                  {/* TOP */}

                  <div className="owner-card-top">

                    <div>

                      <span className="owner-status">
                        {status}
                      </span>

                      <h3>
                        {team.ownerName}
                      </h3>

                      <p className="owner-team-name">
                        {team.teamName}
                        {" · "}
                        {team.divisionName}
                      </p>

                    </div>

                    <div className="owner-title-count">

                      <strong>

                        {team.currentSeed
                          ? `#${team.currentSeed}`
                          : "—"}

                      </strong>

                      <span>
                        ESPN SEED
                      </span>

                    </div>

                  </div>

                  {/* RECORD */}

                  <div className="owner-record">

                    <div>

                      <strong>

                        {formatRecord(
                          team.wins,
                          team.losses,
                          team.ties
                        )}

                      </strong>

                      <span>
                        RECORD
                      </span>

                    </div>

                    <div>

                      <strong>
                        {gamesLeft}
                      </strong>

                      <span>
                        GAMES LEFT
                      </span>

                    </div>

                  </div>

                  {/* ONLY THE IMPORTANT SCENARIO DATA */}

                  <div className="owner-stats-grid">

                    <div>

                      <strong>
                        {guaranteed}
                      </strong>

                      <span>
                        GUARANTEED IN
                      </span>

                    </div>

                    <div>

                      <strong>
                        {tiebreak}
                      </strong>

                      <span>
                        TIEBREAK
                      </span>

                    </div>

                    <div>

                      <strong>
                        {possibleSeeds}
                      </strong>

                      <span>
                        POSSIBLE SEEDS
                      </span>

                    </div>

                    <div>

                      <strong>

                        {nextGame
                          ? `W${nextGame.week}`
                          : "—"}

                      </strong>

                      <span>
                        NEXT GAME
                      </span>

                    </div>

                  </div>

                  {/* BOTTOM */}

                  <div className="owner-card-bottom">

                    <span>

                      {nextGame
                        ? `vs. ${nextGame.opponent}`
                        : "Regular season complete"}

                    </span>

                    <strong>

                      {scenarioEngine
                        ? `WIN → ${winGuaranteed} · LOSS → ${lossGuaranteed}`
                        : "SCENARIOS AT 4 WEEKS"}

                    </strong>

                  </div>

                </article>
              );
            }
          )}

        </div>

      </section>

      {/* FOOTER */}

      <footer className="site-footer">

        <strong>
          Dirty P Fantasy Football
        </strong>

        <span>
          ESPN Tiebreak: {tiebreakLabel}
        </span>

        <p>
          Scenario percentages are shares of possible W/L outcomes,
          not betting probabilities. Future Points For and Points
          Against are never guessed; any scenario that reaches an
          unknown points-based tiebreak is labeled Tiebreak.
        </p>

      </footer>

    </main>
  );
}
