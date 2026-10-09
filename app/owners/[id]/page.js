
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { getLeagueData } from "../../../lib/leagueData";

export const dynamic = "force-dynamic";

// ======================================================
// HELPERS
// ======================================================

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

function winPct(wins, losses, ties = 0) {
  const total = num(wins) + num(losses) + num(ties);
  if (!total) return 0;
  return ((num(wins) + num(ties) * 0.5) / total) * 100;
}

function normalizeTeamName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[’‘]/g, "'")
    .toLowerCase();
}

function getGameType(game) {
  const type = String(game.matchup_type || "").toLowerCase();
  const tier = String(game.playoff_tier || "").toLowerCase();

  if (
    game.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet")
  ) {
    return "Consolation";
  }

  if (
    game.is_playoff === true ||
    game.is_championship === true ||
    game.is_third_place === true ||
    type.includes("playoff") ||
    type.includes("championship") ||
    type.includes("third_place") ||
    tier.includes("winner") ||
    tier.includes("championship")
  ) {
    return "Playoff";
  }

  return "Regular Season";
}

function getGameResult(game, ownerId) {
  const homeId = Number(game.home_owner_id);
  const awayId = Number(game.away_owner_id);
  const id = Number(ownerId);

  if (homeId !== id && awayId !== id) return null;

  const isHome = homeId === id;
  const winner = String(game.winner || "").trim().toUpperCase();

  if (winner === "HOME") return isHome ? "W" : "L";
  if (winner === "AWAY") return isHome ? "L" : "W";
  if (winner === "TIE") return "T";

  const completed =
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "").toUpperCase() === "FINAL";

  if (!completed) return null;

  if (
    game.home_score === null ||
    game.home_score === undefined ||
    game.away_score === null ||
    game.away_score === undefined ||
    game.home_score === "" ||
    game.away_score === ""
  ) {
    return null;
  }

  const homeScore = Number(game.home_score);
  const awayScore = Number(game.away_score);

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return null;
  }

  const ownerScore = isHome ? homeScore : awayScore;
  const opponentScore = isHome ? awayScore : homeScore;

  if (ownerScore > opponentScore) return "W";
  if (ownerScore < opponentScore) return "L";
  return "T";
}

function GameDescription({ game }) {
  if (!game) return <strong>—</strong>;

  return (
    <>
      <strong>{formatScore(game.ownerScore)}</strong>
      <span>vs {game.opponentName}</span>
      <small>
        {game.season_year} · Week {game.matchup_period}
      </small>
    </>
  );
}

function CareerRecordCard({ label, game }) {
  return (
    <div className="career-record-card">
      <span>{label}</span>
      <GameDescription game={game} />
    </div>
  );
}

const FRANCHISE_SLOT_ORDER = {
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

// ======================================================
// OWNER PROFILE
// ======================================================

export default async function OwnerProfile({ params }) {
  const { id } = await params;
  const ownerId = Number(id);

  if (!Number.isFinite(ownerId)) {
    return (
      <main className="page-shell">
        <h1>Owner Not Found</h1>
        <Link href="/owners">← Back to Owners</Link>
      </main>
    );
  }

  let leagueData;

  try {
    leagueData = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <header className="site-header">
          <div className="site-title">
            <Link href="/">
              <strong>DIRTY P FANTASY FOOTBALL</strong>
            </Link>
            <span>THE LEAGUE ARCHIVE · EST. 2014</span>
          </div>
        </header>

        <section className="owners-section">
          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">DATA ERROR</span>
                <h3>Owner Profile</h3>
                <p className="owner-team-name">
                  {error?.message || "Unable to load league data."}
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
  } = leagueData;

  // ====================================================
  // OWNER
  // ====================================================

  const owner = owners.find(
    (item) => Number(item.id) === ownerId
  );

  if (!owner) {
    return (
      <main className="page-shell">
        <h1>Owner Not Found</h1>
        <Link href="/owners">← Back to Owners</Link>
      </main>
    );
  }

  const ownerMap = new Map(
    owners.map((item) => [Number(item.id), item.name])
  );

  const currentTeam =
    currentTeams.find(
      (team) =>
        Number(team.owner_id ?? team.ownerId) === ownerId
    ) || null;

  const isActive = Boolean(currentTeam);

  // ====================================================
  // HISTORICAL TEAMS AND ALL-FRANCHISE TEAM
  // ====================================================

  const [teamHistoryResult, franchiseResult] = await Promise.all([
    supabase
      .from("teams")
      .select("season_year, owner_id, team_name")
      .eq("owner_id", ownerId)
      .lt("season_year", currentSeason)
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
  ]);

  const historicalTeams = teamHistoryResult.data || [];

  const teams = [...historicalTeams];

  if (currentTeam) {
    teams.push({
      season_year: currentSeason,
      owner_id: ownerId,
      team_name:
        currentTeam.team_name ||
        currentTeam.teamName ||
        "Unknown Team",
    });
  }

  const franchiseTeam = [
    ...(franchiseResult.data || []),
  ].sort(
    (a, b) =>
      (FRANCHISE_SLOT_ORDER[a.franchise_slot] || 99) -
      (FRANCHISE_SLOT_ORDER[b.franchise_slot] || 99)
  );

  // ====================================================
  // OWNER SEASON RESULTS
  // ====================================================

  const results = seasonResults
    .filter(
      (result) => Number(result.owner_id) === ownerId
    )
    .sort(
      (a, b) =>
        Number(b.season_year) -
        Number(a.season_year)
    );

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

  const careerPoints = results.reduce(
    (sum, result) => sum + num(result.points_for),
    0
  );

  const regularWinPct = winPct(
    regularWins,
    regularLosses,
    regularTies
  );

  const playoffAppearances = results.filter(
    (result) => Boolean(result.playoff_appearance)
  ).length;

  const finalsAppearances = results.filter(
    (result) => Boolean(result.championship_appearance)
  ).length;

  const championships = results.filter(
    (result) => Boolean(result.champion)
  ).length;

  // ====================================================
  // COMPLETED MATCHUP HISTORY
  // ====================================================

  const completedGames = matchups
    .filter((game) => {
      const homeId = Number(game.home_owner_id);
      const awayId = Number(game.away_owner_id);

      return homeId === ownerId || awayId === ownerId;
    })
    .map((game) => {
      const result = getGameResult(game, ownerId);

      if (!result) return null;

      const isHome =
        Number(game.home_owner_id) === ownerId;

      const opponentId = isHome
        ? Number(game.away_owner_id)
        : Number(game.home_owner_id);

      const ownerScore = num(
        isHome ? game.home_score : game.away_score
      );

      const opponentScore = num(
        isHome ? game.away_score : game.home_score
      );

      return {
        ...game,
        opponentId,
        opponentName:
          ownerMap.get(opponentId) || "Unknown",
        ownerScore,
        opponentScore,
        result,
        margin: ownerScore - opponentScore,
        gameType: getGameType(game),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const yearDifference =
        Number(b.season_year) - Number(a.season_year);

      if (yearDifference !== 0) return yearDifference;

      return (
        Number(b.matchup_period) -
        Number(a.matchup_period)
      );
    });

  // ====================================================
  // POSTSEASON RECORDS
  // ====================================================

  const postseasonStats = {
    playoffWins: 0,
    playoffLosses: 0,
    playoffTies: 0,
    consolationWins: 0,
    consolationLosses: 0,
    consolationTies: 0,
  };

  for (const game of completedGames) {
    if (game.gameType === "Playoff") {
      if (game.result === "W") postseasonStats.playoffWins++;
      if (game.result === "L") postseasonStats.playoffLosses++;
      if (game.result === "T") postseasonStats.playoffTies++;
    }

    if (game.gameType === "Consolation") {
      if (game.result === "W") postseasonStats.consolationWins++;
      if (game.result === "L") postseasonStats.consolationLosses++;
      if (game.result === "T") postseasonStats.consolationTies++;
    }
  }

  // ====================================================
  // SEASON HISTORY
  // ====================================================

  const seasonHistory = results.map((season) => {
    const year = Number(season.season_year);

    const team = teams.find(
      (item) => Number(item.season_year) === year
    );

    let postseason =
      year === Number(currentSeason)
        ? "Current Season"
        : "Missed Playoffs";

    if (season.champion) {
      postseason = "Champion";
    } else if (season.championship_appearance) {
      postseason = "Runner-Up";
    } else if (season.playoff_appearance) {
      postseason = "Playoffs";
    }

    return {
      ...season,
      teamName: team?.team_name || "—",
      postseason,
    };
  });

  // ====================================================
  // TEAM NAME HISTORY
  // ====================================================

  const teamNameMap = new Map();

  for (const team of teams) {
    const normalized = normalizeTeamName(team.team_name);

    if (!normalized) continue;

    if (!teamNameMap.has(normalized)) {
      teamNameMap.set(normalized, {
        team_name: team.team_name,
        seasons: new Set(),
      });
    }

    teamNameMap
      .get(normalized)
      .seasons.add(Number(team.season_year));
  }

  const teamNameGroups = [...teamNameMap.values()]
    .map((team) => ({
      team_name: team.team_name,
      seasons: [...team.seasons].sort((a, b) => a - b),
    }))
    .sort(
      (a, b) =>
        Math.max(...b.seasons) -
        Math.max(...a.seasons)
    );

  // ====================================================
  // HEAD TO HEAD
  // ====================================================

  const headToHeadMap = new Map();

  for (const game of completedGames) {
    const id = game.opponentId;

    if (!id) continue;

    if (!headToHeadMap.has(id)) {
      headToHeadMap.set(id, {
        opponentId: id,
        opponentName: game.opponentName,
        wins: 0,
        losses: 0,
        ties: 0,
        games: 0,
      });
    }

    const record = headToHeadMap.get(id);

    record.games++;

    if (game.result === "W") record.wins++;
    if (game.result === "L") record.losses++;
    if (game.result === "T") record.ties++;
  }

  const headToHead = [...headToHeadMap.values()].sort(
    (a, b) =>
      a.opponentName.localeCompare(b.opponentName)
  );

  // ====================================================
  // CAREER RECORDS
  // ====================================================

  const scoredGames = completedGames.filter(
    (game) =>
      Number.isFinite(game.ownerScore) &&
      Number.isFinite(game.opponentScore)
  );

  const wins = scoredGames.filter(
    (game) => game.result === "W"
  );

  const losses = scoredGames.filter(
    (game) => game.result === "L"
  );

  const highestScore = [...scoredGames].sort(
    (a, b) => b.ownerScore - a.ownerScore
  )[0] || null;

  const lowestScore = [...scoredGames].sort(
    (a, b) => a.ownerScore - b.ownerScore
  )[0] || null;

  const biggestWin = [...wins].sort(
    (a, b) => b.margin - a.margin
  )[0] || null;

  const biggestLoss = [...losses].sort(
    (a, b) => a.margin - b.margin
  )[0] || null;

  const closestWin = [...wins].sort(
    (a, b) => a.margin - b.margin
  )[0] || null;

  const closestLoss = [...losses].sort(
    (a, b) => b.margin - a.margin
  )[0] || null;

  const bestSeason = [...results]
    .filter(
      (season) =>
        num(season.wins) +
          num(season.losses) +
          num(season.ties) >
        0
    )
    .sort((a, b) => {
      const aPct = winPct(a.wins, a.losses, a.ties);
      const bPct = winPct(b.wins, b.losses, b.ties);

      if (bPct !== aPct) return bPct - aPct;

      if (num(b.wins) !== num(a.wins)) {
        return num(b.wins) - num(a.wins);
      }

      return num(b.points_for) - num(a.points_for);
    })[0] || null;

  // ====================================================
  // LONGEST WIN STREAK
  // ====================================================

  const chronologicalGames = [...completedGames].sort(
    (a, b) => {
      const yearDifference =
        Number(a.season_year) - Number(b.season_year);

      if (yearDifference !== 0) return yearDifference;

      return (
        Number(a.matchup_period) -
        Number(b.matchup_period)
      );
    }
  );

  let currentWinStreak = 0;
  let longestWinStreak = 0;

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
  // CURRENT WEEK
  // ====================================================

  const completedWeeks = completedCurrentMatchups
    .map((game) => Number(game.matchup_period))
    .filter(
      (week) => Number.isFinite(week) && week > 0
    );

  const latestCompletedWeek = completedWeeks.length
    ? Math.max(...completedWeeks)
    : 0;

  // ====================================================
  // PAGE
  // ====================================================

  return (
    <main className="page-shell">

      {/* HEADER */}

      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </Link>

          <span>
            THE LEAGUE ARCHIVE · EST. 2014
          </span>
        </div>
      </header>

      {/* OWNER HERO */}

      <section className="owner-profile-hero">
        <div>
          <p className="eyebrow">
            OWNER PROFILE
          </p>

          <h1>{owner.name}</h1>

          <p>
            {isActive
              ? currentTeam?.team_name ||
                currentTeam?.teamName ||
                "Active Owner"
              : "Former Dirty P Owner"}
          </p>
        </div>
      </section>

      {/* NAVIGATION */}

      <div className="page-nav">
        <Link href="/owners">
          ← All Owners
        </Link>

        <span>
          {latestCompletedWeek > 0
            ? `Through ${currentSeason} Week ${latestCompletedWeek}`
            : `${currentSeason} Season`}
        </span>
      </div>

      {/* CAREER SNAPSHOT */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CAREER</p>
            <h2>Career Snapshot</h2>
          </div>

          <span>
            Updated Throughout {currentSeason}
          </span>
        </div>

        <div className="owners-grid">
          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">
                  REGULAR SEASON
                </span>

                <h3>
                  {formatRecord(
                    regularWins,
                    regularLosses,
                    regularTies
                  )}
                </h3>

                <p className="owner-team-name">
                  Career Record
                </p>
              </div>
            </div>

            <div className="owner-record">
              <div>
                <strong>
                  {regularWinPct.toFixed(1)}%
                </strong>
                <span>WIN %</span>
              </div>

              <div>
                <strong>
                  {formatScore(careerPoints)}
                </strong>
                <span>CAREER POINTS</span>
              </div>
            </div>
          </article>

          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">
                  LEAGUE HISTORY
                </span>

                <h3>{results.length}</h3>

                <p className="owner-team-name">
                  Seasons Played
                </p>
              </div>
            </div>

            <div className="owner-record">
              <div>
                <strong>{playoffAppearances}</strong>
                <span>PLAYOFFS</span>
              </div>

              <div>
                <strong>{championships}</strong>
                <span>TITLES</span>
              </div>
            </div>
          </article>
        </div>

        {/* POSTSEASON RECORDS */}

        <div className="owners-grid" style={{ marginTop: 16 }}>
          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">
                  CHAMPIONSHIP BRACKET
                </span>

                <h3>
                  {formatRecord(
                    postseasonStats.playoffWins,
                    postseasonStats.playoffLosses,
                    postseasonStats.playoffTies
                  )}
                </h3>

                <p className="owner-team-name">
                  Career Playoff Record
                </p>
              </div>
            </div>

            <div className="owner-record">
              <div>
                <strong>
                  {winPct(
                    postseasonStats.playoffWins,
                    postseasonStats.playoffLosses,
                    postseasonStats.playoffTies
                  ).toFixed(1)}%
                </strong>
                <span>PLAYOFF WIN %</span>
              </div>

              <div>
                <strong>{finalsAppearances}</strong>
                <span>FINALS</span>
              </div>
            </div>
          </article>

          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">
                  CONSOLATION BRACKET
                </span>

                <h3>
                  {formatRecord(
                    postseasonStats.consolationWins,
                    postseasonStats.consolationLosses,
                    postseasonStats.consolationTies
                  )}
                </h3>

                <p className="owner-team-name">
                  Career Consolation Record
                </p>
              </div>
            </div>

            <div className="owner-record">
              <div>
                <strong>
                  {winPct(
                    postseasonStats.consolationWins,
                    postseasonStats.consolationLosses,
                    postseasonStats.consolationTies
                  ).toFixed(1)}%
                </strong>
                <span>CONSOLATION WIN %</span>
              </div>

              <div>
                <strong>
                  {postseasonStats.consolationWins +
                    postseasonStats.consolationLosses +
                    postseasonStats.consolationTies}
                </strong>
                <span>CONSOLATION GAMES</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* SEASON HISTORY */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              YEAR BY YEAR
            </p>

            <h2>Season History</h2>
          </div>

          <span>
            {seasonHistory.length} Seasons
          </span>
        </div>

        <div className="profile-table-wrap">
          <table className="profile-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Team</th>
                <th>Record</th>
                <th>PF</th>
                <th>PA</th>
                <th>Reg. Finish</th>
                <th>Final Finish</th>
                <th>Postseason</th>
              </tr>
            </thead>

            <tbody>
              {seasonHistory.map((season) => (
                <tr key={season.season_year}>
                  <td>
                    <strong>
                      {season.season_year}
                    </strong>
                  </td>

                  <td>{season.teamName}</td>

                  <td>
                    {formatRecord(
                      season.wins,
                      season.losses,
                      season.ties
                    )}
                  </td>

                  <td>
                    {formatScore(season.points_for)}
                  </td>

                  <td>
                    {formatScore(season.points_against)}
                  </td>

                  <td>
                    {season.regular_season_finish || "—"}
                  </td>

                  <td>
                    {season.final_finish || "—"}
                  </td>

                  <td>
                    <span
                      className={
                        season.champion
                          ? "profile-champion-label"
                          : ""
                      }
                    >
                      {season.postseason}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ALL-FRANCHISE TEAM */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              FRANCHISE GREATS
            </p>

            <h2>All-Franchise Team</h2>
          </div>

          <span>
            Best Single-Season Players
          </span>
        </div>

        {franchiseTeam.length > 0 ? (
          <div className="all-franchise-grid">
            {franchiseTeam.map((player) => (
              <div
                className="all-franchise-card"
                key={`${player.franchise_slot}-${player.espn_player_id}-${player.season_year}`}
              >
                <div className="all-franchise-slot">
                  {player.franchise_slot}
                </div>

                <div className="all-franchise-player">
                  {player.player_name}
                </div>

                <div className="all-franchise-meta">
                  <span>{player.position}</span>
                  <span>{player.season_year}</span>
                </div>

                <div className="all-franchise-team-name">
                  {player.dirty_p_team_name || "—"}
                </div>

                <div className="all-franchise-points">
                  {formatScore(player.fantasy_points)}{" "}
                  <small>PTS</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="current-panel">
            <div className="empty-current-state">
              <strong>
                No All-Franchise Team data yet.
              </strong>

              <p>
                Player history has not been loaded
                for this owner.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* HEAD-TO-HEAD */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              RIVALRIES
            </p>

            <h2>Head-to-Head</h2>
          </div>

          <span>
            Includes completed {currentSeason} games
          </span>
        </div>

        <div className="h2h-grid">
          {headToHead.map((record) => (
            <div
              className="h2h-card"
              key={record.opponentId}
            >
              <span>vs.</span>

              <strong>
                {record.opponentName}
              </strong>

              <div>
                {formatRecord(
                  record.wins,
                  record.losses,
                  record.ties
                )}
              </div>

              <small>
                {record.games} Games
              </small>
            </div>
          ))}
        </div>
      </section>

      {/* CAREER HIGHS AND LOWS */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              CAREER RECORD BOOK
            </p>

            <h2>Highs & Lows</h2>
          </div>

          <span>
            Career Records
          </span>
        </div>

        <div className="career-record-grid">
          <CareerRecordCard
            label="HIGHEST SCORE"
            game={highestScore}
          />

          <CareerRecordCard
            label="LOWEST SCORE"
            game={lowestScore}
          />

          <CareerRecordCard
            label="BIGGEST WIN"
            game={biggestWin}
          />

          <CareerRecordCard
            label="BIGGEST LOSS"
            game={biggestLoss}
          />

          <CareerRecordCard
            label="CLOSEST WIN"
            game={closestWin}
          />

          <CareerRecordCard
            label="CLOSEST LOSS"
            game={closestLoss}
          />

          <div className="career-record-card">
            <span>
              BEST REGULAR SEASON
            </span>

            {bestSeason ? (
              <>
                <strong>
                  {formatRecord(
                    bestSeason.wins,
                    bestSeason.losses,
                    bestSeason.ties
                  )}
                </strong>

                <span>
                  {bestSeason.season_year}
                </span>
              </>
            ) : (
              <strong>—</strong>
            )}
          </div>

          <div className="career-record-card">
            <span>
              LONGEST WIN STREAK
            </span>

            <strong>
              {longestWinStreak}
            </strong>

            <span>
              Consecutive Games
            </span>
          </div>
        </div>
      </section>

      {/* TEAM NAME HISTORY */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE FRANCHISE
            </p>

            <h2>Team Name History</h2>
          </div>
        </div>

        <div className="team-history-list">
          {teamNameGroups.map((team) => (
            <div
              className="team-history-row"
              key={normalizeTeamName(team.team_name)}
            >
              <strong>
                {team.team_name}
              </strong>

              <span>
                {team.seasons.join(", ")}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* COMPLETE MATCHUP HISTORY */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              EVERY GAME
            </p>

            <h2>Matchup History</h2>
          </div>

          <span>
            {completedGames.length} Games
          </span>
        </div>

        <div className="profile-table-wrap">
          <table className="profile-table matchup-history-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Week</th>
                <th>Type</th>
                <th>Opponent</th>
                <th>Result</th>
                <th>Score</th>
              </tr>
            </thead>

            <tbody>
              {completedGames.map((game, index) => (
                <tr
                  key={
                    game.id ||
                    `${game.season_year}-${game.matchup_period}-${game.opponentId}-${index}`
                  }
                >
                  <td>
                    {game.season_year}
                  </td>

                  <td>
                    {game.matchup_period}
                  </td>

                  <td>
                    {game.gameType}
                  </td>

                  <td>
                    {game.opponentName}
                  </td>

                  <td>
                    <strong
                      className={
                        game.result === "W"
                          ? "game-win"
                          : game.result === "L"
                          ? "game-loss"
                          : ""
                      }
                    >
                      {game.result}
                    </strong>
                  </td>

                  <td>
                    {formatScore(game.ownerScore)}
                    {" – "}
                    {formatScore(game.opponentScore)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
