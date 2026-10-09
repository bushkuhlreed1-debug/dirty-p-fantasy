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
    ((num(wins) + num(ties) * 0.5) / total) * 100
  ).toFixed(1);
}

// ======================================================
// POSTSEASON CLASSIFICATION
//
// IMPORTANT:
// Third-place games ALWAYS count as playoff games.
//
// This fixes ESPN third-place matchups labeled:
// WINNERS_CONSOLATION_LADDER
//
// Classification priority:
// 1. Third-place game -> Playoff
// 2. Actual consolation game -> Consolation
// 3. Championship / semifinal -> Playoff
// 4. Everything else -> Regular season
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

  // THIRD PLACE ALWAYS COUNTS AS PLAYOFF

  if (
    game.is_third_place === true ||
    matchupType.includes("third_place") ||
    matchupType.includes("third place") ||
    matchupType.includes("third-place")
  ) {
    return "playoff";
  }

  // ACTUAL CONSOLATION BRACKET

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

  // CHAMPIONSHIP AND PLAYOFF BRACKET

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
// Prefer official winner from Supabase / ESPN.
// Do not count unfinished games.
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

  // No official winner?
  // Only use scores when the game is confirmed final.

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
// Each completed matchup counts once per owner.
//
// Third-place games are correctly included in playoffs.
//
// Historical and current-season matchups are processed
// separately to prevent duplication.
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

// ======================================================
// EMPTY POSTSEASON RECORD
// ======================================================

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

      {/* PLAYOFF AND CONSOLATION RECORDS */}

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

      {/* FOOTER */}

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
        (id) => Number.isFinite(id) && id > 0
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
        (game) => game.completed === true
      )
      .map((game) =>
        Number(game.matchup_period)
      )
      .filter(
        (week) =>
          Number.isFinite(week) && week > 0
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

    const playoffAppearances = results.filter(
      (result) =>
        Boolean(result.playoff_appearance)
    ).length;

    // CHAMPIONSHIP FINAL APPEARANCES

    const finalsAppearances = results.filter(
      (result) =>
        Boolean(result.championship_appearance)
    ).length;

    // CHAMPIONSHIPS

    const championships = results.filter(
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
      b.championships !== a.championships
    ) {
      return (
        b.championships -
        a.championships
      );
    }

    if (
      b.regularWins !== a.regularWins
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
            The complete career history of everyone
            who has competed in Dirty P Fantasy Football,
            updated throughout the current season.
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
    </main>
  );
}
