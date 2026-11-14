
"use client";

import { useMemo, useState } from "react";

const SIMULATIONS = 25000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (x) => Number.isFinite(Number(x)) ? Number(x) : 0;
const pct = (x) => `${(100 * x).toFixed(1)}%`;

function record(t) {
  return `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
}

function played(t) {
  return t.wins + t.losses + t.ties;
}

function winRate(t) {
  return played(t)
    ? (t.wins + t.ties * 0.5) / played(t)
    : 0.5;
}

function average(t) {
  return played(t) ? t.pointsFor / played(t) : 100;
}

function compare(a, b) {
  return (
    winRate(b) - winRate(a) ||
    b.wins - a.wins ||
    b.pointsFor - a.pointsFor ||
    a.ownerName.localeCompare(b.ownerName)
  );
}

function teamStrength(t) {
  const recordScore = winRate(t);
  const scoringScore = clamp(
    (average(t) - 100) / 100,
    -0.6,
    0.6
  );

  const sampleWeight = played(t) / (played(t) + 4);

  return (
    0.5 +
    sampleWeight * (
      0.28 * (recordScore - 0.5) +
      0.24 * scoringScore
    )
  );
}

function gameProbability(a, b) {
  const strengthDiff = teamStrength(a) - teamStrength(b);

  return clamp(
    0.5 + strengthDiff,
    0.15,
    0.85
  );
}

function randomSeed(text) {
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function divisionKey(t) {
  return t.divisionId === null ||
    t.divisionId === undefined ||
    t.divisionId === ""
    ? null
    : String(t.divisionId);
}

function calculateField(teams, playoffCount) {
  const groups = new Map();

  for (const team of teams) {
    const id = divisionKey(team);
    if (id === null) continue;

    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(team);
  }

  const hasDivisions =
    groups.size === 2 &&
    teams.every(t => divisionKey(t) !== null);

  if (!hasDivisions) {
    const field = [...teams]
      .sort(compare)
      .slice(0, playoffCount);

    return {
      hasDivisions: false,
      leaders: [],
      wildCards: [],
      field
    };
  }

  const leaders = [...groups.values()]
    .map(group => [...group].sort(compare)[0])
    .sort(compare);

  const leaderIds = new Set(
    leaders.map(t => t.ownerId)
  );

  const wildCards = teams
    .filter(t => !leaderIds.has(t.ownerId))
    .sort(compare)
    .slice(0, Math.max(0, playoffCount - leaders.length));

  return {
    hasDivisions: true,
    leaders,
    wildCards,
    field: [...leaders, ...wildCards]
  };
}

function applyResult(byId, game, winnerId) {
  const home = byId.get(game.homeId);
  const away = byId.get(game.awayId);

  if (!home || !away) return;

  if (winnerId === home.ownerId) {
    home.wins++;
    away.losses++;
  } else if (winnerId === away.ownerId) {
    away.wins++;
    home.losses++;
  }
}

function applyPicks(teams, games, picks) {
  const copy = teams.map(t => ({ ...t }));
  const byId = new Map(copy.map(t => [t.ownerId, t]));

  for (const game of games) {
    const id = Number(picks[game.id]);
    if (id) applyResult(byId, game, id);
  }

  return copy;
}

// =====================================================
// PLAYOFF PREDICTION ENGINE
// =====================================================

function simulate({
  teams,
  games,
  picks,
  playoffCount,
  samples = SIMULATIONS,
  seed = 42
}) {
  const pending = games.filter(g => !picks[g.id]);
  const fixed = applyPicks(teams, games, picks);
  const baseMap = new Map(
    teams.map(t => [t.ownerId, t])
  );

  const exact = pending.length <= 12;
  const iterations = exact
    ? Math.pow(2, pending.length)
    : samples;

  const probabilities = pending.map(g => {
    const a = baseMap.get(g.homeId);
    const b = baseMap.get(g.awayId);
    return a && b ? gameProbability(a, b) : 0.5;
  });

  const counts = new Map();

  for (const t of teams) {
    counts.set(t.ownerId, {
      playoff: 0,
      division: 0,
      seeds: Array(playoffCount).fill(0),
      wins: 0,
      losses: 0,
      minWins: Infinity,
      maxWins: -Infinity
    });
  }

  const random = seededRandom(seed);
  let totalWeight = 0;

  for (let i = 0; i < iterations; i++) {
    const scenario = fixed.map(t => ({ ...t }));
    const byId = new Map(
      scenario.map(t => [t.ownerId, t])
    );

    let weight = 1;

    for (let j = 0; j < pending.length; j++) {
      const game = pending[j];
      const probability = probabilities[j];

      let homeWins;

      if (exact) {
        homeWins = Boolean((i >> j) & 1);
        weight *= homeWins
          ? probability
          : 1 - probability;
      } else {
        homeWins = random() < probability;
      }

      applyResult(
        byId,
        game,
        homeWins ? game.homeId : game.awayId
      );
    }

    if (weight <= 0) continue;

    totalWeight += weight;

    const field = calculateField(
      scenario,
      playoffCount
    );

    const eligible = new Set(
      field.field.map(t => t.ownerId)
    );

    const leaders = new Set(
      field.leaders.map(t => t.ownerId)
    );

    for (const team of scenario) {
      const c = counts.get(team.ownerId);

      c.wins += team.wins * weight;
      c.losses += team.losses * weight;
      c.minWins = Math.min(c.minWins, team.wins);
      c.maxWins = Math.max(c.maxWins, team.wins);

      if (eligible.has(team.ownerId)) {
        c.playoff += weight;
      }

      if (leaders.has(team.ownerId)) {
        c.division += weight;
      }
    }

    field.field.forEach((team, index) => {
      counts.get(team.ownerId).seeds[index] += weight;
    });
  }

  const odds = new Map();
  const denominator = totalWeight || 1;

  for (const team of teams) {
    const c = counts.get(team.ownerId);

    odds.set(team.ownerId, {
      playoff: c.playoff / denominator,
      division: c.division / denominator,
      seeds: c.seeds.map(x => x / denominator),
      expectedWins: c.wins / denominator,
      expectedLosses: c.losses / denominator,
      minWins: c.minWins,
      maxWins: c.maxWins
    });
  }

  return {
    odds,
    exact,
    iterations,
    pending: pending.length
  };
}

function checkSchedule(teams, games) {
  if (!games.length) {
    return {
      valid: false,
      message: "No remaining regular-season matchups were supplied."
    };
  }

  const weeks = [...new Set(games.map(g => g.week))]
    .sort((a, b) => a - b);

  for (const week of weeks) {
    const seen = new Set();

    for (const game of games.filter(g => g.week === week)) {
      if (
        seen.has(game.homeId) ||
        seen.has(game.awayId)
      ) {
        return {
          valid: false,
          message: "Duplicate team appearances detected in a week."
        };
      }

      seen.add(game.homeId);
      seen.add(game.awayId);
    }
  }

  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] !== weeks[i - 1] + 1) {
      return {
        valid: false,
        message: "There are missing weeks in the available schedule."
      };
    }
  }

  return {
    valid: true,
    message:
      "Available matchups are internally consistent. Full schedule coverage and official tiebreakers are not independently verified."
  };
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function ScenarioSimulator({
  teams = [],
  games = [],
  currentWeek = 1,
  season = 2026,
  playoffCount = 4
}) {
  const [picks, setPicks] = useState({});
  const [selectedOwner, setSelectedOwner] = useState("");
  const [expandedWeeks, setExpandedWeeks] =
    useState([currentWeek]);

  const teamMap = useMemo(
    () => new Map(teams.map(t => [t.ownerId, t])),
    [teams]
  );

  const selectedId = Number(selectedOwner);

  const randomSeedValue = useMemo(
    () => randomSeed(JSON.stringify({
      season,
      picks: Object.entries(picks).sort()
    })),
    [season, picks]
  );

  const simulation = useMemo(
    () => simulate({
      teams,
      games,
      picks,
      playoffCount,
      samples: SIMULATIONS,
      seed: randomSeedValue
    }),
    [teams, games, picks, playoffCount, randomSeedValue]
  );

  const currentProjection = useMemo(
    () => applyPicks(teams, games, picks),
    [teams, games, picks]
  );

  const projectedField = useMemo(
    () => calculateField(currentProjection, playoffCount),
    [currentProjection, playoffCount]
  );

  const ranked = useMemo(
    () => [...currentProjection].sort((a, b) =>
      (simulation.odds.get(b.ownerId)?.playoff || 0) -
      (simulation.odds.get(a.ownerId)?.playoff || 0) ||
      compare(a, b)
    ),
    [currentProjection, simulation]
  );

  const weeks = useMemo(
    () => [...new Set(games.map(g => g.week))]
      .sort((a, b) => a - b),
    [games]
  );

  const schedule = useMemo(
    () => checkSchedule(teams, games),
    [teams, games]
  );

  const selectedTeam = currentProjection.find(
    t => t.ownerId === selectedId
  );

  const selectedOdds = simulation.odds.get(selectedId);

  const selectedGames = games.filter(
    g => g.homeId === selectedId ||
      g.awayId === selectedId
  );

  const openSelectedGames = selectedGames.filter(
    g => !picks[g.id]
  );

  const selectedCount = Object.keys(picks).length;

  const divisionGroups = useMemo(() => {
    const groups = new Map();

    for (const team of currentProjection) {
      const key = divisionKey(team) || "unknown";

      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          name: team.divisionName ||
            (key === "unknown" ? "League" : `Division ${key}`),
          teams: []
        });
      }

      groups.get(key).teams.push(team);
    }

    return [...groups.values()].map(g => ({
      ...g,
      teams: g.teams.sort(compare)
    }));
  }, [currentProjection]);

  function chooseWinner(gameId, ownerId) {
    setPicks(old => {
      const next = { ...old };

      if (next[gameId] === ownerId) {
        delete next[gameId];
      } else {
        next[gameId] = ownerId;
      }

      return next;
    });
  }

  function clearGame(gameId) {
    setPicks(old => {
      const next = { ...old };
      delete next[gameId];
      return next;
    });
  }

  function setTeamOutcome(ownerId, win) {
    setPicks(old => {
      const next = { ...old };

      for (const g of games) {
        if (g.homeId !== ownerId && g.awayId !== ownerId) {
          continue;
        }

        next[g.id] = win
          ? ownerId
          : g.homeId === ownerId
          ? g.awayId
          : g.homeId;
      }

      return next;
    });
  }

  function clearTeamOutcomes(ownerId) {
    setPicks(old => {
      const next = { ...old };

      for (const g of games) {
        if (g.homeId === ownerId || g.awayId === ownerId) {
          delete next[g.id];
        }
      }

      return next;
    });
  }

  function toggleWeek(week) {
    setExpandedWeeks(old =>
      old.includes(week)
        ? old.filter(w => w !== week)
        : [...old, week]
    );
  }

  // ===================================================
  // GAMES THAT MATTER
  // ===================================================

  const importantGames = useMemo(() => {
    if (!selectedId || !selectedTeam) return [];

    const otherGames = games.filter(
      g => !picks[g.id] &&
        g.homeId !== selectedId &&
        g.awayId !== selectedId
    );

    const results = [];

    for (const g of otherGames.slice(0, 16)) {
      const homeResult = simulate({
        teams,
        games,
        picks: { ...picks, [g.id]: g.homeId },
        playoffCount,
        samples: 500,
        seed: 1776
      });

      const awayResult = simulate({
        teams,
        games,
        picks: { ...picks, [g.id]: g.awayId },
        playoffCount,
        samples: 500,
        seed: 1776
      });

      const homeOdds =
        homeResult.odds.get(selectedId)?.playoff || 0;

      const awayOdds =
        awayResult.odds.get(selectedId)?.playoff || 0;

      const difference = homeOdds - awayOdds;

      results.push({
        ...g,
        homeOdds,
        awayOdds,
        impact: Math.abs(difference),
        preferredWinner: difference >= 0
          ? g.homeId
          : g.awayId
      });
    }

    return results
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 6);
  }, [
    selectedId,
    selectedTeam,
    teams,
    games,
    picks,
    playoffCount
  ]);

  function name(id) {
    return teamMap.get(id)?.ownerName || "Unknown Owner";
  }

  function status(team) {
    const probability =
      simulation.odds.get(team.ownerId)?.playoff || 0;

    if (
      simulation.exact &&
      schedule.valid &&
      probability >= 1 - 1e-10
    ) return "Guaranteed in modeled outcomes";

    if (
      simulation.exact &&
      schedule.valid &&
      probability <= 1e-10
    ) return "No qualifying modeled outcome";

    if (probability >= 0.9) return "Very Likely";
    if (probability >= 0.7) return "Strong Position";
    if (probability >= 0.4) return "On the Bubble";
    if (probability >= 0.1) return "Needs Help";
    return "Long Shot";
  }

  return (
    <div className="dp-predictor">

      <section className="dp-panel">
        <div className="dp-heading">
          <div>
            <span className="dp-eyebrow">DIRTY P ANALYTICS</span>
            <h2>Playoff Prediction Center</h2>
          </div>
          <span className="dp-tag">SEASON {season}</span>
        </div>

        <p className="dp-muted">
          Live league data · Weighted matchup probabilities ·
          Interactive postseason forecasting
        </p>

        <div className="dp-metrics">
          <div>
            <small>MODEL RUNS</small>
            <strong>
              {simulation.iterations.toLocaleString()}
            </strong>
          </div>
          <div>
            <small>PLAYOFF SPOTS</small>
            <strong>{playoffCount}</strong>
          </div>
          <div>
            <small>GAMES LEFT</small>
            <strong>{games.length - selectedCount}</strong>
          </div>
        </div>

        <p className="dp-muted">
          {simulation.exact
            ? "All available remaining win/loss combinations evaluated with probability weighting."
            : "25,000 weighted Monte Carlo simulations."}
          {" "}Odds are estimates, not official ESPN projections.
        </p>
      </section>

      <section className="dp-panel">
        <div className="dp-heading">
          <div>
            <span className="dp-eyebrow">POSTSEASON PROJECTIONS</span>
            <h2>Playoff Odds</h2>
          </div>
          <span className="dp-tag">WEEK {currentWeek}</span>
        </div>

        <div className="dp-odds-list">
          {ranked.map((team, index) => {
            const odds = simulation.odds.get(team.ownerId);
            const chance = odds?.playoff || 0;

            return (
              <button
                key={team.ownerId}
                className={`dp-odds-row ${
                  selectedId === team.ownerId ? "selected" : ""
                }`}
                onClick={() =>
                  setSelectedOwner(String(team.ownerId))
                }
              >
                <span className="dp-rank">
                  {index + 1}
                </span>

                <div className="dp-odds-main">
                  <strong>{team.ownerName}</strong>
                  <small>
                    {team.teamName} · {record(team)}
                  </small>
                  <div className="dp-progress">
                    <div style={{
                      width: `${chance * 100}%`,
                      background: chance >= 0.75
                        ? "#54c992"
                        : chance >= 0.35
                        ? "#d7ad63"
                        : "#d66d70"
                    }} />
                  </div>
                </div>

                <div className="dp-odds-value">
                  <strong>{pct(chance)}</strong>
                  <small>{status(team)}</small>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="dp-panel">
        <span className="dp-eyebrow">FINAL STANDINGS FORECAST</span>
        <h2>Projected Final Records</h2>

        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>OWNER</th>
                <th>CURRENT</th>
                <th>PROJECTED</th>
                <th>PLAYOFF %</th>
              </tr>
            </thead>
            <tbody>
              {[...teams].sort((a, b) =>
                (simulation.odds.get(b.ownerId)?.expectedWins || 0) -
                (simulation.odds.get(a.ownerId)?.expectedWins || 0)
              ).map(t => {
                const o = simulation.odds.get(t.ownerId);

                return (
                  <tr key={t.ownerId}>
                    <td>{t.ownerName}</td>
                    <td>{record(t)}</td>
                    <td>
                      {o.expectedWins.toFixed(1)}-
                      {o.expectedLosses.toFixed(1)}
                    </td>
                    <td>{pct(o.playoff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dp-panel">
        <span className="dp-eyebrow">SEED FORECAST</span>
        <h2>Most Likely Playoff Seeds</h2>

        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <th>OWNER</th>
                {Array.from(
                  { length: playoffCount },
                  (_, i) => <th key={i}>#{i + 1}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {ranked.map(t => {
                const o = simulation.odds.get(t.ownerId);

                return (
                  <tr key={t.ownerId}>
                    <td>{t.ownerName}</td>
                    {o.seeds.map((chance, i) => (
                      <td key={i}>{pct(chance)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dp-panel">
        <span className="dp-eyebrow">IF THE SEASON ENDED NOW</span>
        <h2>Current Scenario Playoff Field</h2>

        <p className="dp-muted">
          Includes selected What-If winners.
          Undecided games remain unplayed in this view.
        </p>

        {projectedField.field.map((team, i) => (
          <div className="dp-field-row" key={team.ownerId}>
            <span className="dp-seed-number">
              #{i + 1}
            </span>
            <div className="dp-grow">
              <strong>{team.ownerName}</strong>
              <small>{team.teamName}</small>
            </div>
            <div className="dp-right">
              <strong>{record(team)}</strong>
              <small>
                {projectedField.leaders.some(
                  t => t.ownerId === team.ownerId
                ) ? "Division Winner" :
                  projectedField.hasDivisions
                  ? "Wild Card" : "Playoff Position"}
              </small>
            </div>
          </div>
        ))}
      </section>

      {divisionGroups.length > 1 && (
        <section className="dp-panel">
          <span className="dp-eyebrow">DIVISION RACES</span>
          <h2>Division Standings</h2>

          <div className="dp-division-grid">
            {divisionGroups.map(group => (
              <div className="dp-division" key={group.id}>
                <h3>{group.name}</h3>

                {group.teams.map((t, i) => (
                  <button
                    key={t.ownerId}
                    onClick={() =>
                      setSelectedOwner(String(t.ownerId))
                    }
                  >
                    <span>#{i + 1}</span>
                    <strong>{t.ownerName}</strong>
                    <span>{record(t)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="dp-panel">
        <div className="dp-heading">
          <div>
            <span className="dp-eyebrow">INTERACTIVE MODEL</span>
            <h2>What-If Simulator</h2>
          </div>
          <button
            className="dp-button"
            onClick={() => setPicks({})}
          >
            Reset All
          </button>
        </div>

        <p className="dp-muted">
          Pick winners to recalculate the playoff odds
          and projected seeds. Click a chosen winner
          again to remove your pick.
        </p>

        {!weeks.length && (
          <p>No remaining matchups were provided.</p>
        )}

        {weeks.map(week => {
          const weekGames = games.filter(g => g.week === week);
          const expanded = expandedWeeks.includes(week);
          const chosen = weekGames.filter(
            g => picks[g.id]
          ).length;

          return (
            <div className="dp-week" key={week}>
              <button
                className="dp-week-header"
                onClick={() => toggleWeek(week)}
              >
                <strong>Week {week}</strong>
                <span>
                  {chosen}/{weekGames.length} picked
                  {expanded ? " −" : " +"}
                </span>
              </button>

              {expanded && (
                <div className="dp-week-games">
                  {weekGames.map(g => (
                    <div className="dp-matchup" key={g.id}>
                      <button
                        className={
                          picks[g.id] === g.awayId
                            ? "picked" : ""
                        }
                        onClick={() =>
                          chooseWinner(g.id, g.awayId)
                        }
                      >
                        {name(g.awayId)}
                      </button>

                      <span>VS</span>

                      <button
                        className={
                          picks[g.id] === g.homeId
                            ? "picked" : ""
                        }
                        onClick={() =>
                          chooseWinner(g.id, g.homeId)
                        }
                      >
                        {name(g.homeId)}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="dp-panel">
        <span className="dp-eyebrow">PERSONALIZED ANALYTICS</span>
        <h2>Explore a Team's Path</h2>

        <select
          className="dp-select"
          value={selectedOwner}
          onChange={e => setSelectedOwner(e.target.value)}
        >
          <option value="">Select an owner</option>
          {[...teams]
            .sort((a, b) =>
              a.ownerName.localeCompare(b.ownerName)
            )
            .map(t => (
              <option key={t.ownerId} value={t.ownerId}>
                {t.ownerName}
              </option>
            ))}
        </select>

        {selectedTeam && selectedOdds && (
          <div className="dp-team-path">
            <div className="dp-heading">
              <div>
                <h3>{selectedTeam.ownerName}</h3>
                <p className="dp-muted">
                  {selectedTeam.teamName} · {record(selectedTeam)}
                </p>
              </div>
              <div className="dp-highlight">
                <strong>{pct(selectedOdds.playoff)}</strong>
                <small>PLAYOFF CHANCE</small>
              </div>
            </div>

            <div className="dp-metrics">
              <div>
                <small>EXPECTED WINS</small>
                <strong>
                  {selectedOdds.expectedWins.toFixed(1)}
                </strong>
              </div>
              <div>
                <small>BEST RECORD</small>
                <strong>
                  {selectedTeam.wins + openSelectedGames.length}-
                  {selectedTeam.losses}
                </strong>
              </div>
              <div>
                <small>WORST RECORD</small>
                <strong>
                  {selectedTeam.wins}-
                  {selectedTeam.losses + openSelectedGames.length}
                </strong>
              </div>
            </div>

            <h3>Remaining Schedule</h3>

            {selectedGames.map(g => {
              const opponentId = g.homeId === selectedId
                ? g.awayId : g.homeId;

              return (
                <div className="dp-team-game" key={g.id}>
                  <div>
                    <small>WEEK {g.week}</small>
                    <strong>vs {name(opponentId)}</strong>
                  </div>

                  <div className="dp-actions">
                    <button
                      className={
                        picks[g.id] === selectedId ? "win" : ""
                      }
                      onClick={() =>
                        chooseWinner(g.id, selectedId)
                      }
                    >Win</button>

                    <button
                      onClick={() => clearGame(g.id)}
                    >Clear</button>

                    <button
                      className={
                        picks[g.id] === opponentId ? "loss" : ""
                      }
                      onClick={() =>
                        chooseWinner(g.id, opponentId)
                      }
                    >Loss</button>
                  </div>
                </div>
              );
            })}

            <div className="dp-actions dp-action-row">
              <button
                onClick={() =>
                  setTeamOutcome(selectedId, true)
                }
              >
                Win Out
              </button>
              <button
                onClick={() =>
                  setTeamOutcome(selectedId, false)
                }
              >
                Lose Out
              </button>
              <button
                onClick={() =>
                  clearTeamOutcomes(selectedId)
                }
              >
                Clear Picks
              </button>
            </div>

            <h3>Who Do I Need to Lose?</h3>
            <p className="dp-muted">
              Other matchups with the largest estimated
              impact on {selectedTeam.ownerName}'s chances.
            </p>

            {importantGames.length ? (
              importantGames.map(g => (
                <div className="dp-watch" key={g.id}>
                  <div className="dp-grow">
                    <small>WEEK {g.week}</small>
                    <strong>
                      {name(g.awayId)} vs {name(g.homeId)}
                    </strong>
                    <p>
                      Root for: <b>{name(g.preferredWinner)}</b>
                    </p>
                  </div>
                  <div className="dp-right">
                    <strong>
                      {`+${(g.impact * 100).toFixed(1)} pts`}
                    </strong>
                    <small>Estimated odds swing</small>
                    <button
                      className="dp-button"
                      onClick={() =>
                        chooseWinner(g.id, g.preferredWinner)
                      }
                    >
                      Pick Winner
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="dp-muted">
                No other undecided matchups are available.
              </p>
            )}

            <h3>Seed Probabilities</h3>
            {selectedOdds.seeds.map((chance, i) => (
              <div className="dp-seed-chance" key={i}>
                <span>Seed #{i + 1}</span>
                <div className="dp-progress">
                  <div style={{
                    width: `${chance * 100}%`
                  }} />
                </div>
                <strong>{pct(chance)}</strong>
              </div>
            ))}

            <h3>Clinching & Elimination Outlook</h3>
            <div className="dp-outlook">
              <strong>{status(selectedTeam)}</strong>
              <p>
                {simulation.exact && schedule.valid
                  ? "All available remaining game outcomes have been evaluated. This is a modeled result, not an official league ruling."
                  : "The postseason remains uncertain under the current model. Official clinching and elimination depend on the complete schedule and exact league tiebreakers."}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="dp-panel">
        <span className="dp-eyebrow">MODEL TRANSPARENCY</span>
        <h2>How the Predictor Works</h2>
        <p className="dp-muted">
          Each matchup receives a win probability
          based on the teams' records and average
          fantasy points scored. The model simulates
          remaining games, applies selected winners,
          and recalculates the playoff field.
        </p>
        <p className="dp-muted">
          {schedule.message}
        </p>
        <p className="dp-muted">
          The model assumes two division winners
          receive automatic playoff spots when
          exactly two valid divisions exist,
          with remaining spots awarded as wild cards.
          It uses winning percentage, wins, and total
          points scored as simplified tiebreakers.
          Future fantasy points, head-to-head
          tiebreakers, and other ESPN-specific rules
          are not fully modeled.
        </p>
        <p className="dp-muted">
          Simulation counts describe the number
          of modeled outcomes, not a guarantee
          of forecasting accuracy. What-If selections
          are temporary and reset on page refresh.
        </p>
      </section>

      <style jsx>{`
        .dp-predictor {
          color:#f4f5f7;
          display:flex;
          flex-direction:column;
          gap:22px;
          margin:25px 0 45px;
          font-family:Arial,sans-serif;
        }
        .dp-panel {
          background:#151b24;
          border:1px solid #303946;
          border-radius:14px;
          padding:22px;
          min-width:0;
        }
        .dp-panel h2 {
          margin:6px 0 16px;
          font-size:23px;
          color:#fff;
        }
        .dp-panel h3 {
          color:#e9bd67;
          font-size:16px;
          margin:20px 0 12px;
        }
        .dp-heading {
          display:flex;
          justify-content:space-between;
          align-items:center;
          flex-wrap:wrap;
          gap:12px;
        }
        .dp-heading h2 { margin:6px 0; }
        .dp-eyebrow {
          color:#d7ad63;
          font-size:10px;
          font-weight:900;
          letter-spacing:1.4px;
        }
        .dp-muted {
          font-size:12px;
          color:#a2afc0;
          line-height:1.7;
          margin:9px 0 14px;
        }
        .dp-tag {
          color:#e9bd67;
          border:1px solid #806539;
          background:#302a1d;
          border-radius:7px;
          padding:8px 10px;
          font-size:11px;
          font-weight:800;
        }
        .dp-metrics {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:10px;
          margin:18px 0;
        }
        .dp-metrics > div {
          display:flex;
          flex-direction:column;
          gap:8px;
          background:#242c38;
          padding:15px;
          border:1px solid #303946;
          border-radius:10px;
        }
        .dp-metrics small {
          font-size:10px;
          color:#aab6c3;
        }
        .dp-metrics strong {
          color:#e9bd67;
          font-size:23px;
        }
        .dp-odds-list {
          display:flex;
          flex-direction:column;
          gap:9px;
        }
        .dp-odds-row {
          display:flex;
          align-items:center;
          gap:13px;
          background:#202733;
          border:1px solid #384252;
          border-radius:10px;
          color:#fff;
          padding:15px;
          width:100%;
          text-align:left;
          cursor:pointer;
        }
        .dp-odds-row.selected {
          border-color:#e9bd67;
          background:#302c25;
        }
        .dp-rank {
          font-size:20px;
          font-weight:900;
          color:#e9bd67;
          width:24px;
        }
        .dp-odds-main {
          flex:1;
          min-width:0;
          display:flex;
          flex-direction:column;
          gap:5px;
        }
        .dp-odds-main strong {
          font-size:14px;
        }
        .dp-odds-main small,
        .dp-odds-value small {
          color:#a2afc0;
          font-size:10px;
        }
        .dp-odds-value {
          display:flex;
          flex-direction:column;
          text-align:right;
          gap:5px;
        }
        .dp-odds-value strong {
          color:#e9bd67;
          font-size:21px;
        }
        .dp-progress {
          width:100%;
          height:7px;
          background:#35404f;
          border-radius:20px;
          overflow:hidden;
          margin-top:5px;
        }
        .dp-progress > div {
          height:100%;
          background:#d7ad63;
          border-radius:20px;
        }
        .dp-table-wrap {
          overflow-x:auto;
          width:100%;
        }
        .dp-table {
          width:100%;
          border-collapse:collapse;
          font-size:12px;
          white-space:nowrap;
        }
        .dp-table th {
          color:#9fafc2;
          font-size:10px;
          text-align:left;
          padding:12px 10px;
          border-bottom:1px solid #384252;
        }
        .dp-table td {
          padding:13px 10px;
          border-bottom:1px solid #2a3442;
        }
        .dp-table td:last-child {
          color:#e9bd67;
          font-weight:800;
        }
        .dp-field-row {
          display:flex;
          align-items:center;
          gap:13px;
          padding:15px;
          border:1px solid #35404f;
          background:#202733;
          border-radius:9px;
          margin-bottom:8px;
        }
        .dp-seed-number {
          width:38px;
          color:#e9bd67;
          font-size:20px;
          font-weight:900;
        }
        .dp-grow {
          flex:1;
          min-width:0;
        }
        .dp-grow strong,
        .dp-field-row strong {
          display:block;
          font-size:13px;
        }
        .dp-grow small,
        .dp-field-row small {
          display:block;
          margin-top:5px;
          color:#9fafc2;
          font-size:10px;
        }
        .dp-right {
          text-align:right;
        }
        .dp-division-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }
        .dp-division {
          padding:15px;
          background:#202733;
          border:1px solid #35404f;
          border-radius:10px;
        }
        .dp-division h3 { margin:0 0 10px; }
        .dp-division button {
          width:100%;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          background:none;
          border:0;
          border-top:1px solid #384252;
          padding:12px 0;
          color:#fff;
          cursor:pointer;
          text-align:left;
          font-size:12px;
        }
        .dp-button {
          background:#302a1d;
          color:#e9bd67;
          border:1px solid #806539;
          border-radius:8px;
          padding:9px 12px;
          font-weight:800;
          font-size:11px;
          cursor:pointer;
        }
        .dp-week {
          border:1px solid #35404f;
          border-radius:9px;
          overflow:hidden;
          margin:8px 0;
          background:#202733;
        }
        .dp-week-header {
          display:flex;
          justify-content:space-between;
          align-items:center;
          width:100%;
          background:none;
          border:0;
          padding:15px;
          color:#fff;
          cursor:pointer;
        }
        .dp-week-header span {
          color:#9fafc2;
          font-size:11px;
        }
        .dp-week-games { padding:0 13px 13px; }
        .dp-matchup {
          display:grid;
          grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);
          align-items:center;
          gap:7px;
          padding:9px 0;
          border-top:1px solid #35404f;
        }
        .dp-matchup > span {
          color:#9fafc2;
          font-size:10px;
          text-align:center;
        }
        .dp-matchup button {
          background:#2b3542;
          color:#dce3ed;
          padding:12px 7px;
          border:1px solid #465364;
          border-radius:8px;
          font-size:11px;
          font-weight:700;
          cursor:pointer;
          overflow-wrap:anywhere;
        }
        .dp-matchup button.picked {
          background:#423922;
          color:#f3cb80;
          border-color:#d7ad63;
        }
        .dp-select {
          padding:13px;
          width:100%;
          max-width:420px;
          color:#fff;
          border:1px solid #806539;
          background:#202733;
          border-radius:9px;
          margin-bottom:16px;
        }
        .dp-team-path {
          background:#1d2530;
          border:1px solid #35404f;
          border-radius:11px;
          padding:18px;
        }
        .dp-team-path .dp-heading h3 {
          margin:0;
          color:#fff;
          font-size:20px;
        }
        .dp-highlight {
          display:flex;
          flex-direction:column;
          text-align:right;
          gap:5px;
        }
        .dp-highlight strong {
          font-size:28px;
          color:#e9bd67;
        }
        .dp-highlight small {
          font-size:10px;
          color:#9fafc2;
        }
        .dp-team-game {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          padding:12px;
          margin:8px 0;
          background:#242d39;
          border:1px solid #35404f;
          border-radius:9px;
        }
        .dp-team-game small {
          display:block;
          color:#9fafc2;
          font-size:10px;
          margin-bottom:5px;
        }
        .dp-team-game strong {
          font-size:12px;
        }
        .dp-actions {
          display:flex;
          gap:6px;
          flex-wrap:wrap;
        }
        .dp-actions button {
          background:#303a48;
          border:1px solid #465364;
          color:#e0e5ed;
          border-radius:7px;
          font-size:11px;
          font-weight:800;
          padding:9px 11px;
          cursor:pointer;
        }
        .dp-actions button.win {
          background:#1d4737;
          border-color:#59ba91;
          color:#7fe0b4;
        }
        .dp-actions button.loss {
          background:#47282d;
          border-color:#bb6670;
          color:#f39ba5;
        }
        .dp-action-row { margin:16px 0; }
        .dp-watch {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:14px;
          padding:14px;
          margin:8px 0;
          background:#242d39;
          border:1px solid #35404f;
          border-radius:9px;
        }
        .dp-watch p {
          color:#a2afc0;
          font-size:11px;
        }
        .dp-watch p b { color:#e9bd67; }
        .dp-watch .dp-right strong {
          color:#e9bd67;
        }
        .dp-watch .dp-button {
          margin-top:9px;
        }
        .dp-seed-chance {
          display:grid;
          grid-template-columns:65px minmax(0,1fr) 65px;
          align-items:center;
          gap:12px;
          padding:9px 0;
          font-size:12px;
        }
        .dp-seed-chance strong {
          text-align:right;
          color:#e9bd67;
        }
        .dp-outlook {
          background:#2a2a22;
          border:1px solid #806539;
          border-radius:9px;
          padding:15px;
        }
        .dp-outlook strong { color:#e9bd67; }
        .dp-outlook p {
          color:#b3bdca;
          font-size:12px;
          line-height:1.7;
        }
        @media(max-width:700px) {
          .dp-division-grid {
            grid-template-columns:1fr;
          }
          .dp-panel {
            padding:15px;
          }
        }
        @media(max-width:480px) {
          .dp-panel h2 { font-size:20px; }
          .dp-metrics strong { font-size:17px; }
          .dp-metrics > div { padding:10px; }
          .dp-team-game {
            align-items:flex-start;
            flex-direction:column;
          }
          .dp-watch {
            align-items:flex-start;
            flex-direction:column;
          }
          .dp-watch .dp-right { text-align:left; }
          .dp-odds-value strong { font-size:18px; }
          .dp-odds-row { padding:11px; gap:8px; }
        }
      `}</style>
    </div>
  );
}
