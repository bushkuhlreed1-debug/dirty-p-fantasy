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
  const games = num(wins) + num(losses) + num(ties);

  if (!games) return 0;

  return ((num(wins) + num(ties) * 0.5) / games) * 100;
}

// ======================================================
// GAME CLASSIFICATION
// ======================================================

function getGameType(game) {
  const type = String(
    game.matchup_type || ""
  ).trim().toLowerCase();

  const tier = String(
    game.playoff_tier || ""
  ).trim().toLowerCase();

  // Third-place games always count as playoff games,
  // even when ESPN calls their tier a consolation ladder.

  if (
    game.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("third place") ||
    type.includes("third-place")
  ) {
    return "playoff";
  }

  // Actual consolation games do not earn GOAT points.

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
    type.includes("playoff") ||
    type.includes("championship") ||
    type.includes("semifinal") ||
    tier.includes("winners_bracket") ||
    tier.includes("winner") ||
    tier.includes("championship")
  ) {
    return "playoff";
  }

  return "regular";
}

// ======================================================
// VALID GAME RESULTS
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
  if (!hasValidScores(game)) {
    return false;
  }

  const winner = String(
    game.winner || ""
  ).trim().toUpperCase();

  if (
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "").toUpperCase() === "FINAL" ||
    ["HOME", "AWAY", "TIE"].includes(winner)
  ) {
    return true;
  }

  if (completedKeys.has(getGameKey(game))) {
    return true;
  }

  // Historical imported games may not have
  // explicit completion fields.

  if (num(game.season_year) < num(currentSeason)) {
    return (
      num(game.home_score) !== 0 ||
      num(game.away_score) !== 0
    );
  }

  return false;
}

function getWinnerOwnerId(game) {
  const winner = String(
    game.winner || ""
  ).trim().toUpperCase();

  if (winner === "HOME") {
    return Number(game.home_owner_id);
  }

  if (winner === "AWAY") {
    return Number(game.away_owner_id);
  }

  if (winner === "TIE") {
    return null;
  }

  if (!hasValidScores(game)) {
    return null;
  }

  const homeScore = num(game.home_score);
  const awayScore = num(game.away_score);

  if (homeScore > awayScore) {
    return Number(game.home_owner_id);
  }

  if (awayScore > homeScore) {
    return Number(game.away_owner_id);
  }

  return null;
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
          <span>GOAT</span>
        </div>
      </div>

      {/* REGULAR-SEASON RECORD */}

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

      {/* POSTSEASON RESUME */}

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
          <strong>{owner.playoffGameWins}</strong>
          <span>Playoff Wins</span>
        </div>
      </div>

      {/* LONGEVITY */}

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
// GOAT SCORING FORMULA CARD
// ======================================================

function ScoringCard() {
  return (
    <article className="owner-card">
      <div className="owner-card-top">
        <div>
          <span className="owner-status">
            HOW THE RANKINGS WORK
          </span>

          <h3>GOAT Score</h3>

          <p className="owner-team-name">
            GOAT status is subjective. This formula
            rewards sustained regular-season success
            while placing greater value on winning in
            the postseason and competing for
            championships.
          </p>
        </div>
      </div>

      <div className="owner-stats-grid">
        <div>
          <strong>
            +{GOAT_POINTS.REGULAR_WIN}
          </strong>
          <span>Reg. Win</span>
        </div>

        <div>
          <strong>
            +{GOAT_POINTS.PLAYOFF_APPEARANCE}
          </strong>
          <span>Playoff App.</span>
        </div>

        <div>
          <strong>
            +{GOAT_POINTS.PLAYOFF_WIN}
          </strong>
          <span>Playoff Win</span>
        </div>

        <div>
          <strong>
            +{GOAT_POINTS.CHAMPIONSHIP_APPEARANCE}
          </strong>
          <span>Finals App.</span>
        </div>
      </div>

      <div className="owner-record">
        <div>
          <strong>
            +{GOAT_POINTS.CHAMPIONSHIP}
          </strong>
          <span>CHAMPIONSHIP</span>
        </div>

        <div>
          <strong>LIVE</strong>
          <span>UPDATED EACH SEASON</span>
        </div>
      </div>

      <div className="owner-card-bottom">
        <span>
          Consolation wins do not earn GOAT points.
          Championship-bracket victories earn four
          points each, including third-place games.
        </span>

        <strong>TRANSPARENT FORMULA</strong>
      </div>
    </article>
  );
}

// ======================================================
// GOAT PAGE
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
  // CURRENT WEEK
  // ====================================================

  const currentCompletedWeeks =
    completedCurrentMatchups
      .map((game) => Number(game.matchup_period))
      .filter(
        (week) => Number.isFinite(week) && week > 0
      );

  const latestCompletedWeek =
    currentCompletedWeeks.length
      ? Math.max(...currentCompletedWeeks)
      : 0;

  // ====================================================
  // VERIFIED COMPLETED MATCHUPS
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
  // CHAMPIONSHIP-BRACKET WINS
  // ====================================================

  const playoffWins = new Map();
  const playoffLosses = new Map();
  const playoffTies = new Map();

  for (const game of completedGames) {
    if (getGameType(game) !== "playoff") {
      continue;
    }

    const homeId = Number(game.home_owner_id);
    const awayId = Number(game.away_owner_id);

    const winnerId = getWinnerOwnerId(game);

    if (!winnerId) {
      playoffTies.set(
        homeId,
        (playoffTies.get(homeId) || 0) + 1
      );

      playoffTies.set(
        awayId,
        (playoffTies.get(awayId) || 0) + 1
      );

      continue;
    }

    const loserId =
      winnerId === homeId ? awayId : homeId;

    playoffWins.set(
      winnerId,
      (playoffWins.get(winnerId) || 0) + 1
    );

    playoffLosses.set(
      loserId,
      (playoffLosses.get(loserId) || 0) + 1
    );
  }

  // ====================================================
  // BUILD OWNER GOAT RESUMES
  // ====================================================

  const rankings = owners.map((owner) => {
    const ownerId = Number(owner.id);

    const ownerSeasons = seasonResults.filter(
      (season) =>
        Number(season.owner_id) === ownerId
    );

    // REGULAR-SEASON CAREER RECORD

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

    const pointsAgainst = ownerSeasons.reduce(
      (total, season) =>
        total + num(season.points_against),
      0
    );

    // POSTSEASON ACCOMPLISHMENTS

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

    const playoffGameWins =
      playoffWins.get(ownerId) || 0;

    const playoffGameLosses =
      playoffLosses.get(ownerId) || 0;

    const playoffGameTies =
      playoffTies.get(ownerId) || 0;

    // CHAMPIONSHIP YEARS

    const championshipYears = ownerSeasons
      .filter(
        (season) =>
          Boolean(season.champion)
      )
      .map(
        (season) =>
          Number(season.season_year)
      )
      .sort((a, b) => a - b);

    // CAREER LENGTH

    const seasonYears = ownerSeasons
      .map(
        (season) =>
          Number(season.season_year)
      )
      .filter(Number.isFinite);

    const seasons = new Set(
      seasonYears
    ).size;

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

    const winPct = getWinPct(
      wins,
      losses,
      ties
    );

    // GOAT POINTS

    const regularWinPoints =
      wins * GOAT_POINTS.REGULAR_WIN;

    const playoffAppearancePoints =
      playoffAppearances *
      GOAT_POINTS.PLAYOFF_APPEARANCE;

    const playoffWinPoints =
      playoffGameWins *
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

      seasons,
      hasCurrentSeason,
      firstSeason,
      lastSeason,

      wins,
      losses,
      ties,

      pointsFor,
      pointsAgainst,
      winPct,

      playoffAppearances,
      playoffGameWins,
      playoffGameLosses,
      playoffGameTies,

      finalsAppearances,
      championships,
      championshipYears,

      regularWinPoints,
      playoffAppearancePoints,
      playoffWinPoints,
      finalsPoints,
      championshipPoints,

      goatScore,
    };
  });

  // ====================================================
  // RANKING ORDER
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
      b.playoffGameWins !==
      a.playoffGameWins
    ) {
      return (
        b.playoffGameWins -
        a.playoffGameWins
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
            LIVE ALL-TIME RANKINGS
          </p>

          <h1>GOAT Rankings</h1>

          <p>
            Every Dirty P owner ranked by career
            success, championships, postseason
            performance and sustained winning.
          </p>
        </div>

        <div className="owners-count">
          <strong>{rankings.length}</strong>
          <span>RANKED OWNERS</span>
        </div>
      </section>

      {/* NAVIGATION */}

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

      {/* GOAT SCORING FORMULA - FIRST */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE FORMULA
            </p>

            <h2>GOAT Scoring System</h2>
          </div>

          <span>
            Résumé Based
          </span>
        </div>

        <ScoringCard />
      </section>

      {/* COMPLETE GOAT RANKINGS - SECOND */}

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
