import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";

export const dynamic = "force-dynamic";

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

function formatRecord(w, l, t = 0) {
  return n(t)
    ? `${n(w)}-${n(l)}-${n(t)}`
    : `${n(w)}-${n(l)}`;
}

function formatPct(w, l, t = 0) {
  const total = n(w) + n(l) + n(t);
  return total
    ? (((n(w) + n(t) * 0.5) / total) * 100).toFixed(1)
    : "0.0";
}

function gameType(g) {
  const type = String(g.matchup_type || "").toLowerCase();
  const tier = String(g.playoff_tier || "").toLowerCase();

  // Third-place games must be checked first.
  if (
    g.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("third place") ||
    type.includes("third-place")
  ) return "playoff";

  if (
    g.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet")
  ) return "consolation";

  if (
    g.is_playoff === true ||
    g.is_championship === true ||
    type.includes("playoff") ||
    type.includes("championship") ||
    type.includes("semifinal") ||
    tier.includes("winner")
  ) return "playoff";

  return "regular";
}

function gameResult(g, ownerId) {
  const home = n(g.home_owner_id) === ownerId;
  const away = n(g.away_owner_id) === ownerId;
  if (!home && !away) return null;

  const winner = String(g.winner || "").toUpperCase();
  if (winner === "HOME") return home ? "W" : "L";
  if (winner === "AWAY") return away ? "W" : "L";
  if (winner === "TIE") return "T";

  const final =
    g.completed === true ||
    g.is_final === true ||
    String(g.status || "").toUpperCase() === "FINAL";
  if (!final) return null;

  if (
    g.home_score === null || g.home_score === undefined ||
    g.away_score === null || g.away_score === undefined
  ) return null;

  const own = n(home ? g.home_score : g.away_score);
  const opp = n(home ? g.away_score : g.home_score);
  return own > opp ? "W" : own < opp ? "L" : "T";
}

function postseasonRecords(games, owners) {
  const data = new Map();

  for (const owner of owners) {
    data.set(n(owner.id), {
      playoff: { w: 0, l: 0, t: 0 },
      consolation: { w: 0, l: 0, t: 0 },
    });
  }

  for (const game of games) {
    const kind = gameType(game);
    if (kind === "regular") continue;

    for (const id of [n(game.home_owner_id), n(game.away_owner_id)]) {
      const stat = data.get(id)?.[kind];
      if (!stat) continue;
      const result = gameResult(game, id);
      if (result === "W") stat.w++;
      if (result === "L") stat.l++;
      if (result === "T") stat.t++;
    }
  }

  return data;
}

function OwnerCard({ owner }) {
  return (
    <article className="owner-card">
      <div className="owner-card-top">
        <div>
          <span className="owner-status">
            {owner.active ? "ACTIVE OWNER" : "FORMER OWNER"}
          </span>
          <h3>{owner.name}</h3>
          {owner.team && (
            <p className="owner-team-name">{owner.team}</p>
          )}
        </div>

        {owner.titles > 0 && (
          <div className="owner-title-count">
            <strong>{owner.titles}</strong>
            <span>{owner.titles === 1 ? "TITLE" : "TITLES"}</span>
          </div>
        )}
      </div>

      <div className="owner-record">
        <div>
          <strong>
            {formatRecord(owner.wins, owner.losses, owner.ties)}
          </strong>
          <span>REGULAR SEASON RECORD</span>
        </div>
        <div>
          <strong>
            {formatPct(owner.allW, owner.allL, owner.allT)}%
          </strong>
          <span>ALL-GAME WIN %</span>
        </div>
      </div>

      <div className="owner-record">
        <div>
          <strong>
            {formatRecord(
              owner.playoff.w, owner.playoff.l, owner.playoff.t
            )}
          </strong>
          <span>PLAYOFF RECORD</span>
        </div>
        <div>
          <strong>
            {formatRecord(
              owner.consolation.w,
              owner.consolation.l,
              owner.consolation.t
            )}
          </strong>
          <span>CONSOLATION RECORD</span>
        </div>
      </div>

      <div className="owner-stats-grid">
        <div>
          <strong>{owner.seasons}</strong>
          <span>Seasons</span>
        </div>
        <div>
          <strong>{owner.playoffAppearances}</strong>
          <span>Playoffs</span>
        </div>
        <div>
          <strong>{owner.finals}</strong>
          <span>Finals</span>
        </div>
        <div>
          <strong>{owner.titles}</strong>
          <span>Titles</span>
        </div>
      </div>

      <div className="owner-card-bottom">
        <span>
          {owner.firstYear && owner.lastYear
            ? `${owner.firstYear}–${owner.lastYear}`
            : "No seasons"}
        </span>
        <Link href={`/owners/${owner.id}`}>
          <strong>View Owner →</strong>
        </Link>
      </div>
    </article>
  );
}

export default async function OwnersPage() {
  let data;

  try {
    data = await getLeagueData();
  } catch (e) {
    return (
      <main className="page-shell">
        <h1>Owners</h1>
        <p>{e.message || "Unable to load league data."}</p>
      </main>
    );
  }

  const {
    currentSeason = 2026,
    owners = [],
    currentTeams = [],
    seasonResults = [],
    matchups = [],
    completedCurrentMatchups = [],
    unmatchedEspnOwners = [],
  } = data;

  const activeIds = new Set(
    currentTeams.map((t) => n(t.owner_id))
  );
  const currentTeamMap = new Map(
    currentTeams.map((t) => [n(t.owner_id), t])
  );

  const historical = matchups.filter(
    (g) => n(g.season_year) < n(currentSeason)
  );
  const current = completedCurrentMatchups.filter(
    (g) =>
      n(g.season_year) === n(currentSeason) &&
      g.completed === true
  );

  // Current completed matchups are not counted twice.
  const historyStats = postseasonRecords(historical, owners);
  const currentStats = postseasonRecords(current, owners);

  const empty = () => ({
    playoff: { w: 0, l: 0, t: 0 },
    consolation: { w: 0, l: 0, t: 0 },
  });

  const merged = (a, b, kind) => ({
    w: a[kind].w + b[kind].w,
    l: a[kind].l + b[kind].l,
    t: a[kind].t + b[kind].t,
  });

  const rows = owners.map((owner) => {
    const id = n(owner.id);
    const results = seasonResults.filter((r) => n(r.owner_id) === id);
    const team = currentTeamMap.get(id);

    const wins = results.reduce((s, r) => s + n(r.wins), 0);
    const losses = results.reduce((s, r) => s + n(r.losses), 0);
    const ties = results.reduce((s, r) => s + n(r.ties), 0);

    const old = historyStats.get(id) || empty();
    const now = currentStats.get(id) || empty();

    const playoff = merged(old, now, "playoff");
    const consolation = merged(old, now, "consolation");

    const years = [
      ...new Set(
        results.map((r) => n(r.season_year))
          .filter((y) => y >= 2014 && y <= n(currentSeason))
      ),
    ];

    return {
      id: owner.id,
      name: owner.name,
      active: activeIds.has(id),
      team: team?.team_name || team?.teamName || null,
      wins,
      losses,
      ties,
      playoff,
      consolation,
      allW: wins + playoff.w + consolation.w,
      allL: losses + playoff.l + consolation.l,
      allT: ties + playoff.t + consolation.t,
      seasons: years.length,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
      playoffAppearances: results.filter((r) =>
        Boolean(r.playoff_appearance)
      ).length,
      finals: results.filter((r) =>
        Boolean(r.championship_appearance)
      ).length,
      titles: results.filter((r) => Boolean(r.champion)).length,
    };
  });

  rows.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      b.titles - a.titles ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name)
  );

  const active = rows.filter((r) => r.active);
  const former = rows.filter((r) => !r.active);

  const latestWeek = Math.max(
    0,
    ...completedCurrentMatchups
      .filter((g) => g.completed === true)
      .map((g) => n(g.matchup_period))
  );

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
          <p className="eyebrow">THE LEAGUE</p>
          <h1>Owners</h1>
          <p>
            The complete career history of everyone who has
            competed in Dirty P Fantasy Football.
          </p>
        </div>
        <div className="owners-count">
          <strong>{rows.length}</strong>
          <span>ALL-TIME OWNERS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>
        <span>
          {latestWeek
            ? `Career records through ${currentSeason} Week ${latestWeek}`
            : `Career records through ${currentSeason}`}
        </span>
      </nav>

      {unmatchedEspnOwners.length > 0 && (
        <section className="owners-section">
          <article className="owner-card" style={{ padding: 20 }}>
            <span className="owner-status">ESPN OWNER MATCH WARNING</span>
            <p>
              {unmatchedEspnOwners
                .map((o) => `${o.ownerName} (${o.teamName})`)
                .join(", ")}
            </p>
          </article>
        </section>
      )}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURRENT LEAGUE</p>
            <h2>Active Owners</h2>
          </div>
          <span>{active.length} Owners</span>
        </div>
        <div className="owners-grid">
          {active.map((o) => <OwnerCard key={o.id} owner={o} />)}
        </div>
      </section>

      {former.length > 0 && (
        <section className="owners-section former-owners-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LEAGUE HISTORY</p>
              <h2>Former Owners</h2>
            </div>
            <span>{former.length} Owners</span>
          </div>
          <div className="owners-grid">
            {former.map((o) => <OwnerCard key={o.id} owner={o} />)}
          </div>
        </section>
      )}

      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>
        <span>The League Archive · Est. 2014</span>
        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
