import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";

export const dynamic = "force-dynamic";

// ======================================================
// HELPERS
// ======================================================

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

function formatRecord(wins, losses, ties = 0) {
  const w = num(wins);
  const l = num(losses);
  const t = num(ties);

  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getOwnerName(ownerMap, ownerId) {
  return (
    ownerMap.get(Number(ownerId)) ||
    "Unknown Owner"
  );
}

function formatWeek(season, week) {
  return `${season} · Week ${week}`;
}

function formatStreakRange(start, end) {
  return (
    `${start.season} Week ${start.week}` +
    ` – ${end.season} Week ${end.week}`
  );
}

// ======================================================
// GAME CLASSIFICATION
//
// Important:
// Third-place games count as PLAYOFF games,
// not consolation games.
//
// This check comes before all other classification
// because some ESPN third-place games are labeled
// WINNERS_CONSOLATION_LADDER.
// ======================================================

function getGameType(game) {
  const type = normalize(game.matchup_type);
  const tier = normalize(game.playoff_tier);

  // THIRD PLACE ALWAYS COUNTS AS PLAYOFF

  if (
    game.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("3rd_place") ||
    type.includes("bronze")
  ) {
    return "playoff";
  }

  // ACTUAL CONSOLATION GAMES

  if (
    game.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    type.includes("toilet") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet")
  ) {
    return "consolation";
  }

  // PLAYOFF BRACKET

  if (
    game.is_playoff === true ||
    game.is_championship === true ||
    type.includes("playoff") ||
    type.includes("semifinal") ||
    type.includes("semi_final") ||
    type.includes("championship") ||
    tier.includes("winner") ||
    tier.includes("championship")
  ) {
    return "playoff";
  }

  return "regular";
}

// ======================================================
// VALID SCORES AND COMPLETED GAMES
//
// Never treat missing scores as zero.
// Never count unfinished games.
// ======================================================

function hasValidScores(game) {
  return (
    hasNumber(game.home_score) &&
    hasNumber(game.away_score) &&
    num(game.home_score) >= 0 &&
    num(game.away_score) >= 0
  );
}

function hasOfficialWinner(game) {
  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  return ["HOME", "AWAY", "TIE"].includes(winner);
}

function isExplicitlyFinal(game) {
  return (
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "")
      .trim()
      .toUpperCase() === "FINAL"
  );
}

function gameIdentity(game) {
  return [
    num(game.season_year),
    num(game.matchup_period),
    num(game.home_owner_id),
    num(game.away_owner_id),
  ].join(":");
}

function isCompletedGame(
  game,
  currentSeason,
  completedKeys
) {
  if (!hasValidScores(game)) {
    return false;
  }

  const home = num(game.home_score);
  const away = num(game.away_score);

  // Prevent unplayed 0-0 placeholders from
  // appearing as historical scoring records.

  if (home === 0 && away === 0) {
    return false;
  }

  if (
    isExplicitlyFinal(game) ||
    hasOfficialWinner(game) ||
    completedKeys.has(gameIdentity(game))
  ) {
    return true;
  }

  // Historical imports may lack a final flag.
  // Preserve the original fallback only for
  // seasons that are already finished.

  if (num(game.season_year) < num(currentSeason)) {
    return home !== 0 || away !== 0;
  }

  return false;
}

// ======================================================
// MATCHUP SIDES
// ======================================================

function gameSides(game) {
  const homeScore = num(game.home_score);
  const awayScore = num(game.away_score);

  return [
    {
      side: "HOME",
      ownerId: Number(game.home_owner_id),
      opponentOwnerId: Number(game.away_owner_id),
      teamName:
        game.home_team_name || "Unknown Team",
      opponentTeamName:
        game.away_team_name || "Unknown Team",
      score: homeScore,
      opponentScore: awayScore,
      season: num(game.season_year),
      week: num(game.matchup_period),
    },
    {
      side: "AWAY",
      ownerId: Number(game.away_owner_id),
      opponentOwnerId: Number(game.home_owner_id),
      teamName:
        game.away_team_name || "Unknown Team",
      opponentTeamName:
        game.home_team_name || "Unknown Team",
      score: awayScore,
      opponentScore: homeScore,
      season: num(game.season_year),
      week: num(game.matchup_period),
    },
  ];
}

function resultForSide(game, side) {
  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "TIE") {
    return "T";
  }

  if (winner === side) {
    return "W";
  }

  if (winner === "HOME" || winner === "AWAY") {
    return "L";
  }

  const home = num(game.home_score);
  const away = num(game.away_score);

  if (home === away) {
    return "T";
  }

  if (side === "HOME") {
    return home > away ? "W" : "L";
  }

  return away > home ? "W" : "L";
}

function winnerFromGame(game) {
  if (!game) return null;

  const sides = gameSides(game);

  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "HOME") {
    return sides[0];
  }

  if (winner === "AWAY") {
    return sides[1];
  }

  if (winner === "TIE") {
    return null;
  }

  if (sides[0].score === sides[1].score) {
    return null;
  }

  return sides[0].score > sides[1].score
    ? sides[0]
    : sides[1];
}

function loserFromGame(game) {
  if (!game) return null;

  const winner = winnerFromGame(game);

  if (!winner) {
    return null;
  }

  return gameSides(game).find(
    (side) => side.side !== winner.side
  );
}

function getWinPercentage(wins, losses, ties = 0) {
  const games = wins + losses + ties;

  if (!games) return 0;

  return (wins + ties * 0.5) / games;
}

function getMargin(game) {
  return Math.abs(
    num(game.home_score) -
    num(game.away_score)
  );
}

// ======================================================
// ACTUAL GAME SCORE DISPLAY
//
// Closest games display both teams' scores.
//
// Example:
//
// 124.36 – 124.34
// Reed Bushkuhl defeated Austin Lloyd
// Decided by 0.02 points
//
// We never display the margin alone as
// though it were a game score.
// ======================================================

function getScoreDisplay(game) {
  const winner = winnerFromGame(game);
  const loser = loserFromGame(game);

  if (!winner || !loser) {
    return `${formatScore(game.home_score)} – ${formatScore(
      game.away_score
    )}`;
  }

  return (
    `${formatScore(winner.score)}` +
    ` – ${formatScore(loser.score)}`
  );
}

function matchupDescription(game, ownerMap) {
  const winner = winnerFromGame(game);
  const loser = loserFromGame(game);

  if (!winner || !loser) {
    return "Matchup unavailable";
  }

  return (
    `${getOwnerName(ownerMap, winner.ownerId)}` +
    ` defeated ` +
    `${getOwnerName(ownerMap, loser.ownerId)}`
  );
}

// ======================================================
// SIMPLE RECORD CARD
//
// No Context or Detail boxes.
//
// Display:
// - Record title
// - Actual statistic
// - Owner or matchup
// - Helpful description and season
// ======================================================

function RecordCard({
  label,
  value,
  owner,
  team,
  note,
  subnote,
}) {
  return (
    <article className="owner-card dp-record-card">

      <div className="dp-record-content">

        <span className="owner-status">
          {label}
        </span>

        <h3 className="dp-record-value">
          {value}
        </h3>

        {owner && (
          <div className="dp-record-owner">
            {owner}
          </div>
        )}

        {team && (
          <p className="dp-record-team">
            {team}
          </p>
        )}

        {note && (
          <p className="dp-record-note">
            {note}
          </p>
        )}

        {subnote && (
          <p className="dp-record-subnote">
            {subnote}
          </p>
        )}

      </div>

    </article>
  );
}

// ======================================================
// RECORD SECTION
// ======================================================

function RecordSection({
  eyebrow,
  title,
  subtitle,
  children,
}) {
  return (
    <section className="owners-section">

      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {eyebrow}
          </p>

          <h2>{title}</h2>
        </div>

        {subtitle && (
          <span>{subtitle}</span>
        )}
      </div>

      <div className="owners-grid dp-record-grid">
        {children}
      </div>

    </section>
  );
}

// ======================================================
// RECORDS PAGE
// ======================================================

export default async function RecordsPage() {
  let leagueData;

  try {
    leagueData = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">

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

        <section className="owners-section">
          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">
                  DATA ERROR
                </span>

                <h3>Records</h3>

                <p className="owner-team-name">
                  {error?.message ||
                    "Unable to load league data."}
                </p>
              </div>
            </div>
          </article>
        </section>

      </main>
    );
  }

  const {
    currentSeason,
    owners = [],
    matchups = [],
    completedCurrentMatchups = [],
  } = leagueData;

  // ====================================================
  // OWNER LOOKUP
  // ====================================================

  const ownerMap = new Map(
    owners.map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  // ====================================================
  // COMPLETED MATCHUPS
  //
  // getLeagueData already includes completed
  // current-season matchups in matchups.
  //
  // Don't append the current games again.
  // ====================================================

  const completedKeys = new Set(
    completedCurrentMatchups.map(gameIdentity)
  );

  const completedGames = matchups.filter(
    (game) =>
      isCompletedGame(
        game,
        currentSeason,
        completedKeys
      )
  );

  const seasonYears = [
    ...new Set(
      completedGames.map(
        (game) => num(game.season_year)
      )
    ),
  ]
    .filter(
      (year) =>
        Number.isFinite(year) &&
        year >= 2014
    )
    .sort((a, b) => a - b);

  const firstSeason =
    seasonYears[0] || 2014;

  const latestSeason =
    seasonYears[seasonYears.length - 1] ||
    currentSeason;

  const currentCompletedWeeks =
    completedCurrentMatchups
      .filter((game) =>
        isCompletedGame(
          game,
          currentSeason,
          completedKeys
        )
      )
      .map((game) =>
        num(game.matchup_period)
      )
      .filter((week) => week > 0);

  const latestCompletedWeek =
    currentCompletedWeeks.length
      ? Math.max(...currentCompletedWeeks)
      : 0;

  // ====================================================
  // GAME CATEGORIES
  // ====================================================

  const regularGames = completedGames.filter(
    (game) =>
      getGameType(game) === "regular"
  );

  const playoffGames = completedGames.filter(
    (game) =>
      getGameType(game) === "playoff"
  );

  const consolationGames = completedGames.filter(
    (game) =>
      getGameType(game) === "consolation"
  );

  // Official record book includes regular-season
  // and playoff games, but not consolation games.

  const officialGames = [
    ...regularGames,
    ...playoffGames,
  ];

  const championshipGames = playoffGames.filter(
    (game) =>
      game.is_championship === true ||
      normalize(game.matchup_type) ===
        "championship" ||
      normalize(game.matchup_type) ===
        "championship_game" ||
      normalize(game.matchup_type) ===
        "title_game"
  );

  const regularSides =
    regularGames.flatMap(gameSides);

  const playoffSides =
    playoffGames.flatMap(gameSides);

  const consolationSides =
    consolationGames.flatMap(gameSides);

  const officialSides =
    officialGames.flatMap(gameSides);

  // ====================================================
  // WEEKLY RECORDS
  // ====================================================

  const highestRegularScore = [...regularSides]
    .sort((a, b) => b.score - a.score)[0];

  const lowestRegularScore = [...regularSides]
    .filter((side) => side.score > 0)
    .sort((a, b) => a.score - b.score)[0];

  const highestOverallScore = [...officialSides]
    .sort((a, b) => b.score - a.score)[0];

  const highestPlayoffScore = [...playoffSides]
    .sort((a, b) => b.score - a.score)[0];

  const highestConsolationScore = [
    ...consolationSides,
  ].sort((a, b) => b.score - a.score)[0];

  const regularDecisions = regularGames
    .filter((game) => winnerFromGame(game))
    .map((game) => ({
      game,
      margin: getMargin(game),
    }));

  const biggestRegularWin = [...regularDecisions]
    .sort((a, b) => b.margin - a.margin)[0];

  const closestRegularGame = [...regularDecisions]
    .sort((a, b) => a.margin - b.margin)[0];

  const biggestWinWinner = biggestRegularWin
    ? winnerFromGame(biggestRegularWin.game)
    : null;

  const closestWinner = closestRegularGame
    ? winnerFromGame(closestRegularGame.game)
    : null;

  // ====================================================
  // SINGLE-SEASON STATS
  // ====================================================

  const seasonStats = new Map();

  for (const game of regularGames) {
    for (const side of gameSides(game)) {
      const key =
        `${side.season}-${side.ownerId}`;

      if (!seasonStats.has(key)) {
        seasonStats.set(key, {
          season: side.season,
          ownerId: side.ownerId,
          teamName: side.teamName,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          games: 0,
        });
      }

      const stat = seasonStats.get(key);
      const result = resultForSide(
        game,
        side.side
      );

      stat.games++;
      stat.pointsFor += side.score;
      stat.pointsAgainst += side.opponentScore;

      if (result === "W") stat.wins++;
      if (result === "L") stat.losses++;
      if (result === "T") stat.ties++;
    }
  }

  const seasonRows = [
    ...seasonStats.values(),
  ].map((row) => ({
    ...row,
    winPct: getWinPercentage(
      row.wins,
      row.losses,
      row.ties
    ),
    average: row.games
      ? row.pointsFor / row.games
      : 0,
  }));

  const mostWinsSeason = [...seasonRows].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.winPct - a.winPct
  )[0];

  const bestSeasonRecord = [...seasonRows].sort(
    (a, b) =>
      b.winPct - a.winPct ||
      b.wins - a.wins ||
      b.pointsFor - a.pointsFor
  )[0];

  const mostPointsSeason = [...seasonRows].sort(
    (a, b) =>
      b.pointsFor - a.pointsFor
  )[0];

  const bestAverageSeason = [...seasonRows].sort(
    (a, b) => b.average - a.average
  )[0];

  // ====================================================
  // CAREER REGULAR-SEASON STATS
  // ====================================================

  const careerStats = new Map();

  for (const game of regularGames) {
    for (const side of gameSides(game)) {
      if (!careerStats.has(side.ownerId)) {
        careerStats.set(side.ownerId, {
          ownerId: side.ownerId,
          wins: 0,
          losses: 0,
          ties: 0,
          games: 0,
          pointsFor: 0,
          seasons: new Set(),
        });
      }

      const stat =
        careerStats.get(side.ownerId);

      const result = resultForSide(
        game,
        side.side
      );

      stat.games++;
      stat.pointsFor += side.score;
      stat.seasons.add(side.season);

      if (result === "W") stat.wins++;
      if (result === "L") stat.losses++;
      if (result === "T") stat.ties++;
    }
  }

  const careerRows = [
    ...careerStats.values(),
  ].map((row) => ({
    ...row,
    winPct: getWinPercentage(
      row.wins,
      row.losses,
      row.ties
    ),
  }));

  const mostCareerWins = [...careerRows].sort(
    (a, b) => b.wins - a.wins
  )[0];

  const mostCareerPoints = [...careerRows].sort(
    (a, b) => b.pointsFor - a.pointsFor
  )[0];

  const bestCareerWinPct = [...careerRows]
    .filter((row) => row.games >= 20)
    .sort(
      (a, b) =>
        b.winPct - a.winPct ||
        b.wins - a.wins
    )[0];

  // ====================================================
  // PLAYOFF CAREER RECORDS
  //
  // Includes third-place games.
  // ====================================================

  const playoffStats = new Map();

  for (const game of playoffGames) {
    for (const side of gameSides(game)) {
      if (!playoffStats.has(side.ownerId)) {
        playoffStats.set(side.ownerId, {
          ownerId: side.ownerId,
          wins: 0,
          losses: 0,
          ties: 0,
        });
      }

      const stat =
        playoffStats.get(side.ownerId);

      const result = resultForSide(
        game,
        side.side
      );

      if (result === "W") stat.wins++;
      if (result === "L") stat.losses++;
      if (result === "T") stat.ties++;
    }
  }

  const mostPlayoffWins = [
    ...playoffStats.values(),
  ].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses
  )[0];

  // ====================================================
  // CHAMPIONSHIP RECORDS
  // ====================================================

  const championshipDetails =
    championshipGames.map((game) => {
      const sides = gameSides(game);

      const winnerSide =
        winnerFromGame(game);

      const homeScore =
        num(game.home_score);

      const awayScore =
        num(game.away_score);

      return {
        game,
        sides,
        winnerSide,
        margin: Math.abs(
          homeScore - awayScore
        ),
        combined:
          homeScore + awayScore,
        highScore: Math.max(
          homeScore,
          awayScore
        ),
        highScoreSide:
          homeScore >= awayScore
            ? sides[0]
            : sides[1],
      };
    });

  const decidedChampionships =
    championshipDetails.filter(
      (item) => item.winnerSide
    );

  const closestChampionship = [
    ...decidedChampionships,
  ].sort(
    (a, b) =>
      a.margin - b.margin
  )[0];

  const biggestChampionship = [
    ...decidedChampionships,
  ].sort(
    (a, b) =>
      b.margin - a.margin
  )[0];

  const highestChampionshipScore = [
    ...championshipDetails,
  ].sort(
    (a, b) =>
      b.highScore - a.highScore
  )[0];

  const highestCombinedChampionship = [
    ...championshipDetails,
  ].sort(
    (a, b) =>
      b.combined - a.combined
  )[0];

  // ====================================================
  // REGULAR-SEASON STREAKS
  // ====================================================

  const gamesByOwner = new Map();

  for (const game of regularGames) {
    for (const side of gameSides(game)) {
      if (!gamesByOwner.has(side.ownerId)) {
        gamesByOwner.set(side.ownerId, []);
      }

      gamesByOwner.get(side.ownerId).push({
        season: side.season,
        week: side.week,
        result: resultForSide(
          game,
          side.side
        ),
      });
    }
  }

  let longestWinStreak = null;
  let longestLossStreak = null;

  for (const [ownerId, games] of gamesByOwner) {
    games.sort(
      (a, b) =>
        a.season - b.season ||
        a.week - b.week
    );

    let currentWins = 0;
    let currentLosses = 0;

    let winStart = null;
    let lossStart = null;

    for (const game of games) {
      if (game.result === "W") {
        if (currentWins === 0) {
          winStart = {
            season: game.season,
            week: game.week,
          };
        }

        currentWins++;
        currentLosses = 0;
        lossStart = null;

        if (
          !longestWinStreak ||
          currentWins > longestWinStreak.count
        ) {
          longestWinStreak = {
            ownerId,
            count: currentWins,
            start: winStart,
            end: {
              season: game.season,
              week: game.week,
            },
          };
        }
      } else if (game.result === "L") {
        if (currentLosses === 0) {
          lossStart = {
            season: game.season,
            week: game.week,
          };
        }

        currentLosses++;
        currentWins = 0;
        winStart = null;

        if (
          !longestLossStreak ||
          currentLosses > longestLossStreak.count
        ) {
          longestLossStreak = {
            ownerId,
            count: currentLosses,
            start: lossStart,
            end: {
              season: game.season,
              week: game.week,
            },
          };
        }
      } else {
        currentWins = 0;
        currentLosses = 0;
        winStart = null;
        lossStart = null;
      }
    }
  }

  // ====================================================
  // PAGE
  // ====================================================

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
            THE LEAGUE RECORD BOOK
          </p>

          <h1>Records</h1>

          <p>
            The biggest performances, strongest
            seasons, career leaders, playoff
            records, and longest streaks
            in Dirty P history.
          </p>

        </div>

        <div className="owners-count">
          <strong>
            {seasonYears.length}
          </strong>

          <span>SEASONS</span>
        </div>
      </section>

      {/* PAGE NAV */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          {latestCompletedWeek > 0
            ? `Through ${currentSeason} Week ${latestCompletedWeek}`
            : `${firstSeason}–${latestSeason}`}
        </span>

      </nav>

      {/* ==================================================
          WEEKLY RECORDS
          ================================================== */}

      <RecordSection
        eyebrow="SINGLE GAME"
        title="Weekly Records"
        subtitle="Updated after every completed week"
      >

        {highestRegularScore && (
          <RecordCard
            label="HIGHEST REGULAR-SEASON SCORE"
            value={formatScore(
              highestRegularScore.score
            )}
            owner={getOwnerName(
              ownerMap,
              highestRegularScore.ownerId
            )}
            team={highestRegularScore.teamName}
            note={formatWeek(
              highestRegularScore.season,
              highestRegularScore.week
            )}
          />
        )}

        {lowestRegularScore && (
          <RecordCard
            label="LOWEST REGULAR-SEASON SCORE"
            value={formatScore(
              lowestRegularScore.score
            )}
            owner={getOwnerName(
              ownerMap,
              lowestRegularScore.ownerId
            )}
            team={lowestRegularScore.teamName}
            note={formatWeek(
              lowestRegularScore.season,
              lowestRegularScore.week
            )}
          />
        )}

        {highestOverallScore && (
          <RecordCard
            label="HIGHEST SCORE · ANY OFFICIAL GAME"
            value={formatScore(
              highestOverallScore.score
            )}
            owner={getOwnerName(
              ownerMap,
              highestOverallScore.ownerId
            )}
            team={highestOverallScore.teamName}
            note={formatWeek(
              highestOverallScore.season,
              highestOverallScore.week
            )}
          />
        )}

        {biggestRegularWin && biggestWinWinner && (
          <RecordCard
            label="BIGGEST REGULAR-SEASON WIN"
            value={`+${formatScore(
              biggestRegularWin.margin
            )}`}
            owner={getOwnerName(
              ownerMap,
              biggestWinWinner.ownerId
            )}
            team={matchupDescription(
              biggestRegularWin.game,
              ownerMap
            )}
            note={getScoreDisplay(
              biggestRegularWin.game
            )}
            subnote={formatWeek(
              biggestRegularWin.game.season_year,
              biggestRegularWin.game.matchup_period
            )}
          />
        )}

        {closestRegularGame && closestWinner && (
          <RecordCard
            label="CLOSEST REGULAR-SEASON GAME"
            value={getScoreDisplay(
              closestRegularGame.game
            )}
            owner={matchupDescription(
              closestRegularGame.game,
              ownerMap
            )}
            note={formatWeek(
              closestRegularGame.game.season_year,
              closestRegularGame.game.matchup_period
            )}
            subnote={`Decided by ${formatScore(
              closestRegularGame.margin
            )} points`}
          />
        )}

      </RecordSection>

      {/* ==================================================
          SEASON RECORDS
          ================================================== */}

      <RecordSection
        eyebrow="SINGLE SEASON"
        title="Season Records"
        subtitle={`${currentSeason} included live`}
      >

        {bestSeasonRecord && (
          <RecordCard
            label="BEST REGULAR-SEASON RECORD"
            value={formatRecord(
              bestSeasonRecord.wins,
              bestSeasonRecord.losses,
              bestSeasonRecord.ties
            )}
            owner={getOwnerName(
              ownerMap,
              bestSeasonRecord.ownerId
            )}
            team={bestSeasonRecord.teamName}
            note={`${bestSeasonRecord.season} Season`}
            subnote={`${(
              bestSeasonRecord.winPct * 100
            ).toFixed(1)}% winning percentage`}
          />
        )}

        {mostWinsSeason && (
          <RecordCard
            label="MOST REGULAR-SEASON WINS"
            value={`${mostWinsSeason.wins}`}
            owner={getOwnerName(
              ownerMap,
              mostWinsSeason.ownerId
            )}
            team={mostWinsSeason.teamName}
            note={`${mostWinsSeason.season} Season`}
          />
        )}

        {mostPointsSeason && (
          <RecordCard
            label="MOST REGULAR-SEASON POINTS"
            value={formatScore(
              mostPointsSeason.pointsFor
            )}
            owner={getOwnerName(
              ownerMap,
              mostPointsSeason.ownerId
            )}
            team={mostPointsSeason.teamName}
            note={`${mostPointsSeason.season} Season`}
          />
        )}

        {bestAverageSeason && (
          <RecordCard
            label="HIGHEST POINTS PER GAME"
            value={formatScore(
              bestAverageSeason.average
            )}
            owner={getOwnerName(
              ownerMap,
              bestAverageSeason.ownerId
            )}
            team={bestAverageSeason.teamName}
            note={`${bestAverageSeason.season} Season`}
          />
        )}

      </RecordSection>

      {/* ==================================================
          CAREER RECORDS
          ================================================== */}

      <RecordSection
        eyebrow="ALL-TIME"
        title="Career Records"
        subtitle={`Through ${currentSeason}`}
      >

        {mostCareerWins && (
          <RecordCard
            label="MOST REGULAR-SEASON WINS"
            value={`${mostCareerWins.wins}`}
            owner={getOwnerName(
              ownerMap,
              mostCareerWins.ownerId
            )}
            note={formatRecord(
              mostCareerWins.wins,
              mostCareerWins.losses,
              mostCareerWins.ties
            )}
          />
        )}

        {bestCareerWinPct && (
          <RecordCard
            label="BEST CAREER WIN %"
            value={`${(
              bestCareerWinPct.winPct * 100
            ).toFixed(1)}%`}
            owner={getOwnerName(
              ownerMap,
              bestCareerWinPct.ownerId
            )}
            note={formatRecord(
              bestCareerWinPct.wins,
              bestCareerWinPct.losses,
              bestCareerWinPct.ties
            )}
            subnote="Minimum 20 regular-season games"
          />
        )}

        {mostCareerPoints && (
          <RecordCard
            label="MOST CAREER REGULAR-SEASON POINTS"
            value={formatScore(
              mostCareerPoints.pointsFor
            )}
            owner={getOwnerName(
              ownerMap,
              mostCareerPoints.ownerId
            )}
            note={`${mostCareerPoints.seasons.size} Seasons`}
          />
        )}

        {mostPlayoffWins && (
          <RecordCard
            label="MOST PLAYOFF WINS"
            value={`${mostPlayoffWins.wins}`}
            owner={getOwnerName(
              ownerMap,
              mostPlayoffWins.ownerId
            )}
            note={formatRecord(
              mostPlayoffWins.wins,
              mostPlayoffWins.losses,
              mostPlayoffWins.ties
            )}
            subnote="Includes third-place games"
          />
        )}

      </RecordSection>

      {/* ==================================================
          PLAYOFF RECORDS
          ================================================== */}

      <RecordSection
        eyebrow="POSTSEASON"
        title="Playoff Records"
      >

        {highestPlayoffScore && (
          <RecordCard
            label="HIGHEST PLAYOFF SCORE"
            value={formatScore(
              highestPlayoffScore.score
            )}
            owner={getOwnerName(
              ownerMap,
              highestPlayoffScore.ownerId
            )}
            team={highestPlayoffScore.teamName}
            note={formatWeek(
              highestPlayoffScore.season,
              highestPlayoffScore.week
            )}
          />
        )}

        {highestChampionshipScore && (
          <RecordCard
            label="HIGHEST CHAMPIONSHIP SCORE"
            value={formatScore(
              highestChampionshipScore.highScore
            )}
            owner={getOwnerName(
              ownerMap,
              highestChampionshipScore
                .highScoreSide.ownerId
            )}
            team={
              highestChampionshipScore
                .highScoreSide.teamName
            }
            note={`${highestChampionshipScore.game.season_year} Championship`}
          />
        )}

        {closestChampionship && (
          <RecordCard
            label="CLOSEST CHAMPIONSHIP"
            value={getScoreDisplay(
              closestChampionship.game
            )}
            owner={matchupDescription(
              closestChampionship.game,
              ownerMap
            )}
            note={`${closestChampionship.game.season_year} Championship`}
            subnote={`Decided by ${formatScore(
              closestChampionship.margin
            )} points`}
          />
        )}

        {biggestChampionship && (
          <RecordCard
            label="BIGGEST CHAMPIONSHIP WIN"
            value={`+${formatScore(
              biggestChampionship.margin
            )}`}
            owner={matchupDescription(
              biggestChampionship.game,
              ownerMap
            )}
            note={getScoreDisplay(
              biggestChampionship.game
            )}
            subnote={`${biggestChampionship.game.season_year} Championship`}
          />
        )}

        {highestCombinedChampionship && (
          <RecordCard
            label="HIGHEST-SCORING CHAMPIONSHIP"
            value={formatScore(
              highestCombinedChampionship.combined
            )}
            owner={matchupDescription(
              highestCombinedChampionship.game,
              ownerMap
            )}
            note={getScoreDisplay(
              highestCombinedChampionship.game
            )}
            subnote={`${highestCombinedChampionship.game.season_year} Championship`}
          />
        )}

      </RecordSection>

      {/* ==================================================
          HISTORIC STREAKS
          ================================================== */}

      <RecordSection
        eyebrow="STREAKS"
        title="Historic Streaks"
        subtitle="Includes current streaks"
      >

        {longestWinStreak && (
          <RecordCard
            label="LONGEST REGULAR-SEASON WIN STREAK"
            value={`${longestWinStreak.count} Games`}
            owner={getOwnerName(
              ownerMap,
              longestWinStreak.ownerId
            )}
            note={formatStreakRange(
              longestWinStreak.start,
              longestWinStreak.end
            )}
          />
        )}

        {longestLossStreak && (
          <RecordCard
            label="LONGEST REGULAR-SEASON LOSING STREAK"
            value={`${longestLossStreak.count} Games`}
            owner={getOwnerName(
              ownerMap,
              longestLossStreak.ownerId
            )}
            note={formatStreakRange(
              longestLossStreak.start,
              longestLossStreak.end
            )}
          />
        )}

      </RecordSection>

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

      {/* RECORD PAGE STYLES */}

      <style>{`
        .dp-record-grid {
          align-items: stretch;
        }

        .dp-record-card {
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          min-width: 0;
          overflow: hidden;
          height: 100%;
        }

        .dp-record-content {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 9px;
          min-width: 0;
          padding: 21px;
        }

        .dp-record-card .owner-status {
          display: block;
          color: #d8b475;
          font-size: 10px;
          letter-spacing: 1px;
          line-height: 1.5;
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .dp-record-value {
          margin: 5px 0 2px;
          color: #f4f6f9;
          font-size: clamp(21px, 3vw, 31px);
          font-weight: 900;
          line-height: 1.2;
          letter-spacing: -0.5px;
          font-variant-numeric: tabular-nums;
          overflow-wrap: anywhere;
        }

        .dp-record-owner {
          color: #f0f2f6;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .dp-record-team {
          margin: 0;
          color: #9caaba;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .dp-record-note {
          margin: 4px 0 0;
          color: #d5b477;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.5;
        }

        .dp-record-subnote {
          margin: 0;
          color: #98a6b6;
          font-size: 11px;
          line-height: 1.5;
        }

        @media (max-width: 600px) {
          .dp-record-content {
            padding: 17px;
          }

          .dp-record-value {
            font-size: 24px;
          }
        }
      `}</style>

    </main>
  );
}
