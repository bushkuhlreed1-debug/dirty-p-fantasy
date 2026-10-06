import Link from "next/link";
import { supabase } from "../lib/supabase";
import { getLeagueData } from "../lib/leagueData";

export const dynamic = "force-dynamic";

// =========================================================
// ASSIGNED RIVALS
// =========================================================

const ASSIGNED_RIVALS = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

// =========================================================
// HELPERS
// =========================================================

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstName(name = "") {
  return String(name).trim().split(" ")[0] || name;
}

function formatScore(value) {
  return num(value).toFixed(2);
}

function formatRecord(wins, losses, ties = 0) {
  if (num(ties) > 0) {
    return `${num(wins)}-${num(losses)}-${num(ties)}`;
  }

  return `${num(wins)}-${num(losses)}`;
}

function isAssignedRival(owner1, owner2) {
  return ASSIGNED_RIVALS.some(
    ([a, b]) =>
      (a === owner1 && b === owner2) ||
      (a === owner2 && b === owner1)
  );
}

// =========================================================
// GAME HELPERS
// =========================================================

function gameSides(game, ownerMap) {
  return [
    {
      side: "AWAY",
      ownerId: Number(game.away_owner_id),
      ownerName:
        ownerMap.get(Number(game.away_owner_id)) ||
        "Unknown Owner",
      teamName: game.away_team_name || "Unknown Team",
      score: num(game.away_score),
    },
    {
      side: "HOME",
      ownerId: Number(game.home_owner_id),
      ownerName:
        ownerMap.get(Number(game.home_owner_id)) ||
        "Unknown Owner",
      teamName: game.home_team_name || "Unknown Team",
      score: num(game.home_score),
    },
  ];
}

function winnerFromGame(game, ownerMap) {
  const sides = gameSides(game, ownerMap);

  const winner = String(game.winner || "").toUpperCase();

  if (winner === "AWAY") return sides[0];
  if (winner === "HOME") return sides[1];

  if (sides[0].score === sides[1].score) {
    return null;
  }

  return [...sides].sort((a, b) => b.score - a.score)[0];
}

function loserFromGame(game, ownerMap) {
  const winner = winnerFromGame(game, ownerMap);

  if (!winner) return null;

  return gameSides(game, ownerMap).find(
    (side) => side.ownerId !== winner.ownerId
  );
}

// =========================================================
// HEAD TO HEAD
// =========================================================

function getSeries(games, owner1Id, owner2Id) {
  const seriesGames = games.filter((game) => {
    const home = Number(game.home_owner_id);
    const away = Number(game.away_owner_id);

    return (
      (home === owner1Id && away === owner2Id) ||
      (home === owner2Id && away === owner1Id)
    );
  });

  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  for (const game of seriesGames) {
    const homeId = Number(game.home_owner_id);
    const awayId = Number(game.away_owner_id);

    const homeScore = num(game.home_score);
    const awayScore = num(game.away_score);

    const winner = String(game.winner || "").toUpperCase();

    let winnerId = null;

    if (winner === "HOME") {
      winnerId = homeId;
    } else if (winner === "AWAY") {
      winnerId = awayId;
    } else if (homeScore > awayScore) {
      winnerId = homeId;
    } else if (awayScore > homeScore) {
      winnerId = awayId;
    }

    if (winnerId === owner1Id) {
      owner1Wins += 1;
    } else if (winnerId === owner2Id) {
      owner2Wins += 1;
    } else {
      ties += 1;
    }
  }

  return {
    games: seriesGames.length,
    owner1Wins,
    owner2Wins,
    ties,
  };
}

function seriesText(series, owner1Name, owner2Name) {
  if (!series || series.games === 0) {
    return "First recorded meeting";
  }

  if (series.owner1Wins > series.owner2Wins) {
    return `${owner1Name} leads ${formatRecord(
      series.owner1Wins,
      series.owner2Wins,
      series.ties
    )}`;
  }

  if (series.owner2Wins > series.owner1Wins) {
    return `${owner2Name} leads ${formatRecord(
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

// =========================================================
// CURRENT STREAKS
// =========================================================

function buildStreaks(games, ownerMap) {
  const chronological = [...games].sort(
    (a, b) =>
      Number(a.matchup_period) - Number(b.matchup_period)
  );

  const results = new Map();

  for (const game of chronological) {
    const winner = winnerFromGame(game, ownerMap);
    const loser = loserFromGame(game, ownerMap);

    for (const side of gameSides(game, ownerMap)) {
      if (!results.has(side.ownerId)) {
        results.set(side.ownerId, []);
      }

      if (winner?.ownerId === side.ownerId) {
        results.get(side.ownerId).push("W");
      } else if (loser?.ownerId === side.ownerId) {
        results.get(side.ownerId).push("L");
      } else {
        results.get(side.ownerId).push("T");
      }
    }
  }

  const streaks = new Map();

  for (const [ownerId, ownerResults] of results.entries()) {
    if (!ownerResults.length) continue;

    const type = ownerResults[ownerResults.length - 1];

    if (type === "T") continue;

    let count = 0;

    for (let i = ownerResults.length - 1; i >= 0; i -= 1) {
      if (ownerResults[i] === type) {
        count += 1;
      } else {
        break;
      }
    }

    streaks.set(ownerId, {
      type,
      count,
    });
  }

  return streaks;
}

// =========================================================
// PAGE
// =========================================================

export default async function Home() {
  let leagueData;

  try {
    leagueData = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Dirty P Fantasy Football</h1>

        <p>
          {error?.message || "Unable to load league data."}
        </p>
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

  // =======================================================
  // DEFENDING CHAMPION
  // =======================================================

  const { data: previousSeasonData } = await supabase
    .from("seasons")
    .select(`
      year,
      championship_score,
      champion:champion_owner_id(name),
      runner_up:runner_up_owner_id(name)
    `)
    .lt("year", currentSeason)
    .order("year", {
      ascending: false,
    })
    .limit(1);

  const defendingSeason = previousSeasonData?.[0] || null;

  // =======================================================
  // OWNER LOOKUP
  // =======================================================

  const ownerMap = new Map(
    (owners || []).map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  // =======================================================
  // CURRENT RESULT LOOKUP
  // =======================================================

  const resultByOwner = new Map(
    (currentSeasonResults || []).map((result) => [
      Number(result.owner_id),
      result,
    ])
  );

  // =======================================================
  // CURRENT STANDINGS
  //
  // ESPN playoffSeed determines order.
  // =======================================================

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

        wins: num(
          team.wins ??
            result?.wins
        ),

        losses: num(
          team.losses ??
            result?.losses
        ),

        ties: num(
          team.ties ??
            result?.ties
        ),

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
      const aSeed =
        a.playoffSeed > 0 ? a.playoffSeed : 999;

      const bSeed =
        b.playoffSeed > 0 ? b.playoffSeed : 999;

      return aSeed - bSeed;
    });

  const standingsMap = new Map(
    standings.map((team) => [
      team.ownerId,
      team,
    ])
  );

  const playoffCount =
    Number(playoffTeamCount || 4);

  const playoffTeams = standings.filter(
    (team) =>
      team.playoffSeed > 0 &&
      team.playoffSeed <= playoffCount
  );

  const firstOut = standings.filter(
    (team) =>
      team.playoffSeed > playoffCount
  ).slice(0, 2);

  // =======================================================
  // LATEST COMPLETED WEEK
  // =======================================================

  const completedWeeks = (completedCurrentMatchups || [])
    .map((game) => Number(game.matchup_period))
    .filter(
      (week) =>
        Number.isFinite(week) &&
        week > 0
    );

  const latestCompletedWeek =
    completedWeeks.length > 0
      ? Math.max(...completedWeeks)
      : 0;

  const latestWeekGames = (
    completedCurrentMatchups || []
  ).filter(
    (game) =>
      Number(game.matchup_period) ===
      latestCompletedWeek
  );

  // =======================================================
  // STREAKS
  // =======================================================

  const streakMap = buildStreaks(
    completedCurrentMatchups || [],
    ownerMap
  );

  // =======================================================
  // DETERMINE PREVIEW WEEK
  // =======================================================

  const upcomingWeeks = [
    ...new Set(
      (currentSeasonMatchups || [])
        .filter(
          (game) =>
            game.is_playoff !== true &&
            game.is_consolation !== true &&
            Number(game.matchup_period) >
              latestCompletedWeek
        )
        .map((game) =>
          Number(game.matchup_period)
        )
        .filter(Number.isFinite)
    ),
  ].sort((a, b) => a - b);

  const previewWeek =
    upcomingWeeks[0] ||
    Math.max(
      Number(currentWeek || 1),
      latestCompletedWeek + 1
    );

  const upcomingGames = (
    currentSeasonMatchups || []
  ).filter(
    (game) =>
      Number(game.matchup_period) === previewWeek &&
      game.is_playoff !== true &&
      game.is_consolation !== true
  );

  // =======================================================
  // BUILD UPCOMING MATCHUPS
  // =======================================================

  const previewMatchups = upcomingGames.map((game) => {
    const awayId =
      Number(game.away_owner_id);

    const homeId =
      Number(game.home_owner_id);

    const awayName =
      ownerMap.get(awayId) ||
      "Unknown Owner";

    const homeName =
      ownerMap.get(homeId) ||
      "Unknown Owner";

    const awayStanding =
      standingsMap.get(awayId) ||
      null;

    const homeStanding =
      standingsMap.get(homeId) ||
      null;

    const series = getSeries(
      matchups || [],
      awayId,
      homeId
    );

    const assignedRivals =
      isAssignedRival(
        awayName,
        homeName
      );

    const rivalryWeek =
      previewWeek === 11;

    const awayStreak =
      streakMap.get(awayId);

    const homeStreak =
      streakMap.get(homeId);

    // -----------------------------------------------------
    // GAME OF THE WEEK SCORE
    // -----------------------------------------------------

    let hypeScore = 0;

    if (assignedRivals) {
      hypeScore += 20;
    }

    const awayUndefeated =
      awayStanding?.wins > 0 &&
      awayStanding?.losses === 0;

    const homeUndefeated =
      homeStanding?.wins > 0 &&
      homeStanding?.losses === 0;

    if (awayUndefeated) {
      hypeScore += 8;
    }

    if (homeUndefeated) {
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
      4 -
        Math.abs(
          series.owner1Wins -
            series.owner2Wins
        )
    );

    return {
      game,
      awayId,
      homeId,
      awayName,
      homeName,
      awayStanding,
      homeStanding,
      awayStreak,
      homeStreak,
      series,
      assignedRivals,
      rivalryWeek,
      hypeScore,
    };
  });

  const rankedMatchups = [...previewMatchups].sort(
    (a, b) => b.hypeScore - a.hypeScore
  );

  const gameOfTheWeek =
    rankedMatchups[0] || null;

  const assignedRivalGames =
    previewMatchups.filter(
      (game) => game.assignedRivals
    );

  // =======================================================
  // AROUND THE LEAGUE
  // =======================================================

  const stories = [];

  if (latestWeekGames.length > 0) {
    const weekSides = latestWeekGames.flatMap(
      (game) =>
        gameSides(game, ownerMap).map((side) => ({
          ...side,
          game,
        }))
    );

    // -----------------------------------------------------
    // HIGH SCORE
    // -----------------------------------------------------

    const highScore = [...weekSides].sort(
      (a, b) => b.score - a.score
    )[0];

    if (highScore) {
      const winner = winnerFromGame(
        highScore.game,
        ownerMap
      );

      const loser = loserFromGame(
        highScore.game,
        ownerMap
      );

      const margin = Math.abs(
        num(highScore.game.home_score) -
          num(highScore.game.away_score)
      );

      let text =
        `${highScore.teamName} exploded for ${formatScore(
          highScore.score
        )} points, the highest score of Week ${latestCompletedWeek}.`;

      if (
        winner?.ownerId === highScore.ownerId &&
        loser
      ) {
        text += ` ${firstName(
          highScore.ownerName
        )} also won the matchup by ${formatScore(
          margin
        )}.`;
      }

      stories.push({
        headline:
          `${firstName(
            highScore.ownerName
          )} Goes Off`,

        text,

        ownerId:
          highScore.ownerId,
      });
    }

    // -----------------------------------------------------
    // UNDEFEATED
    // -----------------------------------------------------

    const undefeated = standings.filter(
      (team) =>
        team.wins > 0 &&
        team.losses === 0
    );

    if (undefeated.length === 1) {
      const team = undefeated[0];

      stories.push({
        headline:
          `${firstName(
            team.ownerName
          )} Stands Alone`,

        text:
          `${team.ownerName} is the league's only remaining unbeaten owner at ${formatRecord(
            team.wins,
            team.losses,
            team.ties
          )}.`,
      });
    }

    if (undefeated.length > 1) {
      const undefeatedNames =
        undefeated.map(
          (team) => team.ownerName
        );

      const undefeatedMatchup =
        previewMatchups.find(
          (matchup) =>
            undefeatedNames.includes(
              matchup.awayName
            ) &&
            undefeatedNames.includes(
              matchup.homeName
            )
        );

      let text =
        `${undefeatedNames.join(
          " and "
        )} are still perfect through Week ${latestCompletedWeek}.`;

      if (undefeatedMatchup) {
        text += ` They meet head-to-head in Week ${previewWeek}, guaranteeing that at least one perfect record is in serious danger.`;
      }

      stories.push({
        headline:
          `${undefeated.length} Perfect Records Remain`,

        text,
      });
    }

    // -----------------------------------------------------
    // CLOSEST GAME
    // -----------------------------------------------------

    const decidedGames = latestWeekGames
      .map((game) => ({
        game,

        margin: Math.abs(
          num(game.home_score) -
            num(game.away_score)
        ),
      }))
      .filter(
        (item) =>
          item.margin > 0
      );

    const closest = [...decidedGames].sort(
      (a, b) => a.margin - b.margin
    )[0];

    if (closest) {
      const winner = winnerFromGame(
        closest.game,
        ownerMap
      );

      const loser = loserFromGame(
        closest.game,
        ownerMap
      );

      if (winner && loser) {
        stories.push({
          headline:
            `${firstName(
              winner.ownerName
            )} Escapes ${firstName(
              loser.ownerName
            )}`,

          text:
            `${winner.ownerName} survived the week's closest matchup, beating ${loser.ownerName} by just ${formatScore(
              closest.margin
            )} points.`,
        });
      }
    }

    // -----------------------------------------------------
    // HOT STREAK / BIG WIN
    // -----------------------------------------------------

    const hottest = [
      ...streakMap.entries(),
    ]
      .map(([ownerId, streak]) => ({
        ownerId,

        ownerName:
          ownerMap.get(ownerId) ||
          "Unknown Owner",

        ...streak,
      }))
      .filter(
        (streak) =>
          streak.type === "W" &&
          streak.count >= 2
      )
      .sort(
        (a, b) =>
          b.count - a.count
      )[0];

    if (hottest) {
      stories.push({
        headline:
          `${firstName(
            hottest.ownerName
          )} Keeps Rolling`,

        text:
          `${hottest.ownerName} has won ${hottest.count} straight entering Week ${previewWeek}.`,
      });
    }
  }

  const aroundLeague =
    stories.slice(0, 4);

  // =======================================================
  // GAME OF THE WEEK ANALYSIS
  // =======================================================

  function gameOfWeekAnalysis(matchup) {
    if (!matchup) return "";

    const {
      awayName,
      homeName,
      awayStanding,
      homeStanding,
      assignedRivals,
      rivalryWeek,
      series,
    } = matchup;

    const pieces = [];

    const awayRecord = awayStanding
      ? formatRecord(
          awayStanding.wins,
          awayStanding.losses,
          awayStanding.ties
        )
      : "—";

    const homeRecord = homeStanding
      ? formatRecord(
          homeStanding.wins,
          homeStanding.losses,
          homeStanding.ties
        )
      : "—";

    if (
      awayStanding?.losses === 0 &&
      homeStanding?.losses === 0
    ) {
      pieces.push(
        `Two undefeated teams meet as ${awayName} (${awayRecord}) takes on ${homeName} (${homeRecord}).`
      );
    } else {
      pieces.push(
        `${awayName} enters ${awayRecord}, while ${homeName} comes in at ${homeRecord}.`
      );
    }

    if (assignedRivals) {
      pieces.push(
        rivalryWeek
          ? `It is also their official Rivalry Week matchup.`
          : `They are assigned rivals, adding bragging rights to a matchup that already has plenty on the line.`
      );
    }

    if (
      awayStanding?.playoffSeed &&
      homeStanding?.playoffSeed
    ) {
      pieces.push(
        `ESPN currently has them seeded #${awayStanding.playoffSeed} and #${homeStanding.playoffSeed}.`
      );
    }

    if (series.games > 0) {
      pieces.push(
        `${seriesText(
          series,
          awayName,
          homeName
        )}.`
      );
    }

    return pieces.join(" ");
  }

  // =======================================================
  // OTHER MATCHUP ANALYSIS
  // =======================================================

  function matchupAnalysis(matchup) {
    const {
      awayName,
      homeName,
      awayStanding,
      homeStanding,
      awayStreak,
      homeStreak,
      assignedRivals,
      rivalryWeek,
      series,
    } = matchup;

    const pieces = [];

    if (assignedRivals) {
      pieces.push(
        rivalryWeek
          ? `${awayName} and ${homeName} meet in their official Rivalry Week game.`
          : `${awayName} and ${homeName} are assigned rivals, putting extra bragging rights on this matchup.`
      );
    }

    const awayPlayoff =
      awayStanding?.playoffSeed > 0 &&
      awayStanding?.playoffSeed <= playoffCount;

    const homePlayoff =
      homeStanding?.playoffSeed > 0 &&
      homeStanding?.playoffSeed <= playoffCount;

    if (awayPlayoff && homePlayoff) {
      pieces.push(
        `Both are currently in the playoff field at seeds #${awayStanding.playoffSeed} and #${homeStanding.playoffSeed}.`
      );
    } else if (awayPlayoff && homeStanding) {
      pieces.push(
        `${awayName} currently holds Seed #${awayStanding.playoffSeed}, while ${homeName} sits at #${homeStanding.playoffSeed} and has a chance to make up ground.`
      );
    } else if (homePlayoff && awayStanding) {
      pieces.push(
        `${homeName} currently holds Seed #${homeStanding.playoffSeed}, while ${awayName} sits at #${awayStanding.playoffSeed} and has a chance to make up ground.`
      );
    } else if (
      awayStanding &&
      homeStanding
    ) {
      pieces.push(
        `${awayName} enters ${formatRecord(
          awayStanding.wins,
          awayStanding.losses,
          awayStanding.ties
        )}, while ${homeName} is ${formatRecord(
          homeStanding.wins,
          homeStanding.losses,
          homeStanding.ties
        )}.`
      );
    }

    const streakNotes = [];

    if (
      awayStreak &&
      awayStreak.count >= 2
    ) {
      streakNotes.push(
        `${firstName(
          awayName
        )} has ${
          awayStreak.type === "W"
            ? "won"
            : "lost"
        } ${awayStreak.count} straight`
      );
    }

    if (
      homeStreak &&
      homeStreak.count >= 2
    ) {
      streakNotes.push(
        `${firstName(
          homeName
        )} has ${
          homeStreak.type === "W"
            ? "won"
            : "lost"
        } ${homeStreak.count} straight`
      );
    }

    if (streakNotes.length) {
      pieces.push(
        `${streakNotes.join(", while ")}.`
      );
    }

    if (series.games > 0) {
      pieces.push(
        `${seriesText(
          series,
          awayName,
          homeName
        )}.`
      );
    }

    return pieces.slice(0, 3).join(" ");
  }

  // =======================================================
  // GAME OF WEEK META
  // =======================================================

  function streakText(ownerName, streak) {
    if (!streak) return null;

    return `${firstName(ownerName)} ${
      streak.type
    }${streak.count}`;
  }

  const gotwSeries = gameOfTheWeek
    ? seriesText(
        gameOfTheWeek.series,
        gameOfTheWeek.awayName,
        gameOfTheWeek.homeName
      )
    : null;

  const gotwStreaks = gameOfTheWeek
    ? [
        streakText(
          gameOfTheWeek.awayName,
          gameOfTheWeek.awayStreak
        ),

        streakText(
          gameOfTheWeek.homeName,
          gameOfTheWeek.homeStreak
        ),
      ].filter(Boolean)
    : [];

  // =======================================================
  // PAGE
  // =======================================================

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

      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">
            THE LEAGUE ARCHIVE · EST. 2014
          </p>

          <h1>
            Dirty P Fantasy Football
          </h1>

          <p className="hero-copy">
            Championships, rivalries, heartbreak,
            dominance and questionable fantasy decisions.
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
              {defendingSeason.champion?.name ||
                "Unknown"}
            </strong>
          </div>

          <div className="champion-strip-result">
            <span>
              {defendingSeason.year} Champion
            </span>

            <span className="champion-divider">
              •
            </span>

            <span>
              defeated{" "}
              {defendingSeason.runner_up?.name ||
                "Runner-Up"}
            </span>

            {defendingSeason.championship_score && (
              <strong>
                {defendingSeason.championship_score}
              </strong>
            )}
          </div>
        </section>
      )}

      {/* NAV — NO SEASONS */}

      <section className="quick-links">
        <Link href="/owners">
          Owners
        </Link>

        <Link href="/champions">
          Champions
        </Link>

        <Link href="/records">
          Records
        </Link>

        <Link href="/head-to-head">
          Head-to-Head
        </Link>

        <Link href="/rivalry-week">
          Rivalry Week
        </Link>

        <Link href="/goat">
          GOAT Rankings
        </Link>
      </section>

      {/* OWNER MAPPING WARNING */}

      {unmatchedEspnOwners?.length > 0 && (
        <div className="home-warning">
          ESPN owner mapping issue:{" "}
          {unmatchedEspnOwners
            .map((owner) => owner.ownerName)
            .join(", ")}
        </div>
      )}

      {/* ===================================================
          STANDINGS
          =================================================== */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {currentSeason} SEASON
            </p>

            <h2>
              Current Standings
            </h2>
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
                        <strong>
                          {team.ownerName}
                        </strong>

                        <span>
                          {team.teamName}
                        </span>
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
                      {formatScore(
                        team.pointsFor
                      )}
                    </td>

                    <td>
                      {playoff ? (
                        <span className="playoff-badge">
                          PLAYOFF
                        </span>
                      ) : (
                        <span className="home-out">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================
          PLAYOFF PICTURE
          =================================================== */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              POSTSEASON RACE
            </p>

            <h2>
              Playoff Picture
            </h2>
          </div>

          <span>
            Top {playoffCount} Currently In
          </span>
        </div>

        <div className="home-playoff-race">

          {playoffTeams.map((team) => (
            <Link
              href={`/owners/${team.ownerId}`}
              className="home-playoff-row"
              key={team.ownerId}
            >
              <strong className="home-playoff-seed">
                {team.playoffSeed}
              </strong>

              <div className="home-playoff-name">
                <strong>
                  {team.ownerName}
                </strong>

                <span>
                  {team.teamName}
                </span>
              </div>

              <strong className="home-playoff-record">
                {formatRecord(
                  team.wins,
                  team.losses,
                  team.ties
                )}
              </strong>
            </Link>
          ))}

          {firstOut.length > 0 && (
            <div className="home-first-out">
              <strong>
                FIRST OUT
              </strong>

              <span>
                {firstOut
                  .map(
                    (team) =>
                      `#${team.playoffSeed} ${team.ownerName}`
                  )
                  .join(" · ")}
              </span>
            </div>
          )}

        </div>
      </section>

      {/* ===================================================
          AROUND THE LEAGUE
          =================================================== */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              WEEK {latestCompletedWeek || currentWeek}
            </p>

            <h2>
              Around the League
            </h2>
          </div>

          <span>
            Stories & Takeaways
          </span>
        </div>

        {aroundLeague.length > 0 ? (
          <div className="around-league">

            {aroundLeague.map(
              (story, index) => (
                <article
                  className="around-league-story"
                  key={`${story.headline}-${index}`}
                >
                  <h3>
                    {story.headline}
                  </h3>

                  <p>
                    {story.text}
                  </p>
                </article>
              )
            )}

          </div>
        ) : (
          <div className="current-panel">
            <div className="empty-current-state">
              <strong>
                Weekly league coverage will appear
                after completed games.
              </strong>
            </div>
          </div>
        )}
      </section>

      {/* ===================================================
          WEEK PREVIEW
          =================================================== */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              WEEK {previewWeek}
            </p>

            <h2>
              This Week
            </h2>
          </div>

          <span>
            Matchup Preview
          </span>
        </div>

        {/* ASSIGNED RIVALS NOTE */}

        {assignedRivalGames.length > 0 && (
          <div className="home-rival-note">
            <strong>
              {previewWeek === 11
                ? "RIVALRY WEEK"
                : "ASSIGNED RIVALS THIS WEEK"}
            </strong>

            <span>
              {assignedRivalGames
                .map(
                  (matchup) =>
                    `${matchup.awayName} vs. ${matchup.homeName}`
                )
                .join(" · ")}
            </span>
          </div>
        )}

        {/* GAME OF THE WEEK */}

        {gameOfTheWeek && (
          <article className="featured-matchup">

            <div className="featured-matchup-labels">
              <span>
                GAME OF THE WEEK
              </span>

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
                <h3>
                  {gameOfTheWeek.awayName}
                </h3>

                <span>
                  {formatRecord(
                    gameOfTheWeek.awayStanding?.wins,
                    gameOfTheWeek.awayStanding?.losses,
                    gameOfTheWeek.awayStanding?.ties
                  )}
                  {" · "}
                  Seed #
                  {gameOfTheWeek.awayStanding?.playoffSeed ||
                    "—"}
                </span>
              </div>

              <strong className="featured-vs">
                VS
              </strong>

              <div className="right">
                <h3>
                  {gameOfTheWeek.homeName}
                </h3>

                <span>
                  {formatRecord(
                    gameOfTheWeek.homeStanding?.wins,
                    gameOfTheWeek.homeStanding?.losses,
                    gameOfTheWeek.homeStanding?.ties
                  )}
                  {" · "}
                  Seed #
                  {gameOfTheWeek.homeStanding?.playoffSeed ||
                    "—"}
                </span>
              </div>

            </div>

            <p className="featured-analysis">
              {gameOfWeekAnalysis(
                gameOfTheWeek
              )}
            </p>

            <div className="featured-meta">

              {gotwSeries && (
                <span>
                  <strong>
                    SERIES
                  </strong>{" "}
                  {gotwSeries}
                </span>
              )}

              {gotwStreaks.length > 0 && (
                <span>
                  <strong>
                    STREAKS
                  </strong>{" "}
                  {gotwStreaks.join(" · ")}
                </span>
              )}

            </div>

          </article>
        )}

        {/* REST OF WEEK */}

        {rankedMatchups.length > 1 && (
          <div className="other-matchups">

            <div className="other-matchups-heading">
              THE REST OF WEEK {previewWeek}
            </div>

            {rankedMatchups
              .slice(1)
              .map((matchup) => (
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

                      <span>
                        {" "}vs{" "}
                      </span>

                      {formatRecord(
                        matchup.homeStanding?.wins,
                        matchup.homeStanding?.losses,
                        matchup.homeStanding?.ties
                      )}
                    </strong>

                  </div>

                  <p>
                    {matchupAnalysis(
                      matchup
                    )}
                  </p>

                  <div className="other-matchup-bottom">
                    <span>
                      Seeds #
                      {matchup.awayStanding?.playoffSeed ||
                        "—"}
                      {" / #"}
                      {matchup.homeStanding?.playoffSeed ||
                        "—"}
                    </span>

                    <span>
                      {formatScore(
                        matchup.awayStanding?.pointsFor
                      )}
                      {" PF · "}
                      {formatScore(
                        matchup.homeStanding?.pointsFor
                      )}
                      {" PF"}
                    </span>
                  </div>

                </article>
              ))}

          </div>
        )}

      </section>

      {/* ===================================================
          ROAD MAP
          =================================================== */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              LEAGUE FOOTPRINT
            </p>

            <h2>
              The Dirty P Road Map
            </h2>
          </div>

          <span>
            Where the League Has Been
          </span>
        </div>

        <div className="owner-map-card">
          <img
            src="/The Dirty P Road Map.png"
            alt="The Dirty P Road Map"
            className="owner-map-image"
          />
        </div>
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
