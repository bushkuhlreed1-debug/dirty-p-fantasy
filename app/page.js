import { supabase } from "../lib/supabase";

export default async function Home() {
  // Get completed championship history for defending champion
  const { data: seasons, error: seasonsError } = await supabase
    .from("seasons")
    .select(`
      year,
      championship_score,
      champion:champion_owner_id(name),
      runner_up:runner_up_owner_id(name)
    `)
    .lt("year", 2026)
    .order("year", { ascending: false });

  // Get 2026 standings
  const { data: standings, error: standingsError } = await supabase
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
    .eq("season_year", 2026)
    .order("wins", { ascending: false })
    .order("points_for", { ascending: false });

  // Get 2026 team names
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select(`
      owner_id,
      team_name
    `)
    .eq("season_year", 2026);

  if (seasonsError || standingsError || teamsError) {
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

  // Match each owner's 2026 team name to standings
  const standingsWithTeams = (standings || [])
    .map((standing) => {
      const team = teams?.find(
        (team) => team.owner_id === standing.owner_id
      );

      return {
        ...standing,
        team_name: team?.team_name || standing.owner?.name || "Unknown",
      };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      return Number(b.points_for) - Number(a.points_for);
    });

  return (
    <main className="page-shell">

      {/* HEADER */}
      <header className="site-header">
        <div className="site-title">
          <strong>DIRTY P FANTASY FOOTBALL</strong>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">
            THE LEAGUE ARCHIVE · EST. 2014
          </p>

          <h1>Dirty P Fantasy Football</h1>

          <p className="hero-copy">
            Championships, rivalries, heartbreak, dominance,
            and questionable fantasy decisions.
          </p>
        </div>
      </section>

      {/* DEFENDING CHAMPION */}
      {latestSeason && (
        <section className="champion-strip">
          <div className="champion-strip-title">
            <span className="card-label">
              DEFENDING CHAMPION
            </span>

            <strong>
              {latestSeason.champion?.name}
            </strong>
          </div>

          <div className="champion-strip-result">
            <span>
              {latestSeason.year} Champion
            </span>

            <span className="champion-divider">
              •
            </span>

            <span>
              defeated {latestSeason.runner_up?.name}
            </span>

            <strong>
              {latestSeason.championship_score}
            </strong>
          </div>
        </section>
      )}

      {/* MAIN NAVIGATION */}
      <section className="quick-links">
        <a href="/seasons">Seasons</a>
        <a href="/owners">Owners</a>
        <a href="/champions">Champions</a>
        <a href="/records">Records</a>
        <a href="/head-to-head">Head-to-Head</a>
        <a href="/rivalry-week">Rivalry Week</a>
        <a href="/goat">GOAT Rankings</a>
      </section>

      {/* CURRENT STANDINGS */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              2026 SEASON
            </p>

            <h2>Current Standings</h2>
          </div>

          <span>Week 1</span>
        </div>

        <div className="current-panel">

          <div className="standings-header">
            <span>RK</span>
            <span>TEAM</span>
            <span>W-L</span>
            <span>PF</span>
          </div>

          {standingsWithTeams.map((standing, index) => (
            <div
              className="standings-row"
              key={standing.owner_id}
            >
              <span className="standings-rank">
                {index + 1}
              </span>

              <div className="standings-team">
                <strong>{standing.team_name}</strong>

                <span>
                  {standing.owner?.name}
                </span>
              </div>

              <strong className="standings-record">
                {standing.wins}-{standing.losses}
                {standing.ties > 0
                  ? `-${standing.ties}`
                  : ""}
              </strong>

              <strong className="standings-pf">
                {Number(standing.points_for).toFixed(2)}
              </strong>
            </div>
          ))}

        </div>
      </section>

      {/* CURRENT WEEK MATCHUPS */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              2026 SEASON
            </p>

            <h2>This Week&apos;s Matchups</h2>
          </div>

          <span>Current Week</span>
        </div>

        <div className="current-panel">
          <div className="empty-current-state">
            <strong>
              Current matchups are coming next.
            </strong>

            <p>
              All five weekly matchups and scores will appear
              here once the current matchup data is connected.
            </p>
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
