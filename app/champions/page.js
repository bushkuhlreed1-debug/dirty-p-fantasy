import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

export default async function ChampionsPage() {
  const [
    {
      data: seasons,
      error: seasonsError,
    },
    {
      data: teams,
      error: teamsError,
    },
  ] = await Promise.all([
    supabase
      .from("seasons")
      .select(`
        year,
        championship_score,
        champion:champion_owner_id (
          id,
          name
        ),
        runner_up:runner_up_owner_id (
          id,
          name
        )
      `)
      .lt("year", CURRENT_SEASON)
      .order("year", {
        ascending: false,
      }),

    supabase
      .from("teams")
      .select(`
        season_year,
        owner_id,
        team_name
      `)
      .lt(
        "season_year",
        CURRENT_SEASON
      ),
  ]);

  if (
    seasonsError ||
    teamsError
  ) {
    return (
      <main className="page-shell">
        <h1>Champions</h1>

        <p>
          Database error:{" "}
          {seasonsError?.message ||
            teamsError?.message}
        </p>
      </main>
    );
  }

  const history =
    seasons || [];

  const teamHistory =
    teams || [];

  function getTeamName(
    year,
    ownerId
  ) {
    if (!ownerId) {
      return "—";
    }

    return (
      teamHistory.find(
        (team) =>
          Number(
            team.season_year
          ) ===
            Number(year) &&
          Number(
            team.owner_id
          ) ===
            Number(ownerId)
      )?.team_name || "—"
    );
  }

  // =========================================================
  // BUILD CHAMPIONSHIP RESUMES
  // =========================================================

  const resumeMap =
    new Map();

  function ensureOwner(owner) {
    if (!owner?.id) {
      return null;
    }

    const id =
      Number(owner.id);

    if (!resumeMap.has(id)) {
      resumeMap.set(id, {
        id,
        name: owner.name,
        titles: 0,
        finals: 0,
        runnerUps: 0,
        years: [],
      });
    }

    return resumeMap.get(id);
  }

  history.forEach(
    (season) => {
      if (season.champion) {
        const champion =
          ensureOwner(
            season.champion
          );

        champion.titles += 1;
        champion.finals += 1;
        champion.years.push(
          Number(
            season.year
          )
        );
      }

      if (season.runner_up) {
        const runnerUp =
          ensureOwner(
            season.runner_up
          );

        runnerUp.finals += 1;
        runnerUp.runnerUps += 1;
      }
    }
  );

  const titleLeaders =
    [...resumeMap.values()]
      .filter(
        (owner) =>
          owner.titles > 0
      )
      .sort(
        (a, b) => {
          if (
            b.titles !==
            a.titles
          ) {
            return (
              b.titles -
              a.titles
            );
          }

          if (
            b.finals !==
            a.finals
          ) {
            return (
              b.finals -
              a.finals
            );
          }

          return a.name.localeCompare(
            b.name
          );
        }
      );

  const completedYears =
    history
      .map(
        (season) =>
          Number(
            season.year
          )
      )
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
    completedYears[0] ||
    2014;

  const latestSeason =
    completedYears[
      completedYears.length - 1
    ] || 2025;

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
            LEAGUE HISTORY
          </p>

          <h1>
            Champions
          </h1>

          <p>
            Every Dirty P champion and
            the owners who have built
            the strongest championship
            résumés in league history.
          </p>

        </div>


        <div className="owners-count">

          <strong>
            {history.length}
          </strong>

          <span>
            CHAMPIONSHIPS
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
          {latestSeason}
        </span>

      </nav>


      {/* =====================================================
          CHAMPIONSHIP LEADERS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              THE TROPHY CASE
            </p>

            <h2>
              Championship Leaders
            </h2>

          </div>

          <span>
            {titleLeaders.length} Champions
          </span>

        </div>


        <div className="owners-grid">

          {titleLeaders.map(
            (
              owner,
              index
            ) => {
              const titleWinPct =
                owner.finals > 0
                  ? (
                      owner.titles /
                      owner.finals
                    ) *
                    100
                  : 0;

              const sortedYears =
                [...owner.years].sort(
                  (a, b) =>
                    a - b
                );

              return (
                <article
                  className="owner-card"
                  key={owner.id}
                >

                  {/* TOP */}

                  <div className="owner-card-top">

                    <div>

                      <span className="owner-status">
                        #{index + 1} CHAMPIONSHIP RÉSUMÉ
                      </span>

                      <h3>
                        {owner.name}
                      </h3>

                      <p className="owner-team-name">
                        {sortedYears.join(
                          " · "
                        )}
                      </p>

                    </div>


                    <div className="owner-title-count">

                      <strong>
                        {owner.titles}
                      </strong>

                      <span>
                        {owner.titles ===
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
                        {
                          sortedYears[0]
                        }
                      </strong>

                      <span>
                        FIRST TITLE
                      </span>

                    </div>


                    <div>

                      <strong>
                        {
                          sortedYears[
                            sortedYears.length -
                              1
                          ]
                        }
                      </strong>

                      <span>
                        LATEST TITLE
                      </span>

                    </div>

                  </div>


                  {/* STATS */}

                  <div className="owner-stats-grid">

                    <div>

                      <strong>
                        {owner.titles}
                      </strong>

                      <span>
                        Titles
                      </span>

                    </div>


                    <div>

                      <strong>
                        {owner.finals}
                      </strong>

                      <span>
                        Finals
                      </span>

                    </div>


                    <div>

                      <strong>
                        {owner.runnerUps}
                      </strong>

                      <span>
                        Runner-Up
                      </span>

                    </div>


                    <div>

                      <strong>
                        {titleWinPct.toFixed(
                          0
                        )}
                        %
                      </strong>

                      <span>
                        Finals Win %
                      </span>

                    </div>

                  </div>


                  {/* BOTTOM */}

                  <div className="owner-card-bottom">

                    <span>
                      Dirty P Champion
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
          YEAR-BY-YEAR
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              YEAR BY YEAR
            </p>

            <h2>
              Championship History
            </h2>

          </div>

          <span>
            {history.length} Seasons
          </span>

        </div>


        <div className="owners-grid">

          {history.map(
            (season) => {
              const championTeam =
                getTeamName(
                  season.year,
                  season.champion?.id
                );

              const runnerUpTeam =
                getTeamName(
                  season.year,
                  season.runner_up?.id
                );

              return (
                <article
                  className="owner-card"
                  key={season.year}
                >

                  {/* TOP */}

                  <div className="owner-card-top">

                    <div>

                      <span className="owner-status">
                        {season.year} CHAMPION
                      </span>

                      <h3>
                        {season.champion
                          ?.name ||
                          "—"}
                      </h3>

                      <p className="owner-team-name">
                        {championTeam}
                      </p>

                    </div>


                    <div className="owner-title-count">

                      <strong>
                        🏆
                      </strong>

                      <span>
                        CHAMP
                      </span>

                    </div>

                  </div>


                  {/* FINAL */}

                  <div className="owner-record">

                    <div>

                      <strong>
                        {season.championship_score ||
                          "—"}
                      </strong>

                      <span>
                        FINAL SCORE
                      </span>

                    </div>


                    <div>

                      <strong>
                        {season.runner_up
                          ?.name ||
                          "—"}
                      </strong>

                      <span>
                        RUNNER-UP
                      </span>

                    </div>

                  </div>


                  {/* BOTTOM */}

                  <div className="owner-card-bottom">

                    <span>
                      vs. {runnerUpTeam}
                    </span>

                    {season.champion?.id ? (

                      <Link
                        href={`/owners/${season.champion.id}`}
                      >
                        <strong>
                          View Champion →
                        </strong>
                      </Link>

                    ) : (

                      <strong>
                        Championship
                      </strong>

                    )}

                  </div>

                </article>
              );
            }
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
