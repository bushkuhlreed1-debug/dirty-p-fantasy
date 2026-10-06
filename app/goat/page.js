import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

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

function getSignatureSeason(
  seasons
) {
  if (!seasons.length) {
    return null;
  }

  return [...seasons].sort(
    (a, b) => {
      if (
        Boolean(b.champion) !==
        Boolean(a.champion)
      ) {
        return b.champion
          ? 1
          : -1;
      }

      const aPct =
        getWinPct(
          num(a.wins),
          num(a.losses),
          num(a.ties)
        );

      const bPct =
        getWinPct(
          num(b.wins),
          num(b.losses),
          num(b.ties)
        );

      if (bPct !== aPct) {
        return bPct - aPct;
      }

      if (
        num(b.wins) !==
        num(a.wins)
      ) {
        return (
          num(b.wins) -
          num(a.wins)
        );
      }

      return (
        num(b.points_for) -
        num(a.points_for)
      );
    }
  )[0];
}

// =========================================================
// PAGE
// =========================================================

export default async function GoatPage() {
  const [
    {
      data: owners,
      error: ownersError,
    },

    {
      data: seasonResults,
      error: resultsError,
    },
  ] =
    await Promise.all([
      supabase
        .from("owners")
        .select(`
          id,
          name,
          current_team_name,
          active
        `),

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
    ]);

  // =========================================================
  // ERROR
  // =========================================================

  if (
    ownersError ||
    resultsError
  ) {
    return (
      <main className="page-shell">

        <h1>
          GOAT Rankings
        </h1>

        <p>
          Database error:{" "}
          {ownersError?.message ||
            resultsError?.message}
        </p>

      </main>
    );
  }

  const ownerList =
    owners || [];

  const results =
    seasonResults || [];

  // =========================================================
  // BUILD CAREER RESUMES
  // =========================================================

  const rankings =
    ownerList
      .map(
        (owner) => {
          const ownerSeasons =
            results.filter(
              (season) =>
                Number(
                  season.owner_id
                ) ===
                Number(
                  owner.id
                )
            );

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

          const championships =
            ownerSeasons.filter(
              (season) =>
                season.champion ===
                true
            ).length;

          const finalsAppearances =
            ownerSeasons.filter(
              (season) =>
                season.championship_appearance ===
                true
            ).length;

          const playoffAppearances =
            ownerSeasons.filter(
              (season) =>
                season.playoff_appearance ===
                true
            ).length;

          const championshipYears =
            ownerSeasons
              .filter(
                (season) =>
                  season.champion ===
                    true
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

          const firstSeason =
            ownerSeasons.length
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
            ownerSeasons.length
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

          const signatureSeason =
            getSignatureSeason(
              ownerSeasons
            );

          return {
            id:
              owner.id,

            name:
              owner.name,

            currentTeam:
              owner.current_team_name,

            active:
              owner.active,

            seasons:
              ownerSeasons.length,

            wins,
            losses,
            ties,

            pointsFor,

            winPct,

            championships,

            finalsAppearances,

            playoffAppearances,

            championshipYears,

            firstSeason,

            lastSeason,

            signatureSeason,
          };
        }
      )
      .filter(
        (owner) =>
          owner.seasons > 0
      );

  // =========================================================
  // GOAT ORDER
  //
  // 1. Championships
  // 2. Finals
  // 3. Playoffs
  // 4. Wins
  // 5. Seasons played
  // 6. Win %
  // 7. Career points
  //
  // Seasons comes before win % so a new owner with a tiny
  // sample size does not get artificially boosted.
  // =========================================================

  rankings.sort(
    (a, b) => {
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
        b.playoffAppearances !==
        a.playoffAppearances
      ) {
        return (
          b.playoffAppearances -
          a.playoffAppearances
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

      return (
        b.pointsFor -
        a.pointsFor
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
    const signature =
      owner.signatureSeason;

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

              {owner.firstSeason &&
              owner.lastSeason
                ? `${owner.firstSeason}–${owner.lastSeason}`
                : "Dirty P Hall of Fame"}

            </p>

          </div>


          <div className="owner-title-count">

            <strong>
              {owner.championships}
            </strong>

            <span>
              {owner.championships ===
              1
                ? "TITLE"
                : "TITLES"}
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
              {owner.seasons}
            </strong>

            <span>
              Seasons
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
              {owner.finalsAppearances}
            </strong>

            <span>
              Finals
            </span>

          </div>


          <div>

            <strong>
              {owner.championships}
            </strong>

            <span>
              Titles
            </span>

          </div>

        </div>


        <div className="owner-record">

          <div>

            <strong>

              {owner.championshipYears.length >
              0
                ? owner.championshipYears.join(
                    " · "
                  )
                : "—"}

            </strong>

            <span>
              CHAMPIONSHIP YEARS
            </span>

          </div>


          <div>

            <strong>

              {signature
                ? signature.season_year
                : "—"}

            </strong>

            <span>
              SIGNATURE SEASON
            </span>

          </div>

        </div>


        <div className="owner-card-bottom">

          <span>
            #{rank} All-Time
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
            Every Dirty P owner ranked by
            championship success, postseason
            résumé, winning and longevity.
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
          Career records through 2025
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
              Dirty P Hall of Fame
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
          #2 / #3
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
          FULL GOAT RANKINGS
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
                owner.seasons <= 2;

              return (
                <article
                  className="owner-card"
                  key={owner.id}
                >

                  {/* TOP */}

                  <div className="owner-card-top">

                    <div>

                      <span className="owner-status">

                        {rank <= 3
                          ? `HALL OF FAME · #${rank} ALL-TIME`
                          : `#${rank} ALL-TIME`}

                      </span>

                      <h3>
                        {owner.name}
                      </h3>

                      <p className="owner-team-name">

                        {limitedHistory
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
                        {owner.championships}
                      </strong>

                      <span>
                        {owner.championships ===
                        1
                          ? "TITLE"
                          : "TITLES"}
                      </span>

                    </div>

                  </div>


                  {/* RECORD */}

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
                        {owner.seasons}
                      </strong>

                      <span>
                        Seasons
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
                        {owner.finalsAppearances}
                      </strong>

                      <span>
                        Finals
                      </span>

                    </div>


                    <div>

                      <strong>
                        {owner.championships}
                      </strong>

                      <span>
                        Titles
                      </span>

                    </div>

                  </div>


                  {/* BOTTOM */}

                  <div className="owner-card-bottom">

                    <span>

                      {limitedHistory
                        ? "Limited Dirty P history"
                        : `#${rank} all-time résumé`}

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
          RANKING METHOD
          ===================================================== */}

      <section className="owners-section">

        <article className="owner-card">

          <div className="owner-card-top">

            <div>

              <span className="owner-status">
                RANKING METHOD
              </span>

              <h3>
                How the GOAT Rankings Work
              </h3>

              <p className="owner-team-name">
                Résumé first. Sample size matters.
              </p>

            </div>

          </div>


          <div className="owner-stats-grid">

            <div>

              <strong>
                1
              </strong>

              <span>
                Titles
              </span>

            </div>


            <div>

              <strong>
                2
              </strong>

              <span>
                Finals
              </span>

            </div>


            <div>

              <strong>
                3
              </strong>

              <span>
                Playoffs
              </span>

            </div>


            <div>

              <strong>
                4
              </strong>

              <span>
                Wins
              </span>

            </div>

          </div>


          <div className="owner-card-bottom">

            <span>
              Then longevity, win percentage and career points
            </span>

            <strong>
              ALL-TIME
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
