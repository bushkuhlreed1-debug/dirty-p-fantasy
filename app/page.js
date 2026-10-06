import Link from "next/link";

import {
  supabase,
} from "../lib/supabase";

import {
  getLeagueData,
} from "../lib/leagueData";

import {
  getEspnLeague,
} from "../lib/espn";

export const dynamic =
  "force-dynamic";


// =========================================================
// ASSIGNED DIRTY P RIVALS
// =========================================================

const ASSIGNED_RIVALS = [
  [
    "Reed Bushkuhl",
    "Austin Lloyd",
  ],

  [
    "Ryan Goodlett",
    "Matthew Aitkens",
  ],

  [
    "Tyler Guenther",
    "Edward Wachtel",
  ],

  [
    "Brent Fleischer",
    "Valentin Almendarez",
  ],

  [
    "Jacob Madden",
    "Cody Stinnett",
  ],
];


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


function normalizeName(
  value = ""
) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]/g,
      ""
    );
}


function formatScore(
  value
) {
  return num(value).toFixed(
    2
  );
}


function formatRecord(
  wins,
  losses,
  ties = 0
) {
  if (num(ties) > 0) {
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


function plural(
  number,
  singular,
  pluralWord
) {
  return Number(number) === 1
    ? singular
    : pluralWord ||
        `${singular}s`;
}


// =========================================================
// ASSIGNED RIVAL CHECK
// =========================================================

function isAssignedRival(
  owner1,
  owner2
) {
  return ASSIGNED_RIVALS.some(
    ([a, b]) =>
      (
        a === owner1 &&
        b === owner2
      ) ||
      (
        a === owner2 &&
        b === owner1
      )
  );
}


// =========================================================
// GAME SIDES
// =========================================================

function getGameSides(
  game,
  ownerMap
) {
  return [
    {
      side:
        "HOME",

      ownerId:
        Number(
          game.home_owner_id
        ),

      ownerName:
        ownerMap.get(
          Number(
            game.home_owner_id
          )
        ) ||
        "Unknown Owner",

      teamName:
        game.home_team_name ||
        "Unknown Team",

      score:
        num(
          game.home_score
        ),
    },

    {
      side:
        "AWAY",

      ownerId:
        Number(
          game.away_owner_id
        ),

      ownerName:
        ownerMap.get(
          Number(
            game.away_owner_id
          )
        ) ||
        "Unknown Owner",

      teamName:
        game.away_team_name ||
        "Unknown Team",

      score:
        num(
          game.away_score
        ),
    },
  ];
}


// =========================================================
// WINNER / LOSER
// =========================================================

function winnerFromGame(
  game,
  ownerMap
) {
  if (!game) {
    return null;
  }

  const sides =
    getGameSides(
      game,
      ownerMap
    );

  const winner =
    String(
      game.winner || ""
    ).toUpperCase();

  if (
    winner === "HOME"
  ) {
    return sides[0];
  }

  if (
    winner === "AWAY"
  ) {
    return sides[1];
  }

  if (
    sides[0].score ===
    sides[1].score
  ) {
    return null;
  }

  return [...sides].sort(
    (a, b) =>
      b.score -
      a.score
  )[0];
}


function loserFromGame(
  game,
  ownerMap
) {
  if (!game) {
    return null;
  }

  const winner =
    winnerFromGame(
      game,
      ownerMap
    );

  if (!winner) {
    return null;
  }

  return getGameSides(
    game,
    ownerMap
  ).find(
    (side) =>
      side.ownerId !==
      winner.ownerId
  );
}


// =========================================================
// HEAD TO HEAD SERIES
// =========================================================

function getSeries(
  allGames,
  owner1Id,
  owner2Id
) {
  const games =
    allGames.filter(
      (game) => {
        const home =
          Number(
            game.home_owner_id
          );

        const away =
          Number(
            game.away_owner_id
          );

        return (
          (
            home ===
              owner1Id &&
            away ===
              owner2Id
          ) ||
          (
            home ===
              owner2Id &&
            away ===
              owner1Id
          )
        );
      }
    );

  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  for (
    const game of games
  ) {
    const home =
      Number(
        game.home_owner_id
      );

    const away =
      Number(
        game.away_owner_id
      );

    const homeScore =
      num(
        game.home_score
      );

    const awayScore =
      num(
        game.away_score
      );

    let winnerId =
      null;

    const winner =
      String(
        game.winner || ""
      ).toUpperCase();

    if (
      winner === "HOME"
    ) {
      winnerId = home;
    } else if (
      winner === "AWAY"
    ) {
      winnerId = away;
    } else if (
      homeScore >
      awayScore
    ) {
      winnerId = home;
    } else if (
      awayScore >
      homeScore
    ) {
      winnerId = away;
    }

    if (
      winnerId ===
      owner1Id
    ) {
      owner1Wins += 1;
    } else if (
      winnerId ===
      owner2Id
    ) {
      owner2Wins += 1;
    } else {
      ties += 1;
    }
  }

  return {
    games:
      games.length,

    owner1Wins,

    owner2Wins,

    ties,
  };
}


// =========================================================
// SERIES SUMMARY
// =========================================================

function getSeriesSummary({
  series,
  owner1Name,
  owner2Name,
}) {
  if (
    !series ||
    series.games === 0
  ) {
    return (
      "First recorded meeting."
    );
  }

  if (
    series.owner1Wins >
    series.owner2Wins
  ) {
    return `${owner1Name} leads the all-time series ${formatRecord(
      series.owner1Wins,
      series.owner2Wins,
      series.ties
    )}.`;
  }

  if (
    series.owner2Wins >
    series.owner1Wins
  ) {
    return `${owner2Name} leads the all-time series ${formatRecord(
      series.owner2Wins,
      series.owner1Wins,
      series.ties
    )}.`;
  }

  return `The all-time series is tied ${formatRecord(
    series.owner1Wins,
    series.owner2Wins,
    series.ties
  )}.`;
}


// =========================================================
// CURRENT SEASON STREAKS
// =========================================================

function buildCurrentStreaks(
  completedGames,
  ownerMap
) {
  const chronological =
    [...completedGames].sort(
      (a, b) =>
        Number(
          a.matchup_period
        ) -
        Number(
          b.matchup_period
        )
    );

  const ownerResults =
    new Map();

  for (
    const game of
    chronological
  ) {
    const winner =
      winnerFromGame(
        game,
        ownerMap
      );

    const loser =
      loserFromGame(
        game,
        ownerMap
      );

    const sides =
      getGameSides(
        game,
        ownerMap
      );

    for (
      const side of sides
    ) {
      if (
        !ownerResults.has(
          side.ownerId
        )
      ) {
        ownerResults.set(
          side.ownerId,
          []
        );
      }

      let result =
        "T";

      if (
        winner &&
        winner.ownerId ===
          side.ownerId
      ) {
        result = "W";
      } else if (
        loser &&
        loser.ownerId ===
          side.ownerId
      ) {
        result = "L";
      }

      ownerResults
        .get(
          side.ownerId
        )
        .push(result);
    }
  }

  const streakMap =
    new Map();

  for (
    const [
      ownerId,
      results,
    ] of ownerResults.entries()
  ) {
    if (
      results.length === 0
    ) {
      continue;
    }

    const currentResult =
      results[
        results.length - 1
      ];

    if (
      currentResult === "T"
    ) {
      continue;
    }

    let count = 0;

    for (
      let index =
        results.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (
        results[index] ===
        currentResult
      ) {
        count += 1;
      } else {
        break;
      }
    }

    streakMap.set(
      ownerId,
      {
        type:
          currentResult,

        count,
      }
    );
  }

  return streakMap;
}


// =========================================================
// PAGE
// =========================================================

export default async function Home() {
  // =======================================================
  // LOAD LIVE + HISTORICAL DATA
  // =======================================================

  let leagueData;
  let espnLeague;

  try {
    [
      leagueData,
      espnLeague,
    ] =
      await Promise.all([
        getLeagueData(),
        getEspnLeague(),
      ]);
  } catch (error) {
    return (
      <main className="page-shell">

        <h1>
          Dirty P Fantasy Football
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

    currentSeasonMatchups,

    completedCurrentMatchups,

    matchups,

    unmatchedEspnOwners,
  } =
    leagueData;


  // =======================================================
  // DEFENDING CHAMPION
  // =======================================================

  const {
    data:
      defendingSeasonData,
  } =
    await supabase
      .from("seasons")
      .select(`
        year,
        championship_score,
        champion:champion_owner_id(name),
        runner_up:runner_up_owner_id(name)
      `)
      .lt(
        "year",
        currentSeason
      )
      .order(
        "year",
        {
          ascending:
            false,
        }
      )
      .limit(1);


  const defendingSeason =
    defendingSeasonData?.[0] ||
    null;


  // =======================================================
  // OWNER LOOKUPS
  // =======================================================

  const ownerMap =
    new Map(
      owners.map(
        (owner) => [
          Number(
            owner.id
          ),
          owner.name,
        ]
      )
    );


  const ownerByName =
    new Map(
      owners.map(
        (owner) => [
          normalizeName(
            owner.name
          ),
          owner,
        ]
      )
    );


  // =======================================================
  // MAP ESPN TEAM ID -> SUPABASE OWNER
  // =======================================================

  const currentTeamByEspnId =
    new Map();

  for (
    const team of
    currentTeams || []
  ) {
    const espnTeamId =
      Number(
        team.espnTeamId ??
        team.espn_team_id
      );

    if (
      Number.isFinite(
        espnTeamId
      ) &&
      espnTeamId > 0
    ) {
      currentTeamByEspnId.set(
        espnTeamId,
        team
      );
    }
  }


  // =======================================================
  // ESPN STANDINGS
  //
  // IMPORTANT:
  // WE USE ESPN PLAYOFF SEED.
  // WE DO NOT RECREATE ESPN TIEBREAKERS.
  // =======================================================

  const standings =
    (espnLeague.teams || [])
      .map(
        (espnTeam) => {
          const espnTeamId =
            Number(
              espnTeam.espnTeamId
            );

          const mappedTeam =
            currentTeamByEspnId.get(
              espnTeamId
            );


          let owner =
            mappedTeam
              ? owners.find(
                  (item) =>
                    Number(
                      item.id
                    ) ===
                    Number(
                      mappedTeam.owner_id
                    )
                )
              : null;


          if (!owner) {
            owner =
              ownerByName.get(
                normalizeName(
                  espnTeam.ownerName
                )
              ) ||
              null;
          }


          const seed =
            num(
              espnTeam.playoffSeed
            );


          return {
            espnTeamId,

            ownerId:
              Number(
                owner?.id ||
                mappedTeam?.owner_id ||
                0
              ),

            ownerName:
              owner?.name ||
              espnTeam.ownerName ||
              "Unknown Owner",

            teamName:
              espnTeam.teamName ||
              mappedTeam?.team_name ||
              "Unknown Team",

            wins:
              num(
                espnTeam.wins
              ),

            losses:
              num(
                espnTeam.losses
              ),

            ties:
              num(
                espnTeam.ties
              ),

            pointsFor:
              num(
                espnTeam.pointsFor
              ),

            pointsAgainst:
              num(
                espnTeam.pointsAgainst
              ),

            playoffSeed:
              seed,
          };
        }
      )
      .filter(
        (team) =>
          team.ownerId > 0
      )
      .sort(
        (a, b) => {
          const seedA =
            a.playoffSeed > 0
              ? a.playoffSeed
              : 999;

          const seedB =
            b.playoffSeed > 0
              ? b.playoffSeed
              : 999;

          return (
            seedA -
            seedB
          );
        }
      );


  const standingsByOwner =
    new Map(
      standings.map(
        (team) => [
          team.ownerId,
          team,
        ]
      )
    );


  const playoffTeamCount =
    Number(
      espnLeague
        .playoffTeamCount ||
        leagueData
          .playoffTeamCount ||
        4
    );


  // =======================================================
  // PLAYOFF PICTURE
  // =======================================================

  const playoffTeams =
    standings.filter(
      (team) =>
        team.playoffSeed >
          0 &&
        team.playoffSeed <=
          playoffTeamCount
    );


  const bubbleTeams =
    standings
      .filter(
        (team) =>
          team.playoffSeed >
          playoffTeamCount
      )
      .slice(0, 2);


  // =======================================================
  // LATEST COMPLETED WEEK
  // =======================================================

  const completedWeeks =
    completedCurrentMatchups
      .map(
        (game) =>
          Number(
            game.matchup_period
          )
      )
      .filter(
        (week) =>
          Number.isFinite(
            week
          ) &&
          week > 0
      );


  const latestCompletedWeek =
    completedWeeks.length
      ? Math.max(
          ...completedWeeks
        )
      : 0;


  const latestWeekGames =
    completedCurrentMatchups.filter(
      (game) =>
        Number(
          game.matchup_period
        ) ===
        latestCompletedWeek
    );


  // =======================================================
  // CURRENT STREAKS
  // =======================================================

  const streakMap =
    buildCurrentStreaks(
      completedCurrentMatchups,
      ownerMap
    );


  // =======================================================
  // AROUND THE LEAGUE
  // =======================================================

  const aroundLeague =
    [];


  if (
    latestWeekGames.length >
    0
  ) {
    const weekSides =
      latestWeekGames.flatMap(
        (game) =>
          getGameSides(
            game,
            ownerMap
          ).map(
            (side) => ({
              ...side,
              game,
            })
          )
      );


    // -----------------------------------------------------
    // HIGH SCORE
    // -----------------------------------------------------

    const highestScore =
      [...weekSides].sort(
        (a, b) =>
          b.score -
          a.score
      )[0];


    if (highestScore) {
      aroundLeague.push({
        label:
          "SCORE OF THE WEEK",

        headline:
          `${highestScore.ownerName} led the league`,

        text:
          `${highestScore.teamName} scored ${formatScore(
            highestScore.score
          )}, the highest total of Week ${latestCompletedWeek}.`,
      });
    }


    // -----------------------------------------------------
    // CLOSEST GAME
    // -----------------------------------------------------

    const decidedGames =
      latestWeekGames
        .map(
          (game) => ({
            game,

            margin:
              Math.abs(
                num(
                  game.home_score
                ) -
                num(
                  game.away_score
                )
              ),
          })
        )
        .filter(
          (item) =>
            item.margin > 0
        );


    const closestGame =
      [...decidedGames].sort(
        (a, b) =>
          a.margin -
          b.margin
      )[0];


    if (closestGame) {
      const winner =
        winnerFromGame(
          closestGame.game,
          ownerMap
        );

      const loser =
        loserFromGame(
          closestGame.game,
          ownerMap
        );

      if (
        winner &&
        loser
      ) {
        aroundLeague.push({
          label:
            "CLOSEST CALL",

          headline:
            `${winner.ownerName} survived`,

          text:
            `${winner.ownerName} edged ${loser.ownerName} by only ${formatScore(
              closestGame.margin
            )} points.`,
        });
      }
    }


    // -----------------------------------------------------
    // BIGGEST WIN
    // -----------------------------------------------------

    const biggestWin =
      [...decidedGames].sort(
        (a, b) =>
          b.margin -
          a.margin
      )[0];


    if (
      biggestWin &&
      biggestWin !==
        closestGame
    ) {
      const winner =
        winnerFromGame(
          biggestWin.game,
          ownerMap
        );

      const loser =
        loserFromGame(
          biggestWin.game,
          ownerMap
        );

      if (
        winner &&
        loser
      ) {
        aroundLeague.push({
          label:
            "BIGGEST STATEMENT",

          headline:
            `${winner.ownerName} left no doubt`,

          text:
            `${winner.ownerName} beat ${loser.ownerName} by ${formatScore(
              biggestWin.margin
            )}, the biggest margin of Week ${latestCompletedWeek}.`,
        });
      }
    }


    // -----------------------------------------------------
    // UNDEFEATED TEAM
    // -----------------------------------------------------

    const undefeated =
      standings.filter(
        (team) =>
          team.wins > 0 &&
          team.losses === 0
      );


    if (
      undefeated.length === 1
    ) {
      const team =
        undefeated[0];

      aroundLeague.push({
        label:
          "STILL PERFECT",

        headline:
          `${team.ownerName} remains unbeaten`,

        text:
          `${team.teamName} enters the next week at ${formatRecord(
            team.wins,
            team.losses,
            team.ties
          )} and remains the league's only undefeated team.`,
      });
    } else if (
      undefeated.length > 1
    ) {
      aroundLeague.push({
        label:
          "STILL PERFECT",

        headline:
          `${undefeated.length} undefeated teams remain`,

        text:
          `${undefeated
            .map(
              (team) =>
                team.ownerName
            )
            .join(
              ", "
            )} are still without a loss.`,
      });
    }


    // -----------------------------------------------------
    // HOTTEST STREAK
    // -----------------------------------------------------

    const hottest =
      [...streakMap.entries()]
        .map(
          ([
            ownerId,
            streak,
          ]) => ({
            ownerId,
            ownerName:
              ownerMap.get(
                ownerId
              ) ||
              "Unknown",

            ...streak,
          })
        )
        .filter(
          (streak) =>
            streak.type ===
              "W" &&
            streak.count >= 2
        )
        .sort(
          (a, b) =>
            b.count -
            a.count
        )[0];


    if (hottest) {
      aroundLeague.push({
        label:
          "HEATING UP",

        headline:
          `${hottest.ownerName} has won ${hottest.count} straight`,

        text:
          `${hottest.ownerName} carries the league's longest active winning streak into the next matchup.`,
      });
    }


    // -----------------------------------------------------
    // ASSIGNED-RIVAL RESULT
    // -----------------------------------------------------

    const rivalryResult =
      latestWeekGames.find(
        (game) => {
          const sides =
            getGameSides(
              game,
              ownerMap
            );

          return isAssignedRival(
            sides[0]
              .ownerName,
            sides[1]
              .ownerName
          );
        }
      );


    if (rivalryResult) {
      const winner =
        winnerFromGame(
          rivalryResult,
          ownerMap
        );

      const loser =
        loserFromGame(
          rivalryResult,
          ownerMap
        );

      if (
        winner &&
        loser
      ) {
        aroundLeague.push({
          label:
            latestCompletedWeek ===
            11
              ? "RIVALRY WEEK"
              : "ASSIGNED RIVALS",

          headline:
            `${winner.ownerName} earned the bragging rights`,

          text:
            `${winner.ownerName} beat assigned rival ${loser.ownerName} in Week ${latestCompletedWeek}.`,
        });
      }
    }
  }


  const aroundLeagueStories =
    aroundLeague.slice(
      0,
      6
    );


  // =======================================================
  // DETERMINE PREVIEW WEEK
  // =======================================================

  const futureWeeks =
    [
      ...new Set(
        currentSeasonMatchups
          .filter(
            (game) =>
              game.is_playoff !==
                true &&
              game.is_consolation !==
                true &&
              Number(
                game.matchup_period
              ) >
                latestCompletedWeek
          )
          .map(
            (game) =>
              Number(
                game.matchup_period
              )
          )
          .filter(
            Number.isFinite
          )
      ),
    ].sort(
      (a, b) =>
        a - b
    );


  const previewWeek =
    futureWeeks[0] ||
    Math.max(
      Number(
        currentWeek || 1
      ),
      latestCompletedWeek +
        1
    );


  const previewGames =
    currentSeasonMatchups.filter(
      (game) =>
        Number(
          game.matchup_period
        ) ===
          previewWeek &&
        game.is_playoff !==
          true &&
        game.is_consolation !==
          true
    );


  // =======================================================
  // BUILD PREVIEW MATCHUP DATA
  // =======================================================

  const previewMatchups =
    previewGames.map(
      (game) => {
        const homeId =
          Number(
            game.home_owner_id
          );

        const awayId =
          Number(
            game.away_owner_id
          );


        const homeName =
          ownerMap.get(
            homeId
          ) ||
          "Unknown Owner";


        const awayName =
          ownerMap.get(
            awayId
          ) ||
          "Unknown Owner";


        const homeStanding =
          standingsByOwner.get(
            homeId
          ) ||
          null;


        const awayStanding =
          standingsByOwner.get(
            awayId
          ) ||
          null;


        const series =
          getSeries(
            matchups,
            awayId,
            homeId
          );


        const assignedRivals =
          isAssignedRival(
            awayName,
            homeName
          );


        const rivalryWeek =
          previewWeek === 11;


        const homeStreak =
          streakMap.get(
            homeId
          );


        const awayStreak =
          streakMap.get(
            awayId
          );


        // -------------------------------------------------
        // GAME OF THE WEEK SCORE
        // -------------------------------------------------

        let hypeScore = 0;


        // Assigned rivalry
        if (
          assignedRivals
        ) {
          hypeScore += 20;
        }


        // Undefeated team
        if (
          (
            homeStanding?.wins >
              0 &&
            homeStanding
              ?.losses === 0
          ) ||
          (
            awayStanding?.wins >
              0 &&
            awayStanding
              ?.losses === 0
          )
        ) {
          hypeScore += 10;
        }


        // Both teams in playoff position
        if (
          homeStanding
            ?.playoffSeed <=
            playoffTeamCount &&
          awayStanding
            ?.playoffSeed <=
            playoffTeamCount
        ) {
          hypeScore += 15;
        }


        // At least one playoff team
        if (
          homeStanding
            ?.playoffSeed <=
            playoffTeamCount ||
          awayStanding
            ?.playoffSeed <=
            playoffTeamCount
        ) {
          hypeScore += 5;
        }


        // Seed closeness
        if (
          homeStanding &&
          awayStanding
        ) {
          hypeScore +=
            Math.max(
              0,
              8 -
                Math.abs(
                  homeStanding
                    .playoffSeed -
                    awayStanding
                      .playoffSeed
                )
            );
        }


        // Better teams = more stakes
        hypeScore +=
          num(
            homeStanding?.wins
          ) +
          num(
            awayStanding?.wins
          );


        // Close historical series
        hypeScore +=
          Math.max(
            0,
            5 -
              Math.abs(
                series.owner1Wins -
                  series.owner2Wins
              )
          );


        return {
          game,

          homeId,
          awayId,

          homeName,
          awayName,

          homeStanding,
          awayStanding,

          series,

          assignedRivals,

          rivalryWeek,

          homeStreak,
          awayStreak,

          hypeScore,
        };
      }
    );


  // =======================================================
  // ASSIGNED RIVALS PLAYING THIS WEEK
  // =======================================================

  const assignedRivalGames =
    previewMatchups.filter(
      (matchup) =>
        matchup.assignedRivals
    );


  // =======================================================
  // GAME OF THE WEEK
  // =======================================================

  const rankedMatchups =
    [...previewMatchups].sort(
      (a, b) =>
        b.hypeScore -
        a.hypeScore
    );


  const gameOfTheWeek =
    rankedMatchups[0] ||
    null;


  // =======================================================
  // MATCHUP ANALYSIS
  // =======================================================

  function buildAnalysis(
    matchup
  ) {
    const {
      awayName,
      homeName,

      awayStanding,
      homeStanding,

      awayStreak,
      homeStreak,

      series,

      assignedRivals,
      rivalryWeek,
    } =
      matchup;


    const sentences =
      [];


    // -----------------------------------------------------
    // RIVALRY CONTEXT
    // -----------------------------------------------------

    if (
      assignedRivals
    ) {
      if (
        rivalryWeek
      ) {
        sentences.push(
          `${awayName} and ${homeName} meet in their official Rivalry Week matchup.`
        );
      } else {
        sentences.push(
          `${awayName} and ${homeName} are assigned rivals, so there are bragging rights on the line even though this is not Rivalry Week.`
        );
      }
    }


    // -----------------------------------------------------
    // RECORD / STANDINGS CONTEXT
    // -----------------------------------------------------

    if (
      awayStanding &&
      homeStanding
    ) {
      const awayPlayoff =
        awayStanding
          .playoffSeed <=
        playoffTeamCount;

      const homePlayoff =
        homeStanding
          .playoffSeed <=
        playoffTeamCount;


      if (
        awayStanding.losses ===
          0 &&
        awayStanding.wins >
          0
      ) {
        sentences.push(
          `${awayName} enters at ${formatRecord(
            awayStanding.wins,
            awayStanding.losses,
            awayStanding.ties
          )} and puts an undefeated start on the line.`
        );
      } else if (
        homeStanding.losses ===
          0 &&
        homeStanding.wins >
          0
      ) {
        sentences.push(
          `${homeName} enters at ${formatRecord(
            homeStanding.wins,
            homeStanding.losses,
            homeStanding.ties
          )} and puts an undefeated start on the line.`
        );
      } else if (
        awayPlayoff &&
        homePlayoff
      ) {
        sentences.push(
          `Both teams currently sit inside the playoff picture, with ${awayName} at Seed #${awayStanding.playoffSeed} and ${homeName} at Seed #${homeStanding.playoffSeed}.`
        );
      } else if (
        awayPlayoff &&
        !homePlayoff
      ) {
        sentences.push(
          `${awayName} currently holds Seed #${awayStanding.playoffSeed}, while ${homeName} has a chance to make up ground in the playoff race.`
        );
      } else if (
        homePlayoff &&
        !awayPlayoff
      ) {
        sentences.push(
          `${homeName} currently holds Seed #${homeStanding.playoffSeed}, while ${awayName} has a chance to make up ground in the playoff race.`
        );
      } else {
        sentences.push(
          `${awayName} enters ${formatRecord(
            awayStanding.wins,
            awayStanding.losses,
            awayStanding.ties
          )}, while ${homeName} is ${formatRecord(
            homeStanding.wins,
            homeStanding.losses,
            homeStanding.ties
          )}.`
        );
      }
    }


    // -----------------------------------------------------
    // CURRENT FORM
    // -----------------------------------------------------

    const streakNotes =
      [];


    if (
      awayStreak &&
      awayStreak.count >= 2
    ) {
      streakNotes.push(
        `${awayName} has ${
          awayStreak.type ===
          "W"
            ? "won"
            : "lost"
        } ${awayStreak.count} straight`
      );
    }


    if (
      homeStreak &&
      homeStreak.count >= 2
    ) {
      streakNotes.push(
        `${homeName} has ${
          homeStreak.type ===
          "W"
            ? "won"
            : "lost"
        } ${homeStreak.count} straight`
      );
    }


    if (
      streakNotes.length >
      0
    ) {
      sentences.push(
        `${streakNotes.join(
          ", while "
        )}.`
      );
    }


    // -----------------------------------------------------
    // HISTORICAL MATCHUP
    // -----------------------------------------------------

    if (
      series.games > 0
    ) {
      sentences.push(
        getSeriesSummary({
          series,

          owner1Name:
            awayName,

          owner2Name:
            homeName,
        })
      );
    }


    // -----------------------------------------------------
    // SCORING CONTEXT
    // -----------------------------------------------------

    if (
      sentences.length <
        3 &&
      awayStanding &&
      homeStanding
    ) {
      const betterScoring =
        awayStanding
          .pointsFor >
        homeStanding
          .pointsFor
          ? awayName
          : homeName;


      const pointsDifference =
        Math.abs(
          awayStanding
            .pointsFor -
            homeStanding
              .pointsFor
        );


      if (
        pointsDifference >=
        30
      ) {
        sentences.push(
          `${betterScoring} has been the higher-scoring team so far this season.`
        );
      }
    }


    return sentences
      .slice(0, 3)
      .join(" ");
  }


  // =======================================================
  // GAME OF WEEK "WHAT'S AT STAKE"
  // =======================================================

  function getStakes(
    matchup
  ) {
    if (!matchup) {
      return [];
    }

    const stakes =
      [];


    if (
      matchup.assignedRivals
    ) {
      stakes.push(
        matchup.rivalryWeek
          ? "Rivalry Week bragging rights"
          : "Assigned-rival bragging rights"
      );
    }


    if (
      matchup.awayStanding
        ?.losses === 0 ||
      matchup.homeStanding
        ?.losses === 0
    ) {
      stakes.push(
        "Undefeated season"
      );
    }


    const awayPlayoff =
      matchup.awayStanding
        ?.playoffSeed <=
      playoffTeamCount;


    const homePlayoff =
      matchup.homeStanding
        ?.playoffSeed <=
      playoffTeamCount;


    if (
      awayPlayoff ||
      homePlayoff
    ) {
      stakes.push(
        "Playoff positioning"
      );
    }


    if (
      matchup.series.games >
      0
    ) {
      stakes.push(
        "All-time series"
      );
    }


    return stakes.slice(
      0,
      4
    );
  }


  const gameOfWeekStakes =
    getStakes(
      gameOfTheWeek
    );


  // =======================================================
  // PAGE
  // =======================================================

  return (
    <main className="page-shell">

      {/* ===================================================
          HEADER
          =================================================== */}

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


      {/* ===================================================
          HERO
          =================================================== */}

      <section className="hero">

        <div className="hero-main">

          <p className="eyebrow">
            THE LEAGUE ARCHIVE · EST. 2014
          </p>

          <h1>
            Dirty P Fantasy Football
          </h1>

          <p className="hero-copy">
            Championships, rivalries,
            heartbreak, dominance and
            questionable fantasy decisions.
          </p>

        </div>

      </section>


      {/* ===================================================
          DEFENDING CHAMPION
          =================================================== */}

      {defendingSeason && (

        <section className="champion-strip">

          <div className="champion-strip-title">

            <span className="card-label">
              DEFENDING CHAMPION
            </span>

            <strong>
              {defendingSeason
                .champion
                ?.name ||
                "Unknown"}
            </strong>

          </div>


          <div className="champion-strip-result">

            <span>
              {defendingSeason.year} Champion
            </span>

            <span className="champion-divider">
              •
            </span>

            <span>

              defeated{" "}

              {defendingSeason
                .runner_up
                ?.name ||
                "Runner-Up"}

            </span>


            {defendingSeason
              .championship_score && (

              <strong>
                {defendingSeason.championship_score}
              </strong>

            )}

          </div>

        </section>

      )}


      {/* ===================================================
          NAVIGATION — NO SEASONS TAB
          =================================================== */}

      <section className="quick-links">

        <Link href="/owners">
          Owners
        </Link>

        <Link href="/champions">
          Champions
        </Link>

        <Link href="/records">
          Records
        </Link>

        <Link href="/head-to-head">
          Head-to-Head
        </Link>

        <Link href="/rivalry-week">
          Rivalry Week
        </Link>

        <Link href="/goat">
          GOAT Rankings
        </Link>

      </section>


      {/* ===================================================
          MAPPING WARNING
          =================================================== */}

      {unmatchedEspnOwners
        ?.length > 0 && (

        <section className="section-block">

          <div className="league-warning">

            <strong>
              ESPN OWNER MATCH WARNING
            </strong>

            <span>
              {unmatchedEspnOwners
                .map(
                  (owner) =>
                    owner.ownerName
                )
                .join(", ")}
            </span>

          </div>

        </section>

      )}


      {/* ===================================================
          CURRENT STANDINGS
          =================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              {currentSeason} SEASON
            </p>

            <h2>
              Current Standings
            </h2>

          </div>

          <span>
            ESPN Playoff Seeding · Through Week{" "}
            {latestCompletedWeek ||
              currentWeek}
          </span>

        </div>


        <div className="profile-table-wrap">

          <table className="profile-table home-standings-table">

            <thead>

              <tr>

                <th>
                  SEED
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
                  PF
                </th>

                <th>
                  PA
                </th>

                <th>
                  STATUS
                </th>

              </tr>

            </thead>


            <tbody>

              {standings.map(
                (team) => {

                  const inPlayoffs =
                    team.playoffSeed >
                      0 &&
                    team.playoffSeed <=
                      playoffTeamCount;


                  return (

                    <tr
                      key={
                        team.ownerId
                      }
                    >

                      <td>

                        <strong className="standings-seed">
                          #{team.playoffSeed}
                        </strong>

                      </td>


                      <td>

                        <Link
                          href={`/owners/${team.ownerId}`}
                        >

                          <strong>
                            {team.ownerName}
                          </strong>

                        </Link>

                      </td>


                      <td>
                        {team.teamName}
                      </td>


                      <td>

                        {formatRecord(
                          team.wins,
                          team.losses,
                          team.ties
                        )}

                      </td>


                      <td>

                        {formatScore(
                          team.pointsFor
                        )}

                      </td>


                      <td>

                        {formatScore(
                          team.pointsAgainst
                        )}

                      </td>


                      <td>

                        {inPlayoffs ? (

                          <span className="playoff-badge">
                            PLAYOFF
                          </span>

                        ) : (

                          <span className="standings-out">
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


      {/* ===================================================
          PLAYOFF PICTURE
          =================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              POSTSEASON RACE
            </p>

            <h2>
              Playoff Picture
            </h2>

          </div>

          <span>
            ESPN&apos;s Current Top {playoffTeamCount}
          </span>

        </div>


        <div className="playoff-picture-grid">

          {playoffTeams.map(
            (team) => (

              <Link
                href={`/owners/${team.ownerId}`}
                className="playoff-picture-card"
                key={
                  team.ownerId
                }
              >

                <div className="playoff-picture-seed">

                  <span>
                    SEED
                  </span>

                  <strong>
                    #{team.playoffSeed}
                  </strong>

                </div>


                <div className="playoff-picture-team">

                  <strong>
                    {team.ownerName}
                  </strong>

                  <span>
                    {team.teamName}
                  </span>

                </div>


                <div className="playoff-picture-record">

                  <strong>

                    {formatRecord(
                      team.wins,
                      team.losses,
                      team.ties
                    )}

                  </strong>

                  <span>
                    {formatScore(
                      team.pointsFor
                    )}{" "}
                    PF
                  </span>

                </div>

              </Link>

            )
          )}

        </div>


        {bubbleTeams.length >
          0 && (

          <div className="playoff-bubble">

            <strong>
              ON THE BUBBLE
            </strong>

            <span>

              {bubbleTeams
                .map(
                  (team) =>
                    `#${team.playoffSeed} ${team.ownerName} (${formatRecord(
                      team.wins,
                      team.losses,
                      team.ties
                    )})`
                )
                .join(" · ")}

            </span>

          </div>

        )}

      </section>


      {/* ===================================================
          AROUND THE LEAGUE
          =================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              WEEK {latestCompletedWeek || currentWeek}
            </p>

            <h2>
              Around the League
            </h2>

          </div>

          <span>
            Stories, Streaks & Takeaways
          </span>

        </div>


        {aroundLeagueStories.length >
        0 ? (

          <div className="league-news">

            {aroundLeagueStories.map(
              (
                story,
                index
              ) => (

                <article
                  className="league-news-item"
                  key={`${story.label}-${index}`}
                >

                  <div className="league-news-number">
                    {String(
                      index + 1
                    ).padStart(
                      2,
                      "0"
                    )}
                  </div>


                  <div className="league-news-copy">

                    <span>
                      {story.label}
                    </span>

                    <h3>
                      {story.headline}
                    </h3>

                    <p>
                      {story.text}
                    </p>

                  </div>

                </article>

              )
            )}

          </div>

        ) : (

          <div className="current-panel">

            <div className="empty-current-state">

              <strong>
                Around the League will begin after the first completed week.
              </strong>

            </div>

          </div>

        )}

      </section>


      {/* ===================================================
          WEEK PREVIEW
          =================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              THIS WEEK · WEEK {previewWeek}
            </p>

            <h2>
              Week {previewWeek} Preview
            </h2>

          </div>

          <span>

            {assignedRivalGames.length >
            0
              ? `${assignedRivalGames.length} Assigned-Rival ${plural(
                  assignedRivalGames.length,
                  "Matchup"
                )}`
              : "No Assigned Rivals This Week"}

          </span>

        </div>


        {/* ===============================================
            ASSIGNED RIVALS PLAYING THIS WEEK
            =============================================== */}

        {assignedRivalGames.length >
          0 && (

          <div className="assigned-rivals-strip">

            <strong>

              {previewWeek ===
              11
                ? "RIVALRY WEEK MATCHUPS"
                : "ASSIGNED RIVALS PLAYING THIS WEEK"}

            </strong>


            <div>

              {assignedRivalGames.map(
                (matchup) => (

                  <span
                    key={`${matchup.awayId}-${matchup.homeId}`}
                  >

                    {matchup.awayName}
                    {" vs. "}
                    {matchup.homeName}

                  </span>

                )
              )}

            </div>

          </div>

        )}


        {/* ===============================================
            GAME OF THE WEEK
            =============================================== */}

        {gameOfTheWeek ? (

          <article className="game-of-week">

            <div className="game-of-week-top">

              <div>

                <span className="game-of-week-label">
                  GAME OF THE WEEK
                </span>

                {gameOfTheWeek
                  .assignedRivals && (

                  <span className="assigned-rival-badge">

                    {gameOfTheWeek
                      .rivalryWeek
                      ? "RIVALRY WEEK"
                      : "ASSIGNED RIVALS"}

                  </span>

                )}

              </div>

              <strong>
                WEEK {previewWeek}
              </strong>

            </div>


            <div className="game-of-week-matchup">

              <div className="game-of-week-team">

                <span>
                  AWAY
                </span>

                <h3>
                  {gameOfTheWeek.awayName}
                </h3>

                <p>
                  {gameOfTheWeek
                    .awayStanding
                    ?.teamName ||
                    gameOfTheWeek
                      .game
                      .away_team_name}
                </p>

                <strong>

                  {gameOfTheWeek
                    .awayStanding
                    ? formatRecord(
                        gameOfTheWeek
                          .awayStanding
                          .wins,

                        gameOfTheWeek
                          .awayStanding
                          .losses,

                        gameOfTheWeek
                          .awayStanding
                          .ties
                      )
                    : "—"}

                </strong>

                <small>

                  Seed #
                  {gameOfTheWeek
                    .awayStanding
                    ?.playoffSeed ||
                    "—"}

                </small>

              </div>


              <div className="game-of-week-vs">

                <span>
                  VS
                </span>

              </div>


              <div className="game-of-week-team right">

                <span>
                  HOME
                </span>

                <h3>
                  {gameOfTheWeek.homeName}
                </h3>

                <p>
                  {gameOfTheWeek
                    .homeStanding
                    ?.teamName ||
                    gameOfTheWeek
                      .game
                      .home_team_name}
                </p>

                <strong>

                  {gameOfTheWeek
                    .homeStanding
                    ? formatRecord(
                        gameOfTheWeek
                          .homeStanding
                          .wins,

                        gameOfTheWeek
                          .homeStanding
                          .losses,

                        gameOfTheWeek
                          .homeStanding
                          .ties
                      )
                    : "—"}

                </strong>

                <small>

                  Seed #
                  {gameOfTheWeek
                    .homeStanding
                    ?.playoffSeed ||
                    "—"}

                </small>

              </div>

            </div>


            <div className="game-of-week-analysis">

              <span>
                MATCHUP ANALYSIS
              </span>

              <p>
                {buildAnalysis(
                  gameOfTheWeek
                )}
              </p>

            </div>


            {gameOfWeekStakes.length >
              0 && (

              <div className="game-of-week-stakes">

                <strong>
                  WHAT&apos;S AT STAKE
                </strong>

                <div>

                  {gameOfWeekStakes.map(
                    (stake) => (

                      <span
                        key={stake}
                      >
                        {stake}
                      </span>

                    )
                  )}

                </div>

              </div>

            )}

          </article>

        ) : (

          <div className="current-panel">

            <div className="empty-current-state">

              <strong>
                No Week {previewWeek} matchup data yet.
              </strong>

            </div>

          </div>

        )}


        {/* ===============================================
            REST OF THE MATCHUPS
            =============================================== */}

        {rankedMatchups.length >
          1 && (

          <div className="weekly-matchup-list">

            <div className="weekly-matchup-list-title">

              <strong>
                THE REST OF WEEK {previewWeek}
              </strong>

              <span>
                Matchup Analysis
              </span>

            </div>


            {rankedMatchups
              .slice(1)
              .map(
                (matchup) => (

                  <article
                    className={`weekly-matchup-preview ${
                      matchup.assignedRivals
                        ? "weekly-rivalry-matchup"
                        : ""
                    }`}
                    key={`${matchup.awayId}-${matchup.homeId}`}
                  >

                    <div className="weekly-matchup-heading">

                      <div>

                        {matchup.assignedRivals && (

                          <span className="assigned-rival-badge">

                            {matchup.rivalryWeek
                              ? "RIVALRY WEEK"
                              : "ASSIGNED RIVALS"}

                          </span>

                        )}

                        <h3>

                          {matchup.awayName}
                          {" vs. "}
                          {matchup.homeName}

                        </h3>

                      </div>


                      <div className="weekly-matchup-records">

                        <span>

                          {matchup.awayStanding
                            ? formatRecord(
                                matchup
                                  .awayStanding
                                  .wins,

                                matchup
                                  .awayStanding
                                  .losses,

                                matchup
                                  .awayStanding
                                  .ties
                              )
                            : "—"}

                        </span>

                        <strong>
                          VS
                        </strong>

                        <span>

                          {matchup.homeStanding
                            ? formatRecord(
                                matchup
                                  .homeStanding
                                  .wins,

                                matchup
                                  .homeStanding
                                  .losses,

                                matchup
                                  .homeStanding
                                  .ties
                              )
                            : "—"}

                        </span>

                      </div>

                    </div>


                    <p className="weekly-matchup-analysis">

                      {buildAnalysis(
                        matchup
                      )}

                    </p>


                    <div className="weekly-matchup-meta">

                      <span>

                        {getSeriesSummary({
                          series:
                            matchup.series,

                          owner1Name:
                            matchup.awayName,

                          owner2Name:
                            matchup.homeName,
                        })}

                      </span>


                      <span>

                        Seeds{" "}

                        #
                        {matchup
                          .awayStanding
                          ?.playoffSeed ||
                          "—"}

                        {" / "}

                        #
                        {matchup
                          .homeStanding
                          ?.playoffSeed ||
                          "—"}

                      </span>

                    </div>

                  </article>

                )
              )}

          </div>

        )}

      </section>


      {/* ===================================================
          OWNER MAP
          =================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              LEAGUE FOOTPRINT
            </p>

            <h2>
              The Dirty P Road Map
            </h2>

          </div>

          <span>
            Where the League Has Been
          </span>

        </div>


        <div className="owner-map-card">

          {/*
            IMPORTANT:
            Keep this src pointed at the map image
            you already have in your /public folder.
          */}

          <img
            src="/The Dirty P Road Map.png"
            alt="The Dirty P Road Map"
            className="owner-map-image"
          />

        </div>

      </section>


      {/* ===================================================
          FOOTER
          =================================================== */}

      <footer className="site-footer">

        <strong>
          Dirty P Fantasy Football
        </strong>

        <span>
          The League Archive · Est. 2014
        </span>

        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>

      </footer>

    </main>
  );
}
