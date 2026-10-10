import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { getLeagueData } from "../../../lib/leagueData";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

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

function formatPercentage(wins, losses, ties = 0) {
  const total = num(wins) + num(losses) + num(ties);

  if (!total) return "0.0";

  return (
    ((num(wins) + num(ties) * 0.5) / total) * 100
  ).toFixed(1);
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

// ======================================================
// GAME CLASSIFICATION
//
// Third-place games count as playoff games.
// They must be checked before consolation flags.
// ======================================================

function getGameType(game) {
  const type = normalize(game.matchup_type);
  const tier = normalize(game.playoff_tier);

  if (
    game.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("3rd_place") ||
    type.includes("bronze")
  ) {
    return "Playoff";
  }

  if (
    game.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    type.includes("toilet") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet")
  ) {
    return "Consolation";
  }

  if (
    game.is_playoff === true ||
    game.is_championship === true ||
    type.includes("playoff") ||
    type.includes("semifinal") ||
    type.includes("semi_final") ||
    type.includes("championship") ||
    tier.includes("winner") ||
    tier.includes("championship")
  ) {
    return "Playoff";
  }

  return "Regular Season";
}

// ======================================================
// GAME COMPLETION
//
// Historical games may not have a completed flag.
// Current ESPN games must be confirmed complete.
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
  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  return ["HOME", "AWAY", "TIE"].includes(winner);
}

function isGameCompleted(game, currentSeason) {
  if (!hasValidScores(game)) return false;

  if (
    num(game.home_score) === 0 &&
    num(game.away_score) === 0
  ) {
    return false;
  }

  if (num(game.season_year) < num(currentSeason)) {
    return true;
  }

  return (
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "")
      .trim()
      .toUpperCase() === "FINAL" ||
    hasOfficialWinner(game)
  );
}

// ======================================================
// GAME IDENTITY
//
// Using season, matchup period, and BOTH owners
// allows us to identify the same matchup even
// if Supabase and ESPN use different row IDs.
//
// Owner IDs are sorted so switching home/away
// does not create a duplicate.
// ======================================================

function getGameKey(game) {
  const ids = [
    Number(game.home_owner_id),
    Number(game.away_owner_id),
  ].sort((a, b) => a - b);

  return [
    Number(game.season_year),
    Number(game.matchup_period),
    ids[0],
    ids[1],
  ].join(":");
}

// ======================================================
// OWNER GAME FORMAT
// ======================================================

function formatOwnerGame(game, ownerId, ownerMap) {
  if (!hasValidScores(game)) return null;

  const homeId = Number(game.home_owner_id);
  const awayId = Number(game.away_owner_id);

  const isHome = homeId === ownerId;
  const isAway = awayId === ownerId;

  if (!isHome && !isAway) return null;

  const opponentId = isHome ? awayId : homeId;

  const ownerScore = isHome
    ? num(game.home_score)
    : num(game.away_score);

  const opponentScore = isHome
    ? num(game.away_score)
    : num(game.home_score);

  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  let result;

  if (winner === "HOME") {
    result = isHome ? "W" : "L";
  } else if (winner === "AWAY") {
    result = isAway ? "W" : "L";
  } else if (winner === "TIE") {
    result = "T";
  } else {
    result =
      ownerScore > opponentScore
        ? "W"
        : ownerScore < opponentScore
        ? "L"
        : "T";
  }

  return {
    ...game,
    opponentId,
    opponentName:
      ownerMap.get(opponentId) || "Unknown Owner",
    ownerScore,
    opponentScore,
    result,
    margin: ownerScore - opponentScore,
    category: getGameType(game),
  };
}

// ======================================================
// GET ALL HISTORICAL MATCHUPS
//
// Only finished seasons are read from Supabase.
// Current-season games come from getLeagueData().
// ======================================================

async function fetchHistoricalOwnerGames(
  ownerId,
  currentSeason
) {
  const allGames = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("matchups")
      .select(`
        id,
        season_year,
        matchup_period,
        matchup_type,
        playoff_tier,
        home_owner_id,
        away_owner_id,
        home_team_name,
        away_team_name,
        home_score,
        away_score,
        winner,
        is_playoff,
        is_championship,
        is_third_place
      `)
      .or(
        `home_owner_id.eq.${ownerId},away_owner_id.eq.${ownerId}`
      )
      .lt("season_year", currentSeason)
      .order("season_year", { ascending: false })
      .order("matchup_period", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = data || [];

    allGames.push(...batch);

    if (batch.length < pageSize) {
      break;
    }
  }

  return allGames;
}

// ======================================================
// EXPANDABLE SECTION
//
// Native details/summary:
// - No extra client component
// - Closed by default
// - All contents remain intact
// ======================================================

function ExpandableSection({
  title,
  count,
  children,
}) {
  return (
    <details className="dp-profile-details">
      <summary className="dp-profile-summary">
        <div>
          <strong>{title}</strong>

          {count !== undefined && (
            <span>
              {count}{" "}
              {count === 1 ? "Entry" : "Entries"}
            </span>
          )}
        </div>

        <svg
          className="dp-profile-chevron"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="dp-profile-content">
        {children}
      </div>
    </details>
  );
}

// ======================================================
// PROFILE STAT
// ======================================================

function ProfileStat({ label, value }) {
  return (
    <div className="dp-profile-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

// ======================================================
// HIGHS AND LOWS CARD
// ======================================================

function GameHighlight({ title, game }) {
  return (
    <div className="dp-highlight-card">
      <span className="owner-status">
        {title}
      </span>

      {game ? (
        <>
          <strong>
            {formatScore(game.ownerScore)}
            {" – "}
            {formatScore(game.opponentScore)}
          </strong>

          <span>
            vs. {game.opponentName}
          </span>

          <small>
            {game.season_year}
            {" · "}
            Week {game.matchup_period}
          </small>
        </>
      ) : (
        <strong>—</strong>
      )}
    </div>
  );
}

// ======================================================
// OWNER PROFILE
// ======================================================

export default async function OwnerProfile({ params }) {
  const { id } = await params;

  const ownerId = Number(id);

  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    return (
      <main className="page-shell">
        <h1>Owner Not Found</h1>
        <Link href="/owners">
          ← Back to Owners
        </Link>
      </main>
    );
  }

  let leagueData;

  try {
    leagueData = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Unable to Load Owner</h1>
        <p>
          {error?.message || "League data unavailable."}
        </p>
        <Link href="/owners">
          ← Back to Owners
        </Link>
      </main>
    );
  }

  const {
    currentSeason = CURRENT_SEASON,
    owners: liveOwners = [],
    seasonResults: liveSeasonResults = [],
    currentTeams = [],
    completedCurrentMatchups = [],
  } = leagueData;

  // ====================================================
  // FETCH PROFILE DATA
  // ====================================================

  let owner = null;
  let allOwners = [];
  let historicalSeasonResults = [];
  let teamHistory = [];
  let allFranchiseTeam = [];
  let historicalGames = [];

  try {
    const [
      ownerResponse,
      ownersResponse,
      seasonsResponse,
      teamsResponse,
      franchiseResponse,
      gamesResponse,
    ] = await Promise.all([
      supabase
        .from("owners")
        .select("id,name,current_team_name,active")
        .eq("id", ownerId)
        .single(),

      supabase
        .from("owners")
        .select("id,name"),

      supabase
        .from("season_results")
        .select(`
          season_year,
          wins,
          losses,
          ties,
          points_for,
          points_against,
          regular_season_finish,
          final_finish,
          playoff_appearance,
          championship_appearance,
          champion
        `)
        .eq("owner_id", ownerId)
        .order("season_year", { ascending: false }),

      supabase
        .from("teams")
        .select("season_year,team_name")
        .eq("owner_id", ownerId)
        .order("season_year", { ascending: false }),

      supabase
        .from("all_franchise_teams")
        .select(`
          owner_id,
          franchise_slot,
          espn_player_id,
          player_name,
          position,
          season_year,
          dirty_p_team_name,
          fantasy_points
        `)
        .eq("owner_id", ownerId),

      fetchHistoricalOwnerGames(
        ownerId,
        currentSeason
      ).then(
        (data) => ({ data, error: null }),
        (error) => ({ data: null, error })
      ),
    ]);

    const error = [
      ownerResponse.error,
      ownersResponse.error,
      seasonsResponse.error,
      teamsResponse.error,
      franchiseResponse.error,
      gamesResponse.error,
    ].find(Boolean);

    if (error) {
      throw new Error(error.message);
    }

    owner = ownerResponse.data;
    allOwners = ownersResponse.data || [];
    historicalSeasonResults =
      seasonsResponse.data || [];
    teamHistory = teamsResponse.data || [];
    allFranchiseTeam = franchiseResponse.data || [];
    historicalGames = gamesResponse.data || [];
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Owner Profile</h1>
        <p>
          Unable to load profile:{" "}
          {error?.message || "Database error"}
        </p>
        <Link href="/owners">
          ← Back to Owners
        </Link>
      </main>
    );
  }

  if (!owner) {
    return (
      <main className="page-shell">
        <h1>Owner Not Found</h1>
        <Link href="/owners">
          ← Back to Owners
        </Link>
      </main>
    );
  }

  // ====================================================
  // OWNER LOOKUP
  // ====================================================

  const ownerMap = new Map(
    allOwners.map((item) => [
      Number(item.id),
      item.name,
    ])
  );

  for (const item of liveOwners) {
    ownerMap.set(
      Number(item.id),
      item.name
    );
  }

  // ====================================================
  // FIX: INCLUDE ALL COMPLETED 2026 ESPN GAMES
  //
  // Historical:
  // Supabase, seasons before 2026.
  //
  // Current:
  // Completed ESPN games from getLeagueData().
  //
  // No current game is pulled from two sources.
  // ====================================================

  const currentOwnerGames =
    completedCurrentMatchups.filter((game) => {
      const year = Number(game.season_year);

      const belongsToOwner =
        Number(game.home_owner_id) === ownerId ||
        Number(game.away_owner_id) === ownerId;

      return (
        year === Number(currentSeason) &&
        belongsToOwner &&
        isGameCompleted(game, currentSeason)
      );
    });

  // ====================================================
  // COMBINE AND DEDUPLICATE
  //
  // The Map ensures each matchup is counted once.
  // ====================================================

  const gameMap = new Map();

  for (const game of historicalGames) {
    if (isGameCompleted(game, currentSeason)) {
      gameMap.set(getGameKey(game), game);
    }
  }

  for (const game of currentOwnerGames) {
    gameMap.set(getGameKey(game), game);
  }

  const games = [...gameMap.values()]
    .map((game) =>
      formatOwnerGame(
        game,
        ownerId,
        ownerMap
      )
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(b.season_year) -
          Number(a.season_year) ||
        Number(b.matchup_period) -
          Number(a.matchup_period)
    );

  // ====================================================
  // SEASON RESULTS
  //
  // Use getLeagueData's current season result,
  // rather than relying on an outdated database row.
  // ====================================================

  const seasonMap = new Map();

  for (const result of historicalSeasonResults) {
    seasonMap.set(
      Number(result.season_year),
      result
    );
  }

  const liveCurrentResult =
    liveSeasonResults.find(
      (result) =>
        Number(result.owner_id) === ownerId &&
        Number(result.season_year) ===
          Number(currentSeason)
    );

  if (liveCurrentResult) {
    seasonMap.set(
      Number(currentSeason),
      liveCurrentResult
    );
  }

  const seasons = [...seasonMap.values()]
    .sort(
      (a, b) =>
        Number(b.season_year) -
        Number(a.season_year)
    );

  // ====================================================
  // TEAM HISTORY
  // ====================================================

  const currentTeam = currentTeams.find(
    (team) =>
      Number(team.owner_id) === ownerId
  );

  const teamByYear = new Map(
    teamHistory.map((team) => [
      Number(team.season_year),
      team.team_name,
    ])
  );

  const liveTeamName =
    currentTeam?.team_name ||
    currentTeam?.teamName ||
    owner.current_team_name;

  if (liveTeamName) {
    teamByYear.set(
      Number(currentSeason),
      liveTeamName
    );
  }

  const seasonHistory = seasons.map((season) => ({
    ...season,
    teamName:
      teamByYear.get(
        Number(season.season_year)
      ) || "—",
    finish:
      season.champion
        ? "Champion"
        : season.championship_appearance
        ? "Runner-Up"
        : season.playoff_appearance
        ? "Playoffs"
        : "Missed Playoffs",
  }));

  // ====================================================
  // ALL-FRANCHISE TEAM
  // ====================================================

  const SLOT_ORDER = {
    QB: 1,
    RB1: 2,
    RB2: 3,
    WR1: 4,
    WR2: 5,
    TE: 6,
    FLEX: 7,
    K: 8,
    "D/ST": 9,
  };

  const franchise = [
    ...allFranchiseTeam,
  ].sort(
    (a, b) =>
      (SLOT_ORDER[a.franchise_slot] || 99) -
      (SLOT_ORDER[b.franchise_slot] || 99)
  );

  // ====================================================
  // TEAM NAME HISTORY
  // ====================================================

  const teamNames = new Map();

  for (const [year, teamName] of teamByYear) {
    const name = teamName || "Unnamed Team";

    if (!teamNames.has(name)) {
      teamNames.set(name, []);
    }

    teamNames.get(name).push(year);
  }

  // ====================================================
  // HEAD-TO-HEAD RECORDS
  //
  // Now includes completed 2026 games.
  // ====================================================

  const headToHeadMap = new Map();

  for (const game of games) {
    if (!headToHeadMap.has(game.opponentId)) {
      headToHeadMap.set(game.opponentId, {
        opponentId: game.opponentId,
        opponentName: game.opponentName,
        wins: 0,
        losses: 0,
        ties: 0,
      });
    }

    const stat = headToHeadMap.get(
      game.opponentId
    );

    if (game.result === "W") stat.wins++;
    if (game.result === "L") stat.losses++;
    if (game.result === "T") stat.ties++;
  }

  const headToHead = [
    ...headToHeadMap.values(),
  ].sort(
    (a, b) =>
      a.opponentName.localeCompare(
        b.opponentName
      )
  );

  // ====================================================
  // HIGHS AND LOWS
  // ====================================================

  const wins = games.filter(
    (game) => game.result === "W"
  );

  const losses = games.filter(
    (game) => game.result === "L"
  );

  const highestScore = [...games].sort(
    (a, b) =>
      b.ownerScore - a.ownerScore
  )[0];

  const lowestScore = [...games].sort(
    (a, b) =>
      a.ownerScore - b.ownerScore
  )[0];

  const biggestWin = [...wins].sort(
    (a, b) =>
      b.margin - a.margin
  )[0];

  const biggestLoss = [...losses].sort(
    (a, b) =>
      a.margin - b.margin
  )[0];

  const closestWin = [...wins].sort(
    (a, b) =>
      a.margin - b.margin
  )[0];

  const closestLoss = [...losses].sort(
    (a, b) =>
      b.margin - a.margin
  )[0];

  // ====================================================
  // BEST COMPLETED REGULAR SEASON
  // ====================================================

  const completedSeasons = seasons.filter(
    (season) =>
      Number(season.season_year) <
      Number(currentSeason)
  );

  const bestSeason = [...completedSeasons].sort(
    (a, b) => {
      const aGames =
        num(a.wins) +
        num(a.losses) +
        num(a.ties);

      const bGames =
        num(b.wins) +
        num(b.losses) +
        num(b.ties);

      const aPct = aGames
        ? (num(a.wins) + num(a.ties) * 0.5) /
          aGames
        : 0;

      const bPct = bGames
        ? (num(b.wins) + num(b.ties) * 0.5) /
          bGames
        : 0;

      return (
        bPct - aPct ||
        num(b.wins) - num(a.wins) ||
        num(b.points_for) - num(a.points_for)
      );
    }
  )[0];

  // ====================================================
  // LONGEST WIN STREAK
  // ====================================================

  const chronologicalGames = [...games].sort(
    (a, b) =>
      Number(a.season_year) -
        Number(b.season_year) ||
      Number(a.matchup_period) -
        Number(b.matchup_period)
  );

  let longestWinStreak = 0;
  let currentWinStreak = 0;

  for (const game of chronologicalGames) {
    if (game.result === "W") {
      currentWinStreak++;

      longestWinStreak = Math.max(
        longestWinStreak,
        currentWinStreak
      );
    } else {
      currentWinStreak = 0;
    }
  }

  // ====================================================
  // CAREER STATISTICS
  // ====================================================

  const regularWins = seasons.reduce(
    (sum, season) =>
      sum + num(season.wins),
    0
  );

  const regularLosses = seasons.reduce(
    (sum, season) =>
      sum + num(season.losses),
    0
  );

  const regularTies = seasons.reduce(
    (sum, season) =>
      sum + num(season.ties),
    0
  );

  const pointsFor = seasons.reduce(
    (sum, season) =>
      sum + num(season.points_for),
    0
  );

  const playoffGames = games.filter(
    (game) =>
      game.category === "Playoff"
  );

  const consolationGames = games.filter(
    (game) =>
      game.category === "Consolation"
  );

  function recordFromGames(list) {
    return formatRecord(
      list.filter(
        (game) => game.result === "W"
      ).length,

      list.filter(
        (game) => game.result === "L"
      ).length,

      list.filter(
        (game) => game.result === "T"
      ).length
    );
  }

  const championships = seasons.filter(
    (season) =>
      Boolean(season.champion)
  ).length;

  const finalsAppearances = seasons.filter(
    (season) =>
      Boolean(season.championship_appearance)
  ).length;

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

      {/* OWNER HERO */}

      <section className="owner-profile-hero">
        <p className="eyebrow">
          {currentTeam
            ? "ACTIVE OWNER"
            : "FORMER OWNER"}
        </p>

        <h1>{owner.name}</h1>

        <p>
          {liveTeamName || "Dirty P Franchise"}
        </p>

        {/* ALWAYS VISIBLE CAREER SUMMARY */}

        <div className="dp-profile-stats">
          <ProfileStat
            label="REGULAR-SEASON RECORD"
            value={formatRecord(
              regularWins,
              regularLosses,
              regularTies
            )}
          />

          <ProfileStat
            label="REGULAR-SEASON WIN %"
            value={`${formatPercentage(
              regularWins,
              regularLosses,
              regularTies
            )}%`}
          />

          <ProfileStat
            label="CHAMPIONSHIPS"
            value={championships}
          />

          <ProfileStat
            label="FINALS"
            value={finalsAppearances}
          />

          <ProfileStat
            label="PLAYOFF RECORD"
            value={recordFromGames(playoffGames)}
          />

          <ProfileStat
            label="CONSOLATION RECORD"
            value={recordFromGames(consolationGames)}
          />
        </div>
      </section>

      {/* PAGE NAV */}

      <nav className="page-nav">
        <Link href="/owners">
          ← All Owners
        </Link>

        <span>
          {seasons.length} Seasons
          {" · "}
          {formatScore(pointsFor)} Career Points
        </span>
      </nav>

      {/* ==================================================
          EXPANDABLE PROFILE CATEGORIES
          ================================================== */}

      <div className="dp-profile-sections">

        {/* YEAR-BY-YEAR SEASON HISTORY */}

        <ExpandableSection
          title="Year-by-Year Season History"
          count={seasonHistory.length}
        >
          <div className="dp-profile-table-wrap">
            <table className="dp-profile-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Team</th>
                  <th>Record</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Regular Finish</th>
                  <th>Final Finish</th>
                  <th>Postseason</th>
                </tr>
              </thead>

              <tbody>
                {seasonHistory.map((season) => (
                  <tr key={season.season_year}>
                    <td>
                      {season.season_year}
                    </td>

                    <td>
                      {season.teamName}
                    </td>

                    <td>
                      {formatRecord(
                        season.wins,
                        season.losses,
                        season.ties
                      )}
                    </td>

                    <td>
                      {formatScore(
                        season.points_for
                      )}
                    </td>

                    <td>
                      {formatScore(
                        season.points_against
                      )}
                    </td>

                    <td>
                      {season.regular_season_finish ?? "—"}
                    </td>

                    <td>
                      {season.final_finish ?? "—"}
                    </td>

                    <td>
                      {Number(season.season_year) ===
                        Number(currentSeason)
                        ? season.champion
                          ? "Champion"
                          : season.championship_appearance
                          ? "Runner-Up"
                          : season.playoff_appearance
                          ? "Playoffs"
                          : "In Progress"
                        : season.finish}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ExpandableSection>

        {/* ALL-FRANCHISE TEAM */}

        <ExpandableSection
          title="All-Franchise Team"
          count={franchise.length}
        >
          <div className="dp-franchise-grid">
            {franchise.map((player, index) => (
              <article
                className="dp-franchise-player"
                key={`${player.franchise_slot}-${player.espn_player_id}-${index}`}
              >
                <span className="owner-status">
                  {player.franchise_slot}
                </span>

                <strong>
                  {player.player_name}
                </strong>

                <span>
                  {player.position}
                  {" · "}
                  {player.season_year}
                </span>

                <span>
                  {player.dirty_p_team_name}
                </span>

                <strong className="dp-franchise-points">
                  {formatScore(
                    player.fantasy_points
                  )} PTS
                </strong>
              </article>
            ))}
          </div>
        </ExpandableSection>

        {/* HEAD-TO-HEAD */}

        <ExpandableSection
          title="Head-to-Head"
          count={headToHead.length}
        >
          <div className="dp-profile-list">
            {headToHead.map((opponent) => (
              <div
                className="dp-profile-list-row"
                key={opponent.opponentId}
              >
                <strong>
                  {opponent.opponentName}
                </strong>

                <span>
                  {formatRecord(
                    opponent.wins,
                    opponent.losses,
                    opponent.ties
                  )}
                </span>
              </div>
            ))}
          </div>
        </ExpandableSection>

        {/* HIGHS AND LOWS */}

        <ExpandableSection
          title="Highs & Lows"
        >
          <div className="dp-highlights-grid">
            <GameHighlight
              title="HIGHEST WEEKLY SCORE"
              game={highestScore}
            />

            <GameHighlight
              title="LOWEST WEEKLY SCORE"
              game={lowestScore}
            />

            <GameHighlight
              title="BIGGEST VICTORY"
              game={biggestWin}
            />

            <GameHighlight
              title="BIGGEST LOSS"
              game={biggestLoss}
            />

            <GameHighlight
              title="CLOSEST WIN"
              game={closestWin}
            />

            <GameHighlight
              title="CLOSEST LOSS"
              game={closestLoss}
            />

            <div className="dp-highlight-card">
              <span className="owner-status">
                BEST REGULAR SEASON
              </span>

              <strong>
                {bestSeason
                  ? formatRecord(
                      bestSeason.wins,
                      bestSeason.losses,
                      bestSeason.ties
                    )
                  : "—"}
              </strong>

              <span>
                {bestSeason?.season_year || "—"}
              </span>
            </div>

            <div className="dp-highlight-card">
              <span className="owner-status">
                LONGEST WIN STREAK
              </span>

              <strong>
                {longestWinStreak} Games
              </strong>

              <span>
                Franchise History
              </span>
            </div>
          </div>
        </ExpandableSection>

        {/* TEAM NAME HISTORY */}

        <ExpandableSection
          title="Team Name History"
          count={teamNames.size}
        >
          <div className="dp-profile-list">
            {[...teamNames.entries()].map(
              ([teamName, years]) => (
                <div
                  className="dp-profile-list-row"
                  key={teamName}
                >
                  <strong>
                    {teamName}
                  </strong>

                  <span>
                    {[...years]
                      .sort((a, b) => a - b)
                      .join(", ")}
                  </span>
                </div>
              )
            )}
          </div>
        </ExpandableSection>

        {/* EVERY GAME */}

        <ExpandableSection
          title="Every Game"
          count={games.length}
        >
          <div className="dp-profile-table-wrap">
            <table className="dp-profile-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Week</th>
                  <th>Opponent</th>
                  <th>Result</th>
                  <th>Score</th>
                  <th>Type</th>
                </tr>
              </thead>

              <tbody>
                {games.map((game, index) => (
                  <tr
                    key={`${getGameKey(game)}-${index}`}
                  >
                    <td>
                      {game.season_year}
                    </td>

                    <td>
                      {game.matchup_period}
                    </td>

                    <td>
                      {game.opponentName}
                    </td>

                    <td>
                      <span
                        className={
                          game.result === "W"
                            ? "dp-result-win"
                            : game.result === "L"
                            ? "dp-result-loss"
                            : "dp-result-tie"
                        }
                      >
                        {game.result}
                      </span>
                    </td>

                    <td>
                      {formatScore(
                        game.ownerScore
                      )}
                      {" – "}
                      {formatScore(
                        game.opponentScore
                      )}
                    </td>

                    <td>
                      {game.category}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ExpandableSection>

      </div>

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

      {/* ==================================================
          PROFILE STYLING
          ================================================== */}

      <style>{`
        .dp-profile-stats {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 22px;
        }

        .dp-profile-stat {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 0;
          padding: 16px;
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 10px;
        }

        .dp-profile-stat strong {
          color: #f4f6f8;
          font-size: 22px;
          font-variant-numeric: tabular-nums;
        }

        .dp-profile-stat span {
          color: #aab6c4;
          font-size: 10px;
          letter-spacing: 0.7px;
          line-height: 1.4;
        }

        .dp-profile-sections {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin: 25px 0;
        }

        .dp-profile-details {
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 13px;
          overflow: hidden;
        }

        .dp-profile-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 20px 22px;
          cursor: pointer;
          list-style: none;
          user-select: none;
        }

        .dp-profile-summary::-webkit-details-marker {
          display: none;
        }

        .dp-profile-summary::marker {
          content: "";
        }

        .dp-profile-summary > div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .dp-profile-summary strong {
          color: #f2f4f7;
          font-size: 17px;
        }

        .dp-profile-summary span {
          color: #9ca9b9;
          font-size: 12px;
        }

        .dp-profile-chevron {
          flex-shrink: 0;
          color: #e9bd67;
          transition: transform 0.2s ease;
        }

        .dp-profile-details[open]
        .dp-profile-chevron {
          transform: rotate(180deg);
        }

        .dp-profile-details[open]
        .dp-profile-summary {
          border-bottom: 1px solid #303947;
        }

        .dp-profile-details[open]
        .dp-profile-summary strong,
        .dp-profile-summary:hover strong {
          color: #e9bd67;
        }

        .dp-profile-summary:focus-visible {
          outline: 2px solid #e9bd67;
          outline-offset: -3px;
        }

        .dp-profile-content {
          padding: 18px;
        }

        .dp-profile-table-wrap {
          width: 100%;
          overflow-x: auto;
        }

        .dp-profile-table {
          width: 100%;
          min-width: 650px;
          border-collapse: collapse;
        }

        .dp-profile-table th,
        .dp-profile-table td {
          padding: 12px 10px;
          border-bottom: 1px solid #303947;
          text-align: left;
          font-size: 12px;
          white-space: nowrap;
        }

        .dp-profile-table th {
          color: #e9bd67;
          font-weight: 800;
        }

        .dp-profile-table td {
          color: #dce2e9;
        }

        .dp-franchise-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .dp-franchise-player {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 16px;
          background: #202a35;
          border: 1px solid #34404d;
          border-radius: 10px;
          min-width: 0;
        }

        .dp-franchise-player strong {
          color: #f4f6f8;
        }

        .dp-franchise-player > span:not(.owner-status) {
          color: #aeb9c7;
          font-size: 12px;
        }

        .dp-franchise-player .dp-franchise-points {
          color: #e9bd67;
        }

        .dp-profile-list {
          display: flex;
          flex-direction: column;
        }

        .dp-profile-list-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 14px 5px;
          border-bottom: 1px solid #303947;
        }

        .dp-profile-list-row:last-child {
          border-bottom: none;
        }

        .dp-profile-list-row strong {
          color: #f4f6f8;
          font-size: 13px;
        }

        .dp-profile-list-row span {
          color: #d8b67b;
          text-align: right;
          font-size: 12px;
        }

        .dp-highlights-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .dp-highlight-card {
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 16px;
          min-width: 0;
          background: #202a35;
          border: 1px solid #34404d;
          border-radius: 10px;
        }

        .dp-highlight-card > strong {
          color: #f4f6f8;
          font-size: 20px;
          overflow-wrap: anywhere;
        }

        .dp-highlight-card > span:not(.owner-status),
        .dp-highlight-card small {
          color: #9eacbb;
          font-size: 12px;
        }

        .dp-result-win {
          color: #65d6a5;
          font-weight: 800;
        }

        .dp-result-loss {
          color: #f18484;
          font-weight: 800;
        }

        .dp-result-tie {
          color: #e9bd67;
          font-weight: 800;
        }

        @media (max-width: 650px) {
          .dp-profile-stats {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .dp-franchise-grid {
            grid-template-columns: 1fr;
          }

          .dp-highlights-grid {
            grid-template-columns: 1fr;
          }

          .dp-profile-summary {
            padding: 16px;
          }

          .dp-profile-content {
            padding: 12px;
          }
        }
      `}</style>

    </main>
  );
}
