import Link from "next/link";
import { supabase } from "../lib/supabase";
import { getLeagueData } from "../lib/leagueData";
import { getMatchupIntel } from "../lib/matchupIntel";
import { getEspnLiveScoreMap } from "../lib/espnLiveScore";
import AutoRefresh from "./components/AutoRefresh";

export const dynamic = "force-dynamic";

// =====================================================
// DIRTY P FANTASY FOOTBALL
// HOMEPAGE
// =====================================================

const ASSIGNED_RIVALS = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

// =====================================================
// HELPERS
// =====================================================

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function formatScore(value) {
  return num(value).toFixed(2);
}

function formatOne(value) {
  return num(value).toFixed(1);
}

function formatRecord(wins, losses, ties = 0) {
  const w = num(wins);
  const l = num(losses);
  const t = num(ties);

  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function firstName(name = "") {
  return String(name).trim().split(" ")[0] || name;
}

function isAssignedRival(a, b) {
  return ASSIGNED_RIVALS.some(
    ([x, y]) =>
      (x === a && y === b) ||
      (x === b && y === a)
  );
}

function getWinnerId(game) {
  const homeId = Number(game.home_owner_id);
  const awayId = Number(game.away_owner_id);

  const winner = String(game.winner || "").toUpperCase();

  if (winner === "HOME") return homeId;
  if (winner === "AWAY") return awayId;
  if (winner === "TIE") return null;

  if (!hasNumber(game.home_score) || !hasNumber(game.away_score)) {
    return null;
  }

  const home = num(game.home_score);
  const away = num(game.away_score);

  if (home > away) return homeId;
  if (away > home) return awayId;

  return null;
}

function getSeries(games, owner1Id, owner2Id) {
  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;
  let count = 0;

  for (const game of games || []) {
    const home = Number(game.home_owner_id);
    const away = Number(game.away_owner_id);

    const matches =
      (home === owner1Id && away === owner2Id) ||
      (home === owner2Id && away === owner1Id);

    if (!matches) continue;

    count++;

    const winnerId = getWinnerId(game);

    if (winnerId === owner1Id) owner1Wins++;
    else if (winnerId === owner2Id) owner2Wins++;
    else ties++;
  }

  return {
    games: count,
    owner1Wins,
    owner2Wins,
    ties,
  };
}

function seriesText(series, name1, name2) {
  if (!series || !series.games) {
    return "First recorded meeting";
  }

  if (series.owner1Wins > series.owner2Wins) {
    return `${name1} leads ${formatRecord(
      series.owner1Wins,
      series.owner2Wins,
      series.ties
    )}`;
  }

  if (series.owner2Wins > series.owner1Wins) {
    return `${name2} leads ${formatRecord(
      series.owner2Wins,
      series.owner1Wins,
      series.ties
    )}`;
  }

  return `Series tied ${formatRecord(
    series.owner1Wins,
    series.owner2Wins,
    series.ties
  )}`;
}

function buildStreaks(games) {
  const sorted = [...(games || [])].sort(
    (a, b) =>
      num(a.matchup_period) - num(b.matchup_period)
  );

  const results = new Map();

  for (const game of sorted) {
    const winnerId = getWinnerId(game);

    for (const ownerId of [
      Number(game.home_owner_id),
      Number(game.away_owner_id),
    ]) {
      if (!results.has(ownerId)) {
        results.set(ownerId, []);
      }

      const outcome =
        winnerId === null
          ? "T"
          : winnerId === ownerId
          ? "W"
          : "L";

      results.get(ownerId).push(outcome);
    }
  }

  const streaks = new Map();

  for (const [ownerId, outcomes] of results) {
    if (!outcomes.length) continue;

    const type = outcomes[outcomes.length - 1];
    if (type === "T") continue;

    let count = 0;

    for (let i = outcomes.length - 1; i >= 0; i--) {
      if (outcomes[i] !== type) break;
      count++;
    }

    streaks.set(ownerId, { type, count });
  }

  return streaks;
}

// =====================================================
// FANTASY PROJECTIONS
// =====================================================

function buildFantasyLine({
  awayName,
  homeName,
  awayProjection,
  homeProjection,
}) {
  const away = num(awayProjection);
  const home = num(homeProjection);

  if (away <= 0 || home <= 0) {
    return {
      available: false,
      projectedWinner: null,
      line: "—",
      total: "—",
      projectedScore: "—",
    };
  }

  const difference = Math.abs(away - home);

  const projectedWinner =
    difference < 0.05
      ? "Pick'em"
      : away > home
      ? awayName
      : homeName;

  return {
    available: true,
    projectedWinner,
    line:
      difference < 0.05
        ? "PICK"
        : `${projectedWinner} -${formatOne(difference)}`,
    total: formatOne(away + home),
    projectedScore: `${formatOne(away)} - ${formatOne(home)}`,
  };
}

function topPlayers(teamIntel, limit = 3) {
  return (teamIntel?.impactPlayers || []).slice(0, limit);
}

function outlookWord(player) {
  if (player?.matchupGrade === "GOOD") return "Favorable";
  if (player?.matchupGrade === "TOUGH") return "Tough";
  if (player?.matchupGrade === "NEUTRAL") return "Neutral";
  return "Unknown";
}

function playerShortText(player) {
  if (!player) return "";

  let text = `${player.name} (${player.position})`;

  if (num(player.projection) > 0) {
    text += ` · ${formatOne(player.projection)} proj`;
  }

  if (player.opponent && player.opponent !== "TBD") {
    text += ` vs ${player.opponent}`;
  }

  const outlook = outlookWord(player);

  if (outlook !== "Unknown") {
    text += ` · ${outlook}`;
  }

  return text;
}

function getNotableOutlook(matchup) {
  const players = [
    ...topPlayers(matchup.awayIntel, 4),
    ...topPlayers(matchup.homeIntel, 4),
  ];

  const favorable = players
    .filter((p) => p.matchupGrade === "GOOD")
    .sort((a, b) => num(b.projection) - num(a.projection))[0];

  if (favorable) {
    return `${favorable.name} has one of the best fantasy spots in this matchup, with ESPN projecting ${formatOne(
      favorable.projection
    )} points against ${favorable.opponent}.`;
  }

  const tough = players
    .filter((p) => p.matchupGrade === "TOUGH")
    .sort((a, b) => num(b.projection) - num(a.projection))[0];

  if (tough) {
    return `${tough.name} draws a difficult matchup, with ESPN projecting ${formatOne(
      tough.projection
    )} points against ${tough.opponent}.`;
  }

  return null;
}

function matchupLiveStatus(matchup) {
  if (matchup.game.completed === true) {
    return "FINAL";
  }

  const starters = [
    ...(matchup.awayIntel?.starters || []),
    ...(matchup.homeIntel?.starters || []),
  ];

  const started = starters.some(
    (player) =>
      player.nflGameState === "in" ||
      player.nflGameState === "post"
  );

  return started ? "LIVE" : "NOT STARTED";
}

// =====================================================
// DIVISION STANDINGS
// =====================================================

function compareStandings(a, b) {
  const aGames = a.wins + a.losses + a.ties;
  const bGames = b.wins + b.losses + b.ties;

  const aPct = aGames
    ? (a.wins + a.ties * 0.5) / aGames
    : 0;

  const bPct = bGames
    ? (b.wins + b.ties * 0.5) / bGames
    : 0;

  return (
    bPct - aPct ||
    b.wins - a.wins ||
    b.pointsFor - a.pointsFor ||
    a.playoffSeed - b.playoffSeed
  );
}

function getDivisionLeaders(standings) {
  const groups = new Map();

  for (const team of standings) {
    if (team.divisionId === null || team.divisionId === undefined) {
      continue;
    }

    const key = String(team.divisionId);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(team);
  }

  const leaders = new Set();

  for (const teams of groups.values()) {
    const sorted = [...teams].sort(compareStandings);

    if (sorted[0]) {
      leaders.add(sorted[0].ownerId);
    }
  }

  return {
    leaders,
    verified: groups.size === 2,
  };
}

// =====================================================
// MAIN HOMEPAGE
// =====================================================

export default async function Home() {
  let leagueData;

  try {
    leagueData = await getLeagueData();
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
  } = leagueData;

  // =====================================================
  // DEFENDING CHAMPION
  // =====================================================

  const { data: previousSeasonData } = await supabase
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

  const defendingSeason = previousSeasonData?.[0] || null;

  // =====================================================
  // OWNER LOOKUPS
  // =====================================================

  const ownerMap = new Map(
    (owners || []).map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  const resultByOwner = new Map(
    (currentSeasonResults || []).map((result) => [
      Number(result.owner_id),
      result,
    ])
  );

  const currentTeamByOwner = new Map();

  for (const team of currentTeams || []) {
    const ownerId = Number(
      team.owner_id ?? team.ownerId ?? 0
    );

    if (ownerId > 0) {
      currentTeamByOwner.set(ownerId, team);
    }
  }

  // =====================================================
  // CURRENT STANDINGS
  // =====================================================

  const standings = (currentTeams || [])
    .map((team) => {
      const ownerId = Number(
        team.owner_id ?? team.ownerId ?? 0
      );

      const result = resultByOwner.get(ownerId);

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

        divisionName:
          team.division_name ??
          team.divisionName ??
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
    .filter((team) => team.ownerId > 0)
    .sort((a, b) => {
      const aSeed = a.playoffSeed > 0 ? a.playoffSeed : 999;
      const bSeed = b.playoffSeed > 0 ? b.playoffSeed : 999;

      return aSeed - bSeed;
    });

  const standingsMap = new Map(
    standings.map((team) => [team.ownerId, team])
  );

  const playoffCount = Number(playoffTeamCount || 4);

  const {
    leaders: divisionLeaders,
    verified: divisionsVerified,
  } = getDivisionLeaders(standings);

  // =====================================================
  // COMPLETED GAMES
  // =====================================================

  const completedGames = completedCurrentMatchups || [];

  const completedWeeks = completedGames
    .map((game) => Number(game.matchup_period))
    .filter((week) => Number.isFinite(week) && week > 0);

  const latestCompletedWeek = completedWeeks.length
    ? Math.max(...completedWeeks)
    : 0;

  const latestWeekGames = completedGames.filter(
    (game) =>
      Number(game.matchup_period) === latestCompletedWeek
  );

  const streakMap = buildStreaks(completedGames);

  // =====================================================
  // UPCOMING WEEK
  // =====================================================

  const upcomingWeeks = [
    ...new Set(
      (currentSeasonMatchups || [])
        .filter(
          (game) =>
            game.is_playoff !== true &&
            game.is_consolation !== true &&
            Number(game.matchup_period) > latestCompletedWeek
        )
        .map((game) => Number(game.matchup_period))
        .filter(Number.isFinite)
    ),
  ].sort((a, b) => a - b);

  const previewWeek =
    upcomingWeeks[0] ||
    Math.max(
      Number(currentWeek || 1),
      latestCompletedWeek + 1
    );

  const upcomingGames = (currentSeasonMatchups || []).filter(
    (game) =>
      Number(game.matchup_period) === previewWeek &&
      game.is_playoff !== true &&
      game.is_consolation !== true
  );

  // =====================================================
  // ESPN PLAYER INTELLIGENCE
  // =====================================================

  let matchupIntel = null;

  try {
    matchupIntel = await getMatchupIntel(previewWeek);
  } catch (error) {
    console.error("Matchup intel error:", error);
  }

  const showLiveScoreboard = Boolean(
    matchupIntel?.weekStarted
  );

  let espnLiveScoreMap = new Map();

  try {
    espnLiveScoreMap = await getEspnLiveScoreMap(
      currentSeason,
      previewWeek
    );
  } catch (error) {
    console.error("ESPN live scoring error:", error);
  }

  function getEspnTeamId(ownerId) {
    const team = currentTeamByOwner.get(Number(ownerId));

    if (!team) return 0;

    return Number(
      team.espnTeamId ??
      team.espn_team_id ??
      team.id ??
      0
    );
  }

  function getOwnerIntel(ownerId) {
    if (!matchupIntel) return null;

    const espnTeamId = getEspnTeamId(ownerId);

    if (!espnTeamId) return null;

    return matchupIntel.teamMap?.get(espnTeamId) || null;
  }

  // =====================================================
  // BUILD WEEKLY MATCHUPS
  // =====================================================

  const previewMatchups = upcomingGames.map((game) => {
    const awayId = Number(game.away_owner_id);
    const homeId = Number(game.home_owner_id);

    const awayName = ownerMap.get(awayId) || "Unknown Owner";
    const homeName = ownerMap.get(homeId) || "Unknown Owner";

    const awayStanding = standingsMap.get(awayId) || null;
    const homeStanding = standingsMap.get(homeId) || null;

    const series = getSeries(
      matchups || [],
      awayId,
      homeId
    );

    const assignedRivals = isAssignedRival(
      awayName,
      homeName
    );

    const awayIntel = getOwnerIntel(awayId);
    const homeIntel = getOwnerIntel(homeId);

    const awayLive =
      espnLiveScoreMap.get(getEspnTeamId(awayId)) || null;

    const homeLive =
      espnLiveScoreMap.get(getEspnTeamId(homeId)) || null;

    const fantasyLine = buildFantasyLine({
      awayName,
      homeName,
      awayProjection: awayIntel?.projectedPoints,
      homeProjection: homeIntel?.projectedPoints,
    });

    let hypeScore = 0;

    if (assignedRivals) hypeScore += 20;

    if (
      awayStanding?.wins > 0 &&
      awayStanding?.losses === 0
    ) {
      hypeScore += 8;
    }

    if (
      homeStanding?.wins > 0 &&
      homeStanding?.losses === 0
    ) {
      hypeScore += 8;
    }

    const awayPlayoff =
      awayStanding?.playoffSeed > 0 &&
      awayStanding?.playoffSeed <= playoffCount;

    const homePlayoff =
      homeStanding?.playoffSeed > 0 &&
      homeStanding?.playoffSeed <= playoffCount;

    if (awayPlayoff && homePlayoff) {
      hypeScore += 12;
    } else if (awayPlayoff || homePlayoff) {
      hypeScore += 6;
    }

    if (
      awayStanding?.playoffSeed &&
      homeStanding?.playoffSeed
    ) {
      hypeScore += Math.max(
        0,
        6 -
          Math.abs(
            awayStanding.playoffSeed -
            homeStanding.playoffSeed
          )
      );
    }

    hypeScore +=
      num(awayStanding?.wins) +
      num(homeStanding?.wins);

    hypeScore += Math.max(
      0,
      4 - Math.abs(series.owner1Wins - series.owner2Wins)
    );

    return {
      game,
      awayId,
      homeId,
      awayName,
      homeName,
      awayStanding,
      homeStanding,
      awayStreak: streakMap.get(awayId),
      homeStreak: streakMap.get(homeId),
      awayIntel,
      homeIntel,
      awayLive,
      homeLive,
      fantasyLine,
      series,
      assignedRivals,
      rivalryWeek: previewWeek === 11,
      hypeScore,
    };
  });

  const rankedMatchups = [...previewMatchups].sort(
    (a, b) => b.hypeScore - a.hypeScore
  );

  const gameOfTheWeek = rankedMatchups[0] || null;

  // =====================================================
  // AROUND THE LEAGUE
  // =====================================================

  const stories = [];

  if (latestWeekGames.length > 0) {
    const weekSides = latestWeekGames.flatMap((game) => [
      {
        game,
        ownerId: Number(game.away_owner_id),
        ownerName:
          ownerMap.get(Number(game.away_owner_id)) ||
          "Unknown Owner",
        teamName: game.away_team_name || "Unknown Team",
        score: num(game.away_score),
      },
      {
        game,
        ownerId: Number(game.home_owner_id),
        ownerName:
          ownerMap.get(Number(game.home_owner_id)) ||
          "Unknown Owner",
        teamName: game.home_team_name || "Unknown Team",
        score: num(game.home_score),
      },
    ]);

    const highScore = [...weekSides].sort(
      (a, b) => b.score - a.score
    )[0];

    if (highScore) {
      const winnerId = getWinnerId(highScore.game);

      const margin = Math.abs(
        num(highScore.game.home_score) -
        num(highScore.game.away_score)
      );

      let text =
        `${highScore.teamName} scored ${formatScore(
          highScore.score
        )}, the highest total of Week ${latestCompletedWeek}.`;

      if (winnerId === highScore.ownerId) {
        text += ` ${firstName(
          highScore.ownerName
        )} won by ${formatScore(margin)}.`;
      }

      stories.push({
        headline: `${firstName(highScore.ownerName)} Goes Off`,
        text,
      });
    }

    const undefeated = standings.filter(
      (team) => team.wins > 0 && team.losses === 0
    );

    if (undefeated.length === 1) {
      const team = undefeated[0];

      stories.push({
        headline: `${firstName(team.ownerName)} Stands Alone`,
        text: `${team.ownerName} is the league's only remaining unbeaten owner at ${formatRecord(
          team.wins,
          team.losses,
          team.ties
        )}.`,
      });
    } else if (undefeated.length > 1) {
      stories.push({
        headline: `${undefeated.length} Perfect Records Remain`,
        text: `${undefeated
          .map((team) => team.ownerName)
          .join(" and ")} remain unbeaten through Week ${latestCompletedWeek}.`,
      });
    }

    const closest = latestWeekGames
      .map((game) => ({
        game,
        margin: Math.abs(
          num(game.home_score) - num(game.away_score)
        ),
      }))
      .filter((item) => item.margin > 0)
      .sort((a, b) => a.margin - b.margin)[0];

    if (closest) {
      const winnerId = getWinnerId(closest.game);

      const loserId =
        winnerId === Number(closest.game.home_owner_id)
          ? Number(closest.game.away_owner_id)
          : Number(closest.game.home_owner_id);

      if (winnerId !== null) {
        const winnerName =
          ownerMap.get(winnerId) || "Unknown Owner";

        const loserName =
          ownerMap.get(loserId) || "Unknown Owner";

        stories.push({
          headline: `${firstName(
            winnerName
          )} Escapes ${firstName(loserName)}`,
          text: `${winnerName} survived the week's closest matchup, beating ${loserName} by just ${formatScore(
            closest.margin
          )} points.`,
        });
      }
    }

    const hottest = [...streakMap.entries()]
      .map(([ownerId, streak]) => ({
        ownerName: ownerMap.get(ownerId) || "Unknown Owner",
        ...streak,
      }))
      .filter(
        (streak) => streak.type === "W" && streak.count >= 2
      )
      .sort((a, b) => b.count - a.count)[0];

    if (hottest) {
      stories.push({
        headline: `${firstName(
          hottest.ownerName
        )} Keeps Rolling`,
        text: `${hottest.ownerName} has won ${hottest.count} straight entering Week ${previewWeek}.`,
      });
    }
  }

  const aroundLeague = stories.slice(0, 4);

  // =====================================================
  // MATCHUP ANALYSIS
  // =====================================================

  function matchupAnalysis(matchup) {
    const pieces = [];

    if (matchup.assignedRivals) {
      pieces.push(
        matchup.rivalryWeek
          ? `${matchup.awayName} and ${matchup.homeName} meet in their official Rivalry Week matchup.`
          : `${matchup.awayName} and ${matchup.homeName} are assigned rivals, adding extra bragging rights.`
      );
    }

    const away = matchup.awayStanding;
    const home = matchup.homeStanding;

    const awayPlayoff =
      away?.playoffSeed > 0 &&
      away?.playoffSeed <= playoffCount;

    const homePlayoff =
      home?.playoffSeed > 0 &&
      home?.playoffSeed <= playoffCount;

    if (awayPlayoff && homePlayoff) {
      pieces.push(
        `Both teams currently sit in the playoff field at Seeds #${away.playoffSeed} and #${home.playoffSeed}.`
      );
    } else if (awayPlayoff && home) {
      pieces.push(
        `${matchup.awayName} currently owns Seed #${away.playoffSeed}, while ${matchup.homeName} is #${home.playoffSeed}.`
      );
    } else if (homePlayoff && away) {
      pieces.push(
        `${matchup.homeName} currently owns Seed #${home.playoffSeed}, while ${matchup.awayName} is #${away.playoffSeed}.`
      );
    } else if (away && home) {
      pieces.push(
        `${matchup.awayName} enters ${formatRecord(
          away.wins,
          away.losses,
          away.ties
        )}, while ${matchup.homeName} comes in at ${formatRecord(
          home.wins,
          home.losses,
          home.ties
        )}.`
      );
    }

    const awayStars = topPlayers(matchup.awayIntel, 2);
    const homeStars = topPlayers(matchup.homeIntel, 2);

    if (awayStars[0] && homeStars[0]) {
      pieces.push(
        `${firstName(
          matchup.awayName
        )}'s top projected option is ${playerShortText(
          awayStars[0]
        )}, while ${firstName(
          matchup.homeName
        )} is led by ${playerShortText(homeStars[0])}.`
      );
    }

    const notable = getNotableOutlook(matchup);

    if (notable) pieces.push(notable);

    if (matchup.fantasyLine.available) {
      pieces.push(
        `The Dirty P projection makes ${matchup.fantasyLine.projectedWinner} the favorite at ${matchup.fantasyLine.line}, with a projected total of ${matchup.fantasyLine.total}.`
      );
    }

    pieces.push(
      `${seriesText(
        matchup.series,
        matchup.awayName,
        matchup.homeName
      )}.`
    );

    return pieces.filter(Boolean).join(" ");
  }

  // =====================================================
  // PAGE RENDER
  // =====================================================

  return (
    <main className="page-shell home-page">
      <AutoRefresh enabled={true} intervalMs={30000} />

      {/* HEADER */}

      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </Link>

          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      {/* HERO */}

      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">
            THE LEAGUE ARCHIVE · EST. 2014
          </p>

          <h1>Dirty P Fantasy Football</h1>

          <p className="hero-copy">
            Championships, rivalries, heartbreak, dominance and
            questionable fantasy decisions.
          </p>
        </div>
      </section>

      {/* DEFENDING CHAMPION */}

      {defendingSeason && (
        <section className="champion-strip">
          <div className="champion-strip-title">
            <span className="card-label">
              DEFENDING CHAMPION
            </span>

            <strong>
              {defendingSeason.champion?.name || "Unknown"}
            </strong>
          </div>

          <div className="champion-strip-result">
            <span>
              {defendingSeason.year} Champion
            </span>

            <span className="champion-divider">•</span>

            <span>
              defeated{" "}
              {defendingSeason.runner_up?.name || "Runner-Up"}
            </span>

            {defendingSeason.championship_score && (
              <strong>
                {defendingSeason.championship_score}
              </strong>
            )}
          </div>
        </section>
      )}

      {/* ESPN OWNER MAPPING WARNING */}

      {unmatchedEspnOwners?.length > 0 && (
        <div className="home-warning">
          ESPN owner mapping issue:{" "}
          {unmatchedEspnOwners
            .map((owner) => owner.ownerName)
            .join(", ")}
        </div>
      )}

      {/* =================================================
          CURRENT STANDINGS
      ================================================= */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {currentSeason} SEASON
            </p>

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

                const playoffLabel = playoff
                  ? divisionsVerified
                    ? divisionLeaders.has(team.ownerId)
                      ? `DIVISION LEADER · #${team.playoffSeed}`
                      : `WILD CARD · #${team.playoffSeed}`
                    : `PLAYOFF SEED · #${team.playoffSeed}`
                  : null;

                return (
                  <tr key={team.ownerId}>
                    <td>
                      <strong>
                        #{team.playoffSeed || "—"}
                      </strong>
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
                      {formatRecord(
                        team.wins,
                        team.losses,
                        team.ties
                      )}
                    </td>

                    <td>
                      {formatScore(team.pointsFor)}
                    </td>

                    <td>
                      {playoff ? (
                        <span className="playoff-badge">
                          {playoffLabel}
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

      {/* =================================================
          AROUND THE LEAGUE
      ================================================= */}

      {!showLiveScoreboard && (
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

          {aroundLeague.length > 0 ? (
            <div className="around-league">
              {aroundLeague.map((story, index) => (
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
                  Weekly league coverage will appear after
                  completed games.
                </strong>
              </div>
            </div>
          )}
        </section>
      )}

      {/* =================================================
          LIVE SCOREBOARD / WEEKLY MATCHUP PREVIEWS
      ================================================= */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {showLiveScoreboard
                ? `LIVE · WEEK ${previewWeek}`
                : `WEEK ${previewWeek}`}
            </p>

            <h2>
              {showLiveScoreboard
                ? `Week ${previewWeek} Scoreboard`
                : "This Week"}
            </h2>
          </div>

          <span>
            {showLiveScoreboard
              ? "Refreshes Every 30 Seconds"
              : "Matchup Preview · Refreshes Every 30 Seconds"}
          </span>
        </div>

        {/* =============================================
            LIVE FANTASY SCOREBOARD
        ============================================= */}

        {showLiveScoreboard ? (
          <div className="matchup-grid">
            {rankedMatchups.map((matchup, index) => {
              const awayScore =
                matchup.awayLive?.currentPoints ??
                num(matchup.game.away_score);

              const homeScore =
                matchup.homeLive?.currentPoints ??
                num(matchup.game.home_score);

              const awayLiveProjection =
                matchup.awayLive?.liveProjectedPoints;

              const homeLiveProjection =
                matchup.homeLive?.liveProjectedPoints;

              const liveProjectionAvailable =
                hasNumber(awayLiveProjection) &&
                hasNumber(homeLiveProjection);

              const espnLiveTotal = liveProjectionAvailable
                ? formatOne(
                    Number(awayLiveProjection) +
                      Number(homeLiveProjection)
                  )
                : "—";

              const status = matchupLiveStatus(matchup);

              return (
                <article
                  className="matchup-card"
                  key={`${matchup.awayId}-${matchup.homeId}`}
                >
                  <div className="matchup-card-top">
                    <div className="scoreboard-card-labels">
                      <span>
                        {index === 0
                          ? "GAME OF THE WEEK"
                          : `WEEK ${previewWeek}`}
                      </span>

                      {matchup.assignedRivals && (
                        <span className="small-rival-badge">
                          {matchup.rivalryWeek
                            ? "RIVALRY WEEK"
                            : "ASSIGNED RIVALS"}
                        </span>
                      )}
                    </div>

                    <span className="matchup-status">
                      {status}
                    </span>
                  </div>

                  {/* AWAY TEAM */}

                  <div
                    className={`matchup-team-row ${
                      awayScore > homeScore
                        ? "matchup-leading"
                        : ""
                    }`}
                  >
                    <div className="matchup-team-info">
                      <strong>{matchup.awayName}</strong>

                      <span>
                        {formatRecord(
                          matchup.awayStanding?.wins,
                          matchup.awayStanding?.losses,
                          matchup.awayStanding?.ties
                        )}
                        {" · Seed #"}
                        {matchup.awayStanding?.playoffSeed || "—"}
                      </span>

                      <span>
                        ESPN Live Proj:{" "}
                        {hasNumber(awayLiveProjection)
                          ? formatOne(awayLiveProjection)
                          : "—"}
                      </span>
                    </div>

                    <strong className="matchup-score">
                      {formatScore(awayScore)}
                    </strong>
                  </div>

                  <div className="matchup-vs">
                    <span>VS</span>
                  </div>

                  {/* HOME TEAM */}

                  <div
                    className={`matchup-team-row ${
                      homeScore > awayScore
                        ? "matchup-leading"
                        : ""
                    }`}
                  >
                    <div className="matchup-team-info">
                      <strong>{matchup.homeName}</strong>

                      <span>
                        {formatRecord(
                          matchup.homeStanding?.wins,
                          matchup.homeStanding?.losses,
                          matchup.homeStanding?.ties
                        )}
                        {" · Seed #"}
                        {matchup.homeStanding?.playoffSeed || "—"}
                      </span>

                      <span>
                        ESPN Live Proj:{" "}
                        {hasNumber(homeLiveProjection)
                          ? formatOne(homeLiveProjection)
                          : "—"}
                      </span>
                    </div>

                    <strong className="matchup-score">
                      {formatScore(homeScore)}
                    </strong>
                  </div>

                  {/* LIVE ODDS / PROJECTIONS */}

                  <div className="scoreboard-market-strip">
                    <div>
                      <span>SPREAD</span>

                      <strong>
                        {matchup.fantasyLine.line}
                      </strong>
                    </div>

                    <div>
                      <span>O/U</span>

                      <strong>
                        {matchup.fantasyLine.total}
                      </strong>
                    </div>

                    <div>
                      <span>ESPN LIVE TOTAL</span>

                      <strong>{espnLiveTotal}</strong>
                    </div>
                  </div>

                  <div className="featured-meta">
                    <span>
                      <strong>SERIES</strong>

                      {seriesText(
                        matchup.series,
                        matchup.awayName,
                        matchup.homeName
                      )}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <>
            {/* =========================================
                GAME OF THE WEEK
            ========================================= */}

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
                      {formatRecord(
                        gameOfTheWeek.awayStanding?.wins,
                        gameOfTheWeek.awayStanding?.losses,
                        gameOfTheWeek.awayStanding?.ties
                      )}
                      {" · Seed #"}
                      {gameOfTheWeek.awayStanding?.playoffSeed ||
                        "—"}
                    </span>
                  </div>

                  <strong className="featured-vs">
                    VS
                  </strong>

                  <div className="right">
                    <h3>{gameOfTheWeek.homeName}</h3>

                    <span>
                      {formatRecord(
                        gameOfTheWeek.homeStanding?.wins,
                        gameOfTheWeek.homeStanding?.losses,
                        gameOfTheWeek.homeStanding?.ties
                      )}
                      {" · Seed #"}
                      {gameOfTheWeek.homeStanding?.playoffSeed ||
                        "—"}
                    </span>
                  </div>
                </div>

                {/* GAME PREVIEW */}

                <p className="featured-analysis">
                  {matchupAnalysis(gameOfTheWeek)}
                </p>

                {/* FANTASY BETTING LINE */}

                {gameOfTheWeek.fantasyLine.available && (
                  <div className="scoreboard-market-strip">
                    <div>
                      <span>SPREAD</span>

                      <strong>
                        {gameOfTheWeek.fantasyLine.line}
                      </strong>
                    </div>

                    <div>
                      <span>O/U</span>

                      <strong>
                        {gameOfTheWeek.fantasyLine.total}
                      </strong>
                    </div>

                    <div>
                      <span>PROJECTED SCORE</span>

                      <strong>
                        {gameOfTheWeek.fantasyLine.projectedScore}
                      </strong>
                    </div>
                  </div>
                )}

                {/* PLAYERS TO WATCH */}

                <div
                  style={{
                    padding: "20px 24px",
                    borderTop: "1px solid #222830",
                  }}
                >
                  <span className="owner-status">
                    PLAYERS TO WATCH
                  </span>

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
                        {[
                          ...topPlayers(
                            gameOfTheWeek.awayIntel,
                            3
                          ).map((player) => ({
                            ...player,
                            owner: gameOfTheWeek.awayName,
                          })),

                          ...topPlayers(
                            gameOfTheWeek.homeIntel,
                            3
                          ).map((player) => ({
                            ...player,
                            owner: gameOfTheWeek.homeName,
                          })),
                        ].map((player, index) => (
                          <tr
                            key={`${player.owner}-${
                              player.playerId || index
                            }`}
                          >
                            <td>
                              <strong>
                                {firstName(player.owner)}
                              </strong>
                            </td>

                            <td>
                              <strong>
                                {player.name}
                              </strong>
                            </td>

                            <td>{player.position}</td>

                            <td>
                              vs {player.opponent}
                            </td>

                            <td>
                              <strong>
                                {formatOne(player.projection)}
                              </strong>
                            </td>

                            <td>
                              {num(player.seasonAverage) > 0
                                ? formatOne(
                                    player.seasonAverage
                                  )
                                : "—"}
                            </td>

                            <td>
                              {outlookWord(player)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SERIES / STREAKS */}

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

                    {gameOfTheWeek.fantasyLine.projectedWinner ||
                      "—"}
                  </span>

                  {gameOfTheWeek.awayStreak && (
                    <span>
                      <strong>
                        {firstName(gameOfTheWeek.awayName)}
                      </strong>

                      {gameOfTheWeek.awayStreak.type}
                      {gameOfTheWeek.awayStreak.count}
                    </span>
                  )}

                  {gameOfTheWeek.homeStreak && (
                    <span>
                      <strong>
                        {firstName(gameOfTheWeek.homeName)}
                      </strong>

                      {gameOfTheWeek.homeStreak.type}
                      {gameOfTheWeek.homeStreak.count}
                    </span>
                  )}
                </div>
              </article>
            )}

            {/* =========================================
                REST OF WEEK
            ========================================= */}

            {rankedMatchups.length > 1 && (
              <div className="other-matchups">
                <div className="other-matchups-heading">
                  THE REST OF WEEK {previewWeek}
                </div>

                {rankedMatchups.slice(1).map((matchup) => {
                  const awayStars = topPlayers(
                    matchup.awayIntel,
                    2
                  );

                  const homeStars = topPlayers(
                    matchup.homeIntel,
                    2
                  );

                  return (
                    <article
                      className={`other-matchup ${
                        matchup.assignedRivals
                          ? "assigned-matchup"
                          : ""
                      }`}
                      key={`${matchup.awayId}-${matchup.homeId}`}
                    >
                      <div className="other-matchup-top">
                        <div>
                          {matchup.assignedRivals && (
                            <span className="small-rival-badge">
                              {matchup.rivalryWeek
                                ? "RIVALRY WEEK"
                                : "ASSIGNED RIVALS"}
                            </span>
                          )}

                          <h3>
                            {matchup.awayName}
                            {" vs. "}
                            {matchup.homeName}
                          </h3>
                        </div>

                        <strong>
                          {formatRecord(
                            matchup.awayStanding?.wins,
                            matchup.awayStanding?.losses,
                            matchup.awayStanding?.ties
                          )}
                          {" vs "}
                          {formatRecord(
                            matchup.homeStanding?.wins,
                            matchup.homeStanding?.losses,
                            matchup.homeStanding?.ties
                          )}
                        </strong>
                      </div>

                      {/* MATCHUP PREVIEW */}

                      <p>
                        {matchupAnalysis(matchup)}
                      </p>

                      {/* PLAYERS TO WATCH */}

                      {(awayStars.length > 0 ||
                        homeStars.length > 0) && (
                        <div className="matchup-player-grid">
                          <div className="matchup-player-panel">
                            <span>
                              {firstName(matchup.awayName)}
                              {" · PLAYERS TO WATCH"}
                            </span>

                            {awayStars.length > 0 ? (
                              awayStars.map((player, index) => (
                                <div
                                  className="matchup-player-row"
                                  key={player.playerId || index}
                                >
                                  <strong>
                                    {player.name}
                                  </strong>

                                  <small>
                                    {player.position}
                                    {" · "}
                                    {formatOne(
                                      player.projection
                                    )}
                                    {" proj · vs "}
                                    {player.opponent}
                                    {" · "}
                                    {outlookWord(player)}
                                  </small>
                                </div>
                              ))
                            ) : (
                              <div className="matchup-player-row">
                                <small>
                                  Projection data unavailable.
                                </small>
                              </div>
                            )}
                          </div>

                          <div className="matchup-player-panel">
                            <span>
                              {firstName(matchup.homeName)}
                              {" · PLAYERS TO WATCH"}
                            </span>

                            {homeStars.length > 0 ? (
                              homeStars.map((player, index) => (
                                <div
                                  className="matchup-player-row"
                                  key={player.playerId || index}
                                >
                                  <strong>
                                    {player.name}
                                  </strong>

                                  <small>
                                    {player.position}
                                    {" · "}
                                    {formatOne(
                                      player.projection
                                    )}
                                    {" proj · vs "}
                                    {player.opponent}
                                    {" · "}
                                    {outlookWord(player)}
                                  </small>
                                </div>
                              ))
                            ) : (
                              <div className="matchup-player-row">
                                <small>
                                  Projection data unavailable.
                                </small>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* MATCHUP PROJECTIONS */}

                      <div className="scoreboard-market-strip">
                        <div>
                          <span>SPREAD</span>

                          <strong>
                            {matchup.fantasyLine.line}
                          </strong>
                        </div>

                        <div>
                          <span>O/U</span>

                          <strong>
                            {matchup.fantasyLine.total}
                          </strong>
                        </div>

                        <div>
                          <span>PROJECTED SCORE</span>

                          <strong>
                            {matchup.fantasyLine.projectedScore ||
                              "—"}
                          </strong>
                        </div>
                      </div>

                      <div className="other-matchup-bottom">
                        <span>
                          {seriesText(
                            matchup.series,
                            matchup.awayName,
                            matchup.homeName
                          )}
                        </span>

                        {matchup.fantasyLine.projectedWinner && (
                          <span>
                            Projected winner:{" "}
                            {matchup.fantasyLine.projectedWinner}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
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
          Independent fantasy league archive. Not affiliated with
          or endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
