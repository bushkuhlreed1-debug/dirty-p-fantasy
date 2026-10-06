import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";

export const dynamic = "force-dynamic";

// =========================================================
// HELPERS
// =========================================================

function num(value) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function formatScore(value) {
  return num(
    value
  ).toFixed(2);
}

function recordText(
  wins,
  losses,
  ties = 0
) {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
}

// =========================================================
// GAME TYPE
// =========================================================

function getGameType(game) {
  const matchupType =
    String(
      game.matchup_type ||
        ""
    )
      .trim()
      .toLowerCase();

  const playoffTier =
    String(
      game.playoff_tier ||
        ""
    )
      .trim()
      .toLowerCase();

  // =======================================================
  // CONSOLATION FIRST
  // =======================================================

  if (
    matchupType ===
      "consolation" ||
    matchupType.includes(
      "consolation"
    ) ||
    playoffTier.includes(
      "consolation"
    ) ||
    playoffTier.includes(
      "losers"
    ) ||
    playoffTier.includes(
      "loser"
    ) ||
    game.is_consolation ===
      true
  ) {
    return "consolation";
  }

  // =======================================================
  // CHAMPIONSHIP BRACKET
  // =======================================================

  if (
    matchupType ===
      "playoff" ||
    matchupType.includes(
      "championship"
    ) ||
    playoffTier.includes(
      "winners_bracket"
    ) ||
    playoffTier.includes(
      "winner"
    ) ||
    playoffTier.includes(
      "championship"
    ) ||
    game.is_playoff ===
      true ||
    game.is_championship ===
      true ||
    game.is_third_place ===
      true
  ) {
    return "playoff";
  }

  return "regular";
}

// =========================================================
// RESULT
// =========================================================

function getResult(
  game,
  side
) {
  const winner =
    String(
      game.winner ||
        ""
    ).toUpperCase();

  if (
    winner === "TIE"
  ) {
    return "T";
  }

  if (
    winner === side
  ) {
    return "W";
  }

  if (
    winner === "HOME" ||
    winner === "AWAY"
  ) {
    return "L";
  }

  const home =
    num(
      game.home_score
    );

  const away =
    num(
      game.away_score
    );

  if (
    home === away
  ) {
    return "T";
  }

  if (
    side === "HOME"
  ) {
    return home > away
      ? "W"
      : "L";
  }

  return away > home
    ? "W"
    : "L";
}

// =========================================================
// SERIES RECORD
// =========================================================

function buildRecord(
  games,
  owner1Id
) {
  let owner1Wins =
    0;

  let owner2Wins =
    0;

  let ties =
    0;

  for (
    const game of
    games
  ) {
    const owner1IsHome =
      Number(
        game.home_owner_id
      ) ===
      Number(
        owner1Id
      );

    const result =
      getResult(
        game,
        owner1IsHome
          ? "HOME"
          : "AWAY"
      );

    if (
      result === "W"
    ) {
      owner1Wins +=
        1;
    } else if (
      result === "L"
    ) {
      owner2Wins +=
        1;
    } else {
      ties +=
        1;
    }
  }

  return {
    owner1Wins,
    owner2Wins,
    ties,
  };
}

// =========================================================
// NORMALIZED MATCHUP VIEW
// =========================================================

function getGameView(
  game,
  owner1Id,
  owner2Id
) {
  const owner1IsHome =
    Number(
      game.home_owner_id
    ) ===
    Number(
      owner1Id
    );

  const owner1Score =
    owner1IsHome
      ? num(
          game.home_score
        )
      : num(
          game.away_score
        );

  const owner2Score =
    owner1IsHome
      ? num(
          game.away_score
        )
      : num(
          game.home_score
        );

  const owner1Team =
    owner1IsHome
      ? game.home_team_name
      : game.away_team_name;

  const owner2Team =
    owner1IsHome
      ? game.away_team_name
      : game.home_team_name;

  const owner1Result =
    getResult(
      game,
      owner1IsHome
        ? "HOME"
        : "AWAY"
    );

  return {
    ...game,

    owner1Id,

    owner2Id,

    owner1Score,

    owner2Score,

    owner1Team:
      owner1Team ||
      "Unknown Team",

    owner2Team:
      owner2Team ||
      "Unknown Team",

    owner1Result,

    type:
      getGameType(
        game
      ),

    margin:
      Math.abs(
        owner1Score -
        owner2Score
      ),

    season:
      Number(
        game.season_year
      ),

    week:
      Number(
        game.matchup_period
      ),
  };
}

// =========================================================
// OFFICIAL RIVALRY WEEK PAIRS
// =========================================================

const OFFICIAL_RIVALRIES = [
  [
    "Reed Bushkuhl",
    "Austin Lloyd",
  ],

  [
    "Ryan Goodlett",
    "Matthew Aitkens",
  ],

  [
    "Tyler Guenther",
    "Edward Wachtel",
  ],

  [
    "Brent Fleischer",
    "Valentin Almendarez",
  ],

  [
    "Jacob Madden",
    "Cody Stinnett",
  ],
];

function isOfficialRivalry(
  owner1Name,
  owner2Name
) {
  return OFFICIAL_RIVALRIES.some(
    ([a, b]) =>
      (
        a ===
          owner1Name &&
        b ===
          owner2Name
      ) ||
      (
        a ===
          owner2Name &&
        b ===
          owner1Name
      )
  );
}

// =========================================================
// CURRENT SERIES STREAK
// =========================================================

function getCurrentStreak(
  games
) {
  if (
    !games.length
  ) {
    return null;
  }

  const newestFirst = [
    ...games,
  ].sort(
    (a, b) =>
      b.season -
        a.season ||
      b.week -
        a.week
  );

  const latest =
    newestFirst[0];

  if (
    latest.owner1Result ===
    "T"
  ) {
    return null;
  }

  const targetResult =
    latest.owner1Result;

  let count =
    0;

  for (
    const game of
    newestFirst
  ) {
    if (
      game.owner1Result ===
      targetResult
    ) {
      count +=
        1;
    } else {
      break;
    }
  }

  return {
    owner:
      targetResult ===
      "W"
        ? "owner1"
        : "owner2",

    count,
  };
}

// =========================================================
// LONGEST SERIES WIN STREAK
// =========================================================

function getLongestStreak(
  games
) {
  if (
    !games.length
  ) {
    return null;
  }

  const chronological = [
    ...games,
  ].sort(
    (a, b) =>
      a.season -
        b.season ||
      a.week -
        b.week
  );

  let currentOwner =
    null;

  let currentCount =
    0;

  let bestOwner =
    null;

  let bestCount =
    0;

  for (
    const game of
    chronological
  ) {
    if (
      game.owner1Result ===
      "T"
    ) {
      currentOwner =
        null;

      currentCount =
        0;

      continue;
    }

    const winner =
      game.owner1Result ===
      "W"
        ? "owner1"
        : "owner2";

    if (
      winner ===
      currentOwner
    ) {
      currentCount +=
        1;
    } else {
      currentOwner =
        winner;

      currentCount =
        1;
    }

    if (
      currentCount >
      bestCount
    ) {
      bestOwner =
        currentOwner;

      bestCount =
        currentCount;
    }
  }

  if (
    !bestOwner
  ) {
    return null;
  }

  return {
    owner:
      bestOwner,

    count:
      bestCount,
  };
}

// =========================================================
// GAME WINNER
// =========================================================

function getWinnerSide(
  game
) {
  if (!game) {
    return null;
  }

  if (
    game.owner1Result ===
    "W"
  ) {
    return "owner1";
  }

  if (
    game.owner1Result ===
    "L"
  ) {
    return "owner2";
  }

  return null;
}

// =========================================================
// PAGE
// =========================================================

export default async function HeadToHeadPage({
  searchParams,
}) {
  const params =
    await searchParams;

  const requestedOwner1 =
    Number(
      params?.owner1 ||
        0
    );

  const requestedOwner2 =
    Number(
      params?.owner2 ||
        0
    );

  // =========================================================
  // LIVE LEAGUE DATA
  // =========================================================

  let leagueData;

  try {
    leagueData =
      await getLeagueData();
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

                <h3>
                  Head-to-Head
                </h3>

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
    owners,
    matchups,
    completedCurrentMatchups,
    unmatchedEspnOwners,
  } =
    leagueData;

  // =========================================================
  // OWNERS
  // =========================================================

  const ownerList = [
    ...owners,
  ].sort(
    (a, b) =>
      String(
        a.name
      ).localeCompare(
        String(
          b.name
        )
      )
  );

  const ownerMap =
    new Map(
      ownerList.map(
        (owner) => [
          Number(
            owner.id
          ),
          owner.name,
        ]
      )
    );

  // =========================================================
  // DEFAULT MATCHUP
  //
  // Reed vs Austin
  // =========================================================

  const reed =
    ownerList.find(
      (owner) =>
        owner.name ===
        "Reed Bushkuhl"
    );

  const austin =
    ownerList.find(
      (owner) =>
        owner.name ===
        "Austin Lloyd"
    );

  const selectedOwner1 =
    requestedOwner1 ||
    Number(
      reed?.id ||
        ownerList[0]?.id ||
        0
    );

  const selectedOwner2 =
    requestedOwner2 ||
    Number(
      austin?.id ||
        ownerList[1]?.id ||
        0
    );

  // =========================================================
  // COMPLETED MATCHUPS
  //
  // Historical Supabase games +
  // completed current ESPN games.
  // =========================================================

  const completedGames =
    matchups.filter(
      (game) => {
        const homeId =
          Number(
            game.home_owner_id
          );

        const awayId =
          Number(
            game.away_owner_id
          );

        const homeScore =
          Number(
            game.home_score
          );

        const awayScore =
          Number(
            game.away_score
          );

        return (
          homeId > 0 &&
          awayId > 0 &&
          game.home_score !==
            null &&
          game.away_score !==
            null &&
          Number.isFinite(
            homeScore
          ) &&
          Number.isFinite(
            awayScore
          ) &&
          !(
            homeScore ===
              0 &&
            awayScore ===
              0
          )
        );
      }
    );

  // =========================================================
  // CURRENT COMPLETED WEEK
  // =========================================================

  const completedWeeks =
    completedCurrentMatchups
      .map(
        (game) =>
          Number(
            game.matchup_period
          )
      )
      .filter(
        (week) =>
          Number.isFinite(
            week
          ) &&
          week > 0
      );

  const latestCompletedWeek =
    completedWeeks.length >
    0
      ? Math.max(
          ...completedWeeks
        )
      : 0;

  // =========================================================
  // VALID SELECTION
  // =========================================================

  const validSelection =
    selectedOwner1 >
      0 &&
    selectedOwner2 >
      0 &&
    selectedOwner1 !==
      selectedOwner2 &&
    ownerMap.has(
      selectedOwner1
    ) &&
    ownerMap.has(
      selectedOwner2
    );

  // =========================================================
  // BUILD COMPARISON
  // =========================================================

  let comparison =
    null;

  if (
    validSelection
  ) {
    const owner1Name =
      ownerMap.get(
        selectedOwner1
      );

    const owner2Name =
      ownerMap.get(
        selectedOwner2
      );

    // =======================================================
    // GAMES BETWEEN THESE TWO OWNERS
    // =======================================================

    const rawGames =
      completedGames.filter(
        (game) => {
          const homeId =
            Number(
              game.home_owner_id
            );

          const awayId =
            Number(
              game.away_owner_id
            );

          return (
            (
              homeId ===
                selectedOwner1 &&
              awayId ===
                selectedOwner2
            ) ||
            (
              homeId ===
                selectedOwner2 &&
              awayId ===
                selectedOwner1
            )
          );
        }
      );

    const games =
      rawGames
        .map(
          (game) =>
            getGameView(
              game,
              selectedOwner1,
              selectedOwner2
            )
        )
        .sort(
          (a, b) =>
            b.season -
              a.season ||
            b.week -
              a.week
        );

    // =======================================================
    // SPLITS
    // =======================================================

    const regularRaw =
      rawGames.filter(
        (game) =>
          getGameType(
            game
          ) ===
          "regular"
      );

    const playoffRaw =
      rawGames.filter(
        (game) =>
          getGameType(
            game
          ) ===
          "playoff"
      );

    const consolationRaw =
      rawGames.filter(
        (game) =>
          getGameType(
            game
          ) ===
          "consolation"
      );

    // =======================================================
    // RECORDS
    // =======================================================

    const overall =
      buildRecord(
        rawGames,
        selectedOwner1
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

    // =======================================================
    // POINTS
    // =======================================================

    const owner1Points =
      games.reduce(
        (
          sum,
          game
        ) =>
          sum +
          game.owner1Score,
        0
      );

    const owner2Points =
      games.reduce(
        (
          sum,
          game
        ) =>
          sum +
          game.owner2Score,
        0
      );

    const meetings =
      games.length;

    const owner1Average =
      meetings > 0
        ? owner1Points /
          meetings
        : 0;

    const owner2Average =
      meetings > 0
        ? owner2Points /
          meetings
        : 0;

    // =======================================================
    // SPECIAL GAMES
    // =======================================================

    const decidedGames =
      games.filter(
        (game) =>
          game.owner1Result !==
          "T"
      );

    const biggestWin =
      decidedGames.length >
      0
        ? [
            ...decidedGames,
          ].sort(
            (a, b) =>
              b.margin -
              a.margin
          )[0]
        : null;

    const closestGame =
      decidedGames.length >
      0
        ? [
            ...decidedGames,
          ].sort(
            (a, b) =>
              a.margin -
              b.margin
          )[0]
        : null;

    const latestGame =
      games.length >
      0
        ? games[0]
        : null;

    const championshipGames =
      games.filter(
        (game) =>
          game.is_championship ===
          true
      );

    // =======================================================
    // STREAKS
    // =======================================================

    const currentStreak =
      getCurrentStreak(
        games
      );

    const longestStreak =
      getLongestStreak(
        games
      );

    // =======================================================
    // RETURN COMPARISON
    // =======================================================

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

      officialRivalry:
        isOfficialRivalry(
          owner1Name,
          owner2Name
        ),
    };
  }

  // =========================================================
  // DISPLAY HELPERS
  // =========================================================

  const latestWinnerSide =
    comparison
      ? getWinnerSide(
          comparison.latestGame
        )
      : null;

  const latestWinnerName =
    latestWinnerSide ===
      "owner1"
      ? comparison
          ?.owner1Name
      : latestWinnerSide ===
          "owner2"
        ? comparison
            ?.owner2Name
        : null;

  const biggestWinnerSide =
    comparison
      ? getWinnerSide(
          comparison.biggestWin
        )
      : null;

  const biggestWinnerName =
    biggestWinnerSide ===
      "owner1"
      ? comparison
          ?.owner1Name
      : biggestWinnerSide ===
          "owner2"
        ? comparison
            ?.owner2Name
        : null;

  const currentStreakName =
    comparison
      ?.currentStreak
      ?.owner ===
    "owner1"
      ? comparison
          .owner1Name
      : comparison
          ?.currentStreak
          ?.owner ===
        "owner2"
        ? comparison
            .owner2Name
        : null;

  const longestStreakName =
    comparison
      ?.longestStreak
      ?.owner ===
    "owner1"
      ? comparison
          .owner1Name
      : comparison
          ?.longestStreak
          ?.owner ===
        "owner2"
        ? comparison
            .owner2Name
        : null;

  // =========================================================
  // PAGE
  // =========================================================

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
            ALL-TIME SERIES
          </p>

          <h1>
            Head-to-Head
          </h1>

          <p>
            Compare any two Dirty P owners
            across every completed matchup
            in league history.
          </p>

        </div>


        <div className="owners-count">

          <strong>
            {ownerList.length}
          </strong>

          <span>
            OWNERS
          </span>

        </div>

      </section>


      {/* NAV */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>

          {latestCompletedWeek >
          0
            ? `Through ${currentSeason} Week ${latestCompletedWeek}`
            : `Through ${currentSeason}`}

        </span>

      </nav>


      {/* ESPN OWNER WARNING */}

      {unmatchedEspnOwners.length >
        0 && (

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


      {/* =====================================================
          MATCHUP SEARCH
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              MATCHUP SEARCH
            </p>

            <h2>
              Compare Two Owners
            </h2>

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
                selectedOwner1 ||
                ""
              }
              required
            >

              <option value="">
                Select owner
              </option>


              {ownerList.map(
                (owner) => (

                  <option
                    key={
                      owner.id
                    }
                    value={
                      owner.id
                    }
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
                selectedOwner2 ||
                ""
              }
              required
            >

              <option value="">
                Select owner
              </option>


              {ownerList.map(
                (owner) => (

                  <option
                    key={
                      owner.id
                    }
                    value={
                      owner.id
                    }
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


        {selectedOwner1 ===
          selectedOwner2 && (

          <div className="h2h-error">
            Pick two different owners.
          </div>

        )}

      </section>


      {/* =====================================================
          COMPARISON
          ===================================================== */}

      {comparison && (

        <>

          <section className="owners-section">

            <div className="section-heading">

              <div>

                <p className="eyebrow">

                  {comparison.officialRivalry
                    ? "🔥 OFFICIAL RIVALRY"
                    : "ALL-TIME MATCHUP"}

                </p>

                <h2>

                  {comparison.owner1Name}
                  {" vs "}
                  {comparison.owner2Name}

                </h2>

              </div>


              <span>

                {comparison.meetings}{" "}

                {comparison.meetings ===
                1
                  ? "Meeting"
                  : "Meetings"}

              </span>

            </div>


            {comparison.officialRivalry && (

              <div className="h2h-rivalry-banner">

                <span>
                  🔥 RIVALRY WEEK
                </span>

                <strong>
                  OFFICIAL DIRTY P RIVALS
                </strong>

              </div>

            )}


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
                    Dirty P matchup.
                  </p>

                </div>

              </div>

            ) : (

              <>

                {/* =================================================
                    FEATURED SERIES CARD
                    ================================================= */}

                <div className="h2h-series-card h2h-featured-series">

                  <div className="h2h-series-top">

                    <span>

                      {comparison.officialRivalry
                        ? "RIVALRY SERIES"
                        : "ALL-TIME SERIES"}

                    </span>

                    <strong>

                      {comparison.meetings}{" "}
                      MEETINGS

                    </strong>

                  </div>


                  <div className="h2h-series-matchup">

                    <div className="h2h-series-owner">

                      <Link
                        href={`/owners/${selectedOwner1}`}
                      >
                        {comparison.owner1Name}
                      </Link>

                      <strong>

                        {
                          comparison
                            .overall
                            .owner1Wins
                        }

                      </strong>

                      <span>
                        WINS
                      </span>

                    </div>


                    <div className="h2h-series-vs">

                      <span>
                        SERIES
                      </span>

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
                          .overall
                          .ties >
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
                        {comparison.owner2Name}
                      </Link>

                      <strong>

                        {
                          comparison
                            .overall
                            .owner2Wins
                        }

                      </strong>

                      <span>
                        WINS
                      </span>

                    </div>

                  </div>


                  <div className="h2h-series-stats">

                    <div>

                      <span>
                        {comparison.owner1Name}
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
                        {comparison.owner2Name}
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

              </>

            )}

          </section>


          {/* ===================================================
              SERIES BREAKDOWN
              =================================================== */}

          {comparison.meetings >
            0 && (

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

                  <span>
                    Live All-Time Results
                  </span>

                </div>


                <div className="record-book-grid">

                  {/* REGULAR SEASON */}

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
                      {comparison.owner1Name} perspective
                    </span>

                    <span className="record-book-detail">

                      {comparison.regularMeetings}{" "}

                      regular-season{" "}

                      {comparison.regularMeetings ===
                      1
                        ? "meeting"
                        : "meetings"}

                    </span>

                  </div>


                  {/* PLAYOFFS */}

                  <div className="record-book-card">

                    <span className="record-book-label">
                      Championship-Bracket Playoffs
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
                      {comparison.owner1Name} perspective
                    </span>

                    <span className="record-book-detail">

                      {comparison.playoffMeetings}{" "}

                      playoff{" "}

                      {comparison.playoffMeetings ===
                      1
                        ? "meeting"
                        : "meetings"}

                    </span>

                  </div>


                  {/* CONSOLATION */}

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
                      Counted in overall series
                    </span>

                    <span className="record-book-detail">

                      {comparison.consolationMeetings}{" "}

                      consolation{" "}

                      {comparison.consolationMeetings ===
                      1
                        ? "meeting"
                        : "meetings"}

                    </span>

                  </div>


                  {/* CHAMPIONSHIP */}

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
                      All-time title-game meetings
                    </span>

                  </div>


                  {/* LATEST MEETING */}

                  <div className="record-book-card">

                    <span className="record-book-label">
                      Latest Meeting
                    </span>

                    <strong className="record-book-value">

                      {comparison.latestGame
                        ? `${formatScore(
                            comparison
                              .latestGame
                              .owner1Score
                          )} – ${formatScore(
                            comparison
                              .latestGame
                              .owner2Score
                          )}`
                        : "—"}

                    </strong>

                    <span className="record-book-owner">

                      {latestWinnerName ||
                        "Tie"}

                    </span>

                    <span className="record-book-detail">

                      {comparison.latestGame
                        ? `${comparison.latestGame.season} • Week ${comparison.latestGame.week}`
                        : ""}

                    </span>

                  </div>


                  {/* BIGGEST WIN */}

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

                      {biggestWinnerName ||
                        "No result"}

                    </span>

                    <span className="record-book-detail">

                      {comparison.biggestWin
                        ? `${comparison.biggestWin.season} • Week ${comparison.biggestWin.week}`
                        : ""}

                    </span>

                  </div>


                  {/* CLOSEST GAME */}

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
                      Point Margin
                    </span>

                    <span className="record-book-detail">

                      {comparison.closestGame
                        ? `${comparison.closestGame.season} • Week ${comparison.closestGame.week}`
                        : ""}

                    </span>

                  </div>


                  {/* CURRENT STREAK */}

                  <div className="record-book-card">

                    <span className="record-book-label">
                      Current Series Streak
                    </span>

                    <strong className="record-book-value">

                      {comparison
                        .currentStreak
                        ?.count ||
                        0}

                    </strong>

                    <span className="record-book-owner">

                      {currentStreakName ||
                        "No active streak"}

                    </span>

                    <span className="record-book-detail">
                      Consecutive wins
                    </span>

                  </div>


                  {/* LONGEST STREAK */}

                  <div className="record-book-card">

                    <span className="record-book-label">
                      Longest Series Win Streak
                    </span>

                    <strong className="record-book-value">

                      {comparison
                        .longestStreak
                        ?.count ||
                        0}

                    </strong>

                    <span className="record-book-owner">

                      {longestStreakName ||
                        "—"}

                    </span>

                    <span className="record-book-detail">
                      Consecutive wins
                    </span>

                  </div>

                </div>

              </section>


              {/* =================================================
                  GAME LOG
                  ================================================= */}

              <section className="owners-section">

                <div className="section-heading">

                  <div>

                    <p className="eyebrow">
                      GAME LOG
                    </p>

                    <h2>
                      Complete Matchup History
                    </h2>

                  </div>

                  <span>
                    Newest First
                  </span>

                </div>


                <div className="profile-table-wrap">

                  <table className="profile-table matchup-history-table">

                    <thead>

                      <tr>

                        <th>
                          Season
                        </th>

                        <th>
                          Week
                        </th>

                        <th>
                          Type
                        </th>

                        <th>
                          {comparison.owner1Name}
                        </th>

                        <th>
                          Score
                        </th>

                        <th>
                          {comparison.owner2Name}
                        </th>

                        <th>
                          Result
                        </th>

                      </tr>

                    </thead>


                    <tbody>

                      {comparison.games.map(
                        (
                          game,
                          index
                        ) => (

                          <tr
                            key={`${game.season}-${game.week}-${game.id || index}`}
                          >

                            <td>

                              <strong>
                                {game.season}
                              </strong>

                            </td>


                            <td>
                              Week {game.week}
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
                                {game.owner1Team}
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
                                {game.owner2Team}
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

                                {game.owner1Result}

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
