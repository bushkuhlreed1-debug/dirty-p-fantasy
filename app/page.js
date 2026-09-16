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

  const uniqueChampions = new Set(
    seasons
      ?.map((season) => season.champion?.name)
      .filter(Boolean)
  ).size;

  return (
    <main className="page-shell">

      {/* NAVIGATION */}
      <nav className="site-nav">
        <a href="/" className="site-brand">
          <strong>DIRTY P</strong>
          <span>FANTASY FOOTBALL</span>
        </a>

        <div className="nav-links">
          <a href="/">Home</a>
          <a href="/seasons">Seasons</a>
          <a href="/owners">Owners</a>
          <a href="/champions">Champions</a>
          <a href="/records">Records</a>
          <a href="/head-to-head">Head-to-Head</a>
          <a href="/rivalry-week">Rivalry Week</a>
          <a href="/goat">GOAT</a>
        </div>
      </nav>

      {/* ARCHIVE HEADER */}
      <header className="archive-header">
        <p className="eyebrow">EST. 2014</p>

        <h1>THE DIRTY P ARCHIVE</h1>

        <p className="archive-subtitle">
          The complete history of Dirty P Fantasy Football.
        </p>
      </header>

      {/* LEAGUE STATS */}
      <section className="league-stats">
        <div>
          <strong>{seasons.length}</strong>
          <span>Seasons</span>
        </div>

        <div>
          <strong>15</strong>
          <span>Historical Owners</span>
        </div>

        <div>
          <strong>925</strong>
          <span>Matchups</span>
        </div>

        <div>
          <strong>{uniqueChampions}</strong>
          <span>Champions</span>
        </div>
      </section>

      {/* DEFENDING CHAMPION */}
      {latestSeason && (
        <section className="champion-strip">
          <div>
            <span className="champion-icon">🏆</span>

            <div>
              <p className="eyebrow">
                {latestSeason.year} DIRTY P CHAMPION
              </p>

              <h2>{latestSeason.champion?.name}</h2>
            </div>
          </div>

          <p className="champion-result">
            defeated {latestSeason.runner_up?.name}
            <strong>{latestSeason.championship_score}</strong>
          </p>
        </section>
      )}

      {/* RIVALRY WEEK */}
      <section className="rivalry-strip">
        <div>
          <p className="eyebrow">NEW TRADITION · EST. 2026</p>

          <h2>Rivalry Week</h2>

          <p>
            The grudges are official. Rivalry Week begins in 2026
            with designated matchups between Dirty P rivals.
          </p>
        </div>

        <a href="/rivalry-week">
          View Rivalry Week →
        </a>
      </section>

      {/* RECENT CHAMPIONS */}
      <section className="history-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LEAGUE HISTORY</p>
            <h2>Recent Champions</h2>
          </div>

          <a href="/champions">
            View Full History →
          </a>
        </div>

        <div className="championship-table">

          <div className="championship-row championship-header">
            <span>Season</span>
            <span>Champion</span>
            <span>Runner-Up</span>
            <span>Championship</span>
          </div>

          {recentChampions.map((season) => (
            <div className="championship-row" key={season.year}>
              <strong>{season.year}</strong>

              <span className="champion-name">
                {season.champion?.name || "Unknown"}
              </span>

              <span>
                {season.runner_up?.name || "Unknown"}
              </span>

              <strong>
                {season.championship_score}
              </strong>
            </div>
          ))}

        </div>
      </section>

      {/* EXPLORE */}
      <section className="explore-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXPLORE</p>
            <h2>Dig Into The Archive</h2>
          </div>
        </div>

        <div className="explore-links">
          <a href="/seasons">
            <strong>Seasons</strong>
            <span>Year-by-year history →</span>
          </a>

          <a href="/owners">
            <strong>Owners</strong>
            <span>Career histories →</span>
          </a>

          <a href="/records">
            <strong>Record Book</strong>
            <span>All-time records →</span>
          </a>

          <a href="/head-to-head">
            <strong>Head-to-Head</strong>
            <span>Owner vs. owner →</span>
          </a>

          <a href="/goat">
            <strong>GOAT</strong>
            <span>All-time debate →</span>
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="site-footer">
        <strong>DIRTY P FANTASY FOOTBALL</strong>

        <span>The League Archive · Est. 2014</span>

        <p>
          Independent fantasy league archive. Not affiliated with
          or endorsed by ESPN.
        </p>
      </footer>

    </main>
  );
}
