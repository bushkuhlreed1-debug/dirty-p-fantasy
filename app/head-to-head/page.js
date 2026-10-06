import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

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

function getResult(
  game,
  side
) {
  const winner =
    String(
      game.winner || ""
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

function buildRecord(
  games,
  owner1Id
) {
  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  for (
    const game of
    games
  ) {
    const owner1IsHome =
      Number(
        game.home_owner_id
      ) ===
      owner1Id;

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
  owner1Name,
  owner2Name
) {
  return OFFICIAL_RIVALRIES.some(
    ([a, b]) =>
      (
        a === owner1Name &&
        b === owner2Name
      ) ||
      (
        a === owner2Name &&
        b === owner1Name
      )
  );
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
      currentCount += 1;
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
      error: ownersError,
    },
    {
      data: matchupData,
      error: matchupError,
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

  if (
    ownersError ||
    matchupError
  ) {
    return (
      <main className="page-shell">

        <h1>
          Head-to-Head
        </h1>

        <p>
          Database error:{" "}
          {ownersError?.message ||
            matchupError?.message}
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
          Number(owner.id),
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

  const latestSeason =
    seasonYears[
      seasonYears.length -
        1
    ] || 2025;

  // =========================================================
