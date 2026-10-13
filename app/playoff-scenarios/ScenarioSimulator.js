"use client";

import { useMemo, useState } from "react";

// =====================================================
// HELPERS
// =====================================================

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

function record(team) {
  return team.ties
    ? `${team.wins}-${team.losses}-${team.ties}`
    : `${team.wins}-${team.losses}`;
}

function winPct(team) {
  const played = team.wins + team.losses + team.ties;

  return played
    ? (team.wins + team.ties * 0.5) / played
    : 0.5;
}

function compareTeams(a, b) {
  return (
    winPct(b) - winPct(a) ||
    b.wins - a.wins ||
    b.pointsFor - a.pointsFor ||
    a.ownerName.localeCompare(b.ownerName)
  );
}

function percent(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (value > 0 && value < 0.001) return "<0.1%";
  if (value < 1 && value > 0.999) return ">99.9%";

  return `${(value * 100).toFixed(1)}%`;
}

function divisionKey(team) {
  return team.divisionId === null ||
    team.divisionId === undefined ||
    team.divisionId === ""
    ? "unknown"
    : String(team.divisionId);
}

// =====================================================
// SEEDED RANDOM GENERATOR
// =====================================================

function seedFromString(value) {
  let seed = 2166136261;

  for (let index = 0; index < value.length; index++) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return seed >>> 0;
}

function randomGenerator(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =====================================================
// RELATIVE TEAM STRENGTH
// =====================================================

// These weights estimate matchup probabilities.
// They are NOT official ESPN projections.

function matchupWinProbability(home, away) {
  const homePct = winPct(home);
  const awayPct = winPct(away);

  const homeGames =
    home.wins + home.losses + home.ties;

  const awayGames =
    away.wins + away.losses + away.ties;

  const homeAverage =
    homeGames > 0
      ? home.pointsFor / homeGames
      : 100;

  const awayAverage =
    awayGames > 0
      ? away.pointsFor / awayGames
      : 100;

  const recordAdvantage =
    (homePct - awayPct) * 0.42;

  const scoringAdvantage = clamp(
    (homeAverage - awayAverage) / 200,
    -0.17,
    0.17
  );

  return clamp(
    0.5 + recordAdvantage + scoringAdvantage,
    0.15,
    0.85
  );
}

// =====================================================
// PROJECT PLAYOFF FIELD
// =====================================================

function calculateField(teams, playoffCount) {
  const divisions = new Map();

  for (const team of teams) {
    const key = divisionKey(team);

    if (key === "unknown") continue;

    if (!divisions.has(key)) {
      divisions.set(key, []);
    }

    divisions.get(key).push(team);
  }

  const hasDivisions = divisions.size === 2;

  if (!hasDivisions) {
    return {
      hasDivisions: false,
      leaders: [],
      wildCards: [],
      field: [...teams]
        .sort(compareTeams)
        .slice(0, playoffCount),
    };
  }

  const leaders = [...divisions.values()]
    .map(
      (division) =>
        [...division].sort(compareTeams)[0]
    )
    .filter(Boolean)
    .sort(compareTeams);

  const leaderIds = new Set(
    leaders.map((team) => team.ownerId)
  );

  const wildCards = teams
    .filter(
      (team) => !leaderIds.has(team.ownerId)
    )
    .sort(compareTeams)
    .slice(
      0,
      Math.max(0, playoffCount - leaders.length)
    );

  return {
    hasDivisions: true,
    leaders,
    wildCards,
    field: [...leaders, ...wildCards],
  };
}

function applyWinners(teams, games, picks) {
  const copies = teams.map((team) => ({ ...team }));

  const byId = new Map(
    copies.map((team) => [team.ownerId, team])
  );

  for (const game of games) {
    const winnerId = Number(picks[game.id]);

    if (!winnerId) continue;

    const home = byId.get(game.homeId);
    const away = byId.get(game.awayId);

    if (!home || !away) continue;

    if (winnerId === home.ownerId) {
      home.wins++;
      away.losses++;
    } else if (winnerId === away.ownerId) {
      away.wins++;
      home.losses++;
    }
  }

  return copies;
}

// =====================================================
// PLAYOFF ODDS ENGINE
// =====================================================

function calculateOdds({
  teams,
  games,
  picks,
  playoffCount,
  samples = 4000,
  seed = 1,
}) {
  const pending = games.filter(
    (game) => !picks[game.id]
  );

  const fixedTeams = applyWinners(
    teams,
    games,
    picks
  );

  const teamById = new Map(
    teams.map((team) => [team.ownerId, team])
  );

  const playoffCounts = new Map();
  const divisionCounts = new Map();
  const seedCounts = new Map();

  for (const team of teams) {
    playoffCounts.set(team.ownerId, 0);
    divisionCounts.set(team.ownerId, 0);
    seedCounts.set(
      team.ownerId,
      Array(playoffCount).fill(0)
    );
  }

  const random = randomGenerator(seed);

  // For up to 12 undecided games, evaluate
  // every possible W/L combination.
  // Otherwise use weighted Monte Carlo.
  const exhaustive = pending.length <= 12;
  const iterations = exhaustive
    ? 2 ** pending.length
    : samples;

  const probabilities = pending.map((game) => {
    const home = teamById.get(game.homeId);
    const away = teamById.get(game.awayId);

    return home && away
      ? matchupWinProbability(home, away)
      : 0.5;
  });

  let totalWeight = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const scenarioTeams = fixedTeams.map(
      (team) => ({ ...team })
    );

    const byId = new Map(
      scenarioTeams.map((team) => [
        team.ownerId,
        team,
      ])
    );

    let scenarioWeight = 1;

    for (let index = 0; index < pending.length; index++) {
      const game = pending[index];
      const probability = probabilities[index];

      let homeWins;

      if (exhaustive) {
        homeWins =
          ((iteration >> index) & 1) === 1;

        scenarioWeight *= homeWins
          ? probability
          : 1 - probability;
      } else {
        homeWins = random() < probability;
      }

      const home = byId.get(game.homeId);
      const away = byId.get(game.awayId);

      if (!home || !away) continue;

      if (homeWins) {
        home.wins++;
        away.losses++;
      } else {
        away.wins++;
        home.losses++;
      }
    }

    if (!scenarioWeight) continue;

    const field = calculateField(
      scenarioTeams,
      playoffCount
    );

    totalWeight += scenarioWeight;

    for (const leader of field.leaders) {
      divisionCounts.set(
        leader.ownerId,
        divisionCounts.get(leader.ownerId) +
          scenarioWeight
      );
    }

    field.field.forEach((team, index) => {
      playoffCounts.set(
        team.ownerId,
        playoffCounts.get(team.ownerId) +
          scenarioWeight
      );

      seedCounts.get(team.ownerId)[index] +=
        scenarioWeight;
    });
  }

  const odds = new Map();

  for (const team of teams) {
    const id = team.ownerId;
    const denominator = totalWeight || 1;

    odds.set(id, {
      playoff:
        playoffCounts.get(id) / denominator,

      division:
        divisionCounts.get(id) / denominator,

      seeds:
        seedCounts
          .get(id)
          .map((count) => count / denominator),
    });
  }

  return {
    odds,
    exhaustive,
    simulated: iterations,
    pending: pending.length,
  };
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default function ScenarioSimulator({
  teams,
  games,
  currentWeek,
  season,
  playoffCount,
}) {
  const [picks, setPicks] = useState({});
  const [selectedOwner, setSelectedOwner] =
    useState("");

  const [expandedWeeks, setExpandedWeeks] =
    useState([currentWeek]);

  const ownerMap = useMemo(
    () =>
      new Map(
        teams.map((team) => [
          team.ownerId,
          team,
        ])
      ),
    [teams]
  );

  const simulatedTeams = useMemo(
    () => applyWinners(teams, games, picks),
    [teams, games, picks]
  );

  const projectedField = useMemo(
    () =>
      calculateField(
        simulatedTeams,
        playoffCount
      ),
    [simulatedTeams, playoffCount]
  );

  const seed = useMemo(
    () =>
      seedFromString(
        JSON.stringify(
          Object.entries(picks).sort()
        )
      ),
    [picks]
  );

  const simulation = useMemo(
    () =>
      calculateOdds({
        teams,
        games,
        picks,
        playoffCount,
        samples: 4000,
        seed,
      }),
    [teams, games, picks, playoffCount, seed]
  );

  const divisions = useMemo(() => {
    const groups = new Map();

    for (const team of simulatedTeams) {
      const id = divisionKey(team);

      if (!groups.has(id)) {
        groups.set(id, {
          id,
          name:
            team.divisionName ||
            (id === "unknown"
              ? "Division Unavailable"
              : `Division ${id}`),
          teams: [],
        });
      }

      groups.get(id).teams.push(team);
    }

    return [...groups.values()].map(
      (division) => ({
        ...division,
        teams: division.teams.sort(compareTeams),
      })
    );
  }, [simulatedTeams]);

  const weeks = useMemo(
    () =>
      [
        ...new Set(
          games.map((game) => game.week)
        ),
      ].sort((a, b) => a - b),
    [games]
  );

  const selectedId = Number(selectedOwner);

  const selectedTeam = simulatedTeams.find(
    (team) => team.ownerId === selectedId
  );

  const selectedBaseTeam = teams.find(
    (team) => team.ownerId === selectedId
  );

  const selectedOdds =
    simulation.odds.get(selectedId);

  const selectedGames = games.filter(
    (game) =>
      game.homeId === selectedId ||
      game.awayId === selectedId
  );

  const unpickedSelectedGames =
    selectedGames.filter(
      (game) => !picks[game.id]
    );

  const selectedCount = games.filter(
    (game) => picks[game.id]
  ).length;

  const bestRecord = selectedTeam
    ? `${selectedTeam.wins + unpickedSelectedGames.length}-${selectedTeam.losses}`
    : "—";

  const worstRecord = selectedTeam
    ? `${selectedTeam.wins}-${selectedTeam.losses + unpickedSelectedGames.length}`
    : "—";

  // ===================================================
  // GAMES TO WATCH
  // ===================================================

  const gamesToWatch = useMemo(() => {
    if (!selectedId || !selectedBaseTeam) {
      return [];
    }

    // Only games between OTHER teams.
    const otherGames = games.filter(
      (game) =>
        !picks[game.id] &&
        game.homeId !== selectedId &&
        game.awayId !== selectedId
    );

    const results = [];

    // Limit calculations to 20 pending matchups.
    for (const game of otherGames.slice(0, 20)) {
      const homePicks = {
        ...picks,
        [game.id]: game.homeId,
      };

      const awayPicks = {
        ...picks,
        [game.id]: game.awayId,
      };

      const homeResult = calculateOdds({
        teams,
        games,
        picks: homePicks,
        playoffCount,
        samples: 350,
        seed: 12345,
      });

      const awayResult = calculateOdds({
        teams,
        games,
        picks: awayPicks,
        playoffCount,
        samples: 350,
        seed: 12345,
      });

      const homeOdds =
        homeResult.odds.get(selectedId)?.playoff ?? 0;

      const awayOdds =
        awayResult.odds.get(selectedId)?.playoff ?? 0;

      const difference = homeOdds - awayOdds;

      results.push({
        ...game,
        benefit: Math.abs(difference),
        preferredWinner:
          difference >= 0
            ? game.homeId
            : game.awayId,
        favorableOdds: Math.max(
          homeOdds,
          awayOdds
        ),
        unfavorableOdds: Math.min(
          homeOdds,
          awayOdds
        ),
      });
    }

    return results
      .sort((a, b) => b.benefit - a.benefit)
      .slice(0, 6);
  }, [
    selectedId,
    selectedBaseTeam,
    games,
    teams,
    picks,
    playoffCount,
  ]);

  // ===================================================
  // SCHEDULE COVERAGE
  // ===================================================

  const scheduleCheck = useMemo(() => {
    if (!games.length) {
      return {
        complete: false,
        message:
          "No remaining regular-season matchups were provided by ESPN.",
      };
    }

    const weeksPresent = [
      ...new Set(games.map((game) => game.week)),
    ].sort((a, b) => a - b);

    for (const week of weeksPresent) {
      const weekGames = games.filter(
        (game) => game.week === week
      );

      const appearances = new Set();

      for (const game of weekGames) {
        if (
          appearances.has(game.homeId) ||
          appearances.has(game.awayId)
        ) {
          return {
            complete: false,
            message:
              "The available schedule has duplicate team appearances.",
          };
        }

        appearances.add(game.homeId);
        appearances.add(game.awayId);
      }
    }

    for (let i = 1; i < weeksPresent.length; i++) {
      if (weeksPresent[i] !== weeksPresent[i - 1] + 1) {
        return {
          complete: false,
          message:
            "Some future regular-season weeks are missing.",
        };
      }
    }

    return {
      complete: true,
      message:
        "Available weeks are internally consistent. The league's full regular-season end date has not been independently verified.",
    };
  }, [games]);

  // ===================================================
  // ACTIONS
  // ===================================================

  function chooseWinner(gameId, winnerId) {
    setPicks((current) => {
      const next = { ...current };

      if (next[gameId] === winnerId) {
        delete next[gameId];
      } else {
        next[gameId] = winnerId;
      }

      return next;
    });
  }

  function clearGame(gameId) {
    setPicks((current) => {
      const next = { ...current };
      delete next[gameId];
      return next;
    });
  }

  function toggleWeek(week) {
    setExpandedWeeks((current) =>
      current.includes(week)
        ? current.filter((value) => value !== week)
        : [...current, week]
    );
  }

  function setTeamOutcome(ownerId, win) {
    setPicks((current) => {
      const next = { ...current };

      for (const game of games) {
        if (
          game.homeId !== ownerId &&
          game.awayId !== ownerId
        ) {
          continue;
        }

        next[game.id] = win
          ? ownerId
          : game.homeId === ownerId
          ? game.awayId
          : game.homeId;
      }

      return next;
    });
  }

  function clearTeamOutcomes(ownerId) {
    setPicks((current) => {
      const next = { ...current };

      for (const game of games) {
        if (
          game.homeId === ownerId ||
          game.awayId === ownerId
        ) {
          delete next[game.id];
        }
      }

      return next;
    });
  }

  function teamStatus(ownerId) {
    if (
      projectedField.leaders.some(
        (team) => team.ownerId === ownerId
      )
    ) {
      return "Division Leader";
    }

    if (
      projectedField.wildCards.some(
        (team) => team.ownerId === ownerId
      )
    ) {
      return "Wild Card";
    }

    if (
      projectedField.field.some(
        (team) => team.ownerId === ownerId
      )
    ) {
      return "Playoff Position";
    }

    return "Outside";
  }

  function opponentName(game, ownerId) {
    const opponentId =
      game.homeId === ownerId
        ? game.awayId
        : game.homeId;

    return (
      ownerMap.get(opponentId)?.ownerName ||
      "Opponent"
    );
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="ps-root">
      {/* ESTIMATED ODDS */}

      <section className="ps-section">
        <div className="ps-heading">
          <div>
            <span className="ps-eyebrow">
              POSTSEASON PROJECTIONS
            </span>
            <h2>Playoff Odds</h2>
          </div>

          <span className="ps-subtle">
            {simulation.exhaustive
              ? "All remaining W/L combinations evaluated"
              : `${simulation.simulated.toLocaleString()} simulations`}
          </span>
        </div>

        <div className="ps-odds-grid">
          {[...simulatedTeams]
            .sort(compareTeams)
            .map((team) => {
              const odds = simulation.odds.get(
                team.ownerId
              );

              const chance = odds?.playoff ?? 0;

              return (
                <button
                  type="button"
                  className={
                    "ps-odds-card " +
                    (selectedId === team.ownerId
                      ? "active"
                      : "")
                  }
                  key={team.ownerId}
                  onClick={() =>
                    setSelectedOwner(
                      String(team.ownerId)
                    )
                  }
                >
                  <div className="ps-odds-top">
                    <strong>{team.ownerName}</strong>
                    <span>{record(team)}</span>
                  </div>

                  <div className="ps-odds-number">
                    {percent(chance)}
                  </div>

                  <div className="ps-progress">
                    <div
                      style={{
                        width: `${chance * 100}%`,
                      }}
                    />
                  </div>

                  <small>
                    Division:{" "}
                    {projectedField.hasDivisions
                      ? percent(odds?.division ?? 0)
                      : "Unavailable"}
                  </small>
                </button>
              );
            })}
        </div>

        <p className="ps-note">
          Estimated probabilities use each team's
          current record and average scoring to
          weight unselected games. These are
          independent Dirty P estimates, not
          official ESPN playoff odds.
        </p>
      </section>

      {/* CURRENT PROJECTED FIELD */}

      <section className="ps-section">
        <div className="ps-heading">
          <div>
            <span className="ps-eyebrow">
              PLAYOFF PICTURE
            </span>
            <h2>Projected Playoff Field</h2>
          </div>

          <span className="ps-subtle">
            {selectedCount}/{games.length} results picked
          </span>
        </div>

        <div className="ps-field">
          {projectedField.field.map((team, index) => (
            <div
              className="ps-seed"
              key={team.ownerId}
            >
              <b>#{index + 1}</b>

              <div>
                <strong>{team.ownerName}</strong>
                <small>{team.teamName}</small>
              </div>

              <div className="ps-seed-right">
                <strong>{record(team)}</strong>
                <small>{teamStatus(team.ownerId)}</small>
              </div>
            </div>
          ))}
        </div>

        <p className="ps-note">
          The projected field treats games you
          haven't selected as not yet played.
          Choose results below to see the field
          change. Simplified tiebreakers apply.
        </p>
      </section>

      {/* DIVISIONS */}

      <section className="ps-section">
        <div className="ps-heading">
          <div>
            <span className="ps-eyebrow">
              DIVISION RACES
            </span>
            <h2>Division Standings</h2>
          </div>
        </div>

        <div className="ps-divisions">
          {divisions.map((division) => (
            <div
              className="ps-division"
              key={division.id}
            >
              <h3>{division.name}</h3>

              {division.teams.map((team, index) => (
                <button
                  type="button"
                  className="ps-division-row"
                  key={team.ownerId}
                  onClick={() =>
                    setSelectedOwner(
                      String(team.ownerId)
                    )
                  }
                >
                  <span
                    className={
                      index === 0
                        ? "ps-rank first"
                        : "ps-rank"
                    }
                  >
                    #{index + 1}
                  </span>

                  <span>{team.ownerName}</span>
                  <strong>{record(team)}</strong>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* GLOBAL GAME PICKS */}

      <section className="ps-section">
        <div className="ps-heading">
          <div>
            <span className="ps-eyebrow">
              INTERACTIVE SIMULATOR
            </span>
            <h2>What If?</h2>
          </div>

          <button
            type="button"
            className="ps-small-button"
            onClick={() => setPicks({})}
          >
            Reset All
          </button>
        </div>

        <p className="ps-note">
          Pick any future matchup winner.
          The playoff projections and odds
          recalculate automatically.
          Click a selected winner again to clear it.
        </p>

        {weeks.length ? (
          <div className="ps-weeks">
            {weeks.map((week) => {
              const weekGames = games.filter(
                (game) => game.week === week
              );

              const expanded =
                expandedWeeks.includes(week);

              const chosen = weekGames.filter(
                (game) => picks[game.id]
              ).length;

              return (
                <div
                  className="ps-week"
                  key={week}
                >
                  <button
                    type="button"
                    className="ps-week-heading"
                    onClick={() => toggleWeek(week)}
                  >
                    <strong>Week {week}</strong>
                    <span>
                      {chosen}/{weekGames.length}
                      {" "}selected
                      {expanded ? " −" : " +"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="ps-games">
                      {weekGames.map((game) => {
                        const away =
                          ownerMap.get(game.awayId);

                        const home =
                          ownerMap.get(game.homeId);

                        return (
                          <div
                            className="ps-game"
                            key={game.id}
                          >
                            <button
                              type="button"
                              className={
                                "ps-pick " +
                                (picks[game.id] ===
                                game.awayId
                                  ? "chosen"
                                  : "")
                              }
                              onClick={() =>
                                chooseWinner(
                                  game.id,
                                  game.awayId
                                )
                              }
                            >
                              {away?.ownerName || "Away"}
                            </button>

                            <span>VS</span>

                            <button
                              type="button"
                              className={
                                "ps-pick " +
                                (picks[game.id] ===
                                game.homeId
                                  ? "chosen"
                                  : "")
                              }
                              onClick={() =>
                                chooseWinner(
                                  game.id,
                                  game.homeId
                                )
                              }
                            >
                              {home?.ownerName || "Home"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ps-empty">
            No remaining regular-season
            matchups were returned.
          </div>
        )}
      </section>

      {/* TEAM-SPECIFIC PATH */}

      <section className="ps-section">
        <div className="ps-heading">
          <div>
            <span className="ps-eyebrow">
              TEAM-BY-TEAM
            </span>
            <h2>Explore a Team's Path</h2>
          </div>
        </div>

        <select
          className="ps-select"
          value={selectedOwner}
          onChange={(event) =>
            setSelectedOwner(event.target.value)
          }
        >
          <option value="">Select an owner</option>

          {[...teams]
            .sort((a, b) =>
              a.ownerName.localeCompare(b.ownerName)
            )
            .map((team) => (
              <option
                key={team.ownerId}
                value={team.ownerId}
              >
                {team.ownerName}
              </option>
            ))}
        </select>

        {selectedTeam && (
          <div className="ps-team-detail">
            <div className="ps-team-header">
              <div>
                <span className="ps-eyebrow">
                  PLAYOFF OUTLOOK
                </span>

                <h3>{selectedTeam.ownerName}</h3>

                <small>
                  {selectedTeam.teamName}
                  {" · "}
                  {record(selectedTeam)}
                </small>
              </div>

              <div className="ps-team-odds">
                <strong>
                  {percent(
                    selectedOdds?.playoff ?? 0
                  )}
                </strong>

                <small>Playoff Odds</small>
              </div>
            </div>

            {/* TEAM METRICS */}

            <div className="ps-team-stats">
              <div>
                <span>Best Possible Record</span>
                <strong>{bestRecord}</strong>
              </div>

              <div>
                <span>Worst Possible Record</span>
                <strong>{worstRecord}</strong>
              </div>

              <div>
                <span>Division Title Odds</span>
                <strong>
                  {projectedField.hasDivisions
                    ? percent(
                        selectedOdds?.division ?? 0
                      )
                    : "Unavailable"}
                </strong>
              </div>

              <div>
                <span>Current Projection</span>
                <strong className="ps-status-text">
                  {teamStatus(selectedId)}
                </strong>
              </div>
            </div>

            {/* INDIVIDUAL TEAM GAME PICKS */}

            <div className="ps-team-subsection">
              <h4>Remaining Schedule</h4>

              <p className="ps-note">
                Choose Win or Loss for each game.
                You can leave any matchup undecided.
              </p>

              {selectedGames.length ? (
                <div className="ps-team-games">
                  {selectedGames.map((game) => {
                    const opponent =
                      opponentName(
                        game,
                        selectedId
                      );

                    const opponentId =
                      game.homeId === selectedId
                        ? game.awayId
                        : game.homeId;

                    const chosen =
                      picks[game.id] ?? null;

                    return (
                      <div
                        className="ps-team-game"
                        key={game.id}
                      >
                        <div className="ps-team-game-name">
                          <small>
                            WEEK {game.week}
                          </small>

                          <strong>
                            vs {opponent}
                          </strong>
                        </div>

                        <div className="ps-team-options">
                          <button
                            type="button"
                            className={
                              chosen === selectedId
                                ? "win active"
                                : "win"
                            }
                            onClick={() =>
                              chooseWinner(
                                game.id,
                                selectedId
                              )
                            }
                          >
                            Win
                          </button>

                          <button
                            type="button"
                            className={
                              !chosen
                                ? "neutral active"
                                : "neutral"
                            }
                            onClick={() =>
                              clearGame(game.id)
                            }
                          >
                            —
                          </button>

                          <button
                            type="button"
                            className={
                              chosen === opponentId
                                ? "loss active"
                                : "loss"
                            }
                            onClick={() =>
                              chooseWinner(
                                game.id,
                                opponentId
                              )
                            }
                          >
                            Loss
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="ps-note">
                  No remaining scheduled games
                  available for this owner.
                </p>
              )}

              <div className="ps-team-actions">
                <button
                  type="button"
                  onClick={() =>
                    setTeamOutcome(
                      selectedId,
                      true
                    )
                  }
                >
                  Win Out
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setTeamOutcome(
                      selectedId,
                      false
                    )
                  }
                >
                  Lose Out
                </button>

                <button
                  type="button"
                  onClick={() =>
                    clearTeamOutcomes(
                      selectedId
                    )
                  }
                >
                  Clear Team Picks
                </button>
              </div>
            </div>

            {/* GAMES TO WATCH */}

            <div className="ps-team-subsection">
              <h4>Who Do I Need to Lose?</h4>

              <p className="ps-note">
                These other matchups have the
                biggest estimated effect on{" "}
                {selectedTeam.ownerName}'s playoff
                chances. The preferred winner is
                shown for each game.
              </p>

              {gamesToWatch.length ? (
                <div className="ps-watch-list">
                  {gamesToWatch.map((game) => {
                    const helpful =
                      ownerMap.get(
                        game.preferredWinner
                      );

                    return (
                      <div
                        className="ps-watch"
                        key={game.id}
                      >
                        <div>
                          <small>
                            WEEK {game.week}
                          </small>

                          <strong>
                            {ownerMap.get(
                              game.awayId
                            )?.ownerName}
                            {" vs "}
                            {ownerMap.get(
                              game.homeId
                            )?.ownerName}
                          </strong>

                          <span>
                            Root for:{" "}
                            <b>
                              {helpful?.ownerName}
                            </b>
                          </span>
                        </div>

                        <div className="ps-watch-impact">
                          <strong>
                            +{(
                              game.benefit * 100
                            ).toFixed(1)}
                            {" pts"}
                          </strong>

                          <small>
                            Estimated odds swing
                          </small>

                          <button
                            type="button"
                            onClick={() =>
                              chooseWinner(
                                game.id,
                                game.preferredWinner
                              )
                            }
                          >
                            Pick Winner
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="ps-note">
                  No undecided games between
                  competing owners remain in the
                  available schedule.
                </p>
              )}
            </div>

            {/* SEED PROBABILITIES */}

            <div className="ps-team-subsection">
              <h4>Possible Playoff Seeds</h4>

              <div className="ps-seed-chances">
                {(selectedOdds?.seeds || []).map(
                  (chance, index) => (
                    <div key={index}>
                      <span>
                        Seed #{index + 1}
                      </span>

                      <div className="ps-progress">
                        <div
                          style={{
                            width: `${
                              chance * 100
                            }%`,
                          }}
                        />
                      </div>

                      <strong>
                        {percent(chance)}
                      </strong>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* CLINCHING STATUS */}

            <div className="ps-team-subsection">
              <h4>Clinching & Elimination</h4>

              <div className="ps-outlook">
                {simulation.exhaustive &&
                selectedOdds?.playoff === 1 ? (
                  <>
                    <strong>
                      Guaranteed in the modeled schedule
                    </strong>

                    <p>
                      This team qualifies in every
                      evaluated outcome of the
                      matchups currently available.
                      This is not an official ESPN
                      clinching declaration.
                    </p>
                  </>
                ) : simulation.exhaustive &&
                  selectedOdds?.playoff === 0 ? (
                  <>
                    <strong>
                      No qualifying path in the
                      modeled schedule
                    </strong>

                    <p>
                      This team misses the playoffs
                      under every evaluated outcome
                      of the available games,
                      using the simplified tiebreaker.
                      This is not official elimination.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>
                      Playoff fate not mathematically
                      determined
                    </strong>

                    <p>
                      This team still has uncertainty
                      in its projected playoff outcome.
                      Official clinching and
                      elimination require the complete
                      league schedule and exact ESPN
                      tiebreaker rules.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SCHEDULE / METHODOLOGY */}

      <section className="ps-method">
        <strong>
          How These Projections Work
        </strong>

        <p>
          {simulation.exhaustive
            ? `Evaluated all ${simulation.simulated.toLocaleString()} win/loss outcomes for the ${simulation.pending} remaining undecided games.`
            : `Ran ${simulation.simulated.toLocaleString()} weighted simulations of the ${simulation.pending} remaining undecided games.`}
          {" "}
          Selected winners are treated as fixed.
          Other results are estimated from records
          and average fantasy scoring.
        </p>

        <p>
          {scheduleCheck.message}
          {" "}
          ESPN-specific head-to-head and other
          tiebreakers are not fully modeled.
          Future fantasy points cannot be known
          in advance.
        </p>

        <p>
          The simulator recalculates when you
          change a pick. Refreshing the page
          retrieves updated league data and
          resets your selections.
        </p>

        <span>
          Season {season} · Dirty P Fantasy Football
        </span>
      </section>

      <style jsx>{`
        .ps-root {
          display:flex;
          flex-direction:column;
          gap:30px;
          margin:25px 0 40px;
          color:#f3f5f7;
        }

        .ps-section {
          display:flex;
          flex-direction:column;
          gap:15px;
        }

        .ps-heading {
          display:flex;
          align-items:end;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        }

        .ps-eyebrow {
          color:#d7ad63;
          font-size:10px;
          font-weight:900;
          letter-spacing:1px;
        }

        .ps-heading h2 {
          margin:5px 0 0;
          font-size:23px;
          color:#fff;
        }

        .ps-subtle,
        .ps-note {
          color:#9cabbc;
          font-size:12px;
          line-height:1.7;
        }

        .ps-note {
          margin:0;
        }

        .ps-odds-grid {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:10px;
        }

        .ps-odds-card {
          background:#171d26;
          border:1px solid #303947;
          border-radius:11px;
          padding:16px;
          color:#f5f6f8;
          cursor:pointer;
          text-align:left;
          min-width:0;
        }

        .ps-odds-card.active {
          border-color:#d7ad63;
        }

        .ps-odds-card:hover {
          border-color:#806539;
        }

        .ps-odds-top {
          display:flex;
          justify-content:space-between;
          gap:10px;
          font-size:12px;
        }

        .ps-odds-top span {
          color:#9cabbc;
          white-space:nowrap;
        }

        .ps-odds-number {
          color:#e9bd67;
          font-weight:900;
          font-size:29px;
          margin:10px 0;
        }

        .ps-progress {
          background:#303947;
          border-radius:99px;
          height:7px;
          overflow:hidden;
        }

        .ps-progress div {
          background:#d7ad63;
          height:100%;
          border-radius:99px;
        }

        .ps-odds-card small {
          display:block;
          margin-top:10px;
          color:#aeb9c7;
        }

        .ps-field {
          display:flex;
          flex-direction:column;
          gap:9px;
        }

        .ps-seed {
          display:flex;
          align-items:center;
          gap:15px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:11px;
          padding:16px;
        }

        .ps-seed > b {
          width:40px;
          font-size:24px;
          color:#e9bd67;
        }

        .ps-seed > div {
          display:flex;
          flex-direction:column;
          gap:5px;
          min-width:0;
        }

        .ps-seed > div:nth-child(2) {
          flex:1;
        }

        .ps-seed small {
          color:#9cabbc;
          font-size:11px;
        }

        .ps-seed-right {
          text-align:right;
        }

        .ps-divisions {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:14px;
        }

        .ps-division {
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
          padding:17px;
        }

        .ps-division h3 {
          color:#e9bd67;
          font-size:15px;
          margin:0 0 13px;
        }

        .ps-division-row {
          display:flex;
          gap:10px;
          width:100%;
          align-items:center;
          background:none;
          border:0;
          border-top:1px solid #29313d;
          padding:11px 0;
          color:#f5f6f8;
          font-size:12px;
          text-align:left;
          cursor:pointer;
        }

        .ps-division-row > span:nth-child(2) {
          flex:1;
        }

        .ps-rank {
          width:25px;
          color:#9cabbc;
        }

        .ps-rank.first {
          color:#e9bd67;
          font-weight:900;
        }

        .ps-small-button,
        .ps-team-actions button {
          background:#242c38;
          border:1px solid #806539;
          color:#e9bd67;
          border-radius:8px;
          padding:10px 13px;
          font-size:12px;
          font-weight:800;
          cursor:pointer;
        }

        .ps-weeks {
          display:flex;
          flex-direction:column;
          gap:9px;
        }

        .ps-week {
          background:#171d26;
          border:1px solid #303947;
          border-radius:11px;
          overflow:hidden;
        }

        .ps-week-heading {
          display:flex;
          width:100%;
          justify-content:space-between;
          align-items:center;
          padding:16px;
          color:#f5f6f8;
          background:none;
          border:0;
          cursor:pointer;
        }

        .ps-week-heading span {
          color:#9cabbc;
          font-size:11px;
        }

        .ps-games {
          padding:0 14px 14px;
        }

        .ps-game {
          display:grid;
          grid-template-columns:
            minmax(0,1fr) 24px minmax(0,1fr);
          align-items:center;
          gap:9px;
          padding:8px 0;
          border-top:1px solid #29313d;
        }

        .ps-game > span {
          color:#8997a7;
          font-size:10px;
          text-align:center;
        }

        .ps-pick {
          min-width:0;
          padding:12px 8px;
          border:1px solid #394554;
          background:#242c38;
          color:#d1d9e2;
          border-radius:8px;
          font-size:12px;
          font-weight:700;
          cursor:pointer;
          overflow-wrap:anywhere;
        }

        .ps-pick.chosen {
          border-color:#d7ad63;
          background:#3c3422;
          color:#f3c979;
        }

        .ps-empty {
          background:#171d26;
          border:1px solid #303947;
          border-radius:11px;
          padding:25px;
          color:#9cabbc;
        }

        .ps-select {
          width:100%;
          max-width:400px;
          background:#171d26;
          border:1px solid #806539;
          border-radius:9px;
          color:#f5f6f8;
          padding:13px;
          font-size:13px;
        }

        .ps-team-detail {
          background:#171d26;
          border:1px solid #303947;
          border-radius:13px;
          padding:20px;
          display:flex;
          flex-direction:column;
          gap:22px;
        }

        .ps-team-header {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
        }

        .ps-team-header h3 {
          font-size:20px;
          color:#fff;
          margin:6px 0;
        }

        .ps-team-header small {
          color:#9cabbc;
        }

        .ps-team-odds {
          display:flex;
          flex-direction:column;
          text-align:right;
          gap:4px;
        }

        .ps-team-odds strong {
          font-size:29px;
          color:#e9bd67;
        }

        .ps-team-odds small {
          color:#9cabbc;
        }

        .ps-team-stats {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:10px;
        }

        .ps-team-stats > div {
          background:#242c38;
          border:1px solid #303947;
          border-radius:9px;
          padding:14px;
          display:flex;
          flex-direction:column;
          gap:8px;
        }

        .ps-team-stats span {
          color:#aab6c3;
          font-size:11px;
        }

        .ps-team-stats strong {
          color:#e9bd67;
          font-size:18px;
        }

        .ps-team-stats .ps-status-text {
          font-size:13px;
        }

        .ps-team-subsection {
          display:flex;
          flex-direction:column;
          gap:12px;
          border-top:1px solid #303947;
          padding-top:19px;
        }

        .ps-team-subsection h4 {
          margin:0;
          font-size:16px;
          color:#e9bd67;
        }

        .ps-team-games {
          display:flex;
          flex-direction:column;
          gap:8px;
        }

        .ps-team-game {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          padding:12px;
          border:1px solid #303947;
          background:#1d2530;
          border-radius:9px;
        }

        .ps-team-game-name {
          display:flex;
          flex-direction:column;
          gap:5px;
          min-width:0;
        }

        .ps-team-game-name small {
          color:#9cabbc;
          font-size:10px;
        }

        .ps-team-game-name strong {
          font-size:12px;
        }

        .ps-team-options {
          display:flex;
          gap:5px;
          flex-shrink:0;
        }

        .ps-team-options button {
          background:#29323e;
          border:1px solid #3c4857;
          color:#b8c2cf;
          border-radius:7px;
          padding:9px 11px;
          font-size:11px;
          font-weight:800;
          cursor:pointer;
        }

        .ps-team-options .win.active {
          border-color:#5da98a;
          background:#203d35;
          color:#81dbb2;
        }

        .ps-team-options .loss.active {
          border-color:#a96868;
          background:#402929;
          color:#e7a0a0;
        }

        .ps-team-options .neutral.active {
          border-color:#d7ad63;
          color:#e9bd67;
        }

        .ps-team-actions {
          display:flex;
          gap:9px;
          flex-wrap:wrap;
        }

        .ps-watch-list {
          display:flex;
          flex-direction:column;
          gap:9px;
        }

        .ps-watch {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:14px;
          padding:14px;
          border:1px solid #303947;
          background:#1d2530;
          border-radius:9px;
        }

        .ps-watch > div {
          display:flex;
          flex-direction:column;
          gap:5px;
        }

        .ps-watch small {
          color:#9cabbc;
          font-size:10px;
        }

        .ps-watch strong {
          color:#f5f6f8;
          font-size:12px;
        }

        .ps-watch span {
          color:#aeb9c7;
          font-size:11px;
        }

        .ps-watch span b {
          color:#e9bd67;
        }

        .ps-watch-impact {
          text-align:right;
          flex-shrink:0;
        }

        .ps-watch-impact > strong {
          color:#e9bd67;
        }

        .ps-watch-impact button {
          border:1px solid #806539;
          border-radius:6px;
          background:#303022;
          color:#e9bd67;
          font-size:10px;
          font-weight:800;
          padding:7px 9px;
          cursor:pointer;
        }

        .ps-seed-chances {
          display:flex;
          flex-direction:column;
          gap:13px;
        }

        .ps-seed-chances > div {
          display:grid;
          grid-template-columns:
            60px minmax(0,1fr) 65px;
          align-items:center;
          gap:12px;
          font-size:12px;
        }

        .ps-seed-chances span {
          color:#aab6c3;
        }

        .ps-seed-chances strong {
          text-align:right;
          color:#e9bd67;
        }

        .ps-outlook {
          padding:16px;
          border-radius:9px;
          background:#25291f;
          border:1px solid #806539;
        }

        .ps-outlook strong {
          color:#e9bd67;
          font-size:13px;
        }

        .ps-outlook p {
          color:#aeb9c7;
          font-size:12px;
          line-height:1.7;
          margin:8px 0 0;
        }

        .ps-method {
          background:#171d26;
          border:1px solid #303947;
          border-radius:11px;
          padding:20px;
        }

        .ps-method strong {
          color:#e9bd67;
        }

        .ps-method p,
        .ps-method span {
          color:#9cabbc;
          font-size:12px;
          line-height:1.7;
        }

        @media(max-width:750px) {
          .ps-divisions {
            grid-template-columns:1fr;
          }
        }

        @media(max-width:500px) {
          .ps-heading h2 {
            font-size:20px;
          }

          .ps-odds-grid {
            grid-template-columns:1fr;
          }

          .ps-odds-number {
            font-size:25px;
          }

          .ps-team-detail {
            padding:13px;
          }

          .ps-team-game {
            align-items:flex-start;
            flex-direction:column;
          }

          .ps-watch {
            align-items:flex-start;
            flex-direction:column;
          }

          .ps-watch-impact {
            text-align:left;
          }

          .ps-seed {
            gap:9px;
            padding:13px;
          }

          .ps-seed > b {
            font-size:20px;
            width:30px;
          }

          .ps-game {
            gap:5px;
          }

          .ps-pick {
            font-size:11px;
            padding:10px 5px;
          }
        }
      `}</style>
    </div>
  );
}
