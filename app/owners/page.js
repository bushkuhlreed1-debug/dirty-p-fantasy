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

// ======================================================
// POSTSEASON CLASSIFICATION
//
// Matches our verified Supabase audit.
//
// Consolation classification takes priority over
// playoff classification.
//
// Third-place games count as playoff games.
// Consolation games never count as playoff games.
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

  const isConsolation =
    game.is_consolation === true ||
    matchupType.includes("consolation") ||
    matchupType.includes("loser") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("loser") ||
    playoffTier.includes("toilet");

  if (isConsolation) {
    return "consolation";
  }

  const isPlayoff =
    game.is_playoff === true ||
    game.is_championship === true ||
    game.is_third_place === true ||
    matchupType.includes("playoff") ||
    matchupType.includes("championship") ||
    matchupType.includes("third_place") ||
    playoffTier.includes("winner") ||
    playoffTier.includes("championship");

  if (isPlayoff) {
    return "playoff";
  }

  return "regular";
}

// ======================================================
// COMPLETED GAME RESULT
//
// Prefer official winner from Supabase or ESPN.
//
// Never count undecided current-season games.
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

  // No official winner means we must confirm the game
  // is final before attempting a score comparison.

  const isFinal =
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "").toUpperCase() === "FINAL";

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

  if (ownerScore > opponentScore) return "win";
  if (ownerScore < opponentScore) return "loss";

  return "tie";
}

// ======================================================
// BUILD POSTSEASON RECORDS
//
// Historical: Seasons before current season
// Current: Officially completed ESPN matchups only
//
// Historical games are never mixed with unfinished
// current ESPN schedule entries.
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

    if (type === "regular") continue;

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
      const ownerRecord = records.get(ownerId);

      if (!ownerRecord) continue;

      const result = getGameResult(game, ownerId);

      if (!result) continue;

      if (type === "playoff") {
        ownerRecord.playoffGames++;

        if (result === "win") {
          ownerRecord.playoffWins++;
        } else if (result === "loss") {
          ownerRecord.playoffLosses++;
        } else {
          ownerRecord.playoffTies++;
        }
      }

      if (type === "consolation") {
        ownerRecord.consolationGames++;

        if (result === "win") {
          ownerRecord.consolationWins++;
        } else if (result === "loss") {
          ownerRecord.consolationLosses++;
        } else {
          ownerRecord.consolationTies++;
        }
      }
    }
  }

  return records;
}

// ======================================================
// OWNER CARD
// ======================================================

function OwnerCard({ owner }) {
  return (
    <Link
      href={`/owners/${owner.id}`}
      className="owner-card"
    >
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
            <strong>{owner.championships}</strong>
            <span>
              {owner.championships === 1
                ? "TITLE"
                : "TITLES"}
            </span>
          </div>
        )}
      </div>

      {/* REGULAR SEASON */}

      <div className="owner-record">
        <div>
          <strong>
            {formatRecord(
              owner.regularWins,
              owner.regularLosses,
              owner.regularTies
            )}
          </strong>

          <span>REGULAR SEASON RECORD</span>
        </div>

        <div>
          <strong>
            {formatPercentage(
              owner.allWins,
              owner.allLosses,
              owner.allTies
            )}
            %
          </strong>

          <span>ALL-GAME WIN %</span>
        </div>
      </div>

      {/* POSTSEASON RECORDS */}

      <div className="owner-record">
        <div>
          <strong>
            {formatRecord(
              owner.playoffWins,
              owner.playoffLosses,
              owner.playoffTies
            )}
          </strong>

          <span>PLAYOFF RECORD</span>
        </div>

        <div>
          <strong>
            {formatRecord(
              owner.consolationWins,
              owner.consolationLosses,
              owner.consolationTies
            )}
          </strong>

          <span>CONSOLATION RECORD</span>
        </div>
      </div>

      {/* CAREER ACHIEVEMENTS */}

      <div className="owner-stats-grid">
        <div>
          <strong>{owner.seasonsPlayed}</strong>
          <span>Seasons</span>
        </div>

        <div>
          <strong>{owner.playoffAppearances}</strong>
          <span>Playoffs</span>
        </div>

        <div>
          <strong>{owner.finalsAppearances}</strong>
          <span>Finals</span>
        </div>

        <div>
          <strong>{owner.championships}</strong>
          <span>Titles</span>
        </div>
      </div>

      <div className="owner-card-bottom">
        <span>
          {owner.firstSeason && owner.latestSeason
            ? `${owner.firstSeason}–${owner.latestSeason}`
            : "No seasons"}
        </span>

        <strong>View Owner →</strong>
      </div>
    </Link>
  );
}

// ======================================================
// OWNERS PAGE
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
  // CURRENT OWNER INFORMATION
  // ====================================================

  const activeOwnerIds = new Set(
    currentTeams
      .map((team) => Number(team.owner_id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );

  const currentTeamMap = new Map(
    currentTeams.map((team) => [
      Number(team.owner_id),
      team,
    ])
  );

  // ====================================================
  // SEPARATE HISTORICAL AND CURRENT POSTSEASON
  // ====================================================

  const historicalGames = matchups.filter(
    (game) =>
      Number(game.season_year) < Number(currentSeason)
  );

  const currentCompletedGames = completedCurrentMatchups
    .filter(
      (game) =>
        Number(game.season_year) ===
          Number(currentSeason) &&
        game.completed === true
    );

  // Build from separate periods to avoid including
  // unfinished ESPN games or counting a current
  // matchup twice.

  const historicalPostseason = buildPostseasonRecords(
    historicalGames,
    owners
  );

  const currentPostseason = buildPostseasonRecords(
    currentCompletedGames,
    owners
  );

  // ====================================================
  // LATEST COMPLETED WEEK
  // ====================================================

  const completedWeeks = completedCurrentMatchups
    .filter((game) => game.completed === true)
    .map((game) => Number(game.matchup_period))
    .filter(
      (week) => Number.isFinite(week) && week > 0
    );

  const latestCompletedWeek = completedWeeks.length
    ? Math.max(...completedWeeks)
    : 0;

  // ====================================================
  // BUILD OWNER CAREER STATISTICS
  // ====================================================

  const ownerStats = owners.map((owner) => {
    const ownerId = Number(owner.id);

    const results = seasonResults.filter(
      (result) => Number(result.owner_id) === ownerId
    );

    const currentTeam = currentTeamMap.get(ownerId);
    const active = activeOwnerIds.has(ownerId);

    // REGULAR SEASON

    const regularWins = results.reduce(
      (sum, result) => sum + num(result.wins),
      0
    );

    const regularLosses = results.reduce(
      (sum, result) => sum + num(result.losses),
      0
    );

    const regularTies = results.reduce(
      (sum, result) => sum + num(result.ties),
      0
    );

    // CAREER POINTS

    const pointsFor = results.reduce(
      (sum, result) => sum + num(result.points_for),
      0
    );

    const pointsAgainst = results.reduce(
      (sum, result) => sum + num(result.points_against),
      0
    );

    // POSTSEASON APPEARANCES

    const playoffAppearances = results.filter(
      (result) => Boolean(result.playoff_appearance)
    ).length;

    const finalsAppearances = results.filter(
      (result) => Boolean(result.championship_appearance)
    ).length;

    const championships = results.filter(
      (result) => Boolean(result.champion)
    ).length;

    // HISTORICAL POSTSEASON

    const history = historicalPostseason.get(ownerId) || {
      playoffWins: 0,
      playoffLosses: 0,
      playoffTies: 0,
      consolationWins: 0,
      consolationLosses: 0,
      consolationTies: 0,
    };

    // CURRENT SEASON POSTSEASON

    const current = currentPostseason.get(ownerId) || {
      playoffWins: 0,
      playoffLosses: 0,
      playoffTies: 0,
      consolationWins: 0,
      consolationLosses: 0,
      consolationTies: 0,
    };

    // COMBINED CAREER POSTSEASON RECORDS

    const playoffWins =
      history.playoffWins + current.playoffWins;

    const playoffLosses =
      history.playoffLosses + current.playoffLosses;

    const playoffTies =
      history.playoffTies + current.playoffTies;

    const consolationWins =
      history.consolationWins + current.consolationWins;

    const consolationLosses =
      history.consolationLosses + current.consolationLosses;

    const consolationTies =
      history.consolationTies + current.consolationTies;

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

    // SEASONS

    const years = results
      .map((result) => Number(result.season_year))
      .filter(
        (year) =>
          Number.isFinite(year) &&
          year >= 2014 &&
          year <= Number(currentSeason)
      );

    const seasonsPlayed = new Set(years).size;

    const firstSeason = years.length
      ? Math.min(...years)
      : null;

    const latestSeason = years.length
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
  // ====================================================

  ownerStats.sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    if (b.championships !== a.championships) {
      return b.championships - a.championships;
    }

    if (b.regularWins !== a.regularWins) {
      return b.regularWins - a.regularWins;
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
            The complete career history of everyone
            who has competed in Dirty P Fantasy Football,
            updated throughout the current season.
          </p>
        </div>

        <div className="owners-count">
          <strong>{ownerStats.length}</strong>
          <span>ALL-TIME OWNERS</span>
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

      {/* ACTIVE OWNERS */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              CURRENT LEAGUE
            </p>

            <h2>Active Owners</h2>
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

              <h2>Former Owners</h2>
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
    </main>
  );
}
