import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";

export const dynamic = "force-dynamic";

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const score = (v) => n(v).toFixed(2);
const record = (w, l, t = 0) =>
  n(t) ? `${n(w)}-${n(l)}-${n(t)}` : `${n(w)}-${n(l)}`;
const pct = (w, l, t = 0) =>
  n(w) + n(l) + n(t)
    ? (n(w) + n(t) / 2) / (n(w) + n(l) + n(t))
    : 0;
const norm = (v) =>
  String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

function gameType(g) {
  const type = norm(g.matchup_type);
  const tier = norm(g.playoff_tier);

  if (
    g.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("3rd_place")
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
    type.includes("semifinal") ||
    type.includes("championship") ||
    tier.includes("winner")
  ) return "playoff";

  return "regular";
}

function valid(g) {
  const hs = g.home_score;
  const as = g.away_score;
  if (
    hs === null || hs === undefined || hs === "" ||
    as === null || as === undefined || as === ""
  ) return false;
  if (!Number.isFinite(Number(hs)) || !Number.isFinite(Number(as)))
    return false;
  if (n(hs) < 0 || n(as) < 0) return false;
  if (n(hs) === 0 && n(as) === 0) return false;
  return true;
}

function identity(g) {
  return [
    n(g.season_year),
    n(g.matchup_period),
    n(g.home_owner_id),
    n(g.away_owner_id),
  ].join(":");
}

function finished(g, season, keys) {
  if (!valid(g)) return false;
  const winner = String(g.winner || "").toUpperCase();
  return (
    ["HOME", "AWAY", "TIE"].includes(winner) ||
    g.completed === true ||
    g.is_final === true ||
    String(g.status || "").toUpperCase() === "FINAL" ||
    keys.has(identity(g)) ||
    n(g.season_year) < n(season)
  );
}

function sides(g) {
  return [
    {
      side: "HOME",
      ownerId: n(g.home_owner_id),
      opponentId: n(g.away_owner_id),
      team: g.home_team_name || "Unknown Team",
      opponentTeam: g.away_team_name || "Unknown Team",
      points: n(g.home_score),
      opponentPoints: n(g.away_score),
      year: n(g.season_year),
      week: n(g.matchup_period),
    },
    {
      side: "AWAY",
      ownerId: n(g.away_owner_id),
      opponentId: n(g.home_owner_id),
      team: g.away_team_name || "Unknown Team",
      opponentTeam: g.home_team_name || "Unknown Team",
      points: n(g.away_score),
      opponentPoints: n(g.home_score),
      year: n(g.season_year),
      week: n(g.matchup_period),
    },
  ];
}

function outcome(g, side) {
  const winner = String(g.winner || "").toUpperCase();
  if (winner === "TIE") return "T";
  if (winner === side.side) return "W";
  if (winner === "HOME" || winner === "AWAY") return "L";
  if (side.points === side.opponentPoints) return "T";
  return side.points > side.opponentPoints ? "W" : "L";
}

function winnerSide(g) {
  const pair = sides(g);
  const winner = String(g.winner || "").toUpperCase();
  if (winner === "HOME") return pair[0];
  if (winner === "AWAY") return pair[1];
  if (winner === "TIE") return null;
  if (pair[0].points === pair[1].points) return null;
  return pair[0].points > pair[1].points ? pair[0] : pair[1];
}

function gameDetails(g, names) {
  const winner = winnerSide(g);
  const pair = sides(g);
  if (!winner) return null;
  const loser = pair.find((s) => s.side !== winner.side);

  return {
    game: g,
    winner,
    loser,
    margin: winner.points - loser.points,
    final: `${score(winner.points)} – ${score(loser.points)}`,
    names: `${names.get(winner.ownerId) || "Unknown"} defeated ${
      names.get(loser.ownerId) || "Unknown"
    }`,
    when: `${g.season_year} · Week ${g.matchup_period}`,
  };
}

function Card({ label, value, name, detail, note }) {
  return (
    <article className="owner-card dp-record-card">
      <span className="owner-status">{label}</span>
      <h3 className="dp-record-value">{value}</h3>
      {name && <strong className="dp-record-name">{name}</strong>}
      {detail && <p className="dp-record-detail">{detail}</p>}
      {note && <p className="dp-record-note">{note}</p>}
    </article>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <section className="owners-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="owners-grid">{children}</div>
    </section>
  );
}

function makeStat(id, year, team) {
  return {
    id, year, team,
    wins: 0, losses: 0, ties: 0, games: 0,
    points: 0, against: 0,
    seasons: new Set(),
  };
}

export default async function RecordsPage() {
  let data;
  try {
    data = await getLeagueData();
  } catch (e) {
    return (
      <main className="page-shell">
        <h1>Records</h1>
        <p>{e.message || "Unable to load records."}</p>
      </main>
    );
  }

  const {
    owners = [],
    matchups = [],
    completedCurrentMatchups = [],
    currentSeason = 2026,
  } = data;

  const names = new Map(owners.map((o) => [n(o.id), o.name]));
  const name = (id) => names.get(n(id)) || "Unknown Owner";
  const keys = new Set(completedCurrentMatchups.map(identity));
  const games = matchups.filter((g) => finished(g, currentSeason, keys));
  const regular = games.filter((g) => gameType(g) === "regular");
  const playoff = games.filter((g) => gameType(g) === "playoff");
  const official = [...regular, ...playoff];

  const regularSides = regular.flatMap(sides);
  const playoffSides = playoff.flatMap(sides);
  const officialSides = official.flatMap(sides);

  const top = (rows, metric) =>
    [...rows].sort((a, b) => metric(b) - metric(a))[0] || null;
  const bottom = (rows, metric) =>
    [...rows].sort((a, b) => metric(a) - metric(b))[0] || null;

  const highestRegular = top(regularSides, (s) => s.points);
  const lowestRegular = bottom(
    regularSides.filter((s) => s.points > 0),
    (s) => s.points
  );
  const highestOfficial = top(officialSides, (s) => s.points);
  const highestPlayoff = top(playoffSides, (s) => s.points);

  const decisions = regular
    .map((g) => gameDetails(g, names))
    .filter(Boolean);
  const biggest = top(decisions, (d) => d.margin);
  const closest = bottom(decisions, (d) => d.margin);

  const seasonMap = new Map();
  const careerMap = new Map();
  const playoffMap = new Map();
  const streakMap = new Map();

  for (const g of regular) {
    for (const s of sides(g)) {
      const key = `${s.year}:${s.ownerId}`;

      if (!seasonMap.has(key)) {
        seasonMap.set(key, makeStat(s.ownerId, s.year, s.team));
      }
      if (!careerMap.has(s.ownerId)) {
        careerMap.set(s.ownerId, makeStat(s.ownerId, null, "Career"));
      }
      if (!streakMap.has(s.ownerId)) streakMap.set(s.ownerId, []);

      const result = outcome(g, s);

      for (const stat of [
        seasonMap.get(key),
        careerMap.get(s.ownerId),
      ]) {
        stat.games++;
        stat.points += s.points;
        stat.against += s.opponentPoints;
        stat.seasons.add(s.year);
        if (result === "W") stat.wins++;
        if (result === "L") stat.losses++;
        if (result === "T") stat.ties++;
      }

      streakMap.get(s.ownerId).push({
        year: s.year, week: s.week, result,
      });
    }
  }

  for (const g of playoff) {
    for (const s of sides(g)) {
      if (!playoffMap.has(s.ownerId)) {
        playoffMap.set(s.ownerId, makeStat(s.ownerId, null, "Playoffs"));
      }
      const stat = playoffMap.get(s.ownerId);
      const result = outcome(g, s);
      if (result === "W") stat.wins++;
      if (result === "L") stat.losses++;
      if (result === "T") stat.ties++;
    }
  }

  const seasonRows = [...seasonMap.values()];
  const careerRows = [...careerMap.values()];

  // A running season cannot hold this particular record.
  const completedSeasonRows = seasonRows.filter(
    (s) => s.year < Number(currentSeason)
  );

  const bestSeason = [...completedSeasonRows].sort(
    (a, b) =>
      pct(b.wins, b.losses, b.ties) -
        pct(a.wins, a.losses, a.ties) ||
      b.wins - a.wins ||
      b.points - a.points
  )[0];

  const mostSeasonWins = top(seasonRows, (s) => s.wins);
  const seasonPoints = top(seasonRows, (s) => s.points);
  const seasonAverage = top(seasonRows, (s) =>
    s.games ? s.points / s.games : 0
  );

  const careerWins = top(careerRows, (s) => s.wins);
  const careerPoints = top(careerRows, (s) => s.points);
  const careerPct = [...careerRows]
    .filter((s) => s.games >= 20)
    .sort(
      (a, b) =>
        pct(b.wins, b.losses, b.ties) -
        pct(a.wins, a.losses, a.ties)
    )[0];
  const playoffWins = top([...playoffMap.values()], (s) => s.wins);

  const championships = playoff
    .filter(
      (g) =>
        g.is_championship === true ||
        ["championship", "championship_game", "title_game", "final"]
          .includes(norm(g.matchup_type))
    )
    .map((g) => gameDetails(g, names))
    .filter(Boolean);

  const closestFinal = bottom(championships, (d) => d.margin);
  const biggestFinal = top(championships, (d) => d.margin);
  const highestFinal = top(
    championships.flatMap((d) => sides(d.game)),
    (s) => s.points
  );
  const highestCombinedFinal = top(
    championships,
    (d) => n(d.game.home_score) + n(d.game.away_score)
  );

  let longestWin = null;
  let longestLoss = null;

  for (const [id, rows] of streakMap) {
    rows.sort((a, b) => a.year - b.year || a.week - b.week);
    let wins = 0;
    let losses = 0;
    let winStart = null;
    let lossStart = null;

    for (const g of rows) {
      if (g.result === "W") {
        if (!wins) winStart = g;
        wins++;
        losses = 0;
        if (!longestWin || wins > longestWin.count) {
          longestWin = { id, count: wins, start: winStart, end: g };
        }
      } else if (g.result === "L") {
        if (!losses) lossStart = g;
        losses++;
        wins = 0;
        if (!longestLoss || losses > longestLoss.count) {
          longestLoss = { id, count: losses, start: lossStart, end: g };
        }
      } else {
        wins = 0;
        losses = 0;
      }
    }
  }

  const years = [...new Set(games.map((g) => n(g.season_year)))];
  const seasonCount = years.length;
  const latestWeek = Math.max(
    0,
    ...completedCurrentMatchups.map((g) => n(g.matchup_period))
  );

  const when = (s) => `${s.year} · Week ${s.week}`;
  const streakRange = (s) =>
    `${s.start.year} W${s.start.week} – ${s.end.year} W${s.end.week}`;

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
          <p className="eyebrow">THE LEAGUE RECORD BOOK</p>
          <h1>Records</h1>
          <p>
            Weekly performances, the strongest seasons, career
            leaders, postseason records, and historic streaks.
          </p>
        </div>
        <div className="owners-count">
          <strong>{seasonCount}</strong>
          <span>SEASONS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>
        <span>
          {latestWeek
            ? `Through ${currentSeason} Week ${latestWeek}`
            : "All-Time Records"}
        </span>
      </nav>

      <Section eyebrow="SINGLE GAME" title="Weekly Records">
        {highestRegular && (
          <Card label="HIGHEST REGULAR-SEASON SCORE"
            value={score(highestRegular.points)}
            name={name(highestRegular.ownerId)}
            detail={highestRegular.team}
            note={when(highestRegular)} />
        )}
        {lowestRegular && (
          <Card label="LOWEST REGULAR-SEASON SCORE"
            value={score(lowestRegular.points)}
            name={name(lowestRegular.ownerId)}
            detail={lowestRegular.team}
            note={when(lowestRegular)} />
        )}
        {highestOfficial && (
          <Card label="HIGHEST SCORE · ANY OFFICIAL GAME"
            value={score(highestOfficial.points)}
            name={name(highestOfficial.ownerId)}
            detail={highestOfficial.team}
            note={when(highestOfficial)} />
        )}
        {biggest && (
          <Card label="BIGGEST REGULAR-SEASON WIN"
            value={`+${score(biggest.margin)}`}
            name={biggest.names}
            detail={biggest.final}
            note={biggest.when} />
        )}
        {closest && (
          <Card label="CLOSEST REGULAR-SEASON GAME"
            value={closest.final}
            name={closest.names}
            detail={closest.when}
            note={`Decided by ${score(closest.margin)} points`} />
        )}
      </Section>

      <Section eyebrow="SINGLE SEASON" title="Season Records">
        {bestSeason && (
          <Card label="BEST REGULAR-SEASON RECORD"
            value={record(bestSeason.wins, bestSeason.losses, bestSeason.ties)}
            name={name(bestSeason.id)}
            detail={`${bestSeason.year} · ${bestSeason.team}`}
            note={`${(pct(bestSeason.wins, bestSeason.losses, bestSeason.ties) * 100).toFixed(1)}% winning percentage`} />
        )}
        {mostSeasonWins && (
          <Card label="MOST REGULAR-SEASON WINS"
            value={mostSeasonWins.wins}
            name={name(mostSeasonWins.id)}
            detail={`${mostSeasonWins.year} · ${mostSeasonWins.team}`} />
        )}
        {seasonPoints && (
          <Card label="MOST REGULAR-SEASON POINTS"
            value={score(seasonPoints.points)}
            name={name(seasonPoints.id)}
            detail={`${seasonPoints.year} · ${seasonPoints.team}`} />
        )}
        {seasonAverage && (
          <Card label="HIGHEST POINTS PER GAME"
            value={score(seasonAverage.points / seasonAverage.games)}
            name={name(seasonAverage.id)}
            detail={`${seasonAverage.year} · ${seasonAverage.team}`} />
        )}
      </Section>

      <Section eyebrow="ALL-TIME" title="Career Records">
        {careerWins && (
          <Card label="MOST REGULAR-SEASON WINS"
            value={careerWins.wins}
            name={name(careerWins.id)}
            detail={`${record(careerWins.wins, careerWins.losses, careerWins.ties)} career record`} />
        )}
        {careerPct && (
          <Card label="BEST CAREER WIN %"
            value={`${(pct(careerPct.wins, careerPct.losses, careerPct.ties) * 100).toFixed(1)}%`}
            name={name(careerPct.id)}
            detail={record(careerPct.wins, careerPct.losses, careerPct.ties)}
            note="Minimum 20 regular-season games" />
        )}
        {careerPoints && (
          <Card label="MOST CAREER REGULAR-SEASON POINTS"
            value={score(careerPoints.points)}
            name={name(careerPoints.id)}
            detail={`${careerPoints.seasons.size} seasons`} />
        )}
        {playoffWins && (
          <Card label="MOST PLAYOFF WINS"
            value={playoffWins.wins}
            name={name(playoffWins.id)}
            detail={record(playoffWins.wins, playoffWins.losses, playoffWins.ties)}
            note="Includes third-place games" />
        )}
      </Section>

      <Section eyebrow="POSTSEASON" title="Playoff Records">
        {highestPlayoff && (
          <Card label="HIGHEST PLAYOFF SCORE"
            value={score(highestPlayoff.points)}
            name={name(highestPlayoff.ownerId)}
            detail={highestPlayoff.team}
            note={when(highestPlayoff)} />
        )}
        {highestFinal && (
          <Card label="HIGHEST CHAMPIONSHIP SCORE"
            value={score(highestFinal.points)}
            name={name(highestFinal.ownerId)}
            detail={highestFinal.team}
            note={`${highestFinal.year} Championship`} />
        )}
        {closestFinal && (
          <Card label="CLOSEST CHAMPIONSHIP"
            value={closestFinal.final}
            name={closestFinal.names}
            detail={`${closestFinal.game.season_year} Championship`}
            note={`Decided by ${score(closestFinal.margin)} points`} />
        )}
        {biggestFinal && (
          <Card label="BIGGEST CHAMPIONSHIP WIN"
            value={`+${score(biggestFinal.margin)}`}
            name={biggestFinal.names}
            detail={biggestFinal.final}
            note={`${biggestFinal.game.season_year} Championship`} />
        )}
        {highestCombinedFinal && (
          <Card label="HIGHEST-SCORING CHAMPIONSHIP"
            value={score(
              n(highestCombinedFinal.game.home_score) +
              n(highestCombinedFinal.game.away_score)
            )}
            name={highestCombinedFinal.names}
            detail={highestCombinedFinal.final}
            note={`${highestCombinedFinal.game.season_year} Championship`} />
        )}
      </Section>

      <Section eyebrow="STREAKS" title="Historic Streaks">
        {longestWin && (
          <Card label="LONGEST REGULAR-SEASON WIN STREAK"
            value={`${longestWin.count} Games`}
            name={name(longestWin.id)}
            detail={streakRange(longestWin)} />
        )}
        {longestLoss && (
          <Card label="LONGEST REGULAR-SEASON LOSING STREAK"
            value={`${longestLoss.count} Games`}
            name={name(longestLoss.id)}
            detail={streakRange(longestLoss)} />
        )}
      </Section>

      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>
        <span>The League Archive · Est. 2014</span>
        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>
      </footer>

      <style>{`
        .dp-record-card {
          display:flex;
          flex-direction:column;
          gap:10px;
          min-width:0;
          padding:22px;
          height:100%;
        }
        .dp-record-card .owner-status {
          color:#e9bd67;
          font-size:10px;
          font-weight:800;
          letter-spacing:1px;
          line-height:1.5;
        }
        .dp-record-value {
          margin:3px 0;
          color:#f5f6f8;
          font-size:clamp(22px,3vw,32px);
          line-height:1.2;
          overflow-wrap:anywhere;
          font-variant-numeric:tabular-nums;
        }
        .dp-record-name {
          color:#edf0f4;
          font-size:15px;
          line-height:1.5;
        }
        .dp-record-detail {
          color:#a8b3c1;
          margin:0;
          font-size:13px;
          line-height:1.5;
        }
        .dp-record-note {
          color:#d9b878;
          margin:0;
          font-size:12px;
          line-height:1.5;
        }
      `}</style>
    </main>
  );
}
