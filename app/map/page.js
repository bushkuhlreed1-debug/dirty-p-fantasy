import Link from "next/link";

import DirtyPMap
  from "../DirtyPMap";

export const dynamic =
  "force-dynamic";

export default function MapPage() {
  return (
    <main className="page-shell">

      {/* HEADER */}

      <header className="site-header">
        <div className="site-title">

          <Link href="/">
            <strong>
              DIRTY P FANTASY FOOTBALL
            </strong>
          </Link>

          <span>
            THE LEAGUE ARCHIVE · EST. 2014
          </span>

        </div>
      </header>


      {/* HERO */}

      <section className="owners-hero">

        <div>

          <p className="eyebrow">
            LEAGUE FOOTPRINT
          </p>

          <h1>
            The Dirty P Map
          </h1>

          <p>
            From Texas to the East Coast.
            See where the current Dirty P
            league footprint stretches.
          </p>

        </div>


        <div className="owners-count">

          <strong>
            8
          </strong>

          <span>
            LOCATIONS
          </span>

        </div>

      </section>


      {/* PAGE NAV */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          3 States · 8 Locations
        </span>

      </nav>


      {/* MAP */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              CURRENT LEAGUE
            </p>

            <h2>
              Where the League Lives
            </h2>

          </div>

          <span>
            Current Locations
          </span>

        </div>


        <DirtyPMap />

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
