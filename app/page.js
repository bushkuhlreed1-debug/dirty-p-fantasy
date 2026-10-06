import { supabase } from "../lib/supabase";
import DirtyPMap from "./DirtyPMap";

export default async function Home() {
  const currentSeason = 2026;

  // =========================================================
  // CURRENT CHAMPION
  // =========================================================

  const { data: seasons, error: seasonsError } = await supabase
    .from("seasons")
    .select(`
      year,
      championship_score,
      champion:champion_owner_id(name),
      runner_up:runner_up_owner_id(name)
    `)
    .lt("year", currentSeason)
    .order("year", { ascending: false });

  // =========================================================
  // CURRENT STANDINGS
  // =========================================================

  const { data: standings, error: standingsError } =
    await supabase
      .from("season_results")
      .select(`
        owner_id,
        wins,
        losses,
        ties,
        points_for,
        points_against,
        owner:owner_id(name)
      `)
      .eq("season_year", currentSeason);

  // =========================================================
  // CURRENT TEAMS
  // =========================================================

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select(`
      owner_id,
      team_name,
      division
    `)
    .eq("season_year", currentSeason);

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (
    seasonsError ||
    standingsError ||
    teamsError
  ) {
    return (
      <main className="page-shell">
        <h1>Dirty P Fantasy Football</h1>

        <p>
          Database error:{" "}
          {seasonsError?.message ||
            standingsError?.message ||
            teamsError?.message}
        </p>
      </main>
    );
  }

  const latestSeason = seasons?.[0];

  // =========================================================
  // COMBINE STANDINGS + TEAM DATA
  // =========================================================

  const standingsWithTeams = (standings || []).map(
    (standing) => {
      const team = (teams || []).find(
        (team) =>
          team.owner_id === standing.owner_id
      );

      return {
        ...standing,

        team_name:
          team?.team_name ||
          standing.owner?.name ||
          "Unknown Team",

        division:
          team?.division || "",
      };
    }
  );

  // =========================================================
  // SORT OVERALL STANDINGS
  //
  // WINS
  // THEN TIES
  // THEN POINTS FOR
  // =========================================================

  const overallStandings = [
    ...standingsWithTeams,
  ].sort((a, b) => {
    if (Number(b.wins) !== Number(a.wins)) {
      return Number(b.wins) - Number(a.wins);
    }

    if (Number(b.ties) !== Number(a.ties)) {
      return Number(b.ties) - Number(a.ties);
    }

    return (
      Number(b.points_for) -
      Number(a.points_for)
    );
  });

  // =========================================================
  // CURRENT PLAYOFF PICTURE
  //
  // CURRENTLY SET TO TOP 4 OVERALL
  // =========================================================

  const playoffTeams =
    overallStandings.slice(0, 4);

  const firstTeamOut =
    overallStandings[4] || null;

  const playoffOwnerIds = new Set(
    playoffTeams.map(
      (team) => team.owner_id
    )
  );

  // =========================================================
  // FORMAT RECORD
  // =========================================================

  function formatRecord(team) {
    if (!team) return "0-0";

    const ties = Number(team.ties || 0);

    if (ties > 0) {
      return `${team.wins}-${team.losses}-${ties}`;
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
              {latestSeason.champion?.name}
            </h2>

          </div>


          <div className="home-champion-details">

            <span>
              {latestSeason.year} CHAMPION
            </span>

            <strong>
              {latestSeason.championship_score}
            </strong>

            <small>
              Defeated{" "}
              {latestSeason.runner_up?.name}
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
              {currentSeason} SEASON
            </p>

            <h2>
              Current Standings
            </h2>

          </div>

          <span>
            Overall League Standings
          </span>

        </div>


        <div className="division-card">

          <div className="division-title">

            <h3>
              Dirty P Fantasy Football
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


          {overallStandings.map(
            (standing, index) => {
              const inPlayoffPosition =
                playoffOwnerIds.has(
                  standing.owner_id
                );

              return (
                <div
                  key={standing.owner_id}
                  className={`division-row ${
                    inPlayoffPosition
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
                        {standing.team_name}
                      </strong>

                      {inPlayoffPosition && (
                        <span className="playoff-badge">
                          PLAYOFF
                        </span>
                      )}

                    </div>

                    <span>
                      {standing.owner?.name}
                    </span>

                  </div>


                  <strong className="standings-record">
                    {formatRecord(standing)}
                  </strong>


                  <strong className="standings-pf">

                    {Number(
                      standing.points_for || 0
                    ).toFixed(2)}

                  </strong>

                </div>
              );
            }
          )}

        </div>

      </section>


      {/* =====================================================
          CURRENT PLAYOFF PICTURE
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
            Top 4 Overall
          </span>

        </div>


        <div className="division-card">

          <div className="division-title">

            <h3>
              Playoff Field
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
            (standing, index) => (
              <div
                key={standing.owner_id}
                className="division-row playoff-position"
              >

                <span className="standings-rank">
                  {index + 1}
                </span>


                <div className="standings-team">

                  <div className="team-name-line">

                    <strong>
                      {standing.team_name}
                    </strong>

                    <span className="playoff-badge">
                      PLAYOFF
                    </span>

                  </div>

                  <span>
                    {standing.owner?.name}
                  </span>

                </div>


                <strong className="standings-record">
                  {formatRecord(standing)}
                </strong>


                <strong className="standings-pf">

                  {Number(
                    standing.points_for || 0
                  ).toFixed(2)}

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
                  5
                </span>


                <div className="standings-team">

                  <div className="team-name-line">

                    <strong>
                      {firstTeamOut.team_name}
                    </strong>

                  </div>

                  <span>
                    {firstTeamOut.owner?.name}
                  </span>

                </div>


                <strong className="standings-record">
                  {formatRecord(firstTeamOut)}
                </strong>


                <strong className="standings-pf">

                  {Number(
                    firstTeamOut.points_for || 0
                  ).toFixed(2)}

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
