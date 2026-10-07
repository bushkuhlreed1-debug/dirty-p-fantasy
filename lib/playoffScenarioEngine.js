const MAX_FIELD_BRANCHES = 10000;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getGameWinner(game) {
  const winner = String(game?.winner || "").toUpperCase();

  const awayId = Number(game?.away_owner_id);
  const homeId = Number(game?.home_owner_id);

  if (winner === "AWAY") return awayId;
  if (winner === "HOME") return homeId;

  const awayScore = Number(game?.away_score);
  const homeScore = Number(game?.home_score);

  if (
    Number.isFinite(awayScore) &&
    Number.isFinite(homeScore)
  ) {
    if (awayScore > homeScore) return awayId;
    if (homeScore > awayScore) return homeId;
  }

  return null;
}

// =========================================================
// ESPN TIEBREAK ORDER
// =========================================================

export function getTiebreakCriteria(rule) {
  const value = String(rule || "").toUpperCase();

  if (value.includes("H2H")) {
    return ["H2H", "PF", "DIV", "PA", "COIN"];
  }

  if (
    value.includes("TOTAL_POINTS_SCORED") ||
    value.includes("POINTS_FOR")
  ) {
    return ["PF", "H2H", "DIV", "PA", "COIN"];
  }

  if (
    value.includes("INTRA") ||
    value.includes("DIVISION")
  ) {
    return ["DIV", "H2H", "PF", "PA", "COIN"];
  }

  if (value.includes("AGAINST")) {
    return ["PA", "H2H", "PF", "DIV", "COIN"];
  }

  return ["H2H", "PF", "DIV", "PA", "COIN"];
}

export function getTiebreakLabel(rule) {
  return getTiebreakCriteria(rule).join(" → ");
}

function ratio(numerator, denominator) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function keepBestRatio(
  indices,
  numeratorFn,
  denominatorFn
) {
  let best = -Infinity;
  const winners = [];

  for (const index of indices) {
    const value = ratio(
      numeratorFn(index),
      denominatorFn(index)
    );

    if (value > best + 0.0000001) {
      best = value;
      winners.length = 0;
      winners.push(index);
    } else if (
      Math.abs(value - best) < 0.0000001
    ) {
      winners.push(index);
    }
  }

  return winners;
}

function keepBestNumber(indices, valueFn) {
  let best = -Infinity;
  const winners = [];

  for (const index of indices) {
    const value = Number(valueFn(index));

    if (value > best + 0.0000001) {
      best = value;
      winners.length = 0;
      winners.push(index);
    } else if (
      Math.abs(value - best) < 0.0000001
    ) {
      winners.push(index);
    }
  }

  return winners;
}

function topRecordGroup(indices, wins, ties) {
  let best = -Infinity;
  const group = [];

  for (const index of indices) {
    const recordValue =
      wins[index] * 2 + ties[index];

    if (recordValue > best) {
      best = recordValue;
      group.length = 0;
      group.push(index);
    } else if (recordValue === best) {
      group.push(index);
    }
  }

  return group;
}

// =========================================================
// ESPN TIEBREAKER
// =========================================================

function resolveTieCandidates(indices, context) {
  let group = [...indices];
  const traces = [];

  for (const criterion of context.criteria) {
    if (group.length <= 1) break;

    // -----------------------------------------------------
    // HEAD TO HEAD
    // -----------------------------------------------------

    if (criterion === "H2H") {
      const gamesPlayed = new Map();
      const h2hPoints = new Map();

      let expectedGames = null;
      let valid = true;

      for (const teamIndex of group) {
        let games = 0;
        let points = 0;

        for (const opponentIndex of group) {
          if (teamIndex === opponentIndex) continue;

          const matrixIndex =
            teamIndex * context.teamCount +
            opponentIndex;

          games += context.h2hGames[matrixIndex];
          points += context.h2hScore[matrixIndex];
        }

        gamesPlayed.set(teamIndex, games);
        h2hPoints.set(teamIndex, points);

        if (expectedGames === null) {
          expectedGames = games;
        } else if (games !== expectedGames) {
          valid = false;
        }
      }

      // ESPN skips a multi-team H2H comparison when
      // the tied teams did not play the tied group
      // an equal number of times.
      if (!valid) {
        continue;
      }

      group = keepBestRatio(
        group,
        (index) => h2hPoints.get(index) || 0,
        (index) =>
          (gamesPlayed.get(index) || 0) * 2
      );

      continue;
    }

    // -----------------------------------------------------
    // POINTS FOR
    // -----------------------------------------------------

    if (criterion === "PF") {
      if (!context.pointsFinal) {
        traces.push({
          criterion: "PF",
          members: [...group],
        });

        break;
      }

      group = keepBestNumber(
        group,
        (index) => context.pointsFor[index]
      );

      continue;
    }

    // -----------------------------------------------------
    // DIVISION RECORD
    // -----------------------------------------------------

    if (criterion === "DIV") {
      group = keepBestRatio(
        group,
        (index) =>
          context.divisionScore[index],
        (index) =>
          context.divisionGames[index] * 2
      );

      continue;
    }

    // -----------------------------------------------------
    // POINTS AGAINST
    // -----------------------------------------------------

    if (criterion === "PA") {
      if (!context.pointsFinal) {
        traces.push({
          criterion: "PA",
          members: [...group],
        });

        break;
      }

      group = keepBestNumber(
        group,
        (index) => context.pointsAgainst[index]
      );

      continue;
    }

    // -----------------------------------------------------
    // FINAL RANDOM TIE
    // -----------------------------------------------------

    if (criterion === "COIN") {
      traces.push({
        criterion: "COIN",
        members: [...group],
      });

      break;
    }
  }

  return {
    candidates: group,
    traces,
  };
}

function traceKey(trace) {
  return (
    `${trace.criterion}:` +
    [...trace.members]
      .sort((a, b) => a - b)
      .join(",")
  );
}

function mergeTraces(target, traces) {
  for (const trace of traces) {
    target.set(traceKey(trace), trace);
  }
}

// =========================================================
// ESPN RESTARTS TIEBREAK AFTER EACH SEED
// =========================================================

function rankPossible(
  indices,
  spots,
  context
) {
  const results = [];
  const traceMap = new Map();

  let truncated = false;

  function walk(
    pool,
    spotsLeft,
    prefix
  ) {
    if (truncated) return;

    if (results.length >= MAX_FIELD_BRANCHES) {
      truncated = true;
      return;
    }

    if (
      spotsLeft <= 0 ||
      pool.length === 0
    ) {
      results.push(prefix);
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

    for (const candidate of resolved.candidates) {
      walk(
        pool.filter(
          (index) =>
            index !== candidate
        ),
        spotsLeft - 1,
        [...prefix, candidate]
      );

      if (truncated) return;
    }
  }

  walk(indices, spots, []);

  return {
    results,
    traces: [...traceMap.values()],
    truncated,
  };
}

// =========================================================
// BUILD EVERY LEGAL PLAYOFF FIELD
// =========================================================

function possiblePlayoffFields({
  divisionGroups,
  playoffTeamCount,
  teamCount,
  context,
}) {
  const fieldMap = new Map();
  const traceMap = new Map();

  let truncated = false;

  const divisionOptions = [];

  // Division champions
  for (const divisionTeams of divisionGroups) {
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

    if (ranking.truncated) {
      truncated = true;
      break;
    }

    divisionOptions.push([
      ...new Set(
        ranking.results.map(
          (result) => result[0]
        )
      ),
    ]);
  }

  if (truncated) {
    return {
      fields: [],
      traces: [...traceMap.values()],
      truncated: true,
    };
  }

  function addField(field) {
    const trimmed =
      field.slice(
        0,
        playoffTeamCount
      );

    fieldMap.set(
      trimmed.join("-"),
      trimmed
    );

    if (
      fieldMap.size >=
      MAX_FIELD_BRANCHES
    ) {
      truncated = true;
    }
  }

  function processChampions(champions) {
    if (truncated) return;

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

    if (championRanking.truncated) {
      truncated = true;
      return;
    }

    const championSet =
      new Set(champions);

    const remaining = [];

    for (
      let index = 0;
      index < teamCount;
      index += 1
    ) {
      if (
        !championSet.has(index)
      ) {
        remaining.push(index);
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

    if (wildCardRanking.truncated) {
      truncated = true;
      return;
    }

    for (
      const champOrder of
      championRanking.results
    ) {
      for (
        const wildCardOrder of
        wildCardRanking.results
      ) {
        addField([
          ...champOrder,
          ...wildCardOrder,
        ]);

        if (truncated) return;
      }
    }
  }

  function selectDivisionWinners(
    divisionIndex,
    champions
  ) {
    if (truncated) return;

    if (
      divisionIndex >=
      divisionOptions.length
    ) {
      processChampions(champions);
      return;
    }

    for (
      const champion of
      divisionOptions[divisionIndex]
    ) {
      selectDivisionWinners(
        divisionIndex + 1,
        [...champions, champion]
      );

      if (truncated) return;
    }
  }

  selectDivisionWinners(0, []);

  return {
    fields: [...fieldMap.values()],
    traces: [...traceMap.values()],
    truncated,
  };
}

// =========================================================
// OWNER PERSONAL W/L PATTERN
// =========================================================

function getPatternCode(
  scenarioMask,
  games
) {
  let code = 0;

  for (const game of games) {
    const awayWon =
      (
        scenarioMask &
        (1 << game.bit)
      ) !== 0;

    const ownerWon =
      game.isAway
        ? awayWon
        : !awayWon;

    code =
      (code << 1) |
      (ownerWon ? 1 : 0);
  }

  return code;
}

function decodePattern({
  code,
  games,
  teams,
}) {
  const results = [];

  let wins = 0;

  for (
    let position = 0;
    position < games.length;
    position += 1
  ) {
    const shift =
      games.length -
      1 -
      position;

    const won =
      (
        (code >> shift) &
        1
      ) === 1;

    if (won) wins += 1;

    const game =
      games[position];

    results.push({
      week: game.week,

      result:
        won ? "W" : "L",

      opponentOwnerId:
        teams[game.opponent]
          .ownerId,

      opponentName:
        teams[game.opponent]
          .ownerName,
    });
  }

  return {
    wins,
    losses:
      games.length - wins,
    results,
  };
}

// =========================================================
// DEPENDENCY BUCKET
// =========================================================

function createDependencyBucket(
  fullMask,
  teamCount
) {
  const maxFutureWins =
    new Int16Array(teamCount);

  maxFutureWins.fill(-1);

  return {
    possible: 0,
    guaranteed: 0,
    tiebreak: 0,

    andMask: fullMask,
    orMask: 0,

    maxFutureWins,

    tiebreakReasons:
      new Set(),

    pfCompetitors:
      new Set(),
  };
}

function createPatternBucket({
  code,
  fullMask,
  teamCount,
  playoffTeamCount,
}) {
  const maxFutureWins =
    new Int16Array(teamCount);

  maxFutureWins.fill(-1);

  return {
    code,

    total: 0,

    guaranteedIn: 0,
    guaranteedOut: 0,
    tiebreakDependent: 0,

    alive: 0,

    aliveAndMask:
      fullMask,

    aliveOrMask:
      0,

    maxFutureWins,

    seedMask: 0,

    tiebreakReasons:
      new Set(),

    pfCompetitors:
      new Set(),

    seedBuckets:
      Array.from(
        {
          length:
            playoffTeamCount + 1,
        },
        () =>
          createDependencyBucket(
            fullMask,
            teamCount
          )
      ),
  };
}

// =========================================================
// RECORD DEPENDENCIES
// =========================================================

function updateDependencyBucket({
  bucket,
  scenarioMask,
  futureWins,
  teamIndex,
  teamCount,
  traces,
}) {
  bucket.andMask &=
    scenarioMask;

  bucket.orMask |=
    scenarioMask;

  for (
    let other = 0;
    other < teamCount;
    other += 1
  ) {
    if (other === teamIndex) {
      continue;
    }

    bucket.maxFutureWins[other] =
      Math.max(
        bucket.maxFutureWins[other],
        futureWins[other]
      );
  }

  for (const trace of traces) {
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
            .add(member);
        }
      }
    }
  }
}

// =========================================================
// TURN MASK DATA INTO READABLE REQUIREMENTS
// =========================================================

function buildRequirements({
  possibleCount,
  andMask,
  orMask,
  maxFutureWins,
  futureGames,
  teamIndex,
  teams,
  teamGameBits,
  tiebreakReasons,
  pfCompetitors,
}) {
  const mustResults = [];

  if (possibleCount > 0) {
    futureGames.forEach(
      (game, bit) => {
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
            andMask &
            bitMask
          ) !== 0;

        const everAway =
          (
            orMask &
            bitMask
          ) !== 0;

        if (alwaysAway) {
          mustResults.push({
            week: game.week,

            winnerOwnerId:
              teams[game.away]
                .ownerId,

            winnerName:
              teams[game.away]
                .ownerName,

            loserOwnerId:
              teams[game.home]
                .ownerId,

            loserName:
              teams[game.home]
                .ownerName,
          });
        } else if (!everAway) {
          mustResults.push({
            week: game.week,

            winnerOwnerId:
              teams[game.home]
                .ownerId,

            winnerName:
              teams[game.home]
                .ownerName,

            loserOwnerId:
              teams[game.away]
                .ownerId,

            loserName:
              teams[game.away]
                .ownerName,
          });
        }
      }
    );
  }

  const teamCaps = [];

  if (possibleCount > 0) {
    for (
      let other = 0;
      other < teams.length;
      other += 1
    ) {
      if (other === teamIndex) {
        continue;
      }

      const gamesLeft =
        teamGameBits[other]
          .length;

      const maxWins =
        maxFutureWins[other];

      if (
        maxWins < 0 ||
        maxWins >= gamesLeft
      ) {
        continue;
      }

      teamCaps.push({
        ownerId:
          teams[other]
            .ownerId,

        ownerName:
          teams[other]
            .ownerName,

        gamesLeft,

        maxFutureWins:
          maxWins,

        minimumLosses:
          gamesLeft -
          maxWins,

        maxFinalWins:
          teams[other]
            .wins +
          maxWins,
      });
    }
  }

  const pfRows =
    [...pfCompetitors].map(
      (other) => ({
        ownerId:
          teams[other]
            .ownerId,

        ownerName:
          teams[other]
            .ownerName,

        pointsFor:
          teams[other]
            .pointsFor,

        currentGap:
          teams[other]
            .pointsFor -
          teams[teamIndex]
            .pointsFor,
      })
    );

  return {
    mustResults,

    teamCaps,

    tiebreakReasons: [
      ...tiebreakReasons,
    ],

    pfCompetitors:
      pfRows,
  };
}

// =========================================================
// MAIN ENGINE
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

  const ownerIndex =
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
        (game) => ({
          raw: game,

          away:
            ownerIndex.get(
              Number(
                game.away_owner_id
              )
            ),

          home:
            ownerIndex.get(
              Number(
                game.home_owner_id
              )
            ),

          week:
            Number(
              game.matchup_period
            ),
        })
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

  if (gameCount > 20) {
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
          num(team.wins)
      )
    );

  const ties =
    Int16Array.from(
      teams.map(
        (team) =>
          num(team.ties)
      )
    );

  const pointsFor =
    Float64Array.from(
      teams.map(
        (team) =>
          num(team.pointsFor)
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
    new Int16Array(teamCount);

  const h2hGames =
    new Uint8Array(
      teamCount * teamCount
    );

  const h2hScore =
    new Int16Array(
      teamCount * teamCount
    );

  const divisionGames =
    new Uint8Array(teamCount);

  const divisionScore =
    new Int16Array(teamCount);

  const divisionId =
    teams.map(
      (team) =>
        team.divisionId
    );

  // =======================================================
  // COMPLETED RESULTS
  // =======================================================

  for (const game of completedGames) {
    const away =
      ownerIndex.get(
        Number(
          game.away_owner_id
        )
      );

    const home =
      ownerIndex.get(
        Number(
          game.home_owner_id
        )
      );

    if (
      !Number.isInteger(away) ||
      !Number.isInteger(home)
    ) {
      continue;
    }

    const awayVsHome =
      away * teamCount +
      home;

    const homeVsAway =
      home * teamCount +
      away;

    h2hGames[awayVsHome] += 1;
    h2hGames[homeVsAway] += 1;

    const winner =
      getGameWinner(game);

    if (
      winner ===
      teams[away].ownerId
    ) {
      h2hScore[awayVsHome] += 2;
    } else if (
      winner ===
      teams[home].ownerId
    ) {
      h2hScore[homeVsAway] += 2;
    } else {
      h2hScore[awayVsHome] += 1;
      h2hScore[homeVsAway] += 1;
    }

    if (
      divisionId[away] ===
      divisionId[home]
    ) {
      divisionGames[away] += 1;
      divisionGames[home] += 1;

      if (
        winner ===
        teams[away].ownerId
      ) {
        divisionScore[away] += 2;
      } else if (
        winner ===
        teams[home].ownerId
      ) {
        divisionScore[home] += 2;
      } else {
        divisionScore[away] += 1;
        divisionScore[home] += 1;
      }
    }
  }

  // =======================================================
  // DIVISIONS
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
        !divisionMap.has(key)
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
    [...divisionMap.values()];

  // =======================================================
  // OWNER GAME BITS
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
    (game, bit) => {
      game.bit = bit;

      teamGameBits[
        game.away
      ].push({
        bit,
        week: game.week,
        opponent: game.home,
        isAway: true,
      });

      teamGameBits[
        game.home
      ].push({
        bit,
        week: game.week,
        opponent: game.away,
        isAway: false,
      });
    }
  );

  // =======================================================
  // GRAY CODE START:
  // ALL FUTURE GAMES = HOME WIN
  // =======================================================

  for (const game of futureGames) {
    const away =
      game.away;

    const home =
      game.home;

    wins[home] += 1;
    futureWins[home] += 1;

    const awayVsHome =
      away * teamCount +
      home;

    const homeVsAway =
      home * teamCount +
      away;

    h2hGames[awayVsHome] += 1;
    h2hGames[homeVsAway] += 1;

    h2hScore[homeVsAway] += 2;

    if (
      divisionId[away] ===
      divisionId[home]
    ) {
      divisionGames[away] += 1;
      divisionGames[home] += 1;

      divisionScore[home] += 2;
    }
  }

  // =======================================================
  // STORAGE
  // =======================================================

  const globalIn =
    new Uint32Array(teamCount);

  const globalOut =
    new Uint32Array(teamCount);

  const globalTiebreak =
    new Uint32Array(teamCount);

  const patternMaps =
    Array.from(
      {
        length:
          teamCount,
      },
      () => new Map()
    );

  const totalScenarios =
    2 ** gameCount;

  const fullMask =
    gameCount === 0
      ? 0
      : (1 << gameCount) - 1;

  const appearanceCount =
    new Uint16Array(teamCount);

  const seedStride =
    playoffTeamCount + 1;

  const seedAppearanceCount =
    new Uint16Array(
      teamCount *
        seedStride
    );

  let previousGray = 0;

  let truncatedScenarios = 0;

  // =======================================================
  // EVERY LEAGUE-WIDE W/L COMBINATION
  // =======================================================

  for (
    let scenario = 0;
    scenario < totalScenarios;
    scenario += 1
  ) {
    const gray =
      scenario ^
      (scenario >> 1);

    if (scenario > 0) {
      const changed =
        gray ^
        previousGray;

      const bit =
        31 -
        Math.clz32(changed);

      const mask =
        1 << bit;

      const awayNowWins =
        (gray & mask) !== 0;

      const game =
        futureGames[bit];

      const away =
        game.away;

      const home =
        game.home;

      const awayVsHome =
        away * teamCount +
        home;

      const homeVsAway =
        home * teamCount +
        away;

      if (awayNowWins) {
        wins[home] -= 1;
        wins[away] += 1;

        futureWins[home] -= 1;
        futureWins[away] += 1;

        h2hScore[homeVsAway] -= 2;
        h2hScore[awayVsHome] += 2;

        if (
          divisionId[away] ===
          divisionId[home]
        ) {
          divisionScore[home] -= 2;
          divisionScore[away] += 2;
        }
      } else {
        wins[away] -= 1;
        wins[home] += 1;

        futureWins[away] -= 1;
        futureWins[home] += 1;

        h2hScore[awayVsHome] -= 2;
        h2hScore[homeVsAway] += 2;

        if (
          divisionId[away] ===
          divisionId[home]
        ) {
          divisionScore[away] -= 2;
          divisionScore[home] += 2;
        }
      }
    }

    previousGray = gray;

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

    appearanceCount.fill(0);
    seedAppearanceCount.fill(0);

    if (
      outcome.truncated ||
      outcome.fields.length === 0
    ) {
      truncatedScenarios += 1;
    } else {
      for (const field of outcome.fields) {
        field.forEach(
          (
            teamIndex,
            seedIndex
          ) => {
            appearanceCount[
              teamIndex
            ] += 1;

            const seed =
              seedIndex + 1;

            seedAppearanceCount[
              teamIndex *
                seedStride +
              seed
            ] += 1;
          }
        );
      }
    }

    // =====================================================
    // EACH OWNER
    // =====================================================

    for (
      let teamIndex = 0;
      teamIndex < teamCount;
      teamIndex += 1
    ) {
      let playoffStatus =
        "TB";

      if (
        !outcome.truncated &&
        outcome.fields.length > 0
      ) {
        if (
          appearanceCount[
            teamIndex
          ] ===
          outcome.fields.length
        ) {
          playoffStatus =
            "IN";
        } else if (
          appearanceCount[
            teamIndex
          ] === 0
        ) {
          playoffStatus =
            "OUT";
        }
      }

      if (playoffStatus === "IN") {
        globalIn[teamIndex] += 1;
      } else if (
        playoffStatus === "OUT"
      ) {
        globalOut[teamIndex] += 1;
      } else {
        globalTiebreak[
          teamIndex
        ] += 1;
      }

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

      if (!bucket) {
        bucket =
          createPatternBucket({
            code:
              patternCode,

            fullMask,

            teamCount,

            playoffTeamCount,
          });

        patternMaps[
          teamIndex
        ].set(
          patternCode,
          bucket
        );
      }

      bucket.total += 1;

      // ---------------------------------------------------
      // PLAYOFF PATH
      // ---------------------------------------------------

      if (
        playoffStatus ===
        "IN"
      ) {
        bucket.guaranteedIn +=
          1;
      } else if (
        playoffStatus ===
        "OUT"
      ) {
        bucket.guaranteedOut +=
          1;
      } else {
        bucket
          .tiebreakDependent +=
          1;
      }

      if (
        playoffStatus !==
        "OUT"
      ) {
        bucket.alive += 1;

        bucket.aliveAndMask &=
          gray;

        bucket.aliveOrMask |=
          gray;

        for (
          let other = 0;
          other < teamCount;
          other += 1
        ) {
          if (
            other ===
            teamIndex
          ) {
            continue;
          }

          bucket.maxFutureWins[
            other
          ] =
            Math.max(
              bucket.maxFutureWins[
                other
              ],
              futureWins[other]
            );
        }

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
                  .add(member);
              }
            }
          }
        }
      }

      // ---------------------------------------------------
      // SEED-SPECIFIC PATHS
      // ---------------------------------------------------

      for (
        let seed = 1;
        seed <= playoffTeamCount;
        seed += 1
      ) {
        const seedCount =
          seedAppearanceCount[
            teamIndex *
              seedStride +
            seed
          ];

        if (
          outcome.truncated
        ) {
          continue;
        }

        if (seedCount === 0) {
          continue;
        }

        bucket.seedMask |=
          1 << seed;

        const seedBucket =
          bucket.seedBuckets[
            seed
          ];

        seedBucket.possible +=
          1;

        if (
          seedCount ===
          outcome.fields.length
        ) {
          seedBucket.guaranteed +=
            1;
        } else {
          seedBucket.tiebreak +=
            1;
        }

        updateDependencyBucket({
          bucket:
            seedBucket,

          scenarioMask:
            gray,

          futureWins,

          teamIndex,

          teamCount,

          traces:
            outcome.traces,
        });
      }
    }
  }

  // =======================================================
  // FINALIZE EACH OWNER
  // =======================================================

  const teamStats =
    new Map();

  for (
    let teamIndex = 0;
    teamIndex < teamCount;
    teamIndex += 1
  ) {
    const team =
      teams[teamIndex];

    const patterns = [];

    const seedSummary =
      Array.from(
        {
          length:
            playoffTeamCount + 1,
        },
        (_, seed) => ({
          seed,
          possible: 0,
          guaranteed: 0,
          tiebreak: 0,
        })
      );

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

      const playoffRequirements =
        buildRequirements({
          possibleCount:
            bucket.alive,

          andMask:
            bucket.aliveAndMask,

          orMask:
            bucket.aliveOrMask,

          maxFutureWins:
            bucket.maxFutureWins,

          futureGames,

          teamIndex,

          teams,

          teamGameBits,

          tiebreakReasons:
            bucket.tiebreakReasons,

          pfCompetitors:
            bucket.pfCompetitors,
        });

      const possibleSeeds = [];

      const seedScenarios = [];

      for (
        let seed = 1;
        seed <= playoffTeamCount;
        seed += 1
      ) {
        const seedBucket =
          bucket.seedBuckets[
            seed
          ];

        if (
          seedBucket.possible <= 0
        ) {
          continue;
        }

        possibleSeeds.push(seed);

        seedSummary[
          seed
        ].possible +=
          seedBucket.possible;

        seedSummary[
          seed
        ].guaranteed +=
          seedBucket.guaranteed;

        seedSummary[
          seed
        ].tiebreak +=
          seedBucket.tiebreak;

        const requirements =
          buildRequirements({
            possibleCount:
              seedBucket.possible,

            andMask:
              seedBucket.andMask,

            orMask:
              seedBucket.orMask,

            maxFutureWins:
              seedBucket.maxFutureWins,

            futureGames,

            teamIndex,

            teams,

            teamGameBits,

            tiebreakReasons:
              seedBucket
                .tiebreakReasons,

            pfCompetitors:
              seedBucket
                .pfCompetitors,
          });

        seedScenarios.push({
          seed,

          possible:
            seedBucket.possible,

          guaranteed:
            seedBucket.guaranteed,

          tiebreak:
            seedBucket.tiebreak,

          ...requirements,
        });
      }

      let status =
        "NEEDS HELP";

      if (
        bucket.guaranteedIn ===
        bucket.total
      ) {
        status =
          "CLINCHES";
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
          bucket
            .tiebreakDependent,

        alive:
          bucket.alive,

        status,

        possibleSeeds,

        seedScenarios,

        ...playoffRequirements,
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

    const possibleSeeds =
      seedSummary
        .slice(1)
        .filter(
          (item) =>
            item.possible > 0
        )
        .map(
          (item) =>
            item.seed
        );

    let clinchedSeed = null;

    for (
      let seed = 1;
      seed <= playoffTeamCount;
      seed += 1
    ) {
      if (
        seedSummary[
          seed
        ].guaranteed ===
        totalScenarios
      ) {
        clinchedSeed = seed;
        break;
      }
    }

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

        clinchedSeed,

        possibleSeeds,

        seedSummary:
          seedSummary.slice(1),

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
