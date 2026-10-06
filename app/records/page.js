import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

// =========================================================
// HELPERS
// =========================================================

function number(value) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function formatScore(value) {
  return number(
    value
  ).toFixed(2);
}

function getGameType(game) {
  const matchupType =
    String(
      game.matchup_type ||
        ""
    )
      .trim()
      .toLowerCase();

  const playoffTier =
    String(
      game.playoff_tier ||
        ""
    )
      .trim()
      .toLowerCase();

  if (
    matchupType ===
      "consolation" ||
    matchupType.includes(
      "consolation"
    ) ||
    playoffTier.includes(
      "consolation"
    ) ||
    playoffTier.includes(
      "losers"
    ) ||
    playoffTier.includes(
      "loser"
    )
  ) {
    return "consolation";
  }

  if (
    matchupType ===
      "playoff" ||
    matchupType.includes(
      "championship"
    ) ||
    playoffTier.includes(
      "winners_bracket"
    ) ||
    playoffTier.includes(
      "winner"
    ) ||
    playoffTier.includes(
      "championship"
    ) ||
    game.is_championship ===
      true
  ) {
    return "playoff";
  }

  return "regular";
}

function gameSides(game) {
  return [
    {
      ownerId:
        Number(
          game.home_owner_id
        ),

      teamName:
        game.home_team_name ||
        "Unknown Team",

      score:
        number(
          game.home_score
        ),

      opponentOwnerId:
        Number(
          game.away_owner_id
        ),

      opponentTeamName:
        game.away_team_name ||
        "Unknown Team",

      opponentScore:
        number(
          game.away_score
        ),

      side:
        "HOME",

      season_year:
        Number(
          game.season_year
        ),

      matchup_period:
        Number(
          game.matchup_period
        ),
    },

    {
      ownerId:
        Number(
          game.away_owner_id
        ),

      teamName:
        game.away_team_name ||
        "Unknown Team",

      score:
        number(
          game.away_score
        ),

      opponentOwnerId:
        Number(
          game.home_owner_id
        ),

      opponentTeamName:
        game.home_team_name ||
        "Unknown Team",

      opponentScore:
        number(
          game.home_score
        ),

      side:
        "AWAY",

      season_year:
        Number(
          game.season_year
        ),

      matchup_period:
        Number(
          game.matchup_period
        ),
    },
  ];
}

function resultForSide(
  game,
  side
) {
  const winner =
    String(
      game.winner || ""
    ).toUpperCase();

  if (
    winner === "TIE"
  ) {
    return "T";
  }

  if (
    winner === side
  ) {
    return "W";
  }

  if (
    winner === "HOME" ||
    winner === "AWAY"
  ) {
    return "L";
  }

  const home =
    number(
      game.home_score
    );

  const away =
    number(
      game.away_score
    );

  if (
    home === away
  ) {
    return "T";
  }

  if (
    side === "HOME"
  ) {
    return home > away
      ? "W"
      : "L";
  }

  return away > home
    ? "W"
    : "L";
}

function getOwnerName(
  ownerMap,
  ownerId
) {
  return (
    ownerMap.get(
      Number(ownerId)
    ) ||
    "Unknown Owner"
  );
}

// =========================================================
// OWNER-STYLE RECORD CARD
// =========================================================

function RecordCard({
  label,
  value,
  owner,
  team,
  detail,
  opponent,
}) {
  return (
    <article className="owner-card">

      <div className="owner-card-top">

        <div>

          <span className="owner-status">
            {label}
          </span>

          <h3>
            {value}
          </h3>

          <p className="owner-team-name">
            {owner}
          </p>

        </div>

      </div>


      <div className="owner-record">

        <div>

          <strong>
            {team || "Career"}
          </strong>

          <span>
            CONTEXT
          </span>

        </div>


        <div>

          <strong>
            {detail || "—"}
          </strong>

          <span>
            DETAIL
          </span>

        </div>

      </div>


      <div className="owner-card-bottom">

        <span>
          {opponent ||
            "Dirty P Fantasy Football"}
        </span>

        <strong>
          RECORD BOOK
        </strong>

      </div>

    </article>
  );
}

// =========================================================
// PAGE
// =========================================================

export default async function RecordsPage() {
  const [
    {
      data: owners,
      error: ownersError,
    },
    {
      data: matchupData,
      error: matchupError,
    },
  ] =
    await Promise.all([
      supabase
        .from("owners")
        .select(
          "id, name"
        ),

      supabase
        .from("matchups")
        .select("*")
        .lt(
          "season_year",
          CURRENT_SEASON
        )
        .order(
          "season_year",
          {
            ascending:
              true,
          }
        )
        .order(
          "matchup_period",
          {
            ascending:
              true,
          }
        ),
    ]);

  if (
    ownersError ||
    matchupError
  ) {
    return (
      <main className="page-shell">

        <h1>
          Records
        </h1>

        <p>
          Database error:{" "}
          {ownersError?.message ||
            matchupError?.message}
        </p>

      </main>
    );
  }

  const ownerMap =
    new Map(
      (owners || []).map(
        (owner) => [
          Number(owner.id),
          owner.name,
        ]
      )
    );

  const completedGames =
    (
      matchupData ||
      []
    ).filter(
      (game) => {
        const home =
          Number(
            game.home_score
          );

        const away =
          Number(
            game.away_score
          );

        return (
          game.home_score !==
            null &&
          game.away_score !==
            null &&
          Number.isFinite(
            home
          ) &&
          Number.isFinite(
            away
          ) &&
          !(
            home === 0 &&
            away === 0
          )
        );
      }
    );

  const completedSeasonYears =
    [
      ...new Set(
        completedGames.map(
          (game) =>
            Number(
              game.season_year
            )
        )
      ),
    ]
      .filter(
        (year) =>
          Number.isFinite(
            year
          )
      )
      .sort(
        (a, b) =>
          a - b
      );

  const firstSeason =
    completedSeasonYears[0] ||
    2014;

  const latestCompletedSeason =
    completedSeasonYears[
      completedSeasonYears.length -
        1
    ] || 2025;

  const regularGames =
    completedGames.filter(
      (game) =>
        getGameType(
          game
        ) === "regular"
    );

  const playoffGames =
    completedGames.filter(
      (game) =>
        getGameType(
          game
        ) === "playoff"
    );

  const officialGames = [
    ...regularGames,
    ...playoffGames,
  ];

  const championshipGames =
    playoffGames.filter(
      (game) =>
        game.is_championship ===
        true
    );

  const officialSides =
    officialGames.flatMap(
      gameSides
    );

  const regularSides =
    regularGames.flatMap(
      gameSides
    );

  const playoffSides =
    playoffGames.flatMap(
      gameSides
    );

  // =========================================================
  // SINGLE GAME
  // =========================================================

  const highestRegularScore =
    [...regularSides].sort(
      (a, b) =>
        b.score -
        a.score
    )[0];

  const lowestRegularScore =
    [...regularSides]
      .filter(
        (side) =>
          side.score > 0
      )
      .sort(
        (a, b) =>
          a.score -
          b.score
      )[0];

  const highestOverallScore =
    [...officialSides].sort(
      (a, b) =>
        b.score -
        a.score
    )[0];

  const highestPlayoffScore =
    [...playoffSides].sort(
      (a, b) =>
        b.score -
        a.score
    )[0];

  const biggestRegularWin =
    [...regularGames]
      .map(
        (game) => ({
          game,

          margin:
            Math.abs(
              number(
                game.home_score
              ) -
                number(
                  game.away_score
                )
            ),
        })
      )
      .sort(
        (a, b) =>
          b.margin -
          a.margin
      )[0];

  const closestRegularGame =
    [...regularGames]
      .filter(
        (game) =>
          number(
            game.home_score
          ) !==
          number(
            game.away_score
          )
      )
      .map(
        (game) => ({
          game,

          margin:
            Math.abs(
              number(
                game.home_score
              ) -
                number(
                  game.away_score
                )
            ),
        })
      )
      .sort(
        (a, b) =>
          a.margin -
          b.margin
      )[0];

  // =========================================================
  // SEASON STATS
  // =========================================================

  const seasonStats =
    new Map();

  for (
    const game of
    regularGames
  ) {
    for (
      const side of
      gameSides(game)
    ) {
      const key =
        `${game.season_year}-${side.ownerId}`;

      if (
        !seasonStats.has(
          key
        )
      ) {
        seasonStats.set(
          key,
          {
            season:
              Number(
                game.season_year
              ),

            ownerId:
              side.ownerId,

            teamName:
              side.teamName,

            wins: 0,
            losses: 0,
            ties: 0,

            pointsFor: 0,
            pointsAgainst: 0,

            games: 0,
          }
        );
      }

      const stat =
        seasonStats.get(
          key
        );

      const result =
        resultForSide(
          game,
          side.side
        );

      stat.games += 1;

      stat.pointsFor +=
        side.score;

      stat.pointsAgainst +=
        side.opponentScore;

      if (
        result === "W"
      ) {
        stat.wins += 1;
      }

      if (
        result === "L"
      ) {
        stat.losses += 1;
      }

      if (
        result === "T"
      ) {
        stat.ties += 1;
      }
    }
  }

  const seasonRows =
    [...seasonStats.values()].map(
      (row) => ({
        ...row,

        winPct:
          row.games > 0
            ? (
                row.wins +
                row.ties *
                  0.5
              ) /
              row.games
            : 0,

        average:
          row.games > 0
            ? row.pointsFor /
              row.games
            : 0,
      })
    );

  const mostWinsSeason =
    [...seasonRows].sort(
      (a, b) => {
        if (
          b.wins !== a.wins
        ) {
          return (
            b.wins -
            a.wins
          );
        }

        return (
          b.winPct -
          a.winPct
        );
      }
    )[0];

  const bestSeasonRecord =
    [...seasonRows].sort(
      (a, b) => {
        if (
          b.winPct !==
          a.winPct
        ) {
          return (
            b.winPct -
            a.winPct
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
    )[0];

  const mostPointsSeason =
    [...seasonRows].sort(
      (a, b) =>
        b.pointsFor -
        a.pointsFor
    )[0];

  const bestAverageSeason =
    [...seasonRows].sort(
      (a, b) =>
        b.average -
        a.average
    )[0];

  // =========================================================
  // CAREER STATS
  // =========================================================

  const careerStats =
    new Map();

  for (
    const game of
    regularGames
  ) {
    for (
      const side of
      gameSides(game)
    ) {
      if (
        !careerStats.has(
          side.ownerId
        )
      ) {
        careerStats.set(
          side.ownerId,
          {
            ownerId:
              side.ownerId,

            wins: 0,
            losses: 0,
            ties: 0,

            games: 0,

            pointsFor: 0,

            seasons:
              new Set(),
          }
        );
      }

      const stat =
        careerStats.get(
          side.ownerId
        );

      const result =
        resultForSide(
          game,
          side.side
        );

      stat.games += 1;

      stat.pointsFor +=
        side.score;

      stat.seasons.add(
        Number(
          game.season_year
        )
      );

      if (
        result === "W"
      ) {
        stat.wins += 1;
      }

      if (
        result === "L"
      ) {
        stat.losses += 1;
      }

      if (
        result === "T"
      ) {
        stat.ties += 1;
      }
    }
  }

  const careerRows =
    [...careerStats.values()].map(
      (row) => ({
        ...row,

        winPct:
          row.games > 0
            ? (
                row.wins +
                row.ties *
                  0.5
              ) /
              row.games
            : 0,
      })
    );

  const mostCareerWins =
    [...careerRows].sort(
      (a, b) =>
        b.wins -
        a.wins
    )[0];

  const mostCareerPoints =
    [...careerRows].sort(
      (a, b) =>
        b.pointsFor -
        a.pointsFor
    )[0];

  const bestCareerWinPct =
    [...careerRows]
      .filter(
        (row) =>
          row.games >= 20
      )
      .sort(
        (a, b) => {
          if (
            b.winPct !==
            a.winPct
          ) {
            return (
              b.winPct -
              a.winPct
            );
          }

          return (
            b.wins -
            a.wins
          );
        }
      )[0];

  // =========================================================
  // PLAYOFF CAREER
  // =========================================================

  const playoffStats =
    new Map();

  for (
    const game of
    playoffGames
  ) {
    for (
      const side of
      gameSides(game)
    ) {
      if (
        !playoffStats.has(
          side.ownerId
        )
      ) {
        playoffStats.set(
          side.ownerId,
          {
            ownerId:
              side.ownerId,

            wins: 0,
            losses: 0,
            ties: 0,
          }
        );
      }

      const stat =
        playoffStats.get(
          side.ownerId
        );

      const result =
        resultForSide(
          game,
          side.side
        );

      if (
        result === "W"
      ) {
        stat.wins += 1;
      }

      if (
        result === "L"
      ) {
        stat.losses += 1;
      }

      if (
        result === "T"
      ) {
        stat.ties += 1;
      }
    }
  }

  const mostPlayoffWins =
    [
      ...playoffStats.values(),
    ].sort(
      (a, b) =>
        b.wins -
        a.wins
    )[0];

  // =========================================================
  // CHAMPIONSHIP GAMES
  // =========================================================

  const championshipDetails =
    championshipGames.map(
      (game) => {
        const sides =
          gameSides(game);

        const homeScore =
          number(
            game.home_score
          );

        const awayScore =
          number(
            game.away_score
          );

        let winnerSide;

        const officialWinner =
          String(
            game.winner || ""
          ).toUpperCase();

        if (
          officialWinner ===
          "HOME"
        ) {
          winnerSide =
            sides[0];
        } else if (
          officialWinner ===
          "AWAY"
        ) {
          winnerSide =
            sides[1];
        } else {
          winnerSide =
            homeScore >=
            awayScore
              ? sides[0]
              : sides[1];
        }

        return {
          game,
          winnerSide,

          margin:
            Math.abs(
              homeScore -
                awayScore
            ),

          combined:
            homeScore +
            awayScore,

          highScore:
            Math.max(
              homeScore,
              awayScore
            ),
        };
      }
    );

  const closestChampionship =
    [
      ...championshipDetails,
    ].sort(
      (a, b) =>
        a.margin -
        b.margin
    )[0];

  const biggestChampionship =
    [
      ...championshipDetails,
    ].sort(
      (a, b) =>
        b.margin -
        a.margin
    )[0];

  const highestChampionshipScore =
    [
      ...championshipDetails,
    ].sort(
      (a, b) =>
        b.highScore -
        a.highScore
    )[0];

  const highestCombinedChampionship =
    [
      ...championshipDetails,
    ].sort(
      (a, b) =>
        b.combined -
        a.combined
    )[0];

  // =========================================================
  // STREAKS
  // =========================================================

  const gamesByOwner =
    new Map();

  for (
    const game of
    regularGames
  ) {
    for (
      const side of
      gameSides(game)
    ) {
      if (
        !gamesByOwner.has(
          side.ownerId
        )
      ) {
        gamesByOwner.set(
          side.ownerId,
          []
        );
      }

      gamesByOwner
        .get(
          side.ownerId
        )
        .push({
          season:
            Number(
              game.season_year
            ),

          week:
            Number(
              game.matchup_period
            ),

          result:
            resultForSide(
              game,
              side.side
            ),
        });
    }
  }

  let longestWinStreak =
    null;

  let longestLossStreak =
    null;

  for (
    const [
      ownerId,
      games,
    ] of
    gamesByOwner.entries()
  ) {
    games.sort(
      (a, b) =>
        a.season -
          b.season ||
        a.week -
          b.week
    );

    let currentWins = 0;
    let currentLosses = 0;

    let winStart = null;
    let lossStart = null;

    for (
      const game of
      games
    ) {
      if (
        game.result ===
        "W"
      ) {
        if (
          currentWins ===
          0
        ) {
          winStart = {
            season:
              game.season,

            week:
              game.week,
          };
        }

        currentWins += 1;
        currentLosses = 0;
        lossStart = null;

        if (
          !longestWinStreak ||
          currentWins >
            longestWinStreak.count
        ) {
          longestWinStreak = {
            ownerId,
            count:
              currentWins,

            start:
              winStart,

            end: {
              season:
                game.season,

              week:
                game.week,
            },
          };
        }
      } else if (
        game.result ===
        "L"
      ) {
        if (
          currentLosses ===
          0
        ) {
          lossStart = {
            season:
              game.season,

            week:
              game.week,
          };
        }

        currentLosses += 1;
        currentWins = 0;
        winStart = null;

        if (
          !longestLossStreak ||
          currentLosses >
            longestLossStreak.count
        ) {
          longestLossStreak = {
            ownerId,
            count:
              currentLosses,

            start:
              lossStart,

            end: {
              season:
                game.season,

              week:
                game.week,
            },
          };
        }
      } else {
        currentWins = 0;
        currentLosses = 0;

        winStart = null;
        lossStart = null;
      }
    }
  }

  // =========================================================
  // WINNER HELPERS
  // =========================================================

  function winnerFromGame(
    game
  ) {
    if (!game) {
      return null;
    }

    const sides =
      gameSides(game);

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

    return [...sides].sort(
      (a, b) =>
        b.score -
        a.score
    )[0];
  }

  function loserFromGame(
    game
  ) {
    if (!game) {
      return null;
    }

    const sides =
      gameSides(game);

    const winner =
      String(
        game.winner || ""
      ).toUpperCase();

    if (
      winner === "HOME"
    ) {
      return sides[1];
    }

    if (
      winner === "AWAY"
    ) {
      return sides[0];
    }

    return [...sides].sort(
      (a, b) =>
        a.score -
        b.score
    )[0];
  }

  const biggestWinWinner =
    biggestRegularWin
      ? winnerFromGame(
          biggestRegularWin.game
        )
      : null;

  const closestWinner =
    closestRegularGame
      ? winnerFromGame(
          closestRegularGame.game
        )
      : null;

  const closestLoser =
    closestRegularGame
      ? loserFromGame(
          closestRegularGame.game
        )
      : null;

  // =========================================================
  // PAGE
  // =========================================================

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

      <section className="owners-hero">

        <div>

          <p className="eyebrow">
            LEAGUE RECORD BOOK
          </p>

          <h1>
            Records
          </h1>

          <p>
            The biggest scores, strongest
            seasons, career leaders,
            postseason performances and
            longest streaks in Dirty P
            history.
          </p>

        </div>


        <div className="owners-count">

          <strong>
            {
              completedSeasonYears.length
            }
          </strong>

          <span>
            SEASONS
          </span>

        </div>

      </section>


      {/* NAV */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          {firstSeason}–
          {latestCompletedSeason}
        </span>

      </nav>


      {/* =====================================================
          WEEKLY
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              SINGLE GAME
            </p>

            <h2>
              Weekly Records
            </h2>

          </div>

        </div>


        <div className="owners-grid">

          {highestRegularScore && (

            <RecordCard
              label="HIGHEST REGULAR-SEASON SCORE"

              value={formatScore(
                highestRegularScore.score
              )}

              owner={getOwnerName(
                ownerMap,
                highestRegularScore.ownerId
              )}

              team={
                highestRegularScore.teamName
              }

              detail={`${highestRegularScore.season_year} · Week ${highestRegularScore.matchup_period}`}
            />

          )}


          {lowestRegularScore && (

            <RecordCard
              label="LOWEST REGULAR-SEASON SCORE"

              value={formatScore(
                lowestRegularScore.score
              )}

              owner={getOwnerName(
                ownerMap,
                lowestRegularScore.ownerId
              )}

              team={
                lowestRegularScore.teamName
              }

              detail={`${lowestRegularScore.season_year} · Week ${lowestRegularScore.matchup_period}`}
            />

          )}


          {highestOverallScore && (

            <RecordCard
              label="HIGHEST SCORE · ANY OFFICIAL GAME"

              value={formatScore(
                highestOverallScore.score
              )}

              owner={getOwnerName(
                ownerMap,
                highestOverallScore.ownerId
              )}

              team={
                highestOverallScore.teamName
              }

              detail={`${highestOverallScore.season_year} · Week ${highestOverallScore.matchup_period}`}
            />

          )}


          {biggestRegularWin &&
            biggestWinWinner && (

            <RecordCard
              label="BIGGEST REGULAR-SEASON WIN"

              value={`+${formatScore(
                biggestRegularWin.margin
              )}`}

              owner={getOwnerName(
                ownerMap,
                biggestWinWinner.ownerId
              )}

              team={
                biggestWinWinner.teamName
              }

              detail={`${biggestRegularWin.game.season_year} · Week ${biggestRegularWin.game.matchup_period}`}

              opponent={`vs. ${biggestWinWinner.opponentTeamName}`}
            />

          )}


          {closestRegularGame &&
            closestWinner &&
            closestLoser && (

            <RecordCard
              label="CLOSEST REGULAR-SEASON GAME"

              value={formatScore(
                closestRegularGame.margin
              )}

              owner={getOwnerName(
                ownerMap,
                closestWinner.ownerId
              )}

              team={
                closestWinner.teamName
              }

              detail={`${closestRegularGame.game.season_year} · Week ${closestRegularGame.game.matchup_period}`}

              opponent={`over ${closestLoser.teamName}`}
            />

          )}

        </div>

      </section>


      {/* =====================================================
          SEASON RECORDS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              SINGLE SEASON
            </p>

            <h2>
              Season Records
            </h2>

          </div>

        </div>


        <div className="owners-grid">

          {bestSeasonRecord && (

            <RecordCard
              label="BEST REGULAR-SEASON RECORD"

              value={formatRecord(
                bestSeasonRecord.wins,
                bestSeasonRecord.losses,
                bestSeasonRecord.ties
              )}

              owner={getOwnerName(
                ownerMap,
                bestSeasonRecord.ownerId
              )}

              team={
                bestSeasonRecord.teamName
              }

              detail={`${bestSeasonRecord.season}`}
            />

          )}


          {mostWinsSeason && (

            <RecordCard
              label="MOST REGULAR-SEASON WINS"

              value={`${mostWinsSeason.wins}`}

              owner={getOwnerName(
                ownerMap,
                mostWinsSeason.ownerId
              )}

              team={
                mostWinsSeason.teamName
              }

              detail={`${mostWinsSeason.season}`}
            />

          )}


          {mostPointsSeason && (

            <RecordCard
              label="MOST REGULAR-SEASON POINTS"

              value={formatScore(
                mostPointsSeason.pointsFor
              )}

              owner={getOwnerName(
                ownerMap,
                mostPointsSeason.ownerId
              )}

              team={
                mostPointsSeason.teamName
              }

              detail={`${mostPointsSeason.season}`}
            />

          )}


          {bestAverageSeason && (

            <RecordCard
              label="HIGHEST POINTS PER GAME"

              value={formatScore(
                bestAverageSeason.average
              )}

              owner={getOwnerName(
                ownerMap,
                bestAverageSeason.ownerId
              )}

              team={
                bestAverageSeason.teamName
              }

              detail={`${bestAverageSeason.season}`}
            />

          )}

        </div>

      </section>


      {/* =====================================================
          CAREER
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              ALL-TIME
            </p>

            <h2>
              Career Records
            </h2>

          </div>

        </div>


        <div className="owners-grid">

          {mostCareerWins && (

            <RecordCard
              label="MOST REGULAR-SEASON WINS"

              value={`${mostCareerWins.wins}`}

              owner={getOwnerName(
                ownerMap,
                mostCareerWins.ownerId
              )}

              team="Career"

              detail={`${mostCareerWins.wins}-${mostCareerWins.losses}${
                mostCareerWins.ties
                  ? `-${mostCareerWins.ties}`
                  : ""
              } record`}
            />

          )}


          {bestCareerWinPct && (

            <RecordCard
              label="BEST CAREER WIN %"

              value={`${(
                bestCareerWinPct.winPct *
                100
              ).toFixed(1)}%`}

              owner={getOwnerName(
                ownerMap,
                bestCareerWinPct.ownerId
              )}

              team="Minimum 20 games"

              detail={`${bestCareerWinPct.wins}-${bestCareerWinPct.losses}${
                bestCareerWinPct.ties
                  ? `-${bestCareerWinPct.ties}`
                  : ""
              } record`}
            />

          )}


          {mostCareerPoints && (

            <RecordCard
              label="MOST CAREER REGULAR-SEASON POINTS"

              value={formatScore(
                mostCareerPoints.pointsFor
              )}

              owner={getOwnerName(
                ownerMap,
                mostCareerPoints.ownerId
              )}

              team={`${mostCareerPoints.seasons.size} seasons`}

              detail="Career regular season"
            />

          )}


          {mostPlayoffWins && (

            <RecordCard
              label="MOST CHAMPIONSHIP-BRACKET WINS"

              value={`${mostPlayoffWins.wins}`}

              owner={getOwnerName(
                ownerMap,
                mostPlayoffWins.ownerId
              )}

              team="Playoffs"

              detail={`${mostPlayoffWins.wins}-${mostPlayoffWins.losses} playoff record`}
            />

          )}

        </div>

      </section>


      {/* =====================================================
          PLAYOFFS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              POSTSEASON
            </p>

            <h2>
              Playoff Records
            </h2>

          </div>

        </div>


        <div className="owners-grid">

          {highestPlayoffScore && (

            <RecordCard
              label="HIGHEST PLAYOFF SCORE"

              value={formatScore(
                highestPlayoffScore.score
              )}

              owner={getOwnerName(
                ownerMap,
                highestPlayoffScore.ownerId
              )}

              team={
                highestPlayoffScore.teamName
              }

              detail={`${highestPlayoffScore.season_year} · Week ${highestPlayoffScore.matchup_period}`}
            />

          )}


          {highestChampionshipScore && (

            <RecordCard
              label="HIGHEST CHAMPIONSHIP SCORE"

              value={formatScore(
                highestChampionshipScore.highScore
              )}

              owner={getOwnerName(
                ownerMap,
                highestChampionshipScore
                  .winnerSide
                  .ownerId
              )}

              team={
                highestChampionshipScore
                  .winnerSide
                  .teamName
              }

              detail={`${highestChampionshipScore.game.season_year} Championship`}
            />

          )}


          {closestChampionship && (

            <RecordCard
              label="CLOSEST CHAMPIONSHIP"

              value={formatScore(
                closestChampionship.margin
              )}

              owner={getOwnerName(
                ownerMap,
                closestChampionship
                  .winnerSide
                  .ownerId
              )}

              team={
                closestChampionship
                  .winnerSide
                  .teamName
              }

              detail={`${closestChampionship.game.season_year} Championship`}
            />

          )}


          {biggestChampionship && (

            <RecordCard
              label="BIGGEST CHAMPIONSHIP WIN"

              value={`+${formatScore(
                biggestChampionship.margin
              )}`}

              owner={getOwnerName(
                ownerMap,
                biggestChampionship
                  .winnerSide
                  .ownerId
              )}

              team={
                biggestChampionship
                  .winnerSide
                  .teamName
              }

              detail={`${biggestChampionship.game.season_year} Championship`}
            />

          )}


          {highestCombinedChampionship && (

            <RecordCard
              label="HIGHEST-SCORING CHAMPIONSHIP"

              value={formatScore(
                highestCombinedChampionship.combined
              )}

              owner={`${highestCombinedChampionship.game.home_team_name} vs. ${highestCombinedChampionship.game.away_team_name}`}

              team="Combined Points"

              detail={`${highestCombinedChampionship.game.season_year} Championship`}
            />

          )}

        </div>

      </section>


      {/* =====================================================
          STREAKS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              STREAKS
            </p>

            <h2>
              Historic Streaks
            </h2>

          </div>

        </div>


        <div className="owners-grid">

          {longestWinStreak && (

            <RecordCard
              label="LONGEST REGULAR-SEASON WIN STREAK"

              value={`${longestWinStreak.count} Games`}

              owner={getOwnerName(
                ownerMap,
                longestWinStreak.ownerId
              )}

              team="Winning Streak"

              detail={`${longestWinStreak.start.season} W${longestWinStreak.start.week} → ${longestWinStreak.end.season} W${longestWinStreak.end.week}`}
            />

          )}


          {longestLossStreak && (

            <RecordCard
              label="LONGEST REGULAR-SEASON LOSING STREAK"

              value={`${longestLossStreak.count} Games`}

              owner={getOwnerName(
                ownerMap,
                longestLossStreak.ownerId
              )}

              team="Losing Streak"

              detail={`${longestLossStreak.start.season} W${longestLossStreak.start.week} → ${longestLossStreak.end.season} W${longestLossStreak.end.week}`}
            />

          )}

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
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>

      </footer>

    </main>
  );
}
