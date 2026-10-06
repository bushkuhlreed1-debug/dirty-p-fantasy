import Link from "next/link";

import { supabase } from "../../../lib/supabase";
import { getLeagueData } from "../../../lib/leagueData";

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

function formatRecord(
  wins,
  losses,
  ties = 0
) {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
}

function normalizeTeamName(
  name
) {
  return String(
    name || ""
  )
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[’‘]/g, "'")
    .toLowerCase();
}

// =========================================================
// GAME TYPE
// =========================================================

function getGameType(
  matchup
) {
  const matchupType =
    String(
      matchup.matchup_type ||
        ""
    )
      .trim()
      .toLowerCase();

  const playoffTier =
    String(
      matchup.playoff_tier ||
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
    matchup.is_consolation ===
      true
  ) {
    return "Consolation";
  }

  // =======================================================
  // PLAYOFF
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
    matchup.is_championship ===
      true ||
    matchup.is_third_place ===
      true ||
    matchup.is_playoff ===
      true
  ) {
    return "Playoff";
  }

  return "Regular Season";
}

// =========================================================
// PAGE
// =========================================================

export default async function OwnerProfile({
  params,
}) {
  const { id } =
    await params;

  const ownerId =
    Number(id);

  // =========================================================
  // SHARED LEAGUE DATA
  //
  // 2014–2025 = Supabase
  // 2026       = ESPN
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
                  Owner Profile
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
    currentWeek,
    owners,
    currentTeams,
    seasonResults,
    matchups,
    completedCurrentMatchups,
  } =
    leagueData;

  // =========================================================
  // FIND OWNER
  // =========================================================

  const owner =
    owners.find(
      (item) =>
        Number(
          item.id
        ) ===
        ownerId
    );

  if (!owner) {
    return (
      <main className="page-shell">

        <h1>
          Owner Not Found
        </h1>

        <Link href="/owners">
          ← Back to Owners
        </Link>

      </main>
    );
  }

  // =========================================================
  // CURRENT ESPN TEAM
  // =========================================================

  const currentTeam =
    currentTeams.find(
      (team) =>
        Number(
          team.owner_id
        ) ===
        ownerId
    ) ||
    null;

  const isActive =
    Boolean(
      currentTeam
    );

  // =========================================================
  // HISTORICAL TEAM NAMES
  //
  // leagueData handles current ESPN team.
  // We still load old team names from Supabase.
  // =========================================================

  const [
    teamHistoryResult,
    franchiseResult,
  ] =
    await Promise.all([
      supabase
        .from("teams")
        .select(`
          season_year,
          owner_id,
          team_name
        `)
        .eq(
          "owner_id",
          ownerId
        )
        .lt(
          "season_year",
          currentSeason
        )
        .order(
          "season_year",
          {
            ascending:
              false,
          }
        ),

      supabase
        .from(
          "all_franchise_teams"
        )
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
        .eq(
          "owner_id",
          ownerId
        ),
    ]);

  const historicalTeams =
    teamHistoryResult.data ||
    [];

  const allFranchiseTeam =
    franchiseResult.data ||
    [];

  // =========================================================
  // ALL TEAM HISTORY
  //
  // Historical Supabase names +
  // live 2026 ESPN team name
  // =========================================================

  const teams = [
    ...historicalTeams,
  ];

  if (currentTeam) {
    teams.push({
      season_year:
        currentSeason,

      owner_id:
        ownerId,

      team_name:
        currentTeam.team_name,
    });
  }

  // =========================================================
  // OWNER NAME LOOKUP
  // =========================================================

  function getOwnerName(
    id
  ) {
    return (
      owners.find(
        (otherOwner) =>
          Number(
            otherOwner.id
          ) ===
          Number(id)
      )?.name ||
      "Unknown"
    );
  }

  // =========================================================
  // GET GAME DETAILS
  // =========================================================

  function getGameDetails(
    matchup
  ) {
    const homeOwnerId =
      Number(
        matchup.home_owner_id
      );

    const awayOwnerId =
      Number(
        matchup.away_owner_id
      );

    const ownerIsHome =
      homeOwnerId ===
      ownerId;

    const ownerIsAway =
      awayOwnerId ===
      ownerId;

    if (
      !ownerIsHome &&
      !ownerIsAway
    ) {
      return null;
    }

    const opponentId =
      ownerIsHome
        ? awayOwnerId
        : homeOwnerId;

    const ownerScore =
      num(
        ownerIsHome
          ? matchup.home_score
          : matchup.away_score
      );

    const opponentScore =
      num(
        ownerIsHome
          ? matchup.away_score
          : matchup.home_score
      );

    const officialWinner =
      String(
        matchup.winner ||
          ""
      ).toUpperCase();

    let result =
      "T";

    if (
      officialWinner ===
      "HOME"
    ) {
      result =
        ownerIsHome
          ? "W"
          : "L";
    } else if (
      officialWinner ===
      "AWAY"
    ) {
      result =
        ownerIsAway
          ? "W"
          : "L";
    } else if (
      officialWinner ===
      "TIE"
    ) {
      result =
        "T";
    } else if (
      ownerScore >
      opponentScore
    ) {
      result =
        "W";
    } else if (
      ownerScore <
      opponentScore
    ) {
      result =
        "L";
    }

    return {
      opponentId,

      opponentName:
        getOwnerName(
          opponentId
        ),

      ownerScore,

      opponentScore,

      result,

      margin:
        ownerScore -
        opponentScore,

      gameType:
        getGameType(
          matchup
        ),
    };
  }

  // =========================================================
  // COMPLETED GAMES
  //
  // This now includes completed 2026 ESPN matchups.
  // =========================================================

  const completedGames =
    matchups
      .filter(
        (matchup) => {
          const homeOwnerId =
            Number(
              matchup.home_owner_id
            );

          const awayOwnerId =
            Number(
              matchup.away_owner_id
            );

          if (
            homeOwnerId !==
              ownerId &&
            awayOwnerId !==
              ownerId
          ) {
            return false;
          }

          const homeScore =
            Number(
              matchup.home_score
            );

          const awayScore =
            Number(
              matchup.away_score
            );

          return (
            matchup.home_score !==
              null &&
            matchup.away_score !==
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
      )
      .map(
        (matchup) => {
          const details =
            getGameDetails(
              matchup
            );

          if (!details) {
            return null;
          }

          return {
            ...matchup,
            ...details,
          };
        }
      )
      .filter(Boolean)
      .sort(
        (a, b) => {
          if (
            Number(
              b.season_year
            ) !==
            Number(
              a.season_year
            )
          ) {
            return (
              Number(
                b.season_year
              ) -
              Number(
                a.season_year
              )
            );
          }

          return (
            Number(
              b.matchup_period
            ) -
            Number(
              a.matchup_period
            )
          );
        }
      );

  // =========================================================
  // OWNER SEASON RESULTS
  //
  // Includes 2026 ESPN standings.
  // =========================================================

  const results =
    seasonResults
      .filter(
        (result) =>
          Number(
            result.owner_id
          ) ===
          ownerId
      )
      .sort(
        (a, b) =>
          Number(
            b.season_year
          ) -
          Number(
            a.season_year
          )
      );

  // =========================================================
  // TEAM NAME HISTORY
  // =========================================================

  const teamNameMap =
    new Map();

  for (
    const team of
    teams
  ) {
    const normalizedName =
      normalizeTeamName(
        team.team_name
      );

    if (
      !normalizedName
    ) {
      continue;
    }

    if (
      !teamNameMap.has(
        normalizedName
      )
    ) {
      teamNameMap.set(
        normalizedName,
        {
          team_name:
            team.team_name,

          seasons:
            new Set(),
        }
      );
    }

    teamNameMap
      .get(
        normalizedName
      )
      .seasons.add(
        Number(
          team.season_year
        )
      );
  }

  const teamNameGroups =
    Array.from(
      teamNameMap.values()
    )
      .map(
        (team) => ({
          team_name:
            team.team_name,

          seasons:
            Array.from(
              team.seasons
            ),
        })
      )
      .sort(
        (a, b) =>
          Math.max(
            ...b.seasons
          ) -
          Math.max(
            ...a.seasons
          )
      );

  // =========================================================
  // SEASON HISTORY
  // =========================================================

  const seasonHistory =
    results.map(
      (season) => {
        const seasonYear =
          Number(
            season.season_year
          );

        const team =
          teams.find(
            (item) =>
              Number(
                item.season_year
              ) ===
              seasonYear
          );

        let postseason =
          seasonYear ===
          currentSeason
            ? "Current Season"
            : "Missed Playoffs";

        if (
          season.champion
        ) {
          postseason =
            "Champion";
        } else if (
          season
            .championship_appearance
        ) {
          postseason =
            "Runner-Up";
        } else if (
          season
            .playoff_appearance
        ) {
          postseason =
            "Playoffs";
        }

        return {
          ...season,

          teamName:
            team
              ?.team_name ||
            "—",

          postseason,
        };
      }
    );

  // =========================================================
  // ALL-FRANCHISE TEAM ORDER
  // =========================================================

  const franchiseSlotOrder = {
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

  const franchiseTeam = [
    ...allFranchiseTeam,
  ].sort(
    (a, b) =>
      (
        franchiseSlotOrder[
          a.franchise_slot
        ] || 99
      ) -
      (
        franchiseSlotOrder[
          b.franchise_slot
        ] || 99
      )
  );

  // =========================================================
  // HEAD TO HEAD
  // =========================================================

  const headToHeadMap =
    {};

  for (
    const game of
    completedGames
  ) {
    if (
      !game.opponentId
    ) {
      continue;
    }

    if (
      !headToHeadMap[
        game.opponentId
      ]
    ) {
      headToHeadMap[
        game.opponentId
      ] = {
        opponentId:
          game.opponentId,

        opponentName:
          game.opponentName,

        wins: 0,

        losses: 0,

        ties: 0,

        games: 0,
      };
    }

    const record =
      headToHeadMap[
        game.opponentId
      ];

    record.games +=
      1;

    if (
      game.result ===
      "W"
    ) {
      record.wins +=
        1;
    }

    if (
      game.result ===
      "L"
    ) {
      record.losses +=
        1;
    }

    if (
      game.result ===
      "T"
    ) {
      record.ties +=
        1;
    }
  }

  const headToHead =
    Object.values(
      headToHeadMap
    ).sort(
      (a, b) =>
        a.opponentName.localeCompare(
          b.opponentName
        )
    );

  // =========================================================
  // CAREER HIGHS & LOWS
  // =========================================================

  const gamesWithScores =
    completedGames.filter(
      (game) =>
        Number.isFinite(
          game.ownerScore
        ) &&
        Number.isFinite(
          game.opponentScore
        )
    );

  const wins =
    gamesWithScores.filter(
      (game) =>
        game.result ===
        "W"
    );

  const losses =
    gamesWithScores.filter(
      (game) =>
        game.result ===
        "L"
    );

  const highestScore =
    gamesWithScores.length >
    0
      ? [
          ...gamesWithScores,
        ].sort(
          (a, b) =>
            b.ownerScore -
            a.ownerScore
        )[0]
      : null;

  const lowestScore =
    gamesWithScores.length >
    0
      ? [
          ...gamesWithScores,
        ].sort(
          (a, b) =>
            a.ownerScore -
            b.ownerScore
        )[0]
      : null;

  const biggestWin =
    wins.length > 0
      ? [...wins].sort(
          (a, b) =>
            b.margin -
            a.margin
        )[0]
      : null;

  const biggestLoss =
    losses.length > 0
      ? [...losses].sort(
          (a, b) =>
            a.margin -
            b.margin
        )[0]
      : null;

  const closestWin =
    wins.length > 0
      ? [...wins].sort(
          (a, b) =>
            a.margin -
            b.margin
        )[0]
      : null;

  const closestLoss =
    losses.length > 0
      ? [...losses].sort(
          (a, b) =>
            b.margin -
            a.margin
        )[0]
      : null;

  // =========================================================
  // BEST REGULAR SEASON
  //
  // Includes the live current-season record.
  // =========================================================

  const bestSeason =
    results.length > 0
      ? [...results].sort(
          (a, b) => {
            const aGames =
              num(
                a.wins
              ) +
              num(
                a.losses
              ) +
              num(
                a.ties
              );

            const bGames =
              num(
                b.wins
              ) +
              num(
                b.losses
              ) +
              num(
                b.ties
              );

            const aPct =
              aGames > 0
                ? (
                    num(
                      a.wins
                    ) +
                    num(
                      a.ties
                    ) *
                      0.5
                  ) /
                  aGames
                : 0;

            const bPct =
              bGames > 0
                ? (
                    num(
                      b.wins
                    ) +
                    num(
                      b.ties
                    ) *
                      0.5
                  ) /
                  bGames
                : 0;

            if (
              bPct !==
              aPct
            ) {
              return (
                bPct -
                aPct
              );
            }

            if (
              num(
                b.wins
              ) !==
              num(
                a.wins
              )
            ) {
              return (
                num(
                  b.wins
                ) -
                num(
                  a.wins
                )
              );
            }

            return (
              num(
                b.points_for
              ) -
              num(
                a.points_for
              )
            );
          }
        )[0]
      : null;

  // =========================================================
  // LONGEST WIN STREAK
  // =========================================================

  const chronologicalGames = [
    ...completedGames,
  ].sort(
    (a, b) => {
      if (
        Number(
          a.season_year
        ) !==
        Number(
          b.season_year
        )
      ) {
        return (
          Number(
            a.season_year
          ) -
          Number(
            b.season_year
          )
        );
      }

      return (
        Number(
          a.matchup_period
        ) -
        Number(
          b.matchup_period
        )
      );
    }
  );

  let longestWinStreak =
    0;

  let currentWinStreak =
    0;

  for (
    const game of
    chronologicalGames
  ) {
    if (
      game.result ===
      "W"
    ) {
      currentWinStreak +=
        1;

      longestWinStreak =
        Math.max(
          longestWinStreak,
          currentWinStreak
        );
    } else {
      currentWinStreak =
        0;
    }
  }

  // =========================================================
  // CAREER TOTALS
  // =========================================================

  const regularWins =
    results.reduce(
      (
        total,
        season
      ) =>
        total +
        num(
          season.wins
        ),
      0
    );

  const regularLosses =
    results.reduce(
      (
        total,
        season
      ) =>
        total +
        num(
          season.losses
        ),
      0
    );

  const regularTies =
    results.reduce(
      (
        total,
        season
      ) =>
        total +
        num(
          season.ties
        ),
      0
    );

  const careerPoints =
    results.reduce(
      (
        total,
        season
      ) =>
        total +
        num(
          season.points_for
        ),
      0
    );

  const regularGames =
    regularWins +
    regularLosses +
    regularTies;

  const regularWinPct =
    regularGames > 0
      ? (
          (
            regularWins +
            regularTies *
              0.5
          ) /
          regularGames
        ) *
        100
      : 0;

  // =========================================================
  // CURRENT-SEASON WEEK LABEL
  // =========================================================

  const currentCompletedWeeks =
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
    currentCompletedWeeks.length >
    0
      ? Math.max(
          ...currentCompletedWeeks
        )
      : 0;

  // =========================================================
  // GAME DISPLAY
  // =========================================================

  function GameDescription({
    game,
  }) {
    if (!game) {
      return (
        <span>
          —
        </span>
      );
    }

    return (
      <>

        <strong>
          {game.ownerScore.toFixed(
            2
          )}
        </strong>

        <span>
          vs {game.opponentName}
        </span>

        <small>
          {game.season_year} · Week{" "}
          {game.matchup_period}
        </small>

      </>
    );
  }

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


      {/* OWNER HERO */}

      <section className="owner-profile-hero">

        <div>

          <p className="eyebrow">
            OWNER PROFILE
          </p>

          <h1>
            {owner.name}
          </h1>

          <p>

            {isActive
              ? currentTeam
                  ?.team_name ||
                "Active Owner"
              : "Former Dirty P Owner"}

          </p>

        </div>

      </section>


      {/* NAV */}

      <div className="page-nav">

        <Link href="/owners">
          ← All Owners
        </Link>

        <span>

          {latestCompletedWeek >
          0
            ? `Through ${currentSeason} Week ${latestCompletedWeek}`
            : `${currentSeason} Season`}

        </span>

      </div>


      {/* =====================================================
          CAREER SUMMARY
          ===================================================== */}

      <section className="owner-profile-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              CAREER
            </p>

            <h2>
              Career Snapshot
            </h2>

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
                  {regularWinPct.toFixed(
                    1
                  )}
                  %
                </strong>

                <span>
                  WIN %
                </span>

              </div>


              <div>

                <strong>
                  {careerPoints.toFixed(
                    2
                  )}
                </strong>

                <span>
                  CAREER POINTS
                </span>

              </div>

            </div>

          </article>


          <article className="owner-card">

            <div className="owner-card-top">

              <div>

                <span className="owner-status">
                  LEAGUE HISTORY
                </span>

                <h3>
                  {results.length}
                </h3>

                <p className="owner-team-name">
                  Seasons Played
                </p>

              </div>

            </div>


            <div className="owner-record">

              <div>

                <strong>
                  {
                    results.filter(
                      (season) =>
                        Boolean(
                          season.playoff_appearance
                        )
                    ).length
                  }
                </strong>

                <span>
                  PLAYOFFS
                </span>

              </div>


              <div>

                <strong>
                  {
                    results.filter(
                      (season) =>
                        Boolean(
                          season.champion
                        )
                    ).length
                  }
                </strong>

                <span>
                  TITLES
                </span>

              </div>

            </div>

          </article>

        </div>

      </section>


      {/* =====================================================
          SEASON HISTORY
          ===================================================== */}

      <section className="owner-profile-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              YEAR BY YEAR
            </p>

            <h2>
              Season History
            </h2>

          </div>

          <span>
            {seasonHistory.length} Seasons
          </span>

        </div>


        <div className="profile-table-wrap">

          <table className="profile-table">

            <thead>

              <tr>

                <th>
                  Season
                </th>

                <th>
                  Team
                </th>

                <th>
                  Record
                </th>

                <th>
                  PF
                </th>

                <th>
                  PA
                </th>

                <th>
                  Reg. Finish
                </th>

                <th>
                  Final Finish
                </th>

                <th>
                  Postseason
                </th>

              </tr>

            </thead>


            <tbody>

              {seasonHistory.map(
                (season) => (

                  <tr
                    key={
                      season.season_year
                    }
                  >

                    <td>

                      <strong>
                        {season.season_year}
                      </strong>

                    </td>


                    <td>
                      {season.teamName}
                    </td>


                    <td>

                      {formatRecord(
                        num(
                          season.wins
                        ),
                        num(
                          season.losses
                        ),
                        num(
                          season.ties
                        )
                      )}

                    </td>


                    <td>

                      {num(
                        season.points_for
                      ).toFixed(
                        2
                      )}

                    </td>


                    <td>

                      {num(
                        season.points_against
                      ).toFixed(
                        2
                      )}

                    </td>


                    <td>

                      {season
                        .regular_season_finish ||
                        "—"}

                    </td>


                    <td>

                      {season
                        .final_finish ||
                        "—"}

                    </td>


                    <td>

                      <span
                        className={
                          season.champion
                            ? "profile-champion-label"
                            : ""
                        }
                      >

                        {
                          season.postseason
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


      {/* =====================================================
          ALL-FRANCHISE TEAM
          ===================================================== */}

      <section className="owner-profile-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              FRANCHISE GREATS
            </p>

            <h2>
              All-Franchise Team
            </h2>

          </div>

          <span>
            Best Single-Season Players
          </span>

        </div>


        {franchiseTeam.length >
        0 ? (

          <div className="all-franchise-grid">

            {franchiseTeam.map(
              (player) => (

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

                    <span>
                      {player.position}
                    </span>

                    <span>
                      {player.season_year}
                    </span>

                  </div>


                  <div className="all-franchise-team-name">

                    {player.dirty_p_team_name ||
                      "—"}

                  </div>


                  <div className="all-franchise-points">

                    {num(
                      player.fantasy_points
                    ).toFixed(
                      2
                    )}{" "}

                    <small>
                      PTS
                    </small>

                  </div>

                </div>

              )
            )}

          </div>

        ) : (

          <div className="current-panel">

            <div className="empty-current-state">

              <strong>
                No All-Franchise Team data yet.
              </strong>

              <p>
                Player history has not been loaded for this owner.
              </p>

            </div>

          </div>

        )}

      </section>


      {/* =====================================================
          HEAD TO HEAD
          ===================================================== */}

      <section className="owner-profile-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              RIVALRIES
            </p>

            <h2>
              Head-to-Head
            </h2>

          </div>

          <span>
            Includes completed {currentSeason} games
          </span>

        </div>


        <div className="h2h-grid">

          {headToHead.map(
            (record) => (

              <div
                className="h2h-card"
                key={
                  record.opponentId
                }
              >

                <span>
                  vs.
                </span>

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

            )
          )}

        </div>

      </section>


      {/* =====================================================
          CAREER HIGHS & LOWS
          ===================================================== */}

      <section className="owner-profile-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              CAREER RECORD BOOK
            </p>

            <h2>
              Highs & Lows
            </h2>

          </div>

          <span>
            Live Career Records
          </span>

        </div>


        <div className="career-record-grid">

          <div className="career-record-card">

            <span>
              HIGHEST SCORE
            </span>

            <GameDescription
              game={
                highestScore
              }
            />

          </div>


          <div className="career-record-card">

            <span>
              LOWEST SCORE
            </span>

            <GameDescription
              game={
                lowestScore
              }
            />

          </div>


          <div className="career-record-card">

            <span>
              BIGGEST WIN
            </span>

            <GameDescription
              game={
                biggestWin
              }
            />

          </div>


          <div className="career-record-card">

            <span>
              BIGGEST LOSS
            </span>

            <GameDescription
              game={
                biggestLoss
              }
            />

          </div>


          <div className="career-record-card">

            <span>
              CLOSEST WIN
            </span>

            <GameDescription
              game={
                closestWin
              }
            />

          </div>


          <div className="career-record-card">

            <span>
              CLOSEST LOSS
            </span>

            <GameDescription
              game={
                closestLoss
              }
            />

          </div>


          <div className="career-record-card">

            <span>
              BEST REGULAR SEASON
            </span>


            {bestSeason ? (

              <>

                <strong>

                  {formatRecord(
                    num(
                      bestSeason.wins
                    ),
                    num(
                      bestSeason.losses
                    ),
                    num(
                      bestSeason.ties
                    )
                  )}

                </strong>

                <span>
                  {
                    bestSeason.season_year
                  }
                </span>

              </>

            ) : (

              <strong>
                —
              </strong>

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


      {/* =====================================================
          TEAM NAME HISTORY
          ===================================================== */}

      <section className="owner-profile-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              THE FRANCHISE
            </p>

            <h2>
              Team Name History
            </h2>

          </div>

        </div>


        <div className="team-history-list">

          {teamNameGroups.map(
            (team) => (

              <div
                className="team-history-row"
                key={
                  normalizeTeamName(
                    team.team_name
                  )
                }
              >

                <strong>
                  {team.team_name}
                </strong>


                <span>

                  {team.seasons
                    .sort(
                      (a, b) =>
                        a - b
                    )
                    .join(
                      ", "
                    )}

                </span>

              </div>

            )
          )}

        </div>

      </section>


      {/* =====================================================
          COMPLETE MATCHUP HISTORY
          ===================================================== */}

      <section className="owner-profile-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              EVERY GAME
            </p>

            <h2>
              Matchup History
            </h2>

          </div>

          <span>
            {completedGames.length} Games
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
                  Opponent
                </th>

                <th>
                  Result
                </th>

                <th>
                  Score
                </th>

              </tr>

            </thead>


            <tbody>

              {completedGames.map(
                (game) => (

                  <tr
                    key={
                      game.id
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
                          game.result ===
                          "W"
                            ? "game-win"
                            : game.result ===
                              "L"
                              ? "game-loss"
                              : ""
                        }
                      >

                        {game.result}

                      </strong>

                    </td>


                    <td>

                      {game.ownerScore.toFixed(
                        2
                      )}

                      {" – "}

                      {game.opponentScore.toFixed(
                        2
                      )}

                    </td>

                  </tr>

                )
              )}

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
