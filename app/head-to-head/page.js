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

function recordText(wins, losses, ties = 0) {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
}

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
    playoffTier.includes(
      "winners_bracket"
    ) ||
    playoffTier.includes("winner") ||
    playoffTier.includes(
      "championship"
    ) ||
    game.is_championship === true
  ) {
    return "playoff";
  }

  return "regular";
}

function getResult(game, side) {
  const winner = String(
    game.winner || ""
  ).toUpperCase();

  if (winner === "TIE") {
    return "T";
  }

  if (winner === side) {
    return "W";
  }

  if (
    winner === "HOME" ||
    winner === "AWAY"
  ) {
    return "L";
  }

  const home = num(
    game.home_score
  );

  const away = num(
    game.away_score
  );

  if (home === away) {
    return "T";
  }

  if (side === "HOME") {
    return home > away
      ? "W"
      : "L";
  }

  return away > home
    ? "W"
    : "L";
}

function buildRecord(
  games,
  owner1Id
) {
  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  for (const game of games) {
    const owner1IsHome =
      Number(
        game.home_owner_id
      ) === owner1Id;

    const result =
      getResult(
        game,
        owner1IsHome
          ? "HOME"
          : "AWAY"
      );

    if (result === "W") {
      owner1Wins += 1;
    } else if (
      result === "L"
    ) {
      owner2Wins += 1;
    } else {
      ties += 1;
    }
  }

  return {
    owner1Wins,
    owner2Wins,
    ties,
  };
}

function getGameView(
  game,
  owner1Id,
  owner2Id
) {
  const owner1IsHome =
    Number(
      game.home_owner_id
    ) === owner1Id;

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

    owner1Team,
    owner2Team,

    owner1Result,

    type:
      getGameType(game),

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

/*
  OFFICIAL RIVALRY WEEK
  MATCHUPS

  These are only used to mark
  designated Rivalry Week
  opponents on this page.
*/

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
    ([a, b]) => {
      return (
        (a === owner1Name &&
          b === owner2Name) ||
        (a === owner2Name &&
          b === owner1Name)
      );
    }
  );
}

function getCurrentStreak(
  games
) {
  if (!games.length) {
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

  let count = 0;

  for (
    const game of
    newestFirst
  ) {
    if (
      game.owner1Result ===
      targetResult
    ) {
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

function getLongestStreak(
  games
) {
  if (!games.length) {
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

  if (!bestOwner) {
    return null;
  }

  return {
    owner:
      bestOwner,

    count:
      bestCount,
  };
}

function StatCard({
  label,
  value,
  owner,
  detail,
}) {
  return (
    <div className="record-book-card">

      <span className="record-book-label">
        {label}
      </span>

      <strong className="record-book-value">
        {value}
      </strong>

      {owner ? (
        <span className="record-book-owner">
          {owner}
        </span>
      ) : null}

      {detail ? (
        <span className="record-book-detail">
          {detail}
        </span>
      ) : null}

    </div>
  );
}

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

  const [
    {
      data: owners,
      error:
        ownersError,
    },

    {
      data:
        matchupData,

      error:
        matchupsError,
    },
  ] =
    await Promise.all([
      supabase
        .from("owners")
        .select(
          "id, name"
        )
        .order(
          "name",
          {
            ascending:
              true,
          }
        ),

      supabase
        .from("matchups")
        .select("*")
        .lt(
          "season_year",
          2026
        )
        .order(
          "season_year",
          {
            ascending:
              true,
          }
        )
        .order(
          "matchup_period",
          {
            ascending:
              true,
          }
        ),
    ]);

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (
    ownersError ||
    matchupsError
  ) {
    return (
      <main className="page-shell">

        <h1>
          Head-to-Head
        </h1>

        <p>
          Database error:{" "}
          {
            ownersError
              ?.message ||
            matchupsError
              ?.message
          }
        </p>

      </main>
    );
  }

  // =========================================================
  // OWNER LOOKUP
  // =========================================================

  const ownerList =
    owners || [];

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
        ownerList[0]
          ?.id ||
        0
    );

  const selectedOwner2 =
    requestedOwner2 ||
    Number(
      austin?.id ||
        ownerList[1]
          ?.id ||
        0
    );

  // =========================================================
  // COMPLETED MATCHUPS
  // =========================================================

  const completedGames =
    (
      matchupData ||
      []
    ).filter(
      (game) => {
        const home =
          Number(
            game.home_score
          );

        const away =
          Number(
            game.away_score
          );

        return (
          game.home_owner_id &&
          game.away_owner_id &&

          game.home_score !==
            null &&

          game.away_score !==
            null &&

          Number.isFinite(
            home
          ) &&

          Number.isFinite(
            away
          ) &&

          !(
            home === 0 &&
            away === 0
          )
        );
      }
    );

  // =========================================================
  // HISTORY RANGE
  // =========================================================

  const completedSeasonYears =
    [
      ...new Set(
        completedGames.map(
          (game) =>
            Number(
              game.season_year
            )
        )
      ),
    ]
      .filter(
        (year) =>
          Number.isFinite(
            year
          )
      )
      .sort(
        (a, b) =>
          a - b
      );

  const firstSeason =
    completedSeasonYears[
      0
    ] || 2014;

  const latestCompletedSeason =
    completedSeasonYears[
      completedSeasonYears
        .length - 1
    ] || 2025;

  // =========================================================
  // VALID SELECTION
  // =========================================================

  const validSelection =
    selectedOwner1 > 0 &&

    selectedOwner2 > 0 &&

    selectedOwner1 !==
      selectedOwner2 &&

    ownerMap.has(
      selectedOwner1
    ) &&

    ownerMap.has(
      selectedOwner2
    );

  let comparison =
    null;

  // =========================================================
  // BUILD COMPARISON
  // =========================================================

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

    // ---------------------------------------------------------
    // ALL GAMES BETWEEN OWNERS
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // DISPLAY VERSION
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // GAME TYPES
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // RECORDS
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // POINTS
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // CLOSEST / BIGGEST
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // CHAMPIONSHIPS
    // ---------------------------------------------------------

    const championshipGames =
      games.filter(
        (game) =>
          game.is_championship ===
          true
      );

    // ---------------------------------------------------------
    // STREAKS
    // ---------------------------------------------------------

    const currentStreak =
      getCurrentStreak(
        games
      );

    const longestStreak =
      getLongestStreak(
        games
      );

    // ---------------------------------------------------------
    // RIVALRY WEEK DESIGNATION
    // ---------------------------------------------------------

    const officialRivalry =
      isOfficialRivalry(
        owner1Name,
        owner2Name
      );

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

      currentStreak,
      longestStreak,

      officialRivalry,
    };
  }

  // =========================================================
  // DISPLAY HELPERS
  // =========================================================

  const sameOwnerSelected =
    selectedOwner1 > 0 &&

    selectedOwner1 ===
      selectedOwner2;

  const currentStreakOwner =
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
        : "No active streak";

  const longestStreakOwner =
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
        : "—";

  const biggestWinOwner =
    comparison
      ?.biggestWin
      ? comparison
            .biggestWin
            .owner1Result ===
          "W"
        ? comparison
            .owner1Name
        : comparison
            .owner2Name
      : "No result";

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <main className="page-shell">

      {/* =====================================================
          HEADER
          ===================================================== */}

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


      {/* =====================================================
          HERO
          ===================================================== */}

      <section className="owners-hero">

        <div>

          <p className="eyebrow">
            ALL-TIME SERIES
          </p>

          <h1>
            Head-to-Head
          </h1>

          <p>
            Pick any two Dirty P owners
            and compare their complete
            matchup history.
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


      {/* =====================================================
          PAGE NAV
          ===================================================== */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          {firstSeason}–
          {latestCompletedSeason}
        </span>

      </nav>


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

          {/* OWNER 1 */}

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
                    {
                      owner.name
                    }
                  </option>

                )
              )}

            </select>

          </div>


          {/* VS */}

          <div className="h2h-search-vs">
            VS
          </div>


          {/* OWNER 2 */}

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
                    {
                      owner.name
                    }
                  </option>

                )
              )}

            </select>

          </div>


          {/* BUTTON */}

          <button
            type="submit"
            className="h2h-search-button"
          >
            VIEW MATCHUP
          </button>

        </form>


        {sameOwnerSelected && (

          <div className="h2h-error">
            Pick two different owners.
          </div>

        )}

      </section>


      {/* =====================================================
          SERIES OVERVIEW
          ===================================================== */}

      {comparison && (

        <>

          <section className="owners-section">

            <div className="section-heading">

              <div>

                <p className="eyebrow">

                  {comparison.officialRivalry
                    ? "RIVALRY WEEK MATCHUP"
                    : "ALL-TIME MATCHUP"}

                </p>


                <h2>

                  {
                    comparison.owner1Name
                  }

                  {" vs "}

                  {
                    comparison.owner2Name
                  }

                </h2>

              </div>


              <span>

                {
                  comparison.meetings
                }{" "}

                {comparison.meetings ===
                1
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

              <div className="h2h-series-card h2h-featured-series">

                {/* SERIES HEADER */}

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


                {/* SERIES SCORE */}

                <div className="h2h-series-matchup">

                  {/* OWNER 1 */}

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

                    <span>
                      WINS
                    </span>

                  </div>


                  {/* SERIES */}

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
                        .ties > 0

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


                  {/* OWNER 2 */}

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

                    <span>
                      WINS
                    </span>

                  </div>

                </div>


                {/* POINT TOTALS */}

                <div className="h2h-series-stats">

                  {/* OWNER 1 POINTS */}

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


                  {/* AVERAGE */}

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


                  {/* OWNER 2 POINTS */}

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

            )}

          </section>


          {/* =================================================
              SERIES STATS
              ================================================= */}

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

                </div>


                <div className="record-book-grid">

                  {/* REGULAR SEASON */}

                  <StatCard
                    label="Regular Season"

                    value={recordText(
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

                    owner={`${comparison.owner1Name} perspective`}

                    detail={`${comparison.regularMeetings} regular-season meetings`}
                  />


                  {/* PLAYOFFS */}

                  <StatCard
                    label="Championship-Bracket Playoffs"

                    value={recordText(
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

                    owner={`${comparison.owner1Name} perspective`}

                    detail={`${comparison.playoffMeetings} playoff meetings`}
                  />


                  {/* CONSOLATION */}

                  <StatCard
                    label="Consolation Games"

                    value={recordText(
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

                    owner="Counted in overall series"

                    detail={`${comparison.consolationMeetings} consolation meetings`}
                  />


                  {/* CHAMPIONSHIP MEETINGS */}

                  <StatCard
                    label="Championship Meetings"

                    value={
                      comparison
                        .championshipGames
                        .length
                    }

                    owner="Dirty P Championship"

                    detail="All-time title-game meetings"
                  />


                  {/* BIGGEST WIN */}

                  <StatCard
                    label="Biggest Win"

                    value={
                      comparison.biggestWin
                        ? formatScore(
                            comparison
                              .biggestWin
                              .margin
                          )
                        : "—"
                    }

                    owner={
                      biggestWinOwner
                    }

                    detail={
                      comparison.biggestWin
                        ? `${comparison.biggestWin.season} • Week ${comparison.biggestWin.week}`
                        : ""
                    }
                  />


                  {/* CLOSEST GAME */}

                  <StatCard
                    label="Closest Game"

                    value={
                      comparison.closestGame
                        ? formatScore(
                            comparison
                              .closestGame
                              .margin
                          )
                        : "—"
                    }

                    owner="Point margin"

                    detail={
                      comparison.closestGame
                        ? `${comparison.closestGame.season} • Week ${comparison.closestGame.week}`
                        : ""
                    }
                  />


                  {/* CURRENT STREAK */}

                  <StatCard
                    label="Current Series Streak"

                    value={
                      comparison
                        .currentStreak
                        ?.count ||
                      0
                    }

                    owner={
                      currentStreakOwner
                    }

                    detail="Consecutive wins"
                  />


                  {/* LONGEST STREAK */}

                  <StatCard
                    label="Longest Series Win Streak"

                    value={
                      comparison
                        .longestStreak
                        ?.count ||
                      0
                    }

                    owner={
                      longestStreakOwner
                    }

                    detail="Consecutive wins"
                  />

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
                    Newest first
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
                          {
                            comparison.owner1Name
                          }
                        </th>

                        <th>
                          Score
                        </th>

                        <th>
                          {
                            comparison.owner2Name
                          }
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
                            key={`${game.season}-${game.week}-${index}`}
                          >

                            {/* SEASON */}

                            <td>

                              <strong>
                                {
                                  game.season
                                }
                              </strong>

                            </td>


                            {/* WEEK */}

                            <td>
                              Week{" "}
                              {
                                game.week
                              }
                            </td>


                            {/* TYPE */}

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


                            {/* OWNER 1 TEAM */}

                            <td>

                              <strong>
                                {
                                  game.owner1Team
                                }
                              </strong>

                            </td>


                            {/* SCORE */}

                            <td>

                              {formatScore(
                                game.owner1Score
                              )}

                              {" – "}

                              {formatScore(
                                game.owner2Score
                              )}

                            </td>


                            {/* OWNER 2 TEAM */}

                            <td>

                              <strong>
                                {
                                  game.owner2Team
                                }
                              </strong>

                            </td>


                            {/* RESULT */}

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


      {/* =====================================================
          FOOTER
          ===================================================== */}

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
