import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

// =========================================================
// HELPERS
// =========================================================

function num(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatScore(value) {
  return num(value).toFixed(2);
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

function invertRecord(record) {
  return {
    wins:
      record.owner2Wins,

    losses:
      record.owner1Wins,

    ties:
      record.ties,
  };
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
    )
  ) {
    return "consolation";
  }

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
    game.is_championship ===
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
  ownerId
) {
  const homeId =
    Number(
      game.home_owner_id
    );

  const awayId =
    Number(
      game.away_owner_id
    );

  const homeScore =
    num(
      game.home_score
    );

  const awayScore =
    num(
      game.away_score
    );

  if (
    ownerId !== homeId &&
    ownerId !== awayId
  ) {
    return null;
  }

  const ownerScore =
    ownerId === homeId
      ? homeScore
      : awayScore;

  const opponentScore =
    ownerId === homeId
      ? awayScore
      : homeScore;

  if (
    ownerScore >
    opponentScore
  ) {
    return "W";
  }

  if (
    ownerScore <
    opponentScore
  ) {
    return "L";
  }

  return "T";
}

// =========================================================
// SERIES RECORD
// =========================================================

function buildRecord(
  games,
  owner1Id
) {
  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  games.forEach(
    (game) => {
      const result =
        getResult(
          game,
          owner1Id
        );

      if (
        result === "W"
      ) {
        owner1Wins += 1;
      }

      if (
        result === "L"
      ) {
        owner2Wins += 1;
      }

      if (
        result === "T"
      ) {
        ties += 1;
      }
    }
  );

  return {
    owner1Wins,
    owner2Wins,
    ties,
  };
}

// =========================================================
// GAME VIEW
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
    owner1Id;

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
      owner1Id
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

    season:
      Number(
        game.season_year
      ),

    week:
      Number(
        game.matchup_period
      ),

    margin:
      Math.abs(
        owner1Score -
          owner2Score
      ),
  };
}

// =========================================================
// STREAKS
// =========================================================

function getCurrentStreak(
  games
) {
  if (!games.length) {
    return null;
  }

  const newestFirst =
    [...games].sort(
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

  const result =
    latest.owner1Result;

  let count = 0;

  for (
    const game of
    newestFirst
  ) {
    if (
      game.owner1Result ===
      result
    ) {
      count += 1;
    } else {
      break;
    }
  }

  return {
    owner:
      result === "W"
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

  const chronological =
    [...games].sort(
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

  chronological.forEach(
    (game) => {
      if (
        game.owner1Result ===
        "T"
      ) {
        currentOwner =
          null;

        currentCount =
          0;

        return;
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
  );

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

// =========================================================
// RIVALRY WEEK PAIRS
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
  owner1,
  owner2
) {
  return OFFICIAL_RIVALRIES.some(
    ([a, b]) =>
      (
        a === owner1 &&
        b === owner2
      ) ||
      (
        a === owner2 &&
        b === owner1
      )
  );
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

  const [
    {
      data: owners,
      error:
        ownersError,
    },

    {
      data: matchupData,
      error:
        matchupsError,
    },
  ] =
    await Promise.all([
      supabase
        .from("owners")
        .select(`
          id,
          name,
          current_team_name,
          active
        `)
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
          CURRENT_SEASON
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
  // ERROR
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
          {ownersError?.message ||
            matchupsError?.message}
        </p>

      </main>
    );
  }

  const ownerList =
    owners || [];

  const ownerMap =
    new Map(
      ownerList.map(
        (owner) => [
          Number(
            owner.id
          ),
          owner,
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
  // COMPLETED GAMES
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
  // SEASON RANGE
  // =========================================================

  const seasonYears =
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
    seasonYears[0] ||
    2014;

  const lastSeason =
    seasonYears[
      seasonYears.length -
        1
    ] || 2025;

  // =========================================================
  // VALIDATION
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

  let comparison =
    null;

  // =========================================================
  // BUILD COMPARISON
  // =========================================================

  if (
    validSelection
  ) {
    const owner1 =
      ownerMap.get(
        selectedOwner1
      );

    const owner2 =
      ownerMap.get(
        selectedOwner2
      );

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

    const overall =
      buildRecord(
        rawGames,
        selectedOwner1
      );

    const regular =
      buildRecord(
        regularRaw,
        selectedOwner1
      );

    const playoffs =
      buildRecord(
        playoffRaw,
        selectedOwner1
      );

    const consolation =
      buildRecord(
        consolationRaw,
        selectedOwner1
      );

    const meetings =
      games.length;

    const owner1Points =
      games.reduce(
        (
          total,
          game
        ) =>
          total +
          game.owner1Score,
        0
      );

    const owner2Points =
      games.reduce(
        (
          total,
          game
        ) =>
          total +
          game.owner2Score,
        0
      );

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
      games[0] ||
      null;

    const championshipGames =
      games.filter(
        (game) =>
          game.is_championship ===
          true
      );

    const currentStreak =
      getCurrentStreak(
        games
      );

    const longestStreak =
      getLongestStreak(
        games
      );

    const officialRivalry =
      isOfficialRivalry(
        owner1.name,
        owner2.name
      );

    comparison = {
      owner1,
      owner2,

      games,
      meetings,

      overall,
      regular,
      playoffs,
      consolation,

      regularMeetings:
        regularRaw.length,

      playoffMeetings:
        playoffRaw.length,

      consolationMeetings:
        consolationRaw.length,

      owner1Points,
      owner2Points,

      owner1Average,
      owner2Average,

      biggestWin,
      closestGame,
      latestGame,

      championshipGames,

      currentStreak,
      longestStreak,

      officialRivalry,
    };
  }

  // =========================================================
  // DISPLAY VALUES
  // =========================================================

  const owner2Overall =
    comparison
      ? invertRecord(
          comparison.overall
        )
      : null;

  const owner2Regular =
    comparison
      ? invertRecord(
          comparison.regular
        )
      : null;

  const owner2Playoffs =
    comparison
      ? invertRecord(
          comparison.playoffs
        )
      : null;

  const owner2Consolation =
    comparison
      ? invertRecord(
          comparison.consolation
        )
      : null;

  const currentStreakOwner =
    comparison
      ?.currentStreak
      ?.owner ===
    "owner1"
      ? comparison
          .owner1
          .name

      : comparison
            ?.currentStreak
            ?.owner ===
          "owner2"

        ? comparison
            .owner2
            .name

        : "No active streak";

  const longestStreakOwner =
    comparison
      ?.longestStreak
      ?.owner ===
    "owner1"
      ? comparison
          .owner1
          .name

      : comparison
            ?.longestStreak
            ?.owner ===
          "owner2"

        ? comparison
            .owner2
            .name

        : "—";

  const biggestWinOwner =
    comparison
      ?.biggestWin
      ? comparison
            .biggestWin
            .owner1Result ===
          "W"

        ? comparison
            .owner1
            .name

        : comparison
            .owner2
            .name

      : "—";

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
            history against each other.
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
          NAV
          ===================================================== */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          {firstSeason}–
          {lastSeason}
        </span>

      </nav>


      {/* =====================================================
          OWNER SELECTOR
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
            Every completed matchup
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
          MATCHUP
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
                  {comparison.owner1.name}
                  {" vs "}
                  {comparison.owner2.name}
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


            {/* =================================================
                OWNER CARDS
                ================================================= */}

            <div className="owners-grid">

              {/* OWNER 1 */}

              <article className="owner-card">

                <div className="owner-card-top">

                  <div>

                    <span className="owner-status">
                      OWNER 1
                    </span>

                    <h3>
                      {comparison.owner1.name}
                    </h3>

                    <p className="owner-team-name">
                      {comparison.owner1.current_team_name ||
                        "Dirty P Owner"}
                    </p>

                  </div>


                  <div className="owner-title-count">

                    <strong>
                      {comparison.overall.owner1Wins}
                    </strong>

                    <span>
                      WINS
                    </span>

                  </div>

                </div>


                <div className="owner-record">

                  <div>

                    <strong>
                      {recordText(
                        comparison.overall.owner1Wins,
                        comparison.overall.owner2Wins,
                        comparison.overall.ties
                      )}
                    </strong>

                    <span>
                      ALL-TIME RECORD
                    </span>

                  </div>


                  <div>

                    <strong>
                      {formatScore(
                        comparison.owner1Average
                      )}
                    </strong>

                    <span>
                      AVG SCORE
                    </span>

                  </div>

                </div>


                <div className="owner-stats-grid">

                  <div>

                    <strong>
                      {comparison.regular.owner1Wins}
                    </strong>

                    <span>
                      Reg. Wins
                    </span>

                  </div>


                  <div>

                    <strong>
                      {comparison.playoffs.owner1Wins}
                    </strong>

                    <span>
                      Playoff Wins
                    </span>

                  </div>


                  <div>

                    <strong>
                      {comparison.consolation.owner1Wins}
                    </strong>

                    <span>
                      Consolation
                    </span>

                  </div>


                  <div>

                    <strong>
                      {formatScore(
                        comparison.owner1Points
                      )}
                    </strong>

                    <span>
                      Points
                    </span>

                  </div>

                </div>


                <div className="owner-card-bottom">

                  <span>
                    {comparison.meetings} career meetings
                  </span>

                  <Link
                    href={`/owners/${comparison.owner1.id}`}
                  >
                    <strong>
                      View Owner →
                    </strong>
                  </Link>

                </div>

              </article>


              {/* OWNER 2 */}

              <article className="owner-card">

                <div className="owner-card-top">

                  <div>

                    <span className="owner-status">
                      OWNER 2
                    </span>

                    <h3>
                      {comparison.owner2.name}
                    </h3>

                    <p className="owner-team-name">
                      {comparison.owner2.current_team_name ||
                        "Dirty P Owner"}
                    </p>

                  </div>


                  <div className="owner-title-count">

                    <strong>
                      {comparison.overall.owner2Wins}
                    </strong>

                    <span>
                      WINS
                    </span>

                  </div>

                </div>


                <div className="owner-record">

                  <div>

                    <strong>
                      {recordText(
                        owner2Overall.wins,
                        owner2Overall.losses,
                        owner2Overall.ties
                      )}
                    </strong>

                    <span>
                      ALL-TIME RECORD
                    </span>

                  </div>


                  <div>

                    <strong>
                      {formatScore(
                        comparison.owner2Average
                      )}
                    </strong>

                    <span>
                      AVG SCORE
                    </span>

                  </div>

                </div>


                <div className="owner-stats-grid">

                  <div>

                    <strong>
                      {owner2Regular.wins}
                    </strong>

                    <span>
                      Reg. Wins
                    </span>

                  </div>


                  <div>

                    <strong>
                      {owner2Playoffs.wins}
                    </strong>

                    <span>
                      Playoff Wins
                    </span>

                  </div>


                  <div>

                    <strong>
                      {owner2Consolation.wins}
                    </strong>

                    <span>
                      Consolation
                    </span>

                  </div>


                  <div>

                    <strong>
                      {formatScore(
                        comparison.owner2Points
                      )}
                    </strong>

                    <span>
                      Points
                    </span>

                  </div>

                </div>


                <div className="owner-card-bottom">

                  <span>
                    {comparison.meetings} career meetings
                  </span>

                  <Link
                    href={`/owners/${comparison.owner2.id}`}
                  >
                    <strong>
                      View Owner →
                    </strong>
                  </Link>

                </div>

              </article>

            </div>

          </section>


          {/* =================================================
              SERIES SUMMARY
              ================================================= */}

          {comparison.meetings >
            0 && (

            <section className="owners-section">

              <div className="section-heading">

                <div>

                  <p className="eyebrow">
                    SERIES BREAKDOWN
                  </p>

                  <h2>
                    Series Summary
                  </h2>

                </div>

                <span>
                  All-Time
                </span>

              </div>


              <article className="owner-card">

                {/* TOP */}

                <div className="owner-card-top">

                  <div>

                    <span className="owner-status">
                      ALL-TIME SERIES
                    </span>

                    <h3>
                      {comparison.owner1.name}
                      {" vs "}
                      {comparison.owner2.name}
                    </h3>

                    <p className="owner-team-name">

                      {comparison.officialRivalry
                        ? "Official Rivalry Week pairing"
                        : `${comparison.meetings} completed meetings`}

                    </p>

                  </div>


                  <div className="owner-title-count">

                    <strong>
                      {comparison.meetings}
                    </strong>

                    <span>
                      GAMES
                    </span>

                  </div>

                </div>


                {/* SERIES RECORD */}

                <div className="owner-record">

                  <div>

                    <strong>
                      {recordText(
                        comparison.overall.owner1Wins,
                        comparison.overall.owner2Wins,
                        comparison.overall.ties
                      )}
                    </strong>

                    <span>
                      SERIES RECORD
                    </span>

                  </div>


                  <div>

                    <strong>
                      {comparison.championshipGames.length}
                    </strong>

                    <span>
                      TITLE-GAME MEETINGS
                    </span>

                  </div>

                </div>


                {/* SERIES STATS */}

                <div className="owner-stats-grid">

                  <div>

                    <strong>
                      {comparison.biggestWin
                        ? formatScore(
                            comparison.biggestWin.margin
                          )
                        : "—"}
                    </strong>

                    <span>
                      Biggest Margin
                    </span>

                  </div>


                  <div>

                    <strong>
                      {comparison.closestGame
                        ? formatScore(
                            comparison.closestGame.margin
                          )
                        : "—"}
                    </strong>

                    <span>
                      Closest Game
                    </span>

                  </div>


                  <div>

                    <strong>
                      {comparison.currentStreak?.count ||
                        0}
                    </strong>

                    <span>
                      Current Streak
                    </span>

                  </div>


                  <div>

                    <strong>
                      {comparison.longestStreak?.count ||
                        0}
                    </strong>

                    <span>
                      Longest Streak
                    </span>

                  </div>

                </div>


                {/* DETAILS */}

                <div className="owner-record">

                  <div>

                    <strong>
                      {biggestWinOwner}
                    </strong>

                    <span>
                      BIGGEST WIN OWNER
                    </span>

                  </div>


                  <div>

                    <strong>
                      {currentStreakOwner}
                    </strong>

                    <span>
                      CURRENT SERIES STREAK
                    </span>

                  </div>

                </div>


                <div className="owner-card-bottom">

                  <span>
                    Longest streak: {longestStreakOwner}
                  </span>

                  <strong>
                    {comparison.regularMeetings} Regular ·{" "}
                    {comparison.playoffMeetings} Playoff ·{" "}
                    {comparison.consolationMeetings} Consolation
                  </strong>

                </div>

              </article>

            </section>

          )}


          {/* =================================================
              GAME HISTORY
              ================================================= */}

          {comparison.meetings >
            0 && (

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
                        {comparison.owner1.name}
                      </th>

                      <th>
                        Score
                      </th>

                      <th>
                        {comparison.owner2.name}
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

          )}

        </>

      )}


      {/* =====================================================
          NO MATCHUPS
          ===================================================== */}

      {comparison &&
        comparison.meetings ===
          0 && (

        <section className="owners-section">

          <article className="owner-card">

            <div className="owner-card-top">

              <div>

                <span className="owner-status">
                  NO HISTORY
                </span>

                <h3>
                  No completed matchups
                </h3>

                <p className="owner-team-name">
                  These two owners have not played
                  a completed Dirty P game.
                </p>

              </div>

            </div>

          </article>

        </section>

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
