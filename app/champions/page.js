import { supabase } from "../../lib/supabase";

export default async function ChampionsPage() {
  const { data: seasons } = await supabase
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
    .lt("year", 2026)
    .order("year", { ascending: false });

  const { data: teams } = await supabase
    .from("teams")
    .select(`
      season_year,
      owner_id,
      team_name
    `)
    .lt("season_year", 2026);

  const history = seasons || [];
  const teamHistory = teams || [];

  function getTeamName(year, ownerId) {
    return (
      teamHistory.find(
        (team) =>
          team.season_year === year &&
          team.owner_id === ownerId
      )?.team_name || "—"
    );
  }

  const titleMap = {};

  history.forEach((season) => {
    if (!season.champion) return;

    const id = season.champion.id;

    if (!titleMap[id]) {
      titleMap[id] = {
        id,
        name: season.champion.name,
        titles: 0,
        years: [],
      };
    }

    titleMap[id].titles += 1;
    titleMap[id].years.push(season.year);
  });

  const titleLeaders = Object.values(titleMap).sort(
    (a, b) => {
      if (b.titles !== a.titles) {
        return b.titles - a.titles;
      }

      return a.name.localeCompare(b.name);
    }
  );

  return (
    <main className="page-shell">

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

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            LEAGUE HISTORY
          </p>

          <h1>Dirty P Champions</h1>

          <p>
            Every champion, every championship
            matchup, and the owners who have
            collected the most Dirty P titles.
          </p>
        </div>

        <div className="owners-count">
          <strong>{history.length}</strong>
          <span>CHAMPIONSHIPS</span>
        </div>
      </section>

      <div className="page-nav">
        <a href="/">← Home</a>

        <span>
          Championship History
        </span>
      </div>

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE TROPHY CASE
            </p>

            <h2>Championship Leaders</h2>
          </div>
        </div>

        <div className="champions-leader-grid">
          {titleLeaders.map((owner, index) => (
            <a
              href={`/owners/${owner.id}`}
              className="champions-leader-card"
              key={owner.id}
            >
              <div className="champions-rank">
                #{index + 1}
              </div>

              <div className="champions-leader-info">
                <strong>{owner.name}</strong>

                <span>
                  {owner.years
                    .sort((a, b) => a - b)
                    .join(" · ")}
                </span>
              </div>

              <div className="champions-title-count">
                <strong>{owner.titles}</strong>

                <span>
                  {owner.titles === 1
                    ? "TITLE"
                    : "TITLES"}
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              YEAR BY YEAR
            </p>

            <h2>Championship History</h2>
          </div>

          <span>
            2014–2025
          </span>
        </div>

        <div className="championship-history-list">
          {history.map((season) => {
            const championTeam = getTeamName(
              season.year,
              season.champion?.id
            );

            const runnerUpTeam = getTeamName(
              season.year,
              season.runner_up?.id
            );

            return (
              <div
                className="championship-history-card"
                key={season.year}
              >
                <div className="championship-year">
                  <span>SEASON</span>
                  <strong>{season.year}</strong>
                </div>

                <div className="championship-winner">
                  <span>CHAMPION</span>

                  <a
                    href={`/owners/${season.champion?.id}`}
                  >
                    {season.champion?.name || "—"}
                  </a>

                  <small>{championTeam}</small>
                </div>

                <div className="championship-score">
                  <span>FINAL</span>

                  <strong>
                    {season.championship_score || "—"}
                  </strong>
                </div>

                <div className="championship-runner-up">
                  <span>RUNNER-UP</span>

                  <a
                    href={`/owners/${season.runner_up?.id}`}
                  >
                    {season.runner_up?.name || "—"}
                  </a>

                  <small>{runnerUpTeam}</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

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
