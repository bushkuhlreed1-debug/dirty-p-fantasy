import { supabase } from "./lib/supabase";

export default async function Home() {
  // =========================
  // DEFENDING CHAMPION
  // =========================

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

  if (seasonsError) {
    return (
      <main className="page-shell">
        <h1>Dirty P Fantasy Football</h1>
        <p>Database error: {seasonsError.message}</p>
      </main>
    );
  }

  const latestSeason = seasons?.[0];

  return (
    <main className="page-shell">

      {/* =====================================================
          HEADER
          ===================================================== */}

      <header className="site-header">
        <div className="site-title">
          <a href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </a>

          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>


      {/* =====================================================
          HOME HERO
          ===================================================== */}

      <section className="home-hero">

        <div className="home-hero-content">

          <p className="eyebrow">
            WELCOME TO DIRTY P
          </p>

          <h1>
            Dirty P Fantasy Football
          </h1>

          <p className="home-hero-copy">
            Championships, rivalries, heartbreak, dominance,
            questionable decisions, and a whole lot of history.
          </p>

        </div>

      </section>


      {/* =====================================================
          NAVIGATION
          ===================================================== */}

      <section className="quick-links">

        <a href="/" className="active">
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
          DEFENDING CHAMPION
          ===================================================== */}

      {latestSeason && (
        <section className="home-champion">

          <div className="home-champion-label">
            <p className="eyebrow">
              DEFENDING CHAMPION
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
              Defeated {latestSeason.runner_up?.name}
            </small>

          </div>

        </section>
      )}


      {/* =====================================================
          LEAGUE NUMBERS
          ===================================================== */}

      <section className="home-stats">

        <div className="home-stat-card">
          <strong>12</strong>
          <span>SEASONS</span>
        </div>

        <div className="home-stat-card">
          <strong>8</strong>
          <span>CHAMPIONS</span>
        </div>

        <div className="home-stat-card">
          <strong>15</strong>
          <span>TEAM OWNERS</span>
        </div>

      </section>


      {/* =====================================================
          WHAT IS DIRTY P?
          ===================================================== */}

      <section className="home-story">

        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE STORY
            </p>

            <h2>
              What Is Dirty P?
            </h2>
          </div>
        </div>


        <div className="home-story-card">

          <p className="story-lead">
            It started with a church youth group, a mentor,
            and a fantasy football league. It turned into
            Dirty P.
          </p>

          <p>
            The original league was made up of our youth group
            plus our mentor, Ryan. Since then, we've cycled
            through owners, moved all over the country, and
            somehow kept the league going.
          </p>

          <p>
            The current version of Dirty P has been running
            since <strong>2014</strong>.
          </p>

          <p>
            Along the way, Dirty P has seen
            <strong> shadow government, entire teams being
            traded, collusion, dynasties, championships,
            heartbreak,</strong> and plenty of questionable
            decisions.
          </p>

          <p className="story-final">
            Twelve seasons. Eight champions. Fifteen team
            owners. One Dirty P.
          </p>

        </div>

      </section>


      {/* =====================================================
          DID YOU KNOW?
          ===================================================== */}

      <section className="home-did-you-know">

        <div className="did-you-know-card">

          <div className="did-you-know-icon">
            💡
          </div>

          <div>

            <p className="eyebrow">
              DID YOU KNOW?
            </p>

            <h2>
              Dirty P started before 2014.
            </h2>

            <p>
              The league's roots go back even further, when
              the original group from our church youth group
              played together with Ryan as their mentor.
            </p>

            <p>
              <strong>
                2014 marks the beginning of the current version
                of Dirty P
              </strong>
              — the era that has continued through today.
            </p>

          </div>

        </div>

      </section>


      {/* =====================================================
          DIRTY P ROAD MAP
          ===================================================== */}

      <section className="home-roadmap">

        <div className="section-heading">
          <div>

            <p className="eyebrow">
              THE LEAGUE HAS MOVED
            </p>

            <h2>
              The Dirty P Road Map
            </h2>

          </div>

          <span>
            8 States
          </span>

        </div>


        <div className="roadmap-card">

          <p className="roadmap-intro">
            One league. A ridiculous number of addresses.
          </p>


          <div className="roadmap-states">

            <div className="roadmap-state">
              <strong>TX</strong>

              <span>
                New Braunfels · Pearland · Houston ·
                West Columbia · Huntsville · Greenville ·
                Rockdale · College Station · Richardson ·
                Fort Worth · San Marcos · Kyle · Rosharon ·
                Iowa Colony
              </span>
            </div>


            <div className="roadmap-state">
              <strong>AR</strong>

              <span>
                Fayetteville · Fort Smith
              </span>
            </div>


            <div className="roadmap-state">
              <strong>NC</strong>

              <span>
                Charlotte
              </span>
            </div>


            <div className="roadmap-state">
              <strong>VA</strong>

              <span>
                Somewhere in Virginia
              </span>
            </div>


            <div className="roadmap-state">
              <strong>KY</strong>

              <span>
                Louisville
              </span>
            </div>


            <div className="roadmap-state">
              <strong>AZ</strong>

              <span>
                Tucson
              </span>
            </div>


            <div className="roadmap-state">
              <strong>CA</strong>

              <span>
                Palmdale
              </span>
            </div>


            <div className="roadmap-state">
              <strong>DE</strong>

              <span>
                Delaware
              </span>
            </div>

          </div>

        </div>

      </section>


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
