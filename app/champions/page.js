import { supabase } from "../../lib/supabase";

export default async function ChampionsPage() {
  const currentSeason = 2026;

  // =========================================================
  // CHAMPIONSHIP HISTORY
  // =========================================================

  const {
    data: seasons,
    error: seasonsError,
  } = await supabase
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
    .lt("year", currentSeason)
    .order("year", { ascending: false });

  // =========================================================
  // TEAM HISTORY
  // =========================================================

  const {
    data: teams,
    error: teamsError,
  } = await supabase
    .from("teams")
    .select(`
      season_year,
      owner_id,
      team_name
    `)
    .lt("season_year", currentSeason);

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (seasonsError || teamsError) {
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

  const history = seasons || [];
  const teamHistory = teams || [];

  // =========================================================
  // GET TEAM NAME FOR A SEASON
  // =========================================================

  function getTeamName(
    year,
    ownerId
  ) {
    return (
      teamHistory.find(
        (team) =>
          team.season_year === year &&
          team.owner_id === ownerId
      )?.team_name || "—"
    );
  }

  // =========================================================
  // BUILD TITLE LEADERS
  // =========================================================

  const titleMap = {};

  history.forEach(
    (season) => {
      if (!season.champion) {
        return;
      }

      const id =
        season.champion.id;

      if (!titleMap[id]) {
        titleMap[id] = {
          id,
          name:
            season.champion.name,
          titles: 0,
          years: [],
        };
      }

      titleMap[id].titles += 1;

      titleMap[id].years.push(
        season.year
      );
    }
  );

  const titleLeaders =
    Object.values(
      titleMap
    ).sort(
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

        return a.name.localeCompare(
          b.name
        );
      }
    );

  // =========================================================
  // HISTORY RANGE
  // =========================================================

  const seasonYears =
    history.map(
      (season) =>
        Number(season.year)
    );

  const firstSeason =
    seasonYears.length > 0
      ? Math.min(
          ...seasonYears
        )
      : 2014;

  const latestCompletedSeason =
    seasonYears.length > 0
      ? Math.max(
          ...seasonYears
        )
      : currentSeason - 1;

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

          <a href="/">
            <strong>
              DIRTY P FANTASY FOOTBALL
            </strong>
          </a>

          <span>
            THE LEAGUE ARCHIVE · EST. 2014
          </span>

        </div>

      </header>


      {/* =====================================================
          HERO
          ===================================================== */}

      <section className="owners-hero">

        <div>

          <p className="eyebrow">
            LEAGUE HISTORY
          </p>

          <h1>
            Champions
          </h1>

          <p>
            Every Dirty P champion, every
            championship matchup, and the owners
            who have won the most league titles.
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


      {/* =====================================================
          PAGE NAV
          ===================================================== */}

      <div className="page-nav">

        <a href="/">
          ← Home
        </a>

        <span>
          {firstSeason}–{latestCompletedSeason}
        </span>

      </div>


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


        <div className="champions-leader-grid">

          {titleLeaders.map(
            (owner, index) => (

              <a
                href={`/owners/${owner.id}`}
                className="champions-leader-card"
                key={owner.id}
              >

                <div className="champions-rank">
                  #{index + 1}
                </div>


                <div className="champions-leader-info">

                  <strong>
                    {owner.name}
                  </strong>

                  <span>
                    {owner.years
                      .sort(
                        (a, b) =>
                          a - b
                      )
                      .join(" · ")}
                  </span>

                </div>


                <div className="champions-title-count">

                  <strong>
                    {owner.titles}
                  </strong>

                  <span>
                    {owner.titles === 1
                      ? "TITLE"
                      : "TITLES"}
                  </span>

                </div>

              </a>
            )
          )}

        </div>

      </section>


      {/* =====================================================
          CHAMPIONSHIP HISTORY
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


        <div className="championship-history-list">

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

                <div
                  className="championship-history-card"
                  key={season.year}
                >

                  {/* SEASON */}

                  <div className="championship-year">

                    <span>
                      SEASON
                    </span>

                    <strong>
                      {season.year}
                    </strong>

                  </div>


                  {/* CHAMPION */}

                  <div className="championship-winner">

                    <span>
                      CHAMPION
                    </span>

                    {season.champion ? (
                      <a
                        href={`/owners/${season.champion.id}`}
                      >
                        {season.champion.name}
                      </a>
                    ) : (
                      <strong>
                        —
                      </strong>
                    )}

                    <small>
                      {championTeam}
                    </small>

                  </div>


                  {/* FINAL SCORE */}

                  <div className="championship-score">

                    <span>
                      FINAL
                    </span>

                    <strong>
                      {season.championship_score ||
                        "—"}
                    </strong>

                  </div>


                  {/* RUNNER-UP */}

                  <div className="championship-runner-up">

                    <span>
                      RUNNER-UP
                    </span>

                    {season.runner_up ? (
                      <a
                        href={`/owners/${season.runner_up.id}`}
                      >
                        {season.runner_up.name}
                      </a>
                    ) : (
                      <strong>
                        —
                      </strong>
                    )}

                    <small>
                      {runnerUpTeam}
                    </small>

                  </div>

                </div>
              );
            }
          )}

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
