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
      <section className="hero">
        <div>
          <p className="eyebrow">EST. 2014</p>
          <h1>Dirty P Fantasy Football</h1>
          <p className="hero-copy">
            Twelve seasons of championships, rivalries, heartbreak,
            dominance, and questionable fantasy decisions.
          </p>
        </div>

        {latestSeason && (
          <div className="champion-card">
            <span className="card-label">Defending Champion</span>
            <h2>{latestSeason.champion?.name}</h2>
            <p>{latestSeason.year} Champion</p>
            <strong>{latestSeason.championship_score}</strong>
          </div>
        )}
      </section>

      <section className="quick-links">
        <a href="/seasons">Seasons</a>
        <a href="/owners">Owners</a>
        <a href="/champions">Champions</a>
        <a href="/records">Records</a>
        <a href="/rivalries">Rivalries</a>
        <a href="/goat">GOAT Rankings</a>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">League Archive</p>
            <h2>Championship History</h2>
          </div>

          <span>{seasons.length} Seasons</span>
        </div>

        <div className="season-grid">
          {seasons.map((season) => (
            <article className="season-card" key={season.year}>
              <div className="season-year">{season.year}</div>

              <div className="season-details">
                <span className="card-label">Champion</span>
                <h3>{season.champion?.name || "Unknown"}</h3>

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
    </main>
  );
}
