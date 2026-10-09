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
  const w = num(wins);
  const l = num(losses);
  const t = num(ties);

  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
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

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

// ======================================================
// QUALIFYING GOAT PLAYOFF GAMES
//
// ONLY THESE WINS COUNT:
//
// 1. Semifinal wins
// 2. Championship game wins
//
// NEVER COUNT:
//
// 1. Third-place games
// 2. Consolation bracket games
//
// A generic playoff game is treated as a semifinal
// only if its bracket classification supports the
// four-team championship bracket.
//
// Third-place classification always takes priority.
// ======================================================

function getGoatPlayoffRound(game) {
  const type = normalize(game.matchup_type);
  const tier = normalize(game.playoff_tier);

  const isThirdPlace =
    game.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("thirdplace") ||
    type.includes("3rd_place") ||
    type.includes("3rdplace") ||
    type.includes("bronze");

  if (isThirdPlace) {
    return null;
  }

  const isConsolation =
    game.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    type.includes("toilet") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet");

  if (isConsolation) {
    return null;
  }

  const isChampionship =
    game.is_championship === true ||
    type === "championship" ||
    type === "championship_game" ||
    type === "final" ||
    type === "finals" ||
    type === "title_game";

  if (isChampionship) {
    return "championship";
  }

  const isSemifinal =
    type.includes("semifinal") ||
    type.includes("semi_final") ||
    type === "opening_round" ||
    type === "first_round" ||
    type === "round_1";

  if (isSemifinal) {
    return "semifinal";
  }

  // Historical imports may label the opening round
  // simply as "playoff" rather than "semifinal".
  //
  // Within Dirty P's four-team championship bracket,
  // that generic first round is a semifinal.
  //
  // This deliberately does NOT classify every
  // is_playoff=true game as a qualifying victory.

  const genericChampionshipBracket =
    type === "playoff" ||
    type === "playoffs" ||
    type === "winners_bracket" ||
    type === "winner_bracket" ||
    type === "winners_bracket_game";

  const supportedWinnerTier =
    tier === "winners_bracket" ||
    tier === "winner_bracket" ||
    tier === "championship_bracket";

  if (
    genericChampionshipBracket &&
    (
      supportedWinnerTier ||
      game.is_playoff === true
    )
  ) {
    return "semifinal";
  }

  return null;
}

// ======================================================
// COMPLETED MATCHUP HELPERS
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

  const gameSeason = Number(game.season_year);
  const isHistorical =
    Number.isFinite(gameSeason) &&
    gameSeason < Number(currentSeason);

  // Historical imported games may contain an official
  // winner without an explicit completion flag.
  //
  // For live ESPN games, require a completed result.

  if (
    isHistorical &&
    ["HOME", "AWAY", "TIE"].includes(winner)
  ) {
    return true;
  }

  const isFinal =
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "")
      .trim()
      .toUpperCase() === "FINAL" ||
    completedKeys.has(getGameKey(game));

  if (!isFinal) {
    return false;
  }

  if (["HOME", "AWAY", "TIE"].includes(winner)) {
    return true;
  }

  return hasValidScores(game);
}

function getWinnerOwnerId(game) {
  const homeId = Number(game.home_owner_id);
  const awayId = Number(game.away_owner_id);

  if (
    !Number.isFinite(homeId) ||
    !Number.isFinite(awayId) ||
    homeId <= 0 ||
    awayId <= 0 ||
    homeId === awayId
  ) {
    return null;
  }

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
// COUNT ACTUAL SEMIFINAL AND CHAMPIONSHIP WINS
//
// The returned map is the ONLY source used for:
//
// 1. The owner card's displayed number
// 2. The +4 GOAT points per qualifying victory
// ======================================================

function calculateQualifyingWins(games) {
  const records = new Map();

  for (const game of games) {
    const round = getGoatPlayoffRound(game);

    if (
      round !== "semifinal" &&
      round !== "championship"
    ) {
      continue;
    }

    const winnerId = getWinnerOwnerId(game);

    if (!winnerId) {
      continue;
    }

    const existing = records.get(winnerId) || {
      semifinalWins: 0,
      championshipWins: 0,
      total: 0,
    };

    if (round === "semifinal") {
      existing.semifinalWins++;
    }

    if (round === "championship") {
      existing.championshipWins++;
    }

    existing.total =
      existing.semifinalWins +
      existing.championshipWins;

    records.set(winnerId, existing);
  }

  return records;
}

// ======================================================
// GOAT OWNER CARD
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
      {/* HEADER */}

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

      {/* REGULAR SEASON */}

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

          <span>
            Semifinal/Championship Wins
          </span>
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

      {/* FOOTER */}

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
        Points are cumulative. Only semifinal and
        championship victories earn playoff-win points.
        Third-place and consolation victories earn zero
        GOAT playoff-win points.
      </div>

      <style>{`
        .goat-formula-grid {
          display: grid;
          grid-template-columns:
            repeat(5, minmax(0, 1fr));
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
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
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
// MAIN GOAT PAGE
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
  // CURRENT COMPLETED WEEK
  // ====================================================

  const completedWeeks = completedCurrentMatchups
    .filter(
      (game) =>
        game.completed === true ||
        game.is_final === true ||
        String(game.status || "")
          .toUpperCase() === "FINAL"
    )
    .map((game) => Number(game.matchup_period))
    .filter(
      (week) =>
        Number.isFinite(week) && week > 0
    );

  const latestCompletedWeek = completedWeeks.length
    ? Math.max(...completedWeeks)
    : 0;

  // ====================================================
  // COMPLETED MATCHUPS
  // ====================================================

  const completedKeys = new Set(
    completedCurrentMatchups
      .filter(
        (game) =>
          game.completed === true ||
          game.is_final === true ||
          String(game.status || "")
            .toUpperCase() === "FINAL"
      )
      .map(getGameKey)
  );

  // Historical games come from Supabase.
  // Completed current-season games come from ESPN.
  // Use both without including unfinished matchups.

  const completedGames = matchups.filter(
    (game) =>
      isCompletedGame(
        game,
        currentSeason,
        completedKeys
      )
  );

  // ====================================================
  // ACTUAL SEMIFINAL / CHAMPIONSHIP VICTORIES
  //
  // These exact counts power BOTH:
  //
  // - Each owner's displayed win statistic
  // - Each owner's GOAT playoff-win points
  // ====================================================

  const qualifyingWins = calculateQualifyingWins(
    completedGames
  );

  // ====================================================
  // BUILD OWNER STATISTICS
  // ====================================================

  const rankings = owners.map((owner) => {
    const ownerId = Number(owner.id);

    const ownerSeasons = seasonResults.filter(
      (season) =>
        Number(season.owner_id) === ownerId
    );

    // REGULAR-SEASON RECORD

    const wins = ownerSeasons.reduce(
      (total, season) =>
        total + num(season.wins),
      0
    );

    const losses = ownerSeasons.reduce(
      (total, season) =>
        total + num(season.losses),
      0
    );

    const ties = ownerSeasons.reduce(
      (total, season) =>
        total + num(season.ties),
      0
    );

    const pointsFor = ownerSeasons.reduce(
      (total, season) =>
        total + num(season.points_for),
      0
    );

    // POSTSEASON APPEARANCES

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

    // QUALIFYING PLAYOFF WINS

    const ownerQualifyingWins =
      qualifyingWins.get(ownerId) || {
        semifinalWins: 0,
        championshipWins: 0,
        total: 0,
      };

    const semifinalWins =
      ownerQualifyingWins.semifinalWins;

    const championshipGameWins =
      ownerQualifyingWins.championshipWins;

    const qualifyingPlayoffWins =
      semifinalWins + championshipGameWins;

    // CAREER SEASONS

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

    // ==================================================
    // GOAT POINTS
    // ==================================================

    const regularWinPoints =
      wins * GOAT_POINTS.REGULAR_WIN;

    const playoffAppearancePoints =
      playoffAppearances *
      GOAT_POINTS.PLAYOFF_APPEARANCE;

    const playoffWinPoints =
      qualifyingPlayoffWins *
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

      semifinalWins,
      championshipGameWins,
      qualifyingPlayoffWins,

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

    if (
      b.finalsAppearances !==
      a.finalsAppearances
    ) {
      return (
        b.finalsAppearances -
        a.finalsAppearances
      );
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

    if (
      b.playoffAppearances !==
      a.playoffAppearances
    ) {
      return (
        b.playoffAppearances -
        a.playoffAppearances
      );
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

      {/* SITE HEADER */}

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
