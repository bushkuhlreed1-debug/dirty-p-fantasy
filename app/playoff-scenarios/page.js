import Link from "next/link";

import {
  getLeagueData,
} from "../../lib/leagueData";

import {
  supabase,
} from "../../lib/supabase";

import AutoRefresh from "../components/AutoRefresh";

export const dynamic = "force-dynamic";

// =========================================================
// BASIC HELPERS
// =========================================================

function num(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatRecord(
  wins,
  losses,
  ties = 0
) {
  if (num(ties) > 0) {
    return `${num(wins)}-${num(losses)}-${num(ties)}`;
  }

  return `${num(wins)}-${num(losses)}`;
}

function formatPoints(value) {
  return num(value).toFixed(2);
}

function formatPercent(
  value
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return "—";
  }

  return `${Number(value).toFixed(
    1
  )}%`;
}

function recordValue(team) {
  return (
    num(team.wins) +
    num(team.ties) * 0.5
  );
}

// =========================================================
// STANDINGS SORT
//
// Record first.
// Current PF is used as the tiebreak snapshot.
// =========================================================

function rankTeams(teams) {
  return [...teams].sort(
    (a, b) => {
      const recordDiff =
        recordValue(b) -
        recordValue(a);

      if (
        Math.abs(
          recordDiff
        ) > 0.0001
      ) {
        return recordDiff;
      }

      const pfDiff =
        num(b.pointsFor) -
        num(a.pointsFor);

      if (
        Math.abs(
          pfDiff
        ) > 0.0001
      ) {
        return pfDiff;
      }

      return String(
        a.ownerName
      ).localeCompare(
        String(
          b.ownerName
        )
      );
    }
  );
}

function gamesBackText(
  leader,
  team
) {
  if (
    !leader ||
    !team
  ) {
    return "—";
  }

  const difference =
    recordValue(leader) -
    recordValue(team);

  if (
    difference <= 0
  ) {
    return "Leader";
  }

  if (
    difference === 0.5
  ) {
    return "0.5 GB";
  }

  return `${difference.toFixed(
    1
  )} GB`;
}

// =========================================================
// DIVISIONS
// =========================================================

function groupByDivision(
  standings
) {
  const groups =
    new Map();

  for (
    const team of
    standings
  ) {
    const division =
      team.division ||
      "No Division";

    if (
      !groups.has(
        division
      )
    ) {
      groups.set(
        division,
        []
      );
    }

    groups
      .get(division)
      .push(team);
  }

  for (
    const [
      division,
      teams,
    ] of
    groups.entries()
  ) {
    groups.set(
      division,
      rankTeams(teams)
    );
  }

  return groups;
}

// =========================================================
// GAME HELPERS
// =========================================================

function getRegularGames(
  games
) {
  return (
    games || []
  ).filter(
    (game) =>
      game.is_playoff !==
        true &&
      game.is_consolation !==
        true
  );
}

function gameKey(game) {
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
// PLAYOFF FIELD
//
// #1 = better division winner
// #2 = other division winner
// #3 = best remaining record
// #4 = second-best remaining record
// =========================================================

function buildPlayoffField(
  standings
) {
  const divisions =
    groupByDivision(
      standings
    );

  const divisionWinners =
    [];

  for (
    const [
      division,
      teams,
    ] of
    divisions.entries()
  ) {
    if (
      division ===
        "No Division" ||
      !teams.length
    ) {
      continue;
    }

    divisionWinners.push({
      ...teams[0],

      playoffType:
        "DIVISION",
    });
  }

  const rankedDivisionWinners =
    rankTeams(
      divisionWinners
    );

  const divisionWinnerIds =
    new Set(
      rankedDivisionWinners.map(
        (team) =>
          team.ownerId
      )
    );

  const remaining =
    rankTeams(
      standings.filter(
        (team) =>
          !divisionWinnerIds.has(
            team.ownerId
          )
      )
    );

  const wildCards =
    remaining
      .slice(
        0,
        Math.max(
          0,
          4 -
            rankedDivisionWinners.length
        )
      )
      .map(
        (team) => ({
          ...team,

          playoffType:
            "WILD CARD",
        })
      );

  const seeds = [
    ...rankedDivisionWinners,
    ...wildCards,
  ]
    .slice(
      0,
      4
    )
    .map(
      (team, index) => ({
        ...team,

        seed:
          index + 1,
      })
    );

  return {
    divisionWinners:
      rankedDivisionWinners,

    wildCards,

    seeds,
  };
}

// =========================================================
// EXACT SCENARIO ENGINE
//
// Activates with four regular-season weeks left.
//
// Maximum:
// 20 games
// 1,048,576 W/L combinations
//
// This version is optimized so we are not creating/sorting
// thousands of large objects inside every simulation.
// =========================================================

function simulateScenarios({
  standings,
  remainingGames,
}) {
  const teamCount =
    standings.length;

  const ownerIndex =
    new Map(
      standings.map(
        (team, index) => [
          team.ownerId,
          index,
        ]
      )
    );

  const games =
    remainingGames
      .map(
        (game) => ({
          game,

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
    games.length;

  if (
    gameCount > 20
  ) {
    return null;
  }

  const divisionMap =
    new Map();

  standings.forEach(
    (team, index) => {
      if (
        !divisionMap.has(
          team.division
        )
      ) {
        divisionMap.set(
          team.division,
          []
        );
      }

      divisionMap
        .get(
          team.division
        )
        .push(index);
    }
  );

  const divisionEntries =
    [
      ...divisionMap.entries(),
    ].filter(
      ([division]) =>
        division !==
        "No Division"
    );

  if (
    divisionEntries.length !==
    2
  ) {
    return null;
  }

  const divisionA =
    divisionEntries[0][1];

  const divisionB =
    divisionEntries[1][1];

  const baseWins =
    Int16Array.from(
      standings.map(
        (team) =>
          num(team.wins)
      )
    );

  const ties =
    Int16Array.from(
      standings.map(
        (team) =>
          num(team.ties)
      )
    );

  const pointsFor =
    standings.map(
      (team) =>
        num(
          team.pointsFor
        )
    );

  const names =
    standings.map(
      (team) =>
        team.ownerName
    );

  const wins =
    new Int16Array(
      teamCount
    );

  const futureWins =
    new Int16Array(
      teamCount
    );

  const inPlayoffs =
    new Uint8Array(
      teamCount
    );

  const playoffCount =
    new Uint32Array(
      teamCount
    );

  const divisionTitleCount =
    new Uint32Array(
      teamCount
    );

  const nextWinScenarios =
    new Uint32Array(
      teamCount
    );

  const nextWinPlayoffs =
    new Uint32Array(
      teamCount
    );

  const nextLossScenarios =
    new Uint32Array(
      teamCount
    );

  const nextLossPlayoffs =
    new Uint32Array(
      teamCount
    );

  const minFutureWinsInPlayoff =
    new Int16Array(
      teamCount
    );

  minFutureWinsInPlayoff.fill(
    999
  );

  const maxFutureWinsMissingPlayoffs =
    new Int16Array(
      teamCount
    );

  maxFutureWinsMissingPlayoffs.fill(
    -1
  );

  const seedCounts =
    Array.from(
      {
        length:
          teamCount,
      },
      () =>
        new Uint32Array(
          5
        )
    );

  const nextGameIndex =
    new Int16Array(
      teamCount
    );

  nextGameIndex.fill(
    -1
  );

  const nextGameOwnerIsAway =
    new Uint8Array(
      teamCount
    );

  games.forEach(
    (game, gameIndex) => {
      if (
        nextGameIndex[
          game.away
        ] === -1
      ) {
        nextGameIndex[
          game.away
        ] =
          gameIndex;

        nextGameOwnerIsAway[
          game.away
        ] = 1;
      }

      if (
        nextGameIndex[
          game.home
        ] === -1
      ) {
        nextGameIndex[
          game.home
        ] =
          gameIndex;

        nextGameOwnerIsAway[
          game.home
        ] = 0;
      }
    }
  );

  function betterTeam(
    teamA,
    teamB
  ) {
    if (
      teamA < 0
    ) {
      return false;
    }

    if (
      teamB < 0
    ) {
      return true;
    }

    const recordA =
      wins[teamA] * 2 +
      ties[teamA];

    const recordB =
      wins[teamB] * 2 +
      ties[teamB];

    if (
      recordA !==
      recordB
    ) {
      return (
        recordA >
        recordB
      );
    }

    if (
      pointsFor[
        teamA
      ] !==
      pointsFor[
        teamB
      ]
    ) {
      return (
        pointsFor[
          teamA
        ] >
        pointsFor[
          teamB
        ]
      );
    }

    return (
      String(
        names[
          teamA
        ]
      ).localeCompare(
        String(
          names[
            teamB
          ]
        )
      ) < 0
    );
  }

  function findDivisionWinner(
    indices
  ) {
    let winner = -1;

    for (
      const index of
      indices
    ) {
      if (
        betterTeam(
          index,
          winner
        )
      ) {
        winner =
          index;
      }
    }

    return winner;
  }

  function findWildCards(
    divisionWinnerA,
    divisionWinnerB
  ) {
    let wildCard1 =
      -1;

    let wildCard2 =
      -1;

    for (
      let index = 0;
      index <
      teamCount;
      index += 1
    ) {
      if (
        index ===
          divisionWinnerA ||
        index ===
          divisionWinnerB
      ) {
        continue;
      }

      if (
        betterTeam(
          index,
          wildCard1
        )
      ) {
        wildCard2 =
          wildCard1;

        wildCard1 =
          index;

        continue;
      }

      if (
        betterTeam(
          index,
          wildCard2
        )
      ) {
        wildCard2 =
          index;
      }
    }

    return [
      wildCard1,
      wildCard2,
    ];
  }

  const totalScenarios =
    2 ** gameCount;

  for (
    let mask = 0;
    mask <
    totalScenarios;
    mask += 1
  ) {
    wins.set(
      baseWins
    );

    futureWins.fill(
      0
    );

    inPlayoffs.fill(
      0
    );

    // ---------------------------------
    // APPLY EACH FUTURE RESULT
    // ---------------------------------

    for (
      let gameIndex = 0;
      gameIndex <
      gameCount;
      gameIndex += 1
    ) {
      const game =
        games[
          gameIndex
        ];

      const awayWins =
        (
          mask &
          (
            1 <<
            gameIndex
          )
        ) !== 0;

      if (
        awayWins
      ) {
        wins[
          game.away
        ] += 1;

        futureWins[
          game.away
        ] += 1;

      } else {
        wins[
          game.home
        ] += 1;

        futureWins[
          game.home
        ] += 1;
      }
    }

    // ---------------------------------
    // DIVISION WINNERS
    // ---------------------------------

    const divisionWinnerA =
      findDivisionWinner(
        divisionA
      );

    const divisionWinnerB =
      findDivisionWinner(
        divisionB
      );

    divisionTitleCount[
      divisionWinnerA
    ] += 1;

    divisionTitleCount[
      divisionWinnerB
    ] += 1;

    let seed1;
    let seed2;

    if (
      betterTeam(
        divisionWinnerA,
        divisionWinnerB
      )
    ) {
      seed1 =
        divisionWinnerA;

      seed2 =
        divisionWinnerB;

    } else {
      seed1 =
        divisionWinnerB;

      seed2 =
        divisionWinnerA;
    }

    // ---------------------------------
    // WILD CARDS
    // ---------------------------------

    const [
      seed3,
      seed4,
    ] =
      findWildCards(
        divisionWinnerA,
        divisionWinnerB
      );

    const playoffSeeds = [
      seed1,
      seed2,
      seed3,
      seed4,
    ];

    playoffSeeds.forEach(
      (
        teamIndex,
        seedIndex
      ) => {
        if (
          teamIndex < 0
        ) {
          return;
        }

        inPlayoffs[
          teamIndex
        ] = 1;

        playoffCount[
          teamIndex
        ] += 1;

        seedCounts[
          teamIndex
        ][
          seedIndex + 1
        ] += 1;

        minFutureWinsInPlayoff[
          teamIndex
        ] =
          Math.min(
            minFutureWinsInPlayoff[
              teamIndex
            ],

            futureWins[
              teamIndex
            ]
          );
      }
    );

    // ---------------------------------
    // TEAM-SPECIFIC CONDITIONS
    // ---------------------------------

    for (
      let teamIndex = 0;
      teamIndex <
      teamCount;
      teamIndex += 1
    ) {
      if (
        !inPlayoffs[
          teamIndex
        ]
      ) {
        maxFutureWinsMissingPlayoffs[
          teamIndex
        ] =
          Math.max(
            maxFutureWinsMissingPlayoffs[
              teamIndex
            ],

            futureWins[
              teamIndex
            ]
          );
      }

      const nextGame =
        nextGameIndex[
          teamIndex
        ];

      if (
        nextGame < 0
      ) {
        continue;
      }

      const awayWins =
        (
          mask &
          (
            1 <<
            nextGame
          )
        ) !== 0;

      const ownerWon =
        nextGameOwnerIsAway[
          teamIndex
        ]
          ? awayWins
          : !awayWins;

      if (
        ownerWon
      ) {
        nextWinScenarios[
          teamIndex
        ] += 1;

        if (
          inPlayoffs[
            teamIndex
          ]
        ) {
          nextWinPlayoffs[
            teamIndex
          ] += 1;
        }

      } else {
        nextLossScenarios[
          teamIndex
        ] += 1;

        if (
          inPlayoffs[
            teamIndex
          ]
        ) {
          nextLossPlayoffs[
            teamIndex
          ] += 1;
        }
      }
    }
  }

  const stats =
    new Map();

  standings.forEach(
    (team, index) => {
      stats.set(
        team.ownerId,
        {
          playoffCount:
            playoffCount[
              index
            ],

          divisionTitleCount:
            divisionTitleCount[
              index
            ],

          seedCounts: {
            1:
              seedCounts[
                index
              ][1],

            2:
              seedCounts[
                index
              ][2],

            3:
              seedCounts[
                index
              ][3],

            4:
              seedCounts[
                index
              ][4],
          },

          nextWinScenarios:
            nextWinScenarios[
              index
            ],

          nextWinPlayoffs:
            nextWinPlayoffs[
              index
            ],

          nextLossScenarios:
            nextLossScenarios[
              index
            ],

          nextLossPlayoffs:
            nextLossPlayoffs[
              index
            ],

          minFutureWinsInPlayoff:
            minFutureWinsInPlayoff[
              index
            ] === 999
              ? Infinity
              : minFutureWinsInPlayoff[
                  index
                ],

          maxFutureWinsMissingPlayoffs:
            maxFutureWinsMissingPlayoffs[
              index
            ],
        }
      );
    }
  );

  return {
    totalScenarios,
    stats,
  };
}

// =========================================================
// TEAM STATUS
// =========================================================

function getStatus({
  team,
  currentField,
  exact,
}) {
  const exactStats =
    exact?.stats?.get(
      team.ownerId
    );

  if (
    exactStats
  ) {
    if (
      exactStats
        .divisionTitleCount ===
      exact.totalScenarios
    ) {
      return "DIVISION CLINCHED";
    }

    if (
      exactStats
        .playoffCount ===
      exact.totalScenarios
    ) {
      return "PLAYOFF CLINCHED";
    }

    if (
      exactStats
        .playoffCount ===
      0
    ) {
      return "ELIMINATED";
    }
  }

  const divisionLeader =
    currentField
      .divisionWinners
      .some(
        (item) =>
          item.ownerId ===
          team.ownerId
      );

  if (
    divisionLeader
  ) {
    return "DIVISION LEADER";
  }

  const wildCard =
    currentField
      .wildCards
      .some(
        (item) =>
          item.ownerId ===
          team.ownerId
      );

  if (
    wildCard
  ) {
    return "WILD CARD";
  }

  return "IN THE HUNT";
}

// =========================================================
// SCENARIO LABEL
// =========================================================

function getScenarioLabel({
  stats,
  exact,
  gamesLeft,
}) {
  if (
    !stats ||
    !exact
  ) {
    return "PATH OPEN";
  }

  if (
    stats.playoffCount ===
    exact.totalScenarios
  ) {
    return "CLINCHED";
  }

  if (
    stats.playoffCount ===
    0
  ) {
    return "ELIMINATED";
  }

  const nextWinClinches =
    stats.nextWinScenarios >
      0 &&
    stats.nextWinPlayoffs ===
      stats.nextWinScenarios;

  if (
    nextWinClinches
  ) {
    return "WIN & IN";
  }

  const nextLossEliminates =
    stats.nextLossScenarios >
      0 &&
    stats.nextLossPlayoffs ===
      0;

  if (
    nextLossEliminates
  ) {
    return "MUST WIN";
  }

  const mustWinOut =
    stats
      .minFutureWinsInPlayoff ===
    gamesLeft;

  if (
    mustWinOut
  ) {
    return "MUST WIN OUT";
  }

  return "PLAYOFF RACE";
}

// =========================================================
// PAGE
// =========================================================

export default async function PlayoffScenariosPage() {
  let leagueData;

  try {
    leagueData =
      await getLeagueData();

  } catch (error) {
    return (
      <main className="page-shell">

        <h1>
          2026 Playoff Scenarios
        </h1>

        <p>
          {error?.message ||
            "Unable to load league data."}
        </p>

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
  } = leagueData;

  // =======================================================
  // GET 2026 DIVISION INFORMATION
  // =======================================================

  const {
    data:
      divisionRows,

    error:
      divisionError,
  } =
    await supabase
      .from("teams")
      .select(`
        owner_id,
        team_name,
        division
      `)
      .eq(
        "season_year",
        currentSeason
      );

  if (
    divisionError
  ) {
    return (
      <main className="page-shell">

        <h1>
          {currentSeason} Playoff Scenarios
        </h1>

        <p>
          {divisionError.message}
        </p>

      </main>
    );
  }

  const divisionByOwner =
    new Map(
      (
        divisionRows ||
        []
      ).map(
        (team) => [
          Number(
            team.owner_id
          ),
          team,
        ]
      )
    );

  // =======================================================
  // LOOKUPS
  // =======================================================

  const ownerMap =
    new Map(
      (
        owners ||
        []
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
  // CURRENT STANDINGS
  // =======================================================

  const standings =
    rankTeams(
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

            const result =
              resultMap.get(
                ownerId
              );

            const divisionRow =
              divisionByOwner.get(
                ownerId
              );

            return {
              ownerId,

              ownerName:
                ownerMap.get(
                  ownerId
                ) ||
                team.ownerName ||
                "Unknown Owner",

              teamName:
                divisionRow
                  ?.team_name ||
                team.team_name ||
                team.teamName ||
                "Unknown Team",

              division:
                divisionRow
                  ?.division ||
                team.division ||
                "No Division",

              wins:
                num(
                  team.wins ??
                    result?.wins
                ),

              losses:
                num(
                  team.losses ??
                    result
                      ?.losses
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
            };
          }
        )
        .filter(
          (team) =>
            team.ownerId >
            0
        )
    );

  // =======================================================
  // CURRENT PLAYOFF FIELD
  // =======================================================

  const currentField =
    buildPlayoffField(
      standings
    );

  const currentSeedMap =
    new Map(
      currentField.seeds.map(
        (team) => [
          team.ownerId,
          team.seed,
        ]
      )
    );

  // =======================================================
  // DIVISION STANDINGS
  // =======================================================

  const divisions =
    groupByDivision(
      standings
    );

  const divisionNames =
    [
      ...divisions.keys(),
    ].filter(
      (division) =>
        division !==
        "No Division"
    );

  // =======================================================
  // COMPLETED GAME LOOKUP
  //
  // This is better than just checking the latest week
  // because some games can be final while others are live.
  // =======================================================

  const completedGameKeys =
    new Set(
      (
        completedCurrentMatchups ||
        []
      ).map(
        gameKey
      )
    );

  // =======================================================
  // REGULAR-SEASON SCHEDULE
  // =======================================================

  const regularGames =
    getRegularGames(
      currentSeasonMatchups
    );

  const regularSeasonEndWeek =
    regularGames.length
      ? Math.max(
          ...regularGames.map(
            (game) =>
              Number(
                game.matchup_period
              )
          )
        )
      : 0;

  const remainingGames =
    regularGames
      .filter(
        (game) => {
          const awayId =
            Number(
              game.away_owner_id
            );

          const homeId =
            Number(
              game.home_owner_id
            );

          if (
            awayId <= 0 ||
            homeId <= 0
          ) {
            return false;
          }

          return (
            !completedGameKeys.has(
              gameKey(
                game
              )
            )
          );
        }
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
  // REMAINING SCHEDULE BY OWNER
  // =======================================================

  const scheduleByOwner =
    new Map();

  for (
    const team of
    standings
  ) {
    scheduleByOwner.set(
      team.ownerId,
      []
    );
  }

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
      scheduleByOwner.has(
        awayId
      )
    ) {
      scheduleByOwner
        .get(
          awayId
        )
        .push({
          week,

          opponentId:
            homeId,

          opponent:
            ownerMap.get(
              homeId
            ) ||
            game.home_team_name ||
            "Unknown",
        });
    }

    if (
      scheduleByOwner.has(
        homeId
      )
    ) {
      scheduleByOwner
        .get(
          homeId
        )
        .push({
          week,

          opponentId:
            awayId,

          opponent:
            ownerMap.get(
              awayId
            ) ||
            game.away_team_name ||
            "Unknown",
        });
    }
  }

  // =======================================================
  // EXACT SCENARIO ENGINE
  //
  // Activates at 4 weeks remaining.
  // =======================================================

  const exactEngineActive =
    divisionNames.length ===
      2 &&
    remainingWeeks.length <=
      4 &&
    remainingGames.length <=
      20;

  const exact =
    exactEngineActive
      ? simulateScenarios({
          standings,
          remainingGames,
        })
      : null;

  // =======================================================
  // WILD CARD RACE
  // =======================================================

  const currentDivisionWinnerIds =
    new Set(
      currentField
        .divisionWinners
        .map(
          (team) =>
            team.ownerId
        )
    );

  const wildCardRace =
    rankTeams(
      standings.filter(
        (team) =>
          !currentDivisionWinnerIds.has(
            team.ownerId
          )
      )
    );

  // =======================================================
  // REFRESH
  //
  // Before exact scenarios: every 30 sec
  // Exact million-scenario engine: every 5 min
  // =======================================================

  const refreshMs =
    exact
      ? 300000
      : 30000;

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

      {/* HERO — SAME STYLE AS OTHER TABS */}

      <section className="owners-hero">

        <div>

          <p className="eyebrow">
            {currentSeason} POSTSEASON RACE
          </p>

          <h1>
            Playoff Scenarios
          </h1>

          <p>
            Division races, wild-card positioning,
            remaining schedules and every team&apos;s
            path to the {currentSeason} Dirty P playoffs.
          </p>

        </div>

        <div className="owners-count">

          <strong>
            4
          </strong>

          <span>
            PLAYOFF TEAMS
          </span>

        </div>

      </section>

      {/* PAGE NAV — SAME STYLE AS OTHER TABS */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          Week {currentWeek} ·{" "}
          {remainingWeeks.length} regular-season{" "}
          {remainingWeeks.length === 1
            ? "week"
            : "weeks"}{" "}
          remaining
        </span>

      </nav>

      {/* =====================================================
          PLAYOFF FORMAT
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              PLAYOFF FORMAT
            </p>

            <h2>
              How Teams Get In
            </h2>

          </div>

          <span>
            Four-team playoff field
          </span>

        </div>

        <div className="h2h-grid">

          <div className="h2h-card">

            <span>
              SEEDS #1 & #2
            </span>

            <strong>
              Division Winners
            </strong>

            <div>
              Each division champion earns an
              automatic playoff berth.
            </div>

          </div>

          <div className="h2h-card">

            <span>
              SEEDS #3 & #4
            </span>

            <strong>
              Wild Cards
            </strong>

            <div>
              The two best remaining records
              qualify after the division winners
              are removed.
            </div>

          </div>

          <div className="h2h-card">

            <span>
              EXACT SCENARIOS
            </span>

            <strong>
              {exact
                ? "Scenario Engine Active"
                : "Activates With 4 Weeks Left"}
            </strong>

            <div>

              {exact
                ? `${exact.totalScenarios.toLocaleString()} remaining W/L combinations are being evaluated.`
                : "Clinching, elimination, win-and-in and seeding scenarios will appear automatically."}

            </div>

          </div>

        </div>

      </section>

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
            Division winners automatically qualify
          </span>

        </div>

        <div className="division-grid">

          {divisionNames.map(
            (division) => {

              const teams =
                divisions.get(
                  division
                ) || [];

              const leader =
                teams[0];

              return (
                <div
                  className="division-card"
                  key={
                    division
                  }
                >

                  <div className="division-title">

                    <h3>
                      {division}
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
                      PF
                    </span>

                  </div>

                  {teams.map(
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
                            {" · "}
                            {gamesBackText(
                              leader,
                              team
                            )}
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

                          {formatPoints(
                            team.pointsFor
                          )}

                        </strong>

                      </div>
                    )
                  )}

                </div>
              );
            }
          )}

        </div>

      </section>

      {/* =====================================================
          WILD CARD RACE
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              SEEDS #3 & #4
            </p>

            <h2>
              Wild Card Race
            </h2>

          </div>

          <span>
            Current division leaders removed
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
                  DIVISION
                </th>

                <th>
                  RECORD
                </th>

                <th>
                  PF
                </th>

                <th>
                  STATUS
                </th>

              </tr>

            </thead>

            <tbody>

              {wildCardRace.map(
                (
                  team,
                  index
                ) => (

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
                      {team.division}
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
                      {formatPoints(
                        team.pointsFor
                      )}
                    </td>

                    <td>

                      {index < 2 ? (
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
                )
              )}

            </tbody>

          </table>

        </div>

      </section>

      {/* =====================================================
          INDIVIDUAL TEAM SCENARIOS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              EVERY TEAM
            </p>

            <h2>
              Paths to the Playoffs
            </h2>

          </div>

          <span>
            Updates automatically from league data
          </span>

        </div>

        <div className="owners-grid">

          {standings.map(
            (team) => {

              const divisionTeams =
                divisions.get(
                  team.division
                ) || [];

              const divisionLeader =
                divisionTeams[0] ||
                null;

              const divisionPosition =
                divisionTeams.findIndex(
                  (item) =>
                    item.ownerId ===
                    team.ownerId
                ) + 1;

              const schedule =
                scheduleByOwner.get(
                  team.ownerId
                ) || [];

              const currentSeed =
                currentSeedMap.get(
                  team.ownerId
                );

              const status =
                getStatus({
                  team,
                  currentField,
                  exact,
                });

              const exactStats =
                exact?.stats?.get(
                  team.ownerId
                );

              const playoffPercent =
                exactStats &&
                exact
                  ? (
                      exactStats
                        .playoffCount /
                      exact.totalScenarios
                    ) *
                    100
                  : null;

              const divisionPercent =
                exactStats &&
                exact
                  ? (
                      exactStats
                        .divisionTitleCount /
                      exact.totalScenarios
                    ) *
                    100
                  : null;

              const nextWinPercent =
                exactStats
                  ?.nextWinScenarios >
                0
                  ? (
                      exactStats
                        .nextWinPlayoffs /
                      exactStats
                        .nextWinScenarios
                    ) *
                    100
                  : null;

              const nextLossPercent =
                exactStats
                  ?.nextLossScenarios >
                0
                  ? (
                      exactStats
                        .nextLossPlayoffs /
                      exactStats
                        .nextLossScenarios
                    ) *
                    100
                  : null;

              const possibleSeeds =
                exactStats
                  ? [
                      1,
                      2,
                      3,
                      4,
                    ].filter(
                      (seed) =>
                        exactStats
                          .seedCounts[
                            seed
                          ] > 0
                    )
                  : [];

              const gamesLeft =
                schedule.length;

              const bestRecord =
                formatRecord(
                  team.wins +
                    gamesLeft,

                  team.losses,

                  team.ties
                );

              const worstRecord =
                formatRecord(
                  team.wins,

                  team.losses +
                    gamesLeft,

                  team.ties
                );

              const scenarioLabel =
                getScenarioLabel({
                  stats:
                    exactStats,

                  exact,

                  gamesLeft,
                });

              const nextGame =
                schedule[0];

              const nextGameText =
                nextGame
                  ? `Week ${nextGame.week} vs. ${nextGame.opponent}`
                  : "Regular season complete";

              const primaryPath =
                divisionPosition ===
                1
                  ? "WIN DIVISION"
                  : "DIVISION TITLE";

              const fallbackPath =
                "WILD CARD";

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
                        {team.division}
                      </p>

                    </div>

                    <div className="owner-title-count">

                      <strong>

                        {currentSeed
                          ? `#${currentSeed}`
                          : "OUT"}

                      </strong>

                      <span>
                        SEED
                      </span>

                    </div>

                  </div>

                  {/* RECORD / DIVISION */}

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
                        CURRENT RECORD
                      </span>

                    </div>

                    <div>

                      <strong>
                        #{divisionPosition ||
                          "—"}
                      </strong>

                      <span>
                        DIVISION POSITION
                      </span>

                    </div>

                  </div>

                  {/* BASIC STATS */}

                  <div className="owner-stats-grid">

                    <div>

                      <strong>
                        {formatPoints(
                          team.pointsFor
                        )}
                      </strong>

                      <span>
                        PF
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

                    <div>

                      <strong>

                        {exact
                          ? formatPercent(
                              playoffPercent
                            )
                          : "—"}

                      </strong>

                      <span>
                        PLAYOFF SCENARIOS
                      </span>

                    </div>

                    <div>

                      <strong>

                        {exact
                          ? formatPercent(
                              divisionPercent
                            )
                          : "—"}

                      </strong>

                      <span>
                        DIVISION SCENARIOS
                      </span>

                    </div>

                  </div>

                  {/* PATHS */}

                  <div className="owner-record">

                    <div>

                      <strong>
                        {primaryPath}
                      </strong>

                      <span>
                        AUTOMATIC PATH
                      </span>

                    </div>

                    <div>

                      <strong>
                        {fallbackPath}
                      </strong>

                      <span>
                        SECONDARY PATH
                      </span>

                    </div>

                  </div>

                  {/* RECORD RANGE */}

                  <div className="owner-record">

                    <div>

                      <strong>
                        {bestRecord}
                      </strong>

                      <span>
                        BEST POSSIBLE RECORD
                      </span>

                    </div>

                    <div>

                      <strong>
                        {worstRecord}
                      </strong>

                      <span>
                        WORST POSSIBLE RECORD
                      </span>

                    </div>

                  </div>

                  {/* EXACT SCENARIOS */}

                  {exact &&
                    exactStats && (
                    <>

                      <div className="owner-stats-grid">

                        <div>

                          <strong>

                            {possibleSeeds.length
                              ? possibleSeeds
                                  .map(
                                    (
                                      seed
                                    ) =>
                                      `#${seed}`
                                  )
                                  .join(
                                    "/"
                                  )
                              : "NONE"}

                          </strong>

                          <span>
                            POSSIBLE SEEDS
                          </span>

                        </div>

                        <div>

                          <strong>
                            {formatPercent(
                              nextWinPercent
                            )}
                          </strong>

                          <span>
                            IF WIN NEXT
                          </span>

                        </div>

                        <div>

                          <strong>
                            {formatPercent(
                              nextLossPercent
                            )}
                          </strong>

                          <span>
                            IF LOSE NEXT
                          </span>

                        </div>

                        <div>

                          <strong>

                            {exactStats
                              .minFutureWinsInPlayoff ===
                            Infinity
                              ? "—"
                              : exactStats
                                  .minFutureWinsInPlayoff}

                          </strong>

                          <span>
                            MIN WINS NEEDED
                          </span>

                        </div>

                      </div>

                    </>
                  )}

                  {/* BOTTOM */}

                  <div className="owner-card-bottom">

                    <span>
                      {nextGameText}
                    </span>

                    <strong>
                      {scenarioLabel}
                    </strong>

                  </div>

                </article>
              );
            }
          )}

        </div>

      </section>

      {/* =====================================================
          REMAINING SCHEDULE
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              ROAD TO THE POSTSEASON
            </p>

            <h2>
              Remaining Schedule
            </h2>

          </div>

          <span>
            Regular season ends Week{" "}
            {regularSeasonEndWeek ||
              "—"}
          </span>

        </div>

        <div className="profile-table-wrap">

          <table className="profile-table">

            <thead>

              <tr>

                <th>
                  OWNER
                </th>

                {remainingWeeks.map(
                  (week) => (
                    <th
                      key={
                        week
                      }
                    >
                      WEEK {week}
                    </th>
                  )
                )}

              </tr>

            </thead>

            <tbody>

              {standings.map(
                (team) => {

                  const schedule =
                    scheduleByOwner.get(
                      team.ownerId
                    ) || [];

                  return (
                    <tr
                      key={
                        team.ownerId
                      }
                    >

                      <td>

                        <strong>
                          {team.ownerName}
                        </strong>

                      </td>

                      {remainingWeeks.map(
                        (week) => {

                          const game =
                            schedule.find(
                              (
                                item
                              ) =>
                                item.week ===
                                week
                            );

                          return (
                            <td
                              key={`${team.ownerId}-${week}`}
                            >

                              {game
                                ? `vs. ${game.opponent}`
                                : "—"}

                            </td>
                          );
                        }
                      )}

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        </div>

      </section>

      {/* FOOTER */}

      <footer className="site-footer">

        <strong>
          Dirty P Fantasy Football
        </strong>

        <span>
          The League Archive · Est. 2014
        </span>

        <p>

          {exact
            ? `${exact.totalScenarios.toLocaleString()} remaining W/L combinations analyzed.`
            : "Exact playoff scenarios activate with four regular-season weeks remaining."}

        </p>

      </footer>

    </main>
  );
}
