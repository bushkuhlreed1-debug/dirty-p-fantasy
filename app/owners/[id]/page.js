import Link from "next/link";
import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const fmt = (v) => n(v).toFixed(2);
const rec = (w, l, t = 0) =>
  n(t) ? `${n(w)}-${n(l)}-${n(t)}` : `${n(w)}-${n(l)}`;
const pct = (w, l, t = 0) =>
  n(w) + n(l) + n(t)
    ? (((n(w) + n(t) / 2) / (n(w) + n(l) + n(t))) * 100).toFixed(1)
    : "0.0";

const SLOT_ORDER = {
  QB: 1, RB1: 2, RB2: 3, WR1: 4, WR2: 5,
  TE: 6, FLEX: 7, K: 8, "D/ST": 9,
};

function typeOf(g) {
  const type = String(g.matchup_type || "").toLowerCase();
  const tier = String(g.playoff_tier || "").toLowerCase();

  // A third-place game is a playoff game.
  if (
    g.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("third place") ||
    type.includes("third-place")
  ) return "Playoff";

  if (
    type.includes("consolation") ||
    type.includes("loser") ||
    tier.includes("consolation") ||
    tier.includes("loser")
  ) return "Consolation";

  if (
    g.is_playoff === true ||
    g.is_championship === true ||
    type.includes("playoff") ||
    type.includes("championship") ||
    type.includes("semifinal") ||
    tier.includes("winner")
  ) return "Playoff";

  return "Regular Season";
}

function hasScores(g) {
  return (
    g.home_score !== null &&
    g.home_score !== undefined &&
    g.away_score !== null &&
    g.away_score !== undefined &&
    Number.isFinite(Number(g.home_score)) &&
    Number.isFinite(Number(g.away_score))
  );
}

function gameForOwner(g, id, names) {
  if (!hasScores(g)) return null;

  const home = n(g.home_owner_id) === id;
  const away = n(g.away_owner_id) === id;
  if (!home && !away) return null;

  const opponentId = home ? n(g.away_owner_id) : n(g.home_owner_id);
  const own = n(home ? g.home_score : g.away_score);
  const other = n(home ? g.away_score : g.home_score);
  const winner = String(g.winner || "").toUpperCase();

  let result = own > other ? "W" : own < other ? "L" : "T";
  if (winner === "HOME") result = home ? "W" : "L";
  if (winner === "AWAY") result = away ? "W" : "L";
  if (winner === "TIE") result = "T";

  return {
    ...g,
    opponentId,
    opponentName: names.get(opponentId) || "Unknown Owner",
    ownerScore: own,
    opponentScore: other,
    result,
    margin: own - other,
    category: typeOf(g),
  };
}

function Expandable({ title, count, children }) {
  return (
    <details className="dp-profile-details">
      <summary className="dp-profile-summary">
        <span>
          <strong>{title}</strong>
          {count !== undefined && (
            <small>{count} {count === 1 ? "Entry" : "Entries"}</small>
          )}
        </span>
        <span className="dp-profile-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="dp-profile-body">
        {children}
      </div>
    </details>
  );
}

function Metric({ label, value }) {
  return (
    <div className="dp-profile-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function GameHighlight({ game, label }) {
  return (
    <div className="career-record-card">
      <span className="owner-status">{label}</span>
      {game ? (
        <>
          <strong>{fmt(game.ownerScore)} – {fmt(game.opponentScore)}</strong>
          <span>vs. {game.opponentName}</span>
          <small>
            {game.season_year} · Week {game.matchup_period}
          </small>
        </>
      ) : (
        <strong>—</strong>
      )}
    </div>
  );
}

async function fetchOwnerGames(ownerId) {
  const games = [];

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("matchups")
      .select(`
        id,
        season_year,
        matchup_period,
        matchup_type,
        playoff_tier,
        home_owner_id,
        away_owner_id,
        home_team_name,
        away_team_name,
        home_score,
        away_score,
        winner,
        is_playoff,
        is_championship,
        is_third_place
      `)
      .or(
        `home_owner_id.eq.${ownerId},away_owner_id.eq.${ownerId}`
      )
      .lt("season_year", CURRENT_SEASON)
      .order("season_year", { ascending: false })
      .order("matchup_period", { ascending: false })
      .range(offset, offset + 499);

    if (error) throw new Error(error.message);

    games.push(...(data || []));
    if (!data || data.length < 500) break;
  }

  return games;
}

export default async function OwnerProfile({ params }) {
  const { id } = await params;
  const ownerId = Number(id);

  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    return (
      <main className="page-shell">
        <h1>Owner Not Found</h1>
        <Link href="/owners">← Back to Owners</Link>
      </main>
    );
  }

  const [
    ownerResponse,
    ownersResponse,
    seasonsResponse,
    teamsResponse,
    franchiseResponse,
    matchupsResult,
  ] = await Promise.all([
    supabase
      .from("owners")
      .select("id,name,current_team_name,active")
      .eq("id", ownerId)
      .single(),
    supabase.from("owners").select("id,name"),
    supabase
      .from("season_results")
      .select(`
        season_year,
        wins,
        losses,
        ties,
        points_for,
        points_against,
        regular_season_finish,
        final_finish,
        playoff_appearance,
        championship_appearance,
        champion
      `)
      .eq("owner_id", ownerId)
      .order("season_year", { ascending: false }),
    supabase
      .from("teams")
      .select("season_year,team_name")
      .eq("owner_id", ownerId)
      .order("season_year", { ascending: false }),
    supabase
      .from("all_franchise_teams")
      .select(`
        owner_id,
        franchise_slot,
        espn_player_id,
        player_name,
        position,
        season_year,
        dirty_p_team_name,
        fantasy_points
      `)
      .eq("owner_id", ownerId),
    fetchOwnerGames(ownerId).then(
      (data) => ({ data, error: null }),
      (error) => ({ data: null, error })
    ),
  ]);

  const owner = ownerResponse.data;

  if (ownerResponse.error || !owner) {
    return (
      <main className="page-shell">
        <h1>Owner Not Found</h1>
        <Link href="/owners">← Back to Owners</Link>
      </main>
    );
  }

  const error = [
    ownersResponse.error,
    seasonsResponse.error,
    teamsResponse.error,
    franchiseResponse.error,
    matchupsResult.error,
  ].find(Boolean);

  if (error) {
    return (
      <main className="page-shell">
        <h1>{owner.name}</h1>
        <p>Unable to load full owner profile: {error.message}</p>
        <Link href="/owners">← Back to Owners</Link>
      </main>
    );
  }

  const owners = ownersResponse.data || [];
  const seasons = seasonsResponse.data || [];
  const teams = teamsResponse.data || [];
  const franchise = [...(franchiseResponse.data || [])].sort(
    (a, b) =>
      (SLOT_ORDER[a.franchise_slot] || 99) -
      (SLOT_ORDER[b.franchise_slot] || 99)
  );

  const nameMap = new Map(
    owners.map((o) => [n(o.id), o.name])
  );

  const games = (matchupsResult.data || [])
    .map((g) => gameForOwner(g, ownerId, nameMap))
    .filter(Boolean);

  const teamByYear = new Map(
    teams.map((t) => [n(t.season_year), t.team_name])
  );

  const seasonHistory = seasons.map((s) => ({
    ...s,
    teamName: teamByYear.get(n(s.season_year)) || "—",
    finish: s.champion
      ? "Champion"
      : s.championship_appearance
      ? "Runner-Up"
      : s.playoff_appearance
      ? "Playoffs"
      : "Missed Playoffs",
  }));

  const teamNames = new Map();

  for (const team of teams) {
    const key = team.team_name || "Unnamed Team";
    if (!teamNames.has(key)) teamNames.set(key, []);
    teamNames.get(key).push(n(team.season_year));
  }

  const h2h = new Map();

  for (const g of games) {
    if (!h2h.has(g.opponentId)) {
      h2h.set(g.opponentId, {
        name: g.opponentName,
        w: 0, l: 0, t: 0,
      });
    }

    const stat = h2h.get(g.opponentId);
    if (g.result === "W") stat.w++;
    if (g.result === "L") stat.l++;
    if (g.result === "T") stat.t++;
  }

  const headToHead = [...h2h.values()].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  const wins = games.filter((g) => g.result === "W");
  const losses = games.filter((g) => g.result === "L");

  const highest = [...games].sort(
    (a, b) => b.ownerScore - a.ownerScore
  )[0];
  const lowest = [...games].sort(
    (a, b) => a.ownerScore - b.ownerScore
  )[0];
  const biggestWin = [...wins].sort(
    (a, b) => b.margin - a.margin
  )[0];
  const biggestLoss = [...losses].sort(
    (a, b) => a.margin - b.margin
  )[0];
  const closestWin = [...wins].sort(
    (a, b) => a.margin - b.margin
  )[0];
  const closestLoss = [...losses].sort(
    (a, b) => b.margin - a.margin
  )[0];

  const completedSeasons = seasons.filter(
    (s) => n(s.season_year) < CURRENT_SEASON
  );

  const bestSeason = [...completedSeasons].sort(
    (a, b) =>
      (
        (n(b.wins) + n(b.ties) / 2) /
        Math.max(1, n(b.wins) + n(b.losses) + n(b.ties))
      ) -
      (
        (n(a.wins) + n(a.ties) / 2) /
        Math.max(1, n(a.wins) + n(a.losses) + n(a.ties))
      ) ||
      n(b.points_for) - n(a.points_for)
  )[0];

  const chronological = [...games].sort(
    (a, b) =>
      n(a.season_year) - n(b.season_year) ||
      n(a.matchup_period) - n(b.matchup_period)
  );

  let longestStreak = 0;
  let currentStreak = 0;

  for (const g of chronological) {
    if (g.result === "W") {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const regularWins = seasons.reduce(
    (sum, s) => sum + n(s.wins), 0
  );
  const regularLosses = seasons.reduce(
    (sum, s) => sum + n(s.losses), 0
  );
  const regularTies = seasons.reduce(
    (sum, s) => sum + n(s.ties), 0
  );
  const pointsFor = seasons.reduce(
    (sum, s) => sum + n(s.points_for), 0
  );

  const playoffRecord = games.filter(
    (g) => g.category === "Playoff"
  );
  const consolationRecord = games.filter(
    (g) => g.category === "Consolation"
  );

  const recordFromGames = (list) =>
    rec(
      list.filter((g) => g.result === "W").length,
      list.filter((g) => g.result === "L").length,
      list.filter((g) => g.result === "T").length
    );

  const titles = seasons.filter((s) => s.champion).length;
  const finals = seasons.filter(
    (s) => s.championship_appearance
  ).length;

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

      {/* ALWAYS-VISIBLE OWNER SUMMARY */}

      <section className="owner-profile-hero">
        <p className="eyebrow">
          {owner.active ? "ACTIVE OWNER" : "FORMER OWNER"}
        </p>
        <h1>{owner.name}</h1>
        <p>{owner.current_team_name || "Dirty P Franchise"}</p>

        <div className="dp-profile-stats">
          <Metric label="REGULAR-SEASON RECORD"
            value={rec(regularWins, regularLosses, regularTies)} />
          <Metric label="REGULAR-SEASON WIN %"
            value={`${pct(regularWins, regularLosses, regularTies)}%`} />
          <Metric label="CHAMPIONSHIPS" value={titles} />
          <Metric label="FINALS" value={finals} />
          <Metric label="PLAYOFF RECORD"
            value={recordFromGames(playoffRecord)} />
          <Metric label="CONSOLATION RECORD"
            value={recordFromGames(consolationRecord)} />
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/owners">← All Owners</Link>
        <span>{seasons.length} Seasons · {fmt(pointsFor)} Career Points</span>
      </nav>

      {/* EVERY SECTION BELOW CAN EXPAND OR COLLAPSE */}

      <div className="dp-profile-sections">
        <Expandable
          title="Year-by-Year Season History"
          count={seasonHistory.length}
        >
          <div className="profile-table-wrap">
            <table className="dp-profile-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Team</th>
                  <th>Record</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Regular Finish</th>
                  <th>Final Finish</th>
                  <th>Postseason</th>
                </tr>
              </thead>
              <tbody>
                {seasonHistory.map((s) => (
                  <tr key={s.season_year}>
                    <td>{s.season_year}</td>
                    <td>{s.teamName}</td>
                    <td>{rec(s.wins, s.losses, s.ties)}</td>
                    <td>{fmt(s.points_for)}</td>
                    <td>{fmt(s.points_against)}</td>
                    <td>{s.regular_season_finish ?? "—"}</td>
                    <td>{s.final_finish ?? "—"}</td>
                    <td>{s.finish}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Expandable>

        <Expandable title="All-Franchise Team" count={franchise.length}>
          <div className="all-franchise-grid">
            {franchise.map((player, i) => (
              <article className="dp-franchise-player" key={
                `${player.franchise_slot}:${player.espn_player_id}:${i}`
              }>
                <span className="owner-status">
                  {player.franchise_slot}
                </span>
                <strong>{player.player_name}</strong>
                <span>
                  {player.position} · {player.season_year}
                </span>
                <span>{player.dirty_p_team_name}</span>
                <strong className="dp-player-points">
                  {fmt(player.fantasy_points)} PTS
                </strong>
              </article>
            ))}
          </div>
        </Expandable>

        <Expandable title="Head-to-Head" count={headToHead.length}>
          <div className="dp-profile-list">
            {headToHead.map((h) => (
              <div className="dp-profile-list-row" key={h.name}>
                <strong>{h.name}</strong>
                <span>{rec(h.w, h.l, h.t)}</span>
              </div>
            ))}
          </div>
        </Expandable>

        <Expandable title="Highs & Lows">
          <div className="career-record-grid">
            <GameHighlight label="HIGHEST WEEKLY SCORE" game={highest} />
            <GameHighlight label="LOWEST WEEKLY SCORE" game={lowest} />
            <GameHighlight label="BIGGEST VICTORY" game={biggestWin} />
            <GameHighlight label="BIGGEST LOSS" game={biggestLoss} />
            <GameHighlight label="CLOSEST WIN" game={closestWin} />
            <GameHighlight label="CLOSEST LOSS" game={closestLoss} />
            <div className="career-record-card">
              <span className="owner-status">BEST REGULAR SEASON</span>
              <strong>
                {bestSeason
                  ? rec(bestSeason.wins, bestSeason.losses, bestSeason.ties)
                  : "—"}
              </strong>
              <span>{bestSeason?.season_year || "—"}</span>
            </div>
            <div className="career-record-card">
              <span className="owner-status">LONGEST WIN STREAK</span>
              <strong>{longestStreak} Games</strong>
              <span>Historical franchise record</span>
            </div>
          </div>
        </Expandable>

        <Expandable title="Team Name History" count={teamNames.size}>
          <div className="dp-profile-list">
            {[...teamNames.entries()].map(([team, years]) => (
              <div className="dp-profile-list-row" key={team}>
                <strong>{team}</strong>
                <span>{[...years].sort((a, b) => a - b).join(", ")}</span>
              </div>
            ))}
          </div>
        </Expandable>

        <Expandable title="Every Game" count={games.length}>
          <div className="profile-table-wrap">
            <table className="dp-profile-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Week</th>
                  <th>Opponent</th>
                  <th>Result</th>
                  <th>Score</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g, i) => (
                  <tr key={g.id || i}>
                    <td>{g.season_year}</td>
                    <td>{g.matchup_period}</td>
                    <td>{g.opponentName}</td>
                    <td>
                      <span className={
                        g.result === "W"
                          ? "dp-game-win"
                          : g.result === "L"
                          ? "dp-game-loss"
                          : ""
                      }>
                        {g.result}
                      </span>
                    </td>
                    <td>
                      {fmt(g.ownerScore)} – {fmt(g.opponentScore)}
                    </td>
                    <td>{g.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Expandable>
      </div>

      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>
        <span>The League Archive · Est. 2014</span>
        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>
      </footer>

      <style>{`
        .dp-profile-stats {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:12px;
          margin-top:22px;
        }
        .dp-profile-metric {
          display:flex;
          flex-direction:column;
          gap:6px;
          padding:15px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:10px;
          min-width:0;
        }
        .dp-profile-metric strong {
          font-size:22px;
          color:#f4f6f8;
          font-variant-numeric:tabular-nums;
        }
        .dp-profile-metric span {
          font-size:10px;
          letter-spacing:.7px;
          color:#abb6c4;
        }
        .dp-profile-sections {
          display:flex;
          flex-direction:column;
          gap:12px;
          margin:25px 0;
        }
        .dp-profile-details {
          background:#171d26;
          border:1px solid #303947;
          border-radius:13px;
          overflow:hidden;
        }
        .dp-profile-summary {
          cursor:pointer;
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:19px 22px;
          gap:15px;
          list-style:none;
          user-select:none;
        }
        .dp-profile-summary::-webkit-details-marker {
          display:none;
        }
        .dp-profile-summary::marker {
          content:"";
        }
        .dp-profile-summary > span:first-child {
          display:flex;
          flex-direction:column;
          gap:5px;
        }
        .dp-profile-summary strong {
          font-size:17px;
          color:#f2f4f7;
        }
        .dp-profile-summary small {
          font-size:12px;
          color:#99a7b7;
        }
        .dp-profile-chevron {
          display:flex;
          color:#e9bd67;
          transition:transform .2s ease;
        }
        .dp-profile-details[open] .dp-profile-chevron {
          transform:rotate(180deg);
        }
        .dp-profile-details[open] > .dp-profile-summary {
          border-bottom:1px solid #303947;
        }
        .dp-profile-summary:hover strong,
        .dp-profile-details[open] .dp-profile-summary strong {
          color:#e9bd67;
        }
        .dp-profile-summary:focus-visible {
          outline:2px solid #e9bd67;
          outline-offset:-3px;
        }
        .dp-profile-body {
          padding:18px;
        }
        .dp-profile-table {
          border-collapse:collapse;
          width:100%;
          min-width:640px;
        }
        .dp-profile-table th,
        .dp-profile-table td {
          padding:12px 10px;
          border-bottom:1px solid #303947;
          text-align:left;
          font-size:12px;
          white-space:nowrap;
        }
        .dp-profile-table th {
          color:#e9bd67;
        }
        .dp-profile-table td {
          color:#dce2e9;
        }
        .profile-table-wrap {
          overflow-x:auto;
          width:100%;
        }
        .dp-profile-list {
          display:flex;
          flex-direction:column;
        }
        .dp-profile-list-row {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:20px;
          border-bottom:1px solid #303947;
          padding:14px 5px;
        }
        .dp-profile-list-row:last-child {
          border-bottom:0;
        }
        .dp-profile-list-row strong {
          color:#f4f6f8;
        }
        .dp-profile-list-row span {
          color:#d8b67b;
          text-align:right;
          font-size:13px;
        }
        .dp-franchise-player {
          display:flex;
          flex-direction:column;
          gap:7px;
          padding:16px;
          background:#202a35;
          border:1px solid #34404d;
          border-radius:10px;
        }
        .dp-franchise-player strong {
          color:#f4f6f8;
        }
        .dp-franchise-player > span:not(.owner-status) {
          color:#aeb9c7;
          font-size:12px;
        }
        .dp-franchise-player .dp-player-points {
          color:#e9bd67;
        }
        .career-record-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }
        .career-record-card {
          display:flex;
          flex-direction:column;
          gap:7px;
          background:#202a35;
          border:1px solid #34404d;
          border-radius:10px;
          padding:16px;
          min-width:0;
        }
        .career-record-card > strong {
          color:#f4f6f8;
          font-size:20px;
          overflow-wrap:anywhere;
        }
        .career-record-card > span:not(.owner-status),
        .career-record-card small {
          color:#9eacbb;
          font-size:12px;
        }
        .dp-game-win {
          color:#65d6a5;
          font-weight:800;
        }
        .dp-game-loss {
          color:#f18484;
          font-weight:800;
        }
        @media(max-width:650px) {
          .dp-profile-stats {
            grid-template-columns:repeat(2,minmax(0,1fr));
          }
          .dp-profile-summary {
            padding:16px;
          }
          .dp-profile-body {
            padding:12px;
          }
          .career-record-grid {
            grid-template-columns:1fr;
          }
        }
      `}</style>
    </main>
  );
}
