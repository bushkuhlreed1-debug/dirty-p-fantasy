
import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";

export const dynamic = "force-dynamic";

// =========================================================
// HELPERS
// =========================================================

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

// =========================================================
// MATCHUP CLASSIFICATION
// =========================================================

function getGameType(matchup) {
  const matchupType = String(
    matchup.matchup_type || ""
  )
    .trim()
    .toLowerCase();

  const playoffTier = String(
    matchup.playoff_tier || ""
  )
    .trim()
    .toLowerCase();

  const isConsolation =
    matchup.is_consolation === true ||
    matchupType.includes("consolation") ||
    matchupType.includes("loser") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("loser") ||
    playoffTier.includes("toilet");

  if (isConsolation) {
    return "consolation";
  }

  const isPlayoff =
    matchup.is_playoff === true ||
    matchup.is_championship === true ||
    matchup.is_third_place === true ||
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

// =========================================================
// MATCHUP RESULTS
// =========================================================

function getOwnerGameResult(matchup, ownerId) {
  const homeOwnerId = Number(matchup.home_owner_id);
  const awayOwnerId = Number(matchup.away_owner_id);
  const id = Number(ownerId);

  const isHome = homeOwnerId === id;
  const isAway = awayOwnerId === id;

  if (!isHome && !isAway) {
    return null;
  }

  // Do not count unfinished matchups that have not
  // produced scores or a confirmed winner.

  const winner = String(matchup.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "TIE") {
    return "tie";
  }

  if (winner === "HOME") {
    return isHome ? "win" : "loss";
  }

  if (winner === "AWAY") {
    return isAway ? "win" : "loss";
  }

  const homeScore = matchup.home_score;
  const awayScore = matchup.away_score;

  if (
    homeScore === null ||
    homeScore === undefined ||
    awayScore === null ||
    awayScore === undefined ||
    homeScore === "" ||
    awayScore === ""
  ) {
    return null;
  }

  // Without a recorded winner, require evidence that
  // the game is completed before using score fallback.

  if (
    matchup.completed !== true &&
    matchup.is_final !== true &&
    matchup.status !== "FINAL" &&
    matchup.status !== "final"
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

// =========================================================
// POSTSEASON RECORD
// =========================================================

function getPostseasonStats(matchups, ownerId) {
  const stats = {
    playoffWins: 0,
    playoffLosses: 0,
    playoffTies: 0,
    consolationWins: 0,
    consolationLosses: 0,
    consolationTies: 0,
  };

  for (const matchup of matchups) {
    const homeId = Number(matchup.home_owner_id);
    const awayId = Number(matchup.away_owner_id);

    if (
      homeId !== Number(ownerId) &&
      awayId !== Number(ownerId)
    ) {
      continue;
    }

    const gameType = getGameType(matchup);

    if (gameType === "regular") {
      continue;
    }

    const result = getOwnerGameResult(
      matchup,
      ownerId
    );

    if (!result) {
      continue;
    }

    if (gameType === "playoff") {
      if (result === "win") stats.playoffWins++;
      if (result === "loss") stats.playoffLosses++;
      if (result === "tie") stats.playoffTies++;
    }

    if (gameType === "consolation") {
      if (result === "win") stats.consolationWins++;
      if (result === "loss") stats.consolationLosses++;
      if (result === "tie") stats.consolationTies++;
    }
  }

  return stats;
}

// =========================================================
// OWNER CARD
// =========================================================

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

      {/* REGULAR SEASON / WIN PERCENTAGE */}

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

      {/* PLAYOFF / CONSOLATION */}

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

      {/* CAREER ACCOMPLISHMENTS */}

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

// =========================================================
// MAIN OWNERS PAGE
// =========================================================

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

  // =======================================================
  // CURRENT ACTIVE OWNERS
  // =======================================================

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

  // =======================================================
  // CURRENT WEEK
  // =======================================================

  const completedWeeks = completedCurrentMatchups
    .map((game) => Number(game.matchup_period))
    .filter(
      (week) => Number.isFinite(week) && week > 0
    );

  const latestCompletedWeek = completedWeeks.length
    ? Math.max(...completedWeeks)
    : 0;

  // =======================================================
  // OWNER CAREER STATS
  // =======================================================

  const ownerStats = owners.map((owner) => {
    const ownerId = Number(owner.id);

    const results = seasonResults.filter(
      (result) =>
        Number(result.owner_id) === ownerId
    );

    const currentTeam = currentTeamMap.get(ownerId);

    const active = activeOwnerIds.has(ownerId);

    // REGULAR SEASON

    const regularWins = results.reduce(
      (total, result) =>
        total + num(result.wins),
      0
    );

    const regularLosses = results.reduce(
      (total, result) =>
        total + num(result.losses),
      0
    );

    const regularTies = results.reduce(
      (total, result) =>
        total + num(result.ties),
      0
    );

    // CAREER POINTS

    const pointsFor = results.reduce(
      (total, result) =>
        total + num(result.points_for),
      0
    );

    const pointsAgainst = results.reduce(
      (total, result) =>
        total + num(result.points_against),
      0
    );

    // POSTSEASON APPEARANCES

    const playoffAppearances = results.filter(
      (result) => Boolean(result.playoff_appearance)
    ).length;

    const finalsAppearances = results.filter(
      (result) =>
        Boolean(result.championship_appearance)
    ).length;

    const championships = results.filter(
      (result) => Boolean(result.champion)
    ).length;

    // ACTUAL PLAYOFF / CONSOLATION GAME RESULTS

    const postseason = getPostseasonStats(
      matchups,
      ownerId
    );

    // ALL-GAME CAREER RECORD

    const allWins =
      regularWins +
      postseason.playoffWins +
      postseason.consolationWins;

    const allLosses =
      regularLosses +
      postseason.playoffLosses +
      postseason.consolationLosses;

    const allTies =
      regularTies +
      postseason.playoffTies +
      postseason.consolationTies;

    // SEASONS

    const seasonYears = results
      .map((result) => Number(result.season_year))
      .filter(
        (year) =>
          Number.isFinite(year) &&
          year >= 2014 &&
          year <= currentSeason
      );

    const seasonsPlayed = new Set(seasonYears).size;

    const firstSeason = seasonYears.length
      ? Math.min(...seasonYears)
      : null;

    const latestSeason = seasonYears.length
      ? Math.max(...seasonYears)
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

      playoffWins: postseason.playoffWins,
      playoffLosses: postseason.playoffLosses,
      playoffTies: postseason.playoffTies,

      consolationWins: postseason.consolationWins,
      consolationLosses: postseason.consolationLosses,
      consolationTies: postseason.consolationTies,

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

  // =======================================================
  // OWNER ORDER
  // ACTIVE FIRST / CHAMPIONSHIPS / REGULAR WINS
  // =======================================================

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

  // =======================================================
  // PAGE RENDER
  // =======================================================

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
