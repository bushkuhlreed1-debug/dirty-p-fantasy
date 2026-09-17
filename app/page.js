import { supabase } from "../lib/supabase";

export default async function Home() {
  const currentSeason = 2026;

  // =========================
  // LEAGUE HISTORY
  // =========================

  const { data: seasons, error: seasonsError } = await supabase
    .from("seasons")
    .select(`
      year,
      championship_score,
      champion:champion_owner_id(name),
      runner_up:runner_up_owner_id(name)
    `)
    .order("year", { ascending: false });

  // =========================
  // OWNERS
  // =========================

  const { data: owners, error: ownersError } = await supabase
    .from("owners")
    .select("id, name");

  // =========================
  // DATABASE ERROR
  // =========================

  if (seasonsError || ownersError) {
    return (
      <main className="page-shell">
        <h1>Dirty P Fantasy Football</h1>

        <p>
          Database error:{" "}
          {seasonsError?.message ||
            ownersError?.message}
        </p>
      </main>
    );
  }

  // =========================
  // ARCHIVE STATS
  // =========================

  const totalSeasons = seasons?.length || 0;

  const uniqueChampions = new Set(
    (seasons || [])
      .map((season) => season.champion?.name)
      .filter(Boolean)
  ).size;

  const totalOwners = owners?.length || 0;

  const latestSeason = seasons?.[0];

  // =========================
  // PAGE
  // =========================

  return (
    <main className="page-shell">

      {/* HEADER */}

      <header className="site-header">
        <div className="site-title">
          <strong>
            DIRTY P FANTASY FOOTBALL
          </strong>

          <span>
            THE LEAGUE ARCHIVE · EST. 2014
          </span>
        </div>
      </header>

      {/* HERO */}

      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">
            THE LEAGUE ARCHIVE · EST. 2014
          </p>

          <h1>
            Dirty P Fantasy Football
          </h1>

          <p className="hero-copy">
            Championships, rivalries, heartbreak,
            dominance, and questionable fantasy
            decisions.
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
              defeated{" "}
              {latestSeason.runner_up?.name}
            </span>

            <strong>
              {latestSeason.championship_score}
            </strong>
          </div>
        </section>
      )}

      {/* MAIN NAVIGATION */}

      <section className="quick-links">

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

        <a href="/news">
          Dirty P News
        </a>

      </section>

      {/* ARCHIVE OVERVIEW */}

      <section className="section-block">

        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE ARCHIVE
            </p>

            <h2>
              League History
            </h2>
          </div>

          <span>
            Since 2014
          </span>
        </div>

        <div className="archive-stats">

          {/* SEASONS */}

          <a
            href="/seasons"
            className="archive-stat-card"
          >
            <span className="archive-stat-number">
              {totalSeasons}
            </span>

            <span className="archive-stat-label">
              Seasons
            </span>

            <span className="archive-stat-description">
              Every season from the beginning
            </span>
          </a>

          {/* CHAMPIONS */}

          <a
            href="/champions"
            className="archive-stat-card"
          >
            <span className="archive-stat-number">
              {uniqueChampions}
            </span>

            <span className="archive-stat-label">
              Champions
            </span>

            <span className="archive-stat-description">
              Owners who have captured the title
            </span>
          </a>

          {/* OWNERS */}

          <a
            href="/owners"
            className="archive-stat-card"
          >
            <span className="archive-stat-number">
              {totalOwners}
            </span>

            <span className="archive-stat-label">
              Team Owners
            </span>

            <span className="archive-stat-description">
              The people behind the league
            </span>
          </a>

          {/* NEWS */}

          <a
            href="/news"
            className="archive-stat-card archive-stat-news"
          >
            <span className="archive-stat-kicker">
              DIRTY P
            </span>

            <span className="archive-stat-label">
              News
            </span>

            <span className="archive-stat-description">
              Recaps, previews, stories, and league
              bullshit
            </span>
          </a>

        </div>

      </section>

      {/* DIRTY P NEWS */}

      <section className="section-block">

        <div className="section-heading">
          <div>
            <p className="eyebrow">
              DIRTY P NEWS
            </p>

            <h2>
              Around the League
            </h2>
          </div>

          <a
            href="/news"
            className="section-link"
          >
            View All News →
          </a>
        </div>

        <div className="news-grid">

          {/* 2025 RECAP */}

          <a
            href="/news/2025-season-recap"
            className="news-card"
          >
            <div className="news-card-top">
              <span className="news-kicker">
                2025 SEASON
              </span>

              <span className="news-arrow">
                →
              </span>
            </div>

            <h3>
              2025 Season Recap
            </h3>

            <p>
              The championship run, the biggest
              storylines, the heartbreak, and the
              moments that defined the 2025 season.
            </p>

            <span className="news-read">
              READ RECAP
            </span>
          </a>

          {/* 2026 PREVIEW */}

          <a
            href="/news/2026-season-preview"
            className="news-card"
          >
            <div className="news-card-top">
              <span className="news-kicker">
                2026 SEASON
              </span>

              <span className="news-arrow">
                →
              </span>
            </div>

            <h3>
              2026 Season Preview
            </h3>

            <p>
              New season. New rivalries. New
              opportunities to make questionable
              fantasy football decisions.
            </p>

            <span className="news-read">
              READ PREVIEW
            </span>
          </a>

        </div>

      </section>

      {/* FEATURED HISTORY */}

      <section className="section-block">

        <div className="section-heading">
          <div>
            <p className="eyebrow">
              EXPLORE
            </p>

            <h2>
              The League Archive
            </h2>
          </div>
        </div>

        <div className="archive-links">

          <a href="/seasons">
            <strong>
              Seasons
            </strong>

            <span>
              Browse the complete season history
            </span>
          </a>

          <a href="/champions">
            <strong>
              Champions
            </strong>

            <span>
              See every championship and runner-up
            </span>
          </a>

          <a href="/records">
            <strong>
              Records
            </strong>

            <span>
              The numbers that define Dirty P
            </span>
          </a>

          <a href="/head-to-head">
            <strong>
              Head-to-Head
            </strong>

            <span>
              See how every owner stacks up
            </span>
          </a>

          <a href="/rivalry-week">
            <strong>
              Rivalry Week
            </strong>

            <span>
              Five rivalries. One miserable week.
            </span>
          </a>

          <a href="/goat">
            <strong>
              GOAT Rankings
            </strong>

            <span>
              The league's all-time legends
            </span>
          </a>

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
          Independent fantasy league archive. Not
          affiliated with or endorsed by ESPN.
        </p>
      </footer>

    </main>
  );
}
