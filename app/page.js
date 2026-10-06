import Link from "next/link";

import {
  supabase,
} from "../lib/supabase";

import {
  getLeagueData,
} from "../lib/leagueData";

import {
  getMatchupIntel,
} from "../lib/matchupIntel";

import AutoRefresh
  from "./components/AutoRefresh";


export const dynamic =
  "force-dynamic";


// =========================================================
// ASSIGNED RIVALS
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
// HELPERS
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


function firstName(
  value = ""
) {
  return (
    String(value)
      .trim()
      .split(" ")[0] ||
    value
  );
}


function formatScore(
  value
) {
  return num(
    value
  ).toFixed(2);
}


function formatOne(
  value
) {
  return num(
    value
  ).toFixed(1);
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
// GAME HELPERS
// =========================================================

function gameSides(
  game,
  ownerMap
) {
  return [
    {
      side: "AWAY",

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

    {
      side: "HOME",

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
  ];
}


function winnerFromGame(
  game,
  ownerMap
) {
  const sides =
    gameSides(
      game,
      ownerMap
    );


  const winner =
    String(
      game.winner || ""
    ).toUpperCase();


  if (
    winner === "AWAY"
  ) {
    return sides[0];
  }


  if (
    winner === "HOME"
  ) {
    return sides[1];
  }


  if (
    sides[0].score ===
    sides[1].score
  ) {
    return null;
  }


  return [
    ...sides,
  ].sort(
    (a, b) =>
      b.score -
      a.score
  )[0];
}


function loserFromGame(
  game,
  ownerMap
) {
  const winner =
    winnerFromGame(
      game,
      ownerMap
    );


  if (!winner) {
    return null;
  }


  return gameSides(
    game,
    ownerMap
  ).find(
    (side) =>
      side.ownerId !==
      winner.ownerId
  );
}


// =========================================================
// HEAD TO HEAD
// =========================================================

function getSeries(
  games,
  owner1Id,
  owner2Id
) {
  const seriesGames =
    games.filter(
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
            home === owner1Id &&
            away === owner2Id
          ) ||
          (
            home === owner2Id &&
            away === owner1Id
          )
        );
      }
    );


  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;


  for (
    const game of
    seriesGames
  ) {
    const homeId =
      Number(
        game.home_owner_id
      );

    const awayId =
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


    const winner =
      String(
        game.winner || ""
      ).toUpperCase();


    let winnerId =
      null;


    if (
      winner === "HOME"
    ) {
      winnerId =
        homeId;
    } else if (
      winner === "AWAY"
    ) {
      winnerId =
        awayId;
    } else if (
      homeScore >
      awayScore
    ) {
      winnerId =
        homeId;
    } else if (
      awayScore >
      homeScore
    ) {
      winnerId =
        awayId;
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
      seriesGames.length,

    owner1Wins,
    owner2Wins,
    ties,
  };
}


function seriesText(
  series,
  owner1Name,
  owner2Name
) {
  if (
    !series ||
    series.games === 0
  ) {
    return (
      "First recorded meeting"
    );
  }


  if (
    series.owner1Wins >
    series.owner2Wins
  ) {
    return `${owner1Name} leads ${formatRecord(
      series.owner1Wins,
      series.owner2Wins,
      series.ties
    )}`;
  }


  if (
    series.owner2Wins >
    series.owner1Wins
  ) {
    return `${owner2Name} leads ${formatRecord(
      series.owner2Wins,
      series.owner1Wins,
      series.ties
    )}`;
  }


  return `Series tied ${formatRecord(
    series.owner1Wins,
    series.owner2Wins,
    series.ties
  )}`;
}


// =========================================================
// STREAKS
// =========================================================

function buildStreaks(
  games,
  ownerMap
) {
  const chronological =
    [...games].sort(
      (a, b) =>
        Number(
          a.matchup_period
        ) -
        Number(
          b.matchup_period
        )
    );


  const results =
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


    for (
      const side of
      gameSides(
        game,
        ownerMap
      )
    ) {
      if (
        !results.has(
          side.ownerId
        )
      ) {
        results.set(
          side.ownerId,
          []
        );
      }


      if (
        winner?.ownerId ===
        side.ownerId
      ) {
        results
          .get(
            side.ownerId
          )
          .push("W");
      } else if (
        loser?.ownerId ===
        side.ownerId
      ) {
        results
          .get(
            side.ownerId
          )
          .push("L");
      } else {
        results
          .get(
            side.ownerId
          )
          .push("T");
      }
    }
  }


  const streaks =
    new Map();


  for (
    const [
      ownerId,
      ownerResults,
    ] of results.entries()
  ) {
    if (
      !ownerResults.length
    ) {
      continue;
    }


    const type =
      ownerResults[
        ownerResults.length -
        1
      ];


    if (
      type === "T"
    ) {
      continue;
    }


    let count = 0;


    for (
      let i =
        ownerResults.length -
        1;
      i >= 0;
      i -= 1
    ) {
      if (
        ownerResults[i] ===
        type
      ) {
        count += 1;
      } else {
        break;
      }
    }


    streaks.set(
      ownerId,
      {
        type,
        count,
      }
    );
  }


  return streaks;
}


// =========================================================
// DIRTY P LINE
// =========================================================

function buildFantasyLine({
  awayName,
  homeName,
  awayProjection,
  homeProjection,
}) {
  const away =
    num(
      awayProjection
    );

  const home =
    num(
      homeProjection
    );


  if (
    away <= 0 ||
    home <= 0
  ) {
    return {
      available: false,
      projectedWinner: null,
      line: "—",
      total: "—",
      projectedScore: null,
    };
  }


  const difference =
    Math.abs(
      away -
      home
    );


  let projectedWinner =
    null;

  let line =
    "PICK";


  if (
    difference >= 0.05
  ) {
    projectedWinner =
      away > home
        ? awayName
        : homeName;


    line =
      `${projectedWinner} -${formatOne(
        difference
      )}`;
  }


  return {
    available: true,

    projectedWinner:
      projectedWinner ||
      "Pick'em",

    line,

    total:
      formatOne(
        away +
        home
      ),

    projectedScore:
      `${formatOne(
        away
      )} - ${formatOne(
        home
      )}`,
  };
}


// =========================================================
// PLAYER HELPERS
// =========================================================

function topPlayers(
  teamIntel,
  limit = 3
) {
  if (
    !teamIntel
      ?.impactPlayers
      ?.length
  ) {
    return [];
  }


  return teamIntel
    .impactPlayers
    .slice(
      0,
      limit
    );
}


function outlookWord(
  player
) {
  if (
    player
      ?.matchupGrade ===
    "GOOD"
  ) {
    return "Favorable";
  }


  if (
    player
      ?.matchupGrade ===
    "TOUGH"
  ) {
    return "Tough";
  }


  if (
    player
      ?.matchupGrade ===
    "NEUTRAL"
  ) {
    return "Neutral";
  }


  return "Unknown";
}


function playerShortText(
  player
) {
  if (!player) {
    return "";
  }


  let text =
    `${player.name} (${player.position})`;


  if (
    num(
      player.projection
    ) > 0
  ) {
    text +=
      ` · ${formatOne(
        player.projection
      )} proj`;
  }


  if (
    player.opponent &&
    player.opponent !==
      "TBD"
  ) {
    text +=
      ` vs ${player.opponent}`;
  }


  if (
    player.nflOverUnder
  ) {
    text +=
      ` · NFL O/U ${formatOne(
        player.nflOverUnder
      )}`;
  }


  return text;
}


// =========================================================
// PAGE
// =========================================================

export default async function Home() {
  let leagueData;


  try {
    leagueData =
      await getLeagueData();
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
    playoffTeamCount,

    owners,
    currentTeams,
    currentSeasonResults,

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
      previousSeasonData,
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
          ascending: false,
        }
      )
      .limit(1);


  const defendingSeason =
    previousSeasonData?.[0] ||
    null;


  // =======================================================
  // LOOKUPS
  // =======================================================

  const ownerMap =
    new Map(
      (owners || []).map(
        (owner) => [
          Number(
            owner.id
          ),
          owner.name,
        ]
      )
    );


  const resultByOwner =
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


  const currentTeamByOwner =
    new Map();


  for (
    const team of
    currentTeams || []
  ) {
    const ownerId =
      Number(
        team.owner_id ??
        team.ownerId ??
        0
      );


    if (
      ownerId > 0
    ) {
      currentTeamByOwner.set(
        ownerId,
        team
      );
    }
  }


  // =======================================================
  // STANDINGS
  // =======================================================

  const standings =
    (currentTeams || [])
      .map(
        (team) => {
          const ownerId =
            Number(
              team.owner_id ??
              team.ownerId ??
              0
            );


          const result =
            resultByOwner.get(
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
              team.team_name ||
              team.teamName ||
              "Unknown Team",

            playoffSeed:
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
                result?.points_for
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
          team.ownerId > 0
      )
      .sort(
        (a, b) => {
          const aSeed =
            a.playoffSeed > 0
              ? a.playoffSeed
              : 999;

          const bSeed =
            b.playoffSeed > 0
              ? b.playoffSeed
              : 999;


          return (
            aSeed -
            bSeed
          );
        }
      );


  const standingsMap =
    new Map(
      standings.map(
        (team) => [
          team.ownerId,
          team,
        ]
      )
    );


  const playoffCount =
    Number(
      playoffTeamCount ||
      4
    );


  const playoffTeams =
    standings.filter(
      (team) =>
        team.playoffSeed >
          0 &&
        team.playoffSeed <=
          playoffCount
    );


  const firstOut =
    standings
      .filter(
        (team) =>
          team.playoffSeed >
          playoffCount
      )
      .slice(
        0,
        2
      );


  // =======================================================
  // COMPLETED WEEK
  // =======================================================

  const completedWeeks =
    (
      completedCurrentMatchups ||
      []
    )
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
    (
      completedCurrentMatchups ||
      []
    ).filter(
      (game) =>
        Number(
          game.matchup_period
        ) ===
        latestCompletedWeek
    );


  const streakMap =
    buildStreaks(
      completedCurrentMatchups ||
        [],
      ownerMap
    );


  // =======================================================
  // THIS / NEXT WEEK
  // =======================================================

  const upcomingWeeks = [
    ...new Set(
      (
        currentSeasonMatchups ||
        []
      )
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
    upcomingWeeks[0] ||
    Math.max(
      Number(
        currentWeek || 1
      ),
      latestCompletedWeek +
        1
    );


  const upcomingGames =
    (
      currentSeasonMatchups ||
      []
    ).filter(
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
  // PLAYER / NFL INTEL
  // =======================================================

  let matchupIntel =
    null;


  try {
    matchupIntel =
      await getMatchupIntel(
        previewWeek
      );
  } catch (error) {
    console.error(
      "Matchup intel error:",
      error
    );
  }


  const showLiveScoreboard =
    Boolean(
      matchupIntel
        ?.weekStarted
    );


  function getOwnerIntel(
    ownerId
  ) {
    if (
      !matchupIntel
    ) {
      return null;
    }


    const team =
      currentTeamByOwner.get(
        Number(
          ownerId
        )
      );


    if (!team) {
      return null;
    }


    const espnTeamId =
      Number(
        team.espnTeamId ??
        team.espn_team_id ??
        team.id ??
        0
      );


    if (!espnTeamId) {
      return null;
    }


    return (
      matchupIntel
        .teamMap
        ?.get(
          espnTeamId
        ) ||
      null
    );
  }


  // =======================================================
  // BUILD MATCHUPS
  // =======================================================

  const previewMatchups =
    upcomingGames.map(
      (game) => {
        const awayId =
          Number(
            game.away_owner_id
          );

        const homeId =
          Number(
            game.home_owner_id
          );


        const awayName =
          ownerMap.get(
            awayId
          ) ||
          "Unknown Owner";


        const homeName =
          ownerMap.get(
            homeId
          ) ||
          "Unknown Owner";


        const awayStanding =
          standingsMap.get(
            awayId
          ) ||
          null;


        const homeStanding =
          standingsMap.get(
            homeId
          ) ||
          null;


        const series =
          getSeries(
            matchups || [],
            awayId,
            homeId
          );


        const assignedRivals =
          isAssignedRival(
            awayName,
            homeName
          );


        const awayIntel =
          getOwnerIntel(
            awayId
          );


        const homeIntel =
          getOwnerIntel(
            homeId
          );


        const fantasyLine =
          buildFantasyLine({
            awayName,
            homeName,

            awayProjection:
              awayIntel
                ?.projectedPoints,

            homeProjection:
              homeIntel
                ?.projectedPoints,
          });


        let hypeScore =
          0;


        if (
          assignedRivals
        ) {
          hypeScore += 20;
        }


        if (
          awayStanding
            ?.losses === 0
        ) {
          hypeScore += 8;
        }


        if (
          homeStanding
            ?.losses === 0
        ) {
          hypeScore += 8;
        }


        const awayPlayoff =
          awayStanding
            ?.playoffSeed >
            0 &&
          awayStanding
            ?.playoffSeed <=
            playoffCount;


        const homePlayoff =
          homeStanding
            ?.playoffSeed >
            0 &&
          homeStanding
            ?.playoffSeed <=
            playoffCount;


        if (
          awayPlayoff &&
          homePlayoff
        ) {
          hypeScore += 12;
        } else if (
          awayPlayoff ||
          homePlayoff
        ) {
          hypeScore += 6;
        }


        hypeScore +=
          num(
            awayStanding?.wins
          ) +
          num(
            homeStanding?.wins
          );


        return {
          game,

          awayId,
          homeId,

          awayName,
          homeName,

          awayStanding,
          homeStanding,

          awayStreak:
            streakMap.get(
              awayId
            ),

          homeStreak:
            streakMap.get(
              homeId
            ),

          awayIntel,
          homeIntel,

          fantasyLine,

          series,

          assignedRivals,

          rivalryWeek:
            previewWeek ===
            11,

          hypeScore,
        };
      }
    );


  const rankedMatchups =
    [...previewMatchups]
      .sort(
        (a, b) =>
          b.hypeScore -
          a.hypeScore
      );


  const gameOfTheWeek =
    rankedMatchups[0] ||
    null;


  // =======================================================
  // AROUND THE LEAGUE
  // =======================================================

  const stories =
    [];


  if (
    latestWeekGames.length >
    0
  ) {
    const weekSides =
      latestWeekGames.flatMap(
        (game) =>
          gameSides(
            game,
            ownerMap
          ).map(
            (side) => ({
              ...side,
              game,
            })
          )
      );


    const highScore =
      [...weekSides].sort(
        (a, b) =>
          b.score -
          a.score
      )[0];


    if (highScore) {
      stories.push({
        headline:
          `${firstName(
            highScore.ownerName
          )} Goes Off`,

        text:
          `${highScore.teamName} scored ${formatScore(
            highScore.score
          )}, the highest total of Week ${latestCompletedWeek}.`,
      });
    }


    const undefeated =
      standings.filter(
        (team) =>
          team.wins > 0 &&
          team.losses === 0
      );


    if (
      undefeated.length > 1
    ) {
      stories.push({
        headline:
          `${undefeated.length} Perfect Records Remain`,

        text:
          `${undefeated
            .map(
              (team) =>
                team.ownerName
            )
            .join(
              " and "
            )} remain unbeaten through Week ${latestCompletedWeek}.`,
      });
    }


    const decided =
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


    const closest =
      [...decided].sort(
        (a, b) =>
          a.margin -
          b.margin
      )[0];


    if (closest) {
      const winner =
        winnerFromGame(
          closest.game,
          ownerMap
        );

      const loser =
        loserFromGame(
          closest.game,
          ownerMap
        );


      if (
        winner &&
        loser
      ) {
        stories.push({
          headline:
            `${firstName(
              winner.ownerName
            )} Escapes`,

          text:
            `${winner.ownerName} edged ${loser.ownerName} by only ${formatScore(
              closest.margin
            )} points.`,
        });
      }
    }


    const hottest =
      [
        ...streakMap.entries(),
      ]
        .map(
          ([
            ownerId,
            streak,
          ]) => ({
            ownerName:
              ownerMap.get(
                ownerId
              ),

            ...streak,
          })
        )
        .filter(
          (streak) =>
            streak.type ===
              "W" &&
            streak.count >=
              2
        )
        .sort(
          (a, b) =>
            b.count -
            a.count
        )[0];


    if (hottest) {
      stories.push({
        headline:
          `${firstName(
            hottest.ownerName
          )} Keeps Rolling`,

        text:
          `${hottest.ownerName} has won ${hottest.count} straight.`,
      });
    }
  }


  const aroundLeague =
    stories.slice(
      0,
      4
    );


  // =======================================================
  // PREVIEW ANALYSIS
  // =======================================================

  function matchupAnalysis(
    matchup
  ) {
    const pieces =
      [];


    if (
      matchup.assignedRivals
    ) {
      pieces.push(
        matchup.rivalryWeek
          ? `${matchup.awayName} and ${matchup.homeName} meet in their official Rivalry Week matchup.`
          : `${matchup.awayName} and ${matchup.homeName} are assigned rivals, adding extra bragging rights.`
      );
    }


    const away =
      matchup.awayStanding;

    const home =
      matchup.homeStanding;


    const awayPlayoff =
      away?.playoffSeed <=
      playoffCount;

    const homePlayoff =
      home?.playoffSeed <=
      playoffCount;


    if (
      awayPlayoff &&
      homePlayoff
    ) {
      pieces.push(
        `Both teams currently sit in the playoff field at Seeds #${away.playoffSeed} and #${home.playoffSeed}.`
      );
    } else if (
      away &&
      home
    ) {
      pieces.push(
        `${matchup.awayName} enters ${formatRecord(
          away.wins,
          away.losses,
          away.ties
        )}, while ${matchup.homeName} comes in at ${formatRecord(
          home.wins,
          home.losses,
          home.ties
        )}.`
      );
    }


    const awayStars =
      topPlayers(
        matchup.awayIntel,
        2
      );

    const homeStars =
      topPlayers(
        matchup.homeIntel,
        2
      );


    if (
      awayStars[0] &&
      homeStars[0]
    ) {
      pieces.push(
        `${firstName(
          matchup.awayName
        )}'s top projected option is ${playerShortText(
          awayStars[0]
        )}, while ${firstName(
          matchup.homeName
        )} is led by ${playerShortText(
          homeStars[0]
        )}.`
      );
    }


    if (
      matchup
        .fantasyLine
        .available
    ) {
      pieces.push(
        `The Dirty P projection makes ${matchup.fantasyLine.projectedWinner} the favorite at ${matchup.fantasyLine.line}, with a projected total of ${matchup.fantasyLine.total}.`
      );
    }


    pieces.push(
      `${seriesText(
        matchup.series,
        matchup.awayName,
        matchup.homeName
      )}.`
    );


    return pieces
      .filter(Boolean)
      .join(" ");
  }


  // =======================================================
  // RENDER
  // =======================================================

  return (
    <main className="page-shell home-page">

      <AutoRefresh
        enabled={
          showLiveScoreboard
        }
        intervalMs={30000}
      />


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

          </div>

        </section>

      )}


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


      {unmatchedEspnOwners
        ?.length > 0 && (

        <div className="home-warning">

          ESPN owner mapping issue:{" "}

          {unmatchedEspnOwners
            .map(
              (owner) =>
                owner.ownerName
            )
            .join(", ")}

        </div>

      )}


      {/* STANDINGS */}

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
            ESPN Playoff Seeding
          </span>

        </div>


        <div className="profile-table-wrap">

          <table className="profile-table home-standings">

            <thead>

              <tr>
                <th>SEED</th>
                <th>TEAM</th>
                <th>RECORD</th>
                <th>PF</th>
                <th>STATUS</th>
              </tr>

            </thead>


            <tbody>

              {standings.map(
                (team) => {

                  const playoff =
                    team.playoffSeed <=
                      playoffCount;


                  return (

                    <tr
                      key={
                        team.ownerId
                      }
                    >

                      <td>
                        <strong>
                          #{team.playoffSeed}
                        </strong>
                      </td>


                      <td>

                        <Link
                          href={`/owners/${team.ownerId}`}
                          className="standing-team-link"
                        >

                          <strong>
                            {team.ownerName}
                          </strong>

                          <span>
                            {team.teamName}
                          </span>

                        </Link>

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

                        {playoff ? (

                          <span className="playoff-badge">
                            PLAYOFF
                          </span>

                        ) : (
                          "—"
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


      {/* PLAYOFF PICTURE */}

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
            Top {playoffCount} Currently In
          </span>

        </div>


        <div className="home-playoff-race">

          {playoffTeams.map(
            (team) => (

              <Link
                href={`/owners/${team.ownerId}`}
                className="home-playoff-row"
                key={
                  team.ownerId
                }
              >

                <strong className="home-playoff-seed">
                  {team.playoffSeed}
                </strong>


                <div className="home-playoff-name">

                  <strong>
                    {team.ownerName}
                  </strong>

                  <span>
                    {team.teamName}
                  </span>

                </div>


                <strong className="home-playoff-record">

                  {formatRecord(
                    team.wins,
                    team.losses,
                    team.ties
                  )}

                </strong>

              </Link>

            )
          )}


          {firstOut.length >
            0 && (

            <div className="home-first-out">

              <strong>
                FIRST OUT
              </strong>

              <span>

                {firstOut
                  .map(
                    (team) =>
                      `#${team.playoffSeed} ${team.ownerName}`
                  )
                  .join(" · ")}

              </span>

            </div>

          )}

        </div>

      </section>


      {/* AROUND THE LEAGUE */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              WEEK {latestCompletedWeek}
            </p>

            <h2>
              Around the League
            </h2>

          </div>

          <span>
            Stories & Takeaways
          </span>

        </div>


        <div className="around-league">

          {aroundLeague.map(
            (
              story,
              index
            ) => (

              <article
                className="around-league-story"
                key={index}
              >

                <h3>
                  {story.headline}
                </h3>

                <p>
                  {story.text}
                </p>

              </article>

            )
          )}

        </div>

      </section>


      {/* ===================================================
          LIVE SCOREBOARD OR PREGAME PREVIEW
          =================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">

              {showLiveScoreboard
                ? `LIVE · WEEK ${previewWeek}`
                : `WEEK ${previewWeek}`}

            </p>

            <h2>

              {showLiveScoreboard
                ? `Week ${previewWeek} Scoreboard`
                : "This Week"}

            </h2>

          </div>


          <span>

            {showLiveScoreboard
              ? "Refreshes Every 30 Seconds"
              : "Matchup Preview"}

          </span>

        </div>


        {/* ===============================================
            LIVE SCOREBOARD
            =============================================== */}

        {showLiveScoreboard ? (

          <div className="matchup-grid">

            {rankedMatchups.map(
              (
                matchup,
                index
              ) => {

                const awayScore =
                  num(
                    matchup
                      .game
                      .away_score
                  );

                const homeScore =
                  num(
                    matchup
                      .game
                      .home_score
                  );


                const final =
                  matchup
                    .game
                    .completed ===
                  true;


                return (

                  <article
                    className="matchup-card"
                    key={`${matchup.awayId}-${matchup.homeId}`}
                  >

                    <div className="matchup-card-top">

                      <div className="scoreboard-card-labels">

                        <span>

                          {index === 0
                            ? "GAME OF THE WEEK"
                            : `WEEK ${previewWeek}`}

                        </span>


                        {matchup.assignedRivals && (

                          <span className="small-rival-badge">

                            {matchup.rivalryWeek
                              ? "RIVALRY WEEK"
                              : "ASSIGNED RIVALS"}

                          </span>

                        )}

                      </div>


                      <span className="matchup-status">

                        {final
                          ? "FINAL"
                          : "LIVE"}

                      </span>

                    </div>


                    <div
                      className={`matchup-team-row ${
                        awayScore >
                        homeScore
                          ? "matchup-leading"
                          : ""
                      }`}
                    >

                      <div className="matchup-team-info">

                        <strong>
                          {matchup.awayName}
                        </strong>

                        <span>

                          {formatRecord(
                            matchup
                              .awayStanding
                              ?.wins,

                            matchup
                              .awayStanding
                              ?.losses,

                            matchup
                              .awayStanding
                              ?.ties
                          )}

                          {" · "}

                          Seed #

                          {matchup
                            .awayStanding
                            ?.playoffSeed}

                          {matchup
                            .awayIntel
                            ?.projectedPoints >
                          0
                            ? ` · Pregame ${formatOne(
                                matchup
                                  .awayIntel
                                  .projectedPoints
                              )}`
                            : ""}

                        </span>

                      </div>


                      <strong className="matchup-score">

                        {formatScore(
                          awayScore
                        )}

                      </strong>

                    </div>


                    <div className="matchup-vs">

                      <span>
                        VS
                      </span>

                    </div>


                    <div
                      className={`matchup-team-row ${
                        homeScore >
                        awayScore
                          ? "matchup-leading"
                          : ""
                      }`}
                    >

                      <div className="matchup-team-info">

                        <strong>
                          {matchup.homeName}
                        </strong>

                        <span>

                          {formatRecord(
                            matchup
                              .homeStanding
                              ?.wins,

                            matchup
                              .homeStanding
                              ?.losses,

                            matchup
                              .homeStanding
                              ?.ties
                          )}

                          {" · "}

                          Seed #

                          {matchup
                            .homeStanding
                            ?.playoffSeed}

                          {matchup
                            .homeIntel
                            ?.projectedPoints >
                          0
                            ? ` · Pregame ${formatOne(
                                matchup
                                  .homeIntel
                                  .projectedPoints
                              )}`
                            : ""}

                        </span>

                      </div>


                      <strong className="matchup-score">

                        {formatScore(
                          homeScore
                        )}

                      </strong>

                    </div>


                    <div className="scoreboard-market-strip">

                      <div>

                        <span>
                          DIRTY P LINE
                        </span>

                        <strong>
                          {matchup
                            .fantasyLine
                            .line}
                        </strong>

                      </div>


                      <div>

                        <span>
                          PROJECTED O/U
                        </span>

                        <strong>
                          {matchup
                            .fantasyLine
                            .total}
                        </strong>

                      </div>


                      <div>

                        <span>
                          PREGAME PROJ
                        </span>

                        <strong>

                          {matchup
                            .fantasyLine
                            .projectedScore ||
                            "—"}

                        </strong>

                      </div>

                    </div>


                    <div className="featured-meta">

                      <span>

                        <strong>
                          SERIES
                        </strong>

                        {seriesText(
                          matchup.series,
                          matchup.awayName,
                          matchup.homeName
                        )}

                      </span>

                    </div>

                  </article>

                );
              }
            )}

          </div>

        ) : (

          <>
            {/* ===========================================
                GAME OF THE WEEK
                =========================================== */}

            {gameOfTheWeek && (

              <article className="featured-matchup">

                <div className="featured-matchup-labels">

                  <span>
                    GAME OF THE WEEK
                  </span>


                  {gameOfTheWeek
                    .assignedRivals && (

                    <strong>

                      {gameOfTheWeek
                        .rivalryWeek
                        ? "RIVALRY WEEK"
                        : "ASSIGNED RIVALS"}

                    </strong>

                  )}

                </div>


                <div className="featured-matchup-title">

                  <div>

                    <h3>
                      {gameOfTheWeek.awayName}
                    </h3>

                    <span>

                      {formatRecord(
                        gameOfTheWeek
                          .awayStanding
                          ?.wins,

                        gameOfTheWeek
                          .awayStanding
                          ?.losses
                      )}

                      {" · "}

                      Seed #

                      {gameOfTheWeek
                        .awayStanding
                        ?.playoffSeed}

                    </span>

                  </div>


                  <strong className="featured-vs">
                    VS
                  </strong>


                  <div className="right">

                    <h3>
                      {gameOfTheWeek.homeName}
                    </h3>

                    <span>

                      {formatRecord(
                        gameOfTheWeek
                          .homeStanding
                          ?.wins,

                        gameOfTheWeek
                          .homeStanding
                          ?.losses
                      )}

                      {" · "}

                      Seed #

                      {gameOfTheWeek
                        .homeStanding
                        ?.playoffSeed}

                    </span>

                  </div>

                </div>


                <p className="featured-analysis">

                  {matchupAnalysis(
                    gameOfTheWeek
                  )}

                </p>


                {gameOfTheWeek
                  .fantasyLine
                  .available && (

                  <div className="scoreboard-market-strip">

                    <div>

                      <span>
                        DIRTY P LINE
                      </span>

                      <strong>
                        {gameOfTheWeek
                          .fantasyLine
                          .line}
                      </strong>

                    </div>


                    <div>

                      <span>
                        PROJECTED O/U
                      </span>

                      <strong>
                        {gameOfTheWeek
                          .fantasyLine
                          .total}
                      </strong>

                    </div>


                    <div>

                      <span>
                        PROJECTED SCORE
                      </span>

                      <strong>
                        {gameOfTheWeek
                          .fantasyLine
                          .projectedScore}
                      </strong>

                    </div>

                  </div>

                )}


                <div
                  style={{
                    padding:
                      "20px 24px",
                    borderTop:
                      "1px solid #222830",
                  }}
                >

                  <span className="owner-status">
                    PLAYERS TO WATCH
                  </span>


                  <div className="profile-table-wrap">

                    <table className="profile-table">

                      <thead>

                        <tr>
                          <th>OWNER</th>
                          <th>PLAYER</th>
                          <th>POS</th>
                          <th>NFL MATCHUP</th>
                          <th>PROJ</th>
                          <th>AVG</th>
                          <th>NFL O/U</th>
                          <th>OUTLOOK</th>
                        </tr>

                      </thead>


                      <tbody>

                        {[
                          ...topPlayers(
                            gameOfTheWeek
                              .awayIntel,
                            3
                          ).map(
                            (player) => ({
                              ...player,
                              owner:
                                gameOfTheWeek
                                  .awayName,
                            })
                          ),

                          ...topPlayers(
                            gameOfTheWeek
                              .homeIntel,
                            3
                          ).map(
                            (player) => ({
                              ...player,
                              owner:
                                gameOfTheWeek
                                  .homeName,
                            })
                          ),
                        ].map(
                          (player) => (

                            <tr
                              key={`${player.owner}-${player.playerId}`}
                            >

                              <td>
                                <strong>
                                  {firstName(
                                    player.owner
                                  )}
                                </strong>
                              </td>

                              <td>
                                <strong>
                                  {player.name}
                                </strong>
                              </td>

                              <td>
                                {player.position}
                              </td>

                              <td>
                                vs {player.opponent}
                              </td>

                              <td>
                                <strong>
                                  {formatOne(
                                    player.projection
                                  )}
                                </strong>
                              </td>

                              <td>
                                {player
                                  .seasonAverage >
                                0
                                  ? formatOne(
                                      player.seasonAverage
                                    )
                                  : "—"}
                              </td>

                              <td>
                                {player
                                  .nflOverUnder
                                  ? formatOne(
                                      player.nflOverUnder
                                    )
                                  : "—"}
                              </td>

                              <td>
                                {outlookWord(
                                  player
                                )}
                              </td>

                            </tr>

                          )
                        )}

                      </tbody>

                    </table>

                  </div>

                </div>


                <div className="featured-meta">

                  <span>

                    <strong>
                      SERIES
                    </strong>

                    {seriesText(
                      gameOfTheWeek
                        .series,

                      gameOfTheWeek
                        .awayName,

                      gameOfTheWeek
                        .homeName
                    )}

                  </span>


                  <span>

                    <strong>
                      PROJECTED WINNER
                    </strong>

                    {gameOfTheWeek
                      .fantasyLine
                      .projectedWinner ||
                      "—"}

                  </span>

                </div>

              </article>

            )}


            {/* REST OF WEEK */}

            {rankedMatchups.length >
              1 && (

              <div className="other-matchups">

                <div className="other-matchups-heading">

                  THE REST OF WEEK {previewWeek}

                </div>


                {rankedMatchups
                  .slice(1)
                  .map(
                    (matchup) => (

                      <article
                        className={`other-matchup ${
                          matchup.assignedRivals
                            ? "assigned-matchup"
                            : ""
                        }`}
                        key={`${matchup.awayId}-${matchup.homeId}`}
                      >

                        <div className="other-matchup-top">

                          <div>

                            {matchup.assignedRivals && (

                              <span className="small-rival-badge">

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

                        </div>


                        <p>

                          {matchupAnalysis(
                            matchup
                          )}

                        </p>


                        <div className="scoreboard-market-strip">

                          <div>

                            <span>
                              DIRTY P LINE
                            </span>

                            <strong>
                              {matchup
                                .fantasyLine
                                .line}
                            </strong>

                          </div>


                          <div>

                            <span>
                              PROJECTED O/U
                            </span>

                            <strong>
                              {matchup
                                .fantasyLine
                                .total}
                            </strong>

                          </div>


                          <div>

                            <span>
                              PROJECTED SCORE
                            </span>

                            <strong>
                              {matchup
                                .fantasyLine
                                .projectedScore ||
                                "—"}
                            </strong>

                          </div>

                        </div>


                        <div className="other-matchup-bottom">

                          <span>

                            {seriesText(
                              matchup.series,

                              matchup.awayName,

                              matchup.homeName
                            )}

                          </span>

                        </div>

                      </article>

                    )
                  )}

              </div>

            )}

          </>

        )}

      </section>


      {/* ROAD MAP */}

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

          <img
            src="/The Dirty P Road Map.png"
            alt="The Dirty P Road Map"
            className="owner-map-image"
          />

        </div>

      </section>


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
