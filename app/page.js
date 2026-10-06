import { supabase } from "../lib/supabase";
import { getEspnLeague } from "../lib/espn";
import DirtyPMap from "./DirtyPMap";

export const revalidate = 300;

export default async function Home() {
  const currentSeason =
    Number(
      process.env.ESPN_SEASON ||
        2026
    );

  // =========================================================
  // CURRENT / DEFENDING CHAMPION
  // =========================================================

  const {
    data: seasons,
    error: seasonsError,
  } = await supabase
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
    );

  const latestSeason =
    seasons?.[0] || null;

  // =========================================================
  // LIVE ESPN LEAGUE DATA
  // =========================================================

  let espnLeague = null;
  let espnError = null;

  try {
    espnLeague =
      await getEspnLeague();
  } catch (error) {
    console.error(
      "ESPN standings error:",
      error
    );

    espnError =
      error.message;
  }

  const currentWeek =
    espnLeague
      ?.currentWeek || 1;

  const standings =
    espnLeague
      ?.teams || [];

  const playoffTeamCount =
    espnLeague
      ?.playoffTeamCount || 4;

  const playoffTeams =
    standings.slice(
      0,
      playoffTeamCount
    );

  const firstTeamOut =
    standings[
      playoffTeamCount
    ] || null;

  const playoffTeamIds =
    new Set(
      playoffTeams.map(
        (team) => team.id
      )
    );

  // =========================================================
  // RECORD FORMAT
  // =========================================================

  function formatRecord(
    team
  ) {
    if (!team) {
      return "0-0";
    }

    if (team.ties > 0) {
      return `${team.wins}-${team.losses}-${team.ties}`;
    }

    return `${team.wins}-${team.losses}`;
  }

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

      <section className="home-hero">

        <div className="home-hero-content">

          <p className="eyebrow">
            {currentSeason} SEASON
          </p>

          <h1>
            Dirty P Fantasy Football
          </h1>

          <p className="home-hero-copy">
            Current season hub and league archive.
          </p>

        </div>

      </section>


      {/* =====================================================
          NAVIGATION
          ===================================================== */}

      <section className="quick-links">

        <a
          href="/"
          className="active"
        >
          Home
        </a>

        <a href="/owners">
          Owners
        </a>

        <a href="/champions">
          Champions
        </a>

        <a href="/records">
          Records
        </a>

        <a href="/head-to-head">
          Head-to-Head
        </a>

        <a href="/rivalry-week">
          Rivalry Week
        </a>

        <a href="/goat">
          GOAT Rankings
        </a>

      </section>


      {/* =====================================================
          CURRENT CHAMPION
          ===================================================== */}

      {latestSeason && (
        <section className="home-champion">

          <div className="home-champion-label">

            <p className="eyebrow">
              CURRENT CHAMPION
            </p>

            <h2>
              {
                latestSeason
                  .champion
                  ?.name
              }
            </h2>

          </div>


          <div className="home-champion-details">

            <span>
              {
                latestSeason.year
              }{" "}
              CHAMPION
            </span>

            <strong>
              {
                latestSeason
                  .championship_score
              }
            </strong>

            <small>
              Defeated{" "}
              {
                latestSeason
                  .runner_up
                  ?.name
              }
            </small>

          </div>

        </section>
      )}


      {/* =====================================================
          LIVE STANDINGS
          ===================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              LIVE FROM ESPN
            </p>

            <h2>
              Current Standings
            </h2>

          </div>

          <span>
            Week {currentWeek} · Updates automatically
          </span>

        </div>


        {espnError ? (

          <div className="current-panel">

            <div className="empty-current-state">

              <strong>
                ESPN standings are unavailable.
              </strong>

              <p>
                {espnError}
              </p>

            </div>

          </div>

        ) : (

          <div className="division-card">

            <div className="division-title">

              <h3>
                {currentSeason} League Standings
              </h3>

            </div>


            <div className="division-header">

              <span>
                RK
              </span>

              <span>
                TEAM
              </span>

              <span>
                W-L
              </span>

              <span>
                PF
              </span>

            </div>


            {standings.map(
              (
                team,
                index
              ) => {

                const inPlayoffs =
                  playoffTeamIds.has(
                    team.id
                  );

                return (
                  <div
                    key={
                      team.id
                    }
                    className={`division-row ${
                      inPlayoffs
                        ? "playoff-position"
                        : ""
                    }`}
                  >

                    <span className="standings-rank">
                      {index + 1}
                    </span>


                    <div className="standings-team">

                      <div className="team-name-line">

                        <strong>
                          {
                            team.teamName
                          }
                        </strong>


                        {inPlayoffs && (
                          <span className="playoff-badge">
                            PLAYOFF
                          </span>
                        )}

                      </div>


                      <span>
                        {
                          team.ownerName
                        }
                      </span>

                    </div>


                    <strong className="standings-record">
                      {
                        formatRecord(
                          team
                        )
                      }
                    </strong>


                    <strong className="standings-pf">
                      {
                        team.pointsFor.toFixed(
                          2
                        )
                      }
                    </strong>

                  </div>
                );
              }
            )}

          </div>

        )}

      </section>


      {/* =====================================================
          PLAYOFF PICTURE
          ===================================================== */}

      {!espnError &&
        standings.length >
          0 && (

        <section className="section-block">

          <div className="section-heading">

            <div>

              <p className="eyebrow">
                IF THE SEASON ENDED TODAY
              </p>

              <h2>
                Current Playoff Picture
              </h2>

            </div>

            <span>
              {
                playoffTeamCount
              }{" "}
              Teams Make the Playoffs
            </span>

          </div>


          <div className="division-card">

            <div className="division-title">

              <h3>
                Current Playoff Field
              </h3>

            </div>


            <div className="division-header">

              <span>
                SEED
              </span>

              <span>
                TEAM
              </span>

              <span>
                W-L
              </span>

              <span>
                PF
              </span>

            </div>


            {playoffTeams.map(
              (
                team,
                index
              ) => (

                <div
                  key={
                    team.id
                  }
                  className="division-row playoff-position"
                >

                  <span className="standings-rank">
                    {index + 1}
                  </span>


                  <div className="standings-team">

                    <div className="team-name-line">

                      <strong>
                        {
                          team.teamName
                        }
                      </strong>

                      <span className="playoff-badge">
                        PLAYOFF
                      </span>

                    </div>

                    <span>
                      {
                        team.ownerName
                      }
                    </span>

                  </div>


                  <strong className="standings-record">
                    {
                      formatRecord(
                        team
                      )
                    }
                  </strong>


                  <strong className="standings-pf">
                    {
                      team.pointsFor.toFixed(
                        2
                      )
                    }
                  </strong>

                </div>
              )
            )}


            {firstTeamOut && (
              <>

                <div className="division-title">

                  <h3>
                    First Team Out
                  </h3>

                </div>


                <div className="division-row">

                  <span className="standings-rank">
                    {
                      playoffTeamCount +
                      1
                    }
                  </span>


                  <div className="standings-team">

                    <div className="team-name-line">

                      <strong>
                        {
                          firstTeamOut.teamName
                        }
                      </strong>

                    </div>

                    <span>
                      {
                        firstTeamOut.ownerName
                      }
                    </span>

                  </div>


                  <strong className="standings-record">
                    {
                      formatRecord(
                        firstTeamOut
                      )
                    }
                  </strong>


                  <strong className="standings-pf">
                    {
                      firstTeamOut.pointsFor.toFixed(
                        2
                      )
                    }
                  </strong>

                </div>

              </>
            )}

          </div>

        </section>
      )}


      {/* =====================================================
          CURRENT OWNER MAP
          ===================================================== */}

      <DirtyPMap />


      {/* =====================================================
          FOOTER
          ===================================================== */}

      <footer className="site-footer">

        <strong>
          DIRTY P FANTASY FOOTBALL
        </strong>

        <span>
          THE LEAGUE ARCHIVE · EST. 2014
        </span>

        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>

      </footer>

    </main>
  );
}
