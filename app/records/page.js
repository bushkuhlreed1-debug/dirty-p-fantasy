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

function getWinPercentage(wins, losses, ties = 0) {
  const total =
    num(wins) + num(losses) + num(ties);

  if (!total) return 0;

  return (
    (num(wins) + num(ties) * 0.5) / total
  );
}

function getOwnerName(ownerMap, ownerId) {
  return (
    ownerMap.get(Number(ownerId)) ||
    "Unknown Owner"
  );
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function formatWeek(season, week) {
  return `${season} · Week ${week}`;
}

// ======================================================
// GAME CLASSIFICATION
//
// IMPORTANT:
//
// Third-place games always count as playoffs.
//
// Regular-season classification matches the
// successful Supabase SQL query:
//
// - No playoff flag
// - No championship flag
// - No third-place flag
// - No consolation flag
// - No postseason matchup_type
// - No postseason playoff_tier
//
// This prevents incorrectly tagged historical
// matchups from entering regular-season records.
// ======================================================

function getGameType(game) {
  const type = normalize(game.matchup_type);
  const tier = normalize(game.playoff_tier);

  // THIRD PLACE ALWAYS COUNTS AS PLAYOFF

  if (
    game.is_third_place === true ||
    /third[ _-]?place|3rd[ _-]?place/.test(type)
  ) {
    return "playoff";
  }

  // CONSOLATION

  if (
    game.is_consolation === true ||
    /consolation|loser|toilet/.test(type) ||
    /consolation|loser|toilet/.test(tier)
  ) {
    return "consolation";
  }

  // PLAYOFFS AND CHAMPIONSHIPS

  if (
    game.is_playoff === true ||
    game.is_championship === true ||
    /playoff|championship|semifinal|semi.final/.test(
      type
    ) ||
    /winner|championship/.test(tier)
  ) {
    return "playoff";
  }

  return "regular";
}

// ======================================================
// STRICT REGULAR-SEASON ELIGIBILITY
//
// Uses the same exclusions as our working SQL.
//
// Don't rely solely on the broader getGameType()
// logic when calculating regular-season records.
// ======================================================

function isRegularSeasonGame(game) {
  const type = normalize(game.matchup_type);
  const tier = normalize(game.playoff_tier);

  if (
    game.is_playoff === true ||
    game.is_championship === true ||
    game.is_third_place === true ||
    game.is_consolation === true
  ) {
    return false;
  }

  if (
    /playoff|championship|semifinal|semi_final|third.place|consolation|loser/i.test(
      type
    )
  ) {
    return false;
  }

  if (
    /winner|championship|consolation|loser|toilet/i.test(
      tier
    )
  ) {
    return false;
  }

  return true;
}

// ======================================================
// VALID COMPLETED GAMES
//
// Reject:
// - Missing scores
// - Invalid scores
// - Unplayed 0-0 placeholders
// - Unfinished current-season games
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
  const winner = String(
    game.winner || ""
  )
    .trim()
    .toUpperCase();

  return ["HOME", "AWAY", "TIE"].includes(
    winner
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

  const homeScore = num(game.home_score);
  const awayScore = num(game.away_score);

  if (
    homeScore === 0 &&
    awayScore === 0
  ) {
    return false;
  }

  const isFinal =
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "")
      .trim()
      .toUpperCase() === "FINAL" ||
    hasOfficialWinner(game) ||
    completedKeys.has(gameIdentity(game));

  if (isFinal) {
    return true;
  }

  // Historical imports sometimes lack completed
  // flags but contain finalized scores.

  if (
    num(game.season_year) <
    num(currentSeason)
  ) {
    return true;
  }

  return false;
}

// ======================================================
// MATCHUP SIDES
// ======================================================

function gameSides(game) {
  return [
    {
      side: "HOME",
      ownerId: num(game.home_owner_id),
      opponentOwnerId: num(game.away_owner_id),
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
      ownerId: num(game.away_owner_id),
      opponentOwnerId: num(game.home_owner_id),
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
  )
    .trim()
    .toUpperCase();

  if (winner === "TIE") return "T";

  if (winner === side) return "W";

  if (
    winner === "HOME" ||
    winner === "AWAY"
  ) {
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
  )
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

  if (
    sides[0].score === sides[1].score
  ) {
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
    (side) =>
      side.side !== winner.side
  );
}

function getMargin(game) {
  return Math.abs(
    num(game.home_score) -
    num(game.away_score)
  );
}

function getFinalScore(game) {
  const home = num(game.home_score);
  const away = num(game.away_score);

  const high = Math.max(home, away);
  const low = Math.min(home, away);

  return (
    `${formatScore(high)}` +
    ` – ${formatScore(low)}`
  );
}

function getMatchupDescription(game, ownerMap) {
  const home = gameSides(game)[0];
  const away = gameSides(game)[1];

  const homeName = getOwnerName(
    ownerMap,
    home.ownerId
  );

  const awayName = getOwnerName(
    ownerMap,
    away.ownerId
  );

  // Match the final scores rather than trusting
  // possibly inconsistent historical winner flags.

  if (home.score > away.score) {
    return `${homeName} defeated ${awayName}`;
  }

  if (away.score > home.score) {
    return `${awayName} defeated ${homeName}`;
  }

  return `${homeName} tied ${awayName}`;
}

// ======================================================
// RECORD CARD
//
// Clean design without Context/Detail boxes.
// ======================================================

function RecordCard({
  label,
  value,
  owner,
  team,
  note,
  secondary,
}) {
  return (
    <article className="owner-card dp-record-card">
      <span className="owner-status">
        {label}
      </span>

      <h3 className="dp-record-value">
        {value}
      </h3>

      {owner && (
        <strong className="dp-record-owner">
          {owner}
        </strong>
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

      {secondary && (
        <p className="dp-record-secondary">
          {secondary}
        </p>
      )}
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

      <div className="owners-grid">
        {children}
      </div>
    </section>
  );
}

// ======================================================
// MAIN RECORDS PAGE
// ======================================================

export default async function RecordsPage() {
  let leagueData;

  try {
    leagueData = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Records</h1>

        <p>
          {error?.message ||
            "Unable to load league data."}
        </p>
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
    completedCurrentMatchups.map(
      gameIdentity
    )
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
        (game) =>
          Number(game.season_year)
      )
    ),
  ]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const firstSeason =
    seasonYears[0] || 2014;

  const latestSeason =
    seasonYears[
      seasonYears.length - 1
    ] || currentSeason;

  const latestCompletedWeek = Math.max(
    0,
    ...completedCurrentMatchups
      .filter(
        (game) =>
          isCompletedGame(
            game,
            currentSeason,
            completedKeys
          )
      )
      .map(
        (game) =>
          num(game.matchup_period)
      )
  );

  // ====================================================
  // GAME CATEGORIES
  //
  // Regular-season games use the strict
  // SQL-equivalent classification.
  // ====================================================

  const regularGames = completedGames.filter(
    isRegularSeasonGame
  );

  const playoffGames = completedGames.filter(
    (game) =>
      getGameType(game) === "playoff" &&
      !isRegularSeasonGame(game)
  );

  const consolationGames = completedGames.filter(
    (game) =>
      getGameType(game) === "consolation"
  );

  const officialGames = [
    ...regularGames,
    ...playoffGames,
  ];

  const championshipGames =
    playoffGames.filter(
      (game) =>
        game.is_championship === true ||
        [
          "championship",
          "championship_game",
          "title_game",
        ].includes(
          normalize(game.matchup_type)
            .replace(/[\s-]+/g, "_")
        )
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

  const highestRegularScore =
    [...regularSides].sort(
      (a, b) =>
        b.score - a.score
    )[0];

  const lowestRegularScore =
    [...regularSides]
      .filter(
        (side) =>
          side.score > 0
      )
      .sort(
        (a, b) =>
          a.score - b.score
      )[0];

  const highestOverallScore =
    [...officialSides].sort(
      (a, b) =>
        b.score - a.score
    )[0];

  const highestPlayoffScore =
    [...playoffSides].sort(
      (a, b) =>
        b.score - a.score
    )[0];

  // ====================================================
  // VERIFIED CLOSEST-GAME LOGIC
  //
  // Same qualifying rules as the SQL results.
  //
  // A winning margin is computed directly from
  // two valid recorded final scores.
  //
  // Ties are excluded.
  //
  // Both scores must be positive to prevent
  // score placeholders from qualifying.
  // ====================================================

  const regularDecisions =
    regularGames
      .filter(
        (game) =>
          hasValidScores(game) &&
          num(game.home_score) > 0 &&
          num(game.away_score) > 0 &&
          num(game.home_score) !==
            num(game.away_score)
      )
      .map((game) => ({
        game,
        margin: getMargin(game),
      }));

  const biggestRegularWin =
    [...regularDecisions].sort(
      (a, b) =>
        b.margin - a.margin
    )[0];

  const closestRegularGame =
    [...regularDecisions].sort(
      (a, b) =>
        a.margin - b.margin ||
        num(a.game.season_year) -
          num(b.game.season_year) ||
        num(a.game.matchup_period) -
          num(b.game.matchup_period)
    )[0];

  const biggestWinWinner =
    biggestRegularWin
      ? winnerFromGame(
          biggestRegularWin.game
        )
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

      const stat =
        seasonStats.get(key);

      const result =
        resultForSide(
          game,
          side.side
        );

      stat.games++;
      stat.pointsFor += side.score;
      stat.pointsAgainst +=
        side.opponentScore;

      if (result === "W") {
        stat.wins++;
      }

      if (result === "L") {
        stat.losses++;
      }

      if (result === "T") {
        stat.ties++;
      }
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

  // ====================================================
  // ONLY COMPLETED SEASONS QUALIFY FOR
  // BEST REGULAR-SEASON RECORD
  // ====================================================

  const completedSeasonRows =
    seasonRows.filter(
      (row) =>
        Number(row.season) <
        Number(currentSeason)
    );

  const bestSeasonRecord =
    [...completedSeasonRows].sort(
      (a, b) =>
        b.winPct - a.winPct ||
        b.wins - a.wins ||
        b.pointsFor - a.pointsFor
    )[0];

  const mostWinsSeason =
    [...seasonRows].sort(
      (a, b) =>
        b.wins - a.wins ||
        b.winPct - a.winPct
    )[0];

  const mostPointsSeason =
    [...seasonRows].sort(
      (a, b) =>
        b.pointsFor - a.pointsFor
    )[0];

  const bestAverageSeason =
    [...seasonRows].sort(
      (a, b) =>
        b.average - a.average
    )[0];

  // ====================================================
  // CAREER REGULAR-SEASON STATS
  // ====================================================

  const careerStats = new Map();

  for (const game of regularGames) {
    for (const side of gameSides(game)) {
      if (
        !careerStats.has(
          side.ownerId
        )
      ) {
        careerStats.set(
          side.ownerId,
          {
            ownerId: side.ownerId,
            wins: 0,
            losses: 0,
            ties: 0,
            games: 0,
            pointsFor: 0,
            seasons: new Set(),
          }
        );
      }

      const stat =
        careerStats.get(
          side.ownerId
        );

      const result =
        resultForSide(
          game,
          side.side
        );

      stat.games++;
      stat.pointsFor += side.score;
      stat.seasons.add(
        side.season
      );

      if (result === "W") {
        stat.wins++;
      }

      if (result === "L") {
        stat.losses++;
      }

      if (result === "T") {
        stat.ties++;
      }
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

  const mostCareerWins =
    [...careerRows].sort(
      (a, b) =>
        b.wins - a.wins
    )[0];

  const mostCareerPoints =
    [...careerRows].sort(
      (a, b) =>
        b.pointsFor - a.pointsFor
    )[0];

  const bestCareerWinPct =
    [...careerRows]
      .filter(
        (row) =>
          row.games >= 20
      )
      .sort(
        (a, b) =>
          b.winPct - a.winPct ||
          b.wins - a.wins
      )[0];

  // ====================================================
  // PLAYOFF CAREER STATS
  //
  // Includes third-place games.
  // ====================================================

  const playoffStats = new Map();

  for (const game of playoffGames) {
    for (const side of gameSides(game)) {
      if (
        !playoffStats.has(
          side.ownerId
        )
      ) {
        playoffStats.set(
          side.ownerId,
          {
            ownerId: side.ownerId,
            wins: 0,
            losses: 0,
            ties: 0,
          }
        );
      }

      const stat =
        playoffStats.get(
          side.ownerId
        );

      const result =
        resultForSide(
          game,
          side.side
        );

      if (result === "W") {
        stat.wins++;
      }

      if (result === "L") {
        stat.losses++;
      }

      if (result === "T") {
        stat.ties++;
      }
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
    championshipGames.map(
      (game) => {
        const sides = gameSides(
          game
        );

        const winnerSide =
          winnerFromGame(
            game
          );

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
      }
    );

  const decidedChampionships =
    championshipDetails.filter(
      (item) =>
        item.winnerSide
    );

  const closestChampionship =
    [...decidedChampionships].sort(
      (a, b) =>
        a.margin - b.margin
    )[0];

  const biggestChampionship =
    [...decidedChampionships].sort(
      (a, b) =>
        b.margin - a.margin
    )[0];

  const highestChampionshipScore =
    [...championshipDetails].sort(
      (a, b) =>
        b.highScore - a.highScore
    )[0];

  const highestCombinedChampionship =
    [...championshipDetails].sort(
      (a, b) =>
        b.combined - a.combined
    )[0];

  // ====================================================
  // REGULAR-SEASON STREAKS
  // ====================================================

  const gamesByOwner = new Map();

  for (const game of regularGames) {
    for (const side of gameSides(game)) {
      if (
        !gamesByOwner.has(
          side.ownerId
        )
      ) {
        gamesByOwner.set(
          side.ownerId,
          []
        );
      }

      gamesByOwner
        .get(side.ownerId)
        .push({
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

  for (
    const [ownerId, games]
    of gamesByOwner
  ) {
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
          currentWins >
            longestWinStreak.count
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
      } else if (
        game.result === "L"
      ) {
        if (
          currentLosses === 0
        ) {
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
          currentLosses >
            longestLossStreak.count
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
            THE LEAGUE RECORD BOOK
          </p>

          <h1>Records</h1>

          <p>
            The biggest performances,
            strongest seasons, career
            leaders, playoff records,
            and longest streaks in
            Dirty P history.
          </p>
        </div>

        <div className="owners-count">
          <strong>
            {seasonYears.length}
          </strong>

          <span>
            SEASONS
          </span>
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

      {/* WEEKLY RECORDS */}

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
            team={
              highestRegularScore.teamName
            }
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
            team={
              lowestRegularScore.teamName
            }
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
            team={
              highestOverallScore.teamName
            }
            note={formatWeek(
              highestOverallScore.season,
              highestOverallScore.week
            )}
          />
        )}

        {biggestRegularWin && (
          <RecordCard
            label="BIGGEST REGULAR-SEASON WIN"
            value={`+${formatScore(
              biggestRegularWin.margin
            )}`}
            owner={getMatchupDescription(
              biggestRegularWin.game,
              ownerMap
            )}
            team={getFinalScore(
              biggestRegularWin.game
            )}
            note={formatWeek(
              biggestRegularWin.game.season_year,
              biggestRegularWin.game.matchup_period
            )}
          />
        )}

        {closestRegularGame && (
          <RecordCard
            label="CLOSEST REGULAR-SEASON GAME"
            value={getFinalScore(
              closestRegularGame.game
            )}
            owner={getMatchupDescription(
              closestRegularGame.game,
              ownerMap
            )}
            note={formatWeek(
              closestRegularGame.game.season_year,
              closestRegularGame.game.matchup_period
            )}
            secondary={`Decided by ${formatScore(
              closestRegularGame.margin
            )} points`}
          />
        )}

      </RecordSection>

      {/* SEASON RECORDS */}

      <RecordSection
        eyebrow="SINGLE SEASON"
        title="Season Records"
        subtitle="Best record requires a completed season"
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
            team={
              bestSeasonRecord.teamName
            }
            note={`${bestSeasonRecord.season} Season`}
            secondary={`${(
              bestSeasonRecord.winPct * 100
            ).toFixed(1)}% winning percentage`}
          />
        )}

        {mostWinsSeason && (
          <RecordCard
            label="MOST REGULAR-SEASON WINS"
            value={
              mostWinsSeason.wins
            }
            owner={getOwnerName(
              ownerMap,
              mostWinsSeason.ownerId
            )}
            team={
              mostWinsSeason.teamName
            }
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
            team={
              mostPointsSeason.teamName
            }
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
            team={
              bestAverageSeason.teamName
            }
            note={`${bestAverageSeason.season} Season`}
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
            value={
              mostCareerWins.wins
            }
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
            secondary="Minimum 20 regular-season games"
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
            value={
              mostPlayoffWins.wins
            }
            owner={getOwnerName(
              ownerMap,
              mostPlayoffWins.ownerId
            )}
            note={formatRecord(
              mostPlayoffWins.wins,
              mostPlayoffWins.losses,
              mostPlayoffWins.ties
            )}
            secondary="Includes third-place games"
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
            value={formatScore(
              highestPlayoffScore.score
            )}
            owner={getOwnerName(
              ownerMap,
              highestPlayoffScore.ownerId
            )}
            team={
              highestPlayoffScore.teamName
            }
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
            value={getFinalScore(
              closestChampionship.game
            )}
            owner={getMatchupDescription(
              closestChampionship.game,
              ownerMap
            )}
            note={`${closestChampionship.game.season_year} Championship`}
            secondary={`Decided by ${formatScore(
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
            owner={getMatchupDescription(
              biggestChampionship.game,
              ownerMap
            )}
            team={getFinalScore(
              biggestChampionship.game
            )}
            note={`${biggestChampionship.game.season_year} Championship`}
          />
        )}

        {highestCombinedChampionship && (
          <RecordCard
            label="HIGHEST-SCORING CHAMPIONSHIP"
            value={formatScore(
              highestCombinedChampionship.combined
            )}
            owner={getMatchupDescription(
              highestCombinedChampionship.game,
              ownerMap
            )}
            team={getFinalScore(
              highestCombinedChampionship.game
            )}
            note={`${highestCombinedChampionship.game.season_year} Championship`}
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
            note={
              `${longestWinStreak.start.season} W${longestWinStreak.start.week}` +
              ` – ${longestWinStreak.end.season} W${longestWinStreak.end.week}`
            }
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
            note={
              `${longestLossStreak.start.season} W${longestLossStreak.start.week}` +
              ` – ${longestLossStreak.end.season} W${longestLossStreak.end.week}`
            }
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

      {/* STYLES */}

      <style>{`
        .dp-record-card {
          display: flex;
          flex-direction: column;
          gap: 9px;
          padding: 21px;
          min-width: 0;
          height: 100%;
          overflow: hidden;
        }

        .dp-record-card .owner-status {
          color: #d8b475;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          line-height: 1.5;
        }

        .dp-record-value {
          margin: 5px 0;
          color: #f4f6f9;
          font-size: clamp(21px, 3vw, 31px);
          line-height: 1.2;
          font-weight: 900;
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
          color: #a8b3c1;
          font-size: 12px;
          line-height: 1.6;
        }

        .dp-record-note {
          margin: 4px 0 0;
          color: #d5b477;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.5;
        }

        .dp-record-secondary {
          margin: 0;
          color: #9eacbb;
          font-size: 11px;
          line-height: 1.5;
        }

        @media (max-width: 600px) {
          .dp-record-card {
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
