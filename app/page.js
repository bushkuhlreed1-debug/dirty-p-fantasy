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

      {/* SITE HEADER */}
      <header className="site-header">
        <div className="site-title">
          <strong>DIRTY P FANTASY FOOTBALL</strong>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      {/* NAVIGATION RIBBON */}
      <nav className="nav-ribbon">
        <a href="/" className="active">
          Home
        </a>
        <a href="/seasons">Seasons</a>
        <a href="/owners">Owners</a>
        <a href="/champions">Champions</a>
        <a href="/records">Records</a>
        <a href="/head-to-head">Head-to-Head</a>
        <a href="/rivalry-week">Rivalry Week</a>
        <a href="/goat">GOAT</a>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">THE LEAGUE ARCHIVE</p>

          <h1>Dirty P Fantasy Football</h1>

          <p className="hero-copy">
            Twelve seasons of championships, rivalries, heartbreak,
            dominance, and questionable fantasy decisions.
          </p>
        </div>
      </section>

      {/* DEFENDING CHAMPION */}
      {latestSeason && (
        <section className="champion-strip">
          <div className="champion-strip-title">
            <span className="card-label">DEFENDING CHAMPION</span>
            <strong>{latestSeason.champion?.name}</strong>
          </div>

          <div className="champion-strip-result">
            <span>
              {latestSeason.year} Champion
            </span>

            <span className="champion-divider">•</span>

            <span>
              defeated {latestSeason.runner_up?.name}
            </span>

            <strong>{latestSeason.championship_score}</strong>
          </div>
        </section>
      )}

      {/* ARCHIVE LINKS */}
      <section className="quick-links">
        <a href="/seasons">Seasons</a>
        <a href="/owners">Owners</a>
        <a href="/champions">Champions</a>
        <a href="/records">Records</a>
        <a href="/head-to-head">Head-to-Head</a>
        <a href="/rivalry-week">Rivalry Week</a>
        <a href="/goat">GOAT Rankings</a>
      </section>

      {/* CHAMPIONSHIP HISTORY */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LEAGUE ARCHIVE</p>
            <h2>Championship History</h2>
          </div>

          <span>{seasons.length} Seasons</span>
        </div>

        <div className="season-grid">
          {seasons.map((season) => (
            <article className="season-card" key={season.year}>
              <div className="season-year">
                {season.year}
              </div>

              <div className="season-details">
                <span className="card-label">
                  Champion
                </span>

                <h3>
                  {season.champion?.name || "Unknown"}
                </h3>

                <p className="runner-up">
                  over {season.runner_up?.name || "Unknown"}
                </p>

                <p className="championship-score">
                  {season.championship_score}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>

        <span>
          The League Archive · Est. 2014
        </span>

        <p>
          Independent fantasy league archive. Not affiliated with
          or endorsed by ESPN.
        </p>
      </footer>

    </main>
  );
}
