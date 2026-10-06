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

// =========================================================
// SIGNATURE SEASON
//
// Preference:
// 1. Championship season
// 2. Best win percentage
// 3. Most wins
// 4. Most points
// =========================================================

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
// HALL OF FAME CASE
// =========================================================

function buildHallOfFameCase(
  owner,
  rankings
) {
  const titleLeader =
    Math.max(
      ...rankings.map(
        (row) =>
          row.championships
      ),
      0
    );

  const finalsLeader =
    Math.max(
      ...rankings.map(
        (row) =>
          row.finalsAppearances
      ),
      0
    );

  const winsLeader =
    Math.max(
      ...rankings.map(
        (row) =>
          row.wins
      ),
      0
    );

  const playoffLeader =
    Math.max(
      ...rankings.map(
        (row) =>
          row.playoffAppearances
      ),
      0
    );

  const facts = [];

  if (
    owner.championships > 0 &&
    owner.championships ===
      titleLeader
  ) {
    facts.push(
      `${owner.championships} championship${
        owner.championships === 1
          ? ""
          : "s"
      }, tied for the most in league history`
    );
  } else if (
    owner.championships > 0
  ) {
    facts.push(
      `${owner.championships} career championship${
        owner.championships === 1
          ? ""
          : "s"
      }`
    );
  }

  if (
    owner.finalsAppearances ===
      finalsLeader &&
    owner.finalsAppearances > 0
  ) {
    facts.push(
      `${owner.finalsAppearances} championship appearances`
    );
  }

  if (
    owner.playoffAppearances ===
      playoffLeader &&
    owner.playoffAppearances > 0
  ) {
    facts.push(
      `${owner.playoffAppearances} playoff appearances`
    );
  }

  if (
    owner.wins ===
      winsLeader &&
    owner.wins > 0
  ) {
    facts.push(
      `${owner.wins} regular-season wins, the league's all-time high`
    );
  }

  if (
    facts.length < 2
  ) {
    facts.push(
      `${owner.winPct.toFixed(
        1
      )}% career win percentage`
    );
  }

  if (
    facts.length < 2
  ) {
    facts.push(
      `${owner.seasons} seasons of Dirty P history`
    );
  }

  const selected =
    facts.slice(0, 2);

  if (
    selected.length === 1
  ) {
    return `${selected[0]}.`;
  }

  return `${selected[0]} and ${selected[1]} make up one of the strongest résumés in Dirty P history.`;
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
  // DATABASE ERROR
  // =========================================================

  if (
    ownersError ||
    resultsError
  ) {
    return (
      <main className="page-shell">

        <h1>
          Hall of Fame
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
                season
                  .championship_appearance ===
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
  // ALL-TIME ORDER
  //
  // 1. Championships
  // 2. Finals
  // 3. Playoffs
  // 4. Wins
  // 5. Win %
  // 6. Points
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
    rankings
      .slice(
        0,
        3
      )
      .map(
        (
          owner,
          index
        ) => ({
          ...owner,

          rank:
            index + 1,

          hallCase:
            buildHallOfFameCase(
              owner,
              rankings
            ),
        })
      );

  // =========================================================
  // PLAQUE
  // =========================================================

  function HallOfFamePlaque({
    owner,
    featured = false,
  }) {
    const signature =
      owner.signatureSeason;

    const signatureWins =
      num(
        signature?.wins
      );

    const signatureLosses =
      num(
        signature?.losses
      );

    const signatureTies =
      num(
        signature?.ties
      );

    return (
      <article
        className={`hof-plaque ${
          featured
            ? "hof-plaque-featured"
            : ""
        }`}
      >

        {/* TOP */}

        <div className="hof-plaque-top">

          <span>
            DIRTY P HALL OF FAME
          </span>

          <strong>
            #{owner.rank} ALL-TIME
          </strong>

        </div>


        {/* NAME */}

        <div className="hof-name-block">

          {featured && (
            <div className="hof-crown">
              👑
            </div>
          )}

          <span>
            {featured
              ? "THE GOAT"
              : "HALL OF FAMER"}
          </span>

          <Link
            href={`/owners/${owner.id}`}
          >
            {owner.name}
          </Link>

          <small>
            {owner.firstSeason}–
            {owner.lastSeason}
          </small>

        </div>


        {/* CHAMPIONSHIPS */}

        <div className="hof-title-block">

          <strong>
            {owner.championships}
            ×
          </strong>

          <span>
            DIRTY P CHAMPION
          </span>

        </div>


        {/* RINGS */}

        {owner.championships >
          0 && (

          <div className="hof-rings">

            {owner.championshipYears.map(
              (year) => (

                <div
                  className="hof-ring"
                  key={year}
                >
                  <span>
                    🏆
                  </span>

                  <strong>
                    {year}
                  </strong>
                </div>

              )
            )}

          </div>

        )}


        {/* CAREER RESUME */}

        <div className="hof-resume-grid">

          <div>

            <strong>
              {
                owner.finalsAppearances
              }
            </strong>

            <span>
              FINALS
            </span>

          </div>


          <div>

            <strong>
              {
                owner.playoffAppearances
              }
            </strong>

            <span>
              PLAYOFFS
            </span>

          </div>


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


        {/* SIGNATURE SEASON */}

        {signature && (

          <div className="hof-signature">

            <span>
              SIGNATURE SEASON
            </span>

            <strong>
              {
                signature.season_year
              }
            </strong>

            <p>
              {formatRecord(
                signatureWins,
                signatureLosses,
                signatureTies
              )}

              {" · "}

              {num(
                signature.points_for
              ).toFixed(
                2
              )}{" "}
              PF

              {signature.champion
                ? " · CHAMPION"
                : ""}
            </p>

          </div>

        )}


        {/* CASE */}

        <div className="hof-case">

          <span>
            HALL OF FAME CASE
          </span>

          <p>
            {owner.hallCase}
          </p>

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
            IMMORTALIZED
          </p>

          <h1>
            Hall of Fame
          </h1>

          <p>
            The three greatest résumés
            in Dirty P Fantasy Football
            history.
          </p>

        </div>


        <div className="owners-count">

          <strong>
            3
          </strong>

          <span>
            INDUCTEES
          </span>

        </div>

      </section>


      {/* NAV */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          Class of 2026
        </span>

      </nav>


      {/* #1 */}

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


          <div className="hof-goat-wrap">

            <HallOfFamePlaque
              owner={
                hallOfFame[0]
              }
              featured
            />

          </div>

        </section>

      )}


      {/* #2 AND #3 */}

      {hallOfFame.length >
        1 && (

        <section className="owners-section">

          <div className="section-heading">

            <div>

              <p className="eyebrow">
                THE ELITE
              </p>

              <h2>
                Hall of Famers
              </h2>

            </div>


            <span>
              Top 3 All-Time
            </span>

          </div>


          <div className="hof-secondary-grid">

            {hallOfFame
              .slice(
                1
              )
              .map(
                (owner) => (

                  <HallOfFamePlaque
                    key={
                      owner.id
                    }
                    owner={
                      owner
                    }
                  />

                )
              )}

          </div>

        </section>

      )}


      {/* STANDARD */}

      <section className="owners-section">

        <div className="hof-standard">

          <p className="eyebrow">
            THE STANDARD
          </p>

          <h2>
            What gets you here
          </h2>

          <div className="hof-standard-items">

            <span>
              Championships
            </span>

            <span>
              Finals
            </span>

            <span>
              Playoff Success
            </span>

            <span>
              Winning
            </span>

            <span>
              Longevity
            </span>

          </div>

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
