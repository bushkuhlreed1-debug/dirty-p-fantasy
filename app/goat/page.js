import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

// =========================================================
// GOAT SCORING
// =========================================================

const GOAT_POINTS = {
  REGULAR_WIN: 1,
  PLAYOFF_APPEARANCE: 5,
  CHAMPIONSHIP_APPEARANCE: 10,
  CHAMPIONSHIP: 25,
  PLAYOFF_WIN: 3,
};

// =========================================================
// HELPERS
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
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
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

// =========================================================
// FIND WINNER
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
  const [
    ownersResult,
    resultsResult,
    matchupsResult,
  ] =
    await Promise.all([
      supabase
        .from("owners")
        .select(`
          id,
          name
        `)
        .order(
          "name",
          {
            ascending:
              true,
          }
        ),

      supabase
        .from("season_results")
        .select(`
          season_year,
          owner_id,
          wins,
          losses,
          ties,
          points_for,
          points_against,
          playoff_appearance,
          championship_appearance,
          champion
        `)
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
        ),

      supabase
        .from("matchups")
        .select(`
          season_year,
          matchup_period,
          home_owner_id,
          away_owner_id,
          home_score,
          away_score,
          winner,
          matchup_type,
          playoff_tier,
          is_championship
        `)
        .lt(
          "season_year",
          CURRENT_SEASON
        ),
    ]);

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (
    ownersResult.error ||
    resultsResult.error ||
    matchupsResult.error
  ) {
    return (
      <main className="page-shell">

        <h1>
          GOAT Rankings
        </h1>

        <p>
          Database error:{" "}
          {ownersResult.error
            ?.message ||
            resultsResult.error
              ?.message ||
            matchupsResult.error
              ?.message}
        </p>

      </main>
    );
  }

  const ownerList =
    ownersResult.data ||
    [];

  const seasonResults =
    resultsResult.data ||
    [];

  const matchupData =
    matchupsResult.data ||
    [];

  // =========================================================
  // CALCULATE PLAYOFF GAME WINS
  // =========================================================

  const playoffWins =
    new Map();

  matchupData
    .filter(
      (game) => {
        const homeScore =
          Number(
            game.home_score
          );

        const awayScore =
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
            homeScore
          ) &&
          Number.isFinite(
            awayScore
          ) &&
          getGameType(
            game
          ) === "playoff"
        );
      }
    )
    .forEach(
      (game) => {
        const winnerId =
          getWinnerOwnerId(
            game
          );

        if (!winnerId) {
          return;
        }

        playoffWins.set(
          winnerId,
          (
            playoffWins.get(
              winnerId
            ) || 0
          ) + 1
        );
      }
    );

  // =========================================================
  // BUILD CAREER RESUMES
  // =========================================================

  const rankings =
    ownerList.map(
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

        // -----------------------------------------------------
        // CAREER REGULAR SEASON
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // POSTSEASON
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // CHAMPIONSHIP YEARS
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // CAREER RANGE
        // -----------------------------------------------------

        const seasons =
          ownerSeasons.length;

        const firstSeason =
          seasons > 0
            ? Math.min(
                ...ownerSeasons.map(
                  (season) =>
                    Number(
                      season.season_year
                    )
                )
              )
            : null;

        const lastSeason =
          seasons > 0
            ? Math.max(
                ...ownerSeasons.map(
                  (season) =>
                    Number(
                      season.season_year
                    )
                )
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

        const championshipAppearancePoints =
          finalsAppearances *
          GOAT_POINTS.CHAMPIONSHIP_APPEARANCE;

        const championshipPoints =
          championships *
          GOAT_POINTS.CHAMPIONSHIP;

        const playoffWinPoints =
          playoffGameWins *
          GOAT_POINTS.PLAYOFF_WIN;

        const goatScore =
          regularWinPoints +
          playoffAppearancePoints +
          championshipAppearancePoints +
          championshipPoints +
          playoffWinPoints;

        return {
          id:
            owner.id,

          name:
            owner.name,

          seasons,

          firstSeason,
          lastSeason,

          wins,
          losses,
          ties,

          pointsFor,

          winPct,

          playoffAppearances,

          finalsAppearances,

          championships,

          playoffGameWins,

          championshipYears,

          regularWinPoints,

          playoffAppearancePoints,

          championshipAppearancePoints,

          championshipPoints,

          playoffWinPoints,

          goatScore,
        };
      }
    );

  // =========================================================
  // RANK OWNERS
  //
  // PRIMARY:
  // GOAT SCORE
  //
  // TIEBREAKERS:
  // 1. Championships
  // 2. Championship appearances
  // 3. Playoff wins
  // 4. Regular-season wins
  // 5. Seasons
  // 6. Win %
  // 7. Career points
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
        b.playoffGameWins !==
        a.playoffGameWins
      ) {
        return (
          b.playoffGameWins -
          a.playoffGameWins
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
        b.seasons !==
        a.seasons
      ) {
        return (
          b.seasons -
          a.seasons
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
  // HALL OF FAME CARD
  // =========================================================

  function HallOfFameCard({
    owner,
    rank,
  }) {
    const limitedHistory =
      owner.seasons <= 2;

    return (
      <article className="owner-card">

        {/* TOP */}

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


        {/* CAREER */}

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


        {/* POSTSEASON */}

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


        {/* CAREER DEPTH */}

        <div className="owner-record">

          <div>

            <strong>
              {owner.wins}
            </strong>

            <span>
              REGULAR-SEASON WINS
            </span>

          </div>


          <div>

            <strong>
              {owner.seasons}
            </strong>

            <span>
              SEASONS
            </span>

          </div>

        </div>


        {/* BOTTOM */}

        <div className="owner-card-bottom">

          <span>

            {owner.championshipYears.length >
            0
              ? `Championships: ${owner.championshipYears.join(
                  " · "
                )}`
              : `GOAT Score: ${owner.goatScore}`}

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
            ALL-TIME
          </p>

          <h1>
            GOAT Rankings
          </h1>

          <p>
            A résumé-based ranking of every
            Dirty P owner using championships,
            winning, postseason success and
            longevity.
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
          Through 2025
        </span>

      </nav>


      {/* =====================================================
          #1
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
              GOAT Score:{" "}
              {hallOfFame[0].goatScore}
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
              #2 & #3 All-Time
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
            {rankings.length} Owners
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
                          ? "No completed historical seasons"

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


                  {/* CAREER */}

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


                  {/* WINS / SEASONS */}

                  <div className="owner-record">

                    <div>

                      <strong>
                        {owner.wins}
                      </strong>

                      <span>
                        REGULAR-SEASON WINS
                      </span>

                    </div>


                    <div>

                      <strong>
                        {owner.seasons}
                      </strong>

                      <span>
                        SEASONS
                      </span>

                    </div>

                  </div>


                  {/* BOTTOM */}

                  <div className="owner-card-bottom">

                    <span>
                      GOAT Score:{" "}
                      {owner.goatScore}
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
                This formula gives the league
                a transparent way to rank
                overall résumés.
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
                +5
              </strong>

              <span>
                Playoff App.
              </span>

            </div>


            <div>

              <strong>
                +10
              </strong>

              <span>
                Finals App.
              </span>

            </div>


            <div>

              <strong>
                +25
              </strong>

              <span>
                Championship
              </span>

            </div>

          </div>


          <div className="owner-record">

            <div>

              <strong>
                +3
              </strong>

              <span>
                EACH PLAYOFF WIN
              </span>

            </div>


            <div>

              <strong>
                Score
              </strong>

              <span>
                HIGHEST TOTAL RANKS FIRST
              </span>

            </div>

          </div>


          <div className="owner-card-bottom">

            <span>
              Championships · Winning · Playoffs · Longevity
            </span>

            <strong>
              GOAT SCORE
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
