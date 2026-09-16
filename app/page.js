import { supabase } from "../lib/supabase";

export default async function Home() {
  const { data: seasons, error } = await supabase
    .from("seasons")
    .select(`
      year,
      championship_score,
      champion:champion_owner_id(name),
      runner_up:runner_up_owner_id(name)
    `)
    .order("year", { ascending: false });

  if (error) {
    return (
      <main className="page-shell">
        <h1>Dirty P Fantasy Football</h1>
        <p>Database error: {error.message}</p>
      </main>
    );
  }

  const latestSeason = seasons?.[0];

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
          <p className="eyebrow">THE LEAGUE ARCHIVE · EST. 2014</p>

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
        <a href="/seasons">
          Seasons
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

      {/* CURRENT STANDINGS */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              2026 SEASON
            </p>

            <h2>
              Current Standings
            </h2>
          </div>

          <span>
            Regular Season
          </span>
        </div>

        <div className="current-panel">
          <div className="standings-header">
            <span>RK</span>
            <span>TEAM</span>
            <span>W-L</span>
            <span>PF</span>
          </div>

          <div className="empty-current-state">
            <strong>
              2026 standings are coming next.
            </strong>

            <p>
              This section will automatically display the
              current Dirty P standings once the 2026 season
              data is connected.
            </p>
          </div>
        </div>
      </section>

      {/* CURRENT WEEK MATCHUPS */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              2026 SEASON
            </p>

            <h2>
              This Week&apos;s Matchups
            </h2>
          </div>

          <span>
            Current Week
          </span>
        </div>

        <div className="current-panel">
          <div className="matchups-header">
            <span>MATCHUP</span>
            <span>STATUS</span>
          </div>

          <div className="empty-current-state">
            <strong>
              Current matchups are coming next.
            </strong>

            <p>
              All five weekly matchups, scores and game status
              will appear here automatically.
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
