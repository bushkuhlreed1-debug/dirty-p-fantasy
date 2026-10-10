import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

const WEIGHTS = {
  REGULAR_SEASON: 0.4,
  SCORING: 0.35,
  POSTSEASON: 0.25,
};

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const valid = (v) =>
  v !== null && v !== undefined && v !== "" &&
  Number.isFinite(Number(v));
const fmt = (v, digits = 1) =>
  n(v).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const norm = (v) =>
  String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const clamp = (v) => Math.max(0, Math.min(100, v));

function gamesPlayed(r) {
  return n(r?.wins) + n(r?.losses) + n(r?.ties);
}

function winPct(r) {
  const games = gamesPlayed(r);
  return games ? (n(r.wins) + n(r.ties) / 2) / games : null;
}

async function fetchAll(table) {
  const rows = [];

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .lt("season_year", CURRENT_SEASON)
      .order("season_year", { ascending: true })
      .range(offset, offset + 499);

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }

  return rows;
}

function roundOf(g) {
  const type = norm(g.matchup_type);
  const tier = norm(g.playoff_tier);

  if (
    g.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("3rd_place")
  ) return null;

  if (
    g.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    tier.includes("consolation") ||
    tier.includes("loser")
  ) return null;

  if (
    g.is_championship === true ||
    ["championship", "championship_game", "title_game", "final"]
      .includes(type)
  ) return "championship";

  if (
    type.includes("semifinal") ||
    type.includes("semi_final") ||
    ["playoff", "playoffs", "opening_round", "first_round"]
      .includes(type) ||
    (
      g.is_playoff === true &&
      ["winners_bracket", "winner_bracket", "championship_bracket"]
        .includes(tier)
    )
  ) return "semifinal";

  return null;
}

function winnerId(g) {
  const winner = String(g.winner || "").toUpperCase();
  if (winner === "HOME") return n(g.home_owner_id);
  if (winner === "AWAY") return n(g.away_owner_id);
  if (winner === "TIE") return null;

  if (!valid(g.home_score) || !valid(g.away_score))
    return null;

  if (n(g.home_score) > n(g.away_score))
    return n(g.home_owner_id);
  if (n(g.away_score) > n(g.home_score))
    return n(g.away_owner_id);

  return null;
}

function winningMargin(g, id) {
  if (
    winnerId(g) !== id ||
    !valid(g.home_score) ||
    !valid(g.away_score)
  ) return null;

  return Math.abs(n(g.home_score) - n(g.away_score));
}

function dominanceRanking(seasons, results, games) {
  return seasons.map((season) => {
    const year = n(season.year);
    const id = n(season.champion?.id);

    const league = results.filter((r) => n(r.season_year) === year);
    const champion = league.find((r) => n(r.owner_id) === id);

    const scored = league
      .filter((r) => gamesPlayed(r) > 0 && valid(r.points_for))
      .map((r) => n(r.points_for) / gamesPlayed(r));

    const leagueAverage = scored.length
      ? scored.reduce((a, b) => a + b, 0) / scored.length
      : null;

    const ppg =
      champion && gamesPlayed(champion) && valid(champion.points_for)
        ? n(champion.points_for) / gamesPlayed(champion)
        : null;

    const playoffGames = games.filter(
      (g) =>
        n(g.season_year) === year &&
        winnerId(g) === id &&
        roundOf(g)
    );

    const semifinal = playoffGames.find(
      (g) => roundOf(g) === "semifinal"
    );
    const final = playoffGames.find(
      (g) => roundOf(g) === "championship"
    );

    const semifinalMargin = semifinal
      ? winningMargin(semifinal, id)
      : null;
    const finalMargin = final
      ? winningMargin(final, id)
      : null;

    const complete =
      champion &&
      gamesPlayed(champion) > 0 &&
      leagueAverage > 0 &&
      scored.length >= 2 &&
      ppg !== null &&
      semifinalMargin !== null &&
      finalMargin !== null;

    if (!complete) {
      return {
        season, year, champion,
        complete: false, points: null,
      };
    }

    const regularScore = winPct(champion) * 100;
    const scoringScore = clamp((ppg / leagueAverage / 1.25) * 100);
    const averageMargin = (semifinalMargin + finalMargin) / 2;
    const playoffScore = clamp(
      (averageMargin / (leagueAverage * 0.4)) * 100
    );

    const points =
      regularScore * WEIGHTS.REGULAR_SEASON +
      scoringScore * WEIGHTS.SCORING +
      playoffScore * WEIGHTS.POSTSEASON;

    return {
      season,
      year,
      champion,
      complete: true,
      points,
      ppg,
      leagueAverage,
      averageMargin,
      regularScore,
      scoringScore,
      playoffScore,
    };
  });
}

export default async function ChampionsPage() {
  let seasons = [];
  let teams = [];
  let results = [];
  let games = [];

  try {
    const [seasonResponse, teamResponse, resultRows, gameRows] =
      await Promise.all([
        supabase
          .from("seasons")
          .select(`
            year,
            championship_score,
            champion:champion_owner_id(id,name),
            runner_up:runner_up_owner_id(id,name)
          `)
          .lt("year", CURRENT_SEASON)
          .order("year", { ascending: false }),
        supabase
          .from("teams")
          .select("season_year,owner_id,team_name")
          .lt("season_year", CURRENT_SEASON),
        fetchAll("season_results"),
        fetchAll("matchups"),
      ]);

    if (seasonResponse.error) throw seasonResponse.error;
    if (teamResponse.error) throw teamResponse.error;

    seasons = seasonResponse.data || [];
    teams = teamResponse.data || [];
    results = resultRows;
    games = gameRows;
  } catch (e) {
    return (
      <main className="page-shell">
        <h1>Champions</h1>
        <p>Unable to load championship history: {e.message}</p>
      </main>
    );
  }

  const teamNames = new Map(
    teams.map((t) => [
      `${t.season_year}:${t.owner_id}`,
      t.team_name,
    ])
  );
  const teamName = (year, id) =>
    teamNames.get(`${year}:${id}`) || "Team name unavailable";

  const ranking = dominanceRanking(seasons, results, games);
  const eligible = ranking
    .filter((r) => r.complete)
    .sort((a, b) => b.points - a.points || a.year - b.year);
  const champion = eligible[0] || null;
  const missing = ranking.filter((r) => !r.complete).length;

  const years = seasons.map((s) => n(s.year));
  const first = years.length ? Math.min(...years) : 2014;
  const last = years.length ? Math.max(...years) : 2025;

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </Link>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      <section className="owners-hero">
        <div>
          <p className="eyebrow">THE LEAGUE ARCHIVE</p>
          <h1>Champions</h1>
          <p>
            Every Dirty P champion since 2014 and the most
            dominant championship season in league history.
          </p>
        </div>
        <div className="owners-count">
          <strong>{seasons.length}</strong>
          <span>CHAMPIONSHIPS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>
        <span>{first}–{last}</span>
      </nav>

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE GREATEST CHAMPIONSHIP SEASON</p>
            <h2>Most Dominant Champion Ever</h2>
          </div>
        </div>

        {champion ? (
          <article className="dp-dominant-card">
            <div className="dp-dominant-header">
              <div>
                <span className="owner-status">
                  MOST DOMINANT CHAMPION EVER
                </span>
                <h3>{champion.season.champion.name}</h3>
                <p>
                  {teamName(champion.year, champion.season.champion.id)}
                </p>
                <strong className="dp-year">
                  {champion.year} CHAMPION
                </strong>
              </div>
              <div className="dp-dominant-total">
                <span>🏆</span>
                <strong>{fmt(champion.points)} <small>/ 100</small></strong>
                <span>DOMINANCE SCORE</span>
              </div>
            </div>

            <div className="dp-dominant-stats">
              <div>
                <strong>
                  {champion.champion.wins}-{champion.champion.losses}
                  {n(champion.champion.ties)
                    ? `-${champion.champion.ties}`
                    : ""}
                </strong>
                <span>REGULAR-SEASON RECORD</span>
              </div>
              <div>
                <strong>{fmt(champion.ppg)}</strong>
                <span>POINTS PER GAME</span>
              </div>
              <div>
                <strong>+{fmt(champion.averageMargin)}</strong>
                <span>AVG. PLAYOFF WIN MARGIN</span>
              </div>
            </div>

            <div className="dp-dominance-explainer">
              <h4>How the Dominance Score Works</h4>
              <p>
                Each championship season receives a score out of
                100. This is <strong>not</strong> a winning percentage.
                It measures three parts of a champion's season:
              </p>

              <div className="dp-breakdown">
                <div>
                  <strong>40%</strong>
                  <span>Regular-Season Record</span>
                  <p>Winning percentage across the regular season.</p>
                  <small>
                    This champion: {fmt(champion.regularScore)}
                    /100 in this category
                  </small>
                </div>
                <div>
                  <strong>35%</strong>
                  <span>Scoring Dominance</span>
                  <p>
                    Points per game relative to the league average
                    that year. Scoring 25% above average earns 100.
                  </p>
                  <small>
                    This champion: {fmt(champion.scoringScore)}
                    /100 in this category
                  </small>
                </div>
                <div>
                  <strong>25%</strong>
                  <span>Playoff Dominance</span>
                  <p>
                    Average winning margin in the semifinal and
                    championship. A margin equal to 40% of the
                    league-average score earns 100.
                  </p>
                  <small>
                    This champion: {fmt(champion.playoffScore)}
                    /100 in this category
                  </small>
                </div>
              </div>

              <p className="dp-score-explanation">
                <strong>{fmt(champion.points)} out of 100</strong> is
                the weighted combination of those three category
                scores. A higher number means a more dominant
                championship season under this formula.
              </p>
            </div>
          </article>
        ) : (
          <article className="owner-card dp-message">
            <h3>Dominance ranking unavailable</h3>
            <p>
              Complete regular-season records, league scoring,
              and both semifinal and championship scores are
              needed to calculate the award.
            </p>
          </article>
        )}

        {missing > 0 && (
          <p className="dp-missing-note">
            {missing} championship season{missing === 1 ? "" : "s"}
            {" "}lack complete data for this calculation, so the
            historical comparison may be incomplete.
          </p>
        )}
      </section>

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YEAR BY YEAR</p>
            <h2>Championship History</h2>
          </div>
          <span>{seasons.length} Seasons</span>
        </div>

        <div className="dp-champion-history">
          {seasons.map((s) => (
            <article className="dp-champion-row" key={s.year}>
              <div className="dp-champion-year">{s.year}</div>
              <div>
                <span className="owner-status">🏆 LEAGUE CHAMPION</span>
                <h3>
                  {s.champion?.id ? (
                    <Link href={`/owners/${s.champion.id}`}>
                      {s.champion.name}
                    </Link>
                  ) : (
                    s.champion?.name || "—"
                  )}
                </h3>
                <p>{teamName(s.year, s.champion?.id)}</p>
              </div>
              <div>
                <span className="owner-status">FINAL SCORE</span>
                <strong>{s.championship_score || "—"}</strong>
              </div>
              <div>
                <span className="owner-status">RUNNER-UP</span>
                <strong>{s.runner_up?.name || "—"}</strong>
                <p>{teamName(s.year, s.runner_up?.id)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>
        <span>The League Archive · Est. 2014</span>
        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>
      </footer>

      <style>{`
        .dp-dominant-card {
          background:#171d26;
          border:1px solid #806539;
          border-radius:16px;
          overflow:hidden;
        }
        .dp-dominant-header {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:22px;
          flex-wrap:wrap;
          padding:28px;
        }
        .dp-dominant-header h3 {
          color:#f5f6f8;
          margin:12px 0 8px;
          font-size:clamp(24px,4vw,34px);
        }
        .dp-dominant-header p {
          color:#aeb9c7;
          margin:0 0 12px;
        }
        .dp-year {
          color:#e9bd67;
          font-size:12px;
        }
        .dp-dominant-total {
          display:flex;
          flex-direction:column;
          gap:5px;
          align-items:center;
          color:#e9bd67;
        }
        .dp-dominant-total > span:first-child {
          font-size:34px;
        }
        .dp-dominant-total strong {
          font-size:34px;
          font-variant-numeric:tabular-nums;
        }
        .dp-dominant-total small {
          font-size:15px;
          color:#b5c0ce;
        }
        .dp-dominant-total > span:last-child {
          font-size:10px;
          font-weight:800;
          letter-spacing:1px;
        }
        .dp-dominant-stats {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:1px;
          background:#303947;
          border-block:1px solid #303947;
        }
        .dp-dominant-stats > div {
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:8px;
          padding:20px 10px;
          background:#1c2430;
          text-align:center;
        }
        .dp-dominant-stats strong {
          color:#f5f6f8;
          font-size:clamp(17px,3vw,25px);
        }
        .dp-dominant-stats span {
          color:#a4afbd;
          font-size:10px;
          line-height:1.5;
        }
        .dp-dominance-explainer {
          padding:24px;
          color:#b5c0ce;
          font-size:13px;
          line-height:1.65;
        }
        .dp-dominance-explainer h4 {
          color:#e9bd67;
          margin:0 0 10px;
          font-size:17px;
        }
        .dp-breakdown {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:12px;
          margin:20px 0;
        }
        .dp-breakdown > div {
          padding:15px;
          background:#222b37;
          border:1px solid #354150;
          border-radius:10px;
        }
        .dp-breakdown strong {
          display:block;
          color:#e9bd67;
          font-size:21px;
        }
        .dp-breakdown span {
          display:block;
          color:#f2f4f7;
          font-weight:800;
          margin-top:4px;
        }
        .dp-breakdown p {
          margin:8px 0;
        }
        .dp-breakdown small {
          color:#d5b77c;
        }
        .dp-score-explanation {
          margin-bottom:0;
        }
        .dp-score-explanation strong {
          color:#e9bd67;
        }
        .dp-message {
          padding:22px;
        }
        .dp-missing-note {
          color:#a6b2c0;
          font-size:12px;
          margin-top:12px;
        }
        .dp-champion-history {
          display:flex;
          flex-direction:column;
          gap:10px;
        }
        .dp-champion-row {
          display:grid;
          grid-template-columns:75px 1.5fr 1fr 1fr;
          align-items:center;
          gap:16px;
          padding:20px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
        }
        .dp-champion-year {
          color:#e9bd67;
          font-size:22px;
          font-weight:900;
        }
        .dp-champion-row h3 {
          margin:6px 0;
          font-size:16px;
          color:#f5f6f8;
        }
        .dp-champion-row a {
          color:inherit;
          text-decoration:none;
        }
        .dp-champion-row a:hover {
          color:#e9bd67;
        }
        .dp-champion-row p {
          color:#a3afbe;
          margin:4px 0 0;
          font-size:12px;
        }
        .dp-champion-row > div > strong {
          display:block;
          margin-top:7px;
          color:#f3f5f7;
          font-size:14px;
        }
        @media(max-width:750px) {
          .dp-breakdown {
            grid-template-columns:1fr;
          }
          .dp-champion-row {
            grid-template-columns:60px 1fr;
          }
          .dp-champion-row > div:nth-child(n+3) {
            grid-column:2;
          }
        }
      `}</style>
    </main>
  );
}
