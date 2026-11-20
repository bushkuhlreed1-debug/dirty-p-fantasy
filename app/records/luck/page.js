import Link from "next/link";
import { getLeagueData } from "../../../lib/leagueData";
import { buildLuckRankings } from "../../../lib/luckRankings";
import LuckRankings from "../../components/LuckRankings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Luck Rankings | Dirty P Fantasy",
  description: "All-play luck rankings and expected wins for Dirty P fantasy football owners.",
};

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" ||
      !Number.isFinite(Number(value))) return null;
  return Number(value);
}
function isRegularSeason(game) {
  const type = String(game.matchup_type || "").toLowerCase();
  const tier = String(game.playoff_tier || "").toLowerCase();
  return !game.is_playoff && !game.is_championship &&
    !game.is_third_place && !game.is_consolation &&
    !/playoff|championship|semifinal|semi_final|third.place|consolation|loser/.test(type) &&
    !/winner|championship|consolation|loser|toilet/.test(tier);
}
function completed(game, currentSeason) {
  const home = numberOrNull(game.home_score), away = numberOrNull(game.away_score);
  if (home === null || away === null || home < 0 || away < 0 ||
    (home === 0 && away === 0)) return false;
  const winner = String(game.winner || "").toUpperCase();
  return Number(game.season_year) < currentSeason ||
    game.completed === true || game.is_final === true ||
    String(game.status || "").toUpperCase() === "FINAL" ||
    ["HOME", "AWAY", "TIE"].includes(winner);
}

export default async function LuckPage() {
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
          <Link href="/records">← Back to Records</Link>
          <p className="dp-luck-empty">{error?.message || "Unable to load league data."}</p>
        </section>
      </main>
    );
  }

  const { currentSeason, owners = [], matchups = [] } = league;
  const completedRegularGames = matchups.filter(game =>
    isRegularSeason(game) && completed(game,currentSeason)
  );
  const luck = buildLuckRankings(completedRegularGames,owners);

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
          <p className="eyebrow">THE SCHEDULE LUCK INDEX</p>
          <h1>Luck Rankings</h1>
          <p>
            Who's stealing wins, and who's getting punished by their schedule?
            Compare actual results with how every team would've performed
            against the entire league each week.
          </p>
        </div>
        <div className="owners-count">
          <strong>{luck.seasons.length}</strong>
          <span>SCORING SEASONS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/records">← Records</Link>
        <span>All-time &amp; by season</span>
      </nav>

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACTUAL WINS VS. EXPECTED WINS</p>
            <h2>Who's Lucky?</h2>
          </div>
          <span>Scoring-based comparison</span>
        </div>
        <LuckRankings data={luck}/>
      </section>

      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>
        <span>The League Archive · Est. 2014</span>
        <p>Independent fantasy league archive. Not affiliated with or endorsed by ESPN.</p>
      </footer>
    </main>
  );
}
