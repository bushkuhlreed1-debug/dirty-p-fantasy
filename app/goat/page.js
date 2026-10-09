import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";

export const dynamic = "force-dynamic";

// ======================================================
// GOAT SCORING SYSTEM
// ======================================================

const GOAT_POINTS = {
  REGULAR_WIN: 1,
  PLAYOFF_APPEARANCE: 3,
  PLAYOFF_WIN: 4,
  CHAMPIONSHIP_APPEARANCE: 8,
  CHAMPIONSHIP: 12,
};

// ======================================================
// HELPERS
// ======================================================

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatRecord(wins, losses, ties = 0) {
  return num(ties) > 0
    ? `${num(wins)}-${num(losses)}-${num(ties)}`
    : `${num(wins)}-${num(losses)}`;
}

function formatNumber(value) {
  return num(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function getWinPct(wins, losses, ties = 0) {
  const total = num(wins) + num(losses) + num(ties);

  if (!total) return 0;

  return ((num(wins) + num(ties) * 0.5) / total) * 100;
}

// ======================================================
// GOAT PLAYOFF GAME CLASSIFICATION
//
// Only semifinal and championship game victories
// count toward GOAT playoff-win points.
//
// Third-place games and consolation games do not
// earn GOAT playoff-win points.
//
// Third-place games can still count toward historical
// playoff W-L records on other pages.
// ======================================================

function getGoatGameType(game) {
  const type = String(game.matchup_type || "")
    .trim()
    .toLowerCase();

  const tier = String(game.playoff_tier || "")
    .trim()
    .toLowerCase();

  // Third place must be checked first, regardless
  // of other playoff flags.

  if (
    game.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("third place") ||
    type.includes("third-place")
  ) {
    return "third_place";
  }

  // Actual consolation games.

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

  // Championship game.

  if (
    game.is_championship === true ||
    type.includes("championship")
  ) {
    return "playoff";
  }

  // Semifinal / opening round.

  if (
    type.includes("semifinal") ||
    type.includes("semi_final") ||
    type.includes("semi-final") ||
    type.includes("playoff") ||
    tier.includes("winners_bracket") ||
    tier.includes("winner") ||
    game.is_playoff === true
  ) {
    return "playoff";
  }

  return "regular";
}

// ======================================================
// COMPLETED GAME HELPERS
// ======================================================

function hasValidScores(game) {
  return (
    game.home_score !== null &&
    game.home_score !== undefined &&
    game.home_score !== "" &&
    game.away_score !== null &&
    game.away_score !== undefined &&
    game.away_score !== "" &&
    Number.isFinite(Number(game.home_score)) &&
    Number.isFinite(Number(game.away_score))
  );
}

function getGameKey(game) {
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
  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  // Recorded official winner.

  if (["HOME", "AWAY", "TIE"].includes(winner)) {
    return true;
  }

  if (!hasValidScores(game)) {
    return false;
  }

  if (
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "").toUpperCase() === "FINAL"
  ) {
    return true;
  }

  if (completedKeys.has(getGameKey(game))) {
    return true;
  }

  // Historical ESPN imports may not have completion
  // flags, but do contain final scores.

  if (num(game.season_year) < num(currentSeason)) {
    return (
      num(game.home_score) !== 0 ||
      num(game.away_score) !== 0
    );
  }

  return false;
}

function getWinnerOwnerId(game) {
  const homeId = Number(game.home_owner_id);
  const awayId = Number(game.away_owner_id);

  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "HOME") return homeId;
  if (winner === "AWAY") return awayId;
  if (winner === "TIE") return null;

  if (!hasValidScores(game)) {
    return null;
  }

  const homeScore = num(game.home_score);
  const awayScore = num(game.away_score);

  if (homeScore > awayScore) return homeId;
  if (awayScore > homeScore) return awayId;

  return null;
}

// ======================================================
// OWNER RANKING CARD
// ======================================================

function GoatOwnerCard({
  owner,
  rank,
  currentSeason,
}) {
  const limitedHistory = owner.seasons <= 2;

  const historyText =
    owner.seasons === 0
      ? "No league history"
      : limitedHistory
      ? `${owner.seasons} season${
          owner.seasons === 1 ? "" : "s"
        } · Limited league history`
      : `${owner.firstSeason}–${owner.lastSeason}`;

  return (
    <article className="owner-card">
      <div className="owner-card-top">
        <div>
          <span className="owner-status">
            {rank === 1
              ? "👑 THE GOAT · #1 ALL-TIME"
              : `#${rank} ALL-TIME`}
          </span>

          <h3>{owner.name}</h3>

          <p className="owner-team-name">
            {historyText}
          </p>
        </div>

        <div className="owner-title-count">
          <strong>{owner.goatScore}</strong>
          <span>GOAT POINTS</span>
        </div>
      </div>

      {/* CAREER RECORD */}

      <div className="owner-record">
        <div>
          <strong>
            {formatRecord(
              owner.wins,
              owner.losses,
              owner.ties
            )}
          </strong>

          <span>CAREER RECORD</span>
        </div>

        <div>
          <strong>
            {owner.winPct.toFixed(1)}%
          </strong>

          <span>WIN %</span>
        </div>
      </div>

      {/* POSTSEASON ACHIEVEMENTS */}

      <div className="owner-stats-grid">
        <div>
          <strong>{owner.championships}</strong>
          <span>Titles</span>
        </div>

        <div>
          <strong>{owner.finalsAppearances}</strong>
          <span>Finals</span>
        </div>

        <div>
          <strong>{owner.playoffAppearances}</strong>
          <span>Playoffs</span>
        </div>

        <div>
          <strong>
            {owner.qualifyingPlayoffWins}
          </strong>
          <span>Playoff Wins</span>
        </div>
      </div>

      {/* CAREER LONGEVITY */}

      <div className="owner-record">
        <div>
          <strong>{owner.seasons}</strong>
          <span>SEASONS</span>
        </div>

        <div>
          <strong>
            {formatNumber(owner.pointsFor)}
          </strong>

          <span>CAREER POINTS</span>
        </div>
      </div>

      {/* OWNER PROFILE */}

      <div className="owner-card-bottom">
        <span>
          {owner.hasCurrentSeason
            ? `${currentSeason} season included`
            : `${owner.seasons} league seasons`}
        </span>

        <Link href={`/owners/${owner.id}`}>
          <strong>View Owner →</strong>
        </Link>
      </div>
    </article>
  );
}

// ======================================================
// GOAT SCORING FORMULA
//
// Displays all five scoring categories together.
// ======================================================

function ScoringCard() {
  const categories = [
    {
      points: GOAT_POINTS.REGULAR_WIN,
      label: "Regular-Season Win",
    },
    {
      points: GOAT_POINTS.PLAYOFF_APPEARANCE,
      label: "Playoff Appearance",
    },
    {
      points: GOAT_POINTS.PLAYOFF_WIN,
      label: "Playoff Win",
      description: "Semifinals and Championship",
    },
    {
      points: GOAT_POINTS.CHAMPIONSHIP_APPEARANCE,
      label: "Finals Appearance",
    },
    {
      points: GOAT_POINTS.CHAMPIONSHIP,
      label: "Championship Title",
    },
  ];

  return (
    <article className="owner-card">
      <div className="owner-card-top">
        <div>
          <span className="owner-status">
            HOW THE RANKINGS WORK
          </span>

          <h3>GOAT Score</h3>

          <p className="owner-team-name">
            A points-based ranking that rewards
            regular-season success, playoff victories,
            championship appearances, and titles.
          </p>
        </div>
      </div>

      <div className="goat-formula-grid">
        {categories.map((category) => (
          <div
            key={category.label}
            className="goat-formula-item"
          >
            <strong>
              +{category.points}
            </strong>

            <span className="goat-formula-label">
              {category.label}
            </span>

            {category.description && (
              <span className="goat-formula-description">
                ({category.description})
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="goat-formula-footer">
        Points are cumulative. Third-place and
        consolation wins do not earn GOAT
        playoff-win points.
      </div>

      <style>{`
        .goat-formula-grid {
          display: grid;
          grid-template-columns: repeat(
            5,
            minmax(0, 1fr)
          );
          gap: 10px;
          padding: 20px;
        }

        .goat-formula-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 115px;
          padding: 18px 10px;
          background: #222a35;
          border: 1px solid #34404d;
          border-radius: 12px;
          text-align: center;
        }

        .goat-formula-item strong {
          color: #e9bd67;
          font-size: 28px;
          font-weight: 900;
          line-height: 1.1;
          margin-bottom: 10px;
        }

        .goat-formula-label {
          color: #f2f4f7;
          font-size: 12px;
          font-weight: 750;
          line-height: 1.35;
        }

        .goat-formula-description {
          color: #abb6c5;
          font-size: 10px;
          line-height: 1.4;
          margin-top: 5px;
        }

        .goat-formula-footer {
          border-top: 1px solid #303947;
          padding: 16px 20px;
          color: #aeb8c5;
          font-size: 12px;
          line-height: 1.6;
          text-align: center;
        }

        @media (max-width: 850px) {
          .goat-formula-grid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }

          .goat-formula-item:last-child {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 450px) {
          .goat-formula-grid {
            gap: 8px;
            padding: 12px;
          }

          .goat-formula-item {
            min-height: 105px;
            padding: 12px 7px;
          }

          .goat-formula-item strong {
            font-size: 25px;
          }

          .goat-formula-label {
            font-size: 11px;
          }
        }
      `}</style>
    </article>
  );
}

// ======================================================
// MAIN GOAT RANKINGS PAGE
// ======================================================

export default async function GoatPage() {
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

                <h3>GOAT Rankings</h3>

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
    seasonResults = [],
    completedCurrentMatchups = [],
    unmatchedEspnOwners = [],
  } = leagueData;

  // ====================================================
  // MOST RECENT COMPLETED WEEK
  // ====================================================

  const completedWeeks = completedCurrentMatchups
    .filter(
      (game) =>
        game.completed === true ||
        game.is_final === true
    )
    .map((game) =>
      Number(game.matchup_period)
    )
    .filter(
      (week) =>
        Number.isFinite(week) && week > 0
    );

  const latestCompletedWeek = completedWeeks.length
    ? Math.max(...completedWeeks)
    : 0;

  // ====================================================
  // VERIFIED COMPLETED GAMES
  // ====================================================

  const completedKeys = new Set(
    completedCurrentMatchups.map(getGameKey)
  );

  const completedGames = matchups.filter(
    (game) =>
      isCompletedGame(
        game,
        currentSeason,
        completedKeys
      )
  );

  // ====================================================
  // GOAT-QUALIFYING PLAYOFF WINS
  //
  // Semifinals and championship game only.
  // No third-place or consolation wins.
  // ====================================================

  const qualifyingPlayoffWins = new Map();

  for (const game of completedGames) {
    if (getGoatGameType(game) !== "playoff") {
      continue;
    }

    const winnerId = getWinnerOwnerId(game);

    if (!winnerId) {
      continue;
    }

    qualifyingPlayoffWins.set(
      winnerId,
      (qualifyingPlayoffWins.get(winnerId) || 0) + 1
    );
  }

  // ====================================================
  // BUILD OWNER GOAT STATISTICS
  // ====================================================

  const rankings = owners.map((owner) => {
    const ownerId = Number(owner.id);

    const ownerSeasons = seasonResults.filter(
      (season) =>
        Number(season.owner_id) === ownerId
    );

    // REGULAR-SEASON RECORD

    const wins = ownerSeasons.reduce(
      (sum, season) =>
        sum + num(season.wins),
      0
    );

    const losses = ownerSeasons.reduce(
      (sum, season) =>
        sum + num(season.losses),
      0
    );

    const ties = ownerSeasons.reduce(
      (sum, season) =>
        sum + num(season.ties),
      0
    );

    const pointsFor = ownerSeasons.reduce(
      (sum, season) =>
        sum + num(season.points_for),
      0
    );

    // POSTSEASON ACHIEVEMENTS

    const playoffAppearances =
      ownerSeasons.filter(
        (season) =>
          Boolean(season.playoff_appearance)
      ).length;

    const finalsAppearances =
      ownerSeasons.filter(
        (season) =>
          Boolean(season.championship_appearance)
      ).length;

    const championships =
      ownerSeasons.filter(
        (season) =>
          Boolean(season.champion)
      ).length;

    const ownerPlayoffWins =
      qualifyingPlayoffWins.get(ownerId) || 0;

    // CAREER LENGTH

    const seasonYears = ownerSeasons
      .map((season) =>
        Number(season.season_year)
      )
      .filter(Number.isFinite);

    const seasons = new Set(seasonYears).size;

    const hasCurrentSeason =
      seasonYears.includes(
        Number(currentSeason)
      );

    const firstSeason = seasonYears.length
      ? Math.min(...seasonYears)
      : null;

    const lastSeason = seasonYears.length
      ? Math.max(...seasonYears)
      : null;

    const winPct = getWinPct(wins, losses, ties);

    // GOAT POINT CALCULATION

    const regularWinPoints =
      wins * GOAT_POINTS.REGULAR_WIN;

    const playoffAppearancePoints =
      playoffAppearances *
      GOAT_POINTS.PLAYOFF_APPEARANCE;

    const playoffWinPoints =
      ownerPlayoffWins *
      GOAT_POINTS.PLAYOFF_WIN;

    const finalsPoints =
      finalsAppearances *
      GOAT_POINTS.CHAMPIONSHIP_APPEARANCE;

    const championshipPoints =
      championships *
      GOAT_POINTS.CHAMPIONSHIP;

    const goatScore =
      regularWinPoints +
      playoffAppearancePoints +
      playoffWinPoints +
      finalsPoints +
      championshipPoints;

    return {
      id: owner.id,
      name: owner.name,

      wins,
      losses,
      ties,
      pointsFor,
      winPct,

      playoffAppearances,
      finalsAppearances,
      championships,
      qualifyingPlayoffWins: ownerPlayoffWins,

      seasons,
      hasCurrentSeason,
      firstSeason,
      lastSeason,

      regularWinPoints,
      playoffAppearancePoints,
      playoffWinPoints,
      finalsPoints,
      championshipPoints,

      goatScore,
    };
  });

  // ====================================================
  // RANK OWNERS
  // ====================================================

  rankings.sort((a, b) => {
    if (b.goatScore !== a.goatScore) {
      return b.goatScore - a.goatScore;
    }

    if (b.championships !== a.championships) {
      return b.championships - a.championships;
    }

    if (b.finalsAppearances !== a.finalsAppearances) {
      return b.finalsAppearances - a.finalsAppearances;
    }

    if (
      b.qualifyingPlayoffWins !==
      a.qualifyingPlayoffWins
    ) {
      return (
        b.qualifyingPlayoffWins -
        a.qualifyingPlayoffWins
      );
    }

    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }

    if (b.playoffAppearances !== a.playoffAppearances) {
      return b.playoffAppearances - a.playoffAppearances;
    }

    if (b.winPct !== a.winPct) {
      return b.winPct - a.winPct;
    }

    if (b.pointsFor !== a.pointsFor) {
      return b.pointsFor - a.pointsFor;
    }

    return a.name.localeCompare(b.name);
  });

  // ====================================================
  // PAGE RENDER
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

      {/* PAGE INTRODUCTION */}

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            LIVE ALL-TIME RANKINGS
          </p>

          <h1>GOAT Rankings</h1>

          <p>
            Every Dirty P owner ranked by career
            success, championships, postseason
            performance, and sustained winning.
          </p>
        </div>

        <div className="owners-count">
          <strong>{rankings.length}</strong>
          <span>RANKED OWNERS</span>
        </div>
      </section>

      {/* PAGE NAVIGATION */}

      <nav className="page-nav">
        <Link href="/">
          ← Home
        </Link>

        <span>
          {latestCompletedWeek > 0
            ? `Through ${currentSeason} Week ${latestCompletedWeek}`
            : `${currentSeason} Season`}
        </span>
      </nav>

      {/* ESPN OWNER MAPPING WARNING */}

      {unmatchedEspnOwners.length > 0 && (
        <section className="owners-section">
          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">
                  ESPN OWNER MATCH WARNING
                </span>

                <h3>
                  Some current owners could not be matched
                </h3>

                <p className="owner-team-name">
                  {unmatchedEspnOwners
                    .map(
                      (owner) =>
                        `${owner.ownerName} (${owner.teamName})`
                    )
                    .join(", ")}
                </p>
              </div>
            </div>
          </article>
        </section>
      )}

      {/* GOAT SCORING SYSTEM FIRST */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE FORMULA
            </p>

            <h2>GOAT Scoring System</h2>
          </div>

          <span>Résumé Based</span>
        </div>

        <ScoringCard />
      </section>

      {/* COMPLETE GOAT RANKINGS SECOND */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              ALL-TIME ORDER
            </p>

            <h2>Complete GOAT Rankings</h2>
          </div>

          <span>
            Updated Throughout {currentSeason}
          </span>
        </div>

        <div className="owners-grid">
          {rankings.map((owner, index) => (
            <GoatOwnerCard
              key={owner.id}
              owner={owner}
              rank={index + 1}
              currentSeason={currentSeason}
            />
          ))}
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
