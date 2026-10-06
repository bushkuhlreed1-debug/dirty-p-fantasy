import {
  supabase,
} from "../lib/supabase";

import {
  getEspnLeague,
} from "../lib/espn";

import DirtyPMap
  from "./DirtyPMap";


export const dynamic =
  "force-dynamic";


export default async function Home() {
  const currentSeason =
    Number(
      process.env
        .ESPN_SEASON ||
        2026
    );

  // =========================================================
  // CURRENT CHAMPION
  // =========================================================

  const {
    data: seasons,
    error: seasonsError,
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
      );

  // =========================================================
  // CURRENT ESPN STANDINGS SNAPSHOT
  // =========================================================

  const {
    data:
      savedStandings,
    error:
      standingsError,
  } =
    await supabase
      .from(
        "espn_current_standings"
      )
      .select(`
        season_year,
        espn_team_id,
        owner_name,
        team_name,
        wins,
        losses,
        ties,
        points_for,
        points_against,
        playoff_seed,
        division_id,
        division_name,
        current_week,
        playoff_team_count,
        synced_at
      `)
      .eq(
        "season_year",
        currentSeason
      );

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (
    seasonsError ||
    standingsError
  ) {
    return (
      <main className="page-shell">

        <h1>
          Dirty P Fantasy Football
        </h1>

        <p>
          Database error:{" "}
          {
            seasonsError
              ?.message ||
            standingsError
              ?.message
          }
        </p>

      </main>
    );
  }

  const latestSeason =
    seasons?.[0] ||
    null;

  // =========================================================
  // USE SAVED TUESDAY SNAPSHOT
  //
  // BEFORE THE FIRST CRON RUN, FALL BACK TO ESPN DIRECTLY.
  // =========================================================

  let standings =
    savedStandings || [];

  let currentWeek =
    standings?.[0]
      ?.current_week ||
    1;

  let playoffTeamCount =
    standings?.[0]
      ?.playoff_team_count ||
    4;

  let lastUpdated =
    standings?.[0]
      ?.synced_at ||
    null;

  // =========================================================
  // FIRST-RUN FALLBACK
  // =========================================================

  if (
    standings.length === 0
  ) {
    try {
      const league =
        await getEspnLeague();

      standings =
        league.teams.map(
          (team) => ({
            season_year:
              league.season,

            espn_team_id:
              team.espnTeamId,

            owner_name:
              team.ownerName,

            team_name:
              team.teamName,

            wins:
              team.wins,

            losses:
              team.losses,

            ties:
              team.ties,

            points_for:
              team.pointsFor,

            points_against:
              team.pointsAgainst,

            playoff_seed:
              team.playoffSeed,

            division_id:
              team.divisionId,

            division_name:
              team.divisionName,

            current_week:
              league.currentWeek,

            playoff_team_count:
              league.playoffTeamCount,
          })
        );

      currentWeek =
        league.currentWeek;

      playoffTeamCount =
        league.playoffTeamCount;
    } catch (error) {
      console.error(
        "Initial ESPN fallback failed:",
        error
      );
    }
  }

  // =========================================================
  // SORT CURRENT STANDINGS
  // =========================================================

  standings =
    [...standings].sort(
      (a, b) => {
        const aSeed =
          Number(
            a.playoff_seed ||
              0
          );

        const bSeed =
          Number(
            b.playoff_seed ||
              0
          );

        if (
          aSeed > 0 &&
          bSeed > 0 &&
          aSeed !== bSeed
        ) {
          return (
            aSeed -
            bSeed
          );
        }

        if (
          Number(b.wins) !==
          Number(a.wins)
        ) {
          return (
            Number(b.wins) -
            Number(a.wins)
          );
        }

        if (
          Number(b.ties) !==
          Number(a.ties)
        ) {
          return (
            Number(b.ties) -
            Number(a.ties)
          );
        }

        return (
          Number(
            b.points_for
          ) -
          Number(
            a.points_for
          )
        );
      }
    );

  // =========================================================
  // PLAYOFF PICTURE
  // =========================================================

  const playoffTeams =
    standings.slice(
      0,
      playoffTeamCount
    );

  const firstTeamOut =
    standings[
      playoffTeamCount
    ] || null;

  const playoffIds =
    new Set(
      playoffTeams.map(
        (team) =>
          team.espn_team_id
      )
    );

  // =========================================================
  // RECORD FORMAT
  // =========================================================

  function formatRecord(
    team
  ) {
    const ties =
      Number(
        team?.ties || 0
      );

    if (ties > 0) {
      return `${team.wins}-${team.losses}-${ties}`;
    }

    return `${team.wins}-${team.losses}`;
  }

  // =========================================================
  // UPDATED DATE
  // =========================================================

  function formatUpdateDate(
    date
  ) {
    if (!date) {
      return "";
    }

    return new Date(
      date
    ).toLocaleDateString(
      "en-US",
      {
        month:
          "short",

        day:
          "numeric",

        year:
          "numeric",
      }
    );
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
                latestSeason
                  .year
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
          CURRENT STANDINGS
          ===================================================== */}

      <section className="section-block">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              WEEK {currentWeek}
            </p>

            <h2>
              Current Standings
            </h2>

          </div>

          <span>

            {lastUpdated
              ? `Updated ${formatUpdateDate(
                  lastUpdated
                )}`
              : "Live ESPN standings"}

          </span>

        </div>


        <div className="division-card">

          <div className="division-title">

            <h3>
              {currentSeason} Standings
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
                playoffIds.has(
                  team.espn_team_id
                );

              return (
                <div
                  key={
                    team.espn_team_id
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
                          team.team_name
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
                        team.owner_name
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

                    {Number(
                      team.points_for ||
                        0
                    ).toFixed(
                      2
                    )}

                  </strong>

                </div>
              );
            }
          )}

        </div>

      </section>


      {/* =====================================================
          PLAYOFF PICTURE
          ===================================================== */}

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
            Playoff Teams
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
                  team.espn_team_id
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
                        team.team_name
                      }
                    </strong>

                    <span className="playoff-badge">
                      PLAYOFF
                    </span>

                  </div>


                  <span>
                    {
                      team.owner_name
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

                  {Number(
                    team.points_for ||
                      0
                  ).toFixed(
                    2
                  )}

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
                        firstTeamOut
                          .team_name
                      }
                    </strong>

                  </div>


                  <span>
                    {
                      firstTeamOut
                        .owner_name
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

                  {Number(
                    firstTeamOut
                      .points_for ||
                      0
                  ).toFixed(
                    2
                  )}

                </strong>

              </div>

            </>
          )}

        </div>

      </section>


      {/* =====================================================
          WHERE THE LEAGUE LIVES
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
