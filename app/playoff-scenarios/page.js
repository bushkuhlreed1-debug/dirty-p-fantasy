import Link from "next/link";

import {
  getLeagueData,
} from "../../lib/leagueData";

import {
  getEspnPlayoffSettings,
} from "../../lib/espnPlayoffSettings";

import {
  simulatePlayoffScenarios,
  getTiebreakLabel,
} from "../../lib/playoffScenarioEngine";

import AutoRefresh from "../components/AutoRefresh";

export const dynamic =
  "force-dynamic";

// =========================================================
// BASIC HELPERS
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
  if (
    num(ties) > 0
  ) {
    return `${num(
      wins
    )}-${num(
      losses
    )}-${num(
      ties
    )}`;
  }

  return `${num(
    wins
  )}-${num(
    losses
  )}`;
}

function formatPoints(
  value
) {
  return num(
    value
  ).toFixed(2);
}

function percent(
  value,
  total
) {
  if (
    !total
  ) {
    return "—";
  }

  return (
    (
      value /
      total
    ) *
    100
  ).toFixed(1) + "%";
}

function normalizeName(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    );
}

function gameKey(
  game
) {
  return [
    Number(
      game.matchup_period
    ),
    Number(
      game.away_owner_id
    ),
    Number(
      game.home_owner_id
    ),
  ].join("-");
}

// =========================================================
// CURRENT ESPN ORDER
// =========================================================

function currentSeedSort(
  teams
) {
  return [
    ...teams,
  ].sort(
    (a, b) => {
      const seedA =
        a.currentSeed >
        0
          ? a.currentSeed
          : 999;

      const seedB =
        b.currentSeed >
        0
          ? b.currentSeed
          : 999;

      if (
        seedA !==
        seedB
      ) {
        return (
          seedA -
          seedB
        );
      }

      const recordA =
        a.wins * 2 +
        a.ties;

      const recordB =
        b.wins * 2 +
        b.ties;

      if (
        recordA !==
        recordB
      ) {
        return (
          recordB -
          recordA
        );
      }

      return (
        b.pointsFor -
        a.pointsFor
      );
    }
  );
}

// =========================================================
// PF REQUIREMENT TEXT
// =========================================================

function pfRequirementText(
  team,
  competitor
) {
  const gap =
    competitor.pointsFor -
    team.pointsFor;

  if (
    gap >
    0.0001
  ) {
    return (
      `Must outscore ${competitor.ownerName} by more than ` +
      `${formatPoints(gap)} points over the remaining season to finish ahead on PF.`
    );
  }

  if (
    gap <
    -0.0001
  ) {
    return (
      `Currently leads ${competitor.ownerName} by ` +
      `${formatPoints(
        Math.abs(gap)
      )} PF. Protect that advantage if the tiebreak reaches Points For.`
    );
  }

  return (
    `Currently tied with ${competitor.ownerName} in PF. ` +
    `Must finish the regular season with more Points For to win that tiebreak.`
  );
}

// =========================================================
// PATTERN RESULT LABEL
// =========================================================

function resultPatternText(
  pattern
) {
  if (
    !pattern.results.length
  ) {
    return "Regular season complete";
  }

  return pattern.results
    .map(
      (game) =>
        `W${game.week} ${game.result} vs ${game.opponentName}`
    )
    .join(" · ");
}

// =========================================================
// PAGE
// =========================================================

export default async function PlayoffScenariosPage() {
  let leagueData;
  let espnSettings;

  try {
    leagueData =
      await getLeagueData();

    espnSettings =
      await getEspnPlayoffSettings(
        leagueData
          .currentSeason
      );

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

        <section className="owners-hero">

          <div>

            <p className="eyebrow">
              ESPN DATA ERROR
            </p>

            <h1>
              Playoff Scenarios
            </h1>

            <p>
              {error?.message ||
                "Unable to load ESPN league settings."}
            </p>

          </div>

        </section>

      </main>
    );
  }

  const {
    currentSeason,
    currentWeek,
    owners,
    currentTeams,
    currentSeasonResults,
    currentSeasonMatchups,
    completedCurrentMatchups,
  } =
    leagueData;

  const {
    playoffTeamCount,
    regularSeasonWeeks,
    playoffSeedingRule,
    matchupTieRule,
    divisions:
      espnDivisions,
    divisionNameById,
    teams:
      espnTeams,
  } =
    espnSettings;

  // =======================================================
  // LOOKUPS
  // =======================================================

  const ownerMap =
    new Map(
      (
        owners || []
      ).map(
        (owner) => [
          Number(
            owner.id
          ),
          owner.name,
        ]
      )
    );

  const resultMap =
    new Map(
      (
        currentSeasonResults ||
        []
      ).map(
        (result) => [
          Number(
            result.owner_id
          ),
          result,
        ]
      )
    );

  const espnById =
    new Map(
      espnTeams.map(
        (team) => [
          team.id,
          team,
        ]
      )
    );

  const espnByName =
    new Map(
      espnTeams.map(
        (team) => [
          normalizeName(
            team.name
          ),
          team,
        ]
      )
    );

  // =======================================================
  // BUILD CURRENT TEAM DATA
  // =======================================================

  const teams =
    (
      currentTeams || []
    )
      .map(
        (team) => {
          const ownerId =
            Number(
              team.owner_id ??
                team.ownerId ??
                0
            );

          const result =
            resultMap.get(
              ownerId
            );

          const teamName =
            team.team_name ||
            team.teamName ||
            "Unknown Team";

          const possibleEspnId =
            Number(
              team.espnTeamId ??
                team.espn_team_id ??
                0
            );

          let espnTeam =
            espnById.get(
              possibleEspnId
            );

          if (
            !espnTeam
          ) {
            espnTeam =
              espnByName.get(
                normalizeName(
                  teamName
                )
              );
          }

          const divisionId =
            Number(
              espnTeam
                ?.divisionId ??
                team.divisionId ??
                team.division_id ??
                0
            );

          return {
            ownerId,

            ownerName:
              ownerMap.get(
                ownerId
              ) ||
              team.ownerName ||
              "Unknown Owner",

            teamName,

            espnTeamId:
              espnTeam
                ?.id ||
              possibleEspnId,

            divisionId,

            divisionName:
              divisionNameById[
                divisionId
              ] ||
              `Division ${divisionId + 1}`,

            currentSeed:
              num(
                espnTeam
                  ?.playoffSeed ??
                  team.playoffSeed ??
                  team.playoff_seed ??
                  team.seed
              ),

            wins:
              num(
                espnTeam
                  ?.wins ??
                  team.wins ??
                  result?.wins
              ),

            losses:
              num(
                espnTeam
                  ?.losses ??
                  team.losses ??
                  result
                    ?.losses
              ),

            ties:
              num(
                espnTeam
                  ?.ties ??
                  team.ties ??
                  result?.ties
              ),

            pointsFor:
              num(
                espnTeam
                  ?.pointsFor ??
                  team.pointsFor ??
                  team.points_for ??
                  result
                    ?.points_for
              ),

            pointsAgainst:
              num(
                espnTeam
                  ?.pointsAgainst ??
                  team.pointsAgainst ??
                  team.points_against ??
                  result
                    ?.points_against
              ),
          };
        }
      )
      .filter(
        (team) =>
          team.ownerId >
          0
      );

  // =======================================================
  // REGULAR-SEASON SCHEDULE
  // =======================================================

  const regularGames =
    (
      currentSeasonMatchups ||
      []
    )
      .filter(
        (game) =>
          Number(
            game
              .matchup_period
          ) <=
            regularSeasonWeeks &&
          game.is_playoff !==
            true &&
          game.is_consolation !==
            true
      );

  const completedGames =
    (
      completedCurrentMatchups ||
      []
    )
      .filter(
        (game) =>
          Number(
            game
              .matchup_period
          ) <=
            regularSeasonWeeks &&
          game.is_playoff !==
            true &&
          game.is_consolation !==
            true
      );

  const completedKeys =
    new Set(
      completedGames.map(
        gameKey
      )
    );

  const remainingGames =
    regularGames
      .filter(
        (game) =>
          !completedKeys.has(
            gameKey(
              game
            )
          )
      )
      .filter(
        (game) =>
          Number(
            game
              .away_owner_id
          ) > 0 &&
          Number(
            game
              .home_owner_id
          ) > 0
      )
      .sort(
        (a, b) =>
          Number(
            a.matchup_period
          ) -
          Number(
            b.matchup_period
          )
      );

  const remainingWeeks =
    [
      ...new Set(
        remainingGames.map(
          (game) =>
            Number(
              game
                .matchup_period
            )
        )
      ),
    ].sort(
      (a, b) =>
        a - b
    );

  // =======================================================
  // DIVISION STANDINGS
  // =======================================================

  const divisionMap =
    new Map();

  for (
    const team of
    teams
  ) {
    if (
      !divisionMap.has(
        team.divisionId
      )
    ) {
      divisionMap.set(
        team.divisionId,
        []
      );
    }

    divisionMap
      .get(
        team.divisionId
      )
      .push(team);
  }

  for (
    const [
      divisionId,
      divisionTeams,
    ] of
    divisionMap.entries()
  ) {
    divisionMap.set(
      divisionId,
      currentSeedSort(
        divisionTeams
      )
    );
  }

  const divisions =
    [
      ...divisionMap.entries(),
    ].sort(
      (a, b) =>
        Number(
          a[0]
        ) -
        Number(
          b[0]
        )
    );

  const divisionLeaders =
    divisions
      .map(
        (
          [
            ,
            divisionTeams,
          ]
        ) =>
          divisionTeams[0]
      )
      .filter(
        Boolean
      );

  const divisionLeaderIds =
    new Set(
      divisionLeaders.map(
        (team) =>
          team.ownerId
      )
    );

  // =======================================================
  // WILD CARD
  // =======================================================

  const wildCardSpots =
    Math.max(
      0,

      playoffTeamCount -
        divisions.length
    );

  const wildCardRace =
    currentSeedSort(
      teams.filter(
        (team) =>
          !divisionLeaderIds.has(
            team.ownerId
          )
      )
    );

  // =======================================================
  // NEXT GAME
  // =======================================================

  const nextGameByOwner =
    new Map();

  for (
    const game of
    remainingGames
  ) {
    const awayId =
      Number(
        game
          .away_owner_id
      );

    const homeId =
      Number(
        game
          .home_owner_id
      );

    const week =
      Number(
        game
          .matchup_period
      );

    if (
      !nextGameByOwner.has(
        awayId
      )
    ) {
      nextGameByOwner.set(
        awayId,
        {
          week,

          opponent:
            ownerMap.get(
              homeId
            ) ||
            "Unknown",
        }
      );
    }

    if (
      !nextGameByOwner.has(
        homeId
      )
    ) {
      nextGameByOwner.set(
        homeId,
        {
          week,

          opponent:
            ownerMap.get(
              awayId
            ) ||
            "Unknown",
        }
      );
    }
  }

  // =======================================================
  // SCENARIO ENGINE
  //
  // At four weeks left:
  // 20 games = 1,048,576 combinations.
  //
  // Then it automatically shrinks:
  // 15 games = 32,768
  // 10 games = 1,024
  // 5 games = 32
  // =======================================================

  const exactScenarioWindow =
    remainingWeeks.length <=
      4 &&
    remainingGames.length <=
      20;

  const weeklyTiesAllowed =
    String(
      matchupTieRule || ""
    ).toUpperCase() ===
      "NONE";

  const scenarioEngine =
    exactScenarioWindow &&
    !weeklyTiesAllowed
      ? simulatePlayoffScenarios({
          teams,

          completedGames,

          remainingGames,

          playoffTeamCount,

          playoffSeedingRule,
        })
      : null;

  const tiebreakLabel =
    getTiebreakLabel(
      playoffSeedingRule
    );

  // Scenario calculations do not need
  // to hammer Vercel every 30 seconds.
  // Five minutes is plenty and still
  // updates as weekly games become final.
  const refreshMs =
    300000;

  // =======================================================
  // STATUS
  // =======================================================

  function teamStatus(
    team
  ) {
    const stats =
      scenarioEngine
        ?.teamStats
        ?.get(
          team.ownerId
        );

    if (
      stats?.clinched
    ) {
      return (
        "PLAYOFF CLINCHED"
      );
    }

    if (
      stats?.eliminated
    ) {
      return "ELIMINATED";
    }

    if (
      divisionLeaderIds.has(
        team.ownerId
      )
    ) {
      return (
        "DIVISION LEADER"
      );
    }

    if (
      team.currentSeed >
        0 &&
      team.currentSeed <=
        playoffTeamCount
    ) {
      return "WILD CARD";
    }

    return "IN THE HUNT";
  }

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <main className="page-shell">

      <AutoRefresh
        enabled={true}
        intervalMs={
          refreshMs
        }
      />

      {/* SMALL PAGE-ONLY STYLING */}

      <style>{`
        .scenario-details {
          border-top: 1px solid #222830;
        }

        .scenario-details summary {
          cursor: pointer;
          list-style: none;
          padding: 17px 20px;
          color: #d6a84b;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .scenario-details summary::-webkit-details-marker {
          display: none;
        }

        .scenario-details summary::after {
          content: " +";
        }

        .scenario-details[open] summary::after {
          content: " −";
        }

        .scenario-details[open] summary {
          border-bottom: 1px solid #222830;
        }

        .scenario-path-list {
          display: grid;
          gap: 12px;
          padding: 16px;
        }

        .scenario-path {
          background: #0f1317;
          border: 1px solid #222830;
          border-radius: 12px;
          padding: 16px;
        }

        .scenario-path-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 10px;
        }

        .scenario-path-head h4 {
          margin: 0 0 5px;
          color: #fff;
          font-size: 0.92rem;
        }

        .scenario-path-head p {
          margin: 0;
          color: #727b86;
          font-size: 0.72rem;
          line-height: 1.5;
        }

        .scenario-path-status {
          flex: 0 0 auto;
          color: #d6a84b;
          font-size: 0.62rem;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .scenario-counts {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          padding: 10px 0;
          color: #8f98a3;
          font-size: 0.7rem;
        }

        .scenario-counts strong {
          color: #fff;
        }

        .scenario-subsection {
          margin-top: 13px;
          padding-top: 13px;
          border-top: 1px solid #1d232a;
        }

        .scenario-subsection > strong {
          display: block;
          margin-bottom: 7px;
          color: #d6a84b;
          font-size: 0.62rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .scenario-subsection p {
          margin: 5px 0 0;
          color: #a2aab4;
          font-size: 0.73rem;
          line-height: 1.5;
        }

        .scenario-clean-message {
          padding: 16px 20px;
          color: #8f98a3;
          font-size: 0.75rem;
          border-top: 1px solid #222830;
        }

        @media (max-width: 700px) {
          .scenario-path-head {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>

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
            {currentSeason} POSTSEASON RACE
          </p>

          <h1>
            Playoff Scenarios
          </h1>

          <p>
            Every path to the playoffs,
            recalculated automatically from ESPN
            standings, schedule and league rules.
          </p>

        </div>

        <div className="owners-count">

          <strong>
            {playoffTeamCount}
          </strong>

          <span>
            PLAYOFF TEAMS
          </span>

        </div>

      </section>

      {/* NAV */}

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          ESPN TB:{" "}
          {tiebreakLabel}
        </span>

      </nav>

      {/* =====================================================
          DIVISION RACES
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              AUTOMATIC BERTHS
            </p>

            <h2>
              Division Races
            </h2>

          </div>

          <span>
            Winners earn the top seeds
          </span>

        </div>

        <div className="division-grid">

          {divisions.map(
            ([
              divisionId,
              divisionTeams,
            ]) => (

              <div
                className="division-card"
                key={
                  divisionId
                }
              >

                <div className="division-title">

                  <h3>
                    {divisionNameById[
                      divisionId
                    ] ||
                      `Division ${Number(
                        divisionId
                      ) + 1}`}
                  </h3>

                </div>

                <div className="division-header">

                  <span>
                    RK
                  </span>

                  <span>
                    TEAM
                  </span>

                  <span>
                    W-L
                  </span>

                  <span>
                    SEED
                  </span>

                </div>

                {divisionTeams.map(
                  (
                    team,
                    index
                  ) => (

                    <div
                      className={`division-row ${
                        index === 0
                          ? "playoff-position"
                          : ""
                      }`}
                      key={
                        team.ownerId
                      }
                    >

                      <span className="standings-rank">
                        {index + 1}
                      </span>

                      <div className="standings-team">

                        <div className="team-name-line">

                          <strong>
                            {team.teamName}
                          </strong>

                          {index ===
                            0 && (
                            <span className="playoff-badge">
                              LEADER
                            </span>
                          )}

                        </div>

                        <span>
                          {team.ownerName}
                        </span>

                      </div>

                      <strong className="standings-record">

                        {formatRecord(
                          team.wins,
                          team.losses,
                          team.ties
                        )}

                      </strong>

                      <strong className="standings-pf">

                        #{team.currentSeed ||
                          "—"}

                      </strong>

                    </div>
                  )
                )}

              </div>

            )
          )}

        </div>

      </section>

      {/* =====================================================
          WILD CARD
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              SEEDS #
              {divisions.length + 1}
              –#
              {playoffTeamCount}
            </p>

            <h2>
              Wild Card Race
            </h2>

          </div>

          <span>
            Division leaders removed
          </span>

        </div>

        <div className="profile-table-wrap">

          <table className="profile-table">

            <thead>

              <tr>

                <th>
                  WC
                </th>

                <th>
                  OWNER
                </th>

                <th>
                  TEAM
                </th>

                <th>
                  RECORD
                </th>

                <th>
                  PF
                </th>

                <th>
                  STATUS
                </th>

              </tr>

            </thead>

            <tbody>

              {wildCardRace.map(
                (
                  team,
                  index
                ) => (

                  <tr
                    key={
                      team.ownerId
                    }
                  >

                    <td>
                      <strong>
                        #{index + 1}
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {team.ownerName}
                      </strong>
                    </td>

                    <td>
                      {team.teamName}
                    </td>

                    <td>
                      <strong>

                        {formatRecord(
                          team.wins,
                          team.losses,
                          team.ties
                        )}

                      </strong>
                    </td>

                    <td>
                      {formatPoints(
                        team.pointsFor
                      )}
                    </td>

                    <td>

                      {index <
                      wildCardSpots ? (

                        <span className="playoff-badge">
                          IN
                        </span>

                      ) : (

                        <span>
                          OUT
                        </span>

                      )}

                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

        </div>

      </section>

      {/* =====================================================
          OWNER PLAYOFF PATHS
          ===================================================== */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              EVERY OWNER
            </p>

            <h2>
              Playoff Paths
            </h2>

          </div>

          <span>

            {scenarioEngine
              ? `${scenarioEngine.totalScenarios.toLocaleString()} league-wide outcomes analyzed`
              : `Exact paths activate with four weeks remaining`}

          </span>

        </div>

        <div className="owners-grid">

          {currentSeedSort(
            teams
          ).map(
            (team) => {

              const stats =
                scenarioEngine
                  ?.teamStats
                  ?.get(
                    team.ownerId
                  );

              const status =
                teamStatus(
                  team
                );

              const nextGame =
                nextGameByOwner.get(
                  team.ownerId
                );

              const gamesLeft =
                remainingGames.filter(
                  (game) =>
                    Number(
                      game
                        .away_owner_id
                    ) ===
                      team.ownerId ||
                    Number(
                      game
                        .home_owner_id
                    ) ===
                      team.ownerId
                ).length;

              const alive =
                stats
                  ? stats
                      .guaranteedIn +
                    stats
                      .tiebreakDependent
                  : 0;

              const possibleSeeds =
                stats
                  ?.possibleSeeds
                  ?.length
                  ? stats
                      .possibleSeeds
                      .map(
                        (seed) =>
                          `#${seed}`
                      )
                      .join("/")
                  : "—";

              return (
                <article
                  className="owner-card"
                  key={
                    team.ownerId
                  }
                >

                  {/* TOP */}

                  <div className="owner-card-top">

                    <div>

                      <span className="owner-status">
                        {status}
                      </span>

                      <h3>
                        {team.ownerName}
                      </h3>

                      <p className="owner-team-name">

                        {team.teamName}

                        {" · "}

                        {team.divisionName}

                      </p>

                    </div>

                    <div className="owner-title-count">

                      <strong>

                        {team.currentSeed
                          ? `#${team.currentSeed}`
                          : "—"}

                      </strong>

                      <span>
                        ESPN SEED
                      </span>

                    </div>

                  </div>

                  {/* MAIN INFO */}

                  <div className="owner-record">

                    <div>

                      <strong>

                        {formatRecord(
                          team.wins,
                          team.losses,
                          team.ties
                        )}

                      </strong>

                      <span>
                        RECORD
                      </span>

                    </div>

                    <div>

                      <strong>
                        {gamesLeft}
                      </strong>

                      <span>
                        GAMES LEFT
                      </span>

                    </div>

                  </div>

                  {/* COMPACT STATS */}

                  <div className="owner-stats-grid">

                    <div>

                      <strong>

                        {stats
                          ? percent(
                              alive,
                              scenarioEngine.totalScenarios
                            )
                          : "—"}

                      </strong>

                      <span>
                        PATHS ALIVE
                      </span>

                    </div>

                    <div>

                      <strong>
                        {possibleSeeds}
                      </strong>

                      <span>
                        POSSIBLE SEEDS
                      </span>

                    </div>

                    <div>

                      <strong>

                        {nextGame
                          ? `W${nextGame.week}`
                          : "—"}

                      </strong>

                      <span>
                        NEXT GAME
                      </span>

                    </div>

                    <div>

                      <strong>

                        {stats
                          ? percent(
                              stats.tiebreakDependent,
                              scenarioEngine.totalScenarios
                            )
                          : "—"}

                      </strong>

                      <span>
                        TB PATHS
                      </span>

                    </div>

                  </div>

                  {/* CURRENT MESSAGE */}

                  <div className="owner-card-bottom">

                    <span>

                      {nextGame
                        ? `vs. ${nextGame.opponent}`
                        : "Regular season complete"}

                    </span>

                    <strong>

                      {stats?.clinched
                        ? "PLAYOFF BERTH SECURED"
                        : stats?.eliminated
                          ? "NO PLAYOFF PATH REMAINS"
                          : scenarioEngine
                            ? `${alive.toLocaleString()} PATHS ALIVE`
                            : "SCENARIOS COMING"}

                    </strong>

                  </div>

                  {/* =========================================
                      EVERY SCENARIO FOR THIS OWNER
                      ========================================= */}

                  {scenarioEngine &&
                    stats && (
                    <details className="scenario-details">

                      <summary>

                        View All Scenarios
                        {" · "}
                        {stats.patterns.length}
                        {" "}
                        personal W/L paths

                      </summary>

                      <div className="scenario-path-list">

                        {stats.patterns.map(
                          (
                            pattern
                          ) => {

                            const aliveCount =
                              pattern.alive;

                            const pfRows =
                              pattern
                                .pfCompetitors;

                            return (
                              <div
                                className="scenario-path"
                                key={
                                  pattern.code
                                }
                              >

                                {/* HEADER */}

                                <div className="scenario-path-head">

                                  <div>

                                    <h4>

                                      {pattern.ownWins}
                                      -
                                      {pattern.ownLosses}
                                      {" "}
                                      Finish
                                      {" · "}
                                      Final Record{" "}
                                      {formatRecord(
                                        pattern
                                          .finalRecord
                                          .wins,

                                        pattern
                                          .finalRecord
                                          .losses,

                                        pattern
                                          .finalRecord
                                          .ties
                                      )}

                                    </h4>

                                    <p>
                                      {resultPatternText(
                                        pattern
                                      )}
                                    </p>

                                  </div>

                                  <span className="scenario-path-status">

                                    {pattern.status}

                                  </span>

                                </div>

                                {/* COUNTS */}

                                <div className="scenario-counts">

                                  <span>

                                    <strong>
                                      {pattern
                                        .guaranteedIn
                                        .toLocaleString()}
                                    </strong>
                                    {" "}
                                    guaranteed in

                                  </span>

                                  <span>

                                    <strong>
                                      {pattern
                                        .tiebreakDependent
                                        .toLocaleString()}
                                    </strong>
                                    {" "}
                                    tiebreak

                                  </span>

                                  <span>

                                    <strong>
                                      {pattern
                                        .guaranteedOut
                                        .toLocaleString()}
                                    </strong>
                                    {" "}
                                    out

                                  </span>

                                  <span>

                                    of{" "}

                                    <strong>
                                      {pattern
                                        .total
                                        .toLocaleString()}
                                    </strong>
                                    {" "}
                                    other-result combinations

                                  </span>

                                </div>

                                {/* POSSIBLE SEEDS */}

                                {pattern
                                  .possibleSeeds
                                  .length >
                                  0 && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Possible Seeds
                                    </strong>

                                    <p>

                                      {pattern
                                        .possibleSeeds
                                        .map(
                                          (
                                            seed
                                          ) =>
                                            `#${seed}`
                                        )
                                        .join(
                                          " · "
                                        )}

                                    </p>

                                  </div>
                                )}

                                {/* ELIMINATED */}

                                {aliveCount ===
                                  0 && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Result
                                    </strong>

                                    <p>
                                      No combination of other league results produces a playoff berth with this personal W/L path.
                                    </p>

                                  </div>
                                )}

                                {/* GUARANTEED */}

                                {pattern
                                  .guaranteedIn ===
                                  pattern
                                    .total && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Result
                                    </strong>

                                    <p>
                                      This path guarantees a playoff berth regardless of every other remaining matchup.
                                    </p>

                                  </div>
                                )}

                                {/* EXACT REQUIRED GAME RESULTS */}

                                {pattern
                                  .mustResults
                                  .length >
                                  0 && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Results Required In Every Surviving Path
                                    </strong>

                                    {pattern
                                      .mustResults
                                      .map(
                                        (
                                          result,
                                          index
                                        ) => (
                                          <p
                                            key={`${result.week}-${result.winnerOwnerId}-${result.loserOwnerId}-${index}`}
                                          >

                                            Week{" "}
                                            {result.week}
                                            :{" "}

                                            {result.winnerName}
                                            {" must beat "}
                                            {result.loserName}

                                          </p>
                                        )
                                      )}

                                  </div>
                                )}

                                {/* RECORD HELP */}

                                {pattern
                                  .teamCaps
                                  .length >
                                  0 && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Other Teams That Must Be Held Back
                                    </strong>

                                    {pattern
                                      .teamCaps
                                      .map(
                                        (
                                          cap
                                        ) => (
                                          <p
                                            key={
                                              cap.ownerId
                                            }
                                          >

                                            {cap.ownerName}
                                            {" must lose at least "}
                                            {cap.minimumLosses}
                                            {" of "}
                                            {cap.gamesLeft}
                                            {" remaining games in every surviving path."}

                                          </p>
                                        )
                                      )}

                                  </div>
                                )}

                                {/* PF TIEBREAK */}

                                {pfRows.length >
                                  0 && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Points For Tiebreaks
                                    </strong>

                                    {pfRows.map(
                                      (
                                        competitor
                                      ) => (

                                        <p
                                          key={
                                            competitor.ownerId
                                          }
                                        >

                                          {pfRequirementText(
                                            team,
                                            competitor
                                          )}

                                        </p>

                                      )
                                    )}

                                  </div>
                                )}

                                {/* OTHER TIEBREAKS */}

                                {pattern
                                  .tiebreakReasons
                                  .includes(
                                    "PA"
                                  ) && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Points Against
                                    </strong>

                                    <p>
                                      At least one surviving path can remain tied through the earlier ESPN tiebreakers and reach Points Against.
                                    </p>

                                  </div>
                                )}

                                {pattern
                                  .tiebreakReasons
                                  .includes(
                                    "COIN"
                                  ) && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Final Tiebreak
                                    </strong>

                                    <p>
                                      At least one mathematically possible path remains tied through every statistical ESPN tiebreaker and would require ESPN&apos;s virtual coin flip.
                                    </p>

                                  </div>
                                )}

                                {/* NO UNIVERSAL HELP RESULT */}

                                {aliveCount >
                                  0 &&
                                  pattern
                                    .mustResults
                                    .length ===
                                    0 &&
                                  pattern
                                    .teamCaps
                                    .length ===
                                    0 &&
                                  pattern
                                    .guaranteedIn !==
                                    pattern
                                      .total && (
                                  <div className="scenario-subsection">

                                    <strong>
                                      Help
                                    </strong>

                                    <p>
                                      There is no single other-team result required in every surviving path. Multiple combinations of league results can produce the berth.
                                    </p>

                                  </div>
                                )}

                              </div>
                            );
                          }
                        )}

                      </div>

                    </details>
                  )}

                  {!scenarioEngine && (
                    <div className="scenario-clean-message">

                      {weeklyTiesAllowed
                        ? "ESPN currently allows weekly ties, so the exhaustive W/L engine is paused because each remaining matchup can have three outcomes."
                        : `Exact owner-by-owner scenarios automatically activate when four regular-season weeks remain. There are currently ${remainingWeeks.length} weeks left.`}

                    </div>
                  )}

                </article>
              );
            }
          )}

        </div>

      </section>

      {/* FOOTER */}

      <footer className="site-footer">

        <strong>
          Dirty P Fantasy Football
        </strong>

        <span>
          ESPN Tiebreak:{" "}
          {tiebreakLabel}
        </span>

        <p>
          Every remaining W/L combination is evaluated once the
          four-week scenario window opens. Future Points For is
          never guessed; paths that reach PF remain correctly
          marked as tiebreak-dependent until those points are
          actually scored.
        </p>

      </footer>

    </main>
  );
}
