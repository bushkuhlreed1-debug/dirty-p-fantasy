import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value) {
  return num(value).toFixed(2);
}

function getGameType(game) {
  const matchupType = String(game.matchup_type || "")
    .trim()
    .toLowerCase();

  const playoffTier = String(game.playoff_tier || "")
    .trim()
    .toLowerCase();

  if (
    matchupType === "consolation" ||
    matchupType.includes("consolation") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("losers") ||
    playoffTier.includes("loser")
  ) {
    return "consolation";
  }

  if (
    matchupType === "playoff" ||
    matchupType.includes("championship") ||
    playoffTier.includes("winners_bracket") ||
    playoffTier.includes("winner") ||
    playoffTier.includes("championship") ||
    game.is_championship === true
  ) {
    return "playoff";
  }

  return "regular";
}

function getResult(game, side) {
  const winner = String(game.winner || "").toUpperCase();

  if (winner === "TIE") return "T";
  if (winner === side) return "W";

  if (winner === "HOME" || winner === "AWAY") {
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

function recordText(wins, losses, ties = 0) {
  return ties > 0
    ? `${wins}-${losses}-${ties}`
    : `${wins}-${losses}`;
}

function buildRecord(games, owner1Id) {
  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  for (const game of games) {
    const owner1IsHome =
      Number(game.home_owner_id) === owner1Id;

    const result = getResult(
      game,
      owner1IsHome ? "HOME" : "AWAY"
    );

    if (result === "W") owner1Wins += 1;
    else if (result === "L") owner2Wins += 1;
    else ties += 1;
  }

  return {
    owner1Wins,
    owner2Wins,
    ties,
  };
}

function getGameView(game, owner1Id, owner2Id) {
  const owner1IsHome =
    Number(game.home_owner_id) === owner1Id;

  const owner1Score = owner1IsHome
    ? num(game.home_score)
    : num(game.away_score);

  const owner2Score = owner1IsHome
    ? num(game.away_score)
    : num(game.home_score);

  const owner1Team = owner1IsHome
    ? game.home_team_name
    : game.away_team_name;

  const owner2Team = owner1IsHome
    ? game.away_team_name
    : game.home_team_name;

  const owner1Side = owner1IsHome
    ? "HOME"
    : "AWAY";

  const owner1Result = getResult(
    game,
    owner1Side
  );

  return {
    ...game,
    owner1Id,
    owner2Id,
    owner1Score,
    owner2Score,
    owner1Team,
    owner2Team,
    owner1Result,
    type: getGameType(game),
    margin: Math.abs(
      owner1Score - owner2Score
    ),
  };
}

function getCurrentStreak(games) {
  if (!games.length) return null;

  const newestFirst = [...games].sort(
    (a, b) =>
      b.season - a.season ||
      b.week - a.week
  );

  const latest = newestFirst[0];

  if (latest.owner1Result === "T") {
    return {
      owner: "Tie",
      count: 1,
    };
  }

  const targetResult = latest.owner1Result;
  let count = 0;

  for (const game of newestFirst) {
    if (game.owner1Result === targetResult) {
      count += 1;
    } else {
      break;
    }
  }

  return {
    owner:
      targetResult === "W"
        ? "owner1"
        : "owner2",
    count,
  };
}

function getLongestStreak(games) {
  if (!games.length) return null;

  const sorted = [...games].sort(
    (a, b) =>
      a.season - b.season ||
      a.week - b.week
  );

  let bestOwner = null;
  let bestCount = 0;
  let currentOwner = null;
  let currentCount = 0;

  for (const game of sorted) {
    if (game.owner1Result === "T") {
      currentOwner = null;
      currentCount = 0;
      continue;
    }

    const winner =
      game.owner1Result === "W"
        ? "owner1"
        : "owner2";

    if (winner === currentOwner) {
      currentCount += 1;
    } else {
      currentOwner = winner;
      currentCount = 1;
    }

    if (currentCount > bestCount) {
      bestCount = currentCount;
      bestOwner = currentOwner;
    }
  }

  return {
    owner: bestOwner,
    count: bestCount,
  };
}

function buildSummary({
  owner1Name,
  owner2Name,
  overall,
  meetings,
  owner1Points,
  owner2Points,
  playoffRecord,
  championshipGames,
  biggestWin,
  closestGame,
  latestGame,
}) {
  if (!meetings) return "";

  let opening = "";

  if (
    overall.owner1Wins ===
    overall.owner2Wins
  ) {
    opening =
      `${owner1Name} and ${owner2Name} are tied ` +
      `${recordText(
        overall.owner1Wins,
        overall.owner2Wins,
        overall.ties
      )} across ${meetings} all-time meetings.`;
  } else {
    const leader =
      overall.owner1Wins >
      overall.owner2Wins
        ? owner1Name
        : owner2Name;

    const leaderWins = Math.max(
      overall.owner1Wins,
      overall.owner2Wins
    );

    const trailingWins = Math.min(
      overall.owner1Wins,
      overall.owner2Wins
    );

    opening =
      `${owner1Name} and ${owner2Name} have met ` +
      `${meetings} times in Dirty P history, with ` +
      `${leader} leading the all-time series ` +
      `${leaderWins}-${trailingWins}` +
      `${
        overall.ties
          ? `-${overall.ties}`
          : ""
      }.`;
  }

  const scoring =
    ` Across those meetings, ${owner1Name} has scored ` +
    `${formatScore(owner1Points)} total points compared ` +
    `with ${formatScore(owner2Points)} for ${owner2Name}.`;

  let postseason = "";

  const playoffMeetings =
    playoffRecord.owner1Wins +
    playoffRecord.owner2Wins +
    playoffRecord.ties;

  if (playoffMeetings > 0) {
    postseason =
      ` They have met ${playoffMeetings} ` +
      `${playoffMeetings === 1 ? "time" : "times"} in the ` +
      `championship bracket, with a playoff record of ` +
      `${recordText(
        playoffRecord.owner1Wins,
        playoffRecord.owner2Wins,
        playoffRecord.ties
      )} from ${owner1Name}'s perspective.`;
  }

  if (championshipGames.length > 0) {
    postseason +=
      ` The rivalry has also included ` +
      `${championshipGames.length} Dirty P Championship ` +
      `${championshipGames.length === 1 ? "meeting" : "meetings"}.`;
  }

  let notable = "";

  if (biggestWin) {
    const winner =
      biggestWin.owner1Result === "W"
        ? owner1Name
        : owner2Name;

    notable +=
      ` The largest victory in the series belongs to ` +
      `${winner}, who won by ${formatScore(biggestWin.margin)} ` +
      `points in Week ${biggestWin.week} of ${biggestWin.season}.`;
  }

  if (
    closestGame &&
    closestGame !== biggestWin
  ) {
    notable +=
      ` Their closest matchup was decided by just ` +
      `${formatScore(closestGame.margin)} points in Week ` +
      `${closestGame.week} of ${closestGame.season}.`;
  }

  let recent = "";

  if (latestGame) {
    if (latestGame.owner1Result === "T") {
      recent =
        ` Their most recent meeting ended in a tie in Week ` +
        `${latestGame.week} of ${latestGame.season}.`;
    } else {
      const winner =
        latestGame.owner1Result === "W"
          ? owner1Name
          : owner2Name;

      recent =
        ` ${winner} won the most recent meeting, ` +
        `${formatScore(
          latestGame.owner1Result === "W"
            ? latestGame.owner1Score
            : latestGame.owner2Score
        )}-${formatScore(
          latestGame.owner1Result === "W"
            ? latestGame.owner2Score
            : latestGame.owner1Score
        )}, in Week ${latestGame.week} of ${latestGame.season}.`;
    }
  }

  return (
    opening +
    scoring +
    postseason +
    notable +
    recent
  );
}

export default async function HeadToHeadPage({
  searchParams,
}) {
  const params = await searchParams;

  const selectedOwner1 = Number(
    params?.owner1 || 0
  );

  const selectedOwner2 = Number(
    params?.owner2 || 0
  );

  const [
    { data: owners },
    { data: matchupData },
  ] = await Promise.all([
    supabase
      .from("owners")
      .select("id, name")
      .order("name", {
        ascending: true,
      }),

    supabase
      .from("matchups")
      .select("*")
      .lt("season_year", 2026)
      .order("season_year", {
        ascending: true,
      })
      .order("matchup_period", {
        ascending: true,
      }),
  ]);

  const ownerList = owners || [];

  const ownerMap = new Map(
    ownerList.map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  const completedGames = (
    matchupData || []
  ).filter((game) => {
    const home = Number(
      game.home_score
    );

    const away = Number(
      game.away_score
    );

    return (
      game.home_owner_id &&
      game.away_owner_id &&
      game.home_score !== null &&
      game.away_score !== null &&
      Number.isFinite(home) &&
      Number.isFinite(away) &&
      !(home === 0 && away === 0)
    );
  });

  const validSelection =
    selectedOwner1 > 0 &&
    selectedOwner2 > 0 &&
    selectedOwner1 !== selectedOwner2 &&
    ownerMap.has(selectedOwner1) &&
    ownerMap.has(selectedOwner2);

  let comparison = null;

  if (validSelection) {
    const owner1Name =
      ownerMap.get(selectedOwner1);

    const owner2Name =
      ownerMap.get(selectedOwner2);

    const rawGames =
      completedGames.filter(
        (game) => {
          const homeId = Number(
            game.home_owner_id
          );

          const awayId = Number(
            game.away_owner_id
          );

          return (
            (homeId === selectedOwner1 &&
              awayId === selectedOwner2) ||
            (homeId === selectedOwner2 &&
              awayId === selectedOwner1)
          );
        }
      );

    const games = rawGames
      .map((game) =>
        getGameView(
          game,
          selectedOwner1,
          selectedOwner2
        )
      )
      .map((game) => ({
        ...game,
        season: Number(
          game.season_year
        ),
        week: Number(
          game.matchup_period
        ),
      }))
      .sort(
        (a, b) =>
          b.season - a.season ||
          b.week - a.week
      );

    const overall = buildRecord(
      rawGames,
      selectedOwner1
    );

    const regularRaw =
      rawGames.filter(
        (game) =>
          getGameType(game) ===
          "regular"
      );

    const playoffRaw =
      rawGames.filter(
        (game) =>
          getGameType(game) ===
          "playoff"
      );

    const consolationRaw =
      rawGames.filter(
        (game) =>
          getGameType(game) ===
          "consolation"
      );

    const regularRecord =
      buildRecord(
        regularRaw,
        selectedOwner1
      );

    const playoffRecord =
      buildRecord(
        playoffRaw,
        selectedOwner1
      );

    const consolationRecord =
      buildRecord(
        consolationRaw,
        selectedOwner1
      );

    const owner1Points =
      games.reduce(
        (sum, game) =>
          sum + game.owner1Score,
        0
      );

    const owner2Points =
      games.reduce(
        (sum, game) =>
          sum + game.owner2Score,
        0
      );

    const meetings = games.length;

    const owner1Average =
      meetings > 0
        ? owner1Points / meetings
        : 0;

    const owner2Average =
      meetings > 0
        ? owner2Points / meetings
        : 0;

    const decidedGames =
      games.filter(
        (game) =>
          game.owner1Result !== "T"
      );

    const biggestWin =
      decidedGames.length
        ? [...decidedGames].sort(
            (a, b) =>
              b.margin - a.margin
          )[0]
        : null;

    const closestGame =
      decidedGames.length
        ? [...decidedGames].sort(
            (a, b) =>
              a.margin - b.margin
          )[0]
        : null;

    const latestGame =
      games.length ? games[0] : null;

    const championshipGames =
      games.filter(
        (game) =>
          game.is_championship ===
          true
      );

    const currentStreak =
      getCurrentStreak(games);

    const longestStreak =
      getLongestStreak(games);

    const summary = buildSummary({
      owner1Name,
      owner2Name,
      overall,
      meetings,
      owner1Points,
      owner2Points,
      playoffRecord,
      championshipGames,
      biggestWin,
      closestGame,
      latestGame,
    });

    comparison = {
      owner1Name,
      owner2Name,
      games,
      meetings,
      overall,
      regularRecord,
      playoffRecord,
      consolationRecord,
      regularMeetings:
        regularRaw.length,
      playoffMeetings:
        playoffRaw.length,
      consolationMeetings:
        consolationRaw.length,
      championshipGames,
      owner1Points,
      owner2Points,
      owner1Average,
      owner2Average,
      biggestWin,
      closestGame,
      latestGame,
      currentStreak,
      longestStreak,
      summary,
    };
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-title">
          <strong>
            DIRTY P FANTASY FOOTBALL
          </strong>
          <span>LEAGUE ARCHIVE</span>
        </div>
      </header>

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            ALL-TIME SERIES
          </p>

          <h1>Head-to-Head</h1>

          <p>
            Choose any two Dirty P owners
            to see their complete rivalry
            history.
          </p>
        </div>

        <div className="owners-count">
          <strong>
            {ownerList.length}
          </strong>
          <span>OWNERS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>
        <span>2014–2025</span>
      </nav>

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              RIVALRY SEARCH
            </p>
            <h2>Compare Two Owners</h2>
          </div>

          <span>
            Every completed matchup counts
          </span>
        </div>

        <form
          method="GET"
          className="h2h-search-card"
        >
          <div className="h2h-search-field">
            <label htmlFor="owner1">
              OWNER 1
            </label>

            <select
              id="owner1"
              name="owner1"
              defaultValue={
                selectedOwner1 || ""
              }
              required
            >
              <option value="">
                Select owner
              </option>

              {ownerList.map(
                (owner) => (
                  <option
                    key={owner.id}
                    value={owner.id}
                  >
                    {owner.name}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="h2h-search-vs">
            VS
          </div>

          <div className="h2h-search-field">
            <label htmlFor="owner2">
              OWNER 2
            </label>

            <select
              id="owner2"
              name="owner2"
              defaultValue={
                selectedOwner2 || ""
              }
              required
            >
              <option value="">
                Select owner
              </option>

              {ownerList.map(
                (owner) => (
                  <option
                    key={owner.id}
                    value={owner.id}
                  >
                    {owner.name}
                  </option>
                )
              )}
            </select>
          </div>

          <button
            type="submit"
            className="h2h-search-button"
          >
            VIEW MATCHUP
          </button>
        </form>

        {selectedOwner1 > 0 &&
          selectedOwner1 ===
            selectedOwner2 && (
            <div className="h2h-error">
              Choose two different owners.
            </div>
          )}
      </section>

      {comparison && (
        <>
          <section className="owners-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  ALL-TIME RIVALRY
                </p>

                <h2>
                  {comparison.owner1Name}
                  {" vs "}
                  {comparison.owner2Name}
                </h2>
              </div>

              <span>
                {comparison.meetings}{" "}
                {comparison.meetings === 1
                  ? "Meeting"
                  : "Meetings"}
              </span>
            </div>

            {comparison.meetings ===
            0 ? (
              <div className="current-panel">
                <div className="empty-current-state">
                  <strong>
                    No matchups found
                  </strong>

                  <p>
                    These two owners have
                    not played a completed
                    Dirty P matchup in the
                    historical database.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="h2h-series-card h2h-featured-series">
                  <div className="h2h-series-top">
                    <span>
                      ALL-TIME SERIES
                    </span>

                    <strong>
                      {
                        comparison.meetings
                      }{" "}
                      MEETINGS
                    </strong>
                  </div>

                  <div className="h2h-series-matchup">
                    <div className="h2h-series-owner">
                      <Link
                        href={`/owners/${selectedOwner1}`}
                      >
                        {
                          comparison.owner1Name
                        }
                      </Link>

                      <strong>
                        {
                          comparison
                            .overall
                            .owner1Wins
                        }
                      </strong>

                      <span>WINS</span>
                    </div>

                    <div className="h2h-series-vs">
                      <span>SERIES</span>

                      <strong>
                        {recordText(
                          comparison
                            .overall
                            .owner1Wins,
                          comparison
                            .overall
                            .owner2Wins,
                          comparison
                            .overall
                            .ties
                        )}
                      </strong>

                      <small>
                        {comparison
                          .overall.ties >
                        0
                          ? `${
                              comparison
                                .overall
                                .ties
                            } tie${
                              comparison
                                .overall
                                .ties ===
                              1
                                ? ""
                                : "s"
                            }`
                          : "No ties"}
                      </small>
                    </div>

                    <div className="h2h-series-owner right">
                      <Link
                        href={`/owners/${selectedOwner2}`}
                      >
                        {
                          comparison.owner2Name
                        }
                      </Link>

                      <strong>
                        {
                          comparison
                            .overall
                            .owner2Wins
                        }
                      </strong>

                      <span>WINS</span>
                    </div>
                  </div>

                  <div className="h2h-series-stats">
                    <div>
                      <span>
                        {
                          comparison.owner1Name
                        }
                      </span>

                      <strong>
                        {formatScore(
                          comparison.owner1Points
                        )}
                      </strong>

                      <small>
                        TOTAL POINTS
                      </small>
                    </div>

                    <div>
                      <span>
                        AVERAGE SCORE
                      </span>

                      <strong>
                        {formatScore(
                          comparison.owner1Average
                        )}
                        {" – "}
                        {formatScore(
                          comparison.owner2Average
                        )}
                      </strong>

                      <small>
                        ALL MATCHUPS
                      </small>
                    </div>

                    <div>
                      <span>
                        {
                          comparison.owner2Name
                        }
                      </span>

                      <strong>
                        {formatScore(
                          comparison.owner2Points
                        )}
                      </strong>

                      <small>
                        TOTAL POINTS
                      </small>
                    </div>
                  </div>
                </div>

                <div className="h2h-summary-card">
                  <span>
                    RIVALRY SUMMARY
                  </span>

                  <p>
                    {comparison.summary}
                  </p>
                </div>
              </>
            )}
          </section>

          {comparison.meetings > 0 && (
            <>
              <section className="owners-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      SERIES BREAKDOWN
                    </p>

                    <h2>
                      Head-to-Head Stats
                    </h2>
                  </div>
                </div>

                <div className="record-book-grid">
                  <div className="record-book-card">
                    <span className="record-book-label">
                      Regular Season
                    </span>

                    <strong className="record-book-value">
                      {recordText(
                        comparison
                          .regularRecord
                          .owner1Wins,
                        comparison
                          .regularRecord
                          .owner2Wins,
                        comparison
                          .regularRecord
                          .ties
                      )}
                    </strong>

                    <span className="record-book-owner">
                      {
                        comparison.owner1Name
                      }{" "}
                      perspective
                    </span>

                    <span className="record-book-detail">
                      {
                        comparison.regularMeetings
                      }{" "}
                      regular-season meetings
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Championship-Bracket
                      Playoffs
                    </span>

                    <strong className="record-book-value">
                      {recordText(
                        comparison
                          .playoffRecord
                          .owner1Wins,
                        comparison
                          .playoffRecord
                          .owner2Wins,
                        comparison
                          .playoffRecord
                          .ties
                      )}
                    </strong>

                    <span className="record-book-owner">
                      {
                        comparison.owner1Name
                      }{" "}
                      perspective
                    </span>

                    <span className="record-book-detail">
                      {
                        comparison.playoffMeetings
                      }{" "}
                      playoff meetings
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Consolation Games
                    </span>

                    <strong className="record-book-value">
                      {recordText(
                        comparison
                          .consolationRecord
                          .owner1Wins,
                        comparison
                          .consolationRecord
                          .owner2Wins,
                        comparison
                          .consolationRecord
                          .ties
                      )}
                    </strong>

                    <span className="record-book-owner">
                      Counted in overall
                      series
                    </span>

                    <span className="record-book-detail">
                      {
                        comparison.consolationMeetings
                      }{" "}
                      consolation meetings
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Championship Meetings
                    </span>

                    <strong className="record-book-value">
                      {
                        comparison
                          .championshipGames
                          .length
                      }
                    </strong>

                    <span className="record-book-owner">
                      Dirty P Championship
                    </span>

                    <span className="record-book-detail">
                      All-time title-game
                      meetings
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Biggest Win
                    </span>

                    <strong className="record-book-value">
                      {comparison.biggestWin
                        ? formatScore(
                            comparison
                              .biggestWin
                              .margin
                          )
                        : "—"}
                    </strong>

                    <span className="record-book-owner">
                      {comparison.biggestWin
                        ? comparison
                            .biggestWin
                            .owner1Result ===
                          "W"
                          ? comparison.owner1Name
                          : comparison.owner2Name
                        : "No result"}
                    </span>

                    <span className="record-book-detail">
                      {comparison.biggestWin
                        ? `${comparison.biggestWin.season} • Week ${comparison.biggestWin.week}`
                        : ""}
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Closest Game
                    </span>

                    <strong className="record-book-value">
                      {comparison.closestGame
                        ? formatScore(
                            comparison
                              .closestGame
                              .margin
                          )
                        : "—"}
                    </strong>

                    <span className="record-book-owner">
                      Point margin
                    </span>

                    <span className="record-book-detail">
                      {comparison.closestGame
                        ? `${comparison.closestGame.season} • Week ${comparison.closestGame.week}`
                        : ""}
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Current Series Streak
                    </span>

                    <strong className="record-book-value">
                      {comparison
                        .currentStreak
                        ?.count || 0}
                    </strong>

                    <span className="record-book-owner">
                      {comparison
                        .currentStreak
                        ?.owner ===
                      "owner1"
                        ? comparison.owner1Name
                        : comparison
                              .currentStreak
                              ?.owner ===
                            "owner2"
                          ? comparison.owner2Name
                          : "Tie"}
                    </span>

                    <span className="record-book-detail">
                      Consecutive wins
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Longest Series
                      Win Streak
                    </span>

                    <strong className="record-book-value">
                      {comparison
                        .longestStreak
                        ?.count || 0}
                    </strong>

                    <span className="record-book-owner">
                      {comparison
                        .longestStreak
                        ?.owner ===
                      "owner1"
                        ? comparison.owner1Name
                        : comparison
                              .longestStreak
                              ?.owner ===
                            "owner2"
                          ? comparison.owner2Name
                          : "—"}
                    </span>

                    <span className="record-book-detail">
                      Consecutive wins
                    </span>
                  </div>
                </div>
              </section>

              <section className="owners-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      GAME LOG
                    </p>

                    <h2>
                      Complete Matchup
                      History
                    </h2>
                  </div>

                  <span>
                    Newest first
                  </span>
                </div>

                <div className="profile-table-wrap">
                  <table className="profile-table matchup-history-table">
                    <thead>
                      <tr>
                        <th>Season</th>
                        <th>Week</th>
                        <th>Type</th>
                        <th>
                          {
                            comparison.owner1Name
                          }
                        </th>
                        <th>Score</th>
                        <th>
                          {
                            comparison.owner2Name
                          }
                        </th>
                        <th>Result</th>
                      </tr>
                    </thead>

                    <tbody>
                      {comparison.games.map(
                        (game, index) => (
                          <tr
                            key={`${game.season}-${game.week}-${index}`}
                          >
                            <td>
                              <strong>
                                {
                                  game.season
                                }
                              </strong>
                            </td>

                            <td>
                              Week{" "}
                              {game.week}
                            </td>

                            <td>
                              {game.is_championship
                                ? "Championship"
                                : game.type ===
                                    "playoff"
                                  ? "Playoff"
                                  : game.type ===
                                      "consolation"
                                    ? "Consolation"
                                    : "Regular"}
                            </td>

                            <td>
                              <strong>
                                {
                                  game.owner1Team
                                }
                              </strong>
                            </td>

                            <td>
                              {formatScore(
                                game.owner1Score
                              )}
                              {" – "}
                              {formatScore(
                                game.owner2Score
                              )}
                            </td>

                            <td>
                              <strong>
                                {
                                  game.owner2Team
                                }
                              </strong>
                            </td>

                            <td>
                              <span
                                className={
                                  game.owner1Result ===
                                  "W"
                                    ? "game-win"
                                    : game.owner1Result ===
                                        "L"
                                      ? "game-loss"
                                      : ""
                                }
                              >
                                {
                                  game.owner1Result
                                }
                              </span>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {!comparison &&
        !(
          selectedOwner1 > 0 &&
          selectedOwner1 ===
            selectedOwner2
        ) && (
          <section className="owners-section">
            <div className="current-panel">
              <div className="empty-current-state">
                <strong>
                  Pick two owners above
                </strong>

                <p>
                  Their complete Dirty P
                  head-to-head history will
                  appear here.
                </p>
              </div>
            </div>
          </section>
        )}

      <footer className="site-footer">
        <strong>
          DIRTY P FANTASY FOOTBALL
        </strong>

        <p>
          Independent fantasy league
          archive. Not affiliated with or
          endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
