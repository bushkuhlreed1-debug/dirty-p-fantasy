import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;
const RIVALRY_WEEK = 11;

// =========================================================
// OFFICIAL DIRTY P RIVALRY WEEK MATCHUPS
// =========================================================

const RIVALRIES = [
  {
    owner1: "Jacob Madden",
    owner2: "Cody Stinnett",
  },
  {
    owner1: "Ryan Goodlett",
    owner2: "Matthew Aitkens",
  },
  {
    owner1: "Brent Fleischer",
    owner2: "Valentin Almendarez",
  },
  {
    owner1: "Tyler Guenther",
    owner2: "Edward Wachtel",
  },
  {
    owner1: "Reed Bushkuhl",
    owner2: "Austin Lloyd",
  },
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

function recordText(
  wins,
  losses,
  ties = 0
) {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[“”"'’]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findOwner(
  owners,
  targetName
) {
  const target =
    normalizeName(
      targetName
    );

  const exact =
    owners.find(
      (owner) =>
        normalizeName(
          owner.name
        ) === target
    );

  if (exact) {
    return exact;
  }

  const pieces =
    target.split(" ");

  const first =
    pieces[0];

  const last =
    pieces[
      pieces.length - 1
    ];

  return (
    owners.find(
      (owner) => {
        const normalized =
          normalizeName(
            owner.name
          );

        return (
          normalized.includes(
            first
          ) &&
          normalized.includes(
            last
          )
        );
      }
    ) || null
  );
}

function getResult(
  game,
  ownerId
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

  if (
    ownerId !== homeId &&
    ownerId !== awayId
  ) {
    return null;
  }

  const ownerScore =
    ownerId === homeId
      ? homeScore
      : awayScore;

  const opponentScore =
    ownerId === homeId
      ? awayScore
      : homeScore;

  if (
    ownerScore >
    opponentScore
  ) {
    return "W";
  }

  if (
    ownerScore <
    opponentScore
  ) {
    return "L";
  }

  return "T";
}

function buildRecord(
  games,
  owner1Id
) {
  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  games.forEach(
    (game) => {
      const result =
        getResult(
          game,
          owner1Id
        );

      if (
        result === "W"
      ) {
        owner1Wins += 1;
      }

      if (
        result === "L"
      ) {
        owner2Wins += 1;
      }

      if (
        result === "T"
      ) {
        ties += 1;
      }
    }
  );

  return {
    owner1Wins,
    owner2Wins,
    ties,
  };
}

function getWinnerId(game) {
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
    return Number(
      game.home_owner_id
    );
  }

  if (
    awayScore >
    homeScore
  ) {
    return Number(
      game.away_owner_id
    );
  }

  return null;
}

function getOwnerScore(
  game,
  ownerId
) {
  if (
    Number(
      game.home_owner_id
    ) === ownerId
  ) {
    return num(
      game.home_score
    );
  }

  return num(
    game.away_score
  );
}

function getCurrentStreak(
  games,
  owner1Id,
  owner2Id
) {
  if (
    games.length === 0
  ) {
    return null;
  }

  const sorted =
    [...games].sort(
      (a, b) => {
        if (
          Number(
            b.season_year
          ) !==
          Number(
            a.season_year
          )
        ) {
          return (
            Number(
              b.season_year
            ) -
            Number(
              a.season_year
            )
          );
        }

        return (
          Number(
            b.matchup_period
          ) -
          Number(
            a.matchup_period
          )
        );
      }
    );

  const latestWinner =
    getWinnerId(
      sorted[0]
    );

  if (
    latestWinner ===
    null
  ) {
    return null;
  }

  let count = 0;

  for (
    const game of sorted
  ) {
    const winner =
      getWinnerId(game);

    if (
      winner ===
      latestWinner
    ) {
      count += 1;
    } else {
      break;
    }
  }

  return {
    ownerId:
      latestWinner,

    owner:
      latestWinner ===
      owner1Id
        ? "owner1"
        : latestWinner ===
            owner2Id
          ? "owner2"
          : null,

    count,
  };
}

function buildSeriesBlurb(
  rivalry
) {
  if (
    rivalry.meetings ===
    0
  ) {
    return "No completed meetings yet. Rivalry Week gets the first word.";
  }

  const wins1 =
    rivalry.overall
      .owner1Wins;

  const wins2 =
    rivalry.overall
      .owner2Wins;

  const difference =
    Math.abs(
      wins1 - wins2
    );

  if (
    wins1 === wins2
  ) {
    return `Dead even after ${rivalry.meetings} meetings. Somebody gets a chance to grab the upper hand.`;
  }

  const leader =
    wins1 > wins2
      ? rivalry.owner1Name
      : rivalry.owner2Name;

  const trailer =
    wins1 > wins2
      ? rivalry.owner2Name
      : rivalry.owner1Name;

  if (
    difference === 1
  ) {
    return `Only one game separates the all-time series. ${leader} has the edge, but ${trailer} is right there.`;
  }

  if (
    difference <= 3
  ) {
    return `${leader} owns the historical edge, but this series is still close enough to swing quickly.`;
  }

  return `${leader} has controlled the all-time series. Rivalry Week gives ${trailer} another shot to cut into it.`;
}

// =========================================================
// PAGE
// =========================================================

export default async function RivalryWeek() {
  const [
    {
      data: owners,
      error: ownersError,
    },

    {
      data: matchups,
      error: matchupsError,
    },
  ] =
    await Promise.all([
      supabase
        .from("owners")
        .select(`
          id,
          name
        `),

      supabase
        .from("matchups")
        .select(`
          id,
          season_year,
          matchup_period,
          home_owner_id,
          away_owner_id,
          home_team_name,
          away_team_name,
          home_score,
          away_score,
          winner
        `)
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

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (
    ownersError ||
    matchupsError
  ) {
    return (
      <main className="page-shell">

        <h1>
          Rivalry Week
        </h1>

        <p>
          Database error:{" "}
          {ownersError?.message ||
            matchupsError?.message}
        </p>

      </main>
    );
  }

  const ownerList =
    owners || [];

  // =========================================================
  // COMPLETED GAMES
  // =========================================================

  const completedGames =
    (
      matchups || []
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
          game.home_owner_id &&
          game.away_owner_id &&
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

  // =========================================================
  // BUILD RIVALRY DATA
  // =========================================================

  const rivalryData =
    RIVALRIES.map(
      (
        rivalry,
        index
      ) => {
        const owner1 =
          findOwner(
            ownerList,
            rivalry.owner1
          );

        const owner2 =
          findOwner(
            ownerList,
            rivalry.owner2
          );

        const owner1Id =
          owner1
            ? Number(
                owner1.id
              )
            : null;

        const owner2Id =
          owner2
            ? Number(
                owner2.id
              )
            : null;

        const games =
          owner1Id &&
          owner2Id
            ? completedGames.filter(
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
              )
            : [];

        const sortedGames =
          [...games].sort(
            (a, b) => {
              if (
                Number(
                  b.season_year
                ) !==
                Number(
                  a.season_year
                )
              ) {
                return (
                  Number(
                    b.season_year
                  ) -
                  Number(
                    a.season_year
                  )
                );
              }

              return (
                Number(
                  b.matchup_period
                ) -
                Number(
                  a.matchup_period
                )
              );
            }
          );

        const overall =
          buildRecord(
            games,
            owner1Id
          );

        // -----------------------------------------------------
        // RIVALRY WEEK GAMES
        //
        // 2026 is the first year.
        // Week 11 is Rivalry Week.
        // -----------------------------------------------------

        const rivalryWeekGames =
          games.filter(
            (game) =>
              Number(
                game.season_year
              ) >= 2026 &&
              Number(
                game.matchup_period
              ) ===
                RIVALRY_WEEK
          );

        const rivalryWeekRecord =
          buildRecord(
            rivalryWeekGames,
            owner1Id
          );

        // -----------------------------------------------------
        // POINTS
        // -----------------------------------------------------

        const owner1Points =
          games.reduce(
            (
              total,
              game
            ) =>
              total +
              getOwnerScore(
                game,
                owner1Id
              ),
            0
          );

        const owner2Points =
          games.reduce(
            (
              total,
              game
            ) =>
              total +
              getOwnerScore(
                game,
                owner2Id
              ),
            0
          );

        // -----------------------------------------------------
        // LATEST GAME
        // -----------------------------------------------------

        const latestGame =
          sortedGames[0] ||
          null;

        // -----------------------------------------------------
        // BIGGEST WIN
        // -----------------------------------------------------

        const biggestGame =
          games.length > 0
            ? [
                ...games,
              ].sort(
                (a, b) =>
                  Math.abs(
                    num(
                      b.home_score
                    ) -
                      num(
                        b.away_score
                      )
                  ) -
                  Math.abs(
                    num(
                      a.home_score
                    ) -
                      num(
                        a.away_score
                      )
                  )
              )[0]
            : null;

        // -----------------------------------------------------
        // CLOSEST GAME
        // -----------------------------------------------------

        const decidedGames =
          games.filter(
            (game) =>
              num(
                game.home_score
              ) !==
              num(
                game.away_score
              )
          );

        const closestGame =
          decidedGames.length >
          0
            ? [
                ...decidedGames,
              ].sort(
                (a, b) =>
                  Math.abs(
                    num(
                      a.home_score
                    ) -
                      num(
                        a.away_score
                      )
                  ) -
                  Math.abs(
                    num(
                      b.home_score
                    ) -
                      num(
                        b.away_score
                      )
                  )
              )[0]
            : null;

        const currentStreak =
          getCurrentStreak(
            games,
            owner1Id,
            owner2Id
          );

        return {
          index:
            index + 1,

          owner1Id,
          owner2Id,

          owner1Name:
            owner1?.name ||
            rivalry.owner1,

          owner2Name:
            owner2?.name ||
            rivalry.owner2,

          games,

          meetings:
            games.length,

          overall,

          rivalryWeekGames,

          rivalryWeekRecord,

          owner1Points,
          owner2Points,

          latestGame,

          biggestGame,

          closestGame,

          currentStreak,

          seriesGap:
            Math.abs(
              overall.owner1Wins -
                overall.owner2Wins
            ),
        };
      }
    );

  // =========================================================
  // GAME TO WATCH
  //
  // Closest all-time series.
  // If tied, use most total meetings.
  // =========================================================

  const gameToWatch =
    [...rivalryData].sort(
      (a, b) => {
        if (
          a.seriesGap !==
          b.seriesGap
        ) {
          return (
            a.seriesGap -
            b.seriesGap
          );
        }

        return (
          b.meetings -
          a.meetings
        );
      }
    )[0];

  // =========================================================
  // RIVALRY WEEK HISTORY
  // =========================================================

  const allRivalryWeekGames =
    rivalryData.flatMap(
      (rivalry) =>
        rivalry.rivalryWeekGames.map(
          (game) => ({
            ...game,

            rivalry,
          })
        )
    );

  const closestRivalryWeekGame =
    allRivalryWeekGames
      .filter(
        (game) =>
          num(
            game.home_score
          ) !==
          num(
            game.away_score
          )
      )
      .sort(
        (a, b) =>
          Math.abs(
            num(
              a.home_score
            ) -
              num(
                a.away_score
              )
          ) -
          Math.abs(
            num(
              b.home_score
            ) -
              num(
                b.away_score
              )
          )
      )[0] ||
    null;

  const biggestRivalryWeekGame =
    [...allRivalryWeekGames].sort(
      (a, b) =>
        Math.abs(
          num(
            b.home_score
          ) -
            num(
              b.away_score
            )
        ) -
        Math.abs(
          num(
            a.home_score
          ) -
            num(
              a.away_score
            )
        )
    )[0] ||
    null;

  const highestScoringRivalryWeekGame =
    [...allRivalryWeekGames].sort(
      (a, b) =>
        (
          num(
            b.home_score
          ) +
          num(
            b.away_score
          )
        ) -
        (
          num(
            a.home_score
          ) +
          num(
            a.away_score
          )
        )
    )[0] ||
    null;

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <main className="page-shell">

      {/* =====================================================
          HEADER
          ===================================================== */}

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


      {/* =====================================================
          SPECIAL EVENT HERO
          ===================================================== */}

      <section className="rivalry-hero">

        <div>

          <p className="eyebrow">
            INAUGURAL RIVALRY WEEK · {CURRENT_SEASON}
          </p>

          <h1>
            Rivalry Week
          </h1>

          <p>
            Five matchups. One week.
            Bragging rights count a little more.
          </p>

        </div>


        <div className="rivalry-count">

          <strong>
            5
          </strong>

          <span>
            MATCHUPS
          </span>

        </div>

      </section>


      {/* =====================================================
          NAV
          ===================================================== */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          WEEK {RIVALRY_WEEK}
        </span>

      </nav>


      {/* =====================================================
          EVENT STRIP
          ===================================================== */}

      <section className="rivalry-event-strip">

        <div>

          <span>
            DEBUT
          </span>

          <strong>
            2026
          </strong>

        </div>


        <div>

          <span>
            RIVALRY WEEK
          </span>

          <strong>
            WEEK {RIVALRY_WEEK}
          </strong>

        </div>


        <div>

          <span>
            MATCHUPS
          </span>

          <strong>
            5
          </strong>

        </div>

      </section>


      {/* =====================================================
          MATCHUPS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              {CURRENT_SEASON}
            </p>

            <h2>
              The Matchups
            </h2>

          </div>


          <span>
            Inaugural Rivalry Week
          </span>

        </div>


        <div className="rivalry-matchup-grid">

          {rivalryData.map(
            (rivalry) => {
              const isGameToWatch =
                gameToWatch
                  ?.index ===
                rivalry.index;

              const streakOwner =
                rivalry
                  .currentStreak
                  ?.owner ===
                "owner1"
                  ? rivalry
                      .owner1Name

                  : rivalry
                        .currentStreak
                        ?.owner ===
                      "owner2"

                    ? rivalry
                        .owner2Name

                    : null;

              const latestWinnerId =
                rivalry.latestGame
                  ? getWinnerId(
                      rivalry.latestGame
                    )
                  : null;

              const latestWinner =
                latestWinnerId ===
                rivalry.owner1Id
                  ? rivalry
                      .owner1Name

                  : latestWinnerId ===
                      rivalry.owner2Id

                    ? rivalry
                        .owner2Name

                    : null;

              return (
                <article
                  className={`rivalry-matchup-card ${
                    isGameToWatch
                      ? "rivalry-featured"
                      : ""
                  }`}
                  key={`${rivalry.owner1Name}-${rivalry.owner2Name}`}
                >

                  {/* TOP */}

                  <div className="rivalry-card-top">

                    <span>
                      MATCHUP{" "}
                      {rivalry.index}
                    </span>

                    {isGameToWatch ? (
                      <strong>
                        🔥 GAME TO WATCH
                      </strong>
                    ) : (
                      <strong>
                        WEEK {RIVALRY_WEEK}
                      </strong>
                    )}

                  </div>


                  {/* NAMES */}

                  <div className="rivalry-card-names">

                    <Link
                      href={`/owners/${rivalry.owner1Id}`}
                    >
                      {rivalry.owner1Name}
                    </Link>

                    <span>
                      VS
                    </span>

                    <Link
                      href={`/owners/${rivalry.owner2Id}`}
                    >
                      {rivalry.owner2Name}
                    </Link>

                  </div>


                  {/* ALL-TIME SERIES */}

                  <div className="rivalry-series-score">

                    <div>

                      <strong>
                        {
                          rivalry
                            .overall
                            .owner1Wins
                        }
                      </strong>

                      <span>
                        WINS
                      </span>

                    </div>


                    <div className="rivalry-series-middle">

                      <span>
                        ALL-TIME
                      </span>

                      <strong>
                        {recordText(
                          rivalry
                            .overall
                            .owner1Wins,

                          rivalry
                            .overall
                            .owner2Wins,

                          rivalry
                            .overall
                            .ties
                        )}
                      </strong>

                      <small>
                        {
                          rivalry.meetings
                        }{" "}
                        MEETINGS
                      </small>

                    </div>


                    <div>

                      <strong>
                        {
                          rivalry
                            .overall
                            .owner2Wins
                        }
                      </strong>

                      <span>
                        WINS
                      </span>

                    </div>

                  </div>


                  {/* BLURB */}

                  <p className="rivalry-series-blurb">
                    {buildSeriesBlurb(
                      rivalry
                    )}
                  </p>


                  {/* STATS */}

                  <div className="rivalry-card-stats">

                    <div>

                      <span>
                        RIVALRY WEEK
                      </span>

                      <strong>
                        {recordText(
                          rivalry
                            .rivalryWeekRecord
                            .owner1Wins,

                          rivalry
                            .rivalryWeekRecord
                            .owner2Wins,

                          rivalry
                            .rivalryWeekRecord
                            .ties
                        )}
                      </strong>

                    </div>


                    <div>

                      <span>
                        CURRENT STREAK
                      </span>

                      <strong>
                        {streakOwner
                          ? `${streakOwner} · ${rivalry.currentStreak.count}`
                          : "—"}
                      </strong>

                    </div>


                    <div>

                      <span>
                        TOTAL POINTS
                      </span>

                      <strong>
                        {formatScore(
                          rivalry.owner1Points
                        )}
                        {" – "}
                        {formatScore(
                          rivalry.owner2Points
                        )}
                      </strong>

                    </div>

                  </div>


                  {/* LAST MEETING */}

                  <div className="rivalry-last-meeting">

                    <span>
                      LAST MEETING
                    </span>

                    {rivalry.latestGame ? (

                      <strong>

                        {latestWinner
                          ? `${latestWinner} won `
                          : "Tie "}

                        {formatScore(
                          rivalry.latestGame
                            .home_score
                        )}

                        {" – "}

                        {formatScore(
                          rivalry.latestGame
                            .away_score
                        )}

                        {" · "}

                        {
                          rivalry
                            .latestGame
                            .season_year
                        }

                        {" W"}

                        {
                          rivalry
                            .latestGame
                            .matchup_period
                        }

                      </strong>

                    ) : (

                      <strong>
                        No previous meeting
                      </strong>

                    )}

                  </div>

                </article>
              );
            }
          )}

        </div>

      </section>


      {/* =====================================================
          RIVALRY WEEK RECORD BOOK
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              RIVALRY WEEK RECORD BOOK
            </p>

            <h2>
              Rivalry Week History
            </h2>

          </div>


          <span>
            Since 2026
          </span>

        </div>


        <div className="record-book-grid">

          {/* FIRST SEASON */}

          <div className="record-book-card">

            <span className="record-book-label">
              First Rivalry Week
            </span>

            <strong className="record-book-value">
              2026
            </strong>

            <div className="record-book-owner">
              Week {RIVALRY_WEEK}
            </div>

            <div className="record-book-detail">
              Inaugural season
            </div>

          </div>


          {/* CLOSEST */}

          <div className="record-book-card">

            <span className="record-book-label">
              Closest Rivalry Week Game
            </span>

            <strong className="record-book-value">

              {closestRivalryWeekGame
                ? formatScore(
                    Math.abs(
                      num(
                        closestRivalryWeekGame
                          .home_score
                      ) -
                      num(
                        closestRivalryWeekGame
                          .away_score
                      )
                    )
                  )
                : "—"}

            </strong>

            <div className="record-book-owner">

              {closestRivalryWeekGame
                ? `${closestRivalryWeekGame.home_team_name} vs ${closestRivalryWeekGame.away_team_name}`
                : "Starts in 2026"}

            </div>

            <div className="record-book-detail">

              {closestRivalryWeekGame
                ? `${closestRivalryWeekGame.season_year} · Week ${RIVALRY_WEEK}`
                : `Week ${RIVALRY_WEEK}`}

            </div>

          </div>


          {/* BIGGEST BLOWOUT */}

          <div className="record-book-card">

            <span className="record-book-label">
              Biggest Rivalry Week Blowout
            </span>

            <strong className="record-book-value">

              {biggestRivalryWeekGame
                ? formatScore(
                    Math.abs(
                      num(
                        biggestRivalryWeekGame
                          .home_score
                      ) -
                      num(
                        biggestRivalryWeekGame
                          .away_score
                      )
                    )
                  )
                : "—"}

            </strong>

            <div className="record-book-owner">

              {biggestRivalryWeekGame
                ? `${biggestRivalryWeekGame.home_team_name} vs ${biggestRivalryWeekGame.away_team_name}`
                : "Starts in 2026"}

            </div>

            <div className="record-book-detail">
              Point margin
            </div>

          </div>


          {/* HIGHEST SCORING */}

          <div className="record-book-card">

            <span className="record-book-label">
              Highest-Scoring Rivalry Week Game
            </span>

            <strong className="record-book-value">

              {highestScoringRivalryWeekGame
                ? formatScore(
                    num(
                      highestScoringRivalryWeekGame
                        .home_score
                    ) +
                    num(
                      highestScoringRivalryWeekGame
                        .away_score
                    )
                  )
                : "—"}

            </strong>

            <div className="record-book-owner">

              {highestScoringRivalryWeekGame
                ? `${highestScoringRivalryWeekGame.home_team_name} vs ${highestScoringRivalryWeekGame.away_team_name}`
                : "Starts in 2026"}

            </div>

            <div className="record-book-detail">
              Combined points
            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          FOOTER
          ===================================================== */}

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
