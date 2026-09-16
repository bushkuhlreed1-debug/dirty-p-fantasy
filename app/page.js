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
  const recentChampions = seasons?.slice(0, 4) || [];

  return (
    <main className="page-shell">

      {/* TOP NAVIGATION */}
      <nav className="site-nav">
        <a href="/" className="site-brand">
          <span className="brand-mark">DP</span>
          <span>
            <strong>DIRTY P</strong>
            <small>FANTASY FOOTBALL</small>
          </span>
        </a>

        <div className="nav-links">
          <a href="/">Home</a>
          <a href="/seasons">Seasons</a>
          <a href="/owners">Owners</a>
          <a href="/champions">Champions</a>
          <a href="/records">Records</a>
          <a href="/head-to-head">Head-to-Head</a>
          <a href="/goat">GOAT</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="archive-hero">
        <div className="archive-intro">
          <p className="eyebrow">THE LEAGUE ARCHIVE · EST. 2014</p>

          <h1>
            Dirty P
            <span>Fantasy Football</span>
          </h1>

          <p className="hero-copy">
            The permanent home of Dirty P Fantasy Football history.
            Seasons, champions, owners, records, rivalries and more
            from over a decade of competition.
          </p>

          <div className="archive-actions">
            <a href="/seasons" className="primary-button">
              Explore the Archive
            </a>

            <a href="/records" className="secondary-button">
              View Records
            </a>
          </div>
        </div>

        {latestSeason && (
          <div className="champion-card">
            <span className="card-label">DEFENDING CHAMPION</span>

            <div className="trophy">🏆</div>

            <h2>{latestSeason.champion?.name}</h2>

            <p>{latestSeason.year} Dirty P Champion</p>

            <strong>{latestSeason.championship_score}</strong>

            <span className="championship-opponent">
              over {latestSeason.runner_up?.name}
            </span>
          </div>
        )}
      </section>

      {/* LEAGUE SNAPSHOT */}
      <section className="league-snapshot">
        <div>
          <strong>2014</strong>
          <span>Founded</span>
        </div>

        <div>
          <strong>{seasons.length}</strong>
          <span>Completed Seasons</span>
        </div>

        <div>
          <strong>15</strong>
          <span>Historical Owners</span>
        </div>

        <div>
          <strong>925</strong>
          <span>Recorded Matchups</span>
        </div>
      </section>

      {/* RIVALRY WEEK */}
      <section className="feature-section rivalry-feature">
        <div className="feature-copy">
          <p className="eyebrow">NEW TRADITION · EST. 2026</p>

          <h2>Rivalry Week</h2>

          <p>
            The grudges are official. Beginning in 2026, Dirty P
            Fantasy Football features a designated Rivalry Week
            built around the league's official rivalry matchups.
          </p>

          <span className="coming-soon">
            2026 Rivalry Week history begins here.
          </span>
        </div>

        <div className="rivalry-badge">
          <span>DIRTY P</span>
          <strong>VS</strong>
          <span>RIVALRY WEEK</span>
        </div>
      </section>

      {/* ARCHIVE DIRECTORY */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXPLORE DIRTY P</p>
            <h2>League Archive</h2>
          </div>
        </div>

        <div className="archive-grid">
          <a href="/seasons" className="archive-card">
            <span>01</span>
            <h3>Seasons</h3>
            <p>Explore every Dirty P season from 2014 forward.</p>
          </a>

          <a href="/owners" className="archive-card">
            <span>02</span>
            <h3>Owners</h3>
            <p>Career records, championships and owner histories.</p>
          </a>

          <a href="/champions" className="archive-card">
            <span>03</span>
            <h3>Champions</h3>
            <p>Every champion and championship matchup.</p>
          </a>

          <a href="/records" className="archive-card">
            <span>04</span>
            <h3>Record Book</h3>
            <p>The greatest performances and league records.</p>
          </a>

          <a href="/head-to-head" className="archive-card">
            <span>05</span>
            <h3>Head-to-Head</h3>
            <p>See how Dirty P owners have performed against each other.</p>
          </a>

          <a href="/goat" className="archive-card">
            <span>06</span>
            <h3>GOAT</h3>
            <p>The all-time debate backed by Dirty P history.</p>
          </a>
        </div>
      </section>

      {/* RECENT CHAMPIONS */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CHAMPIONSHIP HISTORY</p>
            <h2>Recent Champions</h2>
          </div>

          <a href="/champions" className="section-link">
            View All Champions →
          </a>
        </div>

        <div className="recent-champions">
          {recentChampions.map((season) => (
            <article className="recent-champion-card" key={season.year}>
              <span className="season-year">{season.year}</span>

              <div>
                <span className="card-label">CHAMPION</span>
                <h3>{season.champion?.name || "Unknown"}</h3>

                <p>
                  defeated {season.runner_up?.name || "Unknown"}
                </p>

                <strong>{season.championship_score}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="site-footer">
        <div>
          <strong>Dirty P Fantasy Football</strong>
          <span>The League Archive · Est. 2014</span>
        </div>

        <p>
          Independent fantasy league archive. Not affiliated with or
          endorsed by ESPN or the NFL.
        </p>
      </footer>

    </main>
  );
}
