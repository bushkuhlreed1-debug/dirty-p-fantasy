import Link from "next/link";
import { supabase } from "../lib/supabase";
import { getLeagueData } from "../lib/leagueData";

export const dynamic = "force-dynamic";

// =========================================================
// RIVALRY WEEK PAIRS
// =========================================================

const OFFICIAL_RIVALRIES = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

// =========================================================
// HELPERS
// =========================================================

function num(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatScore(value) {
  return num(value).toFixed(2);
}

function formatRecord(
  wins,
  losses,
  ties = 0
) {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
}

function isOfficialRivalry(
  owner1,
  owner2
) {
  return OFFICIAL_RIVALRIES.some(
    ([a, b]) =>
      (a === owner1 &&
        b === owner2) ||
      (a === owner2 &&
        b === owner1)
  );
}

// =========================================================
// GAME SIDES
// =========================================================

function gameSides(
  game,
  ownerMap
) {
  return [
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
        ) || "Unknown",

      teamName:
        game.home_team_name ||
        "Unknown Team",

      score:
        num(
          game.home_score
        ),
    },

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
        ) || "Unknown",

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
// WINNER
// =========================================================

function winnerFromGame(
  game,
  ownerMap
) {
  if (!game) {
    return null;
  }

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

  return [
    ...sides,
  ].sort(
    (a, b) =>
      b.score -
      a.score
  )[0];
}

// =========================================================
// LOSER
// =========================================================

function loserFromGame(
  game,
  ownerMap
) {
  if (!game) {
    return null;
  }

  const sides =
    gameSides(
      game,
      ownerMap
    );

  const winner =
    winnerFromGame(
      game,
      ownerMap
    );

  if (!winner) {
    return null;
  }

  return sides.find(
    (side) =>
      side.ownerId !==
      winner.ownerId
  );
}

// =========================================================
// SORT STANDINGS
// =========================================================

function sortStandings(
  standings
) {
  return [
    ...standings,
  ].sort(
    (a, b) => {
      if (
        b.wins !== a.wins
      ) {
        return (
          b.wins -
          a.wins
        );
      }

      if (
        b.ties !== a.ties
      ) {
        return (
          b.ties -
          a.ties
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
// ALL-TIME SERIES
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
    const game of
    seriesGames
  ) {
    const winner =
      String(
        game.winner || ""
      ).toUpperCase();

    const home =
      Number(
        game.home_owner_id
      );

    const away =
      Number(
        game.away_owner_id
      );

    let winnerId =
      null;

    if (
      winner === "HOME"
    ) {
      winnerId = home;
    } else if (
      winner === "AWAY"
    ) {
      winnerId = away;
    } else {
      const homeScore =
        num(
          game.home_score
        );

      const awayScore =
        num(
          game.away_score
        );

      if (
        homeScore >
        awayScore
      ) {
        winnerId =
          home;
      } else if (
        awayScore >
        homeScore
      ) {
        winnerId =
          away;
      }
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

// =========================================================
// CURRENT-SEASON STREAKS
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

  const ownerGames =
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
      gameSides(
        game,
        ownerMap
      );

    for (
      const side of
      sides
    ) {
      if (
        !ownerGames.has(
          side.ownerId
        )
      ) {
        ownerGames.set(
          side.ownerId,
          []
        );
      }

      let result =
        "T";

      if (
        winner &&
        side.ownerId ===
          winner.ownerId
      ) {
        result =
          "W";
      } else if (
        loser &&
        side.ownerId ===
          loser.ownerId
      ) {
        result =
          "L";
      }

      ownerGames
        .get(
          side.ownerId
        )
        .push(
          result
        );
    }
  }

  const streaks =
    [];

  for (
    const [
      ownerId,
      results,
    ] of ownerGames.entries()
  ) {
    if (
      results.length === 0
    ) {
      continue;
    }

    const latest =
      results[
        results.length - 1
      ];

    if (
      latest === "T"
    ) {
      continue;
    }

    let count =
      0;

    for (
      let i =
        results.length - 1;
      i >= 0;
      i -= 1
    ) {
      if (
        results[i] ===
        latest
      ) {
        count += 1;
      } else {
        break;
      }
    }

    streaks.push({
      ownerId,

      ownerName:
        ownerMap.get(
          ownerId
        ) || "Unknown",

      result:
        latest,

      count,
    });
  }

  return streaks;
}

// =========================================================
// PAGE
// =========================================================

export default async function Home() {
  // =======================================================
  // LIVE LEAGUE DATA
  // =======================================================

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
    currentSeasonMatchups,
    completedCurrentMatchups,
    matchups,
    seasonResults,
    unmatchedEspnOwners,
  } =
    leagueData;

  // =======================================================
  // DEFENDING CHAMPION
  // =======================================================

  const {
    data: seasonData,
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
    seasonData?.[0] ||
    null;

  // =======================================================
  // OWNER LOOKUP
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

  // =======================================================
  // CURRENT TEAM LOOKUP
  // =======================================================

  const currentTeamMap =
    new Map(
      currentTeams.map(
        (team) => [
          Number(
            team.owner_id
          ),
          team,
        ]
      )
    );

  // =======================================================
  // CURRENT STANDINGS
  // =======================================================

  const currentStandings =
    sortStandings(
      seasonResults
        .filter(
          (season) =>
            Number(
              season.season_year
            ) ===
            Number(
              currentSeason
            )
        )
        .map(
          (season) => {
            const ownerId =
              Number(
                season.owner_id
              );

            const team =
              currentTeamMap.get(
                ownerId
              );

            return {
              ownerId,

              ownerName:
                ownerMap.get(
                  ownerId
                ) ||
                "Unknown",

              teamName:
                team
                  ?.team_name ||
                team
                  ?.teamName ||
                ownerMap.get(
                  ownerId
                ) ||
                "Unknown",

              wins:
                num(
                  season.wins
                ),

              losses:
                num(
                  season.losses
                ),

              ties:
                num(
                  season.ties
                ),

              pointsFor:
                num(
                  season.points_for
                ),

              pointsAgainst:
                num(
                  season.points_against
                ),
            };
          }
        )
    );

  const standingsMap =
    new Map(
      currentStandings.map(
        (standing) => [
          standing.ownerId,
          standing,
        ]
      )
    );

  // =======================================================
  // PLAYOFF PICTURE
  // =======================================================

  const playoffSpots =
    Number(
      playoffTeamCount ||
        4
    );

  const currentPlayoffTeams =
    currentStandings.slice(
      0,
      playoffSpots
    );

  const bubbleTeams =
    currentStandings.slice(
      playoffSpots,
      playoffSpots + 2
    );

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
    completedWeeks.length >
    0
      ? Math.max(
          ...completedWeeks
        )
      : 0;

  // =======================================================
  // GAMES FROM LATEST WEEK
  // =======================================================

  const latestWeekGames =
    completedCurrentMatchups.filter(
      (game) =>
        Number(
          game.matchup_period
        ) ===
        latestCompletedWeek
    );

  // =======================================================
  // AROUND THE LEAGUE
  // =======================================================

  const stories =
    [];

  if (
    latestWeekGames.length >
    0
  ) {
    // -----------------------------------------------------
    // WEEKLY SIDES
    // -----------------------------------------------------

    const weeklySides =
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

    // -----------------------------------------------------
    // HIGH SCORE
    // -----------------------------------------------------

    const highScore =
      [...weeklySides].sort(
        (a, b) =>
          b.score -
          a.score
      )[0];

    if (highScore) {
      stories.push({
        label:
          "SCORE OF THE WEEK",

        title:
          `${highScore.ownerName} set the pace`,

        text:
          `${highScore.teamName} posted ${formatScore(
            highScore.score
          )} points, the highest total of Week ${latestCompletedWeek}.`,

        meta:
          `${formatScore(
            highScore.score
          )} PTS`,
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
            item.margin >
            0
        );

    const closest =
      [...decidedGames].sort(
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

      stories.push({
        label:
          "CLOSEST CALL",

        title:
          winner
            ? `${winner.ownerName} escaped with one`
            : "Down to the wire",

        text:
          winner &&
          loser
            ? `${winner.ownerName} beat ${loser.ownerName} by just ${formatScore(
                closest.margin
              )} points.`
            : `The closest matchup of the week was decided by ${formatScore(
                closest.margin
              )}.`,

        meta:
          `${formatScore(
            closest.margin
          )}-PT MARGIN`,
      });
    }

    // -----------------------------------------------------
    // BIGGEST WIN
    // -----------------------------------------------------

    const biggest =
      [...decidedGames].sort(
        (a, b) =>
          b.margin -
          a.margin
      )[0];

    if (
      biggest &&
      biggest !== closest
    ) {
      const winner =
        winnerFromGame(
          biggest.game,
          ownerMap
        );

      const loser =
        loserFromGame(
          biggest.game,
          ownerMap
        );

      stories.push({
        label:
          "BIGGEST STATEMENT",

        title:
          winner
            ? `${winner.ownerName} left no doubt`
            : "Biggest win of the week",

        text:
          winner &&
          loser
            ? `${winner.ownerName} knocked off ${loser.ownerName} by ${formatScore(
                biggest.margin
              )} points.`
            : `The week's biggest margin was ${formatScore(
                biggest.margin
              )} points.`,

        meta:
          `+${formatScore(
            biggest.margin
          )}`,
      });
    }

    // -----------------------------------------------------
    // UNDEFEATED
    // -----------------------------------------------------

    const undefeated =
      currentStandings.filter(
        (team) =>
          team.wins >
            0 &&
          team.losses ===
            0
      );

    if (
      undefeated.length >
      0
    ) {
      if (
        undefeated.length ===
        1
      ) {
        const team =
          undefeated[0];

        stories.push({
          label:
            "STILL PERFECT",

          title:
            `${team.ownerName} remains unbeaten`,

          text:
            `${team.teamName} is ${formatRecord(
              team.wins,
              team.losses,
              team.ties
            )} and is the league's last remaining undefeated team.`,

          meta:
            formatRecord(
              team.wins,
              team.losses,
              team.ties
            ),
        });
      } else {
        stories.push({
          label:
            "STILL PERFECT",

          title:
            `${undefeated.length} teams remain unbeaten`,

          text:
            `${undefeated
              .map(
                (team) =>
                  team.ownerName
              )
              .join(
                ", "
              )} are still without a loss.`,

          meta:
            `${undefeated.length} UNBEATEN`,
        });
      }
    }

    // -----------------------------------------------------
    // CURRENT STREAK
    // -----------------------------------------------------

    const streaks =
      buildStreaks(
        completedCurrentMatchups,
        ownerMap
      );

    const bestWinStreak =
      streaks
        .filter(
          (streak) =>
            streak.result ===
              "W" &&
            streak.count >=
              2
        )
        .sort(
          (a, b) =>
            b.count -
            a.count
        )[0];

    if (bestWinStreak) {
      stories.push({
        label:
          "HEATING UP",

        title:
          `${bestWinStreak.ownerName} has won ${bestWinStreak.count} straight`,

        text:
          `${bestWinStreak.ownerName} owns the league's hottest active winning streak entering the next matchup period.`,

        meta:
          `${bestWinStreak.count} STRAIGHT`,
      });
    }

    // -----------------------------------------------------
    // SHOOTOUT
    // -----------------------------------------------------

    const shootout =
      [...latestWeekGames]
        .map(
          (game) => ({
            game,

            combined:
              num(
                game.home_score
              ) +
              num(
                game.away_score
              ),
          })
        )
        .sort(
          (a, b) =>
            b.combined -
            a.combined
        )[0];

    if (
      shootout &&
      stories.length <
        6
    ) {
      const sides =
        gameSides(
          shootout.game,
          ownerMap
        );

      stories.push({
        label:
          "SHOOTOUT",

        title:
          `${sides[0].ownerName} vs. ${sides[1].ownerName}`,

        text:
          `They combined for ${formatScore(
            shootout.combined
          )} points, the highest-scoring matchup of Week ${latestCompletedWeek}.`,

        meta:
          `${formatScore(
            shootout.combined
          )} COMBINED`,
      });
    }
  }

  const aroundLeagueStories =
    stories.slice(
      0,
      6
    );

  // =======================================================
  // NEXT AVAILABLE WEEK
  // =======================================================

  const futureRegularWeeks =
    [
      ...new Set(
        currentSeasonMatchups
          .filter(
            (game) =>
              game.is_playoff !==
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
    futureRegularWeeks[0] ||
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
          true
    );

  // =======================================================
  // SCORE UPCOMING MATCHUPS
  // =======================================================

  const rankedPreviewGames =
    previewGames
      .map(
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
            "Unknown";

          const awayName =
            ownerMap.get(
              awayId
            ) ||
            "Unknown";

          const homeStanding =
            standingsMap.get(
              homeId
            );

          const awayStanding =
            standingsMap.get(
              awayId
            );

          const series =
            getSeries(
              matchups,
              homeId,
              awayId
            );

          const rivalry =
            isOfficialRivalry(
              homeName,
              awayName
            );

          const homeWins =
            homeStanding?.wins ||
            0;

          const awayWins =
            awayStanding?.wins ||
            0;

          const homeLosses =
            homeStanding?.losses ||
            0;

          const awayLosses =
            awayStanding?.losses ||
            0;

          const bothStrong =
            homeWins +
            awayWins;

          const recordCloseness =
            Math.max(
              0,
              5 -
                Math.abs(
                  homeWins -
                    awayWins
                )
            );

          const undefeatedBonus =
            (
              homeWins > 0 &&
              homeLosses === 0
            ) ||
            (
              awayWins > 0 &&
              awayLosses === 0
            )
              ? 5
              : 0;

          const seriesCloseness =
            Math.max(
              0,
              4 -
                Math.abs(
                  series.owner1Wins -
                    series.owner2Wins
                )
            );

          const hypeScore =
            bothStrong *
              2 +
            recordCloseness +
            undefeatedBonus +
            seriesCloseness +
            (
              rivalry
                ? 10
                : 0
            );

          return {
            ...game,

            homeId,

            awayId,

            homeName,

            awayName,

            homeStanding,

            awayStanding,

            series,

            rivalry,

            hypeScore,
          };
        }
      )
      .sort(
        (a, b) =>
          b.hypeScore -
          a.hypeScore
      );

  const gameOfWeek =
    rankedPreviewGames[0] ||
    null;

  // =======================================================
  // SERIES SUMMARY
  // =======================================================

  function seriesSummary(
    game
  ) {
    if (
      !game ||
      game.series.games ===
        0
    ) {
      return "First recorded meeting";
    }

    const {
      owner1Wins,
      owner2Wins,
      ties,
    } =
      game.series;

    if (
      owner1Wins >
      owner2Wins
    ) {
      return `${game.homeName} leads ${formatRecord(
        owner1Wins,
        owner2Wins,
        ties
      )}`;
    }

    if (
      owner2Wins >
      owner1Wins
    ) {
      return `${game.awayName} leads ${formatRecord(
        owner2Wins,
        owner1Wins,
        ties
      )}`;
    }

    return `Series tied ${formatRecord(
      owner1Wins,
      owner2Wins,
      ties
    )}`;
  }

  // =======================================================
  // GAME OF WEEK COPY
  // =======================================================

  function previewCopy(
    game
  ) {
    if (!game) {
      return "";
    }

    const homeRecord =
      game.homeStanding;

    const awayRecord =
      game.awayStanding;

    if (
      game.rivalry
    ) {
      return `An official Dirty P rivalry gets another chapter in Week ${previewWeek}. ${seriesSummary(
        game
      )}.`;
    }

    if (
      homeRecord &&
      homeRecord.losses ===
        0 &&
      homeRecord.wins >
        0
    ) {
      return `${game.homeName} puts an undefeated ${formatRecord(
        homeRecord.wins,
        homeRecord.losses,
        homeRecord.ties
      )} start on the line against ${game.awayName}. ${seriesSummary(
        game
      )}.`;
    }

    if (
      awayRecord &&
      awayRecord.losses ===
        0 &&
      awayRecord.wins >
        0
    ) {
      return `${game.awayName} puts an undefeated ${formatRecord(
        awayRecord.wins,
        awayRecord.losses,
        awayRecord.ties
      )} start on the line against ${game.homeName}. ${seriesSummary(
        game
      )}.`;
    }

    return `${game.awayName} and ${game.homeName} meet in Week ${previewWeek}. ${seriesSummary(
      game
    )}.`;
  }

  // =======================================================
  // PAGE
  // =======================================================

  return (
    <main className="page-shell">

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


      {/* =====================================================
          DEFENDING CHAMPION
          ===================================================== */}

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


      {/* =====================================================
          MAIN NAVIGATION
          ===================================================== */}

      <section className="quick-links">

        <Link href="/seasons">
          Seasons
        </Link>

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


      {/* =====================================================
          OWNER MAPPING WARNING
          ===================================================== */}

      {unmatchedEspnOwners.length >
        0 && (

        <section className="section-block">

          <article className="owner-card">

            <div className="owner-card-top">

              <div>

                <span className="owner-status">
                  ESPN OWNER MATCH WARNING
                </span>

                <h3>
                  Some current owners could not be matched
                </h3>

                <p className="owner-team-name">

                  {unmatchedEspnOwners
                    .map(
                      (owner) =>
                        `${owner.ownerName} (${owner.teamName})`
                    )
                    .join(", ")}

                </p>

              </div>

            </div>

          </article>

        </section>

      )}


      {/* =====================================================
          CURRENT STANDINGS
          ===================================================== */}

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

            {latestCompletedWeek >
            0
              ? `Through Week ${latestCompletedWeek}`
              : "Season Standings"}

          </span>

        </div>


        {currentStandings.length >
        0 ? (

          <div className="profile-table-wrap">

            <table className="profile-table">

              <thead>

                <tr>

                  <th>
                    RK
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

                {currentStandings.map(
                  (
                    standing,
                    index
                  ) => {

                    const inPlayoffs =
                      index <
                      playoffSpots;

                    return (

                      <tr
                        key={
                          standing.ownerId
                        }
                      >

                        <td>

                          <strong>
                            {index + 1}
                          </strong>

                        </td>


                        <td>

                          <Link
                            href={`/owners/${standing.ownerId}`}
                          >
                            <strong>
                              {standing.ownerName}
                            </strong>
                          </Link>

                        </td>


                        <td>
                          {standing.teamName}
                        </td>


                        <td>

                          {formatRecord(
                            standing.wins,
                            standing.losses,
                            standing.ties
                          )}

                        </td>


                        <td>

                          {formatScore(
                            standing.pointsFor
                          )}

                        </td>


                        <td>

                          {formatScore(
                            standing.pointsAgainst
                          )}

                        </td>


                        <td>

                          {inPlayoffs ? (

                            <span className="profile-champion-label">
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

        ) : (

          <div className="current-panel">

            <div className="empty-current-state">

              <strong>
                No current standings available.
              </strong>

            </div>

          </div>

        )}

      </section>


      {/* =====================================================
          PLAYOFF PICTURE
          ===================================================== */}

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
            Top {playoffSpots} Currently In
          </span>

        </div>


        <div className="owners-grid">

          {currentPlayoffTeams.map(
            (
              standing,
              index
            ) => (

              <article
                className="owner-card"
                key={
                  standing.ownerId
                }
              >

                <div className="owner-card-top">

                  <div>

                    <span className="owner-status">
                      SEED #{index + 1}
                    </span>

                    <h3>
                      {standing.ownerName}
                    </h3>

                    <p className="owner-team-name">
                      {standing.teamName}
                    </p>

                  </div>

                </div>


                <div className="owner-record">

                  <div>

                    <strong>

                      {formatRecord(
                        standing.wins,
                        standing.losses,
                        standing.ties
                      )}

                    </strong>

                    <span>
                      RECORD
                    </span>

                  </div>


                  <div>

                    <strong>

                      {formatScore(
                        standing.pointsFor
                      )}

                    </strong>

                    <span>
                      POINTS FOR
                    </span>

                  </div>

                </div>

              </article>

            )
          )}

        </div>


        {bubbleTeams.length >
          0 && (

          <div className="page-nav">

            <span>
              ON THE BUBBLE
            </span>

            <span>

              {bubbleTeams
                .map(
                  (team) =>
                    `${team.ownerName} (${formatRecord(
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


      {/* =====================================================
          AROUND THE LEAGUE
          ===================================================== */}

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

          <div className="owners-grid">

            {aroundLeagueStories.map(
              (
                story,
                index
              ) => (

                <article
                  className="owner-card"
                  key={`${story.label}-${index}`}
                >

                  <div className="owner-card-top">

                    <div>

                      <span className="owner-status">
                        {story.label}
                      </span>

                      <h3>
                        {story.title}
                      </h3>

                      <p className="owner-team-name">
                        {story.text}
                      </p>

                    </div>

                  </div>


                  <div className="owner-card-bottom">

                    <span>
                      Week {latestCompletedWeek}
                    </span>

                    <strong>
                      {story.meta}
                    </strong>

                  </div>

                </article>

              )
            )}

          </div>

        ) : (

          <div className="current-panel">

            <div className="empty-current-state">

              <strong>
                Around the League will appear after the first completed week.
              </strong>

              <p>
                Weekly stories will be generated automatically from league results.
              </p>

            </div>

          </div>

        )}

      </section>


      {/* =====================================================
          NEXT WEEK PREVIEW
          ===================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              NEXT UP · WEEK {previewWeek}
            </p>

            <h2>
              Next Week Preview
            </h2>

          </div>

          <span>
            What to Watch
          </span>

        </div>


        {gameOfWeek ? (

          <>

            <article className="owner-card">

              <div className="owner-card-top">

                <div>

                  <span className="owner-status">

                    {gameOfWeek.rivalry
                      ? "🔥 RIVALRY · GAME OF THE WEEK"
                      : "GAME OF THE WEEK"}

                  </span>

                  <h3>

                    {gameOfWeek.awayName}
                    {" vs. "}
                    {gameOfWeek.homeName}

                  </h3>

                  <p className="owner-team-name">
                    {previewCopy(
                      gameOfWeek
                    )}
                  </p>

                </div>

              </div>


              <div className="owner-record">

                <div>

                  <strong>

                    {gameOfWeek.awayStanding
                      ? formatRecord(
                          gameOfWeek
                            .awayStanding
                            .wins,
                          gameOfWeek
                            .awayStanding
                            .losses,
                          gameOfWeek
                            .awayStanding
                            .ties
                        )
                      : "—"}

                  </strong>

                  <span>
                    {gameOfWeek.awayName}
                  </span>

                </div>


                <div>

                  <strong>

                    {gameOfWeek.homeStanding
                      ? formatRecord(
                          gameOfWeek
                            .homeStanding
                            .wins,
                          gameOfWeek
                            .homeStanding
                            .losses,
                          gameOfWeek
                            .homeStanding
                            .ties
                        )
                      : "—"}

                  </strong>

                  <span>
                    {gameOfWeek.homeName}
                  </span>

                </div>

              </div>


              <div className="owner-card-bottom">

                <span>
                  {seriesSummary(
                    gameOfWeek
                  )}
                </span>

                <strong>
                  WEEK {previewWeek}
                </strong>

              </div>

            </article>


            {/* OTHER MATCHUPS */}

            {rankedPreviewGames.length >
              1 && (

              <div
                className="owners-grid"
                style={{
                  marginTop:
                    "14px",
                }}
              >

                {rankedPreviewGames
                  .slice(1)
                  .map(
                    (game) => (

                      <article
                        className="owner-card"
                        key={
                          game.id
                        }
                      >

                        <div className="owner-card-top">

                          <div>

                            <span className="owner-status">

                              {game.rivalry
                                ? "🔥 RIVALRY MATCHUP"
                                : `WEEK ${previewWeek}`}

                            </span>

                            <h3>

                              {game.awayName}
                              {" vs. "}
                              {game.homeName}

                            </h3>

                            <p className="owner-team-name">

                              {seriesSummary(
                                game
                              )}

                            </p>

                          </div>

                        </div>


                        <div className="owner-record">

                          <div>

                            <strong>

                              {game.awayStanding
                                ? formatRecord(
                                    game
                                      .awayStanding
                                      .wins,
                                    game
                                      .awayStanding
                                      .losses,
                                    game
                                      .awayStanding
                                      .ties
                                  )
                                : "—"}

                            </strong>

                            <span>
                              {game.awayName}
                            </span>

                          </div>


                          <div>

                            <strong>

                              {game.homeStanding
                                ? formatRecord(
                                    game
                                      .homeStanding
                                      .wins,
                                    game
                                      .homeStanding
                                      .losses,
                                    game
                                      .homeStanding
                                      .ties
                                  )
                                : "—"}

                            </strong>

                            <span>
                              {game.homeName}
                            </span>

                          </div>

                        </div>

                      </article>

                    )
                  )}

              </div>

            )}

          </>

        ) : (

          <div className="current-panel">

            <div className="empty-current-state">

              <strong>
                No Week {previewWeek} matchups available yet.
              </strong>

              <p>
                The preview will populate automatically once ESPN has the schedule.
              </p>

            </div>

          </div>

        )}

      </section>


      {/* =====================================================
          OWNER MAP
          ===================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              LEAGUE FOOTPRINT
            </p>

            <h2>
              Owner Map
            </h2>

          </div>

          <span>
            Where Dirty P Lives
          </span>

        </div>


        <article className="owner-card">

          <div className="owner-card-top">

            <div>

              <span className="owner-status">
                OWNER LOCATIONS
              </span>

              <h3>
                League Map
              </h3>

              <p className="owner-team-name">
                The homepage is ready for the owner map. We just need to add each owner&apos;s current city so we can plot the locations accurately.
              </p>

            </div>

          </div>

          <div className="owner-card-bottom">

            <span>
              {currentStandings.length} Current Owners
            </span>

            <strong>
              MAP COMING NEXT
            </strong>

          </div>

        </article>

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
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>

      </footer>

    </main>
  );
}
