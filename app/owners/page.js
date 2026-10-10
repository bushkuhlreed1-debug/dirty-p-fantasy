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

function formatRecord(wins, losses, ties = 0) {
  const w = num(wins);
  const l = num(losses);
  const t = num(ties);

  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function formatPercentage(wins, losses, ties = 0) {
  const total = num(wins) + num(losses) + num(ties);

  if (total === 0) return "0.0";

  return (
    ((num(wins) + num(ties) * 0.5) / total) *
    100
  ).toFixed(1);
}

function formatPoints(value) {
  return num(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ======================================================
// POSTSEASON CLASSIFICATION
//
// IMPORTANT:
//
// Third-place games ALWAYS count as playoff games,
// even when ESPN labels the bracket
// WINNERS_CONSOLATION_LADDER.
//
// Actual consolation games remain separate.
// ======================================================

function getGameType(game) {
  const matchupType = String(
    game.matchup_type || ""
  )
    .trim()
    .toLowerCase();

  const playoffTier = String(
    game.playoff_tier || ""
  )
    .trim()
    .toLowerCase();

  // THIRD PLACE COUNTS AS PLAYOFF

  if (
    game.is_third_place === true ||
    matchupType.includes("third_place") ||
    matchupType.includes("third place") ||
    matchupType.includes("third-place")
  ) {
    return "playoff";
  }

  // ACTUAL CONSOLATION GAMES

  if (
    game.is_consolation === true ||
    matchupType.includes("consolation") ||
    matchupType.includes("loser") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("loser") ||
    playoffTier.includes("toilet")
  ) {
    return "consolation";
  }

  // PLAYOFF / CHAMPIONSHIP BRACKET

  if (
    game.is_playoff === true ||
    game.is_championship === true ||
    matchupType.includes("playoff") ||
    matchupType.includes("championship") ||
    matchupType.includes("semifinal") ||
    matchupType.includes("semi_final") ||
    playoffTier.includes("winner") ||
    playoffTier.includes("championship")
  ) {
    return "playoff";
  }

  return "regular";
}

// ======================================================
// COMPLETED GAME RESULT
//
// Use the official winner when available.
// Don't count incomplete games.
// ======================================================

function getGameResult(game, ownerId) {
  const id = Number(ownerId);
  const homeId = Number(game.home_owner_id);
  const awayId = Number(game.away_owner_id);

  const isHome = homeId === id;
  const isAway = awayId === id;

  if (!isHome && !isAway) {
    return null;
  }

  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "HOME") {
    return isHome ? "win" : "loss";
  }

  if (winner === "AWAY") {
    return isAway ? "win" : "loss";
  }

  if (winner === "TIE") {
    return "tie";
  }

  // If there is no official winner,
  // only use scores from confirmed final games.

  const isFinal =
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "").toUpperCase() ===
      "FINAL";

  if (!isFinal) {
    return null;
  }

  const homeScore = game.home_score;
  const awayScore = game.away_score;

  if (
    homeScore === null ||
    homeScore === undefined ||
    homeScore === "" ||
    awayScore === null ||
    awayScore === undefined ||
    awayScore === ""
  ) {
    return null;
  }

  const ownerScore = isHome
    ? num(homeScore)
    : num(awayScore);

  const opponentScore = isHome
    ? num(awayScore)
    : num(homeScore);

  if (ownerScore > opponentScore) {
    return "win";
  }

  if (ownerScore < opponentScore) {
    return "loss";
  }

  return "tie";
}

// ======================================================
// BUILD POSTSEASON RECORDS
//
// Every completed game counts once per owner.
//
// Third-place games are included in playoff records.
// Consolation games are counted separately.
// ======================================================

function buildPostseasonRecords(games, owners) {
  const records = new Map();

  for (const owner of owners) {
    records.set(Number(owner.id), {
      playoffWins: 0,
      playoffLosses: 0,
      playoffTies: 0,

      consolationWins: 0,
      consolationLosses: 0,
      consolationTies: 0,

      playoffGames: 0,
      consolationGames: 0,
    });
  }

  for (const game of games) {
    const type = getGameType(game);

    if (type === "regular") {
      continue;
    }

    const homeId = Number(game.home_owner_id);
    const awayId = Number(game.away_owner_id);

    if (
      !Number.isFinite(homeId) ||
      !Number.isFinite(awayId) ||
      homeId <= 0 ||
      awayId <= 0 ||
      homeId === awayId
    ) {
      continue;
    }

    for (const ownerId of [homeId, awayId]) {
      const record = records.get(ownerId);

      if (!record) {
        continue;
      }

      const result = getGameResult(game, ownerId);

      if (!result) {
        continue;
      }

      if (type === "playoff") {
        record.playoffGames++;

        if (result === "win") {
          record.playoffWins++;
        } else if (result === "loss") {
          record.playoffLosses++;
        } else {
          record.playoffTies++;
        }
      }

      if (type === "consolation") {
        record.consolationGames++;

        if (result === "win") {
          record.consolationWins++;
        } else if (result === "loss") {
          record.consolationLosses++;
        } else {
          record.consolationTies++;
        }
      }
    }
  }

  return records;
}

function emptyPostseasonRecord() {
  return {
    playoffWins: 0,
    playoffLosses: 0,
    playoffTies: 0,

    consolationWins: 0,
    consolationLosses: 0,
    consolationTies: 0,
  };
}

// ======================================================
// STAT ROW COMPONENT
// ======================================================

function StatRow({ label, value }) {
  return (
    <div className="dp-stat-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// ======================================================
// EXPANDABLE OWNER CATEGORY
//
// Native HTML details/summary works without
// JavaScript or a separate client component.
// ======================================================

function OwnerCategory({
  title,
  subtitle,
  children,
}) {
  return (
    <details className="dp-owner-category">
      <summary className="dp-owner-category-toggle">
        <div className="dp-category-info">
          <strong>{title}</strong>

          {subtitle && (
            <span>{subtitle}</span>
          )}
        </div>

        <span
          className="dp-category-chevron"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>

      <div className="dp-owner-category-content">
        {children}
      </div>
    </details>
  );
}

// ======================================================
// OWNER CARD
//
// Compact default view:
//
// - Owner name
// - Current team
// - Championship count
// - Regular-season record
// - All-game winning percentage
//
// Expandable categories:
//
// - Regular Season
// - Postseason
// - Achievements
// ======================================================

function OwnerCard({ owner }) {
  const regularRecord = formatRecord(
    owner.regularWins,
    owner.regularLosses,
    owner.regularTies
  );

  const playoffRecord = formatRecord(
    owner.playoffWins,
    owner.playoffLosses,
    owner.playoffTies
  );

  const consolationRecord = formatRecord(
    owner.consolationWins,
    owner.consolationLosses,
    owner.consolationTies
  );

  const allGameRecord = formatRecord(
    owner.allWins,
    owner.allLosses,
    owner.allTies
  );

  const allGameWinPct = formatPercentage(
    owner.allWins,
    owner.allLosses,
    owner.allTies
  );

  const regularWinPct = formatPercentage(
    owner.regularWins,
    owner.regularLosses,
    owner.regularTies
  );

  const yearsText =
    owner.firstSeason && owner.latestSeason
      ? `${owner.firstSeason}–${owner.latestSeason}`
      : "No seasons";

  return (
    <article className="owner-card dp-compact-owner-card">

      {/* OWNER HEADER */}

      <div className="owner-card-top">
        <div>
          <span className="owner-status">
            {owner.active
              ? "ACTIVE OWNER"
              : "FORMER OWNER"}
          </span>

          <h3>{owner.name}</h3>

          {owner.currentTeam && (
            <p className="owner-team-name">
              {owner.currentTeam}
            </p>
          )}
        </div>

        {owner.championships > 0 && (
          <div className="owner-title-count">
            <strong>
              {owner.championships}
            </strong>

            <span>
              {owner.championships === 1
                ? "TITLE"
                : "TITLES"}
            </span>
          </div>
        )}
      </div>

      {/* ALWAYS-VISIBLE HEADLINE STATS */}

      <div className="owner-record dp-owner-headline-stats">
        <div>
          <strong>
            {regularRecord}
          </strong>

          <span>
            REGULAR SEASON RECORD
          </span>
        </div>

        <div>
          <strong>
            {allGameWinPct}%
          </strong>

          <span>
            ALL-GAME WIN %
          </span>
        </div>
      </div>

      {/* EXPANDABLE CATEGORIES */}

      <div className="dp-owner-categories">

        {/* REGULAR SEASON */}

        <OwnerCategory
          title="Regular Season"
          subtitle="Career record and scoring"
        >
          <StatRow
            label="Wins"
            value={owner.regularWins}
          />

          <StatRow
            label="Losses"
            value={owner.regularLosses}
          />

          <StatRow
            label="Ties"
            value={owner.regularTies}
          />

          <StatRow
            label="Win Percentage"
            value={`${regularWinPct}%`}
          />

          <StatRow
            label="Points For"
            value={formatPoints(owner.pointsFor)}
          />

          <StatRow
            label="Points Against"
            value={formatPoints(owner.pointsAgainst)}
          />
        </OwnerCategory>

        {/* POSTSEASON */}

        <OwnerCategory
          title="Postseason"
          subtitle="Playoffs and consolation"
        >
          <StatRow
            label="Playoff Record"
            value={playoffRecord}
          />

          <StatRow
            label="Consolation Record"
            value={consolationRecord}
          />

          <StatRow
            label="Playoff Appearances"
            value={owner.playoffAppearances}
          />

          <StatRow
            label="Finals Appearances"
            value={owner.finalsAppearances}
          />
        </OwnerCategory>

        {/* ACHIEVEMENTS */}

        <OwnerCategory
          title="Achievements"
          subtitle="Championships and career history"
        >
          <StatRow
            label="Championships"
            value={owner.championships}
          />

          <StatRow
            label="Finals Appearances"
            value={owner.finalsAppearances}
          />

          <StatRow
            label="Seasons Played"
            value={owner.seasonsPlayed}
          />

          <StatRow
            label="First Season"
            value={owner.firstSeason || "—"}
          />

          <StatRow
            label="Latest Season"
            value={owner.latestSeason || "—"}
          />

          <StatRow
            label="All-Game Record"
            value={allGameRecord}
          />

          <StatRow
            label="All-Game Win %"
            value={`${allGameWinPct}%`}
          />
        </OwnerCategory>

      </div>

      {/* OWNER PROFILE LINK */}

      <div className="owner-card-bottom dp-owner-card-footer">
        <span>
          {yearsText}
        </span>

        <Link
          href={`/owners/${owner.id}`}
          className="dp-view-owner"
        >
          View Owner →
        </Link>
      </div>

    </article>
  );
}

// ======================================================
// MAIN OWNERS PAGE
// ======================================================

export default async function OwnersPage() {
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

                <h3>Owners</h3>

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
    currentTeams = [],
    seasonResults = [],
    matchups = [],
    completedCurrentMatchups = [],
    unmatchedEspnOwners = [],
  } = leagueData;

  // ====================================================
  // ACTIVE OWNERS
  // ====================================================

  const activeOwnerIds = new Set(
    currentTeams
      .map((team) => Number(team.owner_id))
      .filter(
        (id) =>
          Number.isFinite(id) &&
          id > 0
      )
  );

  const currentTeamMap = new Map(
    currentTeams.map((team) => [
      Number(team.owner_id),
      team,
    ])
  );

  // ====================================================
  // SEPARATE HISTORICAL AND CURRENT MATCHUPS
  //
  // Don't count current games twice.
  // ====================================================

  const historicalGames = matchups.filter(
    (game) =>
      Number(game.season_year) <
      Number(currentSeason)
  );

  const currentCompletedGames =
    completedCurrentMatchups.filter(
      (game) =>
        Number(game.season_year) ===
          Number(currentSeason) &&
        game.completed === true
    );

  // ====================================================
  // CALCULATE HISTORICAL POSTSEASON RECORDS
  // ====================================================

  const historicalPostseason =
    buildPostseasonRecords(
      historicalGames,
      owners
    );

  // ====================================================
  // CALCULATE CURRENT POSTSEASON RECORDS
  // ====================================================

  const currentPostseason =
    buildPostseasonRecords(
      currentCompletedGames,
      owners
    );

  // ====================================================
  // LATEST COMPLETED WEEK
  // ====================================================

  const completedWeeks =
    completedCurrentMatchups
      .filter(
        (game) =>
          game.completed === true
      )
      .map((game) =>
        Number(game.matchup_period)
      )
      .filter(
        (week) =>
          Number.isFinite(week) &&
          week > 0
      );

  const latestCompletedWeek =
    completedWeeks.length
      ? Math.max(...completedWeeks)
      : 0;

  // ====================================================
  // BUILD OWNER CAREER STATISTICS
  // ====================================================

  const ownerStats = owners.map((owner) => {
    const ownerId = Number(owner.id);

    const results = seasonResults.filter(
      (result) =>
        Number(result.owner_id) === ownerId
    );

    const currentTeam =
      currentTeamMap.get(ownerId);

    const active =
      activeOwnerIds.has(ownerId);

    // REGULAR SEASON

    const regularWins = results.reduce(
      (sum, result) =>
        sum + num(result.wins),
      0
    );

    const regularLosses = results.reduce(
      (sum, result) =>
        sum + num(result.losses),
      0
    );

    const regularTies = results.reduce(
      (sum, result) =>
        sum + num(result.ties),
      0
    );

    // CAREER POINTS

    const pointsFor = results.reduce(
      (sum, result) =>
        sum + num(result.points_for),
      0
    );

    const pointsAgainst = results.reduce(
      (sum, result) =>
        sum + num(result.points_against),
      0
    );

    // PLAYOFF APPEARANCES

    const playoffAppearances =
      results.filter(
        (result) =>
          Boolean(
            result.playoff_appearance
          )
      ).length;

    // FINALS APPEARANCES

    const finalsAppearances =
      results.filter(
        (result) =>
          Boolean(
            result.championship_appearance
          )
      ).length;

    // CHAMPIONSHIPS

    const championships =
      results.filter(
        (result) =>
          Boolean(result.champion)
      ).length;

    // HISTORICAL POSTSEASON

    const history =
      historicalPostseason.get(ownerId) ||
      emptyPostseasonRecord();

    // CURRENT POSTSEASON

    const current =
      currentPostseason.get(ownerId) ||
      emptyPostseasonRecord();

    // COMBINED PLAYOFF RECORD

    const playoffWins =
      history.playoffWins +
      current.playoffWins;

    const playoffLosses =
      history.playoffLosses +
      current.playoffLosses;

    const playoffTies =
      history.playoffTies +
      current.playoffTies;

    // COMBINED CONSOLATION RECORD

    const consolationWins =
      history.consolationWins +
      current.consolationWins;

    const consolationLosses =
      history.consolationLosses +
      current.consolationLosses;

    const consolationTies =
      history.consolationTies +
      current.consolationTies;

    // ALL-GAME RECORD

    const allWins =
      regularWins +
      playoffWins +
      consolationWins;

    const allLosses =
      regularLosses +
      playoffLosses +
      consolationLosses;

    const allTies =
      regularTies +
      playoffTies +
      consolationTies;

    // SEASONS PLAYED

    const years = results
      .map((result) =>
        Number(result.season_year)
      )
      .filter(
        (year) =>
          Number.isFinite(year) &&
          year >= 2014 &&
          year <= Number(currentSeason)
      );

    const seasonsPlayed =
      new Set(years).size;

    const firstSeason =
      years.length
        ? Math.min(...years)
        : null;

    const latestSeason =
      years.length
        ? Math.max(...years)
        : null;

    return {
      id: owner.id,
      name: owner.name,
      active,

      currentTeam:
        currentTeam?.team_name ||
        currentTeam?.teamName ||
        null,

      regularWins,
      regularLosses,
      regularTies,

      playoffWins,
      playoffLosses,
      playoffTies,

      consolationWins,
      consolationLosses,
      consolationTies,

      allWins,
      allLosses,
      allTies,

      pointsFor,
      pointsAgainst,

      playoffAppearances,
      finalsAppearances,
      championships,

      seasonsPlayed,
      firstSeason,
      latestSeason,
    };
  });

  // ====================================================
  // SORT OWNERS
  //
  // 1. Active owners
  // 2. Championships
  // 3. Regular-season wins
  // ====================================================

  ownerStats.sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    if (
      b.championships !==
      a.championships
    ) {
      return (
        b.championships -
        a.championships
      );
    }

    if (
      b.regularWins !==
      a.regularWins
    ) {
      return (
        b.regularWins -
        a.regularWins
      );
    }

    return a.name.localeCompare(b.name);
  });

  const activeOwners = ownerStats.filter(
    (owner) => owner.active
  );

  const formerOwners = ownerStats.filter(
    (owner) => !owner.active
  );

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
            THE LEAGUE
          </p>

          <h1>Owners</h1>

          <p>
            The complete career history of
            everyone who has competed in
            Dirty P Fantasy Football,
            updated throughout the
            current season.
          </p>
        </div>

        <div className="owners-count">
          <strong>
            {ownerStats.length}
          </strong>

          <span>
            ALL-TIME OWNERS
          </span>
        </div>
      </section>

      {/* PAGE NAV */}

      <div className="page-nav">
        <Link href="/">
          ← Home
        </Link>

        <span>
          {latestCompletedWeek > 0
            ? `Career records through ${currentSeason} Week ${latestCompletedWeek}`
            : `Career records through ${currentSeason}`}
        </span>
      </div>

      {/* ESPN OWNER MATCH WARNING */}

      {unmatchedEspnOwners.length > 0 && (
        <section className="owners-section">
          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">
                  ESPN OWNER MATCH WARNING
                </span>

                <h3>
                  Some current owners could
                  not be matched
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

      {/* ACTIVE OWNERS */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              CURRENT LEAGUE
            </p>

            <h2>
              Active Owners
            </h2>
          </div>

          <span>
            {activeOwners.length} Owners
          </span>
        </div>

        <div className="owners-grid">
          {activeOwners.map((owner) => (
            <OwnerCard
              key={owner.id}
              owner={owner}
            />
          ))}
        </div>
      </section>

      {/* FORMER OWNERS */}

      {formerOwners.length > 0 && (
        <section className="owners-section former-owners-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                LEAGUE HISTORY
              </p>

              <h2>
                Former Owners
              </h2>
            </div>

            <span>
              {formerOwners.length} Owners
            </span>
          </div>

          <div className="owners-grid">
            {formerOwners.map((owner) => (
              <OwnerCard
                key={owner.id}
                owner={owner}
              />
            ))}
          </div>
        </section>
      )}

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

      {/* COLLAPSIBLE OWNER CARD STYLES */}

      <style>{`
        .dp-compact-owner-card {
          display: flex;
          flex-direction: column;
          height: fit-content;
          min-width: 0;
          overflow: hidden;
          cursor: default;
          text-decoration: none;
        }

        .dp-compact-owner-card .owner-card-top {
          align-items: flex-start;
        }

        .dp-compact-owner-card .owner-card-top h3 {
          overflow-wrap: anywhere;
        }

        .dp-owner-headline-stats {
          margin-bottom: 0;
        }

        .dp-owner-categories {
          display: flex;
          flex-direction: column;
          padding: 8px 18px;
          gap: 0;
          border-top: 1px solid #303947;
        }

        .dp-owner-category {
          border-bottom: 1px solid #303947;
          min-width: 0;
        }

        .dp-owner-category:last-child {
          border-bottom: none;
        }

        .dp-owner-category-toggle {
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 15px 0;
          cursor: pointer;
          user-select: none;
        }

        .dp-owner-category-toggle::-webkit-details-marker {
          display: none;
        }

        .dp-owner-category-toggle::marker {
          content: "";
        }

        .dp-category-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .dp-category-info strong {
          color: #f2f4f7;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.3;
        }

        .dp-category-info > span {
          color: #93a0b1;
          font-size: 11px;
          line-height: 1.4;
        }

        .dp-category-chevron {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 27px;
          height: 27px;
          flex-shrink: 0;
          border-radius: 7px;
          background: #28313e;
          color: #d5b477;
          transition:
            transform 0.2s ease,
            background 0.2s ease;
        }

        .dp-owner-category[open]
        .dp-category-chevron {
          transform: rotate(180deg);
          background: #3b3429;
        }

        .dp-owner-category[open]
        .dp-category-info strong {
          color: #e9bd67;
        }

        .dp-owner-category-toggle:hover
        .dp-category-info strong {
          color: #e9bd67;
        }

        .dp-owner-category-toggle:focus-visible {
          outline: 2px solid #e9bd67;
          outline-offset: -2px;
          border-radius: 4px;
        }

        .dp-owner-category-content {
          background: #111721;
          border: 1px solid #29323e;
          border-radius: 9px;
          padding: 5px 12px;
          margin-bottom: 14px;
        }

        .dp-stat-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-width: 0;
          padding: 11px 0;
          border-bottom: 1px solid #27303b;
        }

        .dp-stat-row:last-child {
          border-bottom: none;
        }

        .dp-stat-row span {
          min-width: 0;
          color: #aab5c3;
          font-size: 12px;
          line-height: 1.4;
        }

        .dp-stat-row strong {
          flex-shrink: 0;
          color: #f2f4f7;
          font-size: 12px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          text-align: right;
        }

        .dp-owner-card-footer {
          margin-top: auto;
        }

        .dp-view-owner {
          color: #e9bd67;
          font-size: 12px;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
        }

        .dp-view-owner:hover {
          color: #f6d794;
          text-decoration: underline;
        }

        .dp-view-owner:focus-visible {
          outline: 2px solid #e9bd67;
          outline-offset: 4px;
          border-radius: 2px;
        }

        @media (max-width: 600px) {
          .dp-owner-categories {
            padding: 5px 14px;
          }

          .dp-owner-category-toggle {
            padding: 13px 0;
          }

          .dp-owner-category-content {
            padding: 4px 10px;
          }

          .dp-stat-row {
            padding: 10px 0;
          }
        }
      `}</style>
    </main>
  );
}
