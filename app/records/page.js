import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value) {
  return number(value).toFixed(2);
}

function getGameType(game) {
  const matchupType = String(game.matchup_type || "")
    .trim()
    .toLowerCase();

  const playoffTier = String(game.playoff_tier || "")
    .trim()
    .toLowerCase();

  if (
    matchupType === "consolation" ||
    matchupType.includes("consolation") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("losers") ||
    playoffTier.includes("loser")
  ) {
    return "consolation";
  }

  if (
    matchupType === "playoff" ||
    matchupType.includes("championship") ||
    playoffTier.includes("winners_bracket") ||
    playoffTier.includes("winner") ||
    playoffTier.includes("championship") ||
    game.is_championship === true ||
    game.is_playoff === true
  ) {
    return "playoff";
  }

  return "regular";
}

function gameSides(game) {
  return [
    {
      ownerId: Number(game.home_owner_id),
      teamName: game.home_team_name || "Unknown Team",
      score: number(game.home_score),
      opponentOwnerId: Number(game.away_owner_id),
      opponentTeamName: game.away_team_name || "Unknown Team",
      opponentScore: number(game.away_score),
      side: "HOME",
    },
    {
      ownerId: Number(game.away_owner_id),
      teamName: game.away_team_name || "Unknown Team",
      score: number(game.away_score),
      opponentOwnerId: Number(game.home_owner_id),
      opponentTeamName: game.home_team_name || "Unknown Team",
      opponentScore: number(game.home_score),
      side: "AWAY",
    },
  ];
}

function resultForSide(game, side) {
  const winner = String(game.winner || "").toUpperCase();

  if (winner === "TIE") return "T";
  if (winner === side) return "W";
  if (winner === "HOME" || winner === "AWAY") return "L";

  const home = number(game.home_score);
  const away = number(game.away_score);

  if (home === away) return "T";

  if (side === "HOME") {
    return home > away ? "W" : "L";
  }

  return away > home ? "W" : "L";
}

function getOwnerName(ownerMap, ownerId) {
  return ownerMap.get(Number(ownerId)) || "Unknown Owner";
}

function recordCard({
  label,
  value,
  owner,
  team,
  detail,
  opponent,
}) {
  return (
    <div className="record-book-card">
      <span className="record-book-label">{label}</span>

      <strong className="record-book-value">{value}</strong>

      <div className="record-book-owner">{owner}</div>

      {team ? <div className="record-book-team">{team}</div> : null}

      {detail ? <div className="record-book-detail">{detail}</div> : null}

      {opponent ? (
        <div className="record-book-opponent">{opponent}</div>
      ) : null}
    </div>
  );
}

export default async function RecordsPage() {
  const [{ data: owners }, { data: matchupData }] = await Promise.all([
    supabase.from("owners").select("id, name"),
    supabase
      .from("matchups")
      .select("*")
      .lt("season_year", 2026)
      .order("season_year", { ascending: true })
      .order("matchup_period", { ascending: true }),
  ]);

  const ownerMap = new Map(
    (owners || []).map((owner) => [Number(owner.id), owner.name])
  );

  const completedGames = (matchupData || []).filter(
    (game) =>
      game.home_score !== null &&
      game.away_score !== null &&
      Number.isFinite(Number(game.home_score)) &&
      Number.isFinite(Number(game.away_score))
  );

  const regularGames = completedGames.filter(
    (game) => getGameType(game) === "regular"
  );

  const playoffGames = completedGames.filter(
    (game) => getGameType(game) === "playoff"
  );

  const championshipGames = playoffGames.filter(
    (game) => game.is_championship === true
  );

  const allSides = completedGames.flatMap(gameSides);
  const regularSides = regularGames.flatMap(gameSides);
  const playoffSides = playoffGames.flatMap(gameSides);

  /* ======================================================
     SINGLE-GAME RECORDS
     ====================================================== */

  const highestRegularScore = [...regularSides].sort(
    (a, b) => b.score - a.score
  )[0];

  const lowestRegularScore = [...regularSides].sort(
    (a, b) => a.score - b.score
  )[0];

  const highestOverallScore = [...allSides].sort(
    (a, b) => b.score - a.score
  )[0];

  const highestPlayoffScore = [...playoffSides].sort(
    (a, b) => b.score - a.score
  )[0];

  const biggestRegularWin = [...regularGames]
    .map((game) => ({
      game,
      margin: Math.abs(
        number(game.home_score) - number(game.away_score)
      ),
    }))
    .sort((a, b) => b.margin - a.margin)[0];

  const closestRegularGame = [...regularGames]
    .filter(
      (game) => number(game.home_score) !== number(game.away_score)
    )
    .map((game) => ({
      game,
      margin: Math.abs(
        number(game.home_score) - number(game.away_score)
      ),
    }))
    .sort((a, b) => a.margin - b.margin)[0];

  /* ======================================================
     SEASON RECORDS
     ====================================================== */

  const seasonStats = new Map();

  for (const game of regularGames) {
    for (const side of gameSides(game)) {
      const key = `${game.season_year}-${side.ownerId}`;

      if (!seasonStats.has(key)) {
        seasonStats.set(key, {
          season: Number(game.season_year),
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

      stat.games += 1;
      stat.pointsFor += side.score;
      stat.pointsAgainst += side.opponentScore;

      if (result === "W") stat.wins += 1;
      if (result === "L") stat.losses += 1;
      if (result === "T") stat.ties += 1;
    }
  }

  const seasonRows = [...seasonStats.values()].map((row) => ({
    ...row,
    winPct:
      row.games > 0
        ? (row.wins + row.ties * 0.5) / row.games
        : 0,
    average:
      row.games > 0 ? row.pointsFor / row.games : 0,
  }));

  const mostWinsSeason = [...seasonRows].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.winPct - a.winPct;
  })[0];

  const bestSeasonRecord = [...seasonRows].sort((a, b) => {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  })[0];

  const mostPointsSeason = [...seasonRows].sort(
    (a, b) => b.pointsFor - a.pointsFor
  )[0];

  const bestAverageSeason = [...seasonRows].sort(
    (a, b) => b.average - a.average
  )[0];

  /* ======================================================
     CAREER REGULAR-SEASON RECORDS
     ====================================================== */

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

      stat.games += 1;
      stat.pointsFor += side.score;
      stat.seasons.add(Number(game.season_year));

      if (result === "W") stat.wins += 1;
      if (result === "L") stat.losses += 1;
      if (result === "T") stat.ties += 1;
    }
  }

  const careerRows = [...careerStats.values()].map((row) => ({
    ...row,
    winPct:
      row.games > 0
        ? (row.wins + row.ties * 0.5) / row.games
        : 0,
  }));

  const mostCareerWins = [...careerRows].sort(
    (a, b) => b.wins - a.wins
  )[0];

  const mostCareerPoints = [...careerRows].sort(
    (a, b) => b.pointsFor - a.pointsFor
  )[0];

  const bestCareerWinPct = [...careerRows]
    .filter((row) => row.games >= 20)
    .sort((a, b) => {
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      return b.wins - a.wins;
    })[0];

  /* ======================================================
     PLAYOFF CAREER RECORDS
     ====================================================== */

  const playoffStats = new Map();

  for (const game of playoffGames) {
    for (const side of gameSides(game)) {
      if (!playoffStats.has(side.ownerId)) {
        playoffStats.set(side.ownerId, {
          ownerId: side.ownerId,
          wins: 0,
          losses: 0,
          ties: 0,
          games: 0,
        });
      }

      const stat = playoffStats.get(side.ownerId);
      const result = resultForSide(game, side.side);

      stat.games += 1;

      if (result === "W") stat.wins += 1;
      if (result === "L") stat.losses += 1;
      if (result === "T") stat.ties += 1;
    }
  }

  const playoffRows = [...playoffStats.values()];

  const mostPlayoffWins = [...playoffRows].sort(
    (a, b) => b.wins - a.wins
  )[0];

  /* ======================================================
     CHAMPIONSHIP RECORDS
     ====================================================== */

  const championshipDetails = championshipGames.map((game) => {
    const homeScore = number(game.home_score);
    const awayScore = number(game.away_score);

    const winnerSide =
      String(game.winner || "").toUpperCase() === "AWAY"
        ? gameSides(game)[1]
        : gameSides(game)[0];

    return {
      game,
      winnerSide,
      margin: Math.abs(homeScore - awayScore),
      combined: homeScore + awayScore,
      highScore: Math.max(homeScore, awayScore),
    };
  });

  const closestChampionship = [...championshipDetails].sort(
    (a, b) => a.margin - b.margin
  )[0];

  const biggestChampionship = [...championshipDetails].sort(
    (a, b) => b.margin - a.margin
  )[0];

  const highestChampionshipScore = [...championshipDetails].sort(
    (a, b) => b.highScore - a.highScore
  )[0];

  const highestCombinedChampionship = [...championshipDetails].sort(
    (a, b) => b.combined - a.combined
  )[0];

  /* ======================================================
     WINNING / LOSING STREAKS
     ====================================================== */

  const gamesByOwner = new Map();

  for (const game of regularGames) {
    for (const side of gameSides(game)) {
      if (!gamesByOwner.has(side.ownerId)) {
        gamesByOwner.set(side.ownerId, []);
      }

      gamesByOwner.get(side.ownerId).push({
        season: Number(game.season_year),
        week: Number(game.matchup_period),
        result: resultForSide(game, side.side),
        teamName: side.teamName,
      });
    }
  }

  let longestWinStreak = null;
  let longestLossStreak = null;

  for (const [ownerId, games] of gamesByOwner.entries()) {
    games.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return a.week - b.week;
    });

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

        currentWins += 1;
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
            teamName: game.teamName,
          };
        }
      } else if (game.result === "L") {
        if (currentLosses === 0) {
          lossStart = {
            season: game.season,
            week: game.week,
          };
        }

        currentLosses += 1;
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
            teamName: game.teamName,
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

  function winnerFromGame(game) {
    if (!game) return null;

    const sides = gameSides(game);
    const winner = String(game.winner || "").toUpperCase();

    if (winner === "HOME") return sides[0];
    if (winner === "AWAY") return sides[1];

    return sides.sort((a, b) => b.score - a.score)[0];
  }

  function loserFromGame(game) {
    if (!game) return null;

    const sides = gameSides(game);
    const winner = String(game.winner || "").toUpperCase();

    if (winner === "HOME") return sides[1];
    if (winner === "AWAY") return sides[0];

    return sides.sort((a, b) => a.score - b.score)[0];
  }

  const biggestWinWinner = biggestRegularWin
    ? winnerFromGame(biggestRegularWin.game)
    : null;

  const closestWinner = closestRegularGame
    ? winnerFromGame(closestRegularGame.game)
    : null;

  const closestLoser = closestRegularGame
    ? loserFromGame(closestRegularGame.game)
    : null;

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-title">
          <strong>DIRTY P FANTASY FOOTBALL</strong>
          <span>LEAGUE ARCHIVE</span>
        </div>
      </header>

      <section className="owners-hero">
        <div>
          <p className="eyebrow">LEAGUE RECORD BOOK</p>
          <h1>Dirty P Records</h1>
          <p>
            The biggest scores, best seasons, career leaders,
            playoff performances and historic streaks in Dirty P
            history.
          </p>
        </div>

        <div className="owners-count">
          <strong>12</strong>
          <span>SEASONS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>
        <span>2014–2025</span>
      </nav>

      {/* SINGLE GAME */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SINGLE GAME</p>
            <h2>Weekly Records</h2>
          </div>
        </div>

        <div className="record-book-grid">
          {highestRegularScore &&
            recordCard({
              label: "Highest Regular-Season Score",
              value: formatScore(highestRegularScore.score),
              owner: getOwnerName(
                ownerMap,
                highestRegularScore.ownerId
              ),
              team: highestRegularScore.teamName,
              detail: `${highestRegularScore.season_year} • Week ${highestRegularScore.matchup_period}`,
            })}

          {lowestRegularScore &&
            recordCard({
              label: "Lowest Regular-Season Score",
              value: formatScore(lowestRegularScore.score),
              owner: getOwnerName(
                ownerMap,
                lowestRegularScore.ownerId
              ),
              team: lowestRegularScore.teamName,
              detail: `${lowestRegularScore.season_year} • Week ${lowestRegularScore.matchup_period}`,
            })}

          {highestOverallScore &&
            recordCard({
              label: "Highest Score — Any Game",
              value: formatScore(highestOverallScore.score),
              owner: getOwnerName(
                ownerMap,
                highestOverallScore.ownerId
              ),
              team: highestOverallScore.teamName,
              detail: `${highestOverallScore.season_year} • Week ${highestOverallScore.matchup_period}`,
            })}

          {biggestRegularWin &&
            biggestWinWinner &&
            recordCard({
              label: "Biggest Regular-Season Win",
              value: `+${formatScore(biggestRegularWin.margin)}`,
              owner: getOwnerName(
                ownerMap,
                biggestWinWinner.ownerId
              ),
              team: biggestWinWinner.teamName,
              detail: `${biggestRegularWin.game.season_year} • Week ${biggestRegularWin.game.matchup_period}`,
              opponent: `vs. ${biggestWinWinner.opponentTeamName}`,
            })}

          {closestRegularGame &&
            closestWinner &&
            closestLoser &&
            recordCard({
              label: "Closest Regular-Season Game",
              value: formatScore(closestRegularGame.margin),
              owner: getOwnerName(ownerMap, closestWinner.ownerId),
              team: closestWinner.teamName,
              detail: `${closestRegularGame.game.season_year} • Week ${closestRegularGame.game.matchup_period}`,
              opponent: `over ${closestLoser.teamName}`,
            })}
        </div>
      </section>

      {/* SEASON */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SINGLE SEASON</p>
            <h2>Season Records</h2>
          </div>
        </div>

        <div className="record-book-grid">
          {bestSeasonRecord &&
            recordCard({
              label: "Best Regular-Season Record",
              value: `${bestSeasonRecord.wins}-${bestSeasonRecord.losses}${
                bestSeasonRecord.ties
                  ? `-${bestSeasonRecord.ties}`
                  : ""
              }`,
              owner: getOwnerName(
                ownerMap,
                bestSeasonRecord.ownerId
              ),
              team: bestSeasonRecord.teamName,
              detail: `${bestSeasonRecord.season}`,
            })}

          {mostWinsSeason &&
            recordCard({
              label: "Most Regular-Season Wins",
              value: `${mostWinsSeason.wins}`,
              owner: getOwnerName(
                ownerMap,
                mostWinsSeason.ownerId
              ),
              team: mostWinsSeason.teamName,
              detail: `${mostWinsSeason.season}`,
            })}

          {mostPointsSeason &&
            recordCard({
              label: "Most Regular-Season Points",
              value: formatScore(mostPointsSeason.pointsFor),
              owner: getOwnerName(
                ownerMap,
                mostPointsSeason.ownerId
              ),
              team: mostPointsSeason.teamName,
              detail: `${mostPointsSeason.season}`,
            })}

          {bestAverageSeason &&
            recordCard({
              label: "Highest Points Per Game",
              value: formatScore(bestAverageSeason.average),
              owner: getOwnerName(
                ownerMap,
                bestAverageSeason.ownerId
              ),
              team: bestAverageSeason.teamName,
              detail: `${bestAverageSeason.season}`,
            })}
        </div>
      </section>

      {/* CAREER */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ALL-TIME</p>
            <h2>Career Records</h2>
          </div>
        </div>

        <div className="record-book-grid">
          {mostCareerWins &&
            recordCard({
              label: "Most Regular-Season Wins",
              value: `${mostCareerWins.wins}`,
              owner: getOwnerName(
                ownerMap,
                mostCareerWins.ownerId
              ),
              detail: `${mostCareerWins.wins}-${mostCareerWins.losses}${
                mostCareerWins.ties
                  ? `-${mostCareerWins.ties}`
                  : ""
              } career record`,
            })}

          {bestCareerWinPct &&
            recordCard({
              label: "Best Career Win %",
              value: `${(bestCareerWinPct.winPct * 100).toFixed(
                1
              )}%`,
              owner: getOwnerName(
                ownerMap,
                bestCareerWinPct.ownerId
              ),
              detail: `${bestCareerWinPct.wins}-${bestCareerWinPct.losses}${
                bestCareerWinPct.ties
                  ? `-${bestCareerWinPct.ties}`
                  : ""
              } regular season`,
            })}

          {mostCareerPoints &&
            recordCard({
              label: "Most Career Regular-Season Points",
              value: formatScore(mostCareerPoints.pointsFor),
              owner: getOwnerName(
                ownerMap,
                mostCareerPoints.ownerId
              ),
              detail: `${mostCareerPoints.seasons.size} seasons`,
            })}

          {mostPlayoffWins &&
            recordCard({
              label: "Most Championship-Bracket Wins",
              value: `${mostPlayoffWins.wins}`,
              owner: getOwnerName(
                ownerMap,
                mostPlayoffWins.ownerId
              ),
              detail: `${mostPlayoffWins.wins}-${mostPlayoffWins.losses} playoff record`,
            })}
        </div>
      </section>

      {/* PLAYOFFS */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">POSTSEASON</p>
            <h2>Playoff Records</h2>
          </div>
        </div>

        <div className="record-book-grid">
          {highestPlayoffScore &&
            recordCard({
              label: "Highest Playoff Score",
              value: formatScore(highestPlayoffScore.score),
              owner: getOwnerName(
                ownerMap,
                highestPlayoffScore.ownerId
              ),
              team: highestPlayoffScore.teamName,
              detail: `${highestPlayoffScore.season_year} • Week ${highestPlayoffScore.matchup_period}`,
            })}

          {highestChampionshipScore &&
            recordCard({
              label: "Highest Championship Score",
              value: formatScore(
                highestChampionshipScore.highScore
              ),
              owner: getOwnerName(
                ownerMap,
                highestChampionshipScore.winnerSide.ownerId
              ),
              team: highestChampionshipScore.winnerSide.teamName,
              detail: `${highestChampionshipScore.game.season_year} Championship`,
            })}

          {closestChampionship &&
            recordCard({
              label: "Closest Championship",
              value: formatScore(closestChampionship.margin),
              owner: getOwnerName(
                ownerMap,
                closestChampionship.winnerSide.ownerId
              ),
              team: closestChampionship.winnerSide.teamName,
              detail: `${closestChampionship.game.season_year} Championship`,
            })}

          {biggestChampionship &&
            recordCard({
              label: "Biggest Championship Win",
              value: `+${formatScore(
                biggestChampionship.margin
              )}`,
              owner: getOwnerName(
                ownerMap,
                biggestChampionship.winnerSide.ownerId
              ),
              team: biggestChampionship.winnerSide.teamName,
              detail: `${biggestChampionship.game.season_year} Championship`,
            })}

          {highestCombinedChampionship &&
            recordCard({
              label: "Highest-Scoring Championship",
              value: formatScore(
                highestCombinedChampionship.combined
              ),
              owner: `${highestCombinedChampionship.game.home_team_name} vs. ${highestCombinedChampionship.game.away_team_name}`,
              detail: `${highestCombinedChampionship.game.season_year} Championship`,
            })}
        </div>
      </section>

      {/* STREAKS */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">STREAKS</p>
            <h2>Historic Streaks</h2>
          </div>
        </div>

        <div className="record-book-grid">
          {longestWinStreak &&
            recordCard({
              label: "Longest Regular-Season Win Streak",
              value: `${longestWinStreak.count} Games`,
              owner: getOwnerName(
                ownerMap,
                longestWinStreak.ownerId
              ),
              detail: `${longestWinStreak.start.season} W${longestWinStreak.start.week} → ${longestWinStreak.end.season} W${longestWinStreak.end.week}`,
            })}

          {longestLossStreak &&
            recordCard({
              label: "Longest Regular-Season Losing Streak",
              value: `${longestLossStreak.count} Games`,
              owner: getOwnerName(
                ownerMap,
                longestLossStreak.ownerId
              ),
              detail: `${longestLossStreak.start.season} W${longestLossStreak.start.week} → ${longestLossStreak.end.season} W${longestLossStreak.end.week}`,
            })}
        </div>
      </section>

      <footer className="site-footer">
        <strong>DIRTY P FANTASY FOOTBALL</strong>
        <p>
          Independent fantasy league archive. Not affiliated with
          or endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
