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
  if (num(ties) > 0) {
    return `${num(wins)}-${num(losses)}-${num(ties)}`;
  }

  return `${num(wins)}-${num(losses)}`;
}

function formatPoints(value) {
  return num(value).toFixed(2);
}

function percent(
  value,
  total
) {
  if (!total) {
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
    .replace(/\s+/g, " ");
}

function gameKey(game) {
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
        `W${game.week}: ${game.result} vs ${game.opponentName}`
    )
    .join(" · ");
}

function pfRequirementText(
  team,
  competitor
) {
  const gap =
    competitor.pointsFor -
    team.pointsFor;

  if (gap > 0.0001) {
    return (
      `Must outscore ${competitor.ownerName} by more than ` +
      `${formatPoints(gap)} points from now through the end of the regular season.`
    );
  }

  if (gap < -0.0001) {
    return (
      `Currently leads ${competitor.ownerName} by ` +
      `${formatPoints(Math.abs(gap))} PF. ` +
      `Must preserve that advantage.`
    );
  }

  return (
    `Currently tied with ${competitor.ownerName} in PF. ` +
    `Must finish with more Points For.`
  );
}

// =========================================================
// GROUP PLAYOFF PATHS BY OWNER FINAL RECORD
// =========================================================

function buildRecordGroups(patterns) {
  const groups =
    new Map();

  for (
    const pattern of
    patterns || []
  ) {
    const key =
      `${pattern.ownWins}-${pattern.ownLosses}`;

    if (!groups.has(key)) {
      groups.set(
        key,
        {
          ownWins:
            pattern.ownWins,

          ownLosses:
            pattern.ownLosses,

          total: 0,
          alive: 0,

          guaranteedIn: 0,
          guaranteedOut: 0,

          seeds:
            new Set(),
        }
      );
    }

    const group =
      groups.get(key);

    group.total +=
      pattern.total;

    group.alive +=
      pattern.alive;

    group.guaranteedIn +=
      pattern.guaranteedIn;

    group.guaranteedOut +=
      pattern.guaranteedOut;

    for (
      const seed of
      pattern.possibleSeeds
    ) {
      group.seeds.add(seed);
    }
  }

  return [
    ...groups.values(),
  ]
    .map(
      (group) => {
        let status =
          "NEEDS HELP";

        if (
          group.guaranteedIn ===
          group.total
        ) {
          status =
            "CLINCHES";
        } else if (
          group.guaranteedOut ===
          group.total
        ) {
          status =
            "ELIMINATED";
        } else if (
          group.alive ===
          group.total
        ) {
          status =
            "ALIVE";
        }

        return {
          ...group,

          status,

          seeds: [
            ...group.seeds,
          ].sort(
            (a, b) =>
              a - b
          ),
        };
      }
    )
    .sort(
      (a, b) =>
        b.ownWins -
        a.ownWins
    );
}

// =========================================================
// SEED PATHS FOR A CLINCHED OWNER
// =========================================================

function getSeedPaths(
  stats,
  seed
) {
  const paths = [];

  for (
    const pattern of
    stats?.patterns || []
  ) {
    const seedScenario =
      pattern.seedScenarios?.find(
        (item) =>
          item.seed === seed
      );

    if (!seedScenario) {
      continue;
    }

    paths.push({
      ...seedScenario,

      code:
        pattern.code,

      ownWins:
        pattern.ownWins,

      ownLosses:
        pattern.ownLosses,

      results:
        pattern.results,

      finalRecord:
        pattern.finalRecord,

      patternTotal:
        pattern.total,
    });
  }

  return paths;
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
        leagueData.currentSeason
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
                "Unable to load ESPN league data."}
            </p>

          </div>
        </section>

      </main>
    );
  }

  const {
    currentSeason,
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
      (owners || []).map(
        (owner) => [
          Number(owner.id),
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
  // TEAM DATA
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

          if (!espnTeam) {
            espnTeam =
              espnByName.get(
                normalizeName(
                  teamName
                )
              );
          }

          const divisionId =
            Number(
              espnTeam?.divisionId ??
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

            divisionId,

            divisionName:
              divisionNameById[
                divisionId
              ] ||
              `Division ${
                divisionId + 1
              }`,

            currentSeed:
              num(
                espnTeam?.playoffSeed ??
                  team.playoffSeed ??
                  team.playoff_seed ??
                  team.seed
              ),

            wins:
              num(
                espnTeam?.wins ??
                  team.wins ??
                  result?.wins
              ),

            losses:
              num(
                espnTeam?.losses ??
                  team.losses ??
                  result?.losses
              ),

            ties:
              num(
                espnTeam?.ties ??
                  team.ties ??
                  result?.ties
              ),

            pointsFor:
              num(
                espnTeam?.pointsFor ??
                  team.pointsFor ??
                  team.points_for ??
                  result?.points_for
              ),

            pointsAgainst:
              num(
                espnTeam?.pointsAgainst ??
                  team.pointsAgainst ??
                  team.points_against ??
                  result?.points_against
              ),
          };
        }
      )
      .filter(
        (team) =>
          team.ownerId > 0
      );

  // =======================================================
  // SCHEDULE
  // =======================================================

  const regularGames =
    (
      currentSeasonMatchups ||
      []
    ).filter(
      (game) =>
        Number(
          game.matchup_period
        ) <=
          regularSeasonWeeks &&
        game.is_playoff !== true &&
        game.is_consolation !== true
    );

  const completedGames =
    (
      completedCurrentMatchups ||
      []
    ).filter(
      (game) =>
        Number(
          game.matchup_period
        ) <=
          regularSeasonWeeks &&
        game.is_playoff !== true &&
        game.is_consolation !== true
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
            gameKey(game)
          )
      )
      .filter(
        (game) =>
          Number(
            game.away_owner_id
          ) > 0 &&
          Number(
            game.home_owner_id
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
              game.matchup_period
            )
        )
      ),
    ].sort(
      (a, b) =>
        a - b
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
        game.away_owner_id
      );

    const homeId =
      Number(
        game.home_owner_id
      );

    const week =
      Number(
        game.matchup_period
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
  // =======================================================

  const exactScenarioWindow =
    remainingWeeks.length <= 4 &&
    remainingGames.length <= 20;

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

  // =======================================================
  // DISPLAY ORDER
  //
  // Alphabetical, so it doesn't feel like standings.
  // =======================================================

  const displayTeams =
    [...teams].sort(
      (a, b) =>
        a.ownerName.localeCompare(
          b.ownerName
        )
    );

  function getStatus(
    stats
  ) {
    if (
      stats?.clinchedSeed
    ) {
      return `#${stats.clinchedSeed} SEED CLINCHED`;
    }

    if (
      stats?.clinched
    ) {
      return "PLAYOFF CLINCHED · SEED TBD";
    }

    if (
      stats?.eliminated
    ) {
      return "ELIMINATED";
    }

    return "PLAYOFF RACE";
  }

  return (
    <main className="page-shell">

      <AutoRefresh
        enabled={true}
        intervalMs={300000}
      />

      <style>{`
        .scenario-board {
          display: grid;
          gap: 22px;
        }

        .scenario-owner {
          overflow: hidden;
          background: #12161b;
          border: 1px solid #222830;
          border-radius: 16px;
        }

        .scenario-owner-head {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 24px;
        }

        .scenario-owner-head h3 {
          margin: 6px 0 4px;
          color: #fff;
          font-size: 1.3rem;
        }

        .scenario-owner-head p {
          margin: 0;
          color: #727b86;
          font-size: 0.76rem;
        }

        .scenario-owner-status {
          color: #d6a84b;
          font-size: 0.64rem;
          font-weight: 900;
          letter-spacing: .08em;
        }

        .scenario-current {
          text-align: right;
        }

        .scenario-current strong {
          display: block;
          color: #fff;
          font-size: 1.1rem;
        }

        .scenario-current span {
          display: block;
          margin-top: 4px;
          color: #727b86;
          font-size: .61rem;
          letter-spacing: .07em;
        }

        .scenario-next {
          padding: 14px 24px;
          background: #0f1317;
          border-top: 1px solid #222830;
          border-bottom: 1px solid #222830;
          color: #8f98a3;
          font-size: .74rem;
        }

        .scenario-next strong {
          color: #fff;
        }

        .scenario-record-paths,
        .scenario-seed-paths {
          display: grid;
        }

        .scenario-record-row,
        .scenario-seed-row {
          display: grid;
          grid-template-columns: 90px minmax(0,1fr) auto;
          gap: 18px;
          align-items: center;
          min-height: 70px;
          padding: 0 24px;
          border-bottom: 1px solid #20262d;
        }

        .scenario-record-row:last-child,
        .scenario-seed-row:last-child {
          border-bottom: none;
        }

        .scenario-record-row > strong,
        .scenario-seed-number {
          color: #fff;
          font-size: 1rem;
        }

        .scenario-seed-number {
          font-size: 1.25rem;
          font-weight: 900;
          color: #d6a84b;
        }

        .scenario-row-main strong {
          display: block;
          color: #d6a84b;
          font-size: .75rem;
        }

        .scenario-row-main span {
          display: block;
          margin-top: 4px;
          color: #727b86;
          font-size: .7rem;
          line-height: 1.45;
        }

        .scenario-row-right {
          text-align: right;
          color: #8f98a3;
          font-size: .68rem;
        }

        .scenario-details {
          border-top: 1px solid #2a3038;
        }

        .scenario-details summary {
          cursor: pointer;
          list-style: none;
          padding: 18px 24px;
          color: #d6a84b;
          font-size: .69rem;
          font-weight: 900;
          letter-spacing: .08em;
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

        .scenario-detail-list {
          display: grid;
          gap: 12px;
          padding: 0 18px 18px;
        }

        .scenario-detail {
          padding: 16px;
          background: #0d1115;
          border: 1px solid #20262d;
          border-radius: 12px;
        }

        .scenario-detail h4 {
          margin: 0 0 6px;
          color: #fff;
          font-size: .88rem;
        }

        .scenario-detail-pattern {
          margin: 0;
          color: #727b86;
          font-size: .7rem;
          line-height: 1.5;
        }

        .scenario-help {
          margin-top: 13px;
          padding-top: 12px;
          border-top: 1px solid #20262d;
        }

        .scenario-help > strong {
          display: block;
          margin-bottom: 6px;
          color: #d6a84b;
          font-size: .6rem;
          letter-spacing: .07em;
          text-transform: uppercase;
        }

        .scenario-help p {
          margin: 5px 0 0;
          color: #a1a9b3;
          font-size: .72rem;
          line-height: 1.5;
        }

        .scenario-section-label {
          padding: 16px 24px 8px;
          color: #727b86;
          font-size: .61rem;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .scenario-complete {
          padding: 22px 24px;
          color: #a1a9b3;
          line-height: 1.55;
          font-size: .77rem;
        }

        @media (max-width:700px) {
          .scenario-owner-head {
            flex-direction: column;
          }

          .scenario-current {
            text-align: left;
          }

          .scenario-record-row,
          .scenario-seed-row {
            grid-template-columns: 70px minmax(0,1fr);
          }

          .scenario-row-right {
            grid-column: 2;
            text-align: left;
          }
        }
      `}</style>

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
            {currentSeason} POSTSEASON RACE
          </p>

          <h1>
            Playoff Scenarios
          </h1>

          <p>
            Every owner&apos;s path to a playoff berth —
            and once they clinch, every remaining path
            to each possible playoff seed.
          </p>

        </div>

        <div className="owners-count">

          <strong>
            {remainingWeeks.length}
          </strong>

          <span>
            WEEKS LEFT
          </span>

        </div>

      </section>

      <nav className="page-nav">

        <Link href="/">
          ← Home
        </Link>

        <span>
          ESPN Tiebreak: {tiebreakLabel}
        </span>

      </nav>

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              EVERY OWNER
            </p>

            <h2>
              What Needs To Happen
            </h2>

          </div>

          <span>

            {scenarioEngine
              ? `${scenarioEngine.totalScenarios.toLocaleString()} outcomes analyzed`
              : "Full scenarios activate with 4 weeks left"}

          </span>

        </div>

        <div className="scenario-board">

          {displayTeams.map(
            (team) => {

              const stats =
                scenarioEngine
                  ?.teamStats
                  ?.get(
                    team.ownerId
                  );

              const status =
                getStatus(stats);

              const nextGame =
                nextGameByOwner.get(
                  team.ownerId
                );

              const recordGroups =
                buildRecordGroups(
                  stats?.patterns ||
                  []
                );

              const availableSeeds =
                stats
                  ?.seedSummary
                  ?.filter(
                    (item) =>
                      item.possible > 0
                  ) || [];

              return (
                <article
                  className="scenario-owner"
                  key={team.ownerId}
                >

                  <div className="scenario-owner-head">

                    <div>

                      <span className="scenario-owner-status">
                        {status}
                      </span>

                      <h3>
                        {team.ownerName}
                      </h3>

                      <p>
                        {team.teamName}
                      </p>

                    </div>

                    <div className="scenario-current">

                      <strong>

                        {formatRecord(
                          team.wins,
                          team.losses,
                          team.ties
                        )}

                      </strong>

                      <span>
                        CURRENT RECORD
                      </span>

                    </div>

                  </div>

                  <div className="scenario-next">

                    {stats?.clinchedSeed ? (

                      <strong>
                        Seed #{stats.clinchedSeed} is locked.
                      </strong>

                    ) : stats?.clinched ? (

                      <>
                        <strong>
                          Playoff berth secured.
                        </strong>
                        {" "}
                        Seeding is still in play.
                      </>

                    ) : stats?.eliminated ? (

                      <strong>
                        Eliminated from playoff contention.
                      </strong>

                    ) : nextGame ? (

                      <>
                        NEXT:{" "}
                        <strong>
                          Week {nextGame.week} vs. {nextGame.opponent}
                        </strong>
                      </>

                    ) : (

                      <strong>
                        Regular season complete.
                      </strong>

                    )}

                  </div>

                  {/* =======================================
                      PLAYOFF BERTH NOT YET CLINCHED
                      ======================================= */}

                  {scenarioEngine &&
                    stats &&
                    !stats.clinched &&
                    !stats.eliminated && (
                    <>

                      <div className="scenario-section-label">
                        Playoff Berth Scenarios
                      </div>

                      <div className="scenario-record-paths">

                        {recordGroups.map(
                          (group) => {

                            let description;

                            if (
                              group.status ===
                              "CLINCHES"
                            ) {
                              description =
                                "Playoff berth guaranteed regardless of every other result.";
                            } else if (
                              group.status ===
                              "ELIMINATED"
                            ) {
                              description =
                                "No remaining league combination gets this team in.";
                            } else {
                              description =
                                `Playoff path survives in ${percent(
                                  group.alive,
                                  group.total
                                )} of the other-result combinations.`;
                            }

                            return (
                              <div
                                className="scenario-record-row"
                                key={`${group.ownWins}-${group.ownLosses}`}
                              >

                                <strong>
                                  {group.ownWins}-{group.ownLosses}
                                </strong>

                                <div className="scenario-row-main">

                                  <strong>
                                    {group.status}
                                  </strong>

                                  <span>
                                    {description}
                                  </span>

                                </div>

                                <div className="scenario-row-right">

                                  {group.seeds.length
                                    ? group.seeds
                                        .map(
                                          (seed) =>
                                            `#${seed}`
                                        )
                                        .join(" · ")
                                    : "No seed"}

                                </div>

                              </div>
                            );
                          }
                        )}

                      </div>

                    </>
                  )}

                  {/* =======================================
                      PLAYOFF CLINCHED — SEED NOT LOCKED
                      ======================================= */}

                  {scenarioEngine &&
                    stats?.clinched &&
                    !stats.clinchedSeed && (
                    <>

                      <div className="scenario-section-label">
                        Seeding Scenarios
                      </div>

                      <div className="scenario-seed-paths">

                        {availableSeeds.map(
                          (seedInfo) => (

                            <div
                              className="scenario-seed-row"
                              key={
                                seedInfo.seed
                              }
                            >

                              <div className="scenario-seed-number">
                                #{seedInfo.seed}
                              </div>

                              <div className="scenario-row-main">

                                <strong>
                                  SEED #{seedInfo.seed} STILL POSSIBLE
                                </strong>

                                <span>

                                  Possible in{" "}

                                  {percent(
                                    seedInfo.possible,
                                    scenarioEngine.totalScenarios
                                  )}

                                  {" "}of all remaining league outcomes.

                                </span>

                              </div>

                              <div className="scenario-row-right">

                                {seedInfo.guaranteed >
                                0
                                  ? `${percent(
                                      seedInfo.guaranteed,
                                      scenarioEngine.totalScenarios
                                    )} locked`
                                  : "Needs specific results"}

                              </div>

                            </div>

                          )
                        )}

                      </div>

                    </>
                  )}

                  {/* =======================================
                      SPECIFIC SEED ALREADY CLINCHED
                      ======================================= */}

                  {scenarioEngine &&
                    stats?.clinchedSeed && (

                    <div className="scenario-complete">

                      <strong>
                        #{stats.clinchedSeed} seed clinched.
                      </strong>

                      {" "}

                      No remaining combination of regular-season
                      results can move this team to another seed.

                    </div>

                  )}

                  {/* =======================================
                      ELIMINATED
                      ======================================= */}

                  {scenarioEngine &&
                    stats?.eliminated && (

                    <div className="scenario-complete">

                      There is no remaining mathematical path
                      to the playoffs.

                    </div>

                  )}

                  {/* =======================================
                      FULL PLAYOFF SCENARIOS
                      ======================================= */}

                  {scenarioEngine &&
                    stats &&
                    !stats.clinched &&
                    !stats.eliminated && (

                    <details className="scenario-details">

                      <summary>
                        View Every Playoff Scenario
                      </summary>

                      <div className="scenario-detail-list">

                        {stats.patterns.map(
                          (pattern) => (

                            <div
                              className="scenario-detail"
                              key={
                                pattern.code
                              }
                            >

                              <h4>

                                Go{" "}
                                {pattern.ownWins}
                                -
                                {pattern.ownLosses}
                                {" · Finish "}
                                {formatRecord(
                                  pattern.finalRecord.wins,
                                  pattern.finalRecord.losses,
                                  pattern.finalRecord.ties
                                )}

                              </h4>

                              <p className="scenario-detail-pattern">
                                {resultPatternText(
                                  pattern
                                )}
                              </p>

                              {pattern.mustResults.length >
                                0 && (

                                <div className="scenario-help">

                                  <strong>
                                    Games That Must Go Your Way
                                  </strong>

                                  {pattern.mustResults.map(
                                    (
                                      result,
                                      index
                                    ) => (

                                      <p
                                        key={`${result.week}-${result.winnerOwnerId}-${index}`}
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

                              {pattern.teamCaps.length >
                                0 && (

                                <div className="scenario-help">

                                  <strong>
                                    Help Needed
                                  </strong>

                                  {pattern.teamCaps.map(
                                    (cap) => (

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
                                        {" remaining games."}

                                      </p>

                                    )
                                  )}

                                </div>

                              )}

                              {pattern.pfCompetitors.length >
                                0 && (

                                <div className="scenario-help">

                                  <strong>
                                    Points For Tiebreak
                                  </strong>

                                  {pattern.pfCompetitors.map(
                                    (competitor) => (

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

                            </div>

                          )
                        )}

                      </div>

                    </details>

                  )}

                  {/* =======================================
                      FULL SEED-SPECIFIC SCENARIOS
                      ======================================= */}

                  {scenarioEngine &&
                    stats?.clinched &&
                    !stats.clinchedSeed &&
                    availableSeeds.map(
                      (seedInfo) => {

                        const seedPaths =
                          getSeedPaths(
                            stats,
                            seedInfo.seed
                          );

                        return (
                          <details
                            className="scenario-details"
                            key={`seed-details-${seedInfo.seed}`}
                          >

                            <summary>
                              How To Get Seed #{seedInfo.seed}
                            </summary>

                            <div className="scenario-detail-list">

                              {seedPaths.map(
                                (path) => (

                                  <div
                                    className="scenario-detail"
                                    key={`${seedInfo.seed}-${path.code}`}
                                  >

                                    <h4>

                                      Go{" "}
                                      {path.ownWins}
                                      -
                                      {path.ownLosses}
                                      {" · Finish "}
                                      {formatRecord(
                                        path.finalRecord.wins,
                                        path.finalRecord.losses,
                                        path.finalRecord.ties
                                      )}

                                    </h4>

                                    <p className="scenario-detail-pattern">

                                      {resultPatternText(
                                        path
                                      )}

                                    </p>

                                    <div className="scenario-help">

                                      <strong>
                                        Seed #{seedInfo.seed} Outlook
                                      </strong>

                                      <p>

                                        Seed #{seedInfo.seed} occurs in{" "}

                                        {path.possible.toLocaleString()}

                                        {" "}of the{" "}

                                        {path.patternTotal.toLocaleString()}

                                        {" "}league-result combinations attached to this personal finish.

                                      </p>

                                      {path.guaranteed >
                                        0 && (

                                        <p>

                                          It is guaranteed in{" "}

                                          {path.guaranteed.toLocaleString()}

                                          {" "}of those combinations.

                                        </p>

                                      )}

                                    </div>

                                    {path.mustResults.length >
                                      0 && (

                                      <div className="scenario-help">

                                        <strong>
                                          Games That Must Go Your Way
                                        </strong>

                                        {path.mustResults.map(
                                          (
                                            result,
                                            index
                                          ) => (

                                            <p
                                              key={`${result.week}-${result.winnerOwnerId}-${index}`}
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

                                    {path.teamCaps.length >
                                      0 && (

                                      <div className="scenario-help">

                                        <strong>
                                          Teams That Must Be Held Back
                                        </strong>

                                        {path.teamCaps.map(
                                          (cap) => (

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
                                              {" remaining games."}

                                            </p>

                                          )
                                        )}

                                      </div>

                                    )}

                                    {path.pfCompetitors.length >
                                      0 && (

                                      <div className="scenario-help">

                                        <strong>
                                          Points For Tiebreak
                                        </strong>

                                        {path.pfCompetitors.map(
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

                                    {path.tiebreakReasons.includes(
                                      "PA"
                                    ) && (

                                      <div className="scenario-help">

                                        <strong>
                                          Deep Tiebreak
                                        </strong>

                                        <p>
                                          At least one path to this seed reaches Points Against after ESPN&apos;s earlier tiebreakers.
                                        </p>

                                      </div>

                                    )}

                                    {path.tiebreakReasons.includes(
                                      "COIN"
                                    ) && (

                                      <div className="scenario-help">

                                        <strong>
                                          Final Tiebreak
                                        </strong>

                                        <p>
                                          At least one path to this seed can reach ESPN&apos;s final random tiebreak.
                                        </p>

                                      </div>

                                    )}

                                  </div>

                                )
                              )}

                            </div>

                          </details>
                        );
                      }
                    )}

                  {!scenarioEngine && (

                    <div className="scenario-complete">

                      Exact scenarios automatically activate when
                      four regular-season weeks remain.

                    </div>

                  )}

                </article>
              );
            }
          )}

        </div>

      </section>

      <footer className="site-footer">

        <strong>
          Dirty P Fantasy Football
        </strong>

        <span>
          ESPN Tiebreak: {tiebreakLabel}
        </span>

        <p>
          Playoff and seed scenarios recalculate automatically
          as ESPN results, records and tiebreak positions change.
        </p>

      </footer>

    </main>
  );
}
