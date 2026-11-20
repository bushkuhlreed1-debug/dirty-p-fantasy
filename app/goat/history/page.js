import Link from "next/link";
import { getLeagueData } from "../../../lib/leagueData";
import {
  getGameKey,
  isCompletedGame,
  historicalGoatTimeline,
} from "../../../lib/goatTimeline";
import GoatRankingTimeline from "../../components/GoatRankingTimeline";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Historical GOAT Rankings | Dirty P Fantasy",
  description: "See how Dirty P's all-time GOAT rankings changed season by season.",
};

export default async function GoatHistoryPage() {
  let league;
  try {
    league = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <header className="site-header">
          <div className="site-title">
            <Link href="/"><strong>DIRTY P FANTASY FOOTBALL</strong></Link>
            <span>THE LEAGUE ARCHIVE · EST. 2014</span>
          </div>
        </header>
        <section className="owners-section">
          <Link href="/goat">← Back to GOAT Rankings</Link>
          <p className="dp-goat-timeline-note">
            {error?.message || "Historical rankings are temporarily unavailable."}
          </p>
        </section>
      </main>
    );
  }

  const {
    currentSeason,
    owners = [],
    seasonResults = [],
    matchups = [],
    completedCurrentMatchups = [],
  } = league;

  const completedKeys = new Set(
    completedCurrentMatchups
      .filter(game =>
        game.completed === true ||
        game.is_final === true ||
        String(game.status || "").toUpperCase() === "FINAL"
      )
      .map(getGameKey)
  );

  const completedGames = matchups.filter(game =>
    isCompletedGame(game, currentSeason, completedKeys)
  );

  const timeline = historicalGoatTimeline({
    owners,
    seasonResults,
    completedGames,
  });

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-title">
          <Link href="/"><strong>DIRTY P FANTASY FOOTBALL</strong></Link>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      <section className="owners-hero">
        <div>
          <p className="eyebrow">THEN VS. NOW</p>
          <h1>Historical GOAT Rankings</h1>
          <p>
            See how the all-time pecking order has shifted since 2014.
            Highlight an owner, explore the chart, or revisit the rankings
            from any previous season.
          </p>
        </div>
        <div className="owners-count">
          <strong>{timeline.years.length}</strong>
          <span>SEASONS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/goat">← GOAT Rankings</Link>
        <span>Ranking History · {timeline.years[0] || 2014}–{currentSeason}</span>
      </nav>

      <section className="owners-section">
        {timeline.years.length > 1 ? (
          <GoatRankingTimeline
            seasons={timeline.years}
            snapshots={timeline.snapshots}
            owners={owners}
          />
        ) : (
          <div className="owner-card">
            <div className="owner-card-top">
              <p className="owner-team-name">
                Not enough completed seasons are available to chart historical movement.
              </p>
            </div>
          </div>
        )}
      </section>

      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>
        <span>The League Archive · Est. 2014</span>
        <p>Independent fantasy league archive. Not affiliated with or endorsed by ESPN.</p>
      </footer>
    </main>
  );
}
