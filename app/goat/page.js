import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";

export const dynamic = "force-dynamic";

// =========================================================
// GOAT SCORING SYSTEM
// =========================================================

const GOAT_POINTS = {
  REGULAR_WIN: 1,
  PLAYOFF_APPEARANCE: 3,
  PLAYOFF_WIN: 2,
  CHAMPIONSHIP_APPEARANCE: 5,
  CHAMPIONSHIP: 12,
};

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

function formatNumber(value) {
  return Number(
    value || 0
  ).toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2,
    }
  );
}

function getWinPct(
  wins,
  losses,
  ties = 0
) {
  const games =
    wins +
    losses +
    ties;

  if (games === 0) {
    return 0;
  }

  return (
    (
      wins +
      ties * 0.5
    ) /
    games
  ) * 100;
}

// =========================================================
// GAME TYPE
// =========================================================

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
    ) ||
    game.is_consolation ===
      true
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
    game.is_playoff ===
      true ||
    game.is_championship ===
      true
  ) {
    return "playoff";
  }

  return "regular";
}

// =========================================================
// WINNER
// =========================================================

function getWinnerOwnerId(game) {
  const winner =
    String(
      game.winner || ""
    ).toUpperCase();

  if (
    winner === "HOME"
  ) {
    return Number(
      game.home_owner_id
    );
  }

  if (
    winner === "AWAY"
  ) {
    return Number(
      game.away_owner_id
    );
  }

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

// =========================================================
// PAGE
// =========================================================

export default async function GoatPage() {
  let leagueData;

  try {
    leagueData =
      await getLeagueData();
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


        <section className="owners-section">

          <article className="owner-card">

            <div className="owner-card-top">

              <div>

                <span className="owner-status">
                  DATA ERROR
                </span>

                <h3>
                  GOAT Rankings
                </h3>

                <p className="owner-team-name">
                  {error?.message ||
                    "Unable to load league data."}
                </p>

              </div>

            </div>

          </article>

        </section>

      </main>
    );
  }

  const {
    currentSeason,
    currentWeek,
    owners,
    matchups,
    seasonResults,
    completedCurrentMatchups,
    unmatchedEspnOwners,
  } =
    leagueData;

  // =========================================================
  // LATEST COMPLETED WEEK
  // =========================================================

  const currentCompletedWeeks =
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
    currentCompletedWeeks.length >
    0
      ? Math.max(
          ...currentCompletedWeeks
        )
      : 0;

  // =========================================================
  // CAREER PLAYOFF WINS
  // =========================================================

  const playoffWins =
    new Map();

  for (
    const game of
    matchups
  ) {
    if (
      getGameType(
        game
      ) !== "playoff"
    ) {
      continue;
    }

    const winnerOwnerId =
      getWinnerOwnerId(
        game
      );

    if (!winnerOwnerId) {
      continue;
    }

    playoffWins.set(
      winnerOwnerId,
      (
        playoffWins.get(
          winnerOwnerId
        ) || 0
      ) + 1
    );
  }

  // =========================================================
  // BUILD EVERY OWNER'S RESUME
  // =========================================================

  const rankings =
    owners.map(
      (owner) => {
        const ownerId =
          Number(
            owner.id
          );

        const ownerSeasons =
          seasonResults.filter(
            (season) =>
              Number(
                season.owner_id
              ) ===
              ownerId
          );

        // =====================================================
        // REGULAR-SEASON CAREER
        // =====================================================

        const wins =
          ownerSeasons.reduce(
            (
              total,
              season
            ) =>
              total +
              num(
                season.wins
              ),
            0
          );

        const losses =
          ownerSeasons.reduce(
            (
              total,
              season
            ) =>
              total +
              num(
                season.losses
              ),
            0
          );

        const ties =
          ownerSeasons.reduce(
            (
              total,
              season
            ) =>
              total +
              num(
                season.ties
              ),
            0
          );

        const pointsFor =
          ownerSeasons.reduce(
            (
              total,
              season
            ) =>
              total +
              num(
                season.points_for
              ),
            0
          );

        const pointsAgainst =
          ownerSeasons.reduce(
            (
              total,
              season
            ) =>
              total +
              num(
                season.points_against
              ),
            0
          );

        // =====================================================
        // POSTSEASON RESUME
        // =====================================================

        const playoffAppearances =
          ownerSeasons.filter(
            (season) =>
              Boolean(
                season.playoff_appearance
              )
          ).length;

        const finalsAppearances =
          ownerSeasons.filter(
            (season) =>
              Boolean(
                season.championship_appearance
              )
          ).length;

        const championships =
          ownerSeasons.filter(
            (season) =>
              Boolean(
                season.champion
              )
          ).length;

        const playoffGameWins =
          playoffWins.get(
            ownerId
          ) || 0;

        // =====================================================
        // TITLE YEARS
        // =====================================================

        const championshipYears =
          ownerSeasons
            .filter(
              (season) =>
                Boolean(
                  season.champion
                )
            )
            .map(
              (season) =>
                Number(
                  season.season_year
                )
            )
            .sort(
              (a, b) =>
                a - b
            );

        // =====================================================
        // SEASONS / LONGEVITY
        // =====================================================

        const seasonYears =
          ownerSeasons
            .map(
              (season) =>
                Number(
                  season.season_year
                )
            )
            .filter(
              Number.isFinite
            );

        const seasons =
          ownerSeasons.length;

        const historicalSeasonCount =
          ownerSeasons.filter(
            (season) =>
              Number(
                season.season_year
              ) <
              currentSeason
          ).length;

        const hasCurrentSeason =
          ownerSeasons.some(
            (season) =>
              Number(
                season.season_year
              ) ===
              currentSeason
          );

        const firstSeason =
          seasonYears.length >
          0
            ? Math.min(
                ...seasonYears
              )
            : null;

        const lastSeason =
          seasonYears.length >
          0
            ? Math.max(
                ...seasonYears
              )
            : null;

        const winPct =
          getWinPct(
            wins,
            losses,
            ties
          );

        // =====================================================
        // GOAT SCORE BREAKDOWN
        // =====================================================

        const regularWinPoints =
          wins *
          GOAT_POINTS.REGULAR_WIN;

        const playoffAppearancePoints =
          playoffAppearances *
          GOAT_POINTS.PLAYOFF_APPEARANCE;

        const playoffWinPoints =
          playoffGameWins *
          GOAT_POINTS.PLAYOFF_WIN;

        const finalsPoints =
          finalsAppearances *
          GOAT_POINTS.CHAMPIONSHIP_APPEARANCE;

        const championshipPoints =
          championships *
          GOAT_POINTS.CHAMPIONSHIP;

        const goatScore =
          regularWinPoints +
          playoffAppearancePoints +
          playoffWinPoints +
          finalsPoints +
          championshipPoints;

        return {
          id:
            owner.id,

          name:
            owner.name,

          seasons,

          historicalSeasonCount,

          hasCurrentSeason,

          firstSeason,

          lastSeason,

          wins,

          losses,

          ties,

          pointsFor,

          pointsAgainst,

          winPct,

          playoffAppearances,

          playoffGameWins,

          finalsAppearances,

          championships,

          championshipYears,

          regularWinPoints,

          playoffAppearancePoints,

          playoffWinPoints,

          finalsPoints,

          championshipPoints,

          goatScore,
        };
      }
    );

  // =========================================================
  // SORT RANKINGS
  //
  // PRIMARY:
  // GOAT SCORE
  //
  // TIEBREAKERS:
  // 1 Championships
  // 2 Finals
  // 3 Regular-season wins
  // 4 Playoff wins
  // 5 Playoff appearances
  // 6 Win percentage
  // 7 Career points
  // =========================================================

  rankings.sort(
    (a, b) => {
      if (
        b.goatScore !==
        a.goatScore
      ) {
        return (
          b.goatScore -
          a.goatScore
        );
      }

      if (
        b.championships !==
        a.championships
      ) {
        return (
          b.championships -
          a.championships
        );
      }

      if (
        b.finalsAppearances !==
        a.finalsAppearances
      ) {
        return (
          b.finalsAppearances -
          a.finalsAppearances
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

      if (
        b.playoffGameWins !==
        a.playoffGameWins
      ) {
        return (
          b.playoffGameWins -
          a.playoffGameWins
        );
      }

      if (
        b.playoffAppearances !==
        a.playoffAppearances
      ) {
        return (
          b.playoffAppearances -
          a.playoffAppearances
        );
      }

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
        b.pointsFor !==
        a.pointsFor
      ) {
        return (
          b.pointsFor -
          a.pointsFor
        );
      }

      return a.name.localeCompare(
        b.name
      );
    }
  );

  const hallOfFame =
    rankings.slice(
      0,
      3
    );

  // =========================================================
  // TOP 3 CARD
  // =========================================================

  function HallOfFameCard({
    owner,
    rank,
  }) {
    const limitedHistory =
      owner.seasons <= 2;

    return (
      <article className="owner-card">

        <div className="owner-card-top">

          <div>

            <span className="owner-status">

              {rank === 1
                ? "👑 THE GOAT · #1 ALL-TIME"
                : `HALL OF FAME · #${rank} ALL-TIME`}

            </span>

            <h3>
              {owner.name}
            </h3>

            <p className="owner-team-name">

              {owner.seasons ===
              0
                ? "No completed league history"

                : limitedHistory
                  ? `${owner.seasons} season${
                      owner.seasons ===
                      1
                        ? ""
                        : "s"
                    } · Limited league history`

                  : `${owner.firstSeason}–${owner.lastSeason}`}

            </p>

          </div>


          <div className="owner-title-count">

            <strong>
              {owner.goatScore}
            </strong>

            <span>
              GOAT
            </span>

          </div>

        </div>


        <div className="owner-record">

          <div>

            <strong>
              {formatRecord(
                owner.wins,
                owner.losses,
                owner.ties
              )}
            </strong>

            <span>
              CAREER RECORD
            </span>

          </div>


          <div>

            <strong>
              {owner.winPct.toFixed(
                1
              )}
              %
            </strong>

            <span>
              WIN %
            </span>

          </div>

        </div>


        <div className="owner-stats-grid">

          <div>

            <strong>
              {owner.championships}
            </strong>

            <span>
              Titles
            </span>

          </div>


          <div>

            <strong>
              {owner.finalsAppearances}
            </strong>

            <span>
              Finals
            </span>

          </div>


          <div>

            <strong>
              {owner.playoffAppearances}
            </strong>

            <span>
              Playoffs
            </span>

          </div>


          <div>

            <strong>
              {owner.playoffGameWins}
            </strong>

            <span>
              Playoff Wins
            </span>

          </div>

        </div>


        <div className="owner-record">

          <div>

            <strong>
              {owner.seasons}
            </strong>

            <span>
              SEASONS
            </span>

          </div>


          <div>

            <strong>
              {formatNumber(
                owner.pointsFor
              )}
            </strong>

            <span>
              CAREER POINTS
            </span>

          </div>

        </div>


        <div className="owner-card-bottom">

          <span>

            {owner.championshipYears.length >
            0
              ? `Titles: ${owner.championshipYears.join(
                  " · "
                )}`
              : "No championships"}

          </span>


          <Link
            href={`/owners/${owner.id}`}
          >

            <strong>
              View Owner →
            </strong>

          </Link>

        </div>

      </article>
    );
  }

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
            LIVE ALL-TIME RANKINGS
          </p>

          <h1>
            GOAT Rankings
          </h1>

          <p>
            Every Dirty P owner ranked by
            career success, championships,
            postseason performance and
            sustained winning.
          </p>

        </div>


        <div className="owners-count">

          <strong>
            {rankings.length}
          </strong>

          <span>
            RANKED OWNERS
          </span>

        </div>

      </section>


      {/* NAV */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>

          {latestCompletedWeek >
          0
            ? `Through ${currentSeason} Week ${latestCompletedWeek}`
            : `${currentSeason} Season`}

        </span>

      </nav>


      {/* =====================================================
          ESPN OWNER WARNING
          ===================================================== */}

      {unmatchedEspnOwners.length >
        0 && (

        <section className="owners-section">

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
          #1 GOAT
          ===================================================== */}

      {hallOfFame[0] && (

        <section className="owners-section">

          <div className="section-heading">

            <div>

              <p className="eyebrow">
                #1 ALL-TIME
              </p>

              <h2>
                The GOAT
              </h2>

            </div>

            <span>
              {hallOfFame[0].goatScore} GOAT Points
            </span>

          </div>


          <HallOfFameCard
            owner={
              hallOfFame[0]
            }
            rank={1}
          />

        </section>

      )}


      {/* =====================================================
          #2 AND #3
          ===================================================== */}

      {hallOfFame.length >
        1 && (

        <section className="owners-section">

          <div className="section-heading">

            <div>

              <p className="eyebrow">
                HALL OF FAME
              </p>

              <h2>
                The Top Three
              </h2>

            </div>

            <span>
              Current All-Time Top 3
            </span>

          </div>


          <div className="owners-grid">

            {hallOfFame
              .slice(
                1,
                3
              )
              .map(
                (
                  owner,
                  index
                ) => (

                  <HallOfFameCard
                    key={
                      owner.id
                    }
                    owner={
                      owner
                    }
                    rank={
                      index + 2
                    }
                  />

                )
              )}

          </div>

        </section>

      )}


      {/* =====================================================
          COMPLETE RANKINGS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              ALL-TIME ORDER
            </p>

            <h2>
              Complete GOAT Rankings
            </h2>

          </div>

          <span>
            Updated Throughout {currentSeason}
          </span>

        </div>


        <div className="owners-grid">

          {rankings.map(
            (
              owner,
              index
            ) => {
              const rank =
                index + 1;

              const limitedHistory =
                owner.seasons <=
                2;

              return (
                <article
                  className="owner-card"
                  key={owner.id}
                >

                  {/* TOP */}

                  <div className="owner-card-top">

                    <div>

                      <span className="owner-status">

                        {rank === 1
                          ? "👑 #1 ALL-TIME"

                          : rank <= 3
                            ? `HALL OF FAME · #${rank}`

                            : `#${rank} ALL-TIME`}

                      </span>

                      <h3>
                        {owner.name}
                      </h3>

                      <p className="owner-team-name">

                        {owner.seasons ===
                        0
                          ? "No completed league history"

                          : limitedHistory
                            ? `${owner.seasons} season${
                                owner.seasons ===
                                1
                                  ? ""
                                  : "s"
                              } · Limited league history`

                            : `${owner.firstSeason}–${owner.lastSeason}`}

                      </p>

                    </div>


                    <div className="owner-title-count">

                      <strong>
                        {owner.goatScore}
                      </strong>

                      <span>
                        GOAT
                      </span>

                    </div>

                  </div>


                  {/* CAREER RECORD */}

                  <div className="owner-record">

                    <div>

                      <strong>
                        {formatRecord(
                          owner.wins,
                          owner.losses,
                          owner.ties
                        )}
                      </strong>

                      <span>
                        CAREER RECORD
                      </span>

                    </div>


                    <div>

                      <strong>
                        {owner.winPct.toFixed(
                          1
                        )}
                        %
                      </strong>

                      <span>
                        WIN %
                      </span>

                    </div>

                  </div>


                  {/* RESUME */}

                  <div className="owner-stats-grid">

                    <div>

                      <strong>
                        {owner.championships}
                      </strong>

                      <span>
                        Titles
                      </span>

                    </div>


                    <div>

                      <strong>
                        {owner.finalsAppearances}
                      </strong>

                      <span>
                        Finals
                      </span>

                    </div>


                    <div>

                      <strong>
                        {owner.playoffAppearances}
                      </strong>

                      <span>
                        Playoffs
                      </span>

                    </div>


                    <div>

                      <strong>
                        {owner.playoffGameWins}
                      </strong>

                      <span>
                        Playoff Wins
                      </span>

                    </div>

                  </div>


                  {/* LONGEVITY */}

                  <div className="owner-record">

                    <div>

                      <strong>
                        {owner.seasons}
                      </strong>

                      <span>
                        SEASONS
                      </span>

                    </div>


                    <div>

                      <strong>
                        {formatNumber(
                          owner.pointsFor
                        )}
                      </strong>

                      <span>
                        CAREER POINTS
                      </span>

                    </div>

                  </div>


                  {/* BOTTOM */}

                  <div className="owner-card-bottom">

                    <span>

                      {owner.hasCurrentSeason
                        ? `${currentSeason} season included`
                        : `${owner.seasons} league seasons`}

                    </span>


                    <Link
                      href={`/owners/${owner.id}`}
                    >

                      <strong>
                        View Owner →
                      </strong>

                    </Link>

                  </div>

                </article>
              );
            }
          )}

        </div>

      </section>


      {/* =====================================================
          SCORING SYSTEM
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              THE FORMULA
            </p>

            <h2>
              GOAT Scoring System
            </h2>

          </div>

          <span>
            Résumé Based
          </span>

        </div>


        <article className="owner-card">

          <div className="owner-card-top">

            <div>

              <span className="owner-status">
                HOW THE RANKINGS WORK
              </span>

              <h3>
                GOAT Score
              </h3>

              <p className="owner-team-name">
                GOAT status is subjective.
                This formula gives Dirty P
                a transparent résumé-based
                ranking that rewards both
                sustained winning and
                postseason success.
              </p>

            </div>

          </div>


          <div className="owner-stats-grid">

            <div>

              <strong>
                +1
              </strong>

              <span>
                Reg. Win
              </span>

            </div>


            <div>

              <strong>
                +3
              </strong>

              <span>
                Playoff App.
              </span>

            </div>


            <div>

              <strong>
                +2
              </strong>

              <span>
                Playoff Win
              </span>

            </div>


            <div>

              <strong>
                +5
              </strong>

              <span>
                Finals App.
              </span>

            </div>

          </div>


          <div className="owner-record">

            <div>

              <strong>
                +12
              </strong>

              <span>
                CHAMPIONSHIP
              </span>

            </div>


            <div>

              <strong>
                LIVE
              </strong>

              <span>
                UPDATED DURING {currentSeason}
              </span>

            </div>

          </div>


          <div className="owner-card-bottom">

            <span>
              GOAT status is subjective. The score is not.
            </span>

            <strong>
              TRANSPARENT FORMULA
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
