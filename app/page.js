import Link from "next/link";
import { supabase } from "../lib/supabase";
import { getLeagueData } from "../lib/leagueData";
import { getMatchupIntel } from "../lib/matchupIntel";
import { getEspnLiveScoreMap } from "../lib/espnLiveScore";
import AutoRefresh from "./components/AutoRefresh";

export const dynamic = "force-dynamic";

const RIVALS = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasNum(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

function score(value) {
  return num(value).toFixed(2);
}

function one(value) {
  return num(value).toFixed(1);
}

function record(w, l, t = 0) {
  return num(t)
    ? `${num(w)}-${num(l)}-${num(t)}`
    : `${num(w)}-${num(l)}`;
}

function first(name = "") {
  return String(name).trim().split(" ")[0] || name;
}

function rivals(a, b) {
  return RIVALS.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x)
  );
}

function gameWinner(game) {
  const winner = String(game.winner || "").toUpperCase();

  if (winner === "HOME") return Number(game.home_owner_id);
  if (winner === "AWAY") return Number(game.away_owner_id);
  if (winner === "TIE") return null;

  if (!hasNum(game.home_score) || !hasNum(game.away_score)) {
    return null;
  }

  if (num(game.home_score) > num(game.away_score)) {
    return Number(game.home_owner_id);
  }

  if (num(game.away_score) > num(game.home_score)) {
    return Number(game.away_owner_id);
  }

  return null;
}

function getSeries(games, a, b) {
  const result = { games: 0, aWins: 0, bWins: 0, ties: 0 };

  for (const game of games || []) {
    const home = Number(game.home_owner_id);
    const away = Number(game.away_owner_id);

    if (!((home === a && away === b) || (home === b && away === a))) {
      continue;
    }

    result.games++;
    const winner = gameWinner(game);

    if (winner === a) result.aWins++;
    else if (winner === b) result.bWins++;
    else result.ties++;
  }

  return result;
}

function seriesText(series, a, b) {
  if (!series?.games) return "First recorded meeting";

  if (series.aWins > series.bWins) {
    return `${a} leads ${record(series.aWins, series.bWins, series.ties)}`;
  }

  if (series.bWins > series.aWins) {
    return `${b} leads ${record(series.bWins, series.aWins, series.ties)}`;
  }

  return `Series tied ${record(series.aWins, series.bWins, series.ties)}`;
}

function getStreaks(games) {
  const results = new Map();

  const sorted = [...(games || [])].sort(
    (a, b) => num(a.matchup_period) - num(b.matchup_period)
  );

  for (const game of sorted) {
    const winner = gameWinner(game);

    for (const id of [
      Number(game.home_owner_id),
      Number(game.away_owner_id),
    ]) {
      if (!results.has(id)) results.set(id, []);

      results.get(id).push(
        winner == null ? "T" : winner === id ? "W" : "L"
      );
    }
  }

  const streaks = new Map();

  for (const [id, games] of results) {
    const type = games[games.length - 1];
    if (!type || type === "T") continue;

    let count = 0;

    for (let i = games.length - 1; i >= 0; i--) {
      if (games[i] !== type) break;
      count++;
    }

    streaks.set(id, { type, count });
  }

  return streaks;
}

function fantasyLine(aName, bName, aProjection, bProjection) {
  const a = num(aProjection);
  const b = num(bProjection);

  if (a <= 0 || b <= 0) {
    return {
      available: false,
      line: "—",
      total: "—",
      projectedScore: "—",
      projectedWinner: null,
    };
  }

  const difference = Math.abs(a - b);
  const projectedWinner =
    difference < 0.05 ? "Pick'em" : a > b ? aName : bName;

  return {
    available: true,
    projectedWinner,
    line:
      difference < 0.05
        ? "PICK"
        : `${projectedWinner} -${one(difference)}`,
    total: one(a + b),
    projectedScore: `${one(a)} - ${one(b)}`,
  };
}

function topPlayers(intel, limit = 3) {
  return (intel?.impactPlayers || []).slice(0, limit);
}

function outlook(player) {
  if (player?.matchupGrade === "GOOD") return "Favorable";
  if (player?.matchupGrade === "TOUGH") return "Tough";
  if (player?.matchupGrade === "NEUTRAL") return "Neutral";
  return "Unknown";
}

function playerDescription(player) {
  if (!player) return "";

  return [
    `${player.name} (${player.position})`,
    num(player.projection) > 0 ? `${one(player.projection)} projected` : null,
    player.opponent && player.opponent !== "TBD"
      ? `vs ${player.opponent}`
      : null,
    outlook(player) !== "Unknown" ? outlook(player) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function compareTeams(a, b) {
  const ag = a.wins + a.losses + a.ties;
  const bg = b.wins + b.losses + b.ties;

  const ap = ag ? (a.wins + a.ties / 2) / ag : 0;
  const bp = bg ? (b.wins + b.ties / 2) / bg : 0;

  return (
    bp - ap ||
    b.wins - a.wins ||
    b.pointsFor - a.pointsFor ||
    a.playoffSeed - b.playoffSeed
  );
}

function divisionInfo(standings) {
  const groups = new Map();

  for (const team of standings) {
    if (team.divisionId == null) continue;

    const id = String(team.divisionId);

    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(team);
  }

  const leaders = new Set();

  for (const teams of groups.values()) {
    const winner = [...teams].sort(compareTeams)[0];
    if (winner) leaders.add(winner.ownerId);
  }

  return { leaders, verified: groups.size === 2 };
}

function liveStatus(matchup) {
  if (matchup.game.completed === true) return "FINAL";

  const players = [
    ...(matchup.awayIntel?.starters || []),
    ...(matchup.homeIntel?.starters || []),
  ];

  return players.some(
    (p) => p.nflGameState === "in" || p.nflGameState === "post"
  )
    ? "LIVE"
    : "NOT STARTED";
}

function MatchupPlayers({ matchup, limit = 3, table = false }) {
  const players = [
    ...topPlayers(matchup.awayIntel, limit).map((p) => ({
      ...p,
      owner: matchup.awayName,
    })),
    ...topPlayers(matchup.homeIntel, limit).map((p) => ({
      ...p,
      owner: matchup.homeName,
    })),
  ];

  if (!players.length) return null;

  if (table) {
    return (
      <div style={{ padding: "20px 24px", borderTop: "1px solid #222830" }}>
        <span className="owner-status">PLAYERS TO WATCH</span>
        <div className="profile-table-wrap">
          <table className="profile-table">
            <thead>
              <tr>
                <th>OWNER</th>
                <th>PLAYER</th>
                <th>POS</th>
                <th>NFL MATCHUP</th>
                <th>PROJ</th>
                <th>AVG</th>
                <th>OUTLOOK</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, index) => (
                <tr key={`${p.owner}-${p.playerId || index}`}>
                  <td><strong>{first(p.owner)}</strong></td>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.position}</td>
                  <td>vs {p.opponent}</td>
                  <td><strong>{one(p.projection)}</strong></td>
                  <td>{num(p.seasonAverage) > 0 ? one(p.seasonAverage) : "—"}</td>
                  <td>{outlook(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="matchup-player-grid">
      {[
        { name: matchup.awayName, intel: matchup.awayIntel },
        { name: matchup.homeName, intel: matchup.homeIntel },
      ].map((team) => (
        <div className="matchup-player-panel" key={team.name}>
          <span>{first(team.name)} · PLAYERS TO WATCH</span>
          {topPlayers(team.intel, limit).length ? (
            topPlayers(team.intel, limit).map((p, i) => (
              <div className="matchup-player-row" key={p.playerId || i}>
                <strong>{p.name}</strong>
                <small>
                  {p.position} · {one(p.projection)} proj · vs{" "}
                  {p.opponent} · {outlook(p)}
                </small>
              </div>
            ))
          ) : (
            <div className="matchup-player-row">
              <small>Projection data unavailable.</small>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProjectionStrip({ line, liveTotal }) {
  return (
    <div className="scoreboard-market-strip">
      <div>
        <span>SPREAD</span>
        <strong>{line.line}</strong>
      </div>
      <div>
        <span>O/U</span>
        <strong>{line.total}</strong>
      </div>
      <div>
        <span>{liveTotal !== undefined ? "ESPN LIVE TOTAL" : "PROJECTED SCORE"}</span>
        <strong>
          {liveTotal !== undefined ? liveTotal : line.projectedScore}
        </strong>
      </div>
    </div>
  );
}

function MatchupAnalysis({ matchup, playoffCount }) {
  const pieces = [];

  if (matchup.assignedRivals) {
    pieces.push(
      matchup.rivalryWeek
        ? `${matchup.awayName} and ${matchup.homeName} meet in their official Rivalry Week matchup.`
        : `${matchup.awayName} and ${matchup.homeName} are assigned rivals, adding extra bragging rights.`
    );
  }

  const a = matchup.awayStanding;
  const b = matchup.homeStanding;

  const aPlayoff =
    a?.playoffSeed > 0 && a?.playoffSeed <= playoffCount;

  const bPlayoff =
    b?.playoffSeed > 0 && b?.playoffSeed <= playoffCount;

  if (aPlayoff && bPlayoff) {
    pieces.push(
      `Both teams currently sit in the playoff field at Seeds #${a.playoffSeed} and #${b.playoffSeed}.`
    );
  } else if (aPlayoff && b) {
    pieces.push(
      `${matchup.awayName} currently owns Seed #${a.playoffSeed}, while ${matchup.homeName} is #${b.playoffSeed}.`
    );
  } else if (bPlayoff && a) {
    pieces.push(
      `${matchup.homeName} currently owns Seed #${b.playoffSeed}, while ${matchup.awayName} is #${a.playoffSeed}.`
    );
  } else if (a && b) {
    pieces.push(
      `${matchup.awayName} enters ${record(a.wins, a.losses, a.ties)}, while ${matchup.homeName} comes in at ${record(b.wins, b.losses, b.ties)}.`
    );
  }

  const awayStar = topPlayers(matchup.awayIntel, 1)[0];
  const homeStar = topPlayers(matchup.homeIntel, 1)[0];

  if (awayStar && homeStar) {
    pieces.push(
      `${first(matchup.awayName)}'s top projected option is ${playerDescription(
        awayStar
      )}, while ${first(matchup.homeName)} is led by ${playerDescription(
        homeStar
      )}.`
    );
  }

  const candidates = [
    ...topPlayers(matchup.awayIntel, 4),
    ...topPlayers(matchup.homeIntel, 4),
  ];

  const favorable = candidates
    .filter((p) => p.matchupGrade === "GOOD")
    .sort((a, b) => num(b.projection) - num(a.projection))[0];

  const tough = candidates
    .filter((p) => p.matchupGrade === "TOUGH")
    .sort((a, b) => num(b.projection) - num(a.projection))[0];

  if (favorable) {
    pieces.push(
      `${favorable.name} has a favorable matchup against ${favorable.opponent}.`
    );
  } else if (tough) {
    pieces.push(
      `${tough.name} draws a tough matchup against ${tough.opponent}.`
    );
  }

  if (matchup.line.available) {
    pieces.push(
      `The Dirty P projection makes ${matchup.line.projectedWinner} the favorite at ${matchup.line.line}, with a projected total of ${matchup.line.total}.`
    );
  }

  pieces.push(
    `${seriesText(
      matchup.series,
      matchup.awayName,
      matchup.homeName
    )}.`
  );

  return <>{pieces.join(" ")}</>;
}

export default async function Home() {
  let data;

  try {
    data = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Dirty P Fantasy Football</h1>
        <p>{error?.message || "Unable to load league data."}</p>
      </main>
    );
  }

  const {
    currentSeason,
    currentWeek,
    playoffTeamCount,
    owners,
    currentTeams,
    currentSeasonResults,
    currentSeasonMatchups,
    completedCurrentMatchups,
    matchups,
    unmatchedEspnOwners,
  } = data;

  const { data: previousSeasons } = await supabase
    .from("seasons")
    .select(`
      year,
      championship_score,
      champion:champion_owner_id(name),
      runner_up:runner_up_owner_id(name)
    `)
    .lt("year", currentSeason)
    .order("year", { ascending: false })
    .limit(1);

  const champion = previousSeasons?.[0] || null;

  const ownerMap = new Map(
    (owners || []).map((o) => [Number(o.id), o.name])
  );

  const resultMap = new Map(
    (currentSeasonResults || []).map((r) => [
      Number(r.owner_id),
      r,
    ])
  );

  const teamMap = new Map();

  for (const team of currentTeams || []) {
    const id = Number(team.owner_id ?? team.ownerId ?? 0);
    if (id > 0) teamMap.set(id, team);
  }

  // =====================================================
  // CURRENT STANDINGS
  // =====================================================

  const standings = (currentTeams || [])
    .map((team) => {
      const ownerId = Number(
        team.owner_id ?? team.ownerId ?? 0
      );

      const result = resultMap.get(ownerId);

      return {
        ownerId,
        ownerName:
          ownerMap.get(ownerId) ||
          team.ownerName ||
          "Unknown Owner",
        teamName:
          team.team_name ||
          team.teamName ||
          "Unknown Team",
        playoffSeed: num(
          team.playoffSeed ??
            team.playoff_seed ??
            team.seed
        ),
        divisionId:
          team.division_id ??
          team.divisionId ??
          null,
        wins: num(team.wins ?? result?.wins),
        losses: num(team.losses ?? result?.losses),
        ties: num(team.ties ?? result?.ties),
        pointsFor: num(
          team.pointsFor ??
            team.points_for ??
            result?.points_for
        ),
        pointsAgainst: num(
          team.pointsAgainst ??
            team.points_against ??
            result?.points_against
        ),
      };
    })
    .filter((t) => t.ownerId > 0)
    .sort(
      (a, b) =>
        (a.playoffSeed || 999) -
        (b.playoffSeed || 999)
    );

  const standingMap = new Map(
    standings.map((t) => [t.ownerId, t])
  );

  const playoffCount = Number(playoffTeamCount || 4);

  const { leaders, verified } = divisionInfo(standings);

  // =====================================================
  // WEEKS / SCORES
  // =====================================================

  const completed = completedCurrentMatchups || [];

  const completedWeeks = completed
    .map((g) => Number(g.matchup_period))
    .filter((w) => Number.isFinite(w) && w > 0);

  const latestCompletedWeek = completedWeeks.length
    ? Math.max(...completedWeeks)
    : 0;

  const latestGames = completed.filter(
    (g) =>
      Number(g.matchup_period) === latestCompletedWeek
  );

  const streaks = getStreaks(completed);

  const upcomingWeeks = [
    ...new Set(
      (currentSeasonMatchups || [])
        .filter(
          (g) =>
            g.is_playoff !== true &&
            g.is_consolation !== true &&
            Number(g.matchup_period) > latestCompletedWeek
        )
        .map((g) => Number(g.matchup_period))
        .filter(Number.isFinite)
    ),
  ].sort((a, b) => a - b);

  const previewWeek =
    upcomingWeeks[0] ||
    Math.max(num(currentWeek) || 1, latestCompletedWeek + 1);

  const upcoming = (currentSeasonMatchups || []).filter(
    (g) =>
      Number(g.matchup_period) === previewWeek &&
      g.is_playoff !== true &&
      g.is_consolation !== true
  );

  let intel = null;
  let liveScores = new Map();

  try {
    intel = await getMatchupIntel(previewWeek);
  } catch (error) {
    console.error("Matchup intel error:", error);
  }

  try {
    liveScores = await getEspnLiveScoreMap(
      currentSeason,
      previewWeek
    );
  } catch (error) {
    console.error("Live scoring error:", error);
  }

  const isLive = Boolean(intel?.weekStarted);

  function espnTeamId(ownerId) {
    const team = teamMap.get(Number(ownerId));

    if (!team) return 0;

    return Number(
      team.espnTeamId ??
        team.espn_team_id ??
        team.id ??
        0
    );
  }

  function ownerIntel(ownerId) {
    const id = espnTeamId(ownerId);
    return id ? intel?.teamMap?.get(id) || null : null;
  }

  // =====================================================
  // BUILD MATCHUPS
  // =====================================================

  const weeklyMatchups = upcoming
    .map((game) => {
      const awayId = Number(game.away_owner_id);
      const homeId = Number(game.home_owner_id);

      const awayName =
        ownerMap.get(awayId) || "Unknown Owner";
      const homeName =
        ownerMap.get(homeId) || "Unknown Owner";

      const awayStanding = standingMap.get(awayId);
      const homeStanding = standingMap.get(homeId);

      const awayIntel = ownerIntel(awayId);
      const homeIntel = ownerIntel(homeId);

      const line = fantasyLine(
        awayName,
        homeName,
        awayIntel?.projectedPoints,
        homeIntel?.projectedPoints
      );

      const series = getSeries(
        matchups || [],
        awayId,
        homeId
      );

      const assignedRivals = rivals(awayName, homeName);

      let hype = assignedRivals ? 20 : 0;

      if (
        awayStanding?.wins > 0 &&
        awayStanding?.losses === 0
      ) {
        hype += 8;
      }

      if (
        homeStanding?.wins > 0 &&
        homeStanding?.losses === 0
      ) {
        hype += 8;
      }

      const awayPlayoff =
        awayStanding?.playoffSeed > 0 &&
        awayStanding.playoffSeed <= playoffCount;

      const homePlayoff =
        homeStanding?.playoffSeed > 0 &&
        homeStanding.playoffSeed <= playoffCount;

      if (awayPlayoff && homePlayoff) hype += 12;
      else if (awayPlayoff || homePlayoff) hype += 6;

      hype +=
        num(awayStanding?.wins) +
        num(homeStanding?.wins);

      hype += Math.max(
        0,
        4 - Math.abs(series.aWins - series.bWins)
      );

      return {
        game,
        awayId,
        homeId,
        awayName,
        homeName,
        awayStanding,
        homeStanding,
        awayIntel,
        homeIntel,
        awayLive: liveScores.get(espnTeamId(awayId)),
        homeLive: liveScores.get(espnTeamId(homeId)),
        awayStreak: streaks.get(awayId),
        homeStreak: streaks.get(homeId),
        series,
        line,
        assignedRivals,
        rivalryWeek: previewWeek === 11,
        hype,
      };
    })
    .sort((a, b) => b.hype - a.hype);

  const gameOfTheWeek = weeklyMatchups[0] || null;

  // =====================================================
  // AROUND THE LEAGUE
  // =====================================================

  const stories = [];

  if (latestGames.length) {
    const sides = latestGames.flatMap((g) => [
      {
        game: g,
        ownerId: Number(g.home_owner_id),
        ownerName:
          ownerMap.get(Number(g.home_owner_id)) ||
          "Unknown Owner",
        teamName: g.home_team_name || "Unknown Team",
        points: num(g.home_score),
      },
      {
        game: g,
        ownerId: Number(g.away_owner_id),
        ownerName:
          ownerMap.get(Number(g.away_owner_id)) ||
          "Unknown Owner",
        teamName: g.away_team_name || "Unknown Team",
        points: num(g.away_score),
      },
    ]);

    const highest = [...sides].sort(
      (a, b) => b.points - a.points
    )[0];

    if (highest) {
      const won = gameWinner(highest.game) === highest.ownerId;

      const margin = Math.abs(
        num(highest.game.home_score) -
        num(highest.game.away_score)
      );

      stories.push({
        headline: `${first(highest.ownerName)} Goes Off`,
        text:
          `${highest.teamName} scored ${score(highest.points)}, ` +
          `the highest total of Week ${latestCompletedWeek}.` +
          (won ? ` ${first(highest.ownerName)} won by ${score(margin)}.` : ""),
      });
    }

    const unbeaten = standings.filter(
      (t) => t.wins > 0 && t.losses === 0
    );

    if (unbeaten.length === 1) {
      const t = unbeaten[0];
      stories.push({
        headline: `${first(t.ownerName)} Stands Alone`,
        text: `${t.ownerName} remains undefeated at ${record(
          t.wins,
          t.losses,
          t.ties
        )}.`,
      });
    } else if (unbeaten.length > 1) {
      stories.push({
        headline: `${unbeaten.length} Perfect Records Remain`,
        text: `${unbeaten
          .map((t) => t.ownerName)
          .join(" and ")} remain perfect through Week ${latestCompletedWeek}.`,
      });
    }

    const close = latestGames
      .map((g) => ({
        game: g,
        margin: Math.abs(
          num(g.home_score) - num(g.away_score)
        ),
      }))
      .filter((x) => x.margin > 0)
      .sort((a, b) => a.margin - b.margin)[0];

    if (close) {
      const winner = gameWinner(close.game);

      if (winner != null) {
        const loser =
          winner === Number(close.game.home_owner_id)
            ? Number(close.game.away_owner_id)
            : Number(close.game.home_owner_id);

        const wn = ownerMap.get(winner) || "Unknown";
        const ln = ownerMap.get(loser) || "Unknown";

        stories.push({
          headline: `${first(wn)} Escapes ${first(ln)}`,
          text: `${wn} survived the week's closest matchup, beating ${ln} by ${score(
            close.margin
          )} points.`,
        });
      }
    }

    const hot = [...streaks.entries()]
      .map(([id, s]) => ({
        name: ownerMap.get(id) || "Unknown",
        ...s,
      }))
      .filter((s) => s.type === "W" && s.count >= 2)
      .sort((a, b) => b.count - a.count)[0];

    if (hot) {
      stories.push({
        headline: `${first(hot.name)} Keeps Rolling`,
        text: `${hot.name} has won ${hot.count} straight entering Week ${previewWeek}.`,
      });
    }
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <main className="page-shell home-page">
      <AutoRefresh enabled={true} intervalMs={30000} />

      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </Link>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">THE LEAGUE ARCHIVE · EST. 2014</p>
          <h1>Dirty P Fantasy Football</h1>
          <p className="hero-copy">
            Championships, rivalries, heartbreak, dominance and
            questionable fantasy decisions.
          </p>
        </div>
      </section>

      {champion && (
        <section className="champion-strip">
          <div className="champion-strip-title">
            <span className="card-label">DEFENDING CHAMPION</span>
            <strong>{champion.champion?.name || "Unknown"}</strong>
          </div>

          <div className="champion-strip-result">
            <span>{champion.year} Champion</span>
            <span className="champion-divider">•</span>
            <span>
              defeated {champion.runner_up?.name || "Runner-Up"}
            </span>
            {champion.championship_score && (
              <strong>{champion.championship_score}</strong>
            )}
          </div>
        </section>
      )}

      {unmatchedEspnOwners?.length > 0 && (
        <div className="home-warning">
          ESPN owner mapping issue:{" "}
          {unmatchedEspnOwners
            .map((o) => o.ownerName)
            .join(", ")}
        </div>
      )}

      {/* CURRENT STANDINGS */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{currentSeason} SEASON</p>
            <h2>Current Standings</h2>
          </div>
          <span>
            ESPN Playoff Seeding · Through Week{" "}
            {latestCompletedWeek || currentWeek}
          </span>
        </div>

        <div className="profile-table-wrap">
          <table className="profile-table home-standings">
            <thead>
              <tr>
                <th>SEED</th>
                <th>TEAM</th>
                <th>RECORD</th>
                <th>PF</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((team) => {
                const playoff =
                  team.playoffSeed > 0 &&
                  team.playoffSeed <= playoffCount;

                const label = !playoff
                  ? null
                  : !verified
                  ? `PLAYOFF SEED · #${team.playoffSeed}`
                  : leaders.has(team.ownerId)
                  ? `DIVISION LEADER · #${team.playoffSeed}`
                  : `WILD CARD · #${team.playoffSeed}`;

                return (
                  <tr key={team.ownerId}>
                    <td>
                      <strong>#{team.playoffSeed || "—"}</strong>
                    </td>
                    <td>
                      <Link
                        href={`/owners/${team.ownerId}`}
                        className="standing-team-link"
                      >
                        <strong>{team.ownerName}</strong>
                        <span>{team.teamName}</span>
                      </Link>
                    </td>
                    <td>
                      {record(team.wins, team.losses, team.ties)}
                    </td>
                    <td>{score(team.pointsFor)}</td>
                    <td>
                      {playoff ? (
                        <span className="playoff-badge">
                          {label}
                        </span>
                      ) : (
                        <span className="home-out">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* AROUND THE LEAGUE */}

      {!isLive && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                WEEK {latestCompletedWeek || currentWeek}
              </p>
              <h2>Around the League</h2>
            </div>
            <span>Stories & Takeaways</span>
          </div>

          {stories.length ? (
            <div className="around-league">
              {stories.slice(0, 4).map((story, index) => (
                <article
                  className="around-league-story"
                  key={`${story.headline}-${index}`}
                >
                  <h3>{story.headline}</h3>
                  <p>{story.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="current-panel">
              <div className="empty-current-state">
                <strong>
                  Weekly league coverage will appear after completed games.
                </strong>
              </div>
            </div>
          )}
        </section>
      )}

      {/* WEEKLY SCOREBOARD / PREVIEWS */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {isLive
                ? `LIVE · WEEK ${previewWeek}`
                : `WEEK ${previewWeek}`}
            </p>
            <h2>
              {isLive
                ? `Week ${previewWeek} Scoreboard`
                : "This Week"}
            </h2>
          </div>
          <span>
            {isLive
              ? "Refreshes Every 30 Seconds"
              : "Matchup Preview · Refreshes Every 30 Seconds"}
          </span>
        </div>

        {isLive ? (
          <div className="matchup-grid">
            {weeklyMatchups.map((m, index) => {
              const awayScore =
                m.awayLive?.currentPoints ??
                num(m.game.away_score);

              const homeScore =
                m.homeLive?.currentPoints ??
                num(m.game.home_score);

              const awayProjected =
                m.awayLive?.liveProjectedPoints;

              const homeProjected =
                m.homeLive?.liveProjectedPoints;

              const total =
                hasNum(awayProjected) &&
                hasNum(homeProjected)
                  ? one(
                      num(awayProjected) + num(homeProjected)
                    )
                  : "—";

              return (
                <article
                  className="matchup-card"
                  key={`${m.awayId}-${m.homeId}`}
                >
                  <div className="matchup-card-top">
                    <div className="scoreboard-card-labels">
                      <span>
                        {index === 0
                          ? "GAME OF THE WEEK"
                          : `WEEK ${previewWeek}`}
                      </span>

                      {m.assignedRivals && (
                        <span className="small-rival-badge">
                          {m.rivalryWeek
                            ? "RIVALRY WEEK"
                            : "ASSIGNED RIVALS"}
                        </span>
                      )}
                    </div>
                    <span className="matchup-status">
                      {liveStatus(m)}
                    </span>
                  </div>

                  <div
                    className={`matchup-team-row ${
                      awayScore > homeScore
                        ? "matchup-leading"
                        : ""
                    }`}
                  >
                    <div className="matchup-team-info">
                      <strong>{m.awayName}</strong>
                      <span>
                        {record(
                          m.awayStanding?.wins,
                          m.awayStanding?.losses,
                          m.awayStanding?.ties
                        )}{" "}
                        · Seed #{m.awayStanding?.playoffSeed || "—"}
                      </span>
                      <span>
                        ESPN Live Proj:{" "}
                        {hasNum(awayProjected)
                          ? one(awayProjected)
                          : "—"}
                      </span>
                    </div>
                    <strong className="matchup-score">
                      {score(awayScore)}
                    </strong>
                  </div>

                  <div className="matchup-vs">
                    <span>VS</span>
                  </div>

                  <div
                    className={`matchup-team-row ${
                      homeScore > awayScore
                        ? "matchup-leading"
                        : ""
                    }`}
                  >
                    <div className="matchup-team-info">
                      <strong>{m.homeName}</strong>
                      <span>
                        {record(
                          m.homeStanding?.wins,
                          m.homeStanding?.losses,
                          m.homeStanding?.ties
                        )}{" "}
                        · Seed #{m.homeStanding?.playoffSeed || "—"}
                      </span>
                      <span>
                        ESPN Live Proj:{" "}
                        {hasNum(homeProjected)
                          ? one(homeProjected)
                          : "—"}
                      </span>
                    </div>
                    <strong className="matchup-score">
                      {score(homeScore)}
                    </strong>
                  </div>

                  <ProjectionStrip
                    line={m.line}
                    liveTotal={total}
                  />

                  <div className="featured-meta">
                    <span>
                      <strong>SERIES</strong>
                      {seriesText(
                        m.series,
                        m.awayName,
                        m.homeName
                      )}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <>
            {gameOfTheWeek && (
              <article className="featured-matchup">
                <div className="featured-matchup-labels">
                  <span>GAME OF THE WEEK</span>

                  {gameOfTheWeek.assignedRivals && (
                    <strong>
                      {gameOfTheWeek.rivalryWeek
                        ? "RIVALRY WEEK"
                        : "ASSIGNED RIVALS"}
                    </strong>
                  )}
                </div>

                <div className="featured-matchup-title">
                  <div>
                    <h3>{gameOfTheWeek.awayName}</h3>
                    <span>
                      {record(
                        gameOfTheWeek.awayStanding?.wins,
                        gameOfTheWeek.awayStanding?.losses,
                        gameOfTheWeek.awayStanding?.ties
                      )}{" "}
                      · Seed #
                      {gameOfTheWeek.awayStanding?.playoffSeed ||
                        "—"}
                    </span>
                  </div>

                  <strong className="featured-vs">VS</strong>

                  <div className="right">
                    <h3>{gameOfTheWeek.homeName}</h3>
                    <span>
                      {record(
                        gameOfTheWeek.homeStanding?.wins,
                        gameOfTheWeek.homeStanding?.losses,
                        gameOfTheWeek.homeStanding?.ties
                      )}{" "}
                      · Seed #
                      {gameOfTheWeek.homeStanding?.playoffSeed ||
                        "—"}
                    </span>
                  </div>
                </div>

                <p className="featured-analysis">
                  <MatchupAnalysis
                    matchup={gameOfTheWeek}
                    playoffCount={playoffCount}
                  />
                </p>

                {gameOfTheWeek.line.available && (
                  <ProjectionStrip line={gameOfTheWeek.line} />
                )}

                <MatchupPlayers
                  matchup={gameOfTheWeek}
                  limit={3}
                  table={true}
                />

                <div className="featured-meta">
                  <span>
                    <strong>SERIES</strong>
                    {seriesText(
                      gameOfTheWeek.series,
                      gameOfTheWeek.awayName,
                      gameOfTheWeek.homeName
                    )}
                  </span>

                  <span>
                    <strong>PROJECTED WINNER</strong>
                    {gameOfTheWeek.line.projectedWinner || "—"}
                  </span>

                  {gameOfTheWeek.awayStreak && (
                    <span>
                      <strong>
                        {first(gameOfTheWeek.awayName)}
                      </strong>
                      {gameOfTheWeek.awayStreak.type}
                      {gameOfTheWeek.awayStreak.count}
                    </span>
                  )}

                  {gameOfTheWeek.homeStreak && (
                    <span>
                      <strong>
                        {first(gameOfTheWeek.homeName)}
                      </strong>
                      {gameOfTheWeek.homeStreak.type}
                      {gameOfTheWeek.homeStreak.count}
                    </span>
                  )}
                </div>
              </article>
            )}

            {weeklyMatchups.length > 1 && (
              <div className="other-matchups">
                <div className="other-matchups-heading">
                  THE REST OF WEEK {previewWeek}
                </div>

                {weeklyMatchups.slice(1).map((m) => (
                  <article
                    className={`other-matchup ${
                      m.assignedRivals ? "assigned-matchup" : ""
                    }`}
                    key={`${m.awayId}-${m.homeId}`}
                  >
                    <div className="other-matchup-top">
                      <div>
                        {m.assignedRivals && (
                          <span className="small-rival-badge">
                            {m.rivalryWeek
                              ? "RIVALRY WEEK"
                              : "ASSIGNED RIVALS"}
                          </span>
                        )}
                        <h3>
                          {m.awayName} vs. {m.homeName}
                        </h3>
                      </div>
                      <strong>
                        {record(
                          m.awayStanding?.wins,
                          m.awayStanding?.losses,
                          m.awayStanding?.ties
                        )}{" "}
                        vs{" "}
                        {record(
                          m.homeStanding?.wins,
                          m.homeStanding?.losses,
                          m.homeStanding?.ties
                        )}
                      </strong>
                    </div>

                    <p>
                      <MatchupAnalysis
                        matchup={m}
                        playoffCount={playoffCount}
                      />
                    </p>

                    <MatchupPlayers matchup={m} limit={2} />

                    <ProjectionStrip line={m.line} />

                    <div className="other-matchup-bottom">
                      <span>
                        {seriesText(
                          m.series,
                          m.awayName,
                          m.homeName
                        )}
                      </span>

                      {m.line.projectedWinner && (
                        <span>
                          Projected winner:{" "}
                          {m.line.projectedWinner}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>
        <span>The League Archive · Est. 2014</span>
        <p>
          Independent fantasy league archive. Not affiliated with
          or endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
