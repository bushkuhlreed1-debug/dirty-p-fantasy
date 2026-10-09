
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

function formatScore(value) {
  return num(value).toFixed(2);
}

function formatRecord(wins, losses, ties = 0) {
  const w = num(wins);
  const l = num(losses);
  const t = num(ties);

  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function getOwnerName(ownerMap, ownerId) {
  return (
    ownerMap.get(Number(ownerId)) ||
    "Unknown Owner"
  );
}

function getGameType(game) {
  const type = String(
    game.matchup_type || ""
  ).trim().toLowerCase();

  const tier = String(
    game.playoff_tier || ""
  ).trim().toLowerCase();

  // Consolation takes precedence over playoff flags.
  if (
    game.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet")
  ) {
    return "consolation";
  }

  if (
    game.is_playoff === true ||
    game.is_championship === true ||
    game.is_third_place === true ||
    type.includes("playoff") ||
    type.includes("championship") ||
    type.includes("third_place") ||
    tier.includes("winner") ||
    tier.includes("championship")
  ) {
    return "playoff";
  }

  return "regular";
}

function hasValidScores(game) {
  if (
    game.home_score === null ||
    game.home_score === undefined ||
    game.home_score === "" ||
    game.away_score === null ||
    game.away_score === undefined ||
    game.away_score === ""
  ) {
    return false;
  }

  return (
    Number.isFinite(Number(game.home_score)) &&
    Number.isFinite(Number(game.away_score))
  );
}

function hasOfficialWinner(game) {
  const winner = String(
    game.winner || ""
  ).trim().toUpperCase();

  return ["HOME", "AWAY", "TIE"].includes(winner);
}

function isCompletedGame(game, currentSeason, completedKeys) {
  if (!hasValidScores(game)) return false;

  if (
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "").toUpperCase() === "FINAL" ||
    hasOfficialWinner(game)
  ) {
    return true;
  }

  const key = gameIdentity(game);

  if (completedKeys.has(key)) return true;

  // Historical imported matchups may not have a
  // completed flag, so use nonzero recorded scores.
  if (num(game.season_year) < num(currentSeason)) {
    return (
      num(game.home_score) !== 0 ||
      num(game.away_score) !== 0
    );
  }

  return false;
}

function gameIdentity(game) {
  return [
    num(game.season_year),
    num(game.matchup_period),
    num(game.home_owner_id),
    num(game.away_owner_id),
  ].join(":");
}

function gameSides(game) {
  return [
    {
      side: "HOME",
      ownerId: Number(game.home_owner_id),
      opponentOwnerId: Number(game.away_owner_id),
      teamName:
        game.home_team_name || "Unknown Team",
      opponentTeamName:
        game.away_team_name || "Unknown Team",
      score: num(game.home_score),
      opponentScore: num(game.away_score),
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
      score: num(game.away_score),
      opponentScore: num(game.home_score),
      season: num(game.season_year),
      week: num(game.matchup_period),
    },
  ];
}

function resultForSide(game, side) {
  const winner = String(
    game.winner || ""
  ).trim().toUpperCase();

  if (winner === "TIE") return "T";

  if (winner === side) return "W";

  if (winner === "HOME" || winner === "AWAY") {
    return "L";
  }

  const home = num(game.home_score);
  const away = num(game.away_score);

  if (home === away) return "T";

  if (side === "HOME") {
    return home > away ? "W" : "L";
  }

  return away > home ? "W" : "L";
}

function winnerFromGame(game) {
  if (!game) return null;

  const sides = gameSides(game);

  const winner = String(
    game.winner || ""
  ).toUpperCase();

  if (winner === "HOME") return sides[0];
  if (winner === "AWAY") return sides[1];
  if (winner === "TIE") return null;

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

  if (!winner) return null;

  return gameSides(game).find(
    (side) => side.side !== winner.side
  );
}

function getWinPercentage(wins, losses, ties = 0) {
  const games = wins + losses + ties;

  if (!games) return 0;

  return (wins + ties * 0.5) / games;
}

// ======================================================
// RECORD CARD
// ======================================================

function RecordCard({
  label,
  value,
  owner,
  team,
  detail,
  opponent,
}) {
  return (
    <article className="owner-card">
      <div className="owner-card-top">
        <div>
          <span className="owner-status">
            {label}
          </span>

          <h3>{value}</h3>

          <p className="owner-team-name">
            {owner}
          </p>
        </div>
      </div>

      <div className="owner-record">
        <div>
          <strong>{team || "Career"}</strong>
          <span>CONTEXT</span>
        </div>

        <div>
          <strong>{detail || "—"}</strong>
          <span>DETAIL</span>
        </div>
      </div>

      <div className="owner-card-bottom">
        <span>
          {opponent || "Dirty P Fantasy Football"}
        </span>

        <strong>RECORD BOOK</strong>
      </div>
    </article>
  );
}

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
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>

        {subtitle && <span>{subtitle}</span>}
      </div>

      <div className="owners-grid">
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
  // ====================================================

  const completedKeys = new Set(
    completedCurrentMatchups.map(gameIdentity)
  );

  const completedGames = matchups.filter((game) =>
    isCompletedGame(
      game,
      currentSeason,
      completedKeys
    )
  );

  const seasonYears = [
    ...new Set(
      completedGames.map(
        (game) => Number(game.season_year)
      )
    ),
  ]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const firstSeason = seasonYears[0] || 2014;
  const latestSeason =
    seasonYears[seasonYears.length - 1] ||
    currentSeason;

  const currentCompletedWeeks =
    completedCurrentMatchups
      .map((game) => num(game.matchup_period))
      .filter((week) => week > 0);

  const latestCompletedWeek =
    currentCompletedWeeks.length
      ? Math.max(...currentCompletedWeeks)
      : 0;

  // ====================================================
  // GAME CATEGORIES
  // ====================================================

  const regularGames = completedGames.filter(
    (game) => getGameType(game) === "regular"
  );

  const playoffGames = completedGames.filter(
    (game) => getGameType(game) === "playoff"
  );

  const consolationGames = completedGames.filter(
    (game) => getGameType(game) === "consolation"
  );

  const officialGames = [
    ...regularGames,
    ...playoffGames,
  ];

  const championshipGames = playoffGames.filter(
    (game) => game.is_championship === true
  );

  const regularSides = regularGames.flatMap(gameSides);
  const playoffSides = playoffGames.flatMap(gameSides);
  const consolationSides =
    consolationGames.flatMap(gameSides);

  const officialSides = officialGames.flatMap(gameSides);

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

  const highestConsolationScore = [...consolationSides]
    .sort((a, b) => b.score - a.score)[0];

  const regularDecisions = regularGames
    .filter((game) => winnerFromGame(game))
    .map((game) => ({
      game,
      margin: Math.abs(
        num(game.home_score) -
        num(game.away_score)
      ),
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

  const closestLoser = closestRegularGame
    ? loserFromGame(closestRegularGame.game)
    : null;

  // ====================================================
  // SINGLE-SEASON STATS
  // ====================================================

  const seasonStats = new Map();

  for (const game of regularGames) {
    for (const side of gameSides(game)) {
      const key = `${side.season}-${side.ownerId}`;

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
      const result = resultForSide(game, side.side);

      stat.games++;
      stat.pointsFor += side.score;
      stat.pointsAgainst += side.opponentScore;

      if (result === "W") stat.wins++;
      if (result === "L") stat.losses++;
      if (result === "T") stat.ties++;
    }
  }

  const seasonRows = [...seasonStats.values()].map(
    (row) => ({
      ...row,
      winPct: getWinPercentage(
        row.wins,
        row.losses,
        row.ties
      ),
      average: row.games
        ? row.pointsFor / row.games
        : 0,
    })
  );

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
    (a, b) => b.pointsFor - a.pointsFor
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

      const stat = careerStats.get(side.ownerId);
      const result = resultForSide(game, side.side);

      stat.games++;
      stat.pointsFor += side.score;
      stat.seasons.add(side.season);

      if (result === "W") stat.wins++;
      if (result === "L") stat.losses++;
      if (result === "T") stat.ties++;
    }
  }

  const careerRows = [...careerStats.values()].map(
    (row) => ({
      ...row,
      winPct: getWinPercentage(
        row.wins,
        row.losses,
        row.ties
      ),
    })
  );

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
  // PLAYOFF CAREER STATS
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

      const stat = playoffStats.get(side.ownerId);
      const result = resultForSide(game, side.side);

      if (result === "W") stat.wins++;
      if (result === "L") stat.losses++;
      if (result === "T") stat.ties++;
    }
  }

  const mostPlayoffWins = [...playoffStats.values()]
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        a.losses - b.losses
    )[0];

  // ====================================================
  // CHAMPIONSHIP RECORDS
  // ====================================================

  const championshipDetails = championshipGames
    .map((game) => {
      const sides = gameSides(game);
      const winnerSide = winnerFromGame(game);

      const homeScore = num(game.home_score);
      const awayScore = num(game.away_score);

      return {
        game,
        sides,
        winnerSide,
        margin: Math.abs(homeScore - awayScore),
        combined: homeScore + awayScore,
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

  const closestChampionship =
    [...decidedChampionships].sort(
      (a, b) => a.margin - b.margin
    )[0];

  const biggestChampionship =
    [...decidedChampionships].sort(
      (a, b) => b.margin - a.margin
    )[0];

  const highestChampionshipScore =
    [...championshipDetails].sort(
      (a, b) => b.highScore - a.highScore
    )[0];

  const highestCombinedChampionship =
    [...championshipDetails].sort(
      (a, b) => b.combined - a.combined
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
        result: resultForSide(game, side.side),
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
  // RENDER
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
            LIVE LEAGUE RECORD BOOK
          </p>

          <h1>Records</h1>

          <p>
            The biggest scores, strongest seasons,
            career leaders, postseason performances,
            and longest streaks in Dirty P history.
          </p>
        </div>

        <div className="owners-count">
          <strong>
            {seasonYears.length}
          </strong>

          <span>SEASONS</span>
        </div>
      </section>

      {/* NAV */}

      <nav className="page-nav">
        <Link href="/">← Home</Link>

        <span>
          {latestCompletedWeek > 0
            ? `Through ${currentSeason} Week ${latestCompletedWeek}`
            : `${firstSeason}–${latestSeason}`}
        </span>
      </nav>

      {/* WEEKLY RECORDS */}

      <RecordSection
        eyebrow="SINGLE GAME"
        title="Weekly Records"
        subtitle="Updated after every completed week"
      >
        {highestRegularScore && (
          <RecordCard
            label="HIGHEST REGULAR-SEASON SCORE"
            value={formatScore(highestRegularScore.score)}
            owner={getOwnerName(
              ownerMap,
              highestRegularScore.ownerId
            )}
            team={highestRegularScore.teamName}
            detail={`${highestRegularScore.season} · Week ${highestRegularScore.week}`}
          />
        )}

        {lowestRegularScore && (
          <RecordCard
            label="LOWEST REGULAR-SEASON SCORE"
            value={formatScore(lowestRegularScore.score)}
            owner={getOwnerName(
              ownerMap,
              lowestRegularScore.ownerId
            )}
            team={lowestRegularScore.teamName}
            detail={`${lowestRegularScore.season} · Week ${lowestRegularScore.week}`}
          />
        )}

        {highestOverallScore && (
          <RecordCard
            label="HIGHEST SCORE · ANY OFFICIAL GAME"
            value={formatScore(highestOverallScore.score)}
            owner={getOwnerName(
              ownerMap,
              highestOverallScore.ownerId
            )}
            team={highestOverallScore.teamName}
            detail={`${highestOverallScore.season} · Week ${highestOverallScore.week}`}
          />
        )}

        {biggestRegularWin && biggestWinWinner && (
          <RecordCard
            label="BIGGEST REGULAR-SEASON WIN"
            value={`+${formatScore(biggestRegularWin.margin)}`}
            owner={getOwnerName(
              ownerMap,
              biggestWinWinner.ownerId
            )}
            team={biggestWinWinner.teamName}
            detail={`${biggestRegularWin.game.season_year} · Week ${biggestRegularWin.game.matchup_period}`}
            opponent={`vs. ${biggestWinWinner.opponentTeamName}`}
          />
        )}

        {closestRegularGame &&
          closestWinner &&
          closestLoser && (
          <RecordCard
            label="CLOSEST REGULAR-SEASON GAME"
            value={formatScore(closestRegularGame.margin)}
            owner={getOwnerName(
              ownerMap,
              closestWinner.ownerId
            )}
            team={closestWinner.teamName}
            detail={`${closestRegularGame.game.season_year} · Week ${closestRegularGame.game.matchup_period}`}
            opponent={`over ${closestLoser.teamName}`}
          />
        )}
      </RecordSection>

      {/* SEASON RECORDS */}

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
            detail={`${bestSeasonRecord.season}`}
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
            detail={`${mostWinsSeason.season}`}
          />
        )}

        {mostPointsSeason && (
          <RecordCard
            label="MOST REGULAR-SEASON POINTS"
            value={formatScore(mostPointsSeason.pointsFor)}
            owner={getOwnerName(
              ownerMap,
              mostPointsSeason.ownerId
            )}
            team={mostPointsSeason.teamName}
            detail={`${mostPointsSeason.season}`}
          />
        )}

        {bestAverageSeason && (
          <RecordCard
            label="HIGHEST POINTS PER GAME"
            value={formatScore(bestAverageSeason.average)}
            owner={getOwnerName(
              ownerMap,
              bestAverageSeason.ownerId
            )}
            team={bestAverageSeason.teamName}
            detail={`${bestAverageSeason.season}`}
          />
        )}
      </RecordSection>

      {/* CAREER RECORDS */}

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
            team="Career"
            detail={`${formatRecord(
              mostCareerWins.wins,
              mostCareerWins.losses,
              mostCareerWins.ties
            )} record`}
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
            team="Minimum 20 games"
            detail={`${formatRecord(
              bestCareerWinPct.wins,
              bestCareerWinPct.losses,
              bestCareerWinPct.ties
            )} record`}
          />
        )}

        {mostCareerPoints && (
          <RecordCard
            label="MOST CAREER REGULAR-SEASON POINTS"
            value={formatScore(mostCareerPoints.pointsFor)}
            owner={getOwnerName(
              ownerMap,
              mostCareerPoints.ownerId
            )}
            team={`${mostCareerPoints.seasons.size} seasons`}
            detail="Career regular season"
          />
        )}

        {mostPlayoffWins && (
          <RecordCard
            label="MOST CHAMPIONSHIP-BRACKET WINS"
            value={`${mostPlayoffWins.wins}`}
            owner={getOwnerName(
              ownerMap,
              mostPlayoffWins.ownerId
            )}
            team="Playoffs"
            detail={`${formatRecord(
              mostPlayoffWins.wins,
              mostPlayoffWins.losses,
              mostPlayoffWins.ties
            )} playoff record`}
          />
        )}
      </RecordSection>

      {/* PLAYOFF RECORDS */}

      <RecordSection
        eyebrow="POSTSEASON"
        title="Playoff Records"
      >
        {highestPlayoffScore && (
          <RecordCard
            label="HIGHEST PLAYOFF SCORE"
            value={formatScore(highestPlayoffScore.score)}
            owner={getOwnerName(
              ownerMap,
              highestPlayoffScore.ownerId
            )}
            team={highestPlayoffScore.teamName}
            detail={`${highestPlayoffScore.season} · Week ${highestPlayoffScore.week}`}
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
              highestChampionshipScore.highScoreSide.ownerId
            )}
            team={
              highestChampionshipScore.highScoreSide.teamName
            }
            detail={`${highestChampionshipScore.game.season_year} Championship`}
          />
        )}

        {closestChampionship && (
          <RecordCard
            label="CLOSEST CHAMPIONSHIP"
            value={formatScore(closestChampionship.margin)}
            owner={getOwnerName(
              ownerMap,
              closestChampionship.winnerSide.ownerId
            )}
            team={closestChampionship.winnerSide.teamName}
            detail={`${closestChampionship.game.season_year} Championship`}
          />
        )}

        {biggestChampionship && (
          <RecordCard
            label="BIGGEST CHAMPIONSHIP WIN"
            value={`+${formatScore(
              biggestChampionship.margin
            )}`}
            owner={getOwnerName(
              ownerMap,
              biggestChampionship.winnerSide.ownerId
            )}
            team={biggestChampionship.winnerSide.teamName}
            detail={`${biggestChampionship.game.season_year} Championship`}
          />
        )}

        {highestCombinedChampionship && (
          <RecordCard
            label="HIGHEST-SCORING CHAMPIONSHIP"
            value={formatScore(
              highestCombinedChampionship.combined
            )}
            owner={`${highestCombinedChampionship.game.home_team_name} vs. ${highestCombinedChampionship.game.away_team_name}`}
            team="Combined Points"
            detail={`${highestCombinedChampionship.game.season_year} Championship`}
          />
        )}
      </RecordSection>

      {/* HISTORIC STREAKS */}

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
            team="Winning Streak"
            detail={`${longestWinStreak.start.season} W${longestWinStreak.start.week} → ${longestWinStreak.end.season} W${longestWinStreak.end.week}`}
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
            team="Losing Streak"
            detail={`${longestLossStreak.start.season} W${longestLossStreak.start.week} → ${longestLossStreak.end.season} W${longestLossStreak.end.week}`}
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
    </main>
  );
}
